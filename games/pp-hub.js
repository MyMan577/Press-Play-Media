/* Press Play Points bridge for games.
   A game reports events and achievements to the app, and picks up boosts bought
   in the Games > Shop. Outside the app (no parent hub) every call is a harmless no-op. */
(function(){
  'use strict';
  var m = /\/games\/([^\/]+)\//.exec(location.pathname);
  var id = m ? m[1] : '';
  function hub(){
    try { return (window.parent && window.parent !== window && window.parent.__ppHub) || null; } catch(e){ return null; }
  }
  function call(fn, args, dflt){
    var h = hub();
    if (!h || typeof h[fn] !== 'function') return dflt;
    try { var r = h[fn].apply(h, [id].concat(args)); return r == null ? dflt : r; } catch(e){ return dflt; }
  }
  window.PPHub = {
    id: id,
    // something countable happened: 'win', 'clear', 'serve'... value is the amount (default 1)
    event: function(type, value){ call('event', [type, value == null ? 1 : value]); },
    // a game-level "best so far" stat: highest ante, best streak...
    best: function(type, value){ call('best', [type, value]); },
    // one of the game's own achievements unlocked
    ach: function(achId){ call('ach', [achId]); },
    // the game's own achievement list: [{id, name, desc, p, done}]
    native: function(list){ call('native', [list]); },
    // a fact the shop needs, such as how many knights are still locked
    info: function(key, value){ call('info', [key, value]); },
    // a Press Play exclusive the player owns for good (cosmetics and the like)
    has: function(kind){ return !!call('has', [kind], false); },
    // take every pending boost of this kind; returns the amount (0 if none)
    take: function(kind){ return +call('take', [kind], 0) || 0; },
    // what the player's equipped Playground charms do in this game: 'score' and 'coins' multiply (1 if none), everything else adds (0 if none)
    charm: function(kind){ var d = (kind === 'score' || kind === 'coins') ? 1 : 0, v = +call('charm', [kind], d); return isFinite(v) ? v : d; },
    // the song playing in the app: { playing, id, title, bpm (0 if not tagged), key, bass (low-end level, -1 if unknown) }
    song: function(){ return call('song', [], null); },
    // how many of a boost are waiting, without using them
    peek: function(kind){ return +call('peek', [kind], 0) || 0; },
    // take just one of a pending boost (for rewards that each need a tap, like crates)
    takeOne: function(kind){ return +call('takeOne', [kind], 0) || 0; }
  };
})();
