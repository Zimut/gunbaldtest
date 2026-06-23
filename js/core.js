/* ============================================================
   GUNBALD — core.js
   Globals namespace, constants, math, RNG, input, storage.
   Pure classic-script (no modules) so it runs over file://.
   ============================================================ */
window.GB = window.GB || {};
(function (GB) {
  'use strict';

  // ---- world constants (internal canvas resolution) ----
  GB.W = 1280;
  GB.H = 720;
  GB.GRAVITY = 0.30;        // px / tick^2
  GB.TICK = 1 / 60;
  GB.GROUND_PAD = 0;       // sky margin handled by terrain gen

  // ---- pacing (tuned 4x slower than the original feel) ----
  GB.MOVE_SPEED = 36;       // px/sec walk speed (was ~144 px/sec). Energy budget unchanged.
  GB.PROJ_TS = 0.25;        // projectile time-scale: same arc, played back 4x slower
  GB.CHARGE_RATE = 1 / 5.2; // charge fraction per second (was 1/1.3 -> 4x slower)

  // ---- math helpers ----
  const M = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    inv: (a, b, v) => (b === a ? 0 : (v - a) / (b - a)),
    deg2rad: d => (d * Math.PI) / 180,
    rad2deg: r => (r * 180) / Math.PI,
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    dist2: (ax, ay, bx, by) => {
      const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy;
    },
    sign: v => (v < 0 ? -1 : 1),
    smooth: t => t * t * (3 - 2 * t),
    angleTo: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    approach: (cur, target, step) => {
      if (cur < target) return Math.min(cur + step, target);
      if (cur > target) return Math.max(cur - step, target);
      return cur;
    },
  };
  GB.M = M;

  // ---- seeded-ish RNG (Mulberry32), plus convenience wrappers ----
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  GB.makeRng = makeRng;
  // global run RNG (re-seeded each run)
  GB.rng = Math.random;
  GB.seedRun = function (seed) { GB.rng = makeRng(seed); };
  GB.rand = (a, b) => a + GB.rng() * (b - a);
  GB.randInt = (a, b) => Math.floor(GB.rand(a, b + 1));
  GB.pick = arr => arr[Math.floor(GB.rng() * arr.length)];
  GB.chance = p => GB.rng() < p;
  GB.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(GB.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  // pick n distinct
  GB.sample = (arr, n) => GB.shuffle(arr).slice(0, n);

  // ---- color helpers ----
  GB.rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  GB.mix = (c1, c2, t) => [
    M.lerp(c1[0], c2[0], t),
    M.lerp(c1[1], c2[1], t),
    M.lerp(c1[2], c2[2], t),
  ];

  // ---- storage (metaprogression) ----
  const SAVE_KEY = 'gunbald.save.v1';
  GB.defaultSave = () => ({
    driverXp: 0,
    driverLevel: 1,
    passives: {},          // id -> true
    milestones: {},        // id -> true
    bestRound: 0,
    runs: 0,
    totalWins: 0,
  });
  GB.loadSave = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return GB.defaultSave();
      const s = JSON.parse(raw);
      return Object.assign(GB.defaultSave(), s);
    } catch (e) { return GB.defaultSave(); }
  };
  GB.writeSave = function (s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  };
  GB.wipeSave = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

  // ============================================================
  //  INPUT  — keyboard (held + edge) and mouse (held + edge)
  // ============================================================
  const Input = {
    down: {},        // physical key currently held
    pressed: {},     // key edge this frame
    mouseDown: false,
    mousePressed: false,
    mouseReleased: false,
    mx: 0, my: 0,    // in canvas-space
    _canvas: null,

    attach(canvas) {
      this._canvas = canvas;
      window.addEventListener('keydown', e => {
        const k = norm(e.key);
        if (k) {
          if (!this.down[k]) this.pressed[k] = true;
          this.down[k] = true;
          // stop page scroll on arrows/space
          if (['up', 'down', 'left', 'right', 'space'].includes(k)) e.preventDefault();
        }
      });
      window.addEventListener('keyup', e => {
        const k = norm(e.key);
        if (k) this.down[k] = false;
      });
      const setMouse = e => {
        const r = canvas.getBoundingClientRect();
        const cx = (e.touches ? e.touches[0].clientX : e.clientX);
        const cy = (e.touches ? e.touches[0].clientY : e.clientY);
        this.mx = ((cx - r.left) / r.width) * GB.W;
        this.my = ((cy - r.top) / r.height) * GB.H;
      };
      canvas.addEventListener('mousemove', setMouse);
      canvas.addEventListener('mousedown', e => {
        setMouse(e);
        if (!this.mouseDown) this.mousePressed = true;
        this.mouseDown = true;
      });
      window.addEventListener('mouseup', e => {
        if (this.mouseDown) this.mouseReleased = true;
        this.mouseDown = false;
      });
      // touch fallback
      canvas.addEventListener('touchstart', e => {
        setMouse(e); if (!this.mouseDown) this.mousePressed = true; this.mouseDown = true;
        e.preventDefault();
      }, { passive: false });
      canvas.addEventListener('touchmove', e => { setMouse(e); e.preventDefault(); }, { passive: false });
      window.addEventListener('touchend', e => { if (this.mouseDown) this.mouseReleased = true; this.mouseDown = false; });
      // lose focus safety
      window.addEventListener('blur', () => { this.down = {}; this.mouseDown = false; });
    },

    // call at END of each frame
    endFrame() {
      this.pressed = {};
      this.mousePressed = false;
      this.mouseReleased = false;
    },

    // queries
    held(...keys) { return keys.some(k => this.down[k]); },
    hit(...keys) { return keys.some(k => this.pressed[k]); },
  };

  function norm(key) {
    switch (key) {
      case 'ArrowUp': return 'up';
      case 'ArrowDown': return 'down';
      case 'ArrowLeft': return 'left';
      case 'ArrowRight': return 'right';
      case ' ': case 'Spacebar': return 'space';
      case 'Enter': return 'enter';
      case 'Escape': return 'esc';
      default:
        if (key.length === 1) return key.toLowerCase();
        return null;
    }
  }
  GB.Input = Input;

})(window.GB);
