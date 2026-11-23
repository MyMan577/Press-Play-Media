/* Obby Builder: K-PRINCESS, the Kite Princess of the sky kingdom.
 *
 * A tall, graceful royal in a teal-and-gold gown with a cape cut like a diamond kite, a braid down her back and a
 * tiara with a kite-shaped jewel. She carries a ribbon wand on a kite string.
 *
 * THE GIMMICKS
 *  - ROYAL FLOAT: hold jump while falling and the kite cape catches the wind: she hangs in the air for 1.4 s (once per jump).
 *  - KITES: her side moves throw a diamond kite that flies out and loops back (it hits both ways). Up to two at a time.
 *  - GRACE: three hits in a row without being hit fill her crown; the next special move is a ROYAL version (bigger, stronger).
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge)
 *  Ground: neutral RIBBON LASH, side KITE TOSS, up GUST CURTSY (a wind column launcher), down PETAL GUARD (a counter).
 *  Air:    neutral RIBBON TWIRL, side KITE DASH, up KITE LIFT (recovery), down CROWN DIVE.
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_peach_ref';
  const C_GOWN = '#3fc7c2', C_GOWN2 = '#1f8f8c', C_GOLD = '#ffd36b', C_GOLD2 = '#d39a2a', C_SKIN = '#f6d2b8', C_HAIR = '#4a2a5a', C_HAIR2 = '#2e1838', C_RIB = '#ff7aa8', C_CAPE = '#ff9f5a', C_CAPE2 = '#ffd36b', C_FX = '#9ff3ee';
  const P = { hip: 10, torso: 10, neck: -2, head: 8.5, ua: 5, fa: 5, th: 5, sh: 5 };
  const U = 30, pose = FK.pose, { ex, ey, pcx, pcy } = FK;

  const PO = {
    idle:   pose({ y: 0.2, lean: -0.04, head: 0.05, aF: [0.3, 1.4], aB: [-0.2, 0.6], lF: [0.08, -0.05], lB: [-0.08, -0.05] }),   // hand on her hip
    jump:   pose({ y: -0.4, lean: 0.0, aF: [2.6, 0.3], aB: [-0.6, 0.5], lF: [0.5, -1.0], lB: [-0.2, -0.6] }),
    fall:   pose({ lean: 0.0, aF: [1.6, 0.5], aB: [-1.6, 0.5], lF: [0.2, -0.3], lB: [-0.2, -0.3] }),
    float:  pose({ y: -0.4, lean: 0.05, head: -0.15, aF: [2.2, 0.3], aB: [-2.2, 0.3], lF: [0.15, -0.6], lB: [-0.1, -0.5] }),  // arms out, cape open
    lashA:  pose({ y: 0.6, lean: -0.3, aF: [2.6, 0.6], aB: [-0.6, 0.6], lF: [0.4, -0.2], lB: [-0.4, -0.1] }),
    lashB:  pose({ y: 1.0, lean: 0.35, aF: [1.2, 0.05], aB: [-0.9, 0.5], lF: [0.8, -0.3], lB: [-0.6, -0.1] }),
    toss:   pose({ y: 0.6, lean: 0.3, aF: [1.9, 0.0], aB: [-1.0, 0.4], lF: [0.6, -0.2], lB: [-0.6, -0.1] }),
    curtsy: pose({ y: 3.5, lean: 0.25, head: 0.25, aF: [0.5, 0.4], aB: [-0.5, 0.4], lF: [0.6, -1.4], lB: [-0.7, -1.0] }),
    rise:   pose({ y: -0.5, lean: -0.05, aF: [3.0, 0.1], aB: [2.8, 0.15], lF: [0.1, -0.1], lB: [-0.1, -0.1] }),
    guard:  pose({ y: 1.5, lean: -0.1, head: -0.1, aF: [1.9, 1.6], aB: [1.6, 1.8], lF: [0.3, -0.4], lB: [-0.4, -0.3] }),   // arms crossed in front
    twirl:  pose({ lean: 0.0, aF: [1.6, 0.0], aB: [-1.6, 0.0], lF: [0.2, -0.4], lB: [-0.2, -0.4] }),
    dash:   pose({ y: -0.6, lean: 0.9, head: -0.5, aF: [1.7, 0.0], aB: [-2.4, 0.3], lF: [-0.4, -0.3], lB: [-0.8, -0.4] }),
    dive:   pose({ y: -1.5, lean: 0.0, head: 0.2, aF: [2.9, 0.1], aB: [2.7, 0.1], lF: [0.1, -0.1], lB: [-0.1, -0.1] }),
  };

  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set(), n: 0 }, o || {}); }
  function box(p, f, dx, w, h, dy) {
    const x0 = f > 0 ? pcx(p) + dx : pcx(p) - dx - w, y0 = pcy(p) - (dy || 0) - h / 2;
    return FK.foes().filter(e => ex(e) + (e.w || 0.9) / 2 > x0 && ex(e) - (e.w || 0.9) / 2 < x0 + w && ey(e) + (e.h || 0.9) / 2 > y0 && ey(e) - (e.h || 0.9) / 2 < y0 + h);
  }
  const roy = q => q.royal ? 1.5 : 1;
  function hit(S, e, dmg, o) { FK.hit(S, e, dmg, Object.assign({ c: C_FX }, o)); S.grace = Math.min(3, S.grace + 1); }
  function chime(n) { for (let i = 0; i < (n || 2); i++) FK.tone(988 * Math.pow(1.335, i), { dur: 0.16, vol: 0.08, delay: i * 0.05, type: 'sine' }); }
  function hand(p, q, f) { const u = p.h / U, K = FK.skel(P, q, 0, 0, u), h = K.aF[2]; return [pcx(p) + f * h[0], p.y + p.h + h[1]]; }

  const SEQ = {
    lash(p, dt, S, q) {   // RIBBON LASH: the ribbon cracks out in front
      const f = q.f, W = 0.1;
      S.target = q.t < W ? PO.lashA : PO.lashB; S.rate = 50; S.ribbon = { f, u: Math.min(1, Math.max(0, (q.t - W) / 0.12)) };
      if (q.t >= W && !q.snd) { q.snd = 1; FK.whoosh(false, false); FK.noise({ dur: 0.04, cut: 6000, q: 1, vol: 0.2, delay: 0.08 }); }
      if (q.t >= W + 0.05 && q.t < W + 0.16) for (const e of box(p, f, 0.3, 2.6 + 0.5 * q.pw, 1.0, 0.2)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 1.8 + 1.5 * q.pw, { kx: f * (7 + 5 * q.pw), ky: -5, stun: 0.35, big: q.pw > 0.3 }); }
      if (q.t > W + 0.24) { S.ribbon = null; S.seq = null; }
    },
    toss(p, dt, S, q) {   // KITE TOSS: a diamond kite flies out and loops back
      const f = q.f;
      S.target = PO.toss; S.rate = 45;
      if (!q.done && q.t > 0.08) {
        q.done = 1; if (S.kites.length >= 2) S.kites.shift();
        const h = hand(p, PO.toss, f);
        S.kites.push({ x: h[0], y: h[1], ox: h[0], oy: Math.max(h[1], pcy(p) + 0.15), f, t: 0, D: 1.1 + 0.3 * q.pw, R: (5 + 2 * q.pw) * roy(q), hits: new Map(), big: q.royal });
        FK.whoosh(false, false); chime(1);
      }
      if (q.t > 0.3) S.seq = null;
    },
    curtsy(p, dt, S, q) {   // GUST CURTSY: a bow, then a column of wind that throws foes (and lifts her a little)
      S.target = q.t < 0.16 ? PO.curtsy : PO.rise; S.rate = 40;
      if (q.t < 0.16 && p.vy < 0) p.vy = 0;
      if (q.t >= 0.16 && !q.done) {
        q.done = 1; p.vy = -10; p.onGround = false; FK.whoosh(true, true); chime(2);
        S.fx.push({ k: 'column', x: pcx(p), y: p.y + p.h, H: 4.5 * roy(q), t: 0, life: 0.6 });
        for (const e of FK.foes()) if (Math.abs(ex(e) - pcx(p)) < 1.4 * roy(q) && ey(e) < p.y + p.h + 0.3 && ey(e) > p.y - 4 * roy(q)) hit(S, e, (2.5 + 1.5 * q.pw) * roy(q), { kx: FK.face(p) * 2, ky: -16 * (q.royal ? 1.2 : 1), stun: 0.55, big: true });
      }
      if (q.t > 0.5) S.seq = null;
    },
    guard(p, dt, S, q) {   // PETAL GUARD: a ring of petals; a hit during it is countered
      S.target = PO.guard; S.rate = 50; S.petals = q.t;
      if (!q.on) { q.on = 1; p._parryT = 0.45; chime(1); }
      if (p._parried > 0 && !q.countered) {   // countered: petals burst outwards
        q.countered = 1; chime(3);
        for (const e of FK.within(pcx(p), pcy(p), 3)) hit(S, e, 3 * roy(q), { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 12, ky: -9, stun: 0.6, big: true });
        S.fx.push({ k: 'petals', x: pcx(p), y: pcy(p), t: 0, life: 0.6 });
      }
      if (q.t > 0.5) { S.petals = 0; S.seq = null; }
    },
    twirl(p, dt, S, q) {   // RIBBON TWIRL: a spin with the ribbon spiralling round her
      S.target = PO.twirl; S.rate = 50; S.spinT = q.t;
      p.vy = Math.min(p.vy, 1.5);
      if (Math.floor(q.t / 0.1) !== q.n) { q.n = Math.floor(q.t / 0.1); q.hits.clear(); FK.whoosh(false, false); }
      for (const e of FK.within(pcx(p), pcy(p), 1.8 * (q.royal ? 1.3 : 1))) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 1.1 * roy(q), { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 5, ky: -6, stun: 0.3 }); }
      if (q.t > 0.4) { S.spinT = 0; S.seq = null; }
    },
    dash(p, dt, S, q) {   // KITE DASH: rides her cape forwards like a kite on a gust
      const f = q.f, D = 0.32;
      S.target = PO.dash; S.rate = 45; S.selfMove = true;
      if (!q.snd) { q.snd = 1; FK.whoosh(false, true); }
      p.vy = Math.min(p.vy, -1); FK.moveX(p, f * 16 * dt); p.vx = f * 5;
      if (Math.floor(q.t * 30) !== q.d) { q.d = Math.floor(q.t * 30); S.fx.push({ k: 'spark2', x: pcx(p) - f * 0.6, y: pcy(p), t: 0, life: 0.35 }); }
      for (const e of box(p, f, -0.2, 1.4, 1.3)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2 * roy(q), { kx: f * 10, ky: -6, stun: 0.4, big: true }); }
      if (q.t > D) S.seq = null;
    },
    lift(p, dt, S, q) {   // KITE LIFT: the cape pulls her up on a string of wind
      const k = FK.keys(), D = 0.6;
      S.target = PO.rise; S.rate = 40; S.capeOpen = 1;
      p.vy = -(13 - 9 * q.t / D); p.vx = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 6; p.onGround = false;
      if (!q.snd) { q.snd = 1; FK.whoosh(true, true); chime(2); }
      for (const e of FK.within(pcx(p), p.y, 1.4)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 1.5, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 4, ky: -11, stun: 0.35 }); }
      if (q.t > D) { S.capeOpen = 0; S.seq = null; S.floatT = 0; }
    },
    dive(p, dt, S, q) {   // CROWN DIVE: a flip, then a plunge crown-first; lands with a ring of light
      if (q.t < 0.18) { S.target = PO.dive; S.rate = 40; p.vy = -2; S.rot = q.t / 0.18 * Math.PI * q.f; return; }
      S.rot = Math.PI * q.f; p.vy = 24; p.vx = 0;
      for (const e of box(p, 1, -0.6, 1.2, 1.4, -0.6)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 3 * roy(q), { kx: 0, ky: 16, stun: 0.5, big: true, stop: 0.05 }); }
      if (p.onGround || q.t > 1.3) {
        S.rot = 0; const R = 2 * roy(q); FK.thud(false); chime(2);
        S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R, c: C_GOLD, t: 0, life: 0.45 });
        for (const e of FK.within(pcx(p), p.y + p.h - 0.4, R)) if (!q.hits.has(e)) hit(S, e, 2 * roy(q), { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 7, ky: -9, stun: 0.4 });
        S.seq = null;
      }
    },
  };

  function stepWorld(p, dt, S, k) {
    // ROYAL FLOAT: hold jump while falling (once per jump)
    S.floating = false;
    if (p.onGround) S.floatT = 0;
    if (!p.onGround && (p.vy || 0) > 0 && k.jump && !S.seq && S.floatT < 1.4) { S.floatT += dt; p.vy = Math.min(p.vy, 0.6); S.floating = true; }
    // kites: out along a curve, then home to her
    for (let i = S.kites.length - 1; i >= 0; i--) {
      const kt = S.kites[i]; kt.t += dt;
      const u = kt.t / kt.D;
      if (u < 0.5) { const v = FK.easeOut(u * 2); kt.x = kt.ox + kt.f * kt.R * v; kt.y = kt.oy - Math.sin(v * Math.PI) * 0.35; }
      else { const tx = pcx(p), ty = pcy(p) - 0.2, dx = tx - kt.x, dy = ty - kt.y, d = Math.hypot(dx, dy) || 1, sp = 18 * dt; if (d < sp + 0.4) { S.kites.splice(i, 1); continue; } kt.x += dx / d * sp; kt.y += dy / d * sp; }
      for (const [e, c] of kt.hits) { if (c - dt <= 0) kt.hits.delete(e); else kt.hits.set(e, c - dt); }
      for (const e of FK.foes()) if (!kt.hits.has(e) && Math.abs(ex(e) - kt.x) < 0.85 && Math.abs(ey(e) - kt.y) < 0.95) { kt.hits.set(e, 0.35); hit(S, e, kt.big ? 2.4 : 1.6, { kx: Math.sign(e.x - kt.x || kt.f) * 6, ky: -6, stun: 0.35 }); FK.smack(false); }
      if (kt.t > 3) S.kites.splice(i, 1);
    }
    // being hit resets her grace
    const hurt = (S.lastHp != null && p.hp < S.lastHp) || (p.hitstun > 0 && !S.wasStun);
    S.lastHp = p.hp; S.wasStun = p.hitstun > 0;
    if (hurt) S.grace = 0;
  }

  const MOVES = {
    ground: { neutral: { name: 'Ribbon Lash', big: 'GRAND LASH', cd: 0.3 }, side: { name: 'Kite Toss', cd: 0.4 }, up: { name: 'Gust Curtsy', cd: 0.5 }, down: { name: 'Petal Guard', cd: 0.6 } },
    air:    { neutral: { name: 'Ribbon Twirl', cd: 0.4 }, side: { name: 'Kite Dash', cd: 0.45 }, up: { name: 'Kite Lift', cd: 0.3 }, down: { name: 'Crown Dive', cd: 0.4 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;
  // a special at full grace is the ROYAL version
  function royal(S, kind, f, pw, name) { const r = S.grace >= 3; if (r) { S.grace = 0; } startSeq(S, kind, { f, pw, royal: r }); return r ? 'ROYAL ' + name : null; }

  FK.define({
    id: ID, plug: 'kprincess',
    def: { name: 'K-Princess', icon: '🪁', tier: 'prismatic', color: C_FX, color2: C_GOLD,
      ability: 'Kite Princess: Royal Float, boomerang kites, a ribbon wand and Grace-powered ROYAL specials',
      desc: 'The Kite Princess of the sky kingdom: a teal-and-gold gown, a cape cut like a kite and a ribbon wand. Hold jump while falling for ROYAL FLOAT. Kite Toss throws a diamond kite that loops back. Three hits in a row fill her crown (GRACE): the next special is a ROYAL version. Moves: Ribbon Lash, Kite Toss, Gust Curtsy, Petal Guard (counter); in the air Ribbon Twirl, Kite Dash, Kite Lift and Crown Dive.' },
    stats: { speed: 1.05, jump: 1.15, maxJumps: 2, maxDashes: 1, hp: 4 },
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, rot: 0, kites: [], ribbon: null, petals: 0, spinT: 0, floatT: 0, floating: false, capeOpen: 0, grace: 0, airUp: false }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Kite Lift comes back when you land'; return null; },
    act: {
      ground_neutral: (p, f, pw, S) => startSeq(S, 'lash', { f, pw }),
      ground_side: (p, f, pw, S) => royal(S, 'toss', f, pw, 'KITE'),
      ground_up: (p, f, pw, S) => royal(S, 'curtsy', f, pw, 'GUST'),
      ground_down: (p, f, pw, S) => royal(S, 'guard', f, pw, 'GUARD'),
      air_neutral: (p, f, pw, S) => royal(S, 'twirl', f, pw, 'TWIRL'),
      air_side: (p, f, pw, S) => royal(S, 'dash', f, pw, 'DASH'),
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'lift', { f, pw }); },
      air_down: (p, f, pw, S) => royal(S, 'dive', f, pw, 'DIVE'),
    },
    onTeleport(p, S) { S.seq = null; S.kites.length = 0; S.ribbon = null; S.rot = 0; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq) { S.seq = null; S.ribbon = null; S.rot = 0; S.petals = 0; S.capeOpen = 0; }
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      if (!S.seq) { S.rot = 0; S.ribbon = null; S.petals = 0; S.spinT = 0; }
      stepWorld(p, dt, S, k);
      if (!S.seq) S.target = S.floating ? PO.float : FK.locomotion(S, p, dt, PO, { lean: 0.15, aF: [0.5, 0.6] });
      if (p.onGround) S.airUp = false;
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, s = ph / U, cx = px + pw / 2, fy = py + ph;
      ctx.save();
      if (S && S.rot) { ctx.translate(cx, fy - ph * 0.45); ctx.rotate(S.rot); ctx.translate(-cx, -(fy - ph * 0.45)); }
      if (S && S.spinT) { const k = Math.cos(S.spinT * 40); ctx.translate(cx, 0); ctx.scale(k < 0 ? Math.max(-1, k * 1.2) : Math.min(1, k * 1.2 + 0.1), 1); ctx.translate(-cx, 0); }
      const K = FK.skel(P, q, cx, fy, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const open = S ? Math.max(S.floating ? 1 : 0, S.capeOpen || 0) : 0;
      cape(ctx, K, s, t, open);
      // the braid swings behind
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      const hr = K.hr;
      ctx.fillStyle = C_HAIR2; for (let i = 0; i < 6; i++) { const sw = Math.sin(t * 4 - i * 0.6) * i * 0.35 * s; ctx.beginPath(); ctx.ellipse(-hr * 0.7 - i * 0.6 * s + sw, hr * 0.6 + i * 2.2 * s, hr * (0.32 - i * 0.03), hr * 0.3, 0.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = C_GOLD; ctx.beginPath(); ctx.arc(-hr * 0.7 - 3.6 * s + Math.sin(t * 4 - 3.6) * 1.75 * s, hr * 0.6 + 13.2 * s, hr * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      FK.limb(ctx, K.aB, 3.2 * s, C_SKIN, 2.8 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 1.8 * s, '#ffffff');
      // gown: a fitted bodice and a bell skirt with a gold hem that sways (the legs only show as shoes below it)
      const sway = Math.sin(t * 3) * s + (q.lF[0] - q.lB[0]) * 2 * s;
      for (const L of [K.lB, K.lF]) { ctx.fillStyle = C_GOLD2; ctx.beginPath(); ctx.ellipse(L[2][0] + 1.2 * s, L[2][1], 2.4 * s, 1.3 * s, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean * 0.5);
      const Ls = P.hip * s * 0.95 - q.y * s * 0.3, Wt = 15 * s * (1 + 0.15 * open);
      const g = ctx.createLinearGradient(-Wt / 2, 0, Wt / 2, 0); g.addColorStop(0, C_GOWN2); g.addColorStop(0.55, C_GOWN); g.addColorStop(1, '#b8fff8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-4 * s, -1 * s); ctx.lineTo(4 * s, -1 * s);
      ctx.quadraticCurveTo(Wt * 0.5, Ls * 0.4, Wt * 0.55 + sway, Ls); ctx.quadraticCurveTo(0, Ls + 2 * s, -Wt * 0.55 + sway, Ls); ctx.quadraticCurveTo(-Wt * 0.5, Ls * 0.4, -4 * s, -1 * s); ctx.fill();
      ctx.strokeStyle = C_GOLD; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.moveTo(Wt * 0.55 + sway, Ls); ctx.quadraticCurveTo(0, Ls + 2 * s, -Wt * 0.55 + sway, Ls); ctx.stroke();
      ctx.fillStyle = C_GOLD; for (let i = -1; i <= 1; i++) { const dx = i * Wt * 0.28 + sway * 0.7, dy = Ls * 0.6; ctx.beginPath(); ctx.moveTo(dx, dy - 1.6 * s); ctx.lineTo(dx + 1.1 * s, dy); ctx.lineTo(dx, dy + 1.6 * s); ctx.lineTo(dx - 1.1 * s, dy); ctx.fill(); }   // little kite diamonds
      ctx.restore();
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s;
      ctx.fillStyle = C_GOWN; ctx.beginPath(); ctx.moveTo(-4 * s, 0); ctx.lineTo(4 * s, 0); ctx.lineTo(4.6 * s, -Lt + 1 * s); ctx.quadraticCurveTo(0, -Lt - 1 * s, -4.6 * s, -Lt + 1 * s); ctx.fill();
      ctx.fillStyle = C_GOLD; ctx.fillRect(-4 * s, -1.6 * s, 8 * s, 1.6 * s);
      ctx.fillStyle = C_GOLD; ctx.beginPath(); ctx.moveTo(0.5 * s, -Lt * 0.7); ctx.lineTo(2 * s, -Lt * 0.5); ctx.lineTo(0.5 * s, -Lt * 0.3); ctx.lineTo(-1 * s, -Lt * 0.5); ctx.fill();   // a brooch
      ctx.restore();
      // head: oval face, big lashed eyes, the tiara with a kite jewel; a crown of light when Grace is full
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.arc(-hr * 0.1, -hr * 0.05, hr * 1.02, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.ellipse(hr * 0.2, hr * 0.15, hr * 0.78, hr * 0.88, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.moveTo(-hr * 0.7, -hr * 0.2); ctx.quadraticCurveTo(hr * 0.2, -hr * 1.1, hr * 1.0, -hr * 0.25); ctx.quadraticCurveTo(hr * 0.35, -hr * 0.55, -hr * 0.2, -hr * 0.1); ctx.fill();   // a side-swept fringe
      FK.eyes(ctx, hr * 0.3, hr * 0.12, hr * 0.2, hr * 0.42, { pupil: '#1f8f8c' });
      ctx.strokeStyle = '#2e1838'; ctx.lineWidth = hr * 0.07; for (const dx of [0, hr * 0.42]) { ctx.beginPath(); ctx.moveTo(hr * 0.42 + dx, hr * -0.08); ctx.lineTo(hr * 0.56 + dx, -hr * 0.2); ctx.stroke(); }
      ctx.fillStyle = '#ff9aa8'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(hr * 0.78, hr * 0.48, hr * 0.15, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#c2456a'; ctx.beginPath(); ctx.arc(hr * 0.55, hr * 0.62, hr * 0.12, 0, Math.PI); ctx.fill();
      // tiara: a gold band with three points, the middle one a teal kite gem
      ctx.fillStyle = C_GOLD; ctx.beginPath(); ctx.moveTo(-hr * 0.55, -hr * 0.72); ctx.lineTo(-hr * 0.35, -hr * 1.08); ctx.lineTo(-hr * 0.1, -hr * 0.82); ctx.lineTo(hr * 0.15, -hr * 1.35); ctx.lineTo(hr * 0.4, -hr * 0.82); ctx.lineTo(hr * 0.65, -hr * 1.08); ctx.lineTo(hr * 0.82, -hr * 0.68); ctx.quadraticCurveTo(hr * 0.15, -hr * 0.92, -hr * 0.55, -hr * 0.72); ctx.fill();
      ctx.fillStyle = C_FX; ctx.beginPath(); ctx.moveTo(hr * 0.15, -hr * 1.2); ctx.lineTo(hr * 0.3, -hr * 1.0); ctx.lineTo(hr * 0.15, -hr * 0.82); ctx.lineTo(hr * 0.0, -hr * 1.0); ctx.fill();
      if (S && S.grace >= 3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 8); ctx.fillStyle = C_GOLD; ctx.beginPath(); ctx.arc(hr * 0.15, -hr * 1.0, hr * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      ctx.restore();
      // front arm with the ribbon wand (a gold rod with a kite tip)
      FK.limb(ctx, K.aF, 3.2 * s, C_SKIN, 2.8 * s);
      const hx = K.aF[2][0], hy = K.aF[2][1], an = q.aF[0] + q.aF[1];
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(-an + Math.PI);
      ctx.fillStyle = C_GOLD2; ctx.fillRect(-0.5 * s, -8 * s, 1 * s, 9 * s);
      ctx.fillStyle = C_FX; ctx.beginPath(); ctx.moveTo(0, -11.5 * s); ctx.lineTo(1.8 * s, -9 * s); ctx.lineTo(0, -7.5 * s); ctx.lineTo(-1.8 * s, -9 * s); ctx.fill();
      if (!(S && S.ribbon)) { ctx.strokeStyle = C_RIB; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(0, -11 * s); for (let i = 1; i <= 7; i++) ctx.lineTo(-i * 1.5 * s, -11 * s - i * 0.4 * s + Math.sin(t * 6 - i * 0.9) * 1.4 * s); ctx.stroke(); }   // it streams back from the tip, away from her face
      ctx.restore();
      FK.mitt(ctx, hx, hy, 1.9 * s, '#ffffff');
      ctx.restore();
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T, f = FK.face(p);
      if (S.ribbon) {   // the lash: a ribbon that unrolls in a wave
        const u = S.ribbon.u, h = FK.local(V, p, S.ribbon.f, 0.6, p.h * 0.55), L = T * 2.8 * u, pts = [];
        for (let i = 0; i <= 14; i++) { const v = i / 14; pts.push([h[0] + S.ribbon.f * L * v, h[1] + Math.sin(v * 9 - V.now * 20) * T * 0.18 * v]); }
        FK.taper(ctx, pts, T * 0.16, C_RIB, 1);
      }
      if (S.spinT) { const x = V.SX(pcx(p)), y = V.SY(pcy(p)); for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(x, y + (i - 0.5) * T * 0.4, T * 1.6, T * 0.45, 0, V.now * 12 + i * 3, V.now * 12 + i * 3 + 4); FK.glow(ctx, C_RIB, 0.8); ctx.lineWidth = 3; ctx.stroke(); } }
      if (S.petals) { const x = V.SX(pcx(p)), y = V.SY(pcy(p)); for (let i = 0; i < 8; i++) { const an = V.now * 4 + i * Math.PI / 4; petal(ctx, x + Math.cos(an) * T * 1.0, y + Math.sin(an) * T * 1.0, T * 0.22, an); } }
      for (const kt of S.kites) kite(ctx, V.SX(kt.x), V.SY(kt.y), T * (kt.big ? 0.55 : 0.42), Math.sin(kt.t * 10) * 0.3, V.SX(pcx(p)), V.SY(pcy(p)));
    },
    drawFx(ctx, V, f, u, a) {
      if (f.k === 'column') { const x = V.SX(f.x), y = V.SY(f.y), H = f.H * V.T; for (let i = 0; i < 6; i++) { const yy = y - ((u * 1.5 + i / 6) % 1) * H; ctx.beginPath(); ctx.ellipse(x, yy, V.T * (0.7 + 0.5 * (y - yy) / H), V.T * 0.18, 0, 0, Math.PI * 2); FK.glow(ctx, C_FX, a * 0.7); ctx.lineWidth = 2.5; ctx.stroke(); } return true; }
      if (f.k === 'petals') { const x = V.SX(f.x), y = V.SY(f.y); for (let i = 0; i < 12; i++) { const an = i * Math.PI / 6; FK.solid(ctx, '#fff', a); petal(ctx, x + Math.cos(an) * V.T * 3 * FK.easeOut(u), y + Math.sin(an) * V.T * 3 * FK.easeOut(u), V.T * 0.25, an + u * 6); } return true; }
      if (f.k === 'spark2') { FK.star(ctx, V.SX(f.x), V.SY(f.y), V.T * 0.25 * a, u * 4, C_GOLD, a); return true; }
      return false;
    },
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      if (I.air) {
        if (I.dy < -1.5 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.dy > 1 && I.adx < 1.2) return { type: 'tap', v: 'down' };
        if (I.adx < 1.8 && Math.abs(I.dy) < 1.5) return { type: 'tap', v: '' };
        if (I.adx < 4 && Math.abs(I.dy) < 1.2) return { type: 'tap', v: 'side' };
        return null;
      }
      if (I.adx < 2.6 && Math.abs(I.dy) < 1.2) return Math.random() < 0.2 ? { type: 'tap', v: 'down' } : I.killy ? { type: 'charge', v: '', hold: 0.4 } : { type: 'tap', v: '' };
      if (I.dy < -1.5 && I.adx < 1.5) return { type: 'tap', v: 'up' };
      if (I.adx < 7 && Math.abs(I.dy) < 1.5) return { type: 'tap', v: 'side' };
      return null;
    },
  });

  function cape(ctx, K, s, t, open) {   // a kite-shaped cape: closed it hangs, open it spreads into a diamond
    const nx = K.neck[0], ny = K.neck[1] + 1.5 * s, fl = Math.sin(t * 5) * s;
    const w = (5 + 9 * open) * s, L = (16 - 2 * open) * s;
    const g = ctx.createLinearGradient(nx, ny, nx - w, ny + L); g.addColorStop(0, C_CAPE2); g.addColorStop(1, C_CAPE);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx - w - 2 * s + fl, ny + L * 0.4); ctx.lineTo(nx - 3 * s + fl, ny + L); ctx.lineTo(nx + w * 0.5 * open, ny + L * 0.45); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.6 * s; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx - 3 * s + fl, ny + L); ctx.moveTo(nx - w - 2 * s + fl, ny + L * 0.4); ctx.lineTo(nx + w * 0.5 * open, ny + L * 0.45); ctx.stroke();
    // a little tail of bows
    for (let i = 0; i < 3; i++) { const bx = nx - 3 * s + fl - i * 2 * s + Math.sin(t * 6 - i) * s, by = ny + L + 2.5 * s + i * 2.5 * s; ctx.fillStyle = i % 2 ? C_RIB : C_GOLD; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 1.6 * s, by - 1 * s); ctx.lineTo(bx - 1.6 * s, by + 1 * s); ctx.lineTo(bx + 1.6 * s, by - 1 * s); ctx.lineTo(bx + 1.6 * s, by + 1 * s); ctx.fill(); }
  }
  function kite(ctx, x, y, r, rot, hx, hy) {
    ctx.save(); FK.solid(ctx, '#ffffff', 0.5); ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    FK.glow(ctx, C_FX, 0.3); ctx.beginPath(); ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2); ctx.fill();
    FK.solid(ctx, C_CAPE, 1); ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, -r * 0.1); ctx.lineTo(0, r * 1.1); ctx.lineTo(-r * 0.7, -r * 0.1); ctx.closePath(); ctx.fill();
    FK.solid(ctx, C_CAPE2, 1); ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, -r * 0.1); ctx.lineTo(0, -r * 0.1); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, r * 1.1); ctx.lineTo(-r * 0.7, -r * 0.1); ctx.lineTo(0, -r * 0.1); ctx.fill();
    FK.solid(ctx, C_RIB, 1); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(Math.sin(i * 1.5) * r * 0.2, r * (1.4 + i * 0.35), r * 0.12, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function petal(ctx, x, y, r, an) { ctx.save(); ctx.translate(x, y); ctx.rotate(an); FK.solid(ctx, '#ffb3d0', 0.9); ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); FK.solid(ctx, '#ffffff', 0.7); ctx.beginPath(); ctx.ellipse(-r * 0.3, 0, r * 0.4, r * 0.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
})();
