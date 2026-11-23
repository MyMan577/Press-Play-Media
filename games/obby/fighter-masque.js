/* Obby Builder: MASQUE, the mask dancer. Five masks, five different fighters, and the dance between them mends her.
 *
 * ↓ + S (ground or air) is the MASK DANCE: she spins into the next mask with a burst that knocks back anyone close
 * and a little healing every time. Tap = the next mask, hold S = the one before. The order is
 * Fox → Owl → Turtle → Serpent → Dragon. The other three moves belong to the mask she wears, and each mask plays
 * by its own rule:
 *
 *  🦊 FOX: combos. FOX FLURRY (rapid claws) lights a FOXFIRE wisp for every hit that lands (up to 3, they orbit her).
 *     POUNCE detonates them all on the foe it tackles; FLIP KICK fires them off as homing bolts.
 *  🦉 OWL: range and air. FEATHER DARTS cross the screen, GUST shoves foes away and pushes her back, THERMAL is a
 *     column of rising air that stays: it lifts her and launches foes. A third jump, and holding jump glides.
 *  🐢 TURTLE: the tank. SHELL BASH is a wound-up headbutt that mends her for every foe it hits, SHELL SLIDE is an
 *     armored slide that bounces off walls, GEYSER lifts her and anyone above. Standing still slowly mends her.
 *  🐍 SERPENT: poison and traps. VENOM SPIT lobs a glob that leaves a poison pool on the floor, TAIL LASH reaches
 *     far and YANKS the foe it catches back to her, SPRING COIL is the highest jump she has and bursts venom as it
 *     goes. Poisoned foes keep taking damage, and every tick of it mends her.
 *  🐉 DRAGON: fire and flight. FIRE BREATH is a held stream of flame (many hits), DRAGON RUSH flies straight ahead
 *     through everything, even in the air, FLAME PILLAR erupts under her. Holding jump in the air flaps to hover.
 *
 * CHARGED MOVES (hold S): every mask has three charged moves that are different moves, not bigger copies.
 *  🦊 NINE-TAIL STORM (tears through everyone, ends with three wisps), FOXFIRE COMET (goes through foes, explodes on
 *     landing), MOONSAULT (double height, then a spiking dive kick).
 *  🦉 FEATHER STORM (feathers rain along the stretch ahead), TORNADO (a walking twister that drags foes in and throws
 *     them up; she can ride it), SKY CYCLONE (a huge lasting thermal that carries everyone near her up).
 *  🐢 TIDAL BASH (throws a healing wave along the floor), SHELL PINBALL (a long hopping slide, faster off every wall),
 *     HOT SPRING (the geyser leaves a pool that mends her while she stands in it).
 *  🐍 VENOM RAIN (three globs, three pools), CONSTRICT (catches a far foe, squeezes its life into her, throws it),
 *     HYDRA BURST (her highest jump, with venom raining from the top).
 *  🐉 INFERNO BEAM (a screen-long piercing beam), FIRESTORM RUSH (sets the floor alight under her flight),
 *     ERUPTION (five flame pillars marching outwards).
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_masque';
  const C_ROBE = '#3b2a5c', C_ROBE2 = '#261a3d', C_SASH = '#f2c14e', C_SKIN = '#e8c39e', C_HAIR = '#1d1a26', C_MEND = '#7dffb0', C_VENOM = '#9dff5a', C_FIRE = '#ff8a1f';
  const FORMS = [
    { id: 'fox',    name: 'FOX',    icon: '🦊', c: '#ff7a3c', c2: '#ffd9b8', stats: { speed: 1.32, jump: 1.12, maxJumps: 2 } },
    { id: 'owl',    name: 'OWL',    icon: '🦉', c: '#6fb6ff', c2: '#e8f3ff', stats: { speed: 1.02, jump: 1.2, maxJumps: 3 } },
    { id: 'turtle', name: 'TURTLE', icon: '🐢', c: '#58d68d', c2: '#d9ffe6', stats: { speed: 0.86, jump: 0.96, maxJumps: 2 } },
    { id: 'serpent', name: 'SERPENT', icon: '🐍', c: '#b06cff', c2: '#ecd9ff', stats: { speed: 1.12, jump: 1.05, maxJumps: 2 } },
    { id: 'dragon', name: 'DRAGON', icon: '🐉', c: '#ff4d4d', c2: '#ffe0b0', stats: { speed: 0.96, jump: 1.08, maxJumps: 2 } },
  ];
  const P = { hip: 9, torso: 10.5, neck: -2.8, head: 9.4, ua: 5, fa: 5, th: 4.6, sh: 4.6 };
  const U = 31, pose = FK.pose, { ex, ey, pcx, pcy } = FK;

  // tuck = how far she is pulled into the turtle shell (0..1), wing = owl wings spread (0..1)
  const PO = {
    idle:   pose({ y: 0.5, lean: 0.05, aF: [0.5, 0.8], aB: [-0.3, 0.6], lF: [0.3, -0.15], lB: [-0.3, -0.1], tuck: 0, wing: 0 }),
    jump:   pose({ aF: [1.5, 0.5], aB: [-1.2, 0.6], lF: [0.8, -1.3], lB: [0.1, -0.7], tuck: 0, wing: 0 }),
    fall:   pose({ aF: [2.3, 0.3], aB: [-2.0, 0.4], lF: [0.4, -0.5], lB: [-0.3, -0.3], tuck: 0, wing: 0 }),
    glide:  pose({ y: -0.5, lean: 0.5, aF: [2.0, 0.1], aB: [-2.0, 0.1], lF: [-0.5, -0.2], lB: [-0.8, -0.3], tuck: 0, wing: 1 }),
    spinA:  pose({ y: 2, lean: -0.2, aF: [1.6, 0.2], aB: [-1.6, 0.2], lF: [0.7, -0.8], lB: [-0.6, -0.4], tuck: 0, wing: 0 }),
    spinB:  pose({ y: -1.5, lean: 0.1, aF: [2.9, 0.2], aB: [-2.9, 0.2], lF: [0.2, -0.3], lB: [-0.6, -1.2], tuck: 0, wing: 0.5 }),
    // fox
    clawA:  pose({ y: 1.5, lean: 0.45, aF: [1.9, 0.1], aB: [-0.9, 1.4], lF: [0.9, -0.5], lB: [-0.8, -0.2], tuck: 0, wing: 0 }),
    clawB:  pose({ y: 1.5, lean: 0.35, aF: [0.2, 1.6], aB: [1.8, 0.1], lF: [0.7, -0.4], lB: [-0.9, -0.2], tuck: 0, wing: 0 }),
    crouch: pose({ y: 5, lean: 0.55, aF: [0.9, 0.6], aB: [0.6, 0.8], lF: [1.3, -2.0], lB: [-0.4, -1.6], tuck: 0, wing: 0 }),
    pounce: pose({ y: 0, lean: 1.0, aF: [2.3, 0.1], aB: [2.0, 0.2], lF: [-0.8, -0.3], lB: [-1.2, -0.2], tuck: 0, wing: 0 }),
    kick:   pose({ y: -1, lean: -0.7, aF: [-1.8, 0.4], aB: [-2.4, 0.3], lF: [2.2, -0.1], lB: [0.6, -1.4], tuck: 0, wing: 0 }),
    // owl
    dartA:  pose({ y: 0.8, lean: -0.3, aF: [-2.2, 0.5], aB: [0.8, 0.4], lF: [0.5, -0.3], lB: [-0.4, -0.2], tuck: 0, wing: 0.6 }),
    dartB:  pose({ y: 1.2, lean: 0.4, aF: [1.7, 0.05], aB: [-1.3, 0.3], lF: [0.9, -0.4], lB: [-0.8, -0.1], tuck: 0, wing: 0.3 }),
    gustA:  pose({ y: 1, lean: -0.35, aF: [-2.4, 0.3], aB: [-2.0, 0.4], lF: [0.5, -0.4], lB: [-0.5, -0.3], tuck: 0, wing: 1 }),
    gustB:  pose({ y: 1.5, lean: 0.5, aF: [1.5, 0.1], aB: [1.2, 0.2], lF: [0.9, -0.4], lB: [-0.9, -0.2], tuck: 0, wing: 1 }),
    soar:   pose({ y: -2, lean: 0, aF: [2.7, 0.1], aB: [-2.7, 0.1], lF: [0.2, -0.2], lB: [-0.2, -0.5], tuck: 0, wing: 1 }),
    // turtle
    bashA:  pose({ y: 3.5, lean: -0.45, head: 0.4, aF: [-0.8, 1.2], aB: [-1.0, 1.0], lF: [0.8, -0.8], lB: [-0.5, -0.6], tuck: 0.35, wing: 0 }),
    bashB:  pose({ y: 2, lean: 0.75, head: -0.3, aF: [-1.2, 0.4], aB: [-1.5, 0.3], lF: [1.0, -0.3], lB: [-1.1, -0.1], tuck: 0, wing: 0 }),
    shell:  pose({ y: 5.5, lean: 1.2, aF: [0.6, 1.8], aB: [0.4, 1.8], lF: [1.4, -2.2], lB: [1.2, -2.2], tuck: 1, wing: 0 }),
    // serpent
    spitA:  pose({ y: 2.5, lean: -0.5, head: 0.5, aF: [-0.6, 1.0], aB: [-0.9, 0.8], lF: [0.6, -0.6], lB: [-0.5, -0.4], tuck: 0, wing: 0 }),
    spitB:  pose({ y: 1.5, lean: 0.55, head: -0.35, aF: [-1.4, 0.3], aB: [-1.7, 0.3], lF: [0.9, -0.4], lB: [-0.9, -0.1], tuck: 0, wing: 0 }),
    lashA:  pose({ y: 2, lean: -0.3, aF: [-2.3, 0.4], aB: [0.9, 0.5], lF: [0.5, -0.5], lB: [-0.5, -0.3], tuck: 0, wing: 0 }),
    lashB:  pose({ y: 2.5, lean: 0.6, aF: [1.6, 0.0], aB: [-1.2, 0.3], lF: [1.1, -0.5], lB: [-1.0, -0.1], tuck: 0, wing: 0 }),
    coil:   pose({ y: 6.5, lean: 0.3, aF: [0.5, 1.6], aB: [0.3, 1.7], lF: [1.4, -2.3], lB: [1.1, -2.3], tuck: 0, wing: 0 }),
    spring: pose({ y: -2.5, lean: 0, aF: [3.0, 0.0], aB: [-3.0, 0.0], lF: [0.05, 0], lB: [-0.05, 0], tuck: 0, wing: 0 }),
    // dragon
    breath: pose({ y: 1.2, lean: 0.4, head: -0.2, aF: [-1.3, 0.5], aB: [-1.6, 0.4], lF: [0.8, -0.4], lB: [-0.8, -0.2], tuck: 0, wing: 0.8 }),
    inhale: pose({ y: 1.5, lean: -0.45, head: 0.45, aF: [-0.4, 1.2], aB: [-0.7, 1.0], lF: [0.5, -0.4], lB: [-0.5, -0.3], tuck: 0, wing: 1 }),
    rush:   pose({ y: -0.5, lean: 1.25, head: -0.6, aF: [-2.2, 0.2], aB: [-2.5, 0.2], lF: [-0.9, -0.2], lB: [-1.2, -0.2], tuck: 0, wing: 1 }),
    flap:   pose({ y: -1, lean: 0.15, aF: [1.9, 0.3], aB: [-1.9, 0.3], lF: [0.4, -0.7], lB: [-0.2, -0.6], tuck: 0, wing: 1 }),
    spout:  pose({ y: -1, lean: -0.15, aF: [2.2, 0.6], aB: [-2.2, 0.6], lF: [0.9, -1.5], lB: [0.6, -1.4], tuck: 0.4, wing: 0 }),
  };

  const form = S => FORMS[S.form || 0];
  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set(), n: 0 }, o || {}); }
  function box(p, f, x0, x1, hh) { const cx = pcx(p), cy = pcy(p); return FK.foes().filter(e => { const dx = (ex(e) - cx) * f; return dx > x0 - (e.w || 0.9) / 2 && dx < x1 + (e.w || 0.9) / 2 && Math.abs(ey(e) - cy) < hh + (e.h || 0.9) / 2; }); }

  const SEQ = {
    // ---- the mask dance
    dance(p, dt, S, q) {
      const D = 0.34;
      S.target = q.t < 0.14 ? PO.spinA : PO.spinB; S.rate = 40; S.rot = FK.ease(q.t / D) * Math.PI * 2 * q.f;
      p.vy = Math.min(p.vy, 2);
      if (q.t >= 0.14 && !q.done) {
        q.done = 1; S.form = ((S.form || 0) + (q.pw > 0.3 ? FORMS.length - 1 : 1)) % FORMS.length; S.maskT = 0.4;
        const F = form(S);
        S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 1.9, c: F.c, t: 0, life: 0.4 }); S.fx.push({ k: 'flash', x: pcx(p), y: pcy(p), R: 1.0, c: F.c, t: 0, life: 0.2 });
        for (const e of FK.within(pcx(p), pcy(p), 1.9)) FK.hit(S, e, 1.5, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 8, ky: -6, stun: 0.35, c: F.c, big: true });
        FK.heal(S, p, 0.45, C_MEND);
        FK.label(S, p, F.icon + ' ' + F.name + '!', F.c, true);
        FK.tone([523, 440, 330, 392, 294][S.form], { dur: 0.22, vol: 0.16, type: 'triangle' }); FK.tone([784, 660, 494, 587, 440][S.form], { dur: 0.3, vol: 0.1, delay: 0.07, type: 'sine' });
      }
      if (q.t > D) { S.seq = null; S.rot = 0; }
    },
    // ---- fox
    flurry(p, dt, S, q) {
      const f = q.f, n = 4 + Math.round(3 * q.pw), step = 0.075;
      const i = Math.floor(q.t / step);
      S.target = i % 2 ? PO.clawB : PO.clawA; S.rate = 70;
      if (!p.onGround) p.vy = Math.min(p.vy, 1.2);
      while (q.n <= i && q.n < n) {
        const last = q.n === n - 1; q.n++;
        FK.moveX(p, f * 0.22);
        S.fx.push({ k: 'claw', x: pcx(p) + f * 1.0, y: pcy(p) + (q.n % 2 ? -0.15 : 0.2), f, up: q.n % 2, t: 0, life: 0.16 });
        FK.noise({ dur: 0.05, cut: 3400, q: 3, vol: 0.12 });
        for (const e of box(p, f, -0.2, 1.7, 0.9)) { if (S.wisps < 3) { S.wisps++; FK.tone(880 + S.wisps * 220, { dur: 0.1, vol: 0.07, type: 'sine' }); } FK.hit(S, e, last ? 2 + q.pw : 0.9, last ? { kx: f * 10, ky: -7, stun: 0.5, c: FORMS[0].c, big: true, stop: 0.08 } : { kx: f * 0.6, ky: -1.2, stun: 0.25, c: FORMS[0].c }); }
      }
      if (q.t > n * step + 0.12) S.seq = null;
    },
    pounce(p, dt, S, q) {
      const f = q.f;
      if (q.t < 0.1) { S.target = PO.crouch; S.rate = 50; p.vx = 0; return; }
      if (!q.go) { q.go = 1; p.vx = f * (13 + 4 * q.pw); p.vy = -7.5; p.onGround = false; S.carry = { vx: f * 11, t: 0.3 }; FK.whoosh(false, true); }
      S.target = PO.pounce; S.rate = 45;
      for (const e of box(p, f, -0.3, 1.2, 0.9)) {
        if (q.hits.has(e)) continue; q.hits.add(e);
        const w = S.wisps; S.wisps = 0;   // every wisp she carries goes off on the foe she lands on
        FK.hit(S, e, 3 + 2 * q.pw + 2.5 * w, { kx: f * (9 + 3 * w), ky: -8 - 2 * w, stun: 0.5, c: FORMS[0].c, big: true, stop: 0.08 + 0.03 * w }); FK.smack(true);
        if (w) { S.fx.push({ k: 'flash', x: ex(e), y: ey(e), R: 0.8 + 0.5 * w, c: '#7cf3ff', t: 0, life: 0.25 }); S.fx.push({ k: 'ring', x: ex(e), y: ey(e), R: 1.2 + 0.5 * w, c: '#7cf3ff', t: 0, life: 0.4 }); FK.label(S, p, 'FOXFIRE x' + w + '!', '#7cf3ff', true); FK.thud(w > 1); }
        p.vx = -f * 4; p.vy = -9; S.carry = null; S.seq = null; return;   // bounces off
      }
      if (q.t > 0.5 || (p.onGround && q.t > 0.2)) S.seq = null;
    },
    flip(p, dt, S, q) {
      const f = q.f;
      if (!q.go) {
        q.go = 1; p.vy = -14 - 2 * q.pw; p.onGround = false; FK.whoosh(true, true);
        for (let i = 0; i < S.wisps; i++) S.shots.push({ k: 'wisp', x: pcx(p), y: pcy(p), vx: (i - 1) * 5, vy: -9, t: 0, life: 1.6, dmg: 2.5, hits: new Set(), home: 1 });
        if (S.wisps) { FK.label(S, p, 'FOXFIRE!', '#7cf3ff', true); S.wisps = 0; }
      }
      S.target = PO.kick; S.rate = 45; S.rot = -FK.ease(Math.min(1, q.t / 0.36)) * Math.PI * 2 * f;
      if (q.t < 0.3) for (const e of FK.within(pcx(p) + f * 0.3, pcy(p) - 0.3, 1.25)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 3 + q.pw, { kx: f * 3, ky: -12, stun: 0.5, c: FORMS[0].c, big: true, stop: 0.07 }); FK.smack(true); }
      if (q.t > 0.38) { S.seq = null; S.rot = 0; }
    },
    // ---- owl
    darts(p, dt, S, q) {
      const f = q.f, n = 3 + Math.round(2 * q.pw);
      S.target = FK.keyed([[0, PO.dartA], [0.09, PO.dartA], [0.15, PO.dartB], [0.36, PO.dartB]], q.t); S.rate = 55;
      if (!p.onGround) p.vy = Math.min(p.vy, 1);
      while (q.t >= 0.11 + q.n * 0.045 && q.n < n) {
        const sp = (q.n - (n - 1) / 2) * 0.9; q.n++;
        S.shots.push({ k: 'dart', x: pcx(p) + f * 0.7, y: pcy(p) - 0.2, vx: f * 23, vy: sp, t: 0, life: 0.55 + 0.1 * q.pw, dmg: 1.4, pierce: q.pw > 0.3, hits: new Set() });
        FK.tone(1500 - q.n * 120, { dur: 0.07, vol: 0.07, slide: 700 });
      }
      if (q.t > 0.36) S.seq = null;
    },
    gust(p, dt, S, q) {
      const f = q.f;
      S.target = FK.keyed([[0, PO.gustA], [0.1, PO.gustA], [0.17, PO.gustB], [0.4, PO.gustB]], q.t); S.rate = 55;
      if (q.t >= 0.12 && !q.done) {
        q.done = 1;
        S.shots.push({ k: 'gust', x: pcx(p) + f * 0.8, y: pcy(p), vx: f * (11 + 3 * q.pw), vy: 0, t: 0, life: 0.6 + 0.2 * q.pw, dmg: 1, hits: new Set(), f });
        if (!FK.blocked(p.x - f * 0.2, p.y + 0.02, p.w, p.h - 0.04)) { p.vx = -f * 8; S.carry = { vx: -f * 7, t: 0.22 }; }
        FK.whoosh(false, true); FK.noise({ dur: 0.5, cut: 700, cutEnd: 2200, q: 2, vol: 0.2 });
      }
      if (q.t > 0.4) S.seq = null;
    },
    thermal(p, dt, S, q) {
      S.target = PO.soar; S.rate = 40;
      if (!q.done) {
        q.done = 1;
        const fy = FK.floorAt(pcx(p), p.y + p.h - 0.4, 8);
        if (fy != null) { if (S.thermals.length >= 2) S.thermals.shift(); S.thermals.push({ x: pcx(p), fy, h: 6.5 + 2 * q.pw, w: 1.6, t: 0, life: 5 + 2 * q.pw, self: 0.5, cool: new Map() }); }
        p.vy = -15 - 2 * q.pw; p.onGround = false; FK.whoosh(true, true); FK.tone(330, { dur: 0.4, vol: 0.12, type: 'sine', slide: 990 });
      }
      if (q.t < 0.25) for (const e of FK.within(pcx(p), pcy(p) - 0.5, 1.2)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 2, { kx: 0, ky: -12, stun: 0.4, c: FORMS[1].c, big: true }); }
      if (q.t > 0.32) S.seq = null;
    },
    // ---- serpent
    spit(p, dt, S, q) {
      const f = q.f;
      S.target = FK.keyed([[0, PO.spitA], [0.12, PO.spitA], [0.18, PO.spitB], [0.38, PO.spitB]], q.t); S.rate = 55;
      if (!p.onGround) p.vy = Math.min(p.vy, 1);
      if (q.t >= 0.14 && !q.done) {
        q.done = 1;
        S.shots.push({ k: 'glob', x: pcx(p) + f * 0.6, y: pcy(p) - 0.4, vx: f * (9 + 5 * q.pw), vy: -6.5, g: 20, t: 0, life: 2.2, dmg: 2, hits: new Set(), pw: q.pw });
        FK.noise({ dur: 0.12, cut: 1800, cutEnd: 600, q: 4, vol: 0.2 }); FK.tone(300, { dur: 0.15, vol: 0.1, slide: 120 });
      }
      if (q.t > 0.38) S.seq = null;
    },
    lash(p, dt, S, q) {
      const f = q.f, R = 4.6 + 1.6 * q.pw;
      S.target = FK.keyed([[0, PO.lashA], [0.1, PO.lashA], [0.16, PO.lashB], [0.4, PO.lashB]], q.t); S.rate = 55;
      if (!p.onGround) p.vy = Math.min(p.vy, 1);
      if (q.t >= 0.12 && !q.done) {
        q.done = 1; FK.whoosh(false, true); FK.noise({ dur: 0.07, cut: 4200, q: 4, vol: 0.2, delay: 0.05 });
        let best = null, bd = 99;
        for (const e of box(p, f, 0, R, 1.0)) { const d = Math.abs(ex(e) - pcx(p)); if (d < bd) { bd = d; best = e; } }
        S.fx.push({ k: 'lash', x: pcx(p), y: pcy(p), f, len: best ? bd : R, t: 0, life: 0.28 });
        if (best) {
          // the tail wraps the foe and yanks it back to her feet, poisoned
          FK.hit(S, best, 2 + q.pw, { kx: -f * Math.min(22, 6 + bd * 4.2), ky: -5.5, stun: 0.7, c: FORMS[3].c, big: true, stop: 0.07 });
          venom(S, best, 3); FK.label(S, p, 'YANK!', FORMS[3].c, true);
        }
      }
      if (q.t > 0.4) S.seq = null;
    },
    spring(p, dt, S, q) {
      if (q.t < 0.12) { S.target = PO.coil; S.rate = 50; p.vx *= 0.8; if (p.vy < 0) p.vy = 0; return; }
      if (!q.go) {
        q.go = 1; p.vy = -19 - 3 * q.pw; p.onGround = false;
        FK.tone(200, { dur: 0.3, vol: 0.16, type: 'sine', slide: 1200 }); FK.whoosh(true, true);
        S.fx.push({ k: 'ring', x: pcx(p), y: p.y + p.h, R: 2.0, c: C_VENOM, t: 0, life: 0.4 });
        for (const e of FK.within(pcx(p), pcy(p), 2.0)) { FK.hit(S, e, 2, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 5, ky: -9, stun: 0.4, c: C_VENOM, big: true }); venom(S, e, 3); }
      }
      S.target = PO.spring; S.rate = 45;
      if (q.t > 0.34) S.seq = null;
    },
    // ---- dragon
    breath(p, dt, S, q) {
      const f = q.f, D = 0.7 + 0.6 * q.pw, R = 3.8 + 0.8 * q.pw;
      if (q.t < 0.12) { S.target = PO.inhale; S.rate = 45; if (!p.onGround) p.vy = Math.min(p.vy, 0.5); return; }
      S.target = pose(Object.assign({}, PO.breath, { y: PO.breath.y + Math.sin(q.t * 50) * 0.4 })); S.rate = 45;
      if (!p.onGround) { p.vy = Math.min(p.vy, 0.6); p.vx *= 0.9; }
      if (!q.snd) { q.snd = 1; FK.noise({ dur: D, cut: 500, cutEnd: 1500, q: 0.8, vol: 0.3 }); }
      const tick = Math.floor((q.t - 0.12) / 0.07);
      if (tick !== q.n) {
        q.n = tick;
        for (let i = 0; i < 3; i++) S.fx.push({ k: 'flame', x: pcx(p) + f * 0.7, y: pcy(p) - 0.25, vx: f * (9 + Math.random() * 7), vy: (Math.random() - 0.5) * 4.5 - 0.5, t: 0, life: 0.34 + Math.random() * 0.1, r: 0.2 + Math.random() * 0.2 });
        for (const e of box(p, f, 0.1, R, 1.0 + 0.25 * R * 0.3)) { FK.chip(S, e, 1.1, C_FIRE); if (!FK.inSmash() && !e._noKnockback) e.vx = f * 2.4; }   // a stream of ticks: it burns and nudges, it never launches
      }
      if (q.t > 0.12 + D) { for (const e of box(p, f, 0.1, R, 1.2)) FK.hit(S, e, 2, { kx: f * 8, ky: -6, stun: 0.4, c: C_FIRE, big: true }); S.seq = null; }   // a last puff that does knock back
    },
    rush(p, dt, S, q) {
      const f = q.f, D = 0.42 + 0.2 * q.pw;
      if (q.t < 0.1) { S.target = PO.inhale; S.rate = 50; p.vx = 0; p.vy = Math.min(p.vy, 0); return; }
      S.target = PO.rush; S.rate = 50; S.selfMove = true;
      if (!q.snd) { q.snd = 1; FK.whoosh(false, true); FK.noise({ dur: D, cut: 900, cutEnd: 2400, q: 1, vol: 0.26 }); }
      p.vy = 0; p.onGround = false;   // true flight: straight ahead, no drop
      if (!FK.moveX(p, f * (17 + 4 * q.pw) * dt)) { S.seq = null; FK.thud(false); return; }
      p.vx = f * 6;
      if (Math.floor(q.t * 40) !== q.d) { q.d = Math.floor(q.t * 40); S.fx.push({ k: 'flame', x: pcx(p) - f * 0.5, y: pcy(p) + (Math.random() - 0.5) * 0.6, vx: -f * 3, vy: -1, t: 0, life: 0.35, r: 0.3 }); }
      for (const e of FK.within(pcx(p) + f * 0.4, pcy(p), 1.15)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 4 + 2 * q.pw, { kx: f * 11, ky: -7, stun: 0.5, c: C_FIRE, big: true, stop: 0.08 }); FK.smack(true); }
      if (q.t > 0.1 + D) { S.seq = null; S.carry = { vx: f * 7, t: 0.25 }; }
    },
    pillar(p, dt, S, q) {
      S.target = PO.flap; S.rate = 40;
      if (!q.done) {
        q.done = 1; const H = 4.5 + 1.5 * q.pw;
        p.vy = -14 - 2 * q.pw; p.onGround = false;
        S.fx.push({ k: 'pillar', x: pcx(p), y: p.y + p.h, h: H, t: 0, life: 0.6 });
        FK.thud(true); FK.noise({ dur: 0.6, cut: 400, cutEnd: 2000, q: 0.8, vol: 0.32 }); FK.shake(6);
        for (const e of FK.foes()) if (Math.abs(ex(e) - pcx(p)) < 1.15 && ey(e) < p.y + p.h + 0.4 && ey(e) > p.y + p.h - H) FK.hit(S, e, 5 + 2 * q.pw, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 3, ky: -15, stun: 0.6, c: C_FIRE, big: true, stop: 0.09 });
      }
      if (q.t > 0.34) S.seq = null;
    },
    // ---- turtle
    bash(p, dt, S, q) {
      const f = q.f, H = 0.2 + 0.25 * q.pw;
      if (q.t < H) { const u = q.t / H; S.target = pose(Object.assign({}, PO.bashA, { x: Math.sin(q.t * 70) * 0.4 * u * q.pw })); S.rate = 22; if (!p.onGround) p.vy = Math.min(p.vy, 1); return; }
      const t = q.t - H;
      S.target = t < 0.22 ? PO.bashB : PO.idle; S.rate = 60;
      if (t < 0.12) { FK.moveX(p, f * (11 + 5 * q.pw) * dt); if (!q.snd) { q.snd = 1; FK.whoosh(false, true); } }
      if (t < 0.18) for (const e of box(p, f, -0.2, 1.4, 0.9)) {
        if (q.hits.has(e)) continue; q.hits.add(e);
        FK.hit(S, e, 4 + 2 * q.pw, { kx: f * (9 + 4 * q.pw), ky: -7, stun: 0.55, c: FORMS[2].c, big: true, stop: 0.1, shake: 7 }); FK.thud(false);
        FK.heal(S, p, 1.1 + 0.6 * q.pw, C_MEND); S.fx.push({ k: 'mend', x: pcx(p), y: pcy(p), t: 0, life: 0.6 });
      }
      if (t > 0.36) S.seq = null;
    },
    slide(p, dt, S, q) {
      const f = q.f, D = 0.5 + 0.2 * q.pw;
      S.target = PO.shell; S.rate = 45; S.rot = q.t * 22 * f; S.selfMove = true;
      p._armorT = Math.max(p._armorT || 0, 0.1);
      if (!q.snd) { q.snd = 1; FK.noise({ dur: D, cut: 500, cutEnd: 1400, q: 2, vol: 0.18 }); }
      const sp = (12 + 3 * q.pw) * (1 - 0.4 * q.t / D);
      if (!FK.moveX(p, f * sp * dt)) { q.f = -f; FK.thud(false); q.hits = new Set(); }   // bounces off walls
      p.vx = f * sp * 0.3;
      for (const e of FK.within(pcx(p), pcy(p) + 0.1, 1.0)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 2 + q.pw, { kx: f * 6, ky: -8, stun: 0.45, c: FORMS[2].c, big: true }); FK.smack(false); }
      if (q.t > D) { S.seq = null; S.rot = 0; }
    },
    geyser(p, dt, S, q) {
      S.target = PO.spout; S.rate = 40;
      if (!q.done) {
        q.done = 1; p.vy = -13.5 - 2 * q.pw; p.onGround = false;
        S.fx.push({ k: 'spout', x: pcx(p), y: p.y + p.h, h: 3.2 + q.pw, t: 0, life: 0.55 });
        FK.noise({ dur: 0.5, cut: 500, cutEnd: 2600, q: 1.5, vol: 0.26 });
        for (const e of FK.foes()) if (Math.abs(ex(e) - pcx(p)) < 1.0 && ey(e) < p.y + p.h + 0.3 && ey(e) > p.y - 3.2 - q.pw) FK.hit(S, e, 3 + q.pw, { kx: 0, ky: -13, stun: 0.5, c: FORMS[2].c, big: true });
      }
      if (q.t > 0.34) S.seq = null;
    },
    // ---------------------------------------------------------------- CHARGED MOVES (hold S)
    // Not the same move made bigger: every mask has three charged moves of its own.
    // ---- fox
    flurryX(p, dt, S, q) {   // NINE-TAIL STORM: she tears forward through everyone, nine cuts on both sides, and ends in a spin that leaves her with three wisps
      const f = q.f, i = Math.floor(q.t / 0.045);
      if (q.t < 0.42) {
        S.target = i % 2 ? PO.clawB : PO.clawA; S.rate = 80; S.selfMove = true;
        FK.moveX(p, f * 11 * dt); if (!p.onGround) p.vy = Math.min(p.vy, 0.5);
        while (q.n <= i && q.n < 9) {
          q.n++; const side = q.n % 2 ? 1 : -1;
          S.fx.push({ k: 'claw', x: pcx(p) + f * side * 0.9, y: pcy(p) + (q.n % 3 - 1) * 0.3, f: f * side, up: q.n % 2, t: 0, life: 0.18 });
          FK.noise({ dur: 0.04, cut: 3800, q: 3, vol: 0.1 });
          for (const e of FK.within(pcx(p), pcy(p), 1.7)) FK.hit(S, e, 0.9, { kx: f * 1.5, ky: -1.5, stun: 0.3, c: FORMS[0].c });
        }
        return;
      }
      S.target = PO.spinB; S.rate = 50; S.rot = FK.ease((q.t - 0.42) / 0.22) * Math.PI * 2 * f;
      if (!q.fin) {
        q.fin = 1; S.wisps = 3; FK.whoosh(false, true);
        S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 2.3, c: FORMS[0].c, t: 0, life: 0.4 });
        for (const e of FK.within(pcx(p), pcy(p), 2.2)) FK.hit(S, e, 3.5, { kx: (Math.sign(ex(e) - pcx(p)) || f) * 11, ky: -8, stun: 0.5, c: FORMS[0].c, big: true, stop: 0.09 });
      }
      if (q.t > 0.66) { S.seq = null; S.rot = 0; }
    },
    pounceX(p, dt, S, q) {   // FOXFIRE COMET: wrapped in blue fire she goes THROUGH everyone instead of bouncing off, and blows up where she lands
      const f = q.f;
      if (q.t < 0.14) { S.target = PO.crouch; S.rate = 50; p.vx = 0; return; }
      if (!q.go) { q.go = 1; q.w = S.wisps; S.wisps = 0; p.vx = f * 18; p.vy = -7; p.onGround = false; S.carry = { vx: f * 16, t: 0.45 }; FK.whoosh(false, true); FK.noise({ dur: 0.5, cut: 1200, cutEnd: 3000, q: 1, vol: 0.24 }); }
      S.target = PO.pounce; S.rate = 45; S.comet = 0.1;
      if (Math.floor(q.t * 50) !== q.d) { q.d = Math.floor(q.t * 50); S.fx.push({ k: 'flame', blue: 1, x: pcx(p) - f * 0.4, y: pcy(p) + (Math.random() - 0.5) * 0.7, vx: -f * 4, vy: -1, t: 0, life: 0.35, r: 0.34 }); }
      for (const e of FK.within(pcx(p) + f * 0.3, pcy(p), 1.3)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 5 + 2 * q.w, { kx: f * 6, ky: -11, stun: 0.6, c: '#7cf3ff', big: true, stop: 0.07 }); FK.smack(true); }
      if (q.t > 0.75 || (p.onGround && q.t > 0.25)) {
        S.seq = null; S.carry = null; p.vx *= 0.3; FK.thud(true); FK.shake(7);
        S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 2.4, c: '#7cf3ff', t: 0, life: 0.45 }); S.fx.push({ k: 'flash', x: pcx(p), y: pcy(p), R: 1.5, c: '#7cf3ff', t: 0, life: 0.25 });
        for (const e of FK.within(pcx(p), pcy(p), 2.3)) FK.hit(S, e, 3, { kx: (Math.sign(ex(e) - pcx(p)) || f) * 8, ky: -9, stun: 0.5, c: '#7cf3ff', big: true });
      }
    },
    flipX(p, dt, S, q) {   // MOONSAULT: twice as high, then a diving kick that spikes and cracks the floor
      const f = q.f;
      if (!q.go) { q.go = 1; p.vy = -19; p.onGround = false; FK.whoosh(true, true); }
      if (!q.dive) {
        S.target = PO.kick; S.rate = 45; S.rot = -q.t * 16 * f;
        for (const e of FK.within(pcx(p), pcy(p) - 0.3, 1.25)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 3, { kx: f * 2, ky: -14, stun: 0.5, c: FORMS[0].c, big: true }); }
        if (p.vy >= -1 || q.t > 0.6) { q.dive = 1; q.hits = new Set(); S.rot = 0; FK.whoosh(false, true); }
        return;
      }
      S.target = PO.pounce; S.rate = 50; S.rot = 0.9 * f; p.vy = 25; p.vx = f * 10;
      for (const e of FK.within(pcx(p) + f * 0.3, pcy(p) + 0.4, 1.2)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 5, { kx: f * 4, ky: 14, stun: 0.6, c: FORMS[0].c, big: true, stop: 0.1 }); FK.smack(true); }
      if (p.onGround || q.t > 2) {
        S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: 1.8, t: 0, life: 0.4, c: FORMS[0].c }); FK.thud(true); FK.shake(7);
        for (const e of FK.within(pcx(p), p.y + p.h - 0.3, 1.8)) { if (q.hits.has(e)) continue; FK.hit(S, e, 3, { kx: (Math.sign(ex(e) - pcx(p)) || f) * 6, ky: -10, stun: 0.5, c: FORMS[0].c, big: true }); }
        S.seq = null; S.rot = 0; p.vx = 0;
      }
    },
    // ---- owl
    dartsX(p, dt, S, q) {   // FEATHER STORM: she throws them up, and they rain down along the whole stretch ahead of her
      const f = q.f;
      S.target = FK.keyed([[0, PO.dartA], [0.14, PO.dartA], [0.22, PO.soar], [0.5, PO.soar]], q.t); S.rate = 50;
      if (!p.onGround) p.vy = Math.min(p.vy, 0.8);
      if (q.t >= 0.16 && !q.done) {
        q.done = 1; FK.whoosh(true, true);
        for (let i = 0; i < 10; i++) S.shots.push({ k: 'quill', x: pcx(p) + f * (1.2 + i * 1.0) + (Math.random() - 0.5) * 0.5, y: pcy(p) - 7, vx: f * 2.5, vy: 24, wait: 0.2 + i * 0.05, t: 0, life: 0.6, dmg: 2, hits: new Set() });
      }
      if (q.t > 0.5) S.seq = null;
    },
    gustX(p, dt, S, q) {   // TORNADO: a twister that walks away from her, drags foes in and keeps throwing them up. She can ride it too
      const f = q.f;
      S.target = FK.keyed([[0, PO.gustA], [0.16, PO.gustA], [0.24, PO.gustB], [0.5, PO.gustB]], q.t); S.rate = 55;
      if (q.t >= 0.18 && !q.done) {
        q.done = 1;
        const fy = FK.floorAt(pcx(p) + f * 1.2, p.y + p.h - 0.6, 8);
        if (fy != null) S.zones.push({ k: 'twister', x: pcx(p) + f * 1.2, fy, dir: f, t: 0, life: 3.2, cool: new Map(), self: 0.6 });
        FK.noise({ dur: 1.2, cut: 500, cutEnd: 1800, q: 1.5, vol: 0.26 }); FK.whoosh(false, true);
      }
      if (q.t > 0.5) S.seq = null;
    },
    thermalX(p, dt, S, q) {   // SKY CYCLONE: a huge thermal that lasts, and everyone near her is carried up with her
      S.target = PO.soar; S.rate = 40;
      if (!q.done) {
        q.done = 1;
        const fy = FK.floorAt(pcx(p), p.y + p.h - 0.4, 8);
        if (fy != null) { if (S.thermals.length >= 2) S.thermals.shift(); S.thermals.push({ x: pcx(p), fy, h: 11, w: 2.6, t: 0, life: 9, self: 0.5, cool: new Map() }); }
        p.vy = -19; p.onGround = false; FK.whoosh(true, true); FK.tone(220, { dur: 0.6, vol: 0.14, type: 'sine', slide: 1100 });
        S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 2.8, c: FORMS[1].c, t: 0, life: 0.45 });
        for (const e of FK.within(pcx(p), pcy(p), 2.7)) FK.hit(S, e, 3, { kx: 0, ky: -17, stun: 0.6, c: FORMS[1].c, big: true });
      }
      if (q.t > 0.36) S.seq = null;
    },
    // ---- turtle
    bashX(p, dt, S, q) {   // TIDAL BASH: the headbutt throws a wave along the floor, and every foe the wave hits mends her
      const f = q.f, H = 0.34;
      if (q.t < H) { S.target = pose(Object.assign({}, PO.bashA, { x: Math.sin(q.t * 70) * 0.5 * q.t / H })); S.rate = 22; if (!p.onGround) p.vy = Math.min(p.vy, 1); return; }
      const t = q.t - H;
      S.target = t < 0.22 ? PO.bashB : PO.idle; S.rate = 60;
      if (t < 0.12) FK.moveX(p, f * 14 * dt);
      if (!q.wv) {
        q.wv = 1; FK.whoosh(false, true); FK.noise({ dur: 0.8, cut: 400, cutEnd: 1400, q: 0.8, vol: 0.3 });
        const fy = FK.floorAt(pcx(p) + f * 0.8, p.y + p.h - 0.6, 8);
        if (fy != null) S.zones.push({ k: 'wave', x: pcx(p) + f * 0.8, fy, dir: f, t: 0, life: 1.0, hits: new Set() });
      }
      if (t < 0.18) for (const e of box(p, f, -0.2, 1.5, 0.9)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 6, { kx: f * 13, ky: -8, stun: 0.6, c: FORMS[2].c, big: true, stop: 0.11, shake: 8 }); FK.thud(true); FK.heal(S, p, 1.6, C_MEND); S.fx.push({ k: 'mend', x: pcx(p), y: pcy(p), t: 0, life: 0.6 }); }
      if (t > 0.4) S.seq = null;
    },
    slideX(p, dt, S, q) {   // SHELL PINBALL: a long slide that hops, and gets faster off every wall
      const D = 1.4;
      S.target = PO.shell; S.rate = 45; S.rot = q.t * 30 * q.f; S.selfMove = true;
      p._armorT = Math.max(p._armorT || 0, 0.1);
      if (!q.sp) { q.sp = 14; FK.noise({ dur: D, cut: 500, cutEnd: 1600, q: 2, vol: 0.18 }); }
      if (!FK.moveX(p, q.f * q.sp * dt)) { q.f = -q.f; q.sp = Math.min(26, q.sp + 4); q.hits = new Set(); p.vy = -8; p.onGround = false; FK.thud(false); FK.tone(300 + q.sp * 20, { dur: 0.1, vol: 0.12, type: 'square' }); S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 1.0, c: FORMS[2].c, t: 0, life: 0.25 }); }
      if (p.onGround && q.t > 0.1 && Math.floor(q.t * 2.5) !== q.hop) { q.hop = Math.floor(q.t * 2.5); p.vy = -7; p.onGround = false; }
      p.vx = q.f * q.sp * 0.3;
      for (const e of FK.within(pcx(p), pcy(p) + 0.1, 1.05)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 2 + q.sp * 0.15, { kx: q.f * (5 + q.sp * 0.3), ky: -9, stun: 0.5, c: FORMS[2].c, big: true }); FK.smack(true); }
      if (q.t > D) { S.seq = null; S.rot = 0; }
    },
    geyserX(p, dt, S, q) {   // HOT SPRING: the geyser leaves a warm pool behind. Standing in it mends her
      S.target = PO.spout; S.rate = 40;
      if (!q.done) {
        q.done = 1; const fy = FK.floorAt(pcx(p), p.y + p.h - 0.4, 8);
        p.vy = -16; p.onGround = false;
        S.fx.push({ k: 'spout', x: pcx(p), y: p.y + p.h, h: 5, t: 0, life: 0.65 });
        FK.noise({ dur: 0.7, cut: 400, cutEnd: 2600, q: 1.5, vol: 0.3 });
        for (const e of FK.foes()) if (Math.abs(ex(e) - pcx(p)) < 1.2 && ey(e) < p.y + p.h + 0.3 && ey(e) > p.y - 5) FK.hit(S, e, 4, { kx: 0, ky: -15, stun: 0.6, c: FORMS[2].c, big: true });
        if (fy != null) { for (let i = S.zones.length - 1; i >= 0; i--) if (S.zones[i].k === 'spa') S.zones.splice(i, 1); S.zones.push({ k: 'spa', x: pcx(p), fy, w: 2.8, t: 0, life: 7, tick: 0.5 }); }
      }
      if (q.t > 0.36) S.seq = null;
    },
    // ---- serpent
    spitX(p, dt, S, q) {   // VENOM RAIN: three globs at three distances, three pools
      const f = q.f;
      S.target = FK.keyed([[0, PO.spitA], [0.2, PO.spitA], [0.27, PO.spitB], [0.5, PO.spitB]], q.t); S.rate = 55;
      if (!p.onGround) p.vy = Math.min(p.vy, 1);
      if (q.t >= 0.22 && !q.done) {
        q.done = 1;
        for (let i = 0; i < 3; i++) S.shots.push({ k: 'glob', x: pcx(p) + f * 0.6, y: pcy(p) - 0.4, vx: f * (5 + i * 5), vy: -8.5 + i * 0.6, g: 20, t: 0, life: 2.4, dmg: 2, hits: new Set(), pw: 0 });
        FK.noise({ dur: 0.2, cut: 1800, cutEnd: 500, q: 4, vol: 0.24 });
      }
      if (q.t > 0.5) S.seq = null;
    },
    lashX(p, dt, S, q) {   // CONSTRICT: the tail catches a far foe, drags it in, squeezes the life out of it into her, and throws it over her head
      const f = q.f, R = 6.6;
      if (!p.onGround) p.vy = Math.min(p.vy, 0.8);
      if (!q.done) {
        S.target = q.t < 0.14 ? PO.lashA : PO.lashB; S.rate = 55;
        if (q.t < 0.16) return;
        q.done = 1; FK.whoosh(false, true);
        let best = null, bd = 99;
        for (const e of box(p, f, 0, R, 1.1)) { const d = Math.abs(ex(e) - pcx(p)); if (d < bd) { bd = d; best = e; } }
        S.fx.push({ k: 'lash', x: pcx(p), y: pcy(p), f, len: best ? bd : R, t: 0, life: 0.28 });
        if (!best) { q.miss = q.t; return; }
        q.grab = best; q.g0 = q.t; q.n = 0; venom(S, best, 4); FK.label(S, p, 'CAUGHT!', FORMS[3].c, true);
        return;
      }
      if (q.miss != null) { if (q.t > q.miss + 0.25) S.seq = null; return; }
      const e = q.grab, t = q.t - q.g0;
      if (!e || e.dead) { S.seq = null; return; }
      S.target = PO.lashB; S.rate = 40; S.coilT = 0.1; S.coilE = e;
      const hold = !FK.inSmash() && !e._noKnockback;
      if (hold) { e.x += ((pcx(p) + f * 1.0 - (e.w || 0.9) / 2) - e.x) * Math.min(1, dt * 14); e.y += ((p.y + p.h - (e.h || 0.9)) - e.y) * Math.min(1, dt * 14); e.vx = 0; e.vy = 0; }
      e.stunTimer = Math.max(e.stunTimer || 0, 0.3);
      while (q.n < 5 && t > 0.2 + q.n * 0.16) { q.n++; FK.chip(S, e, 1, C_VENOM); FK.heal(S, p, 0.45, C_MEND); S.fx.push({ k: 'mend', x: pcx(p), y: pcy(p), t: 0, life: 0.5 }); FK.tone(300 + q.n * 60, { dur: 0.08, vol: 0.1, type: 'square' }); }
      if (t > 1.1) { FK.hit(S, e, 3, { kx: -f * 13, ky: -11, stun: 0.6, c: FORMS[3].c, big: true, stop: 0.1 }); FK.label(S, p, 'THROWN!', FORMS[3].c, true); S.seq = null; }
    },
    springX(p, dt, S, q) {   // HYDRA BURST: the highest jump of all, and at the top five globs of venom rain down
      if (q.t < 0.18) { S.target = PO.coil; S.rate = 50; p.vx *= 0.8; if (p.vy < 0) p.vy = 0; return; }
      if (!q.go) { q.go = 1; p.vy = -22; p.onGround = false; FK.tone(180, { dur: 0.4, vol: 0.16, type: 'sine', slide: 1400 }); FK.whoosh(true, true);
        for (const e of FK.within(pcx(p), pcy(p), 2.0)) { FK.hit(S, e, 2, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 5, ky: -9, stun: 0.4, c: C_VENOM, big: true }); venom(S, e, 3); } }
      S.target = PO.spring; S.rate = 45;
      if (!q.rain && (p.vy > -4 || q.t > 0.7)) {
        q.rain = 1; FK.noise({ dur: 0.25, cut: 1600, cutEnd: 500, q: 3, vol: 0.24 });
        for (let i = 0; i < 5; i++) S.shots.push({ k: 'glob', x: pcx(p), y: pcy(p), vx: (i - 2) * 4.5, vy: 2, g: 20, t: 0, life: 2.4, dmg: 2, hits: new Set(), pw: 0 });
      }
      if (q.rain && q.t > 0.5) S.seq = null;
      if (q.t > 1.2) S.seq = null;
    },
    // ---- dragon
    breathX(p, dt, S, q) {   // INFERNO BEAM: one long narrow beam that reaches across the screen and goes through everyone
      const f = q.f, D = 1.0;
      if (q.t < 0.28) { S.target = pose(Object.assign({}, PO.inhale, { x: Math.sin(q.t * 80) * 0.4 })); S.rate = 40; if (!p.onGround) p.vy = Math.min(p.vy, 0.3); return; }
      S.target = pose(Object.assign({}, PO.breath, { x: Math.sin(q.t * 90) * 0.3 })); S.rate = 45;
      if (!p.onGround) { p.vy = Math.min(p.vy, 0.3); }
      if (!q.snd) { q.snd = 1; FK.noise({ dur: D, cut: 300, cutEnd: 900, q: 0.6, vol: 0.4 }); FK.tone(90, { type: 'sawtooth', dur: D, vol: 0.14, slide: 60 }); }
      const x0 = pcx(p) + f * 0.8, y0 = pcy(p) - 0.25; let len = 0;
      while (len < 16 && !FK.blocked(x0 + f * len - 0.05, y0 - 0.05, 0.1, 0.1)) len += 0.5;
      S.beam = { x: x0, y: y0, f, len, t: 0.1 };
      FK.moveX(p, -f * 1.6 * dt); FK.shake(3);
      const tick = Math.floor((q.t - 0.28) / 0.09);
      if (tick !== q.n) { q.n = tick; for (const e of box(p, f, 0.3, len + 0.8, 0.55)) { FK.chip(S, e, 1.6, C_FIRE); if (!FK.inSmash() && !e._noKnockback) e.vx = f * 3.5; } }
      if (q.t > 0.28 + D) { for (const e of box(p, f, 0.3, (S.beam ? S.beam.len : 4) + 0.8, 0.55)) FK.hit(S, e, 3, { kx: f * 11, ky: -6, stun: 0.5, c: C_FIRE, big: true }); S.seq = null; }   // the last of the beam is the one real hit
    },
    rushX(p, dt, S, q) {   // FIRESTORM RUSH: a long flight that sets the floor under her alight all the way, and ends in a blast
      const f = q.f, D = 0.75;
      if (q.t < 0.14) { S.target = PO.inhale; S.rate = 50; p.vx = 0; p.vy = Math.min(p.vy, 0); return; }
      S.target = PO.rush; S.rate = 50; S.selfMove = true; p.vy = 0; p.onGround = false;
      if (!q.snd) { q.snd = 1; FK.whoosh(false, true); FK.noise({ dur: D, cut: 700, cutEnd: 2600, q: 1, vol: 0.3 }); }
      const blocked = !FK.moveX(p, f * 19 * dt);
      p.vx = f * 6;
      if (Math.floor(q.t * 14) !== q.d) {
        q.d = Math.floor(q.t * 14);
        const fy = FK.floorAt(pcx(p), p.y + p.h - 0.2, 7);
        if (fy != null) S.zones.push({ k: 'fire', x: pcx(p), fy, t: 0, life: 3.2, cool: new Map() });
      }
      S.fx.push({ k: 'flame', x: pcx(p) - f * 0.5, y: pcy(p) + (Math.random() - 0.5) * 0.7, vx: -f * 3, vy: -1, t: 0, life: 0.35, r: 0.34 });
      for (const e of FK.within(pcx(p) + f * 0.4, pcy(p), 1.2)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 4, { kx: f * 8, ky: -8, stun: 0.5, c: C_FIRE, big: true, stop: 0.06 }); FK.smack(true); }
      if (blocked || q.t > 0.14 + D) {
        S.seq = null; S.carry = { vx: f * 5, t: 0.2 }; FK.thud(true); FK.shake(8);
        S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 2.4, c: C_FIRE, t: 0, life: 0.45 }); S.fx.push({ k: 'flash', x: pcx(p), y: pcy(p), R: 1.6, c: C_FIRE, t: 0, life: 0.25 });
        for (const e of FK.within(pcx(p), pcy(p), 2.3)) FK.hit(S, e, 4, { kx: (Math.sign(ex(e) - pcx(p)) || f) * 9, ky: -10, stun: 0.5, c: C_FIRE, big: true });
      }
    },
    pillarX(p, dt, S, q) {   // ERUPTION: the pillar under her, then two more on each side, marching outwards
      S.target = PO.flap; S.rate = 40;
      if (!q.done) {
        q.done = 1; const x0 = pcx(p), fy0 = p.y + p.h;
        p.vy = -15; p.onGround = false; FK.shake(8);
        const erupt = (x, y) => {
          const fy = FK.floorAt(x, y - 1.2, 6); if (fy == null) return;
          S.fx.push({ k: 'pillar', x, y: fy, h: 5, t: 0, life: 0.6 }); FK.thud(true); FK.noise({ dur: 0.5, cut: 400, cutEnd: 2000, q: 0.8, vol: 0.28 });
          for (const e of FK.foes()) if (Math.abs(ex(e) - x) < 1.15 && ey(e) < fy + 0.4 && ey(e) > fy - 5) FK.hit(S, e, 5, { kx: (Math.sign(ex(e) - x) || 1) * 3, ky: -15, stun: 0.6, c: C_FIRE, big: true, stop: 0.06 });
        };
        S.fx.push({ k: 'pillar', x: x0, y: fy0, h: 6, t: 0, life: 0.6 }); FK.thud(true);
        for (const e of FK.foes()) if (Math.abs(ex(e) - x0) < 1.15 && ey(e) < fy0 + 0.4 && ey(e) > fy0 - 6) FK.hit(S, e, 6, { kx: 0, ky: -16, stun: 0.6, c: C_FIRE, big: true, stop: 0.09 });
        for (let i = 1; i <= 2; i++) for (const sd of [-1, 1]) S.timers.push({ t: i * 0.2, fn: () => erupt(x0 + sd * i * 2.0, fy0) });
      }
      if (q.t > 0.36) S.seq = null;
    },
  };
  const KIT = { fox: ['flurry', 'pounce', 'flip'], owl: ['darts', 'gust', 'thermal'], turtle: ['bash', 'slide', 'geyser'], serpent: ['spit', 'lash', 'spring'], dragon: ['breath', 'rush', 'pillar'] };
  // poison: a foe keeps taking small hits for a while, and each one mends her
  function venom(S, e, secs) { const v = S.venom.get(e); if (v) v.left = Math.max(v.left, secs); else S.venom.set(e, { left: secs, tick: 0.5 }); }
  const NAMES = { flurry: 'FOX FLURRY', pounce: 'POUNCE', flip: 'FLIP KICK', darts: 'FEATHER DARTS', gust: 'GUST', thermal: 'THERMAL', bash: 'SHELL BASH', slide: 'SHELL SLIDE', geyser: 'GEYSER', spit: 'VENOM SPIT', lash: 'TAIL LASH', spring: 'SPRING COIL', breath: 'FIRE BREATH', rush: 'DRAGON RUSH', pillar: 'FLAME PILLAR' };
  const BIG = { flurry: 'NINE-TAIL STORM', pounce: 'FOXFIRE COMET', flip: 'MOONSAULT', darts: 'FEATHER STORM', gust: 'TORNADO', thermal: 'SKY CYCLONE', bash: 'TIDAL BASH', slide: 'SHELL PINBALL', geyser: 'HOT SPRING', spit: 'VENOM RAIN', lash: 'CONSTRICT', spring: 'HYDRA BURST', breath: 'INFERNO BEAM', rush: 'FIRESTORM RUSH', pillar: 'ERUPTION' };
  function use(slot) {
    return (p, f, pw, S) => {
      const kind = KIT[form(S).id][slot], big = pw > 0.3;   // held S: the mask's charged move, a different move altogether
      if (slot === 2) S.airUp = true;
      startSeq(S, big ? kind + 'X' : kind, { f, pw });
      return big ? BIG[kind] : NAMES[kind];
    };
  }
  const dance = (p, f, pw, S) => { startSeq(S, 'dance', { f, pw }); return 'MASK DANCE'; };

  function stepWorld(p, dt, S, k) {
    const foes = FK.foes();
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const b = S.shots[i];
      if (b.wait > 0) { b.wait -= dt; continue; }
      b.t += dt;
      if (b.g) b.vy += b.g * dt;
      if (b.home) {   // foxfire: curls toward the nearest foe
        let tg = null, td = 12; for (const e of foes) { const d = Math.hypot(ex(e) - b.x, ey(e) - b.y); if (d < td) { td = d; tg = e; } }
        if (tg && b.t > 0.15) { const dx = ex(tg) - b.x, dy = ey(tg) - b.y, d = Math.hypot(dx, dy) || 1; b.vx += (dx / d * 17 - b.vx) * Math.min(1, dt * 7); b.vy += (dy / d * 17 - b.vy) * Math.min(1, dt * 7); }
        else b.vy += 6 * dt;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const wall = FK.blocked(b.x - 0.08, b.y - 0.08, 0.16, 0.16);
      if (b.k === 'glob' && (wall || b.t >= b.life)) {   // splashes into a pool on the floor under it
        const fy = FK.floorAt(b.x - Math.sign(b.vx) * 0.2, b.y - 0.6, 5);
        if (fy != null) { if (S.pools.length >= 3) S.pools.shift(); S.pools.push({ x: b.x - Math.sign(b.vx) * 0.2, fy, w: 2.4 + 0.8 * (b.pw || 0), t: 0, life: 5 + 2 * (b.pw || 0) }); }
        FK.noise({ dur: 0.15, cut: 900, cutEnd: 300, q: 2, vol: 0.2 }); S.shots.splice(i, 1); continue;
      }
      let gone = b.t >= b.life || wall;
      if (!gone) for (const e of foes) {
        if (b.hits.has(e)) continue;
        const rx = b.k === 'gust' ? 0.7 : 0.25, ry = b.k === 'gust' ? 1.2 : 0.25;
        if (Math.abs(ex(e) - b.x) < rx + (e.w || 0.9) / 2 && Math.abs(ey(e) - b.y) < ry + (e.h || 0.9) / 2) {
          b.hits.add(e);
          if (b.k === 'gust') FK.hit(S, e, b.dmg, { kx: b.f * 13, ky: -4, stun: 0.4, c: FORMS[1].c });
          else if (b.k === 'quill') { FK.hit(S, e, b.dmg, { kx: Math.sign(b.vx) * 2, ky: 6, stun: 0.35, c: FORMS[1].c, big: true }); FK.smack(false); gone = true; break; }
          else if (b.k === 'glob') { FK.hit(S, e, b.dmg, { kx: Math.sign(b.vx) * 3, ky: -4, stun: 0.35, c: C_VENOM, big: true }); venom(S, e, 4); b.life = 0; b.t = 1; break; }
          else if (b.k === 'wisp') { FK.hit(S, e, b.dmg, { kx: Math.sign(b.vx || 1) * 5, ky: -6, stun: 0.4, c: '#7cf3ff', big: true }); S.fx.push({ k: 'ring', x: ex(e), y: ey(e), R: 1.0, c: '#7cf3ff', t: 0, life: 0.3 }); FK.smack(true); gone = true; break; }
          else { FK.hit(S, e, b.dmg, { kx: Math.sign(b.vx) * 3, ky: -2, stun: 0.25, c: FORMS[1].c }); FK.smack(false); if (!b.pierce) { gone = true; break; } }
        }
      }
      if (gone) S.shots.splice(i, 1);
    }
    for (let i = S.timers.length - 1; i >= 0; i--) { const tm = S.timers[i]; tm.t -= dt; if (tm.t <= 0) { S.timers.splice(i, 1); tm.fn(); } }
    if (S.beam) { S.beam.t -= dt; if (S.beam.t <= 0) S.beam = null; }
    if (S.comet > 0) S.comet -= dt;
    if (S.coilT > 0) { S.coilT -= dt; if (S.coilT <= 0) S.coilE = null; }
    // what the charged moves leave on the stage
    for (let i = S.zones.length - 1; i >= 0; i--) {
      const z = S.zones[i]; z.t += dt;
      let gone = z.t > z.life;
      if (z.cool) for (const [e, c] of z.cool) { if (c - dt <= 0) z.cool.delete(e); else z.cool.set(e, c - dt); }
      if (z.k === 'twister') {
        z.x += z.dir * 3.4 * dt; z.self -= dt;
        if (FK.blocked(z.x - 0.1, z.fy - 0.7, 0.2, 0.4)) z.dir = -z.dir;
        for (const e of foes) { const dx = z.x - ex(e); if (Math.abs(dx) < 2.6 && ey(e) < z.fy + 0.3 && ey(e) > z.fy - 5) { if (!e._noKnockback) e.vx = (e.vx || 0) + Math.sign(dx) * 26 * dt; if (Math.abs(dx) < 1.0 && !z.cool.has(e)) { z.cool.set(e, 0.4); FK.hit(S, e, 1.3, { kx: Math.sign(dx) * 2, ky: -10, stun: 0.4, c: FORMS[1].c }); } } }
        if (z.self <= 0 && !k.down && Math.abs(pcx(p) - z.x) < 0.9 && p.y + p.h > z.fy - 4 && p.y < z.fy + 0.1) { z.self = 0.5; p.vy = -14; p.onGround = false; S.airUp = false; }
      } else if (z.k === 'wave') {
        z.x += z.dir * 13 * dt;
        if (FK.blocked(z.x - 0.1, z.fy - 0.7, 0.2, 0.4) || !FK.blocked(z.x - 0.1, z.fy + 0.1, 0.2, 0.2)) gone = true;
        for (const e of foes) if (!z.hits.has(e) && Math.abs(ex(e) - z.x) < 0.9 && e.y + (e.h || 0.9) > z.fy - 2.2 && e.y < z.fy + 0.2) { z.hits.add(e); FK.hit(S, e, 3, { kx: z.dir * 10, ky: -7, stun: 0.5, c: FORMS[2].c, big: true }); FK.heal(S, p, 0.9, C_MEND); }
      } else if (z.k === 'spa') {
        z.tick -= dt;
        if (z.tick <= 0) { z.tick = 0.5; if (Math.abs(pcx(p) - z.x) < z.w / 2 && Math.abs(p.y + p.h - z.fy) < 0.5) { FK.heal(S, p, 0.5, C_MEND); S.fx.push({ k: 'mend', x: pcx(p), y: pcy(p), t: 0, life: 0.6 }); } }
      } else if (z.k === 'fire') {
        for (const e of foes) if (!z.cool.has(e) && Math.abs(ex(e) - z.x) < 0.85 && Math.abs(e.y + (e.h || 0.9) - z.fy) < 0.9) { z.cool.set(e, 0.45); FK.chip(S, e, 0.9, C_FIRE); }
      }
      if (gone) S.zones.splice(i, 1);
    }
    // poison pools: anyone standing in one is poisoned for as long as they stay
    for (let i = S.pools.length - 1; i >= 0; i--) {
      const d = S.pools[i]; d.t += dt;
      for (const e of foes) if (Math.abs(ex(e) - d.x) < d.w / 2 + 0.2 && Math.abs(e.y + (e.h || 0.9) - d.fy) < 0.6) { venom(S, e, 1.2); if (!e._noKnockback) e.vx = (e.vx || 0) * (1 - Math.min(1, dt * 6)); }
      if (d.t > d.life) S.pools.splice(i, 1);
    }
    for (const [e, v] of S.venom) {
      if (e.dead) { S.venom.delete(e); continue; }
      v.left -= dt; v.tick -= dt;
      if (v.tick <= 0) { v.tick = 0.5; FK.chip(S, e, 0.7, C_VENOM);   // (a tick, not a hit: it never launches)
        FK.heal(S, p, 0.22, C_MEND); S.fx.push({ k: 'drip', x: ex(e), y: ey(e), t: 0, life: 0.4 }); }
      if (v.left <= 0) S.venom.delete(e);
    }
    for (let i = S.thermals.length - 1; i >= 0; i--) {
      const v = S.thermals[i]; v.t += dt; v.self -= dt;
      for (const [e, c] of v.cool) { if (c - dt <= 0) v.cool.delete(e); else v.cool.set(e, c - dt); }
      for (const e of foes) if (!v.cool.has(e) && Math.abs(ex(e) - v.x) < v.w * 0.6 && ey(e) < v.fy + 0.2 && ey(e) > v.fy - v.h) { v.cool.set(e, 0.9); FK.hit(S, e, 1, { kx: 0, ky: -13, stun: 0.4, c: FORMS[1].c }); }
      // riding the thermal: a steady lift for as long as you stay in it (↓ lets you sink)
      if (v.self <= 0 && !k.down && Math.abs(pcx(p) - v.x) < v.w * 0.6 && p.y + p.h > v.fy - v.h && p.y < v.fy + 0.1) {
        p.vy = Math.max(-11, (p.vy || 0) - 60 * dt); if (p.vy > -3) p.vy = -3; p.onGround = false; S.airUp = false; S.lifted = 0.2;
      }
      if (v.t > v.life) S.thermals.splice(i, 1);
    }
  }

  const MOVES = {
    ground: { neutral: { name: 'Mask Strike', cd: 0.3 }, side: { name: 'Mask Rush', cd: 0.4 }, up: { name: 'Mask Rise', cd: 0.4 }, down: { name: 'Mask Dance', cd: 0.45 } },
    air:    { neutral: { name: 'Mask Strike', cd: 0.3 }, side: { name: 'Mask Rush', cd: 0.4 }, up: { name: 'Mask Rise', cd: 0.4 }, down: { name: 'Mask Dance', cd: 0.45 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  // the mask itself, drawn on her face (head frame, radius hr)
  function mask(ctx, id, hr, t, F) {
    ctx.fillStyle = F.c2; ctx.strokeStyle = F.c; ctx.lineWidth = hr * 0.12;
    if (id === 'fox') {
      ctx.fillStyle = F.c; ctx.beginPath(); ctx.moveTo(-hr * 0.55, -hr * 0.6); ctx.lineTo(-hr * 0.35, -hr * 1.55); ctx.lineTo(hr * 0.1, -hr * 0.75); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hr * 0.35, -hr * 0.75); ctx.lineTo(hr * 0.8, -hr * 1.5); ctx.lineTo(hr * 0.95, -hr * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = F.c2; ctx.beginPath(); ctx.moveTo(-hr * 0.7, -hr * 0.55); ctx.quadraticCurveTo(hr * 0.3, -hr * 1.0, hr * 1.0, -hr * 0.45); ctx.quadraticCurveTo(hr * 1.25, hr * 0.2, hr * 1.35, hr * 0.55); ctx.quadraticCurveTo(hr * 0.5, hr * 0.75, -hr * 0.5, hr * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1d1a26'; ctx.beginPath(); ctx.arc(hr * 1.3, hr * 0.5, hr * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d6342a'; ctx.lineWidth = hr * 0.09; ctx.beginPath(); ctx.moveTo(-hr * 0.2, hr * 0.3); ctx.lineTo(hr * 0.15, hr * 0.42); ctx.moveTo(-hr * 0.25, hr * 0.1); ctx.lineTo(hr * 0.1, hr * 0.2); ctx.stroke();
      FK.eyes(ctx, hr * 0.2, -hr * 0.1, hr * 0.17, hr * 0.5, { glow: '#ffb020' });
    } else if (id === 'owl') {
      ctx.beginPath(); ctx.ellipse(hr * 0.15, 0, hr * 0.95, hr * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = F.c; ctx.beginPath(); ctx.moveTo(-hr * 0.55, -hr * 0.65); ctx.lineTo(-hr * 0.75, -hr * 1.3); ctx.lineTo(-hr * 0.1, -hr * 0.8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hr * 0.45, -hr * 0.8); ctx.lineTo(hr * 1.0, -hr * 1.3); ctx.lineTo(hr * 0.9, -hr * 0.6); ctx.closePath(); ctx.fill();
      for (const dx of [-hr * 0.12, hr * 0.5]) { ctx.strokeStyle = F.c; ctx.lineWidth = hr * 0.08; ctx.beginPath(); ctx.arc(dx, -hr * 0.05, hr * 0.33, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#f2a13c'; ctx.beginPath(); ctx.moveTo(hr * 0.2, hr * 0.2); ctx.lineTo(hr * 0.55, hr * 0.3); ctx.lineTo(hr * 0.25, hr * 0.62); ctx.closePath(); ctx.fill();
      FK.eyes(ctx, -hr * 0.12, -hr * 0.05, hr * 0.17, hr * 0.62, { glow: '#fff3a8' });
    } else if (id === 'serpent') {
      // a narrow hooded cobra mask with a forked tongue
      ctx.fillStyle = F.c; ctx.beginPath(); ctx.ellipse(hr * 0.05, -hr * 0.1, hr * 1.25, hr * 1.0, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = F.c2; ctx.beginPath(); ctx.moveTo(-hr * 0.5, -hr * 0.7); ctx.quadraticCurveTo(hr * 0.4, -hr * 1.0, hr * 0.95, -hr * 0.3); ctx.quadraticCurveTo(hr * 1.3, hr * 0.25, hr * 1.1, hr * 0.5); ctx.quadraticCurveTo(hr * 0.3, hr * 0.8, -hr * 0.45, hr * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e0344a'; ctx.lineWidth = hr * 0.08; const tg = Math.sin(t * 9) * hr * 0.12;
      ctx.beginPath(); ctx.moveTo(hr * 1.1, hr * 0.42); ctx.lineTo(hr * 1.5, hr * 0.5 + tg); ctx.lineTo(hr * 1.75, hr * 0.38 + tg); ctx.moveTo(hr * 1.5, hr * 0.5 + tg); ctx.lineTo(hr * 1.75, hr * 0.64 + tg); ctx.stroke();
      ctx.strokeStyle = F.c; ctx.lineWidth = hr * 0.07; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-hr * 0.15 + i * hr * 0.3, hr * 0.42, hr * 0.12, 0, Math.PI); ctx.stroke(); }
      FK.eyes(ctx, hr * 0.2, -hr * 0.12, hr * 0.15, hr * 0.5, { glow: '#d6ff5a' });
    } else if (id === 'dragon') {
      // horns, a long snout with a nostril and a row of teeth
      ctx.fillStyle = '#ffd166'; for (const dx of [-hr * 0.45, hr * 0.25]) { ctx.beginPath(); ctx.moveTo(dx, -hr * 0.6); ctx.quadraticCurveTo(dx - hr * 0.5, -hr * 1.3, dx - hr * 0.15, -hr * 1.75); ctx.quadraticCurveTo(dx + hr * 0.05, -hr * 1.2, dx + hr * 0.35, -hr * 0.7); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = F.c; ctx.beginPath(); ctx.moveTo(-hr * 0.7, -hr * 0.6); ctx.quadraticCurveTo(hr * 0.4, -hr * 0.95, hr * 0.9, -hr * 0.35); ctx.lineTo(hr * 1.6, hr * 0.05); ctx.quadraticCurveTo(hr * 1.7, hr * 0.5, hr * 1.3, hr * 0.55); ctx.lineTo(-hr * 0.5, hr * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = F.c2; ctx.beginPath(); ctx.moveTo(hr * 0.1, hr * 0.3); ctx.lineTo(hr * 1.55, hr * 0.32); ctx.quadraticCurveTo(hr * 1.5, hr * 0.56, hr * 1.25, hr * 0.56); ctx.lineTo(-hr * 0.2, hr * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hr * (0.35 + i * 0.3), hr * 0.3); ctx.lineTo(hr * (0.45 + i * 0.3), hr * 0.48); ctx.lineTo(hr * (0.55 + i * 0.3), hr * 0.3); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#3a0d0d'; ctx.beginPath(); ctx.arc(hr * 1.4, hr * 0.12, hr * 0.07, 0, Math.PI * 2); ctx.fill();
      FK.eyes(ctx, hr * 0.15, -hr * 0.2, hr * 0.16, hr * 0.5, { glow: '#ffe14a' });
    } else {
      ctx.beginPath(); ctx.roundRect(-hr * 0.7, -hr * 0.75, hr * 1.75, hr * 1.4, hr * 0.5); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = F.c; ctx.lineWidth = hr * 0.07; ctx.beginPath(); ctx.moveTo(-hr * 0.1, -hr * 0.75); ctx.lineTo(hr * 0.15, -hr * 0.45); ctx.lineTo(hr * 0.6, -hr * 0.45); ctx.lineTo(hr * 0.8, -hr * 0.72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hr * 0.5, hr * 0.38); ctx.quadraticCurveTo(hr * 0.75, hr * 0.5, hr * 0.98, hr * 0.36); ctx.stroke();
      FK.eyes(ctx, hr * 0.1, -hr * 0.05, hr * 0.15, hr * 0.55, { glow: '#b6ffd0' });
    }
  }

  FK.define({
    id: ID, plug: 'masque',
    def: { name: 'Masque', icon: '🎭', tier: 'gold', color: '#c59bff', color2: '#ffd166',
      ability: 'Mask Dancer: five masks (Fox, Owl, Turtle, Serpent, Dragon), each a different fighter; changing masks, the Turtle and poison heal her',
      desc: 'A dancer with five masks. ↓ + S is the Mask Dance: it changes her mask (tap = next, hold = the one before), knocks back anyone close and mends her a little. 🦊 Fox builds combos: Fox Flurry lights Foxfire wisps, Pounce detonates them, Flip Kick fires them as homing bolts. 🦉 Owl fights from far and high: Feather Darts, Gust, a Thermal she can ride, a third jump and a glide. 🐢 Turtle is the tank: Shell Bash heals her for every foe it hits, Shell Slide is armored, standing still mends her. 🐍 Serpent poisons: Venom Spit leaves a poison pool, Tail Lash yanks a far foe to her, Spring Coil is her highest jump, and poison damage mends her. 🐉 Dragon burns: a held Fire Breath, a Dragon Rush that flies straight through, a Flame Pillar, and a hover (hold jump).' },
    stats: { speed: 1.1, jump: 1.1, maxJumps: 2, maxDashes: 1, hp: 3 },
    statMod: S => form(S).stats,
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, form: 0, rot: 0, maskT: 0, shots: [], thermals: [], pools: [], venom: new Map(), zones: [], timers: [], beam: null, comet: 0, coilT: 0, coilE: null, wisps: 0, hover: 0, airUp: false, bank: 0, healT: 0, still: 0, carry: null, lifted: 0 }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Comes back when you land'; return null; },
    act: {
      ground_neutral: use(0), ground_side: use(1), ground_up: use(2), ground_down: dance,
      air_neutral: use(0), air_side: use(1), air_up: use(2), air_down: dance,
    },
    onTeleport(p, S) { S.seq = null; S.rot = 0; S.thermals.length = 0; S.pools.length = 0; S.zones.length = 0; S.timers.length = 0; S.beam = null; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq) { S.seq = null; S.rot = 0; }
      S.rate = 18;
      for (const n of ['maskT', 'healT', 'lifted']) if (S[n] > 0) S[n] = Math.max(0, S[n] - dt);
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      stepWorld(p, dt, S, k);
      const F = form(S);
      if (!S.seq) {
        // the owl glides while jump is held on the way down
        const gliding = F.id === 'owl' && !p.onGround && k.jump && (p.vy || 0) > 0;
        // the dragon flaps to hover: holding jump in the air nearly stops her fall, for a couple of seconds per jump
        const hov = F.id === 'dragon' && !p.onGround && k.jump && (p.vy || 0) > 0 && S.hover < 2;
        if (gliding) { p.vy = Math.min(p.vy, 2.6); S.target = PO.glide; }
        else if (hov) { S.hover += dt; p.vy = Math.min(p.vy, 0.9); S.target = pose(Object.assign({}, PO.flap, { wing: 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 22) })); if (Math.floor(S.hover * 5) !== S.hovN) { S.hovN = Math.floor(S.hover * 5); FK.whoosh(false); } }
        else S.target = FK.locomotion(S, p, dt, PO, { tuck: 0, wing: 0 });
        if (S.carry) { S.carry.t -= dt; if (S.carry.t <= 0 || (p.onGround && S.carry.t < 0.2)) S.carry = null; else if (Math.abs(p.vx || 0) < Math.abs(S.carry.vx)) p.vx = S.carry.vx; }
      }
      // the turtle mends while she stands still
      if (F.id === 'turtle' && p.onGround && !S.seq && Math.abs(p.vx || 0) < 0.3) { S.still += dt; if (S.still > 1.2) { S.still -= 0.5; FK.heal(S, p, 0.35, C_MEND); S.fx.push({ k: 'mend', x: pcx(p), y: pcy(p), t: 0, life: 0.6 }); } }
      else S.still = 0;
      if (p.onGround) S.hover = 0;
      if (F.id !== 'fox' && S.wisps && !S.seq) S.wisps = 0;   // the foxfire belongs to the fox
      if (p.onGround && S.lifted <= 0) S.airUp = false;
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing: a robed dancer whose mask, trim and extras change with the form
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, s = ph / U, cx = px + pw / 2, fy = py + ph;
      const F = FORMS[(S && S.form) || 0], rot = (S && S.rot) || 0, tuck = q.tuck || 0, wing = q.wing || 0;
      if (rot) { ctx.translate(cx, fy - ph * 0.5); ctx.rotate(rot); ctx.translate(-cx, -(fy - ph * 0.5)); }
      const K = FK.skel(P, q, cx, fy, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowBlur = 9; ctx.shadowColor = F.c;
      // owl wings: feathered sleeves that open behind her
      if (F.id === 'owl') for (const A of [K.aB, K.aF]) {
        const sh = A[0], hd = A[2], ax = hd[0] - sh[0], ay = hd[1] - sh[1], n = 5;
        for (let i = 0; i < n; i++) { const u = (i + 1) / n, bx = sh[0] + ax * u, by = sh[1] + ay * u, L = (3 + 6 * wing) * s * (0.6 + 0.4 * u);
          ctx.fillStyle = i % 2 ? F.c : F.c2; ctx.beginPath(); ctx.ellipse(bx - 1.2 * s, by + L * 0.5, 1.5 * s, L * 0.6, 0.25, 0, Math.PI * 2); ctx.fill(); }
      }
      // dragon wings: two red membranes from her shoulders that open as she flies
      if (F.id === 'dragon') { const nk = K.neck, op = 0.35 + 0.65 * wing, fl = Math.sin(t * 9) * 1.5 * s * wing;
        for (const sd of [1, 0.75]) { ctx.fillStyle = sd === 1 ? '#b3202a' : '#7d1420'; ctx.beginPath(); ctx.moveTo(nk[0] - 2 * s, nk[1] + 2 * s);
          ctx.lineTo(nk[0] - (7 + 9 * op) * s * sd, nk[1] - (6 + 8 * op) * s * sd + fl); ctx.lineTo(nk[0] - (13 + 6 * op) * s * sd, nk[1] + (1 - 3 * op) * s + fl);
          ctx.quadraticCurveTo(nk[0] - 10 * s * sd, nk[1] + 5 * s, nk[0] - (9 + 3 * op) * s * sd, nk[1] + 9 * s); ctx.quadraticCurveTo(nk[0] - 5 * s, nk[1] + 7 * s, nk[0] - 3 * s, nk[1] + 10 * s); ctx.closePath(); ctx.fill(); } }
      // serpent tail: a long violet coil that sways behind her
      if (F.id === 'serpent') { const hx = K.hip[0], hy = K.hip[1], w = Math.sin(t * 5) * 2.5 * s;
        ctx.strokeStyle = F.c; ctx.lineWidth = 4.2 * s; ctx.beginPath(); ctx.moveTo(hx - 2 * s, hy); ctx.bezierCurveTo(hx - 9 * s, hy + 6 * s, hx - 15 * s, hy - 2 * s + w, hx - 10 * s, hy - 7 * s + w); ctx.stroke();
        ctx.strokeStyle = C_VENOM; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(hx - 10.4 * s, hy - 6 * s + w); ctx.lineTo(hx - 9.4 * s, hy - 8.6 * s + w); ctx.stroke(); }
      FK.limb(ctx, K.lB, 4.6 * s, C_ROBE2, 4.2 * s);
      FK.mitt(ctx, K.lB[2][0] + 0.8 * s, K.lB[2][1] - 0.3 * s, 2.5 * s, '#15101f');
      FK.limb(ctx, K.aB, 4.4 * s, C_ROBE2, 5 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 2.3 * s, C_SKIN);
      // fox tail
      if (F.id === 'fox') { const hx = K.hip[0], hy = K.hip[1], w = Math.sin(t * 7) * 2 * s;
        ctx.strokeStyle = F.c; ctx.lineWidth = 4.6 * s; ctx.beginPath(); ctx.moveTo(hx - 3 * s, hy - 1 * s); ctx.quadraticCurveTo(hx - 11 * s, hy - 2 * s + w, hx - 12 * s, hy - 9 * s + w); ctx.stroke();
        ctx.strokeStyle = F.c2; ctx.lineWidth = 3.4 * s; ctx.beginPath(); ctx.moveTo(hx - 12 * s, hy - 7.5 * s + w); ctx.lineTo(hx - 12 * s, hy - 9.5 * s + w); ctx.stroke(); }
      // robe with a sash in the mask's colour
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s, W = 14.5 * s, swy = Math.sin(t * 5) * s * 0.7;
      const g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); g.addColorStop(0, C_ROBE2); g.addColorStop(0.6, C_ROBE); g.addColorStop(1, '#5a4390');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-W * 0.4, -Lt); ctx.lineTo(W * 0.4, -Lt); ctx.quadraticCurveTo(W * 0.56, -Lt * 0.3, W * 0.62 + swy, 4 * s); ctx.lineTo(-W * 0.62 + swy, 4 * s); ctx.quadraticCurveTo(-W * 0.56, -Lt * 0.3, -W * 0.4, -Lt); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = F.c; ctx.fillRect(-W * 0.5, -Lt * 0.42, W, 2 * s);
      ctx.fillStyle = C_SASH; ctx.beginPath(); ctx.arc(W * 0.12, -Lt * 0.33, 1.6 * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = F.c; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(-W * 0.6 + swy, 3.4 * s); ctx.lineTo(W * 0.6 + swy, 3.4 * s); ctx.stroke();
      // turtle shell on her back, growing as she tucks in
      if (F.id === 'turtle') { const R = (6.5 + 4.5 * tuck) * s; ctx.translate(-W * (0.3 - 0.3 * tuck), -Lt * 0.5);
        ctx.fillStyle = '#2f8f58'; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.8, R, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1d5c38'; ctx.lineWidth = 1.1 * s; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-R * 0.8, 0); ctx.lineTo(R * 0.8, 0); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();
        ctx.fillStyle = F.c; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(R * 0.2, -R * 0.35, R * 0.25, R * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.restore();
      ctx.shadowBlur = 0;
      if (tuck < 0.8) {
        FK.limb(ctx, K.lF, 4.8 * s, C_ROBE, 4.4 * s);
        FK.mitt(ctx, K.lF[2][0] + 0.8 * s, K.lF[2][1] - 0.3 * s, 2.7 * s, '#1d1528');
        // head: dark hair in a bun, and the mask over her face (it flashes as it changes)
        ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
        const hr = K.hr * (1 - 0.3 * tuck);
        ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.arc(-hr * 0.15, -hr * 0.1, hr * 1.05, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-hr * 0.75, -hr * 0.95, hr * 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C_SASH; ctx.fillRect(-hr * 0.95, -hr * 0.78, hr * 0.5, hr * 0.14);
        ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.arc(hr * 0.08, hr * 0.08, hr * 0.88, 0, Math.PI * 2); ctx.fill();
        mask(ctx, F.id, hr * 0.82, t, F);
        const mt = S ? S.maskT || 0 : 0;
        if (mt > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, mt * 2.5); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hr * 0.15, 0, hr * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        ctx.restore();
        FK.limb(ctx, K.aF, 4.6 * s, C_ROBE, 5.2 * s);
        FK.mitt(ctx, K.aF[2][0], K.aF[2][1], 2.5 * s, C_SKIN);
        // fox claws on the leading hand
        if (F.id === 'fox') { const hx = K.aF[2][0], hy = K.aF[2][1], an = q.aF[0] + q.aF[1]; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9 * s;
          for (let i = -1; i <= 1; i++) { const a2 = an + i * 0.35; ctx.beginPath(); ctx.moveTo(hx + Math.sin(a2) * 2 * s, hy + Math.cos(a2) * 2 * s); ctx.lineTo(hx + Math.sin(a2) * 4.6 * s, hy + Math.cos(a2) * 4.6 * s); ctx.stroke(); } }
      }
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T, F = form(S);
      for (const v of S.thermals) {
        const x = V.SX(v.x), y0 = V.SY(v.fy), h = v.h * T, w = v.w * T, a = Math.min(1, v.t / 0.2) * Math.min(1, (v.life - v.t) / 0.7);
        const g = ctx.createLinearGradient(0, y0, 0, y0 - h); g.addColorStop(0, 'rgba(111,182,255,0.32)'); g.addColorStop(1, 'rgba(111,182,255,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - w / 2, y0 - h, w, h);
        for (let i = 0; i < 6; i++) { const u = ((V.now * 0.9 + i / 6) % 1), yy = y0 - u * h, sx = Math.sin(u * 9 + i) * w * 0.3;
          ctx.beginPath(); ctx.moveTo(x + sx - w * 0.18, yy + T * 0.2); ctx.lineTo(x + sx, yy); ctx.lineTo(x + sx + w * 0.18, yy + T * 0.2); FK.glow(ctx, '#e8f3ff', a * (1 - u) * 0.9); ctx.lineWidth = 2.5; ctx.stroke(); }
        ctx.beginPath(); ctx.ellipse(x, y0, w * 0.55, T * 0.12, 0, 0, Math.PI * 2); FK.glow(ctx, FORMS[1].c, a * 0.6); ctx.fill();
      }
      for (const d of S.pools) {
        const x = V.SX(d.x), y = V.SY(d.fy), w = d.w * T, a = Math.min(1, d.t / 0.25) * Math.min(1, (d.life - d.t) / 0.8);
        ctx.beginPath(); ctx.ellipse(x, y - 1, w / 2, T * 0.13, 0, 0, Math.PI * 2); FK.solid(ctx, '#5d2a9a', 0.85 * a); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y - 2, w * 0.42, T * 0.08, 0, 0, Math.PI * 2); FK.glow(ctx, C_VENOM, 0.6 * a); ctx.fill();
        for (let i = 0; i < 5; i++) { const u = (V.now * 0.8 + i * 0.37) % 1; ctx.beginPath(); ctx.arc(x + (((i * 0.61) % 1) - 0.5) * w * 0.8, y - 3 - u * T * 0.7, T * 0.06 * (1 - u) + 1, 0, Math.PI * 2); FK.glow(ctx, C_VENOM, a * (1 - u)); ctx.fill(); }
      }
      for (const z of S.zones) {
        const x = V.SX(z.x), y0 = V.SY(z.fy), a = Math.min(1, z.t / 0.2) * Math.min(1, (z.life - z.t) / 0.5);
        if (z.k === 'twister') { for (let i = 0; i < 9; i++) { const u = i / 8, w = T * (0.35 + u * 1.25), yy = y0 - u * T * 4.6, ph = V.now * 9 + i * 0.9;
            ctx.beginPath(); ctx.ellipse(x + Math.sin(ph) * w * 0.22, yy, w, T * 0.16, 0, 0, Math.PI * 2); FK.glow(ctx, i % 2 ? FORMS[1].c : '#e8f3ff', a * (0.75 - u * 0.3)); ctx.lineWidth = 3.5; ctx.stroke(); } }
        else if (z.k === 'wave') { const d = z.dir, h = T * 2.1 * Math.min(1, z.t * 6);
          ctx.beginPath(); ctx.moveTo(x - d * T * 1.5, y0); ctx.quadraticCurveTo(x - d * T * 0.3, y0 - h * 0.4, x + d * T * 0.1, y0 - h); ctx.quadraticCurveTo(x + d * T * 0.9, y0 - h * 0.95, x + d * T * 0.7, y0 - h * 0.45); ctx.quadraticCurveTo(x + d * T * 0.35, y0 - h * 0.6, x + d * T * 0.45, y0); ctx.closePath();
          FK.solid(ctx, '#2fae7c', 0.85 * a); ctx.fill(); FK.glow(ctx, '#d9ffe6', 0.8 * a); ctx.lineWidth = 3; ctx.stroke(); }
        else if (z.k === 'spa') { const w = z.w * T;
          ctx.beginPath(); ctx.ellipse(x, y0 - 1, w / 2, T * 0.14, 0, 0, Math.PI * 2); FK.solid(ctx, '#1f8f6a', 0.8 * a); ctx.fill();
          ctx.beginPath(); ctx.ellipse(x, y0 - 2, w * 0.42, T * 0.09, 0, 0, Math.PI * 2); FK.glow(ctx, C_MEND, 0.55 * a); ctx.fill();
          for (let i = 0; i < 6; i++) { const u = (V.now * 0.6 + i * 0.29) % 1; ctx.beginPath(); ctx.arc(x + (((i * 0.61) % 1) - 0.5) * w * 0.8 + Math.sin(u * 6 + i) * 3, y0 - 3 - u * T * 1.3, T * 0.07 + u * 3, 0, Math.PI * 2); FK.glow(ctx, '#ffffff', a * (1 - u) * 0.5); ctx.fill(); } }
        else if (z.k === 'fire') { for (let i = 0; i < 3; i++) { const fl = 0.6 + 0.4 * Math.sin(V.now * 17 + i * 2 + z.x * 3), xx = x + (i - 1) * T * 0.3, h = T * (0.5 + 0.35 * fl) * a;
            ctx.beginPath(); ctx.moveTo(xx - T * 0.2, y0); ctx.quadraticCurveTo(xx - T * 0.12, y0 - h * 0.6, xx, y0 - h); ctx.quadraticCurveTo(xx + T * 0.12, y0 - h * 0.6, xx + T * 0.2, y0); ctx.closePath(); FK.glow(ctx, i === 1 ? '#fff1a8' : C_FIRE, 0.75 * a); ctx.fill(); } }
      }
      // inferno beam: a white-hot core in a wide red glow, from her mouth to the first wall
      if (S.beam) { const B = S.beam, x0 = V.SX(B.x), y = V.SY(B.y), x1 = V.SX(B.x + B.f * B.len), fl = 0.85 + 0.15 * Math.sin(V.now * 60);
        for (const [w, col, al] of [[0.85, '#c62a1a', 0.45], [0.5, C_FIRE, 0.7], [0.2, '#ffffff', 1]]) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); FK.glow(ctx, col, al); ctx.lineWidth = T * w * fl; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x1, y, T * 0.6 * fl, 0, Math.PI * 2); FK.glow(ctx, '#fff1a8', 0.8); ctx.fill(); }
      // foxfire comet: she is inside a ball of blue fire
      if (S.comet > 0) { ctx.beginPath(); ctx.arc(V.SX(pcx(p)), V.SY(pcy(p)), T * (1.0 + 0.1 * Math.sin(V.now * 40)), 0, Math.PI * 2); FK.glow(ctx, '#7cf3ff', 0.45); ctx.fill(); }
      // constrict: the tail wound round the foe she is holding
      if (S.coilT > 0 && S.coilE && !S.coilE.dead) { const e = S.coilE, x = V.SX(ex(e)), y = V.SY(ey(e));
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x, y + (i - 1) * T * 0.26, T * (0.55 - 0.04 * Math.sin(V.now * 14)), T * 0.13, 0, 0, Math.PI * 2); FK.solid(ctx, FORMS[3].c, 0.95); ctx.lineWidth = T * 0.13; ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(V.SX(pcx(p)), V.SY(pcy(p) + 0.2)); ctx.lineTo(x, y + T * 0.26); FK.solid(ctx, FORMS[3].c, 0.95); ctx.lineWidth = T * 0.13; ctx.stroke(); }
      // foxfire wisps circling her
      for (let i = 0; i < S.wisps; i++) { const an = V.now * 5 + i * Math.PI * 2 / 3, x = V.SX(pcx(p) + Math.cos(an) * 0.85), y = V.SY(pcy(p) + Math.sin(an) * 0.5 - 0.1);
        ctx.beginPath(); ctx.arc(x, y, T * 0.2, 0, Math.PI * 2); FK.glow(ctx, '#7cf3ff', 0.55); ctx.fill(); ctx.beginPath(); ctx.arc(x, y, T * 0.09, 0, Math.PI * 2); FK.glow(ctx, '#ffffff', 1); ctx.fill(); }
      for (const [e, v] of S.venom) if (!e.dead) { const x = V.SX(ex(e)), y = V.SY(e.y) - T * 0.25; ctx.beginPath(); ctx.arc(x, y, T * 0.11, 0, Math.PI * 2); FK.glow(ctx, C_VENOM, 0.6 + 0.4 * Math.sin(V.now * 12)); ctx.fill(); }
      for (const b of S.shots) {
        const x = V.SX(b.x), y = V.SY(b.y), d = Math.sign(b.vx) || 1;
        if (b.wait > 0) continue;
        if (b.k === 'quill') { const pts = []; for (let i = 0; i <= 6; i++) pts.push([x - b.vx * i * 0.01 * T, y - b.vy * i * 0.01 * T]); FK.taper(ctx, pts, T * 0.11, FORMS[1].c, 0.95); continue; }
        if (b.k === 'glob') { ctx.beginPath(); ctx.arc(x, y, T * 0.24, 0, Math.PI * 2); FK.solid(ctx, '#7a3fd0', 1); ctx.fill(); ctx.beginPath(); ctx.arc(x - T * 0.06, y - T * 0.07, T * 0.1, 0, Math.PI * 2); FK.glow(ctx, C_VENOM, 0.9); ctx.fill(); continue; }
        if (b.k === 'wisp') { const pts = []; for (let i = 0; i <= 5; i++) pts.push([x - b.vx * i * 0.012 * T, y - b.vy * i * 0.012 * T]); FK.taper(ctx, pts, T * 0.16, '#7cf3ff', 0.9); continue; }
        if (b.k === 'dart') { const pts = []; for (let i = 0; i <= 6; i++) pts.push([x - d * i * T * 0.22, y - b.vy * i * 0.01 * T]); FK.taper(ctx, pts, T * 0.1, b.pierce ? '#ffffff' : FORMS[1].c, 0.9);
          FK.solid(ctx, '#ffffff', 1); ctx.beginPath(); ctx.moveTo(x + d * T * 0.22, y); ctx.lineTo(x - d * T * 0.1, y - T * 0.07); ctx.lineTo(x - d * T * 0.1, y + T * 0.07); ctx.closePath(); ctx.fill(); }
        else { const a = Math.min(1, (b.life - b.t) / 0.25); for (let i = 0; i < 3; i++) FK.crescent(ctx, x - d * i * T * 0.45, y, T * (1.1 - i * 0.15), d > 0 ? -1.0 : Math.PI - 1.0, d > 0 ? 1.0 : Math.PI + 1.0, T * 0.22, i ? FORMS[1].c : '#ffffff', a * (0.75 - i * 0.2)); }
      }
      if (S.healT > 0) { ctx.beginPath(); ctx.arc(V.SX(pcx(p)), V.SY(pcy(p)), T * (0.8 + 0.1 * Math.sin(V.now * 24)), 0, Math.PI * 2); FK.glow(ctx, C_MEND, Math.min(0.6, S.healT * 1.2)); ctx.lineWidth = 3; ctx.stroke(); }
      // which mask comes next, as three small pips over her head
      { const x = V.SX(pcx(p)), y = V.SY(p.y) - T * 0.42;
        FORMS.forEach((G, i) => { ctx.beginPath(); ctx.arc(x + (i - 2) * T * 0.2, y, T * (i === S.form ? 0.085 : 0.05), 0, Math.PI * 2); FK.solid(ctx, G.c, i === S.form ? 1 : 0.45); ctx.fill(); }); }
      // the turtle's standing-still mend: a slow ring filling at her feet
      if (F.id === 'turtle' && S.still > 0.2) { ctx.beginPath(); ctx.arc(V.SX(pcx(p)), V.SY(p.y + p.h), T * 0.6, Math.PI, Math.PI * (1 + Math.min(1, S.still / 1.2))); FK.glow(ctx, C_MEND, 0.7); ctx.lineWidth = 3; ctx.stroke(); }
    },
    drawFx(ctx, V, f, u, a) {
      const T = V.T;
      if (f.k === 'claw') { const x = V.SX(f.x), y = V.SY(f.y); for (let i = -1; i <= 1; i++) FK.crescent(ctx, x - f.f * T * 0.5, y + i * T * 0.2, T * (0.9 + u * 0.3), f.f > 0 ? (f.up ? -1.1 : -0.4) : Math.PI - (f.up ? 0.4 : 1.1), f.f > 0 ? (f.up ? 0.4 : 1.1) : Math.PI + (f.up ? 1.1 : 0.4), T * 0.12, i ? FORMS[0].c : '#ffffff', a); return true; }
      if (f.k === 'mend') { const x = V.SX(f.x), y = V.SY(f.y); for (let i = 0; i < 5; i++) { const xx = x + (i - 2) * T * 0.22, yy = y + T * 0.4 - u * T * (0.8 + (i % 2) * 0.4); FK.glow(ctx, C_MEND, a); ctx.fillRect(xx - 1.5, yy - 5, 3, 10); ctx.fillRect(xx - 5, yy - 1.5, 10, 3); } return true; }
      if (f.k === 'lash') { const x0 = V.SX(f.x), y0 = V.SY(f.y), L = f.len * T * Math.min(1, u * 3.5), pts = [];
        for (let i = 0; i <= 14; i++) { const w = i / 14; pts.push([x0 + f.f * L * w, y0 + Math.sin(w * 7 - u * 14) * T * 0.3 * (1 - w * 0.6) * (1 - u)]); }
        FK.taper(ctx, pts, T * 0.2, FORMS[3].c, a); FK.star(ctx, x0 + f.f * L, y0, T * 0.3 * a, u * 6, C_VENOM, a); return true; }
      if (f.k === 'flame') { const x = V.SX(f.x + f.vx * f.t), y = V.SY(f.y + f.vy * f.t - f.t * f.t * 3), r = T * f.r * (0.6 + u * 1.4);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); FK.glow(ctx, f.blue ? (u < 0.4 ? '#ffffff' : '#7cf3ff') : u < 0.3 ? '#fff1a8' : u < 0.65 ? C_FIRE : '#c62a1a', a * 0.75); ctx.fill(); return true; }
      if (f.k === 'pillar') { const x = V.SX(f.x), y0 = V.SY(f.y), h = f.h * T * Math.min(1, u * 4) * (1 - Math.max(0, u - 0.55) * 2.2), w = T * 1.3;
        for (const [ww, col] of [[1, '#c62a1a'], [0.66, C_FIRE], [0.32, '#fff1a8']]) { ctx.beginPath(); ctx.moveTo(x - w * ww * 0.5, y0);
          for (let i = 0; i <= 8; i++) { const v = i / 8; ctx.lineTo(x - w * ww * 0.5 * (1 - v * 0.7) + Math.sin(v * 9 + V.now * 22) * T * 0.08, y0 - h * v); }
          for (let i = 8; i >= 0; i--) { const v = i / 8; ctx.lineTo(x + w * ww * 0.5 * (1 - v * 0.7) + Math.sin(v * 9 + V.now * 22 + 2) * T * 0.08, y0 - h * v); }
          ctx.closePath(); FK.glow(ctx, col, Math.min(1, a * 1.5) * 0.8); ctx.fill(); }
        return true; }
      if (f.k === 'drip') { const x = V.SX(f.x), y = V.SY(f.y); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + (i - 1) * T * 0.2, y + u * T * 0.5, T * 0.06, 0, Math.PI * 2); FK.glow(ctx, C_VENOM, a); ctx.fill(); } return true; }
      if (f.k === 'spout') { const x = V.SX(f.x), y0 = V.SY(f.y), h = f.h * T * Math.min(1, u * 3) * (1 - Math.max(0, u - 0.6) * 2.5), w = T * 0.9;
        const g = ctx.createLinearGradient(0, y0, 0, y0 - h); g.addColorStop(0, 'rgba(88,214,141,0.75)'); g.addColorStop(1, 'rgba(217,255,230,0.15)');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a * 1.6); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w * 0.5, y0); ctx.quadraticCurveTo(x - w * 0.2, y0 - h * 0.5, x - w * 0.45, y0 - h); ctx.lineTo(x + w * 0.45, y0 - h); ctx.quadraticCurveTo(x + w * 0.2, y0 - h * 0.5, x + w * 0.5, y0); ctx.closePath(); ctx.fill();
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + Math.sin(i * 2.3) * w * 0.6 * u, y0 - h - Math.sin(u * Math.PI) * T * (0.3 + (i % 3) * 0.2), T * 0.07, 0, Math.PI * 2); FK.glow(ctx, '#d9ffe6', a); ctx.fill(); }
        return true; }
      return false;
    },
    // Smash CPU: change masks now and then, and use whichever one she wears the way it wants to be used
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      const id = FORMS[S.form || 0].id, close = I.adx < 2 && Math.abs(I.dy) < 1.3, level = Math.abs(I.dy) < 1.3;
      if (I.r < 0.05) return { type: 'tap', v: 'down' };
      if (I.dy < -1.2 && I.adx < 2 && !S.airUp) return { type: 'tap', v: 'up' };
      if (id === 'owl') { if (I.adx < 12 && level) return I.adx < 3 ? { type: 'tap', v: 'side' } : { type: 'tap', v: '' }; return null; }
      if (id === 'fox') { if (S.wisps >= 2 && I.adx < 5 && level) return { type: 'tap', v: 'side' }; if (close) return { type: 'tap', v: '' }; if (I.adx < 5 && level) return { type: 'tap', v: 'side' }; return null; }
      if (id === 'serpent') { if (I.adx > 2.2 && I.adx < 5.5 && level) return { type: 'tap', v: 'side' }; if (I.adx < 8 && level) return { type: 'tap', v: '' }; return null; }
      if (id === 'dragon') { if (I.adx < 4 && level) return I.killy ? { type: 'charge', v: '', hold: 0.5 } : { type: 'tap', v: '' }; if (I.adx < 8 && level) return { type: 'tap', v: 'side' }; return null; }
      if (close) return I.killy ? { type: 'charge', v: '', hold: 0.5 } : { type: 'tap', v: '' };
      if (I.adx < 5 && Math.abs(I.dy) < 1) return { type: 'tap', v: 'side' };
      return null;
    },
  });
})();
