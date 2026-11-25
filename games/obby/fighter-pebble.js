/* Obby Builder: GRAND PEBBLE, the legendary skipping stone. A melee / ranged hybrid who shapes the stage.
 *
 * A round, mossy stone with glowing runes, stubby stone arms and little feet. Heavy, sturdy and stubborn. He fights
 * up close with stone fists and from range with thrown stone, and what he throws or raises stays behind as PLATFORMS
 * and TRAPS that give him the upper hand.
 *
 * THE GIMMICKS
 *  - STONE SKIP: land while moving fast and he skips off the floor like a flat stone across water (up to 3 skips in a row,
 *    each a little lower). Skipping into a foe bowls it over. Hold ↓ to land without skipping.
 *  - HOME GROUND: standing on stone he made, his runes blaze: +35% damage, and Stone Skip off his own stone goes higher.
 *  - RUNE LINK: any stone he throws that touches one of his Rune Mines sets it off at once, twice as big.
 *  - His stone (blocks, stairs, stepping stones, bridges, obelisks, towers) lasts a while, then crumbles; 5 pieces at most,
 *    3 Rune Mines at most.
 *
 * 8 MOVES (S / ⚔️ + a direction)
 *  Ground: neutral STONE FISTS (jab, jab, a rock uppercut that chips a pebble forward), side CHUCK BOULDER (an arcing
 *          throw that lands as a block to stand on), up STONE STAIRS (three steps rise in front, launching foes),
 *          down RUNE MINE (a trap that erupts in spikes under the first foe to step on it).
 *  Air:    neutral GRAVEL SPRAY (stones in every direction), side LANDSLIDE (a shoulder dash: a foe hit against a wall or his
 *          stone is CRUSHED), up STEPPING STONE (a stone under his feet to jump off; it stays), down STALACTITE (a spike
 *          shot straight down that sticks in the floor as a spike trap).
 * CHARGED (hold S to full), ground / air:
 *  neutral MEGALITH FIST / METEOR SHOWER, side AVALANCHE / STONE BRIDGE, up OBELISK / TOWER, down RUNE CIRCLE / RUNE COMET.
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
  function hit(S, e, dmg, o) { FK.hit(S, e, dmg * (S.home ? 1.35 : 1), Object.assign({ c: C_RUNE }, o)); }
  function knock(big) { FK.tone(big ? 90 : 150, { dur: big ? 0.3 : 0.12, vol: 0.4, type: 'sine', slide: 50 }); FK.noise({ dur: big ? 0.18 : 0.07, cut: 900, cutEnd: 300, q: 1, vol: big ? 0.3 : 0.18 }); }
  function plink(i) { FK.tone(700 + i * 120, { dur: 0.07, vol: 0.1, type: 'triangle', slide: 400 }); }
  function anim(S, o) { S.goal = Object.assign({}, BASE, o); }

  // ---- his stone: platforms (blocks, steps, stepping stones, bridges, towers), traps (rune mines, spikes) and thrown rock
  const MAX_STONE = 5, MAX_MINES = 3;
  function addStone(S, o) { S.stones.push(Object.assign({ t: 0, life: 7, hits: new Set(), rise: 0.15 }, o)); while (S.stones.length > MAX_STONE) S.stones.shift(); }
  function addMine(S, x, fy) { S.mines.push({ x, fy, t: 0 }); while (S.mines.length > MAX_MINES) S.mines.shift(); FK.tone(520, { dur: 0.15, vol: 0.1, type: 'triangle', slide: 780 }); }
  function rock(S, o) { S.rocks.push(Object.assign({ t: 0, hits: new Set(), r: 0.2, grav: 26, dmg: 1.5, rot: 0 }, o)); }
  // HOME GROUND: is he standing on his own stone?
  function home(S, p) { if (!p.onGround) return false; const feet = p.y + p.h; return S.stones.some(st => st.top != null && Math.abs(feet - st.top) < 0.12 && Math.abs(pcx(p) - st.x) < st.w / 2 + 0.2); }
  function detonate(S, p, m, big) {
    const i = S.mines.indexOf(m); if (i >= 0) S.mines.splice(i, 1);
    const R = big ? 2.6 : 1.6;
    for (const e of FK.within(m.x, m.fy - 0.5, R)) hit(S, e, big ? 5 : 3, { kx: (Math.sign(ex(e) - m.x) || 1) * (big ? 7 : 4), ky: big ? -17 : -13, stun: big ? 0.8 : 0.6, big: true, stop: 0.06 });
    S.fx.push({ k: 'spikes', x: m.x, y: m.fy, R, t: 0, life: 0.5 }); knock(true); FK.shake(big ? 9 : 5);
    if (big) FK.label(S, p, 'RUNE LINK!', C_RUNE, true);
  }

  const SEQ = {
    fists(p, dt, S, q) {   // STONE FISTS: jab, jab, then a rock uppercut that chips a pebble off forward
      const f = q.f, step = Math.floor(q.t / 0.14), u = (q.t % 0.14) / 0.14, out = u > 0.3 && u < 0.8;
      if (step === 0) anim(S, { aF: out ? 1.1 : 0.1, sx: out ? 1.08 : 1, tilt: out ? 0.15 : -0.05 });
      else if (step === 1) anim(S, { aB: out ? 1.1 : 0.1, sx: out ? 1.08 : 1, tilt: out ? 0.15 : -0.05 });
      else anim(S, { aF: out ? 0.6 : 0, aFy: out ? -1.3 : 0.6, sy: out ? 1.15 : 0.85, sx: out ? 0.92 : 1.12, tilt: out ? -0.2 : 0.25 });
      S.rate = 45;
      if (step !== q.n) { q.n = step; q.hits.clear(); if (step === 2) { rock(S, { kind: 'chip', x: pcx(p) + f * 0.7, y: pcy(p) - 0.2, vx: f * 13, vy: -3, grav: 14, dmg: 1.5, r: 0.14 }); plink(2); } }
      if (out && step < 3) for (const e of box(p, f, 0, 1.6, step === 2 ? 1.8 : 1.2, step === 2 ? 0.4 : 0)) if (!q.hits.has(e)) {
        q.hits.add(e); const fin = step === 2;
        hit(S, e, fin ? 3 : 1.2, { kx: f * (fin ? 3 : 2.5), ky: fin ? -14 : -3, stun: fin ? 0.5 : 0.3, big: fin, stop: fin ? 0.06 : 0 }); knock(fin);
      }
      if (q.t > 0.44) S.seq = null;
    },
    chuck(p, dt, S, q) {   // CHUCK BOULDER: wind back and lob a boulder; it lands as a block he can stand on
      anim(S, { aF: q.t < 0.15 ? -0.6 : 1.2, aFy: q.t < 0.15 ? -1 : -0.3, tilt: q.t < 0.15 ? -0.3 : 0.3, sx: 1.05 }); S.rate = 35;
      if (q.t >= 0.15 && !q.done) { q.done = 1; rock(S, { kind: 'boulder', x: pcx(p) + q.f * 0.5, y: p.y - 0.4, vx: q.f * 8.5, vy: -9, r: 0.45, dmg: 3 }); FK.whoosh(false, true); }
      if (q.t > 0.4) S.seq = null;
    },
    stairs(p, dt, S, q) {   // STONE STAIRS: three steps burst up in front, each higher; foes on them are launched
      anim(S, { sy: 0.8, sx: 1.18, aF: 0.4, aFy: 0.8, aB: 0.4, aBy: 0.8 }); S.rate = 40; p.vx = 0;
      for (let i = 0; i < 3; i++) if (q.t >= 0.08 + i * 0.09 && q.n <= i) {
        q.n = i + 1; const x = pcx(p) + q.f * (1.3 + i * 1.05), fy = FK.floorAt(x, p.y + p.h - 0.5, 3);
        if (fy != null) { addStone(S, { kind: 'step', x, top: fy - 0.75 * (i + 1), bottom: fy, w: 1.05, life: 7, launch: true }); knock(i === 2); }
      }
      if (q.t > 0.4) S.seq = null;
    },
    mine(p, dt, S, q) {   // RUNE MINE: presses a glowing rune into the floor in front
      anim(S, { sy: 0.85, sx: 1.1, aF: 0.6, aFy: 1, tilt: 0.3 }); S.rate = 40;
      if (q.t >= 0.12 && !q.done) { q.done = 1; const x = pcx(p) + q.f * 1.2, fy = FK.floorAt(x, p.y + p.h - 0.5, 4); if (fy != null) addMine(S, x, fy); else FK.msg('🪨 No floor there for a rune'); }
      if (q.t > 0.3) S.seq = null;
    },
    gravel(p, dt, S, q) {   // GRAVEL SPRAY: he bursts out a ring of gravel in every direction
      anim(S, { sx: 1.25, sy: 1.25, aF: 1, aB: 1, aFy: -0.5, aBy: -0.5 }); S.rate = 50; p.vy = Math.min(p.vy, 1);
      if (!q.done) { q.done = 1; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; rock(S, { kind: 'gravel', x: pcx(p), y: pcy(p), vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, grav: 8, r: 0.1, dmg: 1, life: 0.55 }); } knock(false); FK.noise({ dur: 0.2, cut: 2200, q: 1, vol: 0.2 }); }
      if (q.t > 0.3) S.seq = null;
    },
    landslide(p, dt, S, q) {   // LANDSLIDE: a shoulder dash; a foe it hits against a wall or his own stone is CRUSHED
      const f = q.f; anim(S, { sx: 1.2, sy: 0.85, tilt: 0.5, aF: -0.2, aB: -0.2 }); S.rate = 50; S.selfMove = true;
      if (!q.snd) { q.snd = 1; FK.whoosh(false, true); }
      if (!FK.moveX(p, f * 16 * dt)) q.t = 9; p.vx = f * 5; p.vy = Math.min(p.vy, 1);
      for (const e of box(p, f, -0.3, 1.3, 1.3)) if (!q.hits.has(e)) {
        q.hits.add(e); const bx = ex(e) + f * ((e.w || 0.9) / 2 + 0.3);
        const wall = FK.blocked(bx - 0.15, ey(e) - 0.3, 0.3, 0.6) || S.stones.some(st => st.top != null && Math.abs(bx - st.x) < st.w / 2 && ey(e) > st.top && ey(e) < (st.bottom || st.top + 0.6));
        hit(S, e, wall ? 5 : 2.5, { kx: f * (wall ? 2 : 10), ky: wall ? -14 : -6, stun: wall ? 0.9 : 0.4, big: true, stop: wall ? 0.12 : 0.04 });
        if (wall) { FK.label(S, p, 'CRUSHED!', C_RUNE, true); FK.shake(9); } knock(wall);
      }
      if (q.t > 0.35) S.seq = null;
    },
    stepstone(p, dt, S, q) {   // STEPPING STONE: a stone appears under his feet; he jumps off it, and it stays
      anim(S, { sy: q.t < 0.08 ? 0.75 : 1.25, sx: q.t < 0.08 ? 1.2 : 0.85, aFy: -1, aBy: -1 }); S.rate = 45;
      if (!q.done) { q.done = 1; addStone(S, { kind: 'stepping', x: pcx(p), top: p.y + p.h, w: 1.3, life: 5, rise: 0 }); p.vy = 0; plink(0); }
      if (q.t >= 0.08 && !q.go) { q.go = 1; p.vy = -16; p.onGround = false; FK.whoosh(true, false); }
      if (q.t > 0.3) S.seq = null;
    },
    stalactite(p, dt, S, q) {   // STALACTITE: a spike of stone shot straight down; it sticks in the floor as a spike trap
      anim(S, { sy: 1.2, sx: 0.9, aF: 0.2, aFy: 1.2, aB: 0.2, aBy: 1.2 }); S.rate = 45;
      if (!q.done) { q.done = 1; rock(S, { kind: 'spike', x: pcx(p), y: p.y + p.h + 0.2, vx: 0, vy: 24, grav: 10, r: 0.25, dmg: 3 }); p.vy = Math.min(p.vy, -5); FK.whoosh(false, true); }
      if (q.t > 0.25) S.seq = null;
    },
    // ---- charged
    megalith(p, dt, S, q) {   // MEGALITH FIST: a huge stone fist forms over his arm, then one enormous punch
      const f = q.f; S.fist = Math.min(1, q.t / 0.3); p.vx = 0;
      anim(S, q.t < 0.3 ? { aF: -0.5, tilt: -0.3, sx: 0.95 } : { aF: 1.4, tilt: 0.4, sx: 1.2 }); S.rate = q.t < 0.3 ? 20 : 70;
      if (q.t >= 0.3 && !q.done) { q.done = 1; for (const e of box(p, f, 0, 2.8, 1.8)) hit(S, e, 8, { kx: f * 18, ky: -9, stun: 0.7, big: true, stop: 0.14, shake: 14 }); knock(true); FK.shake(10); S.fx.push({ k: 'shock', x: pcx(p) + f * 1.6, y: pcy(p), R: 1.6, c: C_RUNE, t: 0, life: 0.4 }); }
      if (q.t > 0.6) { S.fist = 0; S.seq = null; }
    },
    avalanche(p, dt, S, q) {   // AVALANCHE: three boulders bowled one after another along the floor
      anim(S, { aF: Math.sin(q.t * 20) > 0 ? 1.2 : -0.3, aFy: 0.6, tilt: 0.3 }); S.rate = 40; p.vx = 0;
      while (q.t >= 0.08 + q.n * 0.14 && q.n < 3) { q.n++; rock(S, { kind: 'roll', x: pcx(p) + q.f * 0.6, y: p.y + p.h - 0.4, vx: q.f * (9 + q.n), vy: 0, grav: 30, r: 0.4, dmg: 2.5, life: 2.2 }); knock(false); }
      if (q.t > 0.55) S.seq = null;
    },
    obelisk(p, dt, S, q) {   // OBELISK: he slams both fists down and a tall rune-carved obelisk bursts up in front, launching foes; it stays
      anim(S, { sy: q.t < 0.15 ? 0.75 : 1.1, sx: q.t < 0.15 ? 1.25 : 0.92, aF: 0.8, aFy: q.t < 0.15 ? -1.2 : 1, aB: 0.8, aBy: q.t < 0.15 ? -1.2 : 1 }); S.rate = 40; p.vx = 0;
      if (q.t >= 0.15 && !q.done) {
        q.done = 1; const x = pcx(p) + q.f * 1.7, fy = FK.floorAt(x, p.y + p.h - 0.5, 4);
        if (fy != null) { addStone(S, { kind: 'obelisk', x, top: fy - 3.4, bottom: fy, w: 1.15, life: 9, launch: true, rise: 0.12, big: true }); knock(true); FK.shake(7); }
      }
      if (q.t > 0.45) S.seq = null;
    },
    circle(p, dt, S, q) {   // RUNE CIRCLE: three runes pressed into the floor in a line at once
      anim(S, { sy: 0.8, sx: 1.2, aF: 1, aB: 1, aFy: 1, aBy: 1 }); S.rate = 40;
      if (q.t >= 0.15 && !q.done) { q.done = 1; for (let i = 0; i < 3; i++) { const x = pcx(p) + q.f * (1 + i * 1.3), fy = FK.floorAt(x, p.y + p.h - 0.5, 4); if (fy != null) addMine(S, x, fy); } FK.shake(4); }
      if (q.t > 0.4) S.seq = null;
    },
    meteors(p, dt, S, q) {   // METEOR SHOWER: rocks rain down all around him
      anim(S, { aF: 0.2, aB: 0.2, aFy: -1.3, aBy: -1.3, sy: 1.1 }); S.rate = 40; p.vy = Math.min(p.vy, 0.8);
      while (q.t >= 0.05 + q.n * 0.07 && q.n < 9) { q.n++; rock(S, { kind: 'meteor', x: pcx(p) + (Math.random() - 0.5) * 8, y: p.y - 7, vx: (Math.random() - 0.5) * 2, vy: 10, grav: 20, r: 0.32, dmg: 2.5 }); }
      if (q.t > 0.75) S.seq = null;
    },
    bridge(p, dt, S, q) {   // STONE BRIDGE: a long slab shoots out ahead at his feet and he lands on it
      anim(S, { sx: 1.15, sy: 0.9, aF: 1, aFy: 0.4, tilt: 0.2 }); S.rate = 40;
      if (!q.done) { q.done = 1; addStone(S, { kind: 'bridge', x: pcx(p) + q.f * 2.4, top: p.y + p.h + 0.05, w: 5.5, life: 8, rise: 0, grow: q.f }); p.vy = Math.min(p.vy, 0); knock(true); }
      if (q.t > 0.3) S.seq = null;
    },
    comet(p, dt, S, q) {   // RUNE COMET: wrapped in rune light he plunges like a comet; the impact presses a rune mine in on each side
      anim(S, { roll: q.t * 25, sx: 0.95, sy: 1.05 }); S.rate = 40; S.comet = 1;
      if (q.t < 0.15) { p.vy = -1; p.vx = 0; return; }
      p.vy = 28; p.vx = 0;
      for (const e of box(p, 1, -0.8, 1.6, 1.6, -0.6)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 5, { kx: 0, ky: 18, stun: 0.6, big: true, stop: 0.1 }); }
      if (p.onGround || q.t > 1.5) {
        S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: 2.6, c: C_RUNE, t: 0, life: 0.5 }); knock(true); FK.shake(9);
        for (const e of FK.within(pcx(p), p.y + p.h - 0.4, 2.6)) if (!q.hits.has(e)) hit(S, e, 3, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 8, ky: -11, stun: 0.5, big: true });
        if (p.onGround) for (const d of [-1, 1]) { const x = pcx(p) + d * 1.6, fy = FK.floorAt(x, p.y + p.h - 0.5, 3); if (fy != null) addMine(S, x, fy); }
        S.squash = 1; S.comet = 0; S.seq = null;
      }
    },
    tower(p, dt, S, q) {   // TOWER: a column of stone grows up under him, carrying him high; it stays as a lookout
      anim(S, { sy: 0.9, sx: 1.1, aFy: 0.5, aBy: 0.5 }); S.rate = 30;
      if (!q.st) { const fy = FK.floorAt(pcx(p), p.y + p.h, 12); q.st = { kind: 'tower', x: pcx(p), top: p.y + p.h, bottom: fy == null ? p.y + p.h + 0.6 : fy, w: 1.2, life: 8, rise: 0 }; addStone(S, q.st); q.y0 = p.y + p.h; }
      const top = q.y0 - Math.min(1, q.t / 0.45) * 3;
      if (!FK.blocked(p.x, top - p.h, p.w, p.h - 0.05)) { q.st.top = top; p.y = top - p.h; p.vy = 0; p.onGround = true; S.selfMove = true; if (window._setJumpCount) window._setJumpCount(0); }
      for (const e of FK.within(pcx(p), p.y - 0.4, 1.3)) if (!q.hits.has(e)) { q.hits.add(e); hit(S, e, 3, { kx: 0, ky: -16, stun: 0.5, big: true }); }
      if (q.t > 0.5) { S.airUp = false; S.seq = null; }
    },
  };

  function stepWorld(p, dt, S, k) {
    const foes = FK.foes();
    // STONE SKIP: landing fast while moving skips him back up, lower each time
    if (p.onGround && !S.wasGround) {
      const sp = Math.abs(S.lastVx || 0);
      if (sp > 6 && !k.down && S.skips < 3 && !S.seq && (S.lastVy || 0) > 2) {
        S.skips++; p.vy = -(9 - S.skips * 2) * (S.homeWas ? 1.3 : 1); p.vx = S.lastVx * 1.05; p.onGround = false;
        plink(S.skips); S.fx.push({ k: 'splash', x: pcx(p), y: p.y + p.h, t: 0, life: 0.45 }); S.squash = 0.8;
        for (const e of FK.within(pcx(p) + Math.sign(p.vx) * 0.6, pcy(p), 1.2)) hit(S, e, 2, { kx: Math.sign(p.vx) * 9, ky: -7, stun: 0.4, big: true });
        if (S.skips === 1) FK.label(S, p, 'SKIP!', C_RUNE, false); else if (S.skips === 3) FK.label(S, p, 'TRIPLE SKIP!', C_RUNE, true);
      } else { if ((S.lastVy || 0) > 7) { S.squash = 1; knock(false); } S.skips = 0; }
    }
    if (p.onGround && Math.abs(p.vx || 0) < 3) S.skips = 0;
    S.wasGround = p.onGround; S.lastVx = p.vx; S.lastVy = p.vy;
    S.home = home(S, p); if (S.home) S.homeWas = 0.4; else if (S.homeWas > 0) S.homeWas -= dt;
    // thrown stone: boulders land as blocks, spikes stick in as traps, rollers bowl along the floor; any of it sets off a Rune Mine
    for (let i = S.rocks.length - 1; i >= 0; i--) {
      const r = S.rocks[i]; r.t += dt; r.vy += r.grav * dt; r.rot += dt * (r.kind === 'roll' ? r.vx * 2 : 12);
      const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
      let gone = r.t > (r.life || 3);
      if (FK.blocked(nx - r.r * 0.5, r.y - r.r * 0.5, r.r, r.r)) { if (r.kind === 'roll') r.vx = 0; else gone = true; } else r.x = nx;
      let landed = false;
      if (FK.blocked(r.x - r.r * 0.5, ny - r.r * 0.5, r.r, r.r)) { if (r.kind === 'roll' && r.vy > 0) { r.vy = 0; } else if (r.vy > 0) landed = true; else gone = true; } else r.y = ny;
      if (r.kind === 'roll' && !r.vx) gone = true;
      for (const e of foes) if (!r.hits.has(e) && Math.abs(ex(e) - r.x) < r.r + (e.w || 0.9) / 2 && Math.abs(ey(e) - r.y) < r.r + (e.h || 0.9) / 2) {
        r.hits.add(e);
        if (r.kind === 'spike' || r.kind === 'meteor') hit(S, e, r.dmg, { kx: 0, ky: 15, stun: 0.5, big: true });
        else if (r.kind === 'roll') hit(S, e, r.dmg, { kx: Math.sign(r.vx) * 9, ky: -10, stun: 0.45, big: true });
        else hit(S, e, r.dmg, { kx: Math.sign(r.vx || 1) * (r.kind === 'boulder' ? 9 : 5), ky: -6, stun: 0.35, big: r.kind === 'boulder' });
        knock(false); if (r.kind === 'gravel' || r.kind === 'chip') { gone = true; break; }
      }
      for (const m of S.mines.slice()) if (m.t > 0.3 && Math.abs(r.x - m.x) < 0.7 && Math.abs(r.y - (m.fy - 0.3)) < 0.8) { detonate(S, p, m, true); if (r.kind !== 'roll') gone = true; }
      if (landed) {
        const fy = Math.ceil(r.y + r.r * 0.5 - 0.01);
        if (r.kind === 'boulder') { addStone(S, { kind: 'block', x: r.x, top: fy - 0.9, bottom: fy, w: 1.0, life: 8, rise: 0 }); knock(true); FK.shake(3); }
        else if (r.kind === 'spike') { S.spikes.push({ x: r.x, fy, t: 0, life: 6, cool: new Map() }); if (S.spikes.length > 3) S.spikes.shift(); knock(false); }
        else if (r.kind === 'meteor') { S.fx.push({ k: 'shock', x: r.x, y: fy, R: 1.1, c: C_RUNE, t: 0, life: 0.3 }); for (const e of FK.within(r.x, fy - 0.4, 1.1)) if (!r.hits.has(e)) hit(S, e, 1.5, { kx: (Math.sign(ex(e) - r.x) || 1) * 5, ky: -9, stun: 0.35 }); knock(false); }
        gone = true;
      }
      if (gone) { if (r.kind !== 'boulder' || !landed) S.fx.push({ k: 'splash', x: r.x, y: r.y, t: 0, life: 0.3 }); S.rocks.splice(i, 1); }
    }
    // his stone: rises (launching foes on stairs and obelisks), can be stood on, crumbles at the end
    for (let i = S.stones.length - 1; i >= 0; i--) {
      const st = S.stones[i]; st.t += dt;
      const fall = st.t > st.life - 0.4 ? Math.max(0, (st.life - st.t) / 0.4) : 1;
      st.k = (st.rise > 0 ? Math.min(1, st.t / st.rise) : 1) * fall;
      const bottom = st.bottom != null ? st.bottom : st.top + 0.5, top = bottom - (bottom - st.top) * st.k;
      st.cur = top;
      if (st.launch && st.t < 0.25) for (const e of foes) if (!st.hits.has(e) && Math.abs(ex(e) - st.x) < st.w / 2 + 0.3 && ey(e) > top - 0.8 && ey(e) < bottom) { st.hits.add(e); hit(S, e, st.big ? 4 : 2.5, { kx: 0, ky: st.big ? -20 : -15, stun: 0.5, big: true }); }
      if (st.k > 0.3 && FK.stand(p, top, st.x - st.w / 2, st.x + st.w / 2)) S.selfMove = true;
      if (st.t > st.life) S.stones.splice(i, 1);
    }
    // rune mines: armed after a moment; the first foe on one sets it off
    for (let i = S.mines.length - 1; i >= 0; i--) {
      const m = S.mines[i]; m.t += dt;
      if (m.t > 0.4) for (const e of foes) if (Math.abs(ex(e) - m.x) < 0.75 && Math.abs(e.y + (e.h || 0.9) - m.fy) < 0.5) { detonate(S, p, m, false); break; }
      if (m.t > 20 && S.mines[i] === m) S.mines.splice(i, 1);
    }
    // spike traps: hurt whoever stands in them
    for (let i = S.spikes.length - 1; i >= 0; i--) {
      const sp = S.spikes[i]; sp.t += dt;
      for (const [e, c] of sp.cool) { if (c - dt <= 0) sp.cool.delete(e); else sp.cool.set(e, c - dt); }
      for (const e of foes) if (!sp.cool.has(e) && Math.abs(ex(e) - sp.x) < 0.6 && Math.abs(e.y + (e.h || 0.9) - sp.fy) < 0.6) { sp.cool.set(e, 0.7); hit(S, e, 1.5, { kx: (Math.sign(ex(e) - sp.x) || 1) * 4, ky: -9, stun: 0.4 }); }
      if (sp.t > sp.life) S.spikes.splice(i, 1);
    }
  }

  const MOVES = {
    ground: { neutral: { name: 'Stone Fists', cd: 0.3 }, side: { name: 'Chuck Boulder', cd: 0.55 }, up: { name: 'Stone Stairs', cd: 0.8 }, down: { name: 'Rune Mine', cd: 0.6 } },
    air:    { neutral: { name: 'Gravel Spray', cd: 0.45 }, side: { name: 'Landslide', cd: 0.45 }, up: { name: 'Stepping Stone', cd: 0.3 }, down: { name: 'Stalactite', cd: 0.5 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  FK.define({
    id: ID, plug: 'pebble', locked: true,
    def: { name: 'Grand Pebble', icon: '🪨', tier: 'godly', color: C_RUNE, color2: '#d8cca4',
      ability: 'Legendary skipping stone: fists and thrown stone, platforms he raises and rune traps he plants; stronger on his own stone',
      desc: 'A round, mossy, legendary stone with glowing runes and stubby arms: half brawler, half thrower, and he builds the stage his way. STONE SKIP: land while running fast and he skips off the floor (up to 3 times; hold ↓ to stop). HOME GROUND: on stone he made he hits 35% harder and skips higher. RUNE LINK: anything he throws into one of his Rune Mines sets it off twice as big. Moves: Stone Fists (jab, jab, uppercut that chips a pebble), Chuck Boulder (lands as a block to stand on), Stone Stairs (three steps that launch foes), Rune Mine (a spike trap); in the air Gravel Spray, Landslide (crushes foes against walls and stone), Stepping Stone (a stone to jump off that stays) and Stalactite (a spike shot down that stays as a trap). Charged: Megalith Fist, Avalanche, Obelisk, Rune Circle; in the air Meteor Shower, Stone Bridge, Tower, Rune Comet.' },
    stats: { speed: 1.08, jump: 1.15, maxJumps: 2, maxDashes: 1, hp: 6 },
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, anim: Object.assign({}, BASE), goal: Object.assign({}, BASE), rate: 18, walk: 0, rocks: [], stones: [], mines: [], spikes: [], skips: 0, squash: 0, fist: 0, comet: 0, home: false, homeWas: 0, airUp: false }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Stepping Stone comes back when you land'; return null; },
    charged: {
      neutral: (p, f, S, air) => { startSeq(S, air ? 'meteors' : 'megalith', { f }); return air ? 'METEOR SHOWER' : 'MEGALITH FIST'; },
      side: (p, f, S, air) => { startSeq(S, air ? 'bridge' : 'avalanche', { f }); return air ? 'STONE BRIDGE' : 'AVALANCHE'; },
      up: (p, f, S, air) => { if (air) S.airUp = true; startSeq(S, air ? 'tower' : 'obelisk', { f }); return air ? 'TOWER' : 'OBELISK'; },
      down: (p, f, S, air) => { startSeq(S, air ? 'comet' : 'circle', { f }); return air ? 'RUNE COMET' : 'RUNE CIRCLE'; },
    },
    act: {
      ground_neutral: (p, f, pw, S) => startSeq(S, 'fists', { f, pw }),
      ground_side: (p, f, pw, S) => startSeq(S, 'chuck', { f, pw }),
      ground_up: (p, f, pw, S) => startSeq(S, 'stairs', { f, pw }),
      ground_down: (p, f, pw, S) => startSeq(S, 'mine', { f, pw }),
      air_neutral: (p, f, pw, S) => startSeq(S, 'gravel', { f, pw }),
      air_side: (p, f, pw, S) => startSeq(S, 'landslide', { f, pw }),
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'stepstone', { f, pw }); },
      air_down: (p, f, pw, S) => startSeq(S, 'stalactite', { f, pw }),
    },
    onTeleport(p, S) { S.seq = null; S.rocks.length = 0; S.stones.length = 0; S.mines.length = 0; S.spikes.length = 0; S.fist = 0; S.comet = 0; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq) { S.seq = null; S.fist = 0; S.comet = 0; }
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      if (!S.seq) {
        S.fist = 0; S.comet = 0;
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
      const T = V.T, p = V.p;
      for (const st of S.stones) {   // his stone: rough slabs with a mossy top and a rune
        if (st.cur == null) continue;
        const bottom = st.bottom != null ? st.bottom : st.top + 0.5, x = V.SX(st.x - st.w / 2), y = V.SY(st.cur), h = (bottom - st.cur) * T, w = st.w * T;
        if (h < 1) continue;
        const a = st.life - st.t < 1 ? 0.55 + 0.45 * Math.sin(V.now * 25) : 1;
        const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, C_ST2); g.addColorStop(0.5, C_ST3); g.addColorStop(1, C_ST2);
        FK.solid(ctx, '#fff', a); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.04, y + 3); ctx.lineTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.7, y + 2); ctx.lineTo(x + w * 0.97, y + 4); ctx.lineTo(x + w, y + h); ctx.fill();
        ctx.strokeStyle = C_DARK; ctx.lineWidth = 1.5; for (let i = 1; i < Math.min(6, h / 14); i++) { ctx.beginPath(); ctx.moveTo(x + w * 0.1, y + h * i / Math.min(6, h / 14)); ctx.lineTo(x + w * 0.9, y + h * i / Math.min(6, h / 14) + 2); ctx.stroke(); }
        FK.solid(ctx, C_MOSS, a); ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + 2, w * 0.42, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        if (h > 14) { FK.glow(ctx, C_RUNE, 0.5 + 0.3 * Math.sin(V.now * 3 + st.x)); ctx.font = `${Math.min(16, h * 0.4) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(st.kind === 'obelisk' ? 'ᛟ' : 'ᚱ', x + w / 2, y + Math.min(h / 2, 18)); }
      }
      for (const m of S.mines) {   // rune mines: a glowing circle in the floor, pulsing faster once armed
        const x = V.SX(m.x), y = V.SY(m.fy), on = m.t > 0.4, pu = 0.5 + 0.5 * Math.sin(V.now * (on ? 8 : 3));
        ctx.beginPath(); ctx.ellipse(x, y - 2, T * 0.5, T * 0.14, 0, 0, Math.PI * 2); FK.glow(ctx, C_RUNE, (on ? 0.5 : 0.25) + 0.3 * pu); ctx.lineWidth = 2; ctx.stroke();
        FK.glow(ctx, C_RUNE, 0.8); ctx.font = (T * 0.35 | 0) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ᛉ', x, y - T * 0.12);
      }
      for (const sp of S.spikes) {   // spike traps: three stone spikes sticking out of the floor
        const x = V.SX(sp.x), y = V.SY(sp.fy), a = sp.life - sp.t < 1 ? (sp.life - sp.t) : 1;
        FK.solid(ctx, C_ST2, a); ctx.beginPath(); for (const d of [-0.32, 0, 0.32]) { ctx.moveTo(x + d * T - T * 0.13, y); ctx.lineTo(x + d * T, y - T * (d ? 0.5 : 0.75)); ctx.lineTo(x + d * T + T * 0.13, y); } ctx.fill();
        FK.solid(ctx, C_ST3, a); ctx.beginPath(); ctx.moveTo(x - T * 0.04, y - T * 0.2); ctx.lineTo(x, y - T * 0.7); ctx.lineTo(x + T * 0.02, y - T * 0.2); ctx.fill();
      }
      for (const r of S.rocks) {   // thrown stone
        const x = V.SX(r.x), y = V.SY(r.y), R = r.r * T;
        ctx.save(); ctx.translate(x, y); ctx.rotate(r.rot);
        if (r.kind === 'spike') { FK.solid(ctx, C_ST2, 1); ctx.beginPath(); ctx.moveTo(-R * 0.5, -R * 1.4); ctx.lineTo(R * 0.5, -R * 1.4); ctx.lineTo(0, R * 1.6); ctx.fill(); }
        else {
          FK.solid(ctx, r.kind === 'meteor' ? '#8a6a4a' : C_ST, 1); ctx.beginPath(); for (let i = 0; i < 7; i++) { const an = i / 7 * Math.PI * 2, rr = R * (0.85 + 0.15 * Math.sin(i * 3)); ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill();
          FK.solid(ctx, C_ST3, 1); ctx.beginPath(); ctx.arc(-R * 0.3, -R * 0.3, R * 0.25, 0, Math.PI * 2); ctx.fill();
          if (r.kind === 'meteor') { ctx.rotate(-r.rot); FK.glow(ctx, '#ff8a3d', 0.5); ctx.beginPath(); ctx.moveTo(-R * 0.6, 0); ctx.lineTo(0, -R * 3); ctx.lineTo(R * 0.6, 0); ctx.fill(); }
        }
        ctx.restore();
      }
      if (!p) return;
      if (S.home) { ctx.beginPath(); ctx.ellipse(V.SX(pcx(p)), V.SY(p.y + p.h), T * 0.7, T * 0.16, 0, 0, Math.PI * 2); FK.glow(ctx, C_RUNE, 0.4 + 0.25 * Math.sin(V.now * 6)); ctx.lineWidth = 2; ctx.stroke(); }   // HOME GROUND
      if (S.fist > 0) {   // MEGALITH FIST: a huge stone fist out in front of him
        const f = FK.face(p), x = V.SX(pcx(p) + f * (0.9 + 0.5 * S.fist)), y = V.SY(pcy(p)), R = T * (0.35 + 0.45 * S.fist);
        FK.solid(ctx, C_ST, 1); ctx.beginPath(); ctx.roundRect(x - R, y - R * 0.8, R * 2, R * 1.6, R * 0.4); ctx.fill();
        FK.solid(ctx, C_ST2, 1); for (let i = 0; i < 3; i++) { ctx.fillRect(x + f * R * 0.55 - 2, y - R * 0.6 + i * R * 0.45, 4, R * 0.3); }
        FK.glow(ctx, C_RUNE, 0.7); ctx.font = (R * 0.7 | 0) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ᚦ', x - f * R * 0.2, y);
      }
      if (S.comet) { const x = V.SX(pcx(p)), y = V.SY(pcy(p)); ctx.beginPath(); ctx.arc(x, y, T * 0.85, 0, Math.PI * 2); FK.glow(ctx, C_RUNE, 0.35); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - T * 0.6, y); ctx.lineTo(x, y - T * 2.4); ctx.lineTo(x + T * 0.6, y); FK.glow(ctx, C_RUNE, 0.3); ctx.fill(); }
    },
    drawFx(ctx, V, f, u, a) {
      if (f.k === 'spikes') {   // a rune mine going off: stone spikes shooting up
        const x = V.SX(f.x), y = V.SY(f.y), n = 7, H = V.T * (1.2 + f.R * 0.4) * Math.sin(Math.min(1, u * 2.5) * Math.PI / 2);
        FK.solid(ctx, C_ST2, a); ctx.beginPath(); for (let i = 0; i < n; i++) { const d = (i - (n - 1) / 2) / ((n - 1) / 2) * f.R * V.T * 0.6, hh = H * (1 - Math.abs(d) / (f.R * V.T)); ctx.moveTo(d - V.T * 0.14, y); ctx.lineTo(d, y - hh); ctx.lineTo(d + V.T * 0.14, y); } ctx.save(); ctx.translate(x, 0); ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.ellipse(x, y, V.T * f.R * (0.4 + u), V.T * 0.25, 0, 0, Math.PI * 2); FK.glow(ctx, C_RUNE, a * 0.7); ctx.lineWidth = 2; ctx.stroke();
        return true;
      }
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
        if (I.adx < 2.2 && Math.abs(I.dy) < 1.6) return { type: 'tap', v: '' };
        if (I.adx < 4 && Math.abs(I.dy) < 1.2) return { type: 'tap', v: 'side' };
        return null;
      }
      if (I.adx < 1.6 && Math.abs(I.dy) < 1.2) return I.killy ? { type: 'charge', v: '', hold: 0.9 } : { type: 'tap', v: '' };
      if (I.adx < 3 && Math.abs(I.dy) < 1.2 && (S.mines || []).length < 2 && Math.random() < 0.3) return { type: 'tap', v: 'down' };
      if (I.dy < -1.5 && I.adx < 3) return { type: 'tap', v: 'up' };
      if (I.adx < 8 && Math.abs(I.dy) < 1.5) return { type: 'tap', v: 'side' };
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
