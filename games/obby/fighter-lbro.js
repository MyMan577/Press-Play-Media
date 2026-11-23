/* Obby Builder: L-BROTHER, the lanky younger brother.
 *
 * Tall, thin and a bit jumpy: a green work shirt under slate overalls, a long striped scarf and a knit beanie with an L patch. He jumps
 * higher than anyone and FLUTTERS (hold jump while falling: his legs paddle and he hangs in the air for a moment).
 * His tool is a plunger on a cord: it sticks to foes (and pulls them in) or to walls (and pulls him there).
 *
 * POWER-UPS (the rings over his head fill up; a finished task puts a TOOL CRATE over his head: bump it from below, catch the power-up for a 24 s FORM, two hits end it):
 *   🪶 GALE FEATHER (5 s in the air) -> GALE form: the scarf becomes wings, hold jump to glide, gusts of wind
 *   ❄️ FROST VIAL   (land 6 hits)    -> FROST form: every hit chills (longer stun), an ice sheet that trips foes
 *   ⚡ THUNDER CELL (run 50 tiles)   -> VOLT form: faster, the plunger becomes a ZIP that blinks through foes
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge)
 *  Ground: neutral PLUNGER POKE (Volt: ARC LASH), side PLUNGER SHOT (Volt: ZIP), up SCISSOR KICK (Gale: UPDRAFT), down LEG SWEEP (Frost: ICE SHEET).
 *  Air:    neutral FLAIL KICKS, side SUCTION SWING, up SCARF COPTER (recovery), down KNEE DROP.
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_luigi_ref';
  const C_JAK = '#3cc457', C_JAK2 = '#23853a', C_PANT = '#3b4a6b', C_PANT2 = '#28324a', C_SKIN = '#f3c9a3', C_HAIR = '#3a2a1e', C_HAT = '#34b852', C_HAT2 = '#1f7a35', C_SCARF = '#ffe08a', C_SCARF2 = '#ff9a6a', C_SHOE = '#f2efe8', C_BIB = '#56607a', C_BIB2 = '#3c4458', C_MUST = '#2e2016';
  const FORMS = {
    gale:  { name: 'GALE', icon: '🪶', c: '#c9f4ff', jak: '#e8fbff', jak2: '#8fd0e6', glow: '#ffffff' },
    frost: { name: 'FROST', icon: '❄️', c: '#7cc8ff', jak: '#9fd8ff', jak2: '#4c8ed0', glow: '#bfe6ff' },
    volt:  { name: 'VOLT', icon: '⚡', c: '#ffe14d', jak: '#ffd84a', jak2: '#c89a12', glow: '#fff3a0' },
  };
  const P = { hip: 11.5, torso: 11, neck: -1, head: 6.8, ua: 5.4, fa: 5.4, th: 5.8, sh: 5.8 };   // a tall, lanky grown man
  const U = 30, pose = FK.pose, { ex, ey, pcx, pcy } = FK;

  const PU = FK.powerups({
    tasks: [
      { kind: 'air', need: 5, form: 'gale', label: 'AIR TIME' },
      { kind: 'hits', need: 6, form: 'frost', label: '6 HITS' },
      { kind: 'dist', need: 50, form: 'volt', label: '50 TILES' },
    ],
    forms: FORMS,
    drawItem(ctx, x, y, r, f, t) {
      if (f === 'gale') {   // a curling feather
        ctx.save(); ctx.translate(x, y); ctx.rotate(-0.6 + Math.sin(t * 3) * 0.2);
        ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.7, -r * 0.2, 0, r * 0.9); ctx.quadraticCurveTo(-r * 0.7, -r * 0.2, 0, -r); ctx.fill();
        ctx.strokeStyle = '#8fd0e6'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 1.1); ctx.stroke();
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, -r * 0.5 + i * r * 0.3); ctx.lineTo(r * 0.35, -r * 0.7 + i * r * 0.3); ctx.moveTo(0, -r * 0.5 + i * r * 0.3); ctx.lineTo(-r * 0.35, -r * 0.7 + i * r * 0.3); ctx.stroke(); }
        ctx.restore();
      } else if (f === 'frost') {   // a stoppered vial with a snowflake in it
        ctx.fillStyle = '#bfe6ff'; ctx.beginPath(); ctx.roundRect(x - r * 0.45, y - r * 0.5, r * 0.9, r * 1.25, r * 0.4); ctx.fill();
        ctx.fillStyle = '#7cc8ff'; ctx.beginPath(); ctx.roundRect(x - r * 0.45, y, r * 0.9, r * 0.75, r * 0.4); ctx.fill();
        ctx.fillStyle = '#8a5a3a'; ctx.fillRect(x - r * 0.25, y - r * 0.85, r * 0.5, r * 0.38);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.08; for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + t; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.28, y + r * 0.2 + Math.sin(a) * r * 0.28); ctx.lineTo(x - Math.cos(a) * r * 0.28, y + r * 0.2 - Math.sin(a) * r * 0.28); ctx.stroke(); }
      } else {   // a battery cell with a bolt on it
        ctx.fillStyle = '#2b2f3a'; ctx.beginPath(); ctx.roundRect(x - r * 0.5, y - r * 0.7, r, r * 1.45, r * 0.18); ctx.fill();
        ctx.fillStyle = '#c8cfdc'; ctx.fillRect(x - r * 0.2, y - r * 0.88, r * 0.4, r * 0.2);
        ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(x + r * 0.1, y - r * 0.5); ctx.lineTo(x - r * 0.25, y + r * 0.05); ctx.lineTo(x, y + r * 0.05); ctx.lineTo(x - r * 0.1, y + r * 0.55); ctx.lineTo(x + r * 0.28, y - r * 0.05); ctx.lineTo(x + r * 0.02, y - r * 0.05); ctx.closePath(); ctx.fill();
      }
    },
  });
  const form = S => PU.form(S);
  const fc = S => form(S) ? FORMS[form(S)].c : C_JAK;

  const PO = {
    idle:   pose({ y: 0.3, lean: 0.12, head: 0.08, aF: [0.25, 0.7], aB: [-0.15, 0.5], lF: [0.15, -0.1], lB: [-0.2, -0.05] }),   // a slight nervous stoop
    jump:   pose({ y: -0.5, lean: -0.05, aF: [2.7, 0.4], aB: [2.4, 0.5], lF: [0.6, -1.4], lB: [-0.3, -0.5] }),
    fall:   pose({ lean: 0.05, aF: [2.0, 0.9], aB: [-2.0, 0.9], lF: [0.5, -0.4], lB: [-0.5, -0.4] }),
    flutA:  pose({ lean: 0.1, aF: [2.3, 0.6], aB: [-2.3, 0.6], lF: [1.2, -1.6], lB: [-0.2, -0.3] }),
    flutB:  pose({ lean: 0.1, aF: [2.6, 0.4], aB: [-2.6, 0.4], lF: [-0.2, -0.3], lB: [1.2, -1.6] }),
    glide:  pose({ y: -0.5, lean: 0.9, head: -0.5, aF: [1.6, 0.0], aB: [-1.6, 0.0], lF: [0.15, -0.2], lB: [-0.15, -0.3] }),
    poke:   pose({ y: 0.8, lean: 0.4, aF: [1.6, 0.02], aB: [-0.6, 0.8], lF: [0.8, -0.3], lB: [-0.7, -0.1] }),
    pokeW:  pose({ y: 0.8, lean: -0.15, aF: [0.9, 1.6], aB: [-0.4, 0.6], lF: [0.5, -0.3], lB: [-0.5, -0.1] }),
    aim:    pose({ y: 0.4, lean: 0.1, aF: [1.65, 0.0], aB: [1.4, 0.3], lF: [0.6, -0.2], lB: [-0.6, -0.1] }),
    scisA:  pose({ y: 2.0, lean: 0.2, aF: [0.4, 0.8], aB: [-0.4, 0.8], lF: [0.9, -1.4], lB: [-0.5, -0.9] }),
    scisB:  pose({ y: -1.0, lean: -0.6, aF: [-1.2, 0.3], aB: [-2.0, 0.3], lF: [2.8, -0.05], lB: [-0.5, -0.2] }),   // a leg kicked straight up
    sweep:  pose({ y: 9.0, lean: 0.5, aF: [-0.4, 0.3], aB: [-1.0, 0.2], lF: [1.55, 0.0], lB: [0.3, -2.4] }),        // down low, leg out
    flail:  pose({ y: -0.5, lean: 0.0, aF: [2.6, 1.0], aB: [-2.6, 1.0], lF: [1.4, -0.4], lB: [-1.1, -0.6] }),
    swing:  pose({ y: -0.5, lean: 0.4, aF: [2.6, 0.1], aB: [-0.8, 0.8], lF: [0.9, -0.9], lB: [0.3, -0.5] }),
    copter: pose({ y: -0.6, lean: 0.0, aF: [2.9, 0.4], aB: [-2.9, 0.4], lF: [0.25, -0.3], lB: [-0.25, -0.3] }),
    knee:   pose({ y: -1.5, lean: 0.2, aF: [2.5, 0.8], aB: [-2.5, 0.8], lF: [1.4, -2.4], lB: [-0.1, -0.6] }),
    zap:    pose({ y: 0.6, lean: 0.25, aF: [1.65, -0.1], aB: [-1.6, 0.4], lF: [0.7, -0.3], lB: [-0.8, -0.1] }),
  };

  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set(), n: 0 }, o || {}); }
  function box(p, f, dx, w, h, dy) {
    const x0 = f > 0 ? pcx(p) + dx : pcx(p) - dx - w, y0 = pcy(p) - (dy || 0) - h / 2;
    return FK.foes().filter(e => ex(e) + (e.w || 0.9) / 2 > x0 && ex(e) - (e.w || 0.9) / 2 < x0 + w && ey(e) + (e.h || 0.9) / 2 > y0 && ey(e) - (e.h || 0.9) / 2 < y0 + h);
  }
  function hit(S, e, dmg, o) {
    o = Object.assign({ c: fc(S) }, o);
    if (form(S) === 'frost') { o.stun = (o.stun || 0.3) + 0.35; e._lbChill = 1.2; }
    FK.hit(S, e, dmg, o); PU.add(S, 'hits');
  }
  function pop() { FK.tone(620, { dur: 0.08, vol: 0.14, type: 'square', slide: 1240 }); FK.noise({ dur: 0.05, cut: 1800, q: 4, vol: 0.14 }); }
  function zapSnd() { FK.noise({ dur: 0.18, cut: 5200, cutEnd: 1400, q: 1, vol: 0.2 }); FK.tone(1600, { dur: 0.1, vol: 0.08, type: 'sawtooth', slide: 400 }); }
  function hand(p, q, f) { const u = p.h / U, K = FK.skel(P, q, 0, 0, u), h = K.aF[2]; return [pcx(p) + f * h[0], p.y + p.h + h[1]]; }

  const SEQ = {
    poke(p, dt, S, q) {   // PLUNGER POKE: a quick double jab
      const f = q.f, n = 2 + Math.round(q.pw);
      const ph = (q.t / 0.13) % 1, on = ph > 0.35;
      S.target = on ? PO.poke : PO.pokeW; S.rate = 55;
      const i = Math.floor(q.t / 0.13);
      if (i !== q.n && i < n) { q.n = i; q.hits.clear(); FK.whoosh(false, false); }
      if (on) for (const e of box(p, f, 0, 1.9, 1.0, 0.1)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 1.2 + (q.n === n - 1 ? 1 + q.pw : 0), { kx: f * (q.n === n - 1 ? 9 : 3), ky: -4, stun: 0.3, big: q.n === n - 1 }); pop(); }
      if (q.t > n * 0.13 + 0.06) S.seq = null;
    },
    arc(p, dt, S, q) {   // VOLT: ARC LASH, a bolt that jumps to up to 3 foes
      S.target = PO.zap; S.rate = 50;
      if (!q.done && q.t > 0.06) {
        q.done = 1; zapSnd();
        let from = hand(p, PO.zap, q.f), left = 3, used = new Set(); S.arcs = [];
        while (left-- > 0) {
          let best = null, bd = 6 + 2 * q.pw;
          for (const e of FK.foes()) { if (used.has(e)) continue; const d = Math.hypot(ex(e) - from[0], ey(e) - from[1]); if (d < bd && (used.size || Math.sign(ex(e) - pcx(p)) === q.f)) { bd = d; best = e; } }
          if (!best) break; used.add(best);
          S.arcs.push([from[0], from[1], ex(best), ey(best)]); hit(S, best, 2 + q.pw, { kx: q.f * 6, ky: -6, stun: 0.5 });
          from = [ex(best), ey(best)];
        }
        if (!S.arcs.length) S.arcs.push([from[0], from[1], from[0] + q.f * 4, from[1]]);
        S.arcT = 0.25;
      }
      if (q.t > 0.3) S.seq = null;
    },
    shot(p, dt, S, q) {   // PLUNGER SHOT / SUCTION SWING: the plunger flies out on its cord
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
      } else if (c.state === 'foe') {   // reel the foe in, then a kick
        q.t2 += dt; const e = c.e;
        if (!e || e.dead) { S.cup = null; S.seq = null; return; }
        c.x = ex(e); c.y = ey(e);
        if (!e._noKnockback) { e.vx = -f * 15; e.vy = -3; }
        if (Math.abs(ex(e) - pcx(p)) < 1.4 || q.t2 > 0.4) { hit(S, e, 2 + q.pw, { kx: f * 10, ky: -8, stun: 0.45, big: true }); FK.smack(true); S.cup = null; S.seq = null; }
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
    zip(p, dt, S, q) {   // VOLT: ZIP, a blink-dash through everything in the way
      const f = q.f, L = 5 + 2 * q.pw;
      S.target = PO.zap; S.rate = 60;
      if (!q.done) {
        q.done = 1; zapSnd(); const x0 = pcx(p);
        let d = 0; while (d < L && FK.moveX(p, f * 0.25)) d += 0.25;
        S.selfMove = true; p.vx = f * 4;
        const lo = Math.min(x0, pcx(p)), hi = Math.max(x0, pcx(p));
        for (const e of FK.foes()) if (ex(e) > lo - 0.5 && ex(e) < hi + 0.5 && Math.abs(ey(e) - pcy(p)) < 1.3) hit(S, e, 2.5 + q.pw, { kx: f * 8, ky: -9, stun: 0.5, big: true });
        S.fx.push({ k: 'trail', x0, x1: pcx(p), y: pcy(p), t: 0, life: 0.35, c: FORMS.volt.c });
      }
      if (q.t > 0.18) S.seq = null;
    },
    scissor(p, dt, S, q) {   // SCISSOR KICK: crouch, one leg kicked straight up (Gale: UPDRAFT, a gust column that lifts him too)
      const gale = form(S) === 'gale';
      S.target = q.t < 0.1 ? PO.scisA : PO.scisB; S.rate = 50;
      if (q.t < 0.1 && p.vy < 0) p.vy = 0;
      if (q.t >= 0.1 && !q.done) { q.done = 1; p.vy = gale ? -20 : -9 - 3 * q.pw; p.onGround = false; FK.whoosh(true, gale); if (gale) S.fx.push({ k: 'gust', x: pcx(p), y: p.y + p.h, t: 0, life: 0.6 }); }
      if (q.t >= 0.1 && q.t < 0.3) for (const e of box(p, FK.face(p), -0.3, 1.4, 2.2, 0.9)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2.5 + 2 * q.pw, { kx: FK.face(p) * 1.5, ky: gale ? -19 : -15 - 3 * q.pw, stun: 0.5, big: true }); FK.smack(true); }
      if (q.t > 0.4) S.seq = null;
    },
    sweep(p, dt, S, q) {   // LEG SWEEP (Frost: lays an ICE SHEET as well)
      const f = q.f;
      S.target = PO.sweep; S.rate = 45; S.rot2 = Math.min(1, q.t / 0.25) * Math.PI * 2;
      for (const e of box(p, f, -1.2, 3.0, 0.9, -0.6)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2 + q.pw, { kx: f * 4, ky: -11, stun: 0.5 }); FK.smack(false); }
      if (!q.done) { q.done = 1; FK.whoosh(false, false); if (form(S) === 'frost') { if (S.ice.length >= 2) S.ice.shift(); S.ice.push({ x: pcx(p) + f * 1.2, fy: p.y + p.h, w: 3.2 + q.pw, t: 0, life: 9, cool: new Map() }); FK.noise({ dur: 0.3, cut: 6000, cutEnd: 2000, q: 2, vol: 0.14 }); } }
      if (q.t > 0.3) { S.rot2 = 0; S.seq = null; }
    },
    flail(p, dt, S, q) {   // FLAIL KICKS: a panicked flurry
      S.target = Math.floor(q.t * 22) % 2 ? PO.flail : PO.flutA; S.rate = 60;
      p.vy = Math.min(p.vy, 1.5);
      if (Math.floor(q.t / 0.08) !== q.n) { q.n = Math.floor(q.t / 0.08); q.hits.clear(); }
      for (const e of FK.within(pcx(p), pcy(p) + 0.3, 1.5)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 0.8, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 3, ky: -3, stun: 0.2 }); FK.smack(false); }
      if (q.t > 0.4) { for (const e of FK.within(pcx(p), pcy(p), 1.6)) hit(S, e, 1.5, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 8, ky: -7, stun: 0.4, big: true }); S.seq = null; }
    },
    copter(p, dt, S, q) {   // SCARF COPTER: the scarf spins overhead like a rotor
      const k = FK.keys(), D = form(S) === 'gale' ? 0.9 : 0.65;
      S.target = PO.copter; S.rate = 40; S.rotor = q.t;
      p.vy = -(10.5 - 8 * q.t / D); p.vx = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 6.5; p.onGround = false;
      if (Math.floor(q.t * 16) !== q.d) { q.d = Math.floor(q.t * 16); FK.whoosh(true, false); }
      for (const e of FK.within(pcx(p), p.y - 0.2, 1.4)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 1.5, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 5, ky: -10, stun: 0.35 }); }
      if (q.t > D) { S.rotor = 0; S.seq = null; }
    },
    knee(p, dt, S, q) {   // KNEE DROP: a meteor knee
      S.target = PO.knee; S.rate = 50;
      if (q.t < 0.1) { p.vy = 0; return; }
      p.vy = 22; if (!q.snd) { q.snd = 1; FK.whoosh(false, true); }
      for (const e of box(p, 1, -0.6, 1.2, 1.4, -0.5)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 3 + q.pw, { kx: 0, ky: 17, stun: 0.5, big: true, stop: 0.06 }); p.vy = -8; S.seq = null; return; }
      if (p.onGround || q.t > 1.2) { FK.thud(false); S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: 1.4, c: fc(S), t: 0, life: 0.35 }); S.seq = null; }
    },
  };

  function stepWorld(p, dt, S, k) {
    const foes = FK.foes();
    // FLUTTER: hold jump while falling, once per jump (Gale: glide for as long as you hold it)
    const gale = form(S) === 'gale', falling = !p.onGround && (p.vy || 0) > 0;
    if (p.onGround) { S.flutT = 0; S.fluttering = false; }
    S.fluttering = false; S.gliding = false;
    if (falling && k.jump && !S.seq) {
      if (gale) { p.vy = Math.min(p.vy, 2.2); S.gliding = true; p.vx = (p.vx || 0) * 0.98 + FK.face(p) * 0.4; }
      else if (S.flutT < 0.85) { S.flutT += dt; p.vy = Math.max(-3.5, p.vy - 60 * dt); S.fluttering = true; if (Math.floor(S.flutT * 14) !== S.flutD) { S.flutD = Math.floor(S.flutT * 14); FK.tone(260 + S.flutT * 200, { dur: 0.05, vol: 0.05, type: 'square' }); } }
    }
    // ice sheets: foes that touch one slip and fall over
    for (let i = S.ice.length - 1; i >= 0; i--) {
      const d = S.ice[i]; d.t += dt;
      for (const [e, c] of d.cool) { if (c - dt <= 0) d.cool.delete(e); else d.cool.set(e, c - dt); }
      for (const e of foes) if (!d.cool.has(e) && Math.abs(ex(e) - d.x) < d.w / 2 && Math.abs(e.y + (e.h || 0.9) - d.fy) < 0.4) { d.cool.set(e, 1.2); hit(S, e, 1, { kx: (Math.sign(e.vx || 1)) * 6, ky: -6, stun: 0.9 }); }
      if (d.t > d.life) S.ice.splice(i, 1);
    }
    if (S.arcT > 0) S.arcT -= dt;
  }

  const MOVES = {
    ground: { neutral: { name: 'Plunger Poke', cd: 0.3 }, side: { name: 'Plunger Shot', cd: 0.5 }, up: { name: 'Scissor Kick', cd: 0.45 }, down: { name: 'Leg Sweep', cd: 0.45 } },
    air:    { neutral: { name: 'Flail Kicks', cd: 0.4 }, side: { name: 'Suction Swing', cd: 0.5 }, up: { name: 'Scarf Copter', cd: 0.3 }, down: { name: 'Knee Drop', cd: 0.4 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  FK.define({
    id: ID, plug: 'lbro',
    def: { name: 'L-Brother', icon: '🪠', tier: 'prismatic', color: C_JAK, color2: '#ffe14d',
      ability: 'Lanky high-jumper: flutter in the air, a plunger grapple, and power-ups for GALE, FROST and VOLT forms',
      desc: 'The younger brother: tall, thin and jumpy, with a knit beanie, a long scarf and a plunger on a cord. Hold jump while falling to FLUTTER. The plunger sticks to foes (reels them in for a kick) or to walls (pulls him there). Tasks fill the rings over his head (5 s in the air, 6 hits, 50 tiles run); each puts a Tool Crate over his head: bump it from below and catch the power-up that slides out: 🪶 GALE (glide, Updraft), ❄️ FROST (chilling hits, Ice Sheet) or ⚡ VOLT (Arc Lash chains foes, Zip blinks through them). A form lasts 24 s; two hits end it.' },
    stats: { speed: 1.08, jump: 1.25, maxJumps: 2, maxDashes: 1, hp: 3 },
    statMod: S => form(S) === 'volt' ? { speed: 1.3 } : form(S) === 'gale' ? { jump: 1.35 } : {},
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, rotor: 0, rot2: 0, cup: null, arcs: [], arcT: 0, ice: [], flutT: 0, airUp: false, pu: PU.init() }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Scarf Copter comes back when you land'; return null; },
    act: {
      ground_neutral: (p, f, pw, S) => { if (form(S) === 'volt') { startSeq(S, 'arc', { f, pw }); return 'ARC LASH'; } startSeq(S, 'poke', { f, pw }); },
      ground_side: (p, f, pw, S) => { if (form(S) === 'volt') { startSeq(S, 'zip', { f, pw }); return 'ZIP'; } startSeq(S, 'shot', { f, pw }); },
      ground_up: (p, f, pw, S) => { startSeq(S, 'scissor', { f, pw }); return form(S) === 'gale' ? 'UPDRAFT' : null; },
      ground_down: (p, f, pw, S) => { startSeq(S, 'sweep', { f, pw }); return form(S) === 'frost' ? 'ICE SHEET' : null; },
      air_neutral: (p, f, pw, S) => { if (form(S) === 'volt') { startSeq(S, 'arc', { f, pw }); return 'ARC LASH'; } startSeq(S, 'flail', { f, pw }); },
      air_side: (p, f, pw, S) => { if (form(S) === 'volt') { startSeq(S, 'zip', { f, pw }); return 'ZIP'; } startSeq(S, 'shot', { f, pw, air: true }); },
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'copter', { f, pw }); },
      air_down: (p, f, pw, S) => startSeq(S, 'knee', { f, pw }),
    },
    onTeleport(p, S) { S.seq = null; S.cup = null; S.rotor = 0; S.ice.length = 0; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq) { S.seq = null; S.cup = null; S.rotor = 0; S.rot2 = 0; }
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      if (!S.seq) { S.rotor = 0; S.rot2 = 0; S.cup = null; }
      stepWorld(p, dt, S, k);
      PU.tick(p, dt, S);
      if (!S.seq) {
        if (S.gliding) S.target = PO.glide;
        else if (S.fluttering) S.target = Math.floor(performance.now() / 70) % 2 ? PO.flutA : PO.flutB;
        else S.target = FK.locomotion(S, p, dt, PO, { lean: 0.3 });
        if (S.fluttering) S.rate = 40;
      }
      if (p.onGround) S.airUp = false;
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing: a tall thin worrier with a beanie, a long scarf and a plunger
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, fm = S && S.pu ? S.pu.form : null, F = fm ? FORMS[fm] : null;
      const s = ph / U, cx = px + pw / 2, fy = py + ph;
      const jak = F ? F.jak : C_JAK, jak2 = F ? F.jak2 : C_JAK2;
      ctx.save();
      if (S && S.rot2) { ctx.translate(cx, fy - ph * 0.2); ctx.rotate(-S.rot2 * 0.08); ctx.translate(-cx, -(fy - ph * 0.2)); }
      const K = FK.skel(P, q, cx, fy, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (F) { const ag = ctx.createRadialGradient(cx, fy - ph * 0.45, ph * 0.1, cx, fy - ph * 0.45, ph * 0.62); ag.addColorStop(0, F.glow + '55'); ag.addColorStop(1, F.glow + '00'); ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, fy - ph * 0.45, ph * 0.62, 0, Math.PI * 2); ctx.fill(); }   // the form's glow: one soft circle (a canvas blur on every limb was far too slow on phones)
      if (S && S.pu && S.pu.flash > 0 && Math.sin(t * 50) > 0) ctx.globalAlpha = 0.6;
      // the scarf trails behind (wings in Gale form, a rotor in the copter)
      scarf(ctx, K, s, t, S, fm);
      FK.limb(ctx, K.lB, 3.8 * s, C_BIB2, 3.6 * s);
      shoe(ctx, K.lB[2], s, 0.9);
      FK.limb(ctx, K.aB, 3.4 * s, jak2, 3 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 2 * s, C_SKIN);
      // torso: a work shirt with rolled sleeves under long bib overalls (straps, brass buttons, an L patch on the bib)
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s, W = 11.5 * s;
      FK.blob(ctx, W, Lt + 1.5 * s, jak, jak2, 4 * s);
      ctx.shadowBlur = 0;
      const bg = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); bg.addColorStop(0, C_BIB2); bg.addColorStop(0.6, C_BIB); bg.addColorStop(1, '#7a85a2');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(-W / 2, -Lt * 0.45, W, Lt * 0.45 + 1.5 * s, [0, 0, 3 * s, 3 * s]); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-W * 0.32, -Lt * 0.78, W * 0.64, Lt * 0.4, 1.2 * s); ctx.fill();
      ctx.fillRect(-W * 0.38, -Lt - 0.5 * s, 1.8 * s, Lt * 0.3); ctx.fillRect(W * 0.38 - 1.8 * s, -Lt - 0.5 * s, 1.8 * s, Lt * 0.3);
      ctx.fillStyle = '#ffd166'; for (const bx of [-W * 0.25, W * 0.25]) { ctx.beginPath(); ctx.arc(bx, -Lt * 0.72, 0.95 * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-W * 0.17, -Lt * 0.66, W * 0.34, W * 0.3, 0.8 * s); ctx.fill();
      ctx.fillStyle = fm ? F.jak2 : C_JAK2; ctx.font = `900 ${W * 0.26}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('L', 0, -Lt * 0.66 + W * 0.155);
      if (fm === 'volt') { ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 0.8 * s; ctx.beginPath(); ctx.moveTo(-W * 0.4, -Lt * 0.3); for (let i = 1; i < 6; i++) ctx.lineTo(-W * 0.4 + i * W * 0.16, -Lt * 0.3 + (i % 2 ? -1 : 1) * 1.2 * s * Math.sin(t * 30 + i)); ctx.stroke(); }
      ctx.restore();
      ctx.shadowBlur = 0;
      FK.limb(ctx, K.lF, 4.0 * s, C_BIB, 3.8 * s);
      shoe(ctx, K.lF[2], s, 1);
      // head: long face, worried brows, a big curl of hair at the back, the knit beanie with an L and a pompom
      ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
      const hr = K.hr;
      ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.ellipse(-hr * 0.55, hr * 0.1, hr * 0.45, hr * 0.65, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.ellipse(hr * 0.12, hr * 0.28, hr * 0.8, hr * 1.12, 0, 0, Math.PI * 2); ctx.fill();   // a long face and chin
      ctx.fillStyle = 'rgba(60,40,30,0.18)'; ctx.beginPath(); ctx.ellipse(hr * 0.2, hr * 1.05, hr * 0.42, hr * 0.28, 0, 0, Math.PI * 2); ctx.fill();   // stubble
      ctx.fillStyle = '#e8a985'; ctx.beginPath(); ctx.ellipse(-hr * 0.5, hr * 0.22, hr * 0.16, hr * 0.26, 0, 0, Math.PI * 2); ctx.fill();   // ear
      ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.moveTo(-hr * 0.75, -hr * 0.35); ctx.lineTo(-hr * 0.42, -hr * 0.35); ctx.lineTo(-hr * 0.36, hr * 0.5); ctx.lineTo(-hr * 0.66, hr * 0.38); ctx.closePath(); ctx.fill();   // sideburn
      const scared = S && (S.fluttering || (S.seq && S.seq.kind === 'flail'));
      for (const dx of [0.28, 0.66]) {   // small eyes; wide open when he panics
        const er = scared ? 0.15 : 0.12;
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(hr * dx, hr * 0.02, hr * er, hr * (er + 0.03), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#26402f'; ctx.beginPath(); ctx.arc(hr * (dx + 0.03), hr * 0.04, hr * (scared ? 0.05 : 0.075), 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = C_MUST; ctx.lineWidth = hr * 0.09; ctx.lineCap = 'round';   // brows: worried, higher when scared
      ctx.beginPath(); ctx.moveTo(hr * 0.12, -hr * (scared ? 0.36 : 0.22)); ctx.lineTo(hr * 0.4, -hr * 0.3); ctx.moveTo(hr * 0.54, -hr * 0.3); ctx.lineTo(hr * 0.82, -hr * (scared ? 0.36 : 0.22)); ctx.stroke();
      ctx.fillStyle = '#e8a985'; ctx.beginPath(); ctx.ellipse(hr * 0.82, hr * 0.32, hr * 0.17, hr * 0.27, 0.15, 0, Math.PI * 2); ctx.fill();   // a long nose
      // mouth (under the mustache), then the mustache: long and narrower than his brother's, the ends flicked up
      ctx.fillStyle = '#7a3a2a'; ctx.beginPath(); if (scared) ctx.ellipse(hr * 0.55, hr * 0.95, hr * 0.11, hr * 0.15, 0, 0, Math.PI * 2); else ctx.ellipse(hr * 0.55, hr * 0.88, hr * 0.16, hr * 0.06, 0, 0, Math.PI); ctx.fill();
      const tw = Math.sin(t * 3) * hr * 0.03;
      ctx.fillStyle = C_MUST; ctx.beginPath(); ctx.moveTo(hr * 0.2, hr * 0.6);
      ctx.quadraticCurveTo(hr * 0.0, hr * 0.62, -hr * 0.06, hr * 0.42 + tw); ctx.quadraticCurveTo(hr * 0.12, hr * 0.62, hr * 0.32, hr * 0.5);
      ctx.quadraticCurveTo(hr * 0.55, hr * 0.42, hr * 0.78, hr * 0.5); ctx.quadraticCurveTo(hr * 1.0, hr * 0.62, hr * 1.12, hr * 0.42 - tw);
      ctx.quadraticCurveTo(hr * 1.08, hr * 0.66, hr * 0.88, hr * 0.68); ctx.quadraticCurveTo(hr * 0.55, hr * 0.6, hr * 0.2, hr * 0.6); ctx.fill();
      const hat = fm ? F.c : C_HAT, hat2 = fm ? F.jak2 : C_HAT2;
      ctx.fillStyle = hat; ctx.beginPath(); ctx.moveTo(-hr * 0.85, -hr * 0.35); ctx.quadraticCurveTo(-hr * 0.9, -hr * 1.55, hr * 0.15, -hr * 1.55); ctx.quadraticCurveTo(hr * 1.0, -hr * 1.5, hr * 0.95, -hr * 0.35); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hat2; ctx.beginPath(); ctx.roundRect(-hr * 0.92, -hr * 0.5, hr * 1.95, hr * 0.32, hr * 0.12); ctx.fill();
      ctx.strokeStyle = hat2; ctx.lineWidth = hr * 0.06; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * hr * 0.3, -hr * 0.55); ctx.lineTo(i * hr * 0.28, -hr * 1.4); ctx.stroke(); }
      const bob = Math.sin(t * 6) * hr * 0.08;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-hr * 0.3, -hr * 1.65 + bob, hr * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hr * 0.45, -hr * 0.98, hr * 0.27, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hat2; ctx.font = `900 ${hr * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('L', hr * 0.45, -hr * 0.96);
      ctx.restore();
      // front arm with the plunger (unless it is out on its cord)
      FK.limb(ctx, K.aF, 3.6 * s, jak, 3.2 * s);
      const hx = K.aF[2][0], hy = K.aF[2][1], an = q.aF[0] + q.aF[1];
      if (!(S && S.cup)) { ctx.save(); ctx.translate(hx, hy); ctx.rotate(-an + Math.PI); plunger(ctx, s, fm); ctx.restore(); }
      FK.mitt(ctx, hx, hy, 2.1 * s, C_SKIN);
      ctx.restore();
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T;
      for (const d of S.ice) {
        const a = Math.min(1, d.t / 0.2) * Math.min(1, (d.life - d.t) / 0.6), x = V.SX(d.x - d.w / 2), y = V.SY(d.fy);
        const g = ctx.createLinearGradient(x, y - 6, x, y + 2); g.addColorStop(0, 'rgba(220,245,255,0.9)'); g.addColorStop(1, 'rgba(124,200,255,0.5)');
        FK.solid(ctx, '#fff', a); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y - 5, d.w * T, 6, 3); ctx.fill();
        for (let i = 0; i < 4; i++) { const sx = x + ((i * 0.27 + V.now * 0.15) % 1) * d.w * T; FK.glow(ctx, '#ffffff', a * 0.8); ctx.fillRect(sx, y - 4, 6, 1.5); }
      }
      if (S.cup) {   // the cord and the plunger
        const h = FK.local(V, p, FK.face(p), 0.5, p.h * 0.6), x = V.SX(S.cup.x), y = V.SY(S.cup.y);
        FK.solid(ctx, '#d8d2c4', 1); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.quadraticCurveTo((h[0] + x) / 2, (h[1] + y) / 2 + 10, x, y); ctx.stroke();
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(y - h[1], x - h[0]) + Math.PI / 2); plunger(ctx, T / U, PU.form(S)); ctx.restore();
      }
      if (S.arcT > 0) for (const a of S.arcs) bolt(ctx, V.SX(a[0]), V.SY(a[1]), V.SX(a[2]), V.SY(a[3]), S.arcT / 0.25);
      PU.draw(ctx, V, S);
    },
    drawFx(ctx, V, f, u, a) {
      if (f.k === 'trail') { const y = V.SY(f.y); FK.glow(ctx, f.c, a * 0.6); ctx.lineWidth = V.T * 0.5 * a; ctx.beginPath(); ctx.moveTo(V.SX(f.x0), y); ctx.lineTo(V.SX(f.x1), y); ctx.stroke(); bolt(ctx, V.SX(f.x0), y, V.SX(f.x1), y, a); return true; }
      if (f.k === 'gust') { const x = V.SX(f.x), y = V.SY(f.y); for (let i = 0; i < 4; i++) { const yy = y - (u * 4 + i * 0.7) * V.T; ctx.beginPath(); ctx.ellipse(x, yy, V.T * (0.6 + i * 0.15), V.T * 0.18, 0, 0, Math.PI * 2); FK.glow(ctx, '#e8fbff', a * 0.6); ctx.lineWidth = 2; ctx.stroke(); } return true; }
      return false;
    },
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      if (I.air) {
        if (I.dy < -1.5 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.dy > 1 && I.adx < 1.2) return { type: 'tap', v: 'down' };
        if (I.adx < 1.6 && Math.abs(I.dy) < 1.4) return { type: 'tap', v: '' };
        if (I.adx < 6 && Math.abs(I.dy) < 1.5) return { type: 'tap', v: 'side' };
        return null;
      }
      if (I.adx < 1.9 && Math.abs(I.dy) < 1.2) return { type: 'tap', v: Math.random() < 0.5 ? '' : 'down' };
      if (I.dy < -1.5 && I.adx < 1.5) return { type: 'tap', v: 'up' };
      if (I.adx < 7 && Math.abs(I.dy) < 1) return { type: 'tap', v: 'side' };
      return null;
    },
  });

  function shoe(ctx, at, s, k) {
    ctx.fillStyle = C_SHOE; ctx.beginPath(); ctx.roundRect(at[0] - 1.6 * s, at[1] - 1.4 * s, 5.4 * s * k, 2.6 * s, 1.3 * s); ctx.fill();
    ctx.fillStyle = '#c94a4a'; ctx.fillRect(at[0] - 1.6 * s, at[1] + 0.7 * s, 5.4 * s * k, 0.6 * s);
  }
  function plunger(ctx, s, fm) {   // the handle along -y from the grip, the rubber cup at the end
    ctx.fillStyle = '#c99a5a'; ctx.fillRect(-0.6 * s, -9 * s, 1.2 * s, 10.5 * s);
    ctx.fillStyle = fm === 'frost' ? '#9fd8ff' : fm === 'volt' ? '#ffd84a' : '#d63a4a';
    ctx.beginPath(); ctx.moveTo(-0.8 * s, -9 * s); ctx.quadraticCurveTo(-3.4 * s, -10 * s, -3.2 * s, -12.6 * s); ctx.lineTo(3.2 * s, -12.6 * s); ctx.quadraticCurveTo(3.4 * s, -10 * s, 0.8 * s, -9 * s); ctx.fill();
  }
  function scarf(ctx, K, s, t, S, fm) {
    const nx = K.neck[0], ny = K.neck[1] + s;
    if (S && S.rotor) {   // copter: two scarf ends spinning overhead
      const cxr = K.head[0], cyr = K.head[1] - K.hr * 1.9, a = S.rotor * 40;
      for (let i = 0; i < 2; i++) { const an = a + i * Math.PI; ctx.fillStyle = i ? C_SCARF2 : C_SCARF; ctx.beginPath(); ctx.ellipse(cxr + Math.cos(an) * 7 * s, cyr, 7 * s, 1.6 * s, 0, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    if (fm === 'gale') {   // wings
      for (let side = -1; side <= 1; side += 2) {
        const flap = Math.sin(t * (S && S.gliding ? 4 : 9)) * 0.35;
        ctx.save(); ctx.translate(nx - 2 * s, ny + 2 * s); ctx.rotate(-0.4 + side * 0.15 + flap);
        ctx.fillStyle = side < 0 ? '#bfeaff' : '#ffffff'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-14 * s, -10 * s, -20 * s, -2 * s); ctx.quadraticCurveTo(-12 * s, 0, -16 * s, 4 * s); ctx.quadraticCurveTo(-8 * s, 3 * s, 0, 3 * s); ctx.fill(); ctx.restore();
      }
    }
    const pts = [];   // a long scarf end streaming backwards, waving
    for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([nx - u * 14 * s, ny + u * 4 * s + Math.sin(t * 8 - u * 5) * u * 3 * s]); }
    ctx.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i++) { ctx.strokeStyle = i % 2 ? C_SCARF2 : C_SCARF; ctx.lineWidth = (3.4 - i * 0.2) * s; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke(); }
    ctx.fillStyle = C_SCARF; ctx.beginPath(); ctx.ellipse(nx, ny, 4.2 * s, 2.2 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  function bolt(ctx, x0, y0, x1, y1, a) {
    const n = 8; ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(x0 + (x1 - x0) * u + (Math.random() - 0.5) * 14, y0 + (y1 - y0) * u + (Math.random() - 0.5) * 14); }
    ctx.lineTo(x1, y1); FK.glow(ctx, '#ffe14d', a); ctx.lineWidth = 3; ctx.stroke(); FK.glow(ctx, '#ffffff', a); ctx.lineWidth = 1.2; ctx.stroke();
  }
})();
