/* ============================================================
   GUNBALD — ui.js
   Canvas HUD (bars, wind, charge cone, aim arc, banners) +
   HTML panel management (menu / upgrades / garage / gameover).
   ============================================================ */
(function (GB) {
  'use strict';
  const { M } = GB;

  const el = id => document.getElementById(id);

  // which passives are unlocked given a save (via completed milestones)
  GB.unlockedPassives = function (save) {
    const set = {};
    GB.MILESTONES.forEach(m => {
      if (save.milestones[m.id] && m.reward && m.reward.passive) set[m.reward.passive] = true;
    });
    return set;
  };

  const UI = {
    // ---------------------------------------------------------
    //  CANVAS HUD
    // ---------------------------------------------------------
    drawWorldBars(ctx, s, time) {
      if (!s) return;
      const x = s.x, y = s.y - 70 * s.scale;
      const w = 64, h = 8;
      // name
      ctx.font = '700 14px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(26,16,48,.85)';
      ctx.strokeText(s.name, x, y - 12);
      ctx.fillStyle = s.dead ? '#888' : (s.isPlayer ? '#ffe27a' : '#fff');
      ctx.fillText(s.name, x, y - 12);

      // hp back
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      GB.roundRect(ctx, x - w / 2 - 2, y - 2, w + 4, h + 4, 5); ctx.fill();
      // hp fill
      const hpFrac = M.clamp(s.hp / s.maxHp, 0, 1);
      const col = hpFrac > 0.5 ? '#6fcf57' : hpFrac > 0.25 ? '#ffcf3f' : '#ff5a3c';
      ctx.fillStyle = col;
      GB.roundRect(ctx, x - w / 2, y, w * hpFrac, h, 4); ctx.fill();
      // hp text
      ctx.font = '900 10px Trebuchet MS, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(Math.ceil(s.hp) + '/' + s.maxHp, x, y + h + 8);

      // shield bar
      if (s.shieldMax > 0) {
        const sy = y + h + 12;
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        GB.roundRect(ctx, x - w / 2 - 1, sy - 1, w + 2, 5, 3); ctx.fill();
        ctx.fillStyle = '#42c6ff';
        GB.roundRect(ctx, x - w / 2, sy, w * M.clamp(s.shield / s.shieldMax, 0, 1), 3, 2); ctx.fill();
      }

      // energy bar (player only, on its turn)
      if (s.isPlayer) {
        const ey = y + h + (s.shieldMax > 0 ? 18 : 12);
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        GB.roundRect(ctx, x - w / 2 - 1, ey - 1, w + 2, 5, 3); ctx.fill();
        ctx.fillStyle = '#b98bff';
        GB.roundRect(ctx, x - w / 2, ey, w * M.clamp(s.energy / s.maxEnergy, 0, 1), 3, 2); ctx.fill();
      }
      ctx.textAlign = 'left';
    },

    // short SOLID orientation arrow (just shows facing — NOT a trajectory predictor)
    drawAimIndicator(ctx, s) {
      const tip = s.barrelTip();
      const v = s.aimVec();
      const x0 = tip.x + v.x * 6, y0 = tip.y + v.y * 6;
      const x1 = tip.x + v.x * 34, y1 = tip.y + v.y * 34;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const ang = Math.atan2(v.y, v.x);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.moveTo(x1 + v.x * 6, y1 + v.y * 6);
      ctx.lineTo(x1 - Math.cos(ang - 0.5) * 9, y1 - Math.sin(ang - 0.5) * 9);
      ctx.lineTo(x1 - Math.cos(ang + 0.5) * 9, y1 - Math.sin(ang + 0.5) * 9);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    },

    // THE charge cone — grows + spreads + reddens with charge
    drawChargeCone(ctx, s, charge, time) {
      const t = M.clamp(charge, 0, 1);
      const tip = s.barrelTip();
      const v = s.aimVec();
      const baseAng = Math.atan2(v.y, v.x);
      const L = 30 + t * 215;                 // length grows with charge
      const halfW = M.deg2rad(8 + t * 16);    // spreads out as it grows
      // color: yellow -> orange -> deep red as it grows
      const col = t < 0.5
        ? GB.mix([255, 214, 70], [255, 120, 36], t / 0.5)
        : GB.mix([255, 120, 36], [230, 32, 24], (t - 0.5) / 0.5);
      const pulse = 0.5 + 0.5 * Math.sin(time * 16);

      function conePath(len, hw) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(hw) * len, Math.sin(hw) * len);
        ctx.quadraticCurveTo(len * 1.05, 0, Math.cos(-hw) * len, Math.sin(-hw) * len);
        ctx.closePath();
      }

      ctx.save();
      ctx.translate(tip.x, tip.y);
      ctx.rotate(baseAng);

      // 1) solid tinted cone (source-over) — so the RED reads as red over bright sky
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, GB.rgba(col[0], col[1], col[2], 0.55 + t * 0.30));
      g.addColorStop(0.55, GB.rgba(col[0], col[1], col[2], 0.30 + t * 0.30));
      g.addColorStop(1, GB.rgba(col[0], col[1] * 0.6, col[2] * 0.5, 0));
      ctx.fillStyle = g;
      conePath(L, halfW); ctx.fill();

      // edge highlight
      ctx.strokeStyle = GB.rgba(col[0], col[1], col[2], 0.4 + t * 0.4);
      ctx.lineWidth = 2; ctx.lineJoin = 'round';
      conePath(L, halfW); ctx.stroke();

      // 2) additive hot core glow
      ctx.globalCompositeOperation = 'lighter';
      const cg = ctx.createLinearGradient(0, 0, L * 0.8, 0);
      cg.addColorStop(0, GB.rgba(255, 244, 210, (0.5 + t * 0.35) * (0.7 + pulse * 0.3)));
      cg.addColorStop(1, GB.rgba(col[0], col[1], col[2], 0));
      ctx.fillStyle = cg;
      conePath(L * 0.72, halfW * 0.55); ctx.fill();
      // bright center line
      ctx.strokeStyle = GB.rgba(255, 250, 230, 0.45 + t * 0.45);
      ctx.lineWidth = 2 + t * 2.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.88, 0); ctx.stroke();
      ctx.restore();

      // ---- gray reference cone of the LAST shot's charge ----
      // same conePath geometry => it overlaps the live cone exactly when t === lastCharge
      if (s.lastCharge > 0.02) {
        const tL = M.clamp(s.lastCharge, 0, 1);
        const Ll = 30 + tL * 215;
        const hwl = M.deg2rad(8 + tL * 16);
        ctx.save();
        ctx.translate(tip.x, tip.y);
        ctx.rotate(baseAng);
        ctx.lineJoin = 'round';
        ctx.setLineDash([7, 5]);
        // dark backing then light gray, so it reads over both bright sky and the live cone
        ctx.strokeStyle = 'rgba(35,35,50,0.5)';
        ctx.lineWidth = 4.5;
        conePath(Ll, hwl); ctx.stroke();
        ctx.strokeStyle = 'rgba(228,228,238,0.92)';
        ctx.lineWidth = 2;
        conePath(Ll, hwl); ctx.stroke();
        ctx.setLineDash([]);
        // tiny "LAST" tag at the cap
        ctx.fillStyle = 'rgba(228,228,238,0.95)';
        ctx.font = '900 11px Trebuchet MS, sans-serif';
        ctx.textAlign = 'left';
        ctx.save();
        ctx.translate(Math.cos(hwl) * Ll, Math.sin(hwl) * Ll);
        ctx.rotate(-baseAng);   // keep text upright
        ctx.fillText('LAST', 4, 4);
        ctx.restore();
        ctx.restore();
      }

      // power number above the bot
      const pv = Math.round(t * 100);
      const px = s.x, py = s.y - 104 * s.scale;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 28px Trebuchet MS, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(26,16,48,.9)';
      ctx.strokeText(pv, px, py);
      ctx.fillStyle = GB.rgba(col[0], col[1], col[2], 1);
      ctx.fillText(pv, px, py);
      ctx.font = '900 10px Trebuchet MS, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.strokeText('POWER', px, py + 13); ctx.fillText('POWER', px, py + 13);
      ctx.restore();
      ctx.textAlign = 'left';
    },

    // compact angle arc gauge hugging the active bot
    drawAimArc(ctx, s) {
      const p = s.pivot();
      const r = 50 * s.scale;
      const f = s.facing;
      const ga = s.groundAngle || 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ga);   // gauge tilts with the slope -> arc shows the slope-relative range
      // arc from -10 to 90 deg on the facing side
      const a0 = M.deg2rad(-10), a1 = M.deg2rad(90);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath();
      if (f === 1) ctx.arc(0, 0, r, -a1, -a0);
      else ctx.arc(0, 0, r, Math.PI + a0, Math.PI + a1);
      ctx.stroke();
      // current aim tick (local / slope-relative direction)
      const aRad = M.deg2rad(s.aim);
      const lx = f * Math.cos(aRad), ly = -Math.sin(aRad);
      ctx.strokeStyle = '#6fcf57'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(lx * (r - 7), ly * (r - 7));
      ctx.lineTo(lx * (r + 6), ly * (r + 6));
      ctx.stroke();
      // angle text, kept upright
      ctx.save();
      ctx.translate(lx * (r + 24), ly * (r + 24));
      ctx.rotate(-ga);
      ctx.font = '900 13px Trebuchet MS, sans-serif';
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(26,16,48,.9)';
      ctx.strokeText(Math.round(s.aim) + '°', 0, 0);
      ctx.fillText(Math.round(s.aim) + '°', 0, 0);
      ctx.restore();
      ctx.restore();
      ctx.textAlign = 'left';
    },

    drawTopBar(ctx, game) {
      // wind indicator (top center)
      const cx = GB.W / 2, cy = 36;
      ctx.save();
      ctx.font = '900 16px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(26,16,48,.8)';
      ctx.strokeText('WIND', cx, cy - 18); ctx.fillText('WIND', cx, cy - 18);

      const wind = game.wind;
      const mag = M.clamp(Math.abs(wind) / 0.16, 0, 1);
      const dir = wind >= 0 ? 1 : -1;
      // bar
      const bw = 170, bh = 12;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      GB.roundRect(ctx, cx - bw / 2, cy - 6, bw, bh, 6); ctx.fill();
      const fillW = (bw / 2) * mag;
      ctx.fillStyle = mag > 0.66 ? '#ff5a3c' : mag > 0.33 ? '#ffcf3f' : '#9be7ff';
      if (dir > 0) { GB.roundRect(ctx, cx, cy - 6, fillW, bh, 6); }
      else { GB.roundRect(ctx, cx - fillW, cy - 6, fillW, bh, 6); }
      ctx.fill();
      // center post
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1.5, cy - 9, 3, bh + 6);
      // arrows
      ctx.fillStyle = '#fff';
      const ax = cx + dir * (fillW + 14);
      ctx.beginPath();
      ctx.moveTo(ax, cy); ctx.lineTo(ax - dir * 11, cy - 7); ctx.lineTo(ax - dir * 11, cy + 7);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      // round label (top-left)
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = '900 22px Trebuchet MS, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(26,16,48,.85)';
      const label = game.online ? ('VS ' + game.oppName)
        : (game.isBoss ? '★ BOSS — ' : 'ROUND ' + game.round + ' — ') + game.enemy.name;
      ctx.strokeText(label, 24, 36);
      ctx.fillStyle = (!game.online && game.isBoss) ? '#ff5a3c' : '#ffcf3f';
      ctx.fillText(label, 24, 36);
      ctx.restore();

      // top-right tag
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = '900 16px Trebuchet MS, sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(26,16,48,.85)';
      const dl = game.online ? 'ONLINE PvP' : ('DRIVER Lv.' + game.save.driverLevel);
      ctx.strokeText(dl, GB.W - 24, 32);
      ctx.fillStyle = '#9be7ff';
      ctx.fillText(dl, GB.W - 24, 32);
      ctx.restore();
    },

    drawBanner(ctx, game) {
      if (game.bannerTime <= 0 || !game.bannerText) return;
      const t = game.bannerTime;
      const appear = M.clamp((1.4 - t) / 0.25, 0, 1);   // slide in
      const leave = M.clamp(t / 0.25, 0, 1);            // fade out near end
      const a = Math.min(appear, leave);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      const y = GB.H * 0.32;
      ctx.font = '900 64px Trebuchet MS, sans-serif';
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(26,16,48,.9)';
      const slide = (1 - appear) * 60;
      ctx.strokeText(game.bannerText, GB.W / 2 + slide, y);
      ctx.fillStyle = game.bannerColor || '#ffcf3f';
      ctx.fillText(game.bannerText, GB.W / 2 + slide, y);
      if (game.bannerSub) {
        ctx.font = '700 22px Trebuchet MS, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.strokeText(game.bannerSub, GB.W / 2 + slide, y + 36);
        ctx.fillText(game.bannerSub, GB.W / 2 + slide, y + 36);
      }
      ctx.restore();
      ctx.textAlign = 'left';
    },

    drawControlsHint(ctx, game) {
      if (game.turn !== 'player' || (game.phase !== 'aim' && game.phase !== 'charging')) return;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 15px Trebuchet MS, sans-serif';
      ctx.globalAlpha = 0.85;
      const msg = game.charging
        ? 'release to FIRE'
        : 'A/D move  ·  W/S aim  ·  hold MOUSE to charge';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(26,16,48,.8)';
      ctx.strokeText(msg, GB.W / 2, GB.H - 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(msg, GB.W / 2, GB.H - 22);
      ctx.restore();
      ctx.textAlign = 'left';
    },

    // 15s shooting-turn countdown (top-center, under the wind gauge)
    drawTurnTimer(ctx, game) {
      if (game.turn !== 'player' || !(game.phase === 'aim' || game.phase === 'charging')) return;
      const t = Math.max(0, game.turnTimer || 0);
      const cx = GB.W / 2, cy = 78, r = 20;
      const frac = M.clamp(t / 15, 0, 1);
      const low = t <= 5;
      ctx.save();
      ctx.translate(cx, cy);
      // ring
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = low ? '#ff5a3c' : '#9be7ff';
      ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
      // number
      ctx.font = '900 20px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(26,16,48,.85)';
      const n = Math.ceil(t);
      ctx.strokeText(n, 0, 1);
      ctx.fillStyle = low ? '#ff5a3c' : '#fff';
      ctx.fillText(n, 0, 1);
      ctx.restore();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    },

    // coin-flip animation deciding who shoots first
    drawCoinflip(ctx, game) {
      const c = game.coin;
      const prog = c.t / c.dur;
      const freq = M.lerp(13, 2.5, prog);
      let lit;
      if (prog < 0.82) lit = (Math.floor(c.t * freq) % 2 === 0) ? game.player : game.enemy;
      else lit = c.result === 'player' ? game.player : game.enemy;
      // glow ring around the lit bot
      if (lit && !lit.dead) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.5 + 0.5 * Math.sin(game.time * 18);
        ctx.strokeStyle = GB.rgba(255, 220, 90, 0.5 + pulse * 0.4);
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(lit.x, lit.centerY(), 44 * lit.scale, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        // "1st" badge once settled
        if (prog >= 0.82) {
          ctx.save();
          ctx.font = '900 20px Trebuchet MS, sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(26,16,48,.9)';
          ctx.strokeText('1st!', lit.x, lit.y - 80 * lit.scale);
          ctx.fillStyle = '#ffcf3f';
          ctx.fillText('1st!', lit.x, lit.y - 80 * lit.scale);
          ctx.restore();
          ctx.textAlign = 'left';
        }
      }
      // headline
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 40px Trebuchet MS, sans-serif';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(26,16,48,.9)';
      const msg = prog < 0.82 ? 'WHO FIRES FIRST?'
        : (c.result === 'player' ? 'YOU FIRE FIRST!' : 'ENEMY FIRES FIRST');
      ctx.strokeText(msg, GB.W / 2, GB.H * 0.26);
      ctx.fillStyle = '#ffcf3f';
      ctx.fillText(msg, GB.W / 2, GB.H * 0.26);
      ctx.restore();
      ctx.textAlign = 'left';
    },

    // ---------------------------------------------------------
    //  HTML PANELS
    // ---------------------------------------------------------
    panels: ['menu', 'online', 'upgrade', 'garage', 'gameover'],
    hideAll() { this.panels.forEach(p => { const e = el(p); if (e) e.classList.add('hidden'); }); this.hidePick(); },
    show(id) { el(id).classList.remove('hidden'); },

    refreshMenu(save) {
      const d = GB.driverLevelFromXp(save.driverXp);
      const unlocked = Object.keys(GB.unlockedPassives(save)).length;
      el('meta-line').innerHTML =
        `Driver <b>Lv.${d.level}</b> · Best Round <b>${save.bestRound}</b> · ` +
        `Passives <b>${unlocked}/${GB.MILESTONES.filter(m => m.reward && m.reward.passive).length}</b> · Runs <b>${save.runs}</b>`;
    },

    // build cards into a container
    _buildCards(container, choices, ownedIds, onPick, compact, hintEl) {
      container.innerHTML = '';
      if (hintEl) hintEl.textContent = '';
      choices.forEach(u => {
        const combo = GB.comboIfAdded(ownedIds, u.id);
        const card = document.createElement('div');
        card.className = (compact ? 'tp-card' : 'up-card') + (combo ? ' combo-ready' : '');
        card.innerHTML =
          `<div class="cat">${u.cat}</div>` +
          `<div class="ic">${u.ic}</div>` +
          `<div class="nm">${u.name}</div>` +
          `<div class="ds">${u.desc}</div>` +
          (combo ? `<div class="combo-tag">⚡ ${combo.name}</div>` : '');
        if (hintEl) card.addEventListener('mouseenter', () => {
          hintEl.textContent = combo ? `COMBO → ${combo.name}: ${combo.blurb}` : '';
        });
        card.addEventListener('click', () => onPick(u.id));
        container.appendChild(card);
      });
    },

    // show a pick. pick = {kind:'minor'|'mega', isOpening, choices, timer}
    showPick(pick, ownedIds, onPick) {
      if (pick.isOpening) {
        // dramatic centered panel for the opening mega-pick
        el('upgrade-title').textContent = 'CHOOSE YOUR MEGA-UPGRADE';
        el('upgrade-note').textContent = '⏳ Your opponent is choosing too…';
        el('upgrade-timer').textContent = Math.ceil(pick.timer);
        this._buildCards(el('upgrade-cards'), pick.choices, ownedIds, onPick, false, el('combo-hint'));
        el('turnpick').classList.add('hidden');
        this.show('upgrade');
      } else {
        // compact bottom bar so the battle stays visible during the enemy turn
        el('turnpick-title').textContent = pick.kind === 'mega' ? '★ MEGA-UPGRADE — pick one' : 'UPGRADE — pick one';
        el('turnpick-timer').textContent = Math.ceil(pick.timer);
        el('turnpick').classList.toggle('mega', pick.kind === 'mega');
        this._buildCards(el('turnpick-cards'), pick.choices, ownedIds, onPick, true, null);
        el('upgrade').classList.add('hidden');
        el('turnpick').classList.remove('hidden');
      }
    },

    updatePickTimer(t) {
      const s = String(Math.ceil(t));
      const a = el('upgrade-timer'), b = el('turnpick-timer');
      if (a) a.textContent = s;
      if (b) b.textContent = s;
    },

    hidePick() {
      const u = el('upgrade'), t = el('turnpick');
      if (u) u.classList.add('hidden');
      if (t) t.classList.add('hidden');
    },

    showGarage(save, onBack) {
      this.hideAll();
      const d = GB.driverLevelFromXp(save.driverXp);
      const unlocked = GB.unlockedPassives(save);
      const body = el('garage-body');
      const passiveChips = Object.keys(GB.PASSIVES).map(pid => {
        const p = GB.PASSIVES[pid];
        const on = !!unlocked[pid];
        return `<div class="meta-chip ${on ? 'unlocked' : 'locked'}">
            <div class="mc-nm">${on ? '✔ ' : '🔒 '}${p.name}</div>
            <div class="mc-ds">${p.desc}</div></div>`;
      }).join('');
      const mileChips = GB.MILESTONES.map(m => {
        const on = !!save.milestones[m.id];
        return `<div class="meta-chip ${on ? 'unlocked' : 'locked'}">
            <div class="mc-nm">${on ? '✔ ' : '○ '}${m.name}</div>
            <div class="mc-ds">${m.desc}</div></div>`;
      }).join('');
      const pct = Math.round((d.into / d.need) * 100);
      body.innerHTML = `
        <div class="garage-sec">
          <h3>Driver — Level ${d.level}</h3>
          <div class="meta-chip" style="min-width:40vw">
            <div class="mc-ds">XP ${d.into}/${d.need} to next level</div>
            <div style="height:8px;background:rgba(0,0,0,.4);border-radius:5px;margin-top:6px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:#9be7ff"></div></div>
            <div class="mc-ds" style="margin-top:6px">Higher driver levels grant run-start bonuses (HP, energy, damage, shield, power).</div>
          </div>
        </div>
        <div class="garage-sec"><h3>Permanent Passives</h3><div class="garage-grid">${passiveChips}</div></div>
        <div class="garage-sec"><h3>Milestones</h3><div class="garage-grid">${mileChips}</div></div>
      `;
      el('btn-garage-back').onclick = onBack;
      this.show('garage');
    },

    showGameOver(info, onRetry, onMenu) {
      this.hideAll();
      el('go-title').textContent = info.win ? 'VICTORY RUN!' : 'RUN OVER';
      el('go-title').className = 'go-title ' + (info.win ? 'win' : 'lose');
      el('go-body').innerHTML =
        `You reached <b>Round ${info.round}</b>.<br>` +
        (info.cause ? `${info.cause}<br>` : '') +
        `Driver XP earned: <b>+${info.xpGained}</b>` +
        (info.unlocks && info.unlocks.length ? `<br>New unlocks: <b>${info.unlocks.join(', ')}</b>` : '') +
        (info.levelUps ? `<br>Driver leveled up to <b>Lv.${info.newLevel}</b>!` : '');
      el('btn-retry').onclick = onRetry;
      el('btn-menu').onclick = onMenu;
      this.show('gameover');
    },

    // ---- online matchmaking ----
    showOnline(onCancel) {
      this.hideAll();
      el('online-msg').textContent = 'Connecting to server…';
      el('online-sub').textContent = '';
      const b = el('btn-online-cancel');
      b.textContent = 'CANCEL';
      b.onclick = onCancel;
      this.show('online');
    },
    onlineStatus(state, net) {
      const msg = el('online-msg'), sub = el('online-sub'), b = el('btn-online-cancel');
      if (!msg) return;
      if (state === 'connecting') { msg.textContent = 'Connecting to server…'; sub.textContent = ''; b.textContent = 'CANCEL'; }
      else if (state === 'waiting') { msg.textContent = '🔎 Searching for an opponent…'; sub.textContent = 'Share this page — first two players are matched.'; b.textContent = 'CANCEL'; }
      else if (state === 'error') { msg.textContent = '⚠ Could not connect'; sub.textContent = (net && net.errMsg) || 'Is the online server running?'; b.textContent = 'BACK'; }
      else if (state === 'disconnected') { msg.textContent = 'Disconnected'; sub.textContent = (net && net.errMsg) || ''; b.textContent = 'BACK'; }
      else if (state === 'oppleft') { msg.textContent = 'Opponent left — searching again…'; sub.textContent = ''; b.textContent = 'CANCEL'; }
    },

    // ---- online match result (reuses #gameover with rematch/leave) ----
    showOnlineOver(win, oppName, onRematch, onLeave) {
      this.hideAll();
      el('go-title').textContent = win ? 'YOU WIN!' : 'DEFEAT';
      el('go-title').className = 'go-title ' + (win ? 'win' : 'lose');
      el('go-body').innerHTML = win
        ? ('You blasted <b>' + oppName + '</b> to scrap!')
        : ('<b>' + oppName + '</b> destroyed your SPLONK.');
      const r = el('btn-retry'), m = el('btn-menu');
      r.textContent = 'REMATCH'; r.disabled = false; r.onclick = onRematch;
      m.textContent = 'LEAVE'; m.onclick = onLeave;
      this.show('gameover');
    },
    onlineOverWaiting() {
      const r = el('btn-retry');
      if (r) { r.textContent = 'WAITING…'; r.disabled = true; }
      const b = el('go-body'); if (b) b.innerHTML += '<br><span style="opacity:.8">Waiting for opponent to accept…</span>';
    },
    onlineOverOppReady() {
      const b = el('go-body'); if (b) b.innerHTML += '<br><b style="color:var(--cool)">Opponent wants a rematch!</b>';
    },

    toast(text, kind) {
      const wrap = el('toasts');
      const t = document.createElement('div');
      t.className = 'toast' + (kind ? ' ' + kind : '');
      t.textContent = text;
      wrap.appendChild(t);
      setTimeout(() => t.remove(), 3200);
    },
  };

  GB.UI = UI;
})(window.GB);
