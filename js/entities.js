/* ============================================================
   GUNBALD — entities.js
   Splonk (evolving robot), Projectile (flag-driven), Explosion,
   Particles, Floaters.
   ============================================================ */
(function (GB) {
  'use strict';
  const { M } = GB;

  // ===========================================================
  //  SPLONK
  // ===========================================================
  function Splonk(opts) {
    opts = opts || {};
    this.isPlayer = !!opts.isPlayer;
    this.x = opts.x || 200;
    this.y = opts.y || 400;
    this.facing = opts.facing || (this.isPlayer ? 1 : -1);
    this.scale = opts.scale || 1;

    // ---- base stats ----
    this.maxHp = 150; this.hp = 150;
    this.maxEnergy = 100; this.energy = 100;
    this.moveCost = 0.85;             // energy per pixel
    this.aim = 45;                    // degrees, carried across rounds
    this.mods = {};
    this.upgrades = [];               // upgrade ids (for visuals + combos)

    this.dmgMul = 1; this.blastMul = 1;
    this.dmgReduce = 0;
    this.shield = 0; this.shieldMax = 0; this.shieldRegen = 0;
    this.repairPerTurn = 0;
    this.reflectPct = 0;
    this.windResist = 0;
    this.gripFall = 0; this.knockResist = 0;
    this.powerMin = 6; this.powerMax = 18; this.chargeRate = 1;
    this.bounceCount = 0; this.clusterCount = 0; this.homingStr = 0;
    this.extraPick = 0;

    // ---- visual / physics state ----
    this.vx = 0; this.vy = 0; this.airborne = false;
    this.groundAngle = 0;   // chassis tilt (radians) to match the terrain slope it stands on
    this.flash = 0; this.bob = GB.rand(0, 6); this.hitWobble = 0;
    this.dead = false; this.outOfArena = false;
    this.tookDamageThisRound = false;
    this.name = opts.name || (this.isPlayer ? 'YOU' : 'ENEMY');
    this.accent = opts.accent || (this.isPlayer ? '#ffcf3f' : '#ff8c42');
    this.face = opts.face || (this.isPlayer ? '^_^' : '>:(');
    this.fireRecoil = 0;
    this.lastCharge = 0;   // remembered charge of the last shot (0 = none yet); carries across rounds like aim

    // per-turn upgrade + new weapon state
    this.upCount = 0;          // how many per-turn upgrades received (drives the every-5th mega cadence)
    this.firstShotMul = 1;     // 2 for whoever goes second; consumed on their first shot
    this.lifesteal = 0;        // heal fraction of damage dealt
    this.pierceDist = 0;       // px of terrain a shell can drill through
    this.shrapnelCount = 0;    // horizontal shrapnel spawned on blast
  }

  Splonk.prototype.centerY = function () { return this.y - 26 * this.scale; };
  Splonk.prototype.radius = function () { return 22 * this.scale; };

  // gun pivot point (follows the chassis tilt so it sits where the drawn turret base is)
  Splonk.prototype.pivot = function () {
    const sc = this.scale, ga = this.groundAngle || 0;
    return { x: this.x + Math.sin(ga) * 28 * sc, y: this.y - Math.cos(ga) * 28 * sc };
  };

  // resting ground level under the chassis FOOTPRINT (not just the centre pixel),
  // so the bot can't perch on a thin sliver of terrain left between craters.
  // Uses a high-ish percentile of the sampled surfaces: a lone high spike is ignored
  // (no floating), while it still settles down into holes. Void columns sit at the
  // top of the sort, so a footprint that's mostly empty correctly drops the bot.
  Splonk.prototype.groundY = function (terrain, atX) {
    const x = (atX == null ? this.x : atX) | 0;
    const foot = Math.round(15 * this.scale);
    const ys = [];
    for (let dx = -foot; dx <= foot; dx += 3) ys.push(terrain.surfaceY(M.clamp(x + dx, 0, GB.W - 1)));
    ys.sort((a, b) => a - b);
    return ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.55))];
  };

  // slope angle of the ground directly under the chassis (radians; + = downhill to the right)
  Splonk.prototype.terrainAngle = function (terrain) {
    const x = M.clamp(this.x | 0, 0, GB.W - 1);
    const d = Math.max(8, Math.round(15 * this.scale));
    const yc = terrain.surfaceY(x);
    let yl = terrain.surfaceY(M.clamp(x - d, 0, GB.W - 1));
    let yr = terrain.surfaceY(M.clamp(x + d, 0, GB.W - 1));
    // keep the samples local, so a nearby cliff/crater wall can't flip the chassis over
    const cap = 42 * this.scale;
    yl = M.clamp(yl, yc - cap, yc + cap);
    yr = M.clamp(yr, yc - cap, yc + cap);
    return M.clamp(Math.atan2(yr - yl, 2 * d), -0.7, 0.7);
  };
  // aim unit vector. Aim is measured RELATIVE TO THE SLOPE the chassis rests on
  // (GunBound-style: the turret is fixed to the body), so the local aim direction
  // is rotated by groundAngle into world space.
  Splonk.prototype.aimVec = function () {
    const a = M.deg2rad(this.aim);
    const lx = this.facing * Math.cos(a), ly = -Math.sin(a);
    const ga = this.groundAngle || 0, cg = Math.cos(ga), sg = Math.sin(ga);
    return { x: lx * cg - ly * sg, y: lx * sg + ly * cg };
  };
  Splonk.prototype.barrelTip = function () {
    const p = this.pivot(), v = this.aimVec();
    const len = (30 + this.fireRecoil * -6) * this.scale;
    return { x: p.x + v.x * len, y: p.y + v.y * len };
  };

  Splonk.prototype.has = function (id) { return this.upgrades.indexOf(id) >= 0; };
  Splonk.prototype.visCount = function (tag) {
    let n = 0;
    for (const id of this.upgrades) { const u = GB.UP_BY_ID[id]; if (u && u.vis === tag) n++; }
    return n;
  };

  Splonk.prototype.applyUpgrade = function (id) {
    const u = GB.UP_BY_ID[id];
    if (!u) return;
    this.upgrades.push(id);
    u.apply(this);
  };

  // give the enemy mods directly from an archetype config
  Splonk.prototype.applyArchetypeMods = function (mods) {
    if (mods.spread)  { this.mods.spread = mods.spread === true ? 1 : mods.spread; this.upgrades.push('spread'); }
    if (mods.bounce)  { this.mods.bounce = true; this.bounceCount = 2; this.upgrades.push('bounce'); }
    if (mods.cluster) { this.mods.cluster = true; this.clusterCount = 4; this.upgrades.push('cluster'); }
    if (mods.homing)  { this.mods.homing = true; this.homingStr = 0.045; this.upgrades.push('homing'); }
    if (mods.mortar)  { this.mods.mortar = true; this.dmgMul *= 1.25; this.blastMul *= 1.25; this.upgrades.push('mortar'); }
    if (mods.armor)   { this.dmgReduce = 0.12; this.upgrades.push('armor'); }
    if (mods.shield)  { this.shieldMax += 40; this.shield = 40; this.shieldRegen += 10; this.upgrades.push('shield'); }
    if (mods.windNeg) { this.windResist = 0.6; }
  };

  Splonk.prototype.startTurn = function (game) {
    this.energy = this.maxEnergy;
    if (this.repairPerTurn > 0 && this.hp > 0) {
      const heal = Math.min(this.repairPerTurn, this.maxHp - this.hp);
      if (heal > 0) { this.hp += heal; game.addFloater(this.x, this.centerY() - 30, '+' + heal, '#6fcf57'); }
    }
    if (this.shieldRegen > 0 && this.shield < this.shieldMax) {
      this.shield = Math.min(this.shieldMax, this.shield + this.shieldRegen);
    }
  };

  Splonk.prototype.takeDamage = function (amount, attacker, kx, ky, game) {
    if (this.dead) return 0;
    amount *= (1 - this.dmgReduce);
    amount = Math.max(0, amount);
    // shield soaks first
    if (this.shield > 0 && amount > 0) {
      const soak = Math.min(this.shield, amount);
      this.shield -= soak; amount -= soak;
      if (game) game.shieldFx(this);
    }
    const dealt = Math.round(amount);
    if (dealt > 0) {
      this.hp -= dealt;
      this.flash = 1; this.hitWobble = 1; this.tookDamageThisRound = true;
      if (game) game.addFloater(this.x, this.centerY() - 34, '-' + dealt, this.isPlayer ? '#ff5a3c' : '#fff');
      // reflect (attacker=null prevents recursion)
      if (this.reflectPct > 0 && attacker && attacker !== this && game) {
        const back = dealt * this.reflectPct;
        attacker.takeDamage(back, null, 0, 0, game);
        game.addFloater(attacker.x, attacker.centerY() - 50, 'REFLECT', '#42c6ff');
      }
    }
    // knockback
    if (kx || ky) {
      const kr = (1 - this.knockResist);
      this.vx += kx * kr; this.vy += ky * kr;
      if (Math.abs(this.vy) > 0.5 || Math.abs(this.vx) > 0.5) this.airborne = true;
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return dealt;
  };

  Splonk.prototype.settle = function (game) {
    this.y = this.groundY(game.terrain);
    this.airborne = false; this.vx = 0; this.vy = 0;
    this.groundAngle = this.terrainAngle(game.terrain);   // snap tilt to the slope
  };

  Splonk.prototype.update = function (dt, game) {
    this.flash = M.approach(this.flash, 0, 0.05);
    this.hitWobble = M.approach(this.hitWobble, 0, 0.04);
    this.fireRecoil = M.approach(this.fireRecoil, 0, 0.08);
    this.bob += dt;
    if (this.dead) return;

    const surf = this.groundY(game.terrain);
    if (this.airborne) {
      this.vy += GB.GRAVITY;
      this.x += this.vx; this.y += this.vy;
      this.vx *= 0.985;
      if (this.y >= surf && this.vy >= 0) {
        this.y = surf;
        if (this.vy > 6.5) {
          const fd = (this.vy - 6.5) * 2.4 * (1 - this.gripFall);
          if (fd > 1) this.takeDamage(fd, null, 0, 0, game);
        }
        this.airborne = false; this.vx = 0; this.vy = 0;
      }
      // fell out of the arena
      if (this.x < -24 || this.x > GB.W + 24 || this.y > GB.H + 80) {
        this.outOfArena = true; this.dead = true; this.hp = 0;
      }
    } else {
      // ground vanished beneath us -> fall
      if (surf - this.y > 4) { this.airborne = true; this.vy = 0; }
      else this.y = surf;
    }

    // ease the chassis tilt toward the ground slope (upright while airborne)
    const targetAngle = this.airborne ? 0 : this.terrainAngle(game.terrain);
    this.groundAngle += (targetAngle - this.groundAngle) * Math.min(1, 12 * dt);
  };

  // move horizontally on the player's turn (returns true if moved)
  // time-based: distance/turn (energy budget) is unchanged, only the speed
  Splonk.prototype.tryWalk = function (dir, game, dt) {
    if (this.airborne || this.energy <= 0) return false;
    const step = GB.MOVE_SPEED * (dt || GB.TICK);
    const cost = step * this.moveCost;
    if (this.energy < cost * 0.5) return false;
    const nx = M.clamp(this.x + dir * step, 26, GB.W - 26);
    if (nx === this.x) return false;
    // climb check: don't walk into a steep wall (use footprint ground level)
    const nsurf = this.groundY(game.terrain, nx);
    if (this.y - nsurf > 34) return false; // too tall to climb
    this.x = nx;
    this.y = nsurf;
    this.energy = Math.max(0, this.energy - cost);
    this.walkAnim = (this.walkAnim || 0) + step;
    return true;
  };

  // ---- DRAW (cartoony, evolves with upgrades) ----
  Splonk.prototype.draw = function (ctx, time, isActive) {
    const sc = this.scale;
    const bob = this.airborne ? 0 : Math.sin(this.bob * 2) * 1.5;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    const wob = Math.sin(time * 30) * this.hitWobble * 4;
    ctx.rotate((this.groundAngle || 0) + M.deg2rad(wob));   // lean with the terrain
    ctx.scale(sc, sc);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 4 - bob, 30, 8, 0, 0, Math.PI * 2); ctx.fill();

    const f = this.facing;
    const accent = this.accent;
    const flash = this.flash;

    // ===== back-mounted visuals (drawn first) =====
    drawJets(ctx, this, f);
    drawFins(ctx, this, f);
    drawPods(ctx, this, f);
    drawArm(ctx, this, f);

    // ===== treads =====
    const treadChunk = this.visCount('tread');
    ctx.fillStyle = '#2a2440';
    roundRect(ctx, -26, -10, 52, 16, 7); ctx.fill();
    ctx.fillStyle = treadChunk ? '#5a4a2a' : '#3a3358';
    for (let i = -22; i <= 18; i += (treadChunk ? 8 : 10)) {
      ctx.beginPath(); ctx.arc(i, -2, treadChunk ? 5 : 4, 0, Math.PI * 2); ctx.fill();
    }

    // ===== chassis body =====
    const bodyGrad = ctx.createLinearGradient(0, -44, 0, -6);
    bodyGrad.addColorStop(0, lighten(accent, 0.25));
    bodyGrad.addColorStop(1, accent);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 3;
    roundRect(ctx, -23, -44, 46, 38, 12); ctx.fill(); ctx.stroke();

    // belly highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, -18, -41, 36, 10, 6); ctx.fill();

    // ===== armor plates =====
    const plates = this.visCount('plate');
    for (let i = 0; i < plates; i++) {
      ctx.fillStyle = '#9aa3b8';
      ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 2.5;
      const py = -40 + i * 9;
      roundRect(ctx, -25, py, 50, 8, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-22, py + 1, 44, 2);
      // rivets
      ctx.fillStyle = '#5a627a';
      ctx.beginPath(); ctx.arc(-20, py + 4, 1.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(20, py + 4, 1.6, 0, 7); ctx.fill();
    }

    // spikes (reflect)
    const spikes = this.visCount('spike');
    if (spikes) {
      ctx.fillStyle = '#cfd6e6'; ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 12 - 4, -44); ctx.lineTo(i * 12, -56); ctx.lineTo(i * 12 + 4, -44);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }

    // ===== face =====
    // eye visor
    ctx.fillStyle = '#10131f';
    roundRect(ctx, -16, -36, 32, 15, 7); ctx.fill();
    // eyes
    const blink = (Math.sin(time * 1.3 + this.bob) > 0.97) ? 0.2 : 1;
    ctx.fillStyle = this.dead ? '#555' : '#9becff';
    const ex = f * 4;
    ctx.save();
    ctx.translate(ex, -28);
    ctx.beginPath(); ctx.ellipse(-7, 0, 3.2, 4.2 * blink, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, 0, 3.2, 4.2 * blink, 0, 0, 7); ctx.fill();
    if (!this.dead) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-7 + f, -1, 1.1, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(7 + f, -1, 1.1, 0, 7); ctx.fill();
    }
    ctx.restore();
    // angry brow for enemies / active
    if (!this.isPlayer && !this.dead) {
      ctx.strokeStyle = '#10131f'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-13, -38); ctx.lineTo(-4, -35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(13, -38); ctx.lineTo(4, -35); ctx.stroke();
    }

    // ===== cannon (rotates with aim) =====
    drawCannon(ctx, this, f, isActive);

    // ===== shield dome =====
    if (this.shield > 0) drawDome(ctx, this, time);

    // flash overlay (damage)
    if (flash > 0.02) {
      ctx.globalAlpha = flash * 0.6;
      ctx.fillStyle = '#fff';
      roundRect(ctx, -26, -46, 52, 42, 12); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  // ---- sub-draw helpers ----
  function drawCannon(ctx, s, f, isActive) {
    const a = M.deg2rad(s.aim) * -1; // canvas rotation (up = negative)
    ctx.save();
    ctx.translate(0, -28);
    // turret is fixed to the chassis: aim is relative to the slope (GunBound-style)
    ctx.rotate(f === 1 ? a : Math.PI - a);
    const recoil = s.fireRecoil * 6;
    // count extra barrels from spread / barrel visuals
    const barrels = 1 + (s.mods.spread ? Math.min(2, s.mods.spread) : 0) + (s.has('mortar') ? 0 : 0);
    const isMortar = s.has('mortar');
    for (let b = 0; b < barrels; b++) {
      const off = (b - (barrels - 1) / 2) * 9;
      ctx.save();
      ctx.translate(0, off);
      // barrel
      const len = isMortar ? 26 : 30;
      const w = isMortar ? 14 : 9;
      const grd = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
      grd.addColorStop(0, '#6a7290'); grd.addColorStop(0.5, '#3a4058'); grd.addColorStop(1, '#23283a');
      ctx.fillStyle = grd; ctx.strokeStyle = '#10131f'; ctx.lineWidth = 2;
      roundRect(ctx, 6 - recoil, -w / 2, len, w, 4); ctx.fill(); ctx.stroke();
      // muzzle
      ctx.fillStyle = '#10131f';
      roundRect(ctx, len + 4 - recoil, -w / 2 - 1.5, 4, w + 3, 2); ctx.fill();
      ctx.restore();
    }
    // pivot housing
    ctx.fillStyle = '#4a5070'; ctx.strokeStyle = '#10131f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = isActive ? '#ffcf3f' : '#6a7290';
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawDome(ctx, s, time) {
    const frac = s.shieldMax ? s.shield / s.shieldMax : 1;
    const r = 40;
    ctx.save();
    ctx.translate(0, -24);
    const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
    g.addColorStop(0, 'rgba(66,198,255,0.02)');
    g.addColorStop(0.8, `rgba(66,198,255,${0.10 + frac * 0.10})`);
    g.addColorStop(1, `rgba(120,220,255,${0.30 + frac * 0.25})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(150,230,255,${0.4 + 0.3 * Math.sin(time * 4)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawJets(ctx, s, f) {
    const n = s.visCount('jet'); if (!n) return;
    ctx.save();
    ctx.fillStyle = '#cfd6e6'; ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 2;
    const bx = -f * 24;
    roundRect(ctx, bx - 5, -36, 10, 22, 4); ctx.fill(); ctx.stroke();
    // flame flicker
    const fl = 6 + Math.sin(s.bob * 18) * 3;
    const fg = ctx.createLinearGradient(0, -14, 0, -14 + fl);
    fg.addColorStop(0, '#ffd24a'); fg.addColorStop(1, 'rgba(255,90,60,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(bx - 4, -14); ctx.lineTo(bx, -14 + fl); ctx.lineTo(bx + 4, -14); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawFins(ctx, s, f) {
    const n = s.visCount('fin'); if (!n) return;
    ctx.save();
    ctx.fillStyle = lighten(s.accent, -0.15); ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const bx = -f * (20 + i * 4);
      ctx.beginPath();
      ctx.moveTo(bx, -40); ctx.lineTo(bx - f * 12, -34 - i * 3); ctx.lineTo(bx, -22); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPods(ctx, s, f) {
    const n = s.visCount('pod'); if (!n) return;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const px = side * (24 + Math.floor(i / 2) * 6);
      ctx.fillStyle = '#cf5a3c'; ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 2;
      roundRect(ctx, px - 5, -34, 10, 14, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.arc(px, -30, 2.2, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function drawArm(ctx, s, f) {
    const n = s.visCount('arm'); if (!n) return;
    ctx.save();
    ctx.strokeStyle = '#9aa3b8'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    const bx = f * 20;
    ctx.beginPath(); ctx.moveTo(bx, -30); ctx.lineTo(bx + f * 14, -40); ctx.lineTo(bx + f * 22, -34); ctx.stroke();
    ctx.fillStyle = '#ffcf3f'; ctx.beginPath(); ctx.arc(bx + f * 22, -34, 3.5, 0, 7); ctx.fill();
    ctx.restore();
  }

  GB.Splonk = Splonk;

  // ===========================================================
  //  PROJECTILE
  // ===========================================================
  function Projectile(opts) {
    this.x = opts.x; this.y = opts.y;
    this.vx = opts.vx; this.vy = opts.vy;
    this.owner = opts.owner;
    this.dmg = opts.dmg;
    this.blastR = opts.blastR;
    this.windResist = opts.windResist || 0;
    this.bounce = opts.bounce || 0;
    this.cluster = opts.cluster || 0;       // bomblet count if >0
    this.homing = opts.homing || 0;
    this.mortar = !!opts.mortar;
    this.pierceLeft = opts.pierce || 0;     // px of terrain this shell can still drill through
    this.isBomblet = !!opts.isBomblet;
    this.netVisual = !!opts.netVisual;      // online: animate the opponent's shell, no gameplay effect
    this.color = opts.color || '#ffd24a';
    this.r = opts.r || (this.isBomblet ? 4 : (this.mortar ? 8 : 6));
    this.trail = [];
    this.dead = false;
    this.life = 0;
    this.spin = 0;
  }

  Projectile.prototype.update = function (game) {
    const T = game.terrain;
    const ts = GB.PROJ_TS;            // <1 => same trajectory, slower playback
    // homing steer toward opponent (steer rate scaled by ts so total turn is unchanged)
    if (this.homing > 0) {
      const tgt = game.opponentOf(this.owner);
      if (tgt && !tgt.dead) {
        const ang = Math.atan2(tgt.centerY() - this.y, tgt.x - this.x);
        const sp = Math.hypot(this.vx, this.vy);
        const cur = Math.atan2(this.vy, this.vx);
        let d = ang - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const steer = M.clamp(d, -this.homing * ts * 4, this.homing * ts * 4);
        const na = cur + steer;
        this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
      }
    }
    // gravity + wind (scaled by ts)
    this.vy += GB.GRAVITY * (this.mortar ? 1.05 : 1) * ts;
    this.vx += game.wind * (1 - this.windResist) * ts;

    // per-frame displacement (scaled by ts), substepped for collision
    const dxF = this.vx * ts, dyF = this.vy * ts;
    const speed = Math.hypot(dxF, dyF);
    const steps = Math.max(1, Math.ceil(speed / 4));
    const subLen = speed / steps;
    for (let i = 0; i < steps; i++) {
      const px = this.x, py = this.y;
      this.x += dxF / steps; this.y += dyF / steps;
      this.spin += 0.3 * ts;
      // direct splonk hit?
      const hit = this.checkSplonkHit(game);
      if (hit) { this.explode(game); return; }
      // terrain?
      if (T.solidAt(this.x, this.y)) {
        if (this.bounce > 0) {
          this.doBounce(game, px, py);
        } else if (this.pierceLeft > 0) {
          // drill: keep burrowing through the terrain until the budget runs out
          this.pierceLeft -= subLen;
          if (this.pierceLeft <= 0) { this.explode(game); return; }
          if ((i & 1) === 0) game.spawnSparks(this.x, this.y, '#caa37a', 2);
        } else {
          // step back to surface a touch
          this.x = px; this.y = py;
          this.explode(game); return;
        }
      }
    }
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 30) this.trail.shift();
    this.life++;

    // out of bounds (sides/bottom). top is open (lobs).
    if (this.x < -40 || this.x > GB.W + 40 || this.y > GB.H + 60) this.dead = true;
    if (this.life > 2400) this.explode(game);
  };

  Projectile.prototype.checkSplonkHit = function (game) {
    for (const s of [game.player, game.enemy]) {
      if (!s || s.dead) continue;
      if (s === this.owner && this.life < 4) continue; // don't self-hit on spawn
      const d = M.dist(this.x, this.y, s.x, s.centerY());
      if (d < s.radius()) return s;
    }
    return null;
  };

  Projectile.prototype.doBounce = function (game, px, py) {
    this.bounce--;
    // estimate surface normal by sampling terrain around the point
    const T = game.terrain;
    let nx = 0, ny = 0;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const sx = this.x + Math.cos(a) * 6, sy = this.y + Math.sin(a) * 6;
      if (T.solidAt(sx, sy)) { nx -= Math.cos(a); ny -= Math.sin(a); }
    }
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    // reflect velocity, lose energy
    const dot = this.vx * nx + this.vy * ny;
    this.vx = (this.vx - 2 * dot * nx) * 0.66;
    this.vy = (this.vy - 2 * dot * ny) * 0.66;
    this.x = px; this.y = py; // back out of the wall
    game.spawnSparks(this.x, this.y, this.color, 5);
  };

  Projectile.prototype.explode = function (game) {
    if (this.dead) return;
    this.dead = true;
    const r = this.blastR;
    // online: the opponent's shell is animation only — FX, but no terrain/damage
    if (this.netVisual) {
      game.explosionFx(this.x, this.y, r, this.color, this.mortar);
      game.shake = Math.min(22, game.shake + (this.mortar ? 12 : 8));
      return;
    }
    game.terrain.crater(this.x, this.y, r);
    if (game.online && this.owner === game.player) {
      game.turnCraters.push({ x: Math.round(this.x), y: Math.round(this.y), r: Math.round(r) });
    }
    game.explosionFx(this.x, this.y, r, this.color, this.mortar);
    game.shake = Math.min(22, game.shake + (this.mortar ? 16 : 10) * (this.isBomblet ? 0.5 : 1));

    // damage both splonks by proximity
    const opp = game.opponentOf(this.owner);
    let dealtToOpp = 0;
    for (const s of [game.player, game.enemy]) {
      if (!s || s.dead) continue;
      const d = M.dist(this.x, this.y, s.x, s.centerY());
      if (d < r + s.radius()) {
        const fall = 1 - M.clamp((d - s.radius()) / r, 0, 1);
        const dmg = this.dmg * (0.35 + 0.65 * fall);
        // knockback away from blast
        const kdir = Math.atan2(s.centerY() - this.y, s.x - this.x);
        const kpow = (this.mortar ? 7 : 5) * fall * (this.isBomblet ? 0.5 : 1);
        const dealt = s.takeDamage(dmg, this.owner, Math.cos(kdir) * kpow, Math.sin(kdir) * kpow - 1.5, game);
        if (s === opp) dealtToOpp += dealt;
      }
    }

    // lifesteal — heal the owner for a fraction of damage dealt to the enemy
    if (this.owner && this.owner.lifesteal > 0 && dealtToOpp > 0 && !this.owner.dead) {
      const heal = Math.round(dealtToOpp * this.owner.lifesteal);
      if (heal > 0) {
        this.owner.hp = Math.min(this.owner.maxHp, this.owner.hp + heal);
        game.addFloater(this.owner.x, this.owner.centerY() - 44, '+' + heal, '#6fcf57');
      }
    }

    // cluster -> bomblets (inherit owner flags: bounce/homing => emergent combos)
    if (this.cluster > 0 && !this.isBomblet) {
      const n = this.cluster;
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + GB.rand(-1.1, 1.1);
        const sp = GB.rand(4, 8);
        game.projectiles.push(new Projectile({
          x: this.x, y: this.y - 4,
          vx: Math.cos(ang) * sp + GB.rand(-1, 1),
          vy: Math.sin(ang) * sp,
          owner: this.owner,
          dmg: this.dmg * 0.5,
          blastR: r * 0.6,
          windResist: this.windResist,
          bounce: this.owner.mods.bounce ? 1 : 0,
          homing: this.owner.mods.homing ? this.owner.homingStr * 0.7 : 0,
          isBomblet: true,
          color: '#ffac4a',
        }));
      }
    }

    // shrapnel -> fast low-angle fragments flung both ways
    if (this.owner && this.owner.mods.shrapnel && !this.isBomblet) {
      const n = this.owner.shrapnelCount || 5;
      for (let i = 0; i < n; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const a = dir > 0 ? GB.rand(-0.55, 0.15) : Math.PI - GB.rand(-0.55, 0.15);
        const sp = GB.rand(6, 10);
        game.projectiles.push(new Projectile({
          x: this.x, y: this.y - 4,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
          owner: this.owner,
          dmg: this.dmg * 0.4,
          blastR: r * 0.5,
          windResist: this.windResist,
          isBomblet: true,
          color: '#ffd24a',
        }));
      }
    }
  };

  Projectile.prototype.draw = function (ctx) {
    // trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = i / this.trail.length;
      const p = this.trail[i];
      ctx.fillStyle = GB.rgba(255, 200 - t * 80, 80, t * 0.5);
      ctx.beginPath(); ctx.arc(p.x, p.y, this.r * t * 0.9, 0, Math.PI * 2); ctx.fill();
    }
    // body
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.spin);
    ctx.fillStyle = '#2a2440';
    ctx.beginPath(); ctx.arc(0, 0, this.r + 1.5, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(-this.r * 0.3, -this.r * 0.3, 1, 0, 0, this.r);
    g.addColorStop(0, '#fff4c2'); g.addColorStop(1, this.color);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill();
    if (this.mortar) { // fins
      ctx.fillStyle = '#cf5a3c';
      ctx.fillRect(-this.r - 2, -2, 4, 4);
      ctx.fillRect(this.r - 2, -2, 4, 4);
    }
    ctx.restore();
  };

  GB.Projectile = Projectile;

  // ===========================================================
  //  PARTICLES & FLOATERS
  // ===========================================================
  function Particle(o) {
    this.x = o.x; this.y = o.y; this.vx = o.vx; this.vy = o.vy;
    this.life = o.life; this.max = o.life;
    this.r = o.r; this.color = o.color; this.grav = o.grav == null ? 0.12 : o.grav;
    this.fade = o.fade !== false; this.shrink = o.shrink !== false;
    this.glow = !!o.glow;
  }
  Particle.prototype.update = function () {
    this.vy += this.grav; this.vx *= 0.98;
    this.x += this.vx; this.y += this.vy; this.life--;
    return this.life > 0;
  };
  Particle.prototype.draw = function (ctx) {
    const t = this.life / this.max;
    ctx.globalAlpha = this.fade ? t : 1;
    if (this.glow) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.color;
    const r = this.shrink ? this.r * t : this.r;
    ctx.beginPath(); ctx.arc(this.x, this.y, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  GB.Particle = Particle;

  function Floater(o) {
    this.x = o.x; this.y = o.y; this.text = o.text; this.color = o.color;
    this.life = 60; this.max = 60; this.vy = -1.1; this.size = o.size || 26;
  }
  Floater.prototype.update = function () { this.y += this.vy; this.vy *= 0.94; this.life--; return this.life > 0; };
  Floater.prototype.draw = function (ctx) {
    const t = this.life / this.max;
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.font = `900 ${this.size}px Trebuchet MS, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(26,16,48,0.9)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color; ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  };
  GB.Floater = Floater;

  // ===========================================================
  //  small drawing utils
  // ===========================================================
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  GB.roundRect = roundRect;

  function lighten(hex, amt) {
    const c = hexToRgb(hex);
    if (amt >= 0) return GB.rgba(M.lerp(c[0], 255, amt), M.lerp(c[1], 255, amt), M.lerp(c[2], 255, amt), 1);
    return GB.rgba(c[0] * (1 + amt), c[1] * (1 + amt), c[2] * (1 + amt), 1);
  }
  GB.lighten = lighten;
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  GB.hexToRgb = hexToRgb;

})(window.GB);
