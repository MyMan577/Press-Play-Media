/* Press Play Playground: the Star Shop.
   More things to spend ⭐ Stars on: Stars-for-Points trades, Groove Storms and groove packs, extra and golden spins,
   lucky-meter pips, album shards, 24-hour charm trials, streak shields and the Star Vault (lock Stars for a day, get more back).
   One item a day is the Daily Deal at 40% off. Charm levels and order swaps live in pp-playground.js. */
(function(){
  'use strict';
  var PP = window.PPPlayground; if (!PP) return;
  var S = PP.S, esc = PP.esc, fmt = PP.fmt;
  if (!S.shop || typeof S.shop !== 'object') S.shop = {};
  if (!S.vault || typeof S.vault !== 'object') S.vault = { amt:0, until:0 };
  if (!S.shield || typeof S.shield !== 'object') S.shield = { order:0, wheel:0 };

  var DAY = 864e5, VAULT_MS = DAY, VAULT_BONUS = 0.15, VAULT_MIN = 50, VAULT_MAX = 2000, SHIELD_MAX = 2, DEAL_OFF = 0.4, TRADE_CAP = 400;

  function today(){
    var d = PP.dayKey();
    if (S.shop.d !== d) S.shop = { d:d, n:{}, traded:0 };
    if (!S.shop.n) S.shop.n = {};
    if (typeof S.shop.traded !== 'number') S.shop.traded = 0;
    return S.shop;
  }
  function bought(id){ return today().n[id] || 0; }
  function pointsOk(){ return !!(window.__ppPoints && window.__ppPoints.earn); }
  function shards(){ return S.album && typeof S.album.shards === 'number' ? S.album.shards : null; }

  /* ------------------------------------------------------------------ Stars for Points */
  var TRADES = [
    { id:'t10',  stars:10,  pts:15 },
    { id:'t50',  stars:50,  pts:80 },
    { id:'t200', stars:200, pts:350 }
  ];
  function trade(id){
    var t = null; TRADES.forEach(function(x){ if (x.id === id) t = x; }); if (!t) return;
    if (!pointsOk()){ PP.toast('Press Play Points are still loading. Try again in a moment.'); return; }
    var sh = today();
    if (sh.traded + t.stars > TRADE_CAP){ PP.toast('You can trade ' + Math.max(0, TRADE_CAP - sh.traded) + ' more ⭐ for Points today'); return; }
    if (!PP.spendStars(t.stars)){ PP.toast('You need ' + (t.stars - S.stars) + ' more ⭐ Stars'); return; }
    sh.traded += t.stars; PP.stat('trades', 1); PP.stat('tradedStars', t.stars);
    try { window.__ppPoints.earn(t.pts, 'Star trade in the Playground', true); } catch(e){}
    PP.save(true); PP.chime(); PP.toast('▶️ Traded ' + t.stars + ' ⭐ for ' + t.pts + ' Press Play Points');
    rerender();
  }

  /* ------------------------------------------------------------------ the shop items */
  var ITEMS = [
    { id:'storm',  sec:'boost', icon:'🌩️', n:'Groove Storm',      d:'Clicks and grooves ×2 for 10 minutes (×3 and longer with Storm Caller).', p:45,  lim:3,
      give:function(){ PP.startStorm(10 * 60000); return ''; } },
    { id:'mega',   sec:'boost', icon:'⛈️', n:'Mega Storm',        d:'A 30-minute Groove Storm.', p:120, lim:1,
      give:function(){ PP.startStorm(30 * 60000); return ''; } },
    { id:'pack',   sec:'boost', icon:'🎵', n:'Groove Pack',       d:'20 minutes of your groove production, right now.', p:15, lim:5,
      give:function(){ var g = Math.round(Math.max(5000, PP.ps() * 1200)); return PP.addGrooves(g) ? '+' + fmt(g) + ' grooves' : null; } },
    { id:'spin',   sec:'wheel', icon:'🎟️', n:'Extra Daily Spin',  d:'One more spin of the Daily Wheel. It fills the lucky meter too.', p:25, lim:3,
      give:function(){ S.spins++; return 'a spare spin is waiting on the Stage'; } },
    { id:'pip',    sec:'wheel', icon:'🍀', n:'Lucky Pip',         d:'+1 on the lucky meter (7 pips make a Golden Spin).', p:20, lim:3,
      give:function(){ PP.fillMeter(1); return 'lucky meter ' + S.wheel.meter + '/7'; } },
    { id:'golden', sec:'wheel', icon:'✨', n:'Golden Spin',       d:'A spin of the Golden Wheel.', p:150, lim:1,
      give:function(){ S.wheel.golden++; return 'a Golden Spin is ready'; } },
    { id:'shards', sec:'album', icon:'💠', n:'Shard Pouch',       d:'+25 ✨ shards for leveling and crafting album cards.', p:40, lim:4,
      give:function(){ if (shards() === null) return null; S.album.shards += 25; return '+25 ✨ shards'; } },
    { id:'ticket', sec:'album', icon:'🎴', n:'Ticket Bundle',     d:'5 album pull tickets (a pull costs 12 ⭐ on its own).', p:50, lim:2,
      give:function(){ PP.addTickets(5); return '+5 pull tickets'; } },
    { id:'wshield',sec:'safe',  icon:'🛡️', n:'Wheel Streak Shield', d:'Keeps your Daily Wheel streak the next time you miss a day. Hold up to ' + SHIELD_MAX + '.', p:40, lim:0,
      can:function(){ return S.shield.wheel < SHIELD_MAX || 'You already hold ' + SHIELD_MAX + ' wheel shields'; },
      give:function(){ S.shield.wheel++; return 'you hold ' + S.shield.wheel; } },
    { id:'oshield',sec:'safe',  icon:'🧾', n:'Order Shield',      d:'Keeps your order streak the next time an order runs out. Hold up to ' + SHIELD_MAX + '.', p:25, lim:0,
      can:function(){ return S.shield.order < SHIELD_MAX || 'You already hold ' + SHIELD_MAX + ' order shields'; },
      give:function(){ S.shield.order++; return 'you hold ' + S.shield.order; } }
  ];
  var SECS = [['boost', 'Boosts'], ['wheel', 'The wheel'], ['album', 'Album'], ['safe', 'Streak protection']];
  function itemById(id){ for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i]; return null; }
  function dealId(){
    var d = today().d, h = 0;
    for (var i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) >>> 0;
    return ITEMS[h % ITEMS.length].id;
  }
  function price(it){ return it.id === dealId() ? Math.max(1, Math.round(it.p * (1 - DEAL_OFF))) : it.p; }
  function buy(id){
    var it = itemById(id); if (!it) return;
    if (it.lim && bought(id) >= it.lim){ PP.toast('Sold out for today. Back tomorrow.'); return; }
    var ok = it.can ? it.can() : true; if (ok !== true){ PP.toast(ok); return; }
    if (it.id === 'shards' && shards() === null){ PP.toast('The album is still loading. Try again in a moment.'); return; }
    var cost = price(it);
    if (!PP.spendStars(cost)){ PP.toast('You need ' + (cost - S.stars) + ' more ⭐ Stars'); return; }
    var msg = null; try { msg = it.give(); } catch(e){}
    if (msg === null){ S.stars += cost; S.spent -= cost; PP.save(true); PP.toast('That did not work. Your Stars were given back.'); rerender(); return; }
    today().n[id] = bought(id) + 1; PP.stat('shopBuys', 1); PP.save(true); PP.chime();
    if (msg) PP.toast(it.icon + ' ' + it.n + ': ' + msg);
    rerender();
  }

  /* ------------------------------------------------------------------ charm trials */
  function trialCost(c){ return Math.max(10, Math.ceil(c.p * 0.15)); }
  function trial(id){
    var c = null; (PP.CHARMS || []).forEach(function(x){ if (x.id === id) c = x; });
    if (!c || S.charms.own[id]) return;
    var cost = trialCost(c);
    if (!PP.spendStars(cost)){ PP.toast('You need ' + (cost - S.stars) + ' more ⭐ Stars'); return; }
    S.trials[id] = Math.max(Date.now(), S.trials[id] || 0) + DAY;
    PP.stat('shopBuys', 1); PP.save(true); PP.chime(); PP.toast('🧪 ' + c.icon + ' ' + c.n + ' is on trial for 24h (no slot needed)');
    rerender();
  }

  /* ------------------------------------------------------------------ the Star Vault */
  function vaultReady(){ return S.vault.amt > 0 && Date.now() >= S.vault.until; }
  function vaultBack(){ return Math.round(S.vault.amt * (1 + VAULT_BONUS)); }
  function deposit(n){
    if (S.vault.amt > 0) return;
    n = Math.min(VAULT_MAX, Math.floor(n));
    if (n < VAULT_MIN){ PP.toast('The vault takes at least ' + VAULT_MIN + ' ⭐'); return; }
    if (!PP.spendStars(n)){ PP.toast('You need ' + (n - S.stars) + ' more ⭐ Stars'); return; }
    S.spent -= n;   // a deposit is not spending: the Stars come back
    S.vault = { amt:n, until:Date.now() + VAULT_MS }; PP.save(true); PP.blip(440, 0.15, 'triangle', 0.08);
    PP.toast('🏦 ' + n + ' ⭐ locked in the vault. Come back in 24 hours for ' + vaultBack() + ' ⭐');
    rerender();
  }
  function claimVault(){
    if (!vaultReady()) return;
    var back = vaultBack(), amt = S.vault.amt;
    S.vault = { amt:0, until:0 };
    S.stars += amt; PP.addStars(back - amt, '', true); PP.stat('vaults', 1); PP.save(true); PP.chime();
    PP.toast('🏦 The vault paid out ' + back + ' ⭐ (+' + (back - amt) + ')');
    rerender();
  }
  function timeLeft(ms){ var m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; }

  /* ------------------------------------------------------------------ the tab */
  var css = document.createElement('style'); css.id = 'pgs-style';
  css.textContent = [
    '.pgs-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:var(--bg,#0c0d10);border:1px solid var(--line,#232429);margin-bottom:10px}',
    '.pgs-item.deal{border-color:rgba(255,214,110,.7);box-shadow:0 0 16px rgba(255,214,110,.15)}',
    '.pgs-item .i{font-size:26px;width:38px;text-align:center;flex:0 0 auto}.pgs-item .m{flex:1;min-width:0}.pgs-item b{font-size:13.5px}',
    '.pgs-old{text-decoration:line-through;opacity:.6;margin-right:4px;font-weight:600}',
    '.pgs-tag{font-size:9.5px;font-weight:800;letter-spacing:.04em;margin-left:6px;padding:1px 6px;border-radius:6px;background:linear-gradient(90deg,#ffd66e,#ffb020);color:#0c0d10;vertical-align:1px}',
    '.pgs-h{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim,#8b8c93);margin:16px 2px 8px}',
    '.pgs-trades{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}',
    '.pgs-trade{display:flex;flex-direction:column;align-items:center;gap:3px;padding:12px 6px;border-radius:14px;border:1px solid var(--line,#232429);background:var(--bg,#0c0d10);color:inherit;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.pgs-trade:active{transform:scale(.96)}.pgs-trade[disabled]{opacity:.45;cursor:default;transform:none}',
    '.pgs-trade b{font-size:15px}.pgs-trade small{font-size:11px;color:var(--text-dim,#8b8c93)}',
    '.pgs-vault{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}'
  ].join('\n');
  document.head.appendChild(css);

  var tabEl = null;
  function rerender(){ PP.reflow('shop'); }   // only redraws while the Star Shop tab is the one open
  function itemHTML(it){
    var deal = it.id === dealId(), cost = price(it), n = bought(it.id), out = it.lim && n >= it.lim, can = it.can ? it.can() : true;
    var left = it.lim ? (out ? 'Sold out today' : (it.lim - n) + ' left today') : '';
    var btn = '<button type="button" class="pgr-btn sm" data-pgs-buy="' + it.id + '"' + (out || can !== true ? ' disabled' : '') + (S.stars < cost ? ' style="opacity:.55"' : '') + '>' +
      (deal ? '<span class="pgs-old">' + it.p + '</span>' : '') + '⭐ ' + cost + '</button>';
    return '<div class="pgs-item' + (deal ? ' deal' : '') + '"><div class="i">' + it.icon + '</div><div class="m"><b>' + esc(it.n) + '</b>' + (deal ? '<span class="pgs-tag">DAILY DEAL −40%</span>' : '') +
      '<div class="pgr-meta">' + esc(it.d) + '</div>' + (left || can !== true ? '<div class="pgr-meta" style="margin-top:2px">' + esc(can !== true ? can : left) + '</div>' : '') + '</div>' + btn + '</div>';
  }
  function render(el){
    tabEl = el; var sh = today(), tleft = Math.max(0, TRADE_CAP - sh.traded), pts = pointsOk();
    var trades = TRADES.map(function(t){
      var off = !pts || t.stars > tleft;
      return '<button type="button" class="pgs-trade" data-pgs-trade="' + t.id + '"' + (off ? ' disabled' : '') + '><small>⭐ ' + t.stars + ' Stars</small><b>▶️ ' + t.pts + '</b><small>Points</small></button>';
    }).join('');
    var vault;
    if (vaultReady()) vault = '<p class="pgr-sub" style="margin:6px 0 0">Your ' + S.vault.amt + ' ⭐ are ready.</p><div class="pgs-vault"><button type="button" class="pgr-btn" data-pgs-vclaim>🏦 Collect ' + vaultBack() + ' ⭐</button></div>';
    else if (S.vault.amt > 0) vault = '<p class="pgr-sub" style="margin:6px 0 0">' + S.vault.amt + ' ⭐ locked. ' + vaultBack() + ' ⭐ come back in <span id="pgs-vleft">' + timeLeft(S.vault.until - Date.now()) + '</span>.</p>';
    else {
      var opts = [50, 100, 250, 500].filter(function(v){ return v <= VAULT_MAX; });
      var all = Math.min(VAULT_MAX, S.stars);
      vault = '<div class="pgs-vault">' + opts.map(function(v){ return '<button type="button" class="pgr-btn sm alt" data-pgs-dep="' + v + '"' + (S.stars < v ? ' disabled' : '') + '>Lock ' + v + ' ⭐</button>'; }).join('') +
        (all >= VAULT_MIN && opts.indexOf(all) < 0 ? '<button type="button" class="pgr-btn sm alt" data-pgs-dep="' + all + '">Lock ' + fmt(all) + ' ⭐</button>' : '') + '</div>';
    }
    var unowned = (PP.CHARMS || []).filter(function(c){ return !S.charms.own[c.id]; }), now = Date.now();
    var trials = unowned.length ? unowned.map(function(c){
      var on = S.trials[c.id] > now, cost = trialCost(c);
      return '<div class="pgs-item"><div class="i">' + c.icon + '</div><div class="m"><b>' + esc(c.n) + '</b><div class="pgr-meta">' + esc(c.d) + '</div>' +
        (on ? '<div class="pgr-meta" style="color:#b79bff">🧪 ' + timeLeft(S.trials[c.id] - now) + ' left (another buy adds 24h)</div>' : '') + '</div>' +
        '<button type="button" class="pgr-btn sm" data-pgs-trial="' + c.id + '"' + (S.stars < cost ? ' style="opacity:.55"' : '') + '>⭐ ' + cost + '</button></div>';
    }).join('') : '<p class="pgr-note">You own every charm. Nothing left to try.</p>';

    el.innerHTML = '<div class="pgr-card pgr-hero"><h3>Star Shop</h3><p class="pgr-sub" style="margin:0">More ways to spend ⭐ Stars: trade them for Press Play Points, buy boosts and spins, protect your streaks, or lock them in the vault for a bonus. Stock refreshes every day, and one item is the Daily Deal.</p>' +
      '<div class="pgr-chips"><span class="pgr-chip">⭐ ' + fmt(S.stars) + ' Stars</span><span class="pgr-chip">🛍️ ' + fmt(S.spent || 0) + ' spent</span>' + (S.shield.wheel || S.shield.order ? '<span class="pgr-chip">🛡️ ' + S.shield.wheel + ' wheel · ' + S.shield.order + ' order</span>' : '') + '</div></div>' +
      '<div class="pgr-card"><h3>▶️ Trade Stars for Points</h3><p class="pgr-sub" style="margin:0">Turn Stars into Press Play Points for the Points shop. Bigger trades give a better rate. You can trade up to ' + TRADE_CAP + ' ⭐ a day (' + tleft + ' left today).' + (pts ? '' : ' Points are still loading.') + '</p>' +
      '<div class="pgs-trades">' + trades + '</div></div>' +
      SECS.map(function(s){ return '<div class="pgs-h">' + s[1] + '</div>' + ITEMS.filter(function(it){ return it.sec === s[0]; }).map(itemHTML).join(''); }).join('') +
      '<div class="pgr-card" style="margin-top:16px"><h3>🏦 Star Vault</h3><p class="pgr-sub" style="margin:0">Lock ' + VAULT_MIN + '–' + fmt(VAULT_MAX) + ' ⭐ away for 24 hours and get them back with +' + Math.round(VAULT_BONUS * 100) + '%. One deposit at a time.</p>' + vault + '</div>' +
      '<details class="pgr-det pgr-card"><summary>🧪 Charm trials (24h)</summary><p class="pgr-sub" style="margin:8px 0">Try a charm you do not own for a day. It works without a slot.</p>' + trials + '</details>';
  }
  function live(){
    var v = document.getElementById('pgs-vleft');
    if (v) v.textContent = timeLeft(S.vault.until - Date.now());
    if (S.vault.amt > 0 && vaultReady() && v) rerender();
    if (S.shop.d !== PP.dayKey()) rerender();
  }
  document.getElementById('pgr-body').addEventListener('click', function(e){
    var b;
    if ((b = e.target.closest('[data-pgs-trade]'))){ trade(b.getAttribute('data-pgs-trade')); return; }
    if ((b = e.target.closest('[data-pgs-buy]'))){ buy(b.getAttribute('data-pgs-buy')); return; }
    if ((b = e.target.closest('[data-pgs-trial]'))){ trial(b.getAttribute('data-pgs-trial')); return; }
    if ((b = e.target.closest('[data-pgs-dep]'))){ deposit(+b.getAttribute('data-pgs-dep')); return; }
    if (e.target.closest('[data-pgs-vclaim]')){ claimVault(); return; }
  });
  PP.registerTab({ id:'shop', label:'🛍️ Star Shop', order:35, render:render, live:live, badge:function(){ return vaultReady() ? 1 : 0; } });

  PP.addOrderKind({ id:'shop', stat:'shopBuys', unit:'', t:function(n){ return n === 1 ? 'Buy something in the Star Shop' : 'Buy ' + n + ' things in the Star Shop'; }, tgt:[1, 2, 3] });
  PP.registerAch([
    ['pg_trade1',  'Exchange Rate',  'Trade Stars for Points',          15, function(){ return PP.get('trades'); }, 1],
    ['pg_trade1k', 'Star Broker',    'Trade 1,000 Stars for Points',    80, function(){ return PP.get('tradedStars'); }, 1000],
    ['pg_shop10',  'Window Shopper', 'Buy 10 things in the Star Shop',  30, function(){ return PP.get('shopBuys'); }, 10],
    ['pg_vault1',  'Vault Keeper',   'Collect from the Star Vault',     30, function(){ return PP.get('vaults'); }, 1]
  ]);
})();
