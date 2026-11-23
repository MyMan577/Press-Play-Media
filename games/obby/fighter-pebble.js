/* Obby Builder: GRAND PEBBLE, the legendary skipping stone.
 *
 * A round, mossy stone with glowing runes, stubby stone arms and little feet. Heavy, sturdy and stubborn.
 *
 * THE GIMMICKS
 *  - STONE SKIP: land while moving fast and he skips off the floor like a flat stone across water (up to 3 skips in a row,
 *    each a little lower). Skipping into a foe bowls it over. Hold ↓ to land without skipping.
 *  - ROCK SOLID (ground ↓ + S): he turns to solid stone: hits barely move him, and letting go sends out a quake.
 *  - Squash and stretch: he squashes on landing, stretches when he jumps, and rolls when he tumbles.
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge)
 *  Ground: neutral PEBBLE PUNCH (a 3-hit combo), side SKIP SHOT (a pebble skips along the floor), up GEYSER (a rock pillar), down ROCK SOLID.
 *  Air:    neutral TUMBLE, side SKIP DASH, up SLINGSHOT (recovery), down BOULDER DROP.
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'pl_grand_pebble';
  const C_ST = '#a89c7a', C_ST2 = '#6e6448', C_ST3 = '#d8cca4', C_MOSS = '#5fa03a', C_MOSS2 = '#3d7a24', C_RUNE = '#7dff5a', C_DARK = '#3a3220';
  const { ex, ey, pcx, pcy } = FK;

  // his body is not a skeleton: a few animated numbers drive it
  //  sx, sy: squash/stretch   roll: body spin   aF, aB: arm reach (0 tucked .. 1 punched out) and lift   feet: step phase
  const BASE = { sx: 1, sy: 1, roll: 0, aF: 0, aFy: 0, aB: 0, aBy: 0, tilt: 0, grow: 1 };

  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set(), n: 0 }, o || {}); }
  function box(p, f, dx, w, h, dy) {
    const x0 = f > 0 ? pcx(p) + dx : pcx(p) - dx - w, y0 = pcy(p) - (dy || 0) - h / 2;
    return FK.foes().filter(e => ex(e) + (e.w || 0.9) / 2 > x0 && ex(e) - (e.w || 0.9) / 2 < x0 + w && ey(e) + (e.h || 0.9) / 2 > y0 && ey(e) - (e.h || 0.9) / 2 < y0 + h);
  }
  function hit(S, e, dmg, o) { FK.hit(S, e, dmg, Object.assign({ c: C_RUNE }, o)); }
  function knock(big) { FK.tone(big ? 90 : 150, { dur: big ? 0.3 : 0.12, vol: 0.4, type: 'sine', slide: 50 }); FK.noise({ dur: big ? 0.18 : 0.07, cut: 900, cutEnd: 300, q: 1, vol: big ? 0.3 : 0.18 }); }
  function plink(i) { FK.tone(700 + i * 120, { dur: 0.07, vol: 0.1, type: 'triangle', slide: 400 }); }
  function anim(S, o) { S.goal = Object.assign({}, BASE, o); }

  const SEQ = {
    punch(p, dt, S, q) {   // PEBBLE PUNCH: left, right, then a big two-handed slam
      const f = q.f, step = Math.floor(q.t / 0.16), u = (q.t % 0.16) / 0.16;
      const out = u > 0.3 && u < 0.75;
      if (step === 0) anim(S, { aF: out ? 1 : 0.1, aFy: 0, sx: out ? 1.08 : 1, tilt: out ? 0.15 : -0.05 });
      else if (step === 1) anim(S, { aB: out ? 1 : 0.1, aBy: 0, sx: out ? 1.08 : 1, tilt: out ? 0.15 : -0.05 });
      else anim(S, { aF: out ? 1.2 : -0.2, aB: out ? 1.2 : -0.2, aFy: out ? 0.2 : -0.8, aBy: out ? 0.2 : -0.8, sy: out ? 0.85 : 1.1, sx: out ? 1.15 : 0.95, tilt: out ? 0.3 : -0.2 });
      S.rate = 40;
      if (step !== q.n) { q.n = step; q.hits.clear(); }
      if (out && step < 3) for (const e of box(p, f, 0, 1.7, 1.2)) if (!q.hits.has(e)) {
        q.hits.add(e); const fin = step === 2;
        hit(S, e, fin ? 3 + 2 * q.pw : 1.2, { kx: f * (fin ? 12 + 5 * q.pw : 3), ky: fin ? -8 : -3, stun: fin ? 0.5 : 0.3, big: fin, stop: fin ? 0.07 : 0 });
        knock(fin);
      }
      if (q.t > 0.48) S.seq = null;
    },
    skipShot(p, dt, S, q) {   // SKIP SHOT: a flat pebble skips along the ground
      anim(S, { aF: q.t < 0.1 ? -0.4 : 1.1, aFy: 0.4, tilt: q.t < 0.1 ? -0.2 : 0.25, sx: 1.05 }); S.rate = 40;
      if (q.t >= 0.1 && !q.done) { q.done = 1; S.shots.push({ x: pcx(p) + q.f * 0.6, y: p.y + p.h - 0.35, vx: q.f * (13 + 4 * q.pw), vy: -4, t: 0, skips: 0, max: 4 + Math.round(2 * q.pw), hits: new Set(), rot: 0 }); FK.whoosh(false, false); }
      if (q.t > 0.3) S.seq = null;
    },
    geyser(p, dt, S, q) {   // GEYSER: stomp, and a rock pillar bursts up in front (stand on it while it lasts)
      anim(S, { sy: q.t < 0.12 ? 0.75 : 1.15, sx: q.t < 0.12 ? 1.2 : 0.92, aF: 0.3, aFy: -1, aB: 0.3, aBy: -1 }); S.rate = 40;
      if (q.t < 0.12 && p.vy < 0) p.vy = 0;
      if (q.t >= 0.12 && !q.done) {
        q.done = 1; const x = pcx(p) + q.f * (1.8 + q.pw), fy = FK.floorAt(x, p.y, 3);
        if (fy != null) {
          if (S.pillars.length >= 2) S.pillars.shift();
          S.pillars.push({ x, fy, H: 2.4 + q.pw, w: 1.1, t: 0, life: 4, hits: new Set() });
          knock(true); FK.shake(5);
        }
      }
      if (q.t > 0.35) S.seq = null;
    },
    solid(p, dt, S, q) {   // ROCK SOLID: armour while held (up to 1.2 s), then a quake
      const held = FK.keys().down || window._gameKeys && window._gameKeys.has('s');
      anim(S, { sy: 0.88, sx: 1.12, aF: -0.3, aB: -0.3, aFy: 0.6, aBy: 0.6 }); S.rate = 30; S.stone = 1;
      p._armorT = Math.max(p._armorT || 0, 0.12); p.vx = 0;
      if (q.t < 0.1 && !q.snd) { q.snd = 1; FK.tone(110, { dur: 0.4, vol: 0.2, type: 'sine', slide: 70 }); }
      if (q.t > 1.2 || (q.t > 0.3 && !held)) {
        S.stone = 0; const R = 2.2 + 0.8 * Math.min(1, q.t);
        S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R, c: C_RUNE, t: 0, life: 0.5 }); knock(true); FK.shake(7);
        for (const e of FK.within(pcx(p), p.y + p.h - 0.4, R)) hit(S, e, 2.5 + q.t * 1.5, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 8, ky: -10, stun: 0.5, big: true });
        S.seq = null;
      }
    },
    tumble(p, dt, S, q) {   // TUMBLE: a rolling spin
      anim(S, { roll: q.t / 0.4 * Math.PI * 2 * q.f, aF: 0.6, aB: 0.6, sx: 0.95, sy: 0.95 }); S.rate = 60;
      p.vy = Math.min(p.vy, 3);
      if (Math.floor(q.t / 0.13) !== q.n) { q.n = Math.floor(q.t / 0.13); q.hits.clear(); }
      for (const e of FK.within(pcx(p), pcy(p), 1.4)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 1.4, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 7, ky: -6, stun: 0.3 }); knock(false); }
      if (q.t > 0.4) S.seq = null;
    },
    skipDash(p, dt, S, q) {   // SKIP DASH: skips across the air in two flat hops
      const f = q.f, hop = Math.floor(q.t / 0.2);
      anim(S, { sx: 1.2, sy: 0.8, roll: f * q.t * 10, aF: 0.2, aB: 0.2 }); S.rate = 50; S.selfMove = true;
      if (hop !== q.n) { q.n = hop; if (hop < 2) { p.vy = -6; plink(hop); S.fx.push({ k: 'splash', x: pcx(p), y: p.y + p.h, t: 0, life: 0.4 }); } }
      FK.moveX(p, f * 15 * dt); p.vx = f * 5;
      for (const e of box(p, f, -0.4, 1.3, 1.2)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2 + q.pw, { kx: f * 10, ky: -6, stun: 0.4, big: true }); knock(false); }
      if (q.t > 0.4) S.seq = null;
    },
    sling(p, dt, S, q) {   // SLINGSHOT: squeezes, then shoots straight up
      if (q.t < 0.12) { anim(S, { sy: 0.7, sx: 1.25, aF: -0.2, aB: -0.2, aFy: 0.8, aBy: 0.8 }); S.rate = 40; p.vy = Math.min(p.vy, 1); return; }
      anim(S, { sy: 1.3, sx: 0.8, aF: 0.2, aB: 0.2, aFy: -1.2, aBy: -1.2 }); S.rate = 40;
      if (!q.done) { q.done = 1; p.vy = -19; p.onGround = false; FK.whoosh(true, true); }
      for (const e of FK.within(pcx(p), p.y, 1.2)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 2, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 3, ky: -13, stun: 0.4 }); }
      if (q.t > 0.4) S.seq = null;
    },
    boulder(p, dt, S, q) {   // BOULDER DROP: swells up and falls like a boulder
      if (q.t < 0.2) { anim(S, { grow: 1 + q.t * 2, roll: q.t * 20, sx: 1, sy: 1 }); S.rate = 40; p.vy = -1; p.vx = 0; return; }
      anim(S, { grow: 1.4, sy: 1.1, sx: 0.95 }); S.rate = 40; p.vy = 26; p.vx = 0;
      for (const e of box(p, 1, -0.9, 1.8, 1.6, -0.6)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 4 + q.pw, { kx: 0, ky: 17, stun: 0.6, big: true, stop: 0.08 }); }
      if (p.onGround || q.t > 1.5) {
        const R = 2.8 + q.pw; S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R, c: C_RUNE, t: 0, life: 0.55 }); knock(true); FK.shake(9);
        for (const e of FK.within(pcx(p), p.y + p.h - 0.4, R)) if (!q.hits.has(e)) hit(S, e, 3, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 8, ky: -11, stun: 0.5, big: true });
        S.squash = 1; S.seq = null;
      }
    },
  };

  function stepWorld(p, dt, S, k) {
    const foes = FK.foes();
    // STONE SKIP: landing fast while moving skips him back up, lower each time
    if (p.onGround && !S.wasGround) {
      const sp = Math.abs(S.lastVx || 0);
      if (sp > 6 && !k.down && S.skips < 3 && !S.seq && (S.lastVy || 0) > 2) {
        S.skips++; p.vy = -(9 - S.skips * 2); p.vx = S.lastVx * 1.05; p.onGround = false;
        plink(S.skips); S.fx.push({ k: 'splash', x: pcx(p), y: p.y + p.h, t: 0, life: 0.45 }); S.squash = 0.8;
        for (const e of FK.within(pcx(p) + Math.sign(p.vx) * 0.6, pcy(p), 1.2)) hit(S, e, 2, { kx: Math.sign(p.vx) * 9, ky: -7, stun: 0.4, big: true });
        if (S.skips === 1) FK.label(S, p, 'SKIP!', C_RUNE, false); else if (S.skips === 3) FK.label(S, p, 'TRIPLE SKIP!', C_RUNE, true);
      } else { if ((S.lastVy || 0) > 7) { S.squash = 1; knock(false); } S.skips = 0; }
    }
    if (p.onGround && Math.abs(p.vx || 0) < 3) S.skips = 0;
    S.wasGround = p.onGround; S.lastVx = p.vx; S.lastVy = p.vy;
    // skip-shot pebbles
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const b = S.shots[i]; b.t += dt; b.vy += 30 * dt; b.rot += dt * 20;
      b.x += b.vx * dt; const ny = b.y + b.vy * dt;
      if (FK.blocked(b.x - 0.1, ny - 0.1, 0.2, 0.2) && b.vy > 0) { b.skips++; b.vy = -6 + b.skips * 0.8; b.vx *= 0.92; plink(b.skips); S.fx.push({ k: 'splash', x: b.x, y: b.y + 0.1, t: 0, life: 0.35 }); } else b.y = ny;
      let gone = b.skips > b.max || b.t > 3 || FK.blocked(b.x - 0.1 + Math.sign(b.vx) * 0.1, b.y - 0.15, 0.2, 0.1);
      if (!gone) for (const e of foes) if (!b.hits.has(e) && Math.abs(ex(e) - b.x) < 0.6 && Math.abs(ey(e) - b.y) < 0.7) { b.hits.add(e); hit(S, e, 1.5, { kx: Math.sign(b.vx) * 6, ky: -7, stun: 0.35 }); knock(false); }
      if (gone) S.shots.splice(i, 1);
    }
    // geyser pillars: rise fast, hit foes on the way up, can be stood on, then crumble
    for (let i = S.pillars.length - 1; i >= 0; i--) {
      const pl = S.pillars[i]; pl.t += dt;
      const h = pl.H * Math.min(1, pl.t / 0.15) * (pl.t > pl.life - 0.4 ? Math.max(0, (pl.life - pl.t) / 0.4) : 1), top = pl.fy - h;
      pl.top = top;
      if (pl.t < 0.25) for (const e of foes) if (!pl.hits.has(e) && Math.abs(ex(e) - pl.x) < pl.w / 2 + 0.4 && ey(e) > top - 0.6 && ey(e) < pl.fy) { pl.hits.add(e); hit(S, e, 3, { kx: 0, ky: -17, stun: 0.6, big: true }); }
      if (h > 0.3) FK.stand(p, top, pl.x - pl.w / 2, pl.x + pl.w / 2) && (S.selfMove = true);
      if (pl.t > pl.life) S.pillars.splice(i, 1);
    }
  }

  const MOVES = {
    ground: { neutral: { name: 'Pebble Punch', cd: 0.35 }, side: { name: 'Skip Shot', cd: 0.45 }, up: { name: 'Geyser', cd: 0.7 }, down: { name: 'Rock Solid', cd: 0.8 } },
    air:    { neutral: { name: 'Tumble', cd: 0.4 }, side: { name: 'Skip Dash', cd: 0.45 }, up: { name: 'Slingshot', cd: 0.3 }, down: { name: 'Boulder Drop', cd: 0.5 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  FK.define({
    id: ID, plug: 'pebble', locked: true,
    def: { name: 'Grand Pebble', icon: '🪨', tier: 'godly', color: C_RUNE, color2: '#d8cca4',
      ability: 'Legendary skipping stone: Stone Skip off the floor, Rock Solid armour, pillars and boulder drops',
      desc: 'A round, mossy, legendary stone with glowing runes and stubby arms. Land while running fast and he SKIPS off the floor like a stone on water (up to 3 times; skipping into a foe bowls it over; hold ↓ to stop). Moves: Pebble Punch (3 hits), Skip Shot (a pebble that skips along the floor), Geyser (a rock pillar you can stand on), Rock Solid (armour, then a quake); in the air Tumble, Skip Dash, Slingshot and Boulder Drop.' },
    stats: { speed: 1.08, jump: 1.15, maxJumps: 2, maxDashes: 1, hp: 6 },
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, anim: Object.assign({}, BASE), goal: Object.assign({}, BASE), rate: 18, walk: 0, shots: [], pillars: [], skips: 0, squash: 0, stone: 0, airUp: false }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Slingshot comes back when you land'; return null; },
    act: {
      ground_neutral: (p, f, pw, S) => startSeq(S, 'punch', { f, pw }),
      ground_side: (p, f, pw, S) => startSeq(S, 'skipShot', { f, pw }),
      ground_up: (p, f, pw, S) => startSeq(S, 'geyser', { f, pw }),
      ground_down: (p, f, pw, S) => startSeq(S, 'solid', { f, pw }),
      air_neutral: (p, f, pw, S) => startSeq(S, 'tumble', { f, pw }),
      air_side: (p, f, pw, S) => startSeq(S, 'skipDash', { f, pw }),
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'sling', { f, pw }); },
      air_down: (p, f, pw, S) => startSeq(S, 'boulder', { f, pw }),
    },
    onTeleport(p, S) { S.seq = null; S.shots.length = 0; S.pillars.length = 0; S.stone = 0; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq && S.seq.kind !== 'solid') S.seq = null;
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      if (!S.seq) {
        S.stone = 0;
        // idle breathing, waddling run, stretched jump, a wobbling fall
        if (p.onGround && Math.abs(p.vx || 0) > 0.8) { S.walk += dt * Math.abs(p.vx) * 1.8; anim(S, { sy: 1 - Math.abs(Math.sin(S.walk)) * 0.06, sx: 1 + Math.abs(Math.sin(S.walk)) * 0.04, tilt: 0.12 + Math.sin(S.walk) * 0.08, aF: 0.2 + Math.sin(S.walk) * 0.3, aB: 0.2 - Math.sin(S.walk) * 0.3 }); }
        else if (p.onGround) anim(S, { sy: 1 + Math.sin(performance.now() / 600) * 0.025, sx: 1 - Math.sin(performance.now() / 600) * 0.02 });
        else if ((p.vy || 0) < 0) anim(S, { sy: 1.12, sx: 0.9, aF: 0.1, aB: 0.1, aFy: -1, aBy: -1, roll: S.skips ? FK.face(p) * performance.now() / 60 : 0 });
        else anim(S, { sy: 1.0, sx: 1.0, aF: 0.4, aB: 0.4, aFy: -0.6, aBy: -0.6, tilt: Math.sin(performance.now() / 90) * 0.06 });
      }
      stepWorld(p, dt, S, k);
      if (p.onGround) S.airUp = false;
      if (S.squash > 0) S.squash = Math.max(0, S.squash - dt * 5);
      const r = 1 - Math.exp(-dt * S.rate);
      for (const key in BASE) S.anim[key] += (S.goal[key] - S.anim[key]) * (key === 'roll' ? 1 : r);
      S.pose = Object.assign({}, S.anim);   // all of it, so the other phone in online play draws him moving too
    },

    // ---------------- drawing: a round mossy stone with runes, stubby arms and little feet
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const A = S && S.anim ? S.anim : S && S.pose ? Object.assign({}, BASE, S.pose) : BASE, sq = S ? S.squash || 0 : 0;   // (S.pose alone: the other phone's copy)
      const cx = px + pw / 2, fy = py + ph, R = Math.min(pw, ph) * 0.5 * (A.grow || 1);
      const sx = A.sx * (1 + sq * 0.22), sy = A.sy * (1 - sq * 0.2);
      const walk = S ? S.walk || 0 : 0, grounded = p ? p.onGround : true;
      ctx.save();
      // feet (stay on the floor while the body squashes above them)
      for (const side of [-1, 1]) {
        const ph2 = grounded ? Math.sin(walk + (side > 0 ? 0 : Math.PI)) : 0;
        const fx = cx + side * R * 0.45 + ph2 * R * 0.25, fyy = fy - Math.max(0, ph2) * R * 0.15 - (grounded ? 0 : R * 0.1);
        ctx.fillStyle = side > 0 ? C_ST2 : C_DARK; ctx.beginPath(); ctx.ellipse(fx + R * 0.1, fyy - R * 0.1, R * 0.3, R * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      }
      const bodyY = fy - R * sy - R * 0.12;
      ctx.translate(cx, bodyY); ctx.rotate(A.tilt * 0.6);
      // back arm
      arm(ctx, R, -1, A.aB, A.aBy, true);
      ctx.save(); ctx.rotate(A.roll || 0); ctx.scale(sx, sy);
      const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R); g.addColorStop(0, C_ST3); g.addColorStop(0.5, C_ST); g.addColorStop(1, C_ST2);
      ctx.fillStyle = g; ctx.beginPath();   // a slightly lumpy round stone
      for (let i = 0; i <= 18; i++) { const an = i / 18 * Math.PI * 2, rr = R * (1 + 0.04 * Math.sin(an * 3 + 1) + 0.03 * Math.sin(an * 5)); ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.95); }
      ctx.fill(); ctx.shadowBlur = 0;
      if (S && S.stone) { ctx.fillStyle = 'rgba(70,70,80,0.45)'; ctx.fill(); }
      // cracks and speckles
      ctx.strokeStyle = C_DARK; ctx.lineWidth = R * 0.05; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-R * 0.6, R * 0.2); ctx.lineTo(-R * 0.35, R * 0.4); ctx.lineTo(-R * 0.4, R * 0.65); ctx.moveTo(R * 0.55, -R * 0.55); ctx.lineTo(R * 0.4, -R * 0.35); ctx.stroke();
      ctx.fillStyle = C_ST2; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 2.3) * R * 0.6, Math.sin(i * 1.7) * R * 0.55, R * 0.04, 0, Math.PI * 2); ctx.fill(); }
      // moss cap
      ctx.fillStyle = C_MOSS; ctx.beginPath(); ctx.ellipse(-R * 0.1, -R * 0.82, R * 0.62, R * 0.24, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_MOSS2; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-R * 0.55 + i * R * 0.25, -R * 0.68 + Math.sin(i * 2) * R * 0.05, R * 0.09, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = C_MOSS; ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.moveTo(R * 0.05, -R * 0.95); ctx.quadraticCurveTo(R * 0.15 + Math.sin(t * 3) * R * 0.08, -R * 1.25, R * 0.3, -R * 1.2); ctx.stroke();   // a sprout
      ctx.fillStyle = C_MOSS; ctx.beginPath(); ctx.ellipse(R * 0.32, -R * 1.2, R * 0.1, R * 0.05, 0.5, 0, Math.PI * 2); ctx.fill();
      // runes: a glowing V and a line, pulsing
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const rune = () => { ctx.beginPath(); ctx.moveTo(-R * 0.15, R * 0.42); ctx.lineTo(0, R * 0.62); ctx.lineTo(R * 0.15, R * 0.42); ctx.moveTo(0, R * 0.62); ctx.lineTo(0, R * 0.78); ctx.stroke(); };
      ctx.strokeStyle = `rgba(125,255,90,${0.15 + 0.2 * pulse})`; ctx.lineWidth = R * 0.2; rune();   // a wide faint stroke under it is the glow (no canvas blur)
      ctx.strokeStyle = `rgba(125,255,90,${0.4 + 0.5 * pulse})`; ctx.lineWidth = R * 0.07; rune();
      ctx.beginPath(); ctx.arc(-R * 0.62, -R * 0.1, R * 0.08, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.restore();   // (the face does not roll with the body unless he is tumbling fast)
      if (!(A.roll && Math.abs(Math.sin(A.roll)) > 0.5)) {
        // face: heavy brow, green glowing eyes looking forward, a small determined mouth
        const ex2 = R * 0.15, ey2 = -R * 0.12 * sy;
        ctx.fillStyle = C_DARK; ctx.beginPath(); ctx.ellipse(ex2, ey2 - R * 0.2, R * 0.55, R * 0.1, 0.05, 0, Math.PI * 2); ctx.fill();
        const blink = Math.sin(t * 0.9) > 0.95 ? 0.15 : 1;
        for (const dx of [-R * 0.2, R * 0.22]) {
          ctx.fillStyle = C_DARK; ctx.beginPath(); ctx.ellipse(ex2 + dx, ey2, R * 0.13, R * 0.12 * blink + 1, 0, 0, Math.PI * 2); ctx.fill();
          ctx.save(); ctx.fillStyle = 'rgba(125,255,90,0.3)'; ctx.beginPath(); ctx.ellipse(ex2 + dx + R * 0.03, ey2, R * 0.14, R * 0.14 * blink + 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = S && S.stone ? '#c9d0d8' : C_RUNE; ctx.beginPath(); ctx.ellipse(ex2 + dx + R * 0.03, ey2, R * 0.08, R * 0.08 * blink + 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        ctx.strokeStyle = C_DARK; ctx.lineWidth = R * 0.06; ctx.beginPath();
        if (S && S.seq) { ctx.moveTo(ex2 - R * 0.1, ey2 + R * 0.33); ctx.lineTo(ex2 + R * 0.2, ey2 + R * 0.3); } else { ctx.moveTo(ex2 - R * 0.12, ey2 + R * 0.3); ctx.quadraticCurveTo(ex2 + R * 0.05, ey2 + R * 0.38, ex2 + R * 0.22, ey2 + R * 0.28); }
        ctx.stroke();
      }
      // front arm
      arm(ctx, R, 1, A.aF, A.aFy, false);
      ctx.restore();
    },
    drawWorld(ctx, V, S) {
      const T = V.T;
      for (const pl of S.pillars) {
        if (pl.top == null) continue;
        const x = V.SX(pl.x - pl.w / 2), y = V.SY(pl.top), h = (pl.fy - pl.top) * T, w = pl.w * T;
        if (h < 1) continue;
        const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, C_ST2); g.addColorStop(0.5, C_ST3); g.addColorStop(1, C_ST2);
        FK.solid(ctx, '#fff', 1); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.08, y + 4); ctx.lineTo(x + w * 0.35, y); ctx.lineTo(x + w * 0.7, y + 3); ctx.lineTo(x + w * 0.95, y + 6); ctx.lineTo(x + w, y + h); ctx.fill();
        ctx.strokeStyle = C_DARK; ctx.lineWidth = 1.5; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + w * 0.1, y + h * i / 4); ctx.lineTo(x + w * 0.9, y + h * i / 4 + 3); ctx.stroke(); }
        FK.solid(ctx, C_MOSS, 1); ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + 2, w * 0.4, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (const b of S.shots) { ctx.save(); ctx.translate(V.SX(b.x), V.SY(b.y)); ctx.rotate(b.rot); FK.solid(ctx, C_ST, 1); ctx.beginPath(); ctx.ellipse(0, 0, T * 0.22, T * 0.11, 0, 0, Math.PI * 2); ctx.fill(); FK.solid(ctx, C_ST3, 1); ctx.beginPath(); ctx.ellipse(-T * 0.05, -T * 0.03, T * 0.1, T * 0.04, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    },
    drawFx(ctx, V, f, u, a) {
      if (f.k === 'splash') {   // a skip: a ripple ring and dust flicked up
        const x = V.SX(f.x), y = V.SY(f.y);
        ctx.beginPath(); ctx.ellipse(x, y, V.T * (0.3 + u * 1.2), V.T * (0.08 + u * 0.2), 0, 0, Math.PI * 2); FK.glow(ctx, C_RUNE, a * 0.7); ctx.lineWidth = 2; ctx.stroke();
        for (let i = 0; i < 5; i++) { const s2 = i - 2; ctx.beginPath(); ctx.arc(x + s2 * V.T * 0.25 * (0.5 + u), y - Math.sin(u * Math.PI) * V.T * (0.4 + Math.abs(s2) * 0.1), V.T * 0.05, 0, Math.PI * 2); FK.solid(ctx, C_ST3, a); ctx.fill(); }
        return true;
      }
      return false;
    },
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      if (I.air) {
        if (I.dy < -1.5 && !S.airUp) return { type: 'tap', v: 'up' };
        if (I.dy > 1 && I.adx < 1.5) return { type: 'tap', v: 'down' };
        if (I.adx < 1.6 && Math.abs(I.dy) < 1.4) return { type: 'tap', v: '' };
        if (I.adx < 4 && Math.abs(I.dy) < 1.2) return { type: 'tap', v: 'side' };
        return null;
      }
      if (I.adx < 1.8 && Math.abs(I.dy) < 1.2) return Math.random() < 0.25 ? { type: 'tap', v: 'down' } : { type: 'tap', v: '' };
      if (I.dy < -1.5 && I.adx < 2.5) return { type: 'tap', v: 'up' };
      if (I.adx < 8 && Math.abs(I.dy) < 1) return { type: 'tap', v: 'side' };
      return null;
    },
  });

  // a stubby stone arm: from the side of the body, reaching forward by `reach`, raised by `lift` (-1 up .. +1 down)
  function arm(ctx, R, side, reach, lift, back) {
    const sx = side * R * 0.2 + (back ? -R * 0.55 : R * 0.6), sy = R * 0.15;
    const hx = sx + (back ? -R * 0.2 : R * 0.15) + reach * R * 0.75 * (back ? 0.9 : 1), hy = sy + R * 0.25 + lift * R * 0.55;
    ctx.strokeStyle = back ? C_DARK : C_ST2; ctx.lineWidth = R * 0.24; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = back ? C_ST2 : C_ST; ctx.beginPath(); ctx.arc(hx, hy, R * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(hx - R * 0.06, hy - R * 0.07, R * 0.08, 0, Math.PI * 2); ctx.fill();
  }
})();
