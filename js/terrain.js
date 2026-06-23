/* ============================================================
   GUNBALD — terrain.js
   Destructible terrain using an offscreen pixel mask.
   solid pixel  -> alpha 255 in mask + painted on canvas
   carve crater -> destination-out circle, mask updated
   ============================================================ */
(function (GB) {
  'use strict';
  const { M } = GB;

  function Terrain(opts) {
    this.w = GB.W;
    this.h = GB.H;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.mask = new Uint8Array(this.w * this.h); // 1 = solid
    this.theme = opts && opts.theme ? opts.theme : THEMES[0];
    this.surface = new Int16Array(this.w); // cached top solid y per column (for quick queries)
    this.generate(opts || {});
  }

  const THEMES = [
    { name: 'meadow', sky: ['#8fd6ff', '#cdeffd'], dirt: ['#7a4a2b', '#52301a'], grass: '#6fcf57', grass2: '#4ea83f' },
    { name: 'dusk',   sky: ['#3a2a6e', '#b96a8e'], dirt: ['#5a3d6b', '#39243f'], grass: '#c77dff', grass2: '#8e4fd1' },
    { name: 'desert', sky: ['#ffd98a', '#ffeccb'], dirt: ['#c79a4e', '#8a6a2f'], grass: '#e3c46a', grass2: '#b89a45' },
    { name: 'arctic', sky: ['#bfe9ff', '#eafaff'], dirt: ['#7e93ad', '#566175'], grass: '#eaf6ff', grass2: '#bcd6ea' },
  ];
  Terrain.THEMES = THEMES;

  Terrain.prototype.generate = function (opts) {
    const w = this.w, h = this.h;
    const ctx = this.ctx;
    const t = this.theme;

    // ---- build a heightline with layered sines + a couple of hills ----
    const base = M.lerp(h * 0.62, h * 0.74, GB.rng());
    const amp1 = GB.rand(40, 95), amp2 = GB.rand(14, 40), amp3 = GB.rand(6, 18);
    const f1 = GB.rand(0.9, 1.7), f2 = GB.rand(2.2, 3.8), f3 = GB.rand(5, 8);
    const p1 = GB.rand(0, 7), p2 = GB.rand(0, 7), p3 = GB.rand(0, 7);
    // optional central valley/plateau
    const valley = GB.chance(0.5);
    const line = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let y = base
        - amp1 * Math.sin(u * Math.PI * f1 + p1)
        - amp2 * Math.sin(u * Math.PI * f2 + p2)
        - amp3 * Math.sin(u * Math.PI * f3 + p3);
      if (valley) y += 70 * Math.sin(u * Math.PI); // dip in middle
      // keep playable margins
      y = M.clamp(y, h * 0.34, h * 0.9);
      line[x] = y;
    }
    // light smoothing
    for (let pass = 0; pass < 2; pass++) {
      for (let x = 1; x < w - 1; x++) line[x] = (line[x - 1] + line[x] * 2 + line[x + 1]) / 4;
    }
    this._line = line;

    // ---- paint dirt body ----
    ctx.clearRect(0, 0, w, h);
    // dirt gradient
    const g = ctx.createLinearGradient(0, base - 120, 0, h);
    g.addColorStop(0, t.dirt[0]);
    g.addColorStop(1, t.dirt[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) ctx.lineTo(x, line[x]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // dirt speckle texture
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 1400; i++) {
      const rx = GB.rand(0, w), ry = GB.rand(base - 120, h);
      ctx.fillStyle = GB.rgba(0, 0, 0, GB.rand(0.03, 0.10));
      ctx.fillRect(rx, ry, GB.rand(2, 5), GB.rand(2, 5));
    }
    ctx.restore();

    // ---- grass cap ----
    ctx.lineWidth = 14;
    ctx.strokeStyle = t.grass2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, line[0]);
    for (let x = 1; x < w; x++) ctx.lineTo(x, line[x]);
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = t.grass;
    ctx.beginPath();
    ctx.moveTo(0, line[0] - 3);
    for (let x = 1; x < w; x++) ctx.lineTo(x, line[x] - 3);
    ctx.stroke();

    this.rebuildMask();
    this.rebuildSurface();
  };

  // read full alpha into mask
  Terrain.prototype.rebuildMask = function () {
    const img = this.ctx.getImageData(0, 0, this.w, this.h).data;
    const m = this.mask;
    for (let i = 0, p = 3; i < m.length; i++, p += 4) m[i] = img[p] > 30 ? 1 : 0;
  };

  Terrain.prototype.rebuildSurface = function () {
    const w = this.w, h = this.h, m = this.mask, s = this.surface;
    for (let x = 0; x < w; x++) {
      let y = h; // default: no ground -> bottom
      for (let yy = 0; yy < h; yy++) {
        if (m[yy * w + x]) { y = yy; break; }
      }
      s[x] = y;
    }
  };

  Terrain.prototype.solidAt = function (x, y) {
    x |= 0; y |= 0;
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    return this.mask[y * this.w + x] === 1;
  };

  // top-most solid y at/below startY in a column; returns h if none
  Terrain.prototype.surfaceY = function (x) {
    x = M.clamp(x | 0, 0, this.w - 1);
    return this.surface[x];
  };

  // carve a crater; updates canvas + mask + nearby surface columns
  Terrain.prototype.crater = function (cx, cy, r) {
    cx |= 0; cy |= 0;
    const ctx = this.ctx;
    // scorch ring (drawn first, partly removed by the hole)
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(20,10,5,0.55)';
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // dig the hole
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // update mask in bounding box
    const x0 = M.clamp(cx - r - 1, 0, this.w - 1);
    const x1 = M.clamp(cx + r + 1, 0, this.w - 1);
    const y0 = M.clamp(cy - r - 1, 0, this.h - 1);
    const y1 = M.clamp(cy + r + 1, 0, this.h - 1);
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) this.mask[y * this.w + x] = 0;
      }
    }
    // refresh surface for affected columns
    for (let x = x0; x <= x1; x++) {
      let y = this.h;
      for (let yy = 0; yy < this.h; yy++) { if (this.mask[yy * this.w + x]) { y = yy; break; } }
      this.surface[x] = y;
    }
  };

  // is there terrain along a segment (used for splonk burial / collision-ish)
  Terrain.prototype.segHitsSolid = function (x0, y0, x1, y1) {
    const steps = Math.max(2, (Math.hypot(x1 - x0, y1 - y0) | 0));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return true;
    }
    return false;
  };

  GB.Terrain = Terrain;
})(window.GB);
