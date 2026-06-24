/* ============================================================
   GUNBALD — game.js
   State machine, main loop, input, turn flow, FX, rendering.
   ============================================================ */
(function (GB) {
  'use strict';
  const { M, UI } = GB;
  const el = id => document.getElementById(id);

  function Game() {}
  const P = Game.prototype;

  // ---------------------------------------------------------
  //  INIT + LOOP
  // ---------------------------------------------------------
  P.init = function () {
    this.canvas = el('game');
    this.ctx = this.canvas.getContext('2d');
    GB.Input.attach(this.canvas);

    this.save = GB.loadSave();
    this.state = 'menu';
    this.terrain = null;
    this.time = 0; this.shake = 0; this.flash = 0;
    this.projectiles = []; this.particles = []; this.floaters = []; this.clouds = []; this.lootBoxes = [];
    this.bannerTime = 0; this.bannerText = '';
    this.online = false; this.turnCraters = [];
    this.cam = { x: 0, y: 0 };

    // buttons
    el('btn-play').onclick = () => this.startRun();
    el('btn-meta').onclick = () => { this.state = 'garage'; UI.showGarage(this.save, () => this.toMenu()); };
    if (el('btn-online')) el('btn-online').onclick = () => this.openOnline();

    // online state -> UI + match start
    GB.Net.onState = s => {
      if (s === 'matched') this.startOnlineMatch();
      else UI.onlineStatus(s, GB.Net);
    };

    this.makeMenuBg();
    UI.hideAll(); UI.refreshMenu(this.save); UI.show('menu');

    let last = performance.now();
    let acc = 0;
    const STEP = 1 / 60;            // fixed-timestep sim -> deterministic across machines (online sync)
    const frame = now => {
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.25) dt = 0.25; if (dt < 0) dt = 0;
      acc += dt;
      let ran = false, n = 0;
      while (acc >= STEP && n < 5) { this.update(STEP); acc -= STEP; ran = true; n++; }
      if (n >= 5) acc = 0;          // drop backlog after a long stall, avoid spiral-of-death
      this.render();
      if (ran) GB.Input.endFrame(); // only clear input edges once a step has consumed them
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  P.update = function (dt) {
    this.time += dt;
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x < -160) c.x = GB.W + 160;
      if (c.x > GB.W + 160) c.x = -160;
    }
    if (this.state === 'battle') this.updateBattle(dt);
  };

  // ---------------------------------------------------------
  //  RUN / ROUND LIFECYCLE
  // ---------------------------------------------------------
  P.startRun = function () {
    this.save = GB.loadSave();
    this.save.runs = (this.save.runs || 0) + 1;
    GB.writeSave(this.save);
    GB.seedRun(((performance.now() * 1000) | 0) ^ ((this.save.runs * 2654435761) | 0) ^ (Math.random() * 1e9 | 0));

    this.online = false;
    this.round = 1;
    this.runXp = 0; this.leveledUp = false; this.comboTriggeredThisRun = false;
    this.player = this.makePlayer();
    this.player.aim = 45;
    this.projectiles = []; this.particles = []; this.floaters = [];
    UI.hideAll();
    this.startRound();
  };

  P.makePlayer = function () {
    const p = new GB.Splonk({ isPlayer: true, name: 'YOU', accent: '#ffcf3f', face: '^_^' });
    const unlocked = GB.unlockedPassives(this.save);
    Object.keys(unlocked).forEach(pid => { const pa = GB.PASSIVES[pid]; if (pa) pa.apply(p); });
    GB.applyDriverBonuses(p, this.save.driverLevel);
    return p;
  };

  P.makeEnemy = function (round) {
    const isBoss = round % 5 === 0;
    let cfg, scale = 1;
    if (isBoss) { cfg = GB.BOSSES[(Math.floor(round / 5) - 1) % GB.BOSSES.length]; scale = cfg.scale || 1.4; }
    else cfg = GB.pick(GB.ARCHES);

    const e = new GB.Splonk({ isPlayer: false, facing: -1, scale, name: cfg.name, accent: cfg.accent, face: cfg.face });
    const hpScale = isBoss ? (1 + (round - 1) * 0.10) : (1 + (round - 1) * 0.17);
    const HP_BASE = 1.5;   // longer duels so the per-turn upgrade build-up matters
    e.maxHp = Math.round(cfg.hp * hpScale * HP_BASE); e.hp = e.maxHp;
    e.applyArchetypeMods(cfg.mods || {});
    e.aiAccuracy = M.clamp(cfg.accuracy + round * 0.004, 0, 0.95);
    e.aiAggression = cfg.aggression;
    e.powerMax += Math.min(4, round * 0.22);
    e.dmgMul *= 1 + (round - 1) * 0.045;
    e.blurb = cfg.blurb || '';
    if (isBoss) { e.isBoss = true; e.special = cfg.special; }

    // head-start upgrades so a fresh enemy keeps pace with the player's accumulated build
    const minorN = Math.min(16, (round - 1) * 2);
    for (let i = 0; i < minorN; i++) e.applyUpgrade(GB.pick(GB.MINOR_UPGRADES).id);
    const megaN = Math.min(6, Math.floor((round - 1) * 0.7));
    for (let i = 0; i < megaN; i++) e.applyUpgrade(GB.pick(GB.MEGA_UPGRADES).id);
    return e;
  };

  P.startRound = function () {
    this.online = false;
    this.isBoss = this.round % 5 === 0;
    const theme = GB.Terrain.THEMES[(this.round - 1) % GB.Terrain.THEMES.length];
    this.terrain = new GB.Terrain({ theme });
    this.wind = GB.rand(-0.12, 0.12);
    this.makeClouds();

    this.player.x = this.groundSpawnX(GB.rand(200, 520));
    this.player.facing = 1; this.player.settle(this); this.player.tookDamageThisRound = false;
    this.enemy = this.makeEnemy(this.round);
    this.enemy.x = this.groundSpawnX(GB.rand(GB.WORLD_W - 520, GB.WORLD_W - 200));
    this.enemy.facing = -1; this.enemy.settle(this); this.enemy.tookDamageThisRound = false;

    this.spawnLoot();
    this.centerCamOn(this.player);

    this.turn = null; this.phase = 'pre';
    this.charging = false; this.charge = 0; this.chargeOwner = null;
    this.enemyPhase = null; this.resolveDelay = 0.4;
    this.shake = 0; this.flash = 0; this.pick = null;
    this.player.firstShotMul = 1; this.enemy.firstShotMul = 1;

    this.state = 'battle';
    UI.hideAll();
    this.startCoinflip();   // loot boxes provide upgrades — no opening pick
  };

  // ---- world helpers ----
  P.makeClouds = function () {
    this.clouds = [];
    for (let i = 0; i < 6; i++) this.clouds.push({ x: GB.rand(0, GB.W), y: GB.rand(30, 200), s: GB.rand(0.6, 1.5), v: GB.rand(4, 13) * (GB.chance(0.5) ? 1 : -1) });
  };
  P.groundSpawnX = function (x) {
    x = M.clamp(x | 0, 60, GB.WORLD_W - 60);
    for (let d = 0; d < 700; d += 18) {
      for (const c of [x - d, x + d]) {
        const cx = M.clamp(c, 60, GB.WORLD_W - 60);
        if (this.terrain.surfaceY(cx) < GB.WORLD_H - 60) return cx;
      }
    }
    return x;
  };
  P.centerCamOn = function (s) {
    if (!this.cam) this.cam = { x: 0, y: 0 };
    this.cam.x = M.clamp(s.x - GB.W / 2, 0, GB.WORLD_W - GB.W);
    this.cam.y = M.clamp(s.y - GB.H * 0.62, 0, GB.WORLD_H - GB.H);
  };
  P.updateCamera = function (dt) {
    if (!this.cam) this.cam = { x: 0, y: 0 };
    let fx, fy;
    if (this.projectiles.length) { fx = this.projectiles[0].x; fy = this.projectiles[0].y; }
    else { const s = this.turn === 'enemy' ? this.enemy : this.player; fx = s.x; fy = s.y - 40; }
    const tx = M.clamp(fx - GB.W / 2, 0, GB.WORLD_W - GB.W);
    const ty = M.clamp(fy - GB.H * 0.55, 0, GB.WORLD_H - GB.H);
    const k = Math.min(1, 6 * dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  };

  // ---- loot boxes ----
  P.spawnLoot = function () {
    this.lootBoxes = [];
    const T = this.terrain, cats = GB.CATEGORIES;
    for (const pl of (T.platforms || [])) {
      if (this.lootBoxes.length >= 8) break;
      let rarity;
      if (pl.overhang || pl.y < GB.WORLD_H * 0.34) rarity = GB.chance(0.55) ? 'legendary' : 'rare';
      else if (pl.y < GB.WORLD_H * 0.5) rarity = GB.chance(0.6) ? 'rare' : 'common';
      else rarity = GB.chance(0.28) ? 'rare' : 'common';
      this.lootBoxes.push(new GB.LootBox({ x: pl.x + pl.w / 2, y: pl.y - 24, cat: GB.pick(cats), rarity }));
    }
    for (let i = 0; i < 3; i++) {
      const gx = this.groundSpawnX(GB.rand(250, GB.WORLD_W - 250));
      this.lootBoxes.push(new GB.LootBox({ x: gx, y: T.surfaceY(gx) - 22, cat: GB.pick(cats), rarity: GB.chance(0.78) ? 'common' : 'rare' }));
    }
    this.lootBoxes.forEach((b, i) => (b.index = i));
  };

  P.checkLoot = function (s, isLocal) {
    if (this.pick) return;
    for (const b of this.lootBoxes) {
      if (b.overlaps(s)) {
        if (isLocal) this.openLootPick(b);
        else { b.taken = true; if (s === this.enemy && !this.online) s.applyUpgrade(GB.pick(GB.lootChoices(b.cat, b.rarity)).id); }
        return;
      }
    }
  };

  P.openLootPick = function (box) {
    this.pick = { loot: true, box: box, choices: GB.lootChoices(box.cat, box.rarity), resolved: false, timer: 99 };
    this.player.moveDir = 0;
    UI.showLootPick(box, this.pick.choices, this.player.upgrades, id => this.resolveLootPick(box, id));
  };
  P.resolveLootPick = function (box, id) {
    if (!this.pick || this.pick.resolved) return;
    this.pick.resolved = true; box.taken = true;
    const before = GB.activeCombos(this.player.upgrades).map(c => c.id);
    this.player.applyUpgrade(id);
    const nc = GB.activeCombos(this.player.upgrades).find(c => before.indexOf(c.id) < 0);
    if (nc) { UI.toast('⚡ COMBO: ' + nc.name, 'unlock'); this.comboTriggeredThisRun = true; }
    else UI.toast('Got: ' + (GB.UP_BY_ID[id] ? GB.UP_BY_ID[id].name : ''));
    if (this.online) GB.Net.send({ t: 'loot', i: box.index, id: id });
    UI.hidePick(); this.pick = null;
  };

  P.banner = function (text, sub, color) {
    this.bannerText = text; this.bannerSub = sub; this.bannerColor = color; this.bannerTime = 1.5;
  };

  // ---------------------------------------------------------
  //  BATTLE UPDATE
  // ---------------------------------------------------------
  P.updateBattle = function (dt) {
    if (!this.terrain) return;   // online guest waiting for the host's round — no terrain yet
    if (this.bannerTime > 0) this.bannerTime -= dt;
    this.shake *= Math.pow(0.86, dt * 60); if (this.shake < 0.3) this.shake = 0;
    this.flash = M.approach(this.flash, 0, dt * 2.2);

    this.player.update(dt, this);
    // during the opponent's online turn the enemy is network-driven (move stream / sync)
    if (!(this.online && this.turn === 'enemy')) this.enemy.update(dt, this);

    // one-time death burst
    if (this.enemy.dead && !this.enemy._boom) { this.enemy._boom = true; this.deathFx(this.enemy); }
    if (this.player.dead && !this.player._boom) { this.player._boom = true; this.deathFx(this.player); }

    this.updateProjectiles();
    this.updateParticles();

    this.updateCamera(dt);

    // ----- pre-combat / transition phases -----
    if (this.battlePhase === 'coinflip') {
      this.coin.t += dt;
      if (this.coin.t >= this.coin.dur) this.beginCombat(this.coin.result);
      return;
    }
    if (this.battlePhase === 'won') {
      this.wonTimer -= dt;
      if (this.wonTimer <= 0) this.startRound();
      return;
    }
    if (this.battlePhase !== 'combat') return;   // netwait / matchover handled by net code

    // stop the inactive splonk from drifting
    (this.turn === 'player' ? this.enemy : this.player).moveDir = 0;

    if (this.phase === 'projectile') {
      if (this.projectiles.length === 0) { this.resolveDelay -= dt; if (this.resolveDelay <= 0) this.resolveTurn(); }
      else this.resolveDelay = 0.4;
      return;
    }

    if (this.turn === 'player' && (this.phase === 'aim' || this.phase === 'charging')) {
      this.turnTimer -= dt;
      if (this.turnTimer <= 0) {                 // out of time -> turn ends (no shot)
        if (this.pick) this.resolveLootPick(this.pick.box, this.pick.choices[0].id);
        this.player.moveDir = 0; this.charging = false; this.resolveTurn();
        return;
      }
      if (this.pick) return;                     // loot-box pick is open -> wait for the click
      if (this.bannerTime < 1.0) this.handlePlayerInput(dt);
    } else if (this.turn === 'enemy' && !this.online) {
      if (this.bannerTime < 1.0) this.handleEnemyTurn(dt);
    }
    // online enemy turn is driven by network messages
  };

  // ---------------------------------------------------------
  //  OPENING (simultaneous mega pick) + COIN FLIP
  // ---------------------------------------------------------
  P.updateOpening = function (dt) {
    if (this.pick && !this.pick.resolved) {
      this.pick.timer -= dt;
      UI.updatePickTimer(Math.max(0, this.pick.timer));
      if (this.pick.timer <= 0) this.resolvePick(GB.pick(this.pick.choices).id);
      return;
    }
    if (this.online) {
      // wait for BOTH players' opening megas before the coin flip
      if (this.netOpenMine && this.netOpenOpp) this.startCoinflip(this.netFirst);
      return;
    }
    this.startCoinflip();
  };

  P.startCoinflip = function (forced) {
    UI.hidePick();
    this.battlePhase = 'coinflip';
    this.coin = { t: 0, dur: 2.2, result: forced || (GB.chance(0.5) ? 'player' : 'enemy') };
    this.bannerTime = 0;
  };

  P.beginCombat = function (first) {
    this.battlePhase = 'combat';
    this.firstMover = first;
    // whoever goes second deals 2x on their first shot
    const second = first === 'player' ? this.enemy : this.player;
    second.firstShotMul = 2;
    if (first === 'player') {
      this.beginPlayerTurn();
      this.banner('YOU GO FIRST!', this.online ? 'Opponent’s first shot is boosted' : 'Enemy’s first shot is boosted', '#6fcf57');
    } else {
      this.turn = 'enemy';
      this.phase = 'aim';
      this.charging = false; this.charge = 0; this.chargeOwner = null;
      this.banner(this.online ? 'OPPONENT GOES FIRST' : 'ENEMY GOES FIRST', 'Your first shot deals 2× damage!', '#ffcf3f');
      if (this.online) { this.netAwaitOppShot = true; }
      else { this.enemy.startTurn(this); this.enemyPhase = 'think'; this.enemyTimer = 0; }
    }
  };

  // ---------------------------------------------------------
  //  PER-TURN UPGRADE PICKS
  // ---------------------------------------------------------
  P.beginPick = function (kind, isOpening) {
    const pool = kind === 'mega' ? GB.MEGA_UPGRADES : GB.MINOR_UPGRADES;
    const n = kind === 'mega' ? (3 + (this.player.extraPick || 0)) : 3;
    this.pick = {
      kind: kind,
      isOpening: !!isOpening,
      choices: GB.sample(pool, Math.min(n, pool.length)),
      timer: 15,
      resolved: false,
    };
    UI.showPick(this.pick, this.player.upgrades, id => this.resolvePick(id));
  };

  P.resolvePick = function (id) {
    if (!this.pick || this.pick.resolved) return;
    this.pick.resolved = true;
    const before = GB.activeCombos(this.player.upgrades).map(c => c.id);
    this.player.applyUpgrade(id);
    const newCombo = GB.activeCombos(this.player.upgrades).find(c => before.indexOf(c.id) < 0);
    if (newCombo) { UI.toast('⚡ COMBO: ' + newCombo.name, 'unlock'); this.comboTriggeredThisRun = true; }
    UI.hidePick();
    if (this.online) {
      GB.Net.send({ t: 'pick', phase: this.pick.isOpening ? 'open' : 'turn', id: id });
      if (this.pick.isOpening) this.netOpenMine = true;
    }
  };

  // enemy auto-picks an upgrade. forceKind='mega' for the opening.
  P.enemyAutoPick = function (forceKind) {
    const e = this.enemy;
    let kind;
    if (forceKind) { kind = forceKind; }
    else { e.upCount = (e.upCount || 0) + 1; kind = (e.upCount % 5 === 0) ? 'mega' : 'minor'; }
    const pool = kind === 'mega' ? GB.MEGA_UPGRADES : GB.MINOR_UPGRADES;
    const u = GB.pick(pool);
    e.applyUpgrade(u.id);
    UI.toast(e.name + ' got ' + u.name + (kind === 'mega' ? ' ★' : ''));
  };

  P.openPlayerPick = function () {
    this.player.upCount = (this.player.upCount || 0) + 1;
    const kind = (this.player.upCount % 5 === 0) ? 'mega' : 'minor';
    this.beginPick(kind, false);
  };

  // ---------------------------------------------------------
  //  TURN STARTS / TIMERS
  // ---------------------------------------------------------
  P.startTurnTimer = function () { this.turnTimer = 15; };

  P.beginPlayerTurn = function () {
    this.turn = 'player'; this.phase = 'aim';
    this.charging = false; this.charge = 0; this.chargeOwner = null;
    this.turnCraters = [];
    this.player.moveDir = 0; this.player.wantJump = false; this.player._jumpHeld = false;
    this.player.facing = this.enemy.x >= this.player.x ? 1 : -1;
    this.player.startTurn(this);
    this.turnTimer = GB.TURN_TIME;
    UI.hidePick();
    this.banner('YOUR TURN', 'Move · grab loot · fire to end', '#6fcf57');
  };

  P.beginEnemyTurn = function () {
    this.turn = 'enemy'; this.phase = 'aim';
    this.charging = false; this.charge = 0; this.chargeOwner = null;
    this.enemy.moveDir = 0; this.enemy.wantJump = false;
    this.enemy.startTurn(this);
    this.enemyPhase = 'think'; this.enemyTimer = 0;
    this.banner('ENEMY TURN', this.enemy.name, this.enemy.accent);
  };

  P.tryBeginPlayerTurn = function () { this.beginPlayerTurn(); };

  P.handlePlayerInput = function (dt) {
    const I = GB.Input, p = this.player;
    // run
    p.moveDir = (I.held('a', 'left') ? -1 : 0) + (I.held('d', 'right') ? 1 : 0);
    // jump (rising edge of the held state — robust under fixed timestep)
    const jh = I.held('w', 'up', 'space');
    if (jh && !p._jumpHeld) p.wantJump = true;
    p._jumpHeld = jh;
    // aim toward the mouse cursor (world space)
    const piv = p.pivot();
    const dx = (this.cam.x + I.mx) - piv.x, dy = (this.cam.y + I.my) - piv.y;
    p.facing = dx >= 0 ? 1 : -1;
    p.aim = M.clamp(M.rad2deg(Math.atan2(-dy, Math.abs(dx) + 0.001)), -82, 89);
    // hold mouse to charge, release to fire (ends the turn)
    if (this.phase === 'aim') {
      if (I.mousePressed) { this.charging = true; this.charge = 0; this.chargeOwner = p; this.phase = 'charging'; }
    } else {
      this.charge = Math.min(1, this.charge + GB.CHARGE_RATE * dt * p.chargeRate);
      if (!I.mouseDown) { this.fire(p, this.charge); this.charging = false; }
    }
    // grab a loot box if standing on one
    this.checkLoot(p, true);
    // stream my position to the opponent (~12 Hz) so they see me move
    if (this.online) {
      this._moveAcc = (this._moveAcc || 0) + 1;
      if (this._moveAcc >= 5) {
        this._moveAcc = 0;
        GB.Net.send({ t: 'move', x: Math.round(p.x), y: Math.round(p.y), vx: +p.vx.toFixed(1), vy: +p.vy.toFixed(1), f: p.facing, a: Math.round(p.aim) });
      }
    }
  };

  P.handleEnemyTurn = function (dt) {
    const e = this.enemy, p = this.player;
    if (this.enemyPhase == null) { this.enemyPhase = 'think'; this.enemyTimer = 0; }
    switch (this.enemyPhase) {
      case 'think':
        this.enemyTimer += dt;
        if (this.enemyTimer < 0.4) break;
        e.facing = p.x >= e.x ? 1 : -1;
        this.plan = GB.AI.plan(this, e, p);
        this.enemyPhase = 'move'; this.enemyTimer = 0; this._stuck = 0;
        break;
      case 'move': {
        this.enemyTimer += dt;
        const diff = this.plan.desiredX - e.x;
        if (Math.abs(diff) > 16 && this.enemyTimer < 2.6 && !e.dead) {
          e.moveDir = M.sign(diff);
          // hop if not making horizontal progress (blocked by a ledge/wall)
          if (Math.abs(e.vx) < 0.7 && e.onGround) { this._stuck += dt; if (this._stuck > 0.22) { e.wantJump = true; this._stuck = 0; } }
          else this._stuck = 0;
          this.checkLoot(e, false);            // auto-grab loot it passes
        } else {
          e.moveDir = 0;
          e.facing = p.x >= e.x ? 1 : -1;
          this.plan = GB.AI.plan(this, e, p);  // re-aim from the final position
          this.enemyPhase = 'aim'; this.enemyTimer = 0;
        }
        break;
      }
      case 'aim':
        e.aim = M.approach(e.aim, this.plan.aim, 70 * dt);
        this.enemyTimer += dt;
        if (Math.abs(e.aim - this.plan.aim) < 0.7 || this.enemyTimer > 1.6) {
          this.enemyPhase = 'charge'; this.charging = true; this.charge = 0; this.chargeOwner = e;
        }
        break;
      case 'charge': {
        const tT = M.clamp(M.inv(e.powerMin, e.powerMax, this.plan.power), 0.08, 1);
        this.charge = Math.min(tT, this.charge + GB.CHARGE_RATE * dt);
        if (this.charge >= tT - 0.001) { this.fire(e, tT); this.charging = false; this.enemyPhase = null; }
        break;
      }
    }
  };

  // ---------------------------------------------------------
  //  FIRING
  // ---------------------------------------------------------
  P.spawnShell = function (shooter, x, y, ang, speed, opts) {
    opts = opts || {};
    const fsm = shooter.firstShotMul || 1;   // 2x for whoever goes second, on their first shot
    this.projectiles.push(new GB.Projectile({
      x, y,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      owner: shooter,
      dmg: (opts.dmg != null ? opts.dmg : 24 * shooter.dmgMul) * fsm,
      blastR: (opts.blastR != null ? opts.blastR : 52 * shooter.blastMul),
      windResist: shooter.windResist,
      bounce: shooter.mods.bounce ? shooter.bounceCount : 0,
      cluster: shooter.mods.cluster ? shooter.clusterCount : 0,
      homing: shooter.mods.homing ? shooter.homingStr : 0,
      mortar: !!shooter.mods.mortar,
      pierce: shooter.mods.pierce ? shooter.pierceDist : 0,
      color: shooter.isPlayer ? '#ffd24a' : '#ff9a4a',
    }));
  };

  P.fire = function (shooter, chargeT) {
    chargeT = M.clamp(chargeT, 0.06, 1);
    // online: tell the opponent to animate my shot (sent before simulating locally)
    if (this.online && shooter === this.player) {
      GB.Net.send({ t: 'shot', aim: shooter.aim, charge: chargeT, x: Math.round(shooter.x), y: Math.round(shooter.y), f: shooter.facing });
    }
    const speed = M.lerp(shooter.powerMin, shooter.powerMax, chargeT);
    const tip = shooter.barrelTip();
    const v = shooter.aimVec();
    const baseAng = Math.atan2(v.y, v.x);
    const spreadN = shooter.mods.spread ? Math.min(2, shooter.mods.spread) : 0;
    const shells = 1 + spreadN * 2;
    for (let i = 0; i < shells; i++) {
      const off = shells === 1 ? 0 : (i - (shells - 1) / 2) * M.deg2rad(7);
      this.spawnShell(shooter, tip.x, tip.y, baseAng + off, speed);
    }
    if (shooter.isBoss && shooter.special && GB.chance(0.45)) this.bossSpecial(shooter, speed);

    // consume the 2x first-shot bonus (shells already spawned with it applied)
    if ((shooter.firstShotMul || 1) > 1) {
      shooter.firstShotMul = 1;
      this.addFloater(shooter.x, shooter.centerY() - 64, '2× FIRST SHOT!', '#ffcf3f');
    }

    if (shooter.isPlayer) shooter.lastCharge = chargeT;   // remember for the gray reference cone
    shooter.fireRecoil = 1;
    this.muzzleFx(tip, baseAng, shooter);
    this.shake = Math.min(14, this.shake + 5);
    if (shooter.isPlayer && GB.activeCombos(shooter.upgrades).length > 0) this.comboTriggeredThisRun = true;

    this.phase = 'projectile';
    this.resolveDelay = 0.4;
  };

  P.bossSpecial = function (b, speed) {
    const p = this.opponentOf(b);
    const tip = b.barrelTip();
    const base = Math.atan2(b.aimVec().y, b.aimVec().x);
    if (b.special === 'barrage') {
      for (const off of [-0.13, 0.13]) this.spawnShell(b, tip.x, tip.y, base + off, speed * GB.rand(0.95, 1.05));
      this.banner('☄ BARRAGE!', null, '#ff5a3c'); this.bannerTime = 1.0;
    } else if (b.special === 'rain') {
      for (let i = 0; i < 6; i++) {
        const x = p.x + GB.rand(-180, 180);
        this.spawnShell(b, x, -20, Math.PI / 2 + GB.rand(-0.3, 0.3), GB.rand(3.5, 5.5), { dmg: 16 * b.dmgMul, blastR: 40 });
      }
      this.banner('☔ SKY RAIN!', null, '#c77dff'); this.bannerTime = 1.0;
    }
    // 'reflect' boss has no extra projectile; its shield+reflect mods do the work
  };

  // ---------------------------------------------------------
  //  PROJECTILES / PARTICLES
  // ---------------------------------------------------------
  P.updateProjectiles = function () {
    const arr = this.projectiles;
    for (let i = arr.length - 1; i >= 0; i--) {
      const pr = arr[i];
      pr.update(this);
      if (pr.dead) arr.splice(i, 1);
    }
  };
  P.updateParticles = function () {
    for (let i = this.particles.length - 1; i >= 0; i--) if (!this.particles[i].update()) this.particles.splice(i, 1);
    for (let i = this.floaters.length - 1; i >= 0; i--) if (!this.floaters[i].update()) this.floaters.splice(i, 1);
  };

  P.opponentOf = function (s) { return s === this.player ? this.enemy : this.player; };

  // ---------------------------------------------------------
  //  TURN RESOLUTION
  // ---------------------------------------------------------
  P.resolveTurn = function () {
    if (this.online) { this.resolveTurnOnline(); return; }
    if (this.player.dead) {
      this.endRun(false, this.player.outOfArena ? 'Knocked clean out of the arena.' : 'Your SPLONK was reduced to scrap.');
      return;
    }
    if (this.enemy.dead) { this.winRound(); return; }

    if (this.turn === 'player') {
      // player just shot -> enemy's turn begins AND the player picks an upgrade during it
      this.beginEnemyTurn();
    } else {
      // enemy just shot -> it gains its per-turn upgrade, then the player's turn
      this.enemyAutoPick();
      this.tryBeginPlayerTurn();
    }
  };

  P.winRound = function () {
    const wasBoss = this.isBoss;
    const flawless = !this.player.tookDamageThisRound;
    this.awardXp(14 + this.round * 3 + (wasBoss ? 30 : 0));
    this.checkMilestones({ round: this.round, win: true, flawless, wasBoss, comboTriggered: this.comboTriggeredThisRun });
    if (this.round > (this.save.bestRound || 0)) this.save.bestRound = this.round;
    this.save.totalWins = (this.save.totalWins || 0) + 1;
    GB.writeSave(this.save);
    // partial heal between rounds
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.round(this.player.maxHp * 0.30));
    UI.hidePick();
    this.round++;
    this.battlePhase = 'won';
    this.wonTimer = 1.7;
    this.banner('ROUND CLEARED!', 'Next: Round ' + this.round, '#6fcf57');
  };

  // ---------------------------------------------------------
  //  META: XP, MILESTONES
  // ---------------------------------------------------------
  P.awardXp = function (amt) {
    const before = GB.driverLevelFromXp(this.save.driverXp).level;
    this.save.driverXp += amt; this.runXp += amt;
    const after = GB.driverLevelFromXp(this.save.driverXp);
    this.save.driverLevel = after.level;
    if (after.level > before) { this.leveledUp = true; UI.toast('DRIVER LEVEL UP → Lv.' + after.level, 'unlock'); }
  };

  P.checkMilestones = function (ctx) {
    const newly = [];
    GB.MILESTONES.forEach(m => {
      if (!this.save.milestones[m.id] && m.check(ctx)) {
        this.save.milestones[m.id] = true;
        if (m.reward && m.reward.xp) this.awardXp(m.reward.xp);
        UI.toast('UNLOCKED: ' + m.name, 'unlock');
        if (m.reward && m.reward.passive) { const pa = GB.PASSIVES[m.reward.passive]; if (pa) UI.toast('PASSIVE: ' + pa.name, 'unlock'); }
        newly.push(m.name);
      }
    });
    if (newly.length) GB.writeSave(this.save);
    return newly;
  };

  P.endRun = function (win, cause) {
    GB.writeSave(this.save);
    this.state = 'gameover';
    const d = GB.driverLevelFromXp(this.save.driverXp);
    UI.showGameOver(
      { win, round: this.round, cause, xpGained: this.runXp, levelUps: this.leveledUp, newLevel: d.level },
      () => this.startRun(),
      () => this.toMenu()
    );
  };

  P.toMenu = function () {
    this.online = false;
    if (GB.Net) { GB.Net.onMsg = null; GB.Net.close(); }
    this.state = 'menu'; this.terrain = null;
    this.makeMenuBg();
    UI.hideAll(); UI.refreshMenu(this.save); UI.show('menu');
  };

  // ---------------------------------------------------------
  //  FX
  // ---------------------------------------------------------
  P.addFloater = function (x, y, text, color) { this.floaters.push(new GB.Floater({ x, y, text, color })); };

  P.muzzleFx = function (tip, ang, shooter) {
    for (let i = 0; i < 10; i++) {
      const a = ang + GB.rand(-0.4, 0.4);
      const sp = GB.rand(2, 6);
      this.particles.push(new GB.Particle({
        x: tip.x, y: tip.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: GB.randInt(10, 20), r: GB.rand(2, 5), grav: 0.02,
        color: i % 2 ? '#fff4c2' : '#ffac4a', glow: true,
      }));
    }
  };

  P.explosionFx = function (x, y, r, color, big) {
    const n = Math.round(r * (big ? 1.3 : 0.9));
    // core flash
    for (let i = 0; i < n * 0.6; i++) {
      const a = GB.rand(0, 7), sp = GB.rand(1, r * 0.18);
      this.particles.push(new GB.Particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: GB.randInt(14, 30), r: GB.rand(3, 8), grav: 0.04,
        color: GB.chance(0.5) ? '#fff4c2' : '#ffac4a', glow: true,
      }));
    }
    // smoke
    for (let i = 0; i < n * 0.5; i++) {
      const a = GB.rand(0, 7), sp = GB.rand(0.4, 2.4);
      const g = GB.randInt(40, 90);
      this.particles.push(new GB.Particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6,
        life: GB.randInt(30, 60), r: GB.rand(6, 14), grav: -0.02,
        color: GB.rgba(g, g, g + 8, 0.5), glow: false,
      }));
    }
    // dirt debris
    const dirt = this.terrain ? this.terrain.theme.dirt[0] : '#7a4a2b';
    for (let i = 0; i < n * 0.7; i++) {
      const a = -Math.PI / 2 + GB.rand(-1.2, 1.2), sp = GB.rand(3, 9);
      this.particles.push(new GB.Particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: GB.randInt(30, 55), r: GB.rand(2, 5), grav: 0.28,
        color: dirt, shrink: false,
      }));
    }
    this.flash = Math.min(0.7, this.flash + (big ? 0.45 : 0.28));
  };

  P.spawnSparks = function (x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = GB.rand(0, 7), sp = GB.rand(1, 4);
      this.particles.push(new GB.Particle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: GB.randInt(10, 22), r: GB.rand(1.5, 3.5), grav: 0.1, color, glow: true }));
    }
  };

  P.shieldFx = function (s) {
    for (let i = 0; i < 12; i++) {
      const a = GB.rand(0, 7);
      this.particles.push(new GB.Particle({
        x: s.x + Math.cos(a) * 38 * s.scale, y: s.centerY() + Math.sin(a) * 38 * s.scale,
        vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: GB.randInt(12, 24), r: GB.rand(2, 4),
        grav: 0, color: '#9be7ff', glow: true,
      }));
    }
  };

  P.deathFx = function (s) {
    if (!s) return;
    for (let i = 0; i < 40; i++) {
      const a = GB.rand(0, 7), sp = GB.rand(2, 8);
      this.particles.push(new GB.Particle({
        x: s.x, y: s.centerY(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        life: GB.randInt(30, 60), r: GB.rand(2, 6), grav: 0.25,
        color: GB.chance(0.5) ? s.accent : '#888', shrink: false,
      }));
    }
    this.shake = 24; this.flash = 0.6;
  };

  // ---------------------------------------------------------
  //  RENDER
  // ---------------------------------------------------------
  P.render = function () {
    const ctx = this.ctx;
    if (this.terrain && (this.state === 'battle' || this.state === 'gameover')) {
      this.drawBattle(ctx);
    } else {
      this.drawMenuBg(ctx);
    }
  };

  P.drawSky = function (ctx) {
    const theme = this.terrain ? this.terrain.theme : GB.Terrain.THEMES[0];
    const g = ctx.createLinearGradient(0, 0, 0, GB.H);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(1, theme.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, GB.W, GB.H);

    // far hills (parallax silhouettes)
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      const base = GB.H * (0.55 + layer * 0.07);
      const amp = 60 - layer * 20;
      ctx.moveTo(0, GB.H);
      for (let x = 0; x <= GB.W; x += 20) {
        ctx.lineTo(x, base - Math.sin(x * 0.004 + layer * 2 + 1) * amp - amp);
      }
      ctx.lineTo(GB.W, GB.H); ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${0.10 - layer * 0.04})`;
      ctx.fill();
    }
    ctx.restore();

    // clouds
    for (const c of this.clouds) this.drawCloud(ctx, c.x, c.y, c.s);
  };

  P.drawCloud = function (ctx, x, y, s) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(x, y, 40 * s, 22 * s, 0, 0, 7);
    ctx.ellipse(x + 30 * s, y + 6 * s, 30 * s, 18 * s, 0, 0, 7);
    ctx.ellipse(x - 30 * s, y + 6 * s, 26 * s, 16 * s, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  };

  P.drawBattle = function (ctx) {
    ctx.clearRect(0, 0, GB.W, GB.H);
    this.drawSky(ctx);

    const cam = this.cam || (this.cam = { x: 0, y: 0 });
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    ctx.save();
    ctx.translate((Math.random() - 0.5) * this.shake - cx, (Math.random() - 0.5) * this.shake - cy);

    // terrain (only the visible window, for performance)
    ctx.drawImage(this.terrain.canvas, cx, cy, GB.W, GB.H, cx, cy, GB.W, GB.H);

    // loot boxes
    if (this.lootBoxes) for (const b of this.lootBoxes) b.draw(ctx, this.time);

    const active = this.turn === 'player' ? this.player : this.enemy;
    this.enemy.draw(ctx, this.time, active === this.enemy);
    this.player.draw(ctx, this.time, active === this.player);

    // aim visuals for the active shooter (online shows only mine)
    if (this.battlePhase === 'combat' && active && (!this.online || active === this.player) &&
        (this.phase === 'aim' || this.phase === 'charging') && this.bannerTime < 1.0 && !active.dead) {
      if (this.charging && this.chargeOwner) UI.drawChargeCone(ctx, this.chargeOwner, this.charge, this.time);
      else UI.drawAimIndicator(ctx, active);
    }

    for (const pr of this.projectiles) pr.draw(ctx);
    for (const pa of this.particles) pa.draw(ctx);

    UI.drawWorldBars(ctx, this.enemy, this.time);
    UI.drawWorldBars(ctx, this.player, this.time);
    for (const fl of this.floaters) fl.draw(ctx);
    if (this.battlePhase === 'coinflip') UI.drawCoinflipRing(ctx, this);

    ctx.restore();

    // unshaken HUD
    UI.drawTopBar(ctx, this);
    if (this.battlePhase === 'combat') { UI.drawControlsHint(ctx, this); UI.drawTurnTimer(ctx, this); }
    if (this.battlePhase === 'coinflip') UI.drawCoinflipHeadline(ctx, this);
    UI.drawBanner(ctx, this);

    // screen flash
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = GB.rgba(255, 240, 200, this.flash * 0.5);
      ctx.fillRect(0, 0, GB.W, GB.H);
      ctx.restore();
    }
  };

  // simple animated background for menus
  P.makeMenuBg = function () {
    this.clouds = [];
    for (let i = 0; i < 6; i++) this.clouds.push({ x: Math.random() * GB.W, y: 40 + Math.random() * 220, s: 0.6 + Math.random() * 1.2, v: (4 + Math.random() * 10) * (Math.random() < 0.5 ? 1 : -1) });
  };

  P.drawMenuBg = function (ctx) {
    ctx.clearRect(0, 0, GB.W, GB.H);
    const g = ctx.createLinearGradient(0, 0, 0, GB.H);
    g.addColorStop(0, '#3a2a6e');
    g.addColorStop(0.6, '#5a2a7e');
    g.addColorStop(1, '#1a1030');
    ctx.fillStyle = g; ctx.fillRect(0, 0, GB.W, GB.H);
    // drifting blobs
    for (const c of this.clouds) {
      ctx.save(); ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#ffcf3f';
      ctx.beginPath(); ctx.arc(c.x, c.y + Math.sin(this.time + c.x) * 10, 50 * c.s, 0, 7); ctx.fill();
      ctx.restore();
    }
    // ground silhouette
    ctx.fillStyle = '#241640';
    ctx.beginPath();
    ctx.moveTo(0, GB.H);
    for (let x = 0; x <= GB.W; x += 24) ctx.lineTo(x, GB.H * 0.82 - Math.sin(x * 0.006 + 1) * 40);
    ctx.lineTo(GB.W, GB.H); ctx.closePath(); ctx.fill();
  };

  // ---------------------------------------------------------
  //  ONLINE PvP
  // ---------------------------------------------------------
  P.openOnline = function () {
    if (!GB.Net.available()) { UI.toast('Online play needs the game server (node server.js).', 'unlock'); return; }
    this.state = 'online';
    UI.hideAll();
    UI.showOnline(() => { GB.Net.cancel(); this.toMenu(); });
    const name = 'Pilot' + (100 + Math.floor(Math.random() * 900));
    GB.Net.connect(name);
  };

  P.startOnlineMatch = function () {
    this.online = true;
    this.netSide = GB.Net.side;
    this.oppName = GB.Net.oppName || 'Rival';
    GB.Net.onMsg = m => this.netRecv(m);
    this._freshNetSplonks();
    this.round = 1;
    this.comboTriggeredThisRun = false;
    this.projectiles = []; this.particles = []; this.floaters = []; this.turnCraters = [];
    UI.hideAll();
    if (this.netSide === 'host') this.hostStartRound();
    else { this.state = 'battle'; this.battlePhase = 'netwait'; this.banner('MATCH FOUND', 'Syncing with ' + this.oppName + '…', '#9be7ff'); }
  };

  P._freshNetSplonks = function () {
    // both players start equal — no meta/driver bonuses in PvP
    this.player = new GB.Splonk({ isPlayer: true, name: 'YOU', accent: '#ffcf3f', face: '^_^' });
    this.enemy = new GB.Splonk({ isPlayer: false, name: this.oppName, accent: '#ff5a3c', face: '>:(' });
    this.player.aim = 45; this.enemy.aim = 45;
  };

  P.hostStartRound = function () {
    const p = {
      t: 'round',
      seed: (Math.random() * 1e9) | 0,
      wind: +(Math.random() * 0.24 - 0.12).toFixed(4),
      px: Math.round(200 + Math.random() * 320),
      ex: Math.round(GB.WORLD_W - 200 - Math.random() * 320),
      first: Math.random() < 0.5 ? 'host' : 'guest',
    };
    GB.Net.send(p);
    this.buildOnlineRound(p);
  };

  P.buildOnlineRound = function (p) {
    GB.seedRun(p.seed | 0);                       // identical terrain + loot on both clients
    this.terrain = new GB.Terrain({ theme: GB.Terrain.THEMES[0] });
    this.wind = p.wind;
    this.makeClouds();

    const iAmHost = this.netSide === 'host';
    const hostX = this.groundSpawnX(p.px), guestX = this.groundSpawnX(p.ex);
    this.player.x = iAmHost ? hostX : guestX; this.player.facing = iAmHost ? 1 : -1;
    this.enemy.x = iAmHost ? guestX : hostX; this.enemy.facing = iAmHost ? -1 : 1;
    this.player.settle(this); this.enemy.settle(this);
    this.player.tookDamageThisRound = false;
    this.spawnLoot();                             // deterministic from the seed
    this.centerCamOn(this.player);

    this.netFirst = (p.first === this.netSide) ? 'player' : 'enemy';
    this.player.firstShotMul = 1; this.enemy.firstShotMul = 1;
    this.netAwaitOppShot = false;
    this.turn = null; this.phase = 'pre';
    this.charging = false; this.charge = 0; this.chargeOwner = null;
    this.shake = 0; this.flash = 0; this.turnCraters = [];

    this.state = 'battle';
    UI.hideAll();
    this.startCoinflip(this.netFirst);            // loot boxes provide upgrades — no opening pick
  };

  P.netState = function (s) {
    return { x: Math.round(s.x), y: Math.round(s.y), air: !!s.airborne, hp: Math.round(s.hp), shield: Math.round(s.shield) };
  };
  P.applyNetState = function (s, st) {
    if (!st) return;
    const prev = s.hp;
    s.x = st.x; s.y = st.y; s.airborne = !!st.air;
    s.hp = st.hp; s.shield = st.shield;
    s.dead = s.hp <= 0;
    if (st.hp < prev - 0.5) {
      s.flash = 1; s.hitWobble = 1; s.tookDamageThisRound = true;
      this.addFloater(s.x, s.centerY() - 34, '-' + Math.round(prev - st.hp), s.isPlayer ? '#ff5a3c' : '#fff');
    }
  };

  P.resolveTurnOnline = function () {
    if (this.turn === 'player') {
      // MY shot settled — I'm authoritative for it; broadcast the result + hand over
      GB.Net.send({ t: 'sync', craters: this.turnCraters, me: this.netState(this.player), opp: this.netState(this.enemy) });
      this.turnCraters = [];
      if (this.player.dead) { this.endMatchOnline(false); return; }
      if (this.enemy.dead) { this.endMatchOnline(true); return; }
      this.beginEnemyTurnOnline();
    } else {
      // opponent's shot was simulated locally for instant feedback — DON'T broadcast;
      // wait for their authoritative sync to confirm the outcome and hand the turn back
      this.phase = 'aim';            // inert during the opponent's turn (online has no AI)
      this.netOppShotResolved = true;
    }
  };

  P.beginEnemyTurnOnline = function () {
    this.turn = 'enemy'; this.phase = 'aim';
    this.charging = false; this.charge = 0; this.chargeOwner = null;
    this.enemy.moveDir = 0;
    this.netAwaitOppShot = true;
    this.banner('OPPONENT TURN', this.oppName, this.enemy.accent);
  };

  P.fireVisual = function (shooter, chargeT) {
    chargeT = M.clamp(chargeT, 0.06, 1);
    const speed = M.lerp(shooter.powerMin, shooter.powerMax, chargeT);
    const tip = shooter.barrelTip();
    const v = shooter.aimVec();
    const baseAng = Math.atan2(v.y, v.x);
    const spreadN = shooter.mods.spread ? Math.min(2, shooter.mods.spread) : 0;
    const shells = 1 + spreadN * 2;
    for (let i = 0; i < shells; i++) {
      const off = shells === 1 ? 0 : (i - (shells - 1) / 2) * M.deg2rad(7);
      this.projectiles.push(new GB.Projectile({
        x: tip.x, y: tip.y, vx: Math.cos(baseAng + off) * speed, vy: Math.sin(baseAng + off) * speed,
        owner: shooter, dmg: 0, blastR: 52 * shooter.blastMul, windResist: shooter.windResist,
        bounce: shooter.mods.bounce ? shooter.bounceCount : 0,
        homing: shooter.mods.homing ? shooter.homingStr : 0,
        mortar: !!shooter.mods.mortar, netVisual: true,
        color: shooter.isPlayer ? '#ffd24a' : '#ff9a4a',
      }));
    }
    shooter.fireRecoil = 1;
    this.muzzleFx(tip, baseAng, shooter);
  };

  P.netRecv = function (m) {
    if (!m || !m.t) return;
    switch (m.t) {
      case 'oppleft': this.onOppLeft(); break;
      case 'round': this.buildOnlineRound(m); break;
      case 'loot':
        if (this.lootBoxes && this.lootBoxes[m.i]) this.lootBoxes[m.i].taken = true;
        if (GB.UP_BY_ID[m.id]) this.enemy.applyUpgrade(m.id);
        UI.toast(this.oppName + ' grabbed ' + (GB.UP_BY_ID[m.id] ? GB.UP_BY_ID[m.id].name : 'loot'));
        break;
      case 'move':
        if (this.turn === 'enemy') {
          this.enemy.x = m.x; this.enemy.y = m.y; this.enemy.vx = m.vx || 0; this.enemy.vy = m.vy || 0;
          if (m.f) this.enemy.facing = m.f;
          if (m.a != null) this.enemy.aim = m.a;
        }
        break;
      case 'shot': this.netRecvShot(m); break;
      case 'sync': this.netRecvSync(m); break;
      case 'rematch': this.netRematchFromOpp(); break;
    }
  };

  P.netRecvShot = function (m) {
    // simulate the opponent's shot locally & immediately (real terrain + physics)
    this.enemy.x = m.x; this.enemy.y = m.y != null ? m.y : this.enemy.y;
    this.enemy.aim = m.aim; if (m.f) this.enemy.facing = m.f;
    this.enemy.vx = 0; this.enemy.vy = 0;
    this.netOppShotResolved = false;
    this.fire(this.enemy, m.charge);   // owner = enemy -> doesn't re-broadcast, doesn't record my craters
  };

  P.netRecvSync = function (m) {
    // clear any in-flight shells from the local simulation of the opponent's shot
    this.projectiles.length = 0;
    // re-carve the authoritative craters (idempotent — guarantees terrain matches the shooter)
    for (const c of (m.craters || [])) this.terrain.crater(c.x, c.y, c.r);
    // snap to authoritative HP/positions (corrects any drift between the two machines)
    this.applyNetState(this.enemy, m.me);   // sender's own splonk == my enemy
    this.applyNetState(this.player, m.opp); // sender's opponent == me
    this.netAwaitOppShot = false;
    if (this.player.dead) { this.endMatchOnline(false); return; }
    if (this.enemy.dead) { this.endMatchOnline(true); return; }
    this.tryBeginPlayerTurn();
  };

  P.endMatchOnline = function (win) {
    this.battlePhase = 'matchover';
    this.netRematchMine = false; this.netRematchOpp = false;
    this.deathFx(win ? this.enemy : this.player);
    UI.showOnlineOver(win, this.oppName,
      () => this.requestRematch(),
      () => { GB.Net.close(); this.toMenu(); });
  };

  P.requestRematch = function () {
    this.netRematchMine = true;
    GB.Net.send({ t: 'rematch' });
    UI.onlineOverWaiting();
    this.maybeRematch();
  };
  P.netRematchFromOpp = function () {
    this.netRematchOpp = true;
    if (this.battlePhase === 'matchover' && UI.onlineOverOppReady) UI.onlineOverOppReady();
    this.maybeRematch();
  };
  P.maybeRematch = function () {
    if (this.netRematchMine && this.netRematchOpp) {
      this._freshNetSplonks();
      this.projectiles = []; this.particles = []; this.floaters = []; this.turnCraters = [];
      UI.hideAll();
      if (this.netSide === 'host') this.hostStartRound();
      else { this.state = 'battle'; this.battlePhase = 'netwait'; this.banner('REMATCH', 'Syncing…', '#9be7ff'); }
    }
  };

  P.onOppLeft = function () {
    if (this.state === 'online') { UI.onlineStatus('oppleft', GB.Net); return; }
    GB.Net.close(); this.online = false;
    UI.toast((this.oppName || 'Opponent') + ' left the match', 'unlock');
    this.toMenu();
  };

  // boot
  GB.game = new Game();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => GB.game.init());
  else GB.game.init();

})(window.GB);
