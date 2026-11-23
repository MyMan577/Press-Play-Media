/* Obby Builder: GALE, a wind runner and her kite. Built for Smash.
 *
 * What makes Gale different: her KITE is a long-range, many-hit weapon on a string. KITE REEL throws it far
 * ahead, snags the first foe it touches, shreds them while it reels them back to her and pops them up at
 * her feet. PINWHEEL whirls it round her again and again in the air. Every kite hit feeds TAILWIND, and
 * Tailwind makes the kite reach further and reel faster. She also shapes the stage: UPDRAFT VENTS stay
 * where she puts them and launch foes (and throw her up), and a charged Downburst becomes a TWISTER.
 *
 * MOVEMENT
 *  - TAILWIND: run one way, or land kite hits, to build up to +40% speed (streaks + an arc under your
 *    feet show it). It also lengthens the kite's string.
 *  - WALL RUN: in the air, run into any wall (or touch it at speed) and you sprint up it. Jump off
 *    for a big WALL KICK that refills the run, so you can climb between two walls forever. Reach the
 *    top of the wall and you VAULT over it. Works on the stage's sides in Smash too.
 *  - KITE RIDE: hold jump while falling to hang from the kite: you float, steer and get a short lift.
 *
 * 8 MOVES (S / ⚔️ + a direction). Hold S to charge any of them into a stronger version.
 *  Ground: neutral KITE LASH (2 hits: down, then a snap back up), side KITE REEL (long range, many hits,
 *          drags the foe to you), up UPDRAFT VENT (lasting launcher you can ride), down DOWNBURST (charged: TWISTER).
 *  Air:    neutral PINWHEEL (many hits, holds foes in the wheel), side SLIPSTREAM, up JETSTREAM, down DIVE KICK (spike, pogo).
 *
 * Works for a second fighter (Smash CPU) through window._fighterPlugins, like the Mixtape.
 */
