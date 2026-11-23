/* Obby Builder: PHANTOM ACE's own moveset. A fast, many-hit LIFE LEECHER.
 *
 * Every move is a burst of 3 to 8 quick cuts. The small cuts hold the foe in the blades, the last one
 * launches. Every point of damage he deals heals him a little: in the main game a share of it fills a
 * leech meter that gives a heart back, in Smash it takes a share of the percent he dealt off his own.
 *
 * 8 MOVES (S / ⚔️ + a direction). Hold S to charge any of them: more cuts and a harder last hit.
 *  Ground: neutral PHANTOM FLURRY (5 cuts), side PHANTOM BLITZ (dash through, 4 cuts land behind him),
 *          up ASCENDING STAR (6 cuts, carries them up with him), down STAR CIRCLE (8 blades all round him).
 *  Air:    neutral CRESCENT WHEEL (6 cuts, he hangs), side PHANTOM PIERCE (air dash, 3 cuts, comes back on a hit),
 *          up RISING ACE (4 cuts, lifts him, once per jump), down CARD DROP (drills down, 3+ hits, spikes or slams).
 *
 * Upgrades: Ace Edge = longer reach (and his dash regen), True Ace = the leech heals faster.
 * Works for a second fighter (Smash CPU) through window._fighterPlugins, like Gale.
 */
