/* ============================================================
   GUNBALD — terrain.js
   Destructible terrain on an offscreen pixel mask, sized to the
   whole WORLD (larger than the viewport). Generates plateaus +
   cliffs, floating platforms, solid blocks, a tunnel, overhangs.
   ============================================================ */
(function (GB) {
  'use strict';
  const { M } = GB;

  function Terrain(opts) {
    this.w = GB.WORLD_W;
    this.h = GB.WORLD_H;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.mask = new Uint8Array(this.w * this.h);
    this.surface = new Int16Array(this.w);
    this.theme = opts && opts.theme ? opts.theme : THEMES[0];
    this.platforms = [];   // {x,y,w,h} solid platforms (for loot/spawn placement hints)
    this.generate(opts || {});
  }

  const THEMES = [
    { name: 'meadow', sky: ['#8fd6ff', '#cdeffd'], dirt: ['#7a4a2b', '#52301a'], grass: '#6fcf57', grass2: '#4ea83f', rock: '#6b6f80' },
    { name: 'dusk',   sky: ['#3a2a6e', '#b96a8e'], dirt: ['#5a3d6b', '#39243f'], grass: '#c77dff', grass2: '#8e4fd1', rock: '#5a4f72' },
    { name: 'desert', sky: ['#ffd98a', '#ffeccb'], dirt: ['#c79a4e', '#8a6a2f'], grass: '#e3c46a', grass2: '#b89a45', rock: '#a98a55' },
    { name: 'arctic', sky: ['#bfe9ff', '#eafaff'], dirt: ['#7e93ad', '#566175'], grass: '#eaf6ff', grass2: '#bcd6ea', rock: '#8fa3bc' },
  ];
  Terrain.THEMES = THEMES;

  Terrain.prototype.generate = function () {
    const w = this.w, h = this.h, ctx = this.ctx, t = this.theme;
    ctx.clearRect(0, 0, w, h);

    // ---- ground heightline: plateaus joined by cliffs, with a deep pit somewhere ----
    const segs = 7;
    const segW = w / segs;
    const baseY = h * 0.58;
    const segH = [];
    for (let s = 0; s < segs; s++) segH.push(M.clamp(baseY + GB.rand(-h * 0.16, h * 0.24), h * 0.42, h * 0.86));
    // carve one chasm (a near-bottomless pit between two plateaus)
    const pit = GB.randInt(1, segs - 2);
    segH[pit] = h + 80;
    const line = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const s = Math.min(segs - 1, Math.floor(x / segW));
      const local = (x - s * segW) / segW;
      const hill = Math.sin(local * Math.PI) * 16 + Math.sin(local * Math.PI * 3 + s) * 6;
      line[x] = segH[s] - hill;
    }
    this._line = line;

    // dirt body
    const g = ctx.createLinearGradient(0, baseY - 140, 0, h);
    g.addColorStop(0, t.dirt[0]); g.addColorStop(1, t.dirt[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) ctx.lineTo(x, line[x]);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // speckle
    ctx.save(); ctx.clip();
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = GB.rgba(0, 0, 0, GB.rand(0.03, 0.10));
      ctx.fillRect(GB.rand(0, w), GB.rand(baseY - 140, h), GB.rand(2, 5), GB.rand(2, 5));
    }
    ctx.restore();
    // grass cap on the ground line (skip the pit gap)
    this._grassLine(line, true);

    // ---- floating platforms (varied heights), a few solid blocks, an overhang ----
    const plats = [];
    const tries = 26, want = 11;
    for (let i = 0; i < tries && plats.length < want; i++) {
      const pw = GB.rand(120, 280) | 0;
      const px = GB.rand(120, w - pw - 120) | 0;
      const py = GB.rand(h * 0.22, h * 0.66) | 0;
      // keep platforms apart and above the local ground
      let ok = (py < this.surfAtLine(line, px + pw / 2) - 70);
      for (const q of plats) if (Math.abs(q.x - px) < 220 && Math.abs(q.y - py) < 90) { ok = false; break; }
      if (!ok) continue;
      const ph = 26;
      this.drawPlatform(px, py, pw, ph);
      plats.push({ x: px, y: py, w: pw, h: ph });
    }
    // overhang: a thick ledge jutting from a tall cliff
    for (let s = 0; s < segs; s++) {
      if (s === pit || segH[s] > h * 0.6) continue;
      if (GB.chance(0.5)) {
        const ox = (s * segW + segW * 0.7) | 0, oy = (segH[s] - GB.rand(120, 200)) | 0;
        this.drawPlatform(ox, oy, 170, 30);
        plats.push({ x: ox, y: oy, w: 170, h: 30, overhang: true });
        break;
      }
    }
    // a couple of solid stone blocks on the ground (cover)
    for (let i = 0; i < 3; i++) {
      const bw = GB.rand(60, 110) | 0, bx = GB.rand(200, w - 260) | 0;
      const gy = this.surfAtLine(line, bx + bw / 2);
      if (gy > h) continue;
      const bh = GB.rand(70, 130) | 0;
      this.drawBlock(bx, gy - bh, bw, bh + 20);
    }
    this.platforms = plats;

    this.rebuildMask();
    this.rebuildSurface();

    // ---- tunnel: bore a horizontal passage through a tall plateau ----
    for (let s = 0; s < segs; s++) {
      if (s === pit) continue;
      if (segH[s] < h * 0.62) {
        const ty = (segH[s] + 36) | 0;
        const x0 = (s * segW + 24) | 0, x1 = (s * segW + segW - 24) | 0;
        for (let x = x0; x <= x1; x += 10) this.crater(x, ty, 26);
        break;
      }
    }
  };

  Terrain.prototype.surfAtLine = function (line, x) { return line[M.clamp(x | 0, 0, this.w - 1)]; };

  Terrain.prototype._grassLine = function (line, skipPit) {
    const ctx = this.ctx, t = this.theme, h = this.h;
    for (const pass of [{ w: 14, c: t.grass2, dy: 0 }, { w: 8, c: t.grass, dy: -3 }]) {
      ctx.lineWidth = pass.w; ctx.strokeStyle = pass.c; ctx.lineJoin = 'round';
      ctx.beginPath();
      let pen = false;
      for (let x = 0; x < this.w; x++) {
        if (skipPit && line[x] > h) { pen = false; continue; }   // gap over the pit
        if (!pen) { ctx.moveTo(x, line[x] + pass.dy); pen = true; }
        else ctx.lineTo(x, line[x] + pass.dy);
      }
      ctx.stroke();
    }
  };

  Terrain.prototype.drawPlatform = function (x, y, w, h) {
    const ctx = this.ctx, t = this.theme;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, t.dirt[0]); g.addColorStop(1, t.dirt[1]);
    ctx.fillStyle = g; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
    GB.roundRect(ctx, x, y, w, h, 8); ctx.fill();
    // grass top
    ctx.lineWidth = 9; ctx.strokeStyle = t.grass2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 6, y + 2); ctx.lineTo(x + w - 6, y + 2); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = t.grass;
    ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + w - 6, y); ctx.stroke();
    ctx.lineCap = 'butt';
  };

  Terrain.prototype.drawBlock = function (x, y, w, h) {
    const ctx = this.ctx, t = this.theme;
    ctx.fillStyle = t.rock || '#6b6f80';
    GB.roundRect(ctx, x, y, w, h, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; GB.roundRect(ctx, x + 3, y + 3, w - 6, 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 4, y + h - 10, w - 8, 5);
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 2; GB.roundRect(ctx, x, y, w, h, 6); ctx.stroke();
  };

  Terrain.prototype.rebuildMask = function () {
    const img = this.ctx.getImageData(0, 0, this.w, this.h).data;
    const m = this.mask;
    for (let i = 0, p = 3; i < m.length; i++, p += 4) m[i] = img[p] > 30 ? 1 : 0;
  };

  Terrain.prototype.rebuildSurface = function () {
    const w = this.w, h = this.h, m = this.mask, s = this.surface;
    for (let x = 0; x < w; x++) {
      let y = h;
      for (let yy = 0; yy < h; yy++) { if (m[yy * w + x]) { y = yy; break; } }
      s[x] = y;
    }
  };

  Terrain.prototype.solidAt = function (x, y) {
    x |= 0; y |= 0;
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    return this.mask[y * this.w + x] === 1;
  };

  Terrain.prototype.surfaceY = function (x) {
    x = M.clamp(x | 0, 0, this.w - 1);
    return this.surface[x];
  };

  Terrain.prototype.crater = function (cx, cy, r) {
    cx |= 0; cy |= 0;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(20,10,5,0.5)';
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    const x0 = M.clamp(cx - r - 1, 0, this.w - 1), x1 = M.clamp(cx + r + 1, 0, this.w - 1);
    const y0 = M.clamp(cy - r - 1, 0, this.h - 1), y1 = M.clamp(cy + r + 1, 0, this.h - 1);
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) { const dx = x - cx; if (dx * dx + dy * dy <= r2) this.mask[y * this.w + x] = 0; }
    }
    for (let x = x0; x <= x1; x++) {
      let y = this.h;
      for (let yy = 0; yy < this.h; yy++) { if (this.mask[yy * this.w + x]) { y = yy; break; } }
      this.surface[x] = y;
    }
  };

  GB.Terrain = Terrain;
})(window.GB);
