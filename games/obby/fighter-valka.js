/* Obby Builder: VALKA, the spear spacer. Built for Smash.
 *
 * Range is everything: the spear is 3 tiles long and its hits are checked against where the spear really is in
 * each frame of the animation. Hits with the TIP are TIPPERS: double knockback, a gold flash and a freeze frame.
 * Up close the shaft only pushes. Keep people at the end of your spear.
 *
 * MOVEMENT
 *  - POLE VAULT (ground ←/→ + S): plant the spear ahead and vault over it, kicking on the way down.
 *  - JAVELIN (air ←/→ + S): throw the spear. It sticks into the first wall as a PERCH you can stand on (or stands
 *    up in the floor as a post). While it's out, S recalls it, and it cuts through everything on the way back.
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge)
 *  Ground: neutral LONG THRUST, side POLE VAULT, up SKY WHEEL (anti-air arc), down LOW SWEEP (both sides).
 *  Air:    neutral SPEAR TWIRL (both ends), side JAVELIN, up SKYWARD LANCE (recovery), down IMPALE DIVE (spike).
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_valka';
  const C_STEEL = '#cfd8e6', C_STEEL2 = '#8a97ab', C_BLUE = '#2f5fd0', C_BLUE2 = '#1c3a86', C_GOLD = '#ffd166', C_SKIN = '#f0c9a4', C_HAIR = '#f3e3b0', C_SHAFT = '#4a2f1f', C_FX = '#7fb4ff';
  const P = { hip: 9.5, torso: 10, neck: -2.5, head: 9, ua: 5, fa: 5, th: 4.8, sh: 4.8 };
  const U = 31, L = 3.0;   // body units over the hitbox height; spear length in tiles
  const pose = FK.pose, { ex, ey, pcx, pcy } = FK;

  // poses (facing right). sp = spear angle (0 down, PI/2 forward, PI up), gr = grip: tiles of spear behind the hand,
  // sx = spear x scale (foreshortening when it spins toward you)
  const PO = {
    idle:   pose({ y: 0.6, lean: 0.08, aF: [1.0, 0.7], aB: [0.2, 0.6], lF: [0.35, -0.15], lB: [-0.3, -0.1], sp: 1.25, gr: 1.0, sx: 1 }),
    jump:   pose({ aF: [1.3, 0.5], aB: [-0.4, 0.8], lF: [0.8, -1.3], lB: [0.1, -0.7], sp: 1.6, gr: 1.0, sx: 1 }),
    fall:   pose({ aF: [1.4, 0.3], aB: [-1.2, 0.4], lF: [0.4, -0.5], lB: [-0.3, -0.3], sp: 1.9, gr: 1.0, sx: 1 }),
    tWind:  pose({ y: 1.5, lean: -0.15, aF: [0.2, 1.0], aB: [-0.5, 0.6], lF: [0.6, -0.3], lB: [-0.4, -0.2], sp: 1.62, gr: 1.6, sx: 1 }),
    tHit:   pose({ y: 2.5, lean: 0.45, aF: [1.6, 0.0], aB: [-1.0, 0.3], lF: [1.0, -0.4], lB: [-0.9, -0.1], sp: 1.57, gr: 0.5, sx: 1 }),
    wheelA: pose({ y: 1, lean: 0.1, aF: [1.6, 0.3], aB: [0.6, 0.6], lF: [0.4, -0.3], lB: [-0.4, -0.1], sp: 1.85, gr: 0.7, sx: 1 }),
    wheelB: pose({ y: 0, lean: -0.2, aF: [2.9, 0.1], aB: [2.4, 0.4], lF: [0.3, -0.1], lB: [-0.4, -0.2], sp: 3.1, gr: 0.7, sx: 1 }),
    wheelC: pose({ y: 1.5, lean: -0.35, aF: [-2.2, 0.3], aB: [-1.2, 0.5], lF: [0.5, -0.4], lB: [-0.3, -0.3], sp: 4.9, gr: 0.7, sx: 1 }),
    sweep:  pose({ y: 6, lean: 0.4, aF: [1.2, 0.25], aB: [0.6, 0.9], lF: [1.2, -2.0], lB: [-1.3, -0.3], sp: 1.68, gr: 1.2, sx: 1 }),
    twirl:  pose({ lean: 0.05, aF: [1.5, 0.1], aB: [-0.8, 0.6], lF: [0.6, -1.0], lB: [-0.2, -0.6], sp: 0, gr: 1.5, sx: 1 }),
    throwA: pose({ lean: -0.3, aF: [-2.4, 0.4], aB: [1.2, 0.3], lF: [0.5, -0.9], lB: [-0.5, -0.4], sp: 1.7, gr: 1.4, sx: 1 }),
    throwB: pose({ lean: 0.4, aF: [1.7, 0.1], aB: [-1.0, 0.4], lF: [0.7, -0.6], lB: [-0.8, -0.3], sp: 1.6, gr: 1.0, sx: 1 }),
    lance:  pose({ y: -1, lean: -0.05, aF: [3.05, 0.05], aB: [-0.4, 0.5], lF: [0.1, -0.2], lB: [-0.3, -0.7], sp: 3.14, gr: 0.6, sx: 1 }),
    dive:   pose({ y: -2, lean: 0.1, aF: [0.1, 0.0], aB: [2.6, 0.5], lF: [0.3, -0.9], lB: [-0.4, -1.2], sp: 0.0, gr: 0.6, sx: 1 }),
    vault:  pose({ lean: 0.2, aF: [2.0, 0.3], aB: [1.8, 0.4], lF: [1.3, -0.4], lB: [1.0, -0.6], sp: 0.8, gr: 0.4, sx: 1 }),
    kick:   pose({ lean: -0.3, aF: [-1.8, 0.4], aB: [2.4, 0.4], lF: [1.6, -0.1], lB: [0.2, -1.2], sp: 2.3, gr: 1.2, sx: 1 }),
    bare:   pose({ y: 0.6, lean: 0.08, aF: [0.6, 1.4], aB: [0.3, 1.5], lF: [0.35, -0.15], lB: [-0.3, -0.1], sp: 1.25, gr: 1.0, sx: 1 }),
  };

  // the body and spear in world tiles, posed exactly as drawn
  function wskel(p, q, f) {
    const u = p.h / U, K = FK.skel(P, q, 0, 0, u), m = v => [pcx(p) + f * v[0], p.y + p.h + v[1]];
    return { hand: m(K.aF[2]), head: m(K.head), hip: m(K.hip) };
  }
  function spearSeg(p, q, f) {
    const h = wskel(p, q, f).hand, dx = f * Math.sin(q.sp) * (q.sx == null ? 1 : q.sx), dy = Math.cos(q.sp);
    return { a: [h[0] - dx * q.gr, h[1] - dy * q.gr], b: [h[0] + dx * (L - q.gr), h[1] + dy * (L - q.gr)], dx, dy };
  }
  // hit everyone the spear touches this frame; the outer end is the tipper
  function spearHits(S, p, q, f, o, both) {
    const sg = spearSeg(p, q, f), ax = sg.b[0] - sg.a[0], ay = sg.b[1] - sg.a[1], len2 = ax * ax + ay * ay || 1;
    for (const e of FK.foes()) {
      if (S.seq.hits.has(e)) continue;
      const px = ex(e) - sg.a[0], py = ey(e) - sg.a[1], u = Math.max(0, Math.min(1, (px * ax + py * ay) / len2));
      const d = Math.hypot(sg.a[0] + ax * u - ex(e), sg.a[1] + ay * u - ey(e));
      if (d > 0.35 + (e.w || 0.9) / 2) continue;
      S.seq.hits.add(e);
      const tip = u > 0.72 || (both && u < 0.2), dirx = Math.sign(ex(e) - pcx(p)) || f;
      const pw = S.seq.pw || 0, m = 1 + 0.5 * pw;
      if (tip) {
        FK.hit(S, e, (o.tdmg || o.dmg * 2) * m, { kx: (o.kx ? dirx * Math.abs(o.kx) * 2 : 0) + (o.tkx || 0), ky: (o.ky || 0) * 1.7 + (o.tky || 0), stun: 0.6, c: C_GOLD, big: true, stop: 0.11, shake: 7 });
        S.fx.push({ k: 'tip', x: ex(e), y: ey(e), t: 0, life: 0.35 });
        FK.label(S, p, 'TIPPER!', C_GOLD, true);
        FK.tone(1500, { dur: 0.12, vol: 0.18 }); FK.tone(2250, { dur: 0.18, vol: 0.1, delay: 0.03 });
        if (o.onTip) o.onTip(e);
      } else {
        FK.hit(S, e, o.dmg * m, { kx: o.kx ? dirx * Math.abs(o.kx) : 0, ky: o.ky || -3, stun: 0.35, c: C_FX });
        FK.smack(false);
      }
    }
  }
  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set() }, o || {}); }
  function moveX(p, dx) { const nx = p.x + dx; if (!FK.blocked(nx, p.y + 0.02, p.w, p.h - 0.04)) { p.x = nx; return true; } return false; }

  // ---------------------------------------------------------------- the moves, frame by frame
  const SEQ = {
    thrust(p, dt, S, q) {
      const f = q.f;
      S.target = FK.keyed([[0, PO.idle], [0.09, PO.tWind], [0.15, PO.tHit], [0.32, PO.tHit], [0.46, PO.idle]], q.t); S.rate = 45;
      if (q.t > 0.09 && q.t < 0.17) { moveX(p, f * (9 + 4 * q.pw) * dt); if (!q.snd) { q.snd = 1; FK.whoosh(false, true); } }
      if (q.t > 0.12 && q.t < 0.26) spearHits(S, p, S.pose, f, { dmg: 2, kx: 5, ky: -4, tdmg: 5, tky: -4 });
      if (q.t > 0.46) S.seq = null;
    },
    wheel(p, dt, S, q) {
      const f = q.f;
      if (q.t < 0.1 && p.vy < 0) p.vy = 1;   // (↑ starts a jump: stay planted)
      S.target = FK.keyed([[0, PO.wheelA], [0.18, PO.wheelB], [0.32, PO.wheelC], [0.5, PO.idle]], q.t); S.rate = 50;
      if (q.t > 0.04 && q.t < 0.34) spearHits(S, p, S.pose, f, { dmg: 2, kx: 2, ky: -8, tdmg: 5, tky: -4 });
      if (q.t > 0.06 && !q.snd) { q.snd = 1; FK.whoosh(true, true); }
      if (q.t > 0.5) S.seq = null;
    },
    sweep(p, dt, S, q) {
      const f = q.f, u = Math.min(1, q.t / 0.38);
      // the spear swings round from the front, past the camera, to the back
      const sx = Math.cos(FK.ease(Math.max(0, (q.t - 0.06) / 0.3)) * Math.PI);
      S.target = Object.assign({}, PO.sweep, { sx }); S.rate = 40;
      if (q.t > 0.06 && q.t < 0.36 && Math.abs(sx) > 0.35) {
        const half = sx > 0 ? 'f' : 'b';
        if (q.half !== half) { q.half = half; q.hits = new Set(); }
        spearHits(S, p, S.target, f, { dmg: 2, kx: 3, ky: -6, tdmg: 4, tky: -6 });
      }
      if (q.t > 0.06 && !q.snd) { q.snd = 1; FK.noise({ dur: 0.3, cut: 2400, cutEnd: 600, q: 2, vol: 0.2 }); }
      if (u >= 1 && q.t > 0.5) S.seq = null;
    },
    vault(p, dt, S, q) {
      const f = q.f;
      if (!q.P0) {
        // plant: find the floor ahead
        let gx = pcx(p) + f * 1.7, gy = p.y + p.h;
        if (!FK.blocked(gx - 0.1, gy, 0.2, 0.2)) { gy = p.y + p.h; }
        q.P0 = [gx, gy]; q.x0 = pcx(p); q.y0 = p.y;
        FK.tone(240, { type: 'square', dur: 0.05, vol: 0.12 }); FK.noise({ dur: 0.08, cut: 900, vol: 0.2 });
      }
      const T1 = 0.08, T2 = 0.5;
      p.vx = 0; p.vy = 0; S.selfMove = true;
      if (q.t < T1) { S.target = PO.tWind; S.rate = 40; S.plant = q.P0; return; }
      const u = Math.min(1, (q.t - T1) / (T2 - T1)), th = Math.PI * FK.ease(u);
      const R = Math.abs(q.P0[0] - q.x0), H = 2.6 + 0.8 * q.pw;
      const nx = q.P0[0] - f * R * Math.cos(th) - p.w / 2, ny = q.y0 - H * Math.sin(th);
      if (!FK.blocked(nx, ny, p.w, p.h)) { p.x = nx; p.y = ny; } else { S.seq = null; S.plant = null; return; }
      p.onGround = false;
      S.plant = u < 0.6 ? q.P0 : null;
      S.target = u < 0.55 ? PO.vault : PO.kick; S.rate = 30;
      if (u > 0.45) for (const e of FK.within(pcx(p) + f * 0.4, pcy(p) + 0.3, 1.1)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 4 + 2 * q.pw, { kx: f * 9, ky: -7, stun: 0.5, c: C_FX, big: true }); FK.smack(true); }
      if (u >= 1) { S.seq = null; S.plant = null; p.vx = f * 6; S.carry = { vx: f * 7, t: 0.3 }; p.vy = 2; }
    },
    twirl(p, dt, S, q) {
      const f = q.f, u = q.t / 0.42;
      if (u > 0.5 && !q.half) { q.half = 1; q.hits = new Set(); }
      S.target = Object.assign({}, PO.twirl, { sp: u * Math.PI * 4 * f * f, gr: L / 2 }); S.rate = 60;
      p.vy = Math.min(p.vy, 1.5);
      spearHits(S, p, S.target, f, { dmg: 2, kx: 5, ky: -5, tdmg: 4 }, true);
      if (Math.floor(q.t * 9) !== q.ws) { q.ws = Math.floor(q.t * 9); FK.whoosh(false); }
      if (u >= 1) S.seq = null;
    },
    throw(p, dt, S, q) {
      const f = q.f;
      S.target = FK.keyed([[0, PO.throwA], [0.1, PO.throwB], [0.3, PO.fall]], q.t); S.rate = 45;
      p.vy = Math.min(p.vy, 1);
      if (q.t >= 0.1 && !q.done) {
        q.done = 1;
        const h = wskel(p, PO.throwB, f).hand;
        S.jav = { x: h[0] + f * 1.5, y: h[1], vx: f * (24 + 6 * q.pw), vy: -1.5, st: 'fly', t: 0, ang: Math.PI / 2, f, hits: new Set(), pw: q.pw };
        FK.whoosh(false, true); FK.tone(700, { dur: 0.2, slide: 1400, vol: 0.12 });
      }
      if (q.t > 0.32) S.seq = null;
    },
    lance(p, dt, S, q) {
      const f = q.f;
      if (!q.go) { q.go = 1; p.vy = -15 - 2 * q.pw; FK.whoosh(true, true); }
      S.target = PO.lance; S.rate = 45;
      if (q.t < 0.32) spearHits(S, p, S.target, f, { dmg: 2, kx: 1, ky: -9, tdmg: 5, tky: -6 });
      if (q.t > 0.42) S.seq = null;
    },
    dive(p, dt, S, q) {
      const f = q.f;
      S.target = PO.dive; S.rate = 40;
      if (q.t < 0.08) { p.vy = -1.5; return; }
      p.vy = 23 + 4 * q.pw; p.vx = f * 1.5;
      spearHits(S, p, S.target, f, { dmg: 2, kx: 2, ky: 4, tdmg: 5, tky: 12, onTip: () => { p.vy = FK.inSmash() ? p.vy : -11; q.bounce = 1; } });
      if (q.bounce) { S.seq = null; p.vy = -11; return; }
      if (p.onGround && q.t > 0.1) { S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: 1.4, t: 0, life: 0.35, c: C_FX }); FK.thud(false); S.seq = null; }
      if (q.t > 0.9) S.seq = null;
    },
    recall(p, dt, S, q) { S.target = PO.throwB; S.rate = 30; if (!S.jav || q.t > 0.6) S.seq = null; },
  };

  // ---------------------------------------------------------------- the javelin (out of hand)
  function stepJav(p, dt, S) {
    const J = S.jav; if (!J) return;
    J.t += dt;
    const hitFoes = (dmg, kx, ky) => {
      const tipx = J.x + Math.sin(J.ang) * J.f * 0, tipy = J.y;
      for (const e of FK.foes()) { if (J.hits.has(e)) continue; if (Math.abs(ex(e) - J.x) < 0.9 + (e.w || 0.9) / 2 && Math.abs(ey(e) - tipy) < 0.6 + (e.h || 0.9) / 2) { J.hits.add(e); FK.hit(S, e, dmg, { kx, ky, stun: 0.6, c: C_GOLD, big: true, stop: 0.08 }); FK.smack(true); } }
    };
    if (J.st === 'fly') {
      J.vy += 7 * dt;
      const n = 4;
      for (let i = 0; i < n; i++) {
        J.x += J.vx * dt / n; J.y += J.vy * dt / n;
        J.ang = Math.atan2(Math.abs(J.vx), J.vy);   // points along its flight
        const tip = [J.x + J.f * 1.5 * Math.sin(J.ang), J.y + 1.5 * Math.cos(J.ang)];
        if (FK.blocked(tip[0] - 0.05, tip[1] - 0.05, 0.1, 0.1)) {
          if (Math.abs(J.vx) > Math.abs(J.vy) * 0.8) {   // into a wall: a perch sticking out of it
            J.st = 'wall'; J.ang = Math.PI / 2; J.y = Math.floor(tip[1]) + 0.5; J.x = (J.f > 0 ? Math.floor(tip[0]) : Math.ceil(tip[0])) - J.f * 1.5 + J.f * 0.35;
          } else { J.st = 'post'; J.ang = 0.12; J.y = Math.floor(tip[1]) - 1.5 + 0.35; J.x = tip[0]; }
          J.t = 0; FK.thud(false); FK.tone(1200, { dur: 0.08, vol: 0.12 }); S.fx.push({ k: 'ring', x: tip[0], y: tip[1], R: 0.8, c: C_FX, t: 0, life: 0.3 });
          FK.label(S, p, J.st === 'wall' ? 'PERCH!' : 'POST!', C_FX);
          break;
        }
      }
      hitFoes(5 + 2 * (J.pw || 0), J.f * 10, -6);
      if (J.t > 1.4) { J.st = 'back'; J.hits = new Set(); }
      return;
    }
    if (J.st === 'back') {
      const h = [pcx(p), pcy(p)], dx = h[0] - J.x, dy = h[1] - J.y, d = Math.hypot(dx, dy) || 1, sp = 30 * dt;
      J.ang = Math.atan2(-dx * J.f, -dy) ; J.ang = Math.atan2(Math.abs(dx), dy);
      if (d < sp + 0.6) { S.jav = null; FK.tone(900, { dur: 0.08, vol: 0.12 }); S.fx.push({ k: 'ring', x: h[0], y: h[1], R: 0.7, c: C_FX, t: 0, life: 0.25 }); return; }
      J.x += dx / d * sp; J.y += dy / d * sp;
      hitFoes(4, Math.sign(dx) * 9, -7);
      return;
    }
    // stuck: stand on it. A wall javelin is a ledge out of the wall; a post has a small top
    const top = J.st === 'wall' ? J.y - 0.08 : J.y - 1.5 * Math.cos(J.ang) - 0.05;
    const x0 = J.st === 'wall' ? Math.min(J.x - J.f * 1.5, J.x + J.f * 1.5) : J.x - 0.35, x1 = J.st === 'wall' ? Math.max(J.x - J.f * 1.5, J.x + J.f * 1.5) : J.x + 0.35;
    const k = FK.keys();
    if (!k.down && (p.vy || 0) >= 0 && pcx(p) > x0 - 0.2 && pcx(p) < x1 + 0.2 && p.y + p.h > top - 0.05 && p.y + p.h < top + 0.45) {
      p.y = top - p.h; p.vy = 0; p.onGround = true; S.perched = true; S.airUp = false;
      if (window._setJumpCount) window._setJumpCount(0);
    } else S.perched = false;
    if (J.t > 9) { J.st = 'back'; J.hits = new Set(); }
  }

  // ---------------------------------------------------------------- the fighter
  const MOVES = {
    ground: { neutral: { name: 'Long Thrust', big: 'PIERCING THRUST', cd: 0.3 }, side: { name: 'Pole Vault', cd: 0.4 }, up: { name: 'Sky Wheel', cd: 0.3 }, down: { name: 'Low Sweep', cd: 0.35 } },
    air:    { neutral: { name: 'Spear Twirl', cd: 0.3 }, side: { name: 'Javelin', big: 'SKY JAVELIN', cd: 0.4 }, up: { name: 'Skyward Lance', cd: 0.3 }, down: { name: 'Impale Dive', cd: 0.4 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  FK.define({
    id: ID, plug: 'valka',
    def: { name: 'Valka', icon: '🔱', tier: 'gold', color: C_FX, color2: C_GOLD,
      ability: 'Spear Spacer: 3-tile reach, TIPPER hits at the spear tip, Pole Vault, a Javelin you can stand on',
      desc: 'A winged sky-knight with a 3-tile spear. Hit with the very tip for a TIPPER: double knockback. Long Thrust, Pole Vault (plant and vault over), Sky Wheel and Low Sweep on the ground; Spear Twirl, Javelin (throw it: it sticks in walls as a perch you can stand on; S recalls it), Skyward Lance and Impale Dive in the air.' },
    stats: { speed: 1.1, jump: 1.15, maxJumps: 2, maxDashes: 1, hp: 3 },
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, jav: null, airUp: false, plant: null, carry: null, perched: false }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Skyward Lance comes back when you land'; return null; },
    // with the spear thrown, S calls it back
    pressS(p, S) {
      if (S.seq) return true;
      if (S.jav && S.jav.st !== 'back') { S.jav.st = 'back'; S.jav.hits = new Set(); startSeq(S, 'recall', { f: FK.face(p) }); FK.label(S, p, 'RECALL!', C_GOLD); FK.whoosh(false, true); return true; }
      if (S.jav) return true;
      return false;
    },
    act: {
      ground_neutral: (p, f, pw, S) => startSeq(S, 'thrust', { f, pw }),
      ground_side: (p, f, pw, S) => startSeq(S, 'vault', { f, pw }),
      ground_up: (p, f, pw, S) => startSeq(S, 'wheel', { f, pw }),
      ground_down: (p, f, pw, S) => startSeq(S, 'sweep', { f, pw }),
      air_neutral: (p, f, pw, S) => startSeq(S, 'twirl', { f, pw }),
      air_side: (p, f, pw, S) => startSeq(S, 'throw', { f, pw }),
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'lance', { f, pw }); },
      air_down: (p, f, pw, S) => startSeq(S, 'dive', { f, pw }),
    },
    onTeleport(p, S) { S.seq = null; S.plant = null; if (S.jav && S.jav.st !== 'back') S.jav.st = 'back'; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq) { S.seq = null; S.plant = null; }
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      stepJav(p, dt, S);
      if (!S.seq) {
        const base = S.jav ? PO.bare : null;
        if (p.onGround && Math.abs(p.vx || 0) > 0.8) {
          S.run += dt * Math.abs(p.vx) * 1.7; const r = S.run, sw = Math.sin(r);
          S.target = pose({ y: 0.3 - Math.abs(Math.cos(r)) * 0.8, lean: 0.25, aF: [1.1, 0.5], aB: [0.3 - sw * 0.8, 0.8], lF: [0.15 + sw * 0.8, -0.3 - Math.max(0, Math.cos(r)) * 1.2], lB: [0.15 - sw * 0.8, -0.3 - Math.max(0, -Math.cos(r)) * 1.2], sp: 1.85, gr: 1.4, sx: 1 });
        } else if (p.onGround) S.target = base || pose(Object.assign({}, PO.idle, { y: PO.idle.y + 0.4 * Math.sin(performance.now() / 1000 * 2.4) }));
        else S.target = (p.vy || 0) < 0 ? PO.jump : PO.fall;
        if (S.carry) { S.carry.t -= dt; if (S.carry.t <= 0 || p.onGround) S.carry = null; else if (Math.abs(p.vx || 0) < Math.abs(S.carry.vx)) p.vx = S.carry.vx; }
      }
      if (p.onGround && !S.perched) S.airUp = false;
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing: a winged-helm sky-knight with a long spear
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, s = ph / U, cx = px + pw / 2, fy = py + ph;
      const K = FK.skel(P, q, cx, fy, s), held = !(S && S.jav);
      const Tpx = ph / (p ? p.h : 0.92);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(127,180,255,0.45)';
      // cape behind
      const nk = K.neck, wv = Math.sin(t * 6) * s;
      ctx.fillStyle = C_BLUE2; ctx.beginPath(); ctx.moveTo(nk[0] - 3 * s, nk[1] + 1 * s); ctx.quadraticCurveTo(nk[0] - 11 * s, nk[1] + 7 * s + wv, nk[0] - 11 * s, nk[1] + 15 * s); ctx.lineTo(nk[0] - 2 * s, nk[1] + 12 * s); ctx.closePath(); ctx.fill();
      // back limbs
      FK.limb(ctx, K.lB, 5.2 * s, '#8a97ab', 4.8 * s);
      FK.mitt(ctx, K.lB[2][0] + 0.8 * s, K.lB[2][1] - 0.4 * s, 2.6 * s, '#6c788c');
      FK.limb(ctx, K.aB, 4.4 * s, '#c9a283', 4 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 2.6 * s, '#8a97ab');
      // body: a rounded blue tabard with a silver breastplate and a gold belt
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s, W = 15 * s;
      FK.blob(ctx, W, Lt, C_BLUE, C_BLUE2, 6 * s);
      ctx.shadowBlur = 0;
      const g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); g.addColorStop(0, C_STEEL2); g.addColorStop(0.6, C_STEEL); g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-W / 2 + 1 * s, -Lt, W - 2 * s, Lt * 0.6, [6 * s, 6 * s, 3 * s, 3 * s]); ctx.fill();
      ctx.fillStyle = C_GOLD; ctx.fillRect(-W / 2, -Lt * 0.36, W, 1.6 * s);
      ctx.fillStyle = C_GOLD; ctx.beginPath(); ctx.moveTo(W * 0.15, -Lt * 0.86); ctx.lineTo(W * 0.27, -Lt * 0.7); ctx.lineTo(W * 0.15, -Lt * 0.54); ctx.lineTo(W * 0.03, -Lt * 0.7); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
      // the spear, behind the front hand
      if (held) {
        const hx = K.aF[2][0], hy = K.aF[2][1], dx = Math.sin(q.sp) * (q.sx == null ? 1 : q.sx), dy = Math.cos(q.sp), gr = q.gr * Tpx, len = L * Tpx;
        const ax = hx - dx * gr, ay = hy - dy * gr, bx = hx + dx * (len - gr), by = hy + dy * (len - gr);
        ctx.strokeStyle = C_SHAFT; ctx.lineWidth = 2.2 * s; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.strokeStyle = C_GOLD; ctx.lineWidth = 2.6 * s; ctx.beginPath(); ctx.moveTo(bx - dx * 4.2 * s, by - dy * 4.2 * s); ctx.lineTo(bx - dx * 3.2 * s, by - dy * 3.2 * s); ctx.stroke();
        drawBlade(ctx, bx, by, dx, dy, s * 1.3);
      }
      // front leg: silver boots
      FK.limb(ctx, K.lF, 5.4 * s, C_STEEL, 5 * s);
      FK.mitt(ctx, K.lF[2][0] + 0.8 * s, K.lF[2][1] - 0.4 * s, 2.8 * s, C_STEEL2);
      // head: a big round face, braid, winged silver helm and a blue crest
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      const hr = K.hr;
      ctx.strokeStyle = C_HAIR; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-hr * 0.7, hr * 0.1); ctx.quadraticCurveTo(-hr * 1.35, hr * 0.8 + Math.sin(t * 5) * s, -hr * 1.1, hr * 1.5); ctx.stroke();
      ctx.fillStyle = C_GOLD; ctx.beginPath(); ctx.arc(-hr * 1.1, hr * 1.5, 1.4 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.arc(0, 0, hr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f59e9e'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(hr * 0.62, hr * 0.38, hr * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      FK.eyes(ctx, hr * 0.08, hr * 0.1, hr * 0.2, hr * 0.48, { pupil: '#1f4fb8' });
      ctx.strokeStyle = '#7a3b2a'; ctx.lineWidth = 0.8 * s; ctx.beginPath(); ctx.moveTo(hr * 0.35, hr * 0.55); ctx.quadraticCurveTo(hr * 0.5, hr * 0.62, hr * 0.62, hr * 0.52); ctx.stroke();
      const hg = ctx.createLinearGradient(0, -hr, 0, -hr * 0.1); hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, C_STEEL2);
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, -hr * 0.05, hr * 1.04, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(hr * 1.04, -hr * 0.18); ctx.lineTo(-hr * 1.04, -hr * 0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C_GOLD; ctx.fillRect(-hr * 1.04, -hr * 0.28, hr * 2.08, hr * 0.12);
      // a white wing on the side of the helm
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-hr * 0.55, -hr * 0.55);
      for (let i = 0; i < 3; i++) ctx.quadraticCurveTo(-hr * (1.2 + i * 0.3), -hr * (1.5 - i * 0.2) + Math.sin(t * 4) * s * 0.4, -hr * (0.9 + i * 0.35), -hr * (0.9 - i * 0.18));
      ctx.lineTo(-hr * 0.4, -hr * 0.3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C_STEEL2; ctx.lineWidth = 0.5 * s; ctx.stroke();
      ctx.fillStyle = C_BLUE; ctx.beginPath(); ctx.moveTo(-hr * 0.3, -hr * 0.95); ctx.quadraticCurveTo(hr * 0.1, -hr * 1.7, hr * 0.8, -hr * 1.35); ctx.quadraticCurveTo(hr * 0.35, -hr * 1.2, hr * 0.35, -hr * 0.92); ctx.closePath(); ctx.fill();
      ctx.restore();
      // front arm: a silver pauldron and a gauntlet on the spear
      FK.limb(ctx, K.aF, 4.6 * s, C_SKIN, 4.2 * s);
      ctx.fillStyle = C_STEEL; ctx.beginPath(); ctx.ellipse(K.aF[0][0], K.aF[0][1] + 0.8 * s, 3.6 * s, 3 * s, q.lean, 0, Math.PI * 2); ctx.fill();
      FK.mitt(ctx, K.aF[2][0], K.aF[2][1], 2.8 * s, C_STEEL2);
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T, f = FK.face(p), q = S.seq;
      // the javelin in flight, stuck, or flying home
      if (S.jav) {
        const J = S.jav, x = V.SX(J.x), y = V.SY(J.y), dx = Math.sin(J.ang) * J.f, dy = Math.cos(J.ang), len = L * T;
        const ax = x - dx * len / 2, ay = y - dy * len / 2, bx = x + dx * len / 2, by = y + dy * len / 2;
        if (J.st === 'fly' || J.st === 'back') { const pts = []; for (let i = 0; i <= 8; i++) pts.push([ax - dx * i * T * 0.3, ay - dy * i * T * 0.3]); FK.taper(ctx, pts, T * 0.12, J.st === 'back' ? C_GOLD : C_FX, 0.75); }
        FK.solid(ctx, C_SHAFT); ctx.lineWidth = T * 0.07; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        drawBlade(ctx, bx, by, dx, dy, T / 22);
        if (J.st === 'wall' || J.st === 'post') { ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); FK.glow(ctx, C_FX, 0.35 + 0.2 * Math.sin(V.now * 5)); ctx.lineWidth = 3; ctx.stroke(); }
      }
      // pole vault: the planted spear from her hands to the ground
      if (S.plant) {
        const h = wskel(p, S.pose, f).hand, x1 = V.SX(h[0]), y1 = V.SY(h[1]), x2 = V.SX(S.plant[0]), y2 = V.SY(S.plant[1]);
        FK.solid(ctx, C_SHAFT); ctx.lineWidth = T * 0.07; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        FK.star(ctx, x2, y2, T * 0.25, V.now * 6, C_FX, 0.7);
      }
      // swing trails: a crescent behind the spear tip while it's moving fast
      if (q && S.jav == null && ['thrust', 'wheel', 'sweep', 'twirl', 'lance', 'dive'].includes(q.kind)) {
        S.trail = S.trail || []; const sg = spearSeg(p, S.pose, f); S.trail.push([V.SX(sg.b[0]), V.SY(sg.b[1])]); if (S.trail.length > 7) S.trail.shift();
        if (S.trail.length > 2) FK.taper(ctx, S.trail.slice().reverse(), T * 0.2, q.kind === 'sweep' || q.kind === 'twirl' ? C_GOLD : C_FX, 0.75);
        if (q.kind === 'thrust' && q.t > 0.12 && q.t < 0.3) { const pts = []; for (let i = 0; i <= 8; i++) pts.push([V.SX(sg.b[0]) - f * i * T * 0.32, V.SY(sg.b[1]) + Math.sin(i + V.now * 40) * 1.5]); FK.taper(ctx, pts, T * 0.18, '#ffffff', 0.7); }
      } else S.trail = null;
    },
    drawFx(ctx, V, f, u, a) {
      if (f.k === 'tip') { const x = V.SX(f.x), y = V.SY(f.y), T = V.T; FK.star(ctx, x, y, T * (0.9 + u * 0.8), u * 2, C_GOLD, a, 4); FK.star(ctx, x, y, T * (0.5 + u * 0.5), 0.78 + u * 2, '#ffffff', a, 4); ctx.beginPath(); ctx.arc(x, y, T * (0.3 + u * 1.4), 0, Math.PI * 2); FK.glow(ctx, C_GOLD, a); ctx.lineWidth = 3; ctx.stroke(); return true; }
      return false;
    },
    // Smash CPU: fight at the end of the spear
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      if (S.jav) return (S.jav.st === 'wall' || S.jav.st === 'post') && Math.random() < 0.3 ? { type: 'tap', v: '' } : null;
      if (I.air) {
        if (I.dy > 0.8 && I.adx < 1.0) return { type: 'tap', v: 'down' };
        if (I.dy < -0.8 && I.adx < 1.6 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.adx > 3 && I.adx < 8 && Math.abs(I.dy) < 1.5 && Math.random() < 0.25) return { type: 'tap', v: 'side' };
        if (I.adx < 3.2 && Math.abs(I.dy) < 2.2) return { type: 'tap', v: '' };
        return null;
      }
      if (I.dy < -1.2 && I.adx < 2.6) return { type: 'tap', v: 'up' };
      if (I.adx < 1.2 && Math.abs(I.dy) < 1.2) return Math.random() < 0.5 ? { type: 'tap', v: 'down' } : { type: 'tap', v: 'up' };
      if (I.adx > 1.8 && I.adx < 3.6 && Math.abs(I.dy) < 1.0) return I.killy ? { type: 'charge', v: '', hold: 0.6 } : { type: 'tap', v: '' };
      if (I.adx > 4 && I.adx < 6.5 && Math.abs(I.dy) < 1 && I.r < 0.3) return { type: 'tap', v: 'side' };
      return null;
    },
  });
  function drawBlade(ctx, bx, by, dx, dy, s) {
    // a leaf blade with a crossbar
    const nx = -dy, ny = dx;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = C_STEEL; ctx.beginPath();
    ctx.moveTo(bx + dx * 2.6 * s, by + dy * 2.6 * s);
    ctx.quadraticCurveTo(bx + nx * 1.6 * s, by + ny * 1.6 * s, bx - dx * 2.4 * s, by - dy * 2.4 * s);
    ctx.quadraticCurveTo(bx - nx * 1.6 * s, by - ny * 1.6 * s, bx + dx * 2.6 * s, by + dy * 2.6 * s); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.4 * s; ctx.beginPath(); ctx.moveTo(bx + dx * 2.4 * s, by + dy * 2.4 * s); ctx.lineTo(bx - dx * 2 * s, by - dy * 2 * s); ctx.stroke();
    ctx.strokeStyle = C_GOLD; ctx.lineWidth = 0.9 * s; ctx.beginPath(); ctx.moveTo(bx - dx * 2.4 * s + nx * 1.6 * s, by - dy * 2.4 * s + ny * 1.6 * s); ctx.lineTo(bx - dx * 2.4 * s - nx * 1.6 * s, by - dy * 2.4 * s - ny * 1.6 * s); ctx.stroke();
  }
})();
