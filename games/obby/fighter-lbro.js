/* Obby Builder: L-BROTHER, the lanky, jumpy younger brother. He is scared of everything, and that is his strength.
 *
 * Tall, thin and nervous: a green work shirt under slate overalls, a long striped scarf, a knit beanie with an L patch
 * and a plunger on a cord. He jumps higher than anyone and FLUTTERS (hold jump while falling: his legs paddle and he
 * hangs in the air for a moment). He trembles when foes are close.
 *
 * WHAT MAKES HIM DIFFERENT: FEAR IS A RESOURCE
 *  - FLINCH (passive): when a hit is about to land while he isn't attacking, he yelps "EEP!" and leaps out of the way
 *    untouched. Then it has to come back (6 s: the sweat drop by his head shows it is ready). Nobody else dodges by
 *    themselves.
 *  - NERVE: every flinch gives him a point of Nerve (up to 3, the pips over his head), so does a successful Duck & Cover
 *    and every 6 hits he lands.
 *  - POCKET GADGETS (K / 🎒 + a direction) spend Nerve. They replace the power-up forms: he doesn't wait for crates,
 *    he pulls things out of his overalls in a panic.
 *      🎈 K            BALLOON (1 Nerve): floats him up out of trouble for a few seconds; foes that touch it are bonked.
 *      📯 K + ← / →    AIR HORN (2 Nerve): a deafening blast in front: pushes everyone far back and leaves them dazed.
 *      🪤 K + ↓        SPRING TRAP (2 Nerve): a trap on the floor; the first foe to step on it is flung sky-high.
 *      💛 K + ↑        BRAVE HEART (3 Nerve): 9 s of courage: he stands tall and stops shaking, his scarf blazes gold,
 *                      every hit is 40% stronger, his moves have super armor, and each move gets its BRAVE version.
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge)
 *  Ground: neutral JITTER JAB (a nervous flurry of long plunger pokes), side PLUNGER LINE (sticks to a foe and reels it in,
 *          or to a wall and pulls him there), up STILT KICK (his long leg straight up; the toe is a sweet spot),
 *          down DUCK & COVER (he cowers: a hit in that moment and he slips behind the attacker and kicks them).
 *  Air:    neutral PINWHEEL (all four long limbs spinning), side LONG LEG (the longest kick in the cast: the toe tips),
 *          up SCARF COPTER (recovery), down PLUNGER POGO (plunger first: sticks to a foe and springs off it).
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_luigi_ref';
  const C_JAK = '#3cc457', C_JAK2 = '#23853a', C_SKIN = '#f3c9a3', C_HAIR = '#3a2a1e', C_HAT = '#34b852', C_HAT2 = '#1f7a35', C_SCARF = '#ffe08a', C_SCARF2 = '#ff9a6a', C_SHOE = '#f2efe8', C_BIB = '#56607a', C_BIB2 = '#3c4458', C_MUST = '#2e2016';
  const C_GOLD = '#ffcf3a', C_GOLD2 = '#ff8a1a', C_NERVE = '#ffd84a', C_SWEAT = '#8fd8ff';
  const P = { hip: 11.5, torso: 11, neck: -1, head: 6.8, ua: 5.4, fa: 5.4, th: 5.8, sh: 5.8 };   // a tall, lanky grown man
  const U = 30, pose = FK.pose, { ex, ey, pcx, pcy } = FK;
  const FLINCH_CD = 6, NERVE_MAX = 3, BRAVE_T = 9, HITS_PER_NERVE = 6;
  const GADGETS = {
    balloon: { cost: 1, icon: '🎈', name: 'BALLOON' },
    horn:    { cost: 2, icon: '📯', name: 'AIR HORN' },
    trap:    { cost: 2, icon: '🪤', name: 'SPRING TRAP' },
    brave:   { cost: 3, icon: '💛', name: 'BRAVE HEART' },
  };

  const PO = {
    idle:   pose({ y: 0.3, lean: 0.12, head: 0.08, aF: [0.25, 0.7], aB: [-0.15, 0.5], lF: [0.15, -0.1], lB: [-0.2, -0.05] }),   // a slight nervous stoop
    proud:  pose({ y: 0, lean: -0.08, head: -0.12, aF: [0.5, 1.6], aB: [-0.4, 1.7], lF: [0.25, -0.05], lB: [-0.3, -0.05] }),    // BRAVE: chest out, fists on the hips
    jump:   pose({ y: -0.5, lean: -0.05, aF: [2.7, 0.4], aB: [2.4, 0.5], lF: [0.6, -1.4], lB: [-0.3, -0.5] }),
    fall:   pose({ lean: 0.05, aF: [2.0, 0.9], aB: [-2.0, 0.9], lF: [0.5, -0.4], lB: [-0.5, -0.4] }),
    flutA:  pose({ lean: 0.1, aF: [2.3, 0.6], aB: [-2.3, 0.6], lF: [1.2, -1.6], lB: [-0.2, -0.3] }),
    flutB:  pose({ lean: 0.1, aF: [2.6, 0.4], aB: [-2.6, 0.4], lF: [-0.2, -0.3], lB: [1.2, -1.6] }),
    eep:    pose({ y: -1, lean: -0.6, head: -0.4, aF: [2.9, 0.9], aB: [2.6, 1.1], lF: [1.3, -1.9], lB: [0.9, -1.6] }),          // FLINCH: arms up, knees up, leaning away
    cower:  pose({ y: 8, lean: 0.55, head: 0.5, aF: [2.6, 2.3], aB: [2.4, 2.4], lF: [1.4, -2.6], lB: [0.6, -2.4] }),           // DUCK & COVER: balled up, hands over the head
    backK:  pose({ y: 1, lean: 0.9, head: -0.3, aF: [0.4, 0.5], aB: [-0.3, 0.6], lF: [0.3, -0.3], lB: [-1.7, -0.05] }),         // a mule kick backwards
    poke:   pose({ y: 0.8, lean: 0.4, aF: [1.6, 0.02], aB: [-0.6, 0.8], lF: [0.8, -0.3], lB: [-0.7, -0.1] }),
    pokeW:  pose({ y: 0.8, lean: -0.15, aF: [0.9, 1.6], aB: [-0.4, 0.6], lF: [0.5, -0.3], lB: [-0.5, -0.1] }),
    aim:    pose({ y: 0.4, lean: 0.1, aF: [1.65, 0.0], aB: [1.4, 0.3], lF: [0.6, -0.2], lB: [-0.6, -0.1] }),
    swing:  pose({ y: -0.5, lean: 0.4, aF: [2.6, 0.1], aB: [-0.8, 0.8], lF: [0.9, -0.9], lB: [0.3, -0.5] }),
    scisA:  pose({ y: 2.0, lean: 0.2, aF: [0.4, 0.8], aB: [-0.4, 0.8], lF: [0.9, -1.4], lB: [-0.5, -0.9] }),
    scisB:  pose({ y: -1.0, lean: -0.6, aF: [-1.2, 0.3], aB: [-2.0, 0.3], lF: [2.95, -0.02], lB: [-0.5, -0.2] }),   // a leg kicked straight up
    pinA:   pose({ y: -0.5, lean: 0.0, aF: [1.57, 0.0], aB: [-1.57, 0.0], lF: [1.4, 0.0], lB: [-1.4, 0.0] }),     // a star: all four limbs out
    longL:  pose({ y: -0.5, lean: -0.75, head: 0.3, aF: [-0.6, 0.6], aB: [-1.3, 0.5], lF: [1.62, 0.0], lB: [-0.4, -1.3] }),   // one long leg straight out
    longW:  pose({ y: -0.5, lean: -0.1, aF: [1.2, 0.9], aB: [-1.0, 0.7], lF: [1.4, -2.2], lB: [-0.3, -0.9] }),                 // knee chambered
    copter: pose({ y: -0.6, lean: 0.0, aF: [2.9, 0.4], aB: [-2.9, 0.4], lF: [0.25, -0.3], lB: [-0.25, -0.3] }),
    pogo:   pose({ y: -3, lean: 0.0, aF: [0.05, 0.0], aB: [0.1, 0.1], lF: [0.15, -0.1], lB: [-0.15, -0.1] }),       // straight as a stick, plunger first
    horn:   pose({ y: 1, lean: -0.35, head: -0.2, aF: [1.75, 0.6], aB: [1.6, 0.9], lF: [0.8, -0.3], lB: [-0.9, -0.1] }),       // leaning back into the blast
    balloon:pose({ y: -0.5, lean: 0.05, aF: [3.0, 0.1], aB: [-1.2, 0.8], lF: [0.5, -0.9], lB: [-0.2, -0.5] }),               // one hand on the string
  };

  const brave = S => (S.braveT || 0) > 0;
  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set(), n: 0 }, o || {}); }
  function box(p, f, dx, w, h, dy) {
    const x0 = f > 0 ? pcx(p) + dx : pcx(p) - dx - w, y0 = pcy(p) - (dy || 0) - h / 2;
    return FK.foes().filter(e => ex(e) + (e.w || 0.9) / 2 > x0 && ex(e) - (e.w || 0.9) / 2 < x0 + w && ey(e) + (e.h || 0.9) / 2 > y0 && ey(e) - (e.h || 0.9) / 2 < y0 + h);
  }
  function nerve(S, p, n, why) {
    const was = S.nerve; S.nerve = Math.min(NERVE_MAX, S.nerve + n);
    if (S.nerve > was) { FK.label(S, p, '+NERVE' + (why ? ' · ' + why : ''), C_NERVE, false); FK.tone(660 + S.nerve * 140, { dur: 0.12, vol: 0.08, type: 'triangle' }); S.pipFlash = 0.5; }
  }
  function hit(S, e, dmg, o) {
    o = Object.assign({ c: brave(S) ? C_GOLD : C_JAK }, o);
    FK.hit(S, e, dmg * (brave(S) ? 1.4 : 1), o);
    if (++S.hitN >= HITS_PER_NERVE) { S.hitN = 0; nerve(S, window._gamePlayer || { x: 0, y: 0, w: 0, h: 0 }, 1); }
  }
  function pop() { FK.tone(620, { dur: 0.08, vol: 0.14, type: 'square', slide: 1240 }); FK.noise({ dur: 0.05, cut: 1800, q: 4, vol: 0.14 }); }
  function yelp() { FK.tone(900, { dur: 0.16, vol: 0.12, type: 'square', slide: 1700 }); FK.tone(1300, { dur: 0.1, vol: 0.06, type: 'triangle', delay: 0.05, slide: 2000 }); }
  function hand(p, q, f) { const u = p.h / U, K = FK.skel(P, q, 0, 0, u), h = K.aF[2]; return [pcx(p) + f * h[0], p.y + p.h + h[1]]; }
  function toe(p, q, f) { const u = p.h / U, K = FK.skel(P, q, 0, 0, u), h = K.lF[2]; return [pcx(p) + f * h[0], p.y + p.h + h[1]]; }
  function nearestFoe(p, R) { let best = null, bd = R; for (const e of FK.foes()) { const d = Math.hypot(ex(e) - pcx(p), ey(e) - pcy(p)); if (d < bd) { bd = d; best = e; } } return best; }

  const SEQ = {
    // ---- CHARGED SPECIALS (hold S to full) ----
    volley(p, dt, S, q) {   // PLUNGER VOLLEY: three plungers fanned out; each sticks to a foe and holds it dazed
      S.target = PO.aim; S.rate = 50;
      if (!q.done && q.t > 0.08) { q.done = 1; for (const a of [-0.28, 0, 0.28]) { const h = hand(p, PO.aim, q.f); S.darts.push({ x: h[0], y: h[1], vx: q.f * Math.cos(a) * 20, vy: Math.sin(a) * 20, t: 0, e: null }); } pop(); FK.whoosh(false, true); }
      if (q.t > 0.3) S.seq = null;
    },
    sling(p, dt, S, q) {   // SLINGSHOT: plunger stuck to the floor behind, the cord stretched... and he lets go across the stage
      const f = q.f;
      if (q.t < 0.35) { S.target = PO.cower; S.rate = 30; p.vx = 0; S.slingT = q.t / 0.35; if (!q.snd) { q.snd = 1; q.ax = pcx(p) - f * 1.2; q.ay = p.y + p.h; } S.slingA = [q.ax, q.ay]; if (Math.floor(q.t * 20) !== q.d) { q.d = Math.floor(q.t * 20); FK.tone(200 + q.t * 900, { dur: 0.04, vol: 0.05, type: 'triangle' }); } return; }
      if (!q.go) { q.go = 1; S.slingA = null; FK.tone(900, { dur: 0.15, vol: 0.14, type: 'square', slide: 200 }); FK.whoosh(false, true); }
      S.target = PO.longL; S.rate = 60; S.selfMove = true;
      if (!FK.moveX(p, f * 30 * dt)) q.t = 9;
      p.vx = f * 6; p.vy = Math.min(p.vy, 0);
      for (const e of box(p, f, -0.5, 1.6, 1.4)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 4, { kx: f * 13, ky: -8, stun: 0.5, big: true, stop: 0.06 }); FK.smack(true); }
      if (q.t > 0.62) { S.slingT = 0; S.seq = null; }
    },
    stilts(p, dt, S, q) {   // SKYSCRAPER: his legs telescope out, longer and longer, lifting him high; then he springs off the top
      S.target = PO.idle; S.rate = 30; S.legK = 1 + Math.min(1, q.t / 0.45) * 2.2; p.vx = 0;
      if (q.t < 0.45) { p.vy = -9; p.onGround = false; for (const e of FK.within(pcx(p), p.y - 0.3, 1.3)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2, { kx: 0, ky: -14, stun: 0.4 }); } return; }
      if (!q.done) { q.done = 1; p.vy = -19; S.airUp = false; FK.tone(300, { dur: 0.3, vol: 0.14, type: 'square', slide: 1200 }); for (const e of FK.within(pcx(p), p.y - 0.5, 1.8)) hit(S, e, 4, { kx: 0, ky: -20, stun: 0.5, big: true, stop: 0.07 }); }
      S.legK = Math.max(1, S.legK - dt * 8);
      if (q.t > 0.65) { S.legK = 1; S.seq = null; }
    },
    panic(p, dt, S, q) {   // PANIC ATTACK: he completely loses it: arms and legs everywhere, then a scream that blasts everyone away
      S.target = Math.floor(q.t * 26) % 2 ? PO.pinA : PO.eep; S.rate = 70; p.vx = 0; if (!p.onGround) p.vy = Math.min(p.vy, 1);
      S.panic = 1;
      if (Math.floor(q.t / 0.07) !== q.n) { q.n = Math.floor(q.t / 0.07); q.hits.clear(); if (q.n % 3 === 0) yelp(); }
      if (q.t < 0.8) for (const e of FK.within(pcx(p), pcy(p), 1.7)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 0.6, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 1.5, ky: -2, stun: 0.25 }); }
      if (q.t >= 0.8 && !q.done) {
        q.done = 1; S.hornT = 0.5; S.hornF = 0;
        FK.tone(1100, { dur: 0.5, vol: 0.18, type: 'sawtooth', slide: 1600 }); FK.shake(10);
        for (const e of FK.within(pcx(p), pcy(p), 3.4)) hit(S, e, 3, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 14, ky: -9, stun: 0.9, big: true });
        nerve(S, p, 1, 'PANIC');
      }
      if (q.t > 1.0) { S.panic = 0; S.seq = null; }
    },
    whirl(p, dt, S, q) {   // SCARF WHIRLWIND (air): the scarf lashes out long and whips round him twice
      S.target = PO.copter; S.rate = 50; S.whirl = q.t * 14 * q.f; p.vy = Math.min(p.vy, 1.5);
      if (Math.floor(q.t / 0.1) !== q.n) { q.n = Math.floor(q.t / 0.1); q.hits.clear(); FK.whoosh(false, false); }
      const a = S.whirl, tx = pcx(p) + Math.cos(a) * 2.2, ty = pcy(p) - 0.4 + Math.sin(a) * 1.4;
      for (const e of FK.foes()) if (!q.hits.has(e) && Math.hypot(ex(e) - (pcx(p) + tx) / 2, ey(e) - (pcy(p) + ty) / 2) < 1.4) { q.hits.add(e); hit(S, e, 1.2, { kx: Math.cos(a + Math.PI / 2) * 6 * q.f, ky: -5, stun: 0.3 }); }
      if (q.t > 0.9) { for (const e of FK.within(pcx(p), pcy(p), 2.4)) hit(S, e, 2.5, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 11, ky: -9, stun: 0.45, big: true }); S.whirl = 0; S.seq = null; }
    },
    zipline(p, dt, S, q) {   // ZIPLINE (air): the plunger shoots down and ahead, sticks, and he zips along the cord feet first
      const f = q.f;
      if (!q.c) {
        let x = pcx(p), y = pcy(p), hitWall = false;
        for (let i = 0; i < 40; i++) { x += f * 0.22; y += 0.16; if (FK.blocked(x - 0.1, y - 0.1, 0.2, 0.2)) { hitWall = true; break; } }
        q.c = { x, y, ok: hitWall }; S.cup = { x, y, state: 'wall' }; pop();
        if (!hitWall) { S.cup = null; S.seq = null; FK.msg('🪠 Nothing to stick to'); return; }
      }
      S.target = PO.longL; S.rate = 60; S.selfMove = true;
      const dx = q.c.x - pcx(p), dy = q.c.y - pcy(p) - 0.4, d = Math.hypot(dx, dy) || 1;
      p.vx = dx / d * 24; p.vy = dy / d * 24; p.onGround = false;
      for (const e of FK.within(pcx(p) + f * 0.4, pcy(p) + 0.3, 1.1)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 3.5, { kx: f * 11, ky: 6, stun: 0.5, big: true }); FK.smack(true); }
      if (d < 0.9 || q.t > 0.8) { S.cup = null; p.vy = -10; p.vx = f * 3; S.airUp = false; S.seq = null; }
    },
    turbo(p, dt, S, q) {   // TURBO FLUTTER (air): legs a blur, he runs straight up the air; whatever is below gets kicked down
      S.target = Math.floor(q.t * 30) % 2 ? PO.flutA : PO.flutB; S.rate = 70; S.airUp = true;
      p.vy = -12 + 6 * (q.t / 0.8); const k = FK.keys(); p.vx = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 4; p.onGround = false;
      if (Math.floor(q.t * 18) !== q.d) { q.d = Math.floor(q.t * 18); FK.tone(300 + q.t * 600, { dur: 0.04, vol: 0.06, type: 'square' }); S.fx.push({ k: 'drops', x: pcx(p), y: p.y + p.h, t: 0, life: 0.3 }); }
      if (Math.floor(q.t / 0.09) !== q.n) { q.n = Math.floor(q.t / 0.09); q.hits.clear(); }
      for (const e of box(p, 1, -0.8, 1.6, 1.6, -1.0)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 0.8, { kx: 0, ky: 9, stun: 0.3 }); }
      if (q.t > 0.8) S.seq = null;
    },
    piledriver(p, dt, S, q) {   // PLUNGER PILEDRIVER (air): plunger onto the foe below, flips them over his head and drives them into the floor
      if (q.e) {
        const e = q.e; S.target = PO.backK; S.rate = 40; p.vy = 18; p.vx = 0; p._grabInv = 0.1;
        if (!e.dead) { e.x = pcx(p) - (e.w || 0.9) / 2; e.y = p.y - (e.h || 0.9) * 0.3; e.vx = 0; e.vy = 0; e.stunTimer = Math.max(e.stunTimer || 0, 0.3); }
        if (p.onGround || q.t - q.grabT > 0.8) {
          if (!e.dead) hit(S, e, 7, { kx: FK.face(p) * 4, ky: -14, stun: 0.7, big: true, stop: 0.14, shake: 14 });
          FK.thud(true); S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: 2.4, c: C_NERVE, t: 0, life: 0.5 });
          for (const o of FK.within(pcx(p), p.y + p.h - 0.4, 2.4)) if (o !== e) hit(S, o, 2, { kx: (Math.sign(ex(o) - pcx(p)) || 1) * 6, ky: -9, stun: 0.4 });
          FK.label(S, p, 'PILEDRIVER!', C_NERVE, true); p.vy = -8; p.onGround = false; S.pogo = 0; S.seq = null;
        }
        return;
      }
      S.target = PO.pogo; S.rate = 50; S.pogo = 1;
      if (q.t < 0.12) { p.vy = 0; p.vx = 0; return; }
      p.vy = 24;
      for (const e of box(p, 1, -0.6, 1.2, 1.4, -0.75)) { q.e = e; q.grabT = q.t; pop(); p.vy = -6; S.pogo = 0; FK.tone(200, { dur: 0.2, vol: 0.14, type: 'square', slide: 500 }); return; }
      if (p.onGround || q.t > 1.4) { p.vy = -24; p.onGround = false; S.airUp = false; FK.label(S, p, 'SUPER SPROING!', C_NERVE, true); FK.tone(200, { dur: 0.4, vol: 0.2, type: 'square', slide: 1400 }); S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: 1.8, c: C_NERVE, t: 0, life: 0.4 }); S.pogo = 0; S.seq = null; }
    },
    jab(p, dt, S, q) {   // JITTER JAB: a nervous flurry of long plunger pokes; the last one pops (BRAVE: more, ending in a SUCTION POP)
      const f = q.f, n = 3 + Math.round(q.pw) + (brave(S) ? 2 : 0), P1 = 0.085;
      const ph = (q.t / P1) % 1, on = ph > 0.35, i = Math.floor(q.t / P1);
      S.target = on ? pose(Object.assign({}, PO.poke, { y: PO.poke.y + (i % 2) * 0.8, aF: [1.6 + (i % 2 ? 0.12 : -0.1), 0.02] })) : PO.pokeW; S.rate = 60;
      if (i !== q.n && i < n) { q.n = i; q.hits.clear(); FK.whoosh(false, false); }
      const last = q.n === n - 1;
      if (on) for (const e of box(p, f, 0, 2.3, 1.0, 0.1)) if (!q.hits.has(e)) {
        q.hits.add(e);
        hit(S, e, last ? 1.5 + q.pw + (brave(S) ? 1 : 0) : 0.7, { kx: f * (last ? 9 + (brave(S) ? 4 : 0) : 1.5), ky: last ? -6 : -1.5, stun: last ? 0.4 : 0.25, big: last });
        pop(); if (last && brave(S)) FK.label(S, p, 'SUCTION POP!', C_GOLD, true);
      }
      if (q.t > n * P1 + 0.06) S.seq = null;
    },
    line(p, dt, S, q) {   // PLUNGER LINE / SUCTION SWING: the plunger flies out on its cord (BRAVE: the reeled foe is slammed over his head)
      const f = q.f, R = 6.5 + 2 * q.pw, air = q.air;
      S.target = air ? PO.swing : PO.aim; S.rate = 45;
      if (!q.cup) { const h = hand(p, PO.aim, f); q.cup = { x: h[0], y: h[1] - (air ? 0.4 : 0), vx: f * 26, vy: air ? -10 : 0, d: 0, state: 'out' }; FK.whoosh(false, false); }
      const c = q.cup; S.cup = c;
      if (c.state === 'out') {
        c.x += c.vx * dt; c.y += c.vy * dt; c.d += Math.hypot(c.vx, c.vy) * dt;
        for (const e of FK.foes()) if (Math.abs(ex(e) - c.x) < 0.6 && Math.abs(ey(e) - c.y) < 0.7) { c.state = 'foe'; c.e = e; pop(); hit(S, e, 1.5, { kx: 0, ky: 0, stun: 0.6 }); break; }
        if (c.state === 'out' && FK.blocked(c.x - 0.1, c.y - 0.1, 0.2, 0.2)) { c.state = 'wall'; pop(); }
        if (c.state === 'out' && c.d > R) c.state = 'back';
        q.t2 = 0;
      } else if (c.state === 'foe') {   // reel the foe in, then a kick (or, BRAVE, an overhead slam behind him)
        q.t2 += dt; const e = c.e;
        if (!e || e.dead) { S.cup = null; S.seq = null; return; }
        c.x = ex(e); c.y = ey(e);
        if (!e._noKnockback) { e.vx = -f * 15; e.vy = -3; }
        if (Math.abs(ex(e) - pcx(p)) < 1.4 || q.t2 > 0.4) {
          if (brave(S)) { hit(S, e, 3 + q.pw, { kx: -f * 11, ky: -12, stun: 0.6, big: true, stop: 0.07 }); FK.label(S, p, 'OVERHEAD SLAM!', C_GOLD, true); FK.thud(true); }
          else { hit(S, e, 2 + q.pw, { kx: f * 10, ky: -8, stun: 0.45, big: true }); FK.smack(true); }
          S.cup = null; S.seq = null;
        }
      } else if (c.state === 'wall') {   // pull himself to the wall
        q.t2 += dt; S.selfMove = true;
        const dx = c.x - pcx(p), dy = c.y - pcy(p), d = Math.hypot(dx, dy) || 1;
        p.vx = dx / d * 20; p.vy = dy / d * 20 - 2; p.onGround = false;
        if (d < 1.1 || q.t2 > 0.6) { p.vy = -9; p.vx *= 0.4; S.airUp = false; S.cup = null; S.seq = null; }
      } else {   // reel back
        const h = hand(p, PO.aim, f), dx = h[0] - c.x, dy = h[1] - c.y, d = Math.hypot(dx, dy) || 1;
        c.x += dx / d * 30 * dt; c.y += dy / d * 30 * dt;
        if (d < 0.6) { S.cup = null; S.seq = null; }
      }
      if (q.t > 1.6) { S.cup = null; S.seq = null; }
    },
    stilt(p, dt, S, q) {   // STILT KICK: crouch, then one long leg kicked straight up. The toe is a sweet spot.
      S.target = q.t < 0.1 ? PO.scisA : PO.scisB; S.rate = 50;
      if (q.t < 0.1 && p.vy < 0) p.vy = 0;
      if (q.t >= 0.1 && !q.done) { q.done = 1; p.vy = -9 - 3 * q.pw - (brave(S) ? 5 : 0); p.onGround = false; FK.whoosh(true, q.pw > 0.3); }
      if (q.t >= 0.1 && q.t < 0.3) {
        const tp = toe(p, PO.scisB, FK.face(p));
        for (const e of box(p, FK.face(p), -0.3, 1.4, 2.6, 1.1)) if (!q.hits.has(e)) {
          q.hits.add(e);
          const tip = Math.abs(ey(e) - tp[1]) < 0.75 && Math.abs(ex(e) - tp[0]) < 0.8;
          hit(S, e, (tip ? 3.5 : 2) + 2 * q.pw, { kx: FK.face(p) * 1.5, ky: tip ? -18 - 3 * q.pw : -12, stun: 0.5, big: true, stop: tip ? 0.07 : 0 });
          if (tip) FK.label(S, p, 'TOE TIP!', C_NERVE, true); FK.smack(true);
        }
      }
      if (q.t > 0.4) S.seq = null;
    },
    cover(p, dt, S, q) {   // DUCK & COVER: he balls up. A hit in this moment: he slips behind the attacker and mule-kicks them
      p.vx = 0;
      if (!q.armed) { q.armed = 1; p._parryT = 0.4; p._dodgeT = 0.4; FK.tone(420, { dur: 0.12, vol: 0.1, type: 'square', slide: 260 }); }
      if (q.kick) {   // the counter: behind them, a kick back into them
        S.target = PO.backK; S.rate = 55;
        if (!q.kicked && q.t - q.kick > 0.06) {
          q.kicked = 1; const e = q.e;
          if (e && !e.dead) hit(S, e, 3 + (brave(S) ? 1 : 0), { kx: -q.f2 * 12, ky: -9, stun: 0.55, big: true, stop: 0.08 });
          FK.smack(true);
        }
        if (q.t - q.kick > 0.3) S.seq = null;
        return;
      }
      S.target = PO.cover; S.rate = 40;
      if (q.t > 0.55) S.seq = null;
    },
    pinwheel(p, dt, S, q) {   // PINWHEEL: a star of long limbs, spinning; many small hits and a fling at the end
      const D = 0.42 + 0.12 * q.pw;
      S.target = PO.pinA; S.rate = 60; S.rot = q.t / D * Math.PI * 4 * q.f;
      p.vy = Math.min(p.vy, 1.5);
      if (Math.floor(q.t / 0.08) !== q.n) { q.n = Math.floor(q.t / 0.08); q.hits.clear(); FK.whoosh(false, false); }
      for (const e of FK.within(pcx(p), pcy(p), 1.75)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 0.7, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 2.5, ky: -3, stun: 0.22 }); }
      if (q.t > D) {
        for (const e of FK.within(pcx(p), pcy(p), 1.9)) hit(S, e, 1.5 + q.pw, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 9, ky: -7, stun: 0.4, big: true });
        S.rot = 0; S.seq = null;
      }
    },
    longleg(p, dt, S, q) {   // LONG LEG: a chambered knee, then the longest kick in the cast. The toe (far end) tips.
      const f = q.f, W = 0.08;
      S.target = q.t < W ? PO.longW : PO.longL; S.rate = q.t < W ? 40 : 70;
      p.vy = Math.min(p.vy, 1);
      if (q.t >= W && q.t < W + 0.14) {
        if (!q.snd) { q.snd = 1; FK.whoosh(false, true); }
        for (const e of box(p, f, 0.3, 2.3, 1.0, 0.05)) if (!q.hits.has(e)) {
          q.hits.add(e);
          const along = (ex(e) - pcx(p)) * f, tip = along > 1.55;
          hit(S, e, (tip ? 3.5 : 1.8) + q.pw, { kx: f * (tip ? 15 : 6), ky: tip ? -8 : -4, stun: tip ? 0.5 : 0.3, big: tip, stop: tip ? 0.08 : 0 });
          if (tip) FK.label(S, p, 'TOE TIP!', C_NERVE, true); FK.smack(tip);
        }
      }
      if (q.t > W + 0.26) S.seq = null;
    },
    copter(p, dt, S, q) {   // SCARF COPTER: the scarf spins overhead like a rotor
      const k = FK.keys(), D = brave(S) ? 0.85 : 0.65;
      S.target = PO.copter; S.rate = 40; S.rotor = q.t;
      p.vy = -(10.5 - 8 * q.t / D); p.vx = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 6.5; p.onGround = false;
      if (Math.floor(q.t * 16) !== q.d) { q.d = Math.floor(q.t * 16); FK.whoosh(true, false); }
      for (const e of FK.within(pcx(p), p.y - 0.2, 1.4)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 1.5, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 5, ky: -10, stun: 0.35 }); }
      if (q.t > D) { S.rotor = 0; S.seq = null; }
    },
    pogo(p, dt, S, q) {   // PLUNGER POGO: straight down plunger first. On a foe: it sticks, spikes them, and he springs off sky-high
      S.target = PO.pogo; S.rate = 50; S.pogo = 1;
      if (q.t < 0.1) { p.vy = Math.min(p.vy, 0) * 0.3; p.vx *= 0.6; return; }
      p.vy = 21; if (!q.snd) { q.snd = 1; FK.whoosh(false, true); }
      for (const e of box(p, 1, -0.55, 1.1, 1.3, -0.75)) if (!q.hits.has(e)) {
        q.hits.add(e); pop();
        hit(S, e, 3 + q.pw, { kx: 0, ky: 17, stun: 0.55, big: true, stop: 0.07 });
        p.vy = -16 - 2 * q.pw - (brave(S) ? 3 : 0); p.onGround = false; S.airUp = false;
        S.fx.push({ k: 'ring', x: pcx(p), y: p.y + p.h, R: 1.2, c: C_NERVE, t: 0, life: 0.3 });
        FK.label(S, p, 'SPROING!', C_NERVE, true); FK.tone(240, { dur: 0.3, vol: 0.18, type: 'square', slide: 1100 });
        S.pogo = 0; S.seq = null; return;
      }
      if (p.onGround || q.t > 1.3) {   // the floor: a smaller bounce
        FK.thud(false); S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: 1.3, c: C_JAK, t: 0, life: 0.35 });
        for (const e of FK.within(pcx(p), p.y + p.h - 0.4, 1.3)) hit(S, e, 1.5, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 5, ky: -8, stun: 0.35 });
        if (p.onGround) { p.vy = -10; p.onGround = false; }
        S.pogo = 0; S.seq = null;
      }
    },
    horn(p, dt, S, q) {   // AIR HORN: a deafening blast in front
      const f = q.f;
      S.target = PO.horn; S.rate = 50;
      if (!q.done && q.t > 0.06) {
        q.done = 1; S.hornT = 0.5; S.hornF = f;
        FK.tone(330, { dur: 0.55, vol: 0.22, type: 'sawtooth' }); FK.tone(415, { dur: 0.55, vol: 0.16, type: 'sawtooth' }); FK.shake(8);
        for (const e of FK.foes()) {
          const along = (ex(e) - pcx(p)) * f, side = Math.abs(ey(e) - pcy(p));
          if (along > -0.3 && along < 4.8 && side < 1 + along * 0.45) hit(S, e, 1, { kx: f * (16 - along * 1.5), ky: -6, stun: 1.0, big: true });
        }
        if (!FK.blocked(p.x - f * 0.2, p.y + 0.02, p.w, p.h - 0.04)) p.vx = -f * 6;   // the blast knocks him back a little too
      }
      if (q.t > 0.4) S.seq = null;
    },
  };

  // ---------------------------------------------------------------- gadgets (K / 🎒 + a direction)
  function useGadget(which, S, p) {
    if (!S || !p) return;
    const k = FK.keys();
    which = which || (k.up && !k.down ? 'brave' : k.down ? 'trap' : (k.left || k.right) ? 'horn' : 'balloon');
    const G = GADGETS[which];
    if (which === 'brave' && brave(S)) { FK.msg('💛 Already brave!'); return; }
    if (S.nerve < G.cost) { FK.msg('🎒 ' + G.icon + ' ' + G.name + ' needs ' + G.cost + ' Nerve (you have ' + S.nerve + ')'); FK.tone(200, { dur: 0.1, vol: 0.08, type: 'square' }); return; }
    if (S.seq && which !== 'balloon') return;
    S.nerve -= G.cost;
    const f = k.right ? 1 : k.left ? -1 : FK.face(p);
    FK.label(S, p, G.icon + ' ' + G.name + '!', which === 'brave' ? C_GOLD : C_NERVE, true); FK.msg(G.icon + ' ' + G.name + '!');
    if (which === 'balloon') {
      S.balloon = { t: 0, life: 3, ph: Math.random() * 6, cool: new Map() }; p.vy = Math.min(p.vy, -4); p.onGround = false;
      FK.tone(500, { dur: 0.4, vol: 0.1, type: 'sine', slide: 900 });
    } else if (which === 'horn') { p.dashDir = f; p.lastMoveDir = f; startSeq(S, 'horn', { f }); }
    else if (which === 'trap') {
      const fy = p.onGround ? p.y + p.h : FK.floorAt(pcx(p), p.y + p.h, 8);
      if (fy == null) { S.nerve += G.cost; FK.msg('🪤 No floor under you for the trap'); return; }
      S.trap = { x: pcx(p) + f * 0.9, fy, t: 0, life: 15, sprung: 0 };
      FK.tone(700, { dur: 0.08, vol: 0.12, type: 'square' }); FK.tone(500, { dur: 0.08, vol: 0.12, type: 'square', delay: 0.07 });
    } else if (which === 'brave') {
      S.braveT = BRAVE_T; S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 2.4, c: C_GOLD, t: 0, life: 0.5 });
      for (let i = 0; i < 4; i++) FK.tone(392 * Math.pow(1.26, i), { dur: 0.22, vol: 0.12, delay: i * 0.07, type: 'triangle' });
      FK.shake(6);
    }
  }
  const myState = () => (window.selectedCharacter === ID && H) ? H.state() : null;
  function pressGadget() { const S = myState(), p = window._gamePlayer; if (!S || !p || (window._gameMode && window._gameMode() !== 'play')) return; useGadget(null, S, p); }

  function stepWorld(p, dt, S, k) {
    const foes = FK.foes();
    // FLUTTER: hold jump while falling, once per jump
    const falling = !p.onGround && (p.vy || 0) > 0;
    if (p.onGround) S.flutT = 0;
    S.fluttering = false;
    if (falling && k.jump && !S.seq && !S.balloon && S.flutT < 0.85) {
      S.flutT += dt; p.vy = Math.max(-3.5, p.vy - 60 * dt); S.fluttering = true;
      if (Math.floor(S.flutT * 14) !== S.flutD) { S.flutD = Math.floor(S.flutT * 14); FK.tone(260 + S.flutT * 200, { dur: 0.05, vol: 0.05, type: 'square' }); }
    }
    // FLINCH: ready, not attacking, not brave: any hit that would land is dodged (FKit / Smash treat _dodgeT as a pure dodge)
    if (S.flinchCD > 0) S.flinchCD = Math.max(0, S.flinchCD - dt);
    if (S.flinchCD <= 0 && !S.seq && !brave(S) && !(p.hitstun > 0)) { p._parryT = Math.max(p._parryT || 0, 0.05); p._dodgeT = Math.max(p._dodgeT || 0, 0.05); }
    if (p._parried > 0 && !S.parrySeen) {
      S.parrySeen = true;
      const d = p._parryDir || FK.face(p);
      if (S.seq && S.seq.kind === 'cover' && !S.seq.kick) {   // DUCK & COVER worked: slip behind the attacker
        const q = S.seq, e = nearestFoe(p, 3.5);
        q.kick = q.t; q.f2 = e ? (Math.sign(pcx(p) - ex(e)) || -d) : -d; q.e = e;
        if (e) { const nx = ex(e) + (Math.sign(ex(e) - pcx(p)) || d) * ((e.w || 0.9) / 2 + p.w / 2 + 0.15) - p.w / 2; if (!FK.blocked(nx, p.y, p.w, p.h)) { p.x = nx; S.selfMove = true; } }
        p.dashDir = -q.f2 || 1; p.lastMoveDir = p.dashDir;
        FK.label(S, p, 'SIDESTEP!', C_NERVE, true); nerve(S, p, 1); FK.whoosh(false, false);
      } else {   // FLINCH: EEP! and a leap away from whatever it was
        S.flinchCD = FLINCH_CD; S.eepT = 0.4;
        p.vx = -d * 8; p.vy = -8.5; p.onGround = false; S.selfMove = true;
        FK.label(S, p, 'EEP!', C_SWEAT, true); yelp(); nerve(S, p, 1, 'FLINCH');
        S.fx.push({ k: 'drops', x: pcx(p), y: p.y, t: 0, life: 0.5 });
      }
    }
    if (!(p._parried > 0)) S.parrySeen = false;
    if (S.eepT > 0) S.eepT -= dt;
    // BRAVE HEART: super armor on his own moves
    if (brave(S)) { S.braveT = Math.max(0, S.braveT - dt); if (S.seq) p._armorT = Math.max(p._armorT || 0, 0.06); if (S.braveT <= 0) { FK.label(S, p, 'NERVOUS AGAIN', '#cfd6e6', false); FK.tone(440, { dur: 0.3, vol: 0.08, slide: 220 }); } }
    // BALLOON: float up, steer; bonks foes it touches; popped when he is hit
    if (S.balloon) {
      const B = S.balloon; B.t += dt;
      p.vy = Math.max(-4.5, Math.min(p.vy, 1) - 30 * dt); p.onGround = false; S.airUp = false; S.flutT = 0;
      if (FK.blocked(p.x, p.y - 1.6, p.w, 0.3)) p.vy = Math.max(p.vy, 0);   // under a ceiling: just hang there
      for (const [e, c] of B.cool) { if (c - dt <= 0) B.cool.delete(e); else B.cool.set(e, c - dt); }
      const bx = pcx(p) + 0.2, by = p.y - 1.4;
      for (const e of foes) if (!B.cool.has(e) && Math.hypot(ex(e) - bx, ey(e) - by) < 1.1) { B.cool.set(e, 0.6); hit(S, e, 1, { kx: (Math.sign(ex(e) - bx) || 1) * 7, ky: -6, stun: 0.3 }); FK.tone(300, { dur: 0.1, vol: 0.1, type: 'sine', slide: 600 }); }
      const hurt = (S.lastHp != null && p.hp < S.lastHp) || (p.hitstun > 0 && !S.wasStun);
      if (B.t > B.life || hurt) { S.balloon = null; FK.noise({ dur: 0.08, cut: 2500, q: 2, vol: 0.3 }); S.fx.push({ k: 'ring', x: bx, y: by, R: 0.9, c: '#ff5a6e', t: 0, life: 0.25 }); }
    }
    S.lastHp = p.hp; S.wasStun = p.hitstun > 0;
    // SPRING TRAP: the first foe to step on it is flung sky-high
    if (S.trap) {
      const T = S.trap; T.t += dt;
      if (T.sprung > 0) { T.sprung -= dt; if (T.sprung <= 0) S.trap = null; }
      else {
        for (const e of foes) if (Math.abs(ex(e) - T.x) < 0.55 + (e.w || 0.9) / 2 && Math.abs(e.y + (e.h || 0.9) - T.fy) < 0.5) {
          hit(S, e, 2, { kx: 0, ky: -19, stun: 1.0, big: true, stop: 0.06 }); T.sprung = 0.4;
          FK.tone(180, { dur: 0.35, vol: 0.2, type: 'square', slide: 1200 }); S.fx.push({ k: 'ring', x: T.x, y: T.fy - 0.3, R: 1.2, c: C_NERVE, t: 0, life: 0.3 });
          break;
        }
        if (S.trap && T.t > T.life) S.trap = null;
      }
    }
    if (S.hornT > 0) S.hornT -= dt;
    // VOLLEY plungers: fly, stick to a foe and hold it dazed for a moment
    for (let i = S.darts.length - 1; i >= 0; i--) {
      const d = S.darts[i]; d.t += dt;
      if (d.e) { if (d.e.dead || d.t > 1.4) { S.darts.splice(i, 1); continue; } d.x = ex(d.e); d.y = ey(d.e); d.e.vx = 0; d.e.stunTimer = Math.max(d.e.stunTimer || 0, 0.2); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt;
      let gone = d.t > 0.5 || FK.blocked(d.x - 0.1, d.y - 0.1, 0.2, 0.2);
      if (!gone) for (const e of foes) if (Math.abs(ex(e) - d.x) < 0.6 && Math.abs(ey(e) - d.y) < 0.7) { d.e = e; d.t = 0; hit(S, e, 2.5, { kx: 0, ky: -2, stun: 1.2 }); pop(); break; }
      if (gone) S.darts.splice(i, 1);
    }
    if (S.pipFlash > 0) S.pipFlash -= dt;
    // scared of anything close (he trembles)
    S.scared = !brave(S) && FK.foes().some(e => Math.hypot(ex(e) - pcx(p), ey(e) - pcy(p)) < 3.2);
  }

  const MOVES = {
    ground: { neutral: { name: 'Jitter Jab', big: 'JITTER FLURRY', cd: 0.3 }, side: { name: 'Plunger Line', cd: 0.5 }, up: { name: 'Stilt Kick', big: 'SKY STILT', cd: 0.45 }, down: { name: 'Duck & Cover', cd: 0.5 } },
    air:    { neutral: { name: 'Pinwheel', cd: 0.4 }, side: { name: 'Long Leg', cd: 0.35 }, up: { name: 'Scarf Copter', cd: 0.3 }, down: { name: 'Plunger Pogo', cd: 0.4 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;
  const named = (S, n) => brave(S) ? '💛 BRAVE ' + n : null;

  const H = FK.define({
    id: ID, plug: 'lbro',
    def: { name: 'L-Brother', icon: '🪠', tier: 'prismatic', color: C_JAK, color2: C_NERVE,
      ability: 'Scared of everything: he FLINCHES out of hits by himself, turns fear into NERVE, and spends it on pocket gadgets (Balloon, Air Horn, Spring Trap, Brave Heart)',
      desc: 'The younger brother: tall, thin, jumpy and scared of everything, with a knit beanie, a long scarf and a plunger on a cord. Hold jump while falling to FLUTTER. FLINCH: when a hit is about to land while he isn\'t attacking, he yelps and leaps out of the way (then 6 s to come back: the sweat drop shows it is ready). Every flinch, every Duck & Cover that works and every 6 hits give him NERVE (3 pips over his head). Spend it with K / 🎒: 🎈 Balloon (1, float up out of trouble), 📯 Air Horn with ←/→ (2, blasts everyone back, dazed), 🪤 Spring Trap with ↓ (2, flings the first foe to step on it), 💛 Brave Heart with ↑ (3, 9 s of courage: +40% damage, super armor on his moves, and BRAVE versions of them). Moves: Jitter Jab, Plunger Line, Stilt Kick, Duck & Cover; in the air Pinwheel, Long Leg (the longest kick there is: the toe tips), Scarf Copter and Plunger Pogo.' },
    stats: { speed: 1.08, jump: 1.25, maxJumps: 2, maxDashes: 1, hp: 3 },
    statMod: S => brave(S) ? { speed: 1.2, jump: 1.3 } : {},
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, rotor: 0, rot: 0, pogo: 0, cup: null, flutT: 0, airUp: false,
      darts: [], legK: 1, slingT: 0, slingA: null, panic: 0, whirl: 0, nerve: 0, hitN: 0, flinchCD: 0, braveT: 0, eepT: 0, balloon: null, trap: null, hornT: 0, hornF: 1, scared: false, parrySeen: false, pipFlash: 0 }),
    busy: S => !!S.seq,
    charged: {
      neutral: (p, f, S, air) => { startSeq(S, air ? 'whirl' : 'volley', { f }); return air ? 'SCARF WHIRLWIND' : 'PLUNGER VOLLEY'; },
      side: (p, f, S, air) => { startSeq(S, air ? 'zipline' : 'sling', { f }); return air ? 'ZIPLINE' : 'SLINGSHOT'; },
      up: (p, f, S, air) => { S.airUp = true; startSeq(S, air ? 'turbo' : 'stilts', { f }); return air ? 'TURBO FLUTTER' : 'SKYSCRAPER'; },
      down: (p, f, S, air) => { startSeq(S, air ? 'piledriver' : 'panic', { f }); return air ? 'PLUNGER PILEDRIVER' : 'PANIC ATTACK'; },
    },
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Scarf Copter comes back when you land'; return null; },
    act: {
      ground_neutral: (p, f, pw, S) => { startSeq(S, 'jab', { f, pw }); return named(S, 'JITTER JAB'); },
      ground_side: (p, f, pw, S) => { startSeq(S, 'line', { f, pw }); return named(S, 'PLUNGER LINE'); },
      ground_up: (p, f, pw, S) => { startSeq(S, 'stilt', { f, pw }); return named(S, 'STILT KICK'); },
      ground_down: (p, f, pw, S) => startSeq(S, 'cover', { f, pw }),
      air_neutral: (p, f, pw, S) => { startSeq(S, 'pinwheel', { f, pw }); return named(S, 'PINWHEEL'); },
      air_side: (p, f, pw, S) => { startSeq(S, 'longleg', { f, pw }); return named(S, 'LONG LEG'); },
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'copter', { f, pw }); },
      air_down: (p, f, pw, S) => { startSeq(S, 'pogo', { f, pw }); return named(S, 'PLUNGER POGO'); },
    },
    onTeleport(p, S) { S.darts.length = 0; S.seq = null; S.cup = null; S.rotor = 0; S.rot = 0; S.pogo = 0; S.balloon = null; S.trap = null; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq) { S.seq = null; S.cup = null; S.rotor = 0; S.rot = 0; S.pogo = 0; }
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      if (!S.seq) { S.rotor = 0; S.rot = 0; S.pogo = 0; S.cup = null; S.legK = 1; S.slingT = 0; S.slingA = null; S.panic = 0; S.whirl = 0; }
      stepWorld(p, dt, S, k);
      if (!S.seq) {
        if (S.eepT > 0) S.target = PO.eep;
        else if (S.balloon) S.target = PO.balloon;
        else if (S.fluttering) S.target = Math.floor(performance.now() / 70) % 2 ? PO.flutA : PO.flutB;
        else if (brave(S) && p.onGround && Math.abs(p.vx || 0) <= 0.8) S.target = PO.proud;
        else S.target = FK.locomotion(S, p, dt, PO, { lean: brave(S) ? 0.15 : 0.3 });
        if (S.fluttering || S.eepT > 0) S.rate = 40;
      }
      if (p.onGround) S.airUp = false;
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing: a tall thin worrier with a beanie, a long scarf and a plunger
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, B = S && brave(S);
      const s = ph / U, cx = px + pw / 2, fy = py + ph;
      ctx.save();
      // he trembles when something is close (not when brave)
      if (S && S.scared && !S.seq) ctx.translate(Math.sin(t * 55) * 0.5 * s, 0);
      if (S && S.rot) { ctx.translate(cx, fy - ph * 0.45); ctx.rotate(S.rot); ctx.translate(-cx, -(fy - ph * 0.45)); }
      if (S && S.pogo) { ctx.translate(cx, fy - ph * 0.5); ctx.rotate(Math.PI); ctx.translate(-cx, -(fy - ph * 0.5)); }   // upside down, plunger first
      const lk = S && S.legK > 1 ? S.legK : 1;   // SKYSCRAPER: telescoping legs
      const K = FK.skel(lk > 1 ? Object.assign({}, P, { th: P.th * lk, sh: P.sh * lk, hip: P.hip * lk }) : P, q, cx, fy, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (B) { const ag = ctx.createRadialGradient(cx, fy - ph * 0.45, ph * 0.1, cx, fy - ph * 0.45, ph * 0.66); ag.addColorStop(0, 'rgba(255,207,58,0.38)'); ag.addColorStop(1, 'rgba(255,207,58,0)'); ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, fy - ph * 0.45, ph * 0.66, 0, Math.PI * 2); ctx.fill(); }
      // the scarf trails behind (a blazing gold cape when brave, a rotor in the copter)
      scarf(ctx, K, s, t, S, B);
      FK.limb(ctx, K.lB, 3.8 * s, C_BIB2, 3.6 * s);
      shoe(ctx, K.lB[2], s, 0.9);
      FK.limb(ctx, K.aB, 3.4 * s, C_JAK2, 3 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 2 * s, C_SKIN);
      // torso: a work shirt with rolled sleeves under long bib overalls (straps, brass buttons, an L patch on the bib)
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s, W = 11.5 * s;
      FK.blob(ctx, W, Lt + 1.5 * s, C_JAK, C_JAK2, 4 * s);
      ctx.shadowBlur = 0;
      const bg = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); bg.addColorStop(0, C_BIB2); bg.addColorStop(0.6, C_BIB); bg.addColorStop(1, '#7a85a2');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(-W / 2, -Lt * 0.45, W, Lt * 0.45 + 1.5 * s, [0, 0, 3 * s, 3 * s]); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-W * 0.32, -Lt * 0.78, W * 0.64, Lt * 0.4, 1.2 * s); ctx.fill();
      ctx.fillRect(-W * 0.38, -Lt - 0.5 * s, 1.8 * s, Lt * 0.3); ctx.fillRect(W * 0.38 - 1.8 * s, -Lt - 0.5 * s, 1.8 * s, Lt * 0.3);
      ctx.fillStyle = '#ffd166'; for (const bx of [-W * 0.25, W * 0.25]) { ctx.beginPath(); ctx.arc(bx, -Lt * 0.72, 0.95 * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = B ? C_GOLD : '#ffffff'; ctx.beginPath(); ctx.roundRect(-W * 0.17, -Lt * 0.66, W * 0.34, W * 0.3, 0.8 * s); ctx.fill();
      ctx.fillStyle = B ? '#a8410f' : C_JAK2; ctx.font = `900 ${W * 0.26}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('L', 0, -Lt * 0.66 + W * 0.155);
      // a bulging overall pocket: the gadgets live in there
      ctx.fillStyle = C_BIB2; ctx.beginPath(); ctx.roundRect(W * 0.08, -Lt * 0.36, W * 0.34, Lt * 0.24, 1 * s); ctx.fill();
      ctx.fillStyle = '#ff5a6e'; ctx.beginPath(); ctx.arc(W * 0.3, -Lt * 0.4, 0.9 * s, 0, Math.PI * 2); ctx.fill();   // a balloon poking out
      ctx.restore();
      ctx.shadowBlur = 0;
      FK.limb(ctx, K.lF, 4.0 * s, C_BIB, 3.8 * s);
      shoe(ctx, K.lF[2], s, 1);
      // head: long face, worried brows (set and determined when brave), a curl of hair at the back, the knit beanie with an L
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      const hr = K.hr;
      ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.ellipse(-hr * 0.55, hr * 0.1, hr * 0.45, hr * 0.65, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.ellipse(hr * 0.12, hr * 0.28, hr * 0.8, hr * 1.12, 0, 0, Math.PI * 2); ctx.fill();   // a long face and chin
      ctx.fillStyle = 'rgba(60,40,30,0.18)'; ctx.beginPath(); ctx.ellipse(hr * 0.2, hr * 1.05, hr * 0.42, hr * 0.28, 0, 0, Math.PI * 2); ctx.fill();   // stubble
      ctx.fillStyle = '#e8a985'; ctx.beginPath(); ctx.ellipse(-hr * 0.5, hr * 0.22, hr * 0.16, hr * 0.26, 0, 0, Math.PI * 2); ctx.fill();   // ear
      ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.moveTo(-hr * 0.75, -hr * 0.35); ctx.lineTo(-hr * 0.42, -hr * 0.35); ctx.lineTo(-hr * 0.36, hr * 0.5); ctx.lineTo(-hr * 0.66, hr * 0.38); ctx.closePath(); ctx.fill();   // sideburn
      const scared = S && !B && (S.fluttering || S.eepT > 0 || S.scared || (S.seq && S.seq.kind === 'cover'));
      for (const dx of [0.28, 0.66]) {   // small eyes; wide open when he panics, narrowed when brave
        const er = scared ? 0.15 : 0.12;
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(hr * dx, hr * 0.02, hr * er, hr * (B ? er - 0.03 : er + 0.03), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#26402f'; ctx.beginPath(); ctx.arc(hr * (dx + 0.03), hr * 0.04, hr * (scared ? 0.05 : 0.075), 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = C_MUST; ctx.lineWidth = hr * 0.09; ctx.lineCap = 'round';
      ctx.beginPath();
      if (B) { ctx.moveTo(hr * 0.12, -hr * 0.2); ctx.lineTo(hr * 0.42, -hr * 0.12); ctx.moveTo(hr * 0.52, -hr * 0.12); ctx.lineTo(hr * 0.84, -hr * 0.2); }   // determined
      else { ctx.moveTo(hr * 0.12, -hr * (scared ? 0.36 : 0.22)); ctx.lineTo(hr * 0.4, -hr * 0.3); ctx.moveTo(hr * 0.54, -hr * 0.3); ctx.lineTo(hr * 0.82, -hr * (scared ? 0.36 : 0.22)); }   // worried
      ctx.stroke();
      ctx.fillStyle = '#e8a985'; ctx.beginPath(); ctx.ellipse(hr * 0.82, hr * 0.32, hr * 0.17, hr * 0.27, 0.15, 0, Math.PI * 2); ctx.fill();   // a long nose
      ctx.fillStyle = '#7a3a2a'; ctx.beginPath();
      if (scared) ctx.ellipse(hr * 0.55, hr * 0.95, hr * 0.11, hr * 0.15, 0, 0, Math.PI * 2);
      else if (B) { ctx.ellipse(hr * 0.55, hr * 0.84, hr * 0.2, hr * 0.09, 0, 0, Math.PI); }   // a grin
      else ctx.ellipse(hr * 0.55, hr * 0.88, hr * 0.16, hr * 0.06, 0, 0, Math.PI);
      ctx.fill();
      const tw = Math.sin(t * 3) * hr * 0.03;
      ctx.fillStyle = C_MUST; ctx.beginPath(); ctx.moveTo(hr * 0.2, hr * 0.6);
      ctx.quadraticCurveTo(hr * 0.0, hr * 0.62, -hr * 0.06, hr * 0.42 + tw); ctx.quadraticCurveTo(hr * 0.12, hr * 0.62, hr * 0.32, hr * 0.5);
      ctx.quadraticCurveTo(hr * 0.55, hr * 0.42, hr * 0.78, hr * 0.5); ctx.quadraticCurveTo(hr * 1.0, hr * 0.62, hr * 1.12, hr * 0.42 - tw);
      ctx.quadraticCurveTo(hr * 1.08, hr * 0.66, hr * 0.88, hr * 0.68); ctx.quadraticCurveTo(hr * 0.55, hr * 0.6, hr * 0.2, hr * 0.6); ctx.fill();
      const hat = B ? C_GOLD : C_HAT, hat2 = B ? C_GOLD2 : C_HAT2;
      ctx.fillStyle = hat; ctx.beginPath(); ctx.moveTo(-hr * 0.85, -hr * 0.35); ctx.quadraticCurveTo(-hr * 0.9, -hr * 1.55, hr * 0.15, -hr * 1.55); ctx.quadraticCurveTo(hr * 1.0, -hr * 1.5, hr * 0.95, -hr * 0.35); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hat2; ctx.beginPath(); ctx.roundRect(-hr * 0.92, -hr * 0.5, hr * 1.95, hr * 0.32, hr * 0.12); ctx.fill();
      ctx.strokeStyle = hat2; ctx.lineWidth = hr * 0.06; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * hr * 0.3, -hr * 0.55); ctx.lineTo(i * hr * 0.28, -hr * 1.4); ctx.stroke(); }
      const bob = Math.sin(t * 6) * hr * 0.08;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-hr * 0.3, -hr * 1.65 + bob, hr * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hr * 0.45, -hr * 0.98, hr * 0.27, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hat2; ctx.font = `900 ${hr * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('L', hr * 0.45, -hr * 0.96);
      // the sweat drop: his flinch is ready
      if (S && S.flinchCD <= 0 && !B) { const dy = Math.sin(t * 3) * hr * 0.1; ctx.fillStyle = C_SWEAT; ctx.beginPath(); ctx.moveTo(-hr * 0.95, -hr * 0.6 + dy); ctx.quadraticCurveTo(-hr * 1.25, -hr * 0.1 + dy, -hr * 0.95, -hr * 0.05 + dy); ctx.quadraticCurveTo(-hr * 0.68, -hr * 0.1 + dy, -hr * 0.95, -hr * 0.6 + dy); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-hr * 1.0, -hr * 0.22 + dy, hr * 0.06, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      // front arm with the plunger (unless it is out on its cord)
      FK.limb(ctx, K.aF, 3.6 * s, C_JAK, 3.2 * s);
      const hx = K.aF[2][0], hy = K.aF[2][1], an = q.aF[0] + q.aF[1];
      if (!(S && S.cup)) { ctx.save(); ctx.translate(hx, hy); ctx.rotate(-an + Math.PI); if (S && S.seq && S.seq.kind === 'horn') airHorn(ctx, s); else plunger(ctx, s, B); ctx.restore(); }
      FK.mitt(ctx, hx, hy, 2.1 * s, C_SKIN);
      ctx.restore();
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T;
      if (S.trap) {   // the spring trap: a coil on a base plate, with a red trigger
        const Tr = S.trap, x = V.SX(Tr.x), y = V.SY(Tr.fy), a = Math.min(1, Tr.t / 0.2) * (Tr.life - Tr.t < 2 ? 0.6 + 0.4 * Math.sin(V.now * 20) : 1), up = Tr.sprung > 0 ? T * 0.8 : 0;
        FK.solid(ctx, '#5a6070', a); ctx.beginPath(); ctx.roundRect(x - T * 0.55, y - T * 0.12, T * 1.1, T * 0.12, 3); ctx.fill();
        ctx.strokeStyle = '#c9d3e0'; ctx.lineWidth = 2.5; ctx.beginPath();
        for (let i = 0; i <= 14; i++) { const u = i / 14; ctx.lineTo(x + Math.sin(u * Math.PI * 6) * T * 0.3, y - T * 0.12 - u * (T * 0.3 + up)); }
        ctx.stroke();
        FK.solid(ctx, '#ff5a6e', a); ctx.beginPath(); ctx.roundRect(x - T * 0.42, y - T * 0.5 - up, T * 0.84, T * 0.1, 2); ctx.fill();
      }
      for (const d of S.darts) { ctx.save(); ctx.translate(V.SX(d.x), V.SY(d.y)); ctx.rotate(d.e ? 0 : Math.atan2(d.vy, d.vx) - Math.PI / 2); plunger(ctx, T / U, brave(S)); ctx.restore(); }
      if (S.slingA) {   // SLINGSHOT: the cord stretched from the plunger in the floor
        const ax = V.SX(S.slingA[0]), ay = V.SY(S.slingA[1]), h = FK.local(V, p, FK.face(p), 0.3, p.h * 0.5);
        FK.solid(ctx, '#d8d2c4', 1); ctx.lineWidth = 2 + S.slingT * 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(h[0], h[1]); ctx.stroke();
        ctx.save(); ctx.translate(ax, ay); plunger(ctx, T / U, brave(S)); ctx.restore();
      }
      if (S.whirl) {   // SCARF WHIRLWIND: the long scarf lashing round
        const cx = V.SX(pcx(p)), cy = V.SY(pcy(p) - 0.4), a = S.whirl;
        for (let i = 0; i < 6; i++) { const aa = a - i * 0.18; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(aa) * T * 2.2, cy + Math.sin(aa) * T * 1.4); FK.solid(ctx, i % 2 ? C_SCARF2 : C_SCARF, 0.9 - i * 0.14); ctx.lineWidth = 6 - i * 0.7; ctx.stroke(); }
      }
      if (S.hornT > 0 && S.hornF === 0) {   // PANIC ATTACK's scream: rings all round
        const u = 1 - S.hornT / 0.5, x0 = V.SX(pcx(p)), y0 = V.SY(pcy(p));
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x0, y0, T * (0.5 + (u * 3.4 + i) % 3.4), 0, Math.PI * 2); FK.glow(ctx, C_SWEAT, 0.6 * (1 - u)); ctx.lineWidth = 3; ctx.stroke(); }
      }
      if (S.hornT > 0 && S.hornF) {   // AIR HORN: sound rings fanning out
        const f = S.hornF, u = 1 - S.hornT / 0.5, x0 = V.SX(pcx(p) + f * 0.8), y0 = V.SY(pcy(p) - 0.2);
        for (let i = 0; i < 4; i++) { const r = T * (0.6 + (u * 4.5 + i * 0.9) % 4.5); ctx.beginPath(); ctx.arc(x0, y0, r, f > 0 ? -0.55 : Math.PI - 0.55, f > 0 ? 0.55 : Math.PI + 0.55); FK.glow(ctx, i % 2 ? C_NERVE : '#ffffff', 0.7 * (1 - r / (T * 5.2))); ctx.lineWidth = 3; ctx.stroke(); }
      }
      if (S.balloon) {   // the balloon on its string over his head
        const B = S.balloon, x = V.SX(pcx(p) + 0.2) + Math.sin(V.now * 2 + B.ph) * 3, y = V.SY(p.y - 1.4), r = T * 0.55, a = B.life - B.t < 0.6 ? 0.5 + 0.5 * Math.sin(V.now * 30) : 1;
        FK.solid(ctx, '#d8d2c4', a); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(V.SX(pcx(p) + 0.15), V.SY(p.y + 0.2)); ctx.quadraticCurveTo(x - 6, y + r * 1.6, x, y + r * 1.1); ctx.stroke();
        FK.solid(ctx, '#ff5a6e', a); ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 3, y + r * 1.15); ctx.lineTo(x + 3, y + r * 1.15); ctx.lineTo(x, y + r * 1.0); ctx.fill();
        FK.solid(ctx, '#ffffff', 0.55 * a); ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.4, r * 0.18, r * 0.3, -0.5, 0, Math.PI * 2); ctx.fill();
      }
      if (S.cup) {   // the cord and the plunger
        const h = FK.local(V, p, FK.face(p), 0.5, p.h * 0.6), x = V.SX(S.cup.x), y = V.SY(S.cup.y);
        FK.solid(ctx, '#d8d2c4', 1); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.quadraticCurveTo((h[0] + x) / 2, (h[1] + y) / 2 + 10, x, y); ctx.stroke();
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(y - h[1], x - h[0]) + Math.PI / 2); plunger(ctx, T / U, brave(S)); ctx.restore();
      }
      // NERVE pips over his head (and the time left of Brave Heart as a gold ring)
      const hx = V.SX(pcx(p)), hy = V.SY(p.y) - T * 0.55;
      if (brave(S)) {
        ctx.beginPath(); ctx.arc(hx, hy, T * 0.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (S.braveT / BRAVE_T)); FK.glow(ctx, C_GOLD, 0.95); ctx.lineWidth = 3; ctx.stroke();
        FK.solid(ctx, '#fff', 0.95); ctx.font = (T * 0.22 | 0) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💛', hx, hy + 1);
      } else if (S.nerve > 0 || S.pipFlash > 0) {
        for (let i = 0; i < NERVE_MAX; i++) {
          const x = hx + (i - 1) * T * 0.3, on = i < S.nerve, pulse = on && S.pipFlash > 0 && i === S.nerve - 1 ? 1 + S.pipFlash : 1;
          ctx.beginPath(); ctx.arc(x, hy, T * 0.09 * pulse, 0, Math.PI * 2);
          if (on) { FK.glow(ctx, C_NERVE, 0.95); ctx.fill(); } else { FK.solid(ctx, 'rgba(10,10,20,0.55)', 1); ctx.fill(); FK.solid(ctx, C_NERVE, 0.5); ctx.lineWidth = 1.5; ctx.stroke(); }
        }
      }
    },
    drawFx(ctx, V, f, u, a) {
      if (f.k === 'drops') { const x = V.SX(f.x), y = V.SY(f.y); for (let i = 0; i < 4; i++) { const an = -Math.PI / 2 + (i - 1.5) * 0.6; ctx.beginPath(); ctx.arc(x + Math.cos(an) * V.T * (0.4 + u), y + Math.sin(an) * V.T * (0.4 + u) + u * u * V.T, V.T * 0.07, 0, Math.PI * 2); FK.solid(ctx, C_SWEAT, a); ctx.fill(); } return true; }
      return false;
    },
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      // gadgets: courage when it's close and he has it, the horn when someone is right in front
      if ((S.nerve || 0) >= 3 && !(S.braveT > 0) && I.adx < 4) return { type: 'key', key: 'b' };
      if ((S.nerve || 0) >= 2 && I.adx < 3.5 && Math.abs(I.dy) < 1.4 && Math.random() < 0.4) return { type: 'key', key: 'h' };
      if (I.air) {
        if (I.dy < -1.5 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.dy > 1 && I.adx < 1.2) return { type: 'tap', v: 'down' };
        if (I.adx < 1.7 && Math.abs(I.dy) < 1.5) return { type: 'tap', v: '' };
        if (I.adx < 2.6 && Math.abs(I.dy) < 1.2) return { type: 'tap', v: 'side' };
        return null;
      }
      if (I.adx < 1.4 && Math.abs(I.dy) < 1.2 && Math.random() < 0.25) return { type: 'tap', v: 'down' };   // duck & cover
      if (I.adx < 2.3 && Math.abs(I.dy) < 1.2) return { type: 'tap', v: '' };
      if (I.dy < -1.5 && I.adx < 1.5) return { type: 'tap', v: 'up' };
      if (I.adx < 7 && Math.abs(I.dy) < 1) return { type: 'tap', v: 'side' };
      return null;
    },
    keys: {
      k: () => { const p = window._gamePlayer; useGadget(null, H.state(), p); },
      b: () => useGadget('brave', H.state(), window._gamePlayer),
      h: () => useGadget('horn', H.state(), window._gamePlayer),
    },
  });

  // ---------------------------------------------------------------- the 🎒 touch button and the K key
  let btn = null;
  function syncBtn(S) {
    if (!btn) {
      btn = document.createElement('button'); btn.id = 'lbGadgetBtn';
      btn.style.cssText = 'position:absolute;right:16px;top:136px;z-index:100;width:54px;height:54px;border-radius:50%;display:none;flex-direction:column;align-items:center;justify-content:center;font-size:20px;line-height:1;color:#fff;border:2px solid ' + C_NERVE + ';background:radial-gradient(circle at 35% 30%,rgba(60,196,87,.9),rgba(20,60,30,.92));box-shadow:0 3px 10px rgba(0,0,0,.45);touch-action:none;user-select:none;-webkit-user-select:none';
      btn.innerHTML = '🎒<small style="font-size:8px;font-weight:800;margin-top:2px;letter-spacing:.04em">○○○</small>';
      const go = ev => { ev.preventDefault(); ev.stopPropagation(); pressGadget(); };
      btn.addEventListener('touchstart', go, { passive: false }); btn.addEventListener('mousedown', go);
      document.body.appendChild(btn);
    }
    const on = window.selectedCharacter === ID && (!window._gameMode || window._gameMode() === 'play');
    const d = on ? 'flex' : 'none';
    if (btn.style.display !== d) btn.style.display = d;
    if (!on || !S) return;
    const txt = brave(S) ? 'BRAVE' : '●●●'.slice(0, S.nerve) + '○○○'.slice(0, NERVE_MAX - S.nerve), sm = btn.querySelector('small');
    if (sm.textContent !== txt) sm.textContent = txt;
    const op = S.nerve > 0 && !brave(S) ? '1' : '0.55';
    if (btn.style.opacity !== op) btn.style.opacity = op;
  }
  window.addEventListener('keydown', e => {
    if (e.repeat || !e.key || window.selectedCharacter !== ID) return;
    if (e.key.toLowerCase() === 'k') pressGadget();
  });
  (window._onPlayerReset = window._onPlayerReset || []).push(() => { try { const S = H.state(); if (S) { S.trap = null; S.balloon = null; } } catch (e) {} });
  (window._rafHubTickers = window._rafHubTickers || []).push(() => { try { syncBtn(!window._fighterPass ? H.state() : null); } catch (e) {} });

  function shoe(ctx, at, s, k) {
    ctx.fillStyle = C_SHOE; ctx.beginPath(); ctx.roundRect(at[0] - 1.6 * s, at[1] - 1.4 * s, 5.4 * s * k, 2.6 * s, 1.3 * s); ctx.fill();
    ctx.fillStyle = '#c94a4a'; ctx.fillRect(at[0] - 1.6 * s, at[1] + 0.7 * s, 5.4 * s * k, 0.6 * s);
  }
  function plunger(ctx, s, gold) {   // the handle along -y from the grip, the rubber cup at the end
    ctx.fillStyle = '#c99a5a'; ctx.fillRect(-0.6 * s, -9 * s, 1.2 * s, 10.5 * s);
    ctx.fillStyle = gold ? C_GOLD : '#d63a4a';
    ctx.beginPath(); ctx.moveTo(-0.8 * s, -9 * s); ctx.quadraticCurveTo(-3.4 * s, -10 * s, -3.2 * s, -12.6 * s); ctx.lineTo(3.2 * s, -12.6 * s); ctx.quadraticCurveTo(3.4 * s, -10 * s, 0.8 * s, -9 * s); ctx.fill();
  }
  function airHorn(ctx, s) {   // a red can with a white trumpet bell
    ctx.fillStyle = '#e8392b'; ctx.beginPath(); ctx.roundRect(-2 * s, -6 * s, 4 * s, 7 * s, 1 * s); ctx.fill();
    ctx.fillStyle = '#f2efe8'; ctx.beginPath(); ctx.moveTo(-0.8 * s, -6 * s); ctx.lineTo(-3.4 * s, -12 * s); ctx.lineTo(3.4 * s, -12 * s); ctx.lineTo(0.8 * s, -6 * s); ctx.fill();
  }
  function scarf(ctx, K, s, t, S, gold) {
    const nx = K.neck[0], ny = K.neck[1] + s, c1 = gold ? C_GOLD : C_SCARF, c2 = gold ? C_GOLD2 : C_SCARF2;
    if (S && S.rotor) {   // copter: two scarf ends spinning overhead
      const cxr = K.head[0], cyr = K.head[1] - K.hr * 1.9, a = S.rotor * 40;
      for (let i = 0; i < 2; i++) { const an = a + i * Math.PI; ctx.fillStyle = i ? c2 : c1; ctx.beginPath(); ctx.ellipse(cxr + Math.cos(an) * 7 * s, cyr, 7 * s, 1.6 * s, 0, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    const L = gold ? 20 : 14, pts = [];   // a long scarf end streaming backwards, waving (longer, a blazing cape when brave)
    for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([nx - u * L * s, ny + u * (gold ? 6 : 4) * s + Math.sin(t * (gold ? 12 : 8) - u * 5) * u * 3 * s]); }
    ctx.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i++) { ctx.strokeStyle = i % 2 ? c2 : c1; ctx.lineWidth = ((gold ? 4.6 : 3.4) - i * 0.2) * s; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke(); }
    if (gold) {   // flames licking off the end
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) { const e = pts[8], ph = (t * 3 + i / 3) % 1; ctx.fillStyle = i % 2 ? 'rgba(255,138,26,0.6)' : 'rgba(255,224,90,0.6)'; ctx.beginPath(); ctx.arc(e[0] - ph * 6 * s, e[1] - ph * 5 * s, (1 - ph) * 2.4 * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(nx, ny, 4.2 * s, 2.2 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
})();