(function () {
  'use strict';
  const ID = 'phantomace', FK = window.FKit;
  if (!FK) return;
  const C_GOLD = '#ffe566', C_CYAN = '#7cdbff', C_WHITE = '#ffffff', C_VIOLET = '#b59cff', C_LEECH = '#7dffb0', C_RED = '#ff5d7a';
  const TICK = 0.55;   // damage of one small cut (the last cut of a move does 2+)

  const fresh = () => ({ active: false, atkCD: 0, mv: null, busy: false, airUp: false, airSide: false, bank: 0, healT: 0, airT: 0, fx: [], lastPX: null, lastPY: null });
  let S = fresh();

  const ex = FK.ex, ey = FK.ey, pcx = FK.pcx, pcy = FK.pcy, inSmash = FK.inSmash;
  const has = id => !!(window.hasUpgrade && window.hasUpgrade(id));
  const reach = () => has('pa1') ? 0.6 : 0;
  const side = (e, p, f) => ex(e) === pcx(p) ? f : ex(e) > pcx(p) ? 1 : -1;
  function snick(i) { FK.noise({ dur: 0.035, cut: 5200, q: 2, vol: 0.11 }); FK.tone(1300 + (i % 4) * 160, { dur: 0.04, vol: 0.05 }); }
  function chime() { for (let i = 0; i < 3; i++) FK.tone(660 * Math.pow(1.26, i), { dur: 0.18, vol: 0.1, delay: i * 0.05, type: 'sine' }); }

  // ---- hitting, leeching, holding ----
  function hit(p, e, dmg, o) {
    o = o || {};
    if (inSmash()) e.hp = Math.max(0, (e.hp || 1) - dmg);          // Smash turns this into percent (and does the leech itself)
    else {                                                          // the main game's foes lose whole points: part-points add up
      e._aceFrac = (e._aceFrac || 0) + dmg; const whole = Math.floor(e._aceFrac + 1e-6);
      if (whole > 0) { e._aceFrac -= whole; e.hp = Math.max(0, (e.hp || 1) - whole); }
    }
    e.hitFlash = 0.5;
    if (o.stun) e.stunTimer = Math.max(e.stunTimer || 0, o.stun);
    if (!e._noKnockback) { if (o.kx != null) e.vx = o.kx; if (o.ky != null) e.vy = o.ky; }
    S.fx.push({ k: 'spark', x: ex(e), y: ey(e), ang: Math.atan2(o.ky || -1, o.kx || 0.001), t: 0, life: o.big ? 0.4 : 0.2, c: o.big ? C_GOLD : C_CYAN, big: !!o.big });
    S.fx.push({ k: 'leech', x: ex(e) + (Math.random() - 0.5) * 0.5, y: ey(e) + (Math.random() - 0.5) * 0.5, t: 0, life: 0.34, big: !!o.big });
    if (!inSmash() && !window._fighterPass) {
      S.bank += dmg * (has('pa3') ? 0.2 : 0.12);
      if (S.bank >= 1) {
        if ((p.hp || 0) < (p.maxHp || 0)) { p.hp = Math.min(p.maxHp, p.hp + 1); S.bank -= 1; S.healT = 0.6; FK.label(S, p, '+1 ♥ LEECH', C_LEECH, true); chime(); }
        else S.bank = 1;
      }
    } else S.healT = Math.max(S.healT, 0.25);
    if (e.hp <= 0 && !e.dead && window._killEnemy) window._killEnemy(e);
  }
  function canDrag(e) {
    if (e._noKnockback || e._held) return false;
    const sm = window.__smash;
    return !(sm && sm.active && sm.__canHold && !sm.__canHold(e));
  }
  function drag(e, tx, ty, sp, dt) {
    if (!canDrag(e)) return;
    const w = e.w || 0.9, h = e.h || 0.9;
    const dx = tx - ex(e), sx = Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
    if (sx && !FK.blocked(e.x + sx, e.y + 0.02, w, h - 0.08)) e.x += sx;
    if (ty != null && inSmash()) {   // Smash fighters are carried; the main game's foes keep their own gravity
      const dy = ty - ey(e), sy = Math.sign(dy) * Math.min(Math.abs(dy), sp * dt);
      if (sy && !FK.blocked(e.x, e.y + sy, w, h - 0.02)) e.y += sy;
    }
  }
  const box = (p, f, x0, x1, hy) => FK.foes().filter(e => { const a = (ex(e) - pcx(p)) * f, hw = (e.w || 0.9) / 2; return a > x0 - hw && a < x1 + hw && Math.abs(ey(e) - pcy(p)) < hy + (e.h || 0.9) / 2; });
  const circ = (x, y, r) => FK.foes().filter(e => Math.hypot(ex(e) - x, ey(e) - y) < r + (e.w || 0.9) / 2);
  const cut = (x, y, ang, len, c) => S.fx.push({ k: 'cut', x, y, ang, len, c: c || C_GOLD, t: 0, life: 0.16 });
  const ghost = p => S.fx.push({ k: 'ghost', x: p.x, y: p.y, w: p.w, h: p.h, t: 0, life: 0.24 });

  // a dash that passes through foes and remembers who it passed (Blitz, Pierce)
  function dashStep(p, m, dt) {
    if (m.t > m.delay) return;
    let left = m.len / m.delay * dt, stopped = false;
    while (left > 0) {
      const st = Math.min(0.25, left); left -= st;
      if (FK.blocked(p.x + m.f * st, p.y + 0.02, p.w, p.h - 0.06)) { stopped = true; break; }
      p.x += m.f * st;
      for (const e of FK.foes()) if (!m.marks.has(e) && Math.abs(ex(e) - pcx(p)) < 0.6 + (e.w || 0.9) / 2 && Math.abs(ey(e) - pcy(p)) < 0.6 + (e.h || 0.9) / 2) {
        m.marks.set(e, ex(e)); hit(p, e, TICK, { kx: 0, ky: -1, stun: 0.35 }); cut(ex(e), ey(e), m.f > 0 ? -0.3 : Math.PI + 0.3, 2.2, C_WHITE); snick(0); m.n = 1;
      }
    }
    p.vx = 0; p.vy = 0; p.dashInvuln = Math.max(p.dashInvuln || 0, 0.1); S.selfMove = true;
    ghost(p);
    if (stopped || m.t + dt > m.delay) { m.delay = Math.min(m.delay, m.t); p.vx = stopped ? 0 : m.f * 5; if (!m.marks.size) m.n = m.N; }   // passed nobody: no cuts to wait for
  }
  const dashZone = (p, m) => [...m.marks.keys()].filter(e => !e.dead);

  // ---- the moves ----
  //  N: [cuts on a tap, cuts when charged]   iv: seconds between cuts   zone: who the cuts reach
  //  hold: where the blades keep them   tick / fin: knockback of a small cut / of the last cut
  const MV = {
    ground_neutral: { name: 'Phantom Flurry', big: 'PHANTOM STORM', cd: 0.42, N: [5, 7], iv: 0.055,
      zone: (p, m) => box(p, m.f, -0.2, 2.7 + reach() + 0.6 * m.pw, 1.2),
      hold: (p, m, e) => [pcx(p) + m.f * 1.5, pcy(p)],
      tick: (p, m, e) => ({ kx: m.f, ky: -1 }), fin: (p, m, e) => ({ kx: m.f * 8 * (1 + 0.4 * m.pw), ky: -6 }),
      show(p, m) { const i = m.n; cut(pcx(p) + m.f * (1.3 + 0.35 * (i % 2)), pcy(p) + ((i % 3) - 1) * 0.35, (m.f > 0 ? 0 : Math.PI) + (i % 2 ? 0.7 : -0.7) * m.f, 3 + reach() + 0.6 * m.pw, i % 2 ? C_CYAN : C_GOLD); } },
    ground_side: { name: 'Phantom Blitz', big: 'PHANTOM RAID', cd: 0.5, N: [4, 6], iv: 0.05,
      start(p, m) { m.delay = 0.13; m.len = 4.5 + reach() + 1.5 * m.pw; m.marks = new Map(); FK.whoosh(false, true); },
      move: dashStep, zone: dashZone,
      hold: (p, m, e) => [m.marks.get(e), ey(e)],
      tick: () => ({ kx: 0, ky: -1 }), fin: (p, m, e) => ({ kx: m.f * 3, ky: -11 - 2 * m.pw }),
      show(p, m, zs) { for (const e of zs) cut(ex(e), ey(e), m.n * 2.4, 2.4, m.n % 2 ? C_CYAN : C_GOLD); } },
    ground_up: { name: 'Ascending Star', big: 'STAR ASCENSION', cd: 0.6, N: [6, 8], iv: 0.05, rise: 12, keep: 9, finKy: -14 },
    ground_down: { name: 'Star Circle', big: 'GRAND STAR CIRCLE', cd: 0.65, N: [8, 8], iv: 0.05,
      start(p, m) { m.R = 2.5 + reach() + 0.7 * m.pw; },
      zone: (p, m) => circ(pcx(p), pcy(p), m.R),
      hold: (p, m, e) => [pcx(p) + side(e, p, m.f) * 1.3, pcy(p)],
      tick: (p, m, e) => ({ kx: -side(e, p, m.f), ky: -1 }), fin: (p, m, e) => ({ kx: side(e, p, m.f) * 8 * (1 + 0.4 * m.pw), ky: -7 }),
      show(p, m) { const a = -Math.PI / 2 + m.n * Math.PI / 4 * m.f; S.fx.push({ k: 'blade', a, R: m.R, t: 0, life: 0.2, c: m.n % 2 ? C_CYAN : C_GOLD }); },
      done(p, m) { S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: m.R, c: C_GOLD, t: 0, life: 0.3 }); } },
    air_neutral: { name: 'Crescent Wheel', big: 'ECLIPSE WHEEL', cd: 0.5, N: [6, 8], iv: 0.05,
      start(p, m) { m.R = 1.9 + reach() * 0.5 + 0.4 * m.pw; },
      move(p) { p.vy = Math.min(p.vy, 1); },
      zone: (p, m) => circ(pcx(p), pcy(p), m.R),
      hold: (p, m, e) => [pcx(p) + side(e, p, m.f) * 1.1, pcy(p)],
      tick: (p, m, e) => ({ kx: -side(e, p, m.f), ky: -1.5 }), fin: (p, m, e) => ({ kx: side(e, p, m.f) * 7 * (1 + 0.4 * m.pw), ky: -7 }),
      show(p, m) { const a = -Math.PI / 2 + m.n * 1.9 * m.f; S.fx.push({ k: 'wheel', a0: a - 2.2 * m.f, a1: a, R: m.R, t: 0, life: 0.17, c: m.n % 2 ? C_CYAN : C_GOLD }); } },
    air_side: { name: 'Phantom Pierce', big: 'PHANTOM LANCE', cd: 0.45, N: [3, 4], iv: 0.05,
      start(p, m) { m.delay = 0.12; m.len = 3.5 + reach() + 2 * m.pw; m.marks = new Map(); S.airSide = true; FK.whoosh(false, true); },
      move: dashStep, zone: dashZone,
      hold: (p, m, e) => [m.marks.get(e), ey(e)],
      tick: () => ({ kx: 0, ky: -1 }), fin: (p, m, e) => ({ kx: m.f * 3, ky: -10 - 2 * m.pw }),
      show(p, m, zs) { for (const e of zs) cut(ex(e), ey(e), m.n * 2.4, 2.4, m.n % 2 ? C_CYAN : C_GOLD); },
      done(p, m) { if (m.marks.size) { S.airSide = false; S.atkCD = Math.min(S.atkCD, 0.12); } } },
    air_up: { name: 'Rising Ace', big: 'SKY ACE', cd: 0.55, N: [4, 5], iv: 0.05, rise: 15, keep: 11, finKy: -13, once: true },
    air_down: { name: 'Card Drop', big: 'ROYAL DROP', cd: 0.6, N: [3, 5], iv: 0.07, own: true },
  };
  // Ascending Star / Rising Ace: he spirals upward and the blades carry everyone near him up too
  for (const key of ['ground_up', 'air_up']) Object.assign(MV[key], {
    start(p, m) { const o = MV[key]; p.vy = -(o.rise + 2 * m.pw); p.onGround = false; if (o.once) S.airUp = true; FK.whoosh(true, true); },
    move(p, m) { p.vy = Math.min(p.vy, -MV[key].keep); if (Math.random() < 0.5) ghost(p); },
    zone: (p, m) => circ(pcx(p), pcy(p) - 0.2, 1.9 + reach() * 0.5),
    hold: (p, m, e) => [pcx(p) + m.f * 0.5, pcy(p) - 0.35], sp: 45,   // fast enough to keep up with his climb
    tick: () => ({ kx: 0, ky: -8 }), fin: (p, m, e) => ({ kx: m.f * 2, ky: MV[key].finKy - 3 * m.pw }),
    show(p, m) { const a = m.n * 2.1 * m.f; S.fx.push({ k: 'wheel', a0: a - 1.8 * m.f, a1: a, R: 1.5, t: 0, life: 0.16, c: m.n % 2 ? C_CYAN : C_GOLD, flat: 0.45 }); },
  });
  // strike-engine frame data: almost no windup, the cuts themselves are the move
  const MFD = {
    ground_neutral: { windup: 0.03, active: 0.26, endlag: 0.08 },
    ground_side:    { windup: 0.03, active: 0.26, endlag: 0.08, root: false },
    ground_up:      { windup: 0.03, active: 0.28, endlag: 0.10, root: false, hang: false },
    ground_down:    { windup: 0.04, active: 0.38, endlag: 0.10 },
    air_neutral:    { windup: 0.02, active: 0.28, endlag: 0.08, root: false },
    air_side:       { windup: 0.02, active: 0.2, endlag: 0.08, root: false },
    air_up:         { windup: 0.02, active: 0.2, endlag: 0.10, root: false, hang: false },
    air_down:       { windup: 0.03, active: 0.4, endlag: 0.10, root: false, hang: false },
  };

  function finDmg(m) { return 2 + Math.round(2 * m.pw); }
  function endMove(p, m, spec) { if (spec.done) spec.done(p, m); S.mv = null; }

  function stepMove(p, dt) {
    const m = S.mv, spec = MV[m.key];
    m.t += dt;
    if (spec.own) return stepDrop(p, m, dt);
    if (spec.move) spec.move(p, m, dt);
    if (m.t < (m.delay || 0)) return;
    const zs = spec.zone(p, m);
    for (const e of zs) { const h = spec.hold(p, m, e); drag(e, h[0], h[1], spec.sp || 14, dt); }
    while (m.n < m.N && m.t >= (m.delay || 0) + (m.n - (m.n0 || 0)) * m.iv) {
      m.n++;
      const last = m.n >= m.N;
      for (const e of zs) hit(p, e, last ? finDmg(m) : TICK, Object.assign({ stun: last ? 0.5 : 0.3, big: last }, last ? spec.fin(p, m, e) : spec.tick(p, m, e)));
      spec.show(p, m, zs);
      if (last && zs.length) { FK.smack(true); FK.shake(5); FK.hitstop(0.05); FK.tone(1760, { dur: 0.16, vol: 0.09 }); }
      else if (zs.length) { snick(m.n); FK.shake(2); }
      else if (m.n % 2) FK.noise({ dur: 0.04, cut: 3600, q: 2, vol: 0.05 });
    }
    if (m.n >= m.N) endMove(p, m, spec);
  }
  // Card Drop: he drills straight down. Anyone under his feet is cut and carried; in the air the last
  // cut spikes them and he bounces off, on the floor he lands with a burst.
  function stepDrop(p, m, dt) {
    p.vy = 22 + 4 * m.pw; p.vx = m.f * 3;
    const zs = FK.foes().filter(e => Math.abs(ex(e) - pcx(p)) < 0.75 + (e.w || 0.9) / 2 && ey(e) > p.y && e.y < p.y + p.h + 0.6);
    for (const e of zs) drag(e, pcx(p), p.y + p.h + 0.35, 26, dt);
    if (Math.random() < 0.6) ghost(p);
    if (p.onGround && m.t > 0.03) {
      const R = 1.8 + reach() * 0.5 + 0.5 * m.pw, near = circ(pcx(p), p.y + p.h - 0.4, R);
      for (const e of near) hit(p, e, finDmg(m), { kx: side(e, p, m.f) * 5, ky: -11 - 2 * m.pw, stun: 0.5, big: true });
      S.fx.push({ k: 'shock', x: pcx(p), y: p.y + p.h, R, c: C_GOLD, t: 0, life: 0.4 });
      FK.thud(false); if (near.length) { FK.smack(true); FK.hitstop(0.05); } FK.shake(5);
      return endMove(p, m, MV.air_down);
    }
    if (zs.length && m.t >= m.next) {
      m.next = m.t + m.iv; m.n++;
      const last = m.n >= m.N;
      for (const e of zs) hit(p, e, last ? finDmg(m) : TICK, last ? { kx: m.f * 2, ky: 15 + 3 * m.pw, stun: 0.5, big: true } : { kx: 0, ky: 6, stun: 0.3 });
      cut(pcx(p), p.y + p.h + 0.3, m.n * 2.1, 2.2, m.n % 2 ? C_CYAN : C_GOLD);
      if (last) { FK.smack(true); FK.hitstop(0.05); FK.shake(5); if (!inSmash()) p.vy = -12; else p.vy = -11; p.vx = 0; S.airUp = false; return endMove(p, m, MV.air_down); }
      snick(m.n);
    }
    if (m.t > 0.7) endMove(p, m, MV.air_down);
  }

  // ---- the S button ----
  const _prevSlash = window.performSlash;
  window.performSlash = function () {
    if (window.selectedCharacter !== ID) { if (_prevSlash) return _prevSlash.apply(this, arguments); return; }
    const p = window._gamePlayer;
    if (!p || S.atkCD > 0 || S.mv) return;
    const pick = () => {
      const q = window._gamePlayer; if (!q || window.selectedCharacter !== ID || S.mv) return null;
      const k = FK.keys(), stance = (q.onGround || S.airT < 0.12) ? 'ground' : 'air';   // (↑ is also jump: ↑ + S from the floor is still the ground move)
      const dir = (k.down && !k.up) ? 'down' : (k.up && !k.down) ? 'up' : (k.left || k.right) ? 'side' : 'neutral';
      if (stance === 'air' && dir === 'up' && S.airUp) { FK.msg('🌟 Rising Ace comes back when you land'); return null; }
      if (stance === 'air' && dir === 'side' && S.airSide) { FK.msg('🌟 Phantom Pierce comes back when you land or land a hit'); return null; }
      return { key: stance + '_' + dir, f: k.right ? 1 : k.left ? -1 : FK.face(q) };
    };
    const fire = (sel, pw) => {
      const q = window._gamePlayer; if (!q || S.mv) return;
      pw = pw || 0;
      const spec = MV[sel.key], big = pw > 0.3;
      q.dashDir = sel.f; q.lastMoveDir = sel.f;
      const m = S.mv = { key: sel.key, t: 0, f: sel.f, pw, n: 0, N: spec.N[big ? 1 : 0], iv: spec.iv, delay: 0, next: 0 };
      S.atkCD = spec.cd;
      if (spec.start) spec.start(q, m);
      const name = big ? spec.big : spec.name.toUpperCase();
      FK.label(S, q, name, big ? C_GOLD : C_CYAN, big);
      FK.msg('🌟 ' + name + '!');
    };
    if (window.PPStrike) {
      window.PPStrike.press(() => { const sel = pick(); return sel && { fd: MFD[sel.key], dir: sel.f, color: C_GOLD, aim: sel.key.split('_')[1], fire: pw => fire(sel, pw) }; }, true);
      return;
    }
    const sel = pick(); if (sel) fire(sel, 0);
  };
  if (window.UNIVERSAL_PUNCH_EXCLUDED_CHARS) window.UNIVERSAL_PUNCH_EXCLUDED_CHARS.add(ID);
  window.__aceLeech = () => Math.max(0, Math.min(1, S.bank));   // the HUD's leech meter

  // ---- per-frame update ----
  function step(dt) {
    const playing = window.selectedCharacter === ID && (!window._gameMode || window._gameMode() === 'play');
    if (!playing) { if (S.active) S = fresh(); return; }
    const p = window._gamePlayer; if (!p) return;
    if (!S.active) { const keep = S.fx; S = fresh(); S.fx = keep; S.active = true; }
    // respawned or teleported (or thrown far in Smash): drop the move in progress
    if (S.lastPX != null && !S.selfMove && (Math.abs(p.x - S.lastPX) > 4 || Math.abs(p.y - S.lastPY) > 4)) S.mv = null;
    S.selfMove = false;
    if (S.atkCD > 0) S.atkCD = Math.max(0, S.atkCD - dt);
    if (S.healT > 0) S.healT -= dt;
    S.airT = p.onGround ? 0 : S.airT + dt;
    if (p.onGround) { S.airUp = false; S.airSide = false; }
    if (S.mv && p.hitstun > 0) S.mv = null;
    if (S.mv) stepMove(p, dt);
    for (let i = S.fx.length - 1; i >= 0; i--) { S.fx[i].t += dt; if (S.fx[i].t >= S.fx[i].life) S.fx.splice(i, 1); }
    if (S.fx.length > 90) S.fx.splice(0, S.fx.length - 90);
    S.busy = !!S.mv; S.lastPX = p.x; S.lastPY = p.y;
  }
  (window._rafHubTickers = window._rafHubTickers || []).push(step);

  // ---- drawing ----
  function drawFx(ctx, V, f, u, a) {
    const T = V.T, p = V.p;
    if (f.k === 'cut') {
      // a quick straight slash: a blade of light, widest in the middle
      const x = V.SX(f.x), y = V.SY(f.y), L = f.len * T * (0.35 + 0.65 * FK.easeOut(u * 2.5)) / 2, c = Math.cos(f.ang), s = Math.sin(f.ang), w = T * 0.16 * a;
      ctx.beginPath(); ctx.moveTo(x - c * L, y - s * L); ctx.lineTo(x - s * w, y + c * w); ctx.lineTo(x + c * L, y + s * L); ctx.lineTo(x + s * w, y - c * w); ctx.closePath();
      FK.glow(ctx, f.c, a); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - c * L, y - s * L); ctx.lineTo(x + c * L, y + s * L); FK.glow(ctx, C_WHITE, a); ctx.lineWidth = 1.5; ctx.stroke();
      return true;
    }
    if (f.k === 'blade') {
      // Star Circle: one blade of the ring, a crescent out at the rim with a star on it
      const x = V.SX(pcx(p)), y = V.SY(pcy(p)), R = f.R * T;
      FK.crescent(ctx, x, y, R, f.a - 0.55, f.a + 0.55, T * 0.5, f.c, a);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(f.a) * R, y + Math.sin(f.a) * R); FK.glow(ctx, C_WHITE, a * 0.5); ctx.lineWidth = 2; ctx.stroke();
      FK.star(ctx, x + Math.cos(f.a) * R, y + Math.sin(f.a) * R, T * 0.3 * (0.6 + u), u * 4, C_WHITE, a);
      return true;
    }
    if (f.k === 'wheel') {
      const x = V.SX(pcx(p)), y = V.SY(pcy(p)), R = f.R * T;
      if (f.flat) { ctx.save(); ctx.translate(x, y); ctx.scale(1, f.flat); FK.crescent(ctx, 0, 0, R, f.a0, f.a1, T * 0.45, f.c, a); ctx.restore(); }
      else FK.crescent(ctx, x, y, R, f.a0, f.a1, T * 0.5, f.c, a);
      return true;
    }
    if (f.k === 'ghost') {
      FK.glow(ctx, u < 0.4 ? C_GOLD : C_VIOLET, 0.4 * a);
      const x = V.SX(f.x), y = V.SY(f.y), w = f.w * T, h = f.h * T;
      ctx.beginPath(); ctx.roundRect(x + w * 0.15, y + h * 0.1, w * 0.7, h * 0.85, w * 0.25); ctx.fill();
      return true;
    }
    if (f.k === 'leech') {
      // a drop of life flying from the foe into him
      const e2 = u * u, x = V.SX(f.x + (pcx(p) - f.x) * e2), y = V.SY(f.y + (pcy(p) - f.y) * e2) - Math.sin(u * Math.PI) * T * 0.5;
      FK.glow(ctx, f.big ? C_LEECH : C_RED, 0.9); ctx.beginPath(); ctx.arc(x, y, T * (f.big ? 0.13 : 0.08), 0, Math.PI * 2); ctx.fill();
      FK.glow(ctx, C_WHITE, 0.8); ctx.beginPath(); ctx.arc(x, y, T * 0.04, 0, Math.PI * 2); ctx.fill();
      return true;
    }
    return false;
  }
  function drawWorld(ctx, cam) {
    const p = window._gamePlayer; if (!p || !S.active) return;
    const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0;
    const V = { T, SX: x => x * T - cx0, SY: y => y * T - cy0, now: performance.now() / 1000, p };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowBlur = 0;
    const x = V.SX(pcx(p)), y = V.SY(pcy(p));
    // healing: a soft green pulse round him
    if (S.healT > 0) { ctx.beginPath(); ctx.arc(x, y, T * (0.75 + 0.25 * Math.sin(V.now * 30)), 0, Math.PI * 2); FK.glow(ctx, C_LEECH, Math.min(0.6, S.healT * 1.5)); ctx.lineWidth = 3; ctx.stroke(); }
    // the leech meter (main game): an arc over his head that fills toward the next heart
    if (S.bank > 0.02 && !inSmash()) {
      const hy = V.SY(p.y) - 9;
      ctx.beginPath(); ctx.arc(x, hy + T * 0.5, T * 0.5, Math.PI * 1.2, Math.PI * 1.8); FK.solid(ctx, '#1b1026', 0.6); ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, hy + T * 0.5, T * 0.5, Math.PI * 1.2, Math.PI * (1.2 + 0.6 * Math.min(1, S.bank))); FK.glow(ctx, S.bank >= 1 ? C_WHITE : C_LEECH, 0.95); ctx.lineWidth = 2.5; ctx.stroke();
    }
    // the dive: a spear of light behind him
    if (S.mv && S.mv.key === 'air_down') { const pts = []; for (let j = 0; j <= 8; j++) pts.push([x - S.mv.f * j * T * 0.06, y - j * T * 0.4]); FK.taper(ctx, pts, T * 0.35, C_GOLD, 0.8); FK.star(ctx, x, V.SY(p.y + p.h), T * 0.28, V.now * 12, C_WHITE, 0.9); }
    FK.drawFx(ctx, V, S.fx, drawFx);
    ctx.restore();
  }
  const _prevHook = window.drifterDrawHook;
  window.drifterDrawHook = function (ctx, now2, cam) {
    if (_prevHook) _prevHook(ctx, now2, cam);
    if (window.selectedCharacter !== ID) return;
    try { drawWorld(ctx, cam); } catch (e) {}
  };

  // A second fighter (Smash CPU) playing the Ace keeps its own move, cooldowns and effects.
  (window._fighterPlugins = window._fighterPlugins || []).push({ name: 'ace', char: ID,
    swap(s) { const o = S; S = s || fresh(); return o; },
    tick: dt => { if (window.selectedCharacter === ID) step(dt); },
    draw: (ctx, now2, cam) => { if (window.selectedCharacter === ID) drawWorld(ctx, cam); },
  });
})();
