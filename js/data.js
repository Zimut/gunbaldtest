/* ============================================================
   GUNBALD — data.js
   Upgrades tagged by CATEGORY (weapon/defense/mobility/utility)
   and TIER (minor/major). Loot boxes pull from a category, with
   rarity choosing the tier mix. Combos still emerge from flags.
   ============================================================ */
(function (GB) {
  'use strict';

  const U = [
    // ===================== WEAPON ⚔️ =====================
    { id: 'spread', cat: 'weapon', tier: 'major', name: 'Spread Shot', ic: '🔱', vis: 'barrel',
      desc: 'Fire a fan of 3 shells.', apply: s => { s.mods.spread = (s.mods.spread || 0) + 1; s.dmgMul *= 0.85; } },
    { id: 'bounce', cat: 'weapon', tier: 'major', name: 'Bouncing Shells', ic: '🪀', vis: 'barrel',
      desc: 'Shells ricochet off terrain.', apply: s => { s.mods.bounce = true; s.bounceCount = (s.bounceCount || 0) + 2; } },
    { id: 'cluster', cat: 'weapon', tier: 'major', name: 'Cluster Bomb', ic: '💣', vis: 'pod',
      desc: 'Explosions split into bomblets.', apply: s => { s.mods.cluster = true; s.clusterCount = (s.clusterCount || 0) + 4; } },
    { id: 'homing', cat: 'weapon', tier: 'major', name: 'Homing Missile', ic: '🎯', vis: 'fin',
      desc: 'Shells steer toward the enemy.', apply: s => { s.mods.homing = true; s.homingStr = (s.homingStr || 0) + 0.04; } },
    { id: 'mortar', cat: 'weapon', tier: 'major', name: 'Mortar Arc', ic: '☄️', vis: 'barrel',
      desc: 'Heavier shell, bigger crater.', apply: s => { s.mods.mortar = true; s.dmgMul *= 1.3; s.blastMul *= 1.25; } },
    { id: 'pierce', cat: 'weapon', tier: 'major', name: 'Drill Shells', ic: '🪛', vis: 'fin',
      desc: 'Burrow through terrain then blow.', apply: s => { s.mods.pierce = true; s.pierceDist = (s.pierceDist || 0) + 38; s.blastMul *= 1.12; } },
    { id: 'shrapnel', cat: 'weapon', tier: 'major', name: 'Shrapnel Burst', ic: '✳️', vis: 'spike',
      desc: 'Blasts spray horizontal shrapnel.', apply: s => { s.mods.shrapnel = true; s.shrapnelCount = (s.shrapnelCount || 0) + 5; } },
    { id: 'napalm', cat: 'weapon', tier: 'major', name: 'Napalm Payload', ic: '🔥', vis: 'pod',
      desc: 'A much larger fiery blast.', apply: s => { s.mods.napalm = true; s.dmgMul *= 1.2; s.blastMul *= 1.5; } },
    { id: 'bigshell', cat: 'weapon', tier: 'major', name: 'Siege Shell', ic: '🛢️', vis: 'barrel',
      desc: '+55% damage, +30% blast.', apply: s => { s.dmgMul *= 1.55; s.blastMul *= 1.3; } },
    { id: 'lifesteal', cat: 'weapon', tier: 'major', name: 'Vampiric Rounds', ic: '🧛', vis: 'pod',
      desc: 'Heal 30% of damage dealt.', apply: s => { s.lifesteal = (s.lifesteal || 0) + 0.30; } },
    { id: 'w_dmg', cat: 'weapon', tier: 'minor', name: 'Sharpened Slugs', ic: '🔪',
      desc: '+10% shell damage.', apply: s => { s.dmgMul *= 1.10; } },
    { id: 'w_power', cat: 'weapon', tier: 'minor', name: 'Pressure Valve', ic: '🎚️',
      desc: '+0.8 max shot power.', apply: s => { s.powerMax += 0.8; } },
    { id: 'w_blast', cat: 'weapon', tier: 'minor', name: 'Bigger Payload', ic: '💥',
      desc: '+10% blast radius.', apply: s => { s.blastMul *= 1.10; } },
    { id: 'w_charge', cat: 'weapon', tier: 'minor', name: 'Servo Tune', ic: '⏩',
      desc: 'Charge 14% faster.', apply: s => { s.chargeRate *= 1.14; } },

    // ===================== DEFENSE 🛡️ =====================
    { id: 'armor', cat: 'defense', tier: 'major', name: 'Armor Plating', ic: '🛡️', vis: 'plate',
      desc: '+30 max HP, take 12% less.', apply: s => { s.maxHp += 30; s.hp += 30; s.dmgReduce = Math.min(0.6, (s.dmgReduce || 0) + 0.12); } },
    { id: 'shield', cat: 'defense', tier: 'major', name: 'Shield Dome', ic: '🔵', vis: 'dome',
      desc: 'A regenerating energy dome.', apply: s => { s.shieldMax += 35; s.shield = s.shieldMax; s.shieldRegen += 12; } },
    { id: 'reflect', cat: 'defense', tier: 'major', name: 'Damage Reflect', ic: '↩️', vis: 'spike',
      desc: 'Return 30% of damage taken.', apply: s => { s.reflectPct = Math.min(0.9, s.reflectPct + 0.30); } },
    { id: 'heavyframe', cat: 'defense', tier: 'major', name: 'Reinforced Hull', ic: '🏗️', vis: 'plate',
      desc: '+55 max HP, repaired now.', apply: s => { s.maxHp += 55; s.hp += 55; } },
    { id: 'd_heal', cat: 'defense', tier: 'minor', name: 'Patch Kit', ic: '🩹',
      desc: 'Repair 24 HP now.', apply: s => { s.hp = Math.min(s.maxHp, s.hp + 24); } },
    { id: 'd_maxhp', cat: 'defense', tier: 'minor', name: 'Plating Scrap', ic: '🧱',
      desc: '+16 max HP (and heal it).', apply: s => { s.maxHp += 16; s.hp += 16; } },
    { id: 'd_armor', cat: 'defense', tier: 'minor', name: 'Bolt-on Guard', ic: '🔩',
      desc: 'Take 6% less damage.', apply: s => { s.dmgReduce = Math.min(0.7, (s.dmgReduce || 0) + 0.06); } },
    { id: 'd_shield', cat: 'defense', tier: 'minor', name: 'Spare Capacitor', ic: '🔷',
      desc: '+16 shield (+12 cap).', apply: s => { s.shieldMax += 12; s.shield = Math.min(s.shieldMax, s.shield + 16); } },
    { id: 'd_regen', cat: 'defense', tier: 'minor', name: 'Nano-Repair', ic: '🔧',
      desc: '+5 HP repaired each turn.', apply: s => { s.repairPerTurn += 5; } },
    { id: 'd_knock', cat: 'defense', tier: 'minor', name: 'Ballast', ic: '⚓',
      desc: '+20% knockback resist.', apply: s => { s.knockResist = Math.min(0.9, s.knockResist + 0.20); } },

    // ===================== MOBILITY ⚡ =====================
    { id: 'm_airjump', cat: 'mobility', tier: 'major', name: 'Jet Boots', ic: '🚀', vis: 'jet',
      desc: '+1 extra air-jump.', apply: s => { s.maxAirJumps += 1; } },
    { id: 'm_rocket', cat: 'mobility', tier: 'major', name: 'Overdrive', ic: '🏎️', vis: 'jet',
      desc: 'Much faster run & higher jump.', apply: s => { s.runSpeed += 1.4; s.jumpV += 1.6; } },
    { id: 'm_feather', cat: 'mobility', tier: 'major', name: 'Featherfall', ic: '🪂', vis: 'fin',
      desc: 'Float down slowly, +air-jump.', apply: s => { s.fallMul *= 0.74; s.maxAirJumps += 1; } },
    { id: 'm_speed', cat: 'mobility', tier: 'minor', name: 'Light Alloy', ic: '🪶',
      desc: '+0.8 run speed.', apply: s => { s.runSpeed += 0.8; } },
    { id: 'm_jump', cat: 'mobility', tier: 'minor', name: 'Spring Legs', ic: '🦿',
      desc: '+1.1 jump height.', apply: s => { s.jumpV += 1.1; } },
    { id: 'm_glide', cat: 'mobility', tier: 'minor', name: 'Gecko Grips', ic: '🦎',
      desc: 'Slower wall-slide & fall.', apply: s => { s.wallSlideSpeed = Math.max(1.3, s.wallSlideSpeed - 0.6); s.fallMul *= 0.92; s.gripFall = Math.min(0.95, s.gripFall + 0.4); } },

    // ===================== UTILITY 🎯 =====================
    { id: 'u_thorns', cat: 'utility', tier: 'major', name: 'Thornback', ic: '🌵', vis: 'spike',
      desc: 'Reflect 25% & +knock resist.', apply: s => { s.reflectPct = Math.min(0.9, s.reflectPct + 0.25); s.knockResist = Math.min(0.9, s.knockResist + 0.25); } },
    { id: 'u_lifewell', cat: 'utility', tier: 'major', name: 'Life Well', ic: '⛲', vis: 'pod',
      desc: '+10 HP & +10 shield each turn.', apply: s => { s.repairPerTurn += 10; s.shieldMax += 8; s.shieldRegen += 10; } },
    { id: 'u_windnull', cat: 'utility', tier: 'major', name: 'Gyro Stabilizer', ic: '🌀', vis: 'fin',
      desc: 'Negate almost all wind.', apply: s => { s.windResist = Math.min(0.95, s.windResist + 0.7); } },
    { id: 'u_wind', cat: 'utility', tier: 'minor', name: 'Tail Fins', ic: '🪁',
      desc: '+20% wind resistance.', apply: s => { s.windResist = Math.min(0.95, s.windResist + 0.20); } },
    { id: 'u_softland', cat: 'utility', tier: 'minor', name: 'Crash Foam', ic: '🫧',
      desc: '-45% fall damage.', apply: s => { s.gripFall = Math.min(0.95, s.gripFall + 0.45); } },
    { id: 'u_reflect', cat: 'utility', tier: 'minor', name: 'Static Coat', ic: '⚡',
      desc: 'Reflect 8% of damage taken.', apply: s => { s.reflectPct = Math.min(0.9, s.reflectPct + 0.08); } },
  ];

  GB.UPGRADES = U;
  GB.UP_BY_ID = {};
  U.forEach(u => (GB.UP_BY_ID[u.id] = u));
  GB.MAJOR_UPGRADES = U.filter(u => u.tier === 'major');
  GB.MINOR_UPGRADES = U.filter(u => u.tier === 'minor');
  GB.MEGA_UPGRADES = GB.MAJOR_UPGRADES;   // back-compat alias

  GB.CATEGORIES = ['weapon', 'defense', 'mobility', 'utility'];
  GB.CAT_ICON = { weapon: '⚔️', defense: '🛡️', mobility: '⚡', utility: '🎯' };
  GB.CAT_NAME = { weapon: 'WEAPON', defense: 'DEFENSE', mobility: 'MOBILITY', utility: 'UTILITY' };
  GB.RARITIES = ['common', 'rare', 'legendary'];

  // 3 upgrade choices for a loot box of (category, rarity)
  GB.lootChoices = function (cat, rarity) {
    const pool = U.filter(u => u.cat === cat);
    const minors = pool.filter(u => u.tier === 'minor');
    const majors = pool.filter(u => u.tier === 'major');
    let picks;
    if (rarity === 'legendary') picks = GB.sample(majors.length >= 3 ? majors : pool, 3);
    else if (rarity === 'rare') {
      const a = GB.sample(majors, Math.min(2, majors.length));
      const b = GB.sample(minors.filter(m => true), Math.max(0, 3 - a.length));
      picks = GB.shuffle(a.concat(b)).slice(0, 3);
      if (picks.length < 3) picks = GB.sample(pool, 3);
    } else picks = GB.sample(minors.length >= 3 ? minors : pool, 3);
    return picks;
  };

  // ---------- COMBOS ----------
  const COMBOS = [
    { id: 'ricochet_storm', need: ['bounce', 'cluster'], name: 'RICOCHET STORM', blurb: 'Bomblets inherit the bounce — shrapnel pinballs everywhere.' },
    { id: 'cluster_buster', need: ['mortar', 'cluster'], name: 'CLUSTER BUSTER', blurb: 'Heavy mortar that carpets the area in bomblets.' },
    { id: 'seeker_swarm', need: ['homing', 'spread'], name: 'SEEKER SWARM', blurb: 'Every shell in the fan hunts the enemy.' },
    { id: 'smart_cluster', need: ['homing', 'cluster'], name: 'SMART CLUSTER', blurb: 'Bomblets steer toward the target.' },
    { id: 'fortress', need: ['armor', 'shield'], name: 'FORTRESS', blurb: 'Dome + plating: nothing gets through.' },
    { id: 'thornback', need: ['reflect', 'shield'], name: 'THORNBACK', blurb: 'The dome reflects punishment while it soaks the blow.' },
    { id: 'skyfall', need: ['spread', 'cluster'], name: 'SKYFALL', blurb: 'A fan of clusters blankets the battlefield.' },
    { id: 'firestorm', need: ['napalm', 'cluster'], name: 'FIRESTORM', blurb: 'Fiery bomblets — a sea of flame.' },
    { id: 'flak_cannon', need: ['shrapnel', 'spread'], name: 'FLAK CANNON', blurb: 'A wall of shells, each spraying shrapnel.' },
    { id: 'vampire_siege', need: ['lifesteal', 'bigshell'], name: 'VAMPIRE SIEGE', blurb: 'Colossal rounds that heal you for a fortune.' },
    { id: 'core_breach', need: ['pierce', 'napalm'], name: 'CORE BREACH', blurb: 'Drill deep, then erupt in flame from within.' },
  ];
  GB.COMBO_DEFS = COMBOS;
  GB.activeCombos = function (ids) { const have = new Set(ids); return COMBOS.filter(c => c.need.every(n => have.has(n))); };
  GB.comboIfAdded = function (ids, cand) {
    const before = new Set(GB.activeCombos(ids).map(c => c.id));
    return GB.activeCombos(ids.concat([cand])).find(c => !before.has(c.id)) || null;
  };

  // ---------- ENEMIES / BOSSES (single-player) ----------
  GB.ARCHES = [
    { id: 'grunt', name: 'Rustbucket', accent: '#ff8c42', face: '>:(', hp: 80, accuracy: 0.62, aggression: 0.7, mods: {}, blurb: 'Aggressive bruiser.' },
    { id: 'turtle', name: 'Bunker', accent: '#4ea83f', face: '-_-', hp: 120, accuracy: 0.7, aggression: 0.15, mods: { armor: true }, blurb: 'Tanky and patient.' },
    { id: 'sniper', name: 'Longshot', accent: '#42c6ff', face: '·_·', hp: 65, accuracy: 0.9, aggression: 0.2, mods: { windNeg: true }, blurb: 'Deadly from afar.' },
    { id: 'erratic', name: 'Sparks', accent: '#c77dff', face: 'O_O', hp: 75, accuracy: 0.52, aggression: 0.5, mods: { bounce: true }, blurb: 'Unpredictable & bouncy.' },
  ];
  GB.BOSSES = [
    { id: 'bigbertha', name: 'BIG BERTHA', accent: '#ff5a3c', face: 'ಠ_ಠ', hp: 240, accuracy: 0.82, aggression: 0.2, mods: { mortar: true, cluster: true }, scale: 1.5, special: 'barrage', blurb: 'Clustered mortar barrages.' },
    { id: 'mirrorlord', name: 'MIRROR LORD', accent: '#42c6ff', face: '◣_◢', hp: 210, accuracy: 0.85, aggression: 0.3, mods: { shield: true, homing: true }, scale: 1.4, special: 'reflect', blurb: 'Shielded, reflective, homing.' },
    { id: 'hailstorm', name: 'HAILSTORM', accent: '#c77dff', face: 'ψ_ψ', hp: 220, accuracy: 0.8, aggression: 0.45, mods: { spread: 2, bounce: true }, scale: 1.45, special: 'rain', blurb: 'Bouncing spread + sky rain.' },
  ];

  // ---------- MILESTONES / META (single-player) ----------
  GB.MILESTONES = [
    { id: 'm_firstwin', name: 'First Blood', desc: 'Win your first round.', check: c => c.win, reward: { xp: 40, passive: 'tough' } },
    { id: 'm_round5', name: 'Survivor', desc: 'Reach round 5.', check: c => c.round >= 5, reward: { xp: 60, passive: 'spry' } },
    { id: 'm_flawless', name: 'Untouchable', desc: 'Win a round undamaged.', check: c => c.win && c.flawless, reward: { xp: 70, passive: 'aegis' } },
    { id: 'm_combo', name: 'Mad Scientist', desc: 'Trigger an upgrade combo.', check: c => c.comboTriggered, reward: { xp: 80, passive: 'quickdraw' } },
    { id: 'm_round10', name: 'Veteran', desc: 'Reach round 10.', check: c => c.round >= 10, reward: { xp: 120, passive: 'reactor' } },
    { id: 'm_boss', name: 'Giant Slayer', desc: 'Defeat a boss.', check: c => c.win && c.wasBoss, reward: { xp: 150, passive: 'nimble' } },
  ];
  GB.PASSIVES = {
    tough: { name: 'Reinforced Frame', desc: '+15% starting max HP.', apply: s => { const b = Math.round(s.maxHp * 0.15); s.maxHp += b; s.hp += b; } },
    spry: { name: 'Light Chassis', desc: '+0.6 run speed.', apply: s => { s.runSpeed += 0.6; } },
    aegis: { name: 'Starter Dome', desc: 'Start with a 25 HP shield.', apply: s => { s.shieldMax += 25; s.shield += 25; } },
    quickdraw: { name: 'Quickdraw Servos', desc: 'Charge 25% faster.', apply: s => { s.chargeRate *= 1.25; } },
    reactor: { name: 'Overclocked Reactor', desc: '+1.2 max shot power.', apply: s => { s.powerMax += 1.2; } },
    nimble: { name: 'Nimble Frame', desc: '+1 air-jump.', apply: s => { s.maxAirJumps += 1; } },
  };

  GB.xpForLevel = lvl => 80 + (lvl - 1) * 90;
  GB.driverLevelFromXp = function (xp) {
    let lvl = 1, need = GB.xpForLevel(1), acc = 0;
    while (xp >= acc + need) { acc += need; lvl++; need = GB.xpForLevel(lvl); }
    return { level: lvl, into: xp - acc, need };
  };
  GB.applyDriverBonuses = function (s, level) {
    s.maxHp += (level - 1) * 4; s.hp = s.maxHp;
    if (level >= 2) s.runSpeed += 0.3;
    if (level >= 3) s.dmgMul *= 1.06;
    if (level >= 4) { s.shieldMax += 15; s.shield += 15; }
    if (level >= 5) s.powerMax += 0.6;
    return s;
  };

})(window.GB);
