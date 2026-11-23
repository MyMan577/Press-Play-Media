/* Obby Builder: SMASH MODE
 * A platform-fighter mode. Damage is a percent that never kills you; the higher it is,
 * the farther every hit launches you. Get knocked past the blast zone and you lose a stock.
 *
 * How it works with the rest of the game (nothing in the 20 characters was rewritten):
 *  - Only real fighters can play (FIGHTERS below), for you and for the CPU.
 *  - The opponent is a hidden "enemy" with a huge HP pool. Every existing attack already
 *    knows how to hit enemies, so each frame we read how much HP it lost and what knockback the
 *    attack gave it, throw that away and re-apply it as percent damage + percent-scaled launch.
 *  - Your own knockback is run by this file (the game's air friction would otherwise stop a
 *    launch after a few tiles).
 *  - Hooks in index.html: SM.pre / SM.post around update(), SM.draw after drawPlayer(),
 *    dieAndRespawn / takeDamage / R-key routed through here while a match is on.
 * Everything tunable is in BAL (global feel) and CH (per fighter).
 */
(function () {
  'use strict';
  var G = function () { return window.__obby; };
  var W = function () { return window._gameWorld; };
  var T = 40;

  // ---------------------------------------------------------------- roster
  // "Actual fighters": characters with their own combat kit (the game's own combat list).
  // Capsule fighters only show up once you own them.
  var FIGHTERS = [
    { id: 'brawler',        n: 'Brawler',      e: '🥊' },
    { id: 'archmage',       n: 'Arch Mage',    e: '🧙' },
    { id: 'phantomace',     n: 'Phantom Ace',  e: '🃏' },
    { id: 'formSwitcher',   n: 'Elem. Spirit', e: '🌀' },
    { id: 'conduit',        n: 'Conduit',      e: '⚡' },
    { id: 'cb_slugger',     n: 'Slugger',      e: '🥊', cap: 1 },
    { id: 'cb_protagonist', n: 'Protagonist',  e: '🗡️', cap: 1 },
    { id: 'cb_pressplay',   n: 'Press Play Prodigy', e: '🎧', cap: 1 },
    { id: 'cb_pp_mixtape',  n: 'Press Play Mixtape', e: '📼', cap: 1 },
    { id: 'cb_chameleon',   n: 'Chroma',       e: '🦎', cap: 1 },
    { id: 'cb_gale',        n: 'Gale',         e: '🪁', cap: 1 },
    { id: 'cb_kodiak',      n: 'Kodiak',       e: '🐻', cap: 1 },
    { id: 'cb_valka',       n: 'Valka',        e: '🔱', cap: 1 },
    { id: 'cb_boiler',      n: 'Boiler',       e: '♨️', cap: 1 },
    { id: 'cb_sleight',     n: 'Sleight',      e: '🎩', cap: 1 },
    { id: 'cb_fizz',        n: 'Fizz',         e: '🫧', cap: 1 },
    { id: 'cb_maul',        n: 'Maul',         e: '🔨', cap: 1 },
    { id: 'cb_masque',      n: 'Masque',       e: '🎭', cap: 1 },
    { id: 'cb_mario_ref',   n: 'M-Man',        e: '🔧', cap: 1 },
    { id: 'cb_luigi_ref',   n: 'L-Brother',    e: '🪠', cap: 1 },
    { id: 'cb_peach_ref',   n: 'K-Princess',   e: '🪁', cap: 1 },
    { id: 'pl_grand_pebble', n: 'Grand Pebble', e: '🪨', cap: 1 }
  ];
  function owned(id) { try { return JSON.parse(localStorage.getItem('obby_cbox_owned') || '[]').indexOf(id) >= 0; } catch (e) { return false; } }
  function roster() { return FIGHTERS.filter(function (f) { return !f.cap || owned(f.id); }); }
  function isFighter(id) { return roster().some(function (f) { return f.id === id; }); }
  function fInfo(id) { for (var i = 0; i < FIGHTERS.length; i++) if (FIGHTERS[i].id === id) return FIGHTERS[i]; return { id: id, n: id, e: '🥊' }; }

  // ---------------------------------------------------------------- balance
  var BAL = {
    pctPerDmg: 4,        // percent gained per 1 point of the game's own damage
    flinch: 2,           // a hit that does no damage still adds this much
    maxPctHit: 40,       // cap on one registered hit
    kbBase: 0.42,        // launch = soft-capped hit strength * (kbBase + kbGrow * percent) / weight
    kbGrow: 0.02,        // knockback leans on percent: strong hits still kill, just later (charged ~90%+, not 50%)
    kbSoft: 22,
    chipK: 0.35,         // damage with no knockback (poison, burns, beam ticks): this share of normal percent, no launch
    healK: 0.7,          // a healing move (Chroma's Lumen): each point it mends takes this share of pctPerDmg off its user
    chipMax: 3.5,        // ...and at most this much percent per second from it
    minLaunchAng: 0.66,  // radians (~38 deg): sideways hits still launch upward, like a fighting game, not along the floor
    stunGrav: 0.4,       // gravity share while in hitstun: launched fighters carry along their arc instead of sagging          // hit strength soft cap: huge charged impulses from the game get squashed toward this
    minImp: 5,           // weakest hit strength counted
    maxLaunch: 46,       // tiles/s
    decayAir: 3.5,       // horizontal slow-down while launched (tiles/s^2)
    decayGround: 30,
    stunK: 0.016,        // hitstun seconds per tile/s of launch
    stunMin: 0.12, stunMax: 0.95,
    rehit: 0.11,         // seconds between registered hits on the same victim
    grav: 42, fall: 25,
    blastX: 26, blastTop: 22, blastBot: 12,
    respawnInv: 2.2, respawnHold: 2.6,
    shieldMax: 60, shieldDrain: 14, shieldRegen: 9, shieldBreakStun: 1.6,
    dodgeT: 0.32, dodgeInv: 0.26, dodgeSpeed: 14, airDodgeT: 0.35, airDodgeSpeed: 13,
    ledgeInv: 1.0, ledgeMax: 3.0, ledgeCD: 0.55,
    spikeK: 1.18,        // meteor hits (launch straight down) on an airborne victim: extra downward speed
    spikeBounce: 0.8,    // a spiked victim that hits the floor bounces back up with this share of the speed
    popUp: 13,           // a meteor hit on a grounded victim pops them up instead (tiles/s)
    liftK: 1.12,         // launchers (launch straight up): extra height, less sideways drift
    hopV: 11, hopCD: 0.9 // a launcher below kill range lets the attacker hop after the victim (juggle)
  };
  // per fighter: w = weight (heavier flies less), d = damage dealt multiplier, k = knockback dealt multiplier
  var CH = {
    brawler:        { w: 1.10, d: 1.00, k: 1.00, mv: {
      meteor: { ix: 0, iy: 17, d: 1.1, bounce: 1 },                       // STOMP: spikes, and he pogos off them
      launch: { ix: 2, iy: -18, d: 1.2 } } },                             // UPPERCUT: heavy launcher
    archmage:       { w: 0.85, d: 1.00, k: 1.00, mv: {
      meteor: { ix: 0, iy: 15, d: 1.0, sweet: 1 },                        // SPEAR PLUMMET: only the tip spikes
      launch: { ix: 1, iy: -20, d: 1.0 } } },                             // ICE PILLAR: tall launch
    phantomace:     { w: 0.90, d: 1.00, k: 1.00, leech: 0.15 },          // life leecher: many-hit moves (ace.js), heals this share of the percent he deals
    formSwitcher:   { w: 0.95, d: 1.00, k: 1.00, mv: {
      meteor: { ix: 0, iy: 14, d: 1.0 },
      launch: { ix: 1, iy: -17, d: 1.0 } } },
    conduit:        { w: 0.90, d: 0.95, k: 1.00, mv: {
      meteor: { ix: 0, iy: 19, d: 1.0, sweet: 1 } } },                    // GROUND PULSE: strongest spike, tiny sweet spot
    cb_slugger:     { w: 1.05, d: 1.00, k: 1.00, mv: {
      launch: { ix: 1, iy: -21, d: 1.3 } } },                             // GUT UPPERCUT: biggest launcher, no spike
    cb_protagonist: { w: 1.00, d: 1.00, k: 1.00, mv: {
      meteor: { ix: 0, iy: 16, d: 1.0, bounce: 1 },                       // PLUNGE STAB: bounces him back up
      launch: { ix: 2, iy: -17, d: 1.0, rocket: 1 } } },                  // SKY UPPERCUT: he follows the launch
    cb_pressplay:   { w: 1.00, d: 0.95, k: 1.00, mv: {
      launch: { ix: 0, iy: -18, d: 1.0 } } },                             // RISER BLAST
    cb_pp_mixtape:  { w: 0.95, d: 0.95, k: 0.95, mv: {
      meteor: { ix: 0, iy: 15, d: 0.9 },                                  // SPOOL SNARE: on the ground it pops them up
      launch: { ix: 0, iy: -15, d: 0.9, rocket: 1 } } },                  // TAPE TORNADO
    cb_chameleon:   { w: 0.88, d: 0.95, k: 0.95 },                        // five forms, each its own fighter (chroma.js): spikes and launchers are the moves' own
    cb_gale:        { w: 0.82, d: 0.92, k: 0.95, mv: {                    // light and fast: dies earlier, lives on mobility
      meteor: { ix: 2, iy: 16, d: 1.0, bounce: 1 },                       // DIVE KICK: slanted spike, pogos off
      launch: { ix: 1, iy: -17, d: 1.0 } },                               // UPDRAFT / JETSTREAM
    cb_kodiak:      { w: 1.35, d: 1.10, k: 1.10 },                        // the heavyweight: his grabs and armor do the work
    cb_valka:       { w: 0.95, d: 1.00, k: 1.00 },                        // spear: tipper hits are her own (they hit harder at the tip)
    cb_boiler:      { w: 1.15, d: 1.00, k: 1.05 },                        // steam engine: stored Pressure makes every move stronger
    cb_sleight:     { w: 0.80, d: 0.95, k: 0.95 },                        // stage magician: teleports, decoys and card mines
    cb_fizz:        { w: 0.80, d: 0.90, k: 0.90 },                        // bubble blower: lots of small hits from range; light
    cb_maul:        { w: 1.50, d: 1.25, k: 1.30 },                        // hammer smith: the heaviest (hardest to launch), armored swings that hit hardest
    cb_masque:      { w: 0.95, d: 0.95, k: 1.00 },                        // mask dancer: five forms, heals through SM.__heal
    cb_mario_ref:   { w: 1.10, d: 1.00, k: 1.00 },                        // M-Man: sturdy stomper; power-up forms come from tasks (fighter-mman.js)
    cb_luigi_ref:   { w: 0.88, d: 0.95, k: 1.00 },                        // L-Brother: light, floaty, a grapple; power-up forms too (fighter-lbro.js)
    cb_peach_ref:   { w: 0.90, d: 0.95, k: 1.00 },                        // K-Princess: floats, kites that loop back, a counter
    pl_grand_pebble: { w: 1.40, d: 1.10, k: 1.10 }                        // Grand Pebble: a heavy stone, armour and quakes
    }
  };
  function ch(id) { return CH[id] || { w: 1, d: 1, k: 1 }; }

  // CPU skill levels: 1 easy .. 3 hard (0 = training dummy)
  var LV = {
    // react: reaction time (s)  aggr: how often it swings  shield: chance to defend a swing it noticed  recover: recovery skill
    // cd: breather between attacks  dmg: damage multiplier  pred: aims at where you are going  combo/punish: follow-ups and punishes it takes
    // edge: edgeguarding  di: survival DI  read: how much it adapts to your habits  nav: climbs platforms  kill: goes for kill moves
    // air: air dodges  mix: unpredictability  err: chance to miss a chance
    1: { react: 0.38, aggr: 0.35, shield: 0.15, recover: 0.8, cd: 0.80, dmg: 0.85, pred: 0.2, combo: 0.25, punish: 0.25, edge: 0,   di: 0,   read: 0,   nav: 0.6, kill: 0.3, air: 0,    mix: 0.5,  err: 0.18 },
    2: { react: 0.22, aggr: 0.62, shield: 0.38, recover: 0.88, cd: 0.50, dmg: 1.00, pred: 0.6, combo: 0.6,  punish: 0.6,  edge: 0.3, di: 0.5, read: 0.5, nav: 0.9, kill: 0.7, air: 0.4,  mix: 0.35, err: 0.07 },
    3: { react: 0.13, aggr: 0.92, shield: 0.65, recover: 1.00, cd: 0.28, dmg: 1.10, pred: 1.0, combo: 0.9,  punish: 0.9,  edge: 0.7, di: 1,   read: 1,   nav: 1,   kill: 1,   air: 0.75, mix: 0.2,  err: 0.02 }
  };

  // the CPU's moves, in the same units as the player's attacks (d = game damage, ix/iy = launch strength)
  var MOVES = {
    jab:   { wind: .07, act: .09, rec: .16, box: { dx: .1,  dy: -.35, w: 1.5, h: .8  }, d: 1,   ix: 5,  iy: -2 },
    ftilt: { wind: .13, act: .10, rec: .24, box: { dx: .1,  dy: -.4,  w: 1.9, h: .85 }, d: 1.6, ix: 9,  iy: -3 },
    smash: { wind: .40, act: .12, rec: .48, box: { dx: .1,  dy: -.5,  w: 2.4, h: 1.0 }, d: 3,   ix: 17, iy: -6,  lunge: 3 },
    utilt: { wind: .10, act: .12, rec: .26, box: { dx: -.7, dy: -1.7, w: 1.4, h: 1.5 }, d: 1.5, ix: 1.5, iy: -12 },
    dash:  { wind: .10, act: .20, rec: .38, box: { dx: 0,   dy: -.4,  w: 1.8, h: .8  }, d: 2,   ix: 14, iy: -4,  lunge: 13 },
    nair:  { wind: .06, act: .16, rec: .14, air: 1, box: { dx: -.9, dy: -.9, w: 1.8, h: 1.5 }, d: 1.2, ix: 5, iy: -4 },
    uair:  { wind: .08, act: .12, rec: .16, air: 1, box: { dx: -.7, dy: -1.7, w: 1.4, h: 1.4 }, d: 1.6, ix: 1.5, iy: -13 },
    dair:  { wind: .14, act: .14, rec: .22, air: 1, box: { dx: -.6, dy: .4,  w: 1.2, h: 1.3 }, d: 2,   ix: 1,  iy: 14 },
    // launchers and meteors
    usmash: { wind: .34, act: .14, rec: .50, box: { dx: -.8, dy: -2.3, w: 1.6, h: 2.1 }, d: 2.8, ix: 2, iy: -19 },            // slow ground launcher, kills upward
    rise:   { wind: .07, act: .16, rec: .34, air: 1, hop: -12, box: { dx: -.7, dy: -2.0, w: 1.4, h: 1.9 }, d: 1.8, ix: 1.5, iy: -15 }, // hopping uppercut, carries the user up too
    meteor: { wind: .18, act: .18, rec: .30, air: 1, dive: 9, box: { dx: -.5, dy: .45, w: 1.0, h: 1.3 }, d: 2.4, ix: 0, iy: 18 },     // hovers, then dives feet first: a committed spike
    bair:   { wind: .09, act: .10, rec: .18, air: 1, back: 1, box: { dx: .1, dy: -.8, w: 1.7, h: 1.3 }, d: 2, ix: 13, iy: -5 }          // back air, hits behind
  };

  // ---------------------------------------------------------------- stages
  function tl(x, y, type) { return { key: x + ',' + y, x: x, y: y, w: 1, h: 1, type: type || 'solid' }; }
  function rowT(out, x0, x1, y, type) { for (var x = x0; x <= x1; x++) out.push(tl(x, y, type)); }
  var STAGES = {
    battlefield: { n: 'Battlefield', e: '🏟️', d: 'Wide floor, 3 floating platforms',
      build: function (o) { rowT(o, 184, 216, 50); rowT(o, 186, 214, 51); rowT(o, 189, 211, 52);
        rowT(o, 187, 193, 47, 'cloud'); rowT(o, 207, 213, 47, 'cloud'); rowT(o, 197, 203, 44, 'cloud');
        return { spawn: [{ x: 190, y: 50 }, { x: 210, y: 50 }], respawn: { x: 200, y: 38 } }; } },
    pit: { n: 'Final Pit', e: '⬛', d: 'Flat and small. No platforms, no excuses',
      build: function (o) { rowT(o, 188, 212, 50); rowT(o, 190, 210, 51); rowT(o, 193, 207, 52);
        return { spawn: [{ x: 192, y: 50 }, { x: 208, y: 50 }], respawn: { x: 200, y: 40 } }; } },
    tower: { n: 'Tower', e: '🗼', d: 'Narrow base, tall platforms',
      build: function (o) { rowT(o, 192, 208, 52); rowT(o, 194, 206, 53);
        rowT(o, 185, 191, 49, 'cloud'); rowT(o, 209, 215, 49, 'cloud'); rowT(o, 195, 205, 46, 'cloud'); rowT(o, 197, 203, 43, 'cloud');
        return { spawn: [{ x: 195, y: 52 }, { x: 205, y: 52 }], respawn: { x: 200, y: 38 } }; } },
    isles: { n: 'Isles', e: '🏝️', d: 'Three islands with gaps between',
      build: function (o) { rowT(o, 194, 206, 50); rowT(o, 196, 204, 51);
        rowT(o, 180, 187, 48); rowT(o, 181, 186, 49); rowT(o, 213, 220, 48); rowT(o, 214, 219, 49);
        rowT(o, 197, 203, 45, 'cloud');
        return { spawn: [{ x: 183, y: 48 }, { x: 217, y: 48 }], respawn: { x: 200, y: 38 } }; } },
    course: { n: 'My Course', e: '🧱', d: 'Fight on your own build, around its Smash spots or the start', build: null }
  };
  var STAGE_ORDER = ['battlefield', 'pit', 'tower', 'isles', 'course'];

  var FULL = { solid: 1, ice: 1, crumble: 1, breakable: 1, sand: 1, sticky: 1, oily: 1, mover: 1, conveyor: 1, conveyor_l: 1, drillable: 1, phantom: 1 };
  function tileAt(x, y) { var w = W(); return w ? w.tiles.get(x + ',' + y) : null; }
  function isFull(t) { return !!(t && FULL[t.type]); }
  function solidRect(t) {
    if (!t) return null;
    if (FULL[t.type]) return { x: t.x, y: t.y, w: 1, h: 1 };
    if (t.type === 'half') return t.halfVariant === 'top' ? { x: t.x, y: t.y, w: 1, h: .5 } : { x: t.x, y: t.y + .5, w: 1, h: .5 };
    return null;
  }

  // ---------------------------------------------------------------- state
  var SM = { active: false, phase: 'off', cfg: null, net: null };
  var me = null, foe = null, stage = null, backup = null, fx = [], banner = null, matchT = 0, clock = 0;
  var down = {}, prevDown = {}, blocked = false, saved = null, guardBtn = false;
  var MOVE_KEYS = ['a', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', ' ', 's'];
  SM.__bal = BAL; SM.__ch = CH; SM.__roster = roster; SM.__fighters = FIGHTERS;

  var BIG = 1e6;
  function mkEnt() {
    return { type: 'enemy_fighter', x: 0, y: 0, w: .72, h: .92, vx: 0, vy: 0, onGround: false, hp: BIG, maxHp: BIG,
      hitFlash: 0, stunTimer: 0, slowTimer: 0, slowHitsLeft: 0, dir: 1, timer: 0, alertTimer: 0, dead: false,
      _held: true, _thrown: false, _smashHidden: true, _smashFoe: true };
  }
  function pctColor(p) { return p < 50 ? '#fff' : p < 100 ? '#ffe36b' : p < 150 ? '#ffa43a' : p < 200 ? '#ff5a3a' : '#c4162a'; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function sgn(v) { return v < 0 ? -1 : 1; }
  function clampv(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------------------------------------------------------------- launch maths
  // strength (ix, iy) is the knockback the game's own attack asked for; percent decides how much of it you get
  function launch(ix, iy, pct, weight, kMul, fromX, victimX, grounded) {
    var mag = Math.hypot(ix, iy);
    var dx, dy;
    if (mag < 0.01) { dx = sgn(victimX - fromX) * 0.9; dy = -0.45; mag = BAL.minImp; var n = Math.hypot(dx, dy); dx /= n; dy /= n; }
    else { dx = ix / mag; dy = iy / mag; }
    // everything except a downward spike leaves at least minLaunchAng above horizontal
    if (!(iy > 7 && iy > Math.abs(ix) * 1.1) && -dy < Math.sin(BAL.minLaunchAng)) {
      var sx = sgn(dx) || sgn(victimX - fromX) || 1; dx = sx * Math.cos(BAL.minLaunchAng); dy = -Math.sin(BAL.minLaunchAng);
    }
    // soft cap: small hits keep their size, giant ones (charged attacks hand us 40-60+) level off near kbSoft
    var S = BAL.kbSoft * (1 - Math.exp(-Math.max(mag, BAL.minImp) / BAL.kbSoft));
    var L = S * (BAL.kbBase + BAL.kbGrow * pct) * (kMul || 1) / (weight || 1);
    L = clampv(L, 3, BAL.maxLaunch);
    if (grounded && dy > -0.2 && L > 14) { dy = -0.32; var m2 = Math.hypot(dx, dy); dx /= m2; dy /= m2; }
    return { vx: dx * L, vy: dy * L, L: L, stun: clampv(L * BAL.stunK, BAL.stunMin, BAL.stunMax) };
  }

  // meteor = hit that sends the victim straight down, lift = hit that sends them straight up
  function classify(ix, iy) {
    var ax = Math.abs(ix);
    if (iy > 7 && iy > ax * 1.1) return 'meteor';
    if (iy < -8 && -iy > ax * 1.1) return 'lift';
    return '';
  }
  function styleLaunch(Ln, kind, grounded, v) {
    if (kind === 'meteor') {
      if (grounded) { Ln.vx *= 0.3; Ln.vy = -BAL.popUp; Ln.stun += 0.12; v.spiked = false; return 'pop'; }
      Ln.vy = Math.min(BAL.maxLaunch, Ln.vy * BAL.spikeK); Ln.vx *= 0.55; Ln.stun += 0.08; v.spiked = true; return 'spike';
    }
    if (kind === 'lift') { Ln.vy *= BAL.liftK; Ln.vx *= 0.6; Ln.stun *= 1.1; return 'lift'; }
    return '';
  }
  function flair(kind, b) {
    var x = b.x + b.w / 2, y = b.y + b.h / 2;
    if (kind === 'spike') { addFx('ring', x, y, '#ff3b6b'); addFx('burst', x, y + 0.3, '#ff3b6b', 24); }
    else if (kind === 'pop') { addFx('ring', x, y + b.h / 2, '#ffd23b'); }
    else if (kind === 'lift') { addFx('ring', x, y, '#6bd0ff'); addFx('burst', x, y - 0.3, '#6bd0ff', 20); }
  }

  // ---------------------------------------------------------------- body physics (CPU)
  function moveBody(b, dt, drop) {
    var w = W();
    b.wallHit = 0;
    b.x += b.vx * dt;
    var tx0 = Math.floor(b.x), tx1 = Math.floor(b.x + b.w - 1e-4), ty0 = Math.floor(b.y), ty1 = Math.floor(b.y + b.h - 1e-4), tx, ty, r;
    for (ty = ty0; ty <= ty1; ty++) for (tx = tx0; tx <= tx1; tx++) {
      r = solidRect(tileAt(tx, ty)); if (!r) continue;
      if (b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y) {
        if (b.vx > 0) { b.x = r.x - b.w; b.wallHit = 1; } else if (b.vx < 0) { b.x = r.x + r.w; b.wallHit = -1; }
      }
    }
    var prevBottom = b.y + b.h;
    b.y += b.vy * dt; b.onGround = false;
    tx0 = Math.floor(b.x); tx1 = Math.floor(b.x + b.w - 1e-4); ty0 = Math.floor(b.y); ty1 = Math.floor(b.y + b.h - 1e-4);
    for (ty = ty0; ty <= ty1; ty++) for (tx = tx0; tx <= tx1; tx++) {
      var t = tileAt(tx, ty); if (!t) continue;
      r = solidRect(t);
      if (r) {
        if (b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y) {
          if (b.vy >= 0) { b.y = r.y - b.h; b.onGround = true; b.landVy = b.vy; b.vy = 0; } else { b.y = r.y + r.h; b.vy = 0; }
        }
      } else if (t.type === 'cloud' && b.vy >= 0 && !drop) {
        if (b.x < t.x + 1 && b.x + b.w > t.x && prevBottom <= t.y + 0.08 && b.y + b.h > t.y) { b.y = t.y - b.h; b.onGround = true; b.landVy = b.vy; b.vy = 0; }
      }
    }
  }
  function groundBelow(x, y0, maxd) { // y of the first solid/cloud top at column x going down
    for (var y = Math.floor(y0); y < Math.floor(y0) + (maxd || 30); y++) { var t = tileAt(Math.floor(x), y); if (t && (solidRect(t) || t.type === 'cloud')) return y; }
    return null;
  }

  // ---------------------------------------------------------------- stage setup
  function analyze(def, cfg) {
    var w = W(), minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, sp = w.spawn;
    // My Course: the Smash spots set in the builder, if any. The arena is the part of the course around them.
    var xs = (!def && w.xs) || {}, u1 = xs.s1 || null, u2 = xs.s2 || null;
    if (u1 || u2) sp = u1 && u2 ? { x: (u1.x + u2.x) / 2, y: Math.min(u1.y, u2.y) } : (u1 || u2);
    var range = cfg.stage === 'course' ? 55 : 1e9;
    w.tiles.forEach(function (t) {
      if (!(FULL[t.type] || t.type === 'half' || t.type === 'cloud')) return;
      if (Math.abs(t.x - sp.x) > range) return;
      minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x + 1); minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y + 1);
    });
    if (minX > maxX) { minX = sp.x - 10; maxX = sp.x + 10; minY = sp.y - 6; maxY = sp.y + 4; }
    var st = { x0: minX, x1: maxX, top: minY, bottom: maxY, ledges: [] };
    st.blast = { left: Math.max(-4, minX - BAL.blastX), right: Math.min(window._WORLD_W + 4, maxX + BAL.blastX),
      top: Math.max(-12, minY - BAL.blastTop), bottom: Math.min(window._WORLD_H - 3.2, maxY + BAL.blastBot) };
    w.tiles.forEach(function (t) {
      if (!isFull(t) || t.type === 'mover' || Math.abs(t.x - sp.x) > range) return;
      if (isFull(tileAt(t.x, t.y - 1))) return;
      if (!solidRect(tileAt(t.x - 1, t.y)) && !solidRect(tileAt(t.x - 1, t.y - 1))) st.ledges.push({ x: t.x, top: t.y, side: -1, occ: null });
      if (!solidRect(tileAt(t.x + 1, t.y)) && !solidRect(tileAt(t.x + 1, t.y - 1))) st.ledges.push({ x: t.x + 1, top: t.y, side: 1, occ: null });
    });
    var tops = [], segs = [], cur = null;
    w.tiles.forEach(function (t) {
      if (!(isFull(t) || t.type === 'cloud') || t.type === 'mover' || Math.abs(t.x - sp.x) > range || isFull(tileAt(t.x, t.y - 1))) return;
      tops.push(t);
    });
    tops.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    tops.forEach(function (t) {
      var cl = t.type === 'cloud';
      if (cur && cur.y === t.y && cur.cloud === cl && cur.x1 === t.x) cur.x1 = t.x + 1; else { cur = { x0: t.x, x1: t.x + 1, y: t.y, cloud: cl }; segs.push(cur); }
    });
    st.plats = segs;
    if (def && def.spawn) { st.spawns = def.spawn; st.respawn = def.respawn; }
    else {
      var b1 = u1 || (u2 ? w.spawn : sp);
      var gy = groundBelow(b1.x, b1.y - 2, 40); var fxp = b1.x + 7; var gy2 = groundBelow(fxp, b1.y - 4, 40);
      if (gy2 === null) { fxp = b1.x + 3; gy2 = gy; }
      st.spawns = [{ x: b1.x, y: (gy === null ? b1.y : gy) }, { x: fxp, y: (gy2 === null ? b1.y : gy2) }];
      if (u1) st.spawns[0] = { x: u1.x, y: u1.y };   // set spots are used exactly as placed
      if (u2) st.spawns[1] = { x: u2.x, y: u2.y };
      st.respawn = { x: (minX + maxX) / 2, y: minY - 4 };
    }
    return st;
  }

  // ---------------------------------------------------------------- match lifecycle
  function newSide(char, stocks) {
    return { char: char, pct: 0, stocks: stocks, hitstun: 0, kvx: 0, kvy: 0, invuln: 0, shield: BAL.shieldMax, guarding: false, guardT: 0, guardBreak: 0,
      dodge: 0, dodgeDir: 0, airDodged: false, ledge: null, ledgeCD: 0, ledgeInv: 0, respawnHold: 0, respawnAge: 0, flash: 0, hitLock: 0, acc: null, ko: 0 };
  }

  SM.start = function (cfg) {
    var g = G(); if (!g) return;
    camS = null;
    cfg = Object.assign({ stage: 'battlefield', stocks: 3, time: 180, cpu: 2, cpuChar: 'random', char: g.char, online: false }, cfg || {});
    if (!isFighter(cfg.char)) cfg.char = 'brawler';
    var list = roster();
    if (cfg.cpuChar === 'random' || !isFighter(cfg.cpuChar)) cfg.cpuChar = list[Math.floor(Math.random() * list.length)].id;
    SM.cfg = cfg;
    hideMenu();
    // stage
    var w = W();
    if (!backup) backup = { json: g.exportLevel(), imported: window._levelIsImported, dirty: window._srLevelDirty, goal: Object.assign({}, w.goal) };
    var def = null;
    if (cfg.stage !== 'course') {
      var tiles = []; def = STAGES[cfg.stage].build(tiles);
      g.importLevel(JSON.stringify({ version: '1.0', id: 'smash-' + cfg.stage, name: 'Smash ' + STAGES[cfg.stage].n, author: 'smash',
        world: { tiles: tiles, goal: { x: 395, y: 2, w: 1, h: 1 }, spawn: { x: def.spawn[0].x, y: def.spawn[0].y }, checkpoint: null }, movers: [] }));
    } else { if (cfg.courseJson) { g.importLevel(cfg.courseJson); w = W(); } w.goal = { x: -99, y: -99, w: 1, h: 1 }; }   // (online guest: the host's course)
    if (!isFighter(g.char) || g.char !== cfg.char) { allowSel = true; try { window._selectCharacter(cfg.char); } finally { allowSel = false; } }
    stage = analyze(def, cfg);
    SM.stage = stage;
    g.setMode('play');
    g.enemies.length = 0;
    g.resetPlayer();
    me = newSide(cfg.char, cfg.stocks);
    foe = newSide(cfg.cpuChar, cfg.stocks); foe.kind = cfg.online ? 'remote' : 'cpu';
    foe.lvl = cfg.cpu; foe.ent = mkEnt(); foe.w = .72; foe.h = .92; foe.vx = 0; foe.vy = 0; foe.onGround = false; foe.face = -1;
    cpuReset(foe); foe.cd = 1; foe.think = 0; foe.atk = null; foe.jumps = 2; foe.burst = 1; foe.guardLeft = 0; foe.drop = 0; foe.rx = 0; foe.ry = 0; foe.stun2 = 0; foe.nav = 0;
    if (cfg.online && SM.net && SM.net.role === 'guest') { var t0 = stage.spawns[0]; stage.spawns[0] = stage.spawns[1]; stage.spawns[1] = t0; }
    placeAt(me, stage.spawns[0]); placeAt(foe, stage.spawns[1]);
    if (foe.kind === 'cpu' && foe.lvl > 0 && REAL_CPU[foe.char] && g.fighterNew) realSetup(foe);
    foe.face = stage.spawns[1].x < stage.spawns[0].x ? -1 : 1;
    var P = g.player; P.x = stage.spawns[0].x - P.w / 2; P.y = stage.spawns[0].y - P.h + 0.95 - 0.95; P.dashDir = foe.x > P.x ? 1 : -1;
    P.x = stage.spawns[0].x - P.w / 2; P.y = stage.spawns[0].y - P.h - 0.01; P.vx = P.vy = 0;
    if (g.enemies.indexOf(foe.ent) < 0 && foe.kind === 'cpu') g.enemies.push(foe.ent);
    if (foe.kind === 'remote') g.enemies.push(foe.ent);
    fx = []; matchT = cfg.time || 0; clock = 0; banner = null;
    SM.active = true; SM.phase = 'countdown'; SM.cd = 3.2; SM.over = null; SM.lastCount = 4;
    buildHud(); showHud(true);
    g.setMessage('🥊 Smash! Hold 🛡️/X to guard. Hold it + a direction (or drag it) to roll / air dodge.');
  };
  function placeAt(s, p) { if (s === me) return; s.x = p.x - s.w / 2; s.y = p.y - s.h - 0.01; s.vx = s.vy = 0; }

  SM.stop = function (silent) {
    var g = G();
    if (!SM.active && !backup) return;
    SM.active = false; SM.phase = 'off';
    if (foe && foe.ent) { foe.ent.dead = true; var i = g.enemies.indexOf(foe.ent); if (i >= 0) g.enemies.splice(i, 1); }
    releaseLedge(me); releaseLedge(foe);
    if (backup) {
      if (SM.cfg && (SM.cfg.stage !== 'course' || SM.cfg.courseJson)) { try { g.importLevel(backup.json); } catch (e) {} }
      else { var w = W(); if (w) w.goal = backup.goal; }
      window._levelIsImported = backup.imported; window._srLevelDirty = backup.dirty;
      backup = null;
    }
    restoreKeys();
    blocked = false;
    showHud(false);
    if (g.mode !== 'build') g.setMode('build');
    if (!silent) g.setMessage('Back to build mode.');
    if (SM.net && SM.net.onStop) SM.net.onStop();
  };

  function endMatch(winner) { // 'me' | 'foe' | 'draw'
    SM.phase = 'over'; SM.over = winner;
    var host = !(SM.net && SM.net.role === 'guest');
    showResult(winner);
    if (SM.net && SM.net.sendOver) SM.net.sendOver(winner);
  }

  // ---------------------------------------------------------------- no switching fighters mid-match
  // Your fighter is locked from the countdown to the result screen. Only Smash itself (start / rematch) may set it.
  var allowSel = false;
  function lockMsg() { var g = G(); if (g && g.setMessage) g.setMessage('🥊 You can’t switch fighters mid-match. Exit the match to pick another.'); }
  function wrapSelect() {
    var orig = window._selectCharacter;
    if (!orig) { setTimeout(wrapSelect, 200); return; }
    if (orig._smLock) return;
    var w = function (charId) {
      if (SM.active && !allowSel && !window._fighterPass) { lockMsg(); return; }
      return orig.apply(this, arguments);
    };
    w._smLock = true;
    window._selectCharacter = w;
  }
  wrapSelect();
  SM.pickChar = function (id) { var g = G(); if (!g || !isFighter(id) || g.char === id) return; allowSel = true; try { window._selectCharacter(id); } finally { allowSel = false; } };
  // the character buttons (some set the character directly, not through _selectCharacter): swallow the tap
  window.addEventListener('click', function (e) {
    if (!SM.active) return;
    var b = e.target && e.target.closest && e.target.closest('.char-btn');
    if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation(); lockMsg();
  }, true);

  // ---------------------------------------------------------------- input gate
  var BLOCK_ALL = true;
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase(); down[k] = true;
    if (!SM.active) return;
    if (k === 'x') { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (k === 'r') { e.stopImmediatePropagation(); return; }
    if (blocked && k !== 'e' && k !== 'escape' && k !== 'tab') { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('keyup', function (e) { down[e.key.toLowerCase()] = false; }, true);
  window.addEventListener('blur', function () { down = {}; });
  function held(k) { return !!down[k]; }
  function pressed(k) { return !!down[k] && !prevDown[k]; }

  // Touch input. The on-screen buttons only write to the game's mobileKeys, and suppressKeys() wipes those,
  // so Smash keeps its own copy of which buttons each finger is on (read straight from the touch list).
  var tch = { left: false, right: false, jump: false, down: false }, prevTch = { left: false, right: false, jump: false, down: false };
  var TBTN = { leftBtn: 'left', rightBtn: 'right', doubleJumpBtn: 'jump', jumpBtn: 'jump', crouchBtn: 'down' };
  var gStick = { id: null, x0: 0, y0: 0, x: 0, y: 0 }; // drag on the shield button = a direction for rolls / air dodges
  function scanTouches(e) {
    var n = { left: false, right: false, jump: false, down: false }, ts = e.touches || [];
    for (var i = 0; i < ts.length; i++) {
      for (var el = ts[i].target; el && el.id !== undefined; el = el.parentNode) { if (TBTN[el.id]) { n[TBTN[el.id]] = true; break; } }
    }
    tch.left = n.left; tch.right = n.right; tch.jump = n.jump; tch.down = n.down;
  }
  ['touchstart', 'touchend', 'touchcancel'].forEach(function (t) { window.addEventListener(t, scanTouches, { capture: true, passive: true }); });
  window.addEventListener('blur', function () { tch.left = tch.right = tch.jump = tch.down = false; gStick.id = null; gStick.x = gStick.y = 0; });
  var STICK_DEAD = 0.45;
  function dirIn() {
    var d = (held('d') || held('arrowright') || tch.right ? 1 : 0) - (held('a') || held('arrowleft') || tch.left ? 1 : 0);
    if (d === 0 && Math.abs(gStick.x) > STICK_DEAD) d = gStick.x > 0 ? 1 : -1;
    return d;
  }
  function upIn() { return held('w') || held('arrowup') || tch.jump || gStick.y < -STICK_DEAD; }
  function downIn() { return held('arrowdown') || held('s') || tch.down || gStick.y > STICK_DEAD; }
  function vDirIn() { return (downIn() ? 1 : 0) - (upIn() ? 1 : 0); }
  function jumpIn() { return pressed('w') || pressed('arrowup') || pressed(' ') || (tch.jump && !prevTch.jump); }

  function suppressKeys(g) {
    if (!saved) {
      saved = { keys: [], mk: Object.assign({}, g.mobileKeys) };
      MOVE_KEYS.forEach(function (k) { if (g.keys.has(k)) { saved.keys.push(k); g.keys.delete(k); } });
    }
    // every frame: the touch buttons write mobileKeys again on each press, which used to leak through
    ['left', 'right', 'up', 'jump'].forEach(function (k) { g.mobileKeys[k] = false; });
  }
  function restoreKeys() {
    var g = G(); if (!g) return;
    saved = null;
    MOVE_KEYS.forEach(function (k) { if (down[k]) g.keys.add(k); });
    // give back the touch buttons that are still being held, or you had to lift and re-press to move again
    if (g.mobileKeys) { g.mobileKeys.left = tch.left; g.mobileKeys.right = tch.right; g.mobileKeys.jump = tch.jump; g.mobileKeys.up = tch.jump; }
  }

  // ---------------------------------------------------------------- per-frame hooks
  SM.pre = function (dt) {
    if (!SM.active) return;
    var g = G(), P = g.player;
    dt = Math.min(dt, 0.033);
    // keep the hidden opponent in the enemy list and mirror its body
    var ent = foe.ent;
    if (g.enemies.indexOf(ent) < 0) g.enemies.push(ent);
    // hits from the strike engine land in the rAF-hub tick, which runs AFTER post() and BEFORE this pre().
    // Read them now, or the reset below throws them away (that was why almost nothing connected).
    harvestHit(foe);
    ent._held = true; ent._thrown = false;
    // One of your moves moved the opponent itself (Chroma's tongue, Conduit's Lift Current, the Mixtape's yanks and
    // holds, ...): it goes where the move put it and can't act while that's happening.
    if (foe.kind === 'cpu' && foe._entX != null && (Math.abs(ent.x - foe._entX) > 0.01 || Math.abs(ent.y - foe._entY) > 0.01) && foe.respawnHold <= 0 && !foe.ledge && SM.phase === 'fight') {
      foe.x = ent.x; foe.y = ent.y; foe.vx = foe.vy = 0; foe.liftHold = 0.12; foe.onGround = false;
    }
    var fp = foePos(); ent.x = fp.x; ent.y = fp.y; ent.w = fp.w; ent.h = fp.h; ent.hitFlash = 0; ent._preFlash = 0;
    foe._entX = ent.x; foe._entY = ent.y;
    foe._hp0 = BIG;
    P.hp = P.maxHp; P.hpInvuln = Math.max(P.hpInvuln || 0, 0.01);
    // gate: when are you not allowed to act?
    if (me.heldT > 0) me.heldT -= dt;
    blocked = SM.phase !== 'fight' || me.heldT > 0 || me.hitstun > 0 || !!me.ledge || me.guardBreak > 0 || me.dodge > 0 || me.guarding;
    if (blocked) suppressKeys(g); else if (saved) restoreKeys();
    if (SM.phase !== 'fight') { P.vx = 0; if (SM.phase === 'countdown') P.vy = Math.min(P.vy, 0); }
    // launched: we drive sideways speed ourselves
    me._prevVy = P.vy;
    if (me.hitstun > 0) {
      P.vx = me.kvx;
      me.kvx = approach(me.kvx, 0, (P.onGround ? BAL.decayGround : BAL.decayAir) * dt);
    } else if (me.kvx !== 0) {
      // after hitstun you keep drifting along the launch (the game's air friction used to stop you dead
      // and drop you straight down). Holding against it brakes; landing, a ledge or a dodge ends it.
      if (P.onGround || me.ledge || me.dodge > 0 || Math.abs(me.kvx) < 2) me.kvx = 0;
      else {
        var brake = dirIn() === -sgn(me.kvx) ? 16 : 0;
        P.vx = me.kvx; me.kvx = approach(me.kvx, 0, (BAL.decayAir * 2 + brake) * dt);
      }
    }
    if (me.dodge > 0) {
      if (me.dodgeAir) { // directional air dodge: fly along the chosen direction, eases out near the end
        var k = me.dodge / BAL.airDodgeT * 0.7 + 0.3;
        P.vx = me.dodgeVX * BAL.airDodgeSpeed * k; P.vy = me.dodgeVY * BAL.airDodgeSpeed * k;
      } else P.vx = me.dodgeDir * BAL.dodgeSpeed * (me.dodge / BAL.dodgeT * 0.6 + 0.4);
    }
    if (me.guarding || me.guardBreak > 0) { if (P.onGround) P.vx = 0; }
    // a ledge jump carries you back over the stage, or the game's own walk code zeroed the push and you fell onto the same ledge
    if (me.ledgeJumpT > 0) {
      me.ledgeJumpT -= dt;
      if (me.hitstun > 0 || me.dodge > 0 || dirIn() === -me.ledgeJumpDir) me.ledgeJumpT = 0;
      else if (P.vx * me.ledgeJumpDir < 6) P.vx = me.ledgeJumpDir * 6;
    }
  };
  function approach(v, t, d) { return v < t ? Math.min(t, v + d) : Math.max(t, v - d); }

  SM.post = function (dt) {
    if (!SM.active) return;
    var g = G(), P = g.player;
    if (g.mode !== 'play') { SM.stop(); return; }
    dt = Math.min(dt, 0.033); clock += dt;
    if (g.enemies.length > 1) { for (var i = g.enemies.length - 1; i >= 0; i--) if (g.enemies[i] !== foe.ent) g.enemies.splice(i, 1); }
    if (SM.phase === 'countdown') {
      SM.cd -= dt; var c = Math.ceil(SM.cd);
      if (c !== SM.lastCount) { SM.lastCount = c; if (c > 0) showBanner(String(c), 0.7); }
      if (SM.cd <= 0) { SM.phase = 'fight'; showBanner('GO!', 0.8); }
    }
    if (SM.phase === 'fight' && matchT > 0) { matchT -= dt; if (matchT <= 0) { matchT = 0; timeUp(); } }
    if (SM.phase !== 'over') { playerPost(g, P, dt); }
    if (SM.phase === 'fight') stepRefl(dt); else refl.length = 0;
    foePost(g, P, dt);
    updateFx(dt);
    camera(g, P, dt);
    hud();
    for (var k in down) prevDown[k] = down[k];
    for (var t in tch) prevTch[t] = tch[t];
    // pre() sets a tiny hpInvuln so the game's own damage can't touch you during update(). Clear it again
    // before drawing: the game draws any hpInvuln as the hurt-flash and the emotes read it as "just got hit",
    // which made you flash all match and cancelled every emote.
    if (P.hpInvuln > 0 && P.hpInvuln <= 0.011) P.hpInvuln = 0;
  };

  function timeUp() {
    if (SM.net && SM.net.role === 'guest') return;                     // online: the host calls time
    var a = me.stocks, b = foe.stocks;
    if (a !== b) endMatch(a > b ? 'me' : 'foe');
    else if (Math.abs(me.pct - foe.pct) > 0.5) endMatch(me.pct < foe.pct ? 'me' : 'foe');
    else endMatch('draw');
  }

  // ---------------------------------------------------------------- player side
  // ---- parry, reflect, super armor and throw invincibility ----
  // A fighter sets these on its own body (yours: the player; the CPU's: its fighter state):
  //  _parryT > 0 (or the Protagonist's Guardian's Counter): a hit from close is PARRIED, the attacker takes a
  //    counter hit; a hit from range (a projectile) is REFLECTED back as a homing bolt. _parried is then set
  //    for a moment so the fighter can follow up (the grappler turns a parry into a grab).
  //  _armorT > 0: super armor, the hit's percent counts but there is no launch or hitstun (up to 30% hits).
  //  _grabInv > 0: mid-throw, nothing touches it.
  var refl = [];
  function defend(isMe, h) {
    var g = G(), P = g.player, st = isMe ? P : (foe.F ? foe.F.st : null), chr = isMe ? me.char : foe.char, side = isMe ? me : foe;
    if (!st) return false;
    if (st._grabInv > 0) return true;
    var vx = isMe ? P.x + P.w / 2 : foe.x + foe.w / 2, vy = isMe ? P.y + P.h / 2 : foe.y + foe.h / 2;
    var ax = isMe ? foe.x + foe.w / 2 : P.x + P.w / 2, ay = isMe ? foe.y + foe.h / 2 : P.y + P.h / 2;
    if (st._parryT > 0 || (chr === 'cb_protagonist' && st._protagRetaliateTimer > 0)) {
      var far = Math.hypot(ax - vx, ay - vy) > 2.6, d = sgn(ax - vx) || 1;
      st._parryT = 0; st._protagRetaliateTimer = 0; st._parried = 0.45; st._parryFar = far; st._parryDir = d;
      side.invuln = Math.max(side.invuln || 0, 0.45); side.hitstun = 0;
      window._ppHitstop = Math.max(window._ppHitstop || 0, 0.1); g.shake(7);
      addFx('ring', vx, vy, '#ffffff'); addFx('burst', vx, vy, far ? '#7cdbff' : '#ffd166', 18);
      showBanner(far ? 'REFLECT!' : 'PARRY!', 0.55);
      if (far) refl.push({ x: vx, y: vy, toMe: !isMe, pct: Math.max(6, h.pct * 1.25), t: 0, trail: [] });
      else if (!st._parryGrab) {                                          // (a grappler's parry turns into its own grab instead)
        var cp = Math.max(8, h.pct * 1.2);
        if (isMe) hitFoe(g, P, cp, d * 9, -9, 1, true); else hitMe({ pct: cp, ix: d * 9, iy: -9, fromX: vx, k: 1, noDef: true });
      }
      return true;
    }
    if (st._armorT > 0 && h.pct < 30) {
      side.pct = Math.min(999, side.pct + h.pct * 0.85); side.flash = 0.1;
      addFx('ring', vx, vy, '#ffb347'); g.shake(3);
      return true;
    }
    return false;
  }
  // reflected bolts home in on whoever threw the attack
  function stepRefl(dt) {
    var g = G(), P = g.player;
    for (var i = refl.length - 1; i >= 0; i--) {
      var r = refl[i]; r.t += dt;
      var tx = r.toMe ? P.x + P.w / 2 : foe.x + foe.w / 2, ty = r.toMe ? P.y + P.h / 2 : foe.y + foe.h / 2;
      var dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy) || 1, sp = 26 * dt;
      r.trail.push([r.x, r.y]); if (r.trail.length > 8) r.trail.shift();
      if (d <= sp + 0.5) {
        var ux = dx / d;
        if (r.toMe) hitMe({ pct: r.pct, ix: sgn(ux) * 10, iy: -7, fromX: r.x, k: 1, noDef: true }); else hitFoe(g, P, r.pct, sgn(ux) * 10, -7, 1, true);
        addFx('burst', tx, ty, '#7cdbff', 14); refl.splice(i, 1); continue;
      }
      r.x += dx / d * sp; r.y += dy / d * sp;
      if (r.t > 2.5) refl.splice(i, 1);
    }
  }
  function drawRefl(ctx, cam) {
    for (var i = 0; i < refl.length; i++) {
      var r = refl[i];
      ctx.globalCompositeOperation = 'lighter';
      for (var j = 0; j < r.trail.length; j++) { var q = r.trail[j], a = (j + 1) / r.trail.length; ctx.globalAlpha = 0.5 * a; ctx.fillStyle = '#7cdbff'; ctx.beginPath(); ctx.arc(q[0] * T - cam.x, q[1] * T - cam.y, T * 0.22 * a, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(r.x * T - cam.x, r.y * T - cam.y, T * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x * T - cam.x, r.y * T - cam.y, T * (0.3 + 0.08 * Math.sin(r.t * 30)), 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  SM.__defend = defend;

  function hitMe(h) { // h: { pct, ix, iy, fromX, k }
    var g = G(), P = g.player;
    if (SM.phase !== 'fight' || me.invuln > 0 || me.dodge > 0 || me.ledgeInv > 0 || me.respawnHold > 0) return false;
    if (!h.noDef && defend(true, h)) return true;
    if (me.guarding && P.onGround) {
      me.shield -= h.pct * 0.9 + 4; me.flash = 0.12;
      addFx('ring', P.x + P.w / 2, P.y + P.h / 2, '#7cdbff');
      if (me.shield <= 0) guardBreak();
      return true;
    }
    me.pct = Math.min(999, me.pct + h.pct);
    if (foe && foe.F) leech(foe, h.pct);
    var Ln = launch(h.ix, h.iy, me.pct, ch(me.char).w, h.k, h.fromX, P.x + P.w / 2, P.onGround);
    var kind = styleLaunch(Ln, classify(h.ix, h.iy), P.onGround, me);
    // survival DI: holding up/down/sideways bends the launch a little (max ~12 degrees)
    var di = vDirIn();
    if (di !== 0 || dirIn() !== 0) {
      var ang = Math.atan2(Ln.vy, Ln.vx), perp = (Ln.vx * (di) * 0 + 0);
      var inX = dirIn(), inY = di;
      var cross = Math.cos(ang) * inY - Math.sin(ang) * inX; // sign of stick relative to launch direction
      ang += clampv(cross, -1, 1) * 0.21;
      var sp = Math.hypot(Ln.vx, Ln.vy); Ln.vx = Math.cos(ang) * sp; Ln.vy = Math.sin(ang) * sp;
    }
    me.kvx = Ln.vx; P.vx = Ln.vx; P.vy = Ln.vy; me.hitstun = Ln.stun; me.flash = 0.14;
    if (h.stun) me.hitstun = Math.max(me.hitstun, Math.min(1.1, h.stun * 0.45));   // stun / freeze specials hold you a bit longer
    if (Ln.vy < -2 || Ln.L > 14) { P.onGround = false; P.y -= 0.06; }
    releaseLedge(me); me.dodge = 0; me.guarding = false;
    P.isDashing = false;
    addFx('burst', P.x + P.w / 2, P.y + P.h / 2, pctColor(me.pct), Ln.L);
    if (kind) flair(kind, P);
    if (kind === 'lift' && foe && foe.lvl > 0 && me.pct < 100 && clock - (foe.hopAt || -9) > BAL.hopCD) { foe.hopAt = clock; foe.vy = -BAL.hopV; foe.onGround = false; }
    g.shake(Math.min(9, 2 + Ln.L * 0.18));
    if (Ln.L > 20) window._ppHitstop = Math.max(window._ppHitstop || 0, Math.min(0.12, 0.03 + Ln.L * 0.0018));
    return true;
  }
  SM.__hitMe = hitMe;

  function guardBreak() {
    var g = G(), P = g.player; me.guarding = false; me.guardBreak = BAL.shieldBreakStun; me.shield = BAL.shieldMax * 0.5;
    P.vy = -9; P.onGround = false; addFx('burst', P.x + P.w / 2, P.y + P.h / 2, '#7cdbff', 14); showBanner('GUARD BREAK', 0.8);
  }

  function playerPost(g, P, dt) {
    var m = me;
    m.invuln = Math.max(0, m.invuln - dt); m.flash = Math.max(0, m.flash - dt); m.ledgeCD = Math.max(0, m.ledgeCD - dt); m.ledgeInv = Math.max(0, m.ledgeInv - dt);
    if (m.guardBreak > 0) { m.guardBreak -= dt; }
    if (m.hitstun > 0) {
      m.hitstun -= dt;
      // wall bounce
      // lighter gravity in hitstun: undo most of the pull the game just applied (not on spikes, not on landing)
      if (!m.spiked && !P.onGround) { var gv = P.vy - m._prevVy; if (gv > 0 && gv < 80 * dt + 0.5) P.vy = m._prevVy + gv * BAL.stunGrav; }
      if (Math.abs(m.kvx) > 8 && Math.abs(P.vx) < Math.abs(m.kvx) * 0.4) { m.kvx = -m.kvx * 0.45; P.vx = m.kvx; g.shake(3); addFx('ring', P.x + P.w / 2, P.y + P.h / 2, '#fff'); }
      else P.vx = m.kvx;
      // floor bounce after a hard downward launch
      if (P.onGround && m._prevVy > (m.spiked ? 10 : 16)) { P.vy = -m._prevVy * (m.spiked ? BAL.spikeBounce : 0.45); P.onGround = false; g.shake(m.spiked ? 6 : 4); addFx('ring', P.x + P.w / 2, P.y + P.h, m.spiked ? '#ff3b6b' : '#fff'); m.spiked = false; }
      if (m.hitstun <= 0) { m.hitstun = 0; m.spiked = false; }
    }
    if (P.onGround) { m.airDodged = false; }
    // shield + dodge (X key / on-screen button)
    var wantG = (held('x') || guardBtn) && SM.phase === 'fight';
    guardTap = guardBtn && !prevGuardBtn;
    if (P.onGround) m.airDodgeQ = 0;
    if (m.dodge > 0) { m.dodge -= dt; P.hpInvuln = 0.05; if (m.dodge <= 0) { m.dodge = 0; if (m.dodgeAir) { P.vx *= 0.3; P.vy *= 0.3; } } }
    else if (m.hitstun <= 0 && !m.ledge && m.guardBreak <= 0 && m.respawnHold <= 0) {
      if (wantG && !P.onGround && !m.airDodged && (pressed('x') || (guardBtn && !prevGuardBtn) || m.airDodgeQ)) {
        // on touch, give a quick drag on the shield button a moment to pick the direction
        if (guardBtn && !pressed('x') && dirIn() === 0 && vDirIn() === 0 && (m.airDodgeQ || 0) < 0.07) m.airDodgeQ = (m.airDodgeQ || 0) + dt + 1e-4;
        else { m.airDodgeQ = 0; startDodge(P, dirIn(), true, vDirIn()); }
      }
      else if (wantG && P.onGround) {
        if (!m.guarding && m.shield > 6) { m.guarding = true; m.guardT = 0; }
        if (m.guarding) {
          m.guardT += dt; m.shield -= BAL.shieldDrain * dt;
          var d = dirIn();
          if (d !== 0 && m.guardT > 0.03) { startDodge(P, d, false); }
          else if (m.shield <= 0) guardBreak();
        }
      } else { m.guarding = false; }
    }
    if (!wantG) { m.guarding = false; m.airDodgeQ = 0; }
    if (!m.guarding && m.guardBreak <= 0) m.shield = Math.min(BAL.shieldMax, m.shield + BAL.shieldRegen * dt);
    prevGuardBtn = guardBtn;
    // ledge
    if (m.ledge) ledgeHang(g, P, m, dt, true);
    else if (!P.onGround && m.hitstun <= 0 && m.ledgeCD <= 0 && P.vy > -3 && m.respawnHold <= 0 && m.dodge <= 0) tryGrab(g, P, m, true);
    // respawn platform hold
    if (m.respawnHold > 0) {
      m.respawnHold -= dt; m.respawnAge += dt; P.vx = 0; P.vy = 0; P.x = stage.respawn.x - P.w / 2; P.y = stage.respawn.y; P.onGround = false;
      var act = held('a') || held('d') || held('arrowleft') || held('arrowright') || held('w') || held('arrowup') || held('s') || held(' ') || held('shift') || held('arrowdown') || tch.left || tch.right || tch.jump;
      if (m.respawnHold <= 0 || (act && m.respawnAge > 0.35)) { m.respawnHold = 0; }
    }
    // blast zones
    var cx = P.x + P.w / 2, cy = P.y + P.h / 2, b = stage.blast;
    if (SM.phase === 'fight' && m.respawnHold <= 0 && (cx < b.left || cx > b.right || cy > b.bottom || cy < b.top)) koMe(g, P);
  }
  var prevGuardBtn = false, guardTap = false;

  function startDodge(P, d, air, v) {
    var m = me;
    m.guarding = false; m.dodge = air ? BAL.airDodgeT : BAL.dodgeT; m.dodgeDir = d; m.dodgeAir = air; m.shield = Math.max(0, m.shield - 6);
    if (air) {
      m.airDodged = true; v = v || 0;
      var len = Math.hypot(d, v) || 1; m.dodgeVX = d / len; m.dodgeVY = v / len; // 8 directions, or 0,0 = dodge in place
      if (d === 0 && v === 0) { P.vx *= 0.2; P.vy *= 0.2; }
      P.isDashing = false;
    }
    addFx('ring', P.x + P.w / 2, P.y + P.h / 2, '#cfd8ff');
    m.invuln = Math.max(m.invuln, BAL.dodgeInv);
  }

  function koMe(g, P) {
    if (foe && foe.kind === 'cpu' && foe.lvl > 0 && Math.random() < 0.7) foe.tauntQ = true;
    me.stocks--; me.pct = 0; me.hitstun = 0; me.kvx = 0; releaseLedge(me);
    addFx('ko', Math.max(stage.blast.left + 1, Math.min(stage.blast.right - 1, P.x)), Math.max(stage.blast.top + 1, Math.min(stage.blast.bottom - 1, P.y)), '#ff4d4d');
    g.shake(12); window._ppHitstop = 0.22;
    if (SM.net && SM.net.sendKO) SM.net.sendKO();
    if (me.stocks <= 0) { endMatch('foe'); P.vx = P.vy = 0; P.y = -50; me.respawnHold = 99; return; }
    showBanner('KO!', 0.7);
    g.resetPlayer();
    me.shield = BAL.shieldMax; me.guarding = false; me.guardBreak = 0; me.dodge = 0; me.airDodged = false;
    me.respawnHold = BAL.respawnHold; me.respawnAge = 0; me.invuln = BAL.respawnInv + 0.2;
    P.x = stage.respawn.x - P.w / 2; P.y = stage.respawn.y; P.vx = P.vy = 0;
  }

  // ledge (shared by the player and the CPU)
  function body(s, g) { return s === me ? g.player : s; }
  function tryGrab(g, P, s, isMe) {
    var b = isMe ? P : s;
    for (var i = 0; i < stage.ledges.length; i++) {
      var L = stage.ledges[i]; if (L.occ && L.occ !== s) continue;
      var okX = L.side < 0 ? (b.x + b.w >= L.x - 0.55 && b.x + b.w <= L.x + 0.12) : (b.x <= L.x + 0.55 && b.x >= L.x - 0.12);
      var okY = b.y >= L.top - 0.35 && b.y <= L.top + 0.55;
      if (!okX || !okY) continue;
      s.ledge = { L: L, t: 0 }; L.occ = s; s.ledgeInv = BAL.ledgeInv;
      b.vx = 0; b.vy = 0; b.onGround = false;
      (isMe ? P : (s.F ? s.F.st : {}))._smRecUsed = false;
      if (isMe) { g.jumpCount = 0; P.dashCharges = P.maxDashes; me.airDodged = false; } else { s.jumps = 2; s.burst = 1; s.wallJumps = 0; s.recSide = false; }
      hangPos(b, L);
      addFx('ring', b.x + b.w / 2, L.top, '#9ad1ff');
      return true;
    }
    return false;
  }
  function hangPos(b, L) { b.x = L.side < 0 ? L.x - b.w - 0.02 : L.x + 0.02; b.y = L.top + 0.1; b.vx = 0; b.vy = 0; b.onGround = false; }
  function releaseLedge(s) { if (s && s.ledge) { if (s.ledge.L.occ === s) s.ledge.L.occ = null; s.ledge = null; } }
  function ledgeHang(g, P, s, dt, isMe) {
    var b = isMe ? P : s, L = s.ledge.L; s.ledge.t += dt;
    hangPos(b, L);
    var toward = -L.side, act = null, d = isMe ? dirIn() : (s.ledgeAct || 0);
    if (isMe) {
      // touch: jump button = ledge jump, press toward the stage (or tap the shield) = climb, away / crouch = let go
      if (jumpIn() && s.ledge.t > 0.12) act = 'jump';
      else if ((d === toward || held('arrowup') || held('w') || guardTap) && s.ledge.t > 0.12) act = 'climb';
      else if ((d === L.side || held('arrowdown') || tch.down) && s.ledge.t > 0.12) act = 'drop';
    } else { act = s.ledgeCmd || null; }
    if (s.ledge.t > BAL.ledgeMax) act = 'drop';
    if (!act) return;
    releaseLedge(s); s.ledgeCD = BAL.ledgeCD;
    if (isMe && act === 'drop' && tch.down && window._setCrouchToggle) window._setCrouchToggle(false); // crouch was only used to let go
    if (act === 'climb') { b.x = L.side < 0 ? L.x + 0.15 : L.x - b.w - 0.15; b.y = L.top - b.h - 0.01; b.vx = 0; b.vy = 0; s.invuln = Math.max(s.invuln, 0.5); b.onGround = true; }
    else if (act === 'jump') { b.vy = -15; b.vx = toward * 4; s.invuln = Math.max(s.invuln, 0.25); if (isMe) { g.jumpCount = 0; me.ledgeJumpT = 0.3; me.ledgeJumpDir = toward; } }
    else { b.vy = 1; b.vx = L.side * 2; }
    s.ledgeCmd = null;
  }

  // ---------------------------------------------------------------- opponent
  function foePos() {
    if (foe.kind === 'remote' && SM.net && SM.net.remotePos) { var r = SM.net.remotePos(); if (r) { foe.x = r.x; foe.y = r.y; foe.w = r.w || .72; foe.h = r.h || .92; foe.char = r.char || foe.char; foe.vx = r.vx || 0; foe.vy = r.vy || 0; foe.onGround = !!r.onGround; foe.remEm = r.em || null; foe.remFk = r.fk || null; } }
    return { x: foe.x, y: foe.y, w: foe.w, h: foe.h };
  }

  // collect whatever the game's attack code did to the hidden enemy since the last harvest, then reset it
  function harvestHit(f) {
    var e = f && f.ent; if (!e) return;
    var drop = BIG - e.hp;
    var flash = e.hitFlash >= 0.2;
    if (drop > 0 || flash) {
      var a = f.acc || (f.acc = { dmg: 0, ix: 0, iy: 0, n: 0 });
      a.dmg += Math.max(0, drop); a.n++;
      if (Math.abs(e.vx) + Math.abs(e.vy) > 0.01) { a.ix = e.vx; a.iy = e.vy; a.kb = true; }
      if (flash) a.kb = true;
    }
    e.hp = BIG; e.vx = 0; e.vy = 0; e.hitFlash = 0; e.stunTimer = 0; e.dead = false;
  }

  // turn what the game's attack code did to the hidden enemy into percent + launch
  function readHit(g, P, dt) {
    var f = foe, e = f.ent;
    f.hitLock = Math.max(0, f.hitLock - dt);
    harvestHit(f);
    if (f.acc && f.hitLock <= 0) {
      var A = f.acc; f.acc = null;
      var cm = ch(me.char);
      if (!A.kb) { chip(f, A.dmg * cm.d); return; }                     // poison / burn / beam tick: percent only
      var pct = Math.max(BAL.flinch, A.dmg * BAL.pctPerDmg) * cm.d;
      pct = Math.min(BAL.maxPctHit, pct);
      var ix = A.ix, iy = A.iy;
      if (ix === 0 && iy === 0) { ix = sgn(f.x - P.x) * 3; iy = -2; }
      // this fighter's own meteor (down + attack in the air) and launcher (up + attack)
      var mvT = cm.mv, mvM = null, mvGood = true, mvMeteor = false;
      if (mvT) {
        var toward = sgn(f.x - P.x), dnH = held('arrowdown'), upH = held('arrowup') || held('w');
        mvM = (dnH && !P.onGround && mvT.meteor) ? mvT.meteor : (upH && mvT.launch) ? mvT.launch : null;
        if (mvM) {
          mvMeteor = mvM === mvT.meteor;
          if (mvMeteor && mvM.sweet) mvGood = (f.y + f.h / 2) - (P.y + P.h / 2) > 0.5 && Math.abs((f.x + f.w / 2) - (P.x + P.w / 2)) < 0.9;
          ix = (mvM.ix || 0) * toward; iy = mvGood ? mvM.iy : mvM.iy * 0.4;
          pct = Math.min(BAL.maxPctHit, pct * (mvM.d || 1) * (mvGood ? 1 : 0.8));
        }
      }
      f.hitLock = BAL.rehit;
      hitFoe(g, P, pct, ix, iy, cm.k);
      if (mvM && mvGood) {
        if (mvMeteor && mvM.bounce) { P.vy = -12; P.onGround = false; addFx('ring', P.x + P.w / 2, P.y + P.h, '#ffd23b'); }
        else if (!mvMeteor && mvM.rocket) { P.vy = -14; P.onGround = false; addFx('ring', P.x + P.w / 2, P.y + P.h, '#6bd0ff'); }
      }
    }
  }

  // damage over time and beam ticks: a little percent, no launch and no hitstun (they used to relaunch
  // the victim every tick: Chroma's venom and Conduit's Arc Stream kept people flying and stun-locked)
  function chip(s, dmg) {
    if (SM.phase !== 'fight' || !(dmg > 0)) return;
    if (s.chipT !== clock) { s.chipBank = Math.min(BAL.chipMax, (s.chipBank == null ? BAL.chipMax : s.chipBank) + (clock - (s.chipT || clock)) * BAL.chipMax); s.chipT = clock; }
    var add = Math.min(dmg * BAL.pctPerDmg * BAL.chipK, s.chipBank);
    if (add <= 0) return;
    s.chipBank -= add; s.pct = Math.min(999, s.pct + add); s.flash = Math.max(s.flash || 0, 0.06);
  }
  // a life leecher takes a share of the percent it just dealt off its own
  function leech(s, pct) { var l = ch(s.char).leech; if (l && s.pct > 0) { s.pct = Math.max(0, s.pct - pct * l); s.leechT = 0.25; } }
  function hitFoe(g, P, pct, ix, iy, k, noDef) {
    var f = foe;
    if (SM.phase !== 'fight') return;
    if (!noDef && f.kind !== 'remote' && !(f.invuln > 0 || f.dodge > 0 || f.respawnHold > 0) && defend(false, { pct: pct })) return;
    if (f.kind === 'remote') { if (SM.net && SM.net.sendHit) SM.net.sendHit(pct, ix, iy, P.x + P.w / 2, k); f.flash = 0.12; addFx('burst', f.x + f.w / 2, f.y + f.h / 2, '#fff', 10); return; }
    if (f.invuln > 0 || f.dodge > 0 || f.ledgeInv > 0 || f.respawnHold > 0 && f.lvl > 0 && false) return;
    if (f.respawnHold > 0) return;
    if (f.lvl > 0 && f.guarding) {
      f.shield -= pct * 0.9 + 4; f.flash = 0.1; addFx('ring', f.x + f.w / 2, f.y + f.h / 2, '#7cdbff');
      if (f.shield <= 0) { f.guarding = false; f.guardBreak = BAL.shieldBreakStun; f.shield = BAL.shieldMax * 0.5; f.vy = -9; f.onGround = false; showBanner('GUARD BREAK', 0.8); }
      return;
    }
    f.pct = Math.min(999, f.pct + pct);
    leech(me, pct);
    var Ln = launch(ix, iy, f.pct, 1.0, k, P.x + P.w / 2, f.x + f.w / 2, f.onGround);
    var kind = styleLaunch(Ln, classify(ix, iy), f.onGround, f);
    if (f.lvl >= 2 && stage) cpuDI(Ln, f, LV[f.lvl] || LV[2]);
    f.kvx = Ln.vx; f.vx = Ln.vx; f.vy = Ln.vy; f.hitstun = Ln.stun; f.flash = 0.14; f.atk = null; f.guarding = false; f.taunt = 0;
    if (f.F) { realCancel(f); f.F.st.punchTimer = 0; f.F.st.comboCount = 0; f.act = null; }
    if (Ln.vy < -2 || Ln.L > 14) { f.onGround = false; f.y -= 0.06; }
    releaseLedge(f);
    addFx('burst', f.x + f.w / 2, f.y + f.h / 2, pctColor(f.pct), Ln.L);
    if (kind) flair(kind, f);
    if (kind === 'lift' && f.pct < 100 && clock - (me.hopAt || -9) > BAL.hopCD) { me.hopAt = clock; P.vy = -BAL.hopV; P.onGround = false; }
    g.shake(Math.min(8, 2 + Ln.L * 0.16));
    if (Ln.L > 20) window._ppHitstop = Math.max(window._ppHitstop || 0, Math.min(0.12, 0.03 + Ln.L * 0.0018));
  }
  // may a move drag / hold whoever this stand-in is for right now? (not while they shield, dodge, are safe or hang on a ledge)
  SM.__canHold = function (e) {
    var s = foe && e === foe.ent ? foe : foe && e === foe.tgt ? me : null;
    return !s || !(s.guarding || s.dodge > 0 || s.invuln > 0 || s.ledge || s.respawnHold > 0);
  };
  // a fighter's own healing move (Chroma's Lumen form): takes percent off whoever is acting, you or the CPU.
  // pts are in the game's damage points; returns the percent it took off
  SM.__heal = function (pts) {
    var s = window._fighterPass ? foe : me;
    if (SM.phase !== 'fight' || !s || !(pts > 0) || !(s.pct > 0)) return 0;
    var d = Math.min(s.pct, pts * BAL.pctPerDmg * BAL.healK);
    s.pct -= d; s.leechT = 0.25;
    return d;
  };
  SM.__hitFoe = function (pct, ix, iy) { var g = G(); hitFoe(g, g.player, pct, ix, iy, 1); };

  function foePost(g, P, dt) {
    var f = foe;
    if (SM.phase === 'over') { return; }
    if (f.kind === 'remote') { readHit(g, P, dt); return; }
    readHit(g, P, dt);
    if (SM.phase !== 'fight') { f.vx = 0; f.vy = 0; return; }
    var e0 = f.ent;                                                      // moved during the game's update (a hold from the main game's code)
    if (f._entX != null && (Math.abs(e0.x - f._entX) > 0.01 || Math.abs(e0.y - f._entY) > 0.01) && f.respawnHold <= 0 && !f.ledge) {
      f.x = e0.x; f.y = e0.y; f.vx = f.vy = 0; f.liftHold = 0.12; f.onGround = false;
    }
    cpuStep(g, P, dt);
    var e = f.ent;
    e.x = f.x; e.y = f.y; f._entX = e.x; f._entY = e.y;                  // what Smash wrote: any change after this is one of your moves
  }

  function koFoe(g) {
    var f = foe;
    f.stocks--; f.pct = 0; f.hitstun = 0; f.kvx = 0; f.atk = null; f.guarding = false; releaseLedge(f);
    addFx('ko', Math.max(stage.blast.left + 1, Math.min(stage.blast.right - 1, f.x)), Math.max(stage.blast.top + 1, Math.min(stage.blast.bottom - 1, f.y)), '#ffd24d');
    g.shake(12); window._ppHitstop = 0.22;
    if (SM.cfg.stocks > 0 && f.stocks <= 0) { endMatch('me'); f.x = stage.respawn.x; f.y = stage.respawn.y; return; }
    if (SM.cfg.stocks === 0) f.stocks = 0;
    showBanner('KO!', 0.7);
    f.rx = stage.respawn.x - f.w / 2; f.ry = stage.respawn.y; f.x = f.rx; f.y = f.ry; f.vx = f.vy = 0;
    f.respawnHold = f.lvl > 0 ? 2.0 : 1.0; f.invuln = BAL.respawnInv; f.shield = BAL.shieldMax; f.guardBreak = 0; f.dodge = 0;
    f.jumps = 2; f.burst = 1;
    f.chasing = false; f.threatAt = 0; f.punishUntil = 0; f.airDodged = false; f.recWas = false; f.atk = null; f.taunt = 0; f.tauntQ = false;
  }

  // -------- CPU brain
  // The CPU plays like a person instead of a dice roll:
  //  - it only reacts to your swings after a reaction delay (shorter on higher levels)
  //  - it learns what you keep doing (shielding, rolling, swinging) and adapts to it
  //  - it picks a move only if the hitbox will actually reach where you are going to be
  //  - it punishes endlag, dropped shields, rolls and guard breaks, and follows up its own hits
  //  - it goes for kills, guards the ledge, and bends its own launches (DI) to survive
  //  - it recovers on purpose, and climbs platforms to get to you
  // The level (LV) only changes how well it does all of this.
  function cpuMemInit() {
    return { shieldN: 0, rollN: 0, atkN: 0, airN: 0, oppAtk: false, oppAtkStart: -9, oppAtkEnd: -9, oppGuard: false, oppGuardEnd: -9,
      oppDodge: false, oppDodgeEnd: -9, oppAir: false, oppHS: false, oppOff: false, decayT: 0, mood: 'neutral', moodT: 0,
      seed: Math.random() * 6.28, navOK: true, chaseOK: false };
  }
  function cpuReset(f) {
    f.mem = cpuMemInit(); f.airDodged = false; f.lastMove = ''; f.threatAt = 0; f.punishUntil = 0; f.punishOK = false; f.comboOK = false;
    f.chasing = false; f.recT = 0; f.recMiss = 0; f.recWas = false; f.navPl = null; f.navT = 0; f.jumpCD = 0; f.ledgeWait = 0;
    f.taunt = 0; f.tauntQ = false; f.tauntTxt = ''; f.wanderX = null; f.preShieldCD = 0;
  }
  function tendency(m) {
    var tot = m.shieldN + m.rollN + m.atkN + m.airN + 3;
    return { shield: m.shieldN / tot, roll: m.rollN / tot, atk: m.atkN / tot, air: m.airN / tot };
  }

  // watch the player: edges of attacking / shielding / rolling / being launched
  function cpuObserve(P, dt) {
    var f = foe, m = f.mem, L = LV[f.lvl] || LV[2];
    if (!m) return;
    var atk = (P.punchTimer > 0) || (P.slashTimer > 0) || !!P.isDashing;
    if (atk && !m.oppAtk) { m.atkN++; m.oppAtkStart = clock; f.threatAt = clock + L.react * (0.7 + Math.random() * 0.6); }
    if (!atk && m.oppAtk) { m.oppAtkEnd = clock; f.punishUntil = clock + 0.45; f.punishOK = Math.random() < L.punish; }
    m.oppAtk = atk;
    var gd = !!me.guarding;
    if (gd && !m.oppGuard) m.shieldN++;
    if (!gd && m.oppGuard) { m.oppGuardEnd = clock; f.punishUntil = clock + 0.3; f.punishOK = Math.random() < L.punish; }
    m.oppGuard = gd;
    var dg = me.dodge > 0 && !me.dodgeAir;
    if (dg && !m.oppDodge) m.rollN++;
    if (!dg && m.oppDodge) { m.oppDodgeEnd = clock; f.punishUntil = clock + 0.3; f.punishOK = Math.random() < Math.min(1, L.punish * (1 + 0.5 * L.read)); }
    m.oppDodge = dg;
    var hs = me.hitstun > 0;
    if (hs && !m.oppHS) f.comboOK = Math.random() < L.combo;
    m.oppHS = hs;
    var air = !P.onGround;
    if (air && !m.oppAir) m.airN++;
    m.oppAir = air;
    m.decayT += dt;
    if (m.decayT > 10) { m.decayT = 0; m.shieldN *= 0.7; m.rollN *= 0.7; m.atkN *= 0.7; m.airN *= 0.7; }
  }

  // mood changes every few seconds so it isn't a metronome: pressure, poke, or bait
  function cpuMood(L, T, dt) {
    var m = foe.mem; m.moodT -= dt;
    if (m.moodT > 0) return;
    // A person doesn't press forward the whole match: they take breathers, hold their spot, and show off.
    //  aggro: rush in   neutral: footsies at mid range   bait: hang back for a whiff
    //  idle: breather, wander and maybe taunt   stand: plant your feet, shield and counter whatever walks in
    var prev = m.mood;
    // Per level, like the party-game CPUs: Lv1 mostly wanders and hops and only fights back when you get close.
    // Higher levels play the match: spacing, bursts of pressure, baiting, holding ground and the odd breather.
    var MW = {
      1: { a: 0.05, b: 0.03, n: 0.10, i: 0.45, h: 0.22, s: 0.15 },
      2: { a: 0.26, b: 0.10, n: 0.34, i: 0.10, h: 0.04, s: 0.16 },
      3: { a: 0.38, b: 0.12, n: 0.32, i: 0.04, h: 0.02, s: 0.12 }
    }[foe.lvl] || { a: 0.16, b: 0.10, n: 0.32, i: 0.16, h: 0.08, s: 0.18 };
    var wA = MW.a + (me.pct > 110 ? 0.08 : 0);                       // smells a KO: press
    var wB = MW.b + L.read * T.shield * 0.2 + (foe.pct > 110 ? 0.06 : 0);
    var wN = MW.n;
    var wI = MW.i + (foe.pct > 120 ? 0.05 : 0);
    var wH = MW.h;
    var wS = MW.s + L.read * T.atk * 0.15;                           // you keep swinging: wait for you
    if (prev === 'aggro') wA *= 0.4;
    var r = Math.random() * (wA + wB + wN + wI + wH + wS);
    m.mood = r < wA ? 'aggro' : (r -= wA) < wB ? 'bait' : (r -= wB) < wN ? 'neutral' : (r -= wN) < wI ? 'idle' : (r -= wI) < wH ? 'hop' : 'stand';
    var hi = foe.lvl >= 2;
    m.moodT = m.mood === 'aggro' ? rnd(1.2, 2.4) + (hi ? 0.6 : 0) : m.mood === 'neutral' ? rnd(1.5, 3) + (hi ? 1 : 0)
      : (m.mood === 'idle' || m.mood === 'hop') && hi ? rnd(1, 2.2) : m.mood === 'stand' ? rnd(1.2, 2.5) : rnd(2.2, 4.5);   // higher levels: breathers are short
    m.taunted = false; foe.wanderX = null;
    m.navOK = L.nav >= 0.9 || Math.random() < L.nav;
  }

  // ---- trajectory maths: where does a launch end up? (margin to the blast zones, <= 0 means a KO)
  function simMargin(x, y, vx, vy, stun) {
    var b = stage.blast, dt = 0.05, t = 0, T = stun + 0.55, mg = 1e9;
    while (t < T) {
      x += vx * dt; y += vy * dt;
      vx = approach(vx, 0, BAL.decayAir * dt); vy = Math.min(BAL.fall * 1.3, vy + BAL.grav * dt * (t < stun ? BAL.stunGrav : 1));
      mg = Math.min(mg, x - b.left, b.right - x, b.bottom - y, y - b.top);
      if (mg <= 0) return mg;
      if (vy > 0) { var gy = groundBelow(x, y - 0.4, 40); if (gy !== null && y + 0.46 >= gy) return mg; }
      t += dt;
    }
    return mg;
  }
  // how likely is this move to finish the player off right now? 0..1
  function killPotential(d, dir, gain, castX, P) {
    var Ln = launch(d.ix * (Math.abs(d.ix) > 3 ? dir : dir * 0.4), d.iy, me.pct + gain, ch(me.char).w, 1, castX, P.x + P.w / 2, P.onGround);
    var mg = simMargin(P.x + P.w / 2, P.y + P.h / 2, Ln.vx, Ln.vy, Ln.stun);
    return mg <= 0 ? 1 : clampv(1 - mg / 14, 0, 0.75) * 0.5;
  }
  // survival DI: lean the launch toward whichever stick direction ends furthest from a blast zone
  function cpuDI(Ln, f, L) {
    if (!(L.di > 0) || !stage) return;
    var cx = f.x + f.w / 2, cy = f.y + f.h / 2, best = null, bm = -1e9;
    [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1]].forEach(function (o) {
      var vx = Ln.vx, vy = Ln.vy;
      if (o[0] || o[1]) {
        var ang = Math.atan2(vy, vx), cross = Math.cos(ang) * o[1] - Math.sin(ang) * o[0], sp = Math.hypot(vx, vy);
        ang += clampv(cross, -1, 1) * 0.21 * L.di; vx = Math.cos(ang) * sp; vy = Math.sin(ang) * sp;
      }
      var mg = simMargin(cx, cy, vx, vy, Ln.stun);
      if (mg > bm + 0.01) { bm = mg; best = { vx: vx, vy: vy }; }
    });
    if (best) { Ln.vx = best.vx; Ln.vy = best.vy; }
  }

  // ---- choosing a move
  var GROUND_MOVES = ['jab', 'ftilt', 'smash', 'utilt', 'dash', 'usmash'], AIR_MOVES = ['nair', 'uair', 'dair', 'rise', 'meteor', 'bair'];
  function moveEval(name, dir, f, P, L) {
    var d = MOVES[name], c = { x: f.x + f.w / 2, y: f.y + f.h / 2 }, bx = d.box;
    var fdir = dir; if (d.back) dir = -dir;
    var tHit = d.wind + d.act * 0.5;
    // invulnerable for the whole swing: wasted
    var inv = Math.max(me.invuln, me.ledgeInv, me.respawnHold > 0 ? 9 : 0, me.dodge > 0 ? me.dodge + 0.05 : 0);
    if (inv > d.wind + d.act * 0.6) return null;
    if (d.lunge && f.onGround && groundBelow(c.x + dir * (d.lunge * d.act + 0.7), f.y + f.h - 0.2, 3) === null) return null; // don't lunge off the stage
    var ppx = P.x + P.vx * tHit * L.pred, ppy = P.y + clampv(P.vy * tHit * L.pred, -3, 3);
    var yv = d.air ? f.vy * tHit * 0.5 : 0, fr = d.lunge ? [0, 0.6, 1] : [0.5], fit = 0, i;
    for (i = 0; i < fr.length; i++) {
      var cxh = c.x + (d.lunge ? dir * d.lunge * d.act * fr[i] : 0);
      var x0 = dir > 0 ? cxh + bx.dx : cxh - bx.dx - bx.w, y0 = c.y + yv + bx.dy;
      var ox = Math.min(x0 + bx.w, ppx + P.w) - Math.max(x0, ppx);
      var oy = Math.min(y0 + bx.h, ppy + P.h) - Math.max(y0, ppy);
      fit = Math.max(fit, Math.min(ox, oy));
    }
    if (fit < 0.1) return null;
    var gain = d.d * BAL.pctPerDmg * L.dmg, sc = gain + Math.min(fit, 0.8) * 2;
    var conf = me.hitstun > 0 || me.guardBreak > 0;
    if (L.kill > 0 && me.pct + gain > 55) sc += killPotential(d, dir, gain, c.x, P) * 40 * L.kill;
    if (me.guarding && P.onGround) {
      sc += (d.d - 1.2) * 3 * (1 - me.shield / BAL.shieldMax);
      if (me.shield > 35 && d.d < 2) sc -= 5;                    // don't poke a full shield
    } else if (me.guardBreak > 0) sc += d.d * 6;
    if (!conf) sc -= (d.wind + d.rec) * 14;                      // endlag is a risk unless the hit is already confirmed
    else if (d.wind <= 0.1) sc += 4;                             // fast moves for follow-ups
    if (name === f.lastMove) sc -= 1.5;                          // don't be predictable
    sc += (Math.random() - 0.5) * 4 * (0.3 + L.mix);
    return { name: name, sc: sc, fit: fit };
  }
  function chooseMove(P, L, dir, air) {
    var list = air ? AIR_MOVES : GROUND_MOVES, best = null;
    for (var i = 0; i < list.length; i++) { var e = moveEval(list[i], dir, foe, P, L); if (e && (!best || e.sc > best.sc)) best = e; }
    return best && best.sc > 0 ? best : null;
  }

  // ---- defending
  function cpuDefend(L, T, dx, dy, adx, P) {
    var f = foe;
    var close = (adx < 3.6 && Math.abs(dy) < 2.4) || (P.isDashing && adx < 5.2 && Math.abs(dy) < 2.4);
    if (!close || f.atk || Math.random() < L.err) return false;
    var chance = clampv(L.shield + L.read * T.atk * 0.5, 0, 0.95);
    if (f.onGround) {
      if (Math.random() >= chance) return false;
      var away = -sgn(dx);
      if (f.lvl >= 2 && groundAhead(f, away) && (f.shield < 22 || Math.random() < 0.25 + 0.2 * L.mix)) {
        f.dodge = BAL.dodgeT; f.dodgeDir = away; f.invuln = BAL.dodgeInv;      // roll out of it
      } else { f.guarding = true; f.guardLeft = rnd(0.35, 0.7); }
      return true;
    }
    if (L.air > 0 && !f.airDodged && Math.random() < L.air) {
      f.airDodged = true; f.dodge = BAL.airDodgeT; f.dodgeDir = 0; f.invuln = Math.max(f.invuln, BAL.dodgeInv); f.vx *= 0.3; f.vy *= 0.3;
      return true;
    }
    return false;
  }

  // ---- moving around
  function guardPoint(px, py) {
    var best = null, bd = 1e9;
    stage.ledges.forEach(function (Lg) { var d = Math.abs(Lg.x - px) + Math.abs(Lg.top - py) * 0.5; if (d < bd) { bd = d; best = Lg; } });
    return best;
  }
  // the target is higher than we are: find a platform to climb
  function navToward(f, cx, fFeet, tcx, tFeet, inp) {
    var best = null, bs = 1e9;
    (stage.plats || []).forEach(function (pl) {
      var rise = fFeet - pl.y;
      if (rise < 0.5 || rise > 4.1 || pl.y < tFeet - 0.6) return;
      var dseg = cx < pl.x0 ? pl.x0 - cx : cx > pl.x1 ? cx - pl.x1 : 0;
      var s = Math.abs(pl.y - tFeet) * 1.5 + dseg * 0.6 + Math.abs((pl.x0 + pl.x1) / 2 - tcx) * 0.15;
      if (s < bs) { bs = s; best = pl; }
    });
    if (!best) return false;
    f.navPl = best; f.navT = clock + 1.2;
    var inX = cx >= best.x0 + 0.1 && cx <= best.x1 - 0.1;
    if (best.cloud) {
      if (inX) { inp.jump = true; inp.dir = 0; } else inp.dir = sgn(clampv(cx, best.x0 + 0.3, best.x1 - 0.3) - cx);
    } else {
      var side = cx < best.x0 ? best.x0 - 0.7 : best.x1 + 0.7;
      if (Math.abs(side - cx) < 0.4) { inp.jump = true; inp.dir = sgn((best.x0 + best.x1) / 2 - cx); } else inp.dir = sgn(side - cx);
    }
    return true;
  }

  // ---- getting back to the stage
  // a solid tile within h tiles straight above the body (the stage's underside, a platform)
  function ceilingAbove(f, h) {
    for (var y = Math.floor(f.y) - 1; y >= Math.floor(f.y - h); y--)
      for (var x = Math.floor(f.x); x <= Math.floor(f.x + f.w - 1e-4); x++) if (solidRect(tileAt(x, y))) return true;
    return false;
  }
  function overVoid(f) { var y = f.y + f.h - 0.1; return groundBelow(f.x + 0.05, y, 24) === null && groundBelow(f.x + f.w / 2, y, 24) === null && groundBelow(f.x + f.w - 0.05, y, 24) === null; }
  // Getting back: go around the stage's lip (never up into its underside), kick off walls, grab the ledge,
  // and spend jumps while there's still room to make it instead of after it's already too low.
  function cpuRecover(g, P, dt, L, inp, cx, cy) {
    var f = foe, tgt = nearestLedge(cx, cy);
    if (!f.recWas) { f.recWas = true; f.recMiss = Math.random() > L.recover ? rnd(0.1, 0.3) : 0; f.recT = 0; }   // low levels sometimes hesitate
    if (f.ledgeCD <= 0 && tryGrab(g, f, f, false)) { f.vx = 0; if (f.F) { f.act = null; realCancel(f); } return; }
    var out = tgt ? (tgt.side < 0 ? -1 : 1) : sgn(cx - (stage.x0 + stage.x1) / 2) || 1;
    var ty = tgt ? tgt.top : stage.top, below = f.y - ty;                 // > 0: head is under the ledge top
    var hangX = tgt ? tgt.x + out * (0.25 + f.w / 2) : (stage.x0 + stage.x1) / 2;
    var clearX = tgt ? tgt.x + out * (0.9 + f.w / 2) : hangX;            // fully outside the lip
    var roof = ceilingAbove(f, 3);
    var tx = (below > -0.3 || roof) ? clearX : below < -1.4 ? (tgt ? tgt.x - out * 1.5 : hangX) : hangX;
    var dxl = tx - cx;
    inp.dir = Math.abs(dxl) < 0.15 ? 0 : sgn(dxl);
    if (roof && below > 0) inp.dir = out;                                 // under the stage: get out from under it first
    if (f.recMiss > 0) { f.recMiss -= dt; return; }
    if (f.F && f.act) return;                                             // let the special it's doing finish
    if (f.F) {
      var sk = f.F.strike, busy = !!(sk && (sk.cur || sk.charge));          // its last move is still playing out: a special pressed now would be lost
      f.jumps = Math.max(0, 2 - (f.F.jc || 0));                           // the game's own jump count
    }
    // air dodge for distance: whenever it gets it nearer (any point in the trip, not only as a last resort).
    // 8 directions like yours: toward the ledge, and up unless it's already above it.
    if (!f.airDodged && f.vy > -4 && !(f.F && f.act) && (Math.abs(clearX - cx) > 1.2 || below > -0.5) && !(roof && below > 0)) {
      var ddx = Math.abs(clearX - cx) > 1.2 ? sgn(clearX - cx) : 0, ddy = below > -1 ? -1 : 0;
      if (ddx || ddy) {
        var dl = Math.hypot(ddx, ddy); f.dodgeVec = { x: ddx / dl, y: ddy / dl };
        f.airDodged = true; f.dodge = BAL.airDodgeT; f.invuln = Math.max(f.invuln, BAL.dodgeInv); f.face = ddx || f.face;
        if (f.F && f.F.st) f.F.strike && (f.F.strike.teleported = true);
        return;
      }
    }
    // wall jump: pushed into a wall while falling (the stage's side, a pillar): kick off it, up and away
    if (f.wallHit && f.vy > -3 && (f.wallJumps || 0) < 3 && (f.wjCD || 0) <= 0) {
      f.vy = -12.5; f.vx = -f.wallHit * 7; f.face = -f.wallHit; f.wallJumps = (f.wallJumps || 0) + 1; f.wjCD = 0.25; f.recT = 0.12;
      addFx('ring', f.wallHit > 0 ? f.x + f.w : f.x, f.y + f.h / 2, '#cfe8ff'); return;
    }
    f.recT -= dt;
    if (f.recT > 0) return;
    f.recT = Math.max(0.04, L.react * 0.35 * (0.6 + Math.random() * 0.8));
    if (roof && below > -0.5) return;                                     // a jump here would just hit the ceiling
    var far = Math.abs(clearX - cx);
    // real-moves CPU: Meteor Fist (side special) carries it across a gap, once per trip
    if (f.F && kit(f).dashRec && !busy && !f.act && !f.recSide && far > 2.6 && below < 2.5 && f.vy > -3 && f.F.st.dashCharges > 0) { f.recSide = true; f.act = { type: 'dash', dir: sgn(clearX - cx), t: 0, noFollow: 1 }; return; }   // Blade Dash across
    if (f.F && kit(f).sideRec && !busy && !f.act && !f.recSide && far > 2.6 && below < 2.5 && f.vy > -3) { f.recSide = true; f.act = { type: 'charge', v: 'side', hold: 0.24, dir: sgn(clearX - cx), t: 0 }; return; }
    // how high one more jump can still take us: jump when the ledge is about to go out of reach
    var need = below + 0.4, reachJ = 2.1, late = need > reachJ * 0.45 - (f.F && f.jumps <= 0 ? 1.4 : 0) || (far > 3 && f.vy > 3);   // a charged up special needs a head start
    if (f.vy > -1 && (late || (below > 0.4))) {
      if (f.jumps > 0) { f.jumps--; if (f.F) f.recJump = true; else f.vy = -13.5; }   // real-moves CPU: the game's own jump
      else if (f.burst > 0) {
        var dd = sgn(dxl || f.face); f.burst--;
        if (f.F && kit(f).upTapRec) { if (busy) { f.burst++; return; } f.act = { type: 'tap', v: 'up', dir: dd, t: 0 }; }   // up+S in the air
        else if (f.F && !kit(f).upRec) { f.vy = Math.min(f.vy, -2); }       // no special that lifts it: just the jumps it has
        else if (f.F) { if (busy) { f.burst++; return; } f.act = { type: 'charge', v: 'up', hold: 0.24, dir: dd, t: 0 }; }   // the real Rising Dragon (once its last move is done)
        else { f.vy = -15; f.vx = dd * 7; f.face = dd; }   // last resort
      }
    }
  }

  function cpuStep(g, P, dt) {
    var f = foe, L = LV[f.lvl] || LV[2];
    f.invuln = Math.max(0, f.invuln - dt); f.flash = Math.max(0, f.flash - dt); f.cd = Math.max(0, f.cd - dt);
    f.ledgeCD = Math.max(0, f.ledgeCD - dt); f.ledgeInv = Math.max(0, f.ledgeInv - dt); f.drop = Math.max(0, f.drop - dt);
    if (f.guardBreak > 0) f.guardBreak -= dt;
    if (f.liftHold > 0) { f.liftHold -= dt; f.atk = null; f.act = null; f.guarding = false; return; }   // held by Lift Current
    var b = stage.blast, cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    if (f.lvl > 0 && f.mem) cpuObserve(P, dt);
    if (f.respawnHold > 0) {
      f.respawnHold -= dt; f.x = f.rx; f.y = f.ry; f.vx = f.vy = 0; f.onGround = false;
      return;
    }
    var px = P.x + P.w / 2, py = P.y + P.h / 2, dx = px - cx, dy = py - cy, adx = Math.abs(dx);
    // --- hitstun: pure launch physics
    if (f.hitstun > 0) {
      f.hitstun -= dt;
      f.vx = f.kvx; f.kvx = approach(f.kvx, 0, (f.onGround ? BAL.decayGround : BAL.decayAir) * dt);
      f.vy = Math.min(BAL.fall * 1.3, f.vy + BAL.grav * dt * (f.spiked ? 1 : BAL.stunGrav));
      var pv = f.vy; moveBody(f, dt, true);
      if (f.wallHit && Math.abs(f.kvx) > 8) { f.kvx = -f.kvx * 0.45; g.shake(3); }
      if (f.onGround && pv > (f.spiked ? 10 : 16)) { f.vy = -pv * (f.spiked ? BAL.spikeBounce : 0.45); f.onGround = false; if (f.spiked) { g.shake(6); addFx('ring', f.x + f.w / 2, f.y + f.h, '#ff3b6b'); } f.spiked = false; }
      if (f.hitstun <= 0) f.spiked = false;
      if (f.onGround) { f.jumps = 2; f.airDodged = false; }
      f.chasing = false; f.threatAt = 0;
      checkFoeKO(g);
      return;
    }
    // --- ledge
    if (f.ledge) {
      f.ledgeCmd = null; f.vx = f.vy = 0; var Lg = f.ledge.L; hangPos(f, Lg); f.ledge.t += dt; f.airDodged = false; f.recWas = false; f.chasing = false;
      var threat = adx < 2.8 && f.mem && f.mem.oppAtk;
      if (f.ledge.t > 0.35 + L.react && (!threat || f.ledge.t > BAL.ledgeInv - 0.1)) { f.ledgeCmd = Math.random() < 0.75 ? 'climb' : 'jump'; }
      ledgeHang(g, P, f, dt, false); return;
    }
    if (f.guardBreak > 0) { f.vx = 0; f.vy = Math.min(BAL.fall, f.vy + BAL.grav * dt); moveBody(f, dt); return; }
    if (f.lvl === 0) { // training dummy: stands still, only gravity
      f.vx = approach(f.vx, 0, 40 * dt); f.vy = Math.min(BAL.fall, f.vy + BAL.grav * dt); moveBody(f, dt); if (f.onGround) { f.jumps = 2; } checkFoeKO(g); return;
    }
    if (f.dodge > 0) {
      f.dodge -= dt;
      if (f.dodgeVec) {                                                   // directional air dodge, same as yours: fly along it, easing out
        var dk = f.dodge / BAL.airDodgeT * 0.7 + 0.3;
        f.vx = f.dodgeVec.x * BAL.airDodgeSpeed * dk; f.vy = f.dodgeVec.y * BAL.airDodgeSpeed * dk;
        if (f.dodge <= 0) { f.vx *= 0.3; f.vy *= 0.3; f.dodgeVec = null; }
      } else { f.vx = f.dodgeDir * BAL.dodgeSpeed * (f.dodge / BAL.dodgeT * 0.6 + 0.4); f.vy = Math.min(BAL.fall, f.vy + BAL.grav * dt); }
      moveBody(f, dt); f.invuln = Math.max(f.invuln, 0.05);
      checkFoeKO(g); return;
    }
    if (f.guarding) {
      var mm = f.mem, since = clock - mm.oppAtkEnd;
      f.guardLeft -= dt; f.shield -= BAL.shieldDrain * dt; f.vx = 0; f.vy = Math.min(BAL.fall, f.vy + BAL.grav * dt); moveBody(f, dt);
      if (f.guardLeft <= 0 || f.shield <= 0 || !f.onGround) { f.guarding = false; }
      else if (f.shield < 20 && f.lvl >= 2 && adx < 2.6 && mm.oppAtk && groundAhead(f, -sgn(dx))) { f.guarding = false; f.dodge = BAL.dodgeT; f.dodgeDir = -sgn(dx); f.invuln = BAL.dodgeInv; }   // shield is about to break: roll out
      else if (mm.oppAtk && adx < 3) { f.guardLeft = Math.max(f.guardLeft, 0.12); }                                      // they are still swinging: keep it up
      else if (!mm.oppAtk && since > 0.05 && since < 0.5 && f.punishOK && adx < 2.8) { f.guarding = false; }            // their swing is over: drop it and punish
      else if (adx > 2.5 && Math.random() < dt * 2) { f.guarding = false; }
      return;
    }
    f.shield = Math.min(BAL.shieldMax, f.shield + BAL.shieldRegen * dt);
    if (f.onGround) { f.jumps = 2; f.burst = 1; f.airDodged = false; f.wallJumps = 0; f.recSide = false; }
    f.wjCD = Math.max(0, (f.wjCD || 0) - dt);
    f.think -= dt;
    // --- taunting: stands there showing off (and wide open). Hard CPUs snap out of it if you rush them.
    if (f.taunt > 0) {
      f.taunt -= dt; if (f.em) f.em.t += dt; f.vx = approach(f.vx, 0, 60 * dt); f.vy = Math.min(BAL.fall, f.vy + BAL.grav * dt); moveBody(f, dt);
      if (f.lvl >= 2 && adx < 2 && Math.abs(dy) < 2 && f.taunt < 0.7) f.taunt = 0;
      checkFoeKO(g); return;
    }
    // --- attack in progress
    if (f.atk) { cpuAttack(g, P, dt); checkFoeKO(g); return; }
    // --- recovery: below the stage or outside it
    // offstage = nothing under us to land on (also true under the stage's lip, where the old check
    // thought it was onstage and kept jumping into the underside)
    var offstage = !f.onGround && (overVoid(f) || cy > stage.bottom + 0.5);
    var inp = { dir: 0, jump: false, speed: 1 };
    if (offstage) {
      // a committed edgeguard: swing at them on the way out, then come back
      if (f.chasing && f.cd <= 0 && f.jumps >= 2 && cy < stage.bottom - 3 && !f.atk) {
        var dd = sgn(dx || f.face), pk = chooseMove(P, L, dd, true);
        if (pk && Math.random() < 0.5 + 0.5 * L.aggr) { startAtk(pk.name, dd); f.lastMove = pk.name; cpuAttack(g, P, dt); checkFoeKO(g); return; }
      }
      if (f.jumps < 2 || cy > stage.bottom - 3) f.chasing = false;
      cpuRecover(g, P, dt, L, inp, cx, cy);
      if (f.ledge) return;
    } else {
      f.recWas = false;
      cpuBrain(g, P, dt, L, inp, dx, dy, adx, cx, cy, px, py);
      if (f.atk) { cpuAttack(g, P, dt); return; }
    }
    // --- apply movement
    if (f.F) { realMove(g, P, dt, inp); checkFoeKO(g); return; }      // a real-moves CPU presses the game's buttons instead
    var air = !f.onGround, acc = air ? 28 : 70, run = 8.2 * (inp.speed || 1);
    f.vx = approach(f.vx, inp.dir * run, acc * dt);
    if (inp.dir !== 0) f.face = inp.dir;
    if (inp.jump && f.jumps > 0 && (f.onGround || f.vy > -2)) { f.vy = f.onGround ? -13.5 : -12.5; f.jumps--; f.onGround = false; }
    f.vy = Math.min(BAL.fall, f.vy + BAL.grav * dt);
    moveBody(f, dt, f.drop > 0);
    checkFoeKO(g);
  }
  function nearestLedge(cx, cy) {
    var best = null, bd = 1e9;
    stage.ledges.forEach(function (L) { if (L.occ && L.occ !== foe) return; var d = Math.hypot(L.x - cx, L.top - cy); if (d < bd) { bd = d; best = L; } });
    return best;
  }
  function checkFoeKO(g) {
    var f = foe, b = stage.blast, cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    if (cx < b.left || cx > b.right || cy > b.bottom || cy < b.top) koFoe(g);
  }
  function groundAhead(f, dir) { var x = dir > 0 ? f.x + f.w + 0.5 : f.x - 0.5; return groundBelow(x, f.y + f.h - 0.2, 3) !== null; }
  function wallAhead(f, dir) { var x = Math.floor(dir > 0 ? f.x + f.w + 0.25 : f.x - 0.25); var y = Math.floor(f.y + f.h - 0.4); return !!solidRect(tileAt(x, y)); }

  function cpuBrain(g, P, dt, L, inp, dx, dy, adx, cx, cy, px, py) {
    var f = foe, m = f.mem, T = tendency(m), now = clock;
    cpuMood(L, T, dt);
    f.jumpCD = Math.max(0, f.jumpCD - dt);
    f.face = dx === 0 ? f.face : sgn(dx);
    // 1. react to a swing we noticed, after a reaction delay
    if (f.threatAt > 0 && now >= f.threatAt) {
      f.threatAt = 0;
      if (f.F && f.F.protag && f.F.protag.abilities.indexOf('ab_retaliate') >= 0 && !(f.F.st._protagRetaliateCD > 0) && !f.act && adx < 3 && Math.random() < 0.3 + 0.3 * L.read) { f.act = { type: 'key', key: 'c', dir: sgn(dx || f.face), t: 0 }; inp.dir = 0; return; }
      if (cpuDefend(L, T, dx, dy, adx, P)) { inp.dir = 0; return; }
    }
    // 2. where will they be? (a short look-ahead on their movement)
    var qx = px + P.vx * 0.18 * L.pred, qdx = qx - cx, qadx = Math.abs(qdx);
    var oppLedge = me.ledge ? me.ledge.L : null;
    var oppOff = !P.onGround && (!!oppLedge || ((px < stage.x0 - 0.3 || px > stage.x1 + 0.3) && py > stage.top - 4) || py > stage.bottom + 0.5);
    if (oppOff && !m.oppOff) m.chaseOK = L.edge > 0 && me.hitstun <= 0 && !oppLedge && Math.random() < L.edge * 0.45 && f.pct < 110 && f.jumps >= 2 && f.burst > 0 && adx < 9;
    m.oppOff = oppOff;
    if (!oppOff) f.chasing = false;
    var gp = (oppOff && L.edge > 0 && !f.chasing) ? (oppLedge || guardPoint(px, py)) : null;
    // 3. how close do we want to be?
    var hold = m.mood === 'aggro' ? 1.35 : m.mood === 'bait' ? 3.1 : 2.3;
    hold += Math.sin(now * 2.4 + m.seed) * 0.4 * (0.4 + L.mix);
    var punish = (f.punishUntil > now && f.punishOK) || (me.guardBreak > 0 && Math.random() < 0.3 + 0.7 * L.punish);
    var follow = me.hitstun > 0 && f.comboOK;
    if (follow || punish) hold = 0.9;
    else if (me.guarding) hold = me.shield < 32 ? 1.3 : 2.9;           // pressure a weak shield, wait out a strong one
    // calm moods (only when nothing urgent is going on)
    var urgent = follow || punish || !!gp || f.chasing || oppOff;
    var calm = !urgent && (m.mood === 'idle' || m.mood === 'hop' || m.mood === 'stand' || me.respawnHold > 0);
    var wander = m.mood === 'idle' || m.mood === 'hop';
    var threatened = adx < 2.6 && Math.abs(dy) < 2.2;           // you're in its face: it fights back
    if (!urgent && me.respawnHold > 0) hold = 4.2;                      // don't camp the respawn platform
    if (f.tauntQ && me.respawnHold <= 0 && adx < 4) f.tauntQ = false;        // the moment passed
    // a quick taunt: after a KO, or now and then during a breather when you're far away
    if (f.onGround && !f.atk && (f.tauntQ || (calm && wander && !m.taunted && adx > 4.5 && Math.random() < dt * 0.7))) {
      if (f.tauntQ || (adx > 4.5 && me.hitstun <= 0)) { startTaunt(); return; }
    }
    f.preShieldCD = Math.max(0, (f.preShieldCD || 0) - dt);
    var tdx = qdx, tadx = qadx;
    if (calm && wander && me.respawnHold <= 0) {
      // wander somewhere on the stage, away from you, at a walk
      if (f.wanderX === null || Math.abs(f.wanderX - cx) < 0.4 && Math.random() < dt * 0.8) {
        var lo = stage.x0 + 1.5, hi = stage.x1 - 1.5, wx = rnd(lo, hi);
        if (Math.abs(wx - px) < 3.5) wx = clampv(px + (wx < px ? -4 : 4), lo, hi);
        f.wanderX = wx;
      }
      tdx = f.wanderX - cx; tadx = Math.abs(tdx); hold = 0.3; inp.speed = m.mood === 'hop' ? 0.75 : 0.5;
      if (threatened && f.cd <= 0.05) { tdx = qdx; tadx = qadx; hold = 1.2; inp.speed = 1; }  // you came over: square up and swing
      else if (threatened && Math.abs(f.wanderX - px) < 3.5) f.wanderX = null;            // swung already: wander off again
    }
    if (gp) { tdx = gp.x + (gp.side < 0 ? 1.15 : -1.15) - cx; tadx = Math.abs(tdx); hold = 0.3; }
    else if (oppOff && m.chaseOK && f.onGround && f.jumps >= 2) { f.chasing = true; hold = 0; }
    var want = 0;
    if (tadx > hold + 0.25) want = sgn(tdx);
    else if (!gp && !f.chasing && qadx < hold - 0.7 && f.cd > 0.05 && me.hitstun <= 0) want = -sgn(qdx);
    if (calm && m.mood === 'stand' && me.respawnHold <= 0) {
      // hold the spot, but shuffle on it like a person (a half step in, a half step out), and walk in if you're far
      want = qadx > 5 ? sgn(qdx) : 0; inp.speed = 0.5;
      if (!want && f.onGround) { f.shufT = (f.shufT || 0) - dt; if (f.shufT <= 0) { f.shufT = rnd(0.35, 0.8); f.shufD = Math.random() < 0.5 ? 0 : (Math.random() < 0.55 ? 1 : -1) * sgn(qdx || f.face); } if (f.shufT > 0.2 && groundAhead(f, f.shufD || 1)) want = f.shufD || 0; }
      // you're walking in: put the shield up before you swing
      var coming = sgn(P.vx) === -sgn(dx) && Math.abs(P.vx) > 2;
      if (f.onGround && f.preShieldCD <= 0 && adx < 3 && Math.abs(dy) < 2 && coming && f.shield > 30 && Math.random() < dt * (2 + 4 * L.shield)) {
        f.guarding = true; f.guardLeft = rnd(0.4, 0.9); f.preShieldCD = rnd(1, 2.2); inp.dir = 0; return;
      }
    }
    // footsies: parked at its spacing with nothing going on, it doesn't stand still waiting for you to move.
    // It dances in and out, and every so often commits and walks in to swing.
    if (!calm && !urgent && want === 0 && f.onGround && !f.atk && me.hitstun <= 0 && me.respawnHold <= 0 && f.lvl > 0) {
      f.commitT = Math.max(0, (f.commitT || 0) - dt);
      if (f.commitT > 0) { if (qadx > 1.0) want = sgn(qdx); }
      else {
        f.danceT = (f.danceT || 0) - dt;
        if (f.danceT <= 0) {
          f.danceT = rnd(0.18, 0.45);
          var r2 = Math.random();
          f.danceD = r2 < 0.42 ? sgn(qdx || f.face) : r2 < 0.78 ? -sgn(qdx || f.face) : 0;
          if (Math.random() < 0.18 + 0.25 * L.aggr * (m.mood === 'aggro' ? 1.5 : m.mood === 'bait' ? 0.4 : 1)) f.commitT = rnd(0.5, 0.9);
        }
        want = f.danceD || 0;
        if (want === -sgn(qdx) && qadx > hold + 1.2) want = 0;          // don't drift too far back out
      }
    }
    var retreat = want !== 0 && want !== sgn(qdx || f.face);
    // 4. terrain: platforms, walls, gaps
    var fFeet = f.y + f.h, tFeet = P.y + P.h;
    if (f.onGround) {
      var navved = false;
      if (!gp && !f.chasing && !calm && tFeet < fFeet - 1.4 && m.navOK) { navved = navToward(f, cx, fFeet, px, tFeet, inp); if (navved) want = inp.dir; }
      if (!navved) {
        if (dy < -1.6 && adx < 2.4 && f.jumpCD <= 0 && (me.hitstun > 0 || Math.random() < 0.5)) { inp.jump = true; f.jumpCD = 0.35; }
        if (dy < -1.6 && adx >= 2.4 && want !== 0 && wallAhead(f, want)) inp.jump = true;
      }
      if (dy > 1.8 && adx < 1.8) { var under = tileAt(Math.floor(cx), Math.floor(f.y + f.h + 0.1)); if (under && under.type === 'cloud') f.drop = 0.3; }
      if (want !== 0 && !groundAhead(f, want) && !f.chasing) {
        if (retreat) want = 0;                                           // never back off a cliff
        else if (dy < 1.5 && adx > 2.5) inp.jump = true;                // same level or above: jump the gap
        else if (Math.abs(dy) < 1.5 || adx < 2.5) want = 0;
        else if (groundBelow(f.x + (want > 0 ? f.w + 0.8 : -0.8), fFeet, 12) === null) want = 0;   // they're lower, but only follow if there's floor down there
      }
      if (want !== 0 && wallAhead(f, want)) inp.jump = true;
    } else {
      var onNav = f.navPl && f.navT > now;
      if (onNav && fFeet > f.navPl.y + 0.15 && f.vy > -2 && f.jumps > 0 && cx > f.navPl.x0 - 0.4 && cx < f.navPl.x1 + 0.4) inp.jump = true;
      else if (dy < -1.8 && f.vy > 1 && f.jumps > 0 && adx < 4 && (follow || Math.random() < 0.5)) inp.jump = true;
      if (onNav && fFeet > f.navPl.y - 0.2) want = cx < f.navPl.x0 + 0.2 ? 1 : cx > f.navPl.x1 - 0.2 ? -1 : 0;
    }
    // human-looking approaches at Lv2+: a stutter step now and then, and a mix of running in and jumping in,
    // so it doesn't glide at you on rails
    if (!calm && !urgent && f.lvl >= 2 && f.onGround && want === sgn(qdx) && me.hitstun <= 0) {
      f.stutT = Math.max(0, (f.stutT || 0) - dt);
      if (f.stutT > 0.12) want = 0;                                     // brief hesitation
      else if (f.stutT <= 0 && qadx > 2.6 && qadx < 5.5 && Math.random() < dt * (0.5 + L.mix)) f.stutT = rnd(0.18, 0.4);
      if (qadx > 2.4 && qadx < 4.2 && f.jumpCD <= 0 && Math.abs(dy) < 1.2 && Math.random() < dt * (0.6 + 0.6 * L.aggr) * (m.mood === 'aggro' ? 1.4 : 1)) {
        inp.jump = true; f.jumpCD = rnd(0.7, 1.5);                       // jump in
      }
    }
    // after a whiff it sometimes backs off instead of standing there
    if (f.backOff > 0) { f.backOff -= dt; if (!urgent && me.hitstun <= 0 && f.onGround && groundAhead(f, -sgn(qdx))) want = -sgn(qdx); }
    inp.dir = want;
    // hop mood: jump around for no real reason, sometimes double jump, sometimes drop through a cloud
    if (calm && m.mood === 'hop' && !threatened) {
      if (f.onGround && f.jumpCD <= 0 && Math.random() < dt * 1.6) { inp.jump = true; f.jumpCD = rnd(0.4, 1.1); }
      else if (!f.onGround && f.jumps > 0 && f.vy > 1 && Math.random() < dt * 1.2) inp.jump = true;
      if (f.onGround && Math.random() < dt * 0.5) { var un = tileAt(Math.floor(cx), Math.floor(f.y + f.h + 0.1)); if (un && un.type === 'cloud') f.drop = 0.3; }
    }
    // a CPU that's minding its own business still shields a swing it sees coming
    if (calm && threatened && f.onGround && me.hitstun <= 0 && f.mem.oppAtk && f.shield > 25 && (f.preShieldCD || 0) <= 0 && Math.random() < 0.25 + L.shield * 0.5) {
      f.guarding = true; f.guardLeft = rnd(0.3, 0.6); f.preShieldCD = rnd(0.8, 1.8); inp.dir = 0; return;
    }
    // 5. attack
    // calm moods only swing at you when you're right there (stand counters harder than idle)
    var moodK = m.mood === 'aggro' ? 1.25 : m.mood === 'bait' ? 0.7 : 1;
    if (calm) moodK = threatened ? (m.mood === 'stand' ? 1.6 : 1.2) : 0;
    var gate = ((punish || follow) && f.cd <= 0.12) ||
      (f.cd <= 0 && Math.random() < dt * 9 * L.aggr * moodK);
    if (gate && Math.random() >= L.err * (follow ? 0.3 : 1)) {
      var dir = sgn(qdx || f.face);
      if (f.F) { if (realPick(f, L, dir, dx, dy, adx)) inp.dir = 0; }   // real moves: the same buttons you press
      else {
        var pick = chooseMove(P, L, dir, !f.onGround);
        if (pick) { startAtk(pick.name, dir); f.lastMove = pick.name; inp.dir = 0; }
      }
    }
  }

  // ---------------------------------------------------------------- real-moves CPU
  // Fighters listed here are played through the game's own code (index.html fighterRun): the CPU gets its
  // own player state, held keys and strike-engine state, presses the same buttons you do, and its attacks
  // are the real ones. Its target is a stand-in for you; whatever the attack does to it becomes your
  // percent and launch. Knockback, ledges, dodges and respawns stay with this file, synced both ways.
  var REAL_CPU = { brawler: 1, cb_slugger: 1, cb_protagonist: 1, cb_chameleon: 1, cb_pressplay: 1, cb_pp_mixtape: 1, cb_gale: 1, cb_kodiak: 1, cb_valka: 1, cb_boiler: 1, cb_sleight: 1, cb_fizz: 1, cb_maul: 1, cb_masque: 1, cb_mario_ref: 1, cb_luigi_ref: 1, cb_peach_ref: 1, pl_grand_pebble: 1, archmage: 1, phantomace: 1, formSwitcher: 1, conduit: 1 };
  // what each real-moves fighter's kit is good for (all of it is pressed with the same buttons you use)
  //  sideRec / upRec: its side / up special moves it (usable to get back)   dash: dash-then-S attacks
  //  airThrow: S in the air throws something that travels (range in tiles)   groundOnly: specials only on the ground
  var KIT = {
    brawler:    { sideRec: 1, upRec: 1, dash: 1 },
    cb_slugger: { airThrow: 6, slAir: 1, upRec: 1 },   // aerials: up Sky Hook, down Hammer Drop, side Corkscrew, neutral glove jabs; up special lifts
    // Protagonist: S tap = his sword strings (ground and air, with direction), S held = his charged attack,
    // dash = Blade Dash (also gets him back across a gap), up+S in the air = Skybound Slash (lifts with some moves),
    // Q = Whirlwind Slash, C = Guardian's Counter (when equipped)
    cb_protagonist: { dash: 1, dashRec: 1, upTapRec: 1, protag: 1 },
    // Chroma: five forms, each a different fighter (0 = next form, which also cancels his move): Ember brawls up close,
    // Frost shoots from range, Venom grabs with the tongue, Volt blinks, Lumen hits and mends himself (SM.__heal).
    // Every form's up move in the air lifts him.
    // K = Tongue Chain (twice for the finisher); held S charges any move
    cb_chameleon: { cham: 1, upTapRec: 1, sideRec: 1 },
    // Press Play Prodigy: each EQ mode's S moves by direction (ground and air), presses on the beat for Hype
    // (Lv2+), K = THE DROP when Hype is full, G = next EQ mode, up in the air lifts once per jump
    cb_pressplay: { prod: 1, upTapRec: 1 },
    // Press Play Mixtape: Tape Whip / Fast-Forward Dash / Spool Launch / Tangle on the ground, Ribbon Lash / Tape Zip /
    // Rewind Climb / Eject Slam in the air, K = FAST FORWARD when the Tape meter is full, G = flip the tape's side
    cb_pp_mixtape: { mix: 1, upTapRec: 1 },
    // Gale: Kite Lash / Kite Reel (long range, many hits, drags you to her) / Updraft Vent / Downburst on the ground,
    // Pinwheel (many hits) / Slipstream / Jetstream / Dive Kick in the air; held S charges any of them (air side held = a longer Slipstream, gets back across)
    cb_gale: { gale: 1, upTapRec: 1, sideRec: 1 },
    // the fighter-kit fighters (fkit.js): each one's own ai() in its plugin says what to press
    cb_kodiak: { fk: 1, upTapRec: 1 }, cb_valka: { fk: 1, upTapRec: 1 }, cb_boiler: { fk: 1, upTapRec: 1 }, cb_sleight: { fk: 1, upTapRec: 1 },
    cb_fizz: { fk: 1, upTapRec: 1 }, cb_maul: { fk: 1, upTapRec: 1 }, cb_masque: { fk: 1, upTapRec: 1 },
    cb_mario_ref: { fk: 1, upTapRec: 1 }, cb_luigi_ref: { fk: 1, upTapRec: 1 }, cb_peach_ref: { fk: 1, upTapRec: 1 }, pl_grand_pebble: { fk: 1, upTapRec: 1 },
    // The base fighters: direction + S picks the move (range = how far its side / neutral move reaches), held S = specials
    archmage:     { gen: 8, upRec: 1 },                                   // up ice, down walls, side rocket, neutral fire
    // Phantom Ace: Phantom Flurry / Phantom Blitz / Ascending Star / Star Circle on the ground, Crescent Wheel / Phantom Pierce /
    // Rising Ace / Card Drop in the air: all many-hit, all leech; held S charges any of them (air side held gets him back)
    phantomace:   { ace: 1, dash: 1, upTapRec: 1, sideRec: 1 },
    formSwitcher: { gen: 6, formKey: '0', upRec: 1 },                     // each element's own moves; 0 = next element
    conduit:      { gen: 8, upRec: 1 }                                    // Arc Stream, Lift Current, spikes, bolts
  };
  function plugInfo(name) { var pl = (window._fighterPlugins || []).filter(function (q) { return q.name === name; })[0]; return pl && pl.info ? pl.info() : null; }
  function kit(f) { return KIT[f.char] || {}; }
  // post-draw: the CPU's own plugin ticks (Slugger's gloves fly, hit and are drawn here, like yours are)
  (window.__fighterHubs = window.__fighterHubs || []).push(function (dt) {
    if (!SM.active || !foe || !foe.F || SM.phase !== 'fight' || foe.respawnHold > 0) return;
    var st0 = foe.F.st, bx = st0.x, by = st0.y;
    G().fighterHub(foe.F, Math.min(dt, 0.033));
    var st1 = foe.F.st;                                                   // a plugin moved it (Chroma's tongue pull): keep that
    if (Math.abs(st1.x - bx) > 1e-4 || Math.abs(st1.y - by) > 1e-4) { foe.x = st1.x; foe.y = st1.y; foe.vx = st1.vx; foe.vy = st1.vy; }
  });
  // stop whatever its strike engine is doing, keeping its bookkeeping (an empty state would read as a
  // character change and cancel the next thing it presses)
  function realCancel(f) {
    var s0 = f.F.strike;
    if (s0) { s0.cur = null; s0.charge = null; s0.buffered = null; } else f.F.strike = { lastChar: f.char };
  }
  // its own progress, by CPU level: Lv1 a beginner, Lv2 part-way, Lv3 everything
  function realProgress(f) {
    var g = G(), D = g.fighterDefs ? g.fighterDefs(f.char) : { ups: [] }, lvl = f.lvl || 2, F = f.F;
    var share = lvl <= 1 ? 0 : lvl === 2 ? 0.5 : 1;
    F.ups = new Set(D.ups.slice(0, Math.round(D.ups.length * share)));
    if (f.char === 'cb_protagonist' && D.protagMoves) {
      var hero = lvl <= 1 ? 2 : lvl === 2 ? 5 : D.protagMaxLevel || 7, maxCost = lvl <= 1 ? 0 : lvl === 2 ? 2 : 3;
      for (var i = 1; i <= Math.min(6, hero); i++) F.ups.add('pt' + i);                                  // level rewards
      var moves = {};
      Object.keys(D.protagMoves).forEach(function (slot) {
        var ok = D.protagMoves[slot].filter(function (m) { return (m.cost || 0) <= maxCost; });
        var m = lvl >= 3 && Math.random() < 0.6 ? ok[ok.length - 1] : ok[Math.floor(Math.random() * ok.length)];
        moves[slot] = (m || D.protagMoves[slot][0]).id;
      });
      var ab = [];
      if (lvl >= 2) ab.push(Math.random() < 0.5 ? 'ab_whirlwind' : 'ab_retaliate');
      if (lvl >= 3) ab = ['ab_whirlwind', 'ab_retaliate', 'ab_doublejump'];
      F.protag = { level: hero, moves: moves, abilities: ab };
    }
  }
  function realSetup(f) {
    var g = G();
    f.F = g.fighterNew(f.char, f.x, f.y);
    realProgress(f);
    f.tgt = mkEnt(); f.F.targets = [f.tgt];
    f.w = f.F.st.w || f.w; f.h = f.F.st.h || f.h;
    f.act = null; f.tgtLock = 0;
  }
  // Pick what to press, the way a player would with Brawler's kit:
  //  tap S = the punch combo (up/down/back change it), hold S then let go = a special (side METEOR FIST,
  //  up RISING DRAGON, down EARTHQUAKE; longer hold = stronger), dash then S = a dash attack.
  function realPick(f, L, dir, dx, dy, adx) {
    if (f.act) return false;
    if (G().player._invisT > 0 && Math.random() < 0.65) return false;   // you vanished (Sleight): it loses track of you
    var killy = me.pct > 85, air = !f.onGround, r = Math.random(), K = kit(f);
    var A = null;
    if (K.gen && !A) {
      var R = K.gen;
      if (K.formKey && f.lvl >= 2 && (f.eqT = (f.eqT || 0) - 0.05) < 0 && Math.random() < 0.2) { f.eqT = rnd(7, 14); A = { type: 'key', key: K.formKey }; }
      else if (!air && (killy || r < 0.12) && adx < 6 && Math.abs(dy) < 1.4) A = { type: 'charge', v: adx < 2.4 ? (dy < -1 ? 'up' : 'down') : 'side', hold: killy ? rnd(0.55, 0.8) : rnd(0.3, 0.5) };
      else if (K.dash && !air && adx > 2.5 && adx < 5 && Math.abs(dy) < 1.2 && r < 0.3 && f.F.st.dashCharges > 0) A = { type: 'dash' };
      else if (air) A = dy < -0.8 && adx < 2.5 ? { type: 'tap', v: 'up' } : dy > 0.8 && adx < 2 ? { type: 'tap', v: 'down' } : adx < R && Math.abs(dy) < 1.5 ? { type: 'tap', v: Math.random() < 0.5 ? 'side' : '' } : null;
      else A = dy < -1.2 && adx < 3 ? { type: 'tap', v: 'up' } : adx < 2 && Math.abs(dy) < 1.4 ? { type: 'tap', v: Math.random() < 0.6 ? '' : 'down' } : adx < R && Math.abs(dy) < 1.4 ? { type: 'tap', v: Math.random() < 0.6 ? 'side' : '' } : null;
    }
    if (K.mix && !A) {
      var ms = f.F.plug && f.F.plug.mixtape;
      if (ms && ms.tape >= 10 && !ms.ff && adx < 6) A = { type: 'key', key: 'k' };                                // FAST FORWARD
      else if (f.lvl >= 2 && (f.eqT = (f.eqT || 0) - 0.05) < 0 && Math.random() < 0.2) { f.eqT = rnd(8, 15); A = { type: 'key', key: 'g' }; }
      else if (!air && (killy || r < 0.1) && adx < 5 && Math.abs(dy) < 1.4) A = { type: 'charge', v: adx < 2.4 ? (dy < -1 ? 'up' : 'down') : 'side', hold: killy ? rnd(0.55, 0.8) : rnd(0.3, 0.5) };   // REWIND RUSH / TAPE TORNADO / SPOOL SNARE
      else if (air) A = dy < -0.8 && adx < 2 && !(ms && ms.airUpUsed) ? { type: 'tap', v: 'up' } : dy > 0.8 && adx < 1.6 ? { type: 'tap', v: 'down' } : adx < 7 && Math.abs(dy) < 2.5 ? { type: 'tap', v: adx > 3 ? 'side' : '' } : null;
      else A = dy < -1.2 && adx < 2.5 ? { type: 'tap', v: 'up' } : adx < 3 && Math.abs(dy) < 1.4 ? { type: 'tap', v: Math.random() < 0.7 ? '' : 'down' } : adx < 6 && Math.abs(dy) < 1.2 ? { type: 'tap', v: 'side' } : null;
    }
    if (K.fk && !A) {
      var fpl = (window._fighterPlugins || []).filter(function (q) { return q.char === f.char; })[0];
      if (fpl && fpl.ai) { try { A = fpl.ai({ dx: dx, dy: dy, adx: adx, air: air, killy: killy, r: r, lvl: f.lvl, S: f.F.plug && f.F.plug[fpl.name] }); } catch (e) { A = null; } }
      if (!A) { if (!air && adx > 1.2) return false; }
    }
    if (K.gale && !A) {
      var gs = f.F.plug && f.F.plug.gale;
      if (gs && gs.kiteBusy) A = null;                                                                             // the kite is out working: move, don't press
      else if (!air && (killy || r < 0.12) && adx < 5 && Math.abs(dy) < 1.4) A = { type: 'charge', v: adx < 2.2 ? (dy < -1 ? 'up' : 'down') : adx < 3.4 ? '' : 'side', hold: killy ? rnd(0.55, 0.8) : rnd(0.3, 0.5) };   // charged SKY GEYSER / TWISTER / STORM LASH / STORM REEL
      else if (!air && adx > 2.6 && adx < 7 && Math.abs(dy) < 1.2 && r < 0.6) A = { type: 'tap', v: 'side' };       // KITE REEL: snag from range and drag in
      else if (air) A = dy < -0.8 && adx < 1.8 && !(gs && gs.airUpUsed) ? { type: 'tap', v: 'up' } : dy > 0.6 && dy < 4 && adx < 2 ? { type: 'tap', v: 'down' } : adx < 2.6 && Math.abs(dy) < 2.4 ? { type: 'tap', v: '' } : adx < 4.5 && Math.abs(dy) < 1.2 && !(gs && gs.airSideUsed) ? { type: 'tap', v: 'side' } : null;
      else A = dy < -1.2 && adx < 2 ? { type: 'tap', v: 'up' } : adx < 3 && Math.abs(dy) < 1.5 ? { type: 'tap', v: Math.random() < 0.7 ? '' : 'down' } : null;
    }
    if (K.ace && !A) {
      var as = f.F.plug && f.F.plug.ace;
      if (as && as.busy) A = null;                                                                                // mid-move: the cuts are still landing
      else if (!air && (killy || r < 0.12) && adx < 4.5 && Math.abs(dy) < 1.4) A = { type: 'charge', v: adx < 2.2 ? (dy < -1 ? 'up' : Math.random() < 0.5 ? 'down' : '') : 'side', hold: killy ? rnd(0.55, 0.8) : rnd(0.3, 0.5) };   // charged STAR ASCENSION / GRAND STAR CIRCLE / PHANTOM STORM / PHANTOM RAID
      else if (air) A = dy < -0.8 && adx < 1.5 && !(as && as.airUp) ? { type: 'tap', v: 'up' } : dy > 0.6 && dy < 4 && adx < 1.2 ? { type: 'tap', v: 'down' } : adx < 2 && Math.abs(dy) < 1.8 ? { type: 'tap', v: '' } : adx < 4.5 && Math.abs(dy) < 1 && !(as && as.airSide) ? { type: 'tap', v: 'side' } : null;
      else A = dy < -1.2 && adx < 1.5 ? { type: 'tap', v: 'up' } : adx < 2.6 && Math.abs(dy) < 1.3 ? { type: 'tap', v: Math.random() < 0.6 ? '' : 'down' } : adx < 5 && Math.abs(dy) < 1 ? { type: 'tap', v: 'side' } : null;
    }
    if (K.prod && !A) {
      var ps = f.F.plug && f.F.plug.prodigy;
      if (ps && ps.hype >= 10 && adx < 7 && Math.abs(dy) < 3) A = { type: 'key', key: 'k' };                    // THE DROP
      else if (f.lvl >= 2 && (f.eqT = (f.eqT || 0) - 0.05) < 0 && Math.random() < 0.2) { f.eqT = rnd(7, 14); A = { type: 'key', key: 'g' }; }
      else if (!air && (killy || r < 0.12) && adx < 6 && Math.abs(dy) < 1.4) A = { type: 'charge', v: adx < 2.2 ? (dy < -1 ? 'up' : 'down') : 'side', hold: killy ? rnd(0.55, 0.8) : rnd(0.3, 0.5) };   // BASS CANNON / RISER BLAST / SUB DROP
      else if (air) A = dy < -0.8 && adx < 2 && !(ps && ps.airUpUsed) ? { type: 'tap', v: 'up' } : dy > 0.8 && adx < 2 ? { type: 'tap', v: 'down' } : adx < 6 && Math.abs(dy) < 1.5 ? { type: 'tap', v: Math.random() < 0.6 ? '' : 'side' } : null;
      else A = dy < -1.2 && adx < 3 ? { type: 'tap', v: 'up' } : adx < 1.8 && Math.abs(dy) < 1.4 ? { type: 'tap', v: Math.random() < 0.5 ? '' : 'down' } : adx < 6 && Math.abs(dy) < 1.4 ? { type: 'tap', v: Math.random() < 0.5 ? 'side' : '' } : null;
      if (A && (A.type === 'tap' || A.type === 'charge') && f.lvl >= 2) A.beat = true;                         // wait for the beat for Hype
    }
    if (K.cham && !A) {
      var cs = f.F.plug && f.F.plug.cham, fm = cs ? cs.form || 0 : 0, ady = Math.abs(dy);
      var tg = f.F.plug && f.F.plug.chamTongue, dist = Math.hypot(dx, dy);
      if (cs && cs.busy) A = null;                                                                             // mid-move
      else if (tg && tg.ph === 2) A = { type: 'key', key: 'k' };                                               // finish the tongue combo
      else if ((!tg || (!(tg.cd > 0) && !tg.ph)) && dist > 1.8 && dist < 5.6 && Math.random() < 0.2) A = { type: 'key', key: 'k' };   // Tongue Chain
      else if (f.lvl >= 2 && (f.formT = (f.formT || 0) - 0.05) < 0 && Math.random() < 0.25) { f.formT = rnd(4, 9); A = { type: 'key', key: '0' }; }   // next form (and a PRISM move)
      else if (!air && (killy || r < 0.12) && adx < 5 && ady < 1.4) A = { type: 'charge', v: adx < 2.2 ? (dy < -1 ? 'up' : fm === 0 || fm === 2 ? 'down' : '') : 'side', hold: killy ? rnd(0.55, 0.8) : rnd(0.3, 0.5) };
      else if (air) A = dy < -0.8 && adx < 1.8 && !(cs && cs.airUp) ? { type: 'tap', v: 'up' } : dy > 0.6 && dy < 5 && adx < 1.2 ? { type: 'tap', v: 'down' } : adx < (fm === 3 ? 6 : 2) && ady < 1.8 ? { type: 'tap', v: '' } : adx < 5 && ady < (fm === 2 ? 2.5 : 1) && !(cs && cs.airSide) ? { type: 'tap', v: 'side' } : null;
      else if (fm === 0) A = dy < -1.2 && adx < 1.6 ? { type: 'tap', v: 'up' } : adx < 2 && ady < 1.3 ? { type: 'tap', v: Math.random() < 0.7 ? '' : 'down' } : adx < 4.6 && ady < 1 ? { type: 'tap', v: 'side' } : null;                      // Ember: get in and claw
      else if (fm === 1) A = adx < 2 && ady < 2 && Math.random() < 0.5 ? { type: 'tap', v: 'down' } : adx < 8 && ady < 0.9 ? { type: 'tap', v: Math.random() < 0.5 ? '' : 'side' } : adx > 1 && adx < 7.5 && ady < 3.5 ? { type: 'tap', v: 'up' } : null;   // Frost: keep away and shoot
      else if (fm === 2) A = adx < 1.9 && ady < 1.2 ? { type: 'tap', v: '' } : adx < 4.8 && ady < 0.8 ? { type: 'tap', v: Math.random() < 0.7 ? 'side' : 'down' } : adx < 5 && ady < 2.4 && Math.random() < 0.5 ? { type: 'tap', v: 'down' } : adx > 2.5 && adx < 8 && ady < 2 ? { type: 'tap', v: 'up' } : null;   // Venom: tongue, vanish, mortar
      else if (fm === 3) A = adx < 1.9 && ady < 1.2 ? { type: 'tap', v: Math.random() < 0.75 ? '' : 'down' } : adx < 5.4 && ady < 0.9 ? { type: 'tap', v: 'side' } : adx < 7 && ady < 4 ? { type: 'tap', v: 'up' } : null;                      // Volt: jab, blink, thunder
      else A = dy < -1.2 && adx < 1.5 ? { type: 'tap', v: 'up' } : adx < 1.9 && ady < 1.2 ? { type: 'tap', v: Math.random() < (f.pct > 40 && !(cs && cs.sanct > 0) ? 0.45 : 0.85) ? '' : 'down' } : adx < 6 && ady < 0.8 ? { type: 'tap', v: 'side' } : f.pct > 40 && adx > 3.5 && !(cs && cs.sanct > 0) ? { type: 'tap', v: 'down' } : null;   // Lumen: palm, siphon, and a Sanctuary to mend in when hurt
    }
    if (K.protag && !A) {
      var pst = f.F.st, ab = (f.F.protag && f.F.protag.abilities) || [];
      if (ab.indexOf('ab_whirlwind') >= 0 && !(pst._protagWhirlwindCD > 0) && adx < 2.4 && Math.abs(dy) < 1.8 && Math.random() < 0.35) A = { type: 'key', key: 'q' };   // Whirlwind Slash: you're in its circle
    }
    if (A) {}
    else if (air && K.slAir) {                                                                  // Slugger's aerials, picked by where you are
      if (killy && adx < 2.4 && Math.abs(dy) < 1.4 && Math.random() < 0.4) A = { type: 'charge', v: 'side', hold: rnd(0.5, 0.75) };   // HOME RUN in the air
      else if (adx < 1.4 && dy < -0.8 && dy > -2.8) A = { type: 'tap', v: 'up' };                // Sky Hook
      else if (adx < 1.3 && dy > 0.6 && dy < 2.6) A = { type: 'tap', v: 'down' };                // Hammer Drop: spike
      else if (adx < 2.6 && Math.abs(dy) < 1.1) A = { type: 'tap', v: 'side' };                 // Corkscrew
      else if (adx < K.airThrow && Math.abs(dy) < 1.5) A = { type: 'tap', v: '' };               // glove jabs at range
    }
    else if (air && K.airThrow) {                                                              // in the air: throw (straight, or down at you)
      if (adx < K.airThrow && dy > -1.2 && (Math.abs(dy) < 1.5 || dy > 1)) A = { type: 'tap', v: dy > 1.2 ? 'down' : '' };
    }
    else if (air && K.groundOnly) A = null;
    else if (adx < 1.6 && dy < -1.4 && dy > -4.5) A = { type: 'charge', v: 'up', hold: killy ? 0.75 : rnd(0.25, 0.5) };            // you're above: Rising Dragon
    else if (adx < 2.4 && Math.abs(dy) < 1.8) {
      if (!air && (killy || r < 0.12 + 0.1 * L.kill)) A = { type: 'charge', v: Math.random() < 0.5 ? 'down' : 'side', hold: killy ? rnd(0.6, 0.8) : rnd(0.3, 0.55) };
      else A = { type: 'tap', v: dy < -1.1 ? 'up' : (dy > 1.1 && air ? 'down' : '') };                                      // the combo
    }
    else if (!air && adx < 5 && Math.abs(dy) < 1.2) {
      if (r < 0.35) A = { type: 'charge', v: 'side', hold: killy ? 0.7 : rnd(0.25, 0.45) };                                   // Meteor Fist covers the gap
      else if (r < 0.65 && K.dash && f.F.st.dashCharges > 0) A = { type: 'dash' };                                                      // dash in, punch out of it
    }
    if (!A) return false;
    A.dir = A.flip ? -dir : dir; A.t = 0; f.act = A;
    f.cd = A.type === 'tap' ? rnd(L.cd * 0.35, L.cd * 0.8) : rnd(L.cd * 1.2, L.cd * 2.2);
    return true;
  }
  function realMove(g, P, dt, inp) {
    var f = foe, F = f.F, st = F.st, L = LV[f.lvl] || LV[2], cm = ch(f.char);
    // knockback / ledge / respawn moved our body outside the game's code: tell its strike engine that was on
    // purpose, or its "teleported?" check cancels the next thing pressed (usually the recovery special)
    if (Math.abs(st.x - f.x) > 0.5 || Math.abs(st.y - f.y) > 0.5) { if (F.strike) F.strike.teleported = true; }
    st.x = f.x; st.y = f.y; st.vx = f.vx; st.vy = f.vy; st.onGround = f.onGround;
    // the action in progress decides which buttons are down this frame
    var A = f.act, press = false, release = false, dash = false, d = inp.dir;
    F.keys.clear();
    var heldMs = 0;
    if (A && A.beat && A.t === 0) {
      var bi = plugInfo('prodigy'); A.wait = (A.wait || 0) + dt;
      if (bi && !bi.onBeat && A.wait < 0.5) { A = null; }              // not this frame: wait for the beat
    }
    A = A || null;
    if (A) {
      A.t += dt; d = 0; heldMs = A.t * 1000;
      if (A.t <= dt + 1e-6) { st.lastMoveDir = A.dir; st.dashDir = A.dir; }
      if (A.type === 'key') { f.act = null; }
      else if (A.type === 'tap') { if (A.t <= dt + 1e-6) press = true; else { release = true; f.act = null; } }
      else if (A.type === 'charge') {
        if (A.t <= dt + 1e-6) press = true;
        if (A.t >= A.hold) { release = true; f.act = null; }
      } else if (A.type === 'crouch') { if (A.t >= A.hold) f.act = null;   // hold a direction without S (Boiler builds Pressure)
      } else if (A.type === 'dash') {
        if (A.t <= dt + 1e-6) dash = true; else if (A.t > 0.12) { f.act = A.noFollow ? null : { type: 'tap', v: '', dir: A.dir, t: 0 }; }
      }
      // direction held while S is down picks the variant / which special
      if (A.v === 'up') F.keys.add('arrowup'); else if (A.v === 'down') F.keys.add('arrowdown'); else if (A.v === 'side' && (A.type !== 'charge' || release)) d = A.dir;   // read at the moment S is let go
    }
    if (d > 0) F.keys.add('d'); else if (d < 0) F.keys.add('a');
    realHarvest(f, P);                                                     // hits from the post-draw tick (thrown gloves)
    var t = f.tgt;
    if (f._tgtX != null && (Math.abs(t.x - f._tgtX) > 0.01 || Math.abs(t.y - f._tgtY) > 0.01)) realGrab(P, t);   // moved after the last frame was drawn
    t._held = true; t._thrown = false;
    t.x = P.x; t.y = P.y; f._tgtX = t.x; f._tgtY = t.y; t.w = P.w; t.h = P.h; t.hp = BIG; t.vx = 0; t.vy = 0; t.hitFlash = 0; t.dead = false; t.stunTimer = 0;
    var jump = (inp.jump || f.recJump) && !(A && A.type === 'charge'); f.recJump = false;   // the game counts its own jumps
    g.fighterRun(F, function () {
      if (jump) g.fighterJump();
      if (dash) g.fighterDash();
      if (press) g.fighterPressS();
      if (release) g.fighterReleaseS(A && A.type === 'tap' ? 30 : heldMs);
      if (A && A.key && A.t <= dt + 1e-6) g.fighterKey(A.key);
      g.fighterUpdate(dt);
    });
    F.jp = false;
    st = F.st;
    f.x = st.x; f.y = st.y; f.vx = st.vx; f.vy = st.vy; f.onGround = !!st.onGround; f.w = st.w || f.w; f.h = st.h || f.h;
    if (st.lastMoveDir) f.face = st.lastMoveDir;
    if (f.onGround) f.jumps = 2; else if (jump) f.jumps = Math.max(0, f.jumps - 1);
    f.tgtLock = Math.max(0, f.tgtLock - dt);
    if (Math.abs(t.x - f._tgtX) > 0.01 || Math.abs(t.y - f._tgtY) > 0.01) { realGrab(P, t); f._tgtX = t.x; f._tgtY = t.y; }
    realHarvest(f, P);
  }
  // one of its moves moved you (a tongue pull, a lift, a yank or a hold): you go where it put you and can't act meanwhile
  function realGrab(P, t) {
    if (SM.phase !== 'fight' || me.respawnHold > 0 || me.invuln > 0) return;
    releaseLedge(me); P.x = t.x; P.y = t.y; P.vx = 0; P.vy = 0; P.onGround = false; me.heldT = 0.12; me.guarding = false;
  }
  // what its attack did to the stand-in is what it does to you
  function realHarvest(f, P) {
    var t = f.tgt, L = LV[f.lvl] || LV[2], cm = ch(f.char), dmg = BIG - t.hp;
    if (dmg > 0 && t.hitFlash < 0.2 && !t.vx && !t.vy) { chip(me, dmg * cm.d * L.dmg); t.hp = BIG; return; }   // its poison / beam ticks on you
    if ((dmg > 0 || t.hitFlash >= 0.2) && f.tgtLock <= 0 && SM.phase === 'fight') {
      var fx0 = f.x + f.w / 2, pct = Math.min(BAL.maxPctHit, Math.max(BAL.flinch, dmg * BAL.pctPerDmg) * cm.d * L.dmg);
      var ix = t.vx, iy = t.vy; if (!ix && !iy) { ix = sgn(P.x + P.w / 2 - fx0) * 3; iy = -2; }
      f.tgtLock = BAL.rehit;
      hitMe({ pct: pct, ix: ix, iy: iy, fromX: fx0, k: cm.k });
    }
    t.hp = BIG; t.vx = 0; t.vy = 0; t.hitFlash = 0; t.dead = false;
  }
  var TAUNTS = ['Too easy!', 'Come on!', '😤', 'Is that all?', '💪', 'Nice try!', '😎', 'Catch me!', '🥱', 'Ha!'];
  function startTaunt() {
    var f = foe; f.tauntQ = false; f.mem.taunted = true; f.vx = 0;
    f.taunt = rnd(0.9, 1.3); f.tauntLen = f.taunt; f.tauntTxt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
    // Most taunts are a real emote of its own choosing (the same ones you have), sometimes with the speech bubble too.
    f.em = null;
    var list = window.PPEmote && window.PPEmote.list;
    if (list && list.length && Math.random() < 0.8) {
      var e = list[Math.floor(Math.random() * list.length)];
      f.em = { id: e.id, t: 0 };
      f.taunt = e.len > 0 ? Math.min(e.len, rnd(1.6, 2.4)) : rnd(1.8, 2.8); f.tauntLen = f.taunt;   // dances have no end of their own
      if (Math.random() < 0.6) f.tauntTxt = '';
    }
  }
  function startAtk(name, dir) {
    var f = foe, d = MOVES[name]; f.atk = { name: name, d: d, t: 0, hit: false, dir: d.back ? -dir : dir }; f.face = dir; f.think = 0.05;
  }
  function cpuAttack(g, P, dt) {
    var f = foe, a = f.atk, d = a.d, L = LV[f.lvl] || LV[2];
    a.t += dt;
    var inAct = a.t >= d.wind && a.t < d.wind + d.act;
    if (d.lunge && inAct) f.vx = a.dir * d.lunge; else f.vx = approach(f.vx, 0, 60 * dt);
    if (d.lunge && a.t < d.wind) f.vx = 0;
    f.vy = Math.min(BAL.fall, f.vy + BAL.grav * dt * (d.air ? 0.85 : 1));
    if (d.hop && inAct && !a.hopped) { a.hopped = true; f.vy = d.hop; }
    if (d.dive) { if (inAct) f.vy = Math.max(f.vy, d.dive); else if (a.t < d.wind) f.vy *= 0.2; }
    moveBody(f, dt);
    if (inAct && !a.hit) {
      var c = { x: f.x + f.w / 2, y: f.y + f.h / 2 }, bx = d.box;
      var x0 = a.dir > 0 ? c.x + bx.dx : c.x - bx.dx - bx.w;
      var r = { x: x0, y: c.y + bx.dy, w: bx.w, h: bx.h };
      a.box = r;
      if (r.x < P.x + P.w && r.x + r.w > P.x && r.y < P.y + P.h && r.y + r.h > P.y) {
        a.hit = true;
        a.blocked = !!(me.guarding && P.onGround);
        a.landed = hitMe({ pct: Math.min(BAL.maxPctHit, d.d * BAL.pctPerDmg * L.dmg), ix: d.ix * (Math.abs(d.ix) > 3 ? a.dir : a.dir * 0.4), iy: d.iy, fromX: c.x, k: 1 }) && !a.blocked;
      }
    }
    if (a.t >= d.wind + d.act + d.rec) {
      f.atk = null;
      // a confirmed hit: stay on them. otherwise a normal breather
      f.cd = (a.landed && me.hitstun > 0) ? 0.03 : rnd(L.cd, L.cd * 1.8);
      f.backOff = (!a.landed && f.lvl >= 2 && Math.random() < 0.45) ? rnd(0.2, 0.45) : 0;   // whiffed: sometimes step back out
    }
  }

  // ---------------------------------------------------------------- camera
  var camS = null;
  function camera(g, P, dt) {
    var cam = g.cam, vw = g.viewW, vh = g.viewH, tw = vw / T, th = vh / T;
    var mx = P.x + P.w / 2, my = P.y + P.h / 2, fx2 = foe.x + foe.w / 2, fy2 = foe.y + foe.h / 2;
    // Frame both fighters while they fit, and fade smoothly toward just you as they drift apart
    // (a hard on/off switch here made the view lurch).
    var wx = clampv((tw - 7 - Math.abs(mx - fx2)) / 4 + 1, 0, 1), wy = clampv((th - 5 - Math.abs(my - fy2)) / 3 + 1, 0, 1), wN = wx * wy;
    var tx = mx + (fx2 - mx) * 0.5 * wN, ty = my + (fy2 - my) * 0.5 * wN;
    var wantX = tx * T - vw / 2, wantY = ty * T - vh * 0.5;
    var WW = window._WORLD_W * T, WH = window._WORLD_H * T;
    wantX = clampv(wantX, 0, Math.max(0, WW - vw)); wantY = clampv(wantY, 0, Math.max(0, WH - vh));
    // Smash keeps its own camera state. The game's follow-cam also moves cam every frame, and the two
    // pulling against each other was the jitter, so we smooth from our own value and overwrite cam.
    if (!camS) camS = { x: wantX, y: wantY };
    var kx = 1 - Math.exp(-dt * 5.5), ky = 1 - Math.exp(-dt * 3.8);   // vertical is calmer, so jumps don't bob the view
    camS.x += (wantX - camS.x) * kx; camS.y += (wantY - camS.y) * ky;
    cam.x = camS.x; cam.y = camS.y;
  }

  // ---------------------------------------------------------------- effects + drawing
  function addFx(kind, x, y, color, a) { fx.push({ k: kind, x: x, y: y, c: color, a: a || 0, t: 0, life: kind === 'ko' ? 0.9 : kind === 'ring' ? 0.3 : 0.35 }); }
  function updateFx(dt) { for (var i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); } }

  SM.draw = function () {
    if (!SM.active) return;
    var g = G(), ctx = g.ctx, cam = g.cam, P = g.player; if (!ctx) return;
    ctx.save();
    drawRefl(ctx, cam);
    // respawn platform
    [[me, P], [foe, foe]].forEach(function (pr) {
      var s = pr[0]; if (s.respawnHold > 0) {
        var x = (stage.respawn.x - 1.3) * T - cam.x, y = (stage.respawn.y + 0.92) * T - cam.y;
        ctx.fillStyle = 'rgba(160,200,255,.85)'; ctx.fillRect(x, y, 2.6 * T, 7); ctx.fillStyle = 'rgba(160,200,255,.25)'; ctx.fillRect(x, y + 7, 2.6 * T, 3);
      }
    });
    // the opponent
    if (foe.kind === 'cpu' && SM.phase !== 'off') {
      var f = foe;
      if (!(f.respawnHold > 0 && Math.floor(clock * 14) % 2)) {
        var cx = (f.x + f.w / 2) * T - cam.x, cy = (f.y + f.h / 2) * T - cam.y;
        ctx.save();
        var spin = f.hitstun > 0 ? clock * 14 * sgn(f.kvx || 1) : 0;
        if (spin && !f.F) { ctx.translate(cx, cy); ctx.rotate(spin); ctx.translate(-cx, -cy); }   // (a real-moves fighter spins only its body: see fighterDraw)
        if (f.invuln > 0 && Math.floor(clock * 20) % 2) ctx.globalAlpha = 0.5;
        var fem = f.kind === 'remote' ? (f.remEm || null) : (f.taunt > 0 ? (f.em || null) : null);   // the emote this fighter itself is doing
        var hop = f.taunt > 0 && !fem ? Math.abs(Math.sin((f.tauntLen - f.taunt) * 11)) * 0.22 : 0;
        if (f.F) {
          f.F.em = fem;
          var dst = f.F.st; dst.x = f.x; dst.y = f.y - hop; dst.vx = f.vx; dst.vy = f.vy; dst.onGround = f.onGround;
          g.fighterDraw(f.F, spin);
          ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
          ctx.strokeText(foeLabel(), cx, f.y * T - cam.y - 8); ctx.fillText(foeLabel(), cx, f.y * T - cam.y - 8);
        } else g.drawAs({ x: f.x, y: f.y - hop, w: f.w, h: f.h, vx: f.vx, vy: f.vy, onGround: f.onGround, dashDir: f.face, isDashing: !!(f.atk && f.atk.d.lunge && f.atk.t > f.atk.d.wind),
          char: f.char, em: fem, slashTimer: f.atk ? 0.15 : 0, swordMode: 'blue', gravityFlipped: false, isWallSliding: false, onWall: false, wallSide: 0,
          fk: f.kind === 'remote' ? f.remFk || undefined : undefined }, foeLabel());   // (online: their fighter's pose)
        // online: their fighter's projectiles, kites, items and hit sparks, from the copy their phone sends
        if (f.kind === 'remote' && f.remFk && f.remFk.w && window.FKit && FKit.drawRemote) FKit.drawRemote(f.char, f.remFk.w, { x: f.x, y: f.y, w: f.w, h: f.h, dashDir: f.face, onGround: f.onGround }, ctx, cam);
        ctx.restore();
        if (f.taunt > 0 && f.tauntTxt) {
          var a0 = Math.min(1, f.taunt / 0.2, (f.tauntLen - f.taunt) / 0.1);
          ctx.save(); ctx.globalAlpha = a0; ctx.font = '800 15px system-ui'; ctx.textAlign = 'center';
          var tw2 = ctx.measureText(f.tauntTxt).width + 16, bx2 = cx - tw2 / 2, by2 = f.y * T - cam.y - 46;
          ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bx2, by2, tw2, 24, 10); else ctx.rect(bx2, by2, tw2, 24);
          ctx.moveTo(cx - 5, by2 + 24); ctx.lineTo(cx, by2 + 31); ctx.lineTo(cx + 5, by2 + 24); ctx.fill();
          ctx.fillStyle = '#16192b'; ctx.fillText(f.tauntTxt, cx, by2 + 17); ctx.restore();
        }
        if (f.flash > 0) { ctx.save(); ctx.globalAlpha = f.flash * 5; ctx.fillStyle = '#fff'; ctx.fillRect(f.x * T - cam.x, f.y * T - cam.y, f.w * T, f.h * T); ctx.restore(); }
        if (f.atk) {
          var a = f.atk, d = a.d;
          if (a.t < d.wind) { ctx.strokeStyle = 'rgba(255,200,80,' + (0.3 + a.t / d.wind * 0.5) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 20 + a.t / d.wind * 14, 0, 6.3); ctx.stroke(); }
          else if (a.box && a.t < d.wind + d.act) { ctx.fillStyle = 'rgba(255,120,80,.45)'; ctx.fillRect(a.box.x * T - cam.x, a.box.y * T - cam.y, a.box.w * T, a.box.h * T); }
        }
      }
    }
    // shields
    [[me, P], [foe, foe]].forEach(function (pr) {
      var s = pr[0], b = pr[1]; if (s.guarding || (s.guardBreak > 0)) {
        var r = (0.55 + 0.55 * Math.max(0.15, s.shield / BAL.shieldMax)) * T * 0.7;
        ctx.fillStyle = s.guardBreak > 0 ? 'rgba(255,120,120,.35)' : 'rgba(110,200,255,.30)'; ctx.strokeStyle = 'rgba(160,220,255,.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc((b.x + b.w / 2) * T - cam.x, (b.y + b.h / 2) * T - cam.y, r, 0, 6.3); ctx.fill(); ctx.stroke();
      }
      if (s.dodge > 0) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(b.x * T - cam.x, b.y * T - cam.y, b.w * T, b.h * T); }
      if (s.ledge) { ctx.strokeStyle = 'rgba(160,210,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); var L = s.ledge.L; ctx.moveTo(L.x * T - cam.x - 7 * L.side, L.top * T - cam.y); ctx.lineTo(L.x * T - cam.x + 7 * L.side, L.top * T - cam.y); ctx.stroke(); }
    });
    if (me.flash > 0) { ctx.save(); ctx.globalAlpha = me.flash * 5; ctx.fillStyle = '#fff'; ctx.fillRect(P.x * T - cam.x, P.y * T - cam.y, P.w * T, P.h * T); ctx.restore(); }
    // effects
    fx.forEach(function (e) {
      var u = e.t / e.life, x = e.x * T - cam.x, y = e.y * T - cam.y;
      if (e.k === 'ring') { ctx.strokeStyle = e.c; ctx.globalAlpha = 1 - u; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 10 + u * 34, 0, 6.3); ctx.stroke(); }
      else if (e.k === 'burst') { ctx.globalAlpha = 1 - u; ctx.fillStyle = e.c; var n = 8; for (var i = 0; i < n; i++) { var an = i / n * 6.283 + e.x, rr = 8 + u * (26 + e.a); ctx.fillRect(x + Math.cos(an) * rr - 3, y + Math.sin(an) * rr - 3, 6, 6); } }
      else if (e.k === 'ko') { ctx.globalAlpha = 1 - u; ctx.strokeStyle = e.c; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(clampv(x, 20, g.viewW - 20), clampv(y, 20, g.viewH - 20), 10 + u * 160, 0, 6.3); ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
    // pointer to an off-screen opponent
    var fxp = (foe.x + foe.w / 2) * T - cam.x, fyp = (foe.y + foe.h / 2) * T - cam.y;
    if (SM.phase === 'fight' && (fxp < 0 || fxp > g.viewW || fyp < 0 || fyp > g.viewH)) {
      var ex = clampv(fxp, 22, g.viewW - 22), ey = clampv(fyp, 22, g.viewH - 22);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(ex, ey, 17, 0, 6.3); ctx.fill();
      ctx.fillStyle = pctColor(foe.pct); ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(Math.round(foe.pct) + '%', ex, ey + 4);
    }
    ctx.restore();
  };
  function foeLabel() { return foe.kind === 'cpu' ? (foe.lvl ? 'CPU ' + foe.lvl : 'Dummy') : 'Friend'; }

  // ---------------------------------------------------------------- HUD + menu
  var hudEl = null;
  function css() {
    if (document.getElementById('smCss')) return;
    var s = document.createElement('style'); s.id = 'smCss';
    s.textContent =
      '#smHud{position:fixed;left:0;right:0;top:0;z-index:8500;pointer-events:none;display:none;font-family:system-ui,sans-serif;color:#fff}' +
      '#smHud .row{display:flex;justify-content:space-between;align-items:flex-start;padding:6px 8px;gap:6px}' +
      '#smHud .card{min-width:92px;background:rgba(10,12,24,.78);border-radius:12px;padding:5px 10px 6px;box-shadow:0 3px 10px rgba(0,0,0,.4)}' +
      '#smHud .nm{font:700 11px system-ui;opacity:.8;letter-spacing:.03em}' +
      '#smHud .pc{font:900 30px/1 system-ui;text-shadow:0 2px 0 rgba(0,0,0,.5)}' +
      '#smHud .pc small{font-size:14px}' +
      '#smHud .st{font-size:13px;letter-spacing:2px;min-height:15px}' +
      '#smHud .sh{height:4px;border-radius:3px;background:rgba(255,255,255,.18);margin-top:3px;overflow:hidden}' +
      '#smHud .sh i{display:block;height:100%;background:#7cdbff;width:100%}' +
      '#smHud .tm{background:rgba(10,12,24,.78);border-radius:10px;padding:4px 10px;font:800 15px system-ui;margin-top:2px}' +
      '#smHud .quit{pointer-events:auto;position:absolute;left:50%;transform:translateX(-50%);top:46px;border:0;border-radius:999px;padding:5px 10px;background:rgba(255,255,255,.16);color:#fff;font:700 12px system-ui}' +
      '#smBanner{position:fixed;left:0;right:0;top:34%;text-align:center;z-index:8600;pointer-events:none;font:900 64px system-ui;color:#fff;text-shadow:0 4px 0 #000,0 0 18px rgba(255,160,40,.9);opacity:0;transition:opacity .12s}' +
      '#smGuard{position:fixed;right:14px;bottom:170px;z-index:8600;width:62px;height:62px;border-radius:50%;border:2px solid rgba(160,220,255,.9);background:rgba(60,120,200,.55);color:#fff;font-size:26px;display:none;touch-action:none}' +
      '#smMenu,#smResult{position:fixed;inset:0;z-index:9500;background:rgba(6,8,18,.86);display:none;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#fff}' +
      '#smMenu .box,#smResult .box{width:min(94vw,440px);max-height:92vh;overflow:auto;background:#161a2e;border-radius:18px;padding:16px 16px 14px;box-shadow:0 10px 40px rgba(0,0,0,.6)}' +
      '#smMenu h2,#smResult h2{margin:0 0 10px;font:900 24px system-ui}' +
      '#smMenu .lb{font:700 12px system-ui;opacity:.7;margin:10px 0 5px;text-transform:uppercase;letter-spacing:.05em}' +
      '#smMenu .ch{display:flex;flex-wrap:wrap;gap:6px}' +
      '#smMenu .chip{border:2px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:11px;padding:7px 10px;font:700 13px system-ui}' +
      '#smMenu .chip.on{border-color:#ffb347;background:rgba(255,179,71,.2)}' +
      '#smMenu .chip small{display:block;font:500 10px system-ui;opacity:.7;margin-top:2px}' +
      '#smMenu .go,#smResult .go{width:100%;margin-top:14px;border:0;border-radius:12px;padding:12px;background:linear-gradient(#ff9d3d,#ff6a2a);color:#fff;font:900 16px system-ui}' +
      '#smMenu .x,#smResult .x{width:100%;margin-top:8px;border:0;border-radius:12px;padding:9px;background:rgba(255,255,255,.1);color:#fff;font:700 13px system-ui}' +
      // landscape phone: bigger shield button, in the bottom row just left of the action buttons
      '@media (orientation: landscape) and (max-height: 500px) and (pointer: coarse){#smGuard{bottom:max(14px,calc(env(safe-area-inset-bottom) + 8px));right:calc(env(safe-area-inset-right) + 348px);width:68px;height:68px;font-size:30px}}';
    document.head.appendChild(s);
  }
  function buildHud() {
    css();
    if (!hudEl) {
      hudEl = document.createElement('div'); hudEl.id = 'smHud';
      hudEl.innerHTML = '<div class="row"><div class="card" id="smMe"><div class="nm"></div><div class="pc"></div><div class="st"></div><div class="sh"><i></i></div></div>' +
        '<div class="tm" id="smTm"></div><div class="card" id="smFoe"><div class="nm"></div><div class="pc"></div><div class="st"></div><div class="sh"><i></i></div></div></div>' +
        '<button class="quit" id="smQuit" type="button">✕ Quit</button>';
      document.body.appendChild(hudEl);
      var bn = document.createElement('div'); bn.id = 'smBanner'; document.body.appendChild(bn);
      var gb = document.createElement('button'); gb.id = 'smGuard'; gb.type = 'button'; gb.textContent = '🛡️'; document.body.appendChild(gb);
      var on = function (e) {
        e.preventDefault(); guardBtn = true;
        var t = e.changedTouches && e.changedTouches[0];
        if (t) { gStick.id = t.identifier; gStick.x0 = t.clientX; gStick.y0 = t.clientY; gStick.x = gStick.y = 0; }
      };
      var off = function (e) {
        e.preventDefault();
        var ts = e.touches || [], still = false;
        for (var i = 0; i < ts.length; i++) if (ts[i].target === gb) still = true;
        if (!still) { guardBtn = false; gStick.id = null; gStick.x = gStick.y = 0; }
      };
      // drag from the shield button like a little stick: ~20px picks a direction
      var mv = function (e) {
        e.preventDefault();
        var ts = e.changedTouches || [];
        for (var i = 0; i < ts.length; i++) if (ts[i].identifier === gStick.id) {
          var dx = ts[i].clientX - gStick.x0, dy = ts[i].clientY - gStick.y0, l = Math.hypot(dx, dy);
          if (l < 20) { gStick.x = gStick.y = 0; } else { gStick.x = dx / l; gStick.y = dy / l; }
        }
      };
      gb.addEventListener('touchstart', on, { passive: false }); gb.addEventListener('touchmove', mv, { passive: false });
      gb.addEventListener('touchend', off); gb.addEventListener('touchcancel', off);
      gb.addEventListener('mousedown', on); window.addEventListener('mouseup', off);
      document.getElementById('smQuit').addEventListener('click', function () { if (SM.net && SM.net.quit) SM.net.quit(); else SM.stop(); });
    }
  }
  function showHud(on) {
    if (!hudEl) return; hudEl.style.display = on ? 'block' : 'none';
    var gb = document.getElementById('smGuard'); if (gb) gb.style.display = on ? 'block' : 'none';
    var rs = document.getElementById('smResult'); if (rs && !on) rs.style.display = 'none';
  }
  function stocksStr(n, max) { if (max === 0) return '∞'; var s = ''; for (var i = 0; i < Math.max(n, 0); i++) s += '●'; return s; }
  function hud() {
    if (!hudEl) return;
    var cfg = SM.cfg, a = document.getElementById('smMe'), b = document.getElementById('smFoe');
    fillCard(a, 'YOU · ' + fInfo(me.char).n, me, cfg.stocks);
    fillCard(b, (foe.kind === 'cpu' ? (foe.lvl ? 'CPU Lv' + foe.lvl : 'DUMMY') : 'FRIEND') + ' · ' + fInfo(foe.char).n, foe, cfg.stocks);
    var tm = document.getElementById('smTm');
    setTxt(tm, cfg.time > 0 ? Math.floor(matchT / 60) + ':' + ('0' + Math.floor(matchT % 60)).slice(-2) : '');
    setSty(tm, 'display', cfg.time > 0 ? 'block' : 'none');
  }
  // The HUD is redrawn every frame, so only touch the DOM when a value actually changed.
  // Rewriting it every frame made the browser redo style + layout each frame (a real cost at 120 Hz).
  function setTxt(el, v) { if (el._v !== v) { el._v = v; el.textContent = v; } }
  function setHtml(el, v) { if (el._v !== v) { el._v = v; el.innerHTML = v; } }
  function setSty(el, k, v) { var c = '_s' + k; if (el[c] !== v) { el[c] = v; el.style[k] = v; } }
  function fillCard(el, name, s, max) {
    if (!el._q) el._q = { nm: el.querySelector('.nm'), pc: el.querySelector('.pc'), st: el.querySelector('.st'), sh: el.querySelector('.sh i') };
    var q = el._q;
    setTxt(q.nm, name);
    setHtml(q.pc, Math.floor(s.pct) + '<small>%</small>'); setSty(q.pc, 'color', pctColor(s.pct));
    setTxt(q.st, stocksStr(s.stocks, max));
    setSty(q.sh, 'width', Math.round(Math.max(0, s.shield / BAL.shieldMax * 100)) + '%');
  }
  var bannerTO = 0;
  function showBanner(t, sec) {
    var el = document.getElementById('smBanner'); if (!el) return; el.textContent = t; el.style.opacity = 1;
    clearTimeout(bannerTO); bannerTO = setTimeout(function () { el.style.opacity = 0; }, (sec || 0.8) * 1000);
  }
  function showResult(w) {
    css();
    var el = document.getElementById('smResult');
    if (!el) { el = document.createElement('div'); el.id = 'smResult'; document.body.appendChild(el); }
    var guest = SM.net && SM.net.role === 'guest';
    el.innerHTML = '<div class="box"><h2>' + (w === 'me' ? '🏆 You win!' : w === 'foe' ? '💥 You lost' : '🤝 Draw') + '</h2>' +
      '<div style="opacity:.8;font:600 14px system-ui">You: ' + Math.max(me.stocks, 0) + ' stock' + (me.stocks === 1 ? '' : 's') + ' · ' + Math.floor(me.pct) + '%<br>' +
      (foe.kind === 'cpu' ? 'CPU' : 'Friend') + ': ' + Math.max(foe.stocks, 0) + ' stock' + (foe.stocks === 1 ? '' : 's') + ' · ' + Math.floor(foe.pct) + '%</div>' +
      (guest && !(SM.net && SM.net.rematch) ? '' : '<button class="go" id="smAgain" type="button">Rematch</button>') + '<button class="x" id="smExit" type="button">Exit to build</button></div>';
    el.style.display = 'flex';
    var again = document.getElementById('smAgain');
    if (again) again.onclick = function () { el.style.display = 'none'; if (SM.net && SM.net.rematch) SM.net.rematch(); else SM.rematch(); };   // online: both phones pick fighters again
    document.getElementById('smExit').onclick = function () { el.style.display = 'none'; if (SM.net && SM.net.quit) SM.net.quit(); else SM.stop(); };
  }
  SM.rematch = function () {
    var cfg = SM.cfg, keep = backup; backup = null;
    // start() re-reads the backup; keep the original one so Exit still restores the right course
    var saveB = keep; SM.start(Object.assign({}, cfg)); if (saveB) backup = saveB;
    if (SM.net && SM.net.sendStart) SM.net.sendStart(SM.cfg);
  };

  // ---- setup menu
  var sel = { stage: 'battlefield', stocks: 3, time: 180, cpu: 2, cpuChar: 'random', char: 'brawler' };
  function chips(id, items, key, cur) {
    return '<div class="ch" data-k="' + key + '">' + items.map(function (it) {
      return '<button type="button" class="chip' + (String(it.v) === String(cur) ? ' on' : '') + '" data-v="' + it.v + '">' + it.l + (it.s ? '<small>' + it.s + '</small>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function showMenu(opts) {
    css(); opts = opts || {};
    var g = G(); if (isFighter(g.char)) sel.char = g.char; else if (!isFighter(sel.char)) sel.char = 'brawler';
    var el = document.getElementById('smMenu');
    if (!el) { el = document.createElement('div'); el.id = 'smMenu'; document.body.appendChild(el); }
    var ros = roster().map(function (f) { return { v: f.id, l: f.e + ' ' + f.n }; });
    var online = !!opts.online, guestMenu = !!opts.guest;
    var html = guestMenu ? '<div class="box"><h2>🥊 Pick your fighter</h2>' +
      '<div style="font:500 12px system-ui;opacity:.7">The host picks the stage and starts the match when you are both ready.</div>' +
      '<div class="lb">Your fighter</div>' + chips('ch', ros, 'char', sel.char) +
      '<div id="smNote" style="font:600 13px system-ui;margin:12px 0 2px;opacity:.85"></div>' +
      '<button class="go" id="smGo" type="button">Ready</button>' +
      '<button class="x" id="smNo" type="button">Leave</button></div>'
    : '<div class="box"><h2>🥊 Smash Mode</h2>' +
      '<div style="font:500 12px system-ui;opacity:.7">Damage is a percent. The higher it gets, the farther you fly. Get launched off the stage and you lose a stock.</div>' +
      '<div class="lb">Your fighter</div>' + chips('ch', ros, 'char', sel.char) +
      '<div class="lb">Stage</div>' + chips('st', STAGE_ORDER.map(function (k) { return { v: k, l: STAGES[k].e + ' ' + STAGES[k].n, s: STAGES[k].d }; }), 'stage', sel.stage) +
      '<div class="lb">Stocks</div>' + chips('sk', [{ v: 1, l: '1' }, { v: 3, l: '3' }, { v: 5, l: '5' }].concat(online ? [] : [{ v: 0, l: '∞ training' }]), 'stocks', sel.stocks) +
      '<div class="lb">Time limit</div>' + chips('tm', [{ v: 0, l: 'None' }, { v: 180, l: '3:00' }, { v: 300, l: '5:00' }], 'time', sel.time) +
      (online ? '' : '<div class="lb">Opponent</div>' + chips('cp', [{ v: 0, l: '🎯 Dummy' }, { v: 1, l: 'CPU 1', s: 'easy' }, { v: 2, l: 'CPU 2', s: 'normal' }, { v: 3, l: 'CPU 3', s: 'hard' }], 'cpu', sel.cpu) +
        '<div class="lb">Opponent fighter</div>' + chips('cc', [{ v: 'random', l: '🎲 Random' }].concat(ros), 'cpuChar', sel.cpuChar)) +
      (online ? '<div id="smNote" style="font:600 13px system-ui;margin:12px 0 2px;opacity:.85"></div>' : '') +
      '<button class="go" id="smGo" type="button">' + (online ? 'Start match' : 'Fight!') + '</button>' +
      (online || !(window.__obbyNet && window.__obbyNet.smash) ? '' : '<button class="go" id="smNet" type="button" style="background:#3b5bdb">🌐 Play a friend (2 phones)</button>') +
      '<button class="x" id="smNo" type="button">Cancel</button></div>';
    el.innerHTML = html; el.style.display = 'flex';
    el.querySelectorAll('.ch').forEach(function (row) {
      row.addEventListener('click', function (e) {
        var b = e.target.closest('.chip'); if (!b) return; var k = row.getAttribute('data-k'), v = b.getAttribute('data-v');
        sel[k] = (k === 'stage' || k === 'char' || k === 'cpuChar') ? v : +v;
        row.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c === b); });
        if (k === 'char' && opts.onChar) { if (guestMenu) setReady(false); opts.onChar(v); }   // online: tell the other phone (a changed pick is not ready yet)
      });
    });
    document.getElementById('smNo').onclick = function () { hideMenu(); if (opts.onCancel) opts.onCancel(); };
    var nb = document.getElementById('smNet');
    if (nb) nb.onclick = function () { hideMenu(); if (isFighter(sel.char) && g.char !== sel.char) window._selectCharacter(sel.char); window.__obbyNet.smash(); };
    var goBtn = document.getElementById('smGo'), ready = false;
    function setReady(r) { ready = r; if (guestMenu) { goBtn.textContent = r ? '✓ Ready · waiting for the host' : 'Ready'; goBtn.style.opacity = r ? 0.75 : 1; } }
    if (guestMenu) goBtn.onclick = function () { if (ready) return; SM.pickChar(sel.char); setReady(true); if (opts.onReady) opts.onReady(sel.char); };
    else goBtn.onclick = function () {
      if (opts.needReady && !menuFriendReady) { SM.menuNote('⏳ Wait for your friend to tap Ready.'); return; }
      var cfg = Object.assign({}, sel); if (cfg.cpu === 0) { cfg.stocks = cfg.stocks; }
      if (opts.onGo) opts.onGo(cfg); else SM.start(cfg);
    };
    menuFriendReady = false;
    if (opts.needReady) { goBtn.style.opacity = 0.5; }
    if (opts.note) SM.menuNote(opts.note);
  }
  // online: what the other phone has picked, and whether they are ready (the host's Start match waits for it)
  var menuFriendReady = false;
  SM.menuNote = function (t) { var n = document.getElementById('smNote'); if (n) n.textContent = t || ''; };
  SM.menuFriend = function (charId, ready) {
    menuFriendReady = !!ready;
    var f = charId ? fInfo(charId) : null, b = document.getElementById('smGo');
    if (document.getElementById('smMenu') && document.getElementById('smMenu').style.display !== 'none' && b && b.textContent.indexOf('Start') === 0) b.style.opacity = ready ? 1 : 0.5;
    SM.menuNote(f ? 'Friend: ' + f.e + ' ' + f.n + (ready ? '  ✓ ready' : '  · picking…') : 'Friend: picking a fighter…');
  };
  SM.menuHost = function (charId) { var f = charId ? fInfo(charId) : null; SM.menuNote(f ? 'Host: ' + f.e + ' ' + f.n : ''); };
  function hideMenu() { var el = document.getElementById('smMenu'); if (el) el.style.display = 'none'; }
  SM.openMenu = showMenu; SM.hideMenu = hideMenu;

  // ---------------------------------------------------------------- build-panel button
  function addButton() {
    var reset = document.getElementById('clearBtn');
    if (!reset || document.getElementById('obSmashBtn')) return;
    var b = document.createElement('button'); b.id = 'obSmashBtn'; b.type = 'button'; b.textContent = '🥊 Smash mode'; b.style.marginTop = '6px';
    b.addEventListener('click', function () { showMenu(); });
    reset.insertAdjacentElement('afterend', b);
  }
  addButton();

  // ---------------------------------------------------------------- test / online hooks
  SM.__state = function () { return { me: me, foe: foe, stage: stage, phase: SM.phase, matchT: matchT }; };
  SM.__fx = function () { return fx.length; };
  SM.setNet = function (n) { SM.net = n; };
  Object.defineProperty(SM, 'me', { get: function () { return me; } });
  Object.defineProperty(SM, 'foe', { get: function () { return foe; } });
  SM.hitMe = hitMe;
  SM.koFromRemote = function (stocks) { foe.stocks = stocks; foe.pct = 0; if (stocks > 0) showBanner('KO!', 0.7); };
  // online: the other phone says the match is over (w is the result from this phone's side)
  SM.remoteOver = function (w) { if (!SM.active) return; SM.phase = 'over'; SM.over = w; showResult(w); };
  SM.onEnvDamage = function (text) {
    if (window._fighterPass) return;                                   // the CPU's own pass, not you
    if (SM.phase !== 'fight' || me.invuln > 0 || me.hitstun > 0 || me.respawnHold > 0) return;
    hitMe({ pct: 8, ix: 0, iy: -10, fromX: G().player.x, k: 1 });
  };
  SM.onDie = function (text) {
    if (!SM.active) return false;
    if (window._fighterPass) return true;
    if (/fell off|void/i.test(text || '')) return true;
    SM.onEnvDamage(text); return true;
  };
  window.__smash = SM;
})();
