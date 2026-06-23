/* ============================================================
   GUNBALD — data.js
   Content: MEGA upgrades (weapons + major systems), MINOR
   upgrades (small per-turn stat tweaks), combos, enemy
   archetypes, bosses, milestones, driver meta.
   Weapon upgrades are FLAGS on splonk.mods so combos emerge.
   ============================================================ */
(function (GB) {
  'use strict';

  // ============================================================
  //  MEGA UPGRADES  — new weapons / weapon additions / big systems
  //  (offered in the opening pick and every 5th turn)
  // ============================================================
  const MEGA = [
    { id: 'spread', name: 'Spread Shot', cat: 'weapon', ic: '🔱', vis: 'barrel',
      desc: 'Fire a fan of 3 shells (+2 per stack).',
      apply: s => { s.mods.spread = (s.mods.spread || 0) + 1; s.dmgMul *= 0.85; } },
    { id: 'bounce', name: 'Bouncing Shells', cat: 'weapon', ic: '🪀', vis: 'barrel',
      desc: 'Shells ricochet off terrain before they blow.',
      apply: s => { s.mods.bounce = true; s.bounceCount = (s.bounceCount || 0) + 2; } },
    { id: 'cluster', name: 'Cluster Bomb', cat: 'weapon', ic: '💣', vis: 'pod',
      desc: 'Explosions split into scattering bomblets.',
      apply: s => { s.mods.cluster = true; s.clusterCount = (s.clusterCount || 0) + 4; } },
    { id: 'homing', name: 'Homing Missile', cat: 'weapon', ic: '🎯', vis: 'fin',
      desc: 'Shells steer toward the enemy in flight.',
      apply: s => { s.mods.homing = true; s.homingStr = (s.homingStr || 0) + 0.04; } },
    { id: 'mortar', name: 'Mortar Arc', cat: 'weapon', ic: '☄️', vis: 'barrel',
      desc: 'Heavier shell, bigger crater, +damage.',
      apply: s => { s.mods.mortar = true; s.dmgMul *= 1.3; s.blastMul *= 1.25; } },
    { id: 'pierce', name: 'Drill Shells', cat: 'weapon', ic: '🪛', vis: 'fin',
      desc: 'Shells burrow through terrain, then blow deep.',
      apply: s => { s.mods.pierce = true; s.pierceDist = (s.pierceDist || 0) + 38; s.blastMul *= 1.12; } },
    { id: 'shrapnel', name: 'Shrapnel Burst', cat: 'weapon', ic: '✳️', vis: 'spike',
      desc: 'Blasts spray fast horizontal shrapnel.',
      apply: s => { s.mods.shrapnel = true; s.shrapnelCount = (s.shrapnelCount || 0) + 5; } },
    { id: 'napalm', name: 'Napalm Payload', cat: 'weapon', ic: '🔥', vis: 'pod',
      desc: 'A much larger fiery blast, +damage.',
      apply: s => { s.mods.napalm = true; s.dmgMul *= 1.2; s.blastMul *= 1.5; } },
    { id: 'bigshell', name: 'Siege Shell', cat: 'weapon', ic: '🛢️', vis: 'barrel',
      desc: 'A monster round: +55% damage, +30% blast.',
      apply: s => { s.dmgMul *= 1.55; s.blastMul *= 1.3; } },
    { id: 'lifesteal', name: 'Vampiric Rounds', cat: 'weapon', ic: '🧛', vis: 'pod',
      desc: 'Heal for 30% of the damage your shells deal.',
      apply: s => { s.lifesteal = (s.lifesteal || 0) + 0.30; } },
    { id: 'armor', name: 'Armor Plating', cat: 'defense', ic: '🛡️', vis: 'plate',
      desc: '+30 max HP and shrug off 12% of all damage.',
      apply: s => { s.maxHp += 30; s.hp += 30; s.dmgReduce = Math.min(0.6, (s.dmgReduce || 0) + 0.12); } },
    { id: 'shield', name: 'Shield Dome', cat: 'defense', ic: '🔵', vis: 'dome',
      desc: 'A regenerating energy dome soaks damage.',
      apply: s => { s.shieldMax += 35; s.shield = s.shieldMax; s.shieldRegen += 12; } },
    { id: 'reflect', name: 'Damage Reflect', cat: 'defense', ic: '↩️', vis: 'spike',
      desc: 'Return 30% of damage you take to the attacker.',
      apply: s => { s.reflectPct = Math.min(0.9, s.reflectPct + 0.30); } },
    { id: 'heavyframe', name: 'Reinforced Hull', cat: 'defense', ic: '🏗️', vis: 'plate',
      desc: '+55 max HP, repaired instantly.',
      apply: s => { s.maxHp += 55; s.hp += 55; } },
    { id: 'booster', name: 'Booster Rig', cat: 'mobility', ic: '🚀', vis: 'jet',
      desc: '+40 energy and 20% cheaper movement.',
      apply: s => { s.maxEnergy += 40; s.energy += 40; s.moveCost *= 0.8; } },
  ];

  // ============================================================
  //  MINOR UPGRADES — small per-turn tweaks, each a DISTINCT effect
  // ============================================================
  const MINOR = [
    { id: 'n_heal', name: 'Patch Kit', cat: 'minor', ic: '🩹', desc: 'Repair 18 HP right now.',
      apply: s => { s.hp = Math.min(s.maxHp, s.hp + 18); } },
    { id: 'n_maxhp', name: 'Plating Scrap', cat: 'minor', ic: '🧱', desc: '+14 max HP (and heal it).',
      apply: s => { s.maxHp += 14; s.hp += 14; } },
    { id: 'n_dmg', name: 'Sharpened Slugs', cat: 'minor', ic: '🔪', desc: '+8% shell damage.',
      apply: s => { s.dmgMul *= 1.08; } },
    { id: 'n_energy', name: 'Fuel Cell', cat: 'minor', ic: '🔋', desc: '+15 max energy.',
      apply: s => { s.maxEnergy += 15; s.energy += 15; } },
    { id: 'n_power', name: 'Pressure Valve', cat: 'minor', ic: '🎚️', desc: '+0.6 max shot power.',
      apply: s => { s.powerMax += 0.6; } },
    { id: 'n_charge', name: 'Servo Tune', cat: 'minor', ic: '⏩', desc: 'Charge 12% faster.',
      apply: s => { s.chargeRate *= 1.12; } },
    { id: 'n_armor', name: 'Bolt-on Guard', cat: 'minor', ic: '🛡️', desc: 'Take 6% less damage.',
      apply: s => { s.dmgReduce = Math.min(0.7, (s.dmgReduce || 0) + 0.06); } },
    { id: 'n_shield', name: 'Spare Capacitor', cat: 'minor', ic: '🔷', desc: '+14 shield (+10 cap).',
      apply: s => { s.shieldMax += 10; s.shield = Math.min(s.shieldMax, s.shield + 14); } },
    { id: 'n_wind', name: 'Tail Fins', cat: 'minor', ic: '🪁', desc: '+18% wind resistance.',
      apply: s => { s.windResist = Math.min(0.95, s.windResist + 0.18); } },
    { id: 'n_blast', name: 'Bigger Payload', cat: 'minor', ic: '💥', desc: '+9% blast radius.',
      apply: s => { s.blastMul *= 1.09; } },
    { id: 'n_knock', name: 'Ballast', cat: 'minor', ic: '⚓', desc: '+18% knockback resist.',
      apply: s => { s.knockResist = Math.min(0.9, s.knockResist + 0.18); } },
    { id: 'n_regen', name: 'Nano-Repair', cat: 'minor', ic: '🔧', desc: '+4 HP repaired each turn.',
      apply: s => { s.repairPerTurn += 4; } },
    { id: 'n_grip', name: 'Gecko Treads', cat: 'minor', ic: '🦎', desc: '-35% fall damage.',
      apply: s => { s.gripFall = Math.min(0.95, s.gripFall + 0.35); } },
    { id: 'n_move', name: 'Light Alloy', cat: 'minor', ic: '🪶', desc: 'Movement costs 12% less.',
      apply: s => { s.moveCost *= 0.88; } },
    { id: 'n_sregen', name: 'Dome Recharger', cat: 'minor', ic: '🔵', desc: '+6 shield restored each turn.',
      apply: s => { s.shieldMax += 6; s.shieldRegen += 6; } },
    { id: 'n_reflect', name: 'Static Coat', cat: 'minor', ic: '⚡', desc: 'Reflect 8% of damage taken.',
      apply: s => { s.reflectPct = Math.min(0.9, s.reflectPct + 0.08); } },
  ];

  GB.MEGA_UPGRADES = MEGA;
  GB.MINOR_UPGRADES = MINOR;
  GB.UPGRADES = MEGA;            // back-compat alias (the "big" ones)
  GB.UP_BY_ID = {};
  MEGA.concat(MINOR).forEach(u => (GB.UP_BY_ID[u.id] = u));

  // ============================================================
  //  COMBOS (emergent, named for discovery — mega ids only)
  // ============================================================
  const COMBOS = [
    { id: 'ricochet_storm', need: ['bounce', 'cluster'], name: 'RICOCHET STORM',
      blurb: 'Cluster bomblets inherit the bounce — shrapnel pinballs everywhere.' },
    { id: 'cluster_buster', need: ['mortar', 'cluster'], name: 'CLUSTER BUSTER',
      blurb: 'A heavy mortar that craters then carpets the area in bomblets.' },
    { id: 'seeker_swarm', need: ['homing', 'spread'], name: 'SEEKER SWARM',
      blurb: 'Every shell in the fan independently hunts the enemy.' },
    { id: 'smart_cluster', need: ['homing', 'cluster'], name: 'SMART CLUSTER',
      blurb: 'Bomblets steer toward the target as they rain down.' },
    { id: 'fortress', need: ['armor', 'shield'], name: 'FORTRESS',
      blurb: 'Dome + plating: almost nothing reaches your frame.' },
    { id: 'thornback', need: ['reflect', 'shield'], name: 'THORNBACK',
      blurb: 'The dome reflects punishment while it soaks the blow.' },
    { id: 'skyfall', need: ['spread', 'cluster'], name: 'SKYFALL',
      blurb: 'A fan of clusters blankets the battlefield in fire.' },
    { id: 'firestorm', need: ['napalm', 'cluster'], name: 'FIRESTORM',
      blurb: 'Fiery bomblets turn the whole field into a sea of flame.' },
    { id: 'flak_cannon', need: ['shrapnel', 'spread'], name: 'FLAK CANNON',
      blurb: 'A wall of shells, each spraying shrapnel.' },
    { id: 'vampire_siege', need: ['lifesteal', 'bigshell'], name: 'VAMPIRE SIEGE',
      blurb: 'Colossal rounds that heal you for a fortune on impact.' },
    { id: 'core_breach', need: ['pierce', 'napalm'], name: 'CORE BREACH',
      blurb: 'Drill deep into cover, then erupt in flame from within.' },
  ];
  GB.COMBO_DEFS = COMBOS;

  GB.activeCombos = function (ownedIds) {
    const have = new Set(ownedIds);
    return COMBOS.filter(c => c.need.every(n => have.has(n)));
  };
  GB.comboIfAdded = function (ownedIds, candidate) {
    const before = new Set(GB.activeCombos(ownedIds).map(c => c.id));
    const after = GB.activeCombos(ownedIds.concat([candidate]));
    return after.find(c => !before.has(c.id)) || null;
  };

  // ============================================================
  //  ENEMY ARCHETYPES
  // ============================================================
  const ARCHES = [
    { id: 'grunt',  name: 'Rustbucket', accent: '#ff8c42', face: '>:(',
      hp: 75, accuracy: 0.62, aggression: 0.7, mods: {}, blurb: 'Aggressive. Closes distance and lobs steadily.' },
    { id: 'turtle', name: 'Bunker',     accent: '#4ea83f', face: '-_-',
      hp: 115, accuracy: 0.7, aggression: 0.1, mods: { armor: true }, blurb: 'Defensive. Tanky, rarely moves, plays the long game.' },
    { id: 'sniper', name: 'Longshot',   accent: '#42c6ff', face: '·_·',
      hp: 60, accuracy: 0.9, aggression: 0.2, mods: { windNeg: true }, blurb: 'Deadly accurate from afar. Fragile up close.' },
    { id: 'erratic',name: 'Sparks',     accent: '#c77dff', face: 'O_O',
      hp: 70, accuracy: 0.5, aggression: 0.5, mods: { bounce: true }, blurb: 'Unpredictable. Bouncing shells, jittery aim.' },
  ];
  GB.ARCHES = ARCHES;

  // ============================================================
  //  BOSSES (every 5 rounds)
  // ============================================================
  const BOSSES = [
    { id: 'bigbertha', name: 'BIG BERTHA', accent: '#ff5a3c', face: 'ಠ_ಠ',
      hp: 230, accuracy: 0.82, aggression: 0.2, mods: { mortar: true, cluster: true }, scale: 1.5,
      special: 'barrage', blurb: 'Lobs clustered mortars. Periodic 3-shot BARRAGE.' },
    { id: 'mirrorlord', name: 'MIRROR LORD', accent: '#42c6ff', face: '◣_◢',
      hp: 200, accuracy: 0.85, aggression: 0.3, mods: { shield: true, homing: true }, scale: 1.4,
      special: 'reflect', blurb: 'Shielded & reflective. Homing shots. Punishes greed.' },
    { id: 'hailstorm', name: 'HAILSTORM', accent: '#c77dff', face: 'ψ_ψ',
      hp: 215, accuracy: 0.8, aggression: 0.45, mods: { spread: 2, bounce: true }, scale: 1.45,
      special: 'rain', blurb: 'Bouncing spread shots. Unleashes a SKY RAIN special.' },
  ];
  GB.BOSSES = BOSSES;

  // ============================================================
  //  MILESTONES
  // ============================================================
  const MILESTONES = [
    { id: 'm_firstwin', name: 'First Blood', desc: 'Win your first round.',
      check: c => c.win, reward: { xp: 40, passive: 'tough' } },
    { id: 'm_round5', name: 'Survivor', desc: 'Reach round 5.',
      check: c => c.round >= 5, reward: { xp: 60, passive: 'spry' } },
    { id: 'm_flawless', name: 'Untouchable', desc: 'Win a round without taking damage.',
      check: c => c.win && c.flawless, reward: { xp: 70, passive: 'aegis' } },
    { id: 'm_combo', name: 'Mad Scientist', desc: 'Trigger an upgrade combo.',
      check: c => c.comboTriggered, reward: { xp: 80, passive: 'quickdraw' } },
    { id: 'm_round10', name: 'Veteran', desc: 'Reach round 10.',
      check: c => c.round >= 10, reward: { xp: 120, passive: 'reactor' } },
    { id: 'm_boss', name: 'Giant Slayer', desc: 'Defeat a boss.',
      check: c => c.win && c.wasBoss, reward: { xp: 150, passive: 'salvage' } },
  ];
  GB.MILESTONES = MILESTONES;

  // ============================================================
  //  META PASSIVES (granted by milestones; applied at run start)
  // ============================================================
  const PASSIVES = {
    tough:    { name: 'Reinforced Frame', desc: '+15% starting max HP.', apply: s => { const b = Math.round(s.maxHp * 0.15); s.maxHp += b; s.hp += b; } },
    spry:     { name: 'Light Chassis', desc: '+25 starting energy.', apply: s => { s.maxEnergy += 25; s.energy += 25; } },
    aegis:    { name: 'Starter Dome', desc: 'Begin each run with a 25 HP shield.', apply: s => { s.shieldMax += 25; s.shield += 25; } },
    quickdraw:{ name: 'Quickdraw Servos', desc: 'Charge power 25% faster.', apply: s => { s.chargeRate *= 1.25; } },
    reactor:  { name: 'Overclocked Reactor', desc: '+1.2 max shot power.', apply: s => { s.powerMax += 1.2; } },
    salvage:  { name: 'Field Salvage', desc: '+1 mega-upgrade option to choose from.', apply: s => { s.extraPick = (s.extraPick || 0) + 1; } },
  };
  GB.PASSIVES = PASSIVES;

  // ============================================================
  //  DRIVER LEVEL
  // ============================================================
  GB.xpForLevel = lvl => 80 + (lvl - 1) * 90;
  GB.driverLevelFromXp = function (xp) {
    let lvl = 1, need = GB.xpForLevel(1), acc = 0;
    while (xp >= acc + need) { acc += need; lvl++; need = GB.xpForLevel(lvl); }
    return { level: lvl, into: xp - acc, need };
  };
  GB.applyDriverBonuses = function (s, level) {
    s.maxHp += (level - 1) * 4;
    s.hp = s.maxHp;
    if (level >= 2) { s.maxEnergy += 10; s.energy += 10; }
    if (level >= 3) { s.dmgMul *= 1.06; }
    if (level >= 4) { s.shieldMax += 15; s.shield += 15; }
    if (level >= 5) { s.powerMax += 0.6; }
    return s;
  };

})(window.GB);
