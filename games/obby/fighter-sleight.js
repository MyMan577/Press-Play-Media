/* Obby Builder: SLEIGHT, the projectile zoner who teleports. Built for Smash.
 *
 * A stage magician who fights from a distance and is never where you left him.
 *  - His cane is a BUSTER: tap S for quick shots (three on screen at once), hold S to charge a big piercing blast.
 *  - TELEPORT PADS: ↓ + S on the ground sets a magic circle on the floor (up to 3). K / 🌀 teleports to one from
 *    anywhere, any time: hold a direction to pick the pad that way; no direction cycles through them. Arriving
 *    gives a puff of cards that knocks back anyone standing on the pad. Each pad works ONCE: it vanishes as you
 *    arrive. Pads are also cleared when the player is reset (restart, Reset Player, a new Smash match or rematch).
 *  - VANISH: G / 👻 turns him invisible for a few seconds. He still blinks into view now and then, and every shot
 *    gives him away for a moment.
 *
 * 8 MOVES (S / ⚔️ + a direction; hold S to charge any of them)
 *  Ground: neutral BUSTER SHOT, side CARD SPREAD (3-way, 5 charged), up BOMB LOB (bounces, then bursts),
 *          down TELEPORT PAD.
 *  Air:    neutral BUSTER SHOT, side HOMING DOVES, up RISING CURTAIN (a short teleport up, recovery),
 *          down CARD RAIN (shots fanned downward while he hangs in the air).
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_sleight';
  const C_TUX = '#1c1a26', C_TUX2 = '#2e2a3d', C_SHIRT = '#f4f1ea', C_VIOLET = '#9b5cff', C_VIOLET2 = '#5a2bb0', C_GOLD = '#ffd166', C_SKIN = '#f1d0b5', C_RED = '#e0344a', C_FX = '#c49bff', C_CYAN = '#7ff0ff';
  const P = { hip: 9.5, torso: 10, neck: -2.5, head: 8.5, ua: 5, fa: 5, th: 4.8, sh: 4.8 };
  const U = 36, pose = FK.pose, { ex, ey, pcx, pcy } = FK;
  const MAX_PADS = 3, MAX_PELLETS = 3, INVIS_T = 3.0, INVIS_CD = 9, TP_CD = 0.45;

  const PO = {
    idle:   pose({ y: 0.4, lean: 0.04, aF: [0.45, 0.35], aB: [0.15, 0.4], lF: [0.25, -0.1], lB: [-0.2, -0.1], cane: 0.25 }),
    jump:   pose({ aF: [2.4, 0.3], aB: [2.0, 0.5], lF: [0.7, -1.2], lB: [0.1, -0.6], cane: 2.6 }),
    fall:   pose({ aF: [1.8, 0.3], aB: [-1.4, 0.3], lF: [0.3, -0.4], lB: [-0.2, -0.3], cane: 1.8 }),
    aim:    pose({ y: 0.8, lean: 0.12, aF: [1.57, 0.0], aB: [-0.5, 0.6], lF: [0.5, -0.2], lB: [-0.45, -0.1], cane: 1.57 }),
    recoil: pose({ y: 1.2, lean: -0.15, aF: [1.75, -0.25], aB: [-0.7, 0.6], lF: [0.55, -0.3], lB: [-0.5, -0.2], cane: 1.8 }),
    charge: pose({ y: 1.6, lean: 0.2, aF: [1.4, 0.4], aB: [1.2, 0.9], lF: [0.7, -0.6], lB: [-0.5, -0.3], cane: 1.5 }),
    lob:    pose({ y: 0.6, lean: -0.15, aF: [2.6, 0.2], aB: [-0.8, 0.5], lF: [0.4, -0.2], lB: [-0.4, -0.2], cane: 2.6 }),
    kneel:  pose({ y: 6, lean: 0.35, aF: [0.35, 0.2], aB: [0.9, 1.3], lF: [1.3, -2.1], lB: [-0.2, -2.4], cane: 0.05, head: 0.3 }),
    doves:  pose({ lean: -0.05, aF: [2.0, 0.3], aB: [-2.0, -0.2], lF: [0.5, -1.0], lB: [-0.2, -0.6], cane: 2.2 }),
    tada:   pose({ y: 0.5, lean: -0.1, aF: [2.3, 0.2], aB: [-2.2, -0.2], lF: [0.3, -0.1], lB: [-0.4, -0.2], cane: 2.3 }),
    rain:   pose({ lean: 0.25, aF: [0.6, 0.2], aB: [-1.4, 0.4], lF: [0.6, -1.1], lB: [-0.2, -0.8], cane: 0.6 }),
  };

  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set() }, o || {}); }
  function cards(S, x, y, n, spread) { for (let i = 0; i < n; i++) { const an = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4 * (spread || 1); S.fx.push({ k: 'card', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 2, rot: Math.random() * 6, t: 0, life: 0.6 + Math.random() * 0.3, suit: i % 4 }); } }
  function smoke(S, x, y, n) { for (let i = 0; i < n; i++) S.fx.push({ k: 'smoke', x: x + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.9, vx: (Math.random() - 0.5) * 1.5, t: 0, life: 0.5 + Math.random() * 0.3 }); }
  function burstAt(S, x, y, R, dmg, kk, o) { for (const e of FK.foes()) { if (Math.hypot(ex(e) - x, ey(e) - y) < R) FK.hit(S, e, dmg, Object.assign({ kx: (Math.sign(ex(e) - x) || 1) * kk, ky: -kk * 0.8, stun: 0.45, c: C_FX }, o || {})); } }
  // where the cane's tip is, in world tiles
  function muzzle(p, f, up) { return [pcx(p) + f * 0.85, pcy(p) - 0.15 + (up || 0)]; }
  // a shot from the cane: size 0 pellet, 1 mid, 2 the full charge
  function shoot(S, p, f, size, vx, vy, o) {
    const m = muzzle(p, f, o && o.dy);
    const dmg = [1, 3, 6][size], spd = [22, 20, 17][size];
    const len = Math.hypot(vx, vy) || 1;
    S.shots.push(Object.assign({ x: m[0], y: m[1], vx: vx / len * spd, vy: vy / len * spd, t: 0, life: size === 2 ? 1.1 : 0.7, f, size, dmg, hits: new Set(), pierce: size === 2 }, o || {}));
    S.reveal = 0.25;   // a shot gives him away for a moment
    S.fx.push({ k: 'muzzle', x: m[0], y: m[1], f, size, t: 0, life: 0.15 });
    if (size === 0) FK.tone(1200, { type: 'square', dur: 0.05, slide: 700, vol: 0.09 });
    else if (size === 1) { FK.tone(700, { type: 'square', dur: 0.1, slide: 300, vol: 0.12 }); FK.noise({ dur: 0.08, cut: 3000, vol: 0.1 }); }
    else { FK.tone(300, { type: 'sawtooth', dur: 0.3, slide: 80, vol: 0.16 }); FK.noise({ dur: 0.25, cut: 1500, cutEnd: 300, vol: 0.2 }); FK.shake(4); }
  }
  const sizeOf = pw => pw >= 0.8 ? 2 : pw >= 0.3 ? 1 : 0;

  // ---------------------------------------------------------------- teleporting
  function tpTo(p, S, pad) {
    const x = pad.x, y = pad.y;
    if (FK.blocked(x - p.w / 2, y - p.h - 0.02, p.w, p.h)) return false;
    S.fx.push({ k: 'slit', x: pcx(p), y: p.y + p.h, t: 0, life: 0.35 });
    smoke(S, pcx(p), pcy(p), 5); cards(S, pcx(p), pcy(p), 4);
    p.x = x - p.w / 2; p.y = y - p.h - 0.01; p.vx = 0; p.vy = 0; S.selfMove = true;
    p.dashInvuln = Math.max(p.dashInvuln || 0, 0.15);
    S.fx.push({ k: 'slit', x, y, t: 0, life: 0.35, arrive: 1 });
    smoke(S, x, y - p.h / 2, 5); cards(S, x, y - p.h / 2, 6);
    burstAt(S, x, y - 0.5, 1.2, 2, 7, { c: C_GOLD });
    pad.flash = 0.4;
    FK.noise({ dur: 0.12, cut: 6000, ftype: 'highpass', vol: 0.12 }); FK.tone(900, { dur: 0.1, slide: 1800, vol: 0.1 });
    return true;
  }
  // K / 🌀: a held direction picks the pad that way; otherwise the next pad in turn
  function pressTeleport() {
    const p = window._gamePlayer, S = H && H.state(); if (!p || !S || window.selectedCharacter !== ID) return;
    if (S.tpCD > 0) return;
    if (!S.pads.length) { FK.msg('🎩 No teleport pads yet: ↓ + S on the ground sets one'); return; }
    const k = FK.keys(); let dx = (k.right ? 1 : 0) - (k.left ? 1 : 0), dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
    let pick = null;
    if (dx || dy) {
      let best = -2;
      for (const pd of S.pads) { const vx = pd.x - pcx(p), vy = (pd.y - 0.5) - pcy(p), d = Math.hypot(vx, vy); if (d < 0.8) continue; const sc = (vx * dx + vy * dy) / (d * Math.hypot(dx, dy)); if (sc > best) { best = sc; pick = pd; } }
    }
    if (!pick) {
      const others = S.pads.filter(pd => Math.hypot(pd.x - pcx(p), pd.y - (p.y + p.h)) > 0.8);
      if (!others.length) return;
      S.tpIdx = (S.tpIdx + 1) % others.length; pick = others[S.tpIdx];
    }
    if (tpTo(p, S, pick)) {
      // a pad works once: it vanishes as you arrive on it
      const i = S.pads.indexOf(pick); if (i >= 0) S.pads.splice(i, 1);
      S.tpIdx = Math.max(-1, S.tpIdx - 1);
      S.fx.push({ k: 'slit', x: pick.x, y: pick.y, t: 0, life: 0.5 });
      S.tpCD = TP_CD; S.seq = null; S.airUp = false; FK.label(S, p, 'TA-DA!', C_GOLD);
    }
  }
  // G / 👻: vanish
  function pressVanish() {
    const p = window._gamePlayer, S = H && H.state(); if (!p || !S || window.selectedCharacter !== ID) return;
    if (S.invisCD > 0) { FK.msg('👻 Vanish recharging (' + S.invisCD.toFixed(1) + 's)'); return; }
    S.invis = INVIS_T; S.invisCD = INVIS_CD; p._invisT = INVIS_T;
    smoke(S, pcx(p), pcy(p), 10); cards(S, pcx(p), pcy(p), 6);
    FK.tone(1600, { dur: 0.3, slide: 400, vol: 0.12 }); FK.noise({ dur: 0.3, cut: 7000, ftype: 'highpass', vol: 0.1 });
    FK.label(S, p, 'NOW YOU DON’T!', C_FX);
  }

  // ---------------------------------------------------------------- the moves
  const SEQ = {
    buster(p, dt, S, q) {
      S.target = q.t < 0.05 ? PO.aim : q.t < 0.14 ? PO.recoil : PO.aim; S.rate = 50;
      if (!q.go) { q.go = 1; const z = sizeOf(q.pw); if (z === 0 && S.shots.filter(s => s.size === 0).length >= MAX_PELLETS) { S.seq = null; return; } shoot(S, p, q.f, z, q.f, 0); if (z === 2) p.vx = -q.f * 4; }
      if (q.t > (sizeOf(q.pw) === 2 ? 0.3 : 0.16)) S.seq = null;
    },
    spread(p, dt, S, q) {
      S.target = q.t < 0.12 ? PO.recoil : PO.aim; S.rate = 50;
      if (!q.go) { q.go = 1; const n = q.pw >= 0.5 ? 5 : 3; for (let i = 0; i < n; i++) { const an = (i - (n - 1) / 2) * 0.22; shoot(S, p, q.f, 1, q.f * Math.cos(an), Math.sin(an), { card: 1, suit: i % 4, life: 0.45, dmg: 2 }); } }
      if (q.t > 0.28) S.seq = null;
    },
    lob(p, dt, S, q) {
      if (q.t < 0.08 && p.vy < 0) p.vy = 1;
      S.target = PO.lob; S.rate = 45;
      if (!q.go && q.t > 0.06) { q.go = 1; const m = muzzle(p, q.f, -0.4); S.bombs.push({ x: m[0], y: m[1], vx: q.f * (6 + 3 * q.pw), vy: -12, t: 0, bounced: false, pw: q.pw, f: q.f }); FK.tone(500, { dur: 0.12, slide: 900, vol: 0.1 }); S.reveal = 0.25; }
      if (q.t > 0.32) S.seq = null;
    },
    pad(p, dt, S, q) {
      S.target = PO.kneel; S.rate = 40; p.vx = 0;
      if (!q.go && q.t > 0.12) {
        q.go = 1;
        for (let i = S.pads.length - 1; i >= 0; i--) if (Math.abs(S.pads[i].x - pcx(p)) < 1 && Math.abs(S.pads[i].y - (p.y + p.h)) < 0.6) S.pads.splice(i, 1);
        if (S.pads.length >= MAX_PADS) S.pads.shift();
        S.pads.push({ x: pcx(p), y: p.y + p.h, t: 0, n: ++S.padNo, flash: 0.5 });
        cards(S, pcx(p), p.y + p.h - 0.2, 6); FK.tone(660, { dur: 0.12, vol: 0.1 }); FK.tone(990, { dur: 0.18, vol: 0.08, delay: 0.06 });
        FK.label(S, p, 'PAD ' + S.pads.length + '/' + MAX_PADS, C_CYAN);
      }
      if (q.t > 0.35) S.seq = null;
    },
    doves(p, dt, S, q) {
      S.target = PO.doves; S.rate = 40; p.vy = Math.min(p.vy, 1);
      if (!q.go) { q.go = 1; const n = q.pw >= 0.5 ? 3 : 2; for (let i = 0; i < n; i++) S.doves.push({ x: pcx(p) + q.f * 0.5, y: pcy(p) - 0.4 + i * 0.4, vx: q.f * 7, vy: -2 - i * 1.5, t: 0, life: 2.2, ph: Math.random() * 6 }); FK.tone(1100, { dur: 0.15, vol: 0.09 }); S.reveal = 0.25; }
      if (q.t > 0.3) S.seq = null;
    },
    curtain(p, dt, S, q) {
      if (!q.go) {
        q.go = 1;
        const tx = pcx(p), ty = p.y + p.h - (4 + 1.2 * q.pw);
        if (!FK.blocked(tx - p.w / 2, ty - p.h, p.w, p.h)) tpTo(p, S, { x: tx, y: ty });
        p.vy = -4;
      }
      S.target = PO.tada; S.rate = 40;
      if (q.t > 0.25) S.seq = null;
    },
    rain(p, dt, S, q) {
      S.target = PO.rain; S.rate = 45;
      p.vy = Math.min(p.vy, 0.6); p.vx *= 0.9;
      const n = q.pw >= 0.5 ? 6 : 4, gap = 0.07;
      const i = Math.floor(q.t / gap);
      if (i < n && i !== q.last) { q.last = i; const an = 0.35 + (i % 3) * 0.35; shoot(S, p, q.f, 0, q.f * Math.sin(an), Math.cos(an), { dy: 0.3, card: 1, suit: i % 4, dmg: 1, life: 0.5 }); }
      if (q.t > n * gap + 0.15) S.seq = null;
    },
  };

  const MOVES = {
    ground: { neutral: { name: 'Buster Shot', cd: 0.12 }, side: { name: 'Card Spread', big: 'ROYAL SPREAD', cd: 0.4 }, up: { name: 'Bomb Lob', cd: 0.45 }, down: { name: 'Teleport Pad', cd: 0.35 } },
    air:    { neutral: { name: 'Buster Shot', cd: 0.12 }, side: { name: 'Homing Doves', cd: 0.7 }, up: { name: 'Rising Curtain', cd: 0.3 }, down: { name: 'Card Rain', cd: 0.5 } },
  };
  const FD = { windup: 0.02, active: 0.04, endlag: 0.03, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  function stepThings(p, dt, S) {
    const enemies = FK.foes();
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const c = S.shots[i]; c.t += dt;
      const n = 2; let dead = false;
      for (let k = 0; k < n && !dead; k++) {
        c.x += c.vx * dt / n; c.y += c.vy * dt / n;
        if (FK.blocked(c.x - 0.1, c.y - 0.1, 0.2, 0.2)) { dead = true; S.fx.push({ k: 'ring', x: c.x, y: c.y, R: 0.4, c: C_CYAN, t: 0, life: 0.2 }); break; }
        const r = [0.2, 0.35, 0.6][c.size];
        for (const e of enemies) {
          if (c.hits.has(e)) continue;
          if (Math.abs(ex(e) - c.x) < r + (e.w || 0.9) / 2 && Math.abs(ey(e) - c.y) < r + (e.h || 0.9) / 2) {
            c.hits.add(e);
            const big = c.size === 2, dir = Math.sign(c.vx) || c.f;
            FK.hit(S, e, c.dmg, { kx: dir * [3, 7, 13][c.size], ky: [-1.5, -4, -8][c.size], stun: [0.15, 0.35, 0.6][c.size], c: big ? C_GOLD : C_CYAN, big, stop: big ? 0.1 : 0 });
            if (!c.pierce) { dead = true; break; }
          }
        }
      }
      if (dead || c.t > c.life) S.shots.splice(i, 1);
    }
    for (let i = S.bombs.length - 1; i >= 0; i--) {
      const b = S.bombs[i]; b.t += dt; b.vy += 28 * dt;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      let boom = b.t > 1.6 || enemies.some(e => Math.abs(ex(e) - b.x) < 0.6 && Math.abs(ey(e) - b.y) < 0.7);
      if (FK.blocked(nx - 0.15, ny - 0.15, 0.3, 0.3)) {
        if (!b.bounced && b.vy > 0) { b.bounced = true; b.vy = -8; b.vx *= 0.7; FK.tone(400, { dur: 0.05, vol: 0.08 }); } else boom = true;
      } else { b.x = nx; b.y = ny; }
      if (boom) {
        const R = 1.6 + 0.6 * b.pw;
        burstAt(S, b.x, b.y, R, 4 + 2 * b.pw, 9, { big: true, ky: -12, c: C_RED });
        S.fx.push({ k: 'boom', x: b.x, y: b.y, t: 0, life: 0.45 }); cards(S, b.x, b.y, 8); FK.thud(false);
        S.bombs.splice(i, 1);
      }
    }
    for (let i = S.doves.length - 1; i >= 0; i--) {
      const d = S.doves[i]; d.t += dt;
      let tgt = null, bd = 12; for (const e of enemies) { const dd = Math.hypot(ex(e) - d.x, ey(e) - d.y); if (dd < bd) { bd = dd; tgt = e; } }
      if (tgt && d.t > 0.25) { const dx = ex(tgt) - d.x, dy = ey(tgt) - d.y, l = Math.hypot(dx, dy) || 1; d.vx += dx / l * 26 * dt; d.vy += dy / l * 26 * dt; const sp = Math.hypot(d.vx, d.vy); if (sp > 9) { d.vx *= 9 / sp; d.vy *= 9 / sp; } }
      d.x += d.vx * dt; d.y += d.vy * dt;
      const hitE = enemies.find(e => Math.abs(ex(e) - d.x) < 0.55 && Math.abs(ey(e) - d.y) < 0.6);
      if (hitE) { FK.hit(S, hitE, 2, { kx: Math.sign(d.vx || 1) * 6, ky: -5, stun: 0.4, c: '#ffffff' }); S.fx.push({ k: 'feathers', x: d.x, y: d.y, t: 0, life: 0.5 }); S.doves.splice(i, 1); continue; }
      if (d.t > d.life || FK.blocked(d.x - 0.1, d.y - 0.1, 0.2, 0.2)) { S.fx.push({ k: 'feathers', x: d.x, y: d.y, t: 0, life: 0.5 }); S.doves.splice(i, 1); }
    }
    for (const pd of S.pads) { pd.t += dt; if (pd.flash > 0) pd.flash -= dt; }
  }

  // ---------------------------------------------------------------- touch buttons: 🌀 teleport, 👻 vanish
  let btnT = null, btnV = null;
  function mkBtn(id, icon, label, fn, top) {
    const b = document.createElement('button'); b.id = id; b.innerHTML = icon + '<small>' + label + '</small>';
    b.style.cssText = 'position:absolute;right:16px;top:' + top + 'px;z-index:100;width:54px;height:54px;border-radius:50%;display:none;flex-direction:column;align-items:center;justify-content:center;font-size:20px;line-height:1;color:#fff;border:2px solid ' + C_FX + ';background:radial-gradient(circle,#2a1f45 55%,#5a2bb0);padding:0;touch-action:none;';
    b.querySelector('small').style.cssText = 'font-size:8px;font-weight:800;margin-top:2px;letter-spacing:.04em';
    const go = ev => { ev.preventDefault(); ev.stopPropagation(); fn(); };
    b.addEventListener('touchstart', go, { passive: false }); b.addEventListener('mousedown', go);
    document.body.appendChild(b); return b;
  }
  function syncBtns(S) {
    if (!btnT) { btnT = mkBtn('slTpBtn', '🌀', 'WARP', pressTeleport, 136); btnV = mkBtn('slInvBtn', '👻', 'VANISH', pressVanish, 198); }
    const on = window.selectedCharacter === ID && (!window._gameMode || window._gameMode() === 'play');
    const dT = on ? 'flex' : 'none';
    if (btnT.style.display !== dT) { btnT.style.display = dT; btnV.style.display = dT; }
    if (!on || !S) return;
    const ready = S.invisCD <= 0, op = ready ? '1' : '0.5', op2 = S.pads.length ? '1' : '0.5';
    if (btnV.style.opacity !== op) btnV.style.opacity = op;
    if (btnT.style.opacity !== op2) btnT.style.opacity = op2;
  }
  window.addEventListener('keydown', e => {
    if (e.repeat || !e.key || window.selectedCharacter !== ID) return;
    const k = e.key.toLowerCase();
    if (k === 'k') pressTeleport(); else if (k === 'g') pressVanish();
  });
  // restarting (Reset Player, R, a new Smash match or rematch) clears every pad
  (window._onPlayerReset = window._onPlayerReset || []).push(() => {
    try { const S = H && H.state(); if (S && S.pads) { S.pads.length = 0; S.tpIdx = -1; } } catch (e) {}
  });
  (window._rafHubTickers = window._rafHubTickers || []).push(() => { try { syncBtns(H && !window._fighterPass ? H.state() : null); } catch (e) {} });

  const H = FK.define({
    id: ID, plug: 'sleight',
    def: { name: 'Sleight', icon: '🎩', tier: 'gold', color: C_FX, color2: C_GOLD,
      ability: 'Zoner: a chargeable cane buster, one-use teleport pads you warp to at will (K / 🌀), and Vanish (G / 👻)',
      desc: 'A stage magician who fights from afar. Tap S for quick cane shots, hold S for a big piercing blast. ↓ + S sets a teleport pad on the floor (up to 3): K / 🌀 warps to one from anywhere (hold a direction to pick it). Each pad works once, then vanishes. G / 👻 turns him invisible for a few seconds, blinking into view now and then. Card Spread, Bomb Lob, Homing Doves, Rising Curtain and Card Rain round him out.' },
    stats: { speed: 1.1, jump: 1.15, maxJumps: 2, maxDashes: 1, hp: 3 },
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, airUp: false, shots: [], bombs: [], doves: [], pads: [], padNo: 0, tpIdx: -1, tpCD: 0, invis: 0, invisCD: 0, reveal: 0 }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Rising Curtain comes back when you land (or warp to a pad)'; return null; },
    act: {
      ground_neutral: (p, f, pw, S) => { startSeq(S, 'buster', { f, pw }); return ['BUSTER', 'CHARGED SHOT', 'GRAND FINALE'][sizeOf(pw)]; },
      ground_side: (p, f, pw, S) => startSeq(S, 'spread', { f, pw }),
      ground_up: (p, f, pw, S) => startSeq(S, 'lob', { f, pw }),
      ground_down: (p, f, pw, S) => startSeq(S, 'pad', { f, pw }),
      air_neutral: (p, f, pw, S) => { startSeq(S, 'buster', { f, pw }); return ['BUSTER', 'CHARGED SHOT', 'GRAND FINALE'][sizeOf(pw)]; },
      air_side: (p, f, pw, S) => startSeq(S, 'doves', { f, pw }),
      air_up: (p, f, pw, S) => { S.airUp = true; startSeq(S, 'curtain', { f, pw }); },
      air_down: (p, f, pw, S) => startSeq(S, 'rain', { f, pw }),
    },
    keys: { k: () => pressTeleport(), g: () => pressVanish() },
    onTeleport(p, S) { S.seq = null; },
    step(p, dt, S) {
      if (p.hitstun > 0 && S.seq) S.seq = null;
      S.rate = 18;
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      stepThings(p, dt, S);
      if (p.onGround) S.airUp = false;
      if (S.tpCD > 0) S.tpCD -= dt;
      if (S.invisCD > 0) S.invisCD -= dt;
      if (S.reveal > 0) S.reveal -= dt;
      if (S.invis > 0) { S.invis -= dt; p._invisT = S.invis; if (S.invis <= 0) { p._invisT = 0; smoke(S, pcx(p), pcy(p), 6); FK.label(S, p, 'REVEALED', C_FX); } }
      // charging the buster: the cane glows while S is held
      const ch = window.PPStrike && window.PPStrike.phase && window.PPStrike.phase() === 'charge' ? window.PPStrike.chargePower() : 0;
      S.charge = ch;
      if (!S.seq) {
        if (ch > 0) { S.target = PO.charge; S.rate = 30; if (Math.random() < dt * (10 + 30 * ch)) S.fx.push({ k: 'mote', x: pcx(p) + FK.face(p) * 0.85 + Math.cos(Math.random() * 6) * 0.9, y: pcy(p) - 0.15 + Math.sin(Math.random() * 6) * 0.9, tx: pcx(p) + FK.face(p) * 0.85, ty: pcy(p) - 0.15, t: 0, life: 0.3 }); }
        else if (p.onGround && Math.abs(p.vx || 0) > 0.8) {
          S.run += dt * Math.abs(p.vx) * 1.8; const r = S.run, sw = Math.sin(r);
          S.target = pose({ y: 0.2 - Math.abs(Math.cos(r)) * 0.7, lean: 0.18, aF: [0.5 + sw * 0.5, 0.6], aB: [0.2 - sw * 0.8, 0.5], lF: [0.15 + sw * 0.8, -0.3 - Math.max(0, Math.cos(r)) * 1.2], lB: [0.15 - sw * 0.8, -0.3 - Math.max(0, -Math.cos(r)) * 1.2], cane: 0.6 + sw * 0.4 });
        } else if (p.onGround) { const tt = performance.now() / 1000; S.target = pose(Object.assign({}, PO.idle, { y: PO.idle.y + 0.3 * Math.sin(tt * 2.2), cane: 0.25 + 0.15 * Math.sin(tt * 2.2) })); }
        else S.target = (p.vy || 0) < 0 ? PO.jump : PO.fall;
      }
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    drawBody(ctx, px, py, pw, ph, t, S) {
      if (S && S.invis > 0) {
        // invisible, but he blinks into view now and then (and when he shoots)
        const blink = (t * 1.6) % 1 < 0.12 || S.reveal > 0;
        ctx.globalAlpha = blink ? 0.6 : 0.06;
      }
      drawMagician(ctx, px, py, pw, ph, t, S ? S.pose : PO.idle, 1);
      if (S && S.charge > 0) {
        const hd = FK.skel(P, S.pose, px + pw / 2, py + ph, ph / U).aF[2], ca = S.pose.cane || 0, cl = 13 * ph / U;
        const tx = hd[0] + Math.sin(ca) * cl * 0.75, ty = hd[1] + Math.cos(ca) * cl * 0.75, full = S.charge >= 0.8;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8;
        ctx.fillStyle = full ? (Math.floor(t * 20) % 2 ? C_GOLD : '#ffffff') : C_CYAN;
        ctx.beginPath(); ctx.arc(tx, ty, (1.5 + 3 * S.charge) * ph / U, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    drawWorld(ctx, V, S) {
      const T = V.T, p = V.p;
      // teleport pads: a turning magic circle on the floor with its number
      S.pads.forEach((pd, i) => {
        const x = V.SX(pd.x), y = V.SY(pd.y) - 2, R = T * 0.7, fl = pd.flash > 0 ? 1 : 0;
        ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.28, 0, 0, Math.PI * 2); FK.glow(ctx, C_CYAN, 0.55 + 0.4 * fl); ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y, R * 0.65, R * 0.18, 0, 0, Math.PI * 2); FK.glow(ctx, C_FX, 0.5); ctx.lineWidth = 1.5; ctx.stroke();
        for (let k = 0; k < 6; k++) { const an = V.now * 1.8 + k * Math.PI / 3; FK.star(ctx, x + Math.cos(an) * R * 0.85, y + Math.sin(an) * R * 0.24, T * 0.08, an, k % 2 ? C_GOLD : C_CYAN, 0.8); }
        const g = ctx.createLinearGradient(0, y, 0, y - T * 1.2); g.addColorStop(0, 'rgba(127,240,255,' + (0.25 + 0.4 * fl) + ')'); g.addColorStop(1, 'rgba(127,240,255,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(x - R * 0.6, y - T * 1.2, R * 1.2, T * 1.2);
        FK.solid(ctx, '#ffffff', 0.85); ctx.font = '900 ' + Math.round(T * 0.3) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y - T * 0.45);
      });
      for (const c of S.shots) {
        const x = V.SX(c.x), y = V.SY(c.y), d = Math.sign(c.vx) || c.f, ang = Math.atan2(c.vy, c.vx);
        if (c.card) { drawCard(ctx, x, y, T * 0.34, ang + Math.PI / 2, c.suit || 0, 1, 1); continue; }
        const r = T * [0.13, 0.24, 0.45][c.size];
        const pts = []; for (let i = 0; i <= 6; i++) pts.push([x - Math.cos(ang) * i * r * 0.9, y - Math.sin(ang) * i * r * 0.9]);
        FK.taper(ctx, pts, r, c.size === 2 ? C_GOLD : C_CYAN, 0.7, false);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); FK.glow(ctx, c.size === 2 ? C_GOLD : C_CYAN, 0.95); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); FK.glow(ctx, '#ffffff', 1); ctx.fill();
        if (c.size === 2) for (let k = 0; k < 4; k++) FK.star(ctx, x + Math.cos(V.now * 12 + k * 1.57) * r * 1.2, y + Math.sin(V.now * 12 + k * 1.57) * r * 1.2, r * 0.35, V.now * 8, '#ffffff', 0.8);
      }
      for (const b of S.bombs) {
        const x = V.SX(b.x), y = V.SY(b.y);
        drawCard(ctx, x, y, T * 0.45, b.t * 9, 1, 1, 1);
        ctx.beginPath(); ctx.arc(x, y, T * (0.32 + 0.06 * Math.sin(b.t * 30)), 0, Math.PI * 2); FK.glow(ctx, C_RED, 0.55); ctx.lineWidth = 2; ctx.stroke();
      }
      for (const d of S.doves) {
        const x = V.SX(d.x), y = V.SY(d.y), fl = Math.sin(d.t * 26 + d.ph), dir = Math.sign(d.vx) || 1;
        const pts = []; for (let i = 0; i <= 5; i++) pts.push([x - d.vx / 9 * i * T * 0.18, y - d.vy / 9 * i * T * 0.18]); FK.taper(ctx, pts, T * 0.08, '#ffffff', 0.45, false);
        FK.solid(ctx, '#ffffff'); ctx.beginPath(); ctx.ellipse(x, y, T * 0.18, T * 0.11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - dir * T * 0.05, y); ctx.lineTo(x - dir * T * 0.22, y - T * 0.24 * fl); ctx.lineTo(x + dir * T * 0.08, y); ctx.closePath(); ctx.fill();
        FK.solid(ctx, C_GOLD); ctx.beginPath(); ctx.moveTo(x + dir * T * 0.17, y - T * 0.02); ctx.lineTo(x + dir * T * 0.26, y); ctx.lineTo(x + dir * T * 0.17, y + T * 0.03); ctx.fill();
      }
      if (S.invis > 0) { const x = V.SX(pcx(p)), y = V.SY(pcy(p)); ctx.beginPath(); ctx.arc(x, y, T * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (S.invis / INVIS_T)); FK.glow(ctx, C_FX, 0.18); ctx.lineWidth = 1.5; ctx.stroke(); }
    },
    drawFx(ctx, V, f, u, a) {
      const T = V.T;
      if (f.k === 'card') { drawCard(ctx, V.SX(f.x + f.vx * f.t), V.SY(f.y + f.vy * f.t + 4 * f.t * f.t), T * 0.25, f.rot + f.t * 12, f.suit, Math.cos(f.rot + f.t * 15), a); return true; }
      if (f.k === 'smoke') { const x = V.SX(f.x + f.vx * f.t), y = V.SY(f.y) - u * T * 0.6, r = T * (0.2 + u * 0.4); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(200,180,230,' + (0.6 * a) + ')'); g.addColorStop(1, 'rgba(120,90,170,0)'); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); return true; }
      if (f.k === 'slit') {
        const x = V.SX(f.x), y = V.SY(f.y), Hh = T * 1.6, w = T * 0.45 * Math.sin(u * Math.PI);
        ctx.beginPath(); ctx.ellipse(x, y - Hh / 2, w, Hh / 2 * (0.6 + 0.4 * Math.sin(u * Math.PI)), 0, 0, Math.PI * 2); FK.glow(ctx, f.arrive ? C_GOLD : C_FX, 0.85 * a); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y - Hh / 2, w * 0.35, Hh / 2 * 0.9, 0, 0, Math.PI * 2); FK.glow(ctx, '#ffffff', a); ctx.fill();
        if (f.arrive) for (let i = 0; i < 5; i++) FK.star(ctx, x + Math.cos(i * 1.26 + u * 3) * T * (0.4 + u), y - Hh / 2 + Math.sin(i * 1.26 + u * 3) * T * (0.5 + u), T * 0.16, u * 4, C_GOLD, a);
        return true;
      }
      if (f.k === 'muzzle') { const x = V.SX(f.x), y = V.SY(f.y); FK.star(ctx, x, y, T * [0.35, 0.55, 0.9][f.size] * (1 + u), u * 2, f.size === 2 ? C_GOLD : C_CYAN, a, 4); return true; }
      if (f.k === 'mote') { const x = V.SX(f.x + (f.tx - f.x) * u), y = V.SY(f.y + (f.ty - f.y) * u); ctx.beginPath(); ctx.arc(x, y, T * 0.05, 0, Math.PI * 2); FK.glow(ctx, C_CYAN, a); ctx.fill(); return true; }
      if (f.k === 'feathers') { for (let i = 0; i < 5; i++) { const an = i * 1.25; FK.solid(ctx, '#ffffff', a); ctx.beginPath(); ctx.ellipse(V.SX(f.x) + Math.cos(an) * T * 0.5 * u, V.SY(f.y) + Math.sin(an) * T * 0.3 * u + u * T * 0.4, T * 0.08, T * 0.03, an + u * 3, 0, Math.PI * 2); ctx.fill(); } return true; }
      if (f.k === 'boom') { const x = V.SX(f.x), y = V.SY(f.y), R = T * (0.5 + u * 1.8); FK.star(ctx, x, y, R, u, C_GOLD, a, 6); ctx.beginPath(); ctx.arc(x, y, R * 0.7, 0, Math.PI * 2); FK.glow(ctx, C_RED, a); ctx.lineWidth = 4; ctx.stroke(); return true; }
      return false;
    },
    // Smash CPU: keep away and shoot; set pads, warp out when you get close, vanish now and then
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      if (I.lvl >= 2 && (S.invisCD || 0) <= 0 && I.adx < 5 && Math.random() < 0.08) return { type: 'key', key: 'g' };
      if ((S.pads || []).length && (S.tpCD || 0) <= 0 && I.adx < 1.8 && Math.abs(I.dy) < 1.5 && Math.random() < 0.45) return { type: 'key', key: 'k' };
      if (I.air) {
        if (I.dy < -0.5 && !S.airUp && I.adx < 4 && Math.random() < 0.3) return { type: 'tap', v: 'up' };
        if (I.dy > 1 && I.adx < 3) return { type: 'tap', v: 'down' };
        if (I.adx > 3 && Math.random() < 0.25) return { type: 'tap', v: 'side' };
        if (Math.abs(I.dy) < 1.2) return { type: 'tap', v: '' };
        return null;
      }
      if ((S.pads || []).length < 2 && I.adx > 4 && Math.random() < 0.3) return { type: 'tap', v: 'down' };
      if (I.dy < -1.5 && I.adx < 4) return { type: 'tap', v: 'up' };
      if (I.adx > 2.5 && Math.abs(I.dy) < 1.2) return I.killy || Math.random() < 0.25 ? { type: 'charge', v: '', hold: 0.75 + Math.random() * 0.3 } : Math.random() < 0.6 ? { type: 'tap', v: '' } : { type: 'tap', v: 'side' };
      if (I.adx <= 2.5 && Math.abs(I.dy) < 1.2) return { type: 'tap', v: 'side' };
      return null;
    },
  });

  function drawCard(ctx, x, y, s, rot, suit, flip, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(Math.max(0.15, Math.abs(flip == null ? 1 : flip)), 1);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-s * 0.36, -s * 0.5, s * 0.72, s, s * 0.08); ctx.fill();
    ctx.strokeStyle = C_VIOLET2; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = suit % 2 ? C_RED : C_TUX; ctx.font = (s * 0.55 | 0) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(['♠', '♥', '♣', '♦'][suit % 4], 0, s * 0.03);
    ctx.restore();
  }
  // the magician: a big round face with a monocle and a curled moustache, a tall top hat, a chunky tux,
  // a violet-lined cape, white gloves and a cane
  function drawMagician(ctx, px, py, pw, ph, t, q) {
    const s = ph / U, cx = px + pw / 2, fy = py + ph, K = FK.skel(P, q, cx, fy, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(196,155,255,0.45)';
    const nk = K.neck, wave = Math.sin(t * 5) * s;
    ctx.fillStyle = C_VIOLET2; ctx.beginPath(); ctx.moveTo(nk[0] - 3 * s, nk[1] + 1 * s); ctx.quadraticCurveTo(nk[0] - 12 * s, nk[1] + 8 * s + wave, nk[0] - 10 * s, nk[1] + 16 * s); ctx.lineTo(nk[0] + 1 * s, nk[1] + 12 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C_TUX; ctx.beginPath(); ctx.moveTo(nk[0] - 2 * s, nk[1] + 1 * s); ctx.quadraticCurveTo(nk[0] - 10.5 * s, nk[1] + 8 * s + wave, nk[0] - 8.5 * s, nk[1] + 15 * s); ctx.lineTo(nk[0] - 2 * s, nk[1] + 12 * s); ctx.closePath(); ctx.fill();
    FK.limb(ctx, K.lB, 4.4 * s, '#121019', 4 * s);
    ctx.fillStyle = '#0b0a10'; ctx.beginPath(); ctx.ellipse(K.lB[2][0] + 1 * s, K.lB[2][1] - 0.4 * s, 2.8 * s, 1.6 * s, 0, 0, Math.PI * 2); ctx.fill();
    FK.limb(ctx, K.aB, 4 * s, C_TUX2, 3.6 * s);
    FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 2.5 * s, '#e8e4ec');
    // body: a chunky tailcoat over a white shirt front, red bow tie, gold buttons
    ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
    const L = P.torso * s, W = 14 * s;
    FK.blob(ctx, W, L, C_TUX2, C_TUX, 6 * s);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C_TUX; ctx.beginPath(); ctx.moveTo(-W / 2, 0); ctx.lineTo(-W / 2 - 2.5 * s, 4.5 * s); ctx.lineTo(-W * 0.15, 1.5 * s); ctx.closePath(); ctx.fill();   // coat tail
    ctx.fillStyle = C_SHIRT; ctx.beginPath(); ctx.moveTo(-W * 0.05, -L); ctx.lineTo(W * 0.4, -L); ctx.lineTo(W * 0.32, -L * 0.1); ctx.lineTo(W * 0.08, -L * 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C_RED; ctx.beginPath(); ctx.moveTo(W * 0.18, -L * 0.88); ctx.lineTo(W * 0.42, -L * 0.98); ctx.lineTo(W * 0.42, -L * 0.76); ctx.closePath(); ctx.moveTo(W * 0.18, -L * 0.88); ctx.lineTo(-W * 0.06, -L * 0.98); ctx.lineTo(-W * 0.06, -L * 0.76); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C_GOLD; for (const yy of [0.55, 0.32]) { ctx.beginPath(); ctx.arc(W * 0.2, -L * yy, 0.6 * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    FK.limb(ctx, K.lF, 4.6 * s, '#1a1824', 4.2 * s);
    ctx.fillStyle = '#0b0a10'; ctx.beginPath(); ctx.ellipse(K.lF[2][0] + 1.2 * s, K.lF[2][1] - 0.4 * s, 3 * s, 1.7 * s, 0, 0, Math.PI * 2); ctx.fill();
    // head
    ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
    const hr = K.hr;
    ctx.fillStyle = '#2a2236'; ctx.beginPath(); ctx.arc(-hr * 0.12, hr * 0.02, hr, 0, Math.PI * 2); ctx.fill();          // hair at the back
    ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.arc(hr * 0.06, hr * 0.06, hr * 0.92, 0, Math.PI * 2); ctx.fill();
    FK.eyes(ctx, hr * 0.02, hr * 0.02, hr * 0.19, hr * 0.48, { pupil: '#3b1c6b' });
    ctx.strokeStyle = C_GOLD; ctx.lineWidth = 0.7 * s; ctx.beginPath(); ctx.arc(hr * 0.5, hr * 0.02, hr * 0.27, 0, Math.PI * 2); ctx.stroke();       // monocle
    ctx.beginPath(); ctx.moveTo(hr * 0.5, hr * 0.29); ctx.quadraticCurveTo(hr * 0.42, hr * 0.7, hr * 0.15, hr * 0.85); ctx.stroke();
    ctx.strokeStyle = '#2a2236'; ctx.lineWidth = 1.2 * s;                                                                       // a curled moustache
    ctx.beginPath(); ctx.moveTo(hr * 0.3, hr * 0.48); ctx.quadraticCurveTo(hr * 0.1, hr * 0.6, hr * 0.0, hr * 0.42); ctx.moveTo(hr * 0.3, hr * 0.48); ctx.quadraticCurveTo(hr * 0.55, hr * 0.62, hr * 0.68, hr * 0.42); ctx.stroke();
    // the top hat, tall and tilted
    ctx.save(); ctx.rotate(-0.12);
    ctx.fillStyle = C_TUX; ctx.beginPath(); ctx.roundRect(-hr * 1.05, -hr * 0.92, hr * 2.1, hr * 0.26, hr * 0.12); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-hr * 0.66, -hr * 2.15, hr * 1.32, hr * 1.3, hr * 0.12); ctx.fill();
    ctx.fillStyle = C_VIOLET; ctx.fillRect(-hr * 0.66, -hr * 1.12, hr * 1.32, hr * 0.24);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(hr * 0.25, -hr * 2.05, hr * 0.18, hr * 0.9);
    ctx.restore();
    ctx.restore();
    // front arm: a white glove on the cane
    FK.limb(ctx, K.aF, 4.2 * s, C_TUX2, 3.8 * s);
    const hd = K.aF[2], ca = q.cane || 0, cl = 13 * s, dx = Math.sin(ca), dy = Math.cos(ca);
    ctx.strokeStyle = '#120f18'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(hd[0] - dx * cl * 0.2, hd[1] - dy * cl * 0.2); ctx.lineTo(hd[0] + dx * cl * 0.75, hd[1] + dy * cl * 0.75); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hd[0] + dx * cl * 0.75, hd[1] + dy * cl * 0.75, 1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C_GOLD; ctx.beginPath(); ctx.arc(hd[0] - dx * cl * 0.22, hd[1] - dy * cl * 0.22, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    FK.mitt(ctx, hd[0], hd[1], 2.8 * s, '#ffffff', '#cfc8dc');
  }
})();
