/* =====================================================================
   Press Play Points (PPP). Lives on the Games page.
   Earn points from daily and weekly quests and from achievements in the
   games (the games report through games/pp-hub.js). Spend them in the Shop
   on game currencies, boosts and unlocks, or on Press Play rewards.
   Storage: localStorage 'ppPointsV1'. Games are same-origin iframes, so
   shop purchases write straight into a game's own save while it is closed.
===================================================================== */
(function(){
  'use strict';
  var KEY = 'ppPointsV1';
  var GAMES = (window.__ppGames && window.__ppGames.list) || [];
  if (!GAMES.length) return;
  var NAME = {}; GAMES.forEach(function(g){ NAME[g.id] = g.name; });
  var MIN = 60000;

  /* ---------------- helpers ---------------- */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function fmt(n){ return Math.floor(n).toLocaleString('en-US'); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function dayKey(d){ d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function weekKey(){ var d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d); }
  function pick(a){ return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a){ a = a.slice(); for (var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function jget(k){ try { var o = JSON.parse(localStorage.getItem(k)); return o && typeof o === 'object' ? o : null; } catch(e){ return null; } }
  function jpatch(k, fn, dflt){
    var o = jget(k);
    if (!o){ if (dflt === undefined) return false; o = dflt; }
    fn(o);
    try { localStorage.setItem(k, JSON.stringify(o)); return true; } catch(e){ return false; }
  }
  function iget(k){ try { return Math.max(0, parseInt(localStorage.getItem(k) || '0', 10) || 0); } catch(e){ return 0; } }
  function iadd(k, n){ try { localStorage.setItem(k, String(iget(k) + n)); return true; } catch(e){ return false; } }
  // Press Play Playground: every Press Play exclusive that a game checks for is free while the mode is on
  function pgFree(){ try { return localStorage.getItem('ppPlaygroundMode') === '1'; } catch(e){ return false; } }
  // The Press Play Playground emblem, drawn as an image (a play-button ring, equalizer bars and sparkles). Each call gets its own gradient ids.
  var embN = 0;
  window.__ppEmblem = function(){
    var n = ++embN, g = 'ppemg' + n, b = 'ppemb' + n;
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="width:100%;height:100%;display:block"><defs>'
      + '<linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ee7d0"/><stop offset=".55" stop-color="#8b5cff"/><stop offset="1" stop-color="#ff5fd8"/></linearGradient>'
      + '<radialGradient id="' + b + '" cx=".3" cy=".2" r="1.05"><stop offset="0" stop-color="#34246e"/><stop offset="1" stop-color="#0c0d10"/></radialGradient></defs>'
      + '<rect width="64" height="64" fill="url(#' + b + ')"/>'
      + '<path d="M10 29a22 22 0 0 1 22-22" fill="none" stroke="url(#' + g + ')" stroke-width="2" stroke-linecap="round" opacity=".5"/>'
      + '<path d="M54 29a22 22 0 0 1-22 22" fill="none" stroke="url(#' + g + ')" stroke-width="2" stroke-linecap="round" opacity=".5"/>'
      + '<circle cx="32" cy="29" r="15" fill="#0c0d10" stroke="url(#' + g + ')" stroke-width="4"/>'
      + '<path d="M27.6 21.5v15l12.4-7.5z" fill="#fff"/>'
      + '<g fill="url(#' + g + ')"><rect x="15" y="53" width="5" height="6" rx="2.5"/><rect x="23" y="49" width="5" height="10" rx="2.5"/><rect x="31" y="46" width="5" height="13" rx="2.5"/><rect x="39" y="50" width="5" height="9" rx="2.5"/><rect x="47" y="54" width="5" height="5" rx="2.5"/></g>'
      + '<path d="M52 6l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#ffb36e"/>'
      + '<path d="M11 8l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#6ee7d0"/></svg>';
  };
  function pgPts(){ try { return window.PPPlayground && window.PPPlayground.mult ? window.PPPlayground.mult('points') : 1; } catch(e){ return 1; } }
  function musicOn(){ var b = document.getElementById('play-btn'); return !!(b && b.classList.contains('is-playing')); }
  function lateHour(){ var h = new Date().getHours(); return h >= 21 || h < 4; }

  var COIN = '<span class="ppx-coin" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.3" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.2"/><path d="M10 7.8v8.4l6.6-4.2z" fill="#fff"/></svg></span>';

  /* ---------------- state ---------------- */
  function freshPeriod(key){ return { key:key, ms:{}, tot:0, mus:0, late:0, ses:0, ev:{}, bt:{}, up:{}, ach:0, lis:0, buys:0, wins:0, days:0 }; }
  var P = jget(KEY) || {};
  P.pts = P.pts || 0; P.tot = P.tot || 0; P.spent = P.spent || 0;
  ['ach','nat','info','st','bo','m','own'].forEach(function(k){ if (!P[k] || typeof P[k] !== 'object') P[k] = {}; });
  if (!Array.isArray(P.log)) P.log = [];
  ['q','days','weeks','buys','lis','mus','late','visits'].forEach(function(k){ P.m[k] = P.m[k] || 0; });
  var dirty = false, saveT = null;
  function save(now){
    dirty = true;
    if (now){ flush(); return; }
    if (!saveT) saveT = setTimeout(flush, 1200);
  }
  function flush(){
    if (saveT){ clearTimeout(saveT); saveT = null; }
    if (!dirty) return;
    dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(P)); } catch(e){}
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function(){ if (document.hidden) flush(); });
  function gst(g){ var s = P.st[g]; if (!s){ s = P.st[g] = { ses:0, ms:0, ev:{}, bt:{} }; } return s; }

  /* ---------------- achievements ---------------- */
  // k: ses (times opened), min (minutes played), ev (event count), bt (best value)
  var COMMON = [
    { id:'ses1',  n:'First Visit',   d:'Open it for the first time',  p:5,  k:'ses', v:1 },
    { id:'ses10', n:'Regular',       d:'Open it 10 times',            p:15, k:'ses', v:10 },
    { id:'ses50', n:'Loyal Player',  d:'Open it 50 times',            p:40, k:'ses', v:50 },
    { id:'min15', n:'Warming Up',    d:'Play for 15 minutes in total', p:10, k:'min', v:15 },
    { id:'min60', n:'Hooked',        d:'Play for an hour in total',    p:25, k:'min', v:60 },
    { id:'min300',n:'Devoted',       d:'Play for 5 hours in total',    p:70, k:'min', v:300 }
  ];
  var GACH = {
    anteup: [
      { id:'blind1',  n:'Small Change',  d:'Clear your first blind',     p:10, k:'ev', e:'blind', v:1 },
      { id:'blind25', n:'Grinder',       d:'Clear 25 blinds',            p:30, k:'ev', e:'blind', v:25 },
      { id:'blind100',n:'Card Counter',  d:'Clear 100 blinds',           p:70, k:'ev', e:'blind', v:100 },
      { id:'boss1',   n:'Boss Buster',   d:'Beat a boss blind',          p:15, k:'ev', e:'boss', v:1 },
      { id:'boss10',  n:'Bounty Hunter', d:'Beat 10 boss blinds',        p:40, k:'ev', e:'boss', v:10 },
      { id:'ante4',   n:'Climbing',      d:'Reach ante 4',               p:20, k:'bt', e:'ante', v:4 },
      { id:'ante7',   n:'High Roller',   d:'Reach ante 7',               p:40, k:'bt', e:'ante', v:7 },
      { id:'win1',    n:'All In',        d:'Beat all ten antes',         p:100,k:'ev', e:'win', v:1 },
      { id:'win3',    n:'House Always Loses', d:'Win 3 full runs',       p:150,k:'ev', e:'win', v:3 }
    ],
    bastion: [
      { id:'bat1',  n:'Into Battle',    d:'Finish a battle',     p:5,  k:'ev', e:'battle', v:1 },
      { id:'bat25', n:'Old Soldier',    d:'Finish 25 battles',   p:30, k:'ev', e:'battle', v:25 },
      { id:'win1',  n:'Tower Toppler',  d:'Win a battle',        p:10, k:'ev', e:'win', v:1 },
      { id:'win10', n:'Siege Captain',  d:'Win 10 battles',      p:30, k:'ev', e:'win', v:10 },
      { id:'win50', n:'Warlord',        d:'Win 50 battles',      p:80, k:'ev', e:'win', v:50 },
      { id:'win150',n:'Bastion Legend', d:'Win 150 battles',     p:150,k:'ev', e:'win', v:150 }
    ],
    blob: [
      { id:'m1',   n:'Splat',         d:'Finish a match against the CPU', p:5,  k:'ev', e:'match', v:1 },
      { id:'m25',  n:'Blob Veteran',  d:'Play 25 matches against the CPU', p:35, k:'ev', e:'match', v:25 },
      { id:'w1',   n:'Top Blob',      d:'Beat the CPU',                  p:15, k:'ev', e:'win', v:1 },
      { id:'w10',  n:'Blob Boss',     d:'Beat the CPU 10 times',         p:40, k:'ev', e:'win', v:10 },
      { id:'w40',  n:'Barrage Master',d:'Beat the CPU 40 times',         p:90, k:'ev', e:'win', v:40 }
    ],
    lastcard: [
      { id:'g1',   n:'Shuffle Up',   d:'Finish a game',      p:5,  k:'ev', e:'game', v:1 },
      { id:'g50',  n:'Card Table',   d:'Finish 50 games',    p:40, k:'ev', e:'game', v:50 },
      { id:'w1',   n:'Last Card!',   d:'Win a game',         p:10, k:'ev', e:'win', v:1 },
      { id:'w10',  n:'Card Shark',   d:'Win 10 games',       p:25, k:'ev', e:'win', v:10 },
      { id:'w50',  n:'Full House',   d:'Win 50 games',       p:70, k:'ev', e:'win', v:50 },
      { id:'s3',   n:'On a Roll',    d:'Win 3 in a row',     p:25, k:'bt', e:'streak', v:3 },
      { id:'s5',   n:'Unstoppable',  d:'Win 5 in a row',     p:45, k:'bt', e:'streak', v:5 },
      { id:'s10',  n:'Untouchable',  d:'Win 10 in a row',    p:120,k:'bt', e:'streak', v:10 }
    ],
    nebula: [
      { id:'min5',  n:'Stargazer',    d:'Play for 5 minutes in total',  p:5,  k:'min', v:5 },
      { id:'min120',n:'Lost in Light',d:'Play for 2 hours in total',    p:45, k:'min', v:120 }
    ],
    toque: [
      { id:'w1',   n:'First Hunt',        d:'Win a fight',        p:10, k:'ev', e:'win', v:1 },
      { id:'w25',  n:'Seasoned Hunter',   d:'Win 25 fights',      p:30, k:'ev', e:'win', v:25 },
      { id:'w100', n:'Spirit of the Wild',d:'Win 100 fights',     p:70, k:'ev', e:'win', v:100 },
      { id:'lv5',  n:'Growing',           d:'Reach level 5',      p:10, k:'bt', e:'level', v:5 },
      { id:'lv10', n:'Growing Strong',    d:'Reach level 10',     p:20, k:'bt', e:'level', v:10 },
      { id:'lv25', n:'Veteran',           d:'Reach level 25',     p:45, k:'bt', e:'level', v:25 },
      { id:'ch3',  n:'Storyteller',       d:'Finish 3 chapters',  p:30, k:'bt', e:'chapter', v:3 },
      { id:'ch8',  n:'Legend of the Wild',d:'Finish all 8 chapters', p:100, k:'bt', e:'chapter', v:8 }
    ],
    weaponball: [
      { id:'run1', n:'Rogue Start',  d:'Start a Roguelite run',          p:5,  k:'ev', e:'run', v:1 },
      { id:'run20',n:'Rogue Regular',d:'Start 20 Roguelite runs',        p:30, k:'ev', e:'run', v:20 },
      { id:'r3',   n:'Survivor',     d:'Win round 3 in Roguelite',       p:15, k:'bt', e:'round', v:3 },
      { id:'r6',   n:'Gladiator',    d:'Win round 6 in Roguelite',       p:30, k:'bt', e:'round', v:6 },
      { id:'r10',  n:'Champion',     d:'Win round 10 in Roguelite',      p:60, k:'bt', e:'round', v:10 },
      { id:'r15',  n:'Unbreakable',  d:'Win round 15 in Roguelite',      p:120,k:'bt', e:'round', v:15 },
      { id:'rw50', n:'Ball Brawler', d:'Win 50 Roguelite rounds',        p:45, k:'ev', e:'round', v:50 }
    ],
    cube: [
      { id:'cl10', n:'Dash Machine',  d:'Clear 10 stages (replays count)', p:20, k:'ev', e:'clear', v:10 },
      { id:'cl50', n:'Stage Hopper',  d:'Clear 50 stages (replays count)', p:50, k:'ev', e:'clear', v:50 },
      { id:'k100', n:'Foe Smasher',   d:'Defeat 100 foes',                 p:20, k:'ev', e:'kill', v:100 },
      { id:'k1k',  n:'Army of One',   d:'Defeat 1,000 foes',               p:70, k:'ev', e:'kill', v:1000 },
      { id:'bs1',  n:'Boss Slayer',   d:'Beat a boss',                     p:15, k:'ev', e:'boss', v:1 },
      { id:'bs20', n:'Boss Hunter',   d:'Beat 20 bosses',                  p:80, k:'ev', e:'boss', v:20 },
      { id:'fl10', n:'Not a Scratch', d:'Clear 10 stages without getting hit', p:40, k:'ev', e:'flawless', v:10 },
      { id:'st15', n:'Deep Runner',   d:'Reach stage 15',                  p:35, k:'bt', e:'stage', v:15 },
      { id:'st30', n:'Stage Thirty',  d:'Reach stage 30',                  p:90, k:'bt', e:'stage', v:30 },
      { id:'en300',n:'Long Road',     d:'Go 300 m in Endless',             p:30, k:'bt', e:'endless', v:300 },
      { id:'en1k', n:'Endless Knight',d:'Go 1,000 m in Endless',           p:100,k:'bt', e:'endless', v:1000 },
      { id:'en20', n:'One More Run',  d:'Play 20 Endless runs',            p:30, k:'ev', e:'endless', v:20 }
    ],
    kitchen: [
      { id:'sv200', n:'Rush Regular', d:'Serve 200 orders',  p:30, k:'ev', e:'serve', v:200 }
    ],
    obby: [
      { id:'ow5',  n:'Course Clearer', d:'Finish 5 courses',  p:25, k:'ev', e:'win', v:5 },
      { id:'ow25', n:'Obby Pro',       d:'Finish 25 courses', p:60, k:'ev', e:'win', v:25 }
    ]
  };
  function achDefs(g){ return COMMON.concat(GACH[g] || []); }
  function achVal(g, a){
    var s = gst(g);
    if (a.k === 'ses') return s.ses;
    if (a.k === 'min') return s.ms / MIN;
    if (a.k === 'ev') return s.ev[a.e] || 0;
    if (a.k === 'bt') return s.bt[a.e] || 0;
    return 0;
  }
  // across the whole app
  var META = [
    { id:'pts100',  n:'Pocket Change',   d:'Earn 100 points',            p:10,  f:function(){ return P.tot; }, v:100 },
    { id:'pts500',  n:'Piggy Bank',      d:'Earn 500 points',            p:25,  f:function(){ return P.tot; }, v:500 },
    { id:'pts2000', n:'Treasure Chest',  d:'Earn 2,000 points',          p:60,  f:function(){ return P.tot; }, v:2000 },
    { id:'pts10k',  n:'Points Tycoon',   d:'Earn 10,000 points',         p:150, f:function(){ return P.tot; }, v:10000 },
    { id:'q1',      n:'Quest Taker',     d:'Complete a quest',           p:10,  f:function(){ return P.m.q; }, v:1 },
    { id:'q25',     n:'Adventurer',      d:'Complete 25 quests',         p:30,  f:function(){ return P.m.q; }, v:25 },
    { id:'q100',    n:'Questmaster',     d:'Complete 100 quests',        p:80,  f:function(){ return P.m.q; }, v:100 },
    { id:'q300',    n:'Living Legend',   d:'Complete 300 quests',        p:200, f:function(){ return P.m.q; }, v:300 },
    { id:'day1',    n:'Clean Sweep',     d:'Finish every daily quest in a day', p:20, f:function(){ return P.m.days; }, v:1 },
    { id:'day7',    n:'Full Week',       d:'Finish every daily quest on 7 days', p:50, f:function(){ return P.m.days; }, v:7 },
    { id:'day30',   n:'Month of Quests', d:'Finish every daily quest on 30 days', p:150, f:function(){ return P.m.days; }, v:30 },
    { id:'wk1',     n:'Weekly Warrior',  d:'Finish every weekly quest in a week', p:60, f:function(){ return P.m.weeks; }, v:1 },
    { id:'wk4',     n:'Month Strong',    d:'Finish every weekly quest in 4 weeks', p:150, f:function(){ return P.m.weeks; }, v:4 },
    { id:'tour3',   n:'Sampler',         d:'Play 3 different games',     p:10,  f:function(){ return playedCount(); }, v:3 },
    { id:'tourall', n:'Arcade Tourist',  d:'Play every game',            p:50,  f:function(){ return playedCount(); }, v:GAMES.length },
    { id:'buy1',    n:'First Purchase',  d:'Buy something in the Shop',  p:10,  f:function(){ return P.m.buys; }, v:1 },
    { id:'buy10',   n:'Regular Customer',d:'Buy 10 things in the Shop',  p:30,  f:function(){ return P.m.buys; }, v:10 },
    { id:'buy50',   n:'Big Spender',     d:'Buy 50 things in the Shop',  p:80,  f:function(){ return P.m.buys; }, v:50 },
    { id:'spend1k', n:'Splash Out',      d:'Spend 1,000 points',         p:50,  f:function(){ return P.spent; }, v:1000 },
    { id:'ach25',   n:'Collector',       d:'Unlock 25 achievements',     p:25,  f:function(){ return achCount(); }, v:25 },
    { id:'ach100',  n:'Trophy Room',     d:'Unlock 100 achievements',    p:80,  f:function(){ return achCount(); }, v:100 },
    { id:'ach200',  n:'Hall of Fame',    d:'Unlock 200 achievements',    p:200, f:function(){ return achCount(); }, v:200 },
    { id:'hrs10',   n:'Game Night',      d:'Play games for 10 hours in total', p:80, f:function(){ return totalMs() / 3600000; }, v:10 },
    { id:'lis10',   n:'Soundtrack',      d:'Listen to 10 hours of music', p:40, f:function(){ return P.m.lis / 3600000; }, v:10 },
    { id:'lis100',  n:'Audiophile',      d:'Listen to 100 hours of music', p:150, f:function(){ return P.m.lis / 3600000; }, v:100 },
    { id:'mus60',   n:'Background Music',d:'Play games with music on for an hour', p:30, f:function(){ return P.m.mus / MIN; }, v:60 },
    { id:'late60',  n:'Night Owl',       d:'Play games after 9 pm for an hour', p:30, f:function(){ return P.m.late / MIN; }, v:60 },
    { id:'vis7',    n:'Regular Visitor', d:'Open Games on 7 different days', p:25, f:function(){ return P.m.visits; }, v:7 },
    { id:'vis30',   n:'Part of the Furniture', d:'Open Games on 30 different days', p:80, f:function(){ return P.m.visits; }, v:30 },
    { id:'rich500', n:'Saving Up',       d:'Hold 500 points at once',    p:20,  f:function(){ return P.pts; }, v:500 }
  ];
  // The games website (window.__ppWeb) has no media player: drop what needs one.
  var WEB_OFF = { listen:1, music:1, lis10:1, lis100:1, mus60:1 };
  function webOk(k){ return !(window.__ppWeb && WEB_OFF[k]); }
  META = META.filter(function(a){ return webOk(a.id); });
  function playedCount(){ return GAMES.filter(function(g){ return gst(g.id).ses > 0; }).length; }
  function totalMs(){ var t = 0; for (var g in P.st) t += P.st[g].ms || 0; return t; }
  function achCount(){ return Object.keys(P.ach).length; }

  /* ---------------- points ---------------- */
  function earn(n, why, quiet){
    n = Math.round(n * pgPts()); if (n <= 0) return;
    P.pts += n; P.tot += n;
    P.log.unshift({ t:Date.now(), n:n, d:why }); if (P.log.length > 40) P.log.length = 40;
    save();
    if (!quiet) toast('+' + n + ' · ' + why);
    changed();
    checkMeta();
  }
  function unlock(g, id, name, p, quiet){
    var k = g + ':' + id;
    if (P.ach[k]) return false;
    P.ach[k] = Date.now();
    if (!quiet){ td().ach++; tw().ach++; }
    earn(p, (g === 'pp' ? 'Press Play' : NAME[g] || g) + ': ' + name, quiet);
    return true;
  }
  function checkGame(g){
    achDefs(g).forEach(function(a){ if (!P.ach[g + ':' + a.id] && achVal(g, a) >= a.v) unlock(g, a.id, a.n, a.p); });
  }
  var metaBusy = false;
  function checkMeta(){
    if (metaBusy) return; metaBusy = true;
    try { META.forEach(function(a){ if (!P.ach['pp:' + a.id] && a.f() >= a.v) unlock('pp', a.id, a.n, a.p); }); }
    finally { metaBusy = false; }
  }

  /* ---------------- periods and quests ---------------- */
  function td(){ if (!P.td || P.td.key !== dayKey()) { P.td = freshPeriod(dayKey()); P.qd = null; } return P.td; }
  function tw(){ if (!P.tw || P.tw.key !== weekKey()) { P.tw = freshPeriod(weekKey()); P.qw = null; } return P.tw; }
  // q = [kind, game, stat, target, points, text]  ({g} is replaced by the game's name)
  var QD_GENERAL = [
    ['time', '', '', 10, 15, 'Spend 10 minutes playing games'],
    ['time', '', '', 20, 25, 'Spend 20 minutes playing games'],
    ['time', '', '', 35, 35, 'Spend 35 minutes playing games'],
    ['distinct', '', '', 2, 15, 'Play 2 different games (a minute each)'],
    ['distinct', '', '', 3, 25, 'Play 3 different games (a minute each)'],
    ['distinct', '', '', 4, 35, 'Play 4 different games (a minute each)'],
    ['ses', '', '', 3, 10, 'Start a game 3 times'],
    ['ses', '', '', 6, 20, 'Start a game 6 times'],
    ['ach', '', '', 1, 25, 'Unlock an achievement in any game'],
    ['ach', '', '', 2, 40, 'Unlock 2 achievements'],
    ['listen', '', '', 15, 15, 'Listen to 15 minutes of music'],
    ['listen', '', '', 30, 25, 'Listen to 30 minutes of music'],
    ['listen', '', '', 60, 40, 'Listen to an hour of music'],
    ['music', '', '', 5, 15, 'Play a game with music on for 5 minutes'],
    ['music', '', '', 15, 30, 'Play games with music on for 15 minutes'],
    ['late', '', '', 5, 20, 'Play for 5 minutes after 9 pm'],
    ['wins', '', '', 2, 20, 'Win 2 times in any games'],
    ['wins', '', '', 5, 40, 'Win 5 times in any games'],
    ['buy', '', '', 1, 10, 'Buy something in the Shop']
  ];
  var QD_GAME = [
    ['game', '*', '', 3, 15, 'Play {g} for 3 minutes'],
    ['game', '*', '', 8, 25, 'Play {g} for 8 minutes'],
    ['ev', 'anteup', 'blind', 3, 20, 'Clear 3 blinds in Ante Up'],
    ['ev', 'anteup', 'blind', 6, 35, 'Clear 6 blinds in Ante Up'],
    ['ev', 'anteup', 'boss', 1, 25, 'Beat a boss blind in Ante Up'],
    ['bt', 'anteup', 'ante', 3, 25, 'Reach ante 3 in Ante Up'],
    ['bt', 'anteup', 'ante', 5, 45, 'Reach ante 5 in Ante Up'],
    ['ev', 'bastion', 'battle', 2, 15, 'Finish 2 battles in Bastion Brawl'],
    ['ev', 'bastion', 'win', 1, 20, 'Win a battle in Bastion Brawl'],
    ['ev', 'bastion', 'win', 3, 40, 'Win 3 battles in Bastion Brawl'],
    ['ev', 'blob', 'match', 2, 15, 'Finish 2 CPU matches in Blob Barrage'],
    ['ev', 'blob', 'win', 1, 25, 'Beat the CPU in Blob Barrage'],
    ['ev', 'blob', 'win', 2, 40, 'Beat the CPU twice in Blob Barrage'],
    ['ev', 'cube', 'clear', 2, 15, 'Clear 2 stages in Dashcube Knight'],
    ['ev', 'cube', 'clear', 5, 35, 'Clear 5 stages in Dashcube Knight'],
    ['ev', 'cube', 'kill', 40, 20, 'Defeat 40 foes in Dashcube Knight'],
    ['ev', 'cube', 'boss', 1, 25, 'Beat a boss in Dashcube Knight'],
    ['ev', 'cube', 'flawless', 2, 30, 'Clear 2 Dashcube Knight stages without getting hit'],
    ['bt', 'cube', 'endless', 150, 25, 'Go 150 m in a Dashcube Knight Endless run'],
    ['ev', 'kitchen', 'serve', 15, 20, 'Serve 15 orders in Kitchen Rush'],
    ['ev', 'kitchen', 'serve', 40, 40, 'Serve 40 orders in Kitchen Rush'],
    ['ev', 'lastcard', 'game', 3, 15, 'Finish 3 games of Last Card'],
    ['ev', 'lastcard', 'win', 1, 15, 'Win a game of Last Card'],
    ['ev', 'lastcard', 'win', 3, 35, 'Win 3 games of Last Card'],
    ['bt', 'lastcard', 'streak', 2, 30, 'Win 2 games of Last Card in a row'],
    ['game', 'nebula', '', 5, 15, 'Relax in Nebula Touch for 5 minutes'],
    ['ev', 'obby', 'win', 1, 25, 'Finish a course in Obby Builder'],
    ['ev', 'obby', 'win', 2, 40, 'Finish 2 courses in Obby Builder'],
    ['ev', 'toque', 'win', 3, 20, 'Win 3 fights in Toque & Spear'],
    ['ev', 'toque', 'win', 8, 40, 'Win 8 fights in Toque & Spear'],
    ['up', 'toque', 'level', 1, 30, 'Level up in Toque & Spear'],
    ['ev', 'weaponball', 'run', 2, 15, 'Start 2 Roguelite runs in Weapon Ball'],
    ['ev', 'weaponball', 'round', 3, 20, 'Win 3 Roguelite rounds in Weapon Ball'],
    ['bt', 'weaponball', 'round', 4, 35, 'Win round 4 of a Weapon Ball Roguelite run']
  ];
  var QW = [
    ['time', '', '', 90, 80, 'Spend 90 minutes playing games this week'],
    ['time', '', '', 180, 140, 'Spend 3 hours playing games this week'],
    ['distinct', '', '', 5, 80, 'Play 5 different games this week'],
    ['distinct', '', '', 8, 130, 'Play 8 different games this week'],
    ['ach', '', '', 4, 90, 'Unlock 4 achievements this week'],
    ['ach', '', '', 8, 150, 'Unlock 8 achievements this week'],
    ['days', '', '', 3, 100, 'Finish every daily quest on 3 days'],
    ['wins', '', '', 15, 100, 'Win 15 times across your games'],
    ['listen', '', '', 300, 90, 'Listen to 5 hours of music this week'],
    ['music', '', '', 60, 80, 'Play games with music on for an hour'],
    ['ses', '', '', 20, 70, 'Start games 20 times this week'],
    ['buy', '', '', 3, 60, 'Buy 3 things in the Shop this week'],
    ['ev', 'kitchen', 'serve', 150, 100, 'Serve 150 orders in Kitchen Rush'],
    ['ev', 'cube', 'clear', 20, 100, 'Clear 20 stages in Dashcube Knight'],
    ['ev', 'cube', 'boss', 5, 100, 'Beat 5 bosses in Dashcube Knight'],
    ['ev', 'cube', 'kill', 300, 90, 'Defeat 300 foes in Dashcube Knight'],
    ['ev', 'toque', 'win', 30, 100, 'Win 30 fights in Toque & Spear'],
    ['ev', 'bastion', 'win', 10, 100, 'Win 10 battles in Bastion Brawl'],
    ['ev', 'lastcard', 'win', 10, 90, 'Win 10 games of Last Card'],
    ['ev', 'anteup', 'blind', 20, 100, 'Clear 20 blinds in Ante Up']
  ];
  function webQ(t){ return webOk(t[0]); }
  QD_GENERAL = QD_GENERAL.filter(webQ); QD_GAME = QD_GAME.filter(webQ); QW = QW.filter(webQ);
  function mkQuest(t, i){
    var g = t[1] === '*' ? pick(GAMES).id : t[1];
    return { id:(t.join('|') + (t[1] === '*' ? g : '')), k:t[0], g:g, e:t[2], n:t[3], p:t[4], t:t[5].replace('{g}', NAME[g] || ''), c:false, seen:false };
  }
  function genDaily(){
    var gen = shuffle(QD_GENERAL), gm = shuffle(QD_GAME), out = [], kinds = {}, games = {};
    function add(t){
      if (kinds[t[0]] && t[0] !== 'ev' && t[0] !== 'game') return false;
      var q = mkQuest(t);
      if (q.g && games[q.g]) return false;
      if (out.some(function(o){ return o.id === q.id; })) return false;
      out.push(q); kinds[t[0]] = 1; if (q.g) games[q.g] = 1; return true;
    }
    for (var i = 0; i < gen.length && out.length < 2; i++) add(gen[i]);
    for (i = 0; i < gm.length && out.length < 4; i++) add(gm[i]);
    return out;
  }
  function genWeekly(){
    var out = [], kinds = {};
    shuffle(QW).forEach(function(t){ if (out.length < 3 && !kinds[t[0] + t[1]]){ kinds[t[0] + t[1]] = 1; out.push(mkQuest(t)); } });
    return out;
  }
  function qd(){ td(); if (!P.qd || !Array.isArray(P.qd.list)){ P.qd = { list:genDaily(), swaps:0, bonus:false }; save(); } return P.qd; }
  function qw(){ tw(); if (!P.qw || !Array.isArray(P.qw.list)){ P.qw = { list:genWeekly(), bonus:false }; save(); } return P.qw; }
  function prog(q, S){
    switch (q.k){
      case 'time': return S.tot / MIN;
      case 'music': return S.mus / MIN;
      case 'late': return S.late / MIN;
      case 'listen': return S.lis / MIN;
      case 'distinct': return Object.keys(S.ms).filter(function(g){ return S.ms[g] >= MIN; }).length;
      case 'game': return (S.ms[q.g] || 0) / MIN;
      case 'ses': return S.ses;
      case 'ach': return S.ach;
      case 'wins': return S.wins;
      case 'buy': return S.buys;
      case 'days': return S.days;
      case 'ev': return S.ev[q.g + ':' + q.e] || 0;
      case 'up': return S.up[q.g + ':' + q.e] || 0;
      case 'bt': return S.bt[q.g + ':' + q.e] || 0;
    }
    return 0;
  }
  function done(q, S){ return prog(q, S) >= q.n; }
  function claimable(){
    var n = 0, D = qd(), W = qw();
    D.list.forEach(function(q){ if (!q.c && done(q, td())) n++; });
    W.list.forEach(function(q){ if (!q.c && done(q, tw())) n++; });
    if (!D.bonus && D.list.every(function(q){ return q.c; })) n++;
    if (!W.bonus && W.list.every(function(q){ return q.c; })) n++;
    return n;
  }
  // tell the player once when a quest is ready to claim
  function questNotices(){
    [[qd().list, td(), 'Daily quest done'], [qw().list, tw(), 'Weekly quest done']].forEach(function(x){
      x[0].forEach(function(q){ if (!q.c && !q.seen && done(q, x[1])){ q.seen = true; save(); toast('✅ ' + x[2] + ': ' + q.t); } });
    });
  }
  function claim(which, i){
    var box = which === 'w' ? qw() : qd(), S = which === 'w' ? tw() : td(), q = box.list[i];
    if (!q || q.c || !done(q, S)) return;
    q.c = true; P.m.q++;
    earn(q.p, (which === 'w' ? 'Weekly' : 'Daily') + ' quest');
  }
  function claimBonus(which){
    var box = which === 'w' ? qw() : qd();
    if (box.bonus || !box.list.every(function(q){ return q.c; })) return;
    box.bonus = true;
    if (which === 'w'){ P.m.weeks++; earn(120, 'Every weekly quest'); }
    else { P.m.days++; tw().days++; earn(30, 'Every daily quest'); }
  }
  var SWAP_COST = 15;
  function swap(i){
    var D = qd(), q = D.list[i];
    if (!q || q.c) return;
    var cost = D.swaps >= 1 ? SWAP_COST : 0;
    if (cost && P.pts < cost){ toast('Swapping again costs ' + SWAP_COST + ' points'); return; }
    var have = {}; D.list.forEach(function(o){ have[o.id] = 1; if (o.g) have['g:' + o.g] = 1; });
    var pool = shuffle(q.g ? QD_GAME : QD_GENERAL).filter(function(t){
      var id = t.join('|');
      if (have[id]) return false;
      if (t[1] && t[1] !== '*' && have['g:' + t[1]] && t[1] !== q.g) return false;
      return true;
    });
    if (!pool.length) return;
    if (cost){ P.pts -= cost; P.spent += cost; }
    D.swaps++;
    D.list[i] = mkQuest(pool[0]);
    save(); changed();
  }

  /* ---------------- live tracking (called by the games and the app) ---------------- */
  var sess = null;
  function addTime(g, ms){
    if (ms <= 0) return;
    var s = gst(g), D = td(), W = tw(), mus = musicOn(), late = lateHour();
    s.ms += ms;
    [D, W].forEach(function(S){
      S.ms[g] = (S.ms[g] || 0) + ms; S.tot += ms;
      if (mus) S.mus += ms;
      if (late) S.late += ms;
    });
    if (mus) P.m.mus += ms;
    if (late) P.m.late += ms;
  }
  function tick(){
    if (!sess) return;
    var now = Date.now(), dt = Math.min(15000, now - sess.t);
    sess.t = now;
    if (!document.hidden) addTime(sess.g, dt);
    checkGame(sess.g); checkMeta(); questNotices();
    save(); changed();
  }
  setInterval(tick, 5000);
  var listenAcc = 0;
  // the song playing in the app, for games that follow its beat: its saved tempo and key (from the
  // song tagger, if it has been tagged) and how loud its low end is right now
  var songTags = { id:null, bpm:0, key:'', at:0 };
  var hub = window.__ppHub = {
    song: function(g){
      var a = window.__ppApi, t = null;
      try { t = a && a.tracks && a.tracks()[a.currentIndex()]; } catch(e){}
      var pb = document.getElementById('play-btn');
      var playing = !!(t && pb && pb.classList.contains('is-playing'));
      if (!t) return { playing:false };
      var now = Date.now();
      if (t.dbId !== songTags.id || now - songTags.at > 10000){   // re-read now and then: the song may get tagged meanwhile
        var c = null; try { c = (JSON.parse(localStorage.getItem('ppTagsV2')) || {})[t.dbId]; } catch(e){}
        songTags = { id:t.dbId, bpm:(c && c.bpm) || 0, key:(c && c.key) || '', at:now };
      }
      var bass = window.__ppBassLevel ? window.__ppBassLevel() : -1;
      return { playing:playing, id:t.dbId, title:t.title || '', bpm:songTags.bpm, key:songTags.key, bass:bass };
    },
    sessionStart: function(g){
      if (sess) hub.sessionEnd();
      sess = { g:g, t:Date.now() };
      gst(g).ses++; td().ses++; tw().ses++;
      checkGame(g); checkMeta(); questNotices(); save(); changed();
    },
    sessionEnd: function(){ if (!sess) return; tick(); sess = null; save(true); },
    listen: function(ms){
      if (!(ms > 0) || ms > 60000) return;
      td().lis += ms; tw().lis += ms; P.m.lis += ms;
      listenAcc += ms;
      if (listenAcc >= 15000){ listenAcc = 0; save(); questNotices(); checkMeta(); changed(); }
    },
    event: function(g, type, v){
      v = +v || 1;
      var s = gst(g), k = g + ':' + type;
      s.ev[type] = (s.ev[type] || 0) + v;
      [td(), tw()].forEach(function(S){ S.ev[k] = (S.ev[k] || 0) + v; if (type === 'win') S.wins += v; });
      checkGame(g); questNotices(); save(); changed();
    },
    best: function(g, type, v){
      v = +v; if (!isFinite(v)) return;
      var s = gst(g), k = g + ':' + type;
      if (v > (s.bt[type] || 0)) s.bt[type] = v;
      [td(), tw()].forEach(function(S){
        if (S.bt[k] != null && v > S.bt[k]) S.up[k] = (S.up[k] || 0) + (v - S.bt[k]);
        if (S.bt[k] == null || v > S.bt[k]) S.bt[k] = v;
      });
      checkGame(g); questNotices(); save(); changed();
    },
    native: function(g, list){
      if (!Array.isArray(list)) return;
      P.nat[g] = list.slice(0, 300).map(function(a){ return { id:String(a.id), n:String(a.name || a.id).slice(0, 60), d:String(a.desc || '').slice(0, 140), i:String(a.icon || '🏆').slice(0, 8), p:Math.max(5, Math.min(60, +a.p || 10)) }; });
      // achievements earned before Press Play Points existed still pay out, in one go
      var got = 0, pts = 0;
      list.forEach(function(a){
        if (!a.done || P.ach[g + ':' + a.id]) return;
        var d = P.nat[g].filter(function(x){ return x.id === String(a.id); })[0];
        P.ach[g + ':' + a.id] = Date.now(); got++; pts += d ? d.p : 10;
      });
      if (got) earn(pts, NAME[g] + ': ' + got + ' achievement' + (got > 1 ? 's' : '') + ' you already had');
      save(); changed();
    },
    ach: function(g, id){
      var d = (P.nat[g] || []).filter(function(x){ return x.id === String(id); })[0];
      unlock(g, String(id), d ? d.n : 'Achievement', d ? d.p : 10);
      questNotices(); checkMeta();
    },
    info: function(g, key, v){ (P.info[g] = P.info[g] || {})[key] = v; save(); },
    has: function(g, kind){ return pgFree() || !!P.own[g + ':' + kind]; },
    charm: function(g, kind){ var Q = window.PPPlayground; if (!Q || !Q.gameFx) return (kind === 'score' || kind === 'coins') ? 1 : 0; return Q.gameFx(g, kind); },
    take: function(g, kind){
      var k = g + ':' + kind, n = P.bo[k] || 0;
      if (n){ delete P.bo[k]; save(true); changed(); }
      return n;
    },
    peek: function(g, kind){ return P.bo[g + ':' + kind] || 0; },
    takeOne: function(g, kind){
      var k = g + ':' + kind, n = P.bo[k] || 0;
      if (!n) return 0;
      if (n > 1) P.bo[k] = n - 1; else delete P.bo[k];
      save(true); changed();
      return 1;
    }
  };

  /* ---------------- shop ---------------- */
  function boost(g, kind, n){ P.bo[g + ':' + kind] = (P.bo[g + ':' + kind] || 0) + n; return true; }
  function pending(g, kind){ return P.bo[g + ':' + kind] || 0; }
  // Press Play exclusives: bought once, kept for good. `deliver` hands it to the game if it needs to pick it up.
  function owned(g, id){ return !!P.own[g + ':' + id]; }
  function exclusive(g, id, deliver){ return function(){ if (owned(g, id)) return false; P.own[g + ':' + id] = 1; if (deliver) boost(g, deliver, 1); return true; }; }
  function ownedOff(g, id){ return function(){ return owned(g, id) ? 'Owned' : ''; }; }
  var BASTION_DEFAULT = { vouchers:0, owned:{}, dupProgress:0, pullsSinceNew:0, crownCards:0, crownPlusCards:0, crownCoins:0, shopUnlocked:{} };
  function bastionAdd(field, n){ return jpatch('ccGachaState', function(o){ o[field] = (o[field] || 0) + n; }, JSON.parse(JSON.stringify(BASTION_DEFAULT))); }
  function cubeSave(){ return jget('dashcube-knight-v1') || {}; }
  function toqueSave(){ return jget('toque_spear_save'); }
  var SHOP = {
    anteup: {
      have: function(){ var c = pending('anteup', 'cash'), e = pending('anteup', 'encore'); return (c ? '$' + c + ' waiting' : 'Boosts for your next run') + (e ? ' · Encore ready' : ''); },
      items: [
        { id:'cash10', n:'Pocket Money', d:'+$10 when your next run starts (a run you have going gets it right away).', p:40, buy:function(){ return boost('anteup', 'cash', 10); } },
        { id:'cash25', n:'Fat Wallet',   d:'+$25 the same way.', p:90, buy:function(){ return boost('anteup', 'cash', 25); } },
        { id:'cash50', n:'Big Spender',  d:'+$50 the same way.', p:170, buy:function(){ return boost('anteup', 'cash', 50); } },
        { id:'encore', n:'Encore Charm', x:1, d:'Press Play exclusive charm for your next run: +4 Mult, then ×1.2 Mult on every hand. Never shows up in the game\'s own shop.', p:80,
          off:function(){ return pending('anteup', 'encore') ? 'Ready for next run' : ''; }, buy:function(){ return boost('anteup', 'encore', 1); } },
        { id:'bass', n:'Bass Boost Charm', x:1, d:'Press Play exclusive charm for your next run: ×1.5 Mult on every hand. Never shows up in the game\'s own shop.', p:110,
          off:function(){ return pending('anteup', 'bass') ? 'Ready for next run' : ''; }, buy:function(){ return boost('anteup', 'bass', 1); } },
        { id:'purse', t:'Perk', n:'Starter Purse', d:'Permanent perk: every run starts with $2 more.', p:220, off:ownedOff('anteup', 'purse'), buy:exclusive('anteup', 'purse') },
        { id:'spare', t:'Twist', n:'Spare Hand', d:'Twist for your next run: +1 play and +1 discard in the first round.', p:60, buy:function(){ return boost('anteup', 'spare', 1); } },
        { id:'bundle', t:'Bundle', n:'Run Starter', d:'A Fat Wallet and a Spare Hand together.', p:110, buy:combo('anteup', ['cash25', 'spare']) },
        { id:'mystery', t:'Mystery', n:'Mystery Pack', d:'One random Ante Up reward: cash or a Spare Hand.', p:72, buy:mystery('anteup', ['cash10', 'cash25', 'cash50', 'spare']) }
      ]
    },
    bastion: {
      have: function(){ var o = jget('ccGachaState') || {}; return (o.vouchers || 0) + ' vouchers · ' + (o.crownCards || 0) + ' CrownCards'; },
      items: [
        { id:'v1',    n:'Gacha Voucher',  d:'One pull in the card gacha.', p:25, buy:function(){ return bastionAdd('vouchers', 1); } },
        { id:'v5',    n:'Voucher Bundle', d:'Five gacha pulls.', p:100, buy:function(){ return bastionAdd('vouchers', 5); } },
        { id:'crown', n:'CrownCard',      d:'A pull that is guaranteed Mythic or better.', p:150, buy:function(){ return bastionAdd('crownCards', 1); } },
        { id:'crownp',n:'CrownCard+',     d:'A pull that is guaranteed Legendary Limited.', p:300, buy:function(){ return bastionAdd('crownPlusCards', 1); } },
        { id:'v10',   n:'Voucher Crate',  d:'Ten gacha pulls.', p:190, buy:function(){ return bastionAdd('vouchers', 10); } },
        { id:'v25',   n:'Voucher Vault',  d:'Twenty-five gacha pulls.', p:450, buy:function(){ return bastionAdd('vouchers', 25); } },
        { id:'crown3',n:'CrownCard Trio', d:'Three pulls that are each guaranteed Mythic or better.', p:420, buy:function(){ return bastionAdd('crownCards', 3); } },
        { id:'paragon', n:'Press Play Paragon', x:1, d:'Press Play exclusive troop (5 elixir): a shielded violet melee champion in headphones that lets out a big sound blast when it falls. Never in the gacha.', p:450,
          off:ownedOff('bastion', 'paragon'),
          buy:function(){
            if (owned('bastion', 'paragon')) return false;
            if (!jpatch('ccGachaState', function(o){ o.shopUnlocked = o.shopUnlocked || {}; o.shopUnlocked.pressplayparagon = true; }, JSON.parse(JSON.stringify(BASTION_DEFAULT)))) return false;
            P.own['bastion:paragon'] = 1; return true;
          } },
        { id:'maestro', n:'Press Play Maestro', x:1, d:'Press Play exclusive troop (5 elixir): a teal conductor in headphones that fires sound waves at air and ground, hitting everything in a small area. Never in the gacha.', p:480,
          off:ownedOff('bastion', 'maestro'),
          buy:function(){
            if (owned('bastion', 'maestro')) return false;
            if (!jpatch('ccGachaState', function(o){ o.shopUnlocked = o.shopUnlocked || {}; o.shopUnlocked.pressplaymaestro = true; }, JSON.parse(JSON.stringify(BASTION_DEFAULT)))) return false;
            P.own['bastion:maestro'] = 1; return true;
          } },
        { id:'bundle', t:'Bundle', n:'Pull Pack', d:'A Voucher Crate and a CrownCard together.', p:260, buy:combo('bastion', ['v10', 'crown']) },
        { id:'mystery', t:'Mystery', n:'Mystery Pack', d:'One random Bastion Brawl reward, from a single voucher up to a Voucher Vault.', p:150, buy:mystery('bastion', ['v1', 'v5', 'v10', 'crown', 'v25']) }
      ]
    },
    blob: {
      have: function(){ return owned('blob', 'headphones') ? 'Your blobs wear Press Play headphones' : 'Boosts for your next CPU match'; },
      items: [
        { id:'supply',  n:'Supply Drop',   d:'Each of your blobs starts the next CPU match with +2 Air strikes, +1 Homing launcher and +1 Cluster bomb.', p:35, buy:function(){ return boost('blob', 'supply', 1); } },
        { id:'arsenal', n:'Heavy Arsenal', d:'Each of your blobs starts the next CPU match with +1 Nuke, +1 Railgun and +1 Meteor shower.', p:90, buy:function(){ return boost('blob', 'arsenal', 1); } },
        { id:'medic',   n:'Medic Bag',     d:'Each of your blobs starts the next CPU match with +2 First aid kits and +1 Shield.', p:40, buy:function(){ return boost('blob', 'medic', 1); } },
        { id:'fortress', n:'Fortress Kit', d:'Each of your blobs starts the next CPU match with +1 Mega shield, +1 Armor and +1 Aegis.', p:75, buy:function(){ return boost('blob', 'fortress', 1); } },
        { id:'headphones', n:'Press Play Headphones', x:1, d:'Press Play exclusive: your blobs wear black and grey Press Play headphones in every match.', p:150, off:ownedOff('blob', 'headphones'), buy:exclusive('blob', 'headphones') },
        { id:'aura', n:'Press Play Aura', x:1, d:'Press Play exclusive: your blobs glow with a pulsing teal, violet and pink sound-wave aura in every match.', p:170, off:ownedOff('blob', 'aura'), buy:exclusive('blob', 'aura') },
        { id:'guard', t:'Perk', n:'Guard Duty', d:'Permanent perk: each of your blobs starts every CPU match with +1 Shield.', p:260, off:ownedOff('blob', 'guard'), buy:exclusive('blob', 'guard') },
        { id:'pack', t:'Bundle', n:'Battle Pack', d:'A Supply Drop, a Medic Bag and a Heavy Arsenal together.', p:125, buy:combo('blob', ['supply', 'medic', 'arsenal']) },
        { id:'mystery', t:'Mystery', n:'Mystery Pack', d:'One random Blob Barrage boost for your next CPU match.', p:50, buy:mystery('blob', ['supply', 'arsenal', 'medic', 'fortress']) }
      ]
    },
    cube: {
      have: function(){ var s = cubeSave(); return fmt(s.coins || 0) + ' coins' + (pending('cube', 'x2') ? ' · Coin Rush ready' : ''); },
      items: [
        { id:'c250',  n:'Coin Pouch',  d:'250 coins.', p:40, buy:function(){ return jpatch('dashcube-knight-v1', function(o){ o.coins = (o.coins || 0) + 250; }, {}); } },
        { id:'c1000', n:'Coin Chest',  d:'1,000 coins.', p:140, buy:function(){ return jpatch('dashcube-knight-v1', function(o){ o.coins = (o.coins || 0) + 1000; }, {}); } },
        { id:'c5000', n:'Coin Vault',  d:'5,000 coins.', p:600, buy:function(){ return jpatch('dashcube-knight-v1', function(o){ o.coins = (o.coins || 0) + 5000; }, {}); } },
        { id:'x2',    n:'Coin Rush',   d:'Double the coins from your next cleared stage.', p:50, buy:function(){ return boost('cube', 'x2', 1); } },
        { id:'x3',    n:'Triple Coin Rush', d:'Triple the coins from your next cleared stage (used before Coin Rush).', p:110, buy:function(){ return boost('cube', 'x3', 1); } },
        { id:'knight',n:'Mystery Knight', d:'A random knight you don\'t own yet joins your roster.', p:160,
          off:function(){ var l = (P.info.cube || {}).knightsLeft; return (l != null && l - pending('cube', 'knight') <= 0) ? 'You own every knight' : ''; },
          buy:function(){ return boost('cube', 'knight', 1); } },
        { id:'pppknight', n:'Press Play Paladin', x:1, d:'Press Play exclusive: violet armour, a pink cape and gold-winged black and grey headphones. 4 in every stat, with a Storm Staff, Katana and Boomerang.', p:400,
          off:ownedOff('cube', 'pppknight'), buy:exclusive('cube', 'pppknight', 'pppknight') },
        { id:'pppknight2', n:'Press Play Phantom', x:1, d:'Press Play exclusive: a hooded teal phantom with a masked face, glowing slit eyes, a trailing scarf and black headphones over the hood. 3 Power, 5 Speed, 3 Health, 5 Dash, with Knives, Shuriken and Rapier.', p:450,
          off:ownedOff('cube', 'pppknight2'), buy:exclusive('cube', 'pppknight2', 'pppknight2') },
        { id:'pppknight3', n:'Press Play Virtuoso', x:1, d:'Press Play exclusive: a stage star in a white jacket and gold bow tie, with a pink quiff, teal-to-pink shades, headphones round the neck and a floating note. 5 Health, 5 Power, 4 Speed, 4 Luck, with all four kinds of always-on weapon: Blade Ring, Tempest Aura, Wisp Lantern and Morning Star.', p:500,
          off:ownedOff('cube', 'pppknight3'), buy:exclusive('cube', 'pppknight3', 'pppknight3') },
        { id:'heart', t:'Boost', n:'Heart Potion', d:'Start your next stage with an extra heart.', p:30, buy:function(){ return boost('cube', 'heart', 1); } },
        { id:'guard', t:'Boost', n:'Guard Scroll', d:'The first hit in your next stage is blocked.', p:35, buy:function(){ return boost('cube', 'guard', 1); } },
        { id:'fury', t:'Boost', n:'Fury Tonic', d:'Double damage for your whole next stage.', p:60, buy:function(){ return boost('cube', 'fury', 1); } },
        { id:'magnet', t:'Perk', n:'Coin Magnet', d:'Permanent perk: +10% coins from every cleared stage.', p:240, off:ownedOff('cube', 'magnet'), buy:exclusive('cube', 'magnet') },
        { id:'combo', t:'Bundle', n:'Coin Combo', d:'A Coin Chest and a Triple Coin Rush together.', p:190, buy:combo('cube', ['c1000', 'x3']) },
        { id:'battle', t:'Bundle', n:'Battle Kit', d:'A Heart Potion, a Guard Scroll and a Fury Tonic together.', p:105, buy:combo('cube', ['heart', 'guard', 'fury']) },
        { id:'mystery', t:'Mystery', n:'Mystery Pack', d:'One random Dashcube Knight reward: coins, from a pouch up to a vault, or a battle boost.', p:140, buy:mystery('cube', ['c250', 'c1000', 'c5000', 'x2', 'x3', 'fury']) }
      ]
    },
    kitchen: {
      have: function(){ var s = pending('kitchen', 'overtime'); return s ? '+' + s + ' s overtime waiting' : 'Boosts for your next shift'; },
      items: [
        { id:'ot20', n:'Overtime',      d:'+20 seconds on your next timed shift.', p:35, buy:function(){ return boost('kitchen', 'overtime', 20); } },
        { id:'ot45', n:'Double Shift',  d:'+45 seconds on your next timed shift.', p:70, buy:function(){ return boost('kitchen', 'overtime', 45); } },
        { id:'ot90', n:'Triple Shift',  d:'+90 seconds on your next timed shift.', p:130, buy:function(){ return boost('kitchen', 'overtime', 90); } },
        { id:'hype', n:'Hype Hour',     d:'+25% points on every order in your next shift.', p:60, buy:function(){ return boost('kitchen', 'hype', 1); } },
        { id:'jukebox', n:'Press Play Jukebox', x:1, d:'Press Play exclusive: a jukebox in the corner of every kitchen. Every order scores 15% more, in every shift for good.', p:200, off:ownedOff('kitchen', 'jukebox'), buy:exclusive('kitchen', 'jukebox') },
        { id:'early', t:'Perk', n:'Early Bird', d:'Permanent perk: +10 seconds on every timed shift.', p:160, off:ownedOff('kitchen', 'early'), buy:exclusive('kitchen', 'early') },
        { id:'patient', t:'Twist', n:'Patient Crowd', d:'Twist for your next shift: orders wait 30% longer.', p:45, buy:function(){ return boost('kitchen', 'patient', 1); } },
        { id:'bundle', t:'Bundle', n:'Dinner Rush Pack', d:'A Double Shift, a Hype Hour and a Patient Crowd together.', p:130, buy:combo('kitchen', ['ot45', 'hype', 'patient']) },
        { id:'mystery', t:'Mystery', n:'Mystery Pack', d:'One random Kitchen Rush boost for your next shift.', p:55, buy:mystery('kitchen', ['ot20', 'ot45', 'ot90', 'hype', 'patient']) }
      ]
    },
    lastcard: {
      have: function(){ return owned('lastcard', 'cardback') ? 'Press Play card backs on' : 'Boosts for your next game'; },
      items: [
        { id:'wild',  n:'Wild Card',    d:'An extra Wild in your opening hand next game (classic-style modes).', p:30, buy:function(){ return boost('lastcard', 'wild', 1); } },
        { id:'wild4', n:'Wild +4',      d:'An extra Wild +4 in your opening hand next game (classic-style modes).', p:45, buy:function(){ return boost('lastcard', 'wild4', 1); } },
        { id:'heavy', n:'Heavy Hands',  d:'Every bot starts your next game with 2 extra cards.', p:40, buy:function(){ return boost('lastcard', 'heavy', 2); } },
        { id:'actions', n:'Action Pack', d:'An extra Skip, Reverse and Draw Two in your opening hand next game (classic-style modes).', p:40, buy:function(){ return boost('lastcard', 'actions', 1); } },
        { id:'cardback', n:'Press Play Card Backs', x:1, d:'Press Play exclusive: every face-down card gets a violet back with a glowing play button.', p:150, off:ownedOff('lastcard', 'cardback'), buy:exclusive('lastcard', 'cardback') },
        { id:'table', n:'Press Play Table', x:1, d:'Press Play exclusive: the table turns deep violet with a glowing play button under the cards.', p:140, off:ownedOff('lastcard', 'table'), buy:exclusive('lastcard', 'table') },
        { id:'pocket', t:'Perk', n:'Pocket Wild', d:'Permanent perk: an extra Wild in your opening hand every game (classic-style modes).', p:300, off:ownedOff('lastcard', 'pocket'), buy:exclusive('lastcard', 'pocket') },
        { id:'headstart', t:'Twist', n:'Head Start', d:'Twist for your next game: you start with 2 fewer cards (classic-style modes).', p:55, buy:function(){ return boost('lastcard', 'headstart', 1); } },
        { id:'pack', t:'Bundle', n:'Card Shark Pack', d:'A Wild, a Wild +4, an Action Pack and Heavy Hands together.', p:115, buy:combo('lastcard', ['wild', 'wild4', 'actions', 'heavy']) },
        { id:'mystery', t:'Mystery', n:'Mystery Pack', d:'One random Last Card boost for your next game.', p:32, buy:mystery('lastcard', ['wild', 'wild4', 'heavy', 'actions', 'headstart']) }
      ]
    },
    nebula: {
      have: function(){ var n = ['palette', 'palette2', 'palette3', 'palette4'].filter(function(k){ return owned('nebula', k); }).length; return n ? n + ' Press Play palette' + (n > 1 ? 's' : '') + ' unlocked' : 'Make your own palettes in Appearance'; },
      items: [
        { id:'palette', n:'Press Play Palette', x:1, d:'Press Play exclusive palette: teal, violet and pink light on deep night.', p:80, off:ownedOff('nebula', 'palette'), buy:exclusive('nebula', 'palette') },
        { id:'palette2', n:'Press Play Sunset', x:1, d:'Press Play exclusive palette: amber, coral and pink on a dark wine sky.', p:80, off:ownedOff('nebula', 'palette2'), buy:exclusive('nebula', 'palette2') },
        { id:'palette3', n:'Press Play Frost', x:1, d:'Press Play exclusive palette: ice blue, mint and violet on a deep blue night.', p:80, off:ownedOff('nebula', 'palette3'), buy:exclusive('nebula', 'palette3') },
        { id:'palette4', n:'Press Play Mono', x:1, d:'Press Play exclusive palette: white to charcoal, like the headphones.', p:60, off:ownedOff('nebula', 'palette4'), buy:exclusive('nebula', 'palette4') }
      ]
    },
    obby: {
      have: function(){ var w = 0; ['mbox_epic','mbox_legendary','mbox_mythic','cb_silver','cb_gold','cb_retro'].forEach(function(k){ w += pending('obby', k); }); return w ? w + ' free crate' + (w > 1 ? 's' : '') + ' waiting' : 'Free crates open when you start the game'; },
      items: [
        { id:'mepic', n:'Epic Box',        d:'A free Epic mystery box: Rare to Mythic loot.', p:45, buy:function(){ return boost('obby', 'mbox_epic', 1); } },
        { id:'mleg',  n:'Legendary Box',   d:'A free Legendary mystery box: Epic to Mythic loot.', p:110, buy:function(){ return boost('obby', 'mbox_legendary', 1); } },
        { id:'mmyth', n:'Mythic Box',      d:'A free Mythic mystery box: Legendary or Mythic loot.', p:260, buy:function(){ return boost('obby', 'mbox_mythic', 1); } },
        { id:'csil',  n:'Silver Capsule',  d:'A free character capsule: simple characters with one ability.', p:70, buy:function(){ return boost('obby', 'cb_silver', 1); } },
        { id:'cret',  n:'Retro Box',       d:'A free Retro character box.', p:110, buy:function(){ return boost('obby', 'cb_retro', 1); } },
        { id:'cgold', n:'Gold Capsule',    d:'A free Gold capsule: stronger characters with their own tricks.', p:160, buy:function(){ return boost('obby', 'cb_gold', 1); } },
        { id:'prodigy', n:'Press Play Prodigy', x:1, d:'Press Play exclusive character: violet suit, black and grey headphones. Encore: 3 jumps, 3 dashes, 4 HP and top speed.', p:420, off:ownedOff('obby', 'prodigy'), buy:exclusive('obby', 'prodigy', 'prodigy') },
        { id:'mixtape', n:'Press Play Mixtape', x:1, d:'Press Play exclusive character: a cassette chest, headphones and two forms. Side A whips with tape; Ribbon grapples in all 8 directions, swings off blocks, and grabs foes to throw any way you aim.', p:450, off:ownedOff('obby', 'mixtape'), buy:exclusive('obby', 'mixtape', 'mixtape') },
        { id:'emguitar', t:'Emote', n:'Air Guitar Emote', x:1, d:'Press Play exclusive emote: shred a little red guitar to the beat of your song, notes flying.', p:120, off:ownedOff('obby', 'emguitar'), buy:exclusive('obby', 'emguitar', 'emguitar') },
        { id:'emheadbang', t:'Emote', n:'Headbang Emote', x:1, d:'Press Play exclusive emote: horns up and headbang on every beat of the song playing.', p:120, off:ownedOff('obby', 'emheadbang'), buy:exclusive('obby', 'emheadbang', 'emheadbang') },
        { id:'emmic', t:'Emote', n:'Mic Drop Emote', x:1, d:'Press Play exclusive emote: sing a line, hold the mic out, and drop it. BOOM.', p:150, off:ownedOff('obby', 'emmic'), buy:exclusive('obby', 'emmic', 'emmic') },
        { id:'emrobot', t:'Emote', n:'Robot Emote', x:1, d:'Press Play exclusive emote: stiff robot moves that snap into place on every beat of your song.', p:120, off:ownedOff('obby', 'emrobot'), buy:exclusive('obby', 'emrobot', 'emrobot') },
        { id:'emdj', t:'Emote', n:'DJ Scratch Emote', x:1, d:'Press Play exclusive emote: a little turntable, scratched to the beat of your song, one hand on the headphones.', p:150, off:ownedOff('obby', 'emdj'), buy:exclusive('obby', 'emdj', 'emdj') },
        { id:'embreak', t:'Emote', n:'Breakdance Emote', x:1, d:'Press Play exclusive dance: a windmill spin on the floor, one full turn every two beats of your song. Keeps going until you move.', p:150, off:ownedOff('obby', 'embreak'), buy:exclusive('obby', 'embreak', 'embreak') },
        { id:'emmoon', t:'Emote', n:'Moonwalk Emote', x:1, d:'Press Play exclusive dance: glide back and forth on the spot to the beat. Keeps going until you move.', p:150, off:ownedOff('obby', 'emmoon'), buy:exclusive('obby', 'emmoon', 'emmoon') },
        { id:'wave',  n:'Press Play Wave', x:1, d:'Press Play exclusive cosmetic: a teal-to-pink sound wave trail and orbiting music notes.', p:180, off:ownedOff('obby', 'wave'), buy:exclusive('obby', 'wave', 'wave') },
        { id:'eq',   n:'Press Play Equalizer', x:1, d:'Press Play exclusive cosmetic: a little sound equalizer that dances around you in teal, violet and pink.', p:200, off:ownedOff('obby', 'eq'), buy:exclusive('obby', 'eq', 'eq') },
        { id:'hype', n:'Hype Start',    d:'The next time you play as the Press Play Prodigy, your Hype meter starts full, ready for THE DROP.', p:55, buy:function(){ return boost('obby', 'hype', 1); } },
        { id:'vinyl', n:'Press Play Vinyl Spin', x:1, d:'Press Play exclusive cosmetic: a spinning vinyl record of light circles you as you move.', p:180, off:ownedOff('obby', 'vinyl'), buy:exclusive('obby', 'vinyl', 'vinyl') },
        { id:'pulse', n:'Press Play Bass Pulse', x:1, d:'Press Play exclusive cosmetic: a bass shockwave ring rolls out every time you land.', p:160, off:ownedOff('obby', 'pulse'), buy:exclusive('obby', 'pulse', 'pulse') },
        { id:'bundle', t:'Bundle', n:'Builder Bundle', d:'An Epic Box, a Silver Capsule and a Hype Start together.', p:125, buy:combo('obby', ['mepic', 'csil', 'hype']) },
        { id:'mystery', t:'Mystery', n:'Mystery Pack', d:'One random Obby Builder reward: boxes, capsules or Hype Start.', p:65, buy:mystery('obby', ['mepic', 'mleg', 'csil', 'cret', 'hype']) }
      ]
    },
    toque: {
      have: function(){ var s = toqueSave(); return s ? fmt(s.gold || 0) + ' gold' : 'Start a game to unlock these'; },
      items: [
        { id:'trophies', n:'Trophy Cache', d:'3 random trophies in your Trophy Satchel next time your save loads.', p:50, off:function(){ return toqueSave() ? '' : 'Start a game first'; }, buy:function(){ return boost('toque', 'trophies', 3); } },
        { id:'rite',     n:'Ancestor\'s Rite', d:'Kanata gains 300 XP and his spirit 200 XP next time your save loads.', p:70, off:function(){ return toqueSave() ? '' : 'Start a game first'; }, buy:function(){ return boost('toque', 'rite', 1); } },
        { id:'hoard',    n:'Trophy Hoard', d:'8 random trophies in your Trophy Satchel next time your save loads.', p:120, off:function(){ return toqueSave() ? '' : 'Start a game first'; }, buy:function(){ return boost('toque', 'trophies', 8); } },
        { id:'grandrite', n:'Grand Rite',  d:'Three Ancestor\'s Rites at once: Kanata gains 900 XP and his spirit 600 XP next time your save loads.', p:180, off:function(){ return toqueSave() ? '' : 'Start a game first'; }, buy:function(){ return boost('toque', 'rite', 3); } },
        { id:'panther', n:'Press Play Panther', x:1, d:'Press Play exclusive spirit: a charcoal panther in black and grey headphones. Hits hard, its Encore stuns and heals, and it learns Drop the Beat and Replay.', p:400,
          off:function(){ return owned('toque', 'panther') ? 'Owned' : toqueSave() ? '' : 'Start a game first'; }, buy:exclusive('toque', 'panther', 'panther') },
        { id:'headphones', n:'Press Play Headphones', x:1, d:'Press Play exclusive gear: +2 spear damage, +12 max HP, and Focus restores +10 more Spirit.', p:220,
          off:function(){ return owned('toque', 'headphones') ? 'Owned' : toqueSave() ? '' : 'Start a game first'; }, buy:exclusive('toque', 'headphones', 'headphones') },
        { id:'vinyl', n:'Press Play Vinyl', x:1, d:'Press Play exclusive gear: +1 spear damage, +30 max HP, and Focus restores +6 more Spirit.', p:260,
          off:function(){ return owned('toque', 'vinyl') ? 'Owned' : toqueSave() ? '' : 'Start a game first'; }, buy:exclusive('toque', 'vinyl', 'vinyl') },
        { id:'bundle', t:'Bundle', n:'Spirit Pack', d:'A Trophy Cache and an Ancestor\'s Rite together.', p:90, off:function(){ return toqueSave() ? '' : 'Start a game first'; }, buy:combo('toque', ['trophies', 'rite']) },
        { id:'mystery', t:'Mystery', n:'Mystery Pack', d:'One random Toque & Spear reward: trophies or rites, small or big.', p:85, off:function(){ return toqueSave() ? '' : 'Start a game first'; }, buy:mystery('toque', ['trophies', 'rite', 'hoard', 'grandrite']) }
      ]
    },
    weaponball: {
      have: function(){ var t = pending('weaponball', 'tokens'); return t ? t + ' tokens waiting for your next run' : 'Boosts for Roguelite runs'; },
      items: [
        { id:'t30', n:'Token Pouch', d:'+30 tokens when your next Roguelite run starts.', p:40, buy:function(){ return boost('weaponball', 'tokens', 30); } },
        { id:'t80', n:'Token Sack',  d:'+80 tokens when your next Roguelite run starts.', p:90, buy:function(){ return boost('weaponball', 'tokens', 80); } },
        { id:'t200', n:'Token Vault', d:'+200 tokens when your next Roguelite run starts.', p:210, buy:function(){ return boost('weaponball', 'tokens', 200); } },
        { id:'charm', n:'Charm Crate', d:'A random charm in your pocket when your next Roguelite run starts.', p:90, buy:function(){ return boost('weaponball', 'charm', 1); } },
        { id:'encore', n:'Press Play Encore', x:1, d:'Press Play exclusive charm: +50% Lite Tokens from every round, in every Roguelite run for good. Never shows up in the game\'s own shop.', p:260, off:ownedOff('weaponball', 'encore'), buy:exclusive('weaponball', 'encore') },
        { id:'seed', t:'Perk', n:'Seed Money', d:'Permanent perk: every Roguelite run starts with +25 tokens.', p:180, off:ownedOff('weaponball', 'seed'), buy:exclusive('weaponball', 'seed') },
        { id:'kit', t:'Bundle', n:'Run Kit', d:'A Token Sack and a Charm Crate together.', p:135, buy:combo('weaponball', ['t80', 'charm']) },
        { id:'mystery', t:'Mystery', n:'Mystery Pack', d:'One random Weapon Ball reward: tokens or a charm.', p:85, buy:mystery('weaponball', ['t30', 't80', 't200', 'charm']) }
      ]
    }
  };
  // Lucky Dip: a random cheap game item
  var DIP = [['cube','c250'],['obby','mepic'],['bastion','v1'],['anteup','cash10'],['kitchen','ot20'],['weaponball','t30'],['toque','trophies'],['cube','x2'],['blob','supply'],['lastcard','wild'],['obby','csil'],['blob','medic'],['kitchen','hype'],['weaponball','charm'],['obby','hype'],['lastcard','actions'],['anteup','cash25']];
  function itemOf(g, id){ return ((SHOP[g] || {}).items || []).filter(function(x){ return x.id === id; })[0]; }
  // Bundles hand over several of a game's own items at once, for less than buying them one by one
  function combo(g, ids){
    return function(){
      var its = ids.map(function(id){ return itemOf(g, id); });
      if (its.some(function(it){ return !it || (it.off && it.off()); })) return false;
      var ok = true; its.forEach(function(it){ if (!it.buy()) ok = false; });
      return ok;
    };
  }
  // Mystery Packs give one random item from a game's pool; the pool is worth more on average than the price
  function mystery(g, ids){
    return function(){
      var opts = ids.map(function(id){ return itemOf(g, id); }).filter(function(it){ return it && !(it.off && it.off()); });
      if (!opts.length) return false;
      var it = pick(opts);
      if (!it.buy()) return false;
      setTimeout(function(){ toast('Mystery Pack: ' + it.n); }, 600);
      return true;
    };
  }
  // Daily Deal: one everyday item per day at 35% off, the same for everyone, once a day
  function dealToday(){
    var list = [];
    Object.keys(SHOP).forEach(function(g){ SHOP[g].items.forEach(function(it){ if (!it.x && !it.off && !it.t) list.push([g, it.id]); }); });
    var k = dayKey(), h = 0;
    for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    var d = list[h % list.length], it = itemOf(d[0], d[1]);
    return { g:d[0], it:it, price:Math.max(10, Math.round(it.p * 0.65)) };
  }
  var DIP2 = [['cube','c1000'],['obby','mleg'],['bastion','crown'],['blob','arsenal'],['weaponball','t80'],['anteup','cash25'],['kitchen','ot45'],['toque','rite'],['cube','x3'],['weaponball','charm'],['bastion','v10'],['obby','cgold']];
  function xpApi(){ var a = window.PPXpApi; return a && a.shopLevelPct ? a : null; }
  var APP = [
    { id:'lvl25', n:'Level Boost',      d:'Fill 25% of your current level bar.', p:60,  buy:function(){ return !!xpApi() && xpApi().shopLevelPct(0.25) > 0; } },
    { id:'lvl60', n:'Big Level Boost',  d:'Fill 60% of your current level bar.', p:130, buy:function(){ return !!xpApi() && xpApi().shopLevelPct(0.6) > 0; } },
    { id:'xp2',   n:'Double XP',        d:'2× XP from listening for 1 hour (shop boosts top out at 3× in total).', p:100, buy:function(){ return !!xpApi() && xpApi().shopTempBoost(2, 3600000); } },
    { id:'xp15',  n:'XP Marathon',      d:'1.5× XP from listening for 6 hours.', p:120, buy:function(){ return !!xpApi() && xpApi().shopTempBoost(1.5, 6 * 3600000); } },
    { id:'lvl100', n:'Level Up',         d:'Fill your whole current level bar.', p:220, buy:function(){ return !!xpApi() && xpApi().shopLevelPct(1) > 0; } },
    { id:'xp24',  n:'XP All Day',       d:'1.25× XP from listening for 24 hours.', p:150, buy:function(){ return !!xpApi() && xpApi().shopTempBoost(1.25, 24 * 3600000); } }
  ];
  var BG_PRICE = 150, EQ_PRICE = 200, MODE_PRICE = 1200;

  var armed = null, armT = null;
  function tryBuy(key, price, label, fn){
    if (P.pts < price){ toast('You need ' + fmt(price - P.pts) + ' more points'); return; }
    if (armed !== key){ armed = key; clearTimeout(armT); armT = setTimeout(function(){ armed = null; changed(); }, 3000); changed(); return; }
    armed = null; clearTimeout(armT);
    var ok = false;
    try { ok = fn(); } catch(e){ ok = false; }
    if (!ok){ toast('Couldn\'t buy that right now'); changed(); return; }
    P.pts -= price; P.spent += price; P.m.buys++; td().buys++; tw().buys++;
    P.log.unshift({ t:Date.now(), n:-price, d:label }); if (P.log.length > 40) P.log.length = 40;
    save(true);
    toast('Bought ' + label);
    questNotices(); checkMeta(); changed();
  }

  /* ---------------- UI ---------------- */
  var css = document.createElement('style');
  css.id = 'pp-points-style';
  css.textContent = [
    '.ppx-coin{width:1em;height:1em;display:inline-block;vertical-align:-.15em;flex:0 0 auto;border-radius:50%;background:linear-gradient(135deg,#6ee7d0,#8b5cff 60%,#ff5fd8)}',
    '.ppx-coin svg{width:100%;height:100%;display:block}',
    '.ppg-head{padding-right:16px}',
    '.ppx-pill{margin-left:auto;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px 0 9px;border-radius:999px;cursor:pointer;font:700 15px/1 inherit;font-family:inherit;color:#fff;position:relative;',
    ' border:1px solid transparent;background:linear-gradient(180deg,#1c1e26,#131419) padding-box,linear-gradient(120deg,#6ee7d0,#8b5cff 70%,#ff5fd8) border-box;-webkit-tap-highlight-color:transparent}',
    '.ppx-pill .ppx-coin{width:20px;height:20px}',
    '.ppx-pill:active{transform:scale(.95)}',
    '.ppx-dot{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;border-radius:9px;background:#ff5f7a;color:#fff;font:700 11px/18px inherit;font-family:inherit;text-align:center;padding:0 4px;box-sizing:border-box;box-shadow:0 0 0 2px #0c0d10}',
    '.ppx-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 20px 18px}',
    '.ppx-tile{position:relative;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);border-radius:16px;padding:11px 12px;text-align:left;color:inherit;font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;min-width:0}',
    '.ppx-tile:active{background:rgba(255,255,255,.09)}',
    '.ppx-tile b{display:block;font-size:14px;font-weight:700;margin-bottom:3px}',
    '.ppx-tile span{display:block;font-size:12px;color:var(--text-dim,#8b8c93);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ppx-tile .ppx-dot{top:-5px;right:-5px}',
    '#ppx-hub{position:fixed;inset:0;z-index:2147482500;display:none;flex-direction:column;color:var(--text,#e8e9ec);',
    ' background:radial-gradient(120% 50% at 50% -10%,rgba(110,231,208,.13),transparent 60%),var(--bg,#0c0d10);padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0);',
    ' opacity:0;transform:translateY(12px);transition:opacity .18s ease,transform .22s ease}',
    '#ppx-hub.open{display:flex}#ppx-hub.shown{opacity:1;transform:none}',
    '.ppx-head{display:flex;align-items:center;gap:6px;padding:14px 16px 4px 8px}',
    '.ppx-title{font-size:21px;font-weight:700;margin:0}',
    '.ppx-bal{margin-left:auto;display:flex;align-items:center;gap:7px;font-size:20px;font-weight:800}',
    '.ppx-bal .ppx-coin{width:24px;height:24px}',
    '.ppx-tabs{display:flex;gap:6px;padding:10px 16px 10px}',
    '.ppx-tab{flex:1;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:var(--text-dim,#a3a4ab);font:600 14px/1 inherit;font-family:inherit;cursor:pointer;position:relative}',
    '.ppx-tab.on{color:#fff;background:linear-gradient(120deg,rgba(110,231,208,.22),rgba(139,92,255,.3));border-color:rgba(139,92,255,.5)}',
    '.ppx-tab .ppx-dot{top:-6px;right:-4px}',
    '.ppx-body{flex:1;overflow-y:auto;padding:4px 16px 40px;-webkit-overflow-scrolling:touch}',
    '.ppx-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:16px 4px 8px;font-size:15px;font-weight:700}',
    '.ppx-h small{font-size:12px;font-weight:500;color:var(--text-dim,#8b8c93)}',
    '.ppx-card{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.06);margin-bottom:8px}',
    '.ppx-card.done{border-color:rgba(110,231,208,.45);background:rgba(110,231,208,.08)}',
    '.ppx-card.claimed{opacity:.5}',
    '.ppx-main{flex:1;min-width:0}',
    '.ppx-main b{display:block;font-size:14px;font-weight:600;line-height:1.3}',
    '.ppx-main small{display:block;font-size:12px;color:var(--text-dim,#8b8c93);margin-top:2px;line-height:1.35}',
    '.ppx-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:7px}',
    '.ppx-bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#6ee7d0,#8b5cff)}',
    '.ppx-rw{display:flex;align-items:center;gap:4px;font-size:13px;font-weight:700;white-space:nowrap}',
    '.ppx-btn{height:34px;min-width:64px;padding:0 12px;border-radius:10px;border:0;cursor:pointer;font:700 13px/1 inherit;font-family:inherit;color:#0c0d10;background:linear-gradient(120deg,#6ee7d0,#a68bff);display:inline-flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap}',
    '.ppx-btn.ghost{background:rgba(255,255,255,.07);color:var(--text,#e8e9ec)}',
    '.ppx-btn.arm{background:linear-gradient(120deg,#ffcf5a,#ff7ab6)}',
    '.ppx-btn[disabled]{opacity:.4;cursor:default}',
    '.ppx-btn .ppx-coin{width:15px;height:15px}',
    '.ppx-ico{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-size:19px;background:rgba(255,255,255,.06);flex:0 0 auto;overflow:hidden}',
    '.ppx-ico img{width:100%;height:100%;object-fit:cover;display:block}',
    '.ppx-ico.ppx-emb{background:#0c0d10;box-shadow:0 0 0 1px rgba(139,92,255,.5)}',
    '.ppx-sum{display:flex;gap:10px;margin:8px 0 4px}',
    '.ppx-sum div{flex:1;padding:12px;border-radius:14px;background:rgba(255,255,255,.045);text-align:center}',
    '.ppx-sum b{display:block;font-size:20px}.ppx-sum small{font-size:11.5px;color:var(--text-dim,#8b8c93)}',
    '.ppx-sec{border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);margin-bottom:10px;overflow:hidden}',
    '.ppx-sec>summary{list-style:none;display:flex;align-items:center;gap:12px;padding:11px 12px;cursor:pointer}',
    '.ppx-sec>summary::-webkit-details-marker{display:none}',
    '.ppx-sec>summary .ppx-main b{font-size:15px}',
    '.ppx-sec[open]>summary{border-bottom:1px solid rgba(255,255,255,.06)}',
    '.ppx-list{padding:8px 10px 4px}',
    '.ppx-a{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid rgba(255,255,255,.04)}',
    '.ppx-a:last-child{border-bottom:0}',
    '.ppx-a .ppx-ai{width:26px;text-align:center;font-size:17px;filter:grayscale(1);opacity:.5}',
    '.ppx-a.got .ppx-ai{filter:none;opacity:1}',
    '.ppx-a .ppx-main b{font-size:13.5px}',
    '.ppx-a:not(.got) .ppx-main b{color:var(--text-dim,#a3a4ab)}',
    '.ppx-a .ppx-rw{font-size:12px;color:var(--text-dim,#8b8c93)}',
    '.ppx-a.got .ppx-rw{color:#6ee7d0}',
    '.ppx-seg{display:flex;gap:6px;margin:6px 0 4px}',
    '.ppx-seg button{flex:1;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:none;color:var(--text-dim,#a3a4ab);font:600 13px/1 inherit;font-family:inherit;cursor:pointer}',
    '.ppx-seg button.on{color:#fff;background:rgba(255,255,255,.08)}',
    '.ppx-card.ppx-ex{border-color:rgba(139,92,255,.55);background:linear-gradient(120deg,rgba(110,231,208,.08),rgba(139,92,255,.12) 60%,rgba(255,95,216,.1))}',
    '.ppx-tag.t-bundle{background:linear-gradient(120deg,#ffd66e,#ff9a5c)}',
    '.ppx-tag.t-perk{background:linear-gradient(120deg,#8bd5ff,#7a8bff)}',
    '.ppx-tag.t-mystery{background:linear-gradient(120deg,#c9a0ff,#ff5fd8)}',
    '.ppx-tag.t-twist{background:linear-gradient(120deg,#9dffb0,#6ee7d0)}',
    '.ppx-tag.t-deal{background:linear-gradient(120deg,#ff8f8f,#ffd66e)}',
    '.ppx-tag{display:inline-block;vertical-align:1px;margin-left:4px;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#0c0d10;background:linear-gradient(120deg,#6ee7d0,#ff5fd8)}',
    '.ppx-sw{width:38px;height:38px;border-radius:11px;flex:0 0 auto;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}',
    '.ppx-note{font-size:12px;color:var(--text-dim,#8b8c93);line-height:1.45;margin:10px 4px}',
    '.ppx-log{font-size:12.5px}',
    '.ppx-log div{display:flex;justify-content:space-between;gap:10px;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.04)}',
    '.ppx-log span:last-child{font-weight:700;white-space:nowrap}',
    '#ppx-toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);transform:translateX(-50%);z-index:2147483600;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;width:max-content;max-width:calc(100vw - 32px)}',
    'body.pp-gaming #ppx-toast{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 44px)}',
    '.ppx-t{display:flex;align-items:center;gap:8px;padding:9px 14px 9px 10px;border-radius:999px;font:600 13px/1.25 system-ui,sans-serif;color:#fff;',
    ' background:rgba(20,21,28,.94);border:1px solid rgba(139,92,255,.55);box-shadow:0 8px 24px rgba(0,0,0,.45);animation:ppxIn .2s ease,ppxOut .3s ease 3.2s forwards}',
    '.ppx-t .ppx-coin{width:18px;height:18px}',
    '@keyframes ppxIn{from{opacity:0;transform:translateY(-8px)}}@keyframes ppxOut{to{opacity:0;transform:translateY(-8px)}}'
  ].join('\n');
  document.head.appendChild(css);

  var toastBox = document.createElement('div');
  toastBox.id = 'ppx-toast';
  document.body.appendChild(toastBox);
  function toast(msg){
    var t = document.createElement('div');
    t.className = 'ppx-t';
    t.innerHTML = COIN + '<span>' + esc(msg) + '</span>';
    toastBox.appendChild(t);
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 3600);
  }

  // ---- Games page: points pill and three tiles ----
  var grid = window.__ppGames.grid;
  var head = grid.querySelector('.ppg-head'), sub = grid.querySelector('.ppg-sub');
  var pill = document.createElement('button');
  pill.type = 'button'; pill.className = 'ppx-pill'; pill.setAttribute('aria-label', 'Press Play Points');
  head.appendChild(pill);
  var strip = document.createElement('div');
  strip.className = 'ppx-strip';
  sub.parentNode.insertBefore(strip, sub.nextSibling);
  pill.addEventListener('click', function(){ openHub(claimable() ? 'quests' : 'shop'); });
  strip.addEventListener('click', function(e){ var t = e.target.closest('[data-tab]'); if (t) openHub(t.getAttribute('data-tab')); });

  // first visit to Games each day
  new MutationObserver(function(){
    if (!grid.classList.contains('open')) return;
    if (P.visit !== dayKey()){ P.visit = dayKey(); P.m.visits++; save(); setTimeout(function(){ earn(5, 'Daily visit'); }, 400); }
    changed();
  }).observe(grid, { attributes:true, attributeFilter:['class'] });

  function achTotals(){
    var have = 0, all = 0;
    GAMES.forEach(function(g){
      achDefs(g.id).concat(P.nat[g.id] || []).forEach(function(a){ all++; if (P.ach[g.id + ':' + a.id]) have++; });
    });
    META.forEach(function(a){ all++; if (P.ach['pp:' + a.id]) have++; });
    return { have:have, all:all };
  }
  function renderStrip(){
    var c = claimable(), D = qd(), W = qw(), at = achTotals();
    var dDone = D.list.filter(function(q){ return q.c; }).length;
    pill.innerHTML = COIN + '<span>' + fmt(P.pts) + '</span>' + (c ? '<span class="ppx-dot">' + c + '</span>' : '');
    strip.innerHTML =
      '<button type="button" class="ppx-tile" data-tab="quests"><b>Quests</b><span>' + dDone + '/' + D.list.length + ' today</span>' + (c ? '<span class="ppx-dot">' + c + '</span>' : '') + '</button>' +
      '<button type="button" class="ppx-tile" data-tab="ach"><b>Achievements</b><span>' + at.have + ' of ' + at.all + '</span></button>' +
      '<button type="button" class="ppx-tile" data-tab="shop"><b>Shop</b><span>' + COIN + ' ' + fmt(P.pts) + ' points</span></button>';
  }

  // ---- the hub page ----
  var hubEl = document.createElement('div');
  hubEl.id = 'ppx-hub';
  hubEl.setAttribute('role', 'dialog'); hubEl.setAttribute('aria-label', 'Press Play Points');
  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  hubEl.innerHTML = '<div class="ppx-head"><button type="button" class="ppg-back" aria-label="Back">' + CHEV + '</button><h1 class="ppx-title">Points</h1><div class="ppx-bal"></div></div>' +
    '<div class="ppx-tabs"><button type="button" class="ppx-tab" data-t="quests">Quests</button><button type="button" class="ppx-tab" data-t="ach">Achievements</button><button type="button" class="ppx-tab" data-t="shop">Shop</button></div>' +
    '<div class="ppx-body"></div>';
  document.body.appendChild(hubEl);
  var bodyEl = hubEl.querySelector('.ppx-body'), balEl = hubEl.querySelector('.ppx-bal');
  var tab = 'quests', shopSeg = 'games', openSecs = {};
  hubEl.querySelector('.ppg-back').addEventListener('click', closeHub);
  hubEl.querySelector('.ppx-tabs').addEventListener('click', function(e){
    var b = e.target.closest('[data-t]'); if (!b) return;
    tab = b.getAttribute('data-t'); armed = null; bodyEl.scrollTop = 0; render();
  });
  function hubOpen(){ return hubEl.classList.contains('open'); }
  function openHub(t){
    tab = t || tab;
    if (hubOpen()){ render(); return; }
    hubEl.classList.add('open'); render();
    requestAnimationFrame(function(){ hubEl.classList.add('shown'); });
    try { history.pushState({ ppGames:1, ppHub:1 }, ''); } catch(e){}
  }
  function hideHub(){ hubEl.classList.remove('open', 'shown'); armed = null; }
  function closeHub(){ if (history.state && history.state.ppHub) history.back(); else hideHub(); }
  window.addEventListener('popstate', function(){ if (hubOpen() && !(history.state && history.state.ppHub)) hideHub(); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && hubOpen()){ e.stopImmediatePropagation(); closeHub(); }
  }, true);

  var pendingRender = false;
  function changed(){
    if (pendingRender) return;
    pendingRender = true;
    setTimeout(function(){ pendingRender = false; renderStrip(); if (hubOpen()) render(); }, 30);
  }

  function rwHTML(p){ return '<span class="ppx-rw">' + COIN + ' ' + p + '</span>'; }
  function untilText(ms){
    var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
    if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    return h ? h + 'h ' + m + 'm' : m + 'm';
  }
  function questCard(q, i, S, which, canSwap){
    var p = prog(q, S), dn = p >= q.n, pct = Math.min(100, p / q.n * 100);
    var shown = (q.k === 'time' || q.k === 'music' || q.k === 'late' || q.k === 'listen' || q.k === 'game') ? Math.floor(Math.min(p, q.n)) + ' / ' + q.n + ' min' : Math.floor(Math.min(p, q.n)) + ' / ' + q.n;
    var right;
    if (q.c) right = '<span class="ppx-rw">✓</span>';
    else if (dn) right = '<button type="button" class="ppx-btn" data-claim="' + which + i + '">Claim ' + q.p + '</button>';
    else right = rwHTML(q.p);
    return '<div class="ppx-card' + (q.c ? ' claimed' : dn ? ' done' : '') + '"><div class="ppx-main"><b>' + esc(q.t) + '</b>' +
      '<small>' + shown + (canSwap && !q.c && !dn ? ' · <a href="#" data-swap="' + i + '" style="color:#a68bff">Swap' + (qd().swaps >= 1 ? ' (' + SWAP_COST + ')' : ' (free)') + '</a>' : '') + '</small>' +
      '<div class="ppx-bar"><i style="width:' + pct + '%"></i></div></div>' + right + '</div>';
  }
  function bonusCard(which, box, pts, label){
    var all = box.list.every(function(q){ return q.c; });
    var right = box.bonus ? '<span class="ppx-rw">✓</span>' : all ? '<button type="button" class="ppx-btn" data-bonus="' + which + '">Claim ' + pts + '</button>' : rwHTML(pts);
    return '<div class="ppx-card' + (box.bonus ? ' claimed' : all ? ' done' : '') + '"><div class="ppx-main"><b>' + label + '</b><small>Bonus for claiming all of them</small></div>' + right + '</div>';
  }
  function renderQuests(){
    var D = qd(), W = qw(), now = new Date();
    var endDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
    var wk = new Date(weekKey().replace(/-/g, '/')); wk.setDate(wk.getDate() + 7);
    var h = '<div class="ppx-h">Daily quests <small>New in ' + untilText(endDay) + '</small></div>';
    D.list.forEach(function(q, i){ h += questCard(q, i, td(), 'd', true); });
    h += bonusCard('d', D, 30, 'Finish every daily quest');
    h += '<div class="ppx-h">Weekly quests <small>New in ' + untilText(wk - now) + '</small></div>';
    W.list.forEach(function(q, i){ h += questCard(q, i, tw(), 'w', false); });
    h += bonusCard('w', W, 120, 'Finish every weekly quest');
    h += '<p class="ppx-note">Points also come from achievements in your games (see Achievements) and a small bonus for your first visit to Games each day. The first quest swap each day is free.</p>';
    if (P.log.length){
      h += '<div class="ppx-h">Recent <small>' + fmt(P.tot) + ' earned in total</small></div><div class="ppx-log">' +
        P.log.slice(0, 12).map(function(l){ return '<div><span>' + esc(l.d) + '</span><span style="color:' + (l.n > 0 ? '#6ee7d0' : '#ff9db8') + '">' + (l.n > 0 ? '+' : '') + fmt(l.n) + '</span></div>'; }).join('') + '</div>';
    }
    bodyEl.innerHTML = h;
  }
  function gameIcon(g){ var x = GAMES.filter(function(o){ return o.id === g; })[0]; return x && window.__ppGames.art ? window.__ppGames.art(x) : '🎮'; }
  function achRow(got, icon, name, desc, p){
    return '<div class="ppx-a' + (got ? ' got' : '') + '"><span class="ppx-ai">' + (got ? icon : '🔒') + '</span><div class="ppx-main"><b>' + esc(name) + '</b><small>' + esc(desc) + '</small></div><span class="ppx-rw">' + (got ? '✓ ' : '') + COIN + ' ' + p + '</span></div>';
  }
  function renderAch(){
    var at = achTotals(), earnedA = 0;
    Object.keys(P.ach).forEach(function(){ earnedA++; });
    var h = '<div class="ppx-sum"><div><b>' + at.have + '</b><small>of ' + at.all + ' unlocked</small></div><div><b>' + fmt(P.tot) + '</b><small>points earned</small></div></div>';
    var secs = [{ g:'pp', name:'Press Play', icon:COIN, rows:META.map(function(a){ return [!!P.ach['pp:' + a.id], '🏅', a.n, a.d, a.p]; }) }];
    GAMES.forEach(function(g){
      var rows = achDefs(g.id).map(function(a){ return [!!P.ach[g.id + ':' + a.id], '🏆', a.n, a.d, a.p]; });
      var nat = P.nat[g.id];
      if (nat) rows = rows.concat(nat.map(function(a){ return [!!P.ach[g.id + ':' + a.id], a.i, a.n, a.d, a.p]; }));
      secs.push({ g:g.id, name:g.name, icon:gameIcon(g.id), rows:rows, natMissing:!nat && (g.id === 'cube' || g.id === 'kitchen' || g.id === 'obby') });
    });
    secs.forEach(function(s){
      var have = s.rows.filter(function(r){ return r[0]; }).length;
      h += '<details class="ppx-sec" data-sec="' + s.g + '"' + (openSecs[s.g] ? ' open' : '') + '><summary><span class="ppx-ico">' + s.icon + '</span><div class="ppx-main"><b>' + esc(s.name) + '</b><small>' + have + ' of ' + s.rows.length + (s.natMissing ? ' · open the game once to load its own achievements' : '') + '</small><div class="ppx-bar"><i style="width:' + (s.rows.length ? have / s.rows.length * 100 : 0) + '%"></i></div></div></summary>' +
        '<div class="ppx-list">' + s.rows.map(function(r){ return achRow(r[0], r[1], r[2], r[3], r[4]); }).join('') + '</div></details>';
    });
    bodyEl.innerHTML = h;
    bodyEl.querySelectorAll('details').forEach(function(d){ d.addEventListener('toggle', function(){ openSecs[d.getAttribute('data-sec')] = d.open; }); });
  }
  function buyBtn(key, price, off){
    if (off) return '<button type="button" class="ppx-btn ghost" disabled>' + esc(off) + '</button>';
    var arm = armed === key;
    return '<button type="button" class="ppx-btn' + (arm ? ' arm' : P.pts < price ? ' ghost' : '') + '" data-buy="' + key + '">' + (arm ? 'Confirm' : COIN + ' ' + price) + '</button>';
  }
  function renderShop(){
    var h = '<div class="ppx-seg"><button type="button" data-seg="games" class="' + (shopSeg === 'games' ? 'on' : '') + '">For your games</button><button type="button" data-seg="app" class="' + (shopSeg === 'app' ? 'on' : '') + '">For Press Play</button></div>';
    if (shopSeg === 'games'){
      h += '<div class="ppx-card"><span class="ppx-ico">🎁</span><div class="ppx-main"><b>Lucky Dip</b><small>A random game reward: coins, crates, trophies, vouchers, cash, tokens or weapons.</small></div>' + buyBtn('dip', 45) + '</div>';
      h += '<div class="ppx-card"><span class="ppx-ico">💎</span><div class="ppx-main"><b>Grand Dip <span class="ppx-tag t-mystery">Mystery</span></b><small>A random bigger reward: vouchers, crates, cash, tokens, charms or coins.</small></div>' + buyBtn('dip2', 120) + '</div>';
      var dl = dealToday();
      h += '<div class="ppx-card ppx-ex"><span class="ppx-ico">🏷️</span><div class="ppx-main"><b>Daily Deal <span class="ppx-tag t-deal">35% off</span></b><small>' + esc(NAME[dl.g] + ': ' + dl.it.n + ' (usually ' + dl.it.p + '). ' + dl.it.d) + '</small></div>' + buyBtn('deal', dl.price, td().deal ? 'Back tomorrow' : '') + '</div>';
      GAMES.forEach(function(g){
        var s = SHOP[g.id]; if (!s) return;
        h += '<div class="ppx-h"><span style="display:flex;align-items:center;gap:8px"><span class="ppx-ico" style="width:26px;height:26px;border-radius:8px">' + gameIcon(g.id) + '</span>' + esc(g.name) + '</span><small>' + esc(s.have()) + '</small></div>';
        s.items.forEach(function(it){
          h += '<div class="ppx-card' + (it.x ? ' ppx-ex' : '') + '"><div class="ppx-main"><b>' + esc(it.n) + (it.x ? ' <span class="ppx-tag">Exclusive</span>' : it.t ? ' <span class="ppx-tag t-' + it.t.toLowerCase() + '">' + it.t + '</span>' : '') + '</b><small>' + esc(it.d) + '</small></div>' + buyBtn(g.id + '/' + it.id, it.p, it.off ? it.off() : '') + '</div>';
        });
      });
      h += '<p class="ppx-note">Items marked Press Play exclusive can only be had here. Perks last for good, Twists change your next run, Bundles save points and Mystery Packs give one random item. Game rewards appear the next time you open that game.</p>';
    } else {
      var mg = window.PPModeGate, haveMode = !!(mg && mg.state && mg.state().playground);
      h += '<div class="ppx-h">App modes</div><div class="ppx-card ppx-ex"><span class="ppx-ico ppx-emb'  + '">' + window.__ppEmblem() + '</span><div class="ppx-main"><b>Press Play Playground <span class="ppx-tag">Mode</span></b>'
        + (window.__ppWeb ? '<small>Every game exclusive free, the clicker always out, plus orders, charms, a daily wheel, a card album, a Beat Lab and more. Turn it on with the Playground switch on the Games page.</small></div>'
          : '<small>A fourth app mode: everything unlocked, the clicker always out, every game exclusive free, plus orders, charms, a daily wheel, new EQ presets and backgrounds, and more. Turn it on in Settings → App mode.</small></div>')
        + buyBtn('mode/playground', MODE_PRICE, haveMode ? 'Owned' : (mg && mg.grant ? '' : 'Unavailable')) + '</div>';
      var api = xpApi();
      if (window.__ppWeb){ h += '<p class="ppx-note">Level, XP, background and EQ rewards are for the Press Play app.</p>'; bodyEl.innerHTML = h; return; }
      if (!api){ h += '<p class="ppx-note">Press Play rewards aren\'t available right now.</p>'; bodyEl.innerHTML = h; return; }
      h += '<div class="ppx-h">Level and XP</div>';
      APP.forEach(function(it){ h += '<div class="ppx-card"><div class="ppx-main"><b>' + esc(it.n) + '</b><small>' + esc(it.d) + '</small></div>' + buyBtn('app/' + it.id, it.p) + '</div>'; });
      var L = api.shopLocked();
      h += '<div class="ppx-h">Unlock backgrounds early <small>' + L.bg.length + ' still locked</small></div>';
      if (!L.bg.length) h += '<p class="ppx-note">Every background is already yours.</p>';
      L.bg.forEach(function(b){
        h += '<div class="ppx-card"><span class="ppx-sw" style="background:linear-gradient(' + (b.angle || 135) + 'deg,' + esc(b.c1) + ',' + esc(b.c2) + ')"></span><div class="ppx-main"><b>' + esc(b.name) + '</b><small>' + (b.marathon ? 'Normally from The Marathon' : 'Normally at level ' + b.level) + '</small></div>' + buyBtn('bg/' + b.id, BG_PRICE) + '</div>';
      });
      h += '<div class="ppx-h">Unlock EQ presets early <small>' + L.eq.length + ' still locked</small></div>';
      if (!L.eq.length) h += '<p class="ppx-note">Every EQ preset is already yours.</p>';
      L.eq.forEach(function(q){
        h += '<div class="ppx-card"><span class="ppx-ico">🎚️</span><div class="ppx-main"><b>' + esc(q.name) + '</b><small>Normally at level ' + q.level + '</small></div>' + buyBtn('eq/' + q.id, EQ_PRICE) + '</div>';
      });
    }
    bodyEl.innerHTML = h;
  }
  function render(){
    balEl.innerHTML = COIN + '<span>' + fmt(P.pts) + '</span>';
    hubEl.querySelectorAll('.ppx-tab').forEach(function(b){
      var t = b.getAttribute('data-t'), c = t === 'quests' ? claimable() : 0;
      b.classList.toggle('on', t === tab);
      b.innerHTML = { quests:'Quests', ach:'Achievements', shop:'Shop' }[t] + (c ? '<span class="ppx-dot">' + c + '</span>' : '');
    });
    var y = bodyEl.scrollTop;
    if (tab === 'quests') renderQuests(); else if (tab === 'ach') renderAch(); else renderShop();
    bodyEl.scrollTop = y;
  }
  bodyEl.addEventListener('click', function(e){
    var b;
    if ((b = e.target.closest('[data-claim]'))){ var c = b.getAttribute('data-claim'); claim(c[0], +c.slice(1)); return; }
    if ((b = e.target.closest('[data-bonus]'))){ claimBonus(b.getAttribute('data-bonus')); return; }
    if ((b = e.target.closest('[data-swap]'))){ e.preventDefault(); swap(+b.getAttribute('data-swap')); return; }
    if ((b = e.target.closest('[data-seg]'))){ shopSeg = b.getAttribute('data-seg'); armed = null; render(); return; }
    if ((b = e.target.closest('[data-buy]'))){
      var key = b.getAttribute('data-buy'), parts = key.split('/');
      if (key === 'dip'){
        tryBuy('dip', 45, 'Lucky Dip', function(){
          var opts = DIP.filter(function(d){ var it = itemOf(d[0], d[1]); return it && !(it.off && it.off()); });
          var d = pick(opts), it = itemOf(d[0], d[1]);
          if (!it.buy()) return false;
          setTimeout(function(){ toast('Lucky Dip: ' + it.n + ' for ' + NAME[d[0]]); }, 600);
          return true;
        });
      } else if (key === 'dip2'){
        tryBuy('dip2', 120, 'Grand Dip', function(){
          var opts = DIP2.filter(function(d){ var it = itemOf(d[0], d[1]); return it && !(it.off && it.off()); });
          if (!opts.length) return false;
          var d = pick(opts), it = itemOf(d[0], d[1]);
          if (!it.buy()) return false;
          setTimeout(function(){ toast('Grand Dip: ' + it.n + ' for ' + NAME[d[0]]); }, 600);
          return true;
        });
      } else if (key === 'deal'){
        var dl = dealToday();
        if (!td().deal) tryBuy('deal', dl.price, 'Daily Deal: ' + dl.it.n + ' (' + NAME[dl.g] + ')', function(){
          if (td().deal) return false;
          if (!dl.it.buy()) return false;
          td().deal = 1; return true;
        });
      } else if (parts[0] === 'mode'){
        if (parts[1] === 'playground') tryBuy(key, MODE_PRICE, 'Press Play Playground', function(){ var g = window.PPModeGate; return !!(g && g.grant && g.grant('playground')); });
      } else if (parts[0] === 'app'){
        var a = APP.filter(function(x){ return x.id === parts[1]; })[0];
        if (a) tryBuy(key, a.p, a.n, a.buy);
      } else if (parts[0] === 'bg' || parts[0] === 'eq'){
        var api = xpApi(), L = api && api.shopLocked(), list = L ? L[parts[0]] : [], x = list.filter(function(o){ return o.id === parts[1]; })[0];
        if (x) tryBuy(key, parts[0] === 'bg' ? BG_PRICE : EQ_PRICE, x.name + (parts[0] === 'bg' ? ' background' : ' EQ preset'), function(){ return api.shopUnlock(parts[0], parts[1]); });
      } else {
        var it = itemOf(parts[0], parts[1]);
        if (it && !(it.off && it.off())) tryBuy(key, it.p, it.n + ' (' + NAME[parts[0]] + ')', it.buy);
      }
    }
  });

  // ---- start ----
  qd(); qw(); checkMeta(); save(); renderStrip();
  window.__ppPoints = { state:P, open:openHub, earn:earn, META:META, check:checkMeta, td:td, give:function(g, k, n){ boost(g, k, n); save(true); changed(); return true; } };   // handy for debugging from the console
})();
