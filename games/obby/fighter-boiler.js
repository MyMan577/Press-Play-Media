/* Obby Builder: BOILER, the charge fighter. Built for Smash.
 *
 * A walking steam engine that wins by patience. Hold ↓ (crouching, no S) to build PRESSURE: three levels, shown
 * on the gauge in his chest and the pips under his feet. Every move spends all of it and grows with each level;
 * at level 3 every move becomes an OVERPRESSURE version. Pressure holds for a while, then starts leaking.
 *
 * MOVEMENT
 *  - STEAM JET: his second jump is a jet of steam in any of 8 directions (hold a direction as you jump). With
 *    pressure stored it spends a level and goes much farther.
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge one extra level)
 *  Ground: neutral PISTON JAB (more jabs per level, BARRAGE at 3), side RAIL CHARGE (shoulder charge),
 *          up GEYSER UPPERCUT, down STEAM VENT (a burst all round: OVERPRESSURE at 3).
 *  Air:    neutral VALVE SPIN, side STEAM ROCKET (a flying fist), up PRESSURE LAUNCH (recovery), down ANVIL DROP.
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_boiler';
  const C_COPPER = '#c8743a', C_COPPER2 = '#8e4b22', C_BRASS = '#e6b54a', C_IRON = '#3d3a40', C_IRON2 = '#5b5660', C_FIRE = '#ff6a1a', C_STEAM = '#f4f6f8', C_FX = '#ffae5c';
  const P = { hip: 8.5, torso: 14, neck: -4, head: 8.5, ua: 5.5, fa: 5.5, th: 4.2, sh: 4.2 };
  const U = 34, pose = FK.pose, { ex, ey, pcx, pcy } = FK;
  const PR_MAX = 3, PR_RATE = 1 / 0.55, PR_HOLD = 4.5;

  const PO = {
    idle:   pose({ y: 1, lean: 0.06, aF: [0.35, 0.7], aB: [0.2, 0.9], lF: [0.3, -0.2], lB: [-0.3, -0.1] }),
    crouch: pose({ y: 6, lean: 0.25, aF: [0.9, 1.6], aB: [0.6, 1.7], lF: [1.0, -1.9], lB: [-0.4, -1.6], head: 0.1 }),
    jump:   pose({ aF: [2.2, 0.6], aB: [1.9, 0.7], lF: [0.8, -1.3], lB: [0.2, -0.9] }),
    fall:   pose({ aF: [1.6, 0.4], aB: [-1.3, 0.4], lF: [0.3, -0.5], lB: [-0.3, -0.3] }),
    jabA:   pose({ y: 1.5, lean: 0.2, aF: [0.9, 1.6], aB: [1.5, 0.05], lF: [0.6, -0.3], lB: [-0.5, -0.1] }),
    jabB:   pose({ y: 1.5, lean: 0.3, aF: [1.6, 0.0], aB: [0.7, 1.5], lF: [0.6, -0.3], lB: [-0.5, -0.1] }),
    blast:  pose({ y: 2.5, lean: 0.5, aF: [1.6, 0.0], aB: [1.5, 0.05], lF: [1.0, -0.5], lB: [-0.9, -0.1] }),
    charge: pose({ y: 2, lean: 0.75, head: -0.3, aF: [1.0, 1.4], aB: [-0.6, 0.8], lF: [0.9, -0.8], lB: [-0.9, -0.3] }),
    uLow:   pose({ y: 6, lean: 0.4, aF: [0.4, 2.2], aB: [0.9, 1.5], lF: [1.0, -1.9], lB: [-0.5, -1.4] }),
    upper:  pose({ y: -1, lean: -0.1, aF: [3.05, 0.15], aB: [-0.5, 0.7], lF: [0.15, -0.2], lB: [-0.3, -0.7] }),
    vent:   pose({ y: 3, lean: -0.2, head: -0.4, aF: [2.3, 0.3], aB: [-2.2, -0.3], lF: [0.7, -0.7], lB: [-0.7, -0.5] }),
    spin:   pose({ lean: 0, aF: [1.57, 0], aB: [-1.57, 0], lF: [0.5, -1.2], lB: [-0.4, -1.0] }),
    rocket: pose({ lean: 0.5, aF: [1.57, 0.0], aB: [-1.0, 0.6], lF: [-0.3, -0.6], lB: [-0.8, -0.3] }),
    launch: pose({ lean: 0, aF: [2.9, 0.2], aB: [2.7, 0.3], lF: [0.1, -0.1], lB: [-0.1, -0.1] }),
    anvil:  pose({ y: 1, lean: 0.1, aF: [2.6, 0.9], aB: [2.4, 1.0], lF: [0.6, -1.3], lB: [-0.2, -1.0] }),
  };

  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set() }, o || {}); }
  function moveX(p, dx) { const nx = p.x + dx; if (!FK.blocked(nx, p.y + 0.02, p.w, p.h - 0.04)) { p.x = nx; return true; } return false; }
  function puff(S, x, y, vx, vy, big) { S.fx.push({ k: 'puff', x, y, vx: vx || 0, vy: vy || -1, t: 0, life: big ? 0.9 : 0.6, r: big ? 0.5 : 0.3 }); }
  function hiss(L) { FK.noise({ dur: 0.25 + 0.15 * L, cut: 5000, ftype: 'highpass', q: 0.8, vol: 0.12 + 0.05 * L }); }
  function boom(L) { FK.thud(L >= 2); FK.noise({ dur: 0.3, cut: 300, cutEnd: 80, q: 1, vol: 0.3 }); }
  // spend the stored pressure (plus a level for a held S)
  function spend(S, pw) { const L = Math.min(PR_MAX, Math.floor(S.pr + 1e-6) + (pw > 0.5 ? 1 : 0)); S.pr = 0; S.prHold = 0; return L; }

  const SEQ = {
    jab(p, dt, S, q) {
      const f = q.f, L = q.L, n = [1, 2, 3, 6][L], gap = L === 3 ? 0.07 : 0.11, end = n * gap + (L === 3 ? 0.3 : 0.18);
      const i = Math.min(n - 1, Math.floor(q.t / gap)), ph = (q.t % gap) / gap;
      if (q.t < n * gap) {
        S.target = FK.lerpPose(i % 2 ? PO.jabA : PO.jabB, i % 2 ? PO.jabB : PO.jabA, ph); S.rate = 60;
        if (q.last !== i) {
          q.last = i; q.hits = new Set(); FK.smack(false); puff(S, pcx(p) + f * 0.9, pcy(p) - 0.2, f * 2, -0.5);
          q.pin = q.pin || new Set();
          for (const e of FK.foes()) { const al = (ex(e) - pcx(p)) * f; if (q.pin.has(e) || (al > -0.2 && al < 1.6 && Math.abs(ey(e) - pcy(p)) < 1)) { if (L >= 1 && i < n - 1) { q.pin.add(e); e.hp = Math.max(1, (e.hp || 1) - 1); e.hitFlash = 0.12; S.fx.push({ k: 'spark', x: ex(e), y: ey(e), ang: f > 0 ? 0 : Math.PI, t: 0, life: 0.2, c: C_FX }); } else FK.hit(S, e, 1, { kx: f * 2, ky: -1, stun: 0.3, c: C_FX }); } }
        }
        moveX(p, f * 1.2 * dt);
        // a leveled-up string locks them in front of him until the finisher
        if (q.pin) for (const e of q.pin) { if (e.dead) continue; const nx = pcx(p) + f * 1.15 - (e.w || 0.9) / 2; if (!FK.blocked(nx, e.y, e.w || 0.9, e.h || 0.9)) e.x = nx; e.vx = 0; e.vy = 0; e._held = true; e.stunTimer = Math.max(e.stunTimer || 0, 0.3); }
      } else {
        S.target = L === 3 ? PO.blast : PO.jabB; S.rate = 40;
        if (!q.fin) {
          q.fin = 1; if (q.pin) for (const e of q.pin) e._held = false;
          for (const e of FK.foes()) { const al = (ex(e) - pcx(p)) * f; if (al > -0.2 && al < 1.8 + 0.3 * L && Math.abs(ey(e) - pcy(p)) < 1.1) FK.hit(S, e, 2 + 2 * L, { kx: f * (6 + 3 * L), ky: -4 - 2 * L, stun: 0.5, c: C_FX, big: L >= 2, stop: L >= 2 ? 0.08 : 0 }); }
          for (let k = 0; k < 3 + 2 * L; k++) puff(S, pcx(p) + f * (1 + k * 0.25), pcy(p) - 0.2 + (Math.random() - 0.5) * 0.4, f * (3 + L), (Math.random() - 0.5), L >= 2);
          if (L === 3) { S.fx.push({ k: 'blast', x: pcx(p) + f * 1.2, y: pcy(p) - 0.2, f, t: 0, life: 0.4 }); boom(3); } else hiss(L);
        }
      }
      if (q.t > end) S.seq = null;
    },
    charge(p, dt, S, q) {
      const f = q.f, L = q.L, D = 0.22 + 0.11 * L;
      S.target = PO.charge; S.rate = 40;
      if (q.t < D) {
        if (!moveX(p, f * (12 + 3 * L) * dt)) q.t = D;
        p._armorT = L >= 2 ? 0.08 : 0;
        if (Math.random() < 0.8) puff(S, pcx(p) - f * 0.6, p.y + 0.2, -f * 2, -1);
        for (const e of FK.foes()) { if (q.hits.has(e)) continue; const al = (ex(e) - pcx(p)) * f; if (al > -0.2 && al < 1.2 && Math.abs(ey(e) - pcy(p)) < 1) { q.hits.add(e); FK.hit(S, e, 3 + 2 * L, { kx: f * (8 + 3 * L), ky: -6 - L, stun: 0.5, c: C_FX, big: L >= 1, stop: 0.06 + 0.02 * L }); FK.smack(true); } }
        if (!q.snd) { q.snd = 1; hiss(L); FK.tone(160, { type: 'sawtooth', dur: D, slide: 90, vol: 0.12 }); }
      } else if (q.t > D + 0.22) S.seq = null;
    },
    upper(p, dt, S, q) {
      const f = q.f, L = q.L;
      if (q.t < 0.12) { S.target = PO.uLow; S.rate = 40; if (p.vy < 0) p.vy = 2; return; }
      if (!q.go) { q.go = 1; p.vy = -(9 + 2.5 * L); p.onGround = false; hiss(L); S.fx.push({ k: 'geyser', x: pcx(p), y: p.y + p.h, L, t: 0, life: 0.6 }); }
      S.target = PO.upper; S.rate = 45;
      if (q.t < 0.32) for (const e of FK.foes()) { if (q.hits.has(e)) continue; const al = (ex(e) - pcx(p)) * f, dy = ey(e) - pcy(p); if (al > -0.6 && al < 1.6 && dy < 1.8 && dy > -2.6 - 0.4 * L) { q.hits.add(e); FK.hit(S, e, 3 + 2 * L, { kx: f * 2, ky: -(11 + 3 * L), stun: 0.6, c: C_FX, big: L >= 1, stop: 0.1 }); } }
      if (q.t > 0.5) S.seq = null;
    },
    vent(p, dt, S, q) {
      const L = q.L, R = 1.5 + 0.6 * L;
      S.target = PO.vent; S.rate = 40;
      if (!q.go && q.t > 0.06) {
        q.go = 1;
        for (const e of FK.foes()) { const d = Math.hypot(ex(e) - pcx(p), ey(e) - pcy(p)); if (d < R) FK.hit(S, e, 2 + 2 * L, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * (5 + 3 * L), ky: -5 - 2 * L, stun: 0.5, c: C_FX, big: L >= 2, stop: L >= 3 ? 0.14 : 0.04 }); }
        for (let k = 0; k < 8 + 4 * L; k++) { const an = k / (8 + 4 * L) * Math.PI * 2; puff(S, pcx(p), pcy(p), Math.cos(an) * (3 + 2 * L), Math.sin(an) * (3 + 2 * L) - 1, true); }
        S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R, c: L >= 3 ? C_FIRE : C_STEAM, t: 0, life: 0.4 });
        if (L >= 3) { S.fx.push({ k: 'flash', x: pcx(p), y: pcy(p), R: R * 0.6, c: '#ffd0a0', t: 0, life: 0.25 }); S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: R, c: C_FIRE, t: 0, life: 0.5 }); boom(3); FK.shake(12); } else hiss(L);
      }
      if (q.t > 0.42) S.seq = null;
    },
    spin(p, dt, S, q) {
      const L = q.L, R = 1.4 + 0.4 * L;
      S.target = PO.spin; S.rate = 50; S.spin = q.t * 30;
      p.vy = Math.min(p.vy, 1);
      if (Math.floor(q.t / 0.14) !== q.tick) { q.tick = Math.floor(q.t / 0.14); q.hits = new Set(); }
      for (const e of FK.within(pcx(p), pcy(p), R)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 1 + Math.ceil(L / 2), { kx: (Math.sign(ex(e) - pcx(p)) || 1) * (3 + 2 * L), ky: -4 - L, stun: 0.35, c: C_FX }); }
      if (Math.random() < 0.7) { const an = Math.random() * Math.PI * 2; puff(S, pcx(p) + Math.cos(an) * R * 0.8, pcy(p) + Math.sin(an) * R * 0.8, Math.cos(an + 1.6) * 3, Math.sin(an + 1.6) * 3); }
      if (q.t > 0.42) { S.seq = null; S.spin = 0; }
    },
    rocket(p, dt, S, q) {
      const f = q.f, L = q.L;
      S.target = PO.rocket; S.rate = 45;
      if (!q.go) { q.go = 1; S.fist = { x: pcx(p) + f * 0.8, y: pcy(p) - 0.15, vx: f * (16 + 4 * L), t: 0, life: 0.35 + 0.12 * L, L, f, hits: new Set() }; hiss(L); FK.whoosh(false, true); p.vx = -f * 3; }
      p.vy = Math.min(p.vy, 1.5);
      if (q.t > 0.3) S.seq = null;
    },
    launch(p, dt, S, q) {
      const L = q.L;
      if (!q.go) { q.go = 1; p.vy = -(13 + 3 * L); hiss(L); S.fx.push({ k: 'geyser', x: pcx(p), y: p.y + p.h, L, t: 0, life: 0.5 }); }
      S.target = PO.launch; S.rate = 40;
      if (Math.random() < 0.9) puff(S, pcx(p) + (Math.random() - 0.5) * 0.4, p.y + p.h, (Math.random() - 0.5) * 2, 3, L >= 2);
      if (q.t < 0.3) for (const e of FK.within(pcx(p), p.y - 0.4, 1.3)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 2 + L, { ky: -(9 + 2 * L), stun: 0.4, c: C_FX }); }
      if (q.t > 0.4) S.seq = null;
    },
    anvil(p, dt, S, q) {
      const f = q.f, L = q.L;
      S.target = PO.anvil; S.rate = 40;
      if (q.t < 0.1) { p.vy = -2; return; }
      p.vy = 24 + 2 * L; p.vx = 0; p._armorT = L >= 1 ? 0.08 : 0;
      for (const e of FK.foes()) { if (q.hits.has(e)) continue; if (Math.abs(ex(e) - pcx(p)) < 0.9 && ey(e) > p.y + p.h * 0.4 && ey(e) < p.y + p.h + 0.8) { q.hits.add(e); FK.hit(S, e, 4 + L, { kx: f * 2, ky: 14 + L, stun: 0.5, c: C_FX, big: true, stop: 0.07 }); } }
      if (p.onGround && q.t > 0.12) {
        const R = 1.6 + 0.7 * L;
        for (const e of FK.foes()) if (!q.hits.has(e) && Math.abs(ex(e) - pcx(p)) < R && Math.abs(ey(e) - (p.y + p.h - 0.5)) < 1.3) FK.hit(S, e, 2 + 2 * L, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * (4 + 2 * L), ky: -6 - 2 * L, stun: 0.5, c: C_FX, big: L >= 2 });
        S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R, c: L >= 3 ? C_FIRE : C_FX, t: 0, life: 0.5 });
        for (let k = 0; k < 6 + 2 * L; k++) puff(S, pcx(p) + (k % 2 ? 1 : -1) * (0.3 + k * 0.15), p.y + p.h - 0.2, (k % 2 ? 1 : -1) * (2 + L), -1, true);
        boom(L); FK.shake(6 + 3 * L); S.seq = null;
      }
      if (q.t > 1.4) S.seq = null;
    },
  };

  const MOVES = {
    ground: { neutral: { name: 'Piston Jab', cd: 0.25 }, side: { name: 'Rail Charge', cd: 0.35 }, up: { name: 'Geyser Uppercut', cd: 0.35 }, down: { name: 'Steam Vent', cd: 0.4 } },
    air:    { neutral: { name: 'Valve Spin', cd: 0.3 }, side: { name: 'Steam Rocket', cd: 0.4 }, up: { name: 'Pressure Launch', cd: 0.3 }, down: { name: 'Anvil Drop', cd: 0.35 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;
  const lvlName = (base, L) => L >= 3 ? (base === 'Piston Jab' ? 'PISTON BARRAGE' : 'OVERPRESSURE ' + base.toUpperCase().split(' ').pop()) : base.toUpperCase() + (L ? ' Lv' + L : '');
  const mk = (kind, base) => (p, f, pw, S) => { const L = spend(S, pw); startSeq(S, kind, { f, L }); return lvlName(base, L); };

  FK.define({
    id: ID, plug: 'boiler',
    def: { name: 'Boiler', icon: '♨️', tier: 'gold', color: C_FX, color2: C_BRASS,
      ability: 'Charge Fighter: hold ↓ to build 3 levels of PRESSURE; every move spends it and grows. Steam Jet air jump in 8 directions',
      desc: 'A walking steam engine. Hold ↓ (crouch) to build Pressure, up to 3 levels on his chest gauge. Every move spends it all and hits harder and farther per level; at level 3 they become OVERPRESSURE moves. His second jump is a Steam Jet in any of 8 directions. Piston Jab, Rail Charge, Geyser Uppercut, Steam Vent; Valve Spin, Steam Rocket, Pressure Launch, Anvil Drop.' },
    stats: { speed: 0.95, jump: 1.0, maxJumps: 1, maxDashes: 1, hp: 4 },
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, pr: 0, prHold: 0, lastLvl: 0, airUp: false, jet: null, jets: 1, fist: null, spin: 0 }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Pressure Launch comes back when you land'; return null; },
    act: {
      ground_neutral: mk('jab', 'Piston Jab'), ground_side: mk('charge', 'Rail Charge'), ground_up: mk('upper', 'Geyser Uppercut'), ground_down: mk('vent', 'Steam Vent'),
      air_neutral: mk('spin', 'Valve Spin'), air_side: mk('rocket', 'Steam Rocket'), air_up: (p, f, pw, S) => { S.airUp = true; return mk('launch', 'Pressure Launch')(p, f, pw, S); }, air_down: mk('anvil', 'Anvil Drop'),
    },
    onTeleport(p, S) { S.seq = null; S.jet = null; S.fist = null; },
    step(p, dt, S, k, jumpEdge) {
      if (p.hitstun > 0 && S.seq) S.seq = null;
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      // PRESSURE: hold ↓ on the ground (crouching) to build it
      const building = !S.seq && p.onGround && k.down && !k.left && !k.right && Math.abs(p.vx || 0) < 2;
      if (building) {
        S.pr = Math.min(PR_MAX, S.pr + dt * PR_RATE); S.prHold = 0; p.vx = 0;
        if (Math.random() < dt * 14) puff(S, pcx(p) - FK.face(p) * 0.35, p.y - 0.1, -FK.face(p) * 0.5, -2);
        if (Math.random() < dt * 10) FK.noise({ dur: 0.05, cut: 4000, ftype: 'highpass', vol: 0.05 });
      } else if (S.pr > 0) { S.prHold += dt; if (S.prHold > PR_HOLD) S.pr = Math.max(0, S.pr - dt * 0.6); }
      const lv = Math.floor(S.pr + 1e-6);
      if (lv > S.lastLvl) { FK.tone(440 * Math.pow(1.26, lv), { type: 'square', dur: 0.09, vol: 0.12 }); FK.tone(660 * Math.pow(1.26, lv), { dur: 0.15, vol: 0.08, delay: 0.05 }); S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 0.9 + 0.2 * lv, c: lv >= 3 ? C_FIRE : C_BRASS, t: 0, life: 0.35 }); if (lv >= 3) FK.label(S, p, 'MAX PRESSURE!', C_FIRE, true); }
      S.lastLvl = lv;
      // STEAM JET: the air jump, in the held direction
      if (p.onGround) { S.jets = 1; S.airUp = false; }
      if (!p.onGround && jumpEdge && S.jets > 0 && !S.seq && (S.airT || 0) > 0.08) {
        S.jets = 0;
        let dx = (k.right ? 1 : 0) - (k.left ? 1 : 0), dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
        if (!dx && !dy) dy = -1;
        const d = Math.hypot(dx, dy), use = S.pr >= 1 ? 1 : 0; if (use) S.pr -= 1;
        const sp = use ? 19 : 13;
        S.jet = { vx: dx / d * sp, vy: dy / d * sp, t: 0.22 + 0.08 * use, use };
        hiss(use ? 2 : 0); FK.label(S, p, use ? 'STEAM JET+' : 'STEAM JET', C_STEAM);
      }
      if (S.jet) {
        S.jet.t -= dt; p.vx = S.jet.vx; p.vy = S.jet.vy;
        if (Math.random() < 0.9) puff(S, pcx(p) - S.jet.vx * 0.04, pcy(p) - S.jet.vy * 0.04, -S.jet.vx * 0.2, -S.jet.vy * 0.2, S.jet.use);
        if (S.jet.t <= 0 || p.onGround) S.jet = null;
      }
      // the Steam Rocket fist in flight
      if (S.fist) {
        const F = S.fist; F.t += dt;
        const nx = F.x + F.vx * dt;
        if (FK.blocked(nx - 0.2, F.y - 0.2, 0.4, 0.4)) F.t = F.life;
        F.x = nx; if (Math.random() < 0.8) puff(S, F.x - F.f * 0.3, F.y, -F.f * 2, 0, false);
        for (const e of FK.foes()) { if (F.hits.has(e)) continue; if (Math.abs(ex(e) - F.x) < 0.5 + (e.w || 0.9) / 2 && Math.abs(ey(e) - F.y) < 0.5 + (e.h || 0.9) / 2) { F.hits.add(e); FK.hit(S, e, 3 + 2 * F.L, { kx: F.f * (8 + 3 * F.L), ky: -5 - F.L, stun: 0.5, c: C_FX, big: F.L >= 1, stop: 0.06 }); FK.smack(true); if (F.L < 3) F.t = F.life; } }
        if (F.t >= F.life) { S.fx.push({ k: 'ring', x: F.x, y: F.y, R: 0.6, c: C_STEAM, t: 0, life: 0.25 }); S.fist = null; }
      }
      if (!S.seq) {
        if (building) { S.target = pose(Object.assign({}, PO.crouch, { y: PO.crouch.y + Math.sin(performance.now() / 1000 * 30) * 0.25 * (1 + lv) })); S.rate = 25; }
        else if (S.jet) S.target = PO.rocket;
        else if (p.onGround && Math.abs(p.vx || 0) > 0.8) {
          S.run += dt * Math.abs(p.vx) * 1.6; const r = S.run, sw = Math.sin(r);
          S.target = pose({ y: 0.6 - Math.abs(Math.cos(r)) * 1.0, lean: 0.22, aF: [0.4 - sw * 0.9, 1.4], aB: [0.4 + sw * 0.9, 1.4], lF: [0.15 + sw * 0.7, -0.3 - Math.max(0, Math.cos(r)) * 1.0], lB: [0.15 - sw * 0.7, -0.3 - Math.max(0, -Math.cos(r)) * 1.0] });
          if (Math.random() < dt * 6) puff(S, pcx(p) - FK.face(p) * 0.35, p.y - 0.1, -FK.face(p), -2);
        } else if (p.onGround) S.target = pose(Object.assign({}, PO.idle, { y: PO.idle.y + 0.4 * Math.sin(performance.now() / 1000 * 3) }));
        else S.target = (p.vy || 0) < 0 ? PO.jump : PO.fall;
      }
      if (!S.seq && Math.random() < dt * 1.5) puff(S, pcx(p) - FK.face(p) * 0.35, p.y - 0.1, -FK.face(p) * 0.3, -1.5);   // the stack smokes
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing: a riveted boiler body with a chest gauge, furnace door and a smokestack
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, s = ph / U, cx = px + pw / 2, fy = py + ph;
      const K = FK.skel(P, q, cx, fy, s), pr = S ? S.pr : 1.5, lv = Math.floor(pr + 1e-6);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowBlur = 8 + 5 * lv; ctx.shadowColor = lv >= 3 ? 'rgba(255,106,26,0.8)' : 'rgba(255,174,92,0.4)';
      FK.limb(ctx, K.lB, 5.4 * s, C_IRON, 5 * s);
      ctx.fillStyle = C_IRON; ctx.beginPath(); ctx.roundRect(K.lB[2][0] - 2.4 * s, K.lB[2][1] - 2 * s, 6 * s, 3.2 * s, 1.4 * s); ctx.fill();
      FK.limb(ctx, K.aB, 4.6 * s, C_COPPER2, 4.6 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 3.4 * s, '#2c2a30');
      // the body: a round copper boiler with brass bands, rivets, a furnace door and the pressure gauge
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s, W = 19 * s;
      ctx.fillStyle = C_IRON; ctx.fillRect(-W * 0.5, -Lt * 1.25, 3.6 * s, Lt * 0.6);     // smokestack
      ctx.fillStyle = C_IRON2; ctx.beginPath(); ctx.roundRect(-W * 0.5 - 0.8 * s, -Lt * 1.32, 5.2 * s, 1.8 * s, 0.6 * s); ctx.fill();
      FK.blob(ctx, W, Lt, C_COPPER, C_COPPER2, 9 * s);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,220,180,0.35)'; ctx.beginPath(); ctx.ellipse(W * 0.18, -Lt * 0.7, W * 0.12, Lt * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();   // shine
      ctx.fillStyle = C_BRASS; ctx.fillRect(-W / 2, -Lt * 0.32, W, 1.4 * s);
      ctx.fillStyle = '#5a2a10'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-W * 0.38 + i * W * 0.19, -Lt * 0.26, 0.55 * s, 0, Math.PI * 2); ctx.fill(); }
      const fg = ctx.createRadialGradient(W * 0.18, -Lt * 0.13, 0.5 * s, W * 0.18, -Lt * 0.13, 4 * s);
      fg.addColorStop(0, lv >= 3 ? '#ffffff' : '#ffe0a0'); fg.addColorStop(0.5, pr > 0.2 ? C_FIRE : '#7a2a0a'); fg.addColorStop(1, '#3a1206');
      ctx.fillStyle = C_IRON; ctx.beginPath(); ctx.roundRect(W * 0.03, -Lt * 0.22, 6 * s, 3.6 * s, 1.2 * s); ctx.fill();
      ctx.fillStyle = fg; ctx.globalAlpha = 0.45 + 0.18 * pr; ctx.beginPath(); ctx.roundRect(W * 0.07, -Lt * 0.19, 4.6 * s, 2.6 * s, 0.8 * s); ctx.fill(); ctx.globalAlpha = 1;
      const gx = W * 0.14, gy = -Lt * 0.62, gr = 3.6 * s;
      ctx.fillStyle = C_BRASS; ctx.beginPath(); ctx.arc(gx, gy, gr + 0.8 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f7f0dc'; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d33'; ctx.lineWidth = 1 * s; ctx.beginPath(); ctx.arc(gx, gy, gr * 0.75, -0.3, 0.6); ctx.stroke();
      const na = Math.PI * 0.8 + (pr / PR_MAX) * Math.PI * 1.35 + (lv >= 3 ? Math.sin(t * 40) * 0.08 : 0);
      ctx.strokeStyle = '#222'; ctx.lineWidth = 0.8 * s; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(na) * gr * 0.85, gy + Math.sin(na) * gr * 0.85); ctx.stroke();
      ctx.restore();
      FK.limb(ctx, K.lF, 5.8 * s, C_IRON2, 5.4 * s);
      ctx.fillStyle = C_IRON; ctx.beginPath(); ctx.roundRect(K.lF[2][0] - 2.4 * s, K.lF[2][1] - 2 * s, 6.4 * s, 3.4 * s, 1.4 * s); ctx.fill();
      // head: a round iron dome with a visor and two glowing eyes, a valve on top
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      const hr = K.hr;
      ctx.fillStyle = C_BRASS; ctx.fillRect(-hr * 0.12, -hr * 1.3, hr * 0.24, hr * 0.4); ctx.beginPath(); ctx.ellipse(0, -hr * 1.3, hr * 0.32, hr * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      const hg = ctx.createRadialGradient(hr * 0.3, -hr * 0.4, hr * 0.1, 0, 0, hr * 1.05); hg.addColorStop(0, '#7d7782'); hg.addColorStop(1, C_IRON);
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, hr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#211f24'; ctx.beginPath(); ctx.roundRect(-hr * 0.55, -hr * 0.32, hr * 1.5, hr * 0.62, hr * 0.3); ctx.fill();
      FK.eyes(ctx, hr * 0.1, 0, hr * 0.2, hr * 0.5, { glow: lv >= 3 ? '#fff2c0' : '#ffb347' });
      ctx.fillStyle = C_BRASS; for (const a of [0.9, 2.2, 4.1, 5.4]) { ctx.beginPath(); ctx.arc(Math.cos(a) * hr * 0.82, Math.sin(a) * hr * 0.82, hr * 0.08, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      // front arm: a piston rod and a big iron fist
      FK.limb(ctx, K.aF, 5 * s, C_COPPER, 5 * s);
      const el = K.aF[1], hd = K.aF[2];
      ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(el[0], el[1]); ctx.lineTo(el[0] + (hd[0] - el[0]) * 0.75, el[1] + (hd[1] - el[1]) * 0.75); ctx.stroke();
      FK.mitt(ctx, hd[0], hd[1], 4 * s, C_IRON, C_IRON2);
      ctx.fillStyle = C_BRASS; ctx.beginPath(); ctx.arc(hd[0], hd[1], 1.1 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_BRASS; ctx.beginPath(); ctx.arc(K.aF[0][0], K.aF[0][1] + 0.5 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T, lv = Math.floor(S.pr + 1e-6);
      // pressure pips under his feet
      for (let i = 0; i < 3; i++) {
        const x = V.SX(pcx(p)) + (i - 1) * T * 0.22, y = V.SY(p.y + p.h) + 6, fill = Math.max(0, Math.min(1, S.pr - i));
        FK.solid(ctx, '#ffffff', 0.18); ctx.beginPath(); ctx.arc(x, y, T * 0.07, 0, Math.PI * 2); ctx.fill();
        if (fill > 0) { ctx.beginPath(); ctx.arc(x, y, T * 0.07 * fill, 0, Math.PI * 2); FK.glow(ctx, lv >= 3 ? C_FIRE : C_BRASS, 0.95); ctx.fill(); }
      }
      if (lv >= 3) { ctx.beginPath(); ctx.arc(V.SX(pcx(p)), V.SY(pcy(p)), T * (0.85 + 0.06 * Math.sin(V.now * 20)), 0, Math.PI * 2); FK.glow(ctx, C_FIRE, 0.35); ctx.lineWidth = 3; ctx.stroke(); }
      if (S.fist) {
        const F = S.fist, x = V.SX(F.x), y = V.SY(F.y);
        const pts = []; for (let i = 0; i <= 8; i++) pts.push([x - F.f * i * T * 0.3, y + Math.sin(i + V.now * 30) * 2]); FK.taper(ctx, pts, T * 0.25, F.L >= 3 ? C_FIRE : C_FX, 0.75);
        FK.solid(ctx, C_IRON); ctx.beginPath(); ctx.arc(x, y, T * 0.28, 0, Math.PI * 2); ctx.fill();
        FK.solid(ctx, C_BRASS); ctx.beginPath(); ctx.arc(x, y, T * 0.09, 0, Math.PI * 2); ctx.fill();
      }
      if (S.seq && S.seq.kind === 'spin') for (let i = 0; i < 2; i++) { const an = V.now * 25 + i * Math.PI; FK.crescent(ctx, V.SX(pcx(p)), V.SY(pcy(p)), T * (1.4 + 0.4 * S.seq.L), an, an + 1.6, T * 0.35, C_STEAM, 0.6); }
      if (S.seq && S.seq.kind === 'charge' && S.seq.t < 0.22 + 0.11 * S.seq.L) { const f = S.seq.f; for (let i = -1; i <= 1; i++) { const pts = []; for (let j = 0; j <= 8; j++) pts.push([V.SX(pcx(p)) - f * j * T * 0.35, V.SY(pcy(p)) + i * T * 0.3]); FK.taper(ctx, pts, T * 0.1, C_FX, 0.6); } }
    },
    drawFx(ctx, V, f, u, a) {
      const T = V.T;
      if (f.k === 'puff') {
        const x = V.SX(f.x + f.vx * f.t), y = V.SY(f.y + f.vy * f.t - u * 0.3), r = T * f.r * (0.5 + u * 1.2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,' + (0.75 * a) + ')'); g.addColorStop(1, 'rgba(220,226,232,0)');
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        return true;
      }
      if (f.k === 'geyser') {
        const x = V.SX(f.x), y = V.SY(f.y), H = T * (2.5 + f.L) * Math.min(1, u * 3);
        for (let i = 0; i < 5; i++) { const pts = []; for (let j = 0; j <= 8; j++) pts.push([x + (i - 2) * T * 0.15 + Math.sin(j + V.now * 20 + i) * 3, y - H * (j / 8)]); FK.taper(ctx, pts.reverse(), T * 0.18, i % 2 ? C_STEAM : '#ffd8b0', a * 0.8, false); }
        return true;
      }
      if (f.k === 'blast') {
        const x = V.SX(f.x), y = V.SY(f.y), R = T * (0.6 + u * 2);
        FK.star(ctx, x + f.f * R * 0.3, y, R, u * 2, '#ffd0a0', a, 6); ctx.beginPath(); ctx.arc(x, y, R * 0.8, 0, Math.PI * 2); FK.glow(ctx, C_FIRE, a); ctx.lineWidth = 4; ctx.stroke();
        return true;
      }
      return false;
    },
    // Smash CPU: build pressure when it's safe, cash it in up close
    ai(I) {
      const S = I.S || {}, lv = Math.floor((S.pr || 0) + 1e-6);
      if (S.seq) return null;
      if (I.air) {
        if (I.dy > 0.6 && I.adx < 1.3) return { type: 'tap', v: 'down' };
        if (I.dy < -0.8 && I.adx < 1.5 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.adx > 2 && I.adx < 6 && Math.abs(I.dy) < 1.2) return { type: 'tap', v: 'side' };
        if (I.adx < 1.8 && Math.abs(I.dy) < 1.6) return { type: 'tap', v: '' };
        return null;
      }
      if (I.adx > 3.5 && lv < 3) return { type: 'crouch', v: 'down', hold: 0.6 + Math.random() * 0.9 };   // build Pressure from a distance
      if (I.adx < 1.6 && Math.abs(I.dy) < 1.2) return lv >= 2 || I.r < 0.3 ? { type: 'tap', v: 'down' } : { type: 'tap', v: '' };
      if (I.dy < -1.2 && I.adx < 2) return { type: 'tap', v: 'up' };
      if (I.adx < 4.5 && Math.abs(I.dy) < 1 && (lv >= 1 || I.r < 0.3)) return { type: 'tap', v: 'side' };
      return null;
    },
  });
})();
