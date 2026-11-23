/* Press Play Playground: the fourth app mode, bought in the Points shop (Games > Points > Shop > For Press Play).
   While it is on: everything is unlocked, the Disc Clicker stays out, every game exclusive is free, and this file adds
   the Playground itself (a hub with a daily wheel, orders, charms and links into the EQ and backgrounds).
   Other Playground scripts add tabs with PPPlayground.registerTab(). */
(function(){
  'use strict';
  var KEY = 'ppPlaygroundV1', MODE = 'ppPlaygroundMode';
  var COL = ['#6ee7d0', '#8b5cff', '#ff5fd8', '#ffb36e'];

  function on(){ try { return localStorage.getItem(MODE) === '1'; } catch(e){ return false; } }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function dayKey(){ var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function toast(m){ try { if (typeof showToast === 'function') showToast(m); } catch(e){} }
  function fmt(n){
    try { if (window.PPClicker && window.PPClicker.fmt) return window.PPClicker.fmt(n); } catch(e){}
    return Math.round(n).toLocaleString();
  }
  function pick(a){ return a[Math.floor(Math.random() * a.length)]; }

  /* ------------------------------------------------------------------ saved state */
  function fresh(){
    return { v:1, stars:0, total:0, spins:0, lastSpin:'', slots:3, tickets:0, trials:{},
      charms:{ own:{}, eq:[], lv:{} }, orders:{ list:[], streak:0, done:0, seq:0 },
      wheel:{ view:'daily', meter:0, golden:0, streak:0, lastDay:'', hist:[] }, drip:{ day:'', got:{} },
      stats:{}, opts:{ fab:true, sfx:true }, storm:{ until:0, mult:2 }, gameStarMs:0, spent:0, shield:{ order:0, wheel:0 } };
  }
  function load(){
    var o = null, f = fresh();
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){}
    if (!o || typeof o !== 'object') return f;
    Object.keys(f).forEach(function(k){ if (!(k in o)) o[k] = f[k]; });
    ['charms', 'orders', 'opts', 'storm', 'wheel', 'drip', 'shield'].forEach(function(k){
      if (!o[k] || typeof o[k] !== 'object') o[k] = f[k];
      Object.keys(f[k]).forEach(function(j){ if (!(j in o[k])) o[k][j] = f[k][j]; });
    });
    if (!o.stats || typeof o.stats !== 'object') o.stats = {};
    return o;
  }
  var S = load(), saveT = null;
  function save(now){
    if (now){ clearTimeout(saveT); saveT = null; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} return; }
    if (saveT) return;
    saveT = setTimeout(function(){ saveT = null; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} }, 400);
  }
  window.addEventListener('pagehide', function(){ save(true); });

  /* ------------------------------------------------------------------ the module API */
  var multFns = [], tabs = [], PP = window.PPPlayground = {
    S: S, on: on, save: save, esc: esc, fmt: fmt, toast: toast, pick: pick, dayKey: dayKey, COL: COL
  };
  PP.addMult = function(fn){ multFns.push(fn); };
  PP.registerTab = function(def){ tabs = tabs.filter(function(t){ return t.id !== def.id; }); tabs.push(def); tabs.sort(function(a, b){ return (a.order || 50) - (b.order || 50); }); if (hubOpen()) renderTabs(); };
  PP.stat = function(kind, n){
    if (!on()) return;
    S.stats[kind] = (S.stats[kind] || 0) + (n == null ? 1 : n);
    save();
  };
  PP.get = function(kind){ return S.stats[kind] || 0; };
  PP.addStars = function(n, why, quiet){
    n = Math.round(n); if (!(n > 0)) return 0;
    S.stars += n; S.total += n; save();
    if (!quiet) toast('+' + n + ' ⭐ ' + (why || ''));
    refreshBalance(); checkAch();
    return n;
  };
  PP.spendStars = function(n){ n = Math.round(n); if (!(n >= 0) || S.stars < n) return false; S.stars -= n; S.spent = (S.spent || 0) + n; save(); refreshBalance(); checkAch(); return true; };
  PP.addGrooves = function(n){ try { if (window.PPClicker && n > 0){ window.PPClicker.add(n); return true; } } catch(e){} return false; };
  PP.ps = function(){ try { return window.PPClicker ? window.PPClicker.ps() : 0; } catch(e){ return 0; } };

  /* multipliers: charms, the Groove Storm, the album and the mode's own bonus */
  function stormActive(){ return S.storm.until > Date.now(); }
  PP.stormActive = stormActive;
  PP.mult = function(kind){
    if (!on()) return 1;
    var m = 1;
    activeIds().forEach(function(id){ var c = charmById(id); if (c && c.fx && c.fx[kind]) m *= lvFx(c.fx[kind], charmLv(id)); });
    if (stormActive() && (kind === 'click' || kind === 'ps')) m *= S.storm.mult;
    if (kind === 'xp') m *= 1.25;   // the mode's own bonus: 25% more EXP
    multFns.forEach(function(fn){ try { m *= (fn(kind) || 1); } catch(e){} });
    return m;
  };

  // charms in effect: the equipped ones plus any on a timed trial
  function activeIds(){
    var ids = S.charms.eq.slice(), now = Date.now();
    Object.keys(S.trials).forEach(function(id){
      if (S.trials[id] > now){ if (ids.indexOf(id) < 0) ids.push(id); } else delete S.trials[id];
    });
    return ids;
  }
  PP.activeCharms = activeIds;
  /* charm levels: Stars take an owned charm to level 2 and 3, and each level adds half of its level-1 bonus again */
  var CHARM_MAX = 3;
  function charmLv(id){ var l = S.charms.lv && S.charms.lv[id]; return l > 1 ? Math.min(CHARM_MAX, l) : 1; }
  function lvScale(lv){ return 1 + 0.5 * (lv - 1); }
  function lvFx(v, lv){ return v < 1 ? Math.max(0.3, 1 - (1 - v) * lvScale(lv)) : 1 + (v - 1) * lvScale(lv); }
  function canLevel(c){ return !!(c && c.fx && Object.keys(c.fx).length); }
  function levelCost(c){ return c.p * charmLv(c.id); }
  PP.charmLv = charmLv;
  // what the charms do inside a game: score and coins multiply (default 1), everything else adds (default 0)
  PP.gameFx = function(g, kind){
    var mul = (kind === 'score' || kind === 'coins'), v = mul ? 1 : 0;
    if (!on()) return v;
    activeIds().forEach(function(id){
      var c = charmById(id), x = c && c.gfx && c.gfx[g] && c.gfx[g][kind];
      if (x){ if (mul) v *= x; else v += x; }
    });
    return v;
  };
  PP.addOrderKind = function(def){ if (!orderKind(def.id)) ORDER_KINDS.push(def); };
  PP.tickets = function(){ return S.tickets; };
  PP.spendTickets = function(n){ if (S.tickets < n) return false; S.tickets -= n; save(); refreshBalance(); return true; };
  PP.addTickets = function(n){ S.tickets += n; save(); refreshBalance(); };

  /* ------------------------------------------------------------------ sound (small synth blips) */
  var AC = null;
  function blip(f, d, type, v, delay){
    if (!S.opts.sfx) return;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return;
      if (!AC) AC = new Ctor();
      if (AC.state === 'suspended') AC.resume();
      var t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (d || 0.12));
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + (d || 0.12) + 0.05);
    } catch(e){}
  }
  PP.blip = blip;
  function chime(){ [523.25, 659.25, 783.99, 1046.5].forEach(function(f, i){ blip(f, 0.16, 'triangle', 0.1, i * 0.07); }); }
  PP.chime = chime;

  /* ------------------------------------------------------------------ charms (Ante Up) */
  /* small helpers the daily-drip charms use to hand things to the games */
  function bastionVoucher(n){
    try {
      var o = JSON.parse(localStorage.getItem('ccGachaState') || 'null') || {};
      var d = { vouchers:0, owned:{}, dupProgress:0, pullsSinceNew:0, crownCards:0, crownPlusCards:0, crownCoins:0, shopUnlocked:{} };
      Object.keys(d).forEach(function(k){ if (!(k in o)) o[k] = d[k]; });
      o.vouchers = (o.vouchers || 0) + n; localStorage.setItem('ccGachaState', JSON.stringify(o)); return true;
    } catch(e){ return false; }
  }
  function cubeCoins(n){
    try {
      var o = JSON.parse(localStorage.getItem('dashcube-knight-v1') || 'null') || {};
      o.coins = (o.coins || 0) + n; localStorage.setItem('dashcube-knight-v1', JSON.stringify(o)); return true;
    } catch(e){ return false; }
  }
  function giveBoost(g, k, n){ try { if (window.__ppPoints && window.__ppPoints.give){ window.__ppPoints.give(g, k, n); return true; } } catch(e){} return false; }
  var CHARMS = [
    // the app: the clicker, the wheel, orders, Points and EXP
    { id:'magnet',  cat:'app',   icon:'🧲', n:'Coin Magnet',     rar:'Common',    p:30,   fx:{ click:1.25 },        d:'Disc clicks give 25% more.' },
    { id:'metro',   cat:'app',   icon:'⏱️', n:'Metronome',       rar:'Common',    p:35,   fx:{ ps:1.15 },           d:'Groove production +15%.' },
    { id:'clover',  cat:'app',   icon:'🍀', n:'Lucky Clover',    rar:'Common',    p:40,   fx:{ spin:1.25 },         d:'Wheel rewards are 25% bigger.' },
    { id:'halo',    cat:'app',   icon:'🎧', n:'Headphone Halo',  rar:'Rare',      p:90,   fx:{ points:1.1 },        d:'Press Play Points earned +10%.' },
    { id:'mic',     cat:'app',   icon:'🎤', n:'Encore Mic',      rar:'Rare',      p:110,  fx:{ order:1.25 },        d:'Order rewards are 25% bigger.' },
    { id:'study',   cat:'app',   icon:'📚', n:'Study Buddy',     rar:'Rare',      p:120,  fx:{ xp:1.15 },           d:'App EXP +15% on top of the mode bonus.' },
    { id:'bass',    cat:'app',   icon:'🔊', n:'Bass Boost',      rar:'Rare',      p:140,  fx:{ click:1.5 },         d:'Disc clicks give 50% more.' },
    { id:'vinyl',   cat:'app',   icon:'💿', n:'Vinyl Spinner',   rar:'Rare',      p:170,  fx:{ ps:1.3 },            d:'Groove production +30%.' },
    { id:'wild',    cat:'app',   icon:'🃏', n:'Wild Card',       rar:'Epic',      p:300,  fx:{ pull:0.75 },         d:'Album pulls cost 25% less.' },
    { id:'crown',   cat:'app',   icon:'👑', n:'Crown',           rar:'Epic',      p:400,  fx:{ click:1.2, ps:1.2 }, d:'Clicks and production +20%.' },
    { id:'storm',   cat:'app',   icon:'🌩️', n:'Storm Caller',    rar:'Legendary', p:900,  fx:{},                    d:'Groove Storms last twice as long and give ×3.' },
    { id:'infinity',cat:'app',   icon:'♾️', n:'Infinity Mix',    rar:'Legendary', p:1500, fx:{ ps:2 },              d:'Groove production ×2.' },
    // inside the minigames: the game reads these while you play
    { id:'spatula', cat:'game',  g:'Kitchen Rush',     icon:'🍳', n:'Golden Spatula',  rar:'Rare',   p:130, gfx:{ kitchen:{ score:1.2 } },            d:'Kitchen Rush: every order scores 20% more.' },
    { id:'stopwatch',cat:'game', g:'Kitchen Rush',     icon:'⏲️', n:'Stopwatch',       rar:'Rare',   p:110, gfx:{ kitchen:{ time:15 } },              d:'Kitchen Rush: +15 seconds on every timed shift.' },
    { id:'ace',     cat:'game',  g:'Ante Up',          icon:'♠️', n:'Ace Up the Sleeve', rar:'Rare', p:150, gfx:{ anteup:{ cash:4, discard:1 } },     d:'Ante Up: start every run with +$4 and +1 discard in round one.' },
    { id:'medic',   cat:'game',  g:'Blob Barrage',     icon:'⛑️', n:'Field Medic',     rar:'Rare',   p:140, gfx:{ blob:{ shield:1, aid:1 } },         d:'Blob Barrage: each of your blobs starts a CPU match with +1 Shield and +1 First aid kit.' },
    { id:'map',     cat:'game',  g:'Dashcube Knight',  icon:'🗺️', n:'Treasure Map',    rar:'Rare',   p:160, gfx:{ cube:{ coins:1.2 } },               d:'Dashcube Knight: 20% more coins from every cleared stage.' },
    { id:'dealer',  cat:'game',  g:'Last Card',        icon:'🎴', n:"Dealer's Edge",   rar:'Rare',   p:120, gfx:{ lastcard:{ wild:1 } },              d:'Last Card: an extra Wild in your opening hand (classic-style modes).' },
    { id:'token',   cat:'game',  g:'Weapon Ball',      icon:'🪙', n:'Lucky Token',     rar:'Common', p:60,  gfx:{ weaponball:{ tokens:40 } },         d:'Weapon Ball: every Roguelite run starts with +40 tokens.' },
    { id:'pulse',   cat:'game',  g:'Obby Builder',     icon:'⚡', n:"Prodigy's Pulse", rar:'Epic',   p:350, fx:{ rush:1.25 }, gfx:{ obby:{ hype:1 } }, d:'Obby Builder: the Prodigy starts with a full Hype meter. Rhythm Rush scores ×1.25.' },
    // a little gift each day while equipped
    { id:'lantern', cat:'daily', g:'Bastion Brawl',    icon:'🏮', n:'Voucher Lantern', rar:'Epic',   p:320, drip:function(){ return bastionVoucher(1) ? '+1 gacha voucher in Bastion Brawl' : ''; },        d:'Daily: +1 gacha voucher in Bastion Brawl.' },
    { id:'totem',   cat:'daily', g:'Toque & Spear',    icon:'🗿', n:'Ancestor Totem',  rar:'Rare',   p:150, drip:function(){ return giveBoost('toque', 'trophies', 2) ? '+2 trophies waiting in Toque & Spear' : ''; }, d:'Daily: 2 trophies for your Toque & Spear satchel.' },
    { id:'purse',   cat:'daily', g:'Dashcube Knight',  icon:'👛', n:"Knight's Purse",  rar:'Common', p:70,  drip:function(){ return cubeCoins(150) ? '+150 coins in Dashcube Knight' : ''; },                 d:'Daily: +150 coins in Dashcube Knight.' }
  ];
  if (window.__ppWeb) CHARMS = CHARMS.filter(function(c){ return c.id !== 'study'; });   // the games website has no app EXP
  function charmById(id){ for (var i = 0; i < CHARMS.length; i++) if (CHARMS[i].id === id) return CHARMS[i]; return null; }
  PP.CHARMS = CHARMS; PP.charmEquipped = function(id){ return activeIds().indexOf(id) >= 0; };
  var RAR = { Common:'#9aa3b2', Rare:'#6ea8ff', Epic:'#b05cff', Legendary:'#ffb36e' };

  /* ------------------------------------------------------------------ the Groove Storm */
  function startStorm(ms){
    var strong = PP.charmEquipped('storm');
    var dur = ms * (strong ? 2 : 1), m = strong ? 3 : 2, now = Date.now();
    S.storm = { until: Math.max(now, S.storm.until) + dur, mult: Math.max(m, stormActive() ? S.storm.mult : 0) };
    save(); toast('🌩️ Groove Storm! Clicks and grooves ×' + S.storm.mult + ' for ' + Math.round(dur / 60000) + ' min');
    // open the clicker for the storm, unless you've hidden it in Settings
    try { if (window.PPClicker && !(window.PPClicker.isHidden && window.PPClicker.isHidden())) window.PPClicker.show(); } catch(e){}
  }
  PP.startStorm = startStorm;

  /* ------------------------------------------------------------------ the wheels: a daily wheel and a golden one */
  var WCOL = ['#6ee7d0', '#8b5cff', '#ff5fd8', '#ffb36e', '#39d5ff', '#3ddc84'];
  var WHEELS = {
    daily: { name:'Daily Wheel', segs:[
      { k:'g1',   t:'🎵', l:'Grooves',       w:18 }, { k:'s5',   t:'+5',  l:'+5 Stars',    w:16 },
      { k:'g2',   t:'🎶', l:'More Grooves',  w:14 }, { k:'s15',  t:'+15', l:'+15 Stars',   w:10 },
      { k:'tick', t:'🎴', l:'Pull Ticket',   w:7  }, { k:'free', t:'🎟️', l:'Free Spin',  w:7  },
      { k:'storm',t:'🌩️', l:'Groove Storm',  w:6  }, { k:'g3',   t:'💿', l:'Groove Hoard',w:5  },
      { k:'s30',  t:'+30', l:'+30 Stars',    w:5  }, { k:'trial',t:'🧿', l:'Charm Trial (1h)', w:4 },
      { k:'pts',  t:'▶️', l:'+25 Points',    w:4  }, { k:'jack', t:'💎', l:'JACKPOT (+100 Stars and a storm)', w:2 }
    ] },
    golden: { name:'Golden Wheel', segs:[
      { k:'gg1',  t:'🎶', l:'Mega Grooves',  w:16 }, { k:'gs60', t:'+60', l:'+60 Stars',   w:18 },
      { k:'gtick',t:'🎴', l:'3 Pull Tickets',w:14 }, { k:'gtrial',t:'🧿', l:'Charm Trial (24h)', w:12 },
      { k:'gstorm',t:'🌩️', l:'Mega Storm (30 min)', w:12 }, { k:'gpts', t:'▶️', l:'+100 Points', w:10 },
      { k:'gs120',t:'+120', l:'+120 Stars',  w:8  }, { k:'gcharm',t:'🎁', l:'FREE CHARM (kept for good)', w:10 }
    ] }
  };
  var wheelAngle = { daily:0, golden:0 }, spinning = false;
  function spinReady(){ return S.lastSpin !== dayKey() || S.spins > 0; }
  PP.spinReady = spinReady;
  function yesterdayKey(){ var d = new Date(Date.now() - 864e5); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function streakMult(){ return 1 + Math.min(1, Math.max(0, S.wheel.streak - 1) * 0.1); }
  function pickSeg(wid){
    var segs = WHEELS[wid].segs, tot = 0; segs.forEach(function(s){ tot += s.w; });
    var r = Math.random() * tot, i = 0;
    for (; i < segs.length; i++){ r -= segs[i].w; if (r < 0) break; }
    return Math.min(i, segs.length - 1);
  }
  function drawWheel(cv, wid, ang){
    var segs = WHEELS[wid].segs, ctx = cv.getContext('2d'), W = cv.width, R = W / 2 - 14, cx = W / 2, cy = W / 2, n = segs.length, sg = Math.PI * 2 / n, gold = wid === 'golden', i;
    ctx.clearRect(0, 0, W, W);
    ctx.save(); ctx.shadowColor = gold ? 'rgba(255,196,80,.75)' : 'rgba(139,92,255,.6)'; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, 7); ctx.fillStyle = gold ? '#3a2a06' : '#16171b'; ctx.fill(); ctx.restore();
    for (i = 0; i < n; i++){
      var a0 = ang + i * sg - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + sg); ctx.closePath();
      ctx.fillStyle = gold ? ['#ffd66e', '#ffb020'][i % 2] : WCOL[i % WCOL.length]; ctx.globalAlpha = (!gold && i % 2) ? 0.82 : 0.96; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(12,13,16,.85)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + sg / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#0c0d10';
      ctx.font = 'bold ' + (n > 10 ? 46 : 54) + 'px sans-serif'; ctx.fillText(segs[i].t, R - 20, 0); ctx.restore();
    }
    for (i = 0; i < n * 2; i++){   // blinking bulbs around the rim
      var ba = ang + i * sg / 2 - Math.PI / 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(ba) * (R + 4), cy + Math.sin(ba) * (R + 4), 5, 0, 7);
      ctx.fillStyle = (Math.floor(Date.now() / 250) + i) % 2 ? '#fff' : (gold ? '#ffd66e' : '#6ee7d0'); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.fillStyle = '#0c0d10'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = gold ? '#ffd66e' : '#6ee7d0'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - 7, cy - 11); ctx.lineTo(cx - 7, cy + 11); ctx.lineTo(cx + 12, cy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 15, 2); ctx.lineTo(cx + 15, 2); ctx.lineTo(cx, 34); ctx.closePath();   // pointer
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
  }
  function confetti(){
    var wrap = document.getElementById('pgr-wheelwrap'); if (!wrap) return;
    var cv = document.createElement('canvas'); cv.width = wrap.clientWidth * 2; cv.height = wrap.clientHeight * 2;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    wrap.style.position = 'relative'; wrap.appendChild(cv);
    var ctx = cv.getContext('2d'), ps = [], i;
    for (i = 0; i < 70; i++) ps.push({ x:cv.width / 2, y:cv.height * 0.42, vx:(Math.random() - 0.5) * 16, vy:-Math.random() * 15 - 4, c:COL[i % 4], s:7 + Math.random() * 9, r:Math.random() * 6 });
    var t0 = performance.now();
    (function f(now){
      var k = (now - t0) / 1500; ctx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(function(p){ p.vy += 0.5; p.x += p.vx; p.y += p.vy; p.r += 0.3; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - k); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
      if (k < 1) requestAnimationFrame(f); else cv.remove();
    })(t0);
  }
  function giveTrial(hours){
    var pool = CHARMS.filter(function(c){ return !S.charms.own[c.id]; });
    if (!pool.length){ PP.addStars(20, '', true); return '+20 ⭐ (you own every charm)'; }
    var c = pick(pool); S.trials[c.id] = Math.max(Date.now(), S.trials[c.id] || 0) + hours * 3600000;
    return c.icon + ' ' + c.n + ' on trial for ' + hours + 'h (it works without a slot)';
  }
  function freeCharm(){
    var pool = CHARMS.filter(function(c){ return !S.charms.own[c.id]; });
    if (!pool.length){ PP.addStars(250, '', true); return '+250 ⭐ (you own every charm)'; }
    var c = pick(pool); S.charms.own[c.id] = 1; return c.icon + ' ' + c.n + ' is yours for good';
  }
  function reward(wid, seg){
    var sm = PP.mult('spin') * (wid === 'daily' ? streakMult() : 1), ps = PP.ps();
    function gr(base){ var g = Math.round(base * sm); PP.addGrooves(g); return '+' + fmt(g) + ' grooves'; }
    function st(n){ var v = Math.round(n * sm); PP.addStars(v, '', true); return '+' + v + ' ⭐'; }
    function pts(n){ try { if (window.__ppPoints && window.__ppPoints.earn){ window.__ppPoints.earn(n, 'Playground wheel', true); return '+' + n + ' Press Play Points'; } } catch(e){} return st(n / 5); }
    switch (seg.k){
      case 'g1': return gr(Math.max(500, ps * 600));
      case 'g2': return gr(Math.max(2500, ps * 1800));
      case 'g3': return gr(Math.max(8000, ps * 5400));
      case 'gg1': return gr(Math.max(25000, ps * 18000));
      case 's5': return st(5); case 's15': return st(15); case 's30': return st(30);
      case 'gs60': return st(60); case 'gs120': return st(120);
      case 'jack': startStorm(10 * 60000); return st(100) + ' and a storm';
      case 'free': S.spins++; return 'a free spin';
      case 'tick': S.tickets++; return '1 pull ticket';
      case 'gtick': S.tickets += 3; return '3 pull tickets';
      case 'storm': startStorm(10 * 60000); return 'a Groove Storm';
      case 'gstorm': startStorm(30 * 60000); return 'a Mega Storm';
      case 'trial': return giveTrial(1);
      case 'gtrial': return giveTrial(24);
      case 'pts': return pts(25);
      case 'gpts': return pts(100);
      case 'gcharm': return freeCharm();
    }
    return '';
  }
  PP._reward = function(wid, key){ var seg = null; WHEELS[wid].segs.forEach(function(s){ if (s.k === key) seg = s; }); return seg ? reward(wid, seg) : null; };   // for testing
  function doSpin(){
    var wid = S.wheel.view; if (spinning) return;
    if (wid === 'golden'){ if (S.wheel.golden < 1) return; S.wheel.golden--; }
    else {
      if (!spinReady()) return;
      if (S.lastSpin !== dayKey()){
        if (S.wheel.lastDay === yesterdayKey()) S.wheel.streak++;
        else if (S.wheel.lastDay && S.wheel.streak > 1 && S.shield.wheel > 0){ S.shield.wheel--; S.wheel.streak++; setTimeout(function(){ toast('🛡️ A Streak Shield saved your ' + (S.wheel.streak - 1) + '-day wheel streak'); }, 3600); }
        else S.wheel.streak = 1;
        S.wheel.lastDay = dayKey(); S.lastSpin = dayKey();
      } else S.spins--;
    }
    var segs = WHEELS[wid].segs, idx = pickSeg(wid), n = segs.length, sg = Math.PI * 2 / n;
    var target = -((idx + 0.5) * sg) + Math.PI * 2 * (5 + Math.floor(Math.random() * 2));
    var start = wheelAngle[wid] % (Math.PI * 2); if (start < 0) start += Math.PI * 2;
    var t0 = performance.now(), dur = wid === 'golden' ? 4200 : 3400;
    spinning = true; PP.stat('spins', 1); if (wid === 'golden') PP.stat('golden', 1); save(true); updateWheelInfo();
    var last = -1;
    (function frame(now){
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      wheelAngle[wid] = start + (target - start) * e;
      var tick = Math.floor((((wheelAngle[wid] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / sg);
      if (tick !== last){ last = tick; if (k < 1) blip(900 + (tick % 4) * 90, 0.03, 'square', 0.04); }
      var cv = document.getElementById('pgr-wheel'); if (cv && S.wheel.view === wid) drawWheel(cv, wid, wheelAngle[wid]);
      if (k < 1) return requestAnimationFrame(frame);
      spinning = false;
      var seg = segs[idx], msg = reward(wid, seg);
      if (wid === 'daily') fillMeter(1, 1400);
      S.wheel.hist.unshift({ t: Date.now(), w: wid, l: seg.l, m: msg }); if (S.wheel.hist.length > 10) S.wheel.hist.pop();
      chime(); toast('🎡 ' + seg.l + ': ' + msg);
      if (wid === 'golden' || /^(jack|gcharm|gs120)$/.test(seg.k)) confetti();
      var r = document.getElementById('pgr-spin-res'); if (r) r.textContent = seg.l + ' → ' + msg;
      refreshBalance(); checkAch(); save(true);
      var hd = document.getElementById('pgr-hist'); if (hd) hd.innerHTML = histHTML();
      updateWheelInfo();
    })(t0);
  }
  function fillMeter(n, delay){
    S.wheel.meter += n;
    while (S.wheel.meter >= 7){ S.wheel.meter -= 7; S.wheel.golden++; setTimeout(function(){ toast('✨ The lucky meter is full: a Golden Spin is ready!'); }, delay || 0); }
    save(); updateWheelInfo();
  }
  PP.fillMeter = fillMeter;
  function histHTML(){
    if (!S.wheel.hist.length) return '<div class="pgr-meta">No spins yet.</div>';
    return S.wheel.hist.map(function(h){ return '<div class="pgr-meta" style="padding:3px 0">' + (h.w === 'golden' ? '✨ ' : '') + esc(h.l) + ' → ' + esc(h.m) + '</div>'; }).join('');
  }
  function prizesHTML(wid){
    var segs = WHEELS[wid].segs, tot = 0; segs.forEach(function(s){ tot += s.w; });
    return segs.map(function(s){ return '<div class="pgr-meta" style="display:flex;justify-content:space-between;padding:3px 0"><span>' + s.t + ' ' + esc(s.l) + '</span><b>' + (Math.round(s.w / tot * 1000) / 10) + '%</b></div>'; }).join('');
  }
  function renderWheelCard(){
    var el = document.getElementById('pgr-wheelcard'); if (!el) return;
    var wid = S.wheel.view;
    el.innerHTML = '<h3>Wheels</h3><div class="pgr-seg"><button type="button" data-wheel="daily" class="' + (wid === 'daily' ? 'on' : '') + '">Daily Wheel</button>' +
      '<button type="button" data-wheel="golden" class="' + (wid === 'golden' ? 'on' : '') + '">✨ Golden Wheel<span id="pgr-gcount"></span></button></div>' +
      '<div class="pgr-chips" id="pgr-wchips" style="margin:0 0 6px"></div>' +
      '<div class="pgr-meta" id="pgr-wnote" style="margin-bottom:4px"></div><div class="pgr-bar"><i id="pgr-meter" style="width:0"></i></div>' +
      '<div class="pgr-wheelwrap" id="pgr-wheelwrap"><canvas id="pgr-wheel" width="640" height="640"></canvas><div class="pgr-meta" id="pgr-spin-res">&nbsp;</div>' +
      '<button type="button" class="pgr-btn" id="pgr-spin"></button></div>' +
      '<details class="pgr-det"><summary>Prizes and odds</summary>' + prizesHTML(wid) + '</details>' +
      '<details class="pgr-det"><summary>Recent spins</summary><div id="pgr-hist">' + histHTML() + '</div></details>';
    var cv = el.querySelector('#pgr-wheel'); if (cv) drawWheel(cv, wid, wheelAngle[wid]);
    updateWheelInfo();
  }
  function updateWheelInfo(){
    var wid = S.wheel.view, b = document.getElementById('pgr-spin'); if (!b) return;
    var free = S.lastSpin !== dayKey(), bonus = Math.round((streakMult() - 1) * 100);
    b.disabled = spinning || (wid === 'golden' ? S.wheel.golden < 1 : !spinReady());
    b.textContent = spinning ? 'Spinning…' : wid === 'golden' ? (S.wheel.golden > 0 ? '✨ Golden Spin (' + S.wheel.golden + ')' : 'Fill the lucky meter') : free ? '🎡 Spin (free today)' : S.spins > 0 ? '🎟️ Spin (' + S.spins + ' left)' : 'Back tomorrow';
    var chips = document.getElementById('pgr-wchips');
    if (chips){
      var html = '<span class="pgr-chip">🔥 ' + S.wheel.streak + '-day streak' + (bonus ? ' (+' + bonus + '% rewards)' : '') + '</span>' + (S.tickets ? '<span class="pgr-chip">🎴 ' + S.tickets + ' pull ticket' + (S.tickets > 1 ? 's' : '') + '</span>' : '') + (S.spins ? '<span class="pgr-chip">🎟️ ' + S.spins + ' spare spin' + (S.spins > 1 ? 's' : '') + '</span>' : '') + (S.shield.wheel ? '<span class="pgr-chip">🛡️ streak shield ×' + S.shield.wheel + '</span>' : '');
      if (chips.__h !== html){ chips.innerHTML = html; chips.__h = html; }
    }
    var note = document.getElementById('pgr-wnote'); if (note) note.textContent = 'Lucky meter ' + S.wheel.meter + '/7: every Daily spin fills it, and a full meter earns a Golden Spin.';
    var m = document.getElementById('pgr-meter'); if (m) m.style.width = Math.round(S.wheel.meter / 7 * 100) + '%';
    var gc = document.getElementById('pgr-gcount'); if (gc) gc.innerHTML = S.wheel.golden ? ' <span class="pgr-dot2">' + S.wheel.golden + '</span>' : '';
  }

  /* ------------------------------------------------------------------ daily gifts from charms */
  function runDrips(){
    if (!on()) return;
    var d = dayKey(); if (S.drip.day !== d) S.drip = { day: d, got: {} };
    activeIds().forEach(function(id){
      var c = charmById(id); if (!c || !c.drip || S.drip.got[id]) return;
      var msg = ''; try { msg = c.drip(); } catch(e){}
      if (msg){ S.drip.got[id] = 1; save(true); toast(c.icon + ' ' + c.n + ': ' + msg); }
    });
  }

  /* ------------------------------------------------------------------ orders (Kitchen Rush) */
  var ORDER_KINDS = [
    { id:'clicks', stat:'clicks',  unit:'',    t:function(n){ return 'Click the disc ' + n + ' times'; },          tgt:[40, 120, 300] },
    { id:'game',   stat:'gameMs',  unit:'ms',  t:function(n){ return 'Play games for ' + n + ' min'; },             tgt:[3, 8, 15] },
    { id:'listen', stat:'listenMs',unit:'ms',  t:function(n){ return 'Listen to music for ' + n + ' min'; },        tgt:[5, 12, 25] },
    { id:'spin',   stat:'spins',   unit:'',    t:function(n){ return n === 1 ? 'Spin the wheel' : 'Spin the wheel ' + n + ' times'; }, tgt:[1, 2, 3] },
    { id:'eq',     stat:'eq',      unit:'',    t:function(n){ return n === 1 ? 'Try an EQ preset from the Stage' : 'Try ' + n + ' EQ presets from the Stage'; }, tgt:[1, 2, 4] },
    { id:'charm',  stat:'equips',  unit:'',    t:function(n){ return n === 1 ? 'Equip a charm' : 'Equip ' + n + ' charms'; }, tgt:[1, 2, 3] }
  ];
  var ORDER_STARS = [4, 9, 18], ORDER_MIN = [5, 15, 40], ORDER_TIME = 2 * 3600000;
  function orderKind(id){ for (var i = 0; i < ORDER_KINDS.length; i++) if (ORDER_KINDS[i].id === id) return ORDER_KINDS[i]; return null; }
  function orderTarget(o){ var k = orderKind(o.kind); return k.unit === 'ms' ? o.target * 60000 : o.target; }
  function orderProgress(o){ var k = orderKind(o.kind); return Math.min(orderTarget(o), Math.max(0, (S.stats[k.stat] || 0) - o.base)); }
  function newOrder(usedKinds){
    // the games website has no media player, so no listening or EQ orders there
    var kinds = window.__ppWeb ? ORDER_KINDS.filter(function(k){ return k.id !== 'listen' && k.id !== 'eq'; }) : ORDER_KINDS;
    var pool = kinds.filter(function(k){ return usedKinds.indexOf(k.id) < 0; });
    if (!pool.length) pool = kinds;
    var k = pick(pool), tier = Math.random() < 0.5 ? 0 : (Math.random() < 0.65 ? 1 : 2);
    return { id: ++S.orders.seq, kind: k.id, tier: tier, target: k.tgt[tier], base: S.stats[k.stat] || 0, until: Date.now() + ORDER_TIME, done: false };
  }
  function fillOrders(){
    var L = S.orders.list, changed = false, now = Date.now();
    for (var i = L.length - 1; i >= 0; i--){
      var o = L[i];
      if (!orderKind(o.kind)){ L.splice(i, 1); changed = true; continue; }
      if (!o.done && o.until < now){
        L.splice(i, 1); changed = true;
        if (S.orders.streak > 0 && S.shield.order > 0){ S.shield.order--; toast('🛡️ An Order Shield kept your order streak going'); }
        else S.orders.streak = 0;
      }
    }
    while (L.length < 3){ L.push(newOrder(L.map(function(o){ return o.kind; }))); changed = true; }
    if (changed) save();
    return changed;
  }
  function orderReady(o){ return !o.done && orderProgress(o) >= orderTarget(o); }
  PP.claimable = function(){ var c = 0; S.orders.list.forEach(function(o){ if (orderReady(o)) c++; }); return c; };
  function claimOrder(id){
    var L = S.orders.list, o = null, i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) o = L[i];
    if (!o || !orderReady(o)) return;
    var streak = S.orders.streak + 1, bonus = 1 + Math.min(0.5, S.orders.streak * 0.1), om = PP.mult('order');
    var stars = Math.round(ORDER_STARS[o.tier] * bonus * om), grooves = Math.round(Math.max([300, 900, 2400][o.tier], PP.ps() * ORDER_MIN[o.tier] * 60) * om);
    PP.addStars(stars, '', true); PP.addGrooves(grooves); if (o.tier === 2) S.tickets++;
    S.orders.streak = streak; S.orders.done++; PP.stat('orders', 1);
    L.splice(L.indexOf(o), 1); fillOrders(); save(true);
    chime(); toast('🧾 Order up! +' + stars + ' ⭐ and +' + fmt(grooves) + ' grooves' + (o.tier === 2 ? ' and a 🎴 pull ticket' : '') + (streak > 1 ? ' (streak ×' + streak + ')' : ''));
    renderActive(); refreshBalance(); checkAch();
  }
  var REROLL = 5;
  function rerollOrder(id){
    var L = S.orders.list, i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) break;
    if (i >= L.length || orderReady(L[i])) return;
    if (!PP.spendStars(REROLL)){ toast('A new order costs ' + REROLL + ' ⭐'); return; }
    var used = L.map(function(o){ return o.kind; });
    L[i] = newOrder(used); PP.stat('rerolls', 1); save(true); blip(520, 0.08, 'triangle', 0.07); toast('🔄 New order on the pass');
    renderActive();
  }
  function timeLeft(ms){ var m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; }

  /* ------------------------------------------------------------------ the hub */
  var css = document.createElement('style');
  css.id = 'pgr-style';
  css.textContent = [
    'body:not(.pp-playground) #pgr-fab,body:not(.pp-playground) #pgr-settings-section,body:not(.pp-playground) .ppxp-bg-swatch[data-pg],body:not(.pp-playground) .ppxp-eq-pro-btn[data-pg]{display:none!important}',
    '#pp-mode-banner.playground,#pp-mode-banner.playground *{color:#0c0d10!important;-webkit-text-fill-color:#0c0d10!important}',
    '#pp-mode-banner.playground{background:linear-gradient(90deg,#6ee7d0,#8b5cff,#ff5fd8,#ffb36e,#6ee7d0)!important;background-size:200% 100%;box-shadow:0 6px 30px rgba(139,92,255,.6)}',
    '#pgr-fab{position:fixed;right:12px;top:46%;z-index:61;width:52px;height:52px;border-radius:50%;border:2px solid transparent;line-height:1;cursor:pointer;padding:0;color:#fff;overflow:visible;',
    ' background:linear-gradient(#16171b,#16171b) padding-box,linear-gradient(135deg,#6ee7d0,#8b5cff 55%,#ff5fd8) border-box;box-shadow:0 6px 22px rgba(139,92,255,.45);-webkit-tap-highlight-color:transparent}',
    '#pgr-fab:active{transform:scale(.92)}',
    '.pgr-emb{display:block;width:100%;height:100%;border-radius:50%;overflow:hidden}.pgr-emb.sm{display:inline-block;width:20px;height:20px;border-radius:6px;vertical-align:-5px}',
    '#pgr-fab .pgr-dot{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:#ff5f7a;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center;padding:0 4px;box-sizing:border-box;box-shadow:0 0 0 2px #0c0d10}',
    '#pgr-hub{position:fixed;inset:0;z-index:99980;display:none;flex-direction:column;color:var(--text,#e8e8ea);font-family:Inter,-apple-system,system-ui,sans-serif;',
    ' background:radial-gradient(120% 50% at 50% -10%,rgba(139,92,255,.16),transparent 60%),radial-gradient(80% 40% at 100% 100%,rgba(255,95,216,.08),transparent 60%),var(--bg,#0c0d10);',
    ' padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0);opacity:0;transform:translateY(12px);transition:opacity .18s,transform .22s}',
    '#pgr-hub.open{display:flex}#pgr-hub.shown{opacity:1;transform:none}',
    '.pgr-head{display:flex;align-items:center;gap:8px;padding:12px 14px 6px 8px}',
    '.pgr-back{width:40px;height:40px;border-radius:12px;border:0;background:transparent;color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.pgr-back svg{width:22px;height:22px}',
    '.pgr-title{font-size:19px;font-weight:700;margin:0;white-space:nowrap}',
    '.pgr-rb{background:linear-gradient(90deg,#6ee7d0,#8b5cff,#ff5fd8,#ffb36e,#6ee7d0);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:ppgTitleFlow 6s linear infinite}',
    '.pgr-bal{margin-left:auto;display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px}',
    '.pgr-bal span{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);white-space:nowrap}',
    '.pgr-tabs{display:flex;gap:8px;overflow-x:auto;padding:6px 14px 10px;scrollbar-width:none;flex:0 0 auto}',
    '.pgr-tabs::-webkit-scrollbar{display:none}',
    '.pgr-tab{flex:0 0 auto;padding:9px 14px;border-radius:999px;border:1px solid var(--line,#232429);background:var(--bg-elev,#16171b);color:var(--text-dim,#8b8c93);font:600 13px inherit;font-family:inherit;cursor:pointer;white-space:nowrap;position:relative}',
    '.pgr-tab.on{color:#0c0d10;border-color:transparent;background:linear-gradient(90deg,#6ee7d0,#b79bff)}',
    '.pgr-tab .pgr-dot{position:absolute;top:-4px;right:-2px;min-width:16px;height:16px;border-radius:8px;background:#ff5f7a;color:#fff;font:700 10px/16px system-ui,sans-serif;text-align:center;padding:0 3px;box-sizing:border-box}',
    '.pgr-body{flex:1;overflow-y:auto;padding:4px 14px 28px;-webkit-overflow-scrolling:touch}',
    '.pgr-card{background:var(--bg-elev,#16171b);border:1px solid var(--line,#232429);border-radius:16px;padding:14px;margin-bottom:12px}',
    '.pgr-card h3{margin:0 0 4px;font-size:15px;font-weight:700}.pgr-sub{font-size:12px;color:var(--text-dim,#8b8c93);line-height:1.45;margin:0 0 10px}',
    '.pgr-hero{background:linear-gradient(120deg,rgba(110,231,208,.1),rgba(139,92,255,.16) 60%,rgba(255,95,216,.12));border-color:rgba(139,92,255,.5)}',
    '.pgr-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.pgr-chip{padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.07);font-size:12px;font-weight:600}',
    '.pgr-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 16px;border-radius:12px;border:0;font:700 14px inherit;font-family:inherit;cursor:pointer;color:#0c0d10;background:linear-gradient(90deg,#6ee7d0,#b79bff);-webkit-tap-highlight-color:transparent}',
    '.pgr-btn:active{transform:scale(.96)}.pgr-btn[disabled]{opacity:.45;cursor:default;transform:none}',
    '.pgr-btn.alt{background:rgba(255,255,255,.08);color:var(--text,#e8e8ea)}',
    '.pgr-btn.sm{padding:7px 12px;font-size:12px;border-radius:10px}',
    '.pgr-wheelwrap{display:flex;flex-direction:column;align-items:center;gap:10px}',
    '#pgr-wheel{width:min(260px,78vw);height:auto;aspect-ratio:1}',
    '.pgr-row{display:flex;flex-wrap:wrap;gap:8px}',
    '.pgr-pre{padding:8px 12px;border-radius:10px;border:1px solid var(--line,#232429);background:var(--bg,#0c0d10);color:var(--text,#e8e8ea);font:600 12.5px inherit;font-family:inherit;cursor:pointer}',
    '.pgr-pre:active{background:rgba(255,255,255,.1)}',
    '.pgr-sw{width:56px;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.14);cursor:pointer;position:relative;overflow:hidden;padding:0}',
    '.pgr-sw span{position:absolute;left:0;right:0;bottom:0;font:700 9px/14px system-ui,sans-serif;background:rgba(0,0,0,.55);color:#fff;text-align:center;white-space:nowrap;overflow:hidden}',
    '.pgr-games{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px}',
    '.pgr-g{position:relative;border:0;background:none;color:inherit;font:inherit;padding:0;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.pgr-g .a{aspect-ratio:1;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.1)}.pgr-g .a img{width:100%;height:100%;object-fit:cover;display:block}',
    '.pgr-g b{display:block;font-size:11.5px;margin-top:5px;line-height:1.2}',
    '.pgr-free{position:absolute;top:5px;left:5px;padding:2px 5px;border-radius:6px;font:800 8.5px/1.2 system-ui,sans-serif;letter-spacing:.04em;color:#0c0d10;background:linear-gradient(90deg,#6ee7d0,#ff5fd8)}',
    '.pgr-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
    '.pgr-stat{background:var(--bg,#0c0d10);border-radius:12px;padding:10px 6px;text-align:center}.pgr-stat b{display:block;font-size:17px}.pgr-stat small{font-size:10.5px;color:var(--text-dim,#8b8c93)}',
    '.pgr-order{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:var(--bg,#0c0d10);border:1px solid var(--line,#232429);margin-bottom:10px}',
    '.pgr-order.ready{border-color:rgba(110,231,208,.7);box-shadow:0 0 18px rgba(110,231,208,.18)}',
    '.pgr-order .m{flex:1;min-width:0}.pgr-order b{font-size:13.5px;display:block}',
    '.pgr-bar{height:7px;border-radius:4px;background:rgba(255,255,255,.08);margin:7px 0 5px;overflow:hidden}.pgr-bar i{display:block;height:100%;background:linear-gradient(90deg,#6ee7d0,#8b5cff,#ff5fd8)}',
    '.pgr-meta{font-size:11px;color:var(--text-dim,#8b8c93)}',
    '.pgr-tier{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:2px 6px;border-radius:6px;margin-left:6px;vertical-align:1px;color:#0c0d10}',
    '.pgr-slots{display:flex;gap:10px;margin-bottom:6px;flex-wrap:wrap}',
    '.pgr-slot{width:64px;height:76px;border-radius:14px;border:2px dashed rgba(255,255,255,.2);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:26px;background:var(--bg,#0c0d10);cursor:pointer;position:relative}',
    '.pgr-slot small{font-size:9.5px;color:var(--text-dim,#8b8c93);margin-top:2px;text-align:center;line-height:1.1;padding:0 3px}',
    '.pgr-slot.full{border-style:solid;border-color:rgba(139,92,255,.7)}.pgr-slot.lock{opacity:.55;font-size:20px}',
    '.pgr-charm{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:var(--bg,#0c0d10);border:1px solid var(--line,#232429);margin-bottom:10px}',
    '.pgr-charm .i{font-size:28px;width:40px;text-align:center}.pgr-charm .m{flex:1;min-width:0}.pgr-charm b{font-size:13.5px}',
    '.pgr-cbtns{display:flex;flex-direction:column;gap:6px;align-items:stretch}',
    '.pgr-rar{font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-left:6px}',
    '.pgr-strip{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;scrollbar-width:none}.pgr-strip::-webkit-scrollbar{display:none}',
    '.pgr-sb{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:9px 13px;border-radius:14px;border:1px solid transparent;color:var(--text,#e8e8ea);font:700 12.5px inherit;font-family:inherit;cursor:pointer;position:relative;',
    ' background:linear-gradient(var(--bg-elev,#16171b),var(--bg-elev,#16171b)) padding-box,linear-gradient(120deg,#6ee7d0,#8b5cff 60%,#ff5fd8) border-box;-webkit-tap-highlight-color:transparent}',
    '.pgr-sb .pgr-dot{position:absolute;top:-5px;right:-3px;min-width:17px;height:17px;border-radius:9px;background:#ff5f7a;color:#fff;font:700 10px/17px system-ui,sans-serif;text-align:center;padding:0 3px;box-sizing:border-box}',
    '.pgr-seg{display:flex;gap:6px;margin:6px 0 10px}.pgr-seg button{flex:1;padding:9px 6px;border-radius:12px;border:1px solid var(--line,#232429);background:var(--bg,#0c0d10);color:var(--text-dim,#8b8c93);font:700 13px inherit;font-family:inherit;cursor:pointer}',
    '.pgr-seg button.on{color:#0c0d10;border-color:transparent;background:linear-gradient(90deg,#6ee7d0,#b79bff)}.pgr-seg button.on:nth-child(2){background:linear-gradient(90deg,#ffd66e,#ffb020)}',
    '.pgr-dot2{display:inline-block;min-width:17px;height:17px;border-radius:9px;background:#ff5f7a;color:#fff;font:700 10px/17px system-ui,sans-serif;text-align:center;padding:0 3px;box-sizing:border-box;margin-left:4px;vertical-align:1px}',
    '.pgr-det{margin-top:10px;border-top:1px solid var(--line,#232429);padding-top:8px}.pgr-det summary{font-size:12.5px;font-weight:700;cursor:pointer;color:var(--text-dim,#8b8c93)}',
    '.pgr-gtag{font-size:9.5px;font-weight:800;letter-spacing:.04em;margin-left:6px;padding:1px 6px;border-radius:6px;background:rgba(110,231,208,.18);color:#6ee7d0}',
    '.pgr-note{font-size:11.5px;color:var(--text-dim,#8b8c93);line-height:1.5;margin:8px 2px}',
    '#pgr-settings-section .pgr-set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}',
    '@media (prefers-reduced-motion:reduce){.pgr-rb,.title-mode[data-ed="playground"]{animation:none}}'
  ].join('\n');
  document.head.appendChild(css);

  var hub = document.createElement('div');
  hub.id = 'pgr-hub'; hub.setAttribute('role', 'dialog'); hub.setAttribute('aria-label', 'Press Play Playground');
  hub.innerHTML = '<div class="pgr-head"><button type="button" class="pgr-back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
    '<h1 class="pgr-title">Press Play <span class="pgr-rb">Playground</span></h1><div class="pgr-bal"><span id="pgr-bal-tix" style="display:none">🎴 0</span><span id="pgr-bal-stars">⭐ 0</span></div></div>' +
    '<div class="pgr-tabs" id="pgr-tabs"></div><div class="pgr-body" id="pgr-body"></div>';
  document.body.appendChild(hub);
  var tabsEl = hub.querySelector('#pgr-tabs'), bodyEl = hub.querySelector('#pgr-body'), curTab = 'stage', activeDef = null;

  function hubOpen(){ return hub.classList.contains('open'); }
  function refreshBalance(){
    var e = document.getElementById('pgr-bal-stars'); if (e) e.textContent = '⭐ ' + fmt(S.stars);
    var tx = document.getElementById('pgr-bal-tix'); if (tx){ tx.style.display = S.tickets ? '' : 'none'; tx.textContent = '🎴 ' + S.tickets; }
    updateFab(); updateSpinBtn();
  }

  /* tabs: Stage, Orders and Charms live here; other scripts add more */
  var CORE_TABS = [
    { id:'stage',  label:'🎪 Stage',  order:10, render:renderStage, live:liveStage },
    { id:'orders', label:'🧾 Orders', order:20, render:renderOrders, live:liveOrders, badge:function(){ return PP.claimable(); } },
    { id:'charms', label:'🧿 Charms', order:30, render:renderCharms }
  ];
  CORE_TABS.forEach(function(t){ tabs.push(t); });
  tabs.sort(function(a, b){ return (a.order || 50) - (b.order || 50); });

  function renderTabs(){
    var html = tabs.map(function(t){
      var b = t.badge ? t.badge() : 0;
      return '<button type="button" class="pgr-tab' + (t.id === curTab ? ' on' : '') + '" data-pgr-tab="' + t.id + '">' + t.label + (b ? '<span class="pgr-dot">' + b + '</span>' : '') + '</button>';
    }).join('');
    if (tabsEl.__h !== html){ tabsEl.innerHTML = html; tabsEl.__h = html; }
  }
  function renderActive(){
    if (!hubOpen()) return;
    var t = null; tabs.forEach(function(x){ if (x.id === curTab) t = x; });
    if (!t){ curTab = 'stage'; t = tabs[0]; }
    if (activeDef && activeDef !== t && activeDef.onHide) { try { activeDef.onHide(); } catch(e){} }
    var y = bodyEl.scrollTop;
    activeDef = t; renderTabs();
    bodyEl.innerHTML = '';
    try { t.render(bodyEl); } catch(e){ bodyEl.innerHTML = '<p class="pgr-note">This tab could not load.</p>'; }
    bodyEl.scrollTop = y;
  }
  function setTab(id){
    if (curTab === id && activeDef) return;
    if (activeDef && activeDef.onHide){ try { activeDef.onHide(); } catch(e){} }
    curTab = id; activeDef = null; bodyEl.scrollTop = 0; renderActive();
  }
  PP.reflow = function(id){ if (hubOpen() && curTab === id) renderActive(); };
  PP.open = function(tab){
    if (!on()){ toast('Turn on Press Play Playground in Settings → App mode.'); return; }
    fillOrders(); refreshBalance();
    if (!hubOpen()){
      if (tab) curTab = tab;
      hub.classList.add('open'); activeDef = null; renderActive();
      requestAnimationFrame(function(){ hub.classList.add('shown'); });
      try { history.pushState({ ppPg: 1 }, ''); } catch(e){}
    } else if (tab){ if (tab === curTab) renderActive(); else setTab(tab); }
    updateFab();
  };
  function hideHub(){
    if (activeDef && activeDef.onHide){ try { activeDef.onHide(); } catch(e){} }
    hub.classList.remove('open', 'shown'); activeDef = null; updateFab();
  }
  PP.close = function(){ if (history.state && history.state.ppPg) history.back(); else hideHub(); };
  window.addEventListener('popstate', function(){ if (hubOpen() && !(history.state && history.state.ppPg)) hideHub(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && hubOpen() && !document.body.classList.contains('pp-gaming')){ e.stopImmediatePropagation(); PP.close(); } }, true);   // a game on top owns Escape
  hub.querySelector('.pgr-back').addEventListener('click', PP.close);
  tabsEl.addEventListener('click', function(e){ var b = e.target.closest('[data-pgr-tab]'); if (b){ blip(660, 0.05, 'triangle', 0.06); setTab(b.getAttribute('data-pgr-tab')); } });
  document.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-pgr-open]'); if (b){ e.preventDefault(); PP.open(b.getAttribute('data-pgr-open')); } });

  /* ------------------------------------------------------------------ Stage */
  var EQ_LINKS = [['crescendo', 'Crescendo'], ['titanbass', 'Titan Bass'], ['deepresonance', 'Deep Resonance'], ['pgprodigy', 'Prodigy'], ['pgmaestro', 'Maestro'], ['pgphantom', 'Phantom'], ['pgparagon', 'Paragon'], ['pgpanther', 'Panther'], ['pgpaladin', 'Paladin']];
  var BACKDROPS = [['pg-arcade', 'Neon Arcade', '#0b0a1f', '#ff5fd8'], ['pg-prodigy', 'Prodigy Pulse', '#120a2e', '#6ee7d0'], ['pg-titan', 'Titan Quake', '#1a0800', '#ff6a3d'], ['pg-deep', 'Deep Resonance', '#02101f', '#39d5ff'], ['pg-paladin', 'Paladin Violet', '#1a1038', '#8b5cff'], ['pg-cartridge', 'Cartridge Green', '#06100a', '#3ddc84']];
  function stagePerks(){
    var out = S.charms.eq.map(function(id){ var c = charmById(id); return c ? '<span class="pgr-chip">' + c.icon + ' ' + esc(c.n) + '</span>' : ''; }).join('');
    return out || '<span class="pgr-chip">No charms equipped. Visit the Charms tab.</span>';
  }
  function renderStage(el){
    var games = (window.__ppGames && window.__ppGames.list) || [];
    el.innerHTML =
      '<div class="pgr-card pgr-hero"><h3>Welcome to the Playground</h3>' +
      '<p class="pgr-sub" style="margin:0">' + (window.__ppWeb ? 'The clicker is out and every game exclusive is free. Earn <b>⭐ Stars</b> from orders, the wheel and playing games, then spend them on charms, charm levels, album pulls and the Star Shop.</p>' : 'Everything in the app is unlocked, the clicker is out, and every game exclusive is free. Earn <b>⭐ Stars</b> from orders, the wheel and playing games, then spend them on charms, charm levels, album pulls and the Star Shop. Your EXP grows 25% faster here.</p>') +
      '<div class="pgr-chips" id="pgr-chips"></div></div>' +
      '<div class="pgr-card" id="pgr-wheelcard"></div>' +
      (window.__ppWeb ? '' : '<div class="pgr-card"><h3>Sound &amp; look</h3><p class="pgr-sub">One tap sets your real equalizer. Playground adds six presets named after the game exclusives.</p>' +
      '<div class="pgr-row" id="pgr-eq">' + EQ_LINKS.map(function(p){ return '<button type="button" class="pgr-pre" data-eq="' + p[0] + '">' + esc(p[1]) + '</button>'; }).join('') + '</div>' +
      '<p class="pgr-sub" style="margin:12px 0 8px">Backdrops (they apply to the tab you have open in Settings → Appearance, or the app by default):</p>' +
      '<div class="pgr-row" id="pgr-bg">' + BACKDROPS.map(function(b){ return '<button type="button" class="pgr-sw" data-bg="' + b[0] + '" style="background:linear-gradient(135deg,' + b[2] + ',' + b[3] + ')"><span>' + esc(b[1]) + '</span></button>'; }).join('') + '</div></div>') +
      '<div class="pgr-card"><h3>Games <span class="pgr-tier" style="background:linear-gradient(90deg,#6ee7d0,#ff5fd8)">Free play</span></h3><p class="pgr-sub">Every Press Play exclusive that a game checks for is yours while Playground is on. Playing earns ⭐ Stars (1 a minute).</p>' +
      '<div class="pgr-games">' + games.map(function(g){ return '<button type="button" class="pgr-g" data-game="' + esc(g.id) + '"><span class="pgr-free">FREE PLAY</span><div class="a" style="background:' + esc(g.bg) + '">' + (window.__ppGames && window.__ppGames.art ? window.__ppGames.art(g) : '') + '</div><b>' + esc(g.name) + '</b></button>'; }).join('') + '</div></div>' +
      '<div class="pgr-card"><h3>Your Playground</h3><div class="pgr-stats" id="pgr-stats"></div></div>' +
      (window.__ppWeb ? '' : '<p class="pgr-note">Perks you get in this mode: EXP +25%, every level unlock and Press Play shop perk, six Playground EQ presets and six Playground backdrops.</p>');
    renderWheelCard();
    liveStage();
  }
  function updateSpinBtn(){ updateWheelInfo(); }
  function liveStage(){
    var c = document.getElementById('pgr-chips');
    if (c){
      var storm = stormActive() ? '<span class="pgr-chip" style="background:rgba(183,155,255,.25)">🌩️ Storm ×' + S.storm.mult + ' · ' + timeLeft(S.storm.until - Date.now()) + '</span>' : '';
      var html = '<span class="pgr-chip">🎵 ' + fmt(PP.ps()) + ' grooves/s</span>' + storm + stagePerks();
      if (c.__h !== html){ c.innerHTML = html; c.__h = html; }
    }
    var st = document.getElementById('pgr-stats');
    if (st){
      var html2 = [['⭐', fmt(S.total), 'Stars earned'], ['🧾', S.orders.done, 'Orders'], ['🎡', PP.get('spins'), 'Spins'], ['🖱️', fmt(PP.get('clicks')), 'Clicks'], ['🎮', Math.floor(PP.get('gameMs') / 60000), 'Game min'], ['🎧', Math.floor(PP.get('listenMs') / 60000), 'Listen min'], ['🛍️', fmt(S.spent || 0), 'Stars spent'], ['⬆️', PP.get('charmUps'), 'Charm levels'], ['🛡️', S.shield.wheel + S.shield.order, 'Shields']]
        .map(function(x){ return '<div class="pgr-stat"><b>' + x[0] + ' ' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('');
      if (st.__h !== html2){ st.innerHTML = html2; st.__h = html2; }
    }
    updateSpinBtn();
  }
  bodyEl.addEventListener('click', function(e){
    var b;
    if ((b = e.target.closest('#pgr-spin'))){ doSpin(); return; }
    if ((b = e.target.closest('[data-wheel]'))){ if (!spinning){ S.wheel.view = b.getAttribute('data-wheel'); save(); renderWheelCard(); } return; }
    if ((b = e.target.closest('[data-cfilter]'))){ charmFilter = b.getAttribute('data-cfilter'); renderActive(); return; }
    if ((b = e.target.closest('[data-eq]'))){
      var key = b.getAttribute('data-eq'), btn = document.querySelector('.ppxp-eq-pro-btn[data-eq-preset="' + key + '"]');
      if (btn){ btn.click(); PP.stat('eq', 1); blip(440, 0.1, 'sawtooth', 0.06); toast('🎚️ EQ: ' + b.textContent); checkAch(); }
      else toast('The equalizer is still loading. Try again in a moment.');
      return;
    }
    if ((b = e.target.closest('[data-bg]'))){
      var sw = document.querySelector('.ppxp-bg-swatch[data-preset-id="' + b.getAttribute('data-bg') + '"]');
      if (sw){ sw.click(); blip(520, 0.1, 'triangle', 0.06); toast('🖼️ Backdrop: ' + b.textContent); }
      else toast('Backgrounds are still loading. Try again in a moment.');
      return;
    }
    if ((b = e.target.closest('[data-game]'))){
      var id = b.getAttribute('data-game');
      if (window.__ppGames && window.__ppGames.open){ blip(600, 0.08, 'triangle', 0.06); window.__ppGames.open(id); }
      return;
    }
    if ((b = e.target.closest('[data-claim]'))){ claimOrder(+b.getAttribute('data-claim')); return; }
    if ((b = e.target.closest('[data-reroll]'))){ rerollOrder(+b.getAttribute('data-reroll')); return; }
    if ((b = e.target.closest('[data-charm]'))){ charmAction(b.getAttribute('data-charm'), b.getAttribute('data-do')); return; }
    if ((b = e.target.closest('[data-slot]'))){ slotAction(+b.getAttribute('data-slot')); return; }
  });

  /* ------------------------------------------------------------------ Orders tab */
  function renderOrders(el){
    fillOrders();
    var rows = S.orders.list.map(function(o){
      var k = orderKind(o.kind), tgt = orderTarget(o), prog = orderProgress(o), ready = orderReady(o), pct = Math.round(prog / tgt * 100);
      var shownProg = k.unit === 'ms' ? Math.floor(prog / 60000) : prog, shownTgt = k.unit === 'ms' ? o.target : o.target;
      var tc = ['#9aa3b2', '#6ea8ff', '#ffb36e'][o.tier], tn = ['Easy', 'Medium', 'Hard'][o.tier];
      return '<div class="pgr-order' + (ready ? ' ready' : '') + '"><div class="m"><b>' + esc(k.t(o.target)) + '<span class="pgr-tier" style="background:' + tc + '">' + tn + '</span></b>' +
        '<div class="pgr-bar"><i style="width:' + pct + '%"></i></div><div class="pgr-meta">' + shownProg + ' / ' + shownTgt + ' · ⭐ ' + ORDER_STARS[o.tier] + ' + grooves' + (o.tier === 2 ? ' + 🎴' : '') + ' · <span data-left="' + o.id + '">' + timeLeft(o.until - Date.now()) + '</span> left</div></div>' +
        (ready ? '<button type="button" class="pgr-btn sm" data-claim="' + o.id + '">Claim</button>' : '<button type="button" class="pgr-btn sm alt" data-reroll="' + o.id + '" aria-label="Swap this order for ' + REROLL + ' Stars">🔄 ⭐' + REROLL + '</button>') + '</div>';
    }).join('');
    var bonus = Math.round(Math.min(0.5, S.orders.streak * 0.1) * 100);
    el.innerHTML = '<div class="pgr-card pgr-hero"><h3>Orders</h3><p class="pgr-sub" style="margin:0">Three orders are always on the pass. Finish them for ⭐ Stars and grooves. A streak of finished orders adds up to +50%; letting one run out resets it. Do not like an order? Swap it for ' + REROLL + ' ⭐.</p>' +
      '<div class="pgr-chips"><span class="pgr-chip">🔥 Streak ' + S.orders.streak + (bonus ? ' (+' + bonus + '%)' : '') + '</span><span class="pgr-chip">🧾 ' + S.orders.done + ' done</span>' + (S.shield.order ? '<span class="pgr-chip">🛡️ ' + S.shield.order + ' shield' + (S.shield.order > 1 ? 's' : '') + '</span>' : '') + '</div></div>' + rows;
    el.__sig = ordersSig();
  }
  function ordersSig(){ return S.orders.list.map(function(o){ return o.id + ':' + o.done + ':' + orderProgress(o); }).join('|'); }
  function liveOrders(){
    var changed = fillOrders();
    if (changed || bodyEl.__sig !== ordersSig()){ renderActive(); return; }
    S.orders.list.forEach(function(o){ var s = bodyEl.querySelector('[data-left="' + o.id + '"]'); if (s) s.textContent = timeLeft(o.until - Date.now()); });
  }

  /* ------------------------------------------------------------------ Charms tab */
  var charmFilter = 'all';
  function renderCharms(el){
    var slots = '';
    for (var i = 0; i < 5; i++){
      var id = S.charms.eq[i], c = id ? charmById(id) : null;
      if (i >= S.slots) slots += '<div class="pgr-slot lock" data-slot="' + i + '">🔒<small>' + (i === 3 ? '150 ⭐' : '600 ⭐') + '</small></div>';
      else slots += c ? '<div class="pgr-slot full" data-slot="' + i + '">' + c.icon + '<small>' + esc(c.n) + '</small></div>' : '<div class="pgr-slot" data-slot="' + i + '">＋<small>Empty</small></div>';
    }
    var now = Date.now();
    var list = CHARMS.filter(function(c){ return charmFilter === 'all' || c.cat === charmFilter; }).map(function(c){
      var own = !!S.charms.own[c.id], eq = S.charms.eq.indexOf(c.id) >= 0, trial = S.trials[c.id] > now;
      var lv = charmLv(c.id), up = own && canLevel(c) && lv < CHARM_MAX, upCost = up ? levelCost(c) : 0;
      var btn = !own ? '<button type="button" class="pgr-btn sm" data-charm="' + c.id + '" data-do="buy"' + (S.stars < c.p ? ' style="opacity:.55"' : '') + '>⭐ ' + c.p + '</button>'
        : eq ? '<button type="button" class="pgr-btn sm alt" data-charm="' + c.id + '" data-do="unequip">Unequip</button>'
        : '<button type="button" class="pgr-btn sm" data-charm="' + c.id + '" data-do="equip">Equip</button>';
      if (up) btn = '<div class="pgr-cbtns">' + btn + '<button type="button" class="pgr-btn sm alt" data-charm="' + c.id + '" data-do="up"' + (S.stars < upCost ? ' style="opacity:.55"' : '') + '>⬆️ Lv ' + (lv + 1) + ' · ⭐ ' + upCost + '</button></div>';
      var lvTxt = own && canLevel(c) ? '<div class="pgr-meta" style="color:#ffd66e">Level ' + lv + '/' + CHARM_MAX + (lv > 1 ? ': bonus ×' + lvScale(lv) : '') + (lv < CHARM_MAX ? ' · level ' + (lv + 1) + ' makes it ×' + lvScale(lv + 1) : '') + '</div>' : '';
      return '<div class="pgr-charm"><div class="i">' + c.icon + '</div><div class="m"><b>' + esc(c.n) + '</b><span class="pgr-rar" style="color:' + RAR[c.rar] + '">' + c.rar + '</span>' + (c.g ? '<span class="pgr-gtag">' + esc(c.g) + '</span>' : '') + '<div class="pgr-meta">' + esc(c.d) + '</div>' + lvTxt + (trial ? '<div class="pgr-meta" style="color:#b79bff">🧪 On trial: ' + timeLeft(S.trials[c.id] - now) + ' left, no slot needed</div>' : '') + '</div>' + btn + '</div>';
    }).join('');
    el.innerHTML = '<div class="pgr-card pgr-hero"><h3>Charms</h3><p class="pgr-sub" style="margin:0">Buy charms with ⭐ Stars and equip up to ' + S.slots + ' (more slots can be unlocked). Their effects stack and reach the Disc Clicker, the wheel, orders, Points and EXP, and some work inside the games while you play. Wheel trials work without a slot. Spend Stars to level an owned charm up to level 3 for a bigger bonus.</p></div>' +
      '<div class="pgr-slots">' + slots + '</div>' +
      '<div class="pgr-row" style="margin-bottom:10px">' + [['all', 'All'], ['app', 'App'], ['game', 'In the games'], ['daily', 'Daily gifts']].map(function(f){ return '<button type="button" class="pgr-pre" data-cfilter="' + f[0] + '" style="' + (charmFilter === f[0] ? 'background:linear-gradient(90deg,#6ee7d0,#b79bff);color:#0c0d10;border-color:transparent' : '') + '">' + f[1] + '</button>'; }).join('') + '</div>' + list;
  }
  function charmAction(id, act){
    var c = charmById(id); if (!c) return;
    if (act === 'buy'){
      if (S.charms.own[id]) return;
      if (!PP.spendStars(c.p)){ toast('You need ' + (c.p - S.stars) + ' more ⭐ Stars'); return; }
      S.charms.own[id] = 1; save(true); chime(); toast(c.icon + ' ' + c.n + ' is yours. Equip it!');
    } else if (act === 'equip'){
      if (S.charms.eq.length >= S.slots){ toast('All slots are full. Unequip a charm first.'); return; }
      if (!S.charms.own[id] || S.charms.eq.indexOf(id) >= 0) return;
      S.charms.eq.push(id); PP.stat('equips', 1); save(true); blip(700, 0.1, 'triangle', 0.08);
    } else if (act === 'unequip'){
      S.charms.eq = S.charms.eq.filter(function(x){ return x !== id; }); save(true); blip(400, 0.08, 'triangle', 0.06);
    } else if (act === 'up'){
      if (!S.charms.own[id] || !canLevel(c)) return;
      var lv = charmLv(id); if (lv >= CHARM_MAX) return;
      var cost = levelCost(c);
      if (!PP.spendStars(cost)){ toast('You need ' + (cost - S.stars) + ' more ⭐ Stars'); return; }
      if (!S.charms.lv) S.charms.lv = {};
      S.charms.lv[id] = lv + 1; PP.stat('charmUps', 1); save(true); chime(); toast('⬆️ ' + c.icon + ' ' + c.n + ' is now level ' + (lv + 1));
    }
    renderActive(); checkAch();
  }
  function slotAction(i){
    if (i < S.slots) return;
    var cost = i === 3 ? 150 : 600;
    if (i !== S.slots){ toast('Unlock the slots in order.'); return; }
    if (!PP.spendStars(cost)){ toast('You need ' + (cost - S.stars) + ' more ⭐ Stars'); return; }
    S.slots++; save(true); chime(); toast('🔓 Charm slot ' + (i + 1) + ' unlocked'); renderActive();
  }

  /* ------------------------------------------------------------------ the floating button, Home strip, games grid, settings */
  var fab = document.createElement('button');
  fab.id = 'pgr-fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Open the Playground');
  function emblem(){ try { return window.__ppEmblem ? window.__ppEmblem() : ''; } catch(e){ return ''; } }
  fab.innerHTML = '<span class="pgr-emb">' + emblem() + '</span>';
  fab.addEventListener('click', function(e){
    if (Date.now() < fabSuppress){ e.preventDefault(); return; }   // the end of a drag isn't a tap
    blip(600, 0.07, 'triangle', 0.07); PP.open();
  });
  document.body.appendChild(fab);

  // Drag the button anywhere, like Bloopy: it squashes while you pull it and springs back when you let go.
  // The spot is saved; turning it off in Settings removes it.
  var FAB_POS = 'pgrFabPos', fabSuppress = 0;
  var fabCss = document.createElement('style');
  fabCss.textContent = '@keyframes pgrStrain{0%,100%{transform:scale(1.1,.9)}50%{transform:scale(.9,1.1)}}@keyframes pgrSnap{0%{transform:scale(1.25,.75)}40%{transform:scale(.85,1.15)}70%{transform:scale(1.05,.95)}100%{transform:scale(1)}}' +
    '#pgr-fab{touch-action:none}#pgr-fab.pgr-strain{animation:pgrStrain .16s ease-in-out infinite;cursor:grabbing}#pgr-fab.pgr-snap{animation:pgrSnap .45s ease-out}';
  document.head.appendChild(fabCss);
  function fabMove(x, y){
    var w = fab.offsetWidth || 52, h = fab.offsetHeight || 52;
    x = Math.max(4, Math.min(innerWidth - w - 4, x)); y = Math.max(4, Math.min(innerHeight - h - 4, y));
    fab.style.left = x + 'px'; fab.style.top = y + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto';
  }
  function fabPlace(){
    var p = null; try { p = JSON.parse(localStorage.getItem(FAB_POS)); } catch(e){}
    if (p && isFinite(p.x) && isFinite(p.y)) fabMove(p.x, p.y);
  }
  (function(){
    var sx, sy, ox, oy, moved = false, down = false;
    function move(e){
      if (!down) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved){ if (Math.hypot(dx, dy) < 6) return; moved = true; fab.classList.remove('pgr-snap'); fab.classList.add('pgr-strain'); }
      fabMove(ox + dx, oy + dy);
    }
    function end(){
      if (!down) return; down = false;
      removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
      fab.classList.remove('pgr-strain');
      if (moved){
        fab.classList.add('pgr-snap'); setTimeout(function(){ fab.classList.remove('pgr-snap'); }, 500);
        var r = fab.getBoundingClientRect();
        try { localStorage.setItem(FAB_POS, JSON.stringify({ x: r.left, y: r.top })); } catch(e){}
        fabSuppress = Date.now() + 300;
      }
    }
    fab.addEventListener('pointerdown', function(e){
      if (e.button > 0) return;
      var r = fab.getBoundingClientRect(); down = true; moved = false; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
    });
  })();
  fabPlace();
  addEventListener('resize', fabPlace);
  function updateFab(){
    var show = on() && S.opts.fab && !hubOpen();
    fab.style.display = show ? '' : 'none';
    var n = PP.claimable() + (spinReady() ? 1 : 0), d = fab.querySelector('.pgr-dot');
    if (n && show){ if (!d){ d = document.createElement('span'); d.className = 'pgr-dot'; fab.appendChild(d); } d.textContent = n; } else if (d) d.remove();
  }
  PP.homeStrip = function(){
    var oc = PP.claimable();
    return '<div class="pgr-strip">' +
      '<button type="button" class="pgr-sb" data-pgr-open="stage"><span class="pgr-emb sm">' + emblem() + '</span> Playground' + (spinReady() ? '<span class="pgr-dot">1</span>' : '') + '</button>' +
      '<button type="button" class="pgr-sb" data-pgr-open="orders">🧾 Orders' + (oc ? '<span class="pgr-dot">' + oc + '</span>' : '') + '</button>' +
      '<button type="button" class="pgr-sb" data-pgr-open="charms">🧿 Charms</button>' +
      '<button type="button" class="pgr-sb" data-pgr-open="shop">🛍️ Star Shop</button>' +
      '<span class="pgr-sb" style="cursor:default">⭐ ' + fmt(S.stars) + '</span></div>';
  };

  function decorateGrid(){
    var g = window.__ppGames && window.__ppGames.grid; if (!g) return;
    g.querySelectorAll('.ppg-card').forEach(function(c){
      var r = c.querySelector('.pgr-free-ribbon');
      if (on()){
        if (!r){ r = document.createElement('span'); r.className = 'pgr-free pgr-free-ribbon'; r.textContent = 'FREE PLAY'; c.style.position = 'relative'; c.appendChild(r); }
      } else if (r) r.remove();
    });
  }
  function buildSettings(){
    if (document.getElementById('pgr-settings-section')) return;
    var host = document.getElementById('pp-modes-section'); if (!host || !host.parentNode) return;
    var sec = document.createElement('div');
    sec.className = 'settings-section'; sec.id = 'pgr-settings-section';
    sec.innerHTML = '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Playground</div><div class="settings-row-sub">Orders, charms, the daily wheel and more.</div></div><button type="button" class="settings-toggle-btn" id="pgr-open-btn">Open</button></div>' +
      '<div class="settings-row" style="margin-top:12px"><div class="settings-row-text"><div class="settings-row-title">Playground button</div><div class="settings-row-sub">The round floating Playground button. Drag it anywhere; turn this off to remove it.</div></div><label class="settings-switch"><input type="checkbox" id="pgr-opt-fab"><span class="settings-switch-track"><span class="settings-switch-thumb"></span></span></label></div>' +
      '<div class="settings-row" style="margin-top:12px"><div class="settings-row-text"><div class="settings-row-title">Playground sounds</div><div class="settings-row-sub">Small chimes and clicks.</div></div><label class="settings-switch"><input type="checkbox" id="pgr-opt-sfx"><span class="settings-switch-track"><span class="settings-switch-thumb"></span></span></label></div>';
    host.parentNode.insertBefore(sec, host.nextSibling);
    sec.querySelector('#pgr-open-btn').addEventListener('click', function(){ PP.open(); });
    var f = sec.querySelector('#pgr-opt-fab'), s = sec.querySelector('#pgr-opt-sfx');
    f.checked = !!S.opts.fab; s.checked = !!S.opts.sfx;
    f.addEventListener('change', function(){ S.opts.fab = f.checked; save(true); updateFab(); });
    s.addEventListener('change', function(){ S.opts.sfx = s.checked; save(true); });
  }

  /* ------------------------------------------------------------------ Points achievements */
  var ACH = [
    ['pg_on',     'Welcome to the Playground', 'Turn on Press Play Playground',      50,  function(){ return on() ? 1 : 0; }, 1],
    ['pg_spin1',  'First Spin',                'Spin the daily wheel',               15,  function(){ return PP.get('spins'); }, 1],
    ['pg_spin25', 'Spin Doctor',               'Spin the wheel 25 times',            60,  function(){ return PP.get('spins'); }, 25],
    ['pg_ord1',   'Order Up!',                 'Finish an order',                    15,  function(){ return S.orders.done; }, 1],
    ['pg_ord25',  'Dinner Rush',               'Finish 25 orders',                   80,  function(){ return S.orders.done; }, 25],
    ['pg_charm1', 'Charmed',                   'Buy a charm',                        20,  function(){ return Object.keys(S.charms.own).length; }, 1],
    ['pg_full',   'Full House',                'Have 3 charms equipped',             40,  function(){ return S.charms.eq.length; }, 3],
    ['pg_star250','Star Collector',            'Earn 250 Stars',                     50,  function(){ return S.total; }, 250],
    ['pg_star2k', 'Star Hoarder',              'Earn 2,000 Stars',                   150, function(){ return S.total; }, 2000],
    ['pg_game30', 'Free Player',               'Play games for 30 minutes in Playground', 40, function(){ return PP.get('gameMs') / 60000; }, 30],
    ['pg_click1k','Disc Jockey',               'Click the disc 1,000 times in Playground', 40, function(){ return PP.get('clicks'); }, 1000],
    ['pg_gold1',  'Golden Touch',              'Spin the Golden Wheel',              40,  function(){ return PP.get('golden'); }, 1],
    ['pg_streak7','Seven Days of Spin',        'Reach a 7-day wheel streak',         60,  function(){ return S.wheel.streak; }, 7],
    ['pg_charm10','Collector',                 'Own 10 charms',                      80,  function(){ return Object.keys(S.charms.own).length; }, 10],
    ['pg_eq10',   'Well Tuned',                'Set the equalizer from the Stage 10 times', 25, function(){ return PP.get('eq'); }, 10],
    ['pg_spend1k','Big Spender',               'Spend 1,000 Stars',                  60,  function(){ return S.spent || 0; }, 1000],
    ['pg_spend10k','High Roller',              'Spend 10,000 Stars',                 180, function(){ return S.spent || 0; }, 10000],
    ['pg_cup1',   'Polished',                  'Level a charm up',                   25,  function(){ return PP.get('charmUps'); }, 1],
    ['pg_cmax',   'Charm Master',              'Take a charm to level 3',            70,  function(){ return Object.keys(S.charms.lv || {}).filter(function(id){ return S.charms.lv[id] >= CHARM_MAX; }).length; }, 1]
  ];
  PP.registerAch = function(list){
    var T = window.__ppPoints; if (!T || !T.META) return;
    list.forEach(function(a){
      if (T.META.some(function(m){ return m.id === a[0]; })) return;
      T.META.push({ id:a[0], n:a[1], d:a[2], p:a[3], f:a[4], v:a[5] });
    });
  };
  var achT = null;
  function checkAch(){ clearTimeout(achT); achT = setTimeout(function(){ try { if (window.__ppPoints && window.__ppPoints.check) window.__ppPoints.check(); } catch(e){} }, 250); }
  PP.checkAch = checkAch;
  PP.registerAch(ACH);

  /* ------------------------------------------------------------------ the one-second heartbeat */
  var lastTick = Date.now(), beat = 0;
  setInterval(function(){
    var now = Date.now(), dt = Math.min(5000, now - lastTick); lastTick = now; beat++;
    if (!on()){ updateFab(); return; }
    var A = document.getElementById('audio'), V = document.getElementById('video-el');
    var playing = (V && V.currentSrc && !V.paused && !V.ended) || (A && A.currentSrc && !A.paused && !A.ended);
    if (playing) S.stats.listenMs = (S.stats.listenMs || 0) + dt;
    if (document.body.classList.contains('pp-gaming')){
      S.stats.gameMs = (S.stats.gameMs || 0) + dt; S.gameStarMs += dt;
      while (S.gameStarMs >= 60000){ S.gameStarMs -= 60000; PP.addStars(1, 'for playing', true); }
    }
    if (beat % 5 === 0){ decorateGrid(); buildSettings(); runDrips(); checkAch(); save(); }
    if (hubOpen()){
      refreshBalance();
      if (activeDef && activeDef.live) { try { activeDef.live(); } catch(e){} }
      renderTabs();
    } else updateFab();
  }, 1000);

  /* react to the mode being switched */
  var lastOn = on();
  new MutationObserver(function(){
    var now = on();
    if (now !== lastOn){
      lastOn = now;
      if (now){ fillOrders(); runDrips(); chime(); setTimeout(function(){ toast('🎪 Playground is on. Tap the 🎪 button to open it.'); }, 900); }
      else if (hubOpen()) hideHub();
      decorateGrid(); updateFab();
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('ppgate', function(e){ if (e.detail === 'playground') chime(); });

  fillOrders(); updateFab(); decorateGrid();
  setTimeout(buildSettings, 800); setTimeout(buildSettings, 3000);
})();
