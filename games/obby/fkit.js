/* Obby Builder: FIGHTER KIT
 * Shared plumbing for the add-on fighters (Kodiak, Valka, Boiler, Sleight), so each fighter file is only
 * its moves, its animation and its look.
 *
 *  - PPParry: the parry outside Smash (Guardian's Counter and any fighter's _parryT). A close attacker is
 *    countered; a shot, or a hit from range, is reflected back at the nearest foe as a homing bolt.
 *    (Smash has its own version in smash.js.)
 *  - FKit.define(spec): registers a fighter. It owns the state swap for a second fighter (Smash CPU), the
 *    S button (S + direction, ground and air, held S charges), the per-frame tick, drawing hooks, the capsule
 *    roster entry, stats and the hit sparks / move titles every fighter shares.
 *  - FKit.skel / limb / lerpPose: a jointed body (torso, head, two-part arms and legs) posed by angles, so
 *    every move can be animated as choreography rather than a sprite that only leans.
 */
(function () {
  'use strict';
  const FK = window.FKit = {};

  // ---------------------------------------------------------------- audio (one shared context)
  let AC = null, out = null, nbuf = null;
  FK.ac = function () {
    if (AC) { if (AC.state === 'suspended') { try { AC.resume(); } catch (e) {} } return AC; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      AC = new C(); out = AC.createGain(); out.gain.value = 0.22;
      const comp = AC.createDynamicsCompressor(); out.connect(comp); comp.connect(AC.destination);
    } catch (e) { AC = null; }
    return AC;
  };
  FK.tone = function (freq, o) {
    const a = FK.ac(); if (!a) return; o = o || {};
    const t = a.currentTime + (o.delay || 0), dur = o.dur || 0.15, v = o.vol == null ? 0.3 : o.vol;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'triangle'; osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + 0.05);
  };
  FK.noise = function (o) {
    const a = FK.ac(); if (!a) return; o = o || {};
    if (!nbuf) { nbuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = a.currentTime + (o.delay || 0), dur = o.dur || 0.2, v = o.vol == null ? 0.25 : o.vol;
    const src = a.createBufferSource(); src.buffer = nbuf; src.loop = true;
    const fl = a.createBiquadFilter(); fl.type = o.ftype || 'bandpass'; fl.Q.value = o.q || 1.5;
    fl.frequency.setValueAtTime(o.cut || 1500, t); if (o.cutEnd) fl.frequency.exponentialRampToValueAtTime(o.cutEnd, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(out); src.start(t); src.stop(t + dur + 0.05);
  };
  FK.thud = function (big) { FK.tone(big ? 70 : 110, { type: 'sine', dur: big ? 0.5 : 0.25, slide: 35, vol: big ? 0.9 : 0.6 }); FK.noise({ dur: big ? 0.25 : 0.1, cut: big ? 600 : 1500, cutEnd: 200, q: 1, vol: big ? 0.35 : 0.2 }); };
  FK.whoosh = function (up, big) { FK.noise({ dur: big ? 0.3 : 0.18, cut: up ? 500 : 3000, cutEnd: up ? 3400 : 500, q: 3, vol: big ? 0.24 : 0.15 }); };
  FK.smack = function (big) { FK.noise({ dur: 0.06, cut: 2600, q: 1, vol: big ? 0.32 : 0.22 }); FK.tone(big ? 330 : 520, { dur: 0.08, slide: 180, vol: 0.14 }); };

  // ---------------------------------------------------------------- world helpers
  const BLOCK = FK.BLOCK = new Set(['solid', 'ice', 'crumble', 'mover', 'half']);
  FK.blocked = function (x, y, w, h) {
    const wd = window._gameWorld; if (!wd || !wd.tiles) return false;
    for (let tx = Math.floor(x); tx <= Math.floor(x + w - 1e-3); tx++)
      for (let ty = Math.floor(y); ty <= Math.floor(y + h - 1e-3); ty++) {
        const tl = wd.tiles.get(tx + ',' + ty); if (tl && BLOCK.has(tl.type)) return true;
      }
    return false;
  };
  FK.ex = e => e.x + (e.w || 0.9) / 2;
  FK.ey = e => e.y + (e.h || 0.9) / 2;
  FK.foes = () => (window._gameEnemies || []).filter(e => e && !e.dead);
  FK.within = (x, y, r) => FK.foes().filter(e => { const dx = FK.ex(e) - x, dy = FK.ey(e) - y; return dx * dx + dy * dy <= r * r; });
  FK.msg = s => { if (window._setMessage) window._setMessage(s); };
  FK.shake = n => { if (window._getScreenShake && window._setScreenShake) window._setScreenShake(Math.max(window._getScreenShake() || 0, n)); };
  FK.hitstop = s => { window._ppHitstop = Math.max(window._ppHitstop || 0, s); };
  FK.pcx = p => p.x + p.w / 2;
  FK.pcy = p => p.y + p.h / 2;
  FK.inSmash = () => !!(window.__smash && window.__smash.active);
  FK.face = p => (p.dashDir || p.lastMoveDir || 1) >= 0 ? 1 : -1;
  FK.ease = u => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
  FK.easeOut = u => { u = Math.max(0, Math.min(1, u)); return 1 - (1 - u) * (1 - u); };
  FK.keys = function () {
    const keys = window._gameKeys || new Set(), mk = window.mobileKeys || {};
    return {
      up: keys.has('arrowup') || keys.has('w') || !!mk.up, down: keys.has('arrowdown') || !!mk.down,
      right: keys.has('arrowright') || keys.has('d') || !!mk.right, left: keys.has('arrowleft') || keys.has('a') || !!mk.left,
      jump: keys.has(' ') || keys.has('w') || keys.has('arrowup') || !!mk.jump,
    };
  };
  // hit a foe: damage, knockback, stun and a hit spark (Smash reads the damage and knockback as percent and launch)
  FK.hit = function (S, e, dmg, o) {
    o = o || {};
    e.hp = Math.max(0, (e.hp || 1) - Math.max(1, Math.round(dmg)));
    e.hitFlash = 0.5;
    if (o.stun) e.stunTimer = Math.max(e.stunTimer || 0, o.stun);
    if (!e._noKnockback) { if (o.kx != null) e.vx = o.kx; if (o.ky != null) e.vy = o.ky; }
    if (S) S.fx.push({ k: 'spark', x: FK.ex(e), y: FK.ey(e), ang: Math.atan2(o.ky || -1, o.kx || 0.001), t: 0, life: o.big ? 0.45 : 0.3, c: o.c || '#ffffff', big: !!o.big });
    if (o.big) FK.shake(o.shake || 6);
    if (o.stop) FK.hitstop(o.stop);
    if (e.hp <= 0 && !e.dead && window._killEnemy) window._killEnemy(e);
  };
  // damage over time (poison, burning, a beam's ticks): takes the health off and nothing else. No knockback, no stun,
  // no hit flash, so nothing is launched or stun-locked by it (Smash counts a hit with no flash and no push as percent only)
  FK.chip = function (S, e, dmg, c) {
    e.hp = Math.max(0, (e.hp || 1) - dmg);
    if (S && c) S.fx.push({ k: 'ring', x: FK.ex(e), y: FK.ey(e), R: 0.5, c, t: 0, life: 0.2 });
    if (e.hp <= 0 && !e.dead && window._killEnemy) window._killEnemy(e);
  };
  FK.label = function (S, p, text, c, big) { S.fx.push({ k: 'pop', x: FK.pcx(p), y: p.y - 0.25, t: 0, life: big ? 0.85 : 0.6, text, c: c || '#ffffff', big: !!big }); };

  // ---------------------------------------------------------------- drawing helpers (screen space)
  FK.glow = function (ctx, col, a) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.fillStyle = col; ctx.strokeStyle = col; };
  FK.solid = function (ctx, col, a) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a == null ? 1 : Math.max(0, Math.min(1, a)); ctx.fillStyle = col; ctx.strokeStyle = col; };
  // a ribbon through points, thick at the start and pointed at the end
  FK.taper = function (ctx, pts, w0, col, a, core) {
    if (pts.length < 2) return;
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
      const w = w0 * Math.pow(1 - i / (pts.length - 1), 0.7);
      L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
    }
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]); for (const q of L) ctx.lineTo(q[0], q[1]); for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]); ctx.closePath();
    FK.glow(ctx, col, a * 0.85); ctx.fill();
    if (core !== false) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); FK.glow(ctx, '#ffffff', a * 0.7); ctx.lineWidth = Math.max(1, w0 * 0.25); ctx.stroke(); }
  };
  // a crescent along an arc, tapered at both ends (sweeps, swings)
  FK.crescent = function (ctx, cx, cy, r, a0, a1, thick, col, a) {
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    const n = 20; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const an = a0 + (a1 - a0) * i / n; ctx.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
    for (let i = n; i >= 0; i--) { const u = i / n, an = a0 + (a1 - a0) * u, rr = r - thick * Math.sin(Math.PI * u); ctx.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr); }
    ctx.closePath(); FK.glow(ctx, col, a); ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= n; i++) { const an = a0 + (a1 - a0) * i / n; ctx.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
    FK.glow(ctx, '#ffffff', a * 0.9); ctx.lineWidth = 1.5; ctx.stroke();
  };
  FK.star = function (ctx, x, y, r, rot, col, a, pts) {
    pts = pts || 4; ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) { const an = rot + i * Math.PI / pts, rr = i % 2 ? r * 0.28 : r; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    ctx.closePath(); FK.glow(ctx, col, a); ctx.fill();
  };
  // a ground shockwave: a flat ring plus chunks of floor thrown up
  FK.shock = function (ctx, x, fy, R, u, col, T) {
    const a = 1 - u, r = R * (0.25 + 0.75 * FK.easeOut(u * 1.6));
    ctx.beginPath(); ctx.ellipse(x, fy, r, r * 0.22, 0, 0, Math.PI * 2); FK.glow(ctx, col, a); ctx.lineWidth = 6 * a + 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, fy, r * 0.7, r * 0.15, 0, 0, Math.PI * 2); FK.glow(ctx, '#ffffff', a * 0.7); ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const s = i % 2 ? 1 : -1, d = (0.25 + (i * 0.37 % 1) * 0.75) * r, hgt = Math.sin(Math.min(1, u * 1.4) * Math.PI) * T * (0.4 + (i * 0.53 % 1) * 0.6);
      FK.solid(ctx, i % 3 ? '#8a7a6a' : '#b8a690', a); ctx.save(); ctx.translate(x + s * d, fy - hgt); ctx.rotate(u * 8 * s + i); ctx.fillRect(-T * 0.08, -T * 0.08, T * 0.16, T * 0.13); ctx.restore();
    }
  };
  FK.popText = function (ctx, text, x, y, u, c, big) {
    const sc = (u < 0.12 ? 0.5 + u / 0.12 * 0.75 : 1.25 - Math.min(0.25, (u - 0.12) * 0.9)) * (big ? 1.35 : 1);
    ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -0.2, 1, 0, 0); ctx.scale(sc, sc);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, (1 - u) * 1.8);
    ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = '#120d1a'; ctx.strokeText(text, 0, 0);
    ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, 0, 0); ctx.restore();
  };
  // the shared effects every fighter pushes into its state: hit sparks, move titles, bursts, rings
  FK.drawFx = function (ctx, V, list, custom) {
    const T = V.T;
    for (const f of list) {
      const u = f.t / f.life, a = 1 - u;
      if (custom && custom(ctx, V, f, u, a)) continue;
      if (f.k === 'spark') {
        const x = V.SX(f.x), y = V.SY(f.y), R = T * (f.big ? 1.0 : 0.6);
        FK.star(ctx, x, y, R * (0.5 + u), f.ang + u, '#ffffff', a);
        ctx.beginPath(); ctx.arc(x, y, R * (0.4 + u * 1.1), 0, Math.PI * 2); FK.glow(ctx, f.c, a); ctx.lineWidth = 3 * a + 1; ctx.stroke();
        for (let i = 0; i < 7; i++) { const an = f.ang + (i - 3) * 0.32, r1 = R * (0.5 + u), r2 = R * (0.9 + u * 1.8); ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); ctx.lineTo(x + Math.cos(an) * r2, y + Math.sin(an) * r2); FK.glow(ctx, f.c, a); ctx.lineWidth = 2.2; ctx.stroke(); }
      } else if (f.k === 'pop') FK.popText(ctx, f.text, V.SX(f.x), V.SY(f.y) - 14 - f.t * 22, u, f.c, f.big);
      else if (f.k === 'shock') FK.shock(ctx, V.SX(f.x), V.SY(f.y), f.R * T, u, f.c || '#ffd166', T);
      else if (f.k === 'ring') { ctx.beginPath(); ctx.arc(V.SX(f.x), V.SY(f.y), T * f.R * (0.3 + 0.7 * FK.easeOut(u)), 0, Math.PI * 2); FK.glow(ctx, f.c, a); ctx.lineWidth = 4 * a + 1; ctx.stroke(); }
      else if (f.k === 'flash') { ctx.beginPath(); ctx.arc(V.SX(f.x), V.SY(f.y), T * f.R * (0.6 + u), 0, Math.PI * 2); FK.glow(ctx, f.c || '#ffffff', a * 0.55); ctx.fill(); }
      else if (f.k === 'dust') { ctx.beginPath(); ctx.arc(V.SX(f.x) + (f.vx || 0) * f.t * T, V.SY(f.y) - u * T * 0.3, T * (0.08 + u * 0.22), 0, Math.PI * 2); FK.solid(ctx, f.c || '#d8d0c4', a * 0.5); ctx.fill(); }
    }
  };

  // ---------------------------------------------------------------- the jointed body
  // pose angles in radians: 0 points straight down, + swings toward the way the fighter faces.
  //  { x, y (offset in units, + = down), lean (torso, + = forward), head, aF/aB: [shoulder, elbow], lF/lB: [hip, knee] }
  //  F = the limb nearer the camera, B = the far one. Elbows bend + (forward), knees bend - (back).
  // P (proportions in units): { hip, torso, neck, head, ua, fa, th, sh }
  FK.pose = function (o) { return Object.assign({ x: 0, y: 0, lean: 0, head: 0, aF: [0.2, 0.4], aB: [-0.2, 0.4], lF: [0.1, -0.1], lB: [-0.1, -0.1] }, o || {}); };
  FK.lerpPose = function (a, b, u) {
    const o = {};
    for (const k in b) {
      const va = a[k], vb = b[k];
      if (Array.isArray(vb)) o[k] = [(va ? va[0] : vb[0]) + (vb[0] - (va ? va[0] : vb[0])) * u, (va ? va[1] : vb[1]) + (vb[1] - (va ? va[1] : vb[1])) * u];
      else if (typeof vb === 'number') o[k] = (va == null ? vb : va) + (vb - (va == null ? vb : va)) * u;
      else o[k] = vb;
    }
    return o;
  };
  // keyframes [[t, pose], ...] sampled at time t with smoothstep between frames
  FK.keyed = function (frames, t) {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) if (t <= frames[i][0]) { const [t0, p0] = frames[i - 1], [t1, p1] = frames[i]; return FK.lerpPose(p0, p1, FK.ease((t - t0) / (t1 - t0))); }
    return frames[frames.length - 1][1];
  };
  FK.skel = function (P, q, cx, fy, s) {
    const hip = [cx + q.x * s, fy - P.hip * s + q.y * s];
    const dir = a => [Math.sin(a), Math.cos(a)];
    const neck = [hip[0] + Math.sin(q.lean) * P.torso * s, hip[1] - Math.cos(q.lean) * P.torso * s];
    const ha = q.lean + q.head, head = [neck[0] + Math.sin(ha) * (P.neck + P.head) * s, neck[1] - Math.cos(ha) * (P.neck + P.head) * s];
    const arm = (A, side) => { const sh = [neck[0] + side * s * 0.6, neck[1] + s * 0.8]; const d1 = dir(A[0]), el = [sh[0] + d1[0] * P.ua * s, sh[1] + d1[1] * P.ua * s]; const d2 = dir(A[0] + A[1]); return [sh, el, [el[0] + d2[0] * P.fa * s, el[1] + d2[1] * P.fa * s]]; };
    const leg = (L, side) => { const h = [hip[0] + side * s * 0.5, hip[1]]; const d1 = dir(L[0]), kn = [h[0] + d1[0] * P.th * s, h[1] + d1[1] * P.th * s]; const d2 = dir(L[0] + L[1]); return [h, kn, [kn[0] + d2[0] * P.sh * s, kn[1] + d2[1] * P.sh * s]]; };
    return { hip, neck, head, hr: P.head * s, aF: arm(q.aF, 1), aB: arm(q.aB, -1), lF: leg(q.lF, 1), lB: leg(q.lB, -1), lean: q.lean, s };
  };
  FK.limb = function (ctx, pts, w, col, w2) {
    ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke();
    ctx.lineWidth = w2 || w; ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke();
  };
  // the house style's big eyes: white, a dark pupil looking forward, a shine. o: { pupil, angry, glow, lid }
  FK.eyes = function (ctx, x, y, r, gap, o) {
    o = o || {};
    for (const dx of [0, gap]) {
      const ex2 = x + dx;
      if (o.glow) { ctx.shadowBlur = r * 1.5; ctx.shadowColor = o.glow; ctx.fillStyle = o.glow; ctx.beginPath(); ctx.ellipse(ex2, y, r * 0.9, r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; continue; }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(ex2, y, r * 0.85, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = o.pupil || '#16121f'; ctx.beginPath(); ctx.arc(ex2 + r * 0.25, y + r * 0.08, r * 0.52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex2 + r * 0.42, y - r * 0.18, r * 0.18, 0, Math.PI * 2); ctx.fill();
      if (o.lid) { ctx.fillStyle = o.lid; ctx.beginPath(); ctx.ellipse(ex2, y - r * 0.55, r * 0.95, r * 0.5, 0, Math.PI, Math.PI * 2); ctx.fill(); }
    }
    if (o.angry) { ctx.strokeStyle = o.angry; ctx.lineWidth = r * 0.35; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - r * 0.8, y - r * 1.25); ctx.lineTo(x + r * 0.6, y - r * 0.85); ctx.moveTo(x + gap - r * 0.6, y - r * 0.85); ctx.lineTo(x + gap + r * 0.8, y - r * 1.25); ctx.stroke(); }
  };
  // a soft rounded body block (chunky, slightly shaded) in the torso's own frame: from the hips up L, w wide
  FK.blob = function (ctx, w, L, col, col2, r) {
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, col2 || col); g.addColorStop(0.6, col); g.addColorStop(1, col);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-w / 2, -L, w, L + r * 0.4, r); ctx.fill();
  };
  // a round fist / mitt
  FK.mitt = function (ctx, x, y, r, col, rim) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.arc(x, y, r * 0.9, -0.6, 1.3); ctx.stroke(); } };
  // body-local point (forward/up offsets from a joint along the torso) in screen space, facing f
  FK.local = function (V, p, f, lx, ly) { return [V.SX(FK.pcx(p) + f * lx), V.SY(p.y + p.h - ly)]; };

  // ---------------------------------------------------------------- shared by the newer fighters (Fizz, Maul, Masque)
  // run / idle / jump / fall poses from the body's own motion. PO needs idle, jump and fall; extra is merged into the run pose
  FK.locomotion = function (S, p, dt, PO, extra) {
    if (p.onGround && Math.abs(p.vx || 0) > 0.8) {
      S.run = (S.run || 0) + dt * Math.abs(p.vx) * 1.7; const r = S.run, sw = Math.sin(r);
      return FK.pose(Object.assign({ y: 0.3 - Math.abs(Math.cos(r)) * 0.8, lean: 0.22, aF: [0.2 + sw * 0.9, 0.7], aB: [0.2 - sw * 0.9, 0.7],
        lF: [0.15 + sw * 0.8, -0.3 - Math.max(0, Math.cos(r)) * 1.2], lB: [0.15 - sw * 0.8, -0.3 - Math.max(0, -Math.cos(r)) * 1.2] }, extra || {}));
    }
    if (p.onGround) return FK.pose(Object.assign({}, PO.idle, { y: (PO.idle.y || 0) + 0.4 * Math.sin(performance.now() / 1000 * 2.4) }));
    return (p.vy || 0) < 0 ? PO.jump : PO.fall;
  };
  // stand on something the fighter made (a bubble, a pillar): a one-way top from x0 to x1 at height top. ↓ drops through
  FK.stand = function (p, top, x0, x1) {
    if (FK.keys().down || (p.vy || 0) < 0) return false;
    const cx = FK.pcx(p), feet = p.y + p.h;
    if (cx < x0 - 0.2 || cx > x1 + 0.2 || feet < top - 0.08 || feet > top + 0.5) return false;
    if (FK.blocked(p.x, top - p.h, p.w, p.h - 0.05)) return false;
    p.y = top - p.h; p.vy = 0; p.onGround = true;
    if (window._setJumpCount) window._setJumpCount(0);
    return true;
  };
  // mend the fighter: hearts in the main game (pts bank up to a heart), percent off in Smash
  FK.heal = function (S, p, pts, c) {
    if (!(pts > 0)) return;
    S.healT = 0.7; FK.tone(1175, { dur: 0.12, vol: 0.06, type: 'sine' });
    if (FK.inSmash()) { const sm = window.__smash; if (sm && sm.__heal) sm.__heal(pts); return; }
    if (window._fighterPass) return;
    S.bank = (S.bank || 0) + pts * 0.3;
    if (S.bank < 1) return;
    if ((p.hp || 0) < (p.maxHp || 0)) {
      p.hp = Math.min(p.maxHp, p.hp + 1); S.bank -= 1; FK.label(S, p, '+1 ♥', c || '#7dffb0', true);
      for (let i = 0; i < 3; i++) FK.tone(784 * Math.pow(1.26, i), { dur: 0.2, vol: 0.09, delay: i * 0.06, type: 'sine' });
    } else S.bank = 1;
  };
  FK.moveX = function (p, dx) { const nx = p.x + dx; if (!FK.blocked(nx, p.y + 0.02, p.w, p.h - 0.04)) { p.x = nx; return true; } return false; };
  // the floor under a point (first blocked tile going down, at most n tiles), or null
  FK.floorAt = function (x, y, n) { for (let i = 0; i <= (n || 6) * 4; i++) { const yy = y + i * 0.25; if (FK.blocked(x - 0.05, yy, 0.1, 0.1)) return Math.floor(yy); } return null; };

  // ---------------------------------------------------------------- power-up forms (M-Man, L-Brother)
  // Tasks fill up as you play. A finished task puts a TOOL CRATE in the air above you: jump up into it (bump it with your
  // head) and the power-up pops out of the top, then slides along the floor. Catch it to take that form.
  // A form lasts FORM_T seconds, and two hits taken knock you back to normal. Works the same in the main game and Smash.
  //  spec.tasks: [{ id, kind: 'hits' | 'air' | 'dist' | any counter name you feed with PU.add, need, form, label }]
  //  spec.forms: { formId: { name, icon, c } }       spec.drawItem(ctx, x, y, r, formId, t)
  FK.powerups = function (spec) {
    const FORM_T = spec.time || 24, ITEM_LIFE = 14;
    const PU = {
      init: () => ({ n: {}, items: [], crates: [], form: null, formT: 0, armor: 0, lastX: null, lastHp: null, wasStun: false, flash: 0, cue: 0 }),
      add(S, kind, v) { const u = S.pu; if (!u) return; u.n[kind] = (u.n[kind] || 0) + (v == null ? 1 : v); },
      form: S => (S.pu && S.pu.form) || null,
      set(S, p, f) {
        const u = S.pu; u.form = f; u.formT = f ? FORM_T : 0; u.armor = f ? 2 : 0; u.flash = 0.6;
        if (f) {
          const F = spec.forms[f];
          FK.label(S, p, F.name + '!', F.c, true); FK.msg(F.icon + ' ' + F.name + ' FORM!');
          for (let i = 0; i < 4; i++) FK.tone(523 * Math.pow(1.19, i), { dur: 0.16, vol: 0.12, delay: i * 0.06, type: 'square' });
          S.fx.push({ k: 'ring', x: FK.pcx(p), y: FK.pcy(p), R: 2.2, c: F.c, t: 0, life: 0.5 });
          if (spec.onForm) spec.onForm(p, S, f);
        } else {
          FK.label(S, p, 'POWER LOST', '#cfd6e6', false); FK.tone(440, { dur: 0.35, vol: 0.12, slide: 140, type: 'square' });
          if (spec.onForm) spec.onForm(p, S, null);
        }
      },
      tick(p, dt, S) {
        const u = S.pu; if (!u) return;
        // automatic tasks: time in the air, distance travelled
        if (!p.onGround) u.n.air = (u.n.air || 0) + dt;
        if (u.lastX != null) { const d = Math.abs(p.x - u.lastX); if (d < 2) u.n.dist = (u.n.dist || 0) + d; }
        u.lastX = p.x;
        // a finished task drops its power-up (one of each kind on the field at a time)
        for (const tk of spec.tasks) {
          if ((u.n[tk.kind] || 0) < tk.need) continue;
          u.n[tk.kind] = 0;
          if (u.items.some(it => it.form === tk.form) || u.crates.some(c => c.form === tk.form) || u.form === tk.form) continue;
          // the crate: about two tiles over his head (lower under a low ceiling); with no room at all, the power-up comes straight out
          const f = FK.face(p); let cx = FK.pcx(p) + f * 0.6, cy = null;
          for (const up of [2.6, 2.1, 1.7]) { const y = p.y - up; if (!FK.blocked(cx - 0.5, y - 0.5, 1, 1) && !FK.blocked(cx - 0.4, y + 0.5, 0.8, up - 0.5)) { cy = y; break; } }
          if (cy != null) u.crates.push({ form: tk.form, x: cx, y: cy, t: 0, bump: 0 });
          else u.items.push({ form: tk.form, x: FK.pcx(p), y: p.y - 0.6, vx: f * 3.4, vy: -6, t: 0, ph: Math.random() * 6 });
          FK.label(S, p, tk.label + ' ✓', spec.forms[tk.form].c, true);
          FK.tone(880, { dur: 0.12, vol: 0.1, type: 'square' }); FK.tone(1320, { dur: 0.18, vol: 0.1, delay: 0.08, type: 'square' });
        }
        // crates wait for a head bump from below; then the power-up rises out of the top and slides off
        const cx = FK.pcx(p), cy = FK.pcy(p);
        for (let i = u.crates.length - 1; i >= 0; i--) {
          const c = u.crates[i]; c.t += dt; if (c.bump > 0) c.bump -= dt;
          if (c.t > 30) { u.crates.splice(i, 1); continue; }
          const head = p.y, under = Math.abs(cx - c.x) < 0.5 + p.w / 2 && head < c.y + 0.6 && head > c.y - 0.2;
          if (under && (p.vy || 0) < 0 && !c.open) {
            c.open = true; c.bump = 0.25; p.vy = Math.max(p.vy, 2); p.y = Math.max(p.y, c.y + 0.5);
            FK.tone(196, { dur: 0.1, vol: 0.2, type: 'square' }); FK.tone(392, { dur: 0.25, vol: 0.12, delay: 0.08, type: 'square', slide: 784 });
            u.items.push({ form: c.form, x: c.x, y: c.y - 0.5, vx: 0, vy: 0, rise: 0.45, dir: FK.face(p), t: 0, ph: 0 });
          }
          if (c.open && c.bump <= 0) { S.fx.push({ k: 'ring', x: c.x, y: c.y, R: 0.9, c: spec.forms[c.form].c, t: 0, life: 0.3 }); u.crates.splice(i, 1); }
        }
        // items: rise out of the crate, then slide along the floor (turning at walls), and are picked up by touch
        for (let i = u.items.length - 1; i >= 0; i--) {
          const it = u.items[i]; it.t += dt;
          if (it.t > ITEM_LIFE) { u.items.splice(i, 1); continue; }
          if (it.rise > 0) { it.rise -= dt; it.y -= dt * 1.6; if (it.rise <= 0) { it.vx = (it.dir || 1) * 3.4; it.vy = 0; } }
          else if (it.vx != null) {
            it.vy = Math.min(14, (it.vy || 0) + 30 * dt);
            const nx = it.x + it.vx * dt; if (FK.blocked(nx - 0.35, it.y - 0.3, 0.7, 0.6)) it.vx = -it.vx; else it.x = nx;
            const ny = it.y + it.vy * dt; if (FK.blocked(it.x - 0.3, ny - 0.3, 0.6, 0.65)) it.vy = 0; else it.y = ny;
            if (it.y > p.y + 40) { u.items.splice(i, 1); continue; }
          }
          if (it.t > 0.25 && Math.abs(cx - it.x) < 0.95 && Math.abs(cy - it.y) < 1.1) { u.items.splice(i, 1); PU.set(S, p, it.form); }
        }
        // hits taken: hearts lost in the main game, hitstun in Smash. Two hits end the form.
        const hurt = (u.lastHp != null && p.hp < u.lastHp) || (p.hitstun > 0 && !u.wasStun);
        u.lastHp = p.hp; u.wasStun = p.hitstun > 0;
        if (hurt && u.form) { u.armor--; u.flash = 0.4; if (u.armor <= 0) PU.set(S, p, null); }
        if (u.form) { u.formT -= dt; if (u.formT <= 0) PU.set(S, p, null); }
        if (u.flash > 0) u.flash -= dt;
      },
      // the items in the world, and a small tracker over the head: a ring per task, filling up
      draw(ctx, V, S) {
        const u = S.pu; if (!u) return;
        const T = V.T, p = V.p;
        for (const c of u.crates) {   // a wooden tool crate with a glowing bolt badge in the form's colour, bumping up when hit
          const F = spec.forms[c.form], x = V.SX(c.x), y = V.SY(c.y) - (c.bump > 0 ? Math.sin((0.25 - c.bump) / 0.25 * Math.PI) * T * 0.3 : 0) - Math.sin(V.now * 2) * 2, h = T * 0.5;
          const pop = Math.min(1, c.t / 0.25);
          ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
          ctx.beginPath(); ctx.arc(0, 0, h * 1.5, 0, Math.PI * 2); FK.glow(ctx, F.c, 0.12 + 0.06 * Math.sin(V.now * 5)); ctx.fill();
          FK.solid(ctx, '#b07a3c', 1); ctx.beginPath(); ctx.roundRect(-h, -h, h * 2, h * 2, h * 0.18); ctx.fill();
          FK.solid(ctx, '#7a4f22', 1); ctx.lineWidth = h * 0.16; ctx.strokeRect(-h * 0.92, -h * 0.92, h * 1.84, h * 1.84);
          ctx.beginPath(); ctx.moveTo(-h * 0.85, -h * 0.85); ctx.lineTo(h * 0.85, h * 0.85); ctx.moveTo(h * 0.85, -h * 0.85); ctx.lineTo(-h * 0.85, h * 0.85); ctx.lineWidth = h * 0.12; ctx.stroke();
          FK.solid(ctx, '#d9d2c4', 1); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(a * h * 0.78, b * h * 0.78, h * 0.08, 0, Math.PI * 2); ctx.fill(); }
          ctx.beginPath(); ctx.arc(0, 0, h * 0.42, 0, Math.PI * 2); FK.solid(ctx, '#2b2b33', 1); ctx.fill();
          ctx.font = (h * 0.55 | 0) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; FK.solid(ctx, '#fff', 1); ctx.fillText(F.icon, 0, h * 0.04);
          ctx.restore();
        }
        for (const it of u.items) {
          const blink = it.t > ITEM_LIFE - 3 && Math.sin(V.now * 26) < 0;
          if (blink) continue;
          const x = V.SX(it.x), y = V.SY(it.y), r = T * 0.42 * Math.min(1, 0.4 + it.t / 0.4), F = spec.forms[it.form];
          ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, Math.PI * 2); FK.glow(ctx, F.c, 0.18 + 0.08 * Math.sin(V.now * 6)); ctx.fill();
          for (let k = 0; k < 6; k++) { const an = V.now * 1.6 + k * Math.PI / 3; FK.star(ctx, x + Math.cos(an) * r * 1.45, y + Math.sin(an) * r * 1.45, r * 0.18, an, F.c, 0.8); }
          FK.solid(ctx, '#fff', 1); ctx.save(); spec.drawItem(ctx, x, y, r, it.form, V.now); ctx.restore();
        }
        if (!p) return;
        const hx = V.SX(FK.pcx(p)), hy = V.SY(p.y) - T * 0.55, n = spec.tasks.length;
        if (u.form) {
          const F = spec.forms[u.form], k = Math.max(0, u.formT / FORM_T);
          ctx.beginPath(); ctx.arc(hx, hy, T * 0.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); FK.glow(ctx, F.c, 0.9); ctx.lineWidth = 3; ctx.stroke();
          FK.solid(ctx, '#fff', 0.95); ctx.font = (T * 0.22 | 0) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(F.icon, hx, hy + 1);
          for (let a = 0; a < u.armor; a++) { ctx.beginPath(); ctx.arc(hx - T * 0.12 + a * T * 0.24, hy + T * 0.3, T * 0.05, 0, Math.PI * 2); FK.solid(ctx, F.c, 0.9); ctx.fill(); }
          return;
        }
        for (let i = 0; i < n; i++) {
          const tk = spec.tasks[i], k = Math.min(1, (u.n[tk.kind] || 0) / tk.need), x = hx + (i - (n - 1) / 2) * T * 0.34, F = spec.forms[tk.form];
          if (k <= 0.02) continue;
          ctx.beginPath(); ctx.arc(x, hy, T * 0.11, 0, Math.PI * 2); FK.solid(ctx, 'rgba(10,10,20,0.55)', 1); ctx.fill();
          ctx.beginPath(); ctx.arc(x, hy, T * 0.11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); FK.glow(ctx, F.c, 0.9); ctx.lineWidth = 2.5; ctx.stroke();
        }
      },
    };
    return PU;
  };

  // ---------------------------------------------------------------- parry outside Smash
  const bolts = [];
  window.PPParry = {
    parry(proj) {
      const p = window._gamePlayer; if (!p) return;
      p._parryT = 0; p._protagRetaliateTimer = 0; p._parried = 0.45;
      p.hpInvuln = Math.max(p.hpInvuln || 0, 0.5);
      const cx = FK.pcx(p), cy = FK.pcy(p), list = FK.foes();
      let near = null, nd = 99, any = null, ad = 99;
      for (const e of list) { const d = Math.hypot(FK.ex(e) - cx, FK.ey(e) - cy); if (d < nd) { nd = d; near = e; } if (d < ad && d < 16) { ad = d; any = e; } }
      FK.hitstop(0.08); FK.shake(6); FK.tone(1200, { dur: 0.12, vol: 0.18 }); FK.tone(1800, { dur: 0.2, vol: 0.12, delay: 0.03 });
      const melee = !proj && near && nd < 2.8;
      p._parryFar = !melee; p._parryDir = near ? (Math.sign(FK.ex(near) - cx) || 1) : FK.face(p);
      if (melee) {
        if (p._parryGrab) {}   // a grappler's parry turns into its own grab
        else if (window.selectedCharacter === 'cb_protagonist' && window.protagFireRetaliateCounter) window.protagFireRetaliateCounter();
        else for (const e of list) if (Math.hypot(FK.ex(e) - cx, FK.ey(e) - cy) < 2.8) FK.hit(null, e, 3, { kx: (Math.sign(FK.ex(e) - cx) || 1) * 11, ky: -7, stun: 0.6 });
        FK.msg('🛡️ PARRY!');
      } else {
        const b = { x: cx, y: cy, tgt: any, t: 0, trail: [], vx: 0, vy: 0, dmg: 3 };
        if (!any && proj) { b.vx = -(proj.vx || 0) * 1.6; b.vy = -(proj.vy || 0) * 1.6; }
        bolts.push(b);
        FK.msg('🛡️ REFLECT!');
      }
    },
    bolts,
  };
  (window._rafHubTickers = window._rafHubTickers || []).push(function (dt) {
    const p = window._gamePlayer;
    if (p && p._parried > 0) p._parried -= dt;
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.t += dt; b.trail.push([b.x, b.y]); if (b.trail.length > 8) b.trail.shift();
      if (b.tgt && !b.tgt.dead) {
        const dx = FK.ex(b.tgt) - b.x, dy = FK.ey(b.tgt) - b.y, d = Math.hypot(dx, dy) || 1, sp = 24 * dt;
        if (d < sp + 0.5) { FK.hit(null, b.tgt, b.dmg, { kx: Math.sign(dx || 1) * 9, ky: -6, stun: 0.5 }); bolts.splice(i, 1); continue; }
        b.x += dx / d * sp; b.y += dy / d * sp;
      } else { b.x += b.vx * dt; b.y += b.vy * dt; }
      if (b.t > 2.5) bolts.splice(i, 1);
    }
  });
  const _prevDraw = window.drifterDrawHook;
  window.drifterDrawHook = function (ctx, now2, cam) {
    if (_prevDraw) _prevDraw(ctx, now2, cam);
    if (!bolts.length) return;
    const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0;
    ctx.save();
    for (const b of bolts) {
      b.trail.forEach((q, j) => { const a = (j + 1) / b.trail.length; FK.glow(ctx, '#7cdbff', 0.5 * a); ctx.beginPath(); ctx.arc(q[0] * T - cx0, q[1] * T - cy0, T * 0.22 * a, 0, Math.PI * 2); ctx.fill(); });
      FK.glow(ctx, '#ffffff', 1); ctx.beginPath(); ctx.arc(b.x * T - cx0, b.y * T - cy0, T * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  // what the other phone needs to draw this fighter's body mid-move (online play)
  FK._states = {};
  FK.netState = function () {
    const f = FK._states[window.selectedCharacter]; if (!f) return null;
    const S = f(); if (!S || !S.pose) return null;
    const pose = {}; for (const k in S.pose) { const v = S.pose[k]; pose[k] = Array.isArray(v) ? v.map(n => Math.round(n * 100) / 100) : typeof v === 'number' ? Math.round(v * 100) / 100 : v; }
    return { pose, rot: S.rot ? Math.round(S.rot * 100) / 100 : 0, pr: S.pr || 0, invis: S.invis > 0 ? S.invis : 0, reveal: S.reveal > 0 ? 1 : 0, charge: S.charge || 0, jav: S.jav ? 1 : 0, w: FK.snapWorld(S) };
  };
  // What the other phone needs to draw this fighter's world (projectiles, kites, pillars, items, hit sparks, move names):
  // a plain copy of the state, numbers rounded, Maps / Sets / functions left out, an enemy reference cut down to where
  // it is. Capped in size so the link stays quick.
  const SKIP = { pose: 1, target: 1, goal: 1, anim: 1, seq: 1, rate: 1, run: 1, walk: 1, lastPX: 1, lastPY: 1, prevJump: 1, selfMove: 1, atkCD: 1, active: 1, bank: 1 };
  function clean(v, d) {
    if (v == null) return v;
    const t = typeof v;
    if (t === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : 0;
    if (t === 'string' || t === 'boolean') return v;
    if (t !== 'object' || d > 4 || v instanceof Map || v instanceof Set || (typeof Node !== 'undefined' && v instanceof Node)) return undefined;
    if (Array.isArray(v)) { const a = []; for (let i = 0; i < v.length && i < 40; i++) { const c = clean(v[i], d + 1); if (c !== undefined) a.push(c); } return a; }
    if (typeof v.hp === 'number' && typeof v.x === 'number') return { x: clean(v.x, 9), y: clean(v.y, 9), w: v.w || 0.9, h: v.h || 0.9 };   // a foe
    const o = {}; for (const k in v) { if (d === 0 && SKIP[k]) continue; const c = clean(v[k], d + 1); if (c !== undefined) o[k] = c; }
    return o;
  }
  FK.snapWorld = function (S) {
    try {
      let w = clean(S, 0), n = JSON.stringify(w).length;
      if (n > 9000 && w.fx) { w.fx = w.fx.filter(f => f.k === 'pop').slice(-4); n = JSON.stringify(w).length; }   // too much going on: keep the move names, drop the sparks
      return n > 12000 ? null : w;
    } catch (e) { return null; }
  };
  // draw another phone's fighter world from that copy. body: where their fighter is ({ x, y, w, h, dashDir })
  FK._defs = {};
  FK.drawRemote = function (char, w, body, ctx, cam) {
    const C = FK._defs[char]; if (!C || !w || !ctx) return;
    const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0;
    const p = Object.assign({ w: 0.9, h: 0.9, vx: 0, vy: 0, onGround: true }, body); p.lastMoveDir = p.dashDir || 1;
    const V = { T, SX: x => x * T - cx0, SY: y => y * T - cy0, now: performance.now() / 1000, p, remote: true };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowBlur = 0;
    try { if (C.drawWorld) C.drawWorld(ctx, V, w); } catch (e) {}
    try { FK.drawFx(ctx, V, w.fx || [], C.drawFx); } catch (e) {}
    ctx.restore();
  };

  // ---------------------------------------------------------------- define a fighter
  // spec: { id, plug, def, stats, statMod(S), moves, mfd, fresh(), can(key,S,p), pressS(p,S,k), busy(S),
  //         act: { ground_neutral(p,f,pw,S) -> optional title, ... }, step(p,dt,S,k,jumpEdge), onTeleport(p,S),
  //         drawBody(ctx,px,py,pw,ph,t,S,p), drawWorld(ctx,V,S), drawFx(ctx,V,f,u,a) -> true if handled, ai(info), keys }
  FK.define = function (C) {
    const ID = C.id;
    const fresh = () => Object.assign({ active: false, atkCD: 0, fx: [], lastPX: null, lastPY: null, prevJump: false }, C.fresh());
    let S = fresh();
    if (!C.locked) try {   // (a locked fighter is owned only once something unlocks it)
      const owned = JSON.parse(localStorage.getItem('obby_cbox_owned') || '[]');
      if (!owned.includes(ID)) { owned.push(ID); localStorage.setItem('obby_cbox_owned', JSON.stringify(owned)); }
    } catch (e) {}
    const isOwned = () => { try { return JSON.parse(localStorage.getItem('obby_cbox_owned') || '[]').includes(ID); } catch (e) { return false; } };
    const stats = () => Object.assign({}, C.stats, C.statMod ? C.statMod(S) : {});
    let statKey = '';
    const syncStats = force => {
      const st = stats(), key = JSON.stringify(st);
      if (!force && key === statKey) return; statKey = key;
      window._gtCharStatCache = window._gtCharStatCache || {}; window._gtCharStatCache[ID] = st;
    };
    const register = () => {
      if (window.CBOX_CHARS_DEF && !window.CBOX_CHARS_DEF.find(c => c.id === ID)) window.CBOX_CHARS_DEF.push(Object.assign({ id: ID }, C.def));
      if (window.cboxOwnedChars) window.cboxOwnedChars.add(ID);
      syncStats(true);
    };
    if (window.UNIVERSAL_PUNCH_EXCLUDED_CHARS) window.UNIVERSAL_PUNCH_EXCLUDED_CHARS.add(ID);
    // the body is posed by the fighter itself: the strike engine leaves it alone
    if (window.PPStrikeStyles) window.PPStrikeStyles[ID] = { ownAim: true, windup: () => ({}), live: () => ({}), endlag: () => ({}) };

    const _prevSlash = window.performSlash;
    window.performSlash = function () {
      if (window.selectedCharacter !== ID) { if (_prevSlash) return _prevSlash.apply(this, arguments); return; }
      const p = window._gamePlayer; if (!p) return;
      if (C.pressS && C.pressS(p, S, FK.keys())) return;
      if (S.atkCD > 0 || (C.busy && C.busy(S))) return;
      const pick = () => {
        const q = window._gamePlayer; if (!q || window.selectedCharacter !== ID || (C.busy && C.busy(S))) return null;
        const k = FK.keys(), stance = (q.onGround || (S.airT || 0) < 0.12) ? 'ground' : 'air';   // (↑ is also jump: ↑ + S on the ground is still the ground move)
        const dir = (k.down && !k.up) ? 'down' : (k.up && !k.down) ? 'up' : (k.left || k.right) ? 'side' : 'neutral';
        const key = stance + '_' + dir, mv = C.moves[stance][dir];
        const no = C.can ? C.can(key, S, q) : null; if (no) { FK.msg(C.def.icon + ' ' + no); return null; }
        return { key, mv, f: k.right ? 1 : k.left ? -1 : FK.face(q) };
      };
      const fire = (sel, pw) => {
        const q = window._gamePlayer; if (!q) return;
        pw = pw || 0; S.atkCD = sel.mv.cd;
        q.dashDir = sel.f; q.lastMoveDir = sel.f;
        const own = C.act[sel.key](q, sel.f, pw, S);
        const name = own || (pw > 0.3 && sel.mv.big ? sel.mv.big : sel.mv.name.toUpperCase());
        FK.label(S, q, name, pw > 0.3 || own ? C.def.color2 || '#ffd166' : C.def.color, pw > 0.3);
        FK.msg(C.def.icon + ' ' + name + '!');
      };
      if (window.PPStrike) {
        window.PPStrike.press(() => { const sel = pick(); return sel && { fd: C.mfd[sel.key] || {}, dir: sel.f, color: C.def.color, aim: sel.key.split('_')[1], fire: pw => fire(sel, pw) }; }, true);
        return;
      }
      const sel = pick(); if (sel) fire(sel, 0);
    };

    function step(dt) {
      const playing = window.selectedCharacter === ID && (!window._gameMode || window._gameMode() === 'play');
      if (!playing) { if (S.active) { const f = fresh(); for (const k in S) delete S[k]; Object.assign(S, f); } S.active = false; return; }
      const p = window._gamePlayer; if (!p) return;
      if (!S.active) { const keep = S.fx; Object.assign(S, fresh()); S.fx = keep; syncStats(true); }
      S.active = true;
      const k = FK.keys(), jumpEdge = k.jump && !S.prevJump;
      if (S.lastPX != null && (Math.abs(p.x - S.lastPX) > 4 || Math.abs(p.y - S.lastPY) > 4) && !S.selfMove) { if (C.onTeleport) C.onTeleport(p, S); }
      S.selfMove = false;
      if (S.atkCD > 0) S.atkCD = Math.max(0, S.atkCD - dt);
      if (p._parryT > 0) p._parryT = Math.max(0, p._parryT - dt);
      if (p._armorT > 0) p._armorT = Math.max(0, p._armorT - dt);
      if (p._grabInv > 0) p._grabInv = Math.max(0, p._grabInv - dt);
      if (window._fighterPass && p._parried > 0) p._parried -= dt;   // (yours wears off in PPParry's tick)
      S.airT = p.onGround ? 0 : (S.airT || 0) + dt;
      C.step(p, dt, S, k, jumpEdge);
      for (let i = S.fx.length - 1; i >= 0; i--) { S.fx[i].t += dt; if (S.fx[i].t >= S.fx[i].life) S.fx.splice(i, 1); }
      S.prevJump = k.jump; S.lastPX = p.x; S.lastPY = p.y;
      syncStats(false);
    }
    (window._rafHubTickers = window._rafHubTickers || []).push(step);

    const _origDraw = window.cboxCharDraw;
    window.cboxCharDraw = function (charId, ctx, px, py, pw, ph, now2) {
      if (charId !== ID) { if (_origDraw) return _origDraw(charId, ctx, px, py, pw, ph, now2); return; }
      if (!isFinite(px) || !isFinite(py) || !isFinite(pw) || !isFinite(ph) || pw <= 0 || ph <= 0) return;
      const p = window.selectedCharacter === ID ? window._gamePlayer : null;   // previews (menus) draw without a live body
      const rem = window.__ppRemoteDraw && window.__ppRemoteDraw.fk;           // the other phone's fighter: its own pose
      ctx.save();
      try { if (rem && rem.pose) C.drawBody(ctx, px, py, pw, ph, now2 || Date.now() / 1000, rem, null); else C.drawBody(ctx, px, py, pw, ph, now2 || Date.now() / 1000, p ? S : null, p); } catch (e) {}
      ctx.restore();
    };
    function drawWorld(ctx, cam) {
      const p = window._gamePlayer; if (!p || !S.active) return;
      const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0;
      const V = { T, SX: x => x * T - cx0, SY: y => y * T - cy0, now: performance.now() / 1000, p };
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowBlur = 0;
      try { if (C.drawWorld) C.drawWorld(ctx, V, S); } catch (e) {}
      FK.drawFx(ctx, V, S.fx, C.drawFx);
      ctx.restore();
    }
    const _prevHook = window.drifterDrawHook;
    window.drifterDrawHook = function (ctx, now2, cam) {
      if (_prevHook) _prevHook(ctx, now2, cam);
      if (window.selectedCharacter !== ID) return;
      try { drawWorld(ctx, cam); } catch (e) {}
    };
    // a second fighter (Smash CPU) playing this fighter keeps its own state; your buttons stay yours
    (window._fighterPlugins = window._fighterPlugins || []).push({ name: C.plug, char: ID,
      swap(s) { const o = S; S = s || fresh(); statKey = ''; syncStats(true); return o; },
      tick: dt => { if (window.selectedCharacter === ID) step(dt); },
      draw: (ctx, now2, cam) => { if (window.selectedCharacter === ID) drawWorld(ctx, cam); },
      keys: C.keys, ai: C.ai,
    });
    let tries = 0;
    (function hook() {
      if (!window.injectCboxCharButtons || !window.CBOX_CHARS_DEF) { if (++tries < 80) setTimeout(hook, 100); return; }
      const flag = '_fk_' + ID;
      if (!window.injectCboxCharButtons[flag]) {
        const orig = window.injectCboxCharButtons;
        window.injectCboxCharButtons = function () { if (isOwned()) register(); orig(); };
        for (const k in orig) if (k.indexOf('_') === 0) window.injectCboxCharButtons[k] = orig[k];
        window.injectCboxCharButtons[flag] = true;
      }
      if (isOwned()) { register(); window.injectCboxCharButtons(); }
    })();
    FK._states[ID] = () => S; FK._defs[ID] = C;
    return { state: () => S };
  };
})();
