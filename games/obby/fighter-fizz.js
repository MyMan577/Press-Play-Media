/* Obby Builder: FIZZ, the bubble blower. Rapid fire at long range, and a stage full of bubbles to ride.
 *
 * Every attack is a stream of small, fast bubbles: lots of little hits from far away. Four bubbles on the same foe
 * in a short time SEAL it in a bubble: it floats up helpless, and the next hit POPS it for a launch.
 *
 * THE GIMMICKS
 *  - LIFT BUBBLE (ground ↑ + S): a big bubble at your feet that floats upward. Stand on it and it carries you up
 *    (↓ drops through). It bumps foes upward. Two at a time; it pops under a ceiling or after a few seconds.
 *  - FOAM PAD (ground ↓ + S): a patch of foam on the floor. Anyone who lands on it is bounced sky-high: you, and foes.
 *  - SOAP ORBIT (air S): bubbles circle her for a while, soaking anyone they touch, while she keeps moving and attacking.
 *  - FIZZ JET (air → + S): she shakes the wand like a soda bottle and the spray rockets her forward (once per jump),
 *    leaving a trail of foam that pops on anyone who walks into it.
 *  - SPLASHDOWN (air ↓ + S): a heavy water bubble that plummets, spikes whoever it passes and bursts on the floor
 *    into two splash waves that run along the ground; she bounces back up out of the splash.
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge: more bubbles)
 *  Ground: neutral BUBBLE STREAM (SODA BLAST charged), side SUDS SLIDE, up LIFT BUBBLE, down FOAM PAD.
 *  Air:    neutral SOAP ORBIT (SOAP STORM charged), side FIZZ JET, up BUBBLE RIDE (recovery), down SPLASHDOWN (TIDAL SPLASH charged).
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_fizz';
  const C_COAT = '#ffd23f', C_COAT2 = '#e0a614', C_SKIN = '#ffd9bf', C_BOOT = '#3aa7e0', C_BOOT2 = '#2379ad', C_HAIR = '#ff7ab8', C_FX = '#8fe9ff', C_PINK = '#ff9bd6', C_WAND = '#ff6fb1';
  const P = { hip: 8.5, torso: 10, neck: -2.5, head: 9.5, ua: 4.6, fa: 4.6, th: 4.2, sh: 4.2 };
  const U = 30, pose = FK.pose, { ex, ey, pcx, pcy } = FK;

  const PO = {
    idle:  pose({ y: 0.5, lean: 0.05, aF: [0.9, 1.0], aB: [-0.2, 0.5], lF: [0.3, -0.15], lB: [-0.3, -0.1] }),
    jump:  pose({ aF: [1.4, 0.6], aB: [-0.6, 0.8], lF: [0.8, -1.3], lB: [0.1, -0.7] }),
    fall:  pose({ aF: [2.2, 0.3], aB: [-1.6, 0.4], lF: [0.4, -0.5], lB: [-0.3, -0.3] }),
    blowA: pose({ y: 1.2, lean: -0.3, head: -0.15, aF: [1.9, 1.5], aB: [-0.7, 0.6], lF: [0.5, -0.3], lB: [-0.4, -0.15] }),   // breath in: wand at the lips
    blowB: pose({ y: 1.6, lean: 0.4, head: 0.1, aF: [1.6, 0.05], aB: [-1.1, 0.4], lF: [0.9, -0.4], lB: [-0.8, -0.1] }),      // breath out: arm straight
    slide: pose({ y: 5.5, lean: -0.55, aF: [1.7, 0.1], aB: [-1.9, 0.3], lF: [1.5, -0.1], lB: [1.2, -0.9] }),
    upA:   pose({ y: 3.5, lean: 0.25, aF: [0.5, 0.4], aB: [0.4, 0.5], lF: [0.9, -1.5], lB: [-0.6, -0.9] }),                  // crouch, wand to the floor
    upB:   pose({ y: -0.5, lean: -0.1, aF: [3.0, 0.1], aB: [2.7, 0.2], lF: [0.2, -0.1], lB: [-0.2, -0.1] }),                 // both arms up
    pat:   pose({ y: 4.5, lean: 0.5, aF: [0.7, 0.2], aB: [0.9, 0.3], lF: [1.1, -1.7], lB: [-0.8, -0.8] }),
    spin:  pose({ lean: 0.1, aF: [1.6, 0.1], aB: [-1.6, 0.1], lF: [0.7, -1.1], lB: [-0.5, -0.9] }),
    ride:  pose({ y: -1, lean: 0.0, aF: [2.6, 0.4], aB: [-2.6, 0.4], lF: [0.9, -1.6], lB: [0.5, -1.5] }),                    // curled up inside the bubble
    shake: pose({ y: 0.5, lean: -0.25, aF: [2.4, 1.6], aB: [2.2, 1.7], lF: [0.9, -1.2], lB: [-0.3, -0.8] }),                  // wand held up, shaken like a soda
    jet:   pose({ y: -0.5, lean: 1.15, head: -0.6, aF: [-1.7, 0.1], aB: [-1.9, 0.2], lF: [-0.5, -0.4], lB: [-0.9, -0.2] }),     // flat out forward, the spray behind her
    twirl: pose({ y: 0.5, lean: 0.0, aF: [2.9, 0.3], aB: [-2.7, 0.3], lF: [0.6, -1.0], lB: [-0.4, -0.7] }),                   // wand over the head, stirring the orbit
    dive:  pose({ y: -2, lean: 0.0, aF: [2.9, 0.5], aB: [-2.9, 0.5], lF: [0.8, -2.0], lB: [-0.8, -2.0] }),                    // cannonball inside the bubble
  };

  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set(), n: 0 }, o || {}); }
  function wand(p, q, f) {   // the wand's ring in world tiles
    const u = p.h / U, K = FK.skel(P, q, 0, 0, u), h = K.aF[2];
    return [pcx(p) + f * (h[0] + 0.25 * Math.sin(q.aF[0] + q.aF[1])), p.y + p.h + h[1] + 0.25 * Math.cos(q.aF[0] + q.aF[1])];
  }
  function blip() { FK.tone(900 + Math.random() * 700, { dur: 0.07, vol: 0.05, type: 'sine', slide: 1700 }); }
  function pop(big) { FK.noise({ dur: 0.05, cut: 3200, q: 2, vol: big ? 0.3 : 0.16 }); FK.tone(big ? 500 : 1300, { dur: 0.09, vol: 0.1, type: 'sine', slide: big ? 1500 : 500 }); }
  function shoot(S, x, y, vx, vy, o) {
    o = o || {};
    S.shots.push({ x, y, vx, vy, t: 0, life: o.life || 0.75, r: o.r || 0.2, dmg: o.dmg || 0.7, ph: Math.random() * 6 });
    blip();
  }
  // a bubble landed on a foe: small hit, and the fourth one seals it
  function soak(S, p, e, b) {
    const dir = Math.sign(b.vx) || 1;
    const tr = S.traps.find(t => t.e === e);
    if (tr) { burst(S, p, tr, dir); return; }
    FK.hit(S, e, b.dmg, { kx: dir * 2.2, ky: -1.5, stun: 0.18, c: C_FX });
    soakCount(S, p, e, 1, dir);
  }
  // n more soaks on a foe: the fourth in a short time seals it (or, in Smash, pops it for a launch)
  function soakCount(S, p, e, n, dir) {
    const now = performance.now() / 1000;
    if (now - (e._fizzT || 0) > 1.6) e._fizzN = 0;
    e._fizzT = now; e._fizzN = (e._fizzN || 0) + n;
    if (e._fizzN >= 4 && !e.dead && !S.traps.some(t => t.e === e)) {
      e._fizzN = 0;
      if (FK.inSmash() || e._noKnockback) { FK.hit(S, e, 2, { kx: dir * 3, ky: -12, stun: 0.5, c: C_PINK, big: true }); pop(true); FK.label(S, p, 'POP!', C_PINK, true); }
      else { S.traps.push({ e, t: 0 }); FK.label(S, p, 'SEALED!', C_FX, true); FK.tone(660, { dur: 0.25, vol: 0.1, type: 'sine', slide: 1320 }); }
    }
  }
  function burst(S, p, tr, dir) {
    const i = S.traps.indexOf(tr); if (i >= 0) S.traps.splice(i, 1);
    if (tr.e.dead) return;
    FK.hit(S, tr.e, 3, { kx: dir * 6, ky: -11, stun: 0.6, c: C_PINK, big: true, stop: 0.07 });
    S.fx.push({ k: 'ring', x: ex(tr.e), y: ey(tr.e), R: 1.4, c: C_PINK, t: 0, life: 0.35 });
    pop(true); FK.label(S, p, 'POP!', C_PINK, true);
  }

  // the orbit ends: its bubbles fly straight out
  function releaseOrbit(S, p) {
    const O = S.orbit; if (!O) return; S.orbit = null;
    for (let i = 0; i < O.n; i++) { const an = O.ang + i / O.n * Math.PI * 2; shoot(S, pcx(p) + Math.cos(an) * O.R, pcy(p) + Math.sin(an) * O.R, Math.cos(an) * 12, Math.sin(an) * 12, { life: 0.4, dmg: 1 }); }
  }

  const SEQ = {
    stream(p, dt, S, q) {
      const f = q.f, n = 5 + Math.round(4 * q.pw), T0 = 0.1;
      S.target = q.t < T0 ? PO.blowA : pose(Object.assign({}, PO.blowB, { y: PO.blowB.y + Math.sin(q.t * 60) * 0.5 })); S.rate = 40;
      while (q.t >= T0 + q.n * 0.05 && q.n < n) {
        const w = wand(p, PO.blowB, f); q.n++;
        shoot(S, w[0] + f * 0.3, w[1], f * (15 + Math.random() * 2), (Math.random() - 0.5) * 2.2 - 0.6, { life: 0.72 + 0.1 * q.pw });
      }
      if (q.t > T0 + n * 0.05 + 0.14) S.seq = null;
    },
    slide(p, dt, S, q) {
      const f = q.f, D = 0.4;
      S.target = PO.slide; S.rate = 40; S.selfMove = true;
      if (!q.snd) { q.snd = 1; FK.noise({ dur: 0.4, cut: 2600, cutEnd: 900, q: 2, vol: 0.16 }); }
      const sp = (15 + 4 * q.pw) * (1 - 0.6 * FK.ease(q.t / D));
      if (!FK.moveX(p, f * sp * dt)) { S.seq = null; return; }
      p.vx = f * sp * 0.4;
      if (Math.floor(q.t * 30) !== q.d) { q.d = Math.floor(q.t * 30); S.fx.push({ k: 'suds', x: pcx(p) - f * 0.4, y: p.y + p.h - 0.1, t: 0, life: 0.5, ph: Math.random() * 6 }); }
      for (const e of FK.within(pcx(p) + f * 0.3, pcy(p) + 0.2, 1.0)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 2 + q.pw, { kx: f * 5, ky: -8, stun: 0.45, c: C_FX, big: true }); FK.smack(false); }
      if (q.t > D) S.seq = null;
    },
    lift(p, dt, S, q) {
      S.target = FK.keyed([[0, PO.idle], [0.1, PO.upA], [0.22, PO.upB], [0.4, PO.idle]], q.t); S.rate = 40;
      if (q.t < 0.3 && p.vy < 0) p.vy = 0;    // (↑ is also jump: stay put while it's blown and while it picks you up)
      if (q.t >= 0.14 && !q.done) {
        q.done = 1;
        if (S.lifts.length >= 2) { const o = S.lifts.shift(); S.fx.push({ k: 'ring', x: o.x, y: o.y, R: 1.1, c: C_FX, t: 0, life: 0.3 }); }
        const r = 0.85 + 0.2 * q.pw;
        // it swells up under your feet and picks you up as it grows: you start out riding it
        S.lifts.push({ x: pcx(p), y: p.y + p.h, r, t: 0, life: 4.6 + 1.5 * q.pw, vy: -(2.9 + 0.8 * q.pw), cool: new Map(), on: true });
        FK.tone(300, { dur: 0.3, vol: 0.14, type: 'sine', slide: 900 });
      }
      if (q.t > 0.4) S.seq = null;
    },
    pad(p, dt, S, q) {
      S.target = FK.keyed([[0, PO.idle], [0.1, PO.pat], [0.3, PO.pat], [0.42, PO.idle]], q.t); S.rate = 40;
      if (q.t >= 0.12 && !q.done) {
        q.done = 1;
        if (S.pads.length >= 2) S.pads.shift();
        S.pads.push({ x: pcx(p) + q.f * 1.6, fy: p.y + p.h, w: 1.6, t: 0, life: 10, cool: new Map(), self: 0.25, squish: 0 });
        FK.noise({ dur: 0.25, cut: 700, cutEnd: 2400, q: 3, vol: 0.2 });
      }
      if (q.t > 0.42) S.seq = null;
    },
    orbit(p, dt, S, q) {   // SOAP ORBIT: a twirl of the wand and the bubbles start circling; she is free again almost at once
      S.target = PO.twirl; S.rate = 50;
      if (!q.done) {
        q.done = 1;
        if (S.orbit) releaseOrbit(S, p);
        S.orbit = { t: 0, life: 1.6 + 0.8 * q.pw, n: 3 + Math.round(2 * q.pw), R: 1.05 + 0.25 * q.pw, cool: new Map(), dir: q.f, ang: 0 };
        FK.tone(520, { dur: 0.25, vol: 0.1, type: 'sine', slide: 1040 }); pop(false);
      }
      if (q.t > 0.18) S.seq = null;
    },
    jet(p, dt, S, q) {   // FIZZ JET: shake, then the spray rockets her forward and lays foam behind
      const f = q.f, W = 0.1, D = 0.3 + 0.12 * q.pw;
      if (q.t < W) {
        S.target = pose(Object.assign({}, PO.shake, { lean: PO.shake.lean + Math.sin(q.t * 90) * 0.15 })); S.rate = 60;
        p.vy = Math.min(p.vy, 0.5); p.vx *= 0.6;
        if (!q.snd) { q.snd = 1; FK.noise({ dur: 0.12, cut: 5000, q: 6, vol: 0.12 }); }
        return;
      }
      if (!q.go) { q.go = 1; FK.noise({ dur: D + 0.1, cut: 3800, cutEnd: 1200, q: 1.5, vol: 0.22 }); FK.tone(700, { dur: 0.2, vol: 0.08, type: 'sine', slide: 1500 }); }
      const u = (q.t - W) / D, sp = (17 + 6 * q.pw) * (1 - 0.45 * FK.ease(u));
      S.target = PO.jet; S.rate = 50; S.selfMove = true;
      if (!FK.moveX(p, f * sp * dt)) { q.t = W + D; }
      p.vx = f * sp * 0.35; p.vy = Math.min(p.vy, 0.4) * 0.5;
      if (Math.floor(q.t * 28) !== q.d) {   // foam left hanging in the air behind her, and spray from the wand
        q.d = Math.floor(q.t * 28);
        S.mines.push({ x: pcx(p) - f * 0.55, y: pcy(p) + (Math.random() - 0.4) * 0.5, t: 0, life: 0.9 + 0.4 * q.pw, r: 0.2 + Math.random() * 0.1, ph: Math.random() * 6 });
        S.fx.push({ k: 'suds', x: pcx(p) - f * 0.9, y: pcy(p) + 0.1, t: 0, life: 0.35, ph: Math.random() * 6 });
      }
      for (const e of FK.within(pcx(p) + f * 0.45, pcy(p), 0.95)) {
        if (q.hits.has(e)) continue; q.hits.add(e);
        FK.hit(S, e, 1.5 + q.pw, { kx: f * (8 + 3 * q.pw), ky: -5, stun: 0.35, c: C_FX, big: q.pw > 0.4 });
        soakCount(S, p, e, 1, f); FK.smack(false);
      }
      if (q.t > W + D) { p.vx = f * 3; S.seq = null; }
    },
    splash(p, dt, S, q) {   // SPLASHDOWN: a heavy bubble, straight down; spikes on the way, splash waves on the floor
      const W = 0.12, k = FK.keys();
      S.target = PO.dive; S.rate = 50; S.inBubble = true; S.heavy = true;
      if (q.t < W) { p.vy = Math.min(p.vy, 0) * 0.3; p.vx *= 0.5; if (!q.snd) { q.snd = 1; FK.tone(200, { dur: 0.2, vol: 0.14, type: 'sine', slide: 120 }); } return; }
      p.vy = 21 + 3 * q.pw; p.vx = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 3;
      if (!q.go) { q.go = 1; FK.whoosh(false, true); }
      for (const e of FK.within(pcx(p), pcy(p) + 0.35, 0.95 + 0.15 * q.pw)) {
        if (q.hits.has(e)) continue; q.hits.add(e);
        const tr = S.traps.find(t => t.e === e);
        if (tr) { burst(S, p, tr, FK.face(p)); continue; }
        FK.hit(S, e, 2 + q.pw, { kx: 0, ky: 15, stun: 0.45, c: C_FX, big: true, stop: 0.05 });
        soakCount(S, p, e, 2, FK.face(p)); pop(false);
      }
      if ((p.onGround && q.t > W + 0.02) || q.t > 1.4) {
        S.inBubble = false; S.heavy = false; pop(true); FK.thud(false);
        const L = 0.45 + 0.2 * q.pw;
        for (const d of [-1, 1]) S.waves.push({ x: pcx(p) + d * 0.4, fy: p.y + p.h, dir: d, t: 0, life: L, hits: new Set(), big: q.pw > 0.4 });
        S.fx.push({ k: 'ring', x: pcx(p), y: p.y + p.h - 0.2, R: 1.6 + 0.5 * q.pw, c: C_FX, t: 0, life: 0.35 });
        for (let i = 0; i < 6; i++) S.fx.push({ k: 'suds', x: pcx(p) + (Math.random() - 0.5) * 1.4, y: p.y + p.h - 0.1, t: 0, life: 0.5, ph: Math.random() * 6 });
        if (p.onGround) { p.vy = -9 - 2 * q.pw; p.onGround = false; }
        S.seq = null;
      }
    },
    ride(p, dt, S, q) {
      const k = FK.keys(), D = 0.75 + 0.25 * q.pw;
      S.target = PO.ride; S.rate = 30; S.inBubble = true;
      p.vy = -(11.5 - 5 * (q.t / D)); p.vx = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 5.5; p.onGround = false;
      if (!q.snd) { q.snd = 1; FK.tone(260, { dur: 0.5, vol: 0.14, type: 'sine', slide: 1040 }); }
      if (q.t > D || FK.blocked(p.x, p.y - 0.15, p.w, 0.1)) {
        S.seq = null; S.inBubble = false; pop(true);
        S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 1.6, c: C_FX, t: 0, life: 0.35 });
        for (const e of FK.within(pcx(p), pcy(p), 1.7)) FK.hit(S, e, 2, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 7, ky: -8, stun: 0.4, c: C_FX, big: true });
        p.vy = -6;
      }
    },
  };

  function stepWorld(p, dt, S) {
    const foes = FK.foes();
    // the soap orbit circles her; each foe it touches is soaked (once every so often)
    if (S.orbit) {
      const O = S.orbit; O.t += dt; O.ang = (O.ang || 0) + dt * 6.5 * O.dir;
      if (!p.onGround && O.t < 0.8 && (p.vy || 0) > 3.5) p.vy = 3.5;   // a gentle float while it spins up
      for (const [e, c] of O.cool) { if (c - dt <= 0) O.cool.delete(e); else O.cool.set(e, c - dt); }
      for (let i = 0; i < O.n; i++) {
        const an = O.ang + i / O.n * Math.PI * 2, bx = pcx(p) + Math.cos(an) * O.R, by = pcy(p) + Math.sin(an) * O.R;
        for (const e of foes) if (!O.cool.has(e) && Math.abs(ex(e) - bx) < 0.3 + (e.w || 0.9) / 2 && Math.abs(ey(e) - by) < 0.3 + (e.h || 0.9) / 2) {
          O.cool.set(e, 0.3); soak(S, p, e, { vx: Math.sign(ex(e) - pcx(p)) || 1, dmg: 0.8 }); blip();
        }
      }
      if (O.t >= O.life) { releaseOrbit(S, p); pop(false); }
    }
    // foam left by the Fizz Jet: hangs in the air and pops on whoever touches it
    for (let i = S.mines.length - 1; i >= 0; i--) {
      const m = S.mines[i]; m.t += dt; m.y -= dt * 0.25;
      let gone = m.t >= m.life;
      if (!gone && m.t > 0.08) for (const e of foes) if (Math.abs(ex(e) - m.x) < m.r + (e.w || 0.9) / 2 && Math.abs(ey(e) - m.y) < m.r + (e.h || 0.9) / 2) { soak(S, p, e, { vx: Math.sign(ex(e) - m.x) || 1, dmg: 0.7 }); gone = true; break; }
      if (gone) { S.fx.push({ k: 'pip', x: m.x, y: m.y, t: 0, life: 0.18 }); S.mines.splice(i, 1); }
    }
    // splash waves run along the floor from a Splashdown
    for (let i = S.waves.length - 1; i >= 0; i--) {
      const w = S.waves[i]; w.t += dt;
      const nx = w.x + w.dir * 11 * dt;
      if (FK.blocked(nx - 0.2, w.fy - 0.8, 0.4, 0.6) || !FK.blocked(nx - 0.1, w.fy + 0.05, 0.2, 0.2)) w.t = w.life;   // a wall, or the floor ends
      else w.x = nx;
      for (const e of foes) if (!w.hits.has(e) && Math.abs(ex(e) - w.x) < 0.7 && Math.abs(e.y + (e.h || 0.9) - w.fy) < 1.2) {
        w.hits.add(e); FK.hit(S, e, w.big ? 2 : 1.5, { kx: w.dir * 3, ky: -11, stun: 0.4, c: C_FX, big: w.big }); soakCount(S, p, e, 1, w.dir);
      }
      if (w.t >= w.life) S.waves.splice(i, 1);
    }
    // bubbles in flight
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const b = S.shots[i]; b.t += dt;
      b.vy -= 2.5 * dt; b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(b.t * 22 + b.ph) * 0.012;
      let gone = b.t >= b.life || FK.blocked(b.x - 0.08, b.y - 0.08, 0.16, 0.16);
      if (!gone) for (const e of foes) if (Math.abs(ex(e) - b.x) < b.r + (e.w || 0.9) / 2 && Math.abs(ey(e) - b.y) < b.r + (e.h || 0.9) / 2) { soak(S, p, e, b); gone = true; break; }
      if (gone) { S.fx.push({ k: 'pip', x: b.x, y: b.y, t: 0, life: 0.18 }); S.shots.splice(i, 1); }
    }
    // sealed foes float up, helpless
    for (let i = S.traps.length - 1; i >= 0; i--) {
      const tr = S.traps[i], e = tr.e; tr.t += dt;
      if (e.dead) { S.traps.splice(i, 1); continue; }
      e.vx = 0; e.vy = -2.4; e.stunTimer = Math.max(e.stunTimer || 0, 0.25);
      if (tr.t > 2.2) burst(S, p, tr, 0);
    }
    // lift bubbles: rise, carry you, bump foes
    let riding = false;
    for (let i = S.lifts.length - 1; i >= 0; i--) {
      const L = S.lifts[i]; L.t += dt;
      const grow = Math.min(1, L.t / 0.25), r = L.r * grow, ny = L.y + L.vy * dt;
      const top = ny - r * 0.8;
      let dead = L.t > L.life || (L.t > 0.3 && FK.blocked(L.x - 0.2, ny - r - 0.3, 0.4, 0.15));   // pops under a ceiling (not on the floor it grew from)
      if (!dead) {
        const wasOn = L.on; L.y = ny;
        // riding: the top of the bubble is a little platform that moves up under your feet
        L.on = false;
        if (!S.seq || S.seq.kind !== 'ride') {
          const feet = p.y + p.h;
          if (wasOn && !FK.keys().down && !(p.vy < -1 && L.t > 0.3) && Math.abs(pcx(p) - L.x) < Math.max(r, 0.5) + 0.2) {
            if (FK.blocked(p.x, top - p.h, p.w, p.h - 0.05)) dead = true;
            else { p.y = Math.min(p.y, top - p.h); p.vy = 0; p.onGround = true; L.on = true; S.selfMove = true; if (window._setJumpCount) window._setJumpCount(0); }   // (never pushes you down into the floor while it is still small)
          } else if (grow >= 1 && feet > top - 0.1 && FK.stand(p, top, L.x - r, L.x + r)) { L.on = true; S.selfMove = true; }
        }
        if (L.on) { riding = true; S.airUp = false; }
        for (const [e, c] of L.cool) { if (c - dt <= 0) L.cool.delete(e); else L.cool.set(e, c - dt); }
        for (const e of foes) if (!L.cool.has(e) && Math.hypot(ex(e) - L.x, ey(e) - L.y) < r + 0.5) { L.cool.set(e, 0.8); FK.hit(S, e, 1, { kx: (Math.sign(ex(e) - L.x) || 1) * 2, ky: -11, stun: 0.35, c: C_FX }); pop(false); }
      }
      if (dead) {
        if (L.on) { p.vy = -9; p.onGround = false; }
        S.fx.push({ k: 'ring', x: L.x, y: L.y, R: L.r * 1.5, c: C_FX, t: 0, life: 0.3 }); pop(true); S.lifts.splice(i, 1);
      }
    }
    S.riding = riding;
    // foam pads: a trampoline for anyone who lands on one
    for (let i = S.pads.length - 1; i >= 0; i--) {
      const d = S.pads[i]; d.t += dt; d.self -= dt; if (d.squish > 0) d.squish -= dt * 3;
      if (d.self <= 0 && (p.vy || 0) >= 0 && Math.abs(pcx(p) - d.x) < d.w / 2 + 0.1 && Math.abs(p.y + p.h - d.fy) < 0.3) {
        d.self = 0.3; d.squish = 1; p.vy = -19.5; p.onGround = false; S.airUp = false;
        FK.label(S, p, 'BOING!', C_PINK, true); FK.tone(180, { dur: 0.3, vol: 0.2, type: 'sine', slide: 900 });
      }
      for (const [e, c] of d.cool) { if (c - dt <= 0) d.cool.delete(e); else d.cool.set(e, c - dt); }
      for (const e of foes) if (!d.cool.has(e) && Math.abs(ex(e) - d.x) < d.w / 2 + 0.2 && Math.abs(e.y + (e.h || 0.9) - d.fy) < 0.45) {
        d.cool.set(e, 0.7); d.squish = 1; FK.hit(S, e, 1, { kx: 0, ky: -15, stun: 0.6, c: C_PINK, big: true }); FK.tone(180, { dur: 0.25, vol: 0.14, type: 'sine', slide: 700 });
      }
      if (d.t > d.life) S.pads.splice(i, 1);
    }
  }

  function bubble(ctx, x, y, r, a, col) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); FK.glow(ctx, col || C_FX, 0.16 * a); ctx.fill();
    FK.glow(ctx, col || C_FX, 0.85 * a); ctx.lineWidth = Math.max(1, r * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.68, -2.4, -1.5); FK.glow(ctx, '#ffffff', 0.9 * a); ctx.lineWidth = Math.max(1, r * 0.13); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + r * 0.38, y + r * 0.42, r * 0.09, 0, Math.PI * 2); ctx.fill();
  }

  const MOVES = {
    ground: { neutral: { name: 'Bubble Stream', big: 'SODA BLAST', cd: 0.3 }, side: { name: 'Suds Slide', cd: 0.45 }, up: { name: 'Lift Bubble', big: 'BIG LIFT BUBBLE', cd: 0.6 }, down: { name: 'Foam Pad', cd: 0.6 } },
    air:    { neutral: { name: 'Soap Orbit', big: 'SOAP STORM', cd: 0.45 }, side: { name: 'Fizz Jet', big: 'SODA ROCKET', cd: 0.35 }, up: { name: 'Bubble Ride', cd: 0.3 }, down: { name: 'Splashdown', big: 'TIDAL SPLASH', cd: 0.4 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  FK.define({
    id: ID, plug: 'fizz',
    def: { name: 'Fizz', icon: '🫧', tier: 'gold', color: C_FX, color2: C_PINK,
      ability: 'Bubble Blower: rapid long-range bubble streams, Lift Bubbles you ride upward, Foam Pads that bounce everyone',
      desc: 'A kid in a raincoat with a bubble wand. Every attack is a stream of fast little bubbles from far away; four on one foe SEAL it in a bubble that floats up, and the next hit POPS it. Lift Bubble (↑) floats upward with you standing on it, Foam Pad (↓) is a trampoline for you and for foes, Suds Slide skids along the floor. In the air: Soap Orbit (bubbles circle you and soak anyone close while you keep moving), Fizz Jet (shake the wand and rocket forward on the spray, leaving foam that pops on foes; once per jump), Bubble Ride (float up inside one) and Splashdown (dive in a heavy bubble that spikes foes, then two splash waves run along the floor).' },
    stats: { speed: 1.12, jump: 1.1, maxJumps: 2, maxDashes: 1, hp: 3 },
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, shots: [], traps: [], lifts: [], pads: [], mines: [], waves: [], orbit: null, airUp: false, airSide: false, inBubble: false, heavy: false, riding: false }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Bubble Ride comes back when you land'; if (key === 'air_side' && S.airSide) return 'Fizz Jet comes back when you land'; return null; },
    act: {
      ground_neutral: (p, f, pw, S) => startSeq(S, 'stream', { f, pw }),
      ground_side: (p, f, pw, S) => startSeq(S, 'slide', { f, pw }),
      ground_up: (p, f, pw, S) => startSeq(S, 'lift', { f, pw }),
      ground_down: (p, f, pw, S) => startSeq(S, 'pad', { f, pw }),
      air_neutral: (p, f, pw, S) => startSeq(S, 'orbit', { f, pw }),
      air_side: (p, f, pw, S) => { S.airSide = true; startSeq(S, 'jet', { f, pw }); },
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'ride', { f, pw }); },
      air_down: (p, f, pw, S) => startSeq(S, 'splash', { f, pw }),
    },
    onTeleport(p, S) { S.seq = null; S.inBubble = false; S.heavy = false; S.orbit = null; S.lifts.length = 0; S.pads.length = 0; S.traps.length = 0; S.mines.length = 0; S.waves.length = 0; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq) { S.seq = null; S.inBubble = false; S.heavy = false; }
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      stepWorld(p, dt, S);
      if (!S.seq) S.target = FK.locomotion(S, p, dt, PO, { aF: [1.0, 0.9] });
      if (p.onGround && !S.riding) S.airUp = false;
      if (p.onGround) S.airSide = false;
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing: a kid in a yellow raincoat, hood up, with a bubble wand
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, s = ph / U, cx = px + pw / 2, fy = py + ph;
      const K = FK.skel(P, q, cx, fy, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(143,233,255,0.45)';
      FK.limb(ctx, K.lB, 4.6 * s, C_BOOT2, 5 * s);
      FK.mitt(ctx, K.lB[2][0] + 0.9 * s, K.lB[2][1] - 0.3 * s, 2.8 * s, C_BOOT2);
      FK.limb(ctx, K.aB, 4.4 * s, C_COAT2, 4.2 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 2.3 * s, C_SKIN);
      // the coat: a bell shape with a hem that swings
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s, W = 15 * s, sw = Math.sin(t * 5) * s * 0.6;
      const g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); g.addColorStop(0, C_COAT2); g.addColorStop(0.55, C_COAT); g.addColorStop(1, '#fff2a8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-W * 0.36, -Lt); ctx.lineTo(W * 0.36, -Lt);
      ctx.quadraticCurveTo(W * 0.62, -Lt * 0.2, W * 0.6 + sw, 3.2 * s); ctx.quadraticCurveTo(0, 5 * s, -W * 0.6 + sw, 3.2 * s); ctx.quadraticCurveTo(-W * 0.62, -Lt * 0.2, -W * 0.36, -Lt); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(W * 0.12, -Lt * (0.78 - i * 0.27), 0.9 * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      ctx.shadowBlur = 0;
      FK.limb(ctx, K.lF, 4.8 * s, C_BOOT, 5.4 * s);
      FK.mitt(ctx, K.lF[2][0] + 1.0 * s, K.lF[2][1] - 0.3 * s, 3 * s, C_BOOT);
      // head: hood, a tuft of pink hair, big eyes, puffed cheeks while blowing
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      const hr = K.hr, blowing = S && S.seq && (S.seq.kind === 'stream' || S.seq.kind === 'jet');
      ctx.fillStyle = C_COAT2; ctx.beginPath(); ctx.arc(-hr * 0.12, -hr * 0.05, hr * 1.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_COAT; ctx.beginPath(); ctx.arc(-hr * 0.05, -hr * 0.08, hr * 1.1, Math.PI * 0.75, Math.PI * 2.1); ctx.fill();
      ctx.fillStyle = C_COAT; ctx.beginPath(); ctx.moveTo(-hr * 0.5, -hr * 1.0); ctx.quadraticCurveTo(-hr * 1.0, -hr * 1.9 + Math.sin(t * 4) * s, -hr * 1.35, -hr * 1.15); ctx.quadraticCurveTo(-hr * 0.9, -hr * 1.1, -hr * 0.8, -hr * 0.7); ctx.fill();
      ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.arc(hr * 0.12, hr * 0.05, hr * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.moveTo(-hr * 0.5, -hr * 0.5); ctx.quadraticCurveTo(hr * 0.2, -hr * 1.15, hr * 0.95, -hr * 0.35); ctx.quadraticCurveTo(hr * 0.3, -hr * 0.6, -hr * 0.5, -hr * 0.5); ctx.fill();
      ctx.fillStyle = '#ff8fa8'; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(hr * 0.7, hr * 0.42, hr * (blowing ? 0.26 : 0.15), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      FK.eyes(ctx, hr * 0.12, hr * 0.08, hr * 0.21, hr * 0.5, { pupil: '#1c7fb8' });
      ctx.fillStyle = '#b5485a'; ctx.beginPath(); if (blowing) ctx.arc(hr * 0.86, hr * 0.5, hr * 0.1, 0, Math.PI * 2); else ctx.arc(hr * 0.5, hr * 0.5, hr * 0.16, 0, Math.PI); ctx.fill();
      ctx.restore();
      // front arm and the wand: a pink stick with a ring that carries a soap film
      FK.limb(ctx, K.aF, 4.6 * s, C_COAT, 4.4 * s);
      const hx = K.aF[2][0], hy = K.aF[2][1], an = q.aF[0] + q.aF[1], dx = Math.sin(an), dy = Math.cos(an);
      ctx.strokeStyle = C_WAND; ctx.lineWidth = 1.3 * s; ctx.beginPath(); ctx.moveTo(hx - dx * 1.5 * s, hy - dy * 1.5 * s); ctx.lineTo(hx + dx * 5 * s, hy + dy * 5 * s); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx + dx * 7.4 * s, hy + dy * 7.4 * s, 2.6 * s, 0, Math.PI * 2); ctx.lineWidth = 1.2 * s; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 7); ctx.fillStyle = C_FX; ctx.fill(); ctx.restore();
      FK.mitt(ctx, hx, hy, 2.4 * s, C_SKIN);
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T;
      for (const d of S.pads) {
        const x = V.SX(d.x), y = V.SY(d.fy), a = Math.min(1, d.t / 0.2) * Math.min(1, (d.life - d.t) / 0.6), sq = 1 - 0.5 * Math.max(0, d.squish);
        for (let i = 0; i < 7; i++) {
          const u = (i + 0.5) / 7 - 0.5, r = T * (0.2 + 0.1 * Math.sin(i * 2.1 + V.now * 3)) * sq;
          ctx.beginPath(); ctx.arc(x + u * d.w * T, y - r * 0.7, r, 0, Math.PI * 2); FK.solid(ctx, i % 2 ? '#ffffff' : '#ffe3f4', 0.9 * a); ctx.fill();
        }
        ctx.beginPath(); ctx.ellipse(x, y - 2, d.w * T * 0.55, T * 0.12, 0, 0, Math.PI * 2); FK.glow(ctx, C_PINK, 0.45 * a); ctx.fill();
      }
      for (const L of S.lifts) {
        const grow = Math.min(1, L.t / 0.25), left = L.life - L.t, wob = left < 0.9 ? Math.sin(V.now * 40) * 0.06 : 0;
        bubble(ctx, V.SX(L.x), V.SY(L.y), L.r * T * grow * (1 + wob), left < 0.9 ? 0.6 + 0.4 * Math.sin(V.now * 30) : 1, L.on ? C_PINK : C_FX);
      }
      for (const m of S.mines) {   // Fizz Jet foam: little clusters that fade
        const a = Math.min(1, m.t / 0.08) * Math.min(1, (m.life - m.t) / 0.25), x = V.SX(m.x), y = V.SY(m.y), r = m.r * T;
        for (let i = 0; i < 3; i++) { const an = m.ph + i * 2.1; bubble(ctx, x + Math.cos(an) * r * 0.7, y + Math.sin(an) * r * 0.5, r * (0.55 + 0.15 * i), a, i === 1 ? C_PINK : C_FX); }
      }
      for (const w of S.waves) {   // splash waves: a curling crest running along the floor
        const u = w.t / w.life, a = 1 - u * 0.6, x = V.SX(w.x), y = V.SY(w.fy), h = T * (w.big ? 1.0 : 0.8) * (1 - 0.4 * u), d = w.dir;
        ctx.beginPath(); ctx.moveTo(x - d * T * 0.9, y); ctx.quadraticCurveTo(x - d * T * 0.3, y - h * 0.4, x, y - h); ctx.quadraticCurveTo(x + d * T * 0.35, y - h * 1.05, x + d * T * 0.3, y - h * 0.55);
        ctx.quadraticCurveTo(x + d * T * 0.15, y - h * 0.7, x + d * T * 0.05, y - h * 0.45); ctx.quadraticCurveTo(x + d * T * 0.4, y - h * 0.2, x + d * T * 0.5, y); ctx.closePath();
        FK.glow(ctx, C_FX, 0.35 * a); ctx.fill(); FK.glow(ctx, '#ffffff', 0.8 * a); ctx.lineWidth = 2; ctx.stroke();
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + d * T * (0.2 + i * 0.12), y - h * (1.05 + 0.15 * i) - Math.sin(V.now * 20 + i) * 3, T * 0.05, 0, Math.PI * 2); ctx.fill(); }
      }
      if (S.orbit) {   // soap orbit: the bubbles on their circle, with a faint ring between them
        const O = S.orbit, a = Math.min(1, O.t / 0.12) * (O.life - O.t < 0.3 ? 0.6 + 0.4 * Math.sin(V.now * 30) : 1), cx = V.SX(pcx(p)), cy = V.SY(pcy(p)), R = O.R * T;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); FK.glow(ctx, C_FX, 0.18 * a); ctx.lineWidth = 2; ctx.stroke();
        for (let i = 0; i < O.n; i++) { const an = (O.ang || 0) + i / O.n * Math.PI * 2; bubble(ctx, cx + Math.cos(an) * R, cy + Math.sin(an) * R, T * 0.27, a, i % 2 ? C_PINK : C_FX); }
      }
      for (const b of S.shots) bubble(ctx, V.SX(b.x), V.SY(b.y), b.r * T * (0.7 + 0.3 * Math.min(1, b.t / 0.1)), Math.min(1, (b.life - b.t) / 0.15));
      for (const tr of S.traps) if (!tr.e.dead) bubble(ctx, V.SX(ex(tr.e)), V.SY(ey(tr.e)), T * 0.85 * (1 + 0.04 * Math.sin(V.now * 9)), tr.t > 1.6 ? 0.6 + 0.4 * Math.sin(V.now * 30) : 1, C_PINK);
      if (S.inBubble) {
        if (S.heavy) {   // Splashdown: a heavier, water-filled bubble stretched by the fall, with streaks above it
          const cx = V.SX(pcx(p)), cy = V.SY(pcy(p)), r = T * 0.95;
          ctx.save(); ctx.translate(cx, cy); ctx.scale(0.92, 1.12);
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); FK.glow(ctx, '#4fb6ff', 0.3); ctx.fill(); FK.glow(ctx, C_FX, 0.95); ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
          for (let i = 0; i < 4; i++) { const x = cx + (i - 1.5) * r * 0.45; ctx.beginPath(); ctx.moveTo(x, cy - r * 1.2); ctx.lineTo(x, cy - r * (1.9 + 0.3 * Math.sin(V.now * 25 + i))); FK.glow(ctx, '#ffffff', 0.5); ctx.lineWidth = 2; ctx.stroke(); }
        } else bubble(ctx, V.SX(pcx(p)), V.SY(pcy(p)), T * 0.95 * (1 + 0.04 * Math.sin(V.now * 12)), 1);
      }
    },
    drawFx(ctx, V, f, u, a) {
      if (f.k === 'pip') { const x = V.SX(f.x), y = V.SY(f.y); for (let i = 0; i < 5; i++) { const an = i * 1.26; ctx.beginPath(); ctx.arc(x + Math.cos(an) * V.T * 0.3 * u, y + Math.sin(an) * V.T * 0.3 * u, V.T * 0.04, 0, Math.PI * 2); FK.glow(ctx, C_FX, a); ctx.fill(); } return true; }
      if (f.k === 'suds') { bubble(ctx, V.SX(f.x) + Math.sin(f.ph) * 4, V.SY(f.y) - u * V.T * 0.5, V.T * (0.08 + 0.1 * u), a); return true; }
      return false;
    },
    // Smash CPU: keep away and pour bubbles in
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      if (I.air) {
        if (I.dy < -1.2 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.dy > 1 && I.adx < 1.5) return { type: 'tap', v: 'down' };
        if (I.adx < 2 && Math.abs(I.dy) < 2) return { type: 'tap', v: '' };
        if (I.adx < 5 && Math.abs(I.dy) < 1.2 && !S.airSide) return { type: 'tap', v: 'side' };
        return null;
      }
      if (I.adx < 1.6 && Math.abs(I.dy) < 1.2) return Math.random() < 0.5 ? { type: 'tap', v: 'side' } : { type: 'tap', v: 'down' };
      if (I.dy < -2 && I.adx < 2 && I.r < 0.4) return { type: 'tap', v: 'up' };
      if (I.adx < 10 && Math.abs(I.dy) < 1.3) return I.killy && I.r < 0.4 ? { type: 'charge', v: '', hold: 0.5 } : { type: 'tap', v: '' };
      return null;
    },
  });
})();
