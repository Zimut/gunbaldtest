/* ============================================================
   GUNBALD — ai.js
   Enemy shot planning via trajectory simulation (so the AI
   genuinely leads its shots through gravity + wind), plus a
   per-turn movement intent driven by archetype aggression.
   ============================================================ */
(function (GB) {
  'use strict';
  const { M } = GB;

  // simulate a shot; return closest approach distance to target center.
  // NOTE: must mirror Projectile.update's integration exactly (same GB.PROJ_TS
  // time-scale) or the planned trajectory won't match the real shell.
  function simulate(game, px, py, facing, angleDeg, speed, windResist, target, barrelLen, groundAngle) {
    const ts = GB.PROJ_TS;
    const a = M.deg2rad(angleDeg);
    // aim is relative to the slope: rotate the local dir by groundAngle into world space
    const lx = facing * Math.cos(a), ly = -Math.sin(a);
    const cg = Math.cos(groundAngle || 0), sg = Math.sin(groundAngle || 0);
    const dirx = lx * cg - ly * sg, diry = lx * sg + ly * cg;
    // launch from the barrel tip (matches Projectile spawn point), not the pivot
    let x = px + dirx * barrelLen, y = py + diry * barrelLen;
    let vx = dirx * speed;
    let vy = diry * speed;
    let min = Infinity;
    const tx = target.x, ty = target.centerY(), tr = target.radius();
    for (let i = 0; i < 2200; i++) {
      vy += GB.GRAVITY * ts;
      vx += game.wind * (1 - windResist) * ts;
      x += vx * ts; y += vy * ts;
      const d = Math.hypot(x - tx, y - ty);
      if (d < min) min = d;
      if (d < tr) return 0;
      if (i > 2 && game.terrain.solidAt(x, y)) break;
      if (x < -60 || x > GB.W + 60 || y > GB.H + 60) break;
    }
    return min;
  }

  // search angle/power space for the best shot from the enemy
  function bestShot(game, shooter, target) {
    const p = shooter.pivot();
    const ox = p.x, oy = p.y;
    const blen = 30 * shooter.scale;   // matches Splonk.barrelTip length
    const ga = shooter.groundAngle || 0;
    const facing = shooter.facing;
    const wr = shooter.windResist || 0;
    const pmin = shooter.powerMin, pmax = shooter.powerMax;

    // search the same slope-relative aim range the player has (-10..88)
    let best = { aim: 45, power: pmax, miss: Infinity };
    // coarse sweep
    for (let ang = -10; ang <= 88; ang += 3) {
      for (let pw = pmin + 1; pw <= pmax; pw += 1.0) {
        const miss = simulate(game, ox, oy, facing, ang, pw, wr, target, blen, ga);
        if (miss < best.miss) best = { aim: ang, power: pw, miss };
      }
    }
    // fine refine around best
    const a0 = best.aim, p0 = best.power;
    for (let ang = a0 - 3; ang <= a0 + 3; ang += 0.6) {
      for (let pw = Math.max(pmin, p0 - 1.2); pw <= Math.min(pmax, p0 + 1.2); pw += 0.3) {
        const miss = simulate(game, ox, oy, facing, ang, pw, wr, target, blen, ga);
        if (miss < best.miss) best = { aim: ang, power: pw, miss };
      }
    }
    return best;
  }

  GB.AI = {
    // returns { aim, power, desiredX }
    plan(game, shooter, target) {
      const acc = shooter.aiAccuracy != null ? shooter.aiAccuracy : 0.7;
      const aggr = shooter.aiAggression != null ? shooter.aiAggression : 0.4;

      // movement intent: aggressive bots close distance; defensive hold / kite
      let desiredX = shooter.x;
      const dx = target.x - shooter.x;
      const gap = Math.abs(dx);
      const idealGap = M.lerp(520, 240, aggr); // aggressive want closer
      const maxMove = shooter.energy / shooter.moveCost; // px budget
      if (gap > idealGap + 60) desiredX = shooter.x + M.sign(dx) * Math.min(maxMove, gap - idealGap);
      else if (gap < idealGap - 120 && aggr < 0.5) desiredX = shooter.x - M.sign(dx) * Math.min(maxMove, 120);
      desiredX = M.clamp(desiredX, 40, GB.W - 40);
      // jitter for erratic / low-accuracy bots
      if (acc < 0.6) desiredX += GB.rand(-40, 40) * (1 - acc);

      const shot = bestShot(game, shooter, target);
      // apply accuracy error
      const errAng = (1 - acc) * 11;
      const errPow = (1 - acc) * 0.16;
      let aim = shot.aim + GB.rand(-errAng, errAng);
      let power = shot.power * (1 + GB.rand(-errPow, errPow));
      // wind misread for non-snipers
      if (acc < 0.85) aim += game.wind * (1 - acc) * 14;
      aim = M.clamp(aim, -12, 89);   // slope-relative range, matches the player
      power = M.clamp(power, shooter.powerMin, shooter.powerMax);

      return { aim, power, desiredX, miss: shot.miss };
    },
  };

})(window.GB);
