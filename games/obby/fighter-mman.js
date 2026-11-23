/* Obby Builder: M-MAN, the stomping handyman (the older brother).
 *
 * A short, sturdy fix-it man in a red work shirt and charcoal overalls and a hard hat with a big M on it. He bounces off anything he lands
 * on (STOMP: fall onto a foe to hit it and spring back up) and fixes problems with a very large wrench.
 *
 * POWER-UPS: tasks fill up as you play (the rings over his head). A finished task puts a TOOL CRATE over his head: jump up into it and the power-up pops out and slides away;
 * touch it to take that FORM for 24 seconds. Two hits taken knock him back to normal.
 *   🔥 EMBER CORE  (land 6 hits)        -> FORGE form: glowing furnace armour, the wrench throws bouncing hot rivets
 *   🌀 SPRING COIL (5 s in the air)      -> BOUNCE form: coil boots, a triple jump, stomps that chain sky-high
 *   🧲 MAGNET CORE (run 50 tiles)        -> MAGNET form: a horseshoe gauntlet that pulls foes in and rushes along rails
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge). Each form changes some of them.
 *  Ground: neutral WRENCH SWING (Forge: RIVET VOLLEY, Magnet: MAGNET PULL), side SHOULDER CHARGE, up JACK-UP (Bounce: SPRING LAUNCH),
 *          down HAMMER QUAKE.
 *  Air:    neutral SPIN WRENCH, side FLYING KICK, up TOOL TWIRL (recovery), down BUTT STOMP (Bounce: POGO DRILL).
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_mario_ref';
  const C_SUIT = '#e8392b', C_SUIT2 = '#a8231a', C_HAT = '#ffb627', C_HAT2 = '#e08a00', C_SKIN = '#f5c49b', C_HAIR = '#6b3d22', C_BELT = '#2b3a67', C_BIB = '#4b4f5e', C_BIB2 = '#33363f', C_MUST = '#3d2416', C_BOOT = '#4a2d1e', C_STEEL = '#c9d3e0', C_STEEL2 = '#8592a6';
  const FORMS = {
    forge:  { name: 'FORGE', icon: '🔥', c: '#ff8a1a', suit: '#ff7a1a', suit2: '#9a3a0a', glow: '#ffb347' },
    bounce: { name: 'BOUNCE', icon: '🌀', c: '#4fe0c2', suit: '#30b89e', suit2: '#1f7d6c', glow: '#b8fff0' },
    magnet: { name: 'MAGNET', icon: '🧲', c: '#5a8cff', suit: '#3f63d6', suit2: '#253f99', glow: '#ff5a6e' },
  };
  const P = { hip: 8, torso: 10.5, neck: -1.5, head: 7.6, ua: 4.6, fa: 4.4, th: 4.0, sh: 3.8 };   // a stocky grown man: a broad chest, a smaller head
  const U = 30, pose = FK.pose, { ex, ey, pcx, pcy } = FK;

  const PU = FK.powerups({
    tasks: [
      { kind: 'hits', need: 6, form: 'forge', label: '6 HITS' },
      { kind: 'air', need: 5, form: 'bounce', label: 'AIR TIME' },
      { kind: 'dist', need: 50, form: 'magnet', label: '50 TILES' },
    ],
    forms: FORMS,
    drawItem(ctx, x, y, r, f, t) {
      if (f === 'forge') {   // a glowing core in a riveted cage
        const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.4, '#ffb347'); g.addColorStop(1, '#d6301a');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#5b3a2a'; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 4; i++) { const a = t * 0.8 + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); ctx.lineTo(x - Math.cos(a) * r * 0.8, y - Math.sin(a) * r * 0.8); ctx.lineWidth = r * 0.09; ctx.stroke(); }
      } else if (f === 'bounce') {   // a coil spring
        ctx.strokeStyle = '#4fe0c2'; ctx.lineWidth = r * 0.2; ctx.lineCap = 'round'; ctx.beginPath();
        const sq = 1 + Math.sin(t * 8) * 0.18;
        for (let i = 0; i <= 24; i++) { const u = i / 24, a = u * Math.PI * 8; ctx.lineTo(x + Math.cos(a) * r * 0.6, y + (u - 0.5) * r * 1.4 * sq + Math.sin(a) * r * 0.16); }
        ctx.stroke(); ctx.fillStyle = '#e6fffa'; ctx.fillRect(x - r * 0.7, y - r * 0.8 * sq, r * 1.4, r * 0.18); ctx.fillRect(x - r * 0.7, y + r * 0.62 * sq, r * 1.4, r * 0.18);
      } else {   // a horseshoe magnet
        ctx.lineCap = 'butt'; ctx.lineWidth = r * 0.42;
        ctx.strokeStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.55, Math.PI, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - r * 0.55, y - r * 0.1); ctx.lineTo(x - r * 0.55, y + r * 0.45); ctx.moveTo(x + r * 0.55, y - r * 0.1); ctx.lineTo(x + r * 0.55, y + r * 0.45); ctx.stroke();
        ctx.strokeStyle = '#e8edf5'; ctx.beginPath(); ctx.moveTo(x - r * 0.55, y + r * 0.45); ctx.lineTo(x - r * 0.55, y + r * 0.75); ctx.moveTo(x + r * 0.55, y + r * 0.45); ctx.lineTo(x + r * 0.55, y + r * 0.75); ctx.stroke();
      }
    },
  });
  const form = S => PU.form(S);
  const fc = S => form(S) ? FORMS[form(S)].c : '#ffd166';

  const PO = {
    idle:   pose({ y: 0.4, lean: 0.06, aF: [0.5, 0.9], aB: [-0.3, 0.6], lF: [0.3, -0.15], lB: [-0.3, -0.1] }),
    jump:   pose({ y: -0.5, lean: 0.1, aF: [2.9, 0.3], aB: [-0.5, 0.9], lF: [0.9, -1.6], lB: [-0.2, -0.4] }),   // fist up, knee up
    fall:   pose({ lean: 0.0, aF: [1.9, 0.5], aB: [-1.8, 0.5], lF: [0.4, -0.6], lB: [-0.4, -0.3] }),
    wind:   pose({ y: 1.2, lean: -0.35, aF: [-1.6, 0.4], aB: [-0.6, 0.6], lF: [0.6, -0.4], lB: [-0.6, -0.1] }),  // wrench behind
    swing:  pose({ y: 1.6, lean: 0.45, aF: [1.75, 0.1], aB: [0.6, 0.5], lF: [0.9, -0.5], lB: [-0.8, -0.1] }),
    charge: pose({ y: 2.0, lean: 0.75, aF: [0.9, 0.9], aB: [-0.2, 1.4], lF: [1.1, -0.6], lB: [-1.0, -0.3] }),   // shoulder first
    crouch: pose({ y: 4.0, lean: 0.3, aF: [-0.3, 0.6], aB: [-0.5, 0.6], lF: [1.2, -1.8], lB: [-0.6, -1.3] }),
    upcut:  pose({ y: -0.6, lean: -0.05, aF: [3.05, 0.05], aB: [-0.9, 0.7], lF: [0.3, -0.2], lB: [-0.6, -0.9] }),
    pound:  pose({ y: 3.0, lean: 0.6, aF: [0.25, 0.05], aB: [0.15, 0.15], lF: [1.0, -1.2], lB: [-0.9, -0.6] }),  // wrench driven into the floor
    raise:  pose({ y: 0.5, lean: -0.15, aF: [3.1, 0.2], aB: [2.8, 0.3], lF: [0.3, -0.3], lB: [-0.3, -0.2] }),     // wrench overhead
    spin:   pose({ lean: 0.0, aF: [1.6, 0.0], aB: [-1.6, 0.2], lF: [0.8, -1.3], lB: [-0.6, -1.2] }),
    kick:   pose({ y: -1, lean: -0.5, aF: [-0.9, 0.6], aB: [-1.5, 0.4], lF: [1.65, -0.05], lB: [-0.3, -1.4] }),
    twirl:  pose({ y: -1, lean: 0.0, aF: [3.1, 0.0], aB: [-0.4, 0.8], lF: [0.25, -0.5], lB: [-0.25, -0.5] }),
    stomp:  pose({ y: -2.5, lean: 0.0, aF: [2.4, 0.6], aB: [-2.4, 0.6], lF: [0.5, -2.1], lB: [-0.5, -2.1] }),     // tucked, rear first
    pull:   pose({ y: 1.2, lean: -0.35, aF: [1.55, 0.05], aB: [-0.8, 0.5], lF: [0.8, -0.3], lB: [-0.9, -0.1] }),
  };

  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set(), n: 0 }, o || {}); }
  function box(p, f, dx, w, h, dy) {   // foes in a box in front: dx from centre, w deep, h tall, dy up from centre
    const x0 = f > 0 ? pcx(p) + dx : pcx(p) - dx - w, y0 = pcy(p) - (dy || 0) - h / 2;
    return FK.foes().filter(e => ex(e) + (e.w || 0.9) / 2 > x0 && ex(e) - (e.w || 0.9) / 2 < x0 + w && ey(e) + (e.h || 0.9) / 2 > y0 && ey(e) - (e.h || 0.9) / 2 < y0 + h);
  }
  const mul = S => form(S) === 'forge' ? 1.3 : form(S) === 'magnet' ? 1.1 : 1;
  function hit(S, e, dmg, o) { FK.hit(S, e, dmg * mul(S), Object.assign({ c: fc(S) }, o)); PU.add(S, 'hits'); }
  function clang(big) { FK.tone(big ? 520 : 760, { dur: 0.12, vol: 0.16, type: 'square', slide: big ? 260 : 420 }); FK.noise({ dur: 0.06, cut: 4200, q: 3, vol: 0.18 }); }
  function boing(hi) { FK.tone(hi ? 330 : 220, { dur: 0.22, vol: 0.18, type: 'square', slide: hi ? 1320 : 880 }); }
  // where the wrench head is, in world tiles
  function wrenchTip(p, q, f) {
    const u = p.h / U, K = FK.skel(P, q, 0, 0, u), h = K.aF[2], an = q.aF[0] + q.aF[1];
    return [pcx(p) + f * (h[0] + Math.sin(an) * 0.55), p.y + p.h + h[1] + Math.cos(an) * 0.55];
  }

  const SEQ = {
    swing(p, dt, S, q) {   // WRENCH SWING: a wind-up and a big overhead arc
      const f = q.f, W = 0.13, D = 0.22;
      S.target = q.t < W ? PO.wind : FK.lerpPose(PO.wind, PO.swing, FK.ease((q.t - W) / 0.08)); S.rate = 45;
      if (q.t >= W && q.t < W + 0.1) {
        if (!q.snd) { q.snd = 1; FK.whoosh(false, q.pw > 0.3); }
        for (const e of box(p, f, 0, 1.9 + 0.3 * q.pw, 1.6)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2 + 2 * q.pw, { kx: f * (8 + 8 * q.pw), ky: -6 - 4 * q.pw, stun: 0.4, big: q.pw > 0.3, stop: 0.05 }); clang(q.pw > 0.3); }
      }
      if (q.t > W + D) S.seq = null;
    },
    rivets(p, dt, S, q) {   // FORGE: three bouncing hot rivets
      const f = q.f, n = 3 + Math.round(2 * q.pw);
      S.target = q.n % 2 ? PO.swing : PO.wind; S.rate = 40;
      while (q.t >= 0.06 + q.n * 0.09 && q.n < n) {
        q.n++; const w = wrenchTip(p, PO.swing, f);
        S.shots.push({ x: w[0], y: w[1] - 0.2, vx: f * (9 + q.n * 1.3), vy: -6 - (q.n % 2) * 2, t: 0, life: 2.2, bounces: 0, kind: 'rivet' });
        FK.tone(300 + q.n * 60, { dur: 0.09, vol: 0.12, type: 'sawtooth', slide: 120 });
      }
      if (q.t > 0.06 + n * 0.09 + 0.12) S.seq = null;
    },
    pull(p, dt, S, q) {   // MAGNET: a beam that drags foes in, then a clank
      const f = q.f, D = 0.55 + 0.25 * q.pw;
      S.target = PO.pull; S.rate = 30; S.beam = { f, t: q.t };
      const list = box(p, f, 0.3, 7 + 2 * q.pw, 2.4);
      for (const e of list) { if (!e._noKnockback) { e.vx = -f * 9; e.vy = Math.min(e.vy || 0, 0); } e.stunTimer = Math.max(e.stunTimer || 0, 0.15); }
      if (Math.floor(q.t * 12) !== q.d) { q.d = Math.floor(q.t * 12); FK.tone(140 + q.t * 200, { dur: 0.08, vol: 0.06, type: 'sawtooth' }); }
      if (q.t > D) {
        for (const e of box(p, f, 0, 1.8, 1.8)) hit(S, e, 3 + 2 * q.pw, { kx: f * 10, ky: -9, stun: 0.5, big: true, stop: 0.06 });
        clang(true); S.beam = null; S.seq = null;
      }
    },
    charge(p, dt, S, q) {   // SHOULDER CHARGE (Forge: FURNACE RUSH, Magnet: RAIL RUSH, longer)
      const f = q.f, D = form(S) === 'magnet' ? 0.5 : 0.34;
      S.target = PO.charge; S.rate = 40; S.selfMove = true;
      if (!q.snd) { q.snd = 1; FK.whoosh(false, true); }
      const sp = (form(S) === 'magnet' ? 20 : 15 + 5 * q.pw) * (1 - 0.5 * FK.ease(q.t / D));
      if (!FK.moveX(p, f * sp * dt)) { FK.thud(false); S.seq = null; return; }
      p.vx = f * sp * 0.4; if (form(S) === 'magnet') p.vy = Math.min(p.vy, 0);
      if (Math.floor(q.t * 30) !== q.d) { q.d = Math.floor(q.t * 30); S.fx.push({ k: form(S) === 'forge' ? 'ember' : 'dust', x: pcx(p) - f * 0.3, y: p.y + p.h - 0.15, vx: -f, t: 0, life: 0.4, c: fc(S) }); }
      for (const e of box(p, f, -0.2, 1.3, 1.5)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2.5 + q.pw, { kx: f * 12, ky: -7, stun: 0.45, big: true }); FK.thud(false); }
      if (q.t > D) S.seq = null;
    },
    jackup(p, dt, S, q) {   // JACK-UP: crouch, then an uppercut that jumps (Bounce: SPRING LAUNCH, very high)
      const spring = form(S) === 'bounce';
      S.target = q.t < 0.1 ? PO.crouch : PO.upcut; S.rate = 40;
      if (q.t < 0.1 && p.vy < 0) p.vy = 0;
      if (q.t >= 0.1 && !q.done) {
        q.done = 1; p.vy = spring ? -24 - 4 * q.pw : -15 - 3 * q.pw; p.onGround = false;
        spring ? boing(true) : FK.whoosh(true, true);
        if (spring) S.fx.push({ k: 'ring', x: pcx(p), y: p.y + p.h, R: 1.4, c: FORMS.bounce.c, t: 0, life: 0.35 });
      }
      if (q.t >= 0.1 && q.t < 0.32) for (const e of box(p, FK.face(p), -0.8, 1.6, 1.8, 0.7)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2.5 + 2 * q.pw, { kx: FK.face(p) * 2, ky: -15 - 4 * q.pw, stun: 0.5, big: true }); clang(true); }
      if (q.t > 0.42) S.seq = null;
    },
    quake(p, dt, S, q) {   // HAMMER QUAKE: wrench overhead, slammed into the floor
      S.target = q.t < 0.2 ? PO.raise : PO.pound; S.rate = q.t < 0.2 ? 25 : 60;
      if (q.t >= 0.2 && !q.done) {
        q.done = 1; const R = 2.4 + 0.8 * q.pw + (form(S) === 'forge' ? 0.6 : 0);
        S.fx.push({ k: 'shock', x: pcx(p) + q.f * 0.8, y: p.y + p.h, R, c: fc(S), t: 0, life: 0.5 });
        FK.thud(true); FK.shake(7);
        for (const e of FK.within(pcx(p) + q.f * 0.8, p.y + p.h - 0.4, R)) hit(S, e, 2.5 + 2 * q.pw, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 5, ky: -12, stun: 0.55, big: true });
      }
      if (q.t > 0.48) S.seq = null;
    },
    spin(p, dt, S, q) {   // SPIN WRENCH: a full turn, hitting all round
      S.rot = q.t / 0.32 * Math.PI * 2 * q.f; S.target = PO.spin; S.rate = 50;
      p.vy = Math.min(p.vy, 2);
      if (Math.floor(q.t / 0.11) !== q.n) { q.n = Math.floor(q.t / 0.11); q.hits.clear(); FK.whoosh(false, false); }
      for (const e of FK.within(pcx(p), pcy(p), 1.6)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 1.2, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 6, ky: -6, stun: 0.3 }); }
      if (q.t > 0.32) { S.rot = 0; S.seq = null; }
    },
    kick(p, dt, S, q) {   // FLYING KICK
      const f = q.f; S.target = PO.kick; S.rate = 50; S.selfMove = true;
      if (!q.snd) { q.snd = 1; FK.whoosh(false, false); p.vy = Math.min(p.vy, -2); }
      FK.moveX(p, f * 13 * dt * (1 - q.t / 0.3)); p.vx = f * 4;
      for (const e of box(p, f, 0, 1.4, 1.2, -0.2)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2 + q.pw, { kx: f * 11, ky: -5, stun: 0.4, big: true }); FK.smack(true); }
      if (q.t > 0.3) S.seq = null;
    },
    twirl(p, dt, S, q) {   // TOOL TWIRL: the wrench overhead like a rotor, rising
      const k = FK.keys(); S.target = PO.twirl; S.rate = 40; S.rotor = q.t;
      p.vy = -(10 - 8 * q.t / 0.6); p.vx = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 6; p.onGround = false;
      if (Math.floor(q.t * 14) !== q.d) { q.d = Math.floor(q.t * 14); FK.whoosh(true, false); }
      for (const e of FK.within(pcx(p), p.y - 0.2, 1.3)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 1.5, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 4, ky: -11, stun: 0.35 }); }
      if (q.t > 0.6) { S.rotor = 0; S.seq = null; }
    },
    stomp(p, dt, S, q) {   // BUTT STOMP: hang, spin, plunge, shockwave (Bounce: POGO DRILL bounces back up)
      const pogo = form(S) === 'bounce';
      if (q.t < 0.16) { S.target = PO.stomp; S.rate = 40; p.vy = 0; p.vx = 0; S.rot = q.t / 0.16 * Math.PI * 2 * q.f; return; }
      S.rot = 0; S.target = PO.stomp; p.vy = 26; p.vx = 0;
      if (!q.snd) { q.snd = 1; FK.whoosh(false, true); }
      for (const e of box(p, 1, -0.6, 1.2, 1.2, -0.6)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 3 + q.pw, { kx: 0, ky: 16, stun: 0.5, big: true, stop: 0.06 }); }
      if (p.onGround || q.t > 1.4) {
        const R = 2 + q.pw;
        S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R, c: fc(S), t: 0, life: 0.45 });
        FK.thud(true); FK.shake(6);
        for (const e of FK.within(pcx(p), p.y + p.h - 0.4, R)) if (!q.hits.has(e)) hit(S, e, 2, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 6, ky: -10, stun: 0.45 });
        if (pogo) { p.vy = -19; p.onGround = false; boing(true); S.airUp = false; }
        S.seq = null;
      }
    },
  };

  function stepWorld(p, dt, S) {
    const foes = FK.foes();
    // rivets: arc, bounce twice, sizzle
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const b = S.shots[i]; b.t += dt; b.vy += 24 * dt;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if (FK.blocked(nx - 0.12, b.y - 0.12, 0.24, 0.24)) { b.vx *= -0.6; } else b.x = nx;
      if (FK.blocked(b.x - 0.12, ny - 0.12, 0.24, 0.24)) { if (b.vy > 0) { b.bounces++; b.vy = -Math.abs(b.vy) * 0.62; FK.tone(900, { dur: 0.05, vol: 0.06, type: 'square' }); } else b.vy = 0; } else b.y = ny;
      let gone = b.t > b.life || b.bounces > 3;
      if (!gone) for (const e of foes) if (Math.abs(ex(e) - b.x) < 0.6 && Math.abs(ey(e) - b.y) < 0.6) { hit(S, e, 1.6, { kx: Math.sign(b.vx || 1) * 7, ky: -6, stun: 0.35 }); gone = true; break; }
      if (gone) { S.fx.push({ k: 'ember', x: b.x, y: b.y, vx: 0, t: 0, life: 0.3, c: FORMS.forge.c }); S.shots.splice(i, 1); }
    }
    // STOMP: falling onto a foe hits it and springs him back up
    if (!p.onGround && (p.vy || 0) > 3 && !(S.seq && S.seq.kind === 'stomp')) {
      for (const e of foes) {
        const top = e.y, l = e.x, r = e.x + (e.w || 0.9), feet = p.y + p.h;
        if (pcx(p) > l - 0.2 && pcx(p) < r + 0.2 && feet > top - 0.1 && feet < top + 0.55 && (S.stompCool.get(e) || 0) <= 0) {
          S.stompCool.set(e, 0.35); hit(S, e, 2, { kx: 0, ky: 9, stun: 0.45, big: true });
          p.vy = form(S) === 'bounce' ? -18 : -13; S.airUp = false; boing(form(S) === 'bounce');
          FK.label(S, p, 'STOMP!', fc(S), false);
          break;
        }
      }
    }
    for (const [e, c] of S.stompCool) { if (c - dt <= 0) S.stompCool.delete(e); else S.stompCool.set(e, c - dt); }
  }

  const MOVES = {
    ground: { neutral: { name: 'Wrench Swing', big: 'BIG WRENCH', cd: 0.32 }, side: { name: 'Shoulder Charge', cd: 0.45 }, up: { name: 'Jack-Up', cd: 0.45 }, down: { name: 'Hammer Quake', big: 'MEGA QUAKE', cd: 0.6 } },
    air:    { neutral: { name: 'Spin Wrench', cd: 0.35 }, side: { name: 'Flying Kick', cd: 0.35 }, up: { name: 'Tool Twirl', cd: 0.3 }, down: { name: 'Butt Stomp', cd: 0.4 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  FK.define({
    id: ID, plug: 'mman',
    def: { name: 'M-Man', icon: '🔧', tier: 'prismatic', color: '#ff4a3a', color2: '#ffb627',
      ability: 'Stomping handyman: bounce off foes, swing a giant wrench, and grab power-ups for FORGE, BOUNCE and MAGNET forms',
      desc: 'The older brother: a sturdy fix-it man with a hard hat and a giant wrench. Fall onto a foe to STOMP it and spring back up. Tasks fill the rings over his head (6 hits, 5 s in the air, 50 tiles run); each one puts a Tool Crate over his head: bump it from below and catch the power-up that slides out: 🔥 FORGE (hot rivets, harder hits), 🌀 BOUNCE (triple jump, sky-high stomps, Spring Launch, Pogo Drill) or 🧲 MAGNET (pull foes in, Rail Rush). A form lasts 24 s; two hits end it. Moves: Wrench Swing, Shoulder Charge, Jack-Up, Hammer Quake; in the air Spin Wrench, Flying Kick, Tool Twirl and Butt Stomp.' },
    stats: { speed: 1.05, jump: 1.12, maxJumps: 2, maxDashes: 1, hp: 4 },
    statMod: S => form(S) === 'bounce' ? { jump: 1.32, maxJumps: 3 } : form(S) === 'forge' ? { speed: 0.98 } : form(S) === 'magnet' ? { speed: 1.18 } : {},
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, rot: 0, rotor: 0, shots: [], stompCool: new Map(), airUp: false, beam: null, pu: PU.init() }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Tool Twirl comes back when you land'; return null; },
    act: {
      ground_neutral: (p, f, pw, S) => { const fm = form(S); if (fm === 'forge') { startSeq(S, 'rivets', { f, pw }); return 'RIVET VOLLEY'; } if (fm === 'magnet') { startSeq(S, 'pull', { f, pw }); return 'MAGNET PULL'; } startSeq(S, 'swing', { f, pw }); },
      ground_side: (p, f, pw, S) => { startSeq(S, 'charge', { f, pw }); return form(S) === 'forge' ? 'FURNACE RUSH' : form(S) === 'magnet' ? 'RAIL RUSH' : null; },
      ground_up: (p, f, pw, S) => { startSeq(S, 'jackup', { f, pw }); return form(S) === 'bounce' ? 'SPRING LAUNCH' : null; },
      ground_down: (p, f, pw, S) => startSeq(S, 'quake', { f, pw }),
      air_neutral: (p, f, pw, S) => { if (form(S) === 'forge') { startSeq(S, 'rivets', { f, pw }); return 'RIVET VOLLEY'; } startSeq(S, 'spin', { f, pw }); },
      air_side: (p, f, pw, S) => startSeq(S, 'kick', { f, pw }),
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'twirl', { f, pw }); },
      air_down: (p, f, pw, S) => { startSeq(S, 'stomp', { f, pw }); return form(S) === 'bounce' ? 'POGO DRILL' : null; },
    },
    onTeleport(p, S) { S.seq = null; S.rot = 0; S.rotor = 0; S.shots.length = 0; S.beam = null; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq) { S.seq = null; S.rot = 0; S.rotor = 0; S.beam = null; }
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      if (!S.seq) { S.rot = 0; S.rotor = 0; S.beam = null; }
      stepWorld(p, dt, S);
      PU.tick(p, dt, S);
      if (!S.seq) S.target = FK.locomotion(S, p, dt, PO, { aF: [0.4, 1.2] });
      if (p.onGround) S.airUp = false;
      // landing squash
      if (p.onGround && !S.wasGround && (S.lastVy || 0) > 8) S.squash = 1;
      S.wasGround = p.onGround; S.lastVy = p.vy; if (S.squash > 0) S.squash = Math.max(0, S.squash - dt * 6);
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing: a short sturdy handyman, hard hat with an M, a big wrench
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, fm = S && S.pu ? S.pu.form : null, F = fm ? FORMS[fm] : null;
      const s = ph / U, cx = px + pw / 2, fy = py + ph, sq = S && S.squash ? S.squash : 0;
      const suit = F ? F.suit : C_SUIT, suit2 = F ? F.suit2 : C_SUIT2;
      ctx.save();
      if (sq) { ctx.translate(cx, fy); ctx.scale(1 + sq * 0.18, 1 - sq * 0.16); ctx.translate(-cx, -fy); }
      if (S && S.rot) { ctx.translate(cx, fy - ph * 0.45); ctx.rotate(S.rot); ctx.translate(-cx, -(fy - ph * 0.45)); }
      const K = FK.skel(P, q, cx, fy, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (F) { const ag = ctx.createRadialGradient(cx, fy - ph * 0.45, ph * 0.1, cx, fy - ph * 0.45, ph * 0.62); ag.addColorStop(0, F.glow + '55'); ag.addColorStop(1, F.glow + '00'); ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, fy - ph * 0.45, ph * 0.62, 0, Math.PI * 2); ctx.fill(); }   // the form's glow: one soft circle (a canvas blur on every limb was far too slow on phones)
      if (S && S.pu && S.pu.flash > 0 && Math.sin(t * 50) > 0) ctx.globalAlpha = 0.6;
      // back leg + boot (spring boots in Bounce form)
      FK.limb(ctx, K.lB, 5.4 * s, C_BIB2, 5.4 * s);
      boot(ctx, K.lB[2], s, fm === 'bounce', t, 0.85);
      FK.limb(ctx, K.aB, 4.6 * s, suit2, 4.2 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 2.4 * s, '#f2f2f2', '#c9c9c9');   // work gloves
      // torso: a work shirt under bib overalls (straps, two brass buttons), a tool belt
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s, W = 17 * s;
      FK.blob(ctx, W, Lt + 1.5 * s, suit, suit2, 6 * s);
      ctx.shadowBlur = 0;
      const bg = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); bg.addColorStop(0, C_BIB2); bg.addColorStop(0.6, C_BIB); bg.addColorStop(1, '#6a6f80');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(-W / 2, -Lt * 0.5, W, Lt * 0.5 + 1.5 * s, [0, 0, 5 * s, 5 * s]); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-W * 0.3, -Lt * 0.8, W * 0.6, Lt * 0.4, 1.5 * s); ctx.fill();
      ctx.fillRect(-W * 0.36, -Lt - 0.5 * s, 2.4 * s, Lt * 0.3); ctx.fillRect(W * 0.36 - 2.4 * s, -Lt - 0.5 * s, 2.4 * s, Lt * 0.3);   // straps
      ctx.fillStyle = '#ffd166'; for (const bx of [-W * 0.24, W * 0.24]) { ctx.beginPath(); ctx.arc(bx, -Lt * 0.72, 1.2 * s, 0, Math.PI * 2); ctx.fill(); }
      if (fm === 'forge') { ctx.fillStyle = '#5b2a1a'; ctx.beginPath(); ctx.roundRect(-W * 0.42, -Lt * 0.95, W * 0.84, Lt * 0.6, 3 * s); ctx.fill(); ctx.fillStyle = `rgba(255,${180 + 60 * Math.sin(t * 9) | 0},80,0.95)`; ctx.beginPath(); ctx.arc(0, -Lt * 0.65, 2.2 * s, 0, Math.PI * 2); ctx.fill(); for (const rx of [-0.32, 0.32]) { ctx.fillStyle = '#c9b7a5'; ctx.beginPath(); ctx.arc(W * rx, -Lt * 0.85, 0.8 * s, 0, Math.PI * 2); ctx.fill(); } }
      else { ctx.fillStyle = C_BIB2; ctx.fillRect(-W * 0.18, -Lt * 0.66, W * 0.36, Lt * 0.18); ctx.fillStyle = C_STEEL; ctx.fillRect(W * 0.05, -Lt * 0.74, 1.1 * s, Lt * 0.22); }   // bib pocket with a pencil
      ctx.fillStyle = C_BELT; ctx.fillRect(-W / 2, -2.6 * s, W, 2.8 * s);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(-1.4 * s, -2.4 * s, 2.8 * s, 2.4 * s); ctx.fillStyle = C_BELT; ctx.fillRect(-0.7 * s, -1.7 * s, 1.4 * s, 1 * s);
      ctx.fillStyle = '#8a5a3a'; ctx.fillRect(-W * 0.48, -2.2 * s, 2.6 * s, 4 * s);   // a pouch
      ctx.restore();
      ctx.shadowBlur = 0;
      FK.limb(ctx, K.lF, 5.8 * s, C_BIB, 5.8 * s);
      boot(ctx, K.lF[2], s, fm === 'bounce', t, 1);
      // head: a broad weathered face, small eyes under thick brows, a big nose and a big bushy mustache
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      const hr = K.hr, busy = S && S.seq;
      ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.ellipse(hr * 0.1, hr * 0.18, hr * 0.98, hr * 1.02, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e9b48c'; ctx.beginPath(); ctx.ellipse(hr * 0.15, hr * 0.85, hr * 0.7, hr * 0.32, 0, 0, Math.PI); ctx.fill();   // jaw shadow
      ctx.fillStyle = 'rgba(70,40,25,0.22)'; ctx.beginPath(); ctx.ellipse(hr * 0.2, hr * 0.92, hr * 0.62, hr * 0.26, 0, 0, Math.PI * 2); ctx.fill();   // stubble
      ctx.fillStyle = '#e9b48c'; ctx.beginPath(); ctx.ellipse(-hr * 0.55, hr * 0.2, hr * 0.2, hr * 0.28, 0, 0, Math.PI * 2); ctx.fill();   // ear
      ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.moveTo(-hr * 0.85, -hr * 0.35); ctx.lineTo(-hr * 0.5, -hr * 0.35); ctx.lineTo(-hr * 0.42, hr * 0.45); ctx.lineTo(-hr * 0.78, hr * 0.3); ctx.closePath(); ctx.fill();   // sideburn and the hair under the hat
      const blink = Math.sin(t * 1.3) > 0.97;
      for (const dx of [0.3, 0.72]) {   // small dark eyes with a glint
        if (blink) { ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = hr * 0.07; ctx.beginPath(); ctx.moveTo(hr * (dx - 0.1), hr * 0.02); ctx.lineTo(hr * (dx + 0.1), hr * 0.02); ctx.stroke(); continue; }
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(hr * dx, hr * 0.0, hr * 0.13, hr * 0.15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2b2a3a'; ctx.beginPath(); ctx.arc(hr * (dx + 0.04), hr * 0.02, hr * 0.085, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hr * (dx + 0.07), -hr * 0.03, hr * 0.03, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = C_MUST; ctx.lineWidth = hr * 0.13; ctx.lineCap = 'round';   // thick brows, lowered when he attacks
      ctx.beginPath(); ctx.moveTo(hr * 0.16, -hr * (busy ? 0.18 : 0.26)); ctx.lineTo(hr * 0.44, -hr * (busy ? 0.12 : 0.24)); ctx.moveTo(hr * 0.6, -hr * (busy ? 0.12 : 0.24)); ctx.lineTo(hr * 0.88, -hr * (busy ? 0.18 : 0.26)); ctx.stroke();
      // the mustache: wide and bushy, a scalloped lower edge, sweeping back to both cheeks
      const wig = Math.sin(t * 2.2) * hr * 0.02;
      ctx.fillStyle = C_MUST; ctx.beginPath(); ctx.moveTo(hr * 0.05, hr * 0.38);
      ctx.quadraticCurveTo(hr * 0.35, hr * 0.18, hr * 0.62, hr * 0.32); ctx.quadraticCurveTo(hr * 0.9, hr * 0.18, hr * 1.18, hr * 0.36);
      ctx.quadraticCurveTo(hr * 1.22, hr * 0.62 + wig, hr * 1.0, hr * 0.66); ctx.quadraticCurveTo(hr * 0.92, hr * 0.56, hr * 0.8, hr * 0.68);
      ctx.quadraticCurveTo(hr * 0.68, hr * 0.56, hr * 0.56, hr * 0.68); ctx.quadraticCurveTo(hr * 0.44, hr * 0.56, hr * 0.32, hr * 0.68);
      ctx.quadraticCurveTo(hr * 0.2, hr * 0.56, hr * 0.06, hr * 0.66 - wig); ctx.quadraticCurveTo(-hr * 0.12, hr * 0.55, hr * 0.05, hr * 0.38); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(hr * 0.6, hr * 0.38, hr * 0.32, hr * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e39a76'; ctx.beginPath(); ctx.ellipse(hr * 0.86, hr * 0.2, hr * 0.27, hr * 0.24, 0, 0, Math.PI * 2); ctx.fill();   // a big round nose over it
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(hr * 0.8, hr * 0.12, hr * 0.07, 0, Math.PI * 2); ctx.fill();
      if (busy) { ctx.fillStyle = '#5a2418'; ctx.beginPath(); ctx.ellipse(hr * 0.62, hr * 0.8, hr * 0.14, hr * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }   // a shout under the mustache
      // hard hat: dome, brim pointing forward, a ridge, and the M badge (goggles on it in Forge form)
      const hatC = fm ? F.c : C_HAT, hatC2 = fm ? F.suit2 : C_HAT2;
      const hg = ctx.createLinearGradient(0, -hr * 1.5, 0, -hr * 0.2); hg.addColorStop(0, '#fff3c4'); hg.addColorStop(0.35, hatC); hg.addColorStop(1, hatC2);
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hr * 0.05, -hr * 0.28, hr * 1.0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hatC2; ctx.beginPath(); ctx.roundRect(-hr * 1.0, -hr * 0.34, hr * 2.25, hr * 0.26, hr * 0.12); ctx.fill();
      ctx.strokeStyle = hatC2; ctx.lineWidth = hr * 0.14; ctx.beginPath(); ctx.arc(hr * 0.05, -hr * 0.28, hr * 0.65, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hr * 0.35, -hr * 0.78, hr * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fm ? F.suit2 : '#d32a1f'; ctx.font = `900 ${hr * 0.46}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', hr * 0.35, -hr * 0.76);
      if (fm === 'forge') { ctx.fillStyle = '#2b2b33'; ctx.fillRect(-hr * 0.7, -hr * 0.62, hr * 0.6, hr * 0.28); ctx.fillStyle = '#ffb347'; ctx.fillRect(-hr * 0.62, -hr * 0.56, hr * 0.44, hr * 0.16); }
      ctx.restore();
      // front arm with the wrench (or the magnet gauntlet)
      FK.limb(ctx, K.aF, 5 * s, suit, 4.6 * s);
      const hx = K.aF[2][0], hy = K.aF[2][1], an = q.aF[0] + q.aF[1], dx = Math.sin(an), dy = Math.cos(an);
      if (fm === 'magnet') {
        ctx.save(); ctx.translate(hx + dx * 3 * s, hy + dy * 3 * s); ctx.rotate(-an + Math.PI);
        ctx.lineWidth = 2.6 * s; ctx.strokeStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(0, 0, 3 * s, 0, Math.PI); ctx.stroke();
        ctx.strokeStyle = '#e8edf5'; ctx.beginPath(); ctx.moveTo(-3 * s, 0); ctx.lineTo(-3 * s, -2 * s); ctx.moveTo(3 * s, 0); ctx.lineTo(3 * s, -2 * s); ctx.stroke();
        ctx.restore();
      } else if (S && S.rotor) {
        ctx.save(); ctx.translate(hx + dx * 3 * s, hy + dy * 3 * s); ctx.rotate(t * 40);
        wrench(ctx, s, fm === 'forge', t); ctx.restore();
      } else {
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(-an + Math.PI); ctx.translate(0, -1 * s);
        wrench(ctx, s, fm === 'forge', t); ctx.restore();
      }
      FK.mitt(ctx, hx, hy, 2.6 * s, '#f2f2f2', '#c9c9c9');
      ctx.restore();
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T;
      if (S.beam) {   // MAGNET PULL: red and blue field lines
        const f = S.beam.f, x0 = V.SX(pcx(p) + f * 0.9), y0 = V.SY(pcy(p) - 0.1), L = T * 7;
        for (let i = 0; i < 5; i++) { const off = ((V.now * 3 + i / 5) % 1); ctx.beginPath(); ctx.ellipse(x0 + f * L * (1 - off) * 0.5, y0, L * (1 - off) * 0.5, T * (0.4 + 0.5 * (1 - off)), 0, 0, Math.PI * 2); FK.glow(ctx, i % 2 ? '#ff4d5e' : '#5a8cff', 0.35 * off); ctx.lineWidth = 2; ctx.stroke(); }
      }
      for (const b of S.shots) {   // hot rivets
        const x = V.SX(b.x), y = V.SY(b.y);
        ctx.beginPath(); ctx.arc(x, y, T * 0.24, 0, Math.PI * 2); FK.glow(ctx, '#ff7a2a', 0.35); ctx.fill();
        FK.solid(ctx, '#ffd28a', 1); ctx.beginPath(); ctx.arc(x, y, T * 0.12, 0, Math.PI * 2); ctx.fill();
        FK.solid(ctx, '#fff', 0.9); ctx.beginPath(); ctx.arc(x - T * 0.04, y - T * 0.04, T * 0.04, 0, Math.PI * 2); ctx.fill();
      }
      PU.draw(ctx, V, S);
    },
    drawFx(ctx, V, f, u, a) {
      if (f.k === 'ember') { const x = V.SX(f.x) + (f.vx || 0) * f.t * V.T, y = V.SY(f.y) - u * V.T * 0.6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + (i - 1) * 5, y - i * 3, V.T * (0.1 - u * 0.06), 0, Math.PI * 2); FK.glow(ctx, i ? '#ffb347' : '#ff5a2a', a); ctx.fill(); } return true; }
      return false;
    },
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      if (I.air) {
        if (I.dy < -1.5 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.dy > 1 && I.adx < 1.2) return { type: 'tap', v: 'down' };
        if (I.adx < 1.7 && Math.abs(I.dy) < 1.4) return { type: 'tap', v: Math.random() < 0.5 ? '' : 'side' };
        return null;
      }
      if (I.adx < 1.8 && Math.abs(I.dy) < 1.2) return I.killy ? { type: 'charge', v: '', hold: 0.5 } : { type: 'tap', v: Math.random() < 0.6 ? '' : 'down' };
      if (I.dy < -1.5 && I.adx < 1.6) return { type: 'tap', v: 'up' };
      if (I.adx < 5 && Math.abs(I.dy) < 1) return { type: 'tap', v: 'side' };
      return null;
    },
  });

  // a work boot, or a boot on a coil spring
  function boot(ctx, at, s, spring, t, sh) {
    if (spring) {
      ctx.strokeStyle = '#4fe0c2'; ctx.lineWidth = 1.1 * s; ctx.beginPath();
      for (let i = 0; i <= 12; i++) { const u = i / 12; ctx.lineTo(at[0] + Math.sin(u * Math.PI * 5) * 1.6 * s, at[1] + u * 3 * s); }
      ctx.stroke();
      ctx.fillStyle = '#1f7d6c'; ctx.beginPath(); ctx.roundRect(at[0] - 2 * s, at[1] + 2.6 * s, 5.5 * s, 1.6 * s, 0.8 * s); ctx.fill();
    }
    ctx.fillStyle = C_BOOT; ctx.beginPath(); ctx.roundRect(at[0] - 2.2 * s * sh, at[1] - 1.8 * s, 5.8 * s * sh, 3.2 * s, 1.4 * s); ctx.fill();
    ctx.fillStyle = '#8a5a3a'; ctx.fillRect(at[0] - 2.2 * s * sh, at[1] + 0.8 * s, 5.8 * s * sh, 0.7 * s);
  }
  // the giant wrench, drawn along -y from the grip
  function wrench(ctx, s, hot, t) {
    const L = 9 * s, steel = hot ? '#ff9a4a' : C_STEEL, steel2 = hot ? '#c2361c' : C_STEEL2;
    if (hot) { ctx.fillStyle = 'rgba(255,179,71,0.35)'; ctx.beginPath(); ctx.arc(0, -L - 1.6 * s, 4.6 * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = steel2; ctx.beginPath(); ctx.roundRect(-1.1 * s, -L, 2.2 * s, L + 2 * s, 1 * s); ctx.fill();
    ctx.fillStyle = steel; ctx.fillRect(-0.5 * s, -L, 0.9 * s, L);
    ctx.fillStyle = steel; ctx.beginPath(); ctx.arc(0, -L - 1.6 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1b24'; ctx.beginPath(); ctx.moveTo(-1.2 * s, -L - 4.8 * s); ctx.lineTo(1.2 * s, -L - 4.8 * s); ctx.lineTo(0.8 * s, -L - 1.4 * s); ctx.lineTo(-0.8 * s, -L - 1.4 * s); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-1.2 * s, -2 * s, 2.4 * s, 3.4 * s);   // grip
    ctx.shadowBlur = 0;
  }
})();
