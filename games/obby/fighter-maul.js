/* Obby Builder: MAUL, the hammer smith. Big wind-ups you can read, big hits, and stone you raise yourself.
 *
 * Every swing is animated as a real swing: she coils back and squashes down, the hammer head lights up while she
 * holds it, then her whole body stretches into the blow. Holding S keeps her coiled: the longer, the harder.
 * Hits are checked against where the hammer head really is in each frame.
 * She is the heaviest hitter and one of the hardest to launch, and she has SUPER ARMOR from the first frame of a
 * wind-up to the end of the swing: hits still hurt, but nothing knocks her out of it.
 *
 * THE GIMMICK: STONE PILLARS
 *  - PILLAR (ground ↑ + S): strike the floor and a stone pillar bursts up ahead of you. It launches any foe above
 *    it and stays for a while as a platform you can stand on. Charged, it rises under YOUR feet and throws you up.
 *  - HOME RUN (ground ←/→ + S) into a pillar SHATTERS it into a spray of rocks that fly across the screen.
 *  - METEOR HAMMER (air ↓ + S) landing on a pillar drives it into the ground as a shockwave both ways.
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge)
 *  Ground: neutral HAMMER SMASH (QUAKE charged), side HOME RUN, up PILLAR (ELEVATOR charged), down RIPPLE (two ground waves).
 *  Air:    neutral WHIRL (spins, slows the fall), side COMET SWING, up HAMMER HOP (recovery), down METEOR HAMMER (spike).
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_maul';
  const C_APRON = '#7a4a2b', C_APRON2 = '#55311b', C_SHIRT = '#e8e1d3', C_SKIN = '#e0a878', C_HAIR = '#d8452e', C_IRON = '#9aa3b2', C_IRON2 = '#5d6573', C_HOT = '#ff9a3c', C_GOLD = '#ffd166', C_STONE = '#8d8478', C_STONE2 = '#6a6258', C_FX = '#ffb86b';
  const P = { hip: 9, torso: 11, neck: -3, head: 9.2, ua: 5.2, fa: 5.2, th: 4.6, sh: 4.6 };
  const U = 32, HL = 1.35, HR = 0.42;   // body units; hammer handle length and head radius in tiles
  const pose = FK.pose, { ex, ey, pcx, pcy } = FK;

  // hm = hammer angle (0 down, PI/2 forward, PI up, more = behind), sq = squash (below 1) / stretch (above 1), hx = foreshortening
  const PO = {
    idle:   pose({ y: 0.6, lean: 0.06, aF: [0.5, 0.9], aB: [0.3, 1.0], lF: [0.35, -0.15], lB: [-0.35, -0.1], hm: 3.75, sq: 1, hx: 1 }),
    jump:   pose({ aF: [0.9, 0.8], aB: [0.6, 0.9], lF: [0.8, -1.3], lB: [0.1, -0.7], hm: 3.6, sq: 1.06, hx: 1 }),
    fall:   pose({ aF: [1.6, 0.5], aB: [1.2, 0.6], lF: [0.4, -0.5], lB: [-0.3, -0.3], hm: 3.4, sq: 1.04, hx: 1 }),
    // HAMMER SMASH: coil back and down, hammer behind the shoulder; then everything goes forward and down
    smA:    pose({ y: 3.2, lean: -0.42, head: 0.25, aF: [-2.6, 0.6], aB: [-2.2, 0.7], lF: [0.7, -0.7], lB: [-0.6, -0.5], hm: 4.25, sq: 0.84, hx: 1 }),
    smB:    pose({ y: -1.2, lean: -0.1, head: -0.1, aF: [3.0, 0.15], aB: [2.8, 0.2], lF: [0.3, -0.1], lB: [-0.3, -0.1], hm: 3.2, sq: 1.16, hx: 1 }),
    smC:    pose({ y: 3.8, lean: 0.62, head: 0.1, aF: [1.1, 0.05], aB: [0.9, 0.1], lF: [1.0, -1.0], lB: [-0.9, -0.2], hm: 1.05, sq: 0.9, hx: 1 }),
    // HOME RUN: twist away with the hammer low behind, step, and swing through level
    hrA:    pose({ y: 2.6, lean: -0.5, head: 0.4, aF: [-1.5, 0.3], aB: [-1.1, 0.5], lF: [0.9, -0.5], lB: [-0.5, -0.6], hm: -1.25, sq: 0.88, hx: 1 }),
    hrB:    pose({ y: 1.6, lean: 0.25, head: 0, aF: [1.5, 0.1], aB: [1.2, 0.3], lF: [1.1, -0.5], lB: [-0.9, -0.1], hm: 1.55, sq: 1.08, hx: 1 }),
    hrC:    pose({ y: 1.0, lean: 0.5, head: -0.3, aF: [2.9, 0.3], aB: [2.5, 0.5], lF: [0.6, -0.2], lB: [-1.1, -0.3], hm: 3.7, sq: 1.0, hx: 1 }),
    // PILLAR: hammer straight up, then a short, hard strike at the floor ahead
    piA:    pose({ y: -0.6, lean: -0.12, aF: [3.05, 0.05], aB: [2.95, 0.1], lF: [0.2, -0.05], lB: [-0.2, -0.05], hm: 3.14, sq: 1.14, hx: 1 }),
    piB:    pose({ y: 4.6, lean: 0.5, aF: [0.9, 0.0], aB: [0.7, 0.1], lF: [1.2, -1.6], lB: [-0.9, -0.5], hm: 0.75, sq: 0.84, hx: 1 }),
    // RIPPLE: hop, then drive the head straight down between her feet
    riA:    pose({ y: -2.5, lean: 0, aF: [3.1, 0.0], aB: [-3.1, 0.0], lF: [0.9, -1.5], lB: [-0.9, -1.5], hm: 3.14, sq: 1.1, hx: 1 }),
    riB:    pose({ y: 5, lean: 0.15, aF: [0.25, 0.0], aB: [0.1, 0.1], lF: [1.3, -1.9], lB: [-1.3, -1.9], hm: 0.1, sq: 0.8, hx: 1 }),
    whirl:  pose({ lean: 0.05, aF: [1.57, 0.0], aB: [1.4, 0.2], lF: [0.6, -1.0], lB: [-0.4, -0.8], hm: 1.57, sq: 1, hx: 1 }),
    cmA:    pose({ lean: -0.4, aF: [-2.0, 0.4], aB: [-1.6, 0.5], lF: [0.9, -1.2], lB: [-0.2, -0.9], hm: -1.6, sq: 0.9, hx: 1 }),
    cmB:    pose({ lean: 0.55, aF: [1.9, 0.1], aB: [1.6, 0.2], lF: [-0.4, -0.3], lB: [-1.0, -0.2], hm: 2.0, sq: 1.12, hx: 1 }),
    hopA:   pose({ y: 1.5, lean: 0.2, aF: [0.2, 0.0], aB: [0.1, 0.1], lF: [1.0, -1.7], lB: [0.6, -1.6], hm: 0.1, sq: 0.86, hx: 1 }),
    hopB:   pose({ y: -2, lean: -0.1, aF: [2.6, 0.2], aB: [2.4, 0.3], lF: [0.2, -0.2], lB: [-0.2, -0.4], hm: 2.9, sq: 1.18, hx: 1 }),
    mtA:    pose({ y: -1, lean: -0.3, aF: [3.1, 0.0], aB: [3.0, 0.1], lF: [0.8, -1.4], lB: [0.4, -1.5], hm: 3.5, sq: 0.9, hx: 1 }),
    mtB:    pose({ y: 0, lean: 0.2, aF: [0.15, 0.0], aB: [0.05, 0.1], lF: [-0.3, -0.5], lB: [-0.7, -0.7], hm: 0.0, sq: 1.2, hx: 1 }),
  };

  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set() }, o || {}); }
  // where the hammer head is, in world tiles, for a pose
  function head(p, q, f) {
    const u = p.h / U, K = FK.skel(P, q, 0, 0, u), h = K.aF[2], sq = q.sq == null ? 1 : q.sq;
    const hx = pcx(p) + f * h[0] * (2 - sq), hy = p.y + p.h + h[1] * sq;
    return [hx + f * Math.sin(q.hm) * HL * (q.hx == null ? 1 : q.hx), hy + Math.cos(q.hm) * HL];
  }
  function headHits(S, p, f, o) {
    const h = head(p, S.pose, f), q = S.seq;
    for (const e of FK.foes()) {
      if (q.hits.has(e)) continue;
      if (Math.hypot(ex(e) - h[0], ey(e) - h[1]) > HR + (o.r || 0.25) + (e.w || 0.9) / 2) continue;
      q.hits.add(e);
      const dirx = o.away ? (Math.sign(ex(e) - pcx(p)) || f) : f;
      FK.hit(S, e, o.dmg, { kx: dirx * (o.kx || 0), ky: o.ky, stun: o.stun || 0.5, c: C_FX, big: true, stop: o.stop || 0.08, shake: o.shake || 6 });
      FK.smack(true);
    }
    return h;
  }
  function clang(big) { FK.tone(big ? 520 : 760, { type: 'square', dur: 0.09, vol: 0.12, slide: 240 }); FK.tone(big ? 1560 : 2100, { dur: 0.22, vol: 0.08 }); }
  // the coil: hold the wind-up pose for hold seconds, trembling harder as it fills; returns true while still coiling
  function coil(S, q, a, hold) {
    if (q.t >= hold) return false;
    const u = q.t / hold, j = u * u * 0.5 * q.pw;
    S.target = pose(Object.assign({}, a, { x: Math.sin(q.t * 70) * j, y: a.y + 0.6 * u, sq: a.sq - 0.05 * u * q.pw })); S.rate = 22;
    S.heat = Math.max(S.heat, u * (0.4 + 0.6 * q.pw));
    if (!q.w && u > 0.15) { q.w = 1; FK.whoosh(true, false); }
    return true;
  }
  function raise(S, x, fy, pw, self) {
    if (S.pillars.length >= 2) crumble(S, S.pillars[0]);
    const P2 = { x, fy, h: 0, H: 2.6 + 0.9 * pw, t: 0, life: 8, w: 1.15, hits: new Set() };
    S.pillars.push(P2);
    FK.thud(true); FK.noise({ dur: 0.35, cut: 300, cutEnd: 1200, q: 1, vol: 0.3 });
    S.fx.push({ k: 'shock', x, y: fy, R: 1.3, t: 0, life: 0.4, c: C_FX });
    return P2;
  }
  function crumble(S, P2) {
    const i = S.pillars.indexOf(P2); if (i < 0) return; S.pillars.splice(i, 1);
    for (let j = 0; j < 6; j++) S.fx.push({ k: 'rock', x: P2.x + (Math.random() - 0.5) * 0.8, y: P2.fy - Math.random() * P2.h, vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 4, t: 0, life: 0.6, r: 0.12 + Math.random() * 0.12, rot: Math.random() * 6 });
    FK.noise({ dur: 0.3, cut: 900, cutEnd: 250, q: 1, vol: 0.25 });
  }
  function wave(S, x, fy, dir, pw) { S.waves.push({ x, fy, dir, t: 0, life: 0.5 + 0.15 * pw, sp: 11, hits: new Set(), dmg: 4 + 2 * pw }); }

  const SEQ = {
    smash(p, dt, S, q) {
      const f = q.f, H = 0.2 + 0.3 * q.pw;
      if (coil(S, q, PO.smA, H)) return;
      const t = q.t - H;
      S.target = FK.keyed([[0, PO.smA], [0.07, PO.smB], [0.14, PO.smC], [0.36, PO.smC], [0.52, PO.idle]], t); S.rate = 60;
      if (t < 0.14) { FK.moveX(p, f * 3 * dt); if (!q.snd) { q.snd = 1; FK.whoosh(false, true); } }
      if (t > 0.05 && t < 0.2) headHits(S, p, f, { dmg: 7 + 5 * q.pw, kx: 9, ky: -12 - 4 * q.pw, stop: 0.12 + 0.06 * q.pw, shake: 8 + 5 * q.pw, away: true });
      if (t >= 0.14 && !q.hit) {
        q.hit = 1; const h = head(p, PO.smC, f), R = 1.9 + 1.4 * q.pw;
        S.fx.push({ k: 'shock', x: h[0], y: p.y + p.h, R, t: 0, life: 0.45, c: q.pw > 0.3 ? C_HOT : C_FX });
        S.fx.push({ k: 'flash', x: h[0], y: p.y + p.h - 0.2, R: 0.9 + q.pw, c: C_HOT, t: 0, life: 0.18 });
        FK.thud(true); clang(true); FK.shake(6 + 6 * q.pw); FK.hitstop(0.04 + 0.05 * q.pw);
        for (const e of FK.within(h[0], p.y + p.h - 0.3, R)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 4 + 3 * q.pw, { kx: (Math.sign(ex(e) - h[0]) || f) * 7, ky: -11 - 3 * q.pw, stun: 0.6, c: C_FX, big: true }); }
        if (q.pw > 0.3) { wave(S, h[0], p.y + p.h, 1, q.pw); wave(S, h[0], p.y + p.h, -1, q.pw); }
      }
      if (t > 0.52) S.seq = null;
    },
    homer(p, dt, S, q) {
      const f = q.f, H = 0.16 + 0.26 * q.pw;
      if (coil(S, q, PO.hrA, H)) return;
      const t = q.t - H;
      S.target = FK.keyed([[0, PO.hrA], [0.08, PO.hrB], [0.16, PO.hrC], [0.34, PO.hrC], [0.48, PO.idle]], t); S.rate = 60;
      if (t < 0.12) { FK.moveX(p, f * 6 * dt); if (!q.snd) { q.snd = 1; FK.whoosh(false, true); } }
      if (t > 0.03 && t < 0.18) {
        const h = headHits(S, p, f, { dmg: 7 + 4 * q.pw, kx: 17 + 6 * q.pw, ky: -6, stop: 0.13, shake: 9 });
        // a pillar in the way is batted into rocks
        for (const P2 of S.pillars.slice()) if (!q.shat && P2.h > 0.8 && Math.abs(P2.x - h[0]) < 1.0 && h[1] > P2.fy - P2.h - 0.3) {
          q.shat = 1; const n = 6 + Math.round(3 * q.pw);
          for (let i = 0; i < n; i++) S.rocks.push({ x: P2.x, y: P2.fy - (i + 0.5) / n * P2.h, vx: f * (15 + Math.random() * 7), vy: -3 + (i / n) * -5 + Math.random() * 2, t: 0, life: 1.2, r: 0.2 + Math.random() * 0.12, rot: Math.random() * 6, dmg: 4 + 2 * q.pw });
          crumble(S, P2); clang(true); FK.hitstop(0.09); FK.shake(8); FK.label(S, p, 'ROCK SHOT!', C_GOLD, true);
        }
      }
      if (t > 0.48) S.seq = null;
    },
    pillar(p, dt, S, q) {
      const f = q.f;
      if (q.t < 0.2 && p.vy < 0) p.vy = 1;   // (↑ is also jump: stay planted)
      S.target = FK.keyed([[0, PO.idle], [0.12, PO.piA], [0.2, PO.piB], [0.4, PO.piB], [0.52, PO.idle]], q.t); S.rate = 55;
      S.heat = Math.max(S.heat, Math.min(1, q.t / 0.2) * 0.5);
      if (q.t >= 0.2 && !q.done) {
        q.done = 1; clang(false);
        const self = q.pw > 0.3, fy = p.y + p.h;
        const x = self ? pcx(p) : pcx(p) + f * 1.7;
        const gy = FK.floorAt(x, fy - 0.6, 3);
        if (gy == null) { FK.label(S, p, 'NO FLOOR', C_STONE); S.seq = null; return; }
        const P2 = raise(S, x, gy, q.pw, self);
        if (self) { p.vy = -17 - 3 * q.pw; p.onGround = false; S.airUp = false; P2.thrown = 1; }
      }
      if (q.t > 0.52) S.seq = null;
    },
    ripple(p, dt, S, q) {
      S.target = FK.keyed([[0, PO.idle], [0.1, PO.riA], [0.18, PO.riB], [0.38, PO.riB], [0.5, PO.idle]], q.t); S.rate = 55;
      if (q.t >= 0.18 && !q.done) {
        q.done = 1; const fy = p.y + p.h;
        wave(S, pcx(p), fy, 1, q.pw); wave(S, pcx(p), fy, -1, q.pw);
        S.fx.push({ k: 'shock', x: pcx(p), y: fy, R: 1.2, t: 0, life: 0.35, c: C_FX }); FK.thud(true); clang(false); FK.shake(5);
      }
      if (q.t > 0.5) S.seq = null;
    },
    whirl(p, dt, S, q) {
      const f = q.f, D = 0.5 + 0.2 * q.pw, an = q.t / D * Math.PI * (4 + 2 * q.pw);
      S.target = pose(Object.assign({}, PO.whirl, { hx: Math.cos(an), lean: 0.1 * Math.sin(an) })); S.rate = 70;
      p.vy = Math.min(p.vy, 1.6);
      const half = Math.cos(an) > 0 ? 1 : -1;
      if (q.half !== half) { q.half = half; q.hits = new Set(); FK.whoosh(false); }
      if (Math.abs(Math.cos(an)) > 0.4) headHits(S, p, f, { dmg: 4, kx: 9, ky: -7, stop: 0.05, shake: 4, away: true });
      if (q.t > D || p.onGround) S.seq = null;
    },
    comet(p, dt, S, q) {
      const f = q.f, H = 0.1 + 0.2 * q.pw;
      if (coil(S, q, PO.cmA, H)) { p.vy = Math.min(p.vy, 0.5); return; }
      const t = q.t - H;
      S.target = t < 0.2 ? PO.cmB : PO.fall; S.rate = 60;
      if (t < 0.2) { p.vx = f * (13 + 4 * q.pw); p.vy = Math.min(p.vy, 1); headHits(S, p, f, { dmg: 7 + 3 * q.pw, kx: 15 + 4 * q.pw, ky: -7, stop: 0.12 }); if (!q.snd) { q.snd = 1; FK.whoosh(false, true); } }
      if (t > 0.3) S.seq = null;
    },
    hop(p, dt, S, q) {
      const f = q.f;
      S.target = FK.keyed([[0, PO.hopA], [0.08, PO.hopA], [0.16, PO.hopB], [0.4, PO.fall]], q.t); S.rate = 55;
      if (q.t < 0.08) { p.vy = Math.min(p.vy, 0.5); return; }
      if (!q.go) { q.go = 1; p.vy = -15.5 - 2.5 * q.pw; FK.whoosh(true, true); clang(false); S.fx.push({ k: 'ring', x: pcx(p), y: p.y + p.h + 0.3, R: 1.2, c: C_FX, t: 0, life: 0.3 }); }
      if (q.t < 0.3) headHits(S, p, f, { dmg: 5, kx: 2, ky: -13, stop: 0.07 });
      if (q.t > 0.4) S.seq = null;
    },
    meteor(p, dt, S, q) {
      const f = q.f, H = 0.12 + 0.2 * q.pw;
      if (coil(S, q, PO.mtA, H)) { p.vy = -1.5; p.vx *= 0.9; return; }
      S.target = PO.mtB; S.rate = 60;
      p.vy = 24 + 5 * q.pw; p.vx = f * 1.2;
      headHits(S, p, f, { dmg: 6 + 2 * q.pw, kx: 2, ky: 16, stop: 0.1 });
      // landing on a pillar drives it into the ground
      for (const P2 of S.pillars.slice()) if (P2.h > 0.8 && Math.abs(pcx(p) - P2.x) < P2.w / 2 + 0.3 && p.y + p.h > P2.fy - P2.h - 0.2 && p.y + p.h < P2.fy - P2.h + 0.8) {
        wave(S, P2.x, P2.fy, 1, 1); wave(S, P2.x, P2.fy, -1, 1); crumble(S, P2); FK.label(S, p, 'PILE DRIVER!', C_GOLD, true); FK.hitstop(0.1);
      }
      if (p.onGround && q.t > H + 0.03) {
        const fy = p.y + p.h, R = 1.8 + q.pw;
        S.fx.push({ k: 'shock', x: pcx(p), y: fy, R, t: 0, life: 0.45, c: C_HOT }); FK.thud(true); clang(true); FK.shake(8 + 4 * q.pw);
        for (const e of FK.within(pcx(p), fy - 0.3, R)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 5 + 3 * q.pw, { kx: (Math.sign(ex(e) - pcx(p)) || f) * 8, ky: -13, stun: 0.6, c: C_FX, big: true }); }
        S.seq = null; S.land = 0.18;
      }
      if (q.t > H + 1.2) S.seq = null;
    },
  };

  function stepWorld(p, dt, S) {
    const foes = FK.foes();
    S.onPillar = false;
    for (const P2 of S.pillars.slice()) {
      P2.t += dt;
      const rising = P2.h < P2.H;
      if (rising) P2.h = Math.min(P2.H, P2.h + 22 * dt);
      const top = P2.fy - P2.h;
      for (const e of foes) if (rising && !P2.hits.has(e) && Math.abs(ex(e) - P2.x) < P2.w / 2 + (e.w || 0.9) / 2 && e.y + (e.h || 0.9) > top - 0.2 && e.y < P2.fy) {
        P2.hits.add(e); FK.hit(S, e, 5, { kx: 0, ky: -17, stun: 0.6, c: C_FX, big: true, stop: 0.08 }); FK.smack(true);
      }
      if (!P2.thrown || p.vy >= 0) { P2.thrown = 0; if (FK.stand(p, top, P2.x - P2.w / 2, P2.x + P2.w / 2)) { S.onPillar = true; S.airUp = false; } }
      if (P2.t > P2.life) crumble(S, P2);
    }
    for (let i = S.waves.length - 1; i >= 0; i--) {
      const w = S.waves[i]; w.t += dt; w.x += w.dir * w.sp * dt;
      const gone = w.t > w.life || FK.blocked(w.x - 0.1, w.fy - 0.6, 0.2, 0.4) || !FK.blocked(w.x - 0.1, w.fy + 0.1, 0.2, 0.2);
      for (const e of foes) if (!w.hits.has(e) && Math.abs(ex(e) - w.x) < 0.7 && Math.abs(e.y + (e.h || 0.9) - w.fy) < 1.0) { w.hits.add(e); FK.hit(S, e, w.dmg, { kx: w.dir * 3, ky: -10, stun: 0.5, c: C_FX, big: true }); FK.smack(false); }
      if (Math.floor(w.t * 20) !== w.d) { w.d = Math.floor(w.t * 20); S.fx.push({ k: 'rock', x: w.x, y: w.fy - 0.1, vx: -w.dir * 1.5, vy: -4 - Math.random() * 3, t: 0, life: 0.4, r: 0.1 + Math.random() * 0.08, rot: Math.random() * 6 }); }
      if (gone) S.waves.splice(i, 1);
    }
    for (let i = S.rocks.length - 1; i >= 0; i--) {
      const r = S.rocks[i]; r.t += dt; r.vy += 9 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.rot += dt * 14;
      let gone = r.t > r.life || FK.blocked(r.x - 0.1, r.y - 0.1, 0.2, 0.2);
      if (!gone) for (const e of foes) if (Math.abs(ex(e) - r.x) < r.r + (e.w || 0.9) / 2 && Math.abs(ey(e) - r.y) < r.r + (e.h || 0.9) / 2) { FK.hit(S, e, r.dmg, { kx: Math.sign(r.vx) * 8, ky: -5, stun: 0.4, c: C_FX, big: true }); FK.smack(true); gone = true; break; }
      if (gone) { S.fx.push({ k: 'dust', x: r.x, y: r.y, t: 0, life: 0.3, c: '#b8a690' }); S.rocks.splice(i, 1); }
    }
  }

  const MOVES = {
    ground: { neutral: { name: 'Hammer Smash', big: 'QUAKE SMASH', cd: 0.45 }, side: { name: 'Home Run', big: 'GRAND SLAM', cd: 0.45 }, up: { name: 'Pillar', big: 'ELEVATOR', cd: 0.6 }, down: { name: 'Ripple', big: 'TREMOR', cd: 0.5 } },
    air:    { neutral: { name: 'Whirl', cd: 0.4 }, side: { name: 'Comet Swing', big: 'COMET', cd: 0.4 }, up: { name: 'Hammer Hop', cd: 0.3 }, down: { name: 'Meteor Hammer', big: 'METEOR', cd: 0.45 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  function rock(ctx, x, y, r, rot, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); FK.solid(ctx, C_STONE, a); ctx.beginPath();
    for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2, rr = r * (0.75 + 0.25 * ((i * 7) % 3) / 2); ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    ctx.closePath(); ctx.fill(); FK.solid(ctx, '#b3a999', a); ctx.fillRect(-r * 0.4, -r * 0.5, r * 0.5, r * 0.3); ctx.restore();
  }

  FK.define({
    id: ID, plug: 'maul',
    def: { name: 'Maul', icon: '🔨', tier: 'gold', color: C_FX, color2: C_GOLD,
      ability: 'Hammer Smith: the hardest hits in the game with super armor on every swing, and Stone Pillars to stand on, bat or drive into the ground',
      desc: 'A blacksmith with a hammer as big as she is: heavy, hard to launch, and armored through every swing so nothing interrupts her. Every swing coils back first (hold S to stay coiled and hit harder): Hammer Smash, Home Run and Ripple on the ground, Whirl, Comet Swing, Hammer Hop and Meteor Hammer in the air. PILLAR (↑) raises a stone pillar that launches foes and stays as a platform; charged it lifts her instead. Home Run a pillar to shatter it into flying rocks, or Meteor Hammer onto one to drive it in as a shockwave.' },
    stats: { speed: 0.98, jump: 1.05, maxJumps: 2, maxDashes: 1, hp: 6 },
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, heat: 0, pillars: [], waves: [], rocks: [], airUp: false, onPillar: false, land: 0 }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Hammer Hop comes back when you land'; return null; },
    act: {
      ground_neutral: (p, f, pw, S) => startSeq(S, 'smash', { f, pw }),
      ground_side: (p, f, pw, S) => startSeq(S, 'homer', { f, pw }),
      ground_up: (p, f, pw, S) => startSeq(S, 'pillar', { f, pw }),
      ground_down: (p, f, pw, S) => startSeq(S, 'ripple', { f, pw }),
      air_neutral: (p, f, pw, S) => startSeq(S, 'whirl', { f, pw }),
      air_side: (p, f, pw, S) => startSeq(S, 'comet', { f, pw }),
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'hop', { f, pw }); },
      air_down: (p, f, pw, S) => startSeq(S, 'meteor', { f, pw }),
    },
    onTeleport(p, S) { S.seq = null; S.pillars.length = 0; S.waves.length = 0; },
    step(p, dt, S, k) {
      S.rate = 18; S.heat = Math.max(0, S.heat - dt * 2.5);
      if (S.seq) { p._armorT = Math.max(p._armorT || 0, 0.18); S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }   // SUPER ARMOR: nothing knocks her out of a swing
      stepWorld(p, dt, S);
      if (!S.seq) {
        if (S.land > 0) { S.land -= dt; S.target = PO.riB; S.rate = 40; }
        else S.target = FK.locomotion(S, p, dt, PO, { aF: [0.6, 0.9], aB: [0.4, 1.0], hm: 3.75, sq: 1, hx: 1 });
      }
      if (p.onGround && !S.onPillar) S.airUp = false;
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing: a stocky smith, red ponytail, leather apron, and the hammer
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, s = ph / U, cx = px + pw / 2, fy = py + ph, sq = q.sq == null ? 1 : q.sq;
      // squash and stretch about her feet
      ctx.translate(cx, fy); ctx.scale(2 - sq, sq); ctx.translate(-cx, -fy);
      const K = FK.skel(P, q, cx, fy, s), heat = S ? (S.heat || 0) : 0;
      const Tpx = ph / (p ? p.h : 0.92);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(255,184,107,0.45)';
      FK.limb(ctx, K.lB, 5.6 * s, '#4a3a33', 5.2 * s);
      FK.mitt(ctx, K.lB[2][0] + 0.9 * s, K.lB[2][1] - 0.3 * s, 3 * s, '#2d2420');
      FK.limb(ctx, K.aB, 5 * s, '#b98a62', 4.8 * s);
      // the hammer: handle through both hands, a block head that glows as she coils
      const hx = K.aF[2][0], hy = K.aF[2][1], dx = Math.sin(q.hm) * (q.hx == null ? 1 : q.hx), dy = Math.cos(q.hm), len = HL * Tpx;
      const bx = hx + dx * len, by = hy + dy * len;
      const drawHammer = () => {
        ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2.4 * s; ctx.beginPath(); ctx.moveTo(hx - dx * 4 * s, hy - dy * 4 * s); ctx.lineTo(bx, by); ctx.stroke();
        ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.atan2(dy, dx));
        const hw = HR * Tpx * 1.1, hh = HR * Tpx * 1.9 * Math.max(0.35, Math.abs(q.hx == null ? 1 : q.hx) * 0.5 + 0.5);
        const g = ctx.createLinearGradient(0, -hh / 2, 0, hh / 2); g.addColorStop(0, '#dfe5ee'); g.addColorStop(0.5, C_IRON); g.addColorStop(1, C_IRON2);
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-hw / 2, -hh / 2, hw, hh, hw * 0.18); ctx.fill();
        ctx.fillStyle = C_GOLD; ctx.fillRect(-hw / 2, -hh * 0.08, hw, hh * 0.16);
        if (heat > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, heat); ctx.fillStyle = C_HOT; ctx.shadowBlur = 18 * heat; ctx.shadowColor = C_HOT; ctx.beginPath(); ctx.roundRect(-hw / 2, -hh / 2, hw, hh, hw * 0.18); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        ctx.restore();
      };
      const behind = Math.cos(q.hm) < -0.2 && Math.sin(q.hm) < 0.2;   // carried over the shoulder: behind the body
      if (behind) drawHammer();
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 2.7 * s, C_SKIN);
      // body: shirt and a leather apron with a brass buckle
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s, W = 16 * s;
      FK.blob(ctx, W, Lt, C_SHIRT, '#c9c0ae', 6 * s);
      ctx.shadowBlur = 0;
      ctx.fillStyle = C_APRON; ctx.beginPath(); ctx.roundRect(-W * 0.36, -Lt * 0.78, W * 0.8, Lt * 0.78 + 3.6 * s, [3 * s, 3 * s, 5 * s, 5 * s]); ctx.fill();
      ctx.fillStyle = C_APRON2; ctx.fillRect(-W * 0.36, -Lt * 0.3, W * 0.8, 1.5 * s);
      ctx.fillStyle = C_GOLD; ctx.beginPath(); ctx.arc(W * 0.14, -Lt * 0.24, 1.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
      FK.limb(ctx, K.lF, 5.8 * s, '#5a463c', 5.4 * s);
      FK.mitt(ctx, K.lF[2][0] + 1.0 * s, K.lF[2][1] - 0.3 * s, 3.2 * s, '#3a2e28');
      // head: ponytail, headband, a set jaw; teeth gritted while she coils
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      const hr = K.hr, grit = heat > 0.25;
      ctx.strokeStyle = C_HAIR; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.moveTo(-hr * 0.7, -hr * 0.35); ctx.quadraticCurveTo(-hr * 1.7, -hr * 0.3 + Math.sin(t * 6) * s * 1.2, -hr * 1.5, hr * 0.9 + Math.sin(t * 5) * s); ctx.stroke();
      ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.arc(0, 0, hr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.arc(-hr * 0.08, -hr * 0.12, hr * 1.04, Math.PI * 0.95, Math.PI * 1.95); ctx.quadraticCurveTo(hr * 0.5, -hr * 0.45, -hr * 0.2, -hr * 0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2f6fb3'; ctx.fillRect(-hr * 1.0, -hr * 0.5, hr * 2.0, hr * 0.2);
      FK.eyes(ctx, hr * 0.1, hr * 0.12, hr * 0.2, hr * 0.48, { pupil: '#3a2412', angry: grit ? '#7a2a14' : null });
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#7a3b2a'; ctx.lineWidth = 0.7 * s;
      if (grit) { ctx.beginPath(); ctx.roundRect(hr * 0.25, hr * 0.5, hr * 0.5, hr * 0.2, hr * 0.06); ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(hr * 0.3, hr * 0.56); ctx.quadraticCurveTo(hr * 0.5, hr * 0.68, hr * 0.7, hr * 0.52); ctx.stroke(); }
      ctx.restore();
      if (!behind) drawHammer();
      FK.limb(ctx, K.aF, 5.2 * s, C_SKIN, 5 * s);
      ctx.fillStyle = C_APRON2; ctx.beginPath(); ctx.arc(K.aF[1][0], K.aF[1][1], 2.9 * s, 0, Math.PI * 2); ctx.fill();   // a leather bracer at the elbow
      FK.mitt(ctx, hx, hy, 3 * s, '#4a3a33');
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T, f = FK.face(p), q = S.seq;
      for (const P2 of S.pillars) {
        const x = V.SX(P2.x), y0 = V.SY(P2.fy), h = P2.h * T, w = P2.w * T, left = P2.life - P2.t;
        const sh = left < 1 ? Math.sin(V.now * 50) * 2 : 0;
        const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, C_STONE2); g.addColorStop(0.45, C_STONE); g.addColorStop(1, '#a89f92');
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x - w * 0.5 + sh, y0); ctx.lineTo(x - w * 0.42 + sh, y0 - h); ctx.lineTo(x + w * 0.42 + sh, y0 - h); ctx.lineTo(x + w * 0.5 + sh, y0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(40,34,30,0.55)'; ctx.lineWidth = 1.5;
        for (let i = 1; i * T * 0.7 < h; i++) { const yy = y0 - i * T * 0.7; ctx.beginPath(); ctx.moveTo(x - w * 0.46 + sh, yy); ctx.lineTo(x + w * 0.46 + sh, yy + (i % 2 ? 3 : -3)); ctx.stroke(); }
        ctx.fillStyle = '#c7beb0'; ctx.fillRect(x - w * 0.46 + sh, y0 - h - 3, w * 0.92, 5);
      }
      for (const w of S.waves) {
        const x = V.SX(w.x), y = V.SY(w.fy), a = 1 - w.t / w.life;
        ctx.beginPath(); ctx.moveTo(x - w.dir * T * 0.7, y); ctx.quadraticCurveTo(x, y - T * 1.1 * a, x + w.dir * T * 0.35, y); ctx.closePath(); FK.solid(ctx, C_STONE, 0.95); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - w.dir * T * 0.5, y); ctx.quadraticCurveTo(x, y - T * 0.9 * a, x + w.dir * T * 0.3, y); FK.glow(ctx, C_FX, 0.7 * a); ctx.lineWidth = 3; ctx.stroke();
      }
      for (const r of S.rocks) { rock(ctx, V.SX(r.x), V.SY(r.y), r.r * T, r.rot, 1); ctx.beginPath(); ctx.moveTo(V.SX(r.x), V.SY(r.y)); ctx.lineTo(V.SX(r.x - r.vx * 0.05), V.SY(r.y - r.vy * 0.05)); FK.glow(ctx, C_FX, 0.5); ctx.lineWidth = r.r * T; ctx.stroke(); }
      // the swing: a heavy crescent behind the hammer head, hotter the longer she coiled
      if (q && ['smash', 'homer', 'comet', 'hop', 'meteor', 'whirl'].includes(q.kind)) {
        S.trail = S.trail || []; const h = head(p, S.pose, f); S.trail.push(h); if (S.trail.length > 8) S.trail.shift();   // (world tiles: the camera may move under it)
        if (S.trail.length > 2) FK.taper(ctx, S.trail.slice().reverse().map(w => [V.SX(w[0]), V.SY(w[1])]), T * (0.3 + 0.2 * (q.pw || 0)), (q.pw || 0) > 0.3 ? C_HOT : C_FX, 0.8);
      } else S.trail = null;
      if (p._armorT > 0 && q) { ctx.beginPath(); ctx.ellipse(V.SX(pcx(p)), V.SY(pcy(p)), T * 0.85, T * 1.05, 0, 0, Math.PI * 2); FK.glow(ctx, C_HOT, 0.28 + 0.15 * Math.sin(V.now * 26)); ctx.lineWidth = 3; ctx.stroke(); }
      // coiling: sparks drawn into the hammer head
      if (S.heat > 0.3 && q) {
        const h = head(p, S.pose, f), x = V.SX(h[0]), y = V.SY(h[1]);
        for (let i = 0; i < 5; i++) { const an = V.now * 6 + i * 1.26, r = T * (0.9 - ((V.now * 2 + i * 0.2) % 1) * 0.7); FK.star(ctx, x + Math.cos(an) * r, y + Math.sin(an) * r, T * 0.09, an, C_HOT, S.heat); }
      }
    },
    drawFx(ctx, V, f, u, a) {
      if (f.k === 'rock') { rock(ctx, V.SX(f.x + f.vx * f.t), V.SY(f.y + f.vy * f.t + 7 * f.t * f.t), f.r * V.T, f.rot + f.t * 9, a); return true; }
      return false;
    },
    // Smash CPU: walk them down and commit to the big swings
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      if (I.air) {
        if (I.dy > 0.8 && I.adx < 1.2) return { type: 'tap', v: 'down' };
        if (I.dy < -0.8 && I.adx < 1.8 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.adx < 2.4 && Math.abs(I.dy) < 1.4) return Math.random() < 0.5 ? { type: 'tap', v: '' } : { type: 'tap', v: 'side' };
        return null;
      }
      if (I.dy < -1.4 && I.adx < 2.4) return { type: 'tap', v: 'up' };
      if (I.adx < 2.2 && Math.abs(I.dy) < 1.2) return I.killy ? { type: 'charge', v: Math.random() < 0.5 ? 'side' : '', hold: 0.6 } : { type: 'tap', v: Math.random() < 0.5 ? 'side' : '' };
      if (I.adx > 2.5 && I.adx < 6 && Math.abs(I.dy) < 0.8 && I.r < 0.35) return { type: 'tap', v: 'down' };
      return null;
    },
  });
})();
