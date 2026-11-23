/*
 * Press Play "Headphone space": a new version of a song made for headphones, saved to the library as an ordinary
 * track (so the native player, background play, the notification, EQ and the visualizer all just work).
 *
 *  - Split ears:      the vocals in one ear, the music in the other.
 *  - 360 orbit:       the vocals (or the whole song) circle your head, through real 3D headphone sound (HRTF).
 *  - Beat-locked 360: the same orbit, one full turn every 4, 8 or 16 bars of the song's own tempo.
 *
 * Split songs use their stems ("<title> (Vocals)" etc., t.stem with t.stemOf = the song). Only one side is needed:
 * the other is the song minus it. Stems can be MP3, which adds a short delay, so every stem is lined up with the
 * song before it is used. A song that was never split can still orbit as a whole, or be split from here first.
 * Stems themselves (e.g. just the vocals) and videos can be picked too: a stem orbits as a whole, and a video comes
 * back as a video (the picture copied as it is, the new sound under it), or as audio if the phone cannot do that.
 */
(function () {
  'use strict';
  var API = function () { return window.__ppApi; };
  var $ = function (id) { return document.getElementById(id); };
  var SR = 44100;
  var st = { mode: 'ears', side: 'L', sep: 1, what: 'vocals', secs: 8, bars: 8 };
  try { var sv = JSON.parse(localStorage.getItem('ppSpatial') || 'null'); if (sv) for (var k in st) if (sv[k] != null) st[k] = sv[k]; } catch (e) {}
  function saveSt() { try { localStorage.setItem('ppSpatial', JSON.stringify(st)); } catch (e) {} }
  function toast(m) { try { var s = $('toast-stack'); if (!s) return; var e = document.createElement('div'); e.className = 'toast'; e.textContent = m; s.appendChild(e); setTimeout(function () { e.remove(); }, 3500); } catch (x) {} }

  // ---------- songs and their stems ----------
  function tracks() { var a = API(); return a ? a.tracks() : []; }
  function byId(id) { return tracks().filter(function (t) { return String(t.dbId) === String(id); })[0] || null; }
  function part(t) { var m = /\(([^()]+)\)\s*$/.exec(t.title || ''); return m ? m[1].trim().toLowerCase() : ''; }
  function stemsOf(t) {
    if (!t) return [];
    var id = String(t.dbId);
    return tracks().filter(function (x) {
      return x && x.stem && x !== t && x.url &&
        (x.stemOf != null ? String(x.stemOf) === id : (x.stemSrc && x.stemSrc === t.title));
    });
  }
  // what is there: the vocals stem, and the stems that make up the music (the instrumental, or drums/bass/other...)
  function parts(t) {
    var s = stemsOf(t), voc = s.filter(function (x) { return /^vocals?$/.test(part(x)); })[0] || null;
    var inst = s.filter(function (x) { return part(x) === 'instrumental' || part(x) === 'accompaniment'; });
    var music = inst.length ? inst.slice(0, 1) : s.filter(function (x) { return x !== voc && part(x) && !/^vocals?$/.test(part(x)); });
    return { voc: voc, music: music, split: !!(voc || music.length) };
  }
  function clean(t) { return String(t.title || 'Song').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 70); }

  // ---------- decoding and lining up ----------
  var MAX_BYTES = 900 * 1024 * 1024;     // a whole file is read into memory to get its sound
  function decode(url) {
    return fetch(url).then(function (r) { if (!r.ok && r.status !== 0) throw new Error('could not read the file (' + r.status + ')'); return r.arrayBuffer(); })
      .then(function (buf) { var OC = window.OfflineAudioContext || window.webkitOfflineAudioContext; return new OC(2, 1, SR).decodeAudioData(buf); });
  }
  function chans(b) { var l = b.getChannelData(0); return [l, b.numberOfChannels > 1 ? b.getChannelData(1) : l]; }
  function monoOf(ch, from, n, step) {
    var out = new Float32Array(Math.floor(n / step));
    for (var i = 0; i < out.length; i++) { var j = from + i * step; out[i] = j >= 0 && j < ch[0].length ? (ch[0][j] + ch[1][j]) * 0.5 : 0; }
    return out;
  }
  // How many samples the stem runs late against the song (positive = late), and how well they match.
  // Coarse search at 1/4 rate over +-150 ms, then exact around the best. Done on a loud stretch of the song.
  function lag(songCh, stemCh) {
    var n = songCh[0].length, win = SR * 3, from = Math.max(0, Math.min(n - win - 1, Math.floor(n * 0.3)));
    var D = 4, MAX = Math.round(SR * 0.15 / D);
    var a = monoOf(songCh, from, win, D), b = monoOf(stemCh, from - MAX * D, win + 2 * MAX * D, D);
    var best = -Infinity, bl = 0;
    for (var L = 0; L <= 2 * MAX; L++) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i + L]; if (s > best) { best = s; bl = L; } }
    var coarse = (bl - MAX) * D;                               // stem sample = song sample + coarse
    var a2 = monoOf(songCh, from, win, 1), b2 = monoOf(stemCh, from + coarse - 8, win + 16, 1), best2 = -Infinity, fine = 0;
    for (var L2 = 0; L2 <= 16; L2++) { var s2 = 0; for (var k = 0; k < a2.length; k += 2) s2 += a2[k] * b2[k + L2]; if (s2 > best2) { best2 = s2; fine = L2 - 8; } }
    var ea = 0, eb = 0, off = coarse + fine;
    for (var q = 0; q < a2.length; q += 2) { var y = b2[q + fine + 8]; ea += a2[q] * a2[q]; eb += y * y; }
    return { off: off, corr: best2 / Math.sqrt(ea * eb + 1e-12) };
  }
  // A stem moved onto the song's timeline (same length as the song).
  function shifted(stemCh, off, n) {
    return stemCh.map(function (c) { var o = new Float32Array(n); for (var i = 0; i < n; i++) { var j = i + off; o[i] = j >= 0 && j < c.length ? c[j] : 0; } return o; });
  }
  // -> Promise<{ song: [L,R], voc: [L,R]|null, music: [L,R]|null }> all on the song's timeline
  function load(t, needStems, say) {
    if (t.size > MAX_BYTES) return Promise.reject(new Error('This file is too big to work on here (' + Math.round(t.size / 1048576) + ' MB).'));
    say(t.kind === 'video' ? 'Reading the video\u2019s sound\u2026' : 'Reading the song\u2026');
    return decode(t.url).then(function (sb) {
      var song = chans(sb), n = song[0].length, p = parts(t);
      if (!needStems) return { song: song, voc: null, music: null };
      if (!p.split) throw new Error('This song is not split yet.');
      var get = function (list) {
        return list.reduce(function (pr, x) {
          return pr.then(function (acc) {
            say('Reading ' + part(x) + '…');
            return decode(x.url).then(function (b) {
              var ch = chans(b), l = lag(song, ch), s = shifted(ch, l.off, n);
              if (!acc) return s;
              for (var c = 0; c < 2; c++) for (var i = 0; i < n; i++) acc[c][i] += s[c][i];
              return acc;
            });
          });
        }, Promise.resolve(null));
      };
      return get(p.voc ? [p.voc] : []).then(function (voc) {
        return get(p.music).then(function (music) {
          // one side missing: it is the song minus the other (the splitter's parts add back up to the song)
          var minus = function (x) { return song.map(function (c, ci) { var o = new Float32Array(n); for (var i = 0; i < n; i++) o[i] = c[i] - x[ci][i]; return o; }); };
          if (!voc) voc = minus(music);
          if (!music) music = minus(voc);
          return { song: song, voc: voc, music: music };
        });
      });
    });
  }

  // ---------- the three modes ----------
  function earsMix(d, side, sep) {
    // sep 1 = fully apart; lower lets a little of each side into the other ear (easier over a whole album)
    var n = d.song[0].length, L = new Float32Array(n), R = new Float32Array(n), x = 1 - sep;
    var v = d.voc, m = d.music, vs = side === 'L';
    for (var i = 0; i < n; i++) {
      var vv = (v[0][i] + v[1][i]) * 0.5, mm = (m[0][i] + m[1][i]) * 0.5;
      var a = vv + mm * x, b = mm + vv * x;
      if (vs) { L[i] = a; R[i] = b; } else { L[i] = b; R[i] = a; }
    }
    return Promise.resolve([L, R]);
  }
  // The angle (radians, 0 = in front, turning to the right) at time t.
  function angleFn(o) {
    if (o.beat) {
      var turn = 60 / o.beat.bpm * 4 * o.bars;               // seconds per full turn
      return function (t) { return 2 * Math.PI * (t - o.beat.phase) / turn; };
    }
    return function (t) { return 2 * Math.PI * t / o.secs; };
  }
  // Renders moving sources through HRTF. srcs: [{ data: Float32Array, at: function(t) -> angle }]; still: [L,R] or null
  function orbitRender(n, srcs, still, tick) {
    var OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, ctx = new OC(2, n, SR), dur = n / SR, STEP = 0.04;
    srcs.forEach(function (s) {
      var b = ctx.createBuffer(1, n, SR); b.copyToChannel(s.data, 0);
      var src = ctx.createBufferSource(); src.buffer = b;
      var p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.refDistance = 1; p.maxDistance = 10; p.rolloffFactor = 0;
      if (p.positionY) p.positionY.value = 0;
      for (var t = 0; t <= dur + STEP; t += STEP) {
        var a = s.at(t), x = Math.sin(a), z = -Math.cos(a);   // listener faces -z
        if (p.positionX) { p.positionX.linearRampToValueAtTime(x, t); p.positionZ.linearRampToValueAtTime(z, t); }
        else if (t === 0) p.setPosition(x, 0, z);
      }
      src.connect(p); p.connect(ctx.destination); src.start(0);
    });
    if (still) {
      var sb = ctx.createBuffer(2, n, SR); sb.copyToChannel(still[0], 0); sb.copyToChannel(still[1], 1);
      var s2 = ctx.createBufferSource(); s2.buffer = sb; s2.connect(ctx.destination); s2.start(0);
    }
    var iv = setInterval(function () { try { if (tick) tick(Math.min(1, ctx.currentTime / dur)); } catch (e) {} }, 300);
    return ctx.startRendering().then(function (buf) { clearInterval(iv); return [buf.getChannelData(0), buf.getChannelData(1)]; }, function (e) { clearInterval(iv); throw e; });
  }
  function mono(ch) { var n = ch[0].length, o = new Float32Array(n); for (var i = 0; i < n; i++) o[i] = (ch[0][i] + ch[1][i]) * 0.5; return o; }
  function orbitMix(d, o, tick) {
    var at = angleFn(o), n = d.song[0].length, SPREAD = Math.PI / 3;
    if (o.what === 'song' || !d.voc) {                         // the whole song: its left and right turn together, 120 degrees apart
      return orbitRender(n, [{ data: d.song[0], at: function (t) { return at(t) - SPREAD; } }, { data: d.song[1], at: function (t) { return at(t) + SPREAD; } }], null, tick);
    }
    if (o.what === 'both') {                                   // vocals one way, the music the other
      return orbitRender(n, [{ data: mono(d.voc), at: at },
        { data: d.music[0], at: function (t) { return Math.PI - at(t) - SPREAD; } }, { data: d.music[1], at: function (t) { return Math.PI - at(t) + SPREAD; } }], null, tick);
    }
    return orbitRender(n, [{ data: mono(d.voc), at: at }], d.music, tick);   // vocals circle, the music stays put
  }
  function finish(LR) {
    var L = LR[0], R = LR[1], n = L.length, peak = 0, i;
    for (i = 0; i < n; i++) { var a = L[i] < 0 ? -L[i] : L[i], b = R[i] < 0 ? -R[i] : R[i]; if (a > peak) peak = a; if (b > peak) peak = b; }
    var g = peak > 0.98 ? 0.98 / peak : 1;
    if (g !== 1) { L = Float32Array.from(L, function (x) { return x * g; }); R = Float32Array.from(R, function (x) { return x * g; }); }
    return [L, R];
  }
  function wavBlob(L, R) {
    var n = L.length, buf = new ArrayBuffer(44 + n * 4), dv = new DataView(buf), w = function (o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    var o = new Int16Array(buf, 44, n * 2);
    for (var i = 0; i < n; i++) { o[i * 2] = Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))); o[i * 2 + 1] = Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))); }
    return new Blob([buf], { type: 'audio/wav' });
  }
  function beatFor(t) {
    var M = window.PPMashup;
    if (!M || !M._beatOf) return Promise.reject(new Error('the beat finder is not loaded'));
    var hint = 0; try { var tg = window.PPVocals && window.PPVocals.loadTags ? window.PPVocals.loadTags()[t.dbId] : null; hint = tg && tg.bpm || 0; } catch (e) {}
    return M._beatOf(t, hint);
  }
  // Builds the finished left/right for the chosen song and mode. part = null (whole song) or [fromSec, secs] (preview).
  function make(t, say, cut) {
    var needStems = st.mode === 'ears' || st.what !== 'song';
    var p = parts(t);
    if (needStems && !p.split) {
      if (st.mode === 'ears') return Promise.reject(new Error('Split ears needs the song split first.'));
      // an orbit of the vocals needs them too; fall back to the whole song
      needStems = false;
    }
    var beatP = st.mode === 'beat' ? beatFor(t) : Promise.resolve(null);
    // the last song read stays in memory, so Preview then Save does not read it all again
    var key = t.dbId + '|' + needStems + '|' + stemsOf(t).map(function (x) { return x.dbId; }).join(',');
    var loadP = memo.key === key ? memo.p : (memo = { key: key, p: load(t, needStems, say) }).p;
    loadP.catch(function () { if (memo.key === key) memo = {}; });
    return Promise.all([loadP, beatP]).then(function (r) {
      var d = r[0], beat = r[1];
      if (st.mode === 'beat' && !(beat && beat.bpm > 0)) throw new Error('No steady beat found in this song. Try the plain 360 orbit.');
      if (cut) {                                               // preview: a slice, keeping the beat grid where it was
        var a = Math.max(0, Math.min(d.song[0].length - 1, Math.round(cut[0] * SR))), b = Math.min(d.song[0].length, a + Math.round(cut[1] * SR));
        var sl = function (x) { return x ? x.map(function (c) { return c.subarray(a, b); }) : null; };
        d = { song: sl(d.song), voc: sl(d.voc), music: sl(d.music) };
        if (beat) beat = { bpm: beat.bpm, phase: beat.phase - a / SR };
      }
      if (st.mode === 'ears') { say('Mixing…'); return earsMix(d, st.side, st.sep).then(finish); }
      say('Placing the sound around your head…');
      return orbitMix(d, { what: needStems ? st.what : 'song', secs: st.secs, bars: st.bars, beat: beat }, function (f) { say('Placing the sound around your head ' + Math.round(f * 100) + '%'); })
        .then(function (lr) { return finish(lr); });
    });
  }
  function label(t) {
    if (st.mode === 'ears') return 'Split ears';
    var whole = st.what === 'song' || !parts(t).split;          // nothing to move on its own: the whole thing moved
    var w = whole ? '' : st.what === 'both' ? ' both ways' : ' vocals';
    return (st.mode === 'beat' ? '360 beat ' + st.bars + ' bars' : '360 ' + st.secs + 's') + w;
  }

  // ---------- panel ----------
  var busy = false, pv = null, pvCtx = null, memo = {};
  function css() {
    if ($('pps-css')) return;
    var s = document.createElement('style'); s.id = 'pps-css';
    s.textContent =
      '#pps{position:fixed;inset:0;z-index:9000;background:var(--bg,#0c0d10);color:var(--text,#eee);display:none;flex-direction:column;font-size:14px}' +
      '#pps.open{display:flex}' +
      '#pps header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line,#2a2b31)}' +
      '#pps header h2{margin:0;font-size:17px;flex:1}' +
      '#pps .pps-x{background:none;border:1px solid var(--line,#2a2b31);color:inherit;border-radius:8px;padding:7px 12px;font-size:14px}' +
      '#pps .pps-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}' +
      '#pps label.pps-l{display:block;font-size:12px;color:var(--text-dim,#9a9ca5);margin-bottom:6px}' +
      '#pps select{width:100%;padding:11px 10px;background:var(--bg-elev,#17181c);color:inherit;border:1px solid var(--line,#2a2b31);border-radius:8px;font-size:14px}' +
      '#pps .pps-info{font-size:13px;color:var(--text-dim,#9a9ca5);line-height:1.5}' +
      '#pps .pps-info b{color:var(--accent,#6ee7d0);font-weight:600}' +
      '#pps .pps-seg{display:flex;gap:6px;flex-wrap:wrap}' +
      '#pps .pps-seg button{flex:1;min-width:64px;padding:10px 6px;background:none;border:1px solid var(--line,#2a2b31);color:inherit;border-radius:8px;font-size:13px}' +
      '#pps .pps-seg button.on{border-color:var(--accent,#6ee7d0);color:var(--accent,#6ee7d0);background:rgba(110,231,208,0.08)}' +
      '#pps .pps-seg button:disabled{opacity:.4}' +
      '#pps .pps-go{display:flex;gap:8px}' +
      '#pps .pps-go button{flex:1;padding:12px 6px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid var(--accent,#6ee7d0);background:none;color:var(--accent,#6ee7d0)}' +
      '#pps .pps-go button.main{background:var(--accent,#6ee7d0);color:#0c0d10}' +
      '#pps .pps-go button:disabled{opacity:.45}' +
      '#pps .pps-status{min-height:20px;font-size:13px;color:var(--text,#eee)}';
    document.head.appendChild(s);
  }
  function seg(id, key, opts) {
    return '<div class="pps-seg" id="' + id + '" data-key="' + key + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function build() {
    if ($('pps')) return;
    css();
    var d = document.createElement('div'); d.id = 'pps';
    d.innerHTML =
      '<header><h2>Headphone space</h2><button class="pps-x" id="pps-close">Close</button></header>' +
      '<div class="pps-body">' +
        '<div><label class="pps-l" for="pps-song">Song</label><select id="pps-song"></select></div>' +
        '<div class="pps-info" id="pps-split"></div>' +
        '<div class="pps-go" id="pps-splitrow" style="display:none"><button type="button" id="pps-splitnow">Split this song now</button></div>' +
        '<div><label class="pps-l">Mode</label>' + seg('pps-mode', 'mode', [['ears', 'Split ears'], ['orbit', '360 orbit'], ['beat', 'Beat-locked 360']]) + '</div>' +
        '<div id="pps-o-ears" style="display:flex;flex-direction:column;gap:12px">' +
          '<div><label class="pps-l">Vocals in</label>' + seg('pps-side', 'side', [['L', 'Left ear'], ['R', 'Right ear']]) + '</div>' +
          '<div><label class="pps-l">How far apart</label>' + seg('pps-sep', 'sep', [['1', 'Fully'], ['0.75', 'Strong'], ['0.5', 'Gentle']]) + '</div>' +
        '</div>' +
        '<div id="pps-o-orbit" style="display:flex;flex-direction:column;gap:12px">' +
          '<div><label class="pps-l">What moves</label>' + seg('pps-what', 'what', [['vocals', 'Vocals'], ['both', 'Vocals + music, opposite ways'], ['song', 'Whole song']]) + '</div>' +
          '<div id="pps-o-secs"><label class="pps-l">One turn every</label>' + seg('pps-secs', 'secs', [['4', '4 s'], ['8', '8 s'], ['16', '16 s']]) + '</div>' +
          '<div id="pps-o-bars"><label class="pps-l">One turn every</label>' + seg('pps-bars', 'bars', [['4', '4 bars'], ['8', '8 bars'], ['16', '16 bars']]) + '<div class="pps-info" id="pps-tempo" style="margin-top:6px"></div></div>' +
        '</div>' +
        '<div class="pps-go"><button type="button" id="pps-prev">Preview 20 s</button><button type="button" class="main" id="pps-save">Save as a song</button></div>' +
        '<div class="pps-status" id="pps-status"></div>' +
        '<div class="pps-info">Made for headphones. The new version is saved next to the original, so it plays in the background and on the lock screen like any song.</div>' +
      '</div>';
    document.body.appendChild(d);
    $('pps-close').onclick = close;
    $('pps-song').onchange = function () { stopPv(); paint(); };
    ['pps-mode', 'pps-side', 'pps-sep', 'pps-what', 'pps-secs', 'pps-bars'].forEach(function (id) {
      $(id).addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        var key = $(id).dataset.key, v = b.dataset.v;
        st[key] = (key === 'sep' || key === 'secs' || key === 'bars') ? +v : v;
        saveSt(); stopPv(); paint();
      });
    });
    $('pps-prev').onclick = preview;
    $('pps-save').onclick = save;
    $('pps-splitnow').onclick = function () {
      var t = byId($('pps-song').value); if (!t) return;
      if (!window.__ppSplitTrack){ say('Open the Stems panel once, then try again.'); return; }
      window.__ppSplitTrack(t);
      say('Splitting with your Stems settings. This page updates by itself when the stems are ready.');
      waitSplit(t);
    };
  }
  var waitT = 0;
  function waitSplit(t) {
    clearInterval(waitT);
    var n = 0;
    waitT = setInterval(function () { if (parts(t).split || ++n > 900) { clearInterval(waitT); if (isOpen()) { paint(); if (parts(t).split) say('Split done. Every mode is ready.'); } } }, 2000);
  }
  function isOpen() { var d = $('pps'); return !!(d && d.classList.contains('open')); }
  function say(m) { var s = $('pps-status'); if (s) s.textContent = m; }
  function fill() {
    var sel = $('pps-song'), a = API(), ok = function (t) { return t && t.url && (t.kind === 'audio' || t.kind === 'video'); };
    var all = tracks().filter(ok);
    var cur = a && a.currentIndex() >= 0 ? tracks()[a.currentIndex()] : null;
    var keep = sel.value || (ok(cur) ? String(cur.dbId) : '');
    var opt = function (t) {
      var tag = t.stem ? '  \u2022 stem' : t.kind === 'video' ? '  \u2022 video' : '';
      if (parts(t).split) tag += '  \u2022 split';
      return '<option value="' + String(t.dbId).replace(/"/g, '') + '">' + String(t.title || 'Untitled').replace(/</g, '&lt;') + tag + '</option>';
    };
    var group = function (label, list) { return list.length ? '<optgroup label="' + label + '">' + list.map(opt).join('') + '</optgroup>' : ''; };
    sel.innerHTML = group('Songs', all.filter(function (t) { return !t.stem && t.kind === 'audio'; })) +
      group('Videos', all.filter(function (t) { return !t.stem && t.kind === 'video'; })) +
      group('Stems', all.filter(function (t) { return t.stem; }));
    var list = all;
    if (keep && byId(keep)) sel.value = keep;
    return list.length > 0;
  }
  function paint() {
    var t = byId($('pps-song').value), p = parts(t);
    var mark = function (id, v) { $(id).querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === String(v)); }); };
    mark('pps-mode', st.mode); mark('pps-side', st.side); mark('pps-sep', st.sep); mark('pps-what', st.what); mark('pps-secs', st.secs); mark('pps-bars', st.bars);
    $('pps-o-ears').style.display = st.mode === 'ears' ? 'flex' : 'none';
    $('pps-o-orbit').style.display = st.mode === 'ears' ? 'none' : 'flex';
    $('pps-o-secs').style.display = st.mode === 'orbit' ? '' : 'none';
    $('pps-o-bars').style.display = st.mode === 'beat' ? '' : 'none';
    // stems decide what is possible
    $('pps-what').querySelectorAll('button').forEach(function (b) { b.disabled = b.dataset.v !== 'song' && !p.split; });
    var need = st.mode === 'ears' && !p.split;
    $('pps-save').disabled = $('pps-prev').disabled = !t || need || busy;
    $('pps-splitrow').style.display = t && !p.split ? '' : 'none';
    var info = $('pps-split');
    if (!t) info.textContent = 'No songs yet.';
    else if (t.stem && !p.split) info.innerHTML = 'A stem on its own: <b>360 orbit</b> and <b>Beat-locked 360</b> move all of it. Split ears needs the full song (pick the song it came from).';
    else if (p.split) info.innerHTML = '<b>Split</b>: ' + (p.voc ? 'vocals' : 'vocals (worked out from the song)') + ' and ' + (p.music.length ? p.music.map(part).join(' + ') : 'the music (worked out from the song)') + '.';
    else info.innerHTML = (t.kind === 'video' ? 'A video: it is saved as a video with the new sound. ' : '') + 'Not split. <b>360 orbit</b> and <b>Beat-locked 360</b> work on the whole song right away. Split it for <b>Split ears</b> and to move the vocals on their own.';
    if (st.mode !== 'ears' && !p.split && st.what !== 'song' && !t.stem) info.innerHTML += ' For now the whole song moves.';
    if (st.mode === 'beat' && t) {
      $('pps-tempo').textContent = 'Finding the tempo…';
      beatFor(t).then(function (b) { if (byId($('pps-song').value) === t) $('pps-tempo').textContent = b && b.bpm ? 'Tempo ' + b.bpm + ' BPM: one turn every ' + Math.round(60 / b.bpm * 4 * st.bars * 10) / 10 + ' s.' : 'No steady beat found.'; })
        .catch(function () { $('pps-tempo').textContent = 'Could not read the tempo.'; });
    }
  }
  function stopPv() { if (pv) { try { pv.stop(); } catch (e) {} pv = null; } var b = $('pps-prev'); if (b) b.textContent = 'Preview 20 s'; }
  function pauseMain() { try { var p = $('play-btn'); if (p && p.classList.contains('is-playing')) p.click(); } catch (e) {} }
  function run(fn) {
    if (busy) return;
    busy = true; paint();
    fn().catch(function (e) { say((e && e.message) || 'Something went wrong.'); }).then(function () { busy = false; if (isOpen()) paint(); });
  }
  function preview() {
    if (pv) { stopPv(); return; }
    var t = byId($('pps-song').value); if (!t) return;
    run(function () {
      var from = Math.max(0, (t.duration || 60) * 0.3);
      return make(t, say, [from, 20]).then(function (lr) {
        pvCtx = pvCtx || new (window.AudioContext || window.webkitAudioContext)();
        var b = pvCtx.createBuffer(2, lr[0].length, SR); b.copyToChannel(lr[0], 0); b.copyToChannel(lr[1], 1);
        pauseMain();
        var s = pvCtx.createBufferSource(); s.buffer = b; s.connect(pvCtx.destination);
        s.onended = function () { if (pv === s) stopPv(); };
        if (pvCtx.state === 'suspended') pvCtx.resume();
        s.start(); pv = s; $('pps-prev').textContent = 'Stop preview';
        say('Playing a 20 s preview. Use headphones.');
      });
    });
  }
  function save() {
    var t = byId($('pps-song').value), a = API(); if (!t || !a || !a.addLibraryFiles) return;
    stopPv();
    run(function () {
      return make(t, say, null).then(function (lr) {
        say('Saving\u2026');
        var base = clean(t) + ' (' + label(t) + ')', wav = wavBlob(lr[0], lr[1]);
        var done = function (file, note) {
          a.addLibraryFiles([file]);
          say('Saved to your library: ' + base + (note || ''));
          toast('Saved: ' + base);
        };
        var V = window.PPVocals;
        if (t.kind !== 'video' || !V || !V.muxVideo) return done(new File([wav], base + '.wav', { type: 'audio/wav' }), t.kind === 'video' ? ' (as audio: the video tools are not loaded)' : '');
        // a video: copy its picture as it is and put the new sound under it
        return V.muxVideo(t.url, wav, function (f) { say('Putting the video back together ' + Math.round(f * 100) + '%'); })
          .then(function (vb) { done(new File([vb], base + '.' + (/webm/.test(vb.type) ? 'webm' : 'mp4'), { type: vb.type || 'video/mp4' })); },
                function () { done(new File([wav], base + '.wav', { type: 'audio/wav' }), ' (as audio: this video could not be rebuilt)'); });
      });
    });
  }
  function show() {
    build();
    $('pps').classList.add('open');
    fill(); paint(); say('');
  }
  function close() { stopPv(); memo = {}; var d = $('pps'); if (d) d.classList.remove('open'); }
  window.PPSpatial = { open: show, close: close, _lag: lag, _make: make, _state: function () { return st; } };

  function wire() {
    var b = $('spatial-btn'); if (b) b.addEventListener('click', show);
    ['audio', 'video-el'].forEach(function (id) { var el = $(id); if (el) el.addEventListener('play', stopPv); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
