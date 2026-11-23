/* Obby Builder: KODIAK, the heavyweight grappler. Built for Smash.
 *
 * The heaviest fighter (weight 1.35): slow, hard to launch, armored on his big moves, and his grabs kill.
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge)
 *  Ground: neutral BEAR HUG (command grab), side RUNNING LARIAT (armored), up URSA UPPERCUT (armored launcher),
 *          down IRON GUARD (parry: melee is caught into a COUNTER SUPLEX, shots are reflected).
 *  Air:    neutral BODY SPLASH, side FLYING TACKLE (air grab into a spinning throw),
 *          up SKY CLUTCH (rising grab into a piledriver; his recovery), down METEOR DROP (armored knee drop, spikes).
 * THROWS (while holding someone, S + a direction; nothing = forward after a moment):
 *  forward GRIZZLY TOSS (spin and hurl), back BACKBREAKER SUPLEX, up MOUNTAIN PILEDRIVER (leap, flip, drive them
 *  into the floor), down TRIPLE SLAM (front, back, front).
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_kodiak';
  const C_FUR = '#6b4226', C_FUR2 = '#4a2c18', C_SKIN = '#c98b5e', C_SKIN2 = '#a86c44', C_TRUNK = '#7a1022', C_GOLD = '#f2c14e', C_BOOT = '#b3122e', C_TAPE = '#f4efe6', C_EYE = '#ffb020', C_FX = '#ff8a3d';
  const P = { hip: 9.5, torso: 12, neck: -3.5, head: 9.5, ua: 5.5, fa: 5.5, th: 4.8, sh: 4.8 };
  const U = 33;   // the body is drawn U units tall over the hitbox height (a bit bigger than the hitbox: he's huge)
  const pose = FK.pose;

  // ---------------------------------------------------------------- poses (facing right)
  const PO = {
    idle:    pose({ y: 1.2, lean: 0.12, aF: [0.9, 0.9], aB: [0.6, 1.1], lF: [0.32, -0.25], lB: [-0.28, -0.12] }),
    jump:    pose({ lean: 0.05, aF: [2.4, 0.5], aB: [2.1, 0.6], lF: [0.9, -1.5], lB: [0.3, -1.0] }),
    fall:    pose({ lean: 0.0, aF: [1.9, 0.3], aB: [-1.6, -0.3], lF: [0.35, -0.5], lB: [-0.3, -0.3] }),
    land:    pose({ y: 4.5, lean: 0.3, aF: [0.9, 1.2], aB: [0.6, 1.3], lF: [0.9, -1.7], lB: [-0.5, -1.0] }),
    reach:   pose({ y: 1.5, lean: 0.45, aF: [1.55, 0.1], aB: [1.45, 0.15], lF: [0.6, -0.3], lB: [-0.55, -0.1] }),
    whiff:   pose({ y: 2.5, lean: 0.75, aF: [1.0, 0.2], aB: [0.9, 0.2], lF: [0.8, -0.8], lB: [-0.7, -0.2], head: 0.3 }),
    hug:     pose({ y: 1.2, lean: 0.25, aF: [1.25, 1.35], aB: [1.15, 1.45], lF: [0.4, -0.35], lB: [-0.4, -0.1] }),
    hug2:    pose({ y: 2.0, lean: 0.35, aF: [1.2, 1.55], aB: [1.1, 1.6], lF: [0.45, -0.5], lB: [-0.45, -0.2], head: 0.2 }),
    lift:    pose({ y: 0.5, lean: -0.1, aF: [2.95, 0.15], aB: [2.85, 0.2], lF: [0.35, -0.1], lB: [-0.35, -0.05] }),
    squatUp: pose({ y: 5, lean: 0.1, aF: [2.9, 0.4], aB: [2.8, 0.45], lF: [1.0, -1.9], lB: [-0.6, -1.3] }),
    arch:    pose({ y: 7, lean: -1.85, head: -0.6, aF: [-2.5, 0.2], aB: [-2.4, 0.25], lF: [0.9, -1.6], lB: [0.6, -1.4] }),
    spinOut: pose({ y: 1.5, lean: -0.1, aF: [1.6, 0.0], aB: [1.5, 0.05], lF: [0.5, -0.3], lB: [-0.5, -0.2] }),
    throwFT: pose({ y: 2, lean: 0.55, aF: [1.9, 0.0], aB: [-0.8, 0.4], lF: [0.8, -0.6], lB: [-0.8, -0.1] }),
    lWind:   pose({ y: 2, lean: -0.2, aF: [-1.5, 0.2], aB: [0.6, 1.3], lF: [0.5, -0.6], lB: [-0.4, -0.4] }),
    lRun:    pose({ y: 1, lean: 0.55, aF: [1.55, -0.05], aB: [-0.7, 0.8], lF: [0.9, -0.9], lB: [-0.8, -0.4] }),
    lFollow: pose({ y: 2.5, lean: 0.35, aF: [2.6, 1.6], aB: [-0.4, 0.6], lF: [0.7, -0.4], lB: [-0.9, -0.2] }),
    uCrouch: pose({ y: 6, lean: 0.55, aF: [0.5, 2.3], aB: [0.9, 1.6], lF: [1.1, -2.0], lB: [-0.5, -1.4] }),
    upper:   pose({ y: -1, lean: -0.15, aF: [3.05, 0.2], aB: [-0.6, 0.6], lF: [0.15, -0.1], lB: [-0.3, -0.6], head: -0.2 }),
    guard:   pose({ y: 3, lean: 0.2, aF: [1.0, 2.15], aB: [0.85, 2.25], lF: [0.6, -0.9], lB: [-0.5, -0.5], head: 0.15 }),
    splash:  pose({ lean: 1.45, head: -0.9, aF: [2.6, 0.0], aB: [0.4, 0.0], lF: [-1.4, 0.1], lB: [-1.8, 0.1] }),
    tackle:  pose({ lean: 1.1, head: -0.5, aF: [1.65, 0.05], aB: [1.5, 0.15], lF: [-0.7, -0.4], lB: [-1.0, -0.2] }),
    clutch:  pose({ y: -1, lean: -0.05, aF: [2.95, 0.15], aB: [2.75, 0.25], lF: [0.1, -0.2], lB: [-0.35, -0.5] }),
    knee:    pose({ y: -2, lean: -0.15, aF: [2.6, 0.7], aB: [-2.5, -0.5], lF: [1.5, -2.4], lB: [-0.15, -0.2] }),
    tuck:    pose({ y: -1, lean: 0.4, aF: [2.9, 0.3], aB: [2.8, 0.35], lF: [1.4, -2.2], lB: [1.0, -2.0] }),
  };

  // ---------------------------------------------------------------- helpers
  const { ex, ey, pcx, pcy } = FK;
  const groundBelow = (x, y, w) => FK.blocked(x, y, w, 0.12);
  function holdFoe(e, x, y) {
    const w = e.w || 0.9, h = e.h || 0.9, nx = x - w / 2, ny = y - h / 2;
    if (!FK.blocked(nx, ny, w, h)) { e.x = nx; e.y = ny; }
    e.vx = 0; e.vy = 0; e._held = true; e.stunTimer = Math.max(e.stunTimer || 0, 0.4);
  }
  function letGo(e) { if (e) e._held = false; }
  function chip(e, n) { if (!e || e.dead) return; e.hp = Math.max(0, (e.hp || 1) - n); e.hitFlash = 0.12; if (e.hp <= 0 && window._killEnemy) window._killEnemy(e); }
  function impact(S, x, y, R, big) {
    S.fx.push({ k: 'shock', x, y, R, t: 0, life: big ? 0.6 : 0.45, c: C_FX });
    S.fx.push({ k: 'flash', x, y: y - 0.3, R: R * 0.45, t: 0, life: 0.18, c: '#fff4d6' });
    S.craters.push({ x, y, R: R * 0.55, t: 0, life: 2.2 });
    if (S.craters.length > 4) S.craters.shift();
    for (let i = 0; i < 8; i++) S.fx.push({ k: 'dust', x: x + (Math.random() - 0.5) * R, y, vx: (Math.random() - 0.5) * 3, t: 0, life: 0.6 + Math.random() * 0.3 });
    FK.thud(big); FK.shake(big ? 14 : 8);
  }
  function catchable(p, f, reach, up) {
    let best = null, bd = 99;
    for (const e of FK.foes()) {
      const al = (ex(e) - pcx(p)) * f, dy = ey(e) - pcy(p);
      const ok = up ? (Math.abs(ex(e) - pcx(p)) < 1.1 && dy < 0.4 && dy > -2) : (al > -0.3 && al < reach && Math.abs(dy) < 1.15);
      if (ok) { const d = Math.abs(al) + Math.abs(dy); if (d < bd) { bd = d; best = e; } }
    }
    return best;
  }
  function boot(ctx, L, s, col) {
    const kn = L[1], ft = L[2];
    ctx.strokeStyle = col; ctx.lineWidth = 6.4 * s; ctx.beginPath(); ctx.moveTo(kn[0] + (ft[0] - kn[0]) * 0.25, kn[1] + (ft[1] - kn[1]) * 0.25); ctx.lineTo(ft[0], ft[1]); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(ft[0] + 1.6 * s, ft[1] - 0.2 * s, 3.6 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C_TAPE; ctx.lineWidth = 0.7 * s; ctx.beginPath(); ctx.moveTo(kn[0] + (ft[0] - kn[0]) * 0.3 - 3 * s, kn[1] + (ft[1] - kn[1]) * 0.3); ctx.lineTo(kn[0] + (ft[0] - kn[0]) * 0.3 + 3 * s, kn[1] + (ft[1] - kn[1]) * 0.3); ctx.stroke();
  }
  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set() }, o || {}); }

  // ---------------------------------------------------------------- the choreography, run every frame
  const SEQ = {
    // reaching out for the BEAR HUG
    reach(p, dt, S, q) {
      p.vx = 0;
      if (q.t < 0.1) S.target = FK.lerpPose(PO.idle, PO.reach, q.t / 0.1);
      else if (!q.missed) {
        S.target = PO.reach;
        const e = catchable(p, q.f, 1.6 + 0.4 * q.pw);
        if (e) { FK.smack(); FK.tone(160, { dur: 0.2, vol: 0.25 }); FK.label(S, p, 'GOTCHA!', C_GOLD); startSeq(S, 'hold', { e, f: q.f, tick: 0.3, pw: q.pw }); return; }
        if (q.t > 0.2) { q.missed = true; q.mt = q.t; }
      } else { S.target = PO.whiff; if (q.t > q.mt + 0.3) S.seq = null; }
    },
    // holding them in a crushing hug: squeezes chip away; S + a direction throws
    hold(p, dt, S, q) {
      const e = q.e; p.vx = 0;
      if (!e || e.dead) { S.seq = null; return; }
      const sq = 0.5 + 0.5 * Math.sin(q.t * 18);
      S.target = FK.lerpPose(PO.hug, PO.hug2, sq);
      holdFoe(e, pcx(p) + q.f * 0.95, pcy(p) - 0.15 + sq * 0.05);
      q.tick -= dt;
      if (q.tick <= 0) { q.tick = 0.33; chip(e, 1); S.fx.push({ k: 'squeeze', x: ex(e), y: ey(e), t: 0, life: 0.25 }); FK.noise({ dur: 0.08, cut: 400, vol: 0.18 }); }
      if (q.t > 1.15) throwInto(p, S, 'toss');
    },
    // GRIZZLY TOSS: two spins with them at arm's length, then hurl them
    toss(p, dt, S, q) {
      const e = q.e; p.vx = 0; p._grabInv = 0.1;
      const T1 = 0.42;
      if (q.t < T1 && e && !e.dead) {
        const u = FK.ease(q.t / T1), a = u * Math.PI * 3;
        const c = Math.cos(a);
        p.dashDir = c >= 0 ? q.f : -q.f;             // he turns as he spins
        S.target = PO.spinOut; S.rate = 40;
        holdFoe(e, pcx(p) + q.f * c * 1.5, pcy(p) - 0.3 + Math.sin(a) * 0.2);
        if (Math.random() < 0.6) S.fx.push({ k: 'dust', x: pcx(p) + (Math.random() - 0.5), y: p.y + p.h, vx: (Math.random() - 0.5) * 4, t: 0, life: 0.5 });
        if (!q.wsnd) { q.wsnd = 1; FK.whoosh(false, true); }
      } else if (!q.done) {
        q.done = true; p.dashDir = q.f; letGo(e);
        if (e && !e.dead) FK.hit(S, e, 5 + 2 * q.pw, { kx: q.f * (14 + 3 * q.pw), ky: -8, stun: 0.6, c: C_FX, big: true, stop: 0.08 });
        S.fx.push({ k: 'arc', x: pcx(p), y: pcy(p) - 0.3, f: q.f, R: 1.6, t: 0, life: 0.3 });
        FK.smack(true);
      } else { S.target = PO.throwFT; if (q.t > T1 + 0.3) S.seq = null; }
    },
    // BACKBREAKER SUPLEX: up overhead, a full bridge backward, and they're planted behind him
    suplex(p, dt, S, q) {
      const e = q.e; p.vx = 0; p._grabInv = 0.1;
      const f = q.f, t = q.t;
      S.target = FK.keyed([[0, PO.hug], [0.16, PO.lift], [0.42, PO.arch], [0.62, PO.arch], [0.9, PO.idle]], t); S.rate = 45;
      if (t < 0.42 && e && !e.dead) {
        // the foe rides the arc of his arms: chest -> overhead -> over and behind, head first into the floor
        const u = t < 0.16 ? 0 : FK.ease((t - 0.16) / 0.26);
        const a = -0.3 + u * (Math.PI * 0.95);              // angle over his head, from in front to behind
        const R = 1.9;
        const fy = p.y + p.h - 0.2;
        const lx = t < 0.16 ? 0.95 * (1 - t / 0.16) : Math.cos(a) * R * 0.9, ly = t < 0.16 ? 0.15 + 1.3 * t / 0.16 : Math.sin(a) * R + 0.2 - u * 1.2;
        holdFoe(e, pcx(p) + f * lx, Math.min(fy - (e.h || 0.9) / 2, pcy(p) - ly));
        if (u > 0.2 && !q.ws) { q.ws = 1; FK.whoosh(true, true); }
      } else if (!q.slam) {
        q.slam = true; letGo(e);
        const x = pcx(p) - f * 1.7;
        if (e && !e.dead) FK.hit(S, e, 6 + 3 * q.pw, { kx: -f * 7, ky: -11 - 2 * q.pw, stun: 0.7, c: C_FX, big: true, stop: 0.15, shake: 12 });
        impact(S, x, p.y + p.h, 2.4, true);
        FK.label(S, p, q.counter ? 'COUNTER SUPLEX!' : 'BACKBREAKER!', C_GOLD, true);
      } else if (t > 0.95) S.seq = null;
    },
    // MOUNTAIN PILEDRIVER: lift, leap, flip so they're under him, and drive them into the floor
    pile(p, dt, S, q) {
      const e = q.e; p._grabInv = 0.1; p.vx = 0; S.selfMove = true;
      const f = q.f;
      if (!e || e.dead) { S.rot = 0; S.seq = null; return; }
      if (q.ph === 'lift') {
        S.target = FK.keyed([[0, PO.hug], [0.14, PO.lift], [0.24, PO.squatUp]], q.t); S.rate = 45;
        holdFoe(e, pcx(p) + f * 0.2 * (1 - q.t / 0.24), pcy(p) - 0.4 - 1.5 * Math.min(1, q.t / 0.14));
        p.vy = 0;
        if (q.t >= 0.24) { q.ph = 'leap'; q.t0 = q.t; q.y0 = p.y; FK.whoosh(true, true); for (let i = 0; i < 6; i++) S.fx.push({ k: 'dust', x: pcx(p) + (Math.random() - 0.5) * 1.5, y: p.y + p.h, vx: (Math.random() - 0.5) * 5, t: 0, life: 0.6 }); }
        return;
      }
      if (q.ph === 'leap') {
        const u = Math.min(1, (q.t - q.t0) / 0.36), h = q.rise * FK.easeOut(u);
        const ny = q.y0 - h;
        if (!FK.blocked(p.x, ny, p.w, p.h)) p.y = ny;
        p.vy = 0; p.onGround = false;
        S.rot = Math.PI * FK.ease(Math.max(0, (u - 0.35) / 0.65));   // front flip: by the top he's upside down over them
        S.target = PO.tuck; S.rate = 30;
        const d = 2.0;
        holdFoe(e, pcx(p) + f * d * Math.sin(S.rot), pcy(p) - d * Math.cos(S.rot));
        if (u >= 1) { q.ph = 'drop'; q.t0 = q.t; }
        return;
      }
      if (q.ph === 'drop') {
        S.rot = Math.PI; S.target = PO.tuck;
        const step = 30 * dt, d = 2.0;
        const fyFoe = pcy(p) + d + (e.h || 0.9) / 2;           // the foe's feet... well, head: it hits first
        const hitFloor = FK.blocked(pcx(p) - 0.3, fyFoe, 0.6, step + 0.05) || FK.blocked(p.x, p.y + p.h, p.w, step + 0.02);
        if (hitFloor) {
          // IMPACT
          let gy = fyFoe; for (let i = 0; i < 12 && !FK.blocked(pcx(p) - 0.3, gy, 0.6, 0.1); i++) gy += 0.1;
          holdFoe(e, pcx(p), gy - (e.h || 0.9) / 2);
          letGo(e);
          FK.hit(S, e, 8 + 3 * q.pw, { kx: f * 3, ky: -13 - 3 * q.pw, stun: 0.8, c: C_FX, big: true, stop: 0.2, shake: 16 });
          impact(S, pcx(p), gy, 3.2 + 0.6 * q.pw, true);
          FK.label(S, p, 'MOUNTAIN PILEDRIVER!', C_GOLD, true);
          q.ph = 'recover'; q.t0 = q.t; p.vy = -9;
          return;
        }
        p.y += step; p.vy = 0;
        holdFoe(e, pcx(p), pcy(p) + d);
        if (q.t - q.t0 > 0.75) {   // nothing under them: let go and spike them
          letGo(e); FK.hit(S, e, 6, { kx: f * 2, ky: 17, stun: 0.6, c: C_FX, big: true }); q.ph = 'recover'; q.t0 = q.t;
        }
        return;
      }
      // recover: flip back upright as he bounces off
      const u = Math.min(1, (q.t - q.t0) / 0.28);
      S.rot = Math.PI * (1 - FK.ease(u)) * (u < 1 ? 1 : 0) + (u < 1 ? 0 : 0);
      S.target = PO.fall; S.selfMove = false;
      if (u >= 1) { S.rot = 0; S.seq = null; }
    },
    // TRIPLE SLAM: front, over the top to the back, over the top to the front
    slam(p, dt, S, q) {
      const e = q.e; p.vx = 0; p._grabInv = 0.1;
      if (!e || e.dead) { S.seq = null; return; }
      const f = q.f, t = q.t, beats = [0.22, 0.44, 0.7];
      // the foe's angle around his shoulders: 0 = straight up, ±1.4 = slammed down in front / behind
      const A = [[0, 0.3], [0.12, 0], [0.22, 1.45], [0.3, 0.9], [0.44, -1.45], [0.54, -0.6], [0.6, 0], [0.7, 1.5], [1.0, 1.5]];
      let a = A[A.length - 1][1];
      for (let i = 1; i < A.length; i++) if (t <= A[i][0]) { const v = FK.ease((t - A[i - 1][0]) / (A[i][0] - A[i - 1][0])); a = A[i - 1][1] + (A[i][1] - A[i - 1][1]) * v; break; }
      // his arms follow the foe
      const armA = Math.PI - a;
      S.target = pose({ y: 2 + Math.abs(a) * 1.5, lean: a * 0.25, aF: [armA, 0.15], aB: [armA - 0.1, 0.2], lF: [0.6, -0.8], lB: [-0.6, -0.4] }); S.rate = 50;
      if (t < beats[2] + 0.001 || !q.done) {
        const R = 2.1, cx = pcx(p), cy = p.y + 0.2;
        const x = cx + f * Math.sin(a) * R, y = Math.min(p.y + p.h - (e.h || 0.9) / 2, cy - Math.cos(a) * R);
        if (!q.done) holdFoe(e, x, y);
      }
      for (let i = 0; i < 3; i++) {
        if (t >= beats[i] && !q['b' + i]) {
          q['b' + i] = 1;
          const side = i === 1 ? -1 : 1, x = pcx(p) + f * side * 2.0;
          if (i < 2) { chip(e, 2); e.hitFlash = 0.12; impact(S, x, p.y + p.h, 1.4, false); FK.hitstop(0.05); }
          else {
            q.done = true; letGo(e);
            FK.hit(S, e, 5 + 2 * q.pw, { kx: f * 5, ky: -14 - 2 * q.pw, stun: 0.7, c: C_FX, big: true, stop: 0.14, shake: 12 });
            impact(S, x, p.y + p.h, 2.4, true);
            FK.label(S, p, 'TRIPLE SLAM!', C_GOLD, true);
          }
        }
      }
      if (t > 0.95) S.seq = null;
    },
    // RUNNING LARIAT: wind up, charge through everything with armor, clothesline
    lariat(p, dt, S, q) {
      const f = q.f, t = q.t, T1 = 0.13, T2 = 0.5 + 0.12 * q.pw;
      if (t < T1) { S.target = PO.lWind; S.rate = 30; p.vx = 0; p._armorT = 0.15; return; }
      if (t < T2) {
        S.target = PO.lRun; S.rate = 30; p._armorT = 0.1;
        const sp = (12 + 6 * q.pw) * dt, nx = p.x + f * sp;
        if (!FK.blocked(nx, p.y + 0.02, p.w, p.h - 0.04)) p.x = nx; else q.t = T2;
        p.vx = 0;
        if (Math.random() < 0.7) S.fx.push({ k: 'dust', x: pcx(p) - f * 0.4, y: p.y + p.h, vx: -f * 2, t: 0, life: 0.45 });
        for (const e of FK.foes()) {
          if (q.hits.has(e)) continue;
          const al = (ex(e) - pcx(p)) * f;
          if (al > -0.2 && al < 1.5 && Math.abs(ey(e) - (p.y + 0.3)) < 1.0) { q.hits.add(e); FK.hit(S, e, 5 + 2 * q.pw, { kx: f * (12 + 4 * q.pw), ky: -9, stun: 0.6, c: C_FX, big: true, stop: 0.1 }); FK.smack(true); q.swing = q.t; }
        }
        if (!q.snd) { q.snd = 1; FK.whoosh(false, true); }
        return;
      }
      S.target = PO.lFollow; S.rate = 25;
      if (!q.skid) { q.skid = 1; q.vx = f * 7; }
      q.vx -= Math.sign(q.vx) * 30 * dt; if (Math.sign(q.vx) === f) { const nx = p.x + q.vx * dt; if (!FK.blocked(nx, p.y + 0.02, p.w, p.h - 0.04)) p.x = nx; }
      if (Math.random() < 0.6) S.fx.push({ k: 'dust', x: pcx(p) + f * 0.3, y: p.y + p.h, vx: f * 2, t: 0, life: 0.4 });
      if (t > T2 + 0.28) S.seq = null;
    },
    // URSA UPPERCUT: drop low (armored), explode upward with a rising fist
    upper(p, dt, S, q) {
      const f = q.f, t = q.t;
      if (t < 0.14) { S.target = PO.uCrouch; S.rate = 35; p._armorT = 0.15; p.vx = 0; if (p.vy < 0) p.vy = 2; return; }   // (cancels the jump that ↑ starts)
      if (!q.go) { q.go = 1; p.vy = -11 - 3 * q.pw; p.onGround = false; FK.whoosh(true, true); }
      S.target = PO.upper; S.rate = 40;
      if (t < 0.32) for (const e of FK.foes()) {
        if (q.hits.has(e)) continue;
        const al = (ex(e) - pcx(p)) * f, dy = ey(e) - pcy(p);
        if (al > -0.6 && al < 1.7 && dy < 1.8 && dy > -2.6) { q.hits.add(e); FK.hit(S, e, 5 + 2 * q.pw, { kx: f * 2, ky: -16 - 3 * q.pw, stun: 0.6, c: C_FX, big: true, stop: 0.12 }); FK.smack(true); }
      }
      if (t > 0.5) S.seq = null;
    },
    // IRON GUARD: arms crossed, a ring of iron. A close hit is caught into a COUNTER SUPLEX; shots bounce back
    guard(p, dt, S, q) {
      p.vx = 0;
      if (!q.armed) { q.armed = 1; p._parryT = 0.32; p._parryGrab = true; FK.tone(300, { type: 'square', dur: 0.06, vol: 0.12 }); }
      S.target = PO.guard; S.rate = 40;
      if (p._parried > 0 && !q.done) {
        q.done = true;
        if (!p._parryFar) {
          let e = null, bd = 3.2;
          for (const c of FK.foes()) { const d = Math.hypot(ex(c) - pcx(p), ey(c) - pcy(p)); if (d < bd) { bd = d; e = c; } }
          if (e) { const f = Math.sign(ex(e) - pcx(p)) || q.f; p.dashDir = f; startSeq(S, 'suplex', { e, f, pw: 0.5, counter: true }); S.fx.push({ k: 'flash', x: pcx(p), y: pcy(p), R: 2, t: 0, life: 0.2 }); return; }
        }
        q.flourish = q.t;
      }
      if (q.t > (q.flourish != null ? q.flourish + 0.2 : 0.58)) { p._parryGrab = false; S.seq = null; }
    },
    // BODY SPLASH: spread out and belly-flop, armored on the way down
    splash(p, dt, S, q) {
      S.target = PO.splash; S.rate = 30;
      if (q.t < 0.1) { p.vy = Math.min(p.vy, -3); return; }
      p.vy = 19; p._armorT = 0.1;
      for (const e of FK.within(pcx(p), pcy(p) + 0.2, 1.4)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 4 + 2 * q.pw, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 7, ky: 6, stun: 0.5, c: C_FX, big: true }); }
      if (p.onGround && q.t > 0.12) {
        for (const e of FK.within(pcx(p), p.y + p.h - 0.4, 2.2)) if (!q.hits.has(e)) FK.hit(S, e, 2, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 6, ky: -7, stun: 0.4, c: C_FX });
        impact(S, pcx(p), p.y + p.h, 2.2, false); S.seq = null; S.land = 0.2;
      }
      if (q.t > 1.3) S.seq = null;
    },
    // FLYING TACKLE: dive forward arms first; whoever he catches goes for a spin
    tackle(p, dt, S, q) {
      const f = q.f;
      if (q.e) {   // AIR SPIN THROW
        const e = q.e, u = Math.min(1, (q.t - q.t0) / 0.42); p._grabInv = 0.1; p.vx = 0; p.vy = -1.5;
        S.rot = f * 0 + u * Math.PI * 4; S.target = PO.spinOut; S.rate = 40;
        if (u < 1 && !e.dead) { const d = 1.4; holdFoe(e, pcx(p) + f * d * Math.sin(S.rot + Math.PI / 2), pcy(p) - d * Math.cos(S.rot + Math.PI / 2)); }
        else if (!q.done) {
          q.done = 1; S.rot = 0; letGo(e);
          if (!e.dead) FK.hit(S, e, 5 + 2 * q.pw, { kx: f * 13, ky: 7, stun: 0.6, c: C_FX, big: true, stop: 0.1 });
          FK.label(S, p, 'AIR SPIN THROW!', C_GOLD, true); FK.smack(true); p.vy = -6;
        } else if (q.t - q.t0 > 0.55) S.seq = null;
        return;
      }
      S.target = PO.tackle; S.rate = 35;
      const sp = (15 + 5 * q.pw) * dt, nx = p.x + f * sp;
      if (!FK.blocked(nx, p.y + 0.02, p.w, p.h - 0.04)) p.x = nx; else q.t = 9;
      p.vx = 0; p.vy = Math.min(p.vy, 1.5);
      const e = catchable(p, f, 1.3, false);
      if (e) { q.e = e; q.t0 = q.t; FK.smack(); FK.whoosh(false, true); return; }
      if (q.t > 0.32) { S.seq = null; p.vx = f * 5; }
    },
    // SKY CLUTCH: leap up reaching; anyone above gets piledriven
    clutch(p, dt, S, q) {
      if (!q.go) { q.go = 1; p.vy = -15 - 2 * q.pw; FK.whoosh(true, true); }
      S.target = PO.clutch; S.rate = 35;
      const e = catchable(p, q.f, 0, true);
      if (e) { startSeq(S, 'pile', { e, f: q.f, ph: 'lift', rise: 1.6, pw: q.pw }); S.seq.t = 0.14; FK.smack(); return; }
      if (q.t > 0.42) S.seq = null;
    },
    // METEOR DROP: a hang, then an armored knee drop; spikes in the air, a crater on landing
    drop(p, dt, S, q) {
      const f = q.f;
      S.target = PO.knee; S.rate = 30;
      if (q.t < 0.1) { p.vy = -2; p.vx = 0; return; }
      p.vy = 27; p.vx = 0; p._armorT = 0.1;
      if (Math.random() < 0.8) S.fx.push({ k: 'streak', x: pcx(p) + (Math.random() - 0.5) * 0.8, y: p.y, t: 0, life: 0.2 });
      for (const e of FK.foes()) {
        if (q.hits.has(e)) continue;
        if (Math.abs(ex(e) - pcx(p)) < 0.95 && ey(e) > p.y + p.h * 0.4 && ey(e) < p.y + p.h + 0.9) { q.hits.add(e); FK.hit(S, e, 5 + 2 * q.pw, { kx: f * 2, ky: 16 + 2 * q.pw, stun: 0.5, c: C_FX, big: true, stop: 0.08 }); }
      }
      if (p.onGround && q.t > 0.12) {
        const R = 2.8 + 0.8 * q.pw;
        for (const e of FK.foes()) if (!q.hits.has(e) && Math.abs(ex(e) - pcx(p)) < R && Math.abs(ey(e) - (p.y + p.h - 0.5)) < 1.4) FK.hit(S, e, 4 + Math.round(2 * q.pw), { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 6, ky: -10, stun: 0.5, c: C_FX, big: true });
        impact(S, pcx(p), p.y + p.h, R, true); FK.hitstop(0.08); S.seq = null; S.land = 0.3;
        FK.label(S, p, 'METEOR DROP!', C_GOLD);
      }
      if (q.t > 1.5) S.seq = null;
    },
  };
  function throwInto(p, S, kind) {
    const q = S.seq, e = q.e, f = q.f;
    if (kind === 'pile') startSeq(S, 'pile', { e, f, ph: 'lift', rise: 3.6, pw: q.pw || 0 });
    else startSeq(S, kind, { e, f, pw: q.pw || 0 });
    const names = { toss: 'GRIZZLY TOSS!', suplex: 'BACKBREAKER SUPLEX!', pile: 'MOUNTAIN PILEDRIVER!', slam: 'TRIPLE SLAM!' };
    if (kind !== 'pile' && kind !== 'suplex' && kind !== 'slam') FK.label(S, p, names[kind], C_GOLD, true);
    FK.msg('🐻 ' + names[kind]);
  }

  // ---------------------------------------------------------------- the fighter
  const MOVES = {
    ground: { neutral: { name: 'Bear Hug', cd: 0.3 }, side: { name: 'Running Lariat', big: 'STAMPEDE LARIAT', cd: 0.4 }, up: { name: 'Ursa Uppercut', big: 'MOUNTAIN UPPERCUT', cd: 0.35 }, down: { name: 'Iron Guard', cd: 0.9 } },
    air:    { neutral: { name: 'Body Splash', cd: 0.3 }, side: { name: 'Flying Tackle', cd: 0.4 }, up: { name: 'Sky Clutch', cd: 0.3 }, down: { name: 'Meteor Drop', big: 'COMET DROP', cd: 0.4 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  FK.define({
    id: ID, plug: 'kodiak',
    def: { name: 'Kodiak', icon: '🐻', tier: 'gold', color: C_FX, color2: C_GOLD,
      ability: 'Heavyweight Grappler: command grabs, 4 throws, armored lariat and uppercut, Iron Guard parry',
      desc: 'The heaviest fighter. Bear Hug (S) grabs; then S + a direction throws: Grizzly Toss, Backbreaker Suplex, Mountain Piledriver (up) or Triple Slam (down). Running Lariat and Ursa Uppercut are armored. Iron Guard (down + S) parries: a close hit is caught into a Counter Suplex, shots are reflected. In the air: Body Splash, Flying Tackle (a grab), Sky Clutch (a rising grab, his recovery) and Meteor Drop.' },
    stats: { speed: 0.9, jump: 0.95, maxJumps: 2, maxDashes: 1, hp: 5 },
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, rot: 0, run: 0, land: 0, wasGround: true, airUp: false, craters: [] }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Sky Clutch comes back when you land'; return null; },
    // while holding someone, S + a direction picks the throw
    pressS(p, S, k) {
      if (!S.seq) return false;
      if (S.seq.kind === 'hold') {
        const f = S.seq.f, side = k.right ? 1 : k.left ? -1 : 0;
        throwInto(p, S, k.up ? 'pile' : k.down ? 'slam' : side === -f ? 'suplex' : 'toss');
      }
      return true;
    },
    act: {
      ground_neutral: (p, f, pw, S) => { startSeq(S, 'reach', { f, pw }); FK.whoosh(false); },
      ground_side: (p, f, pw, S) => { startSeq(S, 'lariat', { f, pw }); },
      ground_up: (p, f, pw, S) => { startSeq(S, 'upper', { f, pw }); },
      ground_down: (p, f, pw, S) => { startSeq(S, 'guard', { f }); },
      air_neutral: (p, f, pw, S) => { startSeq(S, 'splash', { f, pw }); FK.whoosh(false); },
      air_side: (p, f, pw, S) => { startSeq(S, 'tackle', { f, pw }); FK.whoosh(false, true); },
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'clutch', { f, pw }); },
      air_down: (p, f, pw, S) => { startSeq(S, 'drop', { f, pw }); FK.tone(900, { dur: 0.14, slide: 200, vol: 0.12 }); },
    },
    onTeleport(p, S) { if (S.seq && S.seq.e) letGo(S.seq.e); S.seq = null; S.rot = 0; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq && !(p._grabInv > 0)) { if (S.seq.e) letGo(S.seq.e); S.seq = null; S.rot = 0; }
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      if (!S.seq) {
        if (S.rot) S.rot = 0;
        // locomotion: a heavy stomping run, a crouched breathing stance, tucked jumps, landing squash
        if (p.onGround && !S.wasGround && (S.lastVy || 0) > 8) { S.land = 0.18; FK.thud(false); FK.shake(3); for (let i = 0; i < 4; i++) S.fx.push({ k: 'dust', x: pcx(p) + (Math.random() - 0.5), y: p.y + p.h, vx: (Math.random() - 0.5) * 3, t: 0, life: 0.5 }); }
        if (S.land > 0) { S.land -= dt; S.target = PO.land; S.rate = 30; }
        else if (p.onGround && Math.abs(p.vx || 0) > 0.8) {
          S.run += dt * Math.abs(p.vx) * 1.5;
          const r = S.run, sw = Math.sin(r);
          S.target = pose({ y: 0.5 - Math.abs(Math.cos(r)) * 1.2, lean: 0.3, aF: [0.4 - sw * 0.7, 1.5], aB: [0.4 + sw * 0.7, 1.5], lF: [0.15 + sw * 0.75, -0.3 - Math.max(0, Math.cos(r)) * 1.1], lB: [0.15 - sw * 0.75, -0.3 - Math.max(0, -Math.cos(r)) * 1.1] });
          S.rate = 22;
          const step = Math.floor(r / Math.PI); if (step !== S.lastStep) { S.lastStep = step; FK.tone(90, { type: 'sine', dur: 0.08, vol: 0.18 }); S.fx.push({ k: 'dust', x: pcx(p), y: p.y + p.h, vx: -(p.vx || 0) * 0.1, t: 0, life: 0.35 }); }
        } else if (p.onGround) {
          const b = Math.sin(performance.now() / 1000 * 2.6);
          S.target = FK.lerpPose(PO.idle, pose(Object.assign({}, PO.idle, { y: PO.idle.y + 0.8, aF: [0.8, 1.55] })), 0.5 + 0.5 * b);
        } else S.target = (p.vy || 0) < 0 ? PO.jump : PO.fall;
      }
      if (p.onGround) S.airUp = false;
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
      S.wasGround = p.onGround; S.lastVy = p.vy;
      for (let i = S.craters.length - 1; i >= 0; i--) { S.craters[i].t += dt; if (S.craters[i].t > S.craters[i].life) S.craters.splice(i, 1); }
      if (!(p._parryT > 0) && !(S.seq && S.seq.kind === 'guard')) p._parryGrab = false;
    },

    // ---------------- drawing the body: a bear-masked heavyweight in a singlet and a title belt
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, s = ph / U, cx = px + pw / 2, fy = py + ph;
      if (S && S.rot) { ctx.translate(cx, py + ph / 2); ctx.rotate(S.rot); ctx.translate(-cx, -(py + ph / 2)); }
      const K = FK.skel(P, q, cx, fy, s);
      const armor = p && p._armorT > 0, guard = p && p._parryT > 0;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowBlur = armor ? 16 : 8; ctx.shadowColor = armor ? '#ff8a3d' : 'rgba(255,120,60,0.35)';
      // back leg and arm
      FK.limb(ctx, K.lB, 6.5 * s, '#5c0717', 6 * s);
      ctx.fillStyle = '#8a0f24'; ctx.beginPath(); ctx.ellipse(K.lB[2][0] + 1 * s, K.lB[2][1] - 0.6 * s, 3.8 * s, 2.4 * s, 0, 0, Math.PI * 2); ctx.fill();
      FK.limb(ctx, K.aB, 5.6 * s, C_SKIN2, 5.8 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 3.6 * s, '#d8cfbf');
      // a big round barrel of a body: bare chest, red singlet, the title belt
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const L = P.torso * s, W = 21 * s;
      FK.blob(ctx, W, L, C_SKIN, C_SKIN2, 9 * s);
      ctx.shadowBlur = 0;
      ctx.fillStyle = C_TRUNK; ctx.beginPath(); ctx.roundRect(-W / 2, -L * 0.42, W, L * 0.42 + 3.6 * s, [0, 0, 9 * s, 9 * s]); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-W * 0.36, -L * 0.42); ctx.lineTo(-W * 0.26, -L * 0.98); ctx.lineTo(-W * 0.1, -L * 0.98); ctx.lineTo(-W * 0.14, -L * 0.42); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C_SKIN2; ctx.lineWidth = 0.9 * s;
      ctx.beginPath(); ctx.arc(W * 0.12, -L * 0.72, W * 0.2, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.fillStyle = '#2b1a10'; ctx.beginPath(); ctx.roundRect(-W / 2, -2.6 * s, W, 3.6 * s, 1.5 * s); ctx.fill();
      const g = ctx.createLinearGradient(0, -5.5 * s, 0, 2 * s); g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, C_GOLD); g.addColorStop(1, '#a8761a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(W * 0.12, -0.8 * s, 4.2 * s, 3.2 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(W * 0.12, -0.8 * s, 1.4 * s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
      // front leg: trunks, knee-high boots
      FK.limb(ctx, K.lF, 6.8 * s, C_TRUNK, 6.2 * s);
      ctx.fillStyle = C_BOOT; ctx.beginPath(); ctx.ellipse(K.lF[2][0] + 1.2 * s, K.lF[2][1] - 0.6 * s, 4 * s, 2.6 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C_TAPE; ctx.lineWidth = 0.9 * s; ctx.beginPath(); ctx.moveTo(K.lF[2][0] - 2.4 * s, K.lF[2][1] - 2.2 * s); ctx.lineTo(K.lF[2][0] + 3 * s, K.lF[2][1] - 2.2 * s); ctx.stroke();
      // the head: a big round bear head under a red luchador mask with gold flames
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      const hr = K.hr;
      ctx.fillStyle = C_FUR2; ctx.beginPath(); ctx.arc(-hr * 0.62, -hr * 0.78, hr * 0.32, 0, Math.PI * 2); ctx.arc(hr * 0.45, -hr * 0.86, hr * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0a0a0'; ctx.beginPath(); ctx.arc(-hr * 0.62, -hr * 0.78, hr * 0.15, 0, Math.PI * 2); ctx.arc(hr * 0.45, -hr * 0.86, hr * 0.15, 0, Math.PI * 2); ctx.fill();
      const hg = ctx.createRadialGradient(hr * 0.2, -hr * 0.3, hr * 0.2, 0, 0, hr * 1.1); hg.addColorStop(0, '#8a5a36'); hg.addColorStop(1, C_FUR);
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, hr, 0, Math.PI * 2); ctx.fill();
      // the mask: red over the upper face, gold flame trim round the eyes
      ctx.fillStyle = C_TRUNK; ctx.beginPath(); ctx.ellipse(hr * 0.18, -hr * 0.12, hr * 0.86, hr * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_GOLD;
      for (const ox of [hr * -0.05, hr * 0.48]) { ctx.beginPath(); ctx.moveTo(ox - hr * 0.28, -hr * 0.3); ctx.quadraticCurveTo(ox - hr * 0.1, -hr * 0.78, ox + hr * 0.38, -hr * 0.62); ctx.quadraticCurveTo(ox + hr * 0.08, -hr * 0.52, ox + hr * 0.26, -hr * 0.34); ctx.closePath(); ctx.fill(); }
      FK.eyes(ctx, hr * 0.02, -hr * 0.12, hr * 0.19, hr * 0.5, { pupil: '#2a0a0a', angry: '#2a0a0a' });
      // muzzle
      ctx.fillStyle = '#d8b48a'; ctx.beginPath(); ctx.ellipse(hr * 0.48, hr * 0.42, hr * 0.42, hr * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0f0a'; ctx.beginPath(); ctx.ellipse(hr * 0.7, hr * 0.26, hr * 0.15, hr * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a0f0a'; ctx.lineWidth = 0.8 * s; ctx.beginPath(); ctx.moveTo(hr * 0.3, hr * 0.55); ctx.quadraticCurveTo(hr * 0.5, hr * 0.68, hr * 0.78, hr * 0.5); ctx.stroke();
      ctx.restore();
      // front arm: a thick arm, taped wrist, a huge fist
      FK.limb(ctx, K.aF, 6 * s, C_SKIN, 6.4 * s);
      FK.mitt(ctx, K.aF[2][0], K.aF[2][1], 4.3 * s, C_TAPE, '#bdb4a4');
      ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.arc(K.aF[0][0] + 0.8 * s, K.aF[0][1] + 1 * s, 3.6 * s, 0, Math.PI * 2); ctx.fill();
      if (guard) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, py + ph * 0.45, ph * 0.62, 0, Math.PI * 2); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
    },

    // ---------------- drawing the world: craters, guard ring, armor glow, motion lines
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T, f = FK.face(p);
      for (const c of S.craters) {
        const a = Math.min(1, (c.life - c.t) * 1.5), x = V.SX(c.x), y = V.SY(c.y) + 1, R = c.R * T;
        FK.solid(ctx, '#140c08', 0.55 * a); ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        FK.solid(ctx, '#2b1a10', 0.8 * a); ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) { const an = i * 0.9 + c.R; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * R * 0.3, y + Math.sin(an) * R * 0.06); ctx.lineTo(x + Math.cos(an) * R * 1.15, y + Math.sin(an) * R * 0.22); ctx.stroke(); }
      }
      const q = S.seq;
      if (p._parryT > 0 || (q && q.kind === 'guard')) {
        const x = V.SX(pcx(p)), y = V.SY(pcy(p)), on = p._parryT > 0;
        for (let i = 0; i < 6; i++) { const an = V.now * 3 + i * Math.PI / 3; FK.crescent(ctx, x, y, T * 1.25, an, an + 0.7, T * 0.22, on ? '#ffd166' : '#8a7a6a', on ? 0.8 : 0.35); }
      }
      if (p._armorT > 0) { const x = V.SX(pcx(p)), y = V.SY(pcy(p)); ctx.beginPath(); ctx.ellipse(x, y, T * 0.9, T * 1.1, 0, 0, Math.PI * 2); FK.glow(ctx, '#ff8a3d', 0.3 + 0.2 * Math.sin(V.now * 40)); ctx.lineWidth = 3; ctx.stroke(); }
      if (q && q.kind === 'lariat' && q.t > 0.13) {
        const y = V.SY(p.y + 0.3), x = V.SX(pcx(p));
        for (let i = -1; i <= 1; i++) { const pts = []; for (let j = 0; j <= 8; j++) pts.push([x - f * j * T * 0.4, y + i * T * 0.35 + T * 0.5]); FK.taper(ctx, pts, T * (i ? 0.08 : 0.14), '#ffb070', 0.6); }
        FK.crescent(ctx, x, y, T * 1.5, f > 0 ? -0.8 : Math.PI - 0.0, f > 0 ? 0.0 : Math.PI + 0.8, T * 0.4, '#ff8a3d', 0.7);
      }
      if (q && q.kind === 'upper' && q.t > 0.14 && q.t < 0.4) {
        const x = V.SX(pcx(p) + f * 0.5), y = V.SY(p.y);
        const pts = []; for (let j = 0; j <= 8; j++) pts.push([x, y + j * T * 0.35]); FK.taper(ctx, pts, T * 0.4, '#ffb070', 0.8 * (1 - (q.t - 0.14) / 0.26));
      }
      if (q && (q.kind === 'pile' && q.ph === 'drop')) {
        for (let i = -2; i <= 2; i++) { const pts = []; const x = V.SX(pcx(p) + i * 0.35); for (let j = 0; j <= 8; j++) pts.push([x, V.SY(p.y) - j * T * 0.4]); FK.taper(ctx, pts, T * 0.1, '#ffffff', 0.7); }
      }
      if (q && q.kind === 'hold') { const x = V.SX(pcx(p) + f * 0.95), y = V.SY(pcy(p) - 0.15); ctx.beginPath(); ctx.arc(x, y, T * (0.75 + 0.06 * Math.sin(q.t * 18)), 0, Math.PI * 2); FK.glow(ctx, '#ffd166', 0.45); ctx.lineWidth = 3; ctx.stroke(); }
    },
    drawFx(ctx, V, f, u, a) {
      const T = V.T;
      if (f.k === 'squeeze') { for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + 0.6; const r1 = T * (0.9 - u * 0.4), r2 = T * (1.2 - u * 0.4); ctx.beginPath(); ctx.moveTo(V.SX(f.x) + Math.cos(an) * r1, V.SY(f.y) + Math.sin(an) * r1); ctx.lineTo(V.SX(f.x) + Math.cos(an) * r2, V.SY(f.y) + Math.sin(an) * r2); FK.glow(ctx, '#ffffff', a); ctx.lineWidth = 3; ctx.stroke(); } return true; }
      if (f.k === 'arc') { const x = V.SX(f.x), y = V.SY(f.y); FK.crescent(ctx, x, y, T * f.R, f.f > 0 ? -1.2 : Math.PI - 0.4, f.f > 0 ? 0.4 : Math.PI + 1.2, T * 0.5, '#ff8a3d', a); return true; }
      if (f.k === 'streak') { const pts = []; for (let j = 0; j <= 6; j++) pts.push([V.SX(f.x), V.SY(f.y) - j * T * 0.35]); FK.taper(ctx, pts, T * 0.1, '#ffd166', a); return true; }
      return false;
    },
    // Smash CPU: what to press
    ai(I) {
      const S = I.S || {}, q = S.seq;
      if (q && q.kind === 'hold') { const r = Math.random(); return r < 0.35 ? { type: 'tap', v: 'up' } : r < 0.6 ? { type: 'tap', v: 'down' } : r < 0.8 ? { type: 'tap', v: 'side', flip: true } : { type: 'tap', v: '' }; }
      if (q) return null;
      if (I.air) {
        if (I.dy > 0.6 && I.adx < 1.4) return { type: 'tap', v: 'down' };
        if (I.dy < -0.6 && I.adx < 1.4 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.adx < 3.2 && Math.abs(I.dy) < 1.1) return { type: 'tap', v: 'side' };
        if (I.adx < 1.6 && I.dy > -0.5) return { type: 'tap', v: '' };
        return null;
      }
      if (I.adx < 1.5 && Math.abs(I.dy) < 1.0) return I.r < 0.6 ? { type: 'tap', v: '' } : I.r < 0.8 ? { type: 'tap', v: 'down' } : { type: 'charge', v: 'up', hold: I.killy ? 0.7 : 0.35 };
      if (I.dy < -1.2 && I.adx < 1.8) return { type: 'tap', v: 'up' };
      if (I.adx < 5 && Math.abs(I.dy) < 1.0 && I.r < 0.4) return I.killy ? { type: 'charge', v: 'side', hold: 0.6 } : { type: 'tap', v: 'side' };
      return null;
    },
  });
})();
