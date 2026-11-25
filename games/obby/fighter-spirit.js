/* Obby Builder: the ELEMENTAL SPIRIT's moveset. Four elements, four ways to play (0 / the gem button switches).
 *
 * 🔥 FLAME, rushdown. Quick close combos that BURN. Every hit within a moment of the last adds HEAT (up to 5):
 *    each point is +10% damage. Ground: Ember Jabs (3-hit string), Blaze Dash, Flame Uppercut, Fire Sweep.
 *    Air: Flame Wheel, Rocket Kick, Fire Jump, Meteor Stomp.
 *    Charged: INFERNO RUSH, PHOENIX DASH, VOLCANO, SUPERNOVA; air SOLAR FLARE, COMET, PHOENIX RISE, HELLFIRE DROP.
 * ❄️ FROST, control. Ranged ice that CHILLS (slows); the third chill in a row FREEZES. Low knockback: they stay put.
 *    Ground: Ice Shard, Frost Lance (pierces), Icicle Spike (rises under a foe ahead), Ice Patch (a slowing floor).
 *    Air: Snowflake Burst, Glacier Glide (skate dash), Frost Updraft, Hail Drop.
 *    Charged: BLIZZARD, ICE WALL (a wall you can stand on that shatters into shards), FROZEN PRISON, PERMAFROST;
 *    air DIAMOND DUST, ICICLE BARRAGE, ICE STAIRS, GLACIER FALL.
 * ⚡ STORM, hit and run. The fastest element. Moves blink and dash; every hit gives back a dash and SHOCKS
 *    (a stun that stacks). Ground: Spark Jab, Lightning Blink, Thunderclap, Static Field.
 *    Air: Ball Zap, Bolt Dash, Sky Blink, Thunder Drop.
 *    Charged: CHAIN LIGHTNING, STORM RUNNER, TEMPEST, THUNDERSTRIKE; air THUNDERHEAD, ZIGZAG, RISING BOLT, LIGHTNING ROD.
 * 🪨 STONE, tank. SUPER ARMOR on every move and the hardest single hits, at a steadier pace.
 *    Ground: Rock Punch, Shoulder Slam, Rock Pillar, Quake Stomp.
 *    Air: Stone Spin, Boulder Toss, Rock Ride, Earthfall.
 *    Charged: TITAN FIST, LANDSLIDE, FORTRESS (a shell nothing gets through, then it bursts), TECTONIC;
 *    air METEOR SHELL, BOULDER BARRAGE, STONE STEPS, MOUNTAIN DROP.
 *
 * Knockback is kept moderate on purpose (he used to launch people across the stage). Charged = hold S to full.
 * Works for a second fighter (Smash CPU) through window._fighterPlugins.
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'formSwitcher';
  const { ex, ey, pcx, pcy } = FK;
  const COL = { flame: ['#ff6b35', '#ffd166'], frost: ['#7dd3fc', '#e0f7ff'], storm: ['#fbbf24', '#fff3a0'], stone: ['#a8a29e', '#e7e5e4'] };
  const EMO = { flame: '🔥', frost: '❄️', storm: '⚡', stone: '🪨' };
  const fresh = () => ({ active: false, seq: null, cd: 0, heat: 0, heatT: 0, airUp: false, airSide: false, shots: [], zones: [], walls: [], fx: [], lastPX: null, lastPY: null, selfMove: false });
  let S = fresh();
  const form = () => window._fsForm || 'flame';
  const P = () => window._gamePlayer;

  // ---- hits and the element on each one ----
  function hit(e, dmg, o) {
    o = o || {};
    const el = o.el || form();
    if (el === 'flame') { dmg *= 1 + 0.1 * S.heat; S.heat = Math.min(5, S.heat + 1); S.heatT = 1.6; }
    if (el === 'stone') dmg += 1;
    FK.hit(S, e, dmg, { kx: o.kx || 0, ky: o.ky == null ? -3 : o.ky, stun: o.stun || 0.3, c: COL[el][0], big: !!o.big, stop: o.stop, shake: o.shake });
    if (el === 'flame') e._ppBurn = Math.max(e._ppBurn || 0, o.burn || 2);
    else if (el === 'frost') {
      e.slowTimer = Math.max(e.slowTimer || 0, 2);
      const now = performance.now() / 1000; if (now - (e._spChillT || 0) > 2.5) e._spChill = 0;
      e._spChillT = now; e._spChill = (e._spChill || 0) + (o.chill || 1);
      if (e._spChill >= 3 && !(e._ppFrozen > 0)) { e._spChill = 0; e._ppFrozen = 1.4; e.stunTimer = Math.max(e.stunTimer || 0, 1.4); if (!e._noKnockback) { e.vx = 0; e.vy = Math.min(e.vy || 0, 0); } S.fx.push({ k: 'ring', x: ex(e), y: ey(e), R: 0.9, c: '#ffffff', t: 0, life: 0.3 }); FK.tone(1900, { dur: 0.2, vol: 0.1, type: 'sine' }); }
    } else if (el === 'storm') {
      e.stunTimer = Math.max(e.stunTimer || 0, (o.stun || 0.3) + 0.25);
      const p = P(); if (p && p.dashCharges != null && p.maxDashes != null) p.dashCharges = Math.min(p.maxDashes, p.dashCharges + 1);   // hit and run: a dash back
      S.airSide = false;
    }
  }
  const box = (p, f, x0, x1, hy, oy) => FK.foes().filter(e => { const a = (ex(e) - pcx(p)) * f, hw = (e.w || 0.9) / 2; return a > x0 - hw && a < x1 + hw && Math.abs(ey(e) - pcy(p) - (oy || 0)) < hy + (e.h || 0.9) / 2; });
  const circ = (x, y, r) => FK.foes().filter(e => Math.hypot(ex(e) - x, ey(e) - y) < r + (e.w || 0.9) / 2);
  const nearest = (x, y, R, not) => { let b = null, bd = R; for (const e of FK.foes()) { if (not && not.has(e)) continue; const d = Math.hypot(ex(e) - x, ey(e) - y); if (d < bd) { bd = d; b = e; } } return b; };
  const once = (q, e) => { if (q.hs.has(e)) return false; q.hs.add(e); return true; };
  const shot = o => S.shots.push(Object.assign({ t: 0, hs: new Set(), r: 0.25, grav: 0, life: 1, dmg: 1.5, kx: 4, ky: -3 }, o));
  const fxRing = (x, y, R, c) => S.fx.push({ k: 'ring', x, y, R, c, t: 0, life: 0.35 });
  const sfx = { flame: () => FK.noise({ dur: 0.18, cut: 1400, cutEnd: 500, q: 1, vol: 0.18 }), frost: () => FK.tone(1600, { dur: 0.1, vol: 0.08, type: 'sine', slide: 2400 }), storm: () => { FK.noise({ dur: 0.1, cut: 6000, q: 1, vol: 0.16 }); FK.tone(1800, { dur: 0.06, vol: 0.06, type: 'sawtooth', slide: 500 }); }, stone: () => FK.thud(false) };

  // ---- the moves: q = { t, f, air, hs, n } ----
  const M = {
    // ================= 🔥 FLAME: rushdown
    flame_ground_neutral(p, q) {   // EMBER JABS: jab, jab, hook (the third comes out if you keep pressing)
      if (q.t < 0.04) return; const i = Math.min(2, Math.floor((q.t - 0.04) / 0.1));
      if (i !== q.n) { q.n = i; q.hs.clear(); sfx.flame(); }
      for (const e of box(p, q.f, 0, 1.6, 0.6)) if (once(q, e)) hit(e, i === 2 ? 2 : 1, { kx: q.f * (i === 2 ? 7 : 2), ky: i === 2 ? -5 : -1.5, stun: 0.3, big: i === 2 });
      return q.t > 0.34;
    },
    flame_ground_side(p, q) {   // BLAZE DASH: a burst through them, a trail of fire behind
      S.selfMove = true; FK.moveX(p, q.f * 18 * (1 - q.t / 0.3) * (1 / 60)); p.vx = q.f * 6;
      if (Math.floor(q.t * 30) !== q.d) { q.d = Math.floor(q.t * 30); S.zones.push({ k: 'embers', x: pcx(p) - q.f * 0.4, y: p.y + p.h, w: 0.6, t: 0, life: 1.2, cool: new Map() }); }
      for (const e of box(p, q.f, -0.4, 1, 0.6)) if (once(q, e)) hit(e, 2, { kx: q.f * 5, ky: -4 });
      return q.t > 0.3;
    },
    flame_ground_up(p, q) {   // FLAME UPPERCUT: a rising fist with a small hop
      if (!q.go) { q.go = 1; p.vy = -9; p.onGround = false; sfx.flame(); }
      for (const e of box(p, q.f, -0.2, 1.4, 1.2, -0.6)) if (once(q, e)) hit(e, 2.5, { kx: q.f * 2, ky: -10, stun: 0.4, big: true });
      return q.t > 0.3;
    },
    flame_ground_down(p, q) {   // FIRE SWEEP: low, both sides, burns
      if (!q.go) { q.go = 1; sfx.flame(); fxRing(pcx(p), p.y + p.h - 0.2, 1.6, '#ff6b35'); }
      for (const e of box(p, 1, -1.8, 1.8, 0.5, 0.3)) if (once(q, e)) hit(e, 1.5, { kx: Math.sign(ex(e) - pcx(p)) * 3, ky: -6, burn: 3.5 });
      return q.t > 0.25;
    },
    flame_air_neutral(p, q) {   // FLAME WHEEL: a burning spin, many small hits
      p.vy = Math.min(p.vy, 2); if (Math.floor(q.t / 0.08) !== q.n) { q.n = Math.floor(q.t / 0.08); q.hs.clear(); }
      for (const e of circ(pcx(p), pcy(p), 1.3)) if (once(q, e)) hit(e, 0.8, { kx: Math.sign(ex(e) - pcx(p)) * 2, ky: -2, stun: 0.25 });
      S.spin = q.t * 20; return q.t > 0.4;
    },
    flame_air_side(p, q) {   // ROCKET KICK: a flaming kick straight across
      S.selfMove = true; FK.moveX(p, q.f * 16 / 60); p.vx = q.f * 5; p.vy = Math.min(p.vy, 0.5);
      for (const e of box(p, q.f, 0, 1.3, 0.6)) if (once(q, e)) { hit(e, 2.5, { kx: q.f * 7, ky: -4, big: true }); return true; }
      return q.t > 0.3;
    },
    flame_air_up(p, q) {   // FIRE JUMP: flames under his feet throw him up; burns whatever is above
      if (!q.go) { q.go = 1; p.vy = -14; S.airUp = true; sfx.flame(); }
      for (const e of circ(pcx(p), p.y, 1.1)) if (once(q, e)) hit(e, 1.5, { kx: 0, ky: -8 });
      return q.t > 0.25;
    },
    flame_air_down(p, q) {   // METEOR STOMP: plunge, spike, a ring of fire on landing
      p.vy = 22; p.vx = 0;
      for (const e of box(p, 1, -0.6, 0.6, 0.6, 0.6)) if (once(q, e)) hit(e, 2.5, { kx: 0, ky: 12, big: true });
      if (p.onGround) { fxRing(pcx(p), p.y + p.h, 1.8, '#ff6b35'); for (const e of circ(pcx(p), p.y + p.h - 0.4, 1.8)) if (once(q, e)) hit(e, 1.5, { kx: Math.sign(ex(e) - pcx(p)) * 4, ky: -6 }); FK.thud(false); return true; }
      return q.t > 1.2;
    },
    // charged
    flame_cg_neutral(p, q) {   // INFERNO RUSH: a flurry of seven blows walking forward, the last a blast of fire
      S.selfMove = true; FK.moveX(p, q.f * 4 / 60);
      const i = Math.floor(q.t / 0.07); if (i !== q.n && i < 7) { q.n = i; q.hs.clear(); sfx.flame(); }
      for (const e of box(p, q.f, 0, 1.7, 0.7)) if (once(q, e)) hit(e, q.n >= 6 ? 4 : 0.8, { kx: q.f * (q.n >= 6 ? 10 : 1), ky: q.n >= 6 ? -7 : -1, stun: 0.35, big: q.n >= 6 });
      return q.t > 0.55;
    },
    flame_cg_side(p, q) {   // PHOENIX DASH: wings of fire, a long dash, and it bursts where it ends
      S.selfMove = true; S.wings = 1; const stop = !FK.moveX(p, q.f * 22 / 60); p.vx = q.f * 6; p.vy = Math.min(p.vy, 0);
      for (const e of box(p, q.f, -0.5, 1.2, 0.8)) if (once(q, e)) hit(e, 2.5, { kx: q.f * 4, ky: -4 });
      if (q.t > 0.45 || stop) { S.wings = 0; fxRing(pcx(p), pcy(p), 2.2, '#ffd166'); for (const e of circ(pcx(p), pcy(p), 2.2)) hit(e, 3, { kx: Math.sign(ex(e) - pcx(p)) * 9, ky: -8, big: true, burn: 3 }); FK.shake(7); return true; }
    },
    flame_cg_up(p, q) {   // VOLCANO: three bursts of a fire column in front, each taller
      p.vx = 0; const i = Math.floor(q.t / 0.15);
      if (i !== q.n && i < 3) { q.n = i; sfx.flame(); const x = pcx(p) + q.f * 1.6, H = 2 + i; S.zones.push({ k: 'column', x, y: p.y + p.h, w: 1.2, H, t: 0, life: 0.3 }); for (const e of FK.foes()) if (Math.abs(ex(e) - x) < 0.9 && ey(e) > p.y + p.h - H && ey(e) < p.y + p.h + 0.3) hit(e, 1.8, { kx: 0, ky: -6 - i * 3, big: i === 2, burn: 3 }); }
      return q.t > 0.5;
    },
    flame_cg_down(p, q) {   // SUPERNOVA: he flares up and explodes, everything round him burns
      p.vx = 0; if (!p.onGround) p.vy = Math.min(p.vy, 0.5); S.nova = Math.min(1, q.t / 0.35);
      if (q.t > 0.35 && !q.go) { q.go = 1; S.nova = 0; for (const e of circ(pcx(p), pcy(p), 3.4)) hit(e, 4, { kx: Math.sign(ex(e) - pcx(p)) * 9, ky: -9, big: true, burn: 4 }); fxRing(pcx(p), pcy(p), 3.4, '#ffd166'); FK.shake(10); FK.thud(true); }
      return q.t > 0.5;
    },

    // ================= ❄️ FROST: control (ranged, chills, low knockback)
    frost_ground_neutral(p, q) { if (!q.go) { q.go = 1; shot({ k: 'shard', x: pcx(p) + q.f * 0.6, y: pcy(p) - 0.1, vx: q.f * 16, vy: 0, dmg: 1.2, kx: q.f * 1.5, ky: -1, life: 0.6 }); sfx.frost(); } return q.t > 0.18; },   // ICE SHARD
    frost_ground_side(p, q) { if (!q.go && q.t > 0.08) { q.go = 1; shot({ k: 'lance', x: pcx(p) + q.f * 0.8, y: pcy(p), vx: q.f * 22, vy: 0, dmg: 2, kx: q.f * 2.5, ky: -1.5, life: 0.5, pierce: true, chill: 2, r: 0.35 }); sfx.frost(); } return q.t > 0.3; },   // FROST LANCE
    frost_ground_up(p, q) {   // ICICLE SPIKE: an icicle bursts up under the nearest foe ahead
      if (!q.go && q.t > 0.1) { q.go = 1; const e = box(p, q.f, 0.5, 6, 2)[0]; const x = e ? ex(e) : pcx(p) + q.f * 3; S.zones.push({ k: 'icicle', x, y: p.y + p.h, w: 0.8, H: 2, t: 0, life: 0.5 }); for (const o of FK.foes()) if (Math.abs(ex(o) - x) < 0.6 && ey(o) > p.y + p.h - 2.2 && ey(o) < p.y + p.h + 0.3) hit(o, 2, { kx: 0, ky: -9, stun: 0.4, chill: 2 }); sfx.frost(); }
      return q.t > 0.32;
    },
    frost_ground_down(p, q) { if (!q.go) { q.go = 1; S.zones.push({ k: 'icepatch', x: pcx(p) + q.f * 1.5, y: p.y + p.h, w: 3, t: 0, life: 6, cool: new Map() }); while (S.zones.filter(z => z.k === 'icepatch').length > 2) S.zones.splice(S.zones.findIndex(z => z.k === 'icepatch'), 1); sfx.frost(); } return q.t > 0.25; },   // ICE PATCH
    frost_air_neutral(p, q) { p.vy = Math.min(p.vy, 1); if (!q.go) { q.go = 1; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; shot({ k: 'shard', x: pcx(p), y: pcy(p), vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, dmg: 1, kx: Math.cos(a) * 2, ky: -1, life: 0.35 }); } sfx.frost(); } return q.t > 0.25; },   // SNOWFLAKE BURST
    frost_air_side(p, q) {   // GLACIER GLIDE: skates across the air on a strip of ice
      S.selfMove = true; FK.moveX(p, q.f * 14 / 60); p.vx = q.f * 4; p.vy = Math.min(p.vy, 0.3); S.airSide = true;
      if (Math.floor(q.t * 20) !== q.d) { q.d = Math.floor(q.t * 20); S.fx.push({ k: 'trail', x: pcx(p), y: p.y + p.h, t: 0, life: 0.5 }); }
      for (const e of box(p, q.f, -0.3, 1.1, 0.7)) if (once(q, e)) hit(e, 1.5, { kx: q.f * 2, ky: -2 });
      return q.t > 0.4;
    },
    frost_air_up(p, q) { if (!q.go) { q.go = 1; p.vy = -13; S.airUp = true; sfx.frost(); for (const e of circ(pcx(p), p.y + p.h + 0.5, 1.4)) hit(e, 1.2, { kx: 0, ky: -3 }); } return q.t > 0.2; },   // FROST UPDRAFT
    frost_air_down(p, q) { p.vy = Math.min(p.vy, 0.5); if (!q.go) { q.go = 1; for (const a of [-0.5, -0.17, 0.17, 0.5]) shot({ k: 'shard', x: pcx(p), y: p.y + p.h, vx: Math.sin(a) * 14, vy: Math.cos(a) * 14, dmg: 1.2, kx: 0, ky: 3, life: 0.5 }); sfx.frost(); } return q.t > 0.25; },   // HAIL DROP
    // charged
    frost_cg_neutral(p, q) { if (!q.go) { q.go = 1; S.zones.push({ k: 'blizzard', x: pcx(p) + q.f * 3, y: pcy(p) - 0.5, w: 3.2, t: 0, life: 3, cool: new Map() }); sfx.frost(); } return q.t > 0.3; },   // BLIZZARD
    frost_cg_side(p, q) {   // ICE WALL: a wall of ice ahead you can stand on; struck again (or in time) it shatters into shards
      if (!q.go) { q.go = 1; const x = pcx(p) + q.f * 1.8, fy = p.onGround ? p.y + p.h : FK.floorAt(x, p.y + p.h, 8); if (fy != null) { S.walls.length = 0; S.walls.push({ x, fy, H: 2.4, w: 0.9, t: 0, life: 5, f: q.f }); for (const e of FK.foes()) if (Math.abs(ex(e) - x) < 0.8 && ey(e) > fy - 2.4 && ey(e) < fy) hit(e, 2, { kx: q.f * 6, ky: -6 }); sfx.frost(); } }
      return q.t > 0.3;
    },
    frost_cg_up(p, q) {   // FROZEN PRISON: the nearest foe is sealed in ice at once
      if (!q.go) { q.go = 1; const e = nearest(pcx(p), pcy(p), 7); if (e) { hit(e, 2, { kx: 0, ky: 0, chill: 3 }); e._ppFrozen = Math.max(e._ppFrozen || 0, 2.2); e.stunTimer = Math.max(e.stunTimer || 0, 2.2); fxRing(ex(e), ey(e), 1.2, '#ffffff'); FK.label(S, p, 'FROZEN PRISON!', '#e0f7ff', true); } sfx.frost(); }
      return q.t > 0.3;
    },
    frost_cg_down(p, q) {   // PERMAFROST: the floor round him freezes over; everyone standing on it is frozen
      if (!q.go && q.t > 0.12) { q.go = 1; const fy = p.y + p.h; S.zones.push({ k: 'permafrost', x: pcx(p), y: fy, w: 7, t: 0, life: 1 }); for (const e of FK.foes()) if (Math.abs(ex(e) - pcx(p)) < 3.5 && Math.abs(e.y + (e.h || 0.9) - fy) < 0.7) { hit(e, 2, { kx: 0, ky: 0, chill: 3 }); } sfx.frost(); FK.shake(5); }
      return q.t > 0.35;
    },

    // ================= ⚡ STORM: hit and run (blinks, dash refunds, shock)
    storm_ground_neutral(p, q) {   // SPARK JAB: two quick zaps
      const i = Math.floor(q.t / 0.08); if (i !== q.n && i < 2) { q.n = i; q.hs.clear(); sfx.storm(); }
      for (const e of box(p, q.f, 0, 1.5, 0.6)) if (once(q, e)) hit(e, 1, { kx: q.f * (q.n ? 4 : 1.5), ky: -2 });
      return q.t > 0.2;
    },
    storm_ground_side(p, q) { if (!q.go) { q.go = 1; blink(p, q.f, 4, q); } return q.t > 0.15; },   // LIGHTNING BLINK
    storm_ground_up(p, q) { if (!q.go) { q.go = 1; sfx.storm(); S.fx.push({ k: 'arc', x: pcx(p), y: p.y, f: q.f, t: 0, life: 0.25 }); for (const e of box(p, q.f, -0.6, 1.4, 1.2, -0.8)) hit(e, 2, { kx: q.f * 1.5, ky: -8 }); } return q.t > 0.22; },   // THUNDERCLAP
    storm_ground_down(p, q) { if (!q.go) { q.go = 1; S.zones.push({ k: 'static', x: pcx(p), y: p.y + p.h, w: 2.6, t: 0, life: 2.5, cool: new Map() }); sfx.storm(); } return q.t > 0.2; },   // STATIC FIELD
    storm_air_neutral(p, q) { if (!q.go) { q.go = 1; sfx.storm(); fxRing(pcx(p), pcy(p), 1.5, '#fff3a0'); for (const e of circ(pcx(p), pcy(p), 1.5)) hit(e, 1.5, { kx: Math.sign(ex(e) - pcx(p)) * 3, ky: -3 }); } return q.t > 0.18; },   // BALL ZAP
    storm_air_side(p, q) { if (!q.go) { q.go = 1; S.airSide = true; blink(p, q.f, 3.5, q); p.vy = Math.min(p.vy, 0); } return q.t > 0.15; },   // BOLT DASH (a hit gives it back)
    storm_air_up(p, q) {   // SKY BLINK: a blink straight up
      if (!q.go) { q.go = 1; S.airUp = true; const y0 = pcy(p); let d = 0; while (d < 3.5 && !FK.blocked(p.x, p.y - d - 0.25, p.w, p.h)) d += 0.25; p.y -= d; p.vy = -4; S.selfMove = true; S.fx.push({ k: 'bolt', x0: pcx(p), y0, x1: pcx(p), y1: pcy(p), t: 0, life: 0.2 }); for (const e of FK.foes()) if (Math.abs(ex(e) - pcx(p)) < 0.8 && ey(e) < y0 && ey(e) > pcy(p) - 0.5) hit(e, 1.5, { kx: 0, ky: -6 }); sfx.storm(); }
      return q.t > 0.15;
    },
    storm_air_down(p, q) { p.vy = 30; p.vx = 0; for (const e of box(p, 1, -0.5, 0.5, 0.6, 0.6)) if (once(q, e)) hit(e, 2, { kx: 0, ky: 10 }); if (p.onGround) { fxRing(pcx(p), p.y + p.h, 1.6, '#fbbf24'); for (const e of circ(pcx(p), p.y + p.h - 0.4, 1.6)) if (once(q, e)) hit(e, 1.5, { kx: Math.sign(ex(e) - pcx(p)) * 4, ky: -5 }); sfx.storm(); return true; } return q.t > 1; },   // THUNDER DROP
    // charged
    storm_cg_neutral(p, q) {   // CHAIN LIGHTNING: a bolt that leaps from foe to foe, five times
      if (!q.go && q.t > 0.08) { q.go = 1; let x = pcx(p), y = pcy(p); const got = new Set(); for (let i = 0; i < 5; i++) { const e = nearest(x, y, 6, got); if (!e) break; got.add(e); S.fx.push({ k: 'bolt', x0: x, y0: y, x1: ex(e), y1: ey(e), t: 0, life: 0.3 }); hit(e, 2.5, { kx: Math.sign(ex(e) - x || 1) * 3, ky: -4, stun: 0.5 }); x = ex(e); y = ey(e); } sfx.storm(); }
      return q.t > 0.3;
    },
    storm_cg_side(p, q) {   // STORM RUNNER: five blinks zig-zagging forward through the crowd
      const i = Math.floor(q.t / 0.08); if (i !== q.n && i < 5) { q.n = i; q.hs.clear(); const dy = i % 2 ? 1.2 : -1.2, y0 = p.y; if (!FK.blocked(p.x, p.y + dy * 0.6, p.w, p.h)) p.y += dy * 0.6; blink(p, q.f, 2, q); if (FK.blocked(p.x, p.y, p.w, p.h)) p.y = y0; }
      p.vy = Math.min(p.vy, 0); return q.t > 0.45;
    },
    storm_cg_up(p, q) {   // TEMPEST: a whirling storm column lifts everyone near up with him
      p.vy = -7; p.onGround = false; S.airUp = true; S.spin = q.t * 25;
      if (Math.floor(q.t / 0.12) !== q.n) { q.n = Math.floor(q.t / 0.12); for (const e of circ(pcx(p), pcy(p), 2.2)) hit(e, 0.8, { kx: (pcx(p) - ex(e)) * 2, ky: -9, stun: 0.3 }); sfx.storm(); }
      return q.t > 0.8;
    },
    storm_cg_down(p, q) {   // THUNDERSTRIKE: bolts from the sky on every foe near him
      if (!q.go && q.t > 0.15) { q.go = 1; for (const e of circ(pcx(p), pcy(p), 8)) { S.fx.push({ k: 'bolt', x0: ex(e) + 0.5, y0: ey(e) - 8, x1: ex(e), y1: ey(e), t: 0, life: 0.35 }); hit(e, 3.5, { kx: 0, ky: -7, stun: 0.6, big: true }); } FK.shake(8); sfx.storm(); FK.noise({ dur: 0.4, cut: 900, q: 1, vol: 0.3 }); }
      return q.t > 0.4;
    },

    // ================= 🪨 STONE: tank (super armor, heavy single hits)
    stone_ground_neutral(p, q) { if (q.t > 0.12 && !q.go) { q.go = 1; sfx.stone(); for (const e of box(p, q.f, 0, 1.7, 0.7)) hit(e, 3, { kx: q.f * 8, ky: -5, big: true, stop: 0.07 }); } return q.t > 0.32; },   // ROCK PUNCH
    stone_ground_side(p, q) { S.selfMove = true; if (q.t > 0.1) { FK.moveX(p, q.f * 13 / 60); p.vx = q.f * 4; for (const e of box(p, q.f, -0.2, 1.2, 0.7)) if (once(q, e)) { hit(e, 3, { kx: q.f * 9, ky: -5, big: true }); FK.thud(false); } } return q.t > 0.42; },   // SHOULDER SLAM
    stone_ground_up(p, q) {   // ROCK PILLAR: a pillar bursts up ahead and stays a moment to stand on
      if (!q.go && q.t > 0.14) { q.go = 1; const x = pcx(p) + q.f * 1.6, fy = FK.floorAt(x, p.y + p.h - 0.5, 3); if (fy != null) { S.walls.push({ x, fy, H: 2.2, w: 1.1, t: 0, life: 3, stone: true }); while (S.walls.length > 2) S.walls.shift(); for (const e of FK.foes()) if (Math.abs(ex(e) - x) < 0.8 && ey(e) > fy - 2.4 && ey(e) < fy + 0.2) hit(e, 3, { kx: 0, ky: -11, big: true }); sfx.stone(); } }
      return q.t > 0.4;
    },
    stone_ground_down(p, q) { if (q.t > 0.16 && !q.go) { q.go = 1; sfx.stone(); FK.shake(6); fxRing(pcx(p), p.y + p.h, 2.4, '#a8a29e'); for (const e of FK.foes()) if (Math.abs(ex(e) - pcx(p)) < 2.6 && Math.abs(e.y + (e.h || 0.9) - (p.y + p.h)) < 0.8) hit(e, 2.5, { kx: Math.sign(ex(e) - pcx(p)) * 4, ky: -8 }); } return q.t > 0.42; },   // QUAKE STOMP
    stone_air_neutral(p, q) { p.vy = Math.min(p.vy, 2.5); S.spin = q.t * 14; if (Math.floor(q.t / 0.15) !== q.n) { q.n = Math.floor(q.t / 0.15); q.hs.clear(); } for (const e of circ(pcx(p), pcy(p), 1.3)) if (once(q, e)) hit(e, 1.8, { kx: Math.sign(ex(e) - pcx(p)) * 5, ky: -4 }); return q.t > 0.45; },   // STONE SPIN
    stone_air_side(p, q) { if (!q.go && q.t > 0.1) { q.go = 1; shot({ k: 'rock', x: pcx(p) + q.f * 0.6, y: pcy(p), vx: q.f * 12, vy: -3, grav: 18, dmg: 3, kx: q.f * 7, ky: -5, life: 1.4, r: 0.35 }); sfx.stone(); } return q.t > 0.35; },   // BOULDER TOSS
    stone_air_up(p, q) { if (!q.go) { q.go = 1; p.vy = -14; S.airUp = true; S.walls.push({ x: pcx(p), fy: p.y + p.h + 0.5, H: 0.5, w: 1.2, t: 0, life: 1.2, stone: true }); for (const e of circ(pcx(p), p.y + p.h + 0.4, 1.2)) hit(e, 2, { kx: 0, ky: 6 }); sfx.stone(); } return q.t > 0.25; },   // ROCK RIDE (leaves the rock behind)
    stone_air_down(p, q) { p.vy = 26; p.vx = 0; for (const e of box(p, 1, -0.6, 0.6, 0.7, 0.6)) if (once(q, e)) hit(e, 3, { kx: 0, ky: 12, big: true }); if (p.onGround) { fxRing(pcx(p), p.y + p.h, 2.4, '#a8a29e'); for (const e of circ(pcx(p), p.y + p.h - 0.4, 2.4)) if (once(q, e)) hit(e, 2.5, { kx: Math.sign(ex(e) - pcx(p)) * 5, ky: -7 }); FK.thud(true); FK.shake(7); return true; } return q.t > 1.3; },   // EARTHFALL
    // charged
    stone_cg_neutral(p, q) { S.fist = Math.min(1, q.t / 0.25); if (q.t > 0.25 && !q.go) { q.go = 1; for (const e of box(p, q.f, 0, 2.6, 1)) hit(e, 7, { kx: q.f * 11, ky: -7, big: true, stop: 0.13, shake: 11 }); FK.thud(true); } if (q.t > 0.5) { S.fist = 0; return true; } },   // TITAN FIST
    stone_cg_side(p, q) { while (q.t >= 0.06 + (q.n < 0 ? 0 : q.n + 1) * 0.15 && q.n < 2) { q.n++; shot({ k: 'roller', x: pcx(p) + q.f * 0.6, y: p.y + p.h - 0.45, vx: q.f * (8 + q.n * 2), vy: 0, grav: 30, dmg: 3, kx: q.f * 7, ky: -7, life: 2, r: 0.42, pierce: true }); sfx.stone(); } return q.t > 0.5; },   // LANDSLIDE
    stone_cg_up(p, q) {   // FORTRESS: a shell of stone: nothing gets through for a moment, then it bursts outward
      S.shell = 1; p.vx = 0; p._armorT = 0.2; p._grabInv = 0.1; p.hpInvuln = Math.max(p.hpInvuln || 0, 0.1);
      if (q.t > 1 && !q.go) { q.go = 1; S.shell = 0; fxRing(pcx(p), pcy(p), 2.4, '#e7e5e4'); for (const e of circ(pcx(p), pcy(p), 2.4)) hit(e, 4, { kx: Math.sign(ex(e) - pcx(p)) * 9, ky: -8, big: true }); FK.thud(true); FK.shake(8); }
      return q.t > 1.15;
    },
    stone_cg_down(p, q) {   // TECTONIC: a fault cracks open ahead; spikes of rock burst up along it, one after another
      const i = Math.floor((q.t - 0.15) / 0.08);
      if (q.t > 0.15 && i !== q.n && i < 5) { q.n = i; const x = pcx(p) + q.f * (1.2 + i * 0.9), fy = FK.floorAt(x, p.y + p.h - 0.5, 3); if (fy != null) { S.zones.push({ k: 'spike', x, y: fy, w: 0.7, H: 1.6, t: 0, life: 0.4 }); for (const e of FK.foes()) if (Math.abs(ex(e) - x) < 0.6 && ey(e) > fy - 1.8 && ey(e) < fy + 0.2) hit(e, 2.5, { kx: q.f * 2, ky: -10 }); sfx.stone(); } }
      return q.t > 0.6;
    },
  };
  // ---- charged in the air ----
  Object.assign(M, {
    flame_ca_neutral(p, q) { p.vy = Math.min(p.vy, 0.5); if (!q.go && q.t > 0.12) { q.go = 1; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; shot({ k: 'fire', x: pcx(p), y: pcy(p), vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, dmg: 2, kx: Math.cos(a) * 5, ky: -4, life: 0.5, el: 'flame' }); } sfx.flame(); FK.shake(5); } return q.t > 0.3; },   // SOLAR FLARE: eight fireballs every way
    flame_ca_side(p, q) {   // COMET: a burning dive down and ahead that explodes where it hits
      S.selfMove = true; S.wings = 1; p.vx = q.f * 14; p.vy = 14; FK.moveX(p, q.f * 6 / 60);
      for (const e of circ(pcx(p), pcy(p), 1)) if (once(q, e)) hit(e, 2.5, { kx: q.f * 4, ky: 6 });
      if (p.onGround || q.t > 1) { S.wings = 0; fxRing(pcx(p), p.y + p.h, 2.2, '#ff6b35'); for (const e of circ(pcx(p), p.y + p.h - 0.4, 2.2)) hit(e, 3, { kx: Math.sign(ex(e) - pcx(p)) * 8, ky: -8, big: true, burn: 3 }); FK.thud(true); return true; }
    },
    flame_ca_up(p, q) { if (!q.go) { q.go = 1; S.airUp = true; sfx.flame(); } S.wings = 1; p.vy = -16 + q.t * 14; p.onGround = false; for (const e of circ(pcx(p), p.y - 0.3, 1.4)) if (once(q, e)) hit(e, 2.5, { kx: 0, ky: -10, burn: 3 }); if (q.t > 0.6) { S.wings = 0; return true; } },   // PHOENIX RISE
    flame_ca_down(p, q) { p.vy = Math.min(p.vy, 0.5); while (q.t >= 0.05 + (q.n + 1) * 0.12 && q.n < 2) { q.n++; shot({ k: 'fire', x: pcx(p) + (q.n - 1) * 0.8, y: p.y + p.h, vx: (q.n - 1) * 2, vy: 6, grav: 24, dmg: 2, kx: 0, ky: -7, life: 2, el: 'flame', bomb: 1.6 }); sfx.flame(); } return q.t > 0.45; },   // HELLFIRE DROP: three fire bombs
    frost_ca_neutral(p, q) { p.vy = Math.min(p.vy, 1); S.dust = 1; if (Math.floor(q.t / 0.15) !== q.n) { q.n = Math.floor(q.t / 0.15); for (const e of circ(pcx(p), pcy(p), 2.2)) hit(e, 0.6, { kx: 0, ky: -1 }); } if (q.t > 1) { S.dust = 0; return true; } },   // DIAMOND DUST
    frost_ca_side(p, q) { p.vy = Math.min(p.vy, 0.5); if (!q.go && q.t > 0.1) { q.go = 1; for (const a of [-0.3, -0.15, 0, 0.15, 0.3]) shot({ k: 'lance', x: pcx(p) + q.f * 0.6, y: pcy(p), vx: Math.cos(a) * q.f * 20, vy: Math.sin(a) * 20, dmg: 1.8, kx: q.f * 2, ky: -1, life: 0.45, chill: 1, r: 0.3 }); sfx.frost(); } return q.t > 0.32; },   // ICICLE BARRAGE
    frost_ca_up(p, q) { while (q.t >= (q.n + 1) * 0.1 && q.n < 2) { q.n++; S.walls.push({ x: pcx(p) + q.f * (0.6 + q.n * 1.1), fy: p.y + p.h - q.n * 0.9 + 0.4, H: 0.4, w: 1.1, t: 0, life: 5, f: q.f }); while (S.walls.length > 4) S.walls.shift(); sfx.frost(); } if (q.n === 0 && !q.go) { q.go = 1; p.vy = -8; } return q.t > 0.35; },   // ICE STAIRS: three steps of ice up and ahead
    frost_ca_down(p, q) {   // GLACIER FALL: a huge ice block under his feet; he rides it down, the impact freezes
      S.block = 1; p.vy = 24; p.vx = 0;
      for (const e of box(p, 1, -0.9, 0.9, 0.8, 0.9)) if (once(q, e)) hit(e, 3, { kx: 0, ky: 12, chill: 2 });
      if (p.onGround || q.t > 1.4) { S.block = 0; fxRing(pcx(p), p.y + p.h, 2.6, '#e0f7ff'); for (const e of circ(pcx(p), p.y + p.h - 0.4, 2.6)) hit(e, 2.5, { kx: Math.sign(ex(e) - pcx(p)) * 3, ky: -5, chill: 3 }); FK.thud(true); return true; }
    },
    storm_ca_neutral(p, q) { p.vy = Math.min(p.vy, 1); S.orb = q.t; if (Math.floor(q.t / 0.12) !== q.n) { q.n = Math.floor(q.t / 0.12); for (const e of circ(pcx(p), pcy(p), 2.4)) { hit(e, 0.7, { kx: 0, ky: -2, stun: 0.3 }); S.fx.push({ k: 'bolt', x0: pcx(p), y0: pcy(p), x1: ex(e), y1: ey(e), t: 0, life: 0.12 }); } } if (q.t > 0.9) { S.orb = 0; return true; } },   // THUNDERHEAD
    storm_ca_side(p, q) { const i = Math.floor(q.t / 0.09); if (i !== q.n && i < 3) { q.n = i; q.hs.clear(); const dy = i % 2 ? -0.9 : 0.9; if (!FK.blocked(p.x, p.y + dy, p.w, p.h)) p.y += dy; blink(p, q.f, 2.6, q); } p.vy = Math.min(p.vy, 0); return q.t > 0.3; },   // ZIGZAG
    storm_ca_up(p, q) { if (!q.go) { q.go = 1; S.airUp = true; const y0 = pcy(p); let d = 0; while (d < 5.5 && !FK.blocked(p.x, p.y - d - 0.25, p.w, p.h)) d += 0.25; p.y -= d; p.vy = -3; S.selfMove = true; S.fx.push({ k: 'bolt', x0: pcx(p), y0, x1: pcx(p), y1: pcy(p), t: 0, life: 0.3 }); for (const e of FK.foes()) if (Math.abs(ex(e) - pcx(p)) < 1 && ey(e) < y0 + 0.5 && ey(e) > pcy(p) - 0.5) hit(e, 3, { kx: 0, ky: -9, big: true }); sfx.storm(); } return q.t > 0.2; },   // RISING BOLT
    storm_ca_down(p, q) {   // LIGHTNING ROD: a rod shot into the floor below; bolts strike round it three times
      if (!q.go) { q.go = 1; const fy = FK.floorAt(pcx(p), p.y + p.h, 10); q.rod = fy != null ? { x: pcx(p), y: fy } : null; sfx.storm(); }
      if (q.rod) { S.rod = q.rod; const i = Math.floor((q.t - 0.15) / 0.2); if (q.t > 0.15 && i !== q.n && i < 3) { q.n = i; for (const e of circ(q.rod.x, q.rod.y - 0.6, 2.4)) { S.fx.push({ k: 'bolt', x0: q.rod.x, y0: q.rod.y - 1.4, x1: ex(e), y1: ey(e), t: 0, life: 0.2 }); hit(e, 1.8, { kx: Math.sign(ex(e) - q.rod.x) * 3, ky: -5, stun: 0.4 }); } sfx.storm(); } }
      if (q.t > 0.8) { S.rod = null; return true; }
    },
    stone_ca_neutral(p, q) { S.spin = q.t * 18; p._armorT = 0.2; if (p.onGround && !q.b) { q.b = 1; p.vy = -9; p.onGround = false; FK.thud(false); } if (Math.floor(q.t / 0.15) !== q.n) { q.n = Math.floor(q.t / 0.15); q.hs.clear(); } for (const e of circ(pcx(p), pcy(p), 1.4)) if (once(q, e)) hit(e, 2.5, { kx: Math.sign(ex(e) - pcx(p)) * 7, ky: -6 }); return q.t > 0.9; },   // METEOR SHELL
    stone_ca_side(p, q) { while (q.t >= 0.08 + (q.n + 1) * 0.14 && q.n < 2) { q.n++; shot({ k: 'rock', x: pcx(p) + q.f * 0.6, y: pcy(p) - 0.2, vx: q.f * (10 + q.n * 2), vy: -4 + q.n * 2, grav: 18, dmg: 3, kx: q.f * 7, ky: -5, life: 1.4, r: 0.35 }); sfx.stone(); } p.vy = Math.min(p.vy, 1); return q.t > 0.5; },   // BOULDER BARRAGE
    stone_ca_up(p, q) { while (q.t >= (q.n + 1) * 0.22 && q.n < 1) { q.n++; } if (q.n !== q.done) { q.done = q.n; S.walls.push({ x: pcx(p), fy: p.y + p.h + 0.45, H: 0.45, w: 1.3, t: 0, life: 4, stone: true }); while (S.walls.length > 3) S.walls.shift(); p.vy = -13; p.onGround = false; S.airUp = true; sfx.stone(); } return q.t > 0.45; },   // STONE STEPS: two stones to jump off, one after the other
    stone_ca_down(p, q) {   // MOUNTAIN DROP: he swells and drops like a mountain; the floor throws up a pillar on each side
      S.big = Math.min(1, q.t / 0.15); if (q.t < 0.15) { p.vy = -1; p.vx = 0; return; } p.vy = 30; p.vx = 0;
      for (const e of box(p, 1, -0.9, 0.9, 0.9, 0.7)) if (once(q, e)) hit(e, 4, { kx: 0, ky: 13, big: true });
      if (p.onGround || q.t > 1.6) { S.big = 0; FK.thud(true); FK.shake(10); fxRing(pcx(p), p.y + p.h, 3, '#a8a29e'); for (const e of circ(pcx(p), p.y + p.h - 0.4, 3)) if (once(q, e)) hit(e, 3, { kx: Math.sign(ex(e) - pcx(p)) * 6, ky: -9, big: true }); if (p.onGround) for (const d of [-1.7, 1.7]) S.walls.push({ x: pcx(p) + d, fy: p.y + p.h, H: 1.8, w: 1, t: 0, life: 3, stone: true }); while (S.walls.length > 4) S.walls.shift(); return true; }
    },
  });
  // a blink-dash: vanishes, reappears ahead, zaps everything in the line
  function blink(p, f, L, q) {
    const x0 = pcx(p); let d = 0; while (d < L && !FK.blocked(p.x + f * (d + 0.25), p.y + 0.02, p.w, p.h - 0.04)) d += 0.25;
    p.x += f * d; p.vx = f * 3; S.selfMove = true;
    const lo = Math.min(x0, pcx(p)) - 0.4, hi = Math.max(x0, pcx(p)) + 0.4;
    for (const e of FK.foes()) if (ex(e) > lo && ex(e) < hi && Math.abs(ey(e) - pcy(p)) < 1.1 && once(q, e)) hit(e, 2, { kx: f * 4, ky: -3 });
    S.fx.push({ k: 'bolt', x0, y0: pcy(p), x1: pcx(p), y1: pcy(p), t: 0, life: 0.2 }); sfx.storm();
  }

  // ---- shots, zones and walls ----
  function stepWorld(p, dt) {
    const foes = FK.foes();
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const s = S.shots[i]; s.t += dt; s.vy += s.grav * dt;
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
      let gone = s.t > s.life;
      if (s.bomb && FK.blocked(nx - 0.1, ny - 0.1, 0.2, 0.2)) { fxRing(s.x, s.y, s.bomb, '#ff6b35'); for (const e of circ(s.x, s.y, s.bomb)) hit(e, 2, { kx: Math.sign(ex(e) - s.x) * 5, ky: -7, el: 'flame', burn: 3 }); sfx.flame(); }
      if (s.k === 'roller') { if (FK.blocked(nx - 0.2, s.y - 0.2, 0.4, 0.3)) gone = true; else s.x = nx; if (FK.blocked(s.x - 0.2, ny, 0.4, 0.45)) s.vy = 0; else s.y = ny; }
      else { if (FK.blocked(nx - 0.1, ny - 0.1, 0.2, 0.2)) gone = true; s.x = nx; s.y = ny; }
      for (const w of S.walls) if (!w.stone && Math.abs(s.x - w.x) < w.w / 2 + 0.1 && s.y > w.fy - w.H && s.y < w.fy) { shatter(w); gone = true; }
      if (!gone) for (const e of foes) if (!s.hs.has(e) && Math.abs(ex(e) - s.x) < s.r + (e.w || 0.9) / 2 && Math.abs(ey(e) - s.y) < s.r + (e.h || 0.9) / 2) { s.hs.add(e); hit(e, s.dmg, { kx: s.kx, ky: s.ky, chill: s.chill, el: s.el }); if (!s.pierce) { gone = true; break; } }
      if (gone) { S.fx.push({ k: 'pop', x: s.x, y: s.y, t: 0, life: 0.2, kind: s.k }); S.shots.splice(i, 1); }
    }
    for (let i = S.zones.length - 1; i >= 0; i--) {
      const z = S.zones[i]; z.t += dt;
      if (z.cool) for (const [e, c] of z.cool) { if (c - dt <= 0) z.cool.delete(e); else z.cool.set(e, c - dt); }
      const inZ = e => Math.abs(ex(e) - z.x) < z.w / 2 + 0.2 && Math.abs(e.y + (e.h || 0.9) - z.y) < 0.6;
      if (z.k === 'embers') for (const e of foes) if (!z.cool.has(e) && inZ(e)) { z.cool.set(e, 0.6); hit(e, 0.6, { kx: 0, ky: -2, el: 'flame' }); }
      if (z.k === 'icepatch') for (const e of foes) if (inZ(e)) { e.slowTimer = Math.max(e.slowTimer || 0, 0.5); if (!z.cool.has(e)) { z.cool.set(e, 0.9); hit(e, 0.5, { kx: 0, ky: 0, el: 'frost' }); } }
      if (z.k === 'static') for (const e of foes) if (!z.cool.has(e) && Math.abs(ex(e) - z.x) < z.w / 2 + 0.2 && Math.abs(ey(e) - (z.y - 0.6)) < 1) { z.cool.set(e, 0.5); hit(e, 0.8, { kx: 0, ky: -2, stun: 0.4, el: 'storm' }); }
      if (z.k === 'blizzard') { z.x += (S.blizF || 0) * 0; for (const e of foes) if (!z.cool.has(e) && Math.abs(ex(e) - z.x) < z.w / 2 && Math.abs(ey(e) - z.y) < 1.8) { z.cool.set(e, 0.3); hit(e, 0.5, { kx: 0, ky: 0, el: 'frost' }); } }
      if (z.t > z.life) S.zones.splice(i, 1);
    }
    for (let i = S.walls.length - 1; i >= 0; i--) {
      const w = S.walls[i]; w.t += dt;
      const h = w.H * Math.min(1, w.t / 0.12);
      if (FK.stand(p, w.fy - h, w.x - w.w / 2, w.x + w.w / 2)) S.selfMove = true;
      if (w.t > w.life) { if (!w.stone) shatter(w); else S.walls.splice(i, 1); }
    }
  }
  function shatter(w) {   // the ice wall breaks into shards flying both ways
    const i = S.walls.indexOf(w); if (i < 0) return; S.walls.splice(i, 1);
    for (let k = 0; k < 6; k++) { const a = (k < 3 ? Math.PI : 0) + (k % 3 - 1) * 0.35; shot({ k: 'shard', x: w.x, y: w.fy - w.H / 2, vx: Math.cos(a) * 13, vy: Math.sin(a) * 6 - 2, grav: 10, dmg: 1.5, kx: Math.cos(a) * 3, ky: -3, life: 0.6, el: 'frost' }); }
    FK.tone(2200, { dur: 0.15, vol: 0.1, type: 'sine', slide: 900 });
  }

  // ---- the S button ----
  const RECOVER = { flame: 0.05, frost: 0.1, storm: 0.04, stone: 0.14 };   // end lag per element: Flame and Storm are the quickest
  function press() {
    const p = P(); if (!p || S.cd > 0 || S.seq) return;
    const pick = () => {
      const q = P(); if (!q || window.selectedCharacter !== ID || S.seq) return null;
      const k = FK.keys(), air = !q.onGround;
      const dir = (k.down && !k.up) ? 'down' : (k.up && !k.down) ? 'up' : (k.left || k.right) ? 'side' : 'neutral';
      if (air && dir === 'up' && S.airUp) { FK.msg(EMO[form()] + ' comes back when you land'); return null; }
      if (air && dir === 'side' && S.airSide && form() !== 'storm') { FK.msg(EMO[form()] + ' comes back when you land'); return null; }
      return { dir, air, f: k.right ? 1 : k.left ? -1 : FK.face(q) };
    };
    const fire = (sel, pw) => {
      const q = P(); if (!q || S.seq) return;
      const fm = form(), full = pw >= 0.95, key = fm + '_' + (full ? (sel.air ? 'ca' : 'cg') : sel.air ? 'air' : 'ground') + '_' + sel.dir;
      q.dashDir = sel.f; q.lastMoveDir = sel.f;
      S.seq = { key, t: 0, f: sel.f, air: sel.air, hs: new Set(), n: -1 };
      S.cd = RECOVER[fm] + (full ? 0.3 : 0);
      if (full) { FK.label(S, q, EMO[fm] + ' ' + CNAME[key], COL[fm][1], true); FK.msg(EMO[fm] + ' ' + CNAME[key] + '!'); }
    };
    const fd = { windup: form() === 'stone' ? 0.06 : 0.02, active: 0.1, endlag: 0.02, root: false };
    if (window.PPStrike) { window.PPStrike.press(() => { const sel = pick(); return sel && { fd, dir: sel.f, color: COL[form()][0], aim: sel.dir === 'neutral' ? 'side' : sel.dir, variant: form(), fire: pw => fire(sel, pw) }; }, true); return; }
    const sel = pick(); if (sel) fire(sel, 0);
  }
  const CNAME = {
    flame_cg_neutral: 'INFERNO RUSH', flame_cg_side: 'PHOENIX DASH', flame_cg_up: 'VOLCANO', flame_cg_down: 'SUPERNOVA',
    frost_cg_neutral: 'BLIZZARD', frost_cg_side: 'ICE WALL', frost_cg_up: 'FROZEN PRISON', frost_cg_down: 'PERMAFROST',
    storm_cg_neutral: 'CHAIN LIGHTNING', storm_cg_side: 'STORM RUNNER', storm_cg_up: 'TEMPEST', storm_cg_down: 'THUNDERSTRIKE',
    stone_cg_neutral: 'TITAN FIST', stone_cg_side: 'LANDSLIDE', stone_cg_up: 'FORTRESS', stone_cg_down: 'TECTONIC',
    flame_ca_neutral: 'SOLAR FLARE', flame_ca_side: 'COMET', flame_ca_up: 'PHOENIX RISE', flame_ca_down: 'HELLFIRE DROP',
    frost_ca_neutral: 'DIAMOND DUST', frost_ca_side: 'ICICLE BARRAGE', frost_ca_up: 'ICE STAIRS', frost_ca_down: 'GLACIER FALL',
    storm_ca_neutral: 'THUNDERHEAD', storm_ca_side: 'ZIGZAG', storm_ca_up: 'RISING BOLT', storm_ca_down: 'LIGHTNING ROD',
    stone_ca_neutral: 'METEOR SHELL', stone_ca_side: 'BOULDER BARRAGE', stone_ca_up: 'STONE STEPS', stone_ca_down: 'MOUNTAIN DROP',
  };
  window.__spirit = { press, heat: () => S.heat };

  // ---- every frame ----
  function step(dt) {
    const playing = window.selectedCharacter === ID && (!window._gameMode || window._gameMode() === 'play');
    if (!playing) { if (S.active) S = fresh(); return; }
    const p = P(); if (!p) return;
    S.active = true;
    if (S.lastPX != null && !S.selfMove && (Math.abs(p.x - S.lastPX) > 4 || Math.abs(p.y - S.lastPY) > 4)) { S.seq = null; S.walls.length = 0; S.zones.length = 0; }
    S.selfMove = false;
    if (S.cd > 0) S.cd -= dt;
    if (S.heatT > 0) { S.heatT -= dt; if (S.heatT <= 0) S.heat = 0; }
    if (p.onGround) { S.airUp = false; S.airSide = false; }
    if (S.seq && p.hitstun > 0 && form() !== 'stone') S.seq = null;
    if (S.seq) {
      const q = S.seq; q.t += dt;
      if (q.key.indexOf('stone') === 0) p._armorT = Math.max(p._armorT || 0, 0.08);   // STONE: super armor through every move
      const fn = M[q.key]; let done = true;
      try { done = !fn || fn(p, q) === true; } catch (e) { done = true; }
      if (done || q.t > 2) { S.seq = null; S.spin = 0; S.wings = 0; S.nova = 0; S.fist = 0; S.shell = 0; S.dust = 0; S.orb = 0; S.rod = null; S.block = 0; S.big = 0; }
    }
    stepWorld(p, dt);
    for (let i = S.fx.length - 1; i >= 0; i--) { S.fx[i].t += dt; if (S.fx[i].t >= S.fx[i].life) S.fx.splice(i, 1); }
    S.lastPX = p.x; S.lastPY = p.y;
  }
  (window._rafHubTickers = window._rafHubTickers || []).push(step);

  // ---- drawing ----
  function drawWorld(ctx, cam) {
    const p = P(); if (!p || !S.active) return;
    const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0, SX = x => x * T - cx0, SY = y => y * T - cy0, now = performance.now() / 1000;
    const V = { T, SX, SY, now, p };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const z of S.zones) {
      const x = SX(z.x), y = SY(z.y), a = Math.min(1, z.t / 0.1) * Math.min(1, (z.life - z.t) / 0.25);
      if (z.k === 'embers') { for (let i = 0; i < 3; i++) { const ph = (now * 2 + i / 3) % 1; FK.glow(ctx, i % 2 ? '#ffd166' : '#ff6b35', 0.8 * a); ctx.beginPath(); ctx.arc(x + (i - 1) * 5, y - ph * T * 0.5, 3 * (1 - ph) + 1, 0, Math.PI * 2); ctx.fill(); } }
      else if (z.k === 'column' || z.k === 'icicle' || z.k === 'spike') { const H = z.H * T * Math.min(1, z.t / 0.08), c = z.k === 'column' ? '#ff6b35' : z.k === 'icicle' ? '#bfeaff' : '#a8a29e'; if (z.k === 'column') { FK.glow(ctx, c, 0.6 * a); ctx.fillRect(x - z.w * T / 2, y - H, z.w * T, H); FK.glow(ctx, '#ffd166', 0.5 * a); ctx.fillRect(x - z.w * T / 4, y - H, z.w * T / 2, H); } else { FK.solid(ctx, c, a); ctx.beginPath(); ctx.moveTo(x - z.w * T / 2, y); ctx.lineTo(x, y - H); ctx.lineTo(x + z.w * T / 2, y); ctx.fill(); } }
      else if (z.k === 'icepatch' || z.k === 'permafrost') { FK.solid(ctx, '#bfeaff', 0.7 * a); ctx.beginPath(); ctx.roundRect(x - z.w * T / 2, y - 5, z.w * T, 6, 3); ctx.fill(); FK.glow(ctx, '#ffffff', 0.5 * a); for (let i = 0; i < 4; i++) ctx.fillRect(x - z.w * T / 2 + ((i * 0.27 + now * 0.2) % 1) * z.w * T, y - 4, 6, 1.5); }
      else if (z.k === 'static') { for (let i = 0; i < 5; i++) { const xx = x + (Math.random() - 0.5) * z.w * T; FK.glow(ctx, '#fff3a0', 0.7 * a); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx + (Math.random() - 0.5) * 8, y - T * 0.4); ctx.lineTo(xx + (Math.random() - 0.5) * 8, y - T * 0.9); ctx.stroke(); } }
      else if (z.k === 'blizzard') { FK.solid(ctx, '#cfe8f5', 0.55 * a); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + (i - 1.5) * z.w * T * 0.25, y - T * 1.6, T * 0.5, 0, Math.PI * 2); ctx.fill(); } FK.solid(ctx, '#ffffff', 0.9 * a); for (let i = 0; i < 14; i++) { const ph = (now * 1.5 + i * 0.13) % 1; ctx.fillRect(x + ((i * 0.37) % 1 - 0.5) * z.w * T + Math.sin(now * 3 + i) * 6, y - T * 1.4 + ph * T * 3, 2.5, 2.5); } }
    }
    for (const w of S.walls) { const h = w.H * T * Math.min(1, w.t / 0.12), x = SX(w.x - w.w / 2), y = SY(w.fy); FK.solid(ctx, w.stone ? '#8f8a85' : '#bfeaff', w.stone ? 1 : 0.85); ctx.beginPath(); ctx.roundRect(x, y - h, w.w * T, h, 4); ctx.fill(); FK.solid(ctx, w.stone ? '#d6d3d1' : '#ffffff', 0.6); ctx.fillRect(x + 3, y - h + 3, w.w * T * 0.25, h - 6); }
    for (const s of S.shots) {
      const x = SX(s.x), y = SY(s.y), r = s.r * T;
      if (s.k === 'fire') { ctx.beginPath(); ctx.arc(x, y, r * 1.4, 0, Math.PI * 2); FK.glow(ctx, '#ff6b35', 0.5); ctx.fill(); FK.solid(ctx, '#ffd166', 1); ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill(); }
      else if (s.k === 'shard' || s.k === 'lance') { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(s.vy, s.vx)); FK.solid(ctx, '#e0f7ff', 1); ctx.beginPath(); ctx.moveTo(r * (s.k === 'lance' ? 3 : 1.6), 0); ctx.lineTo(-r, -r * 0.4); ctx.lineTo(-r, r * 0.4); ctx.fill(); FK.glow(ctx, '#7dd3fc', 0.5); ctx.fill(); ctx.restore(); }
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(s.t * 10); FK.solid(ctx, '#a8a29e', 1); ctx.beginPath(); for (let i = 0; i < 7; i++) { const an = i / 7 * Math.PI * 2; ctx.lineTo(Math.cos(an) * r * (0.85 + 0.15 * Math.sin(i * 3)), Math.sin(an) * r); } ctx.fill(); FK.solid(ctx, '#e7e5e4', 1); ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.25, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
    const cx = SX(pcx(p)), cy = SY(pcy(p));
    if (S.spin) { ctx.beginPath(); ctx.arc(cx, cy, T * 1.2, S.spin, S.spin + 4); FK.glow(ctx, COL[form()][0], 0.6); ctx.lineWidth = 4; ctx.stroke(); }
    if (S.wings) for (const sd of [-1, 1]) { ctx.save(); ctx.translate(cx, cy); ctx.scale(sd, 1); FK.glow(ctx, '#ff6b35', 0.5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(T * 1.2, -T * 1.2, T * 1.8, -T * 0.2); ctx.quadraticCurveTo(T, 0, 0, T * 0.2); ctx.fill(); ctx.restore(); }
    if (S.nova) { ctx.beginPath(); ctx.arc(cx, cy, T * (0.6 + 1.2 * S.nova), 0, Math.PI * 2); FK.glow(ctx, '#ffd166', 0.3 + 0.4 * S.nova); ctx.fill(); }
    if (S.fist) { const f = FK.face(p), x = cx + f * T * (0.9 + 0.6 * S.fist), R = T * (0.35 + 0.5 * S.fist); FK.solid(ctx, '#a8a29e', 1); ctx.beginPath(); ctx.roundRect(x - R, cy - R * 0.8, R * 2, R * 1.6, R * 0.4); ctx.fill(); }
    if (S.shell) { ctx.beginPath(); ctx.arc(cx, cy, T * 1.1, 0, Math.PI * 2); FK.solid(ctx, '#8f8a85', 0.75); ctx.fill(); FK.solid(ctx, '#d6d3d1', 0.8); ctx.lineWidth = 3; ctx.stroke(); }
    if (S.dust) for (let i = 0; i < 16; i++) { const an = now * 3 + i * 0.4, r = T * (0.8 + (i % 4) * 0.4); FK.glow(ctx, '#e0f7ff', 0.8); ctx.fillRect(cx + Math.cos(an) * r, cy + Math.sin(an) * r * 0.8, 2.5, 2.5); }
    if (S.orb) for (let i = 0; i < 3; i++) { const an = now * 8 + i * 2.1; ctx.beginPath(); ctx.arc(cx + Math.cos(an) * T * 1.2, cy + Math.sin(an) * T, T * 0.22, 0, Math.PI * 2); FK.glow(ctx, '#fff3a0', 0.9); ctx.fill(); }
    if (S.rod) { const x = SX(S.rod.x), y = SY(S.rod.y); FK.solid(ctx, '#9aa3b2', 1); ctx.fillRect(x - 2, y - T * 1.4, 4, T * 1.4); FK.glow(ctx, '#fff3a0', 0.6 + 0.4 * Math.sin(now * 30)); ctx.beginPath(); ctx.arc(x, y - T * 1.4, 5, 0, Math.PI * 2); ctx.fill(); }
    if (S.block) { FK.solid(ctx, '#bfeaff', 0.85); ctx.beginPath(); ctx.roundRect(cx - T * 0.9, SY(p.y + p.h) - 4, T * 1.8, T * 1.1, 6); ctx.fill(); }
    if (S.big) { ctx.beginPath(); ctx.arc(cx, cy, T * (0.6 + 0.6 * S.big), 0, Math.PI * 2); FK.solid(ctx, '#8f8a85', 0.6); ctx.fill(); }
    if (S.heat > 0 && form() === 'flame') for (let i = 0; i < S.heat; i++) { ctx.beginPath(); ctx.arc(cx + (i - (S.heat - 1) / 2) * T * 0.25, SY(p.y) - T * 0.4, T * 0.08, 0, Math.PI * 2); FK.glow(ctx, '#ffd166', 0.9); ctx.fill(); }
    FK.drawFx(ctx, V, S.fx, (c2, V2, f, u, a) => {
      if (f.k === 'bolt') { c2.beginPath(); c2.moveTo(V2.SX(f.x0), V2.SY(f.y0)); for (let i = 1; i < 7; i++) { const v = i / 7; c2.lineTo(V2.SX(f.x0 + (f.x1 - f.x0) * v) + (Math.random() - 0.5) * 10, V2.SY(f.y0 + (f.y1 - f.y0) * v) + (Math.random() - 0.5) * 10); } c2.lineTo(V2.SX(f.x1), V2.SY(f.y1)); FK.glow(c2, '#fff3a0', a); c2.lineWidth = 3; c2.stroke(); return true; }
      if (f.k === 'arc') { c2.beginPath(); c2.arc(V2.SX(f.x), V2.SY(f.y + 0.5), V2.T * 1.2, -Math.PI * 0.9, -Math.PI * 0.1); FK.glow(c2, '#fbbf24', a); c2.lineWidth = 4; c2.stroke(); return true; }
      if (f.k === 'trail') { FK.solid(c2, '#bfeaff', a * 0.8); c2.fillRect(V2.SX(f.x) - V2.T * 0.3, V2.SY(f.y) - 2, V2.T * 0.6, 4); return true; }
      if (f.k === 'pop') { const c = f.kind === 'rock' || f.kind === 'roller' ? '#a8a29e' : '#e0f7ff'; for (let i = 0; i < 5; i++) { const an = i * 1.26; c2.beginPath(); c2.arc(V2.SX(f.x) + Math.cos(an) * V2.T * 0.3 * u, V2.SY(f.y) + Math.sin(an) * V2.T * 0.3 * u, V2.T * 0.05, 0, Math.PI * 2); FK.solid(c2, c, a); c2.fill(); } return true; }
      return false;
    });
    ctx.restore();
  }
  const _prevHook = window.drifterDrawHook;
  window.drifterDrawHook = function (ctx, now2, cam) { if (_prevHook) _prevHook(ctx, now2, cam); if (window.selectedCharacter !== ID) return; try { drawWorld(ctx, cam); } catch (e) {} };
  (window._fighterPlugins = window._fighterPlugins || []).push({ name: 'spirit', char: ID,
    swap(s) { const o = S; S = s || fresh(); return o; },
    tick: dt => { if (window.selectedCharacter === ID) step(dt); },
    draw: (ctx, now2, cam) => { if (window.selectedCharacter === ID) drawWorld(ctx, cam); },
  });
})();
