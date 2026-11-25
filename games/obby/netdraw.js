/* Obby Builder: NET DRAW, for playing online.
 * Records everything your own character draws in a frame and replays it on the other phone, so they see
 * exactly what you see: the body and its pose, every slash, swing, charge ring, projectile, summoned helper,
 * kite, aura, skin and emote, for every character (none of them has to send its own state).
 *
 * How: a few times a second the game turns recording on around the parts of the frame that belong to the
 * player (see "__ppRec.on/off" in index.html's draw()). While it is on, the canvas drawing calls are wrapped
 * and written down (numbers rounded, strings put in a table). Offscreen canvases the character draws into
 * (tinted skins) are recorded too and rebuilt on the other side; images and cached canvases are sent once.
 * The other phone keeps the latest recording and replays it every frame, moved to where the player is now
 * and to its own camera.
 */
(function () {
  'use strict';
  const C2 = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (!C2) return;
  const CV = HTMLCanvasElement.prototype, GR = window.CanvasGradient && CanvasGradient.prototype;
  const METHODS = ['save', 'restore', 'scale', 'rotate', 'translate', 'transform', 'setTransform', 'resetTransform',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect',
    'roundRect', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage',
    'setLineDash', 'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern'].filter(m => typeof C2[m] === 'function');
  const PROPS = ['fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'lineWidth', 'lineCap', 'lineJoin',
    'miterLimit', 'lineDashOffset', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'font', 'textAlign',
    'textBaseline', 'direction', 'filter', 'imageSmoothingEnabled', 'letterSpacing'].filter(k => Object.getOwnPropertyDescriptor(C2, k));
  const MI = {}; METHODS.forEach((m, i) => { MI[m] = i; });
  // the codes are positions in the two lists above, so both phones must run the same version: it is sent along
  const VER = METHODS.length + ':' + PROPS.length;
  const OP_PROP = 100, OP_CTX = 200, OP_SIZE = 201, OP_STOP = 202, OP_SEG = 203;
  const GRAD = { createLinearGradient: 1, createRadialGradient: 1, createConicGradient: 1, createPattern: 1 };
  const MAX_OPS = 9000, MAX_SNAP = 512 * 512;

  const origM = {}, origP = {}, origStop = GR && GR.addColorStop;
  let origW = null, origH = null;
  METHODS.forEach(m => { origM[m] = C2[m]; });
  PROPS.forEach(k => { origP[k] = Object.getOwnPropertyDescriptor(C2, k); });
  try { origW = Object.getOwnPropertyDescriptor(CV, 'width'); origH = Object.getOwnPropertyDescriptor(CV, 'height'); } catch (e) {}

  // ---------------------------------------------------------------- recording
  const R = window.__ppRec = {};
  let armed = false, patched = false, mainCtx = null, mainCanvas = null;
  let ops = null, strs = null, strIx = null, res = null, curCtx = -1, lostOps = false;
  let ctxIds = new WeakMap(), canvasIds = new WeakMap(), nextCanvas = 1, gradIds = null, nextGrad = 0;
  let sentRes = new Map(), nextRes = 1, drawnCanvas = new WeakSet(), frameCanvas = null;
  let lastArm = 0, ready = null, segBase = null;

  const rn = v => Math.round(v * 100) / 100;
  function str(s) { let i = strIx.get(s); if (i == null) { i = strs.length; strs.push(s); strIx.set(s, i); } return i; }
  // a value in the recording: numbers rounded, strings by their place in the table ({ s }), gradients by id ({ g })
  function val(v) {
    if (typeof v === 'number') return isFinite(v) ? rn(v) : 0;
    if (typeof v === 'string') return { s: str(v) };
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v == null) return null;
    if (gradIds && gradIds.has(v)) return { g: gradIds.get(v) };
    if (Array.isArray(v)) return v.map(val);
    if (typeof DOMPointReadOnly !== 'undefined' && v instanceof DOMPointReadOnly) return [rn(v.x), rn(v.y)];
    if (typeof v === 'object' && 'a' in v && 'f' in v) return [v.a, v.b, v.c, v.d, v.e, v.f].map(rn);   // a DOMMatrix
    return null;
  }
  function canvasId(cv) { let id = canvasIds.get(cv); if (!id) { id = nextCanvas++; canvasIds.set(cv, id); } return id; }
  function ctxOf(c) {
    if (c === mainCtx) return 0;
    let id = ctxIds.get(c);
    if (id == null) { id = canvasId(c.canvas); ctxIds.set(c, id); }
    if (!frameCanvas.has(id)) {   // the first time this frame: make sure the other phone has a canvas this big
      frameCanvas.add(id); drawnCanvas.add(c.canvas);
      ops.push([OP_SIZE, id, c.canvas.width, c.canvas.height, 0]);
    }
    return id;
  }
  function use(c) { const id = ctxOf(c); if (id !== curCtx) { ops.push([OP_CTX, id]); curCtx = id; } }
  // an image to draw from: a picture (sent once by address, or as a copy when it has none the other phone can load),
  // a canvas drawn while recording (rebuilt over there), or any other canvas (copied once)
  function imageRef(img) {
    if (!img) return null;
    if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
      if (img === mainCanvas) return null;
      const id = canvasId(img);
      if (drawnCanvas.has(img)) return { c: id };
      const key = 'c' + id;
      if (!sentRes.has(key)) {
        if (!img.width || !img.height || img.width * img.height > MAX_SNAP) return null;
        let url = null; try { url = img.toDataURL(); } catch (e) {}
        if (!url) return null;
        sentRes.set(key, id); res.push({ k: 'c', id, w: img.width, h: img.height, u: url });
      }
      return { c: id };
    }
    if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
      if (!img.complete || !img.naturalWidth) return null;
      const src = img.currentSrc || img.src || '';
      let id = sentRes.get('i' + src);
      if (!id) {
        let u = src;
        if (!/^(https?:|data:)/.test(src) || /^blob:/.test(src)) {   // nothing the other phone could load: send a copy
          try {
            const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
            if (c.width * c.height > MAX_SNAP) return null;
            origM.drawImage.call(c.getContext('2d'), img, 0, 0); u = c.toDataURL();
          } catch (e) { return null; }
        } else if (/^https?:/.test(src)) {
          // the same game files on both phones: send the path from the game's folder, not this phone's address
          const base = location.href.replace(/[^\/]*([?#].*)?$/, '');
          if (src.indexOf(base) === 0) u = './' + src.slice(base.length);
        }
        id = nextRes++; sentRes.set('i' + src, id); res.push({ k: 'i', id, u });
      }
      return { i: id };
    }
    return null;   // video frames, bitmaps: not sent
  }

  function wrapM(m, i) {
    const o = origM[m];
    return function () {
      const out = o.apply(this, arguments);
      if (!ops || ops.length > MAX_OPS) { if (ops) lostOps = true; return out; }
      try {
        use(this);
        const a = [i];
        if (m === 'drawImage') {
          const ref = imageRef(arguments[0]); if (!ref) return out;
          a.push(ref); for (let k = 1; k < arguments.length; k++) a.push(val(arguments[k]));
        } else if (m === 'createPattern') {
          const ref = imageRef(arguments[0]); if (!ref || !out) return out;
          const gid = nextGrad++; gradIds.set(out, gid);
          a.push(gid, ref, val(arguments[1]));
        } else if (m === 'setTransform') {   // always as six numbers; on the game screen, with where this part of the frame started
          const t = arguments.length >= 6 ? Array.prototype.slice.call(arguments, 0, 6) : (val(arguments[0]) || [1, 0, 0, 1, 0, 0]);
          for (let k = 0; k < 6; k++) a.push(rn(+t[k] || 0));
          if (this === mainCtx) a.push(segBase);
        } else {
          if (GRAD[m]) { if (!out) return out; const gid = nextGrad++; gradIds.set(out, gid); a.push(gid); }
          for (let k = 0; k < arguments.length; k++) {
            const v = arguments[k];
            if (v != null && typeof v === 'object' && !Array.isArray(v) && !(typeof DOMPointReadOnly !== 'undefined' && v instanceof DOMPointReadOnly)) return out;   // (a Path2D: left out)
            a.push(val(v));
          }
        }
        ops.push(a);
      } catch (e) {}
      return out;
    };
  }
  function wrapP(k, i) {
    const d = origP[k];
    return { configurable: true, enumerable: d.enumerable, get: d.get, set(v) {
      d.set.call(this, v);
      if (!ops || ops.length > MAX_OPS) return;
      try {
        const x = val(v); if (x === null && v != null) return;
        use(this); ops.push([OP_PROP + i, x]);
      } catch (e) {}
    } };
  }
  const wrappedM = {}, wrappedP = {};
  METHODS.forEach((m, i) => { wrappedM[m] = wrapM(m, i); });
  PROPS.forEach((k, i) => { wrappedP[k] = wrapP(k, i); });
  function stopWrap(off, col) {
    origStop.call(this, off, col);
    if (ops && gradIds && gradIds.has(this)) ops.push([OP_STOP, gradIds.get(this), rn(off), val(col)]);
  }
  function sizeWrap(d, which) {
    return { configurable: true, enumerable: d.enumerable, get: d.get, set(v) {
      d.set.call(this, v);
      if (!ops || this === mainCanvas) return;
      const id = canvasId(this); drawnCanvas.add(this);
      ops.push([OP_SIZE, id, this.width, this.height, 1]);
    } };
  }

  function patch(on) {
    if (on === patched) return;
    patched = on;
    METHODS.forEach(m => { C2[m] = on ? wrappedM[m] : origM[m]; });
    PROPS.forEach(k => { Object.defineProperty(C2, k, on ? wrappedP[k] : origP[k]); });
    if (GR && origStop) GR.addColorStop = on ? stopWrap : origStop;
    try {
      if (origW && origW.set) Object.defineProperty(CV, 'width', on ? sizeWrap(origW) : origW);
      if (origH && origH.set) Object.defineProperty(CV, 'height', on ? sizeWrap(origH) : origH);
    } catch (e) {}
  }

  // linked with a friend and playing: record this frame? (a few times a second)
  R.every = 40;
  R.frameStart = function (ctx) {
    patch(false);   // (a frame that threw half-way left it on)
    armed = false;
    const net = window.__obbyNet, g = window.__obby;
    if (!net || !net.role || !g || g.mode !== 'play' || !ctx) return;
    const now = performance.now();
    if (now - lastArm < R.every - 4) return;
    lastArm = now; armed = true;
    mainCtx = ctx; mainCanvas = ctx.canvas;
    ops = []; strs = []; strIx = new Map(); res = []; curCtx = -1; gradIds = new Map(); nextGrad = 0; frameCanvas = new Set(); lostOps = false;
  };
  // the parts of the frame that are the player's own
  R.on = function () {
    if (!armed || patched) return;
    try { const m = mainCtx.getTransform(); segBase = [m.a, m.b, m.c, m.d, m.e, m.f].map(rn); } catch (e) { segBase = [1, 0, 0, 1, 0, 0]; }
    ops.push([OP_SEG].concat(segBase)); curCtx = 0;
    patch(true);
  };
  R.off = function () { patch(false); };
  R.frameEnd = function () {
    patch(false);
    if (!armed) return;
    armed = false;
    const g = window.__obby, p = g && g.player, cam = g && g.cam;
    if (p && cam && ops.length) ready = { v: VER, o: ops, s: strs, r: res.length ? res : undefined, cx: rn(cam.x), cy: rn(cam.y), px: rn(p.x), py: rn(p.y), at: performance.now() };
    ops = null; gradIds = null;
  };
  // the latest recording, once (online.js sends it with the player's position)
  R.take = function () { const r = ready; ready = null; return r; };
  // a new link: the other phone has none of the pictures yet
  R.reset = function () { sentRes = new Map(); nextRes = 1; drawnCanvas = new WeakSet(); canvasIds = new WeakMap(); ctxIds = new WeakMap(); nextCanvas = 1; ready = null; IN.res = new Map(); IN.cv = new Map(); };

  // ---------------------------------------------------------------- replaying the other phone's recording
  const IN = { res: new Map(), cv: new Map() };
  // pictures and canvas copies arrive once, in the first recording that uses them
  R.receive = function (rec) {
    if (!rec || !rec.r) return;
    for (const x of rec.r) {
      if (x.k === 'i') { const im = new Image(); im.src = x.u; IN.res.set(x.id, im); }
      else if (x.k === 'c') {
        const c = document.createElement('canvas'); c.width = x.w; c.height = x.h;
        const im = new Image(); im.onload = () => { try { c.getContext('2d').drawImage(im, 0, 0); } catch (e) {} }; im.src = x.u;
        IN.cv.set(x.id, { c, x: c.getContext('2d'), snap: true });
      }
    }
    rec.r = undefined;
  };
  R.compatible = rec => !!rec && rec.v === VER;
  function inCanvas(id) {
    let e = IN.cv.get(id);
    if (!e && IN.cv.size > 300) IN.cv.clear();   // a character making a new canvas every frame: don't keep them all
    if (!e) { const c = document.createElement('canvas'); c.width = 1; c.height = 1; e = { c, x: c.getContext('2d') }; IN.cv.set(id, e); }
    return e;
  }
  // ctx: where to draw; dx, dy: how far (in screen pixels of the sender) the whole recording moves; cam: this phone's camera
  R.replay = function (ctx, rec, cam, dx, dy) {
    if (!rec || !rec.o || rec.v !== VER) return false;
    const S = rec.s || [], grads = new Map();
    const ox = (rec.cx || 0) - cam.x + (dx || 0), oy = (rec.cy || 0) - cam.y + (dy || 0);
    let base = null, depth = 0, cur = ctx, curId = 0;
    const depths = new Map();
    const un = v => {
      if (v == null || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map(un);
      if (v.s != null) return S[v.s];
      if (v.g != null) return grads.get(v.g) || 'rgba(0,0,0,0)';
      return v;
    };
    ctx.save();
    try {
      for (const a of rec.o) {
        const c = a[0];
        if (c === OP_SEG) {   // a part of the frame starts: from this phone's own transform, moved to the sender's camera
          for (const [id, d] of depths) { const e = id === 0 ? ctx : inCanvas(id).x; for (let k = 0; k < d; k++) origM.restore.call(e); }
          depths.clear(); depth = 0;
          ctx.restore(); ctx.save();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.filter = 'none'; ctx.setLineDash([]);
          ctx.translate(ox, oy);
          base = { mine: ctx.getTransform(), seg: new DOMMatrix(a.slice(1, 7)) };
          cur = ctx; curId = 0; continue;
        }
        if (c === OP_CTX) { curId = a[1]; cur = curId === 0 ? ctx : inCanvas(curId).x; continue; }
        if (c === OP_SIZE) {
          const e = inCanvas(a[1]);
          if (a[4] || e.c.width !== a[2] || e.c.height !== a[3]) { e.c.width = a[2]; e.c.height = a[3]; depths.delete(a[1]); }
          continue;
        }
        if (c === OP_STOP) { const g = grads.get(a[1]); if (g && g.addColorStop) try { g.addColorStop(a[2], un(a[3])); } catch (e) {} continue; }
        if (c >= OP_PROP) { const k = PROPS[c - OP_PROP]; if (k) try { cur[k] = un(a[1]); } catch (e) {} continue; }
        const m = METHODS[c]; if (!m) continue;
        let args = a.slice(1);
        if (GRAD[m]) {
          const gid = args.shift();
          let g = null;
          if (m === 'createPattern') { const src = refImage(args[0]); if (src) try { g = cur.createPattern(src, un(args[1])); } catch (e) {} }
          else try { g = cur[m].apply(cur, args.map(un)); } catch (e) {}
          grads.set(gid, g); continue;
        }
        if (m === 'drawImage') { const src = refImage(args[0]); if (!src) continue; args[0] = src; try { cur.drawImage.apply(cur, [src].concat(args.slice(1).map(un))); } catch (e) {} continue; }
        if (m === 'save') { cur.save(); depths.set(curId, (depths.get(curId) || 0) + 1); continue; }
        if (m === 'restore') { const d = depths.get(curId) || 0; if (d > 0) { cur.restore(); depths.set(curId, d - 1); } continue; }
        if (m === 'setTransform' && curId === 0 && base) {
          const mm = new DOMMatrix(args.slice(0, 6)), seg = args[6] ? new DOMMatrix(args[6]) : base.seg;
          try { cur.setTransform(base.mine.multiply(seg.inverse()).multiply(mm)); } catch (e) {}
          continue;
        }
        if (m === 'resetTransform' && curId === 0 && base) { try { cur.setTransform(base.mine.multiply(base.seg.inverse())); } catch (e) {} continue; }
        try { cur[m].apply(cur, args.map(un)); } catch (e) {}
      }
    } catch (e) {}
    for (const [id, d] of depths) { if (id === 0) continue; const e = inCanvas(id).x; for (let k = 0; k < d; k++) origM.restore.call(e); }
    for (let k = 0; k < (depths.get(0) || 0); k++) ctx.restore();
    ctx.restore();
    return true;
  };
  function refImage(r) {
    if (!r) return null;
    if (r.c != null) { const e = IN.cv.get(r.c); return e && e.c.width > 0 ? e.c : null; }
    if (r.i != null) { const im = IN.res.get(r.i); return im && im.complete && im.naturalWidth ? im : null; }
    return null;
  }
  R.lost = () => lostOps;
})();
