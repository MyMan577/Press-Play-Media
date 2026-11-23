/* Obby Builder: CHROMA's own look and moveset. Five forms that play nothing alike.
 *
 * 0 / the gem button = next form. Switching cancels the end of the move you are in, shoves foes next to you
 * away and makes your next move within a moment a PRISM move (as if half charged): switch mid-combo.
 * Hold S to charge any move. K = Tongue Chain (its own script in index.html).
 *
 * 🔴 EMBER, the brawler (melee). Hits build HEAT (bigger flames, harder launches); Eruption spends it.
 *    Ground: Cinder Claws (3 cuts) / Blaze Rush (dash through, fire trail) / Rising Flare (uppercut) / Eruption.
 *    Air:    Fire Wheel (spin, many hits) / Comet Kick (dive kick, bounces off) / Rising Flare / Meteor Dive.
 * 🔵 FROST, the zoner (ranged). Hits CHILL; the third chill FREEZES. A hard hit on a frozen foe SHATTERS.
 *    Ground: Icicle Fan / Glacier Lance (long, pierces) / Hailstorm / Ice Wall (again = shatter it into shards).
 *    Air:    Snow Burst / Frost Glide (skate dash) / Glacier Hop (leap off a falling ice block) / Icicle Drop.
 * 🟢 VENOM, the trickster (mid range, grabs). Hits stack POISON; bites RUPTURE the stacks for a burst.
 *    Ground: Tail Whip (both sides) / Tongue Lash (pull them in and chomp, or pull yourself to a wall) /
 *            Acid Mortar (lob, leaves a pool) / Vanish Strike (go invisible, reappear behind them).
 *    Air:    Spore Burst (cloud that stays) / Zip Kick (tongue-zip to a foe) / Tongue Hoist / Fang Dive (pogo).
 * 🟡 VOLT, the speedster (blinks). Hits leave STATIC; Thunder Call strikes every foe carrying it.
 *    Ground: Spark Jabs (4 hits) / Bolt Blink (teleport, zaps the line) / Thunder Call / Tesla Orb (blink
 *            through an orb to set it off).
 *    Air:    Ball Lightning (homing) / Arc Dash / Sky Blink / Thunder Drop (drop as a bolt, shockwave).
 * ⚪ LUMEN, the healer (drains). Four moves hit and leave LIGHT on foes; the other four (♥) hit AND mend him,
 *    and mend more off a foe carrying LIGHT. Main game: mending fills a meter, a full meter is +1 ♥.
 *    Smash: it takes percent off him.
 *    Ground: Radiant Palm (3 hits) / Siphon Beam ♥ (long beam, drains) / Halo Rise (launcher) /
 *            Sanctuary ♥ (a circle that mends him while he stands in it and burns foes; recharges).
 *    Air:    Halo Spin (many hits) / Dove Dash ♥ (dash through foes) / Ascension / Benediction ♥ (dive burst).
 *
 * Works for a second fighter (Smash CPU) through window._fighterPlugins, like Gale and the Ace.
 */