(function () {
  'use strict';
  const ID = 'cb_gale';
  const DEF = {
    id: ID, name: 'Gale', icon: '🪁', tier: 'gold',
    ability: 'Kite Fighter: a long-range, many-hit kite on a string. Kite Reel, Pinwheel, Wall Run, Kite Ride + 8 moves (hold S to charge)',
    desc: 'A wind runner and her kite. The kite hits from far away and hits many times: KITE REEL snags a foe at range, shreds them and drags them back to her, and PINWHEEL whirls it round her in the air. Every kite hit builds TAILWIND, which lengthens the string. UPDRAFT VENTS stay on the stage and launch foes (ride them yourself), and a charged Downburst becomes a walking TWISTER. Run up any wall, kick off to climb, vault over the top, and hold jump while falling to ride the kite.',
    color: '#5ee6c8'
  };
  const STATS = { speed: 1.15, jump: 1.2, maxJumps: 2, maxDashes: 1, hp: 3 };
  const C_MINT = '#5ee6c8', C_SKY = '#8fd3ff', C_WHITE = '#f2fffb', C_KITE = '#ff7a59', C_GOLD = '#ffd166', C_DARK = '#123432', C_VIOLET = '#b59cff';

  // Gale is free: she joins your roster the first time the game loads
  try {
    const owned = JSON.parse(localStorage.getItem('obby_cbox_owned') || '[]');
    if (!owned.includes(ID)) { owned.push(ID); localStorage.setItem('obby_cbox_owned', JSON.stringify(owned)); }
  } catch (e) {}
  function isOwned() {
    try { return JSON.parse(localStorage.getItem('obby_cbox_owned') || '[]').includes(ID); } catch (e) { return false; }
  }
  function register() {
    if (window.CBOX_CHARS_DEF && !window.CBOX_CHARS_DEF.find(c => c.id === ID)) window.CBOX_CHARS_DEF.push(DEF);
    if (window.cboxOwnedChars) window.cboxOwnedChars.add(ID);
    window._gtCharStatCache = window._gtCharStatCache || {};
    window._gtCharStatCache[ID] = stats();
  }
  if (window.UNIVERSAL_PUNCH_EXCLUDED_CHARS) window.UNIVERSAL_PUNCH_EXCLUDED_CHARS.add(ID);

  const MOVES = {
    ground: { neutral: { name: 'Kite Lash', big: 'STORM LASH', cd: 0.5 }, side: { name: 'Kite Reel', big: 'STORM REEL', cd: 0.55 }, up: { name: 'Updraft Vent', big: 'SKY GEYSER', cd: 0.7 }, down: { name: 'Downburst', big: 'TWISTER', cd: 0.9 } },
    air:    { neutral: { name: 'Pinwheel', big: 'HURRICANE WHEEL', cd: 0.8 }, side: { name: 'Slipstream', big: 'JET SLIPSTREAM', cd: 0.45 }, up: { name: 'Jetstream', big: 'SKY ROCKET', cd: 0.5 }, down: { name: 'Dive Kick', big: 'METEOR DIVE', cd: 0.6 } },
  };
  // strike-engine frame data: light and fast. Holding S charges any of them.
  const MFD = {
    ground_neutral: { windup: 0.05, active: 0.24, endlag: 0.10, sweetDmg: 1, sweetKb: 1.3 },
    ground_side:    { windup: 0.06, active: 0.10, endlag: 0.12 },
    ground_up:      { windup: 0.08, active: 0.10, endlag: 0.18, sweetStop: 0.08, sweetShake: 7 },
    ground_down:    { windup: 0.10, active: 0.14, endlag: 0.20 },
    air_neutral:    { windup: 0.04, active: 0.30, endlag: 0.10, root: false },
    air_side:       { windup: 0.02, sweet: 0.0, active: 0.18, endlag: 0.08, root: false },
    air_up:         { windup: 0.03, sweet: 0.0, active: 0.2, endlag: 0.10, root: false, hang: false },
    air_down:       { windup: 0.05, sweet: 0.0, active: 0.5, endlag: 0.12, root: false, hang: false, stop: 0.06, shake: 5 },
  };
  const TW_BUILD = 1.0, TW_DECAY = 1.6, RIDE_FALL = 2.2;

  // ---- per-fighter state (swapped for the Smash CPU) ----
  let active = false, atkCD = 0, tw = 0, twSaid = 0, twHold = 0, airUpUsed = false, airSideUsed = false, lastDir = 1;
  let lastPX = null, lastPY = null, prevJump = false;
  let kite = null, wr = null, wrStam = 1, wrLastSide = 0, ride = null, rideLift = 0.35, slip = null, dive = null, carry = null;
  const fx = [], vents = [], twisters = [], trail = [];

  // ---- sound: airy whooshes and chimes (its own AudioContext) ----
  let AC = null, out = null, noiseBuf = null;
  function ac() {
    if (AC) { if (AC.state === 'suspended') { try { AC.resume(); } catch (e) {} } return AC; }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return null;
      AC = new Ctor(); out = AC.createGain(); out.gain.value = 0.22;
      const comp = AC.createDynamicsCompressor(); out.connect(comp); comp.connect(AC.destination);
    } catch (e) { AC = null; }
    return AC;
  }
  function tone(freq, o) {
    const a = ac(); if (!a) return; o = o || {};
    const t = a.currentTime + (o.delay || 0), dur = o.dur || 0.15, v = o.vol == null ? 0.3 : o.vol;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(o) {
    const a = ac(); if (!a) return; o = o || {};
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + (o.delay || 0), dur = o.dur || 0.2, v = o.vol == null ? 0.25 : o.vol;
    const src = a.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const fl = a.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = o.q || 1.5;
    fl.frequency.setValueAtTime(o.cut || 1500, t);
    if (o.cutEnd) fl.frequency.exponentialRampToValueAtTime(o.cutEnd, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(out); src.start(t); src.stop(t + dur + 0.05);
  }
  function whoosh(up, big) { noise({ dur: big ? 0.32 : 0.18, cut: up ? 500 : 3000, cutEnd: up ? 3400 : 500, q: 3, vol: big ? 0.26 : 0.16 }); }
  function smack(big) { noise({ dur: 0.06, cut: 2600, q: 1, vol: big ? 0.3 : 0.22 }); tone(big ? 380 : 520, { dur: 0.08, slide: 200, vol: 0.14 }); }
  function chime(n) { for (let i = 0; i < (n || 3); i++) tone(880 * Math.pow(1.335, i), { dur: 0.16, vol: 0.09, delay: i * 0.045 }); }

  // ---- helpers ----
  const BLOCK = new Set(['solid', 'ice', 'crumble', 'mover', 'half']);
  function blocked(x, y, w, h) {
    const wd = window._gameWorld; if (!wd || !wd.tiles) return false;
    for (let tx = Math.floor(x); tx <= Math.floor(x + w - 1e-3); tx++)
      for (let ty = Math.floor(y); ty <= Math.floor(y + h - 1e-3); ty++) {
        const tl = wd.tiles.get(tx + ',' + ty);
        if (tl && BLOCK.has(tl.type)) return true;
      }
    return false;
  }
  function ex(e) { return e.x + (e.w || 0.9) / 2; }
  function ey(e) { return e.y + (e.h || 0.9) / 2; }
  function foes() { return (window._gameEnemies || []).filter(e => e && !e.dead); }
  function within(x, y, r) { return foes().filter(e => { const dx = ex(e) - x, dy = ey(e) - y; return dx * dx + dy * dy <= r * r; }); }
  function msg(s) { if (window._setMessage) window._setMessage(s); }
  function shake(n) { if (window._getScreenShake && window._setScreenShake) window._setScreenShake(Math.max(window._getScreenShake() || 0, n)); }
  function pcx(p) { return p.x + p.w / 2; }
  function pcy(p) { return p.y + p.h / 2; }
  function inSmash() { return !!(window.__smash && window.__smash.active); }
  function stats() { return Object.assign({}, STATS, { speed: STATS.speed + 0.4 * tw }); }
  let statKey = -1;
  function syncStats() {
    const k = Math.round(tw * 20);
    if (k === statKey) return; statKey = k;
    if (window._gtCharStatCache) window._gtCharStatCache[ID] = stats();
  }
  function face(p) { return (p.dashDir || p.lastMoveDir || 1) >= 0 ? 1 : -1; }
  function label(p, text, c, big) { fx.push({ k: 'pop', x: pcx(p), y: p.y - 0.25, t: 0, life: big ? 0.8 : 0.55, text, c: c || C_MINT, big: !!big }); }
  function hit(e, dmg, o) {
    o = o || {};
    // Smash turns damage into percent, so a link hit can be worth less than 1 there; the main game's foes lose whole points
    e.hp = Math.max(0, (e.hp || 1) - (inSmash() ? Math.max(0.25, dmg) : Math.max(1, Math.round(dmg))));
    if (!o.noWind) { tw = Math.min(1, tw + 0.07); twHold = 1.2; }   // kite hits keep the wind up
    e.hitFlash = 0.5;
    if (o.stun) e.stunTimer = Math.max(e.stunTimer || 0, o.stun);
    if (!e._noKnockback) { if (o.kx != null) e.vx = o.kx; if (o.ky != null) e.vy = o.ky; }
    const ang = Math.atan2(o.ky || -1, o.kx || 0.001);
    fx.push({ k: 'spark', x: ex(e), y: ey(e), ang, t: 0, life: o.big ? 0.42 : 0.3, c: o.c || C_MINT, big: !!o.big });
    if (o.big) shake(5);
    if (e.hp <= 0 && !e.dead && window._killEnemy) window._killEnemy(e);
  }
  function keyDirs() {
    const keys = window._gameKeys || new Set(), mk = window.mobileKeys || {};
    return {
      up: keys.has('arrowup') || keys.has('w') || !!mk.up,
      down: keys.has('arrowdown') || !!mk.down,
      right: keys.has('arrowright') || keys.has('d') || !!mk.right,
      left: keys.has('arrowleft') || keys.has('a') || !!mk.left,
      jump: keys.has(' ') || keys.has('w') || keys.has('arrowup') || !!mk.jump,
    };
  }
  function facing(p, k) { return k.right ? 1 : k.left ? -1 : face(p); }
  function newKite(p) { return { x: p ? pcx(p) - face(p) * 1.2 : 0, y: p ? p.y - 1.2 : 0, vx: 0, vy: 0, m: 'follow', t: 0, ang: 0 }; }
  // the kite is out working a many-hit move: no new move until it is done
  function kiteBusy() { return !!kite && (kite.m === 'reel' || kite.m === 'spin' || kite.m === 'lash'); }
  // may a move drag this foe along? (not bosses, not held ones; in Smash not while they shield, dodge or are safe)
  function canDrag(e) {
    if (e._noKnockback || e._held) return false;
    const sm = window.__smash;
    return !(sm && sm.active && sm.__canHold && !sm.__canHold(e));
  }
  function drag(e, tx, ty, sp, dt) {
    if (!canDrag(e)) return;
    const w = e.w || 0.9, h = e.h || 0.9;
    const dx = tx - ex(e), sx = Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
    if (sx && !blocked(e.x + sx, e.y + 0.02, w, h - 0.08)) e.x += sx;
    if (ty != null && inSmash()) {   // Smash fighters hang in the wind; the main game's foes keep their own gravity
      const dy = ty - ey(e), sy = Math.sign(dy) * Math.min(Math.abs(dy), sp * 0.7 * dt);
      if (sy && !blocked(e.x, e.y + sy, w, h - 0.02)) e.y += sy;
    }
  }
  function resetKit() {
    fx.length = 0; vents.length = 0; twisters.length = 0; trail.length = 0;
    slip = dive = carry = wr = ride = null;
    atkCD = 0; airUpUsed = airSideUsed = false; tw = 0; twHold = 0; wrStam = 1; wrLastSide = 0; rideLift = 0.35;
    kite = null; lastPX = lastPY = null;
  }

  // ---- the 8 moves (pw = how long S was held, 0..1) ----
  const ACT = {
    // Kite Lash: the kite swoops over your head and down in front of you (a light hit that pins), then
    // snaps straight back up the same arc (the hit that launches)
    ground_neutral(p, f, pw) {
      const R = 2.4 + 0.6 * tw + 0.8 * pw, k = (1 + 0.6 * tw) * (1 + 0.5 * pw);
      kite.m = 'lash'; kite.t = 0; kite.dur = 0.18; kite.back = 0.16; kite.ph = 0; kite.f = f; kite.R = R; kite.hitSet = new Set();
      kite.dmg = 2 + (tw > 0.7 ? 1 : 0) + Math.round(2 * pw); kite.kx = f * 7 * k; kite.ky = -6 * k;
      whoosh(false, pw > 0.3);
    },
    // Kite Reel: the kite shoots far ahead on its string. The first foe it touches is snagged: the kite
    // shreds them while it reels them back to you, then pops them up at your feet. You can move meanwhile.
    ground_side(p, f, pw) {
      Object.assign(kite, { m: 'reel', ph: 'out', t: 0, f, pw, ox: pcx(p), x: pcx(p) + f * 0.5, y: p.y + p.h * 0.35,
        range: 6 + 1.5 * tw + 2.5 * pw, snag: null, tick: 0, n: 0 });
      whoosh(false, true); chime(2);
    },
    // Updraft Vent: a wind vent on the floor that keeps launching foes, and throws you up if you step in
    ground_up(p, f, pw) {
      if (vents.length >= 2) vents.shift();
      const v = { x: pcx(p) + f * 0.4, fy: p.y + p.h, t: 0, life: 3.5 + 2.5 * pw, h: 4 + 2.5 * pw, w: 1.5 + 0.4 * pw, pw, cool: new Map(), selfCool: 0.25 };
      vents.push(v);
      for (const e of foes()) if (Math.abs(ex(e) - v.x) < v.w * 0.7 && ey(e) < v.fy && ey(e) > v.fy - 2.4) { hit(e, 3 + Math.round(2 * pw), { ky: -14 - 4 * pw, kx: f * 1.5, stun: 0.5, c: C_SKY, big: pw > 0.3 }); v.cool.set(e, 0.9); }
      kite.m = 'pop'; kite.t = 0; kite.px = v.x; kite.py = v.fy;
      p.vy = Math.min(p.vy, -8); p.onGround = false;
      whoosh(true, true); shake(3);
    },
    // Downburst: the kite climbs, then slams into the floor ahead and the wind bursts out both ways.
    // Charged: it spins up a TWISTER that walks across the stage, sucking foes in and spitting them up.
    ground_down(p, f, pw) {
      if (pw > 0.3) {
        if (twisters.length >= 1) twisters.shift();
        twisters.push({ x: pcx(p) + f * 1.2, fy: p.y + p.h, f, t: 0, life: 2.2 + 1.2 * pw, tick: 0.15, pw });
        kite.m = 'pop'; kite.t = 0; kite.px = pcx(p) + f * 1.2; kite.py = p.y + p.h;
        noise({ dur: 0.8, cut: 300, cutEnd: 2500, q: 2, vol: 0.25 }); shake(4);
        return;
      }
      kite.m = 'slam'; kite.t = 0; kite.dur = 0.22; kite.f = f; kite.sx = pcx(p) + f * 2; kite.sy = p.y + p.h - 0.3; kite.done = false; kite.pw = pw;
      tone(700, { dur: 0.18, slide: 1400, vol: 0.1 });
    },
    // Pinwheel: the kite whirls round and round you on its string. It hits again and again, the wind holds
    // foes inside the wheel, and the last turn throws them out. You hang in the air while it spins.
    air_neutral(p, f, pw) {
      Object.assign(kite, { m: 'spin', t: 0, f, pw, dur: 0.6 + 0.2 * pw, revs: 2.5 + pw, R: 2.2 + 0.3 * tw + 0.5 * pw, tick: 0.06, dmg: 2 + Math.round(2 * pw) });
      p.vy = Math.min(p.vy, 0.5);
      whoosh(false, pw > 0.3);
    },
    // Slipstream: an air dash that leaves afterimages and comes back if it hits
    air_side(p, f, pw) {
      airSideUsed = true;
      slip = { t: 0, dur: 0.2 + 0.08 * pw, f, speed: 18 + 4 * tw + 5 * pw, hitSet: new Set(), x0: pcx(p), y: pcy(p), landed: false, pw };
      whoosh(false, true);
    },
    // Jetstream: the kite rockets upward and yanks you after it, hitting whatever is above (once per jump)
    air_up(p, f, pw) {
      airUpUsed = true;
      p.vy = Math.min(p.vy, -14 - 3 * pw);
      kite.m = 'jet'; kite.t = 0;
      for (const e of within(pcx(p), pcy(p) - 1, 1.4)) hit(e, 2 + Math.round(2 * pw), { ky: -11 - 3 * pw, stun: 0.4, c: C_SKY });
      fx.push({ k: 'jet', x: pcx(p), y: p.y + p.h, t: 0, life: 0.5 });
      whoosh(true, true);
    },
    // Dive Kick: a steep diagonal kick that spikes; you pogo off whoever it lands on
    air_down(p, f, pw) {
      dive = { t: 0, f, hitSet: new Set(), pw };
      tone(1000, { dur: 0.14, slide: 300, vol: 0.12 });
    },
  };

  const _prevSlash = window.performSlash;
  window.performSlash = function () {
    if (window.selectedCharacter !== ID) { if (_prevSlash) return _prevSlash.apply(this, arguments); return; }
    const p = window._gamePlayer;
    if (!p || atkCD > 0 || kiteBusy()) return;
    const pick = () => {
      const q = window._gamePlayer; if (!q || window.selectedCharacter !== ID || kiteBusy()) return null;
      const k = keyDirs();
      const stance = q.onGround ? 'ground' : 'air';
      const dir = (k.down && !k.up) ? 'down' : (k.up && !k.down) ? 'up' : (k.left || k.right) ? 'side' : 'neutral';
      const mv = MOVES[stance][dir];
      if (stance === 'air' && dir === 'up' && airUpUsed) { msg('🪁 Jetstream comes back when you land, wall run or ride a vent'); return null; }
      if (stance === 'air' && dir === 'side' && airSideUsed) { msg('🪁 Slipstream comes back when you land or land a hit'); return null; }
      return { key: stance + '_' + dir, mv, f: facing(q, k) };
    };
    const fire = (sel, pw) => {
      const q = window._gamePlayer; if (!q || kiteBusy()) return;
      pw = pw || 0;
      if (!kite) kite = newKite(q);
      atkCD = sel.mv.cd;
      const own = ACT[sel.key](q, sel.f, pw);
      const name = own || (pw > 0.3 ? sel.mv.big : sel.mv.name.toUpperCase());
      label(q, name, pw > 0.3 || own ? C_GOLD : C_MINT, pw > 0.3);
      msg('🪁 ' + name + '!');
    };
    if (window.PPStrike) {
      window.PPStrike.press(() => { const sel = pick(); return sel && { fd: MFD[sel.key], dir: sel.f, color: C_MINT, aim: sel.key.split('_')[1], fire: pw => fire(sel, pw) }; }, true);
      return;
    }
    const sel = pick(); if (sel) fire(sel, 0);
  };

  // ---- the kite ----
  function stepKite(p, dt, enemies) {
    if (!kite) kite = newKite(p);
    const K = kite, f = face(p);
    K.t += dt;
    const hx = pcx(p), hy = p.y + p.h * 0.35;
    const sweep = (x, y, r, dmg, kx, ky, o) => {
      for (const e of enemies) {
        if (K.hitSet && K.hitSet.has(e)) continue;
        if (Math.hypot(ex(e) - x, ey(e) - y) < r + (e.w || 0.9) / 2) { if (K.hitSet) K.hitSet.add(e); hit(e, dmg, Object.assign({ kx, ky, stun: 0.4 }, o || {})); smack(o && o.big); }
      }
    };
    if (K.m === 'lash') {
      // down: from behind your head, over the top, down in front. back: the same arc the other way.
      const a0 = K.f > 0 ? -Math.PI * 0.95 : -Math.PI * 0.05;
      let e2;
      if (!K.ph) { const u = Math.min(1, K.t / K.dur); e2 = 1 - Math.pow(1 - u, 2); }
      else { const u = Math.min(1, K.t / K.back); e2 = 1 - 0.6 * u * u; }
      const a = a0 + K.f * Math.PI * 1.2 * e2;
      K.x = hx + Math.cos(a) * K.R; K.y = hy + Math.sin(a) * K.R; K.ang = a + Math.PI / 2;
      if (!K.ph) {
        if (K.t > K.dur * 0.25) sweep(K.x, K.y, 0.9, 1, K.f * 1.5, 1, { stun: 0.3, c: C_SKY });
        if (K.t >= K.dur) { K.ph = 1; K.t = 0; K.hitSet = new Set(); whoosh(true); }
      } else {
        sweep(K.x, K.y, 1.0, K.dmg, K.kx, K.ky, { big: K.R > 2.9 });
        if (K.t >= K.back) { K.m = 'follow'; K.vx = -K.f * 4; K.vy = -5; }
      }
      return;
    }
    if (K.m === 'spin') {
      const u = Math.min(1, K.t / K.dur), a = -Math.PI / 2 + K.f * Math.PI * 2 * K.revs * u, cx = pcx(p), cy = pcy(p);
      K.x = cx + Math.cos(a) * K.R; K.y = cy + Math.sin(a) * K.R; K.ang = a;
      p.vy = Math.min(p.vy, 1.2);   // you hang while it whirls
      const inWheel = enemies.filter(e => Math.hypot(ex(e) - cx, ey(e) - cy) < K.R + 0.6 + (e.w || 0.9) / 2);
      if (u >= 1) {
        // the last turn throws them out
        for (const e of inWheel) { const s = ex(e) === cx ? K.f : ex(e) > cx ? 1 : -1; hit(e, K.dmg, { kx: s * 7, ky: -8, stun: 0.45, c: C_GOLD, big: true }); }
        if (inWheel.length) { smack(true); fx.push({ k: 'burst', x: cx, y: cy + 0.4, R: K.R, t: 0, life: 0.35 }); }
        K.m = 'follow'; K.vx = K.vy = 0;
        return;
      }
      // the wind holds them in the wheel, just off your side
      for (const e of inWheel) { const s = ex(e) === cx ? K.f : ex(e) > cx ? 1 : -1; drag(e, cx + s * 1.25, cy, 7, dt); }
      K.tick -= dt;
      if (K.tick <= 0) {
        K.tick = 0.13;
        for (const e of inWheel) { const s = ex(e) >= cx ? 1 : -1; hit(e, 0.6, { kx: -s * 1.2, ky: -1.5, stun: 0.3, c: C_SKY }); }
        if (inWheel.length) smack();
      }
      return;
    }
    if (K.m === 'reel') {
      K.ang += dt * 26 * K.f;
      const touching = () => {
        let best = null, bd = 1e9;
        for (const e of enemies) { const d = Math.hypot(ex(e) - K.x, ey(e) - K.y); if (d < 0.8 + (e.w || 0.9) / 2 && d < bd) { best = e; bd = d; } }
        return best;
      };
      if (K.ph === 'out' || K.ph === 'hover') {
        if (K.ph === 'out') {
          // many small steps so a fast kite cannot skip over a foe
          let left = (34 + 8 * tw) * dt;
          while (left > 0 && K.ph === 'out' && !K.snag) {
            const st = Math.min(0.3, left); left -= st;
            const nx = K.x + K.f * st;
            if (blocked(nx - 0.3, K.y - 0.3, 0.6, 0.6) || (nx - K.ox) * K.f >= K.range) { K.ph = 'hover'; K.t = 0; break; }
            K.x = nx; K.snag = touching();
          }
        } else {
          K.y += Math.sin(K.t * 40) * 0.01; K.snag = touching();
          if (!K.snag && K.t > 0.2) { K.m = 'return'; K.t = 0; return; }
        }
        if (K.snag) { K.ph = 'shred'; K.t = 0; K.tick = 0; K.n = 0; label(p, 'SNAGGED!', C_GOLD); tone(990, { dur: 0.08, slide: 1500, vol: 0.12 }); }
        return;
      }
      // shred: the kite sits on the foe, cutting, while the string reels them in to just in front of you
      const e = K.snag;
      if (!e || e.dead || enemies.indexOf(e) < 0) { K.m = 'return'; K.t = 0; return; }
      const side = ex(e) === hx ? K.f : ex(e) > hx ? 1 : -1, gx = hx + side * 1.5;
      drag(e, gx, hy, 8 + 4 * tw + 3 * K.pw, dt);
      K.x = ex(e); K.y = ey(e);
      K.tick -= dt;
      if (K.tick <= 0) {
        K.tick = 0.12; K.n++;
        for (const e2 of within(K.x, K.y, 1.1)) hit(e2, 0.6, { kx: -side * 1.5, ky: -1, stun: 0.3, c: C_SKY });
        smack();
      }
      const home = Math.abs(gx - ex(e)) < 0.35;
      if ((home && K.n >= 4 + Math.round(2 * K.pw)) || K.t > 0.7 + 0.3 * K.pw) {
        // the pop: straight up at your feet, ready for a follow-up
        for (const e2 of within(K.x, K.y, 1.3)) hit(e2, 2 + Math.round(2 * K.pw), { kx: side * 2, ky: -12 - 3 * K.pw, stun: 0.55, c: C_GOLD, big: true });
        fx.push({ k: 'burst', x: K.x, y: K.y + 0.4, R: 1.4, t: 0, life: 0.35 });
        smack(true); chime(3); shake(4);
        K.m = 'return'; K.t = 0; K.snag = null;
      }
      return;
    }
    if (K.m === 'slam') {
      const u = Math.min(1, K.t / K.dur);
      if (u < 0.45) { const v = u / 0.45; K.x = hx + (K.sx - hx) * v * 0.6; K.y = hy - 2.5 * Math.sin(v * Math.PI / 2); K.ang = 0; }
      else { const v = (u - 0.45) / 0.55, x0 = hx + (K.sx - hx) * 0.6, y0 = hy - 2.5; K.x = x0 + (K.sx - x0) * v; K.y = y0 + (K.sy - y0) * v * v; K.ang = Math.PI; }
      if (u >= 1 && !K.done) {
        K.done = true;
        const R = 2.3 + 0.5 * (K.pw || 0);
        for (const e of enemies) if (Math.abs(ex(e) - K.sx) < R && Math.abs(ey(e) - (K.sy - 0.3)) < 1.3) hit(e, 3, { kx: (ex(e) >= K.sx ? 1 : -1) * 6, ky: -9, stun: 0.5, c: C_GOLD, big: true });
        fx.push({ k: 'burst', x: K.sx, y: K.sy + 0.3, R, t: 0, life: 0.45 });
        noise({ dur: 0.35, cut: 2400, cutEnd: 300, q: 2, vol: 0.26 }); smack(true); shake(5);
      }
      if (K.t > K.dur + 0.08) { K.m = 'follow'; K.vy = -6; }
      return;
    }
    if (K.m === 'pop') {   // dips to a spot on the floor and bounces back up
      const u = Math.min(1, K.t / 0.3);
      K.x = K.px + (hx - K.px) * u; K.y = K.py - 0.5 - Math.sin(u * Math.PI) * 2.4; K.ang = 0;
      if (u >= 1) K.m = 'follow';
      return;
    }
    if (K.m === 'jet') {   // rockets up above you, string taut
      K.x += (hx - K.x) * Math.min(1, dt * 20); K.y = Math.min(K.y, p.y - 2.6); K.y += (p.y - 2.8 - K.y) * Math.min(1, dt * 12); K.ang = 0;
      if (K.t > 0.35) K.m = 'follow';
      return;
    }
    if (K.m === 'return') {   // flies home after a Reel
      const dx = hx - K.x, dy = hy - 0.8 - K.y, d = Math.hypot(dx, dy) || 1, sp = 30 * dt;
      K.ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (d <= sp + 0.3) { K.m = 'follow'; K.vx = dx / d * 6; K.vy = dy / d * 6; return; }
      K.x += dx / d * sp; K.y += dy / d * sp;
      return;
    }
    // follow: a springy float up and behind you, bobbing in the wind (above you while you ride it)
    let tx = hx - f * (1.3 + 0.5 * tw), ty = p.y - 1.4 + Math.sin(K.t * 2.6) * 0.18;
    if (ride) { tx = hx - (p.vx || 0) * 0.05; ty = p.y - 1.7; }
    const ax = (tx - K.x) * 60 - K.vx * 11, ay = (ty - K.y) * 60 - K.vy * 11;
    K.vx += ax * dt; K.vy += ay * dt;
    K.x += K.vx * dt; K.y += K.vy * dt;
    if (Math.hypot(K.x - hx, K.y - hy) > 8) { K.x = tx; K.y = ty; K.vx = K.vy = 0; }
    K.ang += ((K.vx * 0.06 + Math.sin(K.t * 3) * 0.12) - K.ang) * Math.min(1, dt * 8);
  }

  // ---- per-frame update (runs after the game has moved the player) ----
  function step(dt) {
    const playing = window.selectedCharacter === ID && (!window._gameMode || window._gameMode() === 'play');
    if (!playing) { if (active) resetKit(); active = false; return; }
    const p = window._gamePlayer; if (!p) return;
    if (!active) { resetKit(); syncStats(); }
    active = true;
    const k = keyDirs(), enemies = foes(), jumpEdge = k.jump && !prevJump;

    // respawned or teleported (or knocked far in Smash): drop moves in progress, the kite comes home
    if (lastPX != null && (Math.abs(p.x - lastPX) > 4 || Math.abs(p.y - lastPY) > 4)) { slip = dive = carry = wr = ride = null; tw = 0; kite = newKite(p); trail.length = 0; }
    if (!kite) kite = newKite(p);

    if (atkCD > 0) atkCD = Math.max(0, atkCD - dt);
    if (p.onGround) { airUpUsed = false; airSideUsed = false; wrStam = 1; wrLastSide = 0; rideLift = 0.35; wr = null; }

    // TAILWIND: builds while you run one way, fades when you stop or turn
    const inX = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    if (inX && inX !== lastDir) { tw *= 0.35; lastDir = inX; }
    const before = tw;
    if (p.onGround) {
      if (inX && Math.abs(p.vx || 0) > 3 && Math.sign(p.vx) === inX) tw = Math.min(1, tw + dt / TW_BUILD);
      else if (twHold <= 0) tw = Math.max(0, tw - dt * TW_DECAY);
    } else if (!inX && !wr) tw = Math.max(0, tw - dt * 0.3);
    if (before < 1 && tw >= 1 && twSaid <= 0) { twSaid = 3; label(p, 'TAILWIND!', C_SKY); chime(3); }
    if (twSaid > 0) twSaid -= dt;
    if (twHold > 0) twHold -= dt;
    syncStats();

    const busy = slip || dive;

    // WALL RUN: in the air, run into a wall (or hit it at speed) and sprint up it.
    // Sprinting into a wall on the ground runs straight up it too.
    const touch = s => blocked(s > 0 ? p.x + p.w + 0.02 : p.x - 0.08, p.y + 0.15, 0.06, p.h - 0.3);
    if (p.onGround && !busy && inX && tw > 0.25 && touch(inX) && !blocked(p.x, p.y - 0.4, p.w, 0.4)) { p.onGround = false; p.y -= 0.05; }
    if (!p.onGround && !busy && !(p.hitstun > 0)) {
      if (!wr) {
        for (const s of [1, -1]) {
          if (wrStam > 0.05 && touch(s) && (inX === s || (p.vx || 0) * s > 3)) {
            if (p.vy > 0 && wrStam >= 1) p.vy = 0; wr = { side: s, t: 0 }; tw = Math.max(tw, 0.5); airUpUsed = false; label(p, 'WALL RUN!', C_MINT); whoosh(true); break; }
        }
      }
      if (wr) {
        const s = wr.side;
        if (jumpEdge) {
          // WALL KICK: off the wall with a big push; the run refills so you can climb between walls
          const same = wrLastSide === s;
          p.vx = -s * (12 + 4 * tw); p.vy = -14;
          carry = { vx: p.vx, t: 0.4 };
          wrStam = same ? Math.max(0.35, wrStam * 0.6) : 1; wrLastSide = s;
          p.lastWallJumpSide = 0; if (window._setJumpCount) window._setJumpCount(1);
          fx.push({ k: 'kick', x: s > 0 ? p.x + p.w : p.x, y: pcy(p), s, t: 0, life: 0.4 });
          label(p, 'WALL KICK!', C_GOLD); whoosh(true, true); tone(520, { dur: 0.1, slide: 900, vol: 0.12 });
          wr = null;
        } else if (inX === -s || wrStam <= 0) {
          wr = null;   // let go (or out of breath: you slide off)
        } else if (!touch(s)) {
          // ran off the top: VAULT over the edge
          p.vy = -11; p.vx = s * 7; carry = { vx: s * 7, t: 0.3 };
          fx.push({ k: 'kick', x: pcx(p), y: p.y + p.h, s: -s, t: 0, life: 0.35 });
          label(p, 'VAULT!', C_GOLD); whoosh(true);
          wr = null;
        } else {
          wr.t += dt; wrStam -= dt / (1.1 + 0.6 * tw);
          p.vy = -(5 + 8 * Math.max(0, wrStam));   // fastest at the start, slowing as you run out
          p.vx = s * 2;
          if (Math.random() < dt * 30) fx.push({ k: 'dust', x: s > 0 ? p.x + p.w : p.x, y: p.y + p.h, t: 0, life: 0.35, s });
        }
      }
    } else if (p.onGround) wr = null;

    // KITE RIDE: hold jump while falling and hang from the kite
    const wasRiding = !!ride;
    ride = (!p.onGround && !busy && !wr && k.jump && (p.vy || 0) > -1 && !(p.hitstun > 0) && kite && kite.m !== 'reel' && kite.m !== 'spin' && kite.m !== 'return') ? (ride || { t: 0 }) : null;
    if (ride) {
      ride.t += dt;
      if (rideLift > 0) { rideLift -= dt; p.vy = Math.min(p.vy, -2.5); }
      else p.vy = Math.min(p.vy, RIDE_FALL);
      const want = inX * (7 + 5 * tw);
      if (inX && Math.abs(p.vx || 0) < Math.abs(want)) p.vx = (p.vx || 0) + (want - (p.vx || 0)) * Math.min(1, dt * 8);
      if (!wasRiding) { whoosh(true); tone(740, { dur: 0.1, vol: 0.07 }); }
      if (Math.random() < dt * 14) fx.push({ k: 'leaf', x: pcx(p) + (Math.random() - 0.5), y: p.y - 0.6, t: 0, life: 0.8, r: Math.random() * 6 });
    }

    // a carried speed burst (wall kick, vault, slipstream) the game's friction would eat at once
    if (carry) {
      carry.t -= dt;
      const s = Math.sign(carry.vx);
      carry.vx -= s * 14 * dt;
      if (carry.t <= 0 || Math.sign(carry.vx) !== s || wr) carry = null;
      else if (Math.abs(p.vx || 0) < Math.abs(carry.vx) && !(inX && inX !== s)) p.vx = carry.vx;
    }

    // Updraft vents: launch foes, and throw you up if you step in (refills Jetstream and Slipstream)
    for (let i = vents.length - 1; i >= 0; i--) {
      const v = vents[i]; v.t += dt; v.selfCool -= dt;
      for (const [e, c] of v.cool) { if (c - dt <= 0) v.cool.delete(e); else v.cool.set(e, c - dt); }
      for (const e of enemies) if (!v.cool.has(e) && Math.abs(ex(e) - v.x) < v.w * 0.6 && ey(e) < v.fy + 0.2 && ey(e) > v.fy - v.h) { v.cool.set(e, 0.9); hit(e, 2, { ky: -13 - 3 * v.pw, kx: 0, stun: 0.4, c: C_SKY }); }
      if (v.selfCool <= 0 && Math.abs(pcx(p) - v.x) < v.w * 0.6 && p.y + p.h > v.fy - v.h && p.y < v.fy + 0.1) {
        v.selfCool = 0.45; p.vy = Math.min(p.vy, -15 - 2 * v.pw); p.onGround = false; airUpUsed = false; airSideUsed = false; wrStam = 1; rideLift = 0.35;
        label(p, 'UPDRAFT!', C_SKY); whoosh(true, true);
      }
      if (v.t > v.life) vents.splice(i, 1);
    }

    // Twister: walks across the stage, sucks foes in and spits them up
    for (let i = twisters.length - 1; i >= 0; i--) {
      const tz = twisters[i]; tz.t += dt;
      const nx = tz.x + tz.f * (2.6 + tz.pw) * dt;
      if (!blocked(nx - 0.4, tz.fy - 2, 0.8, 1.8)) tz.x = nx; else tz.f = -tz.f;
      tz.tick -= dt;
      for (const e of enemies) {
        const dx = tz.x - ex(e), dy = (tz.fy - 1.2) - ey(e);
        if (Math.abs(dx) < 3 && Math.abs(dy) < 2.5 && !e._noKnockback && !e._held) { e.x += Math.sign(dx) * Math.min(Math.abs(dx), 3.5 * dt); }
      }
      if (tz.tick <= 0) {
        tz.tick = 0.4;
        for (const e of enemies) if (Math.abs(ex(e) - tz.x) < 1.1 && ey(e) > tz.fy - 3 && ey(e) < tz.fy + 0.3) hit(e, 1, { kx: tz.f * 2, ky: -7, stun: 0.45, c: C_VIOLET });
      }
      if (tz.t > tz.life) {
        for (const e of enemies) if (Math.abs(ex(e) - tz.x) < 1.6 && ey(e) > tz.fy - 3.5 && ey(e) < tz.fy + 0.3) hit(e, 3, { kx: tz.f * 4, ky: -15, stun: 0.6, c: C_VIOLET, big: true });
        fx.push({ k: 'burst', x: tz.x, y: tz.fy, R: 2, t: 0, life: 0.4 });
        whoosh(true, true); twisters.splice(i, 1);
      }
    }

    stepKite(p, dt, enemies);

    // Slipstream
    if (slip) {
      const c = slip, prevT = c.t; c.t = Math.min(c.dur, c.t + dt);
      const stp = c.f * c.speed * (c.t - prevT);
      if (!blocked(p.x + stp, p.y + 0.02, p.w, p.h - 0.04)) p.x += stp; else c.t = c.dur;
      p.vy = 0; p.dashInvuln = Math.max(p.dashInvuln || 0, 0.08);
      for (const e of enemies) {
        if (c.hitSet.has(e)) continue;
        if (ex(e) > p.x - 0.45 && ex(e) < p.x + p.w + 0.45 && ey(e) > p.y - 0.4 && ey(e) < p.y + p.h + 0.4) {
          c.hitSet.add(e); c.landed = true;
          hit(e, 3 + Math.round(2 * c.pw), { kx: c.f * (9 + 4 * c.pw), ky: -5, stun: 0.45, big: c.pw > 0.3 }); smack();
        }
      }
      if (c.t >= c.dur) {
        if (c.landed) { airSideUsed = false; atkCD = Math.min(atkCD, 0.1); label(p, 'REFRESH!', C_GOLD); chime(2); }
        carry = { vx: c.f * 8, t: 0.3 }; slip = null;
      }
    }

    // Dive Kick
    if (dive) {
      dive.t += dt;
      p.vy = 21 + 4 * dive.pw; p.vx = dive.f * 11;
      let landed = null;
      for (const e of enemies) {
        if (dive.hitSet.has(e)) continue;
        if (ex(e) > p.x - 0.3 && ex(e) < p.x + p.w + 0.3 && ey(e) > p.y + p.h * 0.3 && e.y < p.y + p.h + 0.3) { landed = e; break; }
      }
      if (landed) {
        dive.hitSet.add(landed);
        hit(landed, 3 + Math.round(2 * dive.pw), { kx: dive.f * 3, ky: 14 + 4 * dive.pw, stun: 0.5, c: C_KITE, big: true });
        fx.push({ k: 'burst', x: ex(landed), y: landed.y, R: 1.2, t: 0, life: 0.35 });
        if (!inSmash()) p.vy = -12;               // Smash does its own pogo for meteor hits
        p.vx = dive.f * 4; airUpUsed = false; dive = null;
      } else if (p.onGround && dive.t > 0.03) {
        for (const e of within(pcx(p), p.y + p.h - 0.4, 1.5)) hit(e, 1, { kx: (ex(e) >= pcx(p) ? 1 : -1) * 4, ky: -5, stun: 0.3 });
        fx.push({ k: 'burst', x: pcx(p), y: p.y + p.h, R: 1.5, t: 0, life: 0.3 });
        carry = { vx: dive.f * 10, t: 0.35 };   // you skid out of it
        noise({ dur: 0.15, cut: 900, vol: 0.18 }); dive = null;
      } else if (dive.t > 0.55) dive = null;
    }

    // afterimages while moving fast
    const fast = slip || dive || wr || (carry && Math.abs(carry.vx) > 6);
    if (fast) trail.push({ x: p.x, y: p.y, w: p.w, h: p.h, f: face(p), t: 0 });
    for (let i = trail.length - 1; i >= 0; i--) { trail[i].t += dt; if (trail[i].t > 0.22) trail.splice(i, 1); }
    if (trail.length > 10) trail.splice(0, trail.length - 10);

    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); }
    prevJump = k.jump;
    lastPX = p.x; lastPY = p.y;
  }
  (window._rafHubTickers = window._rafHubTickers || []).push(step);

  // ---- drawing: the player ----
  // hooded wind runner with goggles and a short scarf; arms up while riding the kite
  const _origDraw = window.cboxCharDraw;
  window.cboxCharDraw = function (charId, ctx, px, py, pw, ph, now2) {
    if (charId !== ID) { if (_origDraw) return _origDraw(charId, ctx, px, py, pw, ph, now2); return; }
    if (!isFinite(px) || !isFinite(py) || !isFinite(pw) || !isFinite(ph) || pw <= 0 || ph <= 0) return;
    const t = now2 || Date.now() / 1000, cx = px + pw / 2, s = pw / 20;
    const pl = window._gamePlayer;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // scarf: two tapered tails streaming back, longer with Tailwind
    for (let j = 0; j < 2; j++) {
      const n = 5, len = 0.55 + 0.35 * tw + j * 0.12;
      ctx.beginPath();
      const pts = [];
      for (let i = 0; i <= n; i++) { const u = i / n; pts.push([cx - pw * (0.05 + u * len), py + ph * (0.42 + j * 0.04 + u * 0.06) + Math.sin(t * 11 + i * 1.1 + j) * s * 1.6 * u]); }
      for (let i = 0; i <= n; i++) ctx.lineTo(pts[i][0], pts[i][1] - s * 1.2 * (1 - i / n));
      for (let i = n; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1] + s * 1.2 * (1 - i / n));
      ctx.closePath(); ctx.fillStyle = j ? C_GOLD : C_KITE; ctx.fill();
    }
    ctx.shadowBlur = 6 + tw * 12; ctx.shadowColor = 'rgba(94,230,200,0.8)';
    // body: a cropped jacket over a dark suit
    ctx.fillStyle = C_DARK; ctx.beginPath(); ctx.roundRect(px + pw * 0.24, py + ph * 0.42, pw * 0.52, ph * 0.4, s * 2); ctx.fill();
    ctx.shadowBlur = 0;
    const jg = ctx.createLinearGradient(px, py + ph * 0.4, px + pw, py + ph * 0.7);
    jg.addColorStop(0, '#3fd1b4'); jg.addColorStop(1, '#2a8fbf');
    ctx.fillStyle = jg; ctx.beginPath(); ctx.roundRect(px + pw * 0.2, py + ph * 0.4, pw * 0.6, ph * 0.24, s * 2.4); ctx.fill();
    ctx.strokeStyle = C_WHITE; ctx.lineWidth = s * 0.7;
    ctx.beginPath(); ctx.moveTo(px + pw * 0.26, py + ph * 0.6); ctx.quadraticCurveTo(cx, py + ph * 0.5, px + pw * 0.74, py + ph * 0.6); ctx.stroke();
    // arms: up on the kite string while riding, otherwise swinging
    ctx.strokeStyle = '#2a8fbf'; ctx.lineWidth = s * 2.4;
    if (ride && pl && window.selectedCharacter === ID) {
      ctx.beginPath(); ctx.moveTo(px + pw * 0.3, py + ph * 0.45); ctx.lineTo(cx - s * 1, py + ph * 0.02); ctx.moveTo(px + pw * 0.7, py + ph * 0.45); ctx.lineTo(cx + s * 1, py + ph * 0.02); ctx.stroke();
    } else {
      const sw = Math.sin(t * (10 + tw * 10)) * s * 2;
      ctx.beginPath(); ctx.moveTo(px + pw * 0.26, py + ph * 0.46); ctx.lineTo(px + pw * 0.16 - sw, py + ph * 0.66); ctx.moveTo(px + pw * 0.74, py + ph * 0.46); ctx.lineTo(px + pw * 0.86 + sw, py + ph * 0.66); ctx.stroke();
    }
    // legs (a running stride that quickens with Tailwind)
    ctx.fillStyle = '#0d2422';
    const stride = pl && pl.onGround && Math.abs(pl.vx || 0) > 1 ? Math.sin(t * (12 + tw * 12)) * s * 2.2 : 0;
    ctx.fillRect(px + pw * 0.28 + stride, py + ph * 0.8, pw * 0.15, ph * 0.13);
    ctx.fillRect(px + pw * 0.57 - stride, py + ph * 0.8, pw * 0.15, ph * 0.13);
    ctx.fillStyle = C_WHITE; ctx.fillRect(px + pw * 0.26 + stride, py + ph * 0.9, pw * 0.19, ph * 0.04); ctx.fillRect(px + pw * 0.55 - stride, py + ph * 0.9, pw * 0.19, ph * 0.04);
    // hood with a pointed tip that flaps, face, goggles
    ctx.fillStyle = '#3fd1b4';
    ctx.beginPath(); ctx.arc(cx, py + ph * 0.25, pw * 0.29, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - pw * 0.2, py + ph * 0.1); ctx.quadraticCurveTo(cx - pw * 0.45, py + ph * 0.02 + Math.sin(t * 9) * s, cx - pw * 0.55, py + ph * 0.16 + Math.sin(t * 9) * s * 1.5); ctx.lineTo(cx - pw * 0.26, py + ph * 0.24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f1d3b5'; ctx.beginPath(); ctx.arc(cx + pw * 0.07, py + ph * 0.28, pw * 0.19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C_DARK; ctx.fillRect(cx - pw * 0.1, py + ph * 0.215, pw * 0.38, s * 2.6);
    const gg = ctx.createLinearGradient(0, py + ph * 0.2, 0, py + ph * 0.27); gg.addColorStop(0, '#d8f7ff'); gg.addColorStop(1, '#4fb7ff');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(cx + pw * 0.04, py + ph * 0.24, s * 1.6, 0, Math.PI * 2); ctx.arc(cx + pw * 0.19, py + ph * 0.24, s * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx + pw * 0.03, py + ph * 0.228, s * 0.55, 0, Math.PI * 2); ctx.arc(cx + pw * 0.18, py + ph * 0.228, s * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // ---- drawing: the world (kite, wind, vents, twisters, hits) ----
  function glow(ctx, col, a) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.fillStyle = col; ctx.strokeStyle = col; }
  // a tapered ribbon of wind through screen points: thick at the start, a point at the end
  function taper(ctx, pts, w0, col, a, core) {
    if (pts.length < 2) return;
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
      const w = w0 * Math.pow(1 - i / (pts.length - 1), 0.7) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, (i + 1) / pts.length * 1.6)));
      L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
    }
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
    for (const q of L) ctx.lineTo(q[0], q[1]);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
    glow(ctx, col, a * 0.85); ctx.fill();
    if (core !== false) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); glow(ctx, '#ffffff', a * 0.7); ctx.lineWidth = Math.max(1, w0 * 0.25); ctx.stroke(); }
  }
  // a crescent slash along an arc (screen space), tapered at both ends
  function crescent(ctx, cx, cy, r, a0, a1, thick, col, a) {
    const n = 18; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const u = i / n, an = a0 + (a1 - a0) * u; ctx.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
    for (let i = n; i >= 0; i--) { const u = i / n, an = a0 + (a1 - a0) * u, rr = r - thick * Math.sin(Math.PI * u) * (0.4 + 0.6 * u); ctx.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr); }
    ctx.closePath(); glow(ctx, col, a); ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= n; i++) { const an = a0 + (a1 - a0) * i / n; ctx.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
    glow(ctx, '#ffffff', a * 0.9); ctx.lineWidth = 1.5; ctx.stroke();
  }
  function star(ctx, x, y, r, rot, col, a) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const an = rot + i * Math.PI / 4, rr = i % 2 ? r * 0.28 : r; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    ctx.closePath(); glow(ctx, col, a); ctx.fill();
  }
  function leaf(ctx, x, y, rot, s, col, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.7, s, 0); ctx.quadraticCurveTo(0, s * 0.7, -s, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fill(); ctx.restore();
  }
  function drawKite(ctx, x, y, ang, T, now, glowA) {
    const s = T * 0.42;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.shadowBlur = 10 + 14 * glowA; ctx.shadowColor = C_GOLD;
    // four panels in two colours
    const P = [[0, -s * 1.15], [s * 0.75, -s * 0.15], [0, s * 0.95], [-s * 0.75, -s * 0.15]];
    const cols = [C_KITE, C_GOLD, C_KITE, C_GOLD];
    for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; ctx.beginPath(); ctx.moveTo(0, -s * 0.15); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fillStyle = cols[i]; ctx.fill(); }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = C_DARK; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (const q of P) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.moveTo(P[3][0], P[3][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.stroke();
    // a wind-eye emblem in the middle
    ctx.strokeStyle = C_WHITE; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -s * 0.15, s * 0.22, now * 6, now * 6 + Math.PI * 1.4); ctx.stroke();
    // tail with bows
    ctx.strokeStyle = C_DARK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, s * 0.95);
    const tail = [];
    for (let i = 1; i <= 6; i++) { const tx = Math.sin(now * 7 + i * 0.9) * s * 0.35 * (i / 6), ty = s * 0.95 + i * s * 0.32; tail.push([tx, ty]); ctx.lineTo(tx, ty); }
    ctx.stroke();
    for (let i = 1; i < tail.length; i += 2) { const [bx, by] = tail[i]; ctx.fillStyle = i % 4 === 1 ? C_MINT : C_WHITE; ctx.beginPath(); ctx.moveTo(bx - s * 0.22, by - s * 0.12); ctx.lineTo(bx + s * 0.22, by + s * 0.12); ctx.lineTo(bx + s * 0.22, by - s * 0.12); ctx.lineTo(bx - s * 0.22, by + s * 0.12); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function ghost(ctx, x, y, w, h, a, col) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(x + w * 0.2, y + h * 0.4, w * 0.6, h * 0.5, w * 0.1); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.25, w * 0.29, 0, Math.PI * 2); ctx.fill();
  }

  function drawWorld(ctx, cam) {
    const p = window._gamePlayer; if (!p || !active) return;
    const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0;
    const SX = x => x * T - cx0, SY = y => y * T - cy0, now = performance.now() / 1000;
    const hx = SX(pcx(p)), hy = SY(p.y + p.h * 0.35);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowBlur = 0;

    // afterimages
    for (const g of trail) { const u = g.t / 0.22; ghost(ctx, SX(g.x), SY(g.y), g.w * T, g.h * T, 0.35 * (1 - u), u < 0.4 ? C_SKY : C_MINT); }

    // updraft vents: a glowing grate, a column of light and wind spiralling up it, chevrons rising
    for (const v of vents) {
      const x = SX(v.x), fy = SY(v.fy), H = v.h * T * Math.min(1, v.t * 5), W = v.w * T, fade = Math.min(1, (v.life - v.t) * 2);
      const g = ctx.createLinearGradient(0, fy, 0, fy - H); g.addColorStop(0, 'rgba(94,230,200,0.55)'); g.addColorStop(0.6, 'rgba(143,211,255,0.22)'); g.addColorStop(1, 'rgba(143,211,255,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade; ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - W * 0.45, fy); ctx.lineTo(x - W * 0.6, fy - H); ctx.lineTo(x + W * 0.6, fy - H); ctx.lineTo(x + W * 0.45, fy); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 3; i++) {   // spiral ribbons the full height
        const pts = [];
        for (let j = 0; j <= 16; j++) { const u = j / 16; pts.push([x + Math.sin(now * 7 + i * 2.1 - u * 7) * W * (0.3 + 0.15 * u), fy - H * u]); }
        taper(ctx, pts.reverse(), 2 + 3 * (i === 0), i === 0 ? C_WHITE : i === 1 ? C_MINT : C_SKY, fade * 0.85, i === 0);
      }
      for (let i = 0; i < 4; i++) {   // chevrons climbing
        const ph = (now * 1.4 + i / 4) % 1, y = fy - H * ph, c = W * 0.28;
        ctx.beginPath(); ctx.moveTo(x - c, y + c * 0.5); ctx.lineTo(x, y); ctx.lineTo(x + c, y + c * 0.5);
        glow(ctx, C_WHITE, fade * Math.sin(ph * Math.PI)); ctx.lineWidth = 3; ctx.stroke();
      }
      for (let i = 0; i < 5; i++) { const ph = (now * 0.9 + i * 0.21) % 1; leaf(ctx, x + Math.sin(now * 3 + i * 2) * W * 0.45, fy - H * ph, now * 5 + i, T * 0.12, i % 2 ? '#9be7a1' : C_GOLD, fade * (1 - ph)); }
      // the vent grate
      ctx.beginPath(); ctx.ellipse(x, fy - 2, W * 0.55, T * 0.16, 0, 0, Math.PI * 2); glow(ctx, C_MINT, fade * 0.6); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade; ctx.fillStyle = C_DARK; ctx.beginPath(); ctx.roundRect(x - W * 0.45, fy - 6, W * 0.9, 7, 3); ctx.fill();
      glow(ctx, C_MINT, fade); ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * W * 0.15, fy - 5); ctx.lineTo(x + i * W * 0.15, fy); ctx.stroke(); }
    }

    // twisters: a funnel of turning bands, debris flying round it
    for (const tz of twisters) {
      const x = SX(tz.x), fy = SY(tz.fy), H = T * 3.4 * Math.min(1, tz.t * 4), fade = Math.min(1, (tz.life - tz.t) * 3);
      for (let i = 0; i < 9; i++) {
        const u = i / 8, y = fy - H * u, r = T * (0.3 + 1.3 * u * u), wob = Math.sin(now * 5 + u * 4) * T * 0.25 * u;
        ctx.beginPath(); ctx.ellipse(x + wob, y, r, r * 0.22, 0, now * 9 + i, now * 9 + i + Math.PI * 1.5);
        glow(ctx, i % 3 === 0 ? C_VIOLET : i % 3 === 1 ? C_SKY : C_WHITE, fade * (0.5 + 0.5 * u)); ctx.lineWidth = 2.5 + u * 2.5; ctx.stroke();
      }
      for (let i = 0; i < 6; i++) { const an = now * 7 + i * 1.05, u = ((i * 0.37 + now * 0.5) % 1); leaf(ctx, x + Math.cos(an) * T * (0.4 + 1.2 * u), fy - H * u + Math.sin(an) * T * 0.2, an * 2, T * 0.12, i % 2 ? '#9be7a1' : '#c9a27a', fade); }
    }

    // the kite's string: sags when slack, taut when it's working
    if (kite) {
      const kx = SX(kite.x), ky = SY(kite.y), d = Math.hypot(kx - hx, ky - hy);
      const taut = kite.m !== 'follow' || ride;
      const sag = taut ? 0 : Math.max(0, T * 2.2 - d * 0.4) * 0.5 + 6;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9; ctx.strokeStyle = '#e8fff9'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + kx) / 2, (hy + ky) / 2 + sag, kx, ky); ctx.stroke();
      if (taut) { glow(ctx, C_MINT, 0.5); ctx.lineWidth = 3; ctx.stroke(); }
      // the kite's path while it attacks: a wide crescent of wind
      if (kite.m === 'lash') {
        const a0 = kite.f > 0 ? -Math.PI * 0.95 : -Math.PI * 0.05, sw = kite.f * Math.PI * 1.2, R = kite.R * T, big = kite.R > 2.9;
        let e2, from, col;
        if (!kite.ph) { const u = Math.min(1, kite.t / kite.dur); e2 = 1 - Math.pow(1 - u, 2); from = Math.max(0, e2 - 0.55); col = C_SKY; }
        else { const u = Math.min(1, kite.t / kite.back); e2 = 1 - 0.6 * u * u; from = Math.min(1, e2 + 0.45); col = C_MINT; }
        const lo = a0 + sw * Math.min(e2, from), hi = a0 + sw * Math.max(e2, from);
        crescent(ctx, hx, hy, R + T * 0.25, Math.min(lo, hi), Math.max(lo, hi), T * 0.6, col, 0.85);
        if (big) crescent(ctx, hx, hy, R + T * 0.6, Math.min(lo, hi), Math.max(lo, hi), T * 0.35, C_GOLD, 0.6);
      } else if (kite.m === 'spin') {
        const u = Math.min(1, kite.t / kite.dur), a1 = -Math.PI / 2 + kite.f * Math.PI * 2 * kite.revs * u, a0 = a1 - kite.f * Math.PI * 1.3, R = kite.R * T, cy = SY(pcy(p));
        // the whole wheel glows faintly so you can see what it covers, with two bright blades chasing round it
        ctx.beginPath(); ctx.arc(hx, cy, R + T * 0.3, 0, Math.PI * 2); glow(ctx, C_SKY, 0.22); ctx.lineWidth = T * 0.5; ctx.stroke();
        for (const off of [0, Math.PI]) {
          if (kite.f > 0) crescent(ctx, hx, cy, R + T * 0.3, a0 + off, a1 + off, T * 0.55, off ? C_MINT : C_SKY, off ? 0.55 : 0.85);
          else crescent(ctx, hx, cy, R + T * 0.3, a1 + off, a0 + off, T * 0.55, off ? C_MINT : C_SKY, off ? 0.55 : 0.85);
        }
        for (let i = 0; i < 3; i++) { const an = a1 - kite.f * i * 0.5; star(ctx, hx + Math.cos(an) * (R + T * 0.5), cy + Math.sin(an) * (R + T * 0.5), T * 0.12, now * 8, C_WHITE, 0.8 - i * 0.2); }
      } else if (kite.m === 'slam' && kite.t < kite.dur) {
        const pts = []; for (let i = 0; i <= 6; i++) pts.push([kx - Math.sin(kite.ang) * 0, ky - (kite.t / kite.dur > 0.45 ? 1 : -1) * i * T * 0.25]);
        taper(ctx, pts, T * 0.25, C_GOLD, 0.8);
      } else if (kite.m === 'return' || (kite.m === 'reel' && kite.ph === 'out')) {
        const pts = []; const back = kite.m === 'reel' ? -kite.f : Math.sign(kite.x - pcx(p)) || 1;
        for (let i = 0; i <= 6; i++) pts.push([kx + back * i * T * 0.35, ky + Math.sin(now * 20 + i) * 3]);
        taper(ctx, pts, T * 0.22, kite.m === 'reel' ? C_MINT : C_GOLD, 0.8);
        if (kite.m === 'reel') for (let i = 0; i < 2; i++) crescent(ctx, kx, ky, T * 0.7, now * 30 + i * Math.PI, now * 30 + i * Math.PI + 1.8, T * 0.22, C_WHITE, 0.7);
      } else if (kite.m === 'reel') {
        // snagged (or waiting at the end of the string): a buzzing ring of blades round the kite
        const hot = kite.ph === 'shred';
        for (let i = 0; i < 3; i++) crescent(ctx, kx, ky, T * (hot ? 1.0 : 0.75), now * 26 + i * 2.1, now * 26 + i * 2.1 + 1.5, T * 0.28, i === 0 ? C_WHITE : hot ? C_GOLD : C_MINT, hot ? 0.85 : 0.6);
        if (hot) { ctx.beginPath(); ctx.arc(kx, ky, T * (1.0 + 0.15 * Math.sin(now * 40)), 0, Math.PI * 2); glow(ctx, C_GOLD, 0.5); ctx.lineWidth = 2; ctx.stroke(); }
      }
      drawKite(ctx, kx, ky, kite.ang, T, now, kite.m === 'follow' ? tw : 1);
    }

    // Tailwind streaks behind you, as tapered ribbons
    if (tw > 0.15) {
      const d = (p.vx || lastDir) >= 0 ? -1 : 1, n = 1 + Math.round(tw * 3), cy = SY(pcy(p));
      for (let i = 0; i < n; i++) {
        const yy = cy + (i - (n - 1) / 2) * T * 0.22, L = T * (0.6 + ((now * 5 + i * 0.31) % 1) * 1.6 * tw), pts = [];
        for (let j = 0; j <= 8; j++) { const u = j / 8; pts.push([hx + d * (T * 0.4 + L * u), yy + Math.sin(now * 14 + u * 5 + i) * 2.5]); }
        taper(ctx, pts, 2 + 2 * tw, i % 2 ? C_SKY : C_MINT, 0.3 + 0.4 * tw, false);
      }
    }
    // riding the kite: a soft wing of wind over the kite
    if (ride && kite) { ctx.beginPath(); ctx.ellipse(SX(kite.x), SY(kite.y) - T * 0.2, T * 1.0, T * 0.3, 0, Math.PI * 1.05, Math.PI * 1.95); glow(ctx, C_WHITE, 0.6); ctx.lineWidth = 2; ctx.stroke(); }
    // wall run: wind blasting off the wall under your feet
    if (wr) { const wx = wr.side > 0 ? SX(p.x + p.w) : SX(p.x), pts = []; for (let j = 0; j <= 8; j++) pts.push([wx - wr.side * Math.sin(j * 0.6) * 4, SY(p.y + p.h) + j * T * 0.18]); taper(ctx, pts, T * 0.18, C_MINT, 0.8); }
    // dive kick: a spear of wind behind you and the kite trailing it
    if (dive) {
      const pts = []; for (let j = 0; j <= 8; j++) pts.push([hx - dive.f * j * T * 0.25, SY(pcy(p)) - j * T * 0.45]);
      taper(ctx, pts, T * 0.4, C_KITE, 0.85);
      star(ctx, hx + dive.f * T * 0.3, SY(p.y + p.h), T * 0.25, now * 10, C_GOLD, 0.8);
    }
    if (slip) { const cy = SY(pcy(p)), dd = -slip.f; for (let i = -1; i <= 1; i++) { const pts = []; for (let j = 0; j <= 8; j++) pts.push([hx + dd * j * T * 0.35, cy + i * T * 0.25 + Math.sin(j + now * 30) * 1.5]); taper(ctx, pts, T * (i ? 0.12 : 0.22), i ? C_SKY : C_WHITE, 0.8); } }
    // Tailwind meter: an arc under your feet
    if (tw > 0.02) { ctx.beginPath(); ctx.arc(hx, SY(p.y + p.h) + 4, T * 0.42, Math.PI * 0.15, Math.PI * (0.15 + 0.7 * tw)); glow(ctx, tw >= 1 ? C_WHITE : C_MINT, 0.8); ctx.lineWidth = 2.5; ctx.stroke(); }

    for (const f of fx) {
      const u = f.t / f.life, a = 1 - u;
      if (f.k === 'spark') {
        const x = SX(f.x), y = SY(f.y), R = T * (f.big ? 0.9 : 0.6);
        star(ctx, x, y, R * (0.5 + u), f.ang + u, '#ffffff', a);
        ctx.beginPath(); ctx.arc(x, y, R * (0.4 + u * 1.1), 0, Math.PI * 2); glow(ctx, f.c, a); ctx.lineWidth = 3 * a + 1; ctx.stroke();
        for (let i = 0; i < 6; i++) { const an = f.ang + (i - 2.5) * 0.35, r1 = R * (0.5 + u), r2 = R * (0.9 + u * 1.6); ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); ctx.lineTo(x + Math.cos(an) * r2, y + Math.sin(an) * r2); glow(ctx, f.c, a); ctx.lineWidth = 2; ctx.stroke(); }
      } else if (f.k === 'burst') {
        const x = SX(f.x), y = SY(f.y), R = f.R * T * (0.3 + 0.7 * Math.min(1, u * 2));
        ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.3, 0, 0, Math.PI * 2); glow(ctx, C_GOLD, a); ctx.lineWidth = 4 * a + 1; ctx.stroke();
        for (const d of [1, -1]) { const pts = []; for (let j = 0; j <= 8; j++) { const v = j / 8; pts.push([x + d * R * (0.2 + v), y - Math.sin(v * Math.PI) * T * 0.7 * a]); } taper(ctx, pts, T * 0.2, C_SKY, a); }
      } else if (f.k === 'jet') {
        for (let i = -1; i <= 1; i++) { const pts = []; for (let j = 0; j <= 8; j++) pts.push([SX(f.x) + i * T * 0.2 + Math.sin(j + f.t * 30) * 2, SY(f.y) + j * T * 0.3 * (0.5 + u)]); taper(ctx, pts, T * (i ? 0.12 : 0.22), i ? C_SKY : C_WHITE, a); }
      } else if (f.k === 'kick') {
        const x = SX(f.x), y = SY(f.y);
        star(ctx, x, y, T * 0.5 * (0.6 + u), u * 3, C_GOLD, a);
        ctx.beginPath(); ctx.ellipse(x, y, T * 0.25 * (1 + u), T * 0.8 * (0.5 + u), 0, 0, Math.PI * 2); glow(ctx, C_MINT, a); ctx.lineWidth = 2.5; ctx.stroke();
      } else if (f.k === 'dust') {
        ctx.beginPath(); ctx.arc(SX(f.x) - f.s * u * 8, SY(f.y) + u * 10, T * (0.06 + u * 0.12), 0, Math.PI * 2); glow(ctx, C_WHITE, a * 0.6); ctx.fill();
      } else if (f.k === 'leaf') {
        leaf(ctx, SX(f.x) + Math.sin(f.t * 6 + f.r) * 6, SY(f.y) + u * T * 0.8, f.r + f.t * 6, T * 0.1, f.r > 3 ? '#9be7a1' : C_GOLD, a);
      } else if (f.k === 'pop') {
        // move name: a slanted pop-in title with a two-tone outline
        const x = SX(f.x), y = SY(f.y) - 14 - f.t * 22, sc = (u < 0.15 ? 0.6 + u / 0.15 * 0.6 : 1.2 - Math.min(0.2, (u - 0.15) * 0.8)) * (f.big ? 1.25 : 1);
        ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -0.18, 1, 0, 0); ctx.scale(sc, sc);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 5; ctx.strokeStyle = C_DARK; ctx.strokeText(f.text, 0, 0);
        ctx.lineWidth = 2; ctx.strokeStyle = f.c; ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = '#ffffff'; ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  const _prevDrawHook = window.drifterDrawHook;
  window.drifterDrawHook = function (ctx, now2, cam) {
    if (_prevDrawHook) _prevDrawHook(ctx, now2, cam);
    if (window.selectedCharacter !== ID) return;
    try { drawWorld(ctx, cam); } catch (e) {}
  };

  // A second fighter (Smash CPU) playing Gale keeps its own kite, vents, twisters, Tailwind and moves.
  (window._fighterPlugins = window._fighterPlugins || []).push({ name: 'gale', char: ID,
    swap(s) {
      const o = { active, atkCD, tw, twSaid, twHold, airUpUsed, airSideUsed, lastDir, lastPX, lastPY, prevJump, kite, wr, wrStam, wrLastSide, ride, rideLift, slip, dive, carry,
        kiteBusy: kiteBusy(), fx: fx.splice(0), vents: vents.splice(0), twisters: twisters.splice(0), trail: trail.splice(0) };
      s = s || { active: true };
      active = !!s.active; atkCD = s.atkCD || 0; tw = s.tw || 0; twSaid = s.twSaid || 0; twHold = s.twHold || 0; airUpUsed = !!s.airUpUsed; airSideUsed = !!s.airSideUsed; lastDir = s.lastDir || 1;
      lastPX = s.lastPX != null ? s.lastPX : null; lastPY = s.lastPY != null ? s.lastPY : null; prevJump = !!s.prevJump;
      kite = s.kite || null; wr = s.wr || null; wrStam = s.wrStam == null ? 1 : s.wrStam; wrLastSide = s.wrLastSide || 0; ride = s.ride || null; rideLift = s.rideLift == null ? 0.35 : s.rideLift;
      slip = s.slip || null; dive = s.dive || null; carry = s.carry || null;
      if (s.fx) fx.push(...s.fx); if (s.vents) vents.push(...s.vents); if (s.twisters) twisters.push(...s.twisters); if (s.trail) trail.push(...s.trail);
      statKey = -1; if (window._gtCharStatCache && window._gtCharStatCache[ID]) window._gtCharStatCache[ID] = stats();   // speed follows whoever's turn it is
      return o;
    },
    tick: dt => { if (window.selectedCharacter === ID) step(dt); },
    draw: (ctx, now2, cam) => { if (window.selectedCharacter === ID) drawWorld(ctx, cam); },
  });

  // join the character list once the capsule system is ready
  let tries = 0;
  function hook() {
    if (!window.injectCboxCharButtons || !window.CBOX_CHARS_DEF) { if (++tries < 80) setTimeout(hook, 100); return; }
    if (!window.injectCboxCharButtons._galePatch) {
      const orig = window.injectCboxCharButtons;
      window.injectCboxCharButtons = function () { if (isOwned()) register(); orig(); };
      window.injectCboxCharButtons._galePatch = true;
    }
    if (isOwned()) { register(); window.injectCboxCharButtons(); }
  }
  setTimeout(hook, 250);
})();
