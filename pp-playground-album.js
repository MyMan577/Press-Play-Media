/* Press Play Playground: the Card Album.
   Collect cards of the characters, weapons and charms from all ten games. Cards are pulled with Stars or pull tickets,
   duplicates become shards that level cards up, and the album's total power boosts the Disc Clicker. Card art is drawn here as SVG. */
(function(){
  'use strict';
  var PP = window.PPPlayground; if (!PP) return;
  var S = PP.S, esc = PP.esc;
  if (!S.album || typeof S.album !== 'object') S.album = {};
  var A = S.album;
  ['c', 'claimed'].forEach(function(k){ if (!A[k] || typeof A[k] !== 'object') A[k] = {}; });
  ['shards', 'pulls', 'pity', 'lpity'].forEach(function(k){ if (typeof A[k] !== 'number') A[k] = 0; });

  /* ------------------------------------------------------------------ the cards */
  var GAMES = {
    obby:       { n:'Obby Builder',    c:['#8b5cff', '#6ee7d0'] },
    nebula:     { n:'Nebula Touch',    c:['#39d5ff', '#ff5fd8'] },
    toque:      { n:'Toque & Spear',   c:['#ffb36e', '#ff6a3d'] },
    weaponball: { n:'Weapon Ball',     c:['#6ea8ff', '#ff5f7a'] },
    anteup:     { n:'Ante Up',         c:['#3ddc84', '#ffd66e'] },
    lastcard:   { n:'Last Card',       c:['#ff5f7a', '#ffd66e'] },
    blob:       { n:'Blob Barrage',    c:['#6ee7d0', '#3ddc84'] },
    bastion:    { n:'Bastion Brawl',   c:['#b05cff', '#6ea8ff'] },
    kitchen:    { n:'Kitchen Rush',    c:['#ffb36e', '#ff5f7a'] },
    cube:       { n:'Dashcube Knight', c:['#9aa3b2', '#8b5cff'] }
  };
  // rarity: C common, R rare, E epic, L legendary, X Press Play exclusive
  var CARDS = [
    ['obby_turbo', 'obby', 'Turbo', 'C', 'bolt'], ['obby_pebble', 'obby', 'Pebble', 'C', 'ball'], ['obby_wraith', 'obby', 'Wraith', 'R', 'orb'], ['obby_chroma', 'obby', 'Chroma', 'E', 'gem'], ['obby_titan', 'obby', 'Titan', 'L', 'shield'], ['obby_prodigy', 'obby', 'Press Play Prodigy', 'X', 'phones'],
    ['neb_aurora', 'nebula', 'Aurora', 'C', 'spiral'], ['neb_ember', 'nebula', 'Ember Field', 'C', 'flame'], ['neb_frost', 'nebula', 'Frost Veil', 'R', 'wave'], ['neb_bloom', 'nebula', 'Nebula Bloom', 'E', 'orb'], ['neb_starfall', 'nebula', 'Starfall', 'L', 'star'],
    ['toq_hunter', 'toque', 'Hunter', 'C', 'spear'], ['toq_hawk', 'toque', 'Trophy Hawk', 'C', 'star'], ['toq_wolf', 'toque', 'Wolf Spirit', 'R', 'paw'], ['toq_rite', 'toque', "Ancestor's Rite", 'E', 'flame'], ['toq_elk', 'toque', 'Great Elk Spirit', 'L', 'crown'], ['toq_panther', 'toque', 'Press Play Panther', 'X', 'paw'],
    ['wb_hammer', 'weaponball', 'Hammer Ball', 'C', 'ball'], ['wb_sword', 'weaponball', 'Sword Ball', 'C', 'sword'], ['wb_tax', 'weaponball', 'Tax Collector', 'R', 'gem'], ['wb_shock', 'weaponball', 'Aftershock', 'E', 'bolt'], ['wb_hole', 'weaponball', 'Black Hole', 'L', 'orb'],
    ['ante_ace', 'anteup', 'Ace of Spades', 'C', 'spade'], ['ante_change', 'anteup', 'Pocket Change', 'C', 'gem'], ['ante_seven', 'anteup', 'Lucky Seven', 'R', 'card'], ['ante_flush', 'anteup', 'Royal Flush', 'E', 'crown'], ['ante_joker', 'anteup', 'The Joker', 'L', 'wizard'], ['ante_encore', 'anteup', 'Encore Charm', 'X', 'star'],
    ['lc_skip', 'lastcard', 'Skip', 'C', 'flag'], ['lc_rev', 'lastcard', 'Reverse', 'C', 'spiral'], ['lc_draw', 'lastcard', 'Draw Two', 'R', 'card'], ['lc_wild', 'lastcard', 'Wild +4', 'E', 'gem'], ['lc_last', 'lastcard', 'Last Card!', 'L', 'crown'], ['lc_back', 'lastcard', 'Press Play Card Back', 'X', 'card'],
    ['blob_baz', 'blob', 'Bazooka', 'C', 'bomb'], ['blob_gren', 'blob', 'Grenade', 'C', 'bomb'], ['blob_air', 'blob', 'Air Strike', 'R', 'bolt'], ['blob_nuke', 'blob', 'Nuke', 'E', 'flame'], ['blob_meteor', 'blob', 'Meteor Shower', 'L', 'star'], ['blob_aura', 'blob', 'Press Play Aura', 'X', 'orb'],
    ['bas_archer', 'bastion', 'Archers', 'C', 'spear'], ['bas_knight', 'bastion', 'Knight', 'C', 'sword'], ['bas_mega', 'bastion', 'Mega Knight', 'R', 'shield'], ['bas_tank', 'bastion', "Da Vinci's Tank", 'E', 'tower'], ['bas_crystal', 'bastion', 'Crystal Vanguard', 'L', 'gem'], ['bas_paragon', 'bastion', 'Press Play Paragon', 'X', 'shield'], ['bas_maestro', 'bastion', 'Press Play Maestro', 'X', 'wave'],
    ['kit_chef', 'kitchen', 'Chef', 'C', 'hat'], ['kit_waiter', 'kitchen', 'Waiter', 'C', 'flag'], ['kit_pan', 'kitchen', 'Frying Pan', 'R', 'pan'], ['kit_stack', 'kitchen', 'Burger Stack', 'E', 'blob'], ['kit_spatula', 'kitchen', 'Golden Spatula', 'L', 'sword'], ['kit_jukebox', 'kitchen', 'Press Play Jukebox', 'X', 'wave'],
    ['cub_knight', 'cube', 'Knight', 'C', 'sword'], ['cub_dwarf', 'cube', 'Dwarf', 'C', 'shield'], ['cub_valk', 'cube', 'Valkyrie', 'R', 'spear'], ['cub_sage', 'cube', 'Storm Sage', 'E', 'bolt'], ['cub_wizard', 'cube', 'Wizard', 'L', 'wizard'], ['cub_paladin', 'cube', 'Press Play Paladin', 'X', 'helm'], ['cub_phantom', 'cube', 'Press Play Phantom', 'X', 'helm']
  ].map(function(r){ return { id:r[0], g:r[1], n:r[2], r:r[3], glyph:r[4] }; });
  var BY = {}; CARDS.forEach(function(c){ BY[c.id] = c; });
  var RAR = {
    C:{ name:'Common',    col:'#9aa3b2', pow:1,  shards:1,  up:2,  w:60 },
    R:{ name:'Rare',      col:'#6ea8ff', pow:3,  shards:4,  up:6,  w:28 },
    E:{ name:'Epic',      col:'#b05cff', pow:8,  shards:12, up:16, w:9.5 },
    L:{ name:'Legendary', col:'#ffb36e', pow:20, shards:30, up:40, w:2.2 },
    X:{ name:'Press Play', col:'#6ee7d0', pow:40, shards:80, up:90, w:0.3 }
  };
  var PULL = 12, MAXLV = 5, CRAFT = 150, EPIC_PITY = 20, LEG_PITY = 90;
  PP.album = { cards: CARDS, state: A };

  /* ------------------------------------------------------------------ drawn art */
  var G = {
    sword:  function(a, b){ return '<path d="M32 5l5 6-2 25h-6l-2-25z" fill="' + a + '"/><rect x="21" y="36" width="22" height="5" rx="2.5" fill="' + b + '"/><rect x="29" y="41" width="6" height="13" rx="3" fill="' + b + '"/>'; },
    shield: function(a, b){ return '<path d="M32 7l18 6v14c0 12-8 20-18 25C22 47 14 39 14 27V13z" fill="' + a + '"/><path d="M32 15l11 4v8c0 8-5 13-11 17z" fill="' + b + '" opacity=".85"/>'; },
    ball:   function(a, b){ return '<circle cx="32" cy="32" r="17" fill="' + a + '"/><path d="M17 28c10 2 20 2 30 0" stroke="' + b + '" stroke-width="3" fill="none"/><circle cx="26" cy="25" r="4" fill="#fff" opacity=".5"/>'; },
    hat:    function(a, b){ return '<path d="M19 40v-8a8 8 0 0 1 4-14 9 9 0 0 1 18 0 8 8 0 0 1 4 14v8z" fill="' + a + '"/><rect x="19" y="41" width="26" height="8" rx="3" fill="' + b + '"/>'; },
    spade:  function(a, b){ return '<path d="M32 8c10 10 19 16 19 25a9.5 9.5 0 0 1-17 5c1 5 3 9 6 12H24c3-3 5-7 6-12a9.5 9.5 0 0 1-17-5c0-9 9-15 19-25z" fill="' + a + '"/><circle cx="32" cy="30" r="3.5" fill="' + b + '"/>'; },
    blob:   function(a, b){ return '<path d="M12 46c-2-13 6-28 20-28s22 15 20 28c-1 7-9 9-20 9s-19-2-20-9z" fill="' + a + '"/><circle cx="25" cy="35" r="5" fill="#fff"/><circle cx="40" cy="35" r="5" fill="#fff"/><circle cx="26" cy="36" r="2.4" fill="' + b + '"/><circle cx="41" cy="36" r="2.4" fill="' + b + '"/>'; },
    tower:  function(a, b){ return '<path d="M16 54V26h6v-6h6v6h8v-6h6v6h6v28z" fill="' + a + '"/><path d="M27 54V43a5 5 0 0 1 10 0v11z" fill="' + b + '"/>'; },
    spear:  function(a, b){ return '<path d="M32 4l7 13h-5v39h-4V17h-5z" fill="' + a + '"/><rect x="28" y="40" width="8" height="4" rx="2" fill="' + b + '"/>'; },
    star:   function(a, b){ return '<path d="M32 6l7.5 16 17 2-12.5 12 3.5 17-15.5-8.5L16.5 53l3.5-17L7.5 24l17-2z" fill="' + a + '"/><circle cx="32" cy="32" r="5" fill="' + b + '"/>'; },
    crown:  function(a, b){ return '<path d="M11 44l-2-24 13 10 10-16 10 16 13-10-2 24z" fill="' + a + '"/><rect x="11" y="46" width="42" height="7" rx="2.5" fill="' + b + '"/>'; },
    bolt:   function(a, b){ return '<path d="M37 5L15 37h13l-4 22 25-34H35z" fill="' + a + '"/><path d="M37 5L26 24" stroke="' + b + '" stroke-width="2.5" opacity=".8"/>'; },
    phones: function(a, b){ return '<path d="M13 36a19 19 0 0 1 38 0" fill="none" stroke="' + a + '" stroke-width="5.5" stroke-linecap="round"/><rect x="9" y="34" width="10" height="18" rx="5" fill="' + b + '"/><rect x="45" y="34" width="10" height="18" rx="5" fill="' + b + '"/><path d="M28 29v12l10-6z" fill="#fff"/>'; },
    flame:  function(a, b){ return '<path d="M32 5c3 11 15 15 15 30a15 15 0 0 1-30 0c0-9 4-13 9-17 0 6 3 8 5 8-1-9-1-15 1-21z" fill="' + a + '"/><path d="M32 30c2 6 8 8 8 15a8 8 0 0 1-16 0c0-5 3-8 8-15z" fill="' + b + '"/>'; },
    gem:    function(a, b){ return '<path d="M19 17h26l11 13-24 27L8 30z" fill="' + a + '"/><path d="M8 30h48M19 17l13 40M45 17L32 57M26 17l-6 13M38 17l6 13" stroke="' + b + '" stroke-width="2" fill="none" opacity=".85"/>'; },
    bomb:   function(a, b){ return '<circle cx="30" cy="38" r="17" fill="' + a + '"/><path d="M40 24l6-7" stroke="' + b + '" stroke-width="4" stroke-linecap="round"/><path d="M47 10l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="' + b + '"/><circle cx="24" cy="32" r="4" fill="#fff" opacity=".35"/>'; },
    wizard: function(a, b){ return '<path d="M32 6l14 36H18z" fill="' + a + '"/><rect x="10" y="42" width="44" height="8" rx="4" fill="' + b + '"/><path d="M32 20l2 5 5 .5-4 3.5 1 5-4-3-4 3 1-5-4-3.5 5-.5z" fill="#fff" opacity=".9"/>'; },
    wave:   function(a, b){ return '<path d="M6 32c5-16 10-16 13 0s8 16 13 0 8-16 13 0 8 16 13 0" fill="none" stroke="' + a + '" stroke-width="5" stroke-linecap="round"/><g fill="' + b + '"><rect x="14" y="48" width="5" height="8" rx="2.5"/><rect x="24" y="44" width="5" height="12" rx="2.5"/><rect x="34" y="47" width="5" height="9" rx="2.5"/><rect x="44" y="50" width="5" height="6" rx="2.5"/></g>'; },
    orb:    function(a, b){ return '<circle cx="32" cy="32" r="17" fill="' + a + '"/><ellipse cx="32" cy="32" rx="26" ry="8" fill="none" stroke="' + b + '" stroke-width="3" transform="rotate(-25 32 32)"/><circle cx="26" cy="26" r="5" fill="#fff" opacity=".45"/>'; },
    card:   function(a, b){ return '<rect x="16" y="9" width="32" height="46" rx="5" fill="' + a + '" transform="rotate(-8 32 32)"/><rect x="20" y="13" width="24" height="38" rx="3" fill="none" stroke="' + b + '" stroke-width="2.5" transform="rotate(-8 32 32)"/><circle cx="32" cy="32" r="6" fill="' + b + '"/>'; },
    flag:   function(a, b){ return '<rect x="17" y="8" width="4" height="48" rx="2" fill="' + b + '"/><path d="M21 10c10-6 14 6 26 0v22c-12 6-16-6-26 0z" fill="' + a + '"/>'; },
    pan:    function(a, b){ return '<circle cx="27" cy="31" r="17" fill="' + a + '"/><circle cx="27" cy="31" r="11" fill="#000" opacity=".25"/><rect x="42" y="28" width="18" height="7" rx="3.5" fill="' + b + '"/>'; },
    spiral: function(a, b){ return '<path d="M32 32m0 0a3 3 0 0 1 6 0 8 8 0 0 1-14 0 14 14 0 0 1 26 0 20 20 0 0 1-38 0" fill="none" stroke="' + a + '" stroke-width="4.5" stroke-linecap="round"/><circle cx="32" cy="32" r="3" fill="' + b + '"/>'; },
    paw:    function(a, b){ return '<ellipse cx="32" cy="40" rx="13" ry="11" fill="' + a + '"/><ellipse cx="16" cy="26" rx="5" ry="7" fill="' + b + '"/><ellipse cx="27" cy="17" rx="5" ry="7.5" fill="' + b + '"/><ellipse cx="38" cy="17" rx="5" ry="7.5" fill="' + b + '"/><ellipse cx="49" cy="26" rx="5" ry="7" fill="' + b + '"/>'; },
    helm:   function(a, b){ return '<path d="M13 38a19 19 0 0 1 38 0v14H13z" fill="' + a + '"/><rect x="13" y="36" width="38" height="7" fill="#000" opacity=".35"/><path d="M32 8v14" stroke="' + b + '" stroke-width="4" stroke-linecap="round"/><path d="M26 30l6 4 6-4" fill="none" stroke="' + b + '" stroke-width="3" stroke-linecap="round"/>'; }
  };
  var idN = 0;
  function art(c, locked){
    var g = GAMES[c.g].c, n = ++idN, r = RAR[c.r], gid = 'pga' + n;
    var a = locked ? '#2b2d36' : g[0], b = locked ? '#3a3d46' : g[1];
    var shine = (!locked && (c.r === 'L' || c.r === 'X')) ? '<path d="M-10 50L30 -10h14L4 60z" fill="#fff" opacity=".12"><animateTransform attributeName="transform" type="translate" from="-30 0" to="80 0" dur="3.4s" repeatCount="indefinite"/></path>' : '';
    var spark = (!locked && (c.r === 'E' || c.r === 'L' || c.r === 'X')) ? '<path d="M52 8l1.4 3.6 3.6 1.4-3.6 1.4L52 18l-1.4-3.6L47 13l3.6-1.4z" fill="' + r.col + '"/><path d="M11 50l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6L7.4 53.6l2.6-1z" fill="' + g[1] + '"/>' : '';
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="width:100%;height:100%;display:block"><defs><radialGradient id="' + gid + '" cx=".3" cy=".2" r="1.1"><stop offset="0" stop-color="' + (locked ? '#1d1f26' : g[0]) + '" stop-opacity="' + (locked ? 1 : 0.55) + '"/><stop offset="1" stop-color="#0c0d10"/></radialGradient></defs>' +
      '<rect width="64" height="64" fill="url(#' + gid + ')"/>' + (G[c.glyph] || G.star)(a, b) + shine + spark + '</svg>';
  }
  function cardHTML(c, o){
    o = o || {};
    var have = A.c[c.id], r = RAR[c.r], locked = !have && !o.force;
    return '<div class="pga-card r' + c.r + (locked ? ' lock' : '') + '" data-pga-card="' + c.id + '"><div class="pga-art">' + art(c, locked) + '</div>' +
      '<div class="pga-n">' + (locked ? '???' : esc(c.n)) + '</div>' +
      (have ? '<div class="pga-lv">' + new Array(have.lv + 1).join('★') + (have.n > 1 ? ' ×' + have.n : '') + '</div>' : '<div class="pga-lv" style="opacity:.5">' + r.name + '</div>') +
      (o.tag ? '<div class="pga-tag">' + o.tag + '</div>' : '') + '</div>';
  }

  /* ------------------------------------------------------------------ the maths */
  function power(){
    var p = 0;
    Object.keys(A.c).forEach(function(id){ var c = BY[id]; if (c) p += RAR[c.r].pow * A.c[id].lv; });
    return p;
  }
  function bonus(){ return Math.min(1, power() / 1200); }
  PP.addMult(function(kind){ return (kind === 'click' || kind === 'ps') ? 1 + bonus() : 1; });
  function owned(){ return Object.keys(A.c).length; }
  function setInfo(gid){
    var list = CARDS.filter(function(c){ return c.g === gid && c.r !== 'X'; }), have = list.filter(function(c){ return A.c[c.id]; }).length;
    return { have: have, all: list.length, done: have === list.length };
  }
  function grant(c){
    var e = A.c[c.id];
    if (!e){ A.c[c.id] = { n:1, lv:1 }; return { isNew:true, shards:0 }; }
    e.n++; var sh = RAR[c.r].shards; A.shards += sh; return { isNew:false, shards:sh };
  }
  function pickCard(rarity){
    var pool = CARDS.filter(function(c){ return c.r === rarity; });
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function rollRarity(){
    A.pity++; A.lpity++;
    var r;
    if (A.lpity >= LEG_PITY) r = 'L';
    else if (A.pity >= EPIC_PITY) r = Math.random() < 0.8 ? 'E' : 'L';
    else {
      var tot = 0, k; for (k in RAR) tot += RAR[k].w;
      var x = Math.random() * tot; r = 'C';
      for (k in RAR){ x -= RAR[k].w; if (x < 0){ r = k; break; } }
    }
    if (r === 'E' || r === 'L' || r === 'X') A.pity = 0;
    if (r === 'L' || r === 'X') A.lpity = 0;
    return r;
  }
  function doPull(n, useTickets){
    var cost = Math.ceil(PULL * n * PP.mult('pull'));
    if (useTickets){ if (!PP.spendTickets(n)){ PP.toast('You need ' + n + ' pull ticket' + (n > 1 ? 's' : '')); return; } }
    else if (!PP.spendStars(cost)){ PP.toast('You need ' + (cost - S.stars) + ' more ⭐ Stars'); return; }
    var res = [];
    for (var i = 0; i < n; i++){ var c = pickCard(rollRarity()), g = grant(c); res.push({ c:c, g:g }); }
    A.pulls += n; PP.stat('pulls', n); PP.save(true);
    var best = 'C'; res.forEach(function(x){ if ('CREL'.indexOf(x.c.r) > 'CREL'.indexOf(best) || x.c.r === 'X') best = x.c.r; });
    if (best === 'L' || best === 'X') PP.chime(); else PP.blip(best === 'E' ? 880 : 660, 0.12, 'triangle', 0.1);
    showResults(res); if (PP.checkAch) PP.checkAch();
  }
  function levelCost(c){ var e = A.c[c.id]; return RAR[c.r].up * e.lv; }
  function upgrade(id){
    var c = BY[id], e = A.c[id]; if (!c || !e || e.lv >= MAXLV) return;
    var cost = levelCost(c); if (A.shards < cost){ PP.toast('You need ' + (cost - A.shards) + ' more ✨ shards'); return; }
    A.shards -= cost; e.lv++; PP.save(true); PP.chime(); PP.toast('⬆️ ' + c.n + ' is now level ' + e.lv); if (PP.checkAch) PP.checkAch();
  }
  function craft(id){
    var c = BY[id]; if (!c || c.r !== 'X' || A.c[id]) return;
    if (A.shards < CRAFT){ PP.toast('Crafting a Press Play card costs ' + CRAFT + ' ✨ shards (you have ' + A.shards + ')'); return; }
    A.shards -= CRAFT; A.c[id] = { n:1, lv:1 }; PP.save(true); PP.chime(); PP.toast('✨ Crafted ' + c.n + '!'); if (PP.checkAch) PP.checkAch();
  }
  function claimSet(gid){
    var si = setInfo(gid); if (!si.done || A.claimed[gid]) return;
    A.claimed[gid] = 1; PP.addStars(100, 'for completing ' + GAMES[gid].n, true);
    try { if (window.__ppPoints && window.__ppPoints.earn) window.__ppPoints.earn(50, GAMES[gid].n + ' album set', true); } catch(e){}
    PP.save(true); PP.chime(); PP.toast('🏆 ' + GAMES[gid].n + ' set complete: +100 ⭐ and 50 Points'); if (PP.checkAch) PP.checkAch();
  }

  /* ------------------------------------------------------------------ the tab */
  var css = document.createElement('style'); css.id = 'pga-style';
  css.textContent = [
    '.pga-top{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '.pga-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px;margin-top:10px}',
    '.pga-card{position:relative;border-radius:14px;padding:6px 6px 8px;background:var(--bg,#0c0d10);border:2px solid var(--rc,#9aa3b2);text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.pga-card.rC{--rc:#9aa3b2}.pga-card.rR{--rc:#6ea8ff}.pga-card.rE{--rc:#b05cff}.pga-card.rL{--rc:#ffb36e;box-shadow:0 0 14px rgba(255,179,110,.35)}',
    '.pga-card.rX{border-color:transparent;background:linear-gradient(var(--bg,#0c0d10),var(--bg,#0c0d10)) padding-box,linear-gradient(135deg,#6ee7d0,#8b5cff,#ff5fd8) border-box;box-shadow:0 0 14px rgba(139,92,255,.4)}',
    '.pga-card.lock{opacity:.6;filter:grayscale(.6)}',
    '.pga-art{aspect-ratio:1;border-radius:9px;overflow:hidden}',
    '.pga-n{font-size:11px;font-weight:700;margin-top:5px;line-height:1.15;min-height:26px;display:flex;align-items:center;justify-content:center}',
    '.pga-lv{font-size:10px;color:#ffd66e;letter-spacing:.04em;min-height:12px}',
    '.pga-tag{position:absolute;top:-6px;right:-4px;padding:2px 6px;border-radius:8px;background:#ff5f7a;color:#fff;font:800 9px/1.3 system-ui,sans-serif}',
    '.pga-sec{margin-top:14px}.pga-sec summary{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:700;font-size:14px;cursor:pointer;list-style:none}',
    '.pga-sec summary::-webkit-details-marker{display:none}',
    '.pga-modal{position:absolute;inset:0;z-index:5;background:rgba(5,6,10,.88);display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto}',
    '.pga-box{width:min(420px,100%);max-height:100%;overflow:auto;text-align:center}',
    '.pga-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:10px;margin:14px 0}',
    '.pga-res .pga-card{animation:pgaFlip .5s both}',
    '@keyframes pgaFlip{from{transform:rotateY(90deg) scale(.7);opacity:0}to{transform:none;opacity:1}}',
    '.pga-big{width:150px;margin:0 auto 12px}.pga-big .pga-card{cursor:default}'
  ].join('\n');
  document.head.appendChild(css);

  var tabEl = null, modalEl = null;
  function closeModal(){ if (modalEl){ modalEl.remove(); modalEl = null; } }
  function openModal(html){
    closeModal();
    var host = document.getElementById('pgr-hub'); if (!host) return;
    modalEl = document.createElement('div'); modalEl.className = 'pga-modal'; modalEl.innerHTML = '<div class="pga-box">' + html + '</div>';
    modalEl.addEventListener('click', function(e){
      if (e.target === modalEl || e.target.closest('[data-pga-close]')){ closeModal(); return; }
      var b = e.target.closest('[data-pga-up]'); if (b){ upgrade(b.getAttribute('data-pga-up')); showDetail(b.getAttribute('data-pga-up')); return; }
      b = e.target.closest('[data-pga-craft]'); if (b){ craft(b.getAttribute('data-pga-craft')); showDetail(b.getAttribute('data-pga-craft')); return; }
    });
    host.appendChild(modalEl);
  }
  function showResults(res){
    var cards = res.map(function(x, i){
      var tag = x.g.isNew ? 'NEW' : '+' + x.g.shards + ' ✨';
      return cardHTML(x.c, { force:true, tag:tag }).replace('class="pga-card', 'style="animation-delay:' + (i * 0.12) + 's" class="pga-card');
    }).join('');
    openModal('<h3 style="margin:0">' + (res.length > 1 ? 'You pulled ' + res.length + ' cards' : 'You pulled…') + '</h3><div class="pga-res">' + cards + '</div><button type="button" class="pgr-btn" data-pga-close>Nice</button>');
    PP.refresh && PP.refresh();
    render(tabEl);
  }
  function showDetail(id){
    var c = BY[id]; if (!c) return;
    var e = A.c[id], r = RAR[c.r], gm = GAMES[c.g];
    var body = '<div class="pga-big">' + cardHTML(c, { force: !!e }) + '</div><h3 style="margin:0">' + (e ? esc(c.n) : 'Not found yet') + '</h3>' +
      '<div class="pgr-meta" style="margin:4px 0 10px"><span style="color:' + r.col + ';font-weight:800">' + r.name + '</span> · ' + esc(gm.n) + '</div>';
    if (e){
      var cost = levelCost(c);
      body += '<p class="pgr-sub">Adds <b>' + (r.pow * e.lv) + '</b> album power at level ' + e.lv + (e.lv < MAXLV ? ' (<b>' + (r.pow * (e.lv + 1)) + '</b> at level ' + (e.lv + 1) + ')' : ' (max level)') + '. You have ' + e.n + ' of this card.</p>' +
        (e.lv < MAXLV ? '<button type="button" class="pgr-btn" data-pga-up="' + id + '"' + (A.shards < cost ? ' style="opacity:.55"' : '') + '>⬆️ Level up · ' + cost + ' ✨</button>' : '<div class="pgr-chip" style="display:inline-block">Max level</div>');
    } else if (c.r === 'X'){
      body += '<p class="pgr-sub">A Press Play exclusive card: a very rare pull, or craft it with ' + CRAFT + ' ✨ shards (you have ' + A.shards + ').</p>' +
        '<button type="button" class="pgr-btn" data-pga-craft="' + id + '"' + (A.shards < CRAFT ? ' style="opacity:.55"' : '') + '>✨ Craft · ' + CRAFT + '</button>';
    } else body += '<p class="pgr-sub">Pull cards to find it. Duplicates turn into ✨ shards that level your cards up.</p>';
    body += '<div style="margin-top:12px"><button type="button" class="pgr-btn alt sm" data-pga-close>Close</button></div>';
    openModal(body);
  }
  function render(el){
    if (!el) return; tabEl = el;
    var cost1 = Math.ceil(PULL * PP.mult('pull')), cost10 = Math.ceil(PULL * 10 * PP.mult('pull'));
    var bon = Math.round(bonus() * 100), tk = PP.tickets();
    var firstOpen = owned() === 0;
    var sections = Object.keys(GAMES).map(function(gid, gi){
      var list = CARDS.filter(function(c){ return c.g === gid; }), si = setInfo(gid);
      return '<details class="pga-sec"' + ((si.have && !si.done) || (firstOpen && gi === 0) ? ' open' : '') + '><summary><span>' + esc(GAMES[gid].n) + ' <span class="pgr-meta">' + si.have + '/' + si.all + '</span></span>' +
        (si.done && !A.claimed[gid] ? '<button type="button" class="pgr-btn sm" data-pga-set="' + gid + '">Claim set +100 ⭐</button>' : si.done ? '<span class="pgr-chip">Set complete ✔</span>' : '') +
        '</summary><div class="pga-grid">' + list.map(function(c){ return cardHTML(c); }).join('') + '</div></details>';
    }).join('');
    el.innerHTML = '<div class="pgr-card pgr-hero"><h3>Card Album</h3><p class="pgr-sub" style="margin:0">Collect the characters, weapons and charms from all ten games. Total album power gives your Disc Clicker a permanent bonus. Duplicates become ✨ shards that level cards up. Every ' + EPIC_PITY + ' pulls guarantees an Epic or better.</p>' +
      '<div class="pgr-chips"><span class="pgr-chip">🎴 ' + owned() + '/' + CARDS.length + ' cards</span><span class="pgr-chip">⚡ ' + power() + ' power (+' + bon + '% clicker)</span><span class="pgr-chip">✨ ' + A.shards + ' shards</span><span class="pgr-chip">🎫 ' + tk + ' ticket' + (tk === 1 ? '' : 's') + '</span></div>' +
      '<div class="pga-top"><button type="button" class="pgr-btn" data-pga-pull="1">Pull · ⭐ ' + cost1 + '</button><button type="button" class="pgr-btn" data-pga-pull="10">Pull ×10 · ⭐ ' + cost10 + '</button>' +
      '<button type="button" class="pgr-btn alt"' + (tk ? '' : ' disabled') + ' data-pga-ticket="1">Use a ticket (' + tk + ')</button></div>' +
      '<div class="pgr-meta" style="margin-top:8px">Epic guarantee in ' + Math.max(0, EPIC_PITY - A.pity) + ' pulls · Legendary guarantee in ' + Math.max(0, LEG_PITY - A.lpity) + ' pulls</div></div>' + sections +
      '<p class="pgr-note">Odds per pull: Common 60%, Rare 28%, Epic 9.5%, Legendary 2.2%, Press Play exclusive 0.3%. Complete a game\'s five cards (not counting exclusives) for a set reward.</p>';
  }
  document.getElementById('pgr-body').addEventListener('click', function(e){
    var b;
    if ((b = e.target.closest('[data-pga-pull]'))){ doPull(+b.getAttribute('data-pga-pull'), false); return; }
    if ((b = e.target.closest('[data-pga-ticket]'))){ doPull(1, true); return; }
    if ((b = e.target.closest('[data-pga-set]'))){ e.preventDefault(); claimSet(b.getAttribute('data-pga-set')); render(tabEl); return; }
    if ((b = e.target.closest('[data-pga-card]')) && e.target.closest('.pga-sec')){ showDetail(b.getAttribute('data-pga-card')); return; }
  });
  PP.registerTab({ id:'album', label:'🎴 Album', order:40, render:render, onHide:closeModal, badge:function(){ return PP.tickets() || 0; } });

  PP.addOrderKind({ id:'pull', stat:'pulls', unit:'', t:function(n){ return n === 1 ? 'Pull a card in the Album' : 'Pull ' + n + ' cards in the Album'; }, tgt:[1, 3, 6] });
  PP.registerAch([
    ['pg_card1',  'First Pull',        'Pull a card',                    15, function(){ return A.pulls; }, 1],
    ['pg_card25', 'Collector\'s Eye',  'Own 25 different cards',         60, function(){ return owned(); }, 25],
    ['pg_card50', 'Full Album',        'Own 50 different cards',        200, function(){ return owned(); }, 50],
    ['pg_leg',    'Legend',            'Own a Legendary card',           50, function(){ return CARDS.filter(function(c){ return c.r === 'L' && A.c[c.id]; }).length; }, 1],
    ['pg_x',      'Press Play Pull',   'Own a Press Play exclusive card',80, function(){ return CARDS.filter(function(c){ return c.r === 'X' && A.c[c.id]; }).length; }, 1],
    ['pg_set1',   'Set Complete',      'Complete a game\'s card set',    60, function(){ return Object.keys(A.claimed).length; }, 1],
    ['pg_set5',   'Five Sets',         'Complete five card sets',       150, function(){ return Object.keys(A.claimed).length; }, 5],
    ['pg_lv5',    'Maxed Out',         'Take a card to level 5',         70, function(){ return Object.keys(A.c).filter(function(id){ return A.c[id].lv >= MAXLV; }).length; }, 1]
  ]);
})();