(function () {
  'use strict';
  const ID = 'cb_chameleon', FK = window.FKit;
  if (!FK) return;
  const FORMS = [
    { id: 'ember', name: 'Ember', emoji: '🔴', c: '#ff5a36', g: '#ffc15e', d: '#8a1f10', b: '#ffe2b0', a: '#ffe066' },
    { id: 'frost', name: 'Frost', emoji: '🔵', c: '#4cc3ff', g: '#d9f6ff', d: '#1b5a94', b: '#eefbff', a: '#ffffff' },
    { id: 'venom', name: 'Venom', emoji: '🟢', c: '#5fdc4c', g: '#c8ff7a', d: '#1c6a33', b: '#e6ffc2', a: '#b45cff' },
    { id: 'volt',  name: 'Volt',  emoji: '🟡', c: '#ffd92e', g: '#fff7b0', d: '#93600a', b: '#fffbe0', a: '#63e6ff' },
    { id: 'lumen', name: 'Lumen', emoji: '⚪', c: '#f6f4ff', g: '#ffffff', d: '#7a74ad', b: '#fff1d0', a: '#ffcf5a' },
  ];
  const WHITE = '#ffffff', TONGUE = '#ff4d6d', GOLD = '#ffcf5a', MEND = '#8dffb0';
  const fresh = () => ({ active: false, form: 0, switchCD: 0, prism: 0, shiftT: 0, atkCD: 0, mv: null, busy: false, airUp: false, airSide: false, airHop: false,
    airT: 0, heat: 0, heatT: 0, invis: 0, bank: 0, healT: 0, sanct: 0, shots: [], zones: [], timers: [], fx: [], tongue: null, lastPX: null, lastPY: null, selfMove: false });
  let S = fresh();
  const oops = e => { (window.__chromaErr = window.__chromaErr || []).length < 20 && window.__chromaErr.push(String(e && e.stack || e)); };

  const ex = FK.ex, ey = FK.ey, pcx = FK.pcx, pcy = FK.pcy, inSmash = FK.inSmash;
  const has = id => !!(window.hasUpgrade && window.hasUpgrade(id));
  const form = () => FORMS[S.form] || FORMS[0];
  const fById = id => FORMS.find(f => f.id === id) || FORMS[0];
  const P = () => window._gamePlayer;
  const away = (e, p, f) => ex(e) === pcx(p) ? (f || 1) : ex(e) > pcx(p) ? 1 : -1;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const box = (p, f, x0, x1, hy, oy) => FK.foes().filter(e => { const a = (ex(e) - pcx(p)) * f, hw = (e.w || 0.9) / 2; return a > x0 - hw && a < x1 + hw && Math.abs(ey(e) - pcy(p) - (oy || 0)) < hy + (e.h || 0.9) / 2; });
  const circ = (x, y, r) => FK.foes().filter(e => Math.hypot(ex(e) - x, ey(e) - y) < r + (e.w || 0.9) / 2);
  const mouth = (p, f) => [pcx(p) + f * 0.34, p.y + p.h * 0.3];
  const push = o => { o.t = 0; S.fx.push(o); return o; };
  function segDist(px, py, x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1e-6; const u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)); return Math.hypot(px - x1 - dx * u, py - y1 - dy * u); }

  // ---- hitting and the five marks (burn, chill, poison, static, light) ----
  function dmgTo(e, dmg) {
    if (inSmash()) { e.hp = Math.max(0, (e.hp || 1) - dmg); return; }   // Smash turns this into percent
    e._chFrac = (e._chFrac || 0) + dmg; const whole = Math.floor(e._chFrac + 1e-6);   // the main game's foes lose whole points
    if (whole > 0) { e._chFrac -= whole; e.hp = Math.max(0, (e.hp || 1) - whole); }
  }
  function dead(e) { if (e.hp <= 0 && !e.dead && window._killEnemy) window._killEnemy(e); }
  function hit(e, dmg, o) {
    o = o || {};
    const fm = fById(o.form || form().id);
    if (o.el === 'chill' && e._ppFrozen > 0 && o.big) { dmg += 1.5; e._ppFrozen = 0; e.stunTimer = 0; lbl(e, 'SHATTER!', fm.g); push({ k: 'shards', x: ex(e), y: ey(e), n: 10, c: fm.g, life: 0.45 }); FK.noise({ dur: 0.18, cut: 5200, q: 3, vol: 0.2 }); }
    if (o.rupture) { const n = e._chPoisN || 0; if (n > 0) { dmg += 0.45 * n; e._chPoisN = 0; e._chPois = 0; if (n >= 2) lbl(e, 'RUPTURE x' + n, FORMS[2].a); push({ k: 'burst', x: ex(e), y: ey(e), c: FORMS[2].a, R: 0.5 + 0.15 * n, life: 0.3 }); } }
    dmgTo(e, dmg);
    e.hitFlash = 0.5;
    if (o.stun) e.stunTimer = Math.max(e.stunTimer || 0, o.stun);
    if (!e._noKnockback) { if (o.kx != null) e.vx = o.kx; if (o.ky != null) e.vy = o.ky; }
    push({ k: 'spark', x: ex(e), y: ey(e), ang: Math.atan2(o.ky || -1, o.kx || 0.001), life: o.big ? 0.4 : 0.22, c: fm.c, big: !!o.big });
    if (o.el === 'burn') { e._chBurn = Math.max(e._chBurn || 0, 2.5); if (o.heat) { S.heat = Math.min(5, S.heat + 1); S.heatT = 2.6; } }
    else if (o.el === 'chill') chill(e, o.n || 1);
    else if (o.el === 'poison') { e._chPoisN = Math.min(5, (e._chPoisN || 0) + (o.n || 1)); e._chPois = 4.5; }
    else if (o.el === 'static') e._chStatic = 4.5;
    else if (o.el === 'light') e._chLight = 5;
    if (o.big) { FK.shake(o.shake || 5); FK.hitstop(o.stop || 0.05); FK.smack(true); } else FK.smack(false);
    dead(e);
  }
  function lbl(e, text, c) { push({ k: 'pop', x: ex(e), y: e.y - 0.25, life: 0.7, text, c: c || WHITE }); }
  function chill(e, n) {
    e.slowTimer = Math.max(e.slowTimer || 0, 1.6); e._chChillT = 3.2;
    e._chChill = (e._chChill || 0) + n;
    if (e._chChill < 3 || e._ppFrozen > 0) return;
    e._chChill = 0; e.stunTimer = Math.max(e.stunTimer || 0, 1.5); e._ppFrozen = 1.5;
    if (inSmash()) { e.hp = Math.max(0, e.hp - 1); if (!e._noKnockback) e.vy = -9; }   // (nothing is stunned in Smash: the freeze pops them up instead)
    lbl(e, 'FROZEN!', FORMS[1].g); push({ k: 'ring', x: ex(e), y: ey(e), R: 0.9, c: FORMS[1].g, life: 0.3 });
    FK.tone(1900, { dur: 0.2, vol: 0.12, type: 'sine' }); FK.tone(2500, { dur: 0.25, vol: 0.08, type: 'sine', delay: 0.05 });
  }
  // LUMEN's mending. pts are in the game's damage points. Main game: they fill a meter and a full meter is +1 heart.
  // Smash: they come off his percent (smash.js), for you or for a CPU Chroma alike.
  function chime() { for (let i = 0; i < 3; i++) FK.tone(784 * Math.pow(1.26, i), { dur: 0.2, vol: 0.09, delay: i * 0.06, type: 'sine' }); }
  function heal(p, pts) {
    if (!(pts > 0)) return;
    S.healT = 0.7; push({ k: 'mend', x: pcx(p), y: pcy(p), life: 0.6 });
    FK.tone(1175, { dur: 0.12, vol: 0.06, type: 'sine' });
    if (inSmash()) { const sm = window.__smash; if (sm && sm.__heal) sm.__heal(pts); return; }
    if (window._fighterPass) return;
    S.bank += pts * 0.3;
    if (S.bank < 1) return;
    if ((p.hp || 0) < (p.maxHp || 0)) { p.hp = Math.min(p.maxHp, p.hp + 1); S.bank -= 1; FK.label(S, p, '+1 ♥ MEND', MEND, true); chime(); }
    else S.bank = 1;
  }
  // a healing move takes the LIGHT off a foe it hits: that foe mends him more
  function reap(e) { if (!(e._chLight > 0)) return 0; e._chLight = 0; push({ k: 'burst', x: ex(e), y: ey(e), c: GOLD, R: 0.7, life: 0.25 }); return 0.6; }
  const drain = (e, p) => push({ k: 'drain', x: ex(e), y: ey(e), life: 0.4 });
  function canDrag(e) {
    if (e._noKnockback || (e._held && !e._smashFoe)) return false;
    const sm = window.__smash;
    return !(sm && sm.active && sm.__canHold && !sm.__canHold(e));
  }
  function drag(e, tx, ty, sp, dt) {
    if (!canDrag(e)) return false;
    const w = e.w || 0.9, h = e.h || 0.9;
    const dx = tx - ex(e), sx = Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
    if (sx && !FK.blocked(e.x + sx, e.y + 0.02, w, h - 0.08)) e.x += sx;
    if (ty != null && inSmash()) { const dy = ty - ey(e), sy = Math.sign(dy) * Math.min(Math.abs(dy), sp * dt); if (sy && !FK.blocked(e.x, e.y + sy, w, h - 0.02)) e.y += sy; }
    return true;
  }
  // move the fighter itself in small steps; stops at a wall. Returns false if it was stopped.
  function slide(p, dx, dy) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
    S.selfMove = true;
    for (let i = 0; i < n; i++) {
      const nx = p.x + dx / n, ny = p.y + dy / n;
      if (FK.blocked(nx, ny + 0.02, p.w, p.h - 0.06)) return false;
      p.x = nx; p.y = ny;
    }
    return true;
  }
  const ghost = (p, c) => push({ k: 'ghost', x: p.x, y: p.y, w: p.w, h: p.h, c: c || form().c, life: 0.22 });
  const D = (m, d) => d * (1 + 0.5 * m.pw);
  const R = (m, r) => r * (1 + 0.25 * m.pw);

  // ---- shots (things that fly) and zones (things that stay) ----
  function shot(o) { S.shots.push(Object.assign({ t: 0, life: 1, r: 0.3, g: 0, pierce: 0, hs: new Set(), form: form().id, trail: [] }, o)); }
  function zone(o) { S.zones.push(Object.assign({ t: 0, tt: 0, tk: 0.4, life: 2, r: 1, form: form().id }, o)); return S.zones[S.zones.length - 1]; }
  function splash(s, x, y) {
    const sp = s.splash; if (!sp) return;
    for (const e of circ(x, y, sp.r)) if (!s.hs.has(e) || sp.again) hit(e, sp.dmg, { el: sp.el, n: sp.n, kx: (ex(e) > x ? 1 : -1) * (sp.kx || 4), ky: sp.ky == null ? -7 : sp.ky, form: s.form, big: sp.big });
    push({ k: 'burst', x, y, c: fById(s.form).c, R: sp.r, life: 0.32 });
    if (sp.zone) zone(Object.assign({ x, y, form: s.form }, sp.zone));
    FK.noise({ dur: 0.12, cut: 1800, cutEnd: 500, q: 1, vol: 0.14 });
  }
  function stepShots(p, dt) {
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const s = S.shots[i]; s.t += dt;
      if (s.t < (s.delay || 0)) continue;
      if (s.home) {   // ball lightning: steer at the nearest foe
        let b = null, bd = 9; for (const e of FK.foes()) { const d = Math.hypot(ex(e) - s.x, ey(e) - s.y); if (d < bd) { bd = d; b = e; } }
        if (b) { const d = bd || 1; s.vx += ((ex(b) - s.x) / d * s.home - s.vx) * Math.min(1, dt * 5); s.vy += ((ey(b) - s.y) / d * s.home - s.vy) * Math.min(1, dt * 5); }
      }
      s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      s.trail.push([s.x, s.y]); if (s.trail.length > 7) s.trail.shift();
      let gone = s.t - (s.delay || 0) > s.life;
      if (!gone && !s.ghost && !(s.gy != null && s.y < s.gy) && FK.blocked(s.x - 0.1, s.y - 0.1, 0.2, 0.2)) { gone = true; s.landed = true; }
      if (!gone) for (const e of FK.foes()) {
        if (Math.abs(ex(e) - s.x) > s.r + (e.w || 0.9) / 2 || Math.abs(ey(e) - s.y) > s.r + (e.h || 0.9) / 2) continue;
        if (s.zap) { if ((e._chZapT || 0) > S.clock) continue; e._chZapT = S.clock + 0.22; hit(e, s.dmg, { el: s.el, kx: 0, ky: -1.5, stun: 0.25, form: s.form }); push({ k: 'bolt', x1: s.x, y1: s.y, x2: ex(e), y2: ey(e), life: 0.12 }); if (--s.zap <= 0) { gone = true; break; } continue; }
        if (s.hs.has(e)) continue; s.hs.add(e);
        hit(e, s.dmg, { el: s.el, n: s.n, kx: s.kx == null ? Math.sign(s.vx || 1) * 3 : s.kx, ky: s.ky == null ? -3 : s.ky, stun: s.stun || 0.3, form: s.form, big: s.big });
        if (s.pierce-- <= 0) { gone = true; break; }
      }
      if (gone) { splash(s, s.x, s.y); S.shots.splice(i, 1); }
    }
  }
  function orbBoom(z) {
    z.life = 0;
    for (const e of circ(z.x, z.y, 2.1)) hit(e, 2, { el: 'static', kx: (ex(e) > z.x ? 1 : -1) * 7, ky: -9, stun: 0.6, form: 'volt', big: true });
    push({ k: 'burst', x: z.x, y: z.y, c: FORMS[3].c, R: 2.1, life: 0.35 }); push({ k: 'ring', x: z.x, y: z.y, R: 2.1, c: FORMS[3].a, life: 0.3 });
    FK.thud(false); FK.noise({ dur: 0.2, cut: 4200, q: 2, vol: 0.2 });
  }
  function stepZones(p, dt) {
    for (let i = S.zones.length - 1; i >= 0; i--) {
      const z = S.zones[i]; z.t += dt; z.tt -= dt;
      if (z.t >= z.life) { S.zones.splice(i, 1); continue; }
      if (z.tt > 0) continue; z.tt = z.tk;
      if (z.k === 'wall') {   // an ice wall: foes that touch it are chilled and shoved back out
        for (const e of FK.foes()) if (Math.abs(ex(e) - z.x) < 0.5 + (e.w || 0.9) / 2 && ey(e) > z.y - z.h - 0.3 && e.y < z.y + 0.1) { hit(e, 0.3, { el: 'chill', n: 1, kx: (ex(e) > z.x ? 1 : -1) * 5, ky: -2, form: 'frost' }); }
      } else if (z.k === 'orb') {
        let b = null, bd = 3.2; for (const e of FK.foes()) { const d = Math.hypot(ex(e) - z.x, ey(e) - z.y); if (d < bd) { bd = d; b = e; } }
        if (b) { hit(b, 0.5, { el: 'static', kx: 0, ky: -1.5, stun: 0.25, form: 'volt' }); push({ k: 'bolt', x1: z.x, y1: z.y, x2: ex(b), y2: ey(b), life: 0.14 }); FK.noise({ dur: 0.05, cut: 5200, q: 3, vol: 0.08 }); }
      } else if (z.k === 'sanct') {   // Sanctuary: mends him while he stands in it, burns foes that do
        if (Math.abs(pcx(p) - z.x) < z.r && Math.abs(p.y + p.h - z.y) < 1.2 && z.pool > 0) { const h = Math.min(z.pool, 0.25); z.pool -= h; heal(p, h); }
        for (const e of circ(z.x, z.y - 0.3, z.r)) hit(e, 0.3, { el: 'light', kx: 0, ky: -1, form: 'lumen' });
      } else for (const e of circ(z.x, z.y - (z.k === 'spore' ? 0 : 0.3), z.r)) {
        if (z.k === 'fire') { hit(e, 0.4, { el: 'burn', kx: 0, ky: -1, form: 'ember' }); }
        else if (z.k === 'frost') { hit(e, 0.25, { el: 'chill', n: 1, kx: 0, ky: -1, form: 'frost' }); }
        else { hit(e, 0.3, { el: 'poison', n: 1, kx: 0, ky: -1, form: 'venom' }); e.slowTimer = Math.max(e.slowTimer || 0, 0.8); }
      }
    }
  }
  // burn and poison wear foes down; chill and static fade
  function stepMarks(dt) {
    for (const e of FK.foes()) {
      let d = 0;
      if (e._chBurn > 0) { e._chBurn -= dt; d += 0.5 * dt; }
      if (e._chPois > 0) { e._chPois -= dt; d += 0.2 * (e._chPoisN || 1) * dt; if (e._chPois <= 0) e._chPoisN = 0; }
      if (e._chStatic > 0) e._chStatic -= dt;
      if (e._chLight > 0) e._chLight -= dt;
      if (e._chChillT > 0) { e._chChillT -= dt; if (e._chChillT <= 0) e._chChill = 0; }
      if (d > 0) { dmgTo(e, d); dead(e); }
    }
  }

  // ---- lightning helpers (Volt) ----
  function zapLine(x1, y1, x2, y2, dmg, o, m) {
    let n = 0;
    for (const e of FK.foes()) if (segDist(ex(e), ey(e), x1, y1, x2, y2) < 0.75 + (e.w || 0.9) / 2 && !(m && m.hs.has(e))) { if (m) m.hs.add(e); hit(e, dmg, Object.assign({ el: 'static', form: 'volt' }, o)); n++; }
    for (const z of S.zones) if (z.k === 'orb' && z.life > 0 && segDist(z.x, z.y, x1, y1, x2, y2) < 1.1) orbBoom(z);
    push({ k: 'bolt', x1, y1, x2, y2, life: 0.22, w: 1 });
    return n;
  }
  function blink(p, m, dx, dy, dmg, o) {
    const x0 = pcx(p), y0 = pcy(p);
    ghost(p, FORMS[3].g); slide(p, dx, dy); p.vx = 0; p.vy = Math.min(p.vy, 0);
    p.dashInvuln = Math.max(p.dashInvuln || 0, 0.18);
    const n = zapLine(x0, y0, pcx(p), pcy(p), dmg, o, m);
    push({ k: 'ring', x: pcx(p), y: pcy(p), R: 0.8, c: FORMS[3].a, life: 0.22 });
    FK.noise({ dur: 0.1, cut: 6000, cutEnd: 1500, q: 2, vol: 0.2 }); FK.tone(1400, { dur: 0.09, slide: 500, vol: 0.1, type: 'square' });
    return n;
  }
  function strike(x, y, e, dmg) {
    push({ k: 'strike', x, y, life: 0.3 }); push({ k: 'ring', x, y, R: 1.1, c: FORMS[3].g, life: 0.25 });
    for (const q of circ(x, y, 0.9)) { const marked = q._chStatic > 0; q._chStatic = 0; hit(q, dmg + (marked ? 0.6 : 0), { kx: 0, ky: -13, stun: 0.6, form: 'volt', big: true }); }
    FK.thud(false); FK.noise({ dur: 0.22, cut: 5000, cutEnd: 800, q: 1, vol: 0.25 });
  }
  function floorBelow(p, max) { for (let d = 0.25; d <= max; d += 0.25) if (FK.blocked(p.x, p.y + d, p.w, p.h)) return d - 0.25; return -1; }

  // ---- the moves ----
  // ev: [[time, fn(p, m)], ...] things that happen during the move   move(p, m, dt): every frame (true = done)
  // dur: how long it lasts   pose: how the body is drawn   w: windup   air moves with once: 'up' | 'side' come back on landing
  const sl = (p, m, c, a, r) => push({ k: 'slash', x: pcx(p) + m.f * 0.9, y: pcy(p), f: m.f, a: a || 0, R: r || 1.5, c: c || form().c, life: 0.16 });
  const fire = (x, y, r) => push({ k: 'flame', x, y, R: r || 0.6, life: 0.35 });
  const heatK = () => 1 + 0.08 * S.heat;
  function riseFlare(vy) {
    return { name: 'Rising Flare', big: 'SOLAR UPPERCUT', cd: 0.5, dur: 0.3, pose: 'upper', root: false, once: vy < -14 ? 'up' : null,
      start(p, m) { p.vy = vy - 2 * m.pw; p.onGround = false; FK.whoosh(true, true); },
      move(p, m) { if (m.t < 0.2) { p.vy = Math.min(p.vy, vy * 0.8); fire(pcx(p) + rnd(-0.2, 0.2), p.y + p.h, 0.4); } },
      ev: [0, 0.1].map((t, i) => [t, (p, m) => { for (const e of box(p, m.f, -0.5, 1.5, 1.3, -0.5)) if (!m.hs.has(e)) { m.hs.add(e); hit(e, D(m, 2.2), { el: 'burn', heat: 1, kx: m.f * 2, ky: (-15 - 2 * m.pw) * heatK(), stun: 0.5, big: true }); } if (!i) push({ k: 'slash', x: pcx(p) + m.f * 0.5, y: pcy(p) - 0.4, f: m.f, a: -1.2, R: 1.7, c: FORMS[0].g, life: 0.2 }); }]) };
  }
  function dive(o) {   // a dive that ends on a foe or the floor
    return Object.assign({ dur: 0.9, pose: 'dive', root: false, hold: true,
      move(p, m, dt) {
        p.vy = o.vy + 4 * m.pw; p.vx = m.f * (o.vx || 0);
        if (Math.random() < 0.6) ghost(p);
        if (o.touch && o.touch(p, m, dt)) return true;
        if (p.onGround && m.t > 0.03) { o.land(p, m); return true; }
        return m.t > 0.85;
      } }, o);
  }
  const MV = {
    ember: {
      ground_neutral: { name: 'Cinder Claws', big: 'INFERNO CLAWS', cd: 0.4, dur: 0.36, pose: 'claw',
        ev: [0, 0.11, 0.23].map((t, i) => [t, (p, m) => {
          const last = i === 2; slide(p, m.f * 0.22, 0);
          for (const e of box(p, m.f, -0.3, R(m, 1.9), 0.95)) hit(e, D(m, last ? 1.6 : 0.7), { el: 'burn', heat: 1, kx: m.f * (last ? 7 * heatK() : 1.5), ky: last ? -6 : -1, stun: 0.35, big: last });
          sl(p, m, i % 2 ? FORMS[0].g : FORMS[0].c, i === 1 ? 0.6 : i ? 0 : -0.6, R(m, 1.5 + 0.2 * i)); FK.whoosh(false, last);
        }]) },
      ground_side: { name: 'Blaze Rush', big: 'WILDFIRE RUSH', cd: 0.55, dur: 0.22, pose: 'rush', root: false,
        start(p, m) { m.left = R(m, 4.2); m.sp = m.left / 0.2; p.dashInvuln = Math.max(p.dashInvuln || 0, 0.24); FK.whoosh(false, true); FK.noise({ dur: 0.3, cut: 900, cutEnd: 2600, q: 1, vol: 0.2 }); },
        move(p, m, dt) {
          const st = Math.min(m.left, m.sp * dt); m.left -= st;
          const ok = slide(p, m.f * st, 0); p.vx = 0; p.vy = Math.min(p.vy, 0);
          for (const e of box(p, m.f, -0.6, 0.6, 0.9)) if (!m.hs.has(e)) { m.hs.add(e); hit(e, D(m, 2), { el: 'burn', heat: 1, kx: m.f * 4, ky: -9 * heatK(), stun: 0.5, big: true }); }
          m.acc = (m.acc || 0) + st; if (m.acc > 1.1 && p.onGround) { m.acc = 0; zone({ k: 'fire', x: pcx(p), y: p.y + p.h, r: 0.6, life: 1.5 }); }
          ghost(p); fire(pcx(p) - m.f * 0.3, p.y + p.h * 0.7, 0.45);
          if (!ok || m.left <= 0) { p.vx = m.f * 4; return true; }
        } },
      ground_up: riseFlare(-13),
      ground_down: { name: 'Eruption', big: 'VOLCANO', cd: 0.75, dur: 0.34, pose: 'slam', w: 0.1,
        ev: [[0.08, (p, m) => {
          const r = R(m, 2 + 0.3 * S.heat);
          for (const e of circ(pcx(p), p.y + p.h - 0.5, r)) hit(e, D(m, 2 + 0.3 * S.heat), { el: 'burn', kx: away(e, p, m.f) * 5, ky: -11 - S.heat, stun: 0.6, big: true, shake: 8 });
          for (let i = -2; i <= 2; i++) push({ k: 'pillar', x: pcx(p) + i * r / 2.4, y: p.y + p.h, h: 2.2 - Math.abs(i) * 0.5 + 0.2 * S.heat, life: 0.4, delay: Math.abs(i) * 0.04 });
          push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: r, c: FORMS[0].c, life: 0.4 });
          if (S.heat >= 3) FK.label(S, p, 'HEAT ' + S.heat + '!', FORMS[0].g, true);
          S.heat = 0; FK.thud(true); FK.shake(7);
        }]] },
      air_neutral: { name: 'Fire Wheel', big: 'SUN WHEEL', cd: 0.5, dur: 0.4, pose: 'spin', root: false,
        move(p) { p.vy = Math.min(p.vy, 2); },
        ev: [0, 0.09, 0.18, 0.27, 0.36].map((t, i) => [t, (p, m) => {
          const last = i === 4, r = R(m, 1.3);
          for (const e of circ(pcx(p), pcy(p), r)) { hit(e, D(m, last ? 1.4 : 0.55), { el: 'burn', heat: last ? 1 : 0, kx: away(e, p, m.f) * (last ? 7 * heatK() : -1), ky: last ? -7 : -2, stun: 0.3, big: last }); if (!last) drag(e, pcx(p) + away(e, p, m.f) * 0.8, pcy(p), 10, 0.06); }
          push({ k: 'wheel', R: r, a: i * 1.9 * m.f, f: m.f, c: i % 2 ? FORMS[0].g : FORMS[0].c, life: 0.16 }); FK.whoosh(i % 2 === 0, false);
        }]) },
      air_side: Object.assign(dive({ name: 'Comet Kick', big: 'METEOR KICK', cd: 0.45, pose: 'kick', once: 'side', vy: 10, vx: 13,
        touch(p, m) {
          const e = box(p, m.f, -0.3, 1.0, 0.8)[0]; if (!e) return false;
          hit(e, D(m, 2.2), { el: 'burn', heat: 1, kx: m.f * 9 * heatK(), ky: -5, stun: 0.5, big: true });
          p.vy = -11; p.vx = -m.f * 3; p.onGround = false; S.airSide = false; S.atkCD = Math.min(S.atkCD, 0.15); return true;
        },
        land(p, m) { p.vx = m.f * 3; push({ k: 'dust', x: pcx(p), y: p.y + p.h, vx: -m.f, life: 0.3 }); } })),
      air_up: riseFlare(-14.5),
      air_down: dive({ name: 'Meteor Dive', big: 'EXTINCTION DIVE', cd: 0.7, vy: 24,
        touch(p, m) { for (const e of box(p, 1, -0.75, 0.75, 0.9, 0.5)) if (!m.hs.has(e)) { m.hs.add(e); hit(e, D(m, 1.5), { el: 'burn', heat: 1, kx: 0, ky: 14, stun: 0.4, big: true }); } fire(pcx(p), p.y, 0.5); },
        land(p, m) {
          const r = R(m, 2);
          for (const e of circ(pcx(p), p.y + p.h - 0.4, r)) hit(e, D(m, 2.5), { el: 'burn', kx: away(e, p, m.f) * 6, ky: -10 * heatK(), stun: 0.6, big: true, shake: 8 });
          push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: r, c: FORMS[0].c, life: 0.4 }); push({ k: 'burst', x: pcx(p), y: p.y + p.h - 0.3, c: FORMS[0].g, R: r, life: 0.3 });
          zone({ k: 'fire', x: pcx(p), y: p.y + p.h, r: 0.9, life: 1.5 }); FK.thud(true); FK.shake(8);
        } }),
    },
    frost: {
      ground_neutral: { name: 'Icicle Fan', big: 'ICICLE STORM', cd: 0.42, dur: 0.16, pose: 'cast',
        ev: [[0, (p, m) => {
          const n = m.pw > 0.3 ? 5 : 3, mo = mouth(p, m.f);
          for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.13; shot({ k: 'shard', x: mo[0], y: mo[1] + 0.1, vx: m.f * 15 * Math.cos(a), vy: 15 * Math.sin(a), life: 0.55, r: 0.22, dmg: D(m, 0.8), el: 'chill', n: 1, kx: m.f * 2, ky: -2 }); }
          p.vx = -m.f * 2; FK.noise({ dur: 0.1, cut: 5200, cutEnd: 2600, q: 3, vol: 0.14 }); FK.tone(1700, { dur: 0.08, vol: 0.07, type: 'sine' });
        }]] },
      ground_side: { name: 'Glacier Lance', big: 'GLACIER CANNON', cd: 0.6, dur: 0.28, pose: 'thrust', w: 0.09,
        ev: [[0, (p, m) => {
          const mo = mouth(p, m.f);
          shot({ k: 'lance', x: mo[0], y: pcy(p), vx: m.f * 27, vy: 0, life: R(m, 0.33), r: 0.3, pierce: 9, dmg: D(m, 2), el: 'chill', n: 1, kx: m.f * 7, ky: -4, stun: 0.5, big: true });
          p.vx = -m.f * 4; FK.whoosh(false, true); FK.tone(900, { dur: 0.16, slide: 2200, vol: 0.12, type: 'sine' });
        }]] },
      ground_up: { name: 'Hailstorm', big: 'BLIZZARD', cd: 0.75, dur: 0.3, pose: 'raise', w: 0.06,
        ev: [[0, (p, m) => {
          let tx = pcx(p) + m.f * 3.5, ty = p.y + p.h, bd = 7.5;
          for (const e of box(p, m.f, 0.5, 7.5, 3.5)) { const d = Math.abs(ex(e) - pcx(p)); if (d < bd) { bd = d; tx = ex(e); ty = e.y + (e.h || 0.9); } }
          const n = m.pw > 0.3 ? 8 : 5;
          for (let i = 0; i < n; i++) shot({ k: 'hail', x: tx + (i - (n - 1) / 2) * (2.6 / n) + rnd(-0.15, 0.15), y: ty - 5.2, vx: m.f * 1.5, vy: 17, delay: i * 0.07, life: 0.6, r: 0.3, dmg: D(m, 0.9), el: 'chill', n: 1, kx: 0, ky: 4, gy: ty - 1 });
          push({ k: 'cloud', x: tx, y: ty - 5.2, life: 0.8 }); FK.noise({ dur: 0.5, cut: 3200, q: 1, vol: 0.12 });
        }]] },
      ground_down: { name: 'Ice Wall', big: 'GLACIER', cd: 0.6, dur: 0.24, pose: 'slam', w: 0.05,
        ev: [[0.04, (p, m) => {
          const old = S.zones.find(z => z.k === 'wall' && z.life > z.t);
          if (old) {   // already standing: break it into shards
            old.life = 0; m.title = 'SHATTER';
            for (const e of circ(old.x, old.y - old.h / 2, 1.7)) hit(e, D(m, 2), { el: 'chill', n: 2, kx: (ex(e) > old.x ? 1 : -1) * 8, ky: -7, stun: 0.5, big: true });
            for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i - 3.5) * 0.42; shot({ k: 'shard', x: old.x, y: old.y - old.h * 0.6, vx: Math.cos(a) * 13 + (i < 4 ? -4 : 4), vy: Math.sin(a) * 9, g: 22, life: 0.8, r: 0.22, dmg: 0.8, el: 'chill', n: 1 }); }
            push({ k: 'shards', x: old.x, y: old.y - old.h / 2, n: 14, c: FORMS[1].g, life: 0.5 }); FK.noise({ dur: 0.25, cut: 5200, q: 3, vol: 0.24 }); FK.shake(5);
            return;
          }
          let x = pcx(p) + m.f * 1.3; if (FK.blocked(x - 0.3, p.y, 0.6, p.h - 0.1)) x = pcx(p) + m.f * 0.6;
          const h = R(m, 2.3), z = zone({ k: 'wall', x, y: p.y + p.h, h, life: 4.5, tk: 0.35 });
          for (const e of FK.foes()) if (Math.abs(ex(e) - x) < 0.7 + (e.w || 0.9) / 2 && ey(e) > z.y - h - 0.4 && e.y < z.y + 0.2) hit(e, D(m, 1.5), { el: 'chill', n: 2, kx: m.f * 2, ky: -13, stun: 0.5, big: true });
          FK.tone(500, { dur: 0.2, slide: 1500, vol: 0.14, type: 'sine' }); FK.noise({ dur: 0.15, cut: 4200, q: 2, vol: 0.14 });
        }]] },
      air_neutral: { name: 'Snow Burst', big: 'WHITEOUT', cd: 0.55, dur: 0.2, pose: 'burst', root: false,
        ev: [[0, (p, m) => {
          const r = R(m, 1.9);
          for (const e of circ(pcx(p), pcy(p), r)) hit(e, D(m, 1.2), { el: 'chill', n: 2, kx: away(e, p, m.f) * 6, ky: -5, stun: 0.4, big: true });
          push({ k: 'burst', x: pcx(p), y: pcy(p), c: FORMS[1].g, R: r, life: 0.35 }); push({ k: 'shards', x: pcx(p), y: pcy(p), n: 12, c: WHITE, life: 0.45 });
          if (!S.airHop) { S.airHop = true; p.vy = Math.min(p.vy, -6); }
          FK.noise({ dur: 0.25, cut: 2600, cutEnd: 5200, q: 1, vol: 0.2 });
        }]] },
      air_side: { name: 'Frost Glide', big: 'AURORA GLIDE', cd: 0.5, dur: 0.24, pose: 'rush', root: false, once: 'side',
        start(p, m) { m.left = R(m, 4.2); m.sp = m.left / 0.22; FK.whoosh(false, true); FK.tone(1300, { dur: 0.22, slide: 2100, vol: 0.08, type: 'sine' }); },
        move(p, m, dt) {
          const st = Math.min(m.left, m.sp * dt); m.left -= st;
          const ok = slide(p, m.f * st, 0); p.vx = 0; p.vy = 0;
          for (const e of box(p, m.f, -0.6, 0.6, 0.9)) if (!m.hs.has(e)) { m.hs.add(e); hit(e, D(m, 1.2), { el: 'chill', n: 2, kx: m.f * 3, ky: -6, stun: 0.4 }); }
          m.acc = (m.acc || 0) + st; if (m.acc > 0.9) { m.acc = 0; zone({ k: 'frost', x: pcx(p), y: p.y + p.h + 0.2, r: 0.7, life: 1.3 }); }
          ghost(p);
          if (!ok || m.left <= 0) { p.vx = m.f * 5; return true; }
        } },
      air_up: { name: 'Glacier Hop', big: 'GLACIER VAULT', cd: 0.55, dur: 0.22, pose: 'upper', root: false, once: 'up',
        start(p, m) {
          p.vy = -15.5 - 2 * m.pw; p.onGround = false;
          shot({ k: 'block', x: pcx(p), y: p.y + p.h + 0.3, vx: 0, vy: 4, g: 30, life: 1.4, r: 0.5, dmg: D(m, 1.8), el: 'chill', n: 2, kx: 0, ky: 12, big: true, splash: { r: 1.2, dmg: 0.8, el: 'chill', n: 1, again: false } });
          push({ k: 'ring', x: pcx(p), y: p.y + p.h, R: 0.9, c: FORMS[1].g, life: 0.25 }); FK.whoosh(true, true); FK.tone(700, { dur: 0.15, slide: 1600, vol: 0.1, type: 'sine' });
        }, ev: [] },
      air_down: { name: 'Icicle Drop', big: 'STALACTITE', cd: 0.55, dur: 0.18, pose: 'slam', root: false,
        ev: [[0, (p, m) => {
          shot({ k: 'icicle', x: pcx(p), y: p.y + p.h + 0.2, vx: 0, vy: 22, life: 1.2, r: R(m, 0.4), dmg: D(m, 2), el: 'chill', n: 2, kx: 0, ky: 10, stun: 0.5, big: true, splash: { r: 1.3, dmg: 1, el: 'chill', n: 1 } });
          if (!S.airHop) { S.airHop = true; p.vy = Math.min(p.vy, -7); }
          FK.tone(1500, { dur: 0.12, slide: 600, vol: 0.1, type: 'sine' });
        }]] },
    },
    venom: {
      ground_neutral: { name: 'Tail Whip', big: 'VIPER WHIP', cd: 0.45, dur: 0.3, pose: 'tail',
        ev: [[0.05, (p, m) => {
          const r = R(m, 1.8);
          for (const e of box(p, 1, -r, r, 0.85)) hit(e, D(m, 1.4), { el: 'poison', n: 1, kx: away(e, p, m.f) * 6, ky: -5, stun: 0.4, big: true });
          push({ k: 'whip', R: r, f: m.f, life: 0.24 }); FK.whoosh(false, true);
        }]] },
      ground_side: { name: 'Tongue Lash', big: 'DEVOUR', cd: 0.55, dur: 1, pose: 'tongue', hold: true, w: 0.05,
        start(p, m) { m.len = 0; m.ph = 0; m.max = R(m, 4.6); FK.noise({ dur: 0.1, cut: 800, cutEnd: 2600, q: 2, vol: 0.14 }); },
        move(p, m, dt) {
          const mo = mouth(p, m.f);
          if (m.ph === 0) {
            m.len = Math.min(m.max, m.len + 36 * dt);
            const tx = mo[0] + m.f * m.len, e = circ(tx, mo[1], 0.4)[0];
            if (e) { m.tg = e; m.ph = canDrag(e) ? 1 : 2; m.t1 = m.t; hit(e, D(m, 0.8), { el: 'poison', n: 1, kx: 0, ky: -1, stun: 0.5 }); }
            else if (FK.blocked(tx - 0.1, mo[1] - 0.1, 0.2, 0.2)) { m.ph = 2; m.t1 = m.t; m.wx = tx; FK.smack(false); }
            else if (m.len >= m.max) m.ph = 3;
          } else if (m.ph === 1) {   // reel them in, then bite
            const e = m.tg; if (!e || e.dead) { S.tongue = null; return true; }
            drag(e, pcx(p) + m.f * 1.0, pcy(p), 24, dt); e.stunTimer = Math.max(e.stunTimer || 0, 0.2);
            m.len = Math.max(0.2, Math.abs(ex(e) - mo[0]));
            if (Math.abs(ex(e) - pcx(p)) < 1.35 || m.t - m.t1 > 0.3) { chomp(p, m, e); S.tongue = null; return true; }
          } else if (m.ph === 2) {   // a wall (or something too heavy to pull): go to it
            const tx = m.tg ? ex(m.tg) : m.wx, d = (tx - pcx(p)) * m.f - 0.8;
            const ok = d > 0.05 && slide(p, m.f * Math.min(d, 24 * dt), 0); p.vx = 0; p.vy = 0; ghost(p, FORMS[2].c);
            m.len = Math.max(0.1, Math.abs(tx - mouth(p, m.f)[0]));
            if (!ok || m.t - m.t1 > 0.35) { if (m.tg && !m.tg.dead) chomp(p, m, m.tg); else { p.vy = -7; p.onGround = false; } S.tongue = null; return true; }
          } else { m.len -= 44 * dt; if (m.len <= 0) { S.tongue = null; return true; } }
          const mo2 = mouth(p, m.f); S.tongue = { x1: mo2[0], y1: mo2[1], x2: mo2[0] + m.f * m.len, y2: mo2[1] };
        } },
      ground_up: { name: 'Acid Mortar', big: 'ACID RAIN', cd: 0.65, dur: 0.22, pose: 'spit', w: 0.06,
        ev: [[0, (p, m) => {
          const mo = mouth(p, m.f), n = m.pw > 0.3 ? 3 : 1;
          for (let i = 0; i < n; i++) shot({ k: 'glob', x: mo[0], y: mo[1], vx: m.f * (4.6 + i * 2.2), vy: -13, g: 27, life: 2.2, r: 0.33, dmg: D(m, 1.2), el: 'poison', n: 2, kx: 0, ky: -5, splash: { r: 1.3, dmg: 0.6, el: 'poison', n: 1, zone: { k: 'acid', r: 1.1, life: 3, tk: 0.5 } } });
          FK.noise({ dur: 0.12, cut: 700, cutEnd: 1500, q: 2, vol: 0.2 });
        }]] },
      ground_down: { name: 'Vanish Strike', big: 'ASSASSINATE', cd: 0.8, dur: 0.42, pose: 'stab', root: false,
        start(p, m) { S.invis = 0.2; p.dashInvuln = Math.max(p.dashInvuln || 0, 0.34); push({ k: 'burst', x: pcx(p), y: pcy(p), c: FORMS[2].c, R: 0.8, life: 0.25 }); FK.noise({ dur: 0.18, cut: 3200, cutEnd: 600, q: 1, vol: 0.12 }); },
        ev: [[0.18, (p, m) => {
          let b = null, bd = R(m, 5.2);
          for (const e of FK.foes()) { const d = Math.hypot(ex(e) - pcx(p), ey(e) - pcy(p)); if (d < bd && Math.abs(ey(e) - pcy(p)) < 2.5) { bd = d; b = e; } }
          if (b) {   // reappear on their far side, facing them
            const sd = away(b, p, m.f), w = b.w || 0.9;
            for (const off of [sd * (w / 2 + 0.75), -sd * (w / 2 + 0.75)]) {
              const nx = ex(b) + off - p.w / 2, ny = b.y + (b.h || 0.9) - p.h - 0.02;
              if (!FK.blocked(nx, ny, p.w, p.h - 0.05)) { p.x = nx; p.y = ny; m.f = off > 0 ? -1 : 1; S.selfMove = true; break; }
            }
          } else slide(p, m.f * 2.5, 0);
          p.dashDir = m.f; p.lastMoveDir = m.f; p.vx = 0; p.vy = Math.min(p.vy, 0); S.invis = 0;
          push({ k: 'burst', x: pcx(p), y: pcy(p), c: FORMS[2].a, R: 0.8, life: 0.25 });
        }], [0.24, (p, m) => {
          for (const e of box(p, m.f, -0.3, R(m, 1.9), 0.95)) hit(e, D(m, 2), { el: 'poison', n: 1, rupture: true, kx: m.f * 8, ky: -6, stun: 0.6, big: true, shake: 7 });
          sl(p, m, FORMS[2].a, 0, 1.7); FK.whoosh(false, true);
        }]] },
      air_neutral: { name: 'Spore Burst', big: 'MIASMA', cd: 0.6, dur: 0.2, pose: 'burst', root: false,
        ev: [[0, (p, m) => {
          const r = R(m, 1.6);
          for (const e of circ(pcx(p), pcy(p), r)) hit(e, D(m, 0.8), { el: 'poison', n: 1, kx: away(e, p, m.f) * 3, ky: -3, stun: 0.3 });
          zone({ k: 'spore', x: pcx(p), y: pcy(p), r, life: 2.6 + m.pw, tk: 0.4 });
          if (!S.airHop) { S.airHop = true; p.vy = Math.min(p.vy, -5); }
          FK.noise({ dur: 0.3, cut: 500, cutEnd: 1600, q: 1, vol: 0.18 });
        }]] },
      air_side: { name: 'Zip Kick', big: 'VIPER ZIP', cd: 0.5, dur: 0.6, pose: 'kick', root: false, hold: true, once: 'side',
        start(p, m) {
          let b = null, bd = R(m, 5.8);
          for (const e of FK.foes()) { const dx = (ex(e) - pcx(p)) * m.f, d = Math.hypot(dx, ey(e) - pcy(p)); if (dx > 0.2 && d < bd && Math.abs(ey(e) - pcy(p)) < 3.2) { bd = d; b = e; } }
          m.tg = b; m.tx = pcx(p) + m.f * 4.2; m.ty = pcy(p); FK.noise({ dur: 0.1, cut: 800, cutEnd: 2600, q: 2, vol: 0.14 });
        },
        move(p, m, dt) {
          if (m.tg && !m.tg.dead) { m.tx = ex(m.tg); m.ty = ey(m.tg); }
          const dx = m.tx - pcx(p), dy = m.ty - pcy(p), d = Math.hypot(dx, dy) || 1, mo = mouth(p, m.f);
          S.tongue = { x1: mo[0], y1: mo[1], x2: m.tx, y2: m.ty };
          const e = m.tg && d < 1.0 ? m.tg : null;
          if (e) { hit(e, D(m, 1.8), { el: 'poison', n: 1, kx: m.f * 8, ky: -6, stun: 0.5, big: true }); p.vy = -11; p.vx = -m.f * 2; p.onGround = false; S.airSide = false; S.tongue = null; return true; }
          const st = Math.min(d, 25 * dt), ok = slide(p, dx / d * st, dy / d * st); p.vx = 0; p.vy = 0; ghost(p);
          if (!ok || d < 0.3 || m.t > 0.4) { p.vx = m.f * 5; p.vy = -4; S.tongue = null; return true; }
        } },
      air_up: { name: 'Tongue Hoist', big: 'SKY HOOK', cd: 0.55, dur: 0.26, pose: 'upper', root: false, once: 'up',
        start(p, m) {
          p.vy = -16 - 2 * m.pw; p.onGround = false; m.y0 = p.y;
          for (const e of box(p, 1, -0.7, 0.7, 2.4, -2.2)) hit(e, D(m, 1.2), { el: 'poison', n: 1, kx: 0, ky: -10, stun: 0.4 });
          FK.whoosh(true, true);
        },
        move(p, m) { const mo = mouth(p, m.f), u = Math.min(1, m.t / 0.1); S.tongue = m.t < 0.22 ? { x1: mo[0], y1: mo[1], x2: mo[0], y2: Math.min(mo[1], m.y0 - 4.2 * u) } : null; },
        ev: [] },
      air_down: dive({ name: 'Fang Dive', big: 'COBRA DIVE', cd: 0.5, vy: 22, vx: 2, pose: 'dive',
        touch(p, m) {
          const e = box(p, 1, -0.7, 0.7, 0.8, 0.5)[0]; if (!e) return false;
          hit(e, D(m, 1.6), { el: 'poison', n: 1, rupture: true, kx: m.f * 2, ky: 9, stun: 0.5, big: true });
          p.vy = -12.5; p.vx = 0; p.onGround = false; S.airUp = false; S.airSide = false; S.atkCD = Math.min(S.atkCD, 0.12); return true;   // pogo: the air moves come back
        },
        land(p, m) { for (const e of circ(pcx(p), p.y + p.h - 0.3, R(m, 1.3))) hit(e, D(m, 1), { el: 'poison', n: 1, kx: away(e, p, m.f) * 4, ky: -7, stun: 0.4 }); push({ k: 'burst', x: pcx(p), y: p.y + p.h - 0.2, c: FORMS[2].c, R: 1.3, life: 0.3 }); FK.thud(false); } }),
    },
    volt: {
      ground_neutral: { name: 'Spark Jabs', big: 'STORM FISTS', cd: 0.38, dur: 0.28, pose: 'jab',
        ev: [0, 0.06, 0.12, 0.2].map((t, i) => [t, (p, m) => {
          const last = i === 3, zs = box(p, m.f, -0.2, R(m, 1.8), 0.9);
          for (const e of zs) hit(e, D(m, last ? 1.2 : 0.5), { el: 'static', kx: m.f * (last ? 7 : 0.8), ky: last ? -5 : -1, stun: 0.3, big: last });
          if (zs.length) { let b = null, bd = 3.2; for (const e of FK.foes()) { const d = Math.hypot(ex(e) - ex(zs[0]), ey(e) - ey(zs[0])); if (zs.indexOf(e) < 0 && d < bd) { bd = d; b = e; } } if (b) { hit(b, 0.3, { el: 'static', kx: 0, ky: -1 }); push({ k: 'bolt', x1: ex(zs[0]), y1: ey(zs[0]), x2: ex(b), y2: ey(b), life: 0.14 }); } }
          push({ k: 'jab', x: pcx(p) + m.f * (1.0 + 0.15 * (i % 2)), y: pcy(p) + (i % 2 ? 0.18 : -0.14), f: m.f, L: R(m, 1.1), life: 0.1 });
          FK.noise({ dur: 0.04, cut: 5600, q: 3, vol: 0.1 }); FK.tone(900 + i * 160, { dur: 0.04, vol: 0.06, type: 'square' });
        }]) },
      ground_side: { name: 'Bolt Blink', big: 'THUNDERCLAP BLINK', cd: 0.55, dur: 0.14, pose: 'rush', root: false,
        ev: [[0, (p, m) => { blink(p, m, m.f * R(m, 5), 0, D(m, 1.8), { kx: 0, ky: -8, stun: 0.5, big: true }); }]] },
      ground_up: { name: 'Thunder Call', big: 'JUDGEMENT', cd: 0.8, dur: 0.34, pose: 'raise', w: 0.08,
        ev: [[0, (p, m) => {
          const marked = FK.foes().filter(e => e._chStatic > 0 && Math.hypot(ex(e) - pcx(p), ey(e) - pcy(p)) < 11).slice(0, 4);
          let list = marked;
          if (!list.length) { let b = null, bd = 7; for (const e of box(p, m.f, -1, 7, 4)) { const d = Math.abs(ex(e) - pcx(p)); if (d < bd) { bd = d; b = e; } } list = b ? [b] : [null]; }
          if (marked.length > 1) FK.label(S, p, 'CHAIN x' + marked.length, FORMS[3].a, true);
          list.forEach((e, i) => {
            const x0 = e ? ex(e) : pcx(p) + m.f * 3, y0 = e ? ey(e) : pcy(p), dmg = D(m, 2.2);
            push({ k: 'mark', x: x0, y: y0, e, life: 0.2 + i * 0.07 });
            S.timers.push({ t: 0.2 + i * 0.07, fn: () => strike(e && !e.dead ? ex(e) : x0, e && !e.dead ? ey(e) : y0, e, dmg) });
          });
          FK.tone(300, { dur: 0.25, slide: 1200, vol: 0.1, type: 'sawtooth' });
        }]] },
      ground_down: { name: 'Tesla Orb', big: 'TESLA CORE', cd: 0.6, dur: 0.2, pose: 'slam',
        ev: [[0.03, (p, m) => {
          const orbs = S.zones.filter(z => z.k === 'orb'); if (orbs.length >= 2) orbs[0].life = 0;
          zone({ k: 'orb', x: pcx(p) + m.f * 0.7, y: pcy(p) - 0.1, life: 5.5 + 2 * m.pw, tk: m.pw > 0.3 ? 0.4 : 0.6, tt: 0.3 });
          FK.tone(600, { dur: 0.2, slide: 1500, vol: 0.1, type: 'square' });
        }]] },
      air_neutral: { name: 'Ball Lightning', big: 'STORM CELL', cd: 0.6, dur: 0.18, pose: 'cast', root: false,
        ev: [[0, (p, m) => {
          const mo = mouth(p, m.f);
          shot({ k: 'ball', x: mo[0], y: pcy(p), vx: m.f * 7, vy: 0, home: 7.5, life: 2.4, r: R(m, 0.45), dmg: D(m, 0.5), el: 'static', zap: m.pw > 0.3 ? 6 : 4, ghost: true, splash: { r: 1.1, dmg: D(m, 1), el: 'static', again: true, ky: -7, big: true } });
          if (!S.airHop) { S.airHop = true; p.vy = Math.min(p.vy, -4); }
          FK.tone(500, { dur: 0.18, slide: 900, vol: 0.1, type: 'square' });
        }]] },
      air_side: { name: 'Arc Dash', big: 'ARC STORM', cd: 0.45, dur: 0.12, pose: 'rush', root: false, once: 'side',
        ev: [[0, (p, m) => { if (blink(p, m, m.f * R(m, 4.2), 0, D(m, 1.5), { kx: m.f * 3, ky: -7, stun: 0.4, big: true })) { S.airSide = false; S.atkCD = Math.min(S.atkCD, 0.15); } p.vy = -3; }]] },
      air_up: { name: 'Sky Blink', big: 'STORM ASCENT', cd: 0.55, dur: 0.14, pose: 'upper', root: false, once: 'up',
        ev: [[0, (p, m) => {
          for (const e of circ(pcx(p), pcy(p), 1.3)) { m.hs.add(e); hit(e, D(m, 1.4), { el: 'static', kx: 0, ky: -9, stun: 0.4 }); }
          blink(p, m, 0, -R(m, 4.6), D(m, 1.4), { kx: 0, ky: -9, stun: 0.4 });
          for (const e of circ(pcx(p), pcy(p), 1.3)) if (!m.hs.has(e)) hit(e, D(m, 1.4), { el: 'static', kx: away(e, p, m.f) * 4, ky: -8, stun: 0.4 });
          p.vy = -5; p.onGround = false;
        }]] },
      air_down: { name: 'Thunder Drop', big: 'WRATH OF THE STORM', cd: 0.7, dur: 0.3, pose: 'slam', root: false, hold: true,
        start(p, m) { m.d = floorBelow(p, 14); },
        move(p, m, dt) {
          if (m.d < 0) {   // nothing below (off the stage): just fall fast
            p.vy = 26; p.vx = 0; for (const e of box(p, 1, -0.7, 0.7, 0.9, 0.5)) if (!m.hs.has(e)) { m.hs.add(e); hit(e, D(m, 1.6), { el: 'static', kx: 0, ky: 12, stun: 0.4, big: true }); }
            if (!(p.onGround && m.t > 0.03)) return m.t > 0.8;
          } else if (!m.done) {
            const x0 = pcx(p), y0 = pcy(p); ghost(p, FORMS[3].g); p.y += m.d; S.selfMove = true; p.vy = 2; p.vx = 0;
            zapLine(x0, y0 - 0.5, x0, pcy(p), D(m, 1.6), { kx: 0, ky: 12, stun: 0.4, big: true }, m); push({ k: 'strike', x: x0, y: p.y + p.h, life: 0.3, from: y0 });
          } else return m.t > 0.12;
          m.done = true; m.t = 0;
          const r = R(m, 3.2);
          for (const e of box(p, 1, -r, r, 0.9)) hit(e, D(m, 1.4), { el: 'static', kx: away(e, p, m.f) * 5, ky: -9, stun: 0.5, big: true });
          push({ k: 'wave', x: pcx(p), y: p.y + p.h, R: r, life: 0.3 }); push({ k: 'shock', x: pcx(p), y: p.y + p.h, R: r * 0.7, c: FORMS[3].c, life: 0.35 });
          FK.thud(true); FK.shake(7); FK.noise({ dur: 0.25, cut: 5000, cutEnd: 700, q: 1, vol: 0.25 });
          if (m.d < 0) return true;
        }, ev: [] },
    },
    lumen: {
      ground_neutral: { name: 'Radiant Palm', big: 'SUNBURST PALM', cd: 0.4, dur: 0.36, pose: 'jab',
        ev: [0, 0.11, 0.23].map((t, i) => [t, (p, m) => {
          const last = i === 2, r = R(m, 1.8); slide(p, m.f * 0.18, 0);
          for (const e of box(p, m.f, -0.3, r, 0.95)) hit(e, D(m, last ? 1.5 : 0.6), { el: 'light', kx: m.f * (last ? 7 : 1.2), ky: last ? -6 : -1, stun: 0.35, big: last });
          push({ k: 'burst', x: pcx(p) + m.f * (0.9 + 0.2 * i), y: pcy(p) + (i === 1 ? 0.15 : -0.1), c: last ? GOLD : WHITE, R: last ? 0.95 : 0.55, life: 0.2 });
          FK.whoosh(false, last); FK.tone(880 + i * 220, { dur: 0.07, vol: 0.07, type: 'sine' });
        }]) },
      ground_side: { name: 'Siphon Beam', big: 'SOUL SIPHON', cd: 0.65, dur: 0.3, pose: 'thrust', w: 0.09,
        ev: [[0, (p, m) => {
          const mo = mouth(p, m.f), y = pcy(p), max = R(m, 6); let L = 0.4;
          while (L < max && !FK.blocked(mo[0] + m.f * L - 0.1, y - 0.1, 0.2, 0.2)) L += 0.25;
          let n = 0, got = 0;
          for (const e of box(p, m.f, 0.2, L + 0.3, 0.55)) { hit(e, D(m, 1.6), { el: null, kx: m.f * 3, ky: -4, stun: 0.45, big: true }); if (n++ < 2) got += 0.7 + reap(e); drain(e, p); }
          if (got) heal(p, got * (1 + 0.4 * m.pw));
          push({ k: 'beam', x: mo[0], y, f: m.f, L, life: 0.26 });
          p.vx = -m.f * 2; FK.tone(1320, { dur: 0.22, slide: 660, vol: 0.1, type: 'sine' }); FK.noise({ dur: 0.18, cut: 4200, cutEnd: 1500, q: 2, vol: 0.12 });
        }]] },
      ground_up: { name: 'Halo Rise', big: 'HALO ASCENDANT', cd: 0.6, dur: 0.3, pose: 'raise', w: 0.05,
        ev: [[0.03, (p, m) => {
          const r = R(m, 1.4);
          for (const e of box(p, 1, -r, r, 1.7, -0.7)) hit(e, D(m, 2), { el: 'light', kx: away(e, p, m.f) * 2, ky: -14 - 2 * m.pw, stun: 0.5, big: true });
          push({ k: 'halo', x: pcx(p), y: p.y + p.h, R: r, H: 3, life: 0.35 });
          FK.whoosh(true, true); FK.tone(660, { dur: 0.2, slide: 1500, vol: 0.1, type: 'sine' });
        }]] },
      ground_down: { name: 'Sanctuary', big: 'CATHEDRAL', cd: 0.7, dur: 0.3, pose: 'slam', w: 0.06,
        ev: [[0.05, (p, m) => {
          const r = R(m, 2.1), x = pcx(p), y = p.y + p.h;
          for (const e of circ(x, y - 0.4, r)) hit(e, D(m, 1.2), { el: 'light', kx: away(e, p, m.f) * 6, ky: -7, stun: 0.45, big: true });
          push({ k: 'shock', x, y, R: r, c: GOLD, life: 0.4 }); FK.thud(false);
          if (S.sanct > 0) { m.title = 'RADIANT BURST'; FK.msg('⚪ Sanctuary is recharging (' + Math.ceil(S.sanct) + 's): burst only'); return; }
          for (const z of S.zones) if (z.k === 'sanct') z.life = 0;
          zone({ k: 'sanct', x, y, r, life: 4, tk: 0.5, tt: 0.25, pool: 2 * (1 + 0.4 * m.pw) }); S.sanct = 9;
          chime();
        }]] },
      air_neutral: { name: 'Halo Spin', big: 'CORONA', cd: 0.5, dur: 0.36, pose: 'spin', root: false,
        move(p) { p.vy = Math.min(p.vy, 2); },
        ev: [0, 0.09, 0.18, 0.3].map((t, i) => [t, (p, m) => {
          const last = i === 3, r = R(m, 1.4);
          for (const e of circ(pcx(p), pcy(p), r)) { hit(e, D(m, last ? 1.4 : 0.5), { el: 'light', kx: away(e, p, m.f) * (last ? 7 : -1), ky: last ? -7 : -2, stun: 0.3, big: last }); if (!last) drag(e, pcx(p) + away(e, p, m.f) * 0.8, pcy(p), 10, 0.06); }
          push({ k: 'wheel', R: r, a: i * 1.9 * m.f, f: m.f, c: i % 2 ? GOLD : WHITE, life: 0.16 }); FK.whoosh(i % 2 === 0, false);
        }]) },
      air_side: { name: 'Dove Dash', big: 'SERAPH RUSH', cd: 0.5, dur: 0.24, pose: 'rush', root: false, once: 'side',
        start(p, m) { m.left = R(m, 4.4); m.sp = m.left / 0.2; p.dashInvuln = Math.max(p.dashInvuln || 0, 0.2); FK.whoosh(false, true); FK.tone(990, { dur: 0.2, slide: 1760, vol: 0.08, type: 'sine' }); },
        move(p, m, dt) {
          const st = Math.min(m.left, m.sp * dt); m.left -= st;
          const ok = slide(p, m.f * st, 0); p.vx = 0; p.vy = 0;
          for (const e of box(p, m.f, -0.6, 0.6, 0.9)) if (!m.hs.has(e)) { m.hs.add(e); hit(e, D(m, 1.3), { el: null, kx: m.f * 3, ky: -7, stun: 0.4, big: true }); if (m.hs.size <= 2) heal(p, 0.6 + reap(e)); drain(e, p); }
          ghost(p, WHITE);
          if (!ok || m.left <= 0) { p.vx = m.f * 5; return true; }
        } },
      air_up: { name: 'Ascension', big: 'RAPTURE', cd: 0.55, dur: 0.3, pose: 'upper', root: false, once: 'up',
        start(p, m) { p.vy = -16 - 2 * m.pw; p.onGround = false; push({ k: 'halo', x: pcx(p), y: p.y + p.h, R: 0.9, H: 1.2, life: 0.3 }); FK.whoosh(true, true); FK.tone(784, { dur: 0.22, slide: 1568, vol: 0.09, type: 'sine' }); },
        move(p, m) { if (m.t < 0.22) { for (const e of box(p, 1, -0.9, 0.9, 1.1, -0.5)) if (!m.hs.has(e)) { m.hs.add(e); hit(e, D(m, 1.3), { el: 'light', kx: 0, ky: -11, stun: 0.4 }); } S.wings = 0.12; } },
        ev: [] },
      air_down: dive({ name: 'Benediction', big: 'GRACE', cd: 0.7, vy: 22,
        touch(p, m) { for (const e of box(p, 1, -0.7, 0.7, 0.9, 0.5)) if (!m.hs.has(e)) { m.hs.add(e); hit(e, D(m, 1.2), { el: null, kx: 0, ky: 12, stun: 0.4, big: true }); } },
        land(p, m) {
          const r = R(m, 2.2), x = pcx(p), y = p.y + p.h; let n = 0, got = 0;
          for (const e of circ(x, y - 0.4, r)) { hit(e, D(m, 2), { el: null, kx: away(e, p, m.f) * 5, ky: -9, stun: 0.5, big: true, shake: 7 }); if (n++ < 3) got += 0.4 + reap(e); drain(e, p); }
          if (got) heal(p, got);
          push({ k: 'shock', x, y, R: r, c: GOLD, life: 0.4 }); push({ k: 'halo', x, y, R: r * 0.8, H: 1.6, life: 0.35 }); FK.thud(true); FK.shake(6);
        } }),
    },
  };
  function chomp(p, m, e) {
    hit(e, D(m, 1.6), { el: 'poison', n: 1, rupture: true, kx: m.f * 4, ky: -10, stun: 0.5, big: true, shake: 6 });
    push({ k: 'bite', x: ex(e), y: ey(e), life: 0.22 }); FK.label(S, p, 'CHOMP!', FORMS[2].g, false);
  }
  const NOEV = [];
  function endMove(p) { S.mv = null; S.tongue = null; S.invis = 0; }
  function stepMove(p, dt) {
    const m = S.mv, sp = m.spec; m.t += dt;
    if (sp.move && sp.move(p, m, dt) === true) return endMove(p);
    const ev = sp.ev || NOEV;
    while (S.mv === m && m.i < ev.length && m.t >= ev[m.i][0]) ev[m.i++][1](p, m);
    if (S.mv === m && !sp.hold && m.t >= sp.dur) endMove(p);
  }

  // ---- the S button ----
  const fdOf = (sp, air) => ({ windup: sp.w == null ? 0.035 : sp.w, sweet: 0, active: Math.min(0.45, sp.dur), endlag: 0.07, chargeDmg: 0, root: sp.root !== false && !air, hang: false, quiet: true });
  const _prevSlash = window.performSlash;
  window.performSlash = function () {
    if (window.selectedCharacter !== ID) { if (_prevSlash) return _prevSlash.apply(this, arguments); return; }
    const p = P();
    if (!p || S.atkCD > 0 || S.mv) return;
    const pick = () => {
      const q = P(); if (!q || window.selectedCharacter !== ID || S.mv) return null;
      const k = FK.keys(), stance = (q.onGround || S.airT < 0.12) ? 'ground' : 'air';   // (↑ is also jump: ↑ + S from the floor is still the ground move)
      const dir = (k.down && !k.up) ? 'down' : (k.up && !k.down) ? 'up' : (k.left || k.right) ? 'side' : 'neutral';
      const key = stance + '_' + dir, sp = MV[form().id][key];
      if (sp.once === 'up' && S.airUp) { FK.msg(form().emoji + ' ' + sp.name + ' comes back when you land'); return null; }
      if (sp.once === 'side' && S.airSide) { FK.msg(form().emoji + ' ' + sp.name + ' comes back when you land or land a hit'); return null; }
      return { key, sp, air: stance === 'air', f: k.right ? 1 : k.left ? -1 : FK.face(q) };
    };
    const fire = (sel, pw) => {
      const q = P(); if (!q || S.mv) return;
      pw = pw || 0;
      const prism = S.prism > 0; if (prism) { pw = Math.max(pw, 0.5); S.prism = 0; }
      const sp = sel.sp, big = pw > 0.3;
      q.dashDir = sel.f; q.lastMoveDir = sel.f;
      const m = S.mv = { key: sel.key, spec: sp, pose: sp.pose, t: 0, f: sel.f, pw, i: 0, hs: new Set(), prism };
      S.atkCD = sp.cd;
      if (sp.once === 'up') S.airUp = true; if (sp.once === 'side') S.airSide = true;
      if (sp.start) sp.start(q, m);
      stepMove(q, 0);
      const name = m.title || (big ? sp.big : sp.name.toUpperCase());
      FK.label(S, q, (prism ? '✦ ' : '') + name, big ? form().g : form().c, big);
      FK.msg(form().emoji + ' ' + name + '!');
      if (prism) push({ k: 'prism', x: pcx(q), y: pcy(q), life: 0.35 });
    };
    if (window.PPStrike) {
      window.PPStrike.press(() => { const sel = pick(); return sel && { fd: fdOf(sel.sp, sel.air), dir: sel.f, color: form().c, aim: sel.key.split('_')[1], fire: pw => fire(sel, pw) }; }, true);
      return;
    }
    const sel = pick(); if (sel) fire(sel, 0);
  };
  if (window.UNIVERSAL_PUNCH_EXCLUDED_CHARS) window.UNIVERSAL_PUNCH_EXCLUDED_CHARS.add(ID);

  // ---- forms ----
  function cycleForm() {
    if (window.selectedCharacter !== ID || S.switchCD > 0) return;
    const p = P(); if (!p) return;
    if (S.mv && S.mv.spec.hold && !S.mv.done) return;                      // mid-dive / mid-tongue: finish it first
    if (S.mv) endMove(p);                                                 // SHIFT CANCEL: cut the rest of the move short
    if (window.PPStrike && window.PPStrike.phase() === 'endlag') window.PPStrike.cancelEndlag();
    S.atkCD = Math.min(S.atkCD, 0.05);
    S.form = (S.form + 1) % FORMS.length;
    S.switchCD = has('cr1') ? 0.5 : 1.0;
    S.prism = has('cr2') ? 3.0 : 2.0; S.shiftT = 0.3;
    const f = form();
    for (const e of circ(pcx(p), pcy(p), 1.5)) hit(e, 1, { kx: away(e, p, 1) * 6, ky: -5, stun: 0.3 });
    push({ k: 'ring', x: pcx(p), y: pcy(p), R: 1.5, c: f.c, life: 0.3 }); push({ k: 'prism', x: pcx(p), y: pcy(p), life: 0.4 });
    FK.label(S, p, f.name.toUpperCase() + '!', f.g, true);
    FK.msg(f.emoji + ' ' + f.name.toUpperCase() + ' FORM! Next move is a PRISM move');
    FK.tone(520 + S.form * 130, { dur: 0.12, vol: 0.12 }); FK.tone(780 + S.form * 195, { dur: 0.16, vol: 0.1, delay: 0.05 });
  }
  window.addEventListener('keydown', e => { if (e.key === '0' && !e.repeat && !window._fighterPass) cycleForm(); });
  if (!document.getElementById('chamStyle')) {
    const sty = document.createElement('style'); sty.id = 'chamStyle';
    sty.textContent = '#chamFormBtn{position:absolute;top:136px;right:16px;z-index:100;width:50px;height:50px;border-radius:50%;border:2px solid #fff;display:none;align-items:center;justify-content:center;cursor:pointer;font-size:22px;box-shadow:0 0 18px rgba(255,255,255,.4);transition:transform .18s}' +
      '#chamFormBtn:active{transform:scale(.9)}#chamFormBtn.on-cooldown{opacity:.5}#chamFormBtn.prism{animation:chamPrism .5s infinite}' +
      '@keyframes chamPrism{0%,100%{box-shadow:0 0 10px #fff}50%{box-shadow:0 0 26px #fff,0 0 40px #ff7bd5}}' +
      '@media (max-width:480px){#chamFormBtn{transform:scale(.85)}}@media (max-height:500px){#chamFormBtn{top:98px;transform:scale(.8)}}';
    document.head.appendChild(sty);
  }
  let btn = null;
  function formBtn() {
    if (btn) return btn;
    btn = document.createElement('button'); btn.id = 'chamFormBtn'; btn.title = 'Switch Form (0)';
    const go = ev => { ev.preventDefault(); cycleForm(); };
    btn.addEventListener('click', go); btn.addEventListener('touchstart', go, { passive: false });
    document.body.appendChild(btn); return btn;
  }
  let btnKey = '';
  function syncBtn(show) {
    const b = formBtn(), nx = FORMS[(S.form + 1) % FORMS.length], f = form();
    const key = show ? f.id + (S.switchCD > 0 ? 'c' : '') + (S.prism > 0 ? 'p' : '') : 'off';
    if (key === btnKey) return; btnKey = key;
    b.style.display = show ? 'flex' : 'none'; if (!show) return;
    b.textContent = f.emoji; b.style.background = 'linear-gradient(135deg,' + f.c + ',' + nx.c + ')';
    b.classList.toggle('on-cooldown', S.switchCD > 0); b.classList.toggle('prism', S.prism > 0);
  }

  // each form moves differently too
  const PHYS = { ember: { speed: 5.5, jumpForce: -12.5, dashDist: 3.6 }, frost: { speed: 5.0, jumpForce: -13.2, dashDist: 3.4 }, venom: { speed: 5.3, jumpForce: -12.8, dashDist: 3.8 }, volt: { speed: 6.3, jumpForce: -12.3, dashDist: 4.2 }, lumen: { speed: 5.4, jumpForce: -13.0, dashDist: 3.6 } };
  const _origPhys = window.cboxCharPhysics;
  window.cboxCharPhysics = function (charId, player, keys, dt) {
    if (charId !== ID) return _origPhys ? _origPhys(charId, player, keys, dt) : null;
    if (player) { player.punchTimer = 0; player.punchCooldown = Math.max(player.punchCooldown || 0, 0.1); }
    const ph = PHYS[form().id];
    return { speed: ph.speed + (S.prism > 0 ? 0.7 : 0), jumpForce: ph.jumpForce, dashDist: ph.dashDist, dashes: 2 };
  };

  // ---- per-frame update ----
  function step(dt) {
    const playing = window.selectedCharacter === ID && (!window._gameMode || window._gameMode() === 'play');
    if (!playing) { if (S.active) S = fresh(); return; }
    const p = P(); if (!p) return;
    if (!S.active) { const keep = S.fx, fm = S.form; S = fresh(); S.fx = keep; S.form = fm; S.active = true; }
    S.clock = (S.clock || 0) + dt;
    if (S.lastPX != null && !S.selfMove && (Math.abs(p.x - S.lastPX) > 4 || Math.abs(p.y - S.lastPY) > 4)) endMove(p);   // respawned or teleported
    S.selfMove = false;
    for (const k of ['atkCD', 'switchCD', 'prism', 'shiftT', 'invis', 'healT', 'sanct', 'wings']) if (S[k] > 0) S[k] = Math.max(0, S[k] - dt);
    if (S.heatT > 0) { S.heatT -= dt; if (S.heatT <= 0 && S.heat > 0) { S.heat--; S.heatT = 0.5; } }
    S.airT = p.onGround ? 0 : S.airT + dt;
    if (p.onGround) { S.airUp = false; S.airSide = false; S.airHop = false; }
    if (S.mv && p.hitstun > 0) endMove(p);
    if (S.mv) stepMove(p, dt);
    for (let i = S.timers.length - 1; i >= 0; i--) { const tm = S.timers[i]; tm.t -= dt; if (tm.t <= 0) { S.timers.splice(i, 1); try { tm.fn(); } catch (e) { oops(e); } } }
    stepShots(p, dt); stepZones(p, dt); stepMarks(dt);
    for (let i = S.fx.length - 1; i >= 0; i--) { const f = S.fx[i]; f.t += dt; if (f.t >= f.life + (f.delay || 0)) S.fx.splice(i, 1); }
    if (S.fx.length > 110) S.fx.splice(0, S.fx.length - 110);
    S.busy = !!S.mv; S.lastPX = p.x; S.lastPY = p.y;
  }
  (window._rafHubTickers = window._rafHubTickers || []).push(function (dt) { step(dt); syncBtn(window.selectedCharacter === ID && S.active); });

  // ---- drawing: the world ----
  const zig = (ctx, x1, y1, x2, y2, n, amp) => { ctx.beginPath(); ctx.moveTo(x1, y1); for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(x1 + (x2 - x1) * u + (Math.random() - 0.5) * amp, y1 + (y2 - y1) * u + (Math.random() - 0.5) * amp); } ctx.lineTo(x2, y2); ctx.stroke(); };
  const rainbow = (i, t) => 'hsl(' + ((i * 55 + t * 420) % 360) + ',95%,62%)';
  function flameShape(ctx, x, y, w, h, t, c1, c2) {
    for (const [c, k] of [[c1, 1], [c2, 0.55]]) {
      const ww = w * k, hh = h * k * (0.85 + 0.15 * Math.sin(t * 23 + x));
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - ww / 2, y);
      ctx.quadraticCurveTo(x - ww * 0.6, y - hh * 0.5, x + Math.sin(t * 17 + x) * ww * 0.25, y - hh);
      ctx.quadraticCurveTo(x + ww * 0.6, y - hh * 0.5, x + ww / 2, y); ctx.closePath(); ctx.fill();
    }
  }
  function crystal(ctx, x, y, w, h, c1, c2) {
    ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w / 2, y - h * 0.3); ctx.lineTo(x + w * 0.3, y); ctx.lineTo(x - w * 0.3, y); ctx.lineTo(x - w / 2, y - h * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w / 2, y - h * 0.3); ctx.lineTo(x, y - h * 0.2); ctx.closePath(); ctx.fill();
  }
  function drawFx(ctx, V, f, u, a) {
    const T = V.T, p = V.p, t0 = f.t - (f.delay || 0);
    if (f.delay && t0 < 0) return true;
    if (f.delay) { u = t0 / f.life; a = 1 - u; }
    const x = V.SX(f.x), y = V.SY(f.y);
    if (f.k === 'slash') {
      const base = (f.f > 0 ? 0 : Math.PI) + f.a * f.f, sw = 1.25 * f.f, e2 = FK.easeOut(u * 1.6);
      FK.crescent(ctx, V.SX(f.x - f.f * 0.9), y, f.R * T, base - sw + sw * 1.2 * e2, base + sw * e2, T * 0.42, f.c, a);
      return true;
    }
    if (f.k === 'jab') {
      const L = f.L * T * (0.4 + 0.6 * FK.easeOut(u * 2));
      FK.taper(ctx, [[x + f.f * L * 0.5, y], [x, y - 3], [x - f.f * L * 0.5, y]], T * 0.14, FORMS[3].c, a);
      FK.star(ctx, x + f.f * L * 0.5, y, T * 0.24 * (0.6 + u), u * 5, WHITE, a); return true;
    }
    if (f.k === 'wheel' || f.k === 'whip') {
      const cx = V.SX(pcx(p)), cy = V.SY(pcy(p));
      if (f.k === 'whip') { const a0 = Math.PI * (f.f > 0 ? 1 : 0), sw = Math.PI * 2 * FK.easeOut(u * 1.4) * f.f; ctx.save(); ctx.translate(cx, cy + T * 0.2); ctx.scale(1, 0.4); FK.crescent(ctx, 0, 0, f.R * T, a0 + sw - 2.2 * f.f, a0 + sw, T * 0.5, FORMS[2].c, a); FK.crescent(ctx, 0, 0, f.R * T * 0.8, a0 + sw - 1.4 * f.f, a0 + sw, T * 0.25, FORMS[2].a, a * 0.8); ctx.restore(); }
      else FK.crescent(ctx, cx, cy, f.R * T, f.a - 2.3 * f.f, f.a, T * 0.5, f.c, a);
      return true;
    }
    if (f.k === 'ghost') { FK.glow(ctx, f.c, 0.4 * a); ctx.beginPath(); ctx.roundRect(x + f.w * T * 0.1, y + f.h * T * 0.08, f.w * T * 0.8, f.h * T * 0.88, f.w * T * 0.3); ctx.fill(); return true; }
    if (f.k === 'flame') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; flameShape(ctx, x, y - u * T * 0.4, f.R * T * (0.6 + 0.4 * a), f.R * T * 1.5 * (0.5 + 0.5 * a), V.now, FORMS[0].c, FORMS[0].g); return true; }
    if (f.k === 'pillar') { const e2 = Math.sin(Math.min(1, u * 1.3) * Math.PI); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a * 1.6); flameShape(ctx, x, y, T * 0.75, f.h * T * e2, V.now, FORMS[0].c, FORMS[0].a); return true; }
    if (f.k === 'burst') {
      const r = f.R * T * (0.35 + 0.65 * FK.easeOut(u * 1.5));
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); FK.glow(ctx, f.c, a * 0.35); ctx.fill();
      FK.glow(ctx, f.c, a); ctx.lineWidth = 3 * a + 1; ctx.stroke();
      for (let i = 0; i < 8; i++) { const an = i * 0.785 + f.x; ctx.beginPath(); ctx.arc(x + Math.cos(an) * r * 0.9, y + Math.sin(an) * r * 0.9, T * 0.09 * a + 1, 0, Math.PI * 2); FK.glow(ctx, WHITE, a * 0.8); ctx.fill(); }
      return true;
    }
    if (f.k === 'shards') {
      for (let i = 0; i < f.n; i++) { const an = i * 2.399 + f.x, r = T * (0.3 + 1.5 * FK.easeOut(u)) * (0.6 + (i * 0.37 % 1) * 0.6), sx = x + Math.cos(an) * r, sy = y + Math.sin(an) * r + u * u * T * 0.8; ctx.save(); ctx.translate(sx, sy); ctx.rotate(an + u * 6); FK.glow(ctx, i % 3 ? f.c : WHITE, a); ctx.beginPath(); ctx.moveTo(0, -T * 0.16); ctx.lineTo(T * 0.07, 0); ctx.lineTo(0, T * 0.16); ctx.lineTo(-T * 0.07, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
      return true;
    }
    if (f.k === 'bolt') {
      const x2 = V.SX(f.x2), y2 = V.SY(f.y2), x1 = V.SX(f.x1), y1 = V.SY(f.y1), n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / (T * 0.45)));
      FK.glow(ctx, FORMS[3].a, a * 0.6); ctx.lineWidth = f.w ? 9 : 5; zig(ctx, x1, y1, x2, y2, n, T * 0.3);
      FK.glow(ctx, FORMS[3].g, a); ctx.lineWidth = f.w ? 4 : 2.5; zig(ctx, x1, y1, x2, y2, n, T * 0.3);
      FK.glow(ctx, WHITE, a); ctx.lineWidth = 1.5; zig(ctx, x1, y1, x2, y2, n, T * 0.16);
      return true;
    }
    if (f.k === 'strike') {
      const top = f.from != null ? V.SY(f.from) : y - T * 9;
      FK.glow(ctx, FORMS[3].a, a * 0.5); ctx.lineWidth = 14; zig(ctx, x, top, x, y, 9, T * 0.4);
      FK.glow(ctx, FORMS[3].c, a); ctx.lineWidth = 6; zig(ctx, x + rnd(-4, 4), top, x, y, 9, T * 0.45);
      FK.glow(ctx, WHITE, a); ctx.lineWidth = 2.5; zig(ctx, x, top, x, y, 9, T * 0.3);
      ctx.beginPath(); ctx.ellipse(x, y, T * (0.4 + u * 1.2), T * (0.15 + u * 0.3), 0, 0, Math.PI * 2); FK.glow(ctx, WHITE, a * 0.7); ctx.fill();
      return true;
    }
    if (f.k === 'mark') {
      const mx = f.e && !f.e.dead ? V.SX(ex(f.e)) : x, my = f.e && !f.e.dead ? V.SY(ey(f.e)) : y, r = T * (1.1 - 0.6 * u);
      FK.glow(ctx, FORMS[3].c, 0.5 + 0.5 * u); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + u * 3; ctx.beginPath(); ctx.moveTo(mx + Math.cos(an) * r, my + Math.sin(an) * r); ctx.lineTo(mx + Math.cos(an) * r * 1.4, my + Math.sin(an) * r * 1.4); ctx.stroke(); }
      return true;
    }
    if (f.k === 'wave') {
      for (const s of [-1, 1]) { const wx = x + s * f.R * T * FK.easeOut(u * 1.3); FK.glow(ctx, FORMS[3].c, a); ctx.lineWidth = 3; zig(ctx, x + s * T * 0.3, y - 3, wx, y - 3, 7, T * 0.3); FK.glow(ctx, WHITE, a); ctx.beginPath(); ctx.arc(wx, y - T * 0.25, T * 0.2, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    if (f.k === 'cloud') {
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 5; i++) { ctx.globalAlpha = 0.75 * Math.min(1, a * 3) * Math.min(1, u * 8); ctx.fillStyle = i % 2 ? '#dff4ff' : '#b9dcf2'; ctx.beginPath(); ctx.arc(x + (i - 2) * T * 0.55, y + (i % 2) * T * 0.15, T * 0.5, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    if (f.k === 'bite') {
      const g = T * 0.6 * (1 - FK.easeOut(u * 2.2));
      for (const s of [-1, 1]) { FK.solid(ctx, WHITE, Math.min(1, a * 2)); ctx.beginPath(); for (let i = -2; i <= 2; i++) { const bx = x + i * T * 0.2; ctx.moveTo(bx - T * 0.09, y + s * (g + T * 0.3)); ctx.lineTo(bx, y + s * g); ctx.lineTo(bx + T * 0.09, y + s * (g + T * 0.3)); } ctx.fill(); }
      return true;
    }
    if (f.k === 'beam') {   // Siphon Beam: a lance of light that thins out
      const x2 = x + f.f * f.L * T, w = T * 0.5 * a;
      ctx.lineCap = 'round';
      for (const [c, k, al] of [[GOLD, 1, 0.45], [WHITE, 0.55, 0.9]]) { FK.glow(ctx, c, a * al); ctx.lineWidth = w * k + 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y); ctx.stroke(); }
      for (let i = 0; i < 6; i++) { const q = ((i / 6 + 1 - u) % 1); FK.star(ctx, x + (x2 - x) * q, y + Math.sin(i * 2.4 + u * 9) * T * 0.22, T * 0.14, u * 4 + i, i % 2 ? GOLD : WHITE, a); }   // motes run back to him
      return true;
    }
    if (f.k === 'drain') {   // life leaving a foe for him
      const tx = V.SX(pcx(p)), ty = V.SY(pcy(p)), e2 = FK.ease(u);
      for (let i = 0; i < 4; i++) { const k = Math.max(0, Math.min(1, e2 * 1.3 - i * 0.08)), sw = Math.sin(k * Math.PI) * T * 0.5 * (i % 2 ? 1 : -1); FK.star(ctx, x + (tx - x) * k, y + (ty - y) * k + sw, T * 0.13, u * 6 + i, i % 2 ? MEND : WHITE, Math.min(1, a * 2)); }
      return true;
    }
    if (f.k === 'mend') {   // little crosses rising off him
      const cx = V.SX(pcx(p)), cy = V.SY(pcy(p));
      for (let i = 0; i < 4; i++) { const mx = cx + ((i * 0.37 + f.x) % 1 - 0.5) * T * 1.1, my = cy + T * 0.3 - u * T * (0.7 + i * 0.15) - i * T * 0.1, s = T * 0.09; FK.glow(ctx, MEND, a * 0.9); ctx.fillRect(mx - s, my - s / 3, s * 2, s / 1.5); ctx.fillRect(mx - s / 3, my - s, s / 1.5, s * 2); }
      return true;
    }
    if (f.k === 'halo') {   // a ring of light lifting off the floor
      const e2 = FK.easeOut(u), yy = y - f.H * T * e2, r = f.R * T * (0.6 + 0.4 * e2);
      FK.glow(ctx, GOLD, a * 0.25); ctx.fillRect(x - r * 0.8, yy, r * 1.6, y - yy);
      for (const [c, lw] of [[GOLD, 6], [WHITE, 2.5]]) { FK.glow(ctx, c, a); ctx.lineWidth = lw * a + 1; ctx.beginPath(); ctx.ellipse(x, yy, r, r * 0.24, 0, 0, Math.PI * 2); ctx.stroke(); }
      return true;
    }
    if (f.k === 'prism') {
      for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3 + V.now * 4, r = T * (0.5 + 1.1 * FK.easeOut(u)); FK.glow(ctx, rainbow(i, V.now), a); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, an, an + 0.7); ctx.stroke(); }
      return true;
    }
    return false;
  }
  function drawShot(ctx, V, s) {
    const T = V.T, x = V.SX(s.x), y = V.SY(s.y), fm = fById(s.form), ang = Math.atan2(s.vy, s.vx || 0.001), r = s.r * T;
    if (s.t < (s.delay || 0)) return;
    if (s.trail.length > 1 && s.k !== 'block') { const pts = []; for (let i = s.trail.length - 1; i >= 0; i--) pts.push([V.SX(s.trail[i][0]), V.SY(s.trail[i][1])]); FK.taper(ctx, pts, r * 0.8, fm.c, 0.55, false); }
    ctx.save(); ctx.translate(x, y);
    if (s.k === 'shard' || s.k === 'hail' || s.k === 'icicle' || s.k === 'lance') {
      const L = s.k === 'lance' ? T * 2.6 : s.k === 'icicle' ? r * 3.4 : r * 2.6, w = s.k === 'lance' ? T * 0.22 : s.k === 'icicle' ? r * 0.9 : r * 0.7;
      ctx.rotate(ang);
      if (s.k === 'lance') { FK.glow(ctx, fm.c, 0.5); ctx.beginPath(); ctx.ellipse(-L * 0.4, 0, L * 0.9, w * 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
      FK.solid(ctx, fm.g, 1); ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.lineTo(-L * 0.25, -w); ctx.lineTo(-L * 0.5, 0); ctx.lineTo(-L * 0.25, w); ctx.closePath(); ctx.fill();
      ctx.fillStyle = fm.c; ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.lineTo(-L * 0.25, w); ctx.lineTo(-L * 0.5, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.lineTo(-L * 0.4, 0); ctx.stroke();
    } else if (s.k === 'block') {
      ctx.rotate(s.t * 3); FK.solid(ctx, fm.c, 0.92); ctx.beginPath(); ctx.roundRect(-r, -r * 0.7, r * 2, r * 1.4, 4); ctx.fill();
      ctx.fillStyle = fm.g; ctx.beginPath(); ctx.moveTo(-r, -r * 0.7); ctx.lineTo(r * 0.4, -r * 0.7); ctx.lineTo(-r * 0.4, r * 0.7); ctx.lineTo(-r, r * 0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5; ctx.strokeRect(-r * 0.9, -r * 0.6, r * 1.8, r * 1.2);
    } else if (s.k === 'glob') {
      ctx.rotate(ang); const st = 1 + Math.min(0.5, Math.hypot(s.vx, s.vy) / 40);
      FK.solid(ctx, fm.d, 1); ctx.beginPath(); ctx.ellipse(0, 0, r * st * 1.15, r / st * 1.15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fm.c; ctx.beginPath(); ctx.ellipse(0, 0, r * st, r / st, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fm.a; ctx.beginPath(); ctx.arc(-r * 0.2, r * 0.15, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.3, r * 0.2, 0, Math.PI * 2); ctx.fill();
    } else if (s.k === 'ball') {
      const pu = 1 + 0.15 * Math.sin(V.now * 30);
      FK.glow(ctx, fm.a, 0.45); ctx.beginPath(); ctx.arc(0, 0, r * 1.7 * pu, 0, Math.PI * 2); ctx.fill();
      FK.glow(ctx, fm.c, 0.95); ctx.beginPath(); ctx.arc(0, 0, r * pu, 0, Math.PI * 2); ctx.fill();
      FK.glow(ctx, WHITE, 1); ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const an = V.now * 9 + i * 2.1; zig(ctx, 0, 0, Math.cos(an) * r * 2, Math.sin(an) * r * 2, 4, r * 0.8); }
    }
    ctx.restore();
  }
  function drawZone(ctx, V, z) {
    const T = V.T, x = V.SX(z.x), y = V.SY(z.y), a = Math.min(1, (z.life - z.t) * 2.5) * Math.min(1, z.t * 8), now = V.now;
    if (z.k === 'fire') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.9; for (let i = -1; i <= 1; i++) flameShape(ctx, x + i * z.r * T * 0.6, y, T * 0.42, T * (0.75 - Math.abs(i) * 0.2), now + i, FORMS[0].c, FORMS[0].g); }
    else if (z.k === 'frost') { FK.solid(ctx, FORMS[1].g, a * 0.75); ctx.beginPath(); ctx.ellipse(x, y, z.r * T, T * 0.1, 0, 0, Math.PI * 2); ctx.fill(); for (let i = -1; i <= 1; i++) crystal(ctx, x + i * z.r * T * 0.55, y, T * 0.2, T * (0.4 - Math.abs(i) * 0.1), FORMS[1].c, FORMS[1].g); }
    else if (z.k === 'acid') {
      FK.solid(ctx, FORMS[2].d, a * 0.8); ctx.beginPath(); ctx.ellipse(x, y, z.r * T, T * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = FORMS[2].c; ctx.beginPath(); ctx.ellipse(x, y - 1, z.r * T * 0.88, T * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 4; i++) { const ph = (now * 0.9 + i * 0.27) % 1, bx = x + ((i * 0.61 % 1) - 0.5) * z.r * T * 1.5; ctx.globalAlpha = a * (1 - ph); ctx.fillStyle = i % 2 ? FORMS[2].g : FORMS[2].a; ctx.beginPath(); ctx.arc(bx, y - ph * T * 0.7, T * 0.07 * (1 + ph), 0, Math.PI * 2); ctx.fill(); }
    } else if (z.k === 'spore') {
      for (let i = 0; i < 9; i++) { const an = i * 0.698 + now * (i % 2 ? 0.8 : -0.6), rr = z.r * T * (0.25 + 0.6 * ((i * 0.37) % 1)); FK.solid(ctx, i % 3 ? FORMS[2].c : FORMS[2].a, a * 0.28); ctx.beginPath(); ctx.arc(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.8, T * (0.38 + 0.12 * Math.sin(now * 3 + i)), 0, Math.PI * 2); ctx.fill(); }
      FK.glow(ctx, FORMS[2].a, a * 0.5); ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(x, y, z.r * T, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    } else if (z.k === 'sanct') {
      const r = z.r * T, pu = 0.5 + 0.5 * Math.sin(now * 5), left = Math.max(0, z.pool / 2);
      FK.glow(ctx, GOLD, a * (0.14 + 0.08 * pu)); ctx.beginPath(); ctx.ellipse(x, y, r, T * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      FK.glow(ctx, WHITE, a * 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, r, T * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      FK.glow(ctx, GOLD, a * 0.7); ctx.lineWidth = 1.5; ctx.setLineDash([5, 7]); ctx.lineDashOffset = -now * 30; ctx.beginPath(); ctx.ellipse(x, y, r * 0.72, T * 0.15, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 7; i++) { const ph = (now * 0.55 + i * 0.143) % 1, bx = x + ((i * 0.618) % 1 - 0.5) * r * 1.7; FK.star(ctx, bx, y - ph * T * 1.6, T * 0.1 * (1 - ph * 0.5), now * 2 + i, left > 0 && i % 2 ? MEND : GOLD, a * (1 - ph)); }
    } else if (z.k === 'wall') {
      const h = z.h * T * FK.easeOut(z.t * 7), w = T * 0.8;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.92;
      for (const [dx, k] of [[-0.3, 0.6], [0.3, 0.72], [0, 1]]) crystal(ctx, x + dx * w, y, w * 0.75, h * k, FORMS[1].c, FORMS[1].g);
      FK.glow(ctx, WHITE, a * (0.35 + 0.25 * Math.sin(now * 5))); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - w * 0.1, y - h * 0.9); ctx.lineTo(x - w * 0.2, y - h * 0.25); ctx.stroke();
    } else if (z.k === 'orb') {
      const pu = 1 + 0.12 * Math.sin(now * 12), r = T * 0.3;
      FK.glow(ctx, FORMS[3].a, a * 0.18); ctx.beginPath(); ctx.arc(x, y, T * 3.2, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.setLineDash([3, 9]); ctx.stroke(); ctx.setLineDash([]);
      FK.glow(ctx, FORMS[3].a, a * 0.45); ctx.beginPath(); ctx.arc(x, y, r * 1.8 * pu, 0, Math.PI * 2); ctx.fill();
      FK.glow(ctx, FORMS[3].c, a); ctx.beginPath(); ctx.arc(x, y, r * pu, 0, Math.PI * 2); ctx.fill();
      FK.glow(ctx, WHITE, a); ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; for (let i = 0; i < 2; i++) { const an = now * 7 + i * 3.1; zig(ctx, x, y, x + Math.cos(an) * r * 2.4, y + Math.sin(an) * r * 2.4, 4, r); }
    }
  }
  function drawTongue(ctx, V, tg) {
    const x1 = V.SX(tg.x1), y1 = V.SY(tg.y1), x2 = V.SX(tg.x2), y2 = V.SY(tg.y2), L = Math.hypot(x2 - x1, y2 - y1), N = 10, pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push([x1 + (x2 - x1) * u, y1 + (y2 - y1) * u + Math.sin(u * Math.PI) * Math.min(10, L * 0.08)]); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.lineCap = 'round';
    for (const [c, w] of [['#a8183a', 7], [TONGUE, 4.5], ['#ffb3c2', 1.3]]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] - (w < 2 ? 1.2 : 0)); for (const q of pts) ctx.lineTo(q[0], q[1] - (w < 2 ? 1.2 : 0)); ctx.stroke(); }
    ctx.fillStyle = '#a8183a'; ctx.beginPath(); ctx.arc(x2, y2, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff2f58'; ctx.beginPath(); ctx.arc(x2, y2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd9e1'; ctx.beginPath(); ctx.arc(x2 - 1.5, y2 - 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  function drawMarks(ctx, V) {
    const T = V.T, now = V.now;
    for (const e of FK.foes()) {
      const x = V.SX(ex(e)), top = V.SY(e.y) - 7;
      if (e._chBurn > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85; for (let i = -1; i <= 1; i++) flameShape(ctx, x + i * T * 0.22, V.SY(e.y) + T * 0.15, T * 0.2, T * 0.42, now + i * 0.7, FORMS[0].c, FORMS[0].g); }
      if (e._chPois > 0 && e._chPoisN > 0) for (let i = 0; i < e._chPoisN; i++) { FK.solid(ctx, '#2a0f3d', 1); ctx.beginPath(); ctx.arc(x + (i - (e._chPoisN - 1) / 2) * 8, top, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = i % 2 ? FORMS[2].c : FORMS[2].a; ctx.beginPath(); ctx.arc(x + (i - (e._chPoisN - 1) / 2) * 8, top, 2.5, 0, Math.PI * 2); ctx.fill(); }
      if (e._chChill > 0 && !(e._ppFrozen > 0)) for (let i = 0; i < e._chChill; i++) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; crystal(ctx, x + (i - (e._chChill - 1) / 2) * 9, top + 4, 7, 10, FORMS[1].c, WHITE); }
      if (e._chLight > 0) FK.star(ctx, x, top - 5, 6 + 1.5 * Math.sin(now * 8), now * 2, GOLD, Math.min(1, e._chLight * 2));
      if (e._chStatic > 0) { FK.glow(ctx, FORMS[3].c, 0.6 + 0.4 * Math.sin(now * 20)); ctx.lineWidth = 2; const yy = top - 4; ctx.beginPath(); ctx.moveTo(x + 3, yy - 7); ctx.lineTo(x - 3, yy); ctx.lineTo(x + 2, yy); ctx.lineTo(x - 3, yy + 7); ctx.stroke(); }
    }
  }
  function drawWorld(ctx, cam) {
    const p = P(); if (!p || !S.active) return;
    const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0;
    const V = { T, SX: x => x * T - cx0, SY: y => y * T - cy0, now: performance.now() / 1000, p };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowBlur = 0;
    for (const z of S.zones) { ctx.save(); try { drawZone(ctx, V, z); } catch (e) { oops(e); } ctx.restore(); }
    for (const s of S.shots) { ctx.save(); try { drawShot(ctx, V, s); } catch (e) { oops(e); } ctx.restore(); }
    drawMarks(ctx, V);
    if (S.tongue) drawTongue(ctx, V, S.tongue);
    const x = V.SX(pcx(p)), y = V.SY(pcy(p));
    // a PRISM move is waiting: a rainbow ring round him
    if (S.prism > 0) for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3 + V.now * 5; FK.glow(ctx, rainbow(i, V.now), Math.min(1, S.prism * 2) * 0.85); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, T * 0.85, an, an + 0.62); ctx.stroke(); }
    // HEAT pips (Ember)
    if (S.heat > 0 && form().id === 'ember') for (let i = 0; i < S.heat; i++) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.95; flameShape(ctx, x + (i - (S.heat - 1) / 2) * 8, V.SY(p.y) - 6, 7, 11, V.now + i, FORMS[0].c, FORMS[0].a); }
    // LUMEN: a soft pulse while he mends, wings on Ascension, and (main game) the mend meter filling toward +1 heart
    if (S.healT > 0) { ctx.beginPath(); ctx.arc(x, y, T * (0.78 + 0.1 * Math.sin(V.now * 24)), 0, Math.PI * 2); FK.glow(ctx, MEND, Math.min(0.6, S.healT * 1.2)); ctx.lineWidth = 3; ctx.stroke(); }
    if (S.wings > 0) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const an = -0.5 - i * 0.42 + Math.sin(V.now * 26) * 0.18, L = T * (1.05 - i * 0.2); FK.taper(ctx, [[x + s * T * 0.15, y - T * 0.1], [x + s * (T * 0.15 + Math.cos(an) * L * 0.6), y - T * 0.1 + Math.sin(an) * L * 0.6 - T * 0.1], [x + s * (T * 0.15 + Math.cos(an) * L), y - T * 0.1 + Math.sin(an) * L]], T * 0.2, i ? WHITE : GOLD, Math.min(1, S.wings * 9) * 0.85); }
    if (form().id === 'lumen' && S.bank > 0.02 && !inSmash() && !window._fighterPass && (p.hp || 0) < (p.maxHp || 0)) {
      const by = V.SY(p.y) - 8, bw = T * 0.8;
      FK.solid(ctx, '#1c1830', 0.75); ctx.beginPath(); ctx.roundRect(x - bw / 2 - 1, by - 1, bw + 2, 5, 2.5); ctx.fill();
      FK.solid(ctx, MEND, 1); ctx.beginPath(); ctx.roundRect(x - bw / 2, by, bw * Math.min(1, S.bank), 3, 1.5); ctx.fill();
    }
    FK.drawFx(ctx, V, S.fx, drawFx);
    ctx.restore();
  }
  const _prevHook = window.drifterDrawHook;
  window.drifterDrawHook = function (ctx, now2, cam) {
    if (_prevHook) _prevHook(ctx, now2, cam);
    if (window.selectedCharacter !== ID) return;
    try { drawWorld(ctx, cam); } catch (e) { oops(e); }
  };

  // ---- drawing: Chroma himself ----
  // Drawn in his own units: 1 = his height, (0, 0) = between his feet, facing +x (the game mirrors him).
  function mix(c1, c2, u) { const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16), l = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * u); return 'rgb(' + l(16) + ',' + l(8) + ',' + l(0) + ')'; }
  function poseOf(m, p, t) {
    // rot: whole-body turn   lean   arm: front arm angle (0 = down, + = forward/up)   reach: how far it is thrust
    // legs: 'run' | 'tuck' | 'kick' | 'split'   mouth: 0..1 open   sq: squash   look: where the eyes point
    const q = { rot: 0, lean: 0, arm: 0.5, arm2: -0.4, reach: 0, legs: '', mouth: 0, sq: 0, oy: 0 };
    if (!m) return q;
    const u = Math.min(1, m.t / Math.max(0.05, m.spec.dur)), k = m.pose;
    if (k === 'claw') { const s = Math.sin(m.t * 27); q.lean = 0.3; q.arm = 1.6 + s * 0.9; q.arm2 = 1.5 - s * 0.9; q.reach = 0.12; q.mouth = 0.5; }
    else if (k === 'jab') { const s = Math.sin(m.t * 52); q.lean = 0.22; q.arm = 1.57; q.arm2 = 1.57; q.reach = 0.1 + 0.1 * s; q.reach2 = 0.1 - 0.1 * s; }
    else if (k === 'rush') { q.lean = 0.75; q.arm = -1.1; q.arm2 = -1.3; q.legs = 'split'; q.mouth = 0.3; }
    else if (k === 'upper') { q.lean = -0.25; q.arm = 3.0; q.reach = 0.12; q.arm2 = -0.6; q.legs = 'tuck'; q.mouth = 0.4; q.rot = -0.2 + 0.2 * u; }
    else if (k === 'slam') { q.sq = 0.22 * Math.sin(Math.min(1, u * 1.5) * Math.PI); q.arm = 0.2; q.arm2 = 0.1; q.reach = 0.08; q.lean = 0.2; q.mouth = 0.6; }
    else if (k === 'spin') { q.rot = m.t * 26; q.legs = 'tuck'; q.arm = 1.2; q.arm2 = 1.2; }
    else if (k === 'tail') { q.rot = FK.easeOut(u * 1.3) * Math.PI * 2; q.lean = 0.1; q.legs = 'tuck'; }
    else if (k === 'kick') { q.rot = 0.5; q.legs = 'kick'; q.arm = -1; q.arm2 = -1.2; q.mouth = 0.3; }
    else if (k === 'dive') { q.rot = 1.9; q.arm = 1.9; q.arm2 = 1.7; q.reach = 0.1; q.legs = 'split'; q.mouth = 0.9; }
    else if (k === 'cast') { q.lean = 0.15; q.arm = 1.57; q.reach = 0.14; q.arm2 = 1.2; q.mouth = 0.7; }
    else if (k === 'thrust') { q.lean = 0.4; q.arm = 1.57; q.arm2 = 1.57; q.reach = 0.18; q.reach2 = 0.14; q.mouth = 1; q.legs = 'split'; }
    else if (k === 'raise') { q.lean = -0.15; q.arm = 3.0; q.arm2 = 2.7; q.reach = 0.08; q.mouth = 0.5; }
    else if (k === 'burst') { q.arm = 2.3; q.arm2 = -2.3; q.reach = 0.1; q.legs = 'kick'; q.mouth = 0.6; q.sq = -0.1; }
    else if (k === 'spit' || k === 'tongue') { q.lean = k === 'spit' ? -0.3 : 0.25; q.arm = 0.2; q.arm2 = -0.5; q.mouth = 1; }
    else if (k === 'stab') { q.lean = 0.5; q.arm = 1.57; q.reach = m.t > 0.22 ? 0.22 : 0; q.arm2 = -1; q.legs = 'split'; }
    return q;
  }
  function drawBody(ctx, px, py, pw, ph, t, live, p) {
    const fm = form(), m = live ? S.mv : null;
    const q = poseOf(m, p, t), H = ph, cx = px + pw / 2, fy = py + ph;
    const heat = live && fm.id === 'ember' ? S.heat : 0;
    let C = fm.c, Dk = fm.d;
    if (live && S.shiftT > 0) { const u = S.shiftT / 0.3; C = mix(fm.c, '#ffffff', u * 0.85); Dk = mix(fm.d, '#ffffff', u * 0.6); }
    const run = p && p.onGround && Math.abs(p.vx || 0) > 0.6, ph0 = run ? t * 13 : 0, air = p && !p.onGround;
    const bob = run ? Math.abs(Math.sin(ph0)) * 0.025 : Math.sin(t * 2.6) * 0.012;
    const lw = Math.max(1, H * 0.035);
    ctx.save();
    ctx.translate(cx, fy); ctx.scale(H, H);
    if (live && S.invis > 0) ctx.globalAlpha *= 0.12;
    else if (live && fm.id === 'venom' && m && m.pose === 'stab' && m.t < 0.3) ctx.globalAlpha *= 0.6;
    if (q.rot) { ctx.translate(0, -0.5); ctx.rotate(q.rot); ctx.translate(0, 0.5); }
    if (q.sq) ctx.scale(1 + q.sq, 1 - q.sq);
    ctx.translate(0, -bob); ctx.rotate(q.lean * 0.5 + (run ? 0.12 : 0) + (air && !m ? (p.vy < 0 ? -0.1 : 0.12) : 0));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const ol = w => { ctx.strokeStyle = Dk; ctx.lineWidth = (w || 1) * lw / H; ctx.stroke(); };
    const g = ctx.createLinearGradient(0, -1, 0, 0); g.addColorStop(0, mix(fm.c, fm.g, 0.45)); g.addColorStop(0.55, C); g.addColorStop(1, mix(fm.c, fm.d, 0.45));
    const skin = live && S.shiftT > 0 ? C : g;

    // tail: a tight spiral behind him, with the form's own tip
    const wag = Math.sin(t * 3) * 0.06 + (run ? Math.sin(ph0) * 0.1 : 0), tc = [-0.36, -0.3 + wag * 0.3];
    const tpts = [[-0.14, -0.22]];
    for (let i = 0; i <= 14; i++) { const u = i / 14, an = 0.5 + u * 5.6 + wag, r = 0.2 * (1 - u * 0.86); tpts.push([tc[0] + Math.cos(an) * r, tc[1] + Math.sin(an) * r * 0.95]); }
    for (const [col, k] of [[Dk, 1.5], [C, 1]]) for (let i = 0; i < tpts.length - 1; i++) { ctx.strokeStyle = col; ctx.lineWidth = (0.115 - i * 0.0055) * k + (k > 1 ? 0.012 : 0); ctx.beginPath(); ctx.moveTo(tpts[i][0], tpts[i][1]); ctx.lineTo(tpts[i + 1][0], tpts[i + 1][1]); ctx.stroke(); }
    const tip = tpts[tpts.length - 1];
    if (fm.id === 'ember') flameShape(ctx, tip[0], tip[1] + 0.03, 0.12 + heat * 0.012, 0.2 + heat * 0.03, t, fm.c, fm.a);
    else if (fm.id === 'frost') crystal(ctx, tip[0], tip[1] + 0.06, 0.1, 0.16, fm.g, WHITE);
    else if (fm.id === 'venom') { const dr = (t * 0.8) % 1; ctx.fillStyle = fm.a; ctx.beginPath(); ctx.arc(tip[0], tip[1], 0.045, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha *= 1 - dr; ctx.beginPath(); ctx.arc(tc[0] - 0.12, tc[1] + 0.12 + dr * 0.25, 0.022, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha /= 1 - dr || 1; }
    else if (fm.id === 'lumen') { const r = 0.075 + 0.012 * Math.sin(t * 5); ctx.fillStyle = fm.a; ctx.beginPath(); for (let i = 0; i < 8; i++) { const an = t * 1.5 + i * Math.PI / 4, rr = i % 2 ? r * 0.32 : r; ctx.lineTo(tip[0] + Math.cos(an) * rr, tip[1] + Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(tip[0], tip[1], 0.02, 0, Math.PI * 2); ctx.fill(); }   // a little star
    else { ctx.fillStyle = fm.a; ctx.beginPath(); ctx.arc(tip[0], tip[1], 0.04 + 0.012 * Math.sin(t * 22), 0, Math.PI * 2); ctx.fill(); }

    // legs
    const legs = [[-0.1, 0], [0.12, Math.PI]].map(([lx, o]) => {
      let a = run ? Math.sin(ph0 + o) * 0.7 : 0, len = 0.2;
      if (q.legs === 'tuck' || (air && !q.legs)) { a = o ? 0.7 : -0.5; len = 0.14; }
      else if (q.legs === 'split') a = o ? 0.9 : -0.9;
      else if (q.legs === 'kick') { a = o ? 1.35 : -0.6; len = o ? 0.25 : 0.15; }
      return [lx, a, len];
    });
    const leg = ([lx, a, len], col) => {
      const hx = lx, hy = -0.2, kx = hx + Math.sin(a) * len, ky = hy + Math.cos(a) * len;
      ctx.strokeStyle = Dk; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky - 0.03); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 0.105; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky - 0.03); ctx.stroke();
      ctx.fillStyle = Dk; ctx.beginPath(); ctx.ellipse(kx + 0.035, ky - 0.03, 0.085, 0.045, a * -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fm.b; ctx.beginPath(); ctx.ellipse(kx + 0.04, ky - 0.033, 0.06, 0.026, a * -0.4, 0, Math.PI * 2); ctx.fill();
    };
    leg(legs[0], mix(fm.c, fm.d, 0.45));

    // an arm: shoulder -> two-toed mitt
    const arm = (ang, reach, back) => {
      const sx = 0.1 + (back ? -0.06 : 0), sy = -0.44, L = 0.15 + (reach || 0), hx = sx + Math.sin(ang) * L, hy = sy + Math.cos(ang) * L;
      ctx.strokeStyle = Dk; ctx.lineWidth = 0.115; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = back ? mix(fm.c, fm.d, 0.45) : C; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = Dk; ctx.beginPath(); ctx.arc(hx, hy, 0.068, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = back ? mix(fm.b, fm.d, 0.3) : fm.b; ctx.beginPath(); ctx.arc(hx, hy, 0.05, 0, Math.PI * 2); ctx.fill();
      if (!live) return;
      if (fm.id === 'ember' && (m || heat > 0)) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; flameShape(ctx, hx, hy + 0.05, 0.13 + heat * 0.015, 0.2 + heat * 0.03, t + ang, fm.c, fm.a); ctx.restore(); }
      else if (fm.id === 'volt' && m) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = fm.a; ctx.lineWidth = 0.02; zig(ctx, hx, hy, hx + rnd(-0.16, 0.16), hy + rnd(-0.16, 0.16), 3, 0.08); ctx.restore(); }
      else if (fm.id === 'frost' && m) crystal(ctx, hx + 0.04, hy + 0.05, 0.08, 0.14, fm.g, WHITE);
      else if (fm.id === 'lumen' && (m || S.healT > 0)) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = S.healT > 0 ? MEND : fm.a; ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.arc(hx, hy, 0.1 + 0.02 * Math.sin(t * 20 + ang), 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    };
    arm(q.arm2, q.reach2 || 0, true);

    // body, with a pale striped belly
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, -0.36, 0.24, 0.23, 0.15, 0, Math.PI * 2); ctx.fill(); ol(1.2);
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, -0.36, 0.24, 0.23, 0.15, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = fm.b; ctx.beginPath(); ctx.ellipse(0.13, -0.28, 0.16, 0.19, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = mix(fm.b, fm.c, 0.45); ctx.lineWidth = 0.014; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0.36, -0.38 + i * 0.09, 0.3, 2.5, 3.6); ctx.stroke(); }
    // markings on his flank: each form's own
    ctx.fillStyle = fm.id === 'venom' || fm.id === 'lumen' ? fm.a : fm.g; ctx.globalAlpha *= 0.85;
    for (const [mx, my, mr] of [[-0.12, -0.44, 0.04], [-0.17, -0.33, 0.03], [-0.07, -0.3, 0.024]]) {
      ctx.beginPath();
      if (fm.id === 'volt') { ctx.moveTo(mx + mr, my - mr * 1.6); ctx.lineTo(mx - mr * 0.6, my); ctx.lineTo(mx + mr * 0.3, my); ctx.lineTo(mx - mr, my + mr * 1.6); ctx.lineTo(mx + mr * 0.8, my - mr * 0.3); ctx.lineTo(mx, my - mr * 0.3); }
      else if (fm.id === 'frost' || fm.id === 'lumen') { ctx.moveTo(mx, my - mr * 1.5); ctx.lineTo(mx + mr, my); ctx.lineTo(mx, my + mr * 1.5); ctx.lineTo(mx - mr, my); }
      else if (fm.id === 'ember') { ctx.moveTo(mx - mr, my + mr); ctx.quadraticCurveTo(mx - mr, my - mr, mx, my - mr * 1.7); ctx.quadraticCurveTo(mx + mr, my - mr, mx + mr, my + mr); }
      else ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    leg(legs[1], C);

    // the ridge down his back: flames, crystals, toxic knobs, jagged bolts or gold-tipped feathers
    const ridge = [[-0.2, -0.47, 0.8], [-0.14, -0.6, 1], [-0.1, -0.76, 1.15], [-0.03, -0.9, 1]];
    ridge.forEach(([rx, ry, k], i) => {
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(-0.75 + i * 0.12);
      if (fm.id === 'ember') flameShape(ctx, 0, 0.02, 0.12 * k, (0.17 + heat * 0.035) * k, t + i * 1.3, fm.c, fm.a);
      else if (fm.id === 'frost') crystal(ctx, 0, 0.03, 0.1 * k, 0.19 * k, fm.g, WHITE);
      else if (fm.id === 'venom') { ctx.fillStyle = fm.d; ctx.beginPath(); ctx.arc(0, -0.035 * k, 0.058 * k, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = fm.a; ctx.beginPath(); ctx.arc(0, -0.04 * k, 0.04 * k, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e9c8ff'; ctx.beginPath(); ctx.arc(0.012, -0.055 * k, 0.012, 0, Math.PI * 2); ctx.fill(); }
      else if (fm.id === 'lumen') { const h = 0.2 * k, sw = Math.sin(t * 2.2 + i) * 0.015; for (const [c, kk] of [[Dk, 1.25], [fm.a, 1], [WHITE, 0.62]]) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, 0.03); ctx.quadraticCurveTo(-0.06 * k * kk, -h * 0.45, sw, -h * (kk > 1 ? 1.06 : kk < 1 ? 0.72 : 1)); ctx.quadraticCurveTo(0.06 * k * kk, -h * 0.45, 0, 0.03); ctx.closePath(); ctx.fill(); } }
      else { const h = 0.2 * k * (0.9 + 0.1 * Math.sin(t * 30 + i)); ctx.fillStyle = fm.a; ctx.beginPath(); ctx.moveTo(-0.05 * k, 0.02); ctx.lineTo(-0.02, -h * 0.5); ctx.lineTo(-0.05, -h * 0.45); ctx.lineTo(0.01, -h); ctx.lineTo(0.03, -h * 0.5); ctx.lineTo(0.06, -h * 0.55); ctx.lineTo(0.05 * k, 0.02); ctx.closePath(); ctx.fill(); ctx.fillStyle = WHITE; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.005, -h * 0.8); ctx.lineTo(0.025, 0); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    });

    // head: a tall casque sweeping back, a blunt snout, a wide mouth
    const hb = Math.sin(t * 2.6 + 1) * 0.008, mo = q.mouth * 0.09;
    ctx.save(); ctx.translate(0.08, -0.6 + hb); ctx.rotate(-q.lean * 0.3 + (m && m.pose === 'spit' ? -0.5 : 0));
    if (fm.id === 'venom') { ctx.fillStyle = fm.a; ctx.beginPath(); ctx.moveTo(-0.16, -0.22); ctx.quadraticCurveTo(-0.4, -0.16, -0.3, 0.12); ctx.quadraticCurveTo(-0.16, 0.06, -0.08, 0.1); ctx.closePath(); ctx.fill(); ol(1); }   // a frilled hood
    // lower jaw
    ctx.fillStyle = fm.b; ctx.beginPath(); ctx.moveTo(-0.06, 0.04); ctx.quadraticCurveTo(0.2, 0.1 + mo * 1.6, 0.4, 0.0 + mo * 1.8); ctx.quadraticCurveTo(0.22, 0.2 + mo, -0.04, 0.16); ctx.closePath(); ctx.fill(); ol(1);
    if (q.mouth > 0.25) { ctx.fillStyle = '#7a1230'; ctx.beginPath(); ctx.moveTo(0.02, 0.02); ctx.lineTo(0.38, -0.02); ctx.lineTo(0.37, 0.0 + mo * 1.7); ctx.quadraticCurveTo(0.2, 0.07 + mo * 1.5, 0.02, 0.06); ctx.closePath(); ctx.fill(); ctx.fillStyle = TONGUE; ctx.beginPath(); ctx.ellipse(0.2, 0.03 + mo, 0.1, 0.028 + mo * 0.3, 0.1, 0, Math.PI * 2); ctx.fill(); }
    // skull + casque
    ctx.fillStyle = skin; ctx.beginPath();
    ctx.moveTo(-0.12, 0.08); ctx.quadraticCurveTo(-0.24, -0.08, -0.2, -0.24); ctx.quadraticCurveTo(-0.17, -0.4, -0.02, -0.42);
    ctx.quadraticCurveTo(0.14, -0.4, 0.2, -0.24); ctx.quadraticCurveTo(0.38, -0.2, 0.44, -0.06); ctx.quadraticCurveTo(0.45, 0.0, 0.4, 0.01);
    ctx.quadraticCurveTo(0.18, 0.07, -0.12, 0.08); ctx.closePath(); ctx.fill(); ol(1.2);
    ctx.fillStyle = mix(fm.c, fm.g, 0.6); ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.ellipse(-0.04, -0.3, 0.1, 0.05, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha /= 0.6;
    ctx.fillStyle = Dk; ctx.beginPath(); ctx.arc(0.39, -0.08, 0.012, 0, Math.PI * 2); ctx.fill();                              // nostril
    if (q.mouth < 0.25) { ctx.strokeStyle = Dk; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(0.4, 0.01); ctx.quadraticCurveTo(0.2, 0.08, 0.02, 0.03); ctx.quadraticCurveTo(-0.02, 0.01, -0.03, -0.03); ctx.stroke(); }   // a smirk
    else if (fm.id === 'venom' || q.mouth > 0.8) { ctx.fillStyle = WHITE; for (const fx of [0.34, 0.26]) { ctx.beginPath(); ctx.moveTo(fx - 0.02, 0.0); ctx.lineTo(fx, 0.06); ctx.lineTo(fx + 0.02, 0.0); ctx.closePath(); ctx.fill(); } }
    // the turret eye: a scaly cone that swivels, with a far eye peeking over the snout
    const look = m ? [0.035, 0.005] : [Math.sin(t * 1.3) * 0.03, Math.cos(t * 1.9) * 0.022], look2 = m ? look : [Math.sin(t * 1.7 + 2) * 0.03, Math.cos(t * 1.1 + 1) * 0.022];
    const eye = (ex0, ey0, r, lk) => {
      ctx.fillStyle = Dk; ctx.beginPath(); ctx.arc(ex0, ey0, r * 1.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mix(fm.c, fm.g, 0.35); ctx.beginPath(); ctx.arc(ex0, ey0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = mix(fm.c, fm.d, 0.4); ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.arc(ex0, ey0, r * 0.78, 0, Math.PI * 2); ctx.stroke();
      const ix = ex0 + lk[0] * r * 9, iy = ey0 + lk[1] * r * 9;
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(ix, iy, r * 0.56, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14101c'; ctx.beginPath(); ctx.arc(ix + lk[0] * r * 3, iy + lk[1] * r * 3, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(ix + r * 0.14, iy - r * 0.2, r * 0.11, 0, Math.PI * 2); ctx.fill();
      if (m) { ctx.strokeStyle = Dk; ctx.lineWidth = r * 0.26; ctx.beginPath(); ctx.moveTo(ex0 - r * 0.9, ey0 - r * 1.05); ctx.lineTo(ex0 + r * 0.9, ey0 - r * 0.45); ctx.stroke(); }   // attacking: a hard brow
    };
    eye(0.3, -0.2, 0.065, look2);
    eye(0.1, -0.16, 0.125, look);
    if (fm.id === 'lumen') {   // a halo floating over his casque
      const hy = -0.53 + Math.sin(t * 2.2) * 0.012;
      for (const [c, w] of [[mix(fm.a, fm.d, 0.45), 0.05], [fm.a, 0.032], [WHITE, 0.01]]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(-0.02, hy, 0.17, 0.05, -0.08, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();

    arm(q.arm, q.reach, false);
    // Frost breathes mist, Volt crackles, Lumen glints
    if (live && fm.id === 'frost' && !m) { const br = (t * 0.6) % 1; ctx.fillStyle = WHITE; ctx.globalAlpha *= 0.5 * (1 - br); ctx.beginPath(); ctx.arc(0.55 + br * 0.15, -0.62 - br * 0.08, 0.03 + br * 0.05, 0, Math.PI * 2); ctx.fill(); }
    if (live && fm.id === 'volt' && Math.sin(t * 9) > 0.55) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = fm.a; ctx.lineWidth = 0.018; const a0 = Math.floor(t * 9) * 2.4; zig(ctx, Math.cos(a0) * 0.3, -0.5 + Math.sin(a0) * 0.35, Math.cos(a0 + 0.9) * 0.4, -0.5 + Math.sin(a0 + 0.9) * 0.45, 4, 0.1); }
    if (live && fm.id === 'lumen' && !m) { const gl = (t * 0.7) % 1, gi = Math.floor(t * 0.7), gx = Math.sin(gi * 2.7) * 0.32, gy = -0.5 + Math.cos(gi * 1.9) * 0.3, r = 0.07 * Math.sin(gl * Math.PI); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = fm.a; ctx.beginPath(); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4, rr = i % 2 ? r * 0.25 : r; ctx.lineTo(gx + Math.cos(an) * rr, gy + Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  const _origDraw = window.cboxCharDraw;
  window.cboxCharDraw = function (charId, ctx, px, py, pw, ph, now2) {
    if (charId !== ID) { if (_origDraw) return _origDraw(charId, ctx, px, py, pw, ph, now2); return; }
    if (!isFinite(px) || !isFinite(py) || !isFinite(pw) || !isFinite(ph) || pw <= 0 || ph <= 0) return;
    const live = window.selectedCharacter === ID && S.active && !window.__ppRemoteDraw;   // menus and the other phone's Chroma: no live move
    ctx.save();
    try { drawBody(ctx, px, py, pw, ph, now2 || Date.now() / 1000, live, live ? P() : null); } catch (e) { oops(e); }
    ctx.restore();
  };
  // the body is posed here, move by move: the strike engine only adds the charge-up colours
  if (window.PPStrikeStyles && window.PPStrikeStyles[ID]) Object.assign(window.PPStrikeStyles[ID], { ownAim: true, live: () => ({}), endlag: () => ({}) });

  // A second fighter (Smash CPU) playing Chroma keeps its own form, moves, shots and zones.
  (window._fighterPlugins = window._fighterPlugins || []).push({ name: 'cham', char: ID,
    swap(s) { const o = S; S = s || fresh(); return o; },
    tick: dt => { if (window.selectedCharacter === ID) step(dt); },
    draw: (ctx, now2, cam) => { if (window.selectedCharacter === ID) drawWorld(ctx, cam); },
    keys: { '0': () => cycleForm() },
    form: () => form().id,
  });
  window.__chroma = { state: () => S, forms: FORMS, moves: MV, cycle: cycleForm, draw: drawBody };
})();
