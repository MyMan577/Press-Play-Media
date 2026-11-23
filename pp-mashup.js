/*
 * Press Play mashup mode: the vocals of one song over the backing of another, tempo-matched.
 *
 * Uses what the app already has: stems made by the splitter ("<title> (Vocals)" / "(Instrumental)", flagged t.stem
 * with t.stemOf = the source song) and the tempo / key found by AI tagging (PPVocals.loadTags()).
 * Playback is two plain <audio> elements of its own, apart from the main player: the backing is the clock and
 * the vocals are kept on it. Works while the app is on screen.
 */
(function () {
  'use strict';
  var API = function () { return window.__ppApi; };
  var $ = function (id) { return document.getElementById(id); };
  var back = null, voc = null, timer = 0, open = false;
  var st = { rate: 1, auto: 1, nudge: 0, vVol: 1, bVol: 0.9, bpmV: 0, bpmB: 0 };

  function tagsOf(t) {
    try {
      var all = window.PPVocals && window.PPVocals.loadTags ? window.PPVocals.loadTags() : {};
      return all[t.stemOf] || all[t.dbId] || {};
    } catch (e) { return {}; }
  }
  // The speed that brings the vocals to the backing's tempo. Double/half tempo counts as the same beat, so the
  // answer is always the smallest change (never more than about 40% either way).
  function autoRate(bpmV, bpmB) {
    if (!bpmV || !bpmB) return 1;
    var r = bpmB / bpmV;
    while (r > 1.42) r /= 2;
    while (r < 0.71) r *= 2;
    return Math.round(r * 1000) / 1000;
  }
  // Camelot wheel: same code, one step round the wheel, or the same number in the other letter all blend.
  function keyFit(a, b) {
    var m = /^(\d+)([AB])$/.exec(a || ''), n = /^(\d+)([AB])$/.exec(b || '');
    if (!m || !n) return '';
    var d = Math.abs(+m[1] - +n[1]); d = Math.min(d, 12 - d);
    if (d === 0 && m[2] === n[2]) return 'same key';
    if ((d === 1 && m[2] === n[2]) || (d === 0 && m[2] !== n[2])) return 'keys blend';
    return 'keys may clash';
  }
  // ---------- beat finding ----------
  // Decodes a track at a low sample rate and measures where its beats fall: a precise tempo (tags only store whole
  // BPM, which drifts by half a beat within a minute) and the time of a beat ("phase"). Assumes a steady tempo.
  var A_SR = 11025, A_HOP = 128, A_HOPSEC = A_HOP / A_SR;
  function decodeAt(url, sr, ch) {
    return fetch(url).then(function (r) { if (!r.ok && r.status !== 0) throw new Error('fetch ' + r.status); return r.arrayBuffer(); })
      .then(function (buf) { var OC = window.OfflineAudioContext || window.webkitOfflineAudioContext; return new OC(ch, 1, sr).decodeAudioData(buf); });
  }
  function onsetEnvelope(buf) {
    var n = Math.min(buf.length, A_SR * 150), nc = buf.numberOfChannels, c0 = buf.getChannelData(0), c1 = nc > 1 ? buf.getChannelData(1) : null;
    var frames = Math.floor(n / A_HOP), env = new Float32Array(frames), prev = 0;
    for (var f = 0; f < frames; f++) {
      var e = 0, o = f * A_HOP;
      for (var i = 0; i < A_HOP; i++) { var x = c1 ? (c0[o + i] + c1[o + i]) * 0.5 : c0[o + i]; e += x * x; }
      e = Math.sqrt(e / A_HOP);
      env[f] = e > prev ? e - prev : 0; prev = e;                    // only rises in loudness count (hits)
    }
    var W = Math.round(0.5 / A_HOPSEC), out = new Float32Array(frames), sum = 0;   // take away the local average
    for (var k = 0; k < frames; k++) {
      sum += env[k]; if (k >= W) sum -= env[k - W];
      var v = env[k] - sum / Math.min(k + 1, W); out[k] = v > 0 ? v : 0;
    }
    var sm = new Float32Array(frames);                                // a beat may be a frame early or late
    for (var j = 0; j < frames; j++) sm[j] = Math.max(out[j], j ? out[j - 1] * 0.8 : 0, j + 1 < frames ? out[j + 1] * 0.8 : 0);
    return sm;
  }
  function combScore(env, bpm) {                                      // best beat grid for one tempo
    var P = 60 / bpm / A_HOPSEC, best = -1, bestPh = 0, n = env.length, beats = Math.floor((n - P) / P);
    if (beats < 8) return { score: 0, phase: 0 };
    for (var ph = 0; ph < P; ph += 1) {
      var sc = 0;
      for (var k = 0; k < beats; k++) sc += env[Math.round(ph + k * P)];
      if (sc > best) { best = sc; bestPh = ph; }
    }
    return { score: best / beats, phase: bestPh * A_HOPSEC };
  }
  function findBeat(env, hint) {
    var best = { score: -1, bpm: 0, phase: 0 }, b, r;
    var scan = function (lo, hi, step) { for (b = lo; b <= hi + 1e-9; b += step) { r = combScore(env, b); if (r.score > best.score) best = { score: r.score, bpm: b, phase: r.phase }; } };
    if (hint > 30) scan(hint - 1.2, hint + 1.2, 0.02);
    else { scan(80, 165, 0.25); var c = best.bpm; best.score = -1; scan(c - 0.4, c + 0.4, 0.01); }
    best.bpm = Math.round(best.bpm * 100) / 100;
    // How much the beat stands out: level on the beat grid against the level everywhere. About 1 = no beat found.
    var mean = 0; for (var i = 0; i < env.length; i++) mean += env[i]; mean /= Math.max(1, env.length);
    best.conf = mean > 0 ? best.score / mean : 0;
    return best;
  }
  var beatMem = {};
  function beatOf(t, hint) {                                          // -> Promise<{bpm, phase}>, cached per track
    var key = 'ppBeat2:' + t.dbId + ':' + (hint || 0);
    if (beatMem[key]) return beatMem[key];
    try { var sv = JSON.parse(localStorage.getItem(key) || 'null'); if (sv && sv.bpm > 0) return (beatMem[key] = Promise.resolve(sv)); } catch (e) {}
    var p = decodeAt(t.url, A_SR, 1).then(function (buf) {
      var r = findBeat(onsetEnvelope(buf), hint), o = { bpm: r.bpm, phase: Math.round(r.phase * 1000) / 1000, conf: Math.round(r.conf * 100) / 100 };
      try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) {}
      return o;
    });
    beatMem[key] = p; p.catch(function () { delete beatMem[key]; });
    return p;
  }
  // Vocals on their own carry little beat. A stem shares its timeline with the song it was cut from, so the beat
  // is read from that song's instrumental (or the song itself) when it is still in the library.
  function beatSource(t) {
    if (!t.stem || !t.stemOf) return t;
    var a = API(), all = a ? a.tracks() : [];
    var sib = all.filter(function (x) { return x.url && x.kind !== 'video' && x.stem && x.stemOf === t.stemOf && !isVocals(x); });
    return sib.filter(isInst)[0] || sib.filter(function (x) { return stemPart(x) === 'drums'; })[0] ||
           all.filter(function (x) { return x.url && String(x.dbId) === String(t.stemOf); })[0] || sib[0] || t;
  }

  // ---------- saving: stretch the vocals without changing their pitch (WSOLA), mix, write a WAV ----------
  // Pieces of the vocals are laid down at the new spacing; each piece is slid a little to where it best continues
  // the one before it, so the waveform stays joined up and the pitch does not move.
  function stretch(chs, rate, tick) {
    if (Math.abs(rate - 1) < 0.003) return Promise.resolve(chs);
    var n = chs[0].length, N = 2048, H = N / 2, D = 512, outLen = Math.floor(n / rate), frames = Math.max(1, Math.floor((outLen - N) / H));
    var win = new Float32Array(N), i; for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    var mono = new Float32Array(n); for (i = 0; i < n; i++) mono[i] = chs.length > 1 ? (chs[0][i] + chs[1][i]) * 0.5 : chs[0][i];
    var out = chs.map(function () { return new Float32Array(outLen + N); }), prev = 0, k = 0;
    return new Promise(function (resolve) {
      (function run() {
        var until = Math.min(frames, k + 400);
        for (; k < until; k++) {
          var nominal = Math.round(k * H * rate), pos = nominal;
          if (k > 0) {
            var want = prev + H, lo = Math.max(0, nominal - D), hi = Math.min(n - N - 1, nominal + D), bestC = -Infinity;
            if (want + N < n) {
              for (var c = lo; c <= hi; c += 2) {
                var acc = 0; for (var q = 0; q < 512; q += 2) acc += mono[c + q] * mono[want + q];
                if (acc > bestC) { bestC = acc; pos = c; }
              }
            }
          }
          pos = Math.max(0, Math.min(n - N - 1, pos)); prev = pos;
          var o = k * H;
          for (var ch = 0; ch < chs.length; ch++) { var src = chs[ch], dst = out[ch]; for (var j = 0; j < N; j++) dst[o + j] += src[pos + j] * win[j]; }
        }
        if (tick) tick(k / frames);
        if (k < frames) setTimeout(run, 0); else resolve(out);
      })();
    });
  }
  function wavBlob(L, R, sr) {
    var n = L.length, buf = new ArrayBuffer(44 + n * 4), dv = new DataView(buf), w = function (o, str) { for (var i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    var o16 = new Int16Array(buf, 44, n * 2);
    for (var i = 0; i < n; i++) { o16[i * 2] = Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))); o16[i * 2 + 1] = Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))); }
    return new Blob([buf], { type: 'audio/wav' });
  }
  var saving = false;
  function saveMashup() {
    if (saving) return;
    var v = byId($('ppm-voc').value), b = byId($('ppm-back').value), a = API();
    if (!v || !b || !a || !a.addLibraryFiles) return;
    saving = true;
    var btn = $('ppm-save'), say = function (m) { btn.textContent = m; }, SR = 44100;
    var rate = st.rate, nudge = st.nudge, vVol = st.vVol, bVol = st.bVol;
    back.pause(); voc.pause();
    say('Reading the songs\u2026');
    Promise.all([decodeAt(b.url, SR, 2), decodeAt(v.url, SR, 2)]).then(function (bufs) {
      var bb = bufs[0], vb = bufs[1];
      var vch = [vb.getChannelData(0), vb.numberOfChannels > 1 ? vb.getChannelData(1) : vb.getChannelData(0)];
      return stretch(vch, rate, function (f) { say('Fitting the vocals ' + Math.round(f * 100) + '%'); }).then(function (vs) {
        say('Mixing\u2026');
        var n = bb.length, bL = bb.getChannelData(0), bR = bb.numberOfChannels > 1 ? bb.getChannelData(1) : bL;
        var L = new Float32Array(n), R = new Float32Array(n), off = Math.round(nudge * SR), vn = Math.floor(vb.length / rate), peak = 0, i, j;
        for (i = 0; i < n; i++) {
          j = i - off;
          var l = bL[i] * bVol, r = bR[i] * bVol;
          if (j >= 0 && j < vn) { l += vs[0][j] * vVol; r += vs[1][j] * vVol; }
          L[i] = l; R[i] = r;
          var m = l < 0 ? -l : l, m2 = r < 0 ? -r : r; if (m > peak) peak = m; if (m2 > peak) peak = m2;
        }
        if (peak > 0.98) { var g = 0.98 / peak; for (i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } }   // never clip
        var name = clean(v) + ' x ' + clean(b) + ' (Mashup).wav';
        a.addLibraryFiles([new File([wavBlob(L, R, SR)], name, { type: 'audio/wav' })]);
        toast('Saved to your library: ' + name.replace(/\.wav$/, ''));
      });
    }).catch(function (e) { toast('Could not save the mashup' + (e && e.message ? ': ' + e.message : '') + '.'); })
      .then(function () { saving = false; say('Save as a song'); });
  }
  function clean(t) { return String(t.stemSrc || t.title || 'Song').replace(/\s*\((vocals|instrumental)\)\s*$/i, '').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 60); }

  // The app is frozen in the background unless a foreground service holds it (same one background video sound uses).
  var keepOn = false;
  function keep(on) {
    if (on === keepOn) return; keepOn = on;
    try { var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OnnxSeparator; if (P && P.keepAlive) P.keepAlive({ on: on, mode: 'play' }).catch(function () {}); } catch (e) {}
  }

  function isVocals(t) { return !!t.stem && /\(vocals\)\s*$/i.test(t.title || ''); }
  function isInst(t) { return !!t.stem && /\(instrumental\)\s*$/i.test(t.title || ''); }
  // "Song (Drums)" -> "drums". Any split part that is not the vocals can be the music: the full instrumental, or
  // a single part such as drums, bass, guitar, piano or "other".
  function stemPart(t) { var m = /\(([^()]+)\)\s*$/.exec(t.title || ''); return m ? m[1].trim().toLowerCase() : ''; }
  function stemLabel(t) {
    var m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(t.title || '');
    var song = t.stemSrc || (m ? m[1] : t.title) || 'Untitled', part = m ? m[2].trim() : '';
    return part && !/^instrumental$/i.test(part) ? song + ' \u2013 ' + part + ' only' : song;
  }
  function fmt(s) { if (!isFinite(s) || s < 0) s = 0; var m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }

  function css() {
    if ($('ppm-css')) return;
    var s = document.createElement('style'); s.id = 'ppm-css';
    s.textContent =
      '#ppm{position:fixed;inset:0;z-index:9000;background:var(--bg,#0c0d10);color:var(--text,#eee);display:none;flex-direction:column;font-size:14px}' +
      '#ppm.open{display:flex}' +
      '#ppm header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line,#2a2b31)}' +
      '#ppm header h2{margin:0;font-size:17px;flex:1}' +
      '#ppm .ppm-x{background:none;border:1px solid var(--line,#2a2b31);color:inherit;border-radius:8px;padding:7px 12px;font-size:14px}' +
      '#ppm .ppm-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}' +
      '#ppm label{display:block;font-size:12px;color:var(--text-dim,#9a9ca5);margin-bottom:6px}' +
      '#ppm select{width:100%;padding:11px 10px;background:var(--bg-elev,#17181c);color:inherit;border:1px solid var(--line,#2a2b31);border-radius:8px;font-size:14px}' +
      '#ppm input[type=range]{width:100%}' +
      '#ppm .ppm-info{font-size:13px;color:var(--text-dim,#9a9ca5);line-height:1.5;min-height:20px}' +
      '#ppm .ppm-info b{color:var(--accent,#6ee7d0);font-weight:600}' +
      '#ppm .ppm-row{display:flex;align-items:center;gap:10px}' +
      '#ppm .ppm-row > span:first-child{flex:0 0 96px;font-size:12px;color:var(--text-dim,#9a9ca5)}' +
      '#ppm .ppm-row > span:last-child{flex:0 0 58px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums}' +
      '#ppm .ppm-row input{flex:1}' +
      '#ppm .ppm-btns{display:flex;gap:8px;flex-wrap:wrap}' +
      '#ppm .ppm-btns button{flex:1;min-width:64px;padding:10px 6px;background:none;border:1px solid var(--line,#2a2b31);color:inherit;border-radius:8px;font-size:13px}' +
      '#ppm #ppm-play{flex:0 0 auto;align-self:center;width:72px;height:72px;border-radius:50%;border:2px solid var(--accent,#6ee7d0);background:none;color:var(--accent,#6ee7d0);font-size:15px;font-weight:600}' +
      '#ppm .ppm-time{display:flex;justify-content:space-between;font-size:12px;color:var(--text-dim,#9a9ca5);font-variant-numeric:tabular-nums}' +
      '#ppm .ppm-empty{padding:18px;border:1px dashed var(--line,#2a2b31);border-radius:10px;line-height:1.5;color:var(--text-dim,#9a9ca5)}';
    document.head.appendChild(s);
  }

  function build() {
    if ($('ppm')) return;
    css();
    var d = document.createElement('div'); d.id = 'ppm';
    d.innerHTML =
      '<header><h2>Mashup</h2><button class="ppm-x" id="ppm-close">Close</button></header>' +
      '<div class="ppm-body">' +
        '<div class="ppm-empty" id="ppm-empty" style="display:none"></div>' +
        '<div id="ppm-main" style="display:flex;flex-direction:column;gap:14px">' +
          '<div><label for="ppm-voc">Vocals from</label><select id="ppm-voc"></select></div>' +
          '<div><label for="ppm-back">Over the music of</label><select id="ppm-back"></select></div>' +
          '<div class="ppm-info" id="ppm-info"></div>' +
          '<button id="ppm-play">Play</button>' +
          '<div><input type="range" id="ppm-seek" min="0" max="100" step="0.1" value="0"><div class="ppm-time"><span id="ppm-cur">0:00</span><span id="ppm-dur">0:00</span></div></div>' +
          '<div class="ppm-row"><span>Vocals speed</span><input type="range" id="ppm-rate" min="0.6" max="1.6" step="0.005" value="1"><span id="ppm-rate-v">1.00x</span></div>' +
          '<div class="ppm-btns"><button id="ppm-rate-auto">Match tempo</button><button id="ppm-rate-1">Original speed</button></div>' +
          '<div class="ppm-row"><span>Vocals start</span><input type="range" id="ppm-nudge" min="-8" max="30" step="0.01" value="0"><span id="ppm-nudge-v">0.00s</span></div>' +
          '<div class="ppm-btns"><button id="ppm-align">Line up the beat</button></div>' +
          '<div class="ppm-btns"><button data-n="-1">&minus; 1 beat</button><button data-n="-0.25">&minus; &frac14;</button><button data-n="0.25">+ &frac14;</button><button data-n="1">+ 1 beat</button></div>' +
          '<div class="ppm-row"><span>Vocals volume</span><input type="range" id="ppm-vvol" min="0" max="1" step="0.01" value="1"><span id="ppm-vvol-v">100%</span></div>' +
          '<div class="ppm-row"><span>Music volume</span><input type="range" id="ppm-bvol" min="0" max="1" step="0.01" value="0.9"><span id="ppm-bvol-v">90%</span></div>' +
          '<div class="ppm-btns"><button id="ppm-save">Save as a song</button></div>' +
          '<div class="ppm-info" id="ppm-help">The tempo and the beat are found from the songs themselves. If the vocals come in on the wrong beat, step them by a beat; fine-tune with Vocals start.</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(d);
    back = new Audio(); voc = new Audio();
    back.preload = voc.preload = 'auto';
    try { voc.preservesPitch = true; } catch (e) {}

    $('ppm-close').onclick = close;
    $('ppm-voc').onchange = function () { load(true); };
    $('ppm-back').onchange = function () { load(true); };
    $('ppm-play').onclick = toggle;
    $('ppm-seek').oninput = function () { if (isFinite(back.duration)) { back.currentTime = +this.value; syncVocals(true); paint(); } };
    $('ppm-rate').oninput = function () { st.rate = +this.value; applyRate(); syncVocals(true); };
    $('ppm-rate-auto').onclick = function () { st.rate = st.auto; applyRate(); syncVocals(true); };
    $('ppm-rate-1').onclick = function () { st.rate = 1; applyRate(); syncVocals(true); };
    $('ppm-align').onclick = function () { analyse(true); };
    $('ppm-save').onclick = saveMashup;
    $('ppm-nudge').oninput = function () { st.nudge = +this.value; paintNudge(); syncVocals(true); remember(); };
    d.querySelectorAll('[data-n]').forEach(function (b) {
      b.onclick = function () {
        var beat = st.bpmB ? 60 / st.bpmB : 0.5;
        st.nudge = Math.max(-8, Math.min(30, Math.round((st.nudge + (+b.dataset.n) * beat) * 1000) / 1000));
        $('ppm-nudge').value = st.nudge; paintNudge(); syncVocals(true); remember();
      };
    });
    $('ppm-vvol').oninput = function () { st.vVol = +this.value; voc.volume = st.vVol; $('ppm-vvol-v').textContent = Math.round(st.vVol * 100) + '%'; };
    $('ppm-bvol').oninput = function () { st.bVol = +this.value; back.volume = st.bVol; $('ppm-bvol-v').textContent = Math.round(st.bVol * 100) + '%'; };
    back.addEventListener('loadedmetadata', paint);
    back.addEventListener('ended', function () { voc.pause(); keep(false); paint(); });
    back.addEventListener('pause', function () { keep(false); paint(); });
    back.addEventListener('play', function () { keep(true); paint(); });
    // Say what went wrong on the screen itself, not only in a passing toast.
    var mediaErr = function (which, el) {
      return function () {
        var c = el.error ? el.error.code : 0, why = c === 4 ? 'this phone cannot play its file format here' : c === 2 ? 'the file could not be read' : c === 3 ? 'the file is damaged' : 'it could not be opened';
        var m = 'Could not play the ' + which + ': ' + why + '.';
        toast(m); var i = $('ppm-info'); if (i) i.innerHTML = '<b>' + m + '</b> Try a different track for the ' + which + '.';
      };
    };
    back.addEventListener('error', mediaErr('music', back));
    voc.addEventListener('error', mediaErr('vocals', voc));
  }
  function toast(m) { try { var s = $('toast-stack'); if (!s) return; var e = document.createElement('div'); e.className = 'toast'; e.textContent = m; s.appendChild(e); setTimeout(function () { e.remove(); }, 3500); } catch (x) {} }

  function byId(id) { var a = API(); return a ? a.tracks().filter(function (t) { return String(t.dbId) === String(id); })[0] : null; }
  function fill() {
    var a = API(), all = a ? a.tracks().filter(function (t) { return t.kind !== 'video' && t.url; }) : [];
    var vs = all.filter(isVocals), songs = all.filter(function (t) { return !t.stem; });
    // every split part except vocals; full instrumentals first, then the single parts, kept together per song
    var insts = all.filter(function (t) { return t.stem && !isVocals(t); }).sort(function (x, y) {
      var d = (isInst(y) ? 1 : 0) - (isInst(x) ? 1 : 0); if (d) return d;
      return String(x.stemSrc || x.title).localeCompare(String(y.stemSrc || y.title)) || stemPart(x).localeCompare(stemPart(y));
    });
    var opt = function (t, label) { var o = document.createElement('option'); o.value = t.dbId; o.textContent = label || t.title || 'Untitled'; return o; };
    var sv = $('ppm-voc'), sb = $('ppm-back'), pv = sv.value, pb = sb.value;
    sv.innerHTML = ''; sb.innerHTML = '';
    vs.forEach(function (t) { sv.appendChild(opt(t, (t.stemSrc || t.title).replace(/\s*\(vocals\)\s*$/i, ''))); });
    if (insts.length) { var g1 = document.createElement('optgroup'); g1.label = 'From split songs (no vocals)'; insts.forEach(function (t) { g1.appendChild(opt(t, stemLabel(t))); }); sb.appendChild(g1); }
    if (songs.length) { var g2 = document.createElement('optgroup'); g2.label = 'Whole songs (their own vocals stay in)'; songs.forEach(function (t) { g2.appendChild(opt(t)); }); sb.appendChild(g2); }
    var ok = vs.length > 0 && (insts.length + songs.length) > 0;
    $('ppm-main').style.display = ok ? 'flex' : 'none';
    var em = $('ppm-empty'); em.style.display = ok ? 'none' : 'block';
    if (!ok) em.textContent = vs.length ? 'Add another song to use as the music.' : 'A mashup needs the vocals of a song on their own. Split a song first (Library, then Split vocals) and come back: its vocals will be listed here.';
    if (pv && byId(pv)) sv.value = pv;
    if (pb && byId(pb)) sb.value = pb;
    else if (ok) {                                 // default: music from a different song than the vocals
      var v0 = byId(sv.value), other = insts.concat(songs).filter(function (t) { return (t.stemOf || t.dbId) !== (v0.stemOf || v0.dbId); })[0];
      if (other) sb.value = other.dbId;
    }
    return ok;
  }
  function pairKey() { return 'ppMashup:' + $('ppm-voc').value + '>' + $('ppm-back').value; }
  function remember() { try { localStorage.setItem(pairKey(), JSON.stringify({ n: st.nudge, r: st.rate })); } catch (e) {} }

  function load(stop) {
    var v = byId($('ppm-voc').value), b = byId($('ppm-back').value);
    if (!v || !b) return;
    if (stop) { back.pause(); voc.pause(); }
    var tv = tagsOf(v), tb = tagsOf(b);
    st.bpmV = +tv.bpm || 0; st.bpmB = +tb.bpm || 0;
    st.auto = autoRate(st.bpmV, st.bpmB);
    st.rate = st.auto; st.nudge = 0;
    try { var sv = JSON.parse(localStorage.getItem(pairKey()) || 'null'); if (sv) { if (isFinite(sv.n)) st.nudge = sv.n; if (sv.r > 0.5 && sv.r < 2) st.rate = sv.r; } } catch (e) {}
    if (back.getAttribute('src') !== b.url) back.src = b.url;
    if (voc.getAttribute('src') !== v.url) voc.src = v.url;
    back.volume = st.bVol; voc.volume = st.vVol;
    $('ppm-nudge').value = st.nudge; paintNudge();
    applyRate(true);            // loading a pair is not a choice to remember
    var bits = [];
    if (st.bpmV && st.bpmB) {
      var pct = Math.round((st.auto - 1) * 100);
      bits.push('Vocals <b>' + st.bpmV + ' BPM</b>, music <b>' + st.bpmB + ' BPM</b>: vocals ' + (pct === 0 ? 'already match' : (pct > 0 ? 'sped up ' : 'slowed ') + Math.abs(pct) + '%') + '.');
    } else {
      bits.push('Tempo is not known for ' + (!st.bpmV && !st.bpmB ? 'either song' : !st.bpmV ? 'the vocals\' song' : 'the music') + '. Tag it (Library, AI tagging) to match automatically, or set Vocals speed by ear.');
    }
    var kf = keyFit(tv.ck, tb.ck);
    if (kf) bits.push((tv.key || tv.ck) + ' over ' + (tb.key || tb.ck) + ': <b>' + kf + '</b>.');
    tagInfo = bits.join(' ');
    $('ppm-info').innerHTML = tagInfo;
    $('ppm-rate-auto').disabled = !(st.bpmV && st.bpmB);
    paint();
    analyse(false);
  }
  // Measure both songs, set the exact tempo match, and (when asked, or when this pair has no saved start) move the
  // vocals to the nearest point where their beats fall on the music's beats.
  var analyseId = 0, tagInfo = '';
  function analyse(force) {
    var v = byId($('ppm-voc').value), b = byId($('ppm-back').value);
    if (!v || !b) return;
    var id = ++analyseId, hadSaved = false, info = $('ppm-info');
    try { hadSaved = !!localStorage.getItem(pairKey()); } catch (e) {}
    var tv = tagsOf(v), tb = tagsOf(b), src = beatSource(v);
    info.innerHTML = tagInfo + ' <b>Finding the beat\u2026</b>';
    Promise.all([beatOf(src, +tv.bpm || 0), beatOf(b, +tb.bpm || 0)]).then(function (r) {
      if (id !== analyseId) return;
      var bv = r[0], bb = r[1];
      st.bpmV = bv.bpm; st.bpmB = bb.bpm; st.auto = autoRate(bv.bpm, bb.bpm);
      $('ppm-rate-auto').disabled = false;
      var move = force || !hadSaved;
      if (move) {
        st.rate = st.auto;
        var PB = 60 / bb.bpm, want = bb.phase - bv.phase / st.rate, k = Math.round((st.nudge - want) / PB);
        st.nudge = Math.max(-8, Math.min(30, Math.round((want + k * PB) * 1000) / 1000));
        $('ppm-nudge').value = st.nudge; paintNudge(); applyRate(); syncVocals(true);
      }
      var pct = Math.round((st.auto - 1) * 100), kf = keyFit(tv.ck, tb.ck);
      info.innerHTML = 'Vocals <b>' + bv.bpm.toFixed(1) + ' BPM</b>, music <b>' + bb.bpm.toFixed(1) + ' BPM</b>: vocals ' + (pct === 0 ? 'barely changed' : (pct > 0 ? 'sped up ' : 'slowed ') + Math.abs(pct) + '%') + '.' +
        (kf ? ' ' + (tv.key || tv.ck) + ' over ' + (tb.key || tb.ck) + ': <b>' + kf + '</b>.' : '') + (move ? ' Beats lined up.' : ' Using your saved start.') +
        (bb.conf < 2 ? ' <b>No steady beat was found in this music</b>, so the line-up is a guess: music with clear drums works best.' : '') +
        (bv.conf < 2 && bb.conf >= 2 ? ' <b>No steady beat was found for the vocals\' song</b>, so the line-up is a guess.' : '') +
        (Math.abs(st.auto - 1) > 0.16 ? ' <b>These two tempos are far apart</b>, so the vocals are changed a lot and may sound unnatural: music near ' + Math.round(bv.bpm) + ' BPM (or half / double) fits these vocals best.' : '') +
        (src === v && v.stem ? ' The beat was read from the vocals alone, so it may be off: keep the song\'s instrumental in the library for a better fit.' : '');
    }).catch(function () {
      if (id !== analyseId) return;
      info.innerHTML = tagInfo + ' Could not read the songs to find the beat; line the vocals up by hand.';
    });
  }
  function applyRate(noSave) {
    voc.playbackRate = st.rate;
    $('ppm-rate').value = st.rate; $('ppm-rate-v').textContent = st.rate.toFixed(2) + 'x';
    if (!noSave) remember();
  }
  function paintNudge() { $('ppm-nudge-v').textContent = (st.nudge >= 0 ? '+' : '') + st.nudge.toFixed(2) + 's'; }

  // Where the vocals should be for the backing's current position. Negative = the vocals have not come in yet.
  function vocTarget() { return (back.currentTime - st.nudge) * st.rate; }
  function syncVocals(hard) {
    if (!voc.src) return;
    var want = vocTarget(), dur = voc.duration;
    if (want < 0 || (isFinite(dur) && want >= dur)) { if (!voc.paused) voc.pause(); return; }
    var err = voc.currentTime - want;
    if (hard || Math.abs(err) > 0.12) { try { voc.currentTime = want; } catch (e) {} voc.playbackRate = st.rate; }
    else if (Math.abs(err) > 0.02) voc.playbackRate = st.rate * (err > 0 ? 0.97 : 1.03);   // ease back on to the beat without a jump
    else voc.playbackRate = st.rate;
    if (!back.paused && voc.paused) voc.play().catch(function () {});
    if (back.paused && !voc.paused) voc.pause();
  }
  function paint() {
    if (!open) return;
    var d = back.duration;
    $('ppm-play').textContent = back.paused ? 'Play' : 'Pause';
    if (isFinite(d) && d > 0) { $('ppm-seek').max = d; $('ppm-dur').textContent = fmt(d); }
    $('ppm-seek').value = back.currentTime || 0;
    $('ppm-cur').textContent = fmt(back.currentTime);
  }
  function stopMainPlayer() {
    try { var p = $('play-btn'); if (p && p.classList.contains('is-playing')) p.click(); } catch (e) {}
  }
  function toggle() {
    if (!back.src) load(false);
    if (back.paused) {
      stopMainPlayer();
      back.play().then(function () { syncVocals(true); }).catch(function () { toast('Could not start the mashup.'); });
    } else { back.pause(); voc.pause(); }
    paint();
  }
  function show() {
    build();
    open = true;
    $('ppm').classList.add('open');
    if (fill()) load(false);
    clearInterval(timer);
    timer = setInterval(function () { if (!back.paused) syncVocals(false); paint(); }, 200);
  }
  function close() {
    open = false;
    clearInterval(timer); timer = 0;
    analyseId++;
    if (back) { back.pause(); voc.pause(); }
    keep(false);
    var d = $('ppm'); if (d) d.classList.remove('open');
  }
  window.PPMashup = { open: show, close: close, _els: function () { return [back, voc]; }, _stretch: stretch, _findBeat: findBeat, _beatOf: beatOf, _state: function () { return st; }, _autoRate: autoRate, _keyFit: keyFit };

  function wire() {
    var b = $('mashup-btn'); if (b) b.addEventListener('click', show);
    // starting the main player again ends the mashup's sound, so the two never play over each other
    ['audio', 'video-el'].forEach(function (id) { var el = $(id); if (el) el.addEventListener('play', function () { if (back && !back.paused) { back.pause(); voc.pause(); } }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
