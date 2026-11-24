/*
 * Press Play native bridge.
 *
 * On Android (Capacitor) this swaps the WebView <audio>/<video> engine for the native ExoPlayer
 * service while the rest of the app keeps talking to the same `audioEl` / `videoEl` objects.
 * In a normal browser nothing here activates and the app behaves exactly as before.
 *
 * Exposed as window.PPNative. Loaded before the main app script.
 */
(function () {
  'use strict';
  var Cap = window.Capacitor;
  var isAndroid = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform() && Cap.getPlatform && Cap.getPlatform() === 'android');
  var Plug = (isAndroid && Cap.Plugins) || {};
  var Player = Plug.PPPlayer, Lib = Plug.PPLibrary, Jobs = Plug.PPJobs;
  var pref = null;
  try { pref = localStorage.getItem('ppNativeEngine'); } catch (e) {}
  var enabled = !!(isAndroid && Player && Lib) && pref !== 'off';

  var N = { available: !!(isAndroid && Player && Lib), enabled: enabled, hooks: {} };
  window.PPNative = N;
  // The VLC engine (formats nothing else plays, network shares). Present even with the native engine switched off.
  N.vlc = (isAndroid && Plug.PPVlc) || null;
  if (!N.available) {            // plain browser: expose inert helpers so patched call sites stay one-liners
    N.wrapMedia = function (el) { return el; };
    N.setSrc = function (el, t) { el.src = t.url; return Promise.resolve(); };
    N.raw = function (el) { return el; };
    N.active = N.videoActive = function () { return false; };
    N.videoFps = N.vizRate = function () { return 0; };
    N.sampleLuma = function () { return Promise.reject(new Error('not native')); };
    N.setMemc = function () {};
    N.memcStatus = null;
    N.mirror = N.decorateAnalyser = N.setVizTrim = N.queueNext = N.nowPlaying = N.updateMeta = N.setFxProvider = N.companionFx = N.setVideoFilterCss = N.screenOn = N.scheduleRect = N.resync = N.enterPip = function () {};
    N.boot = function () { return Promise.resolve(); };
    N.pushCatalog = N.migrateAll = function () {};
    N.snapshot = function () { return Promise.reject(new Error('not native')); };
    N.sameUri = function () { return false; };
    N.expectAdvance = function () {};
    N.crossfade = function () { return Promise.resolve(false); };
    N.cancelCrossfade = function () {};
    N.sleep = function () { return false; };
    N.jobs = { run: function (title, fn) { return fn(function () {}); } };
    N.lib = null;
    return;
  }

  // ---------- helpers ----------
  var wrappers = {};            // 'audio' | 'video' -> proxy
  var cur = null;               // state object of the wrapper that currently owns the native player
  function norm(u) { try { return decodeURIComponent(String(u)); } catch (e) { return String(u); } }
  function sameUri(a, b) { return !!a && !!b && (String(a) === String(b) || norm(a) === norm(b)); }
  function now() { return performance.now(); }
  function emit(S, type) {
    try {
      var ev = new Event(type);
      Object.defineProperty(ev, 'target', { value: S.proxy });   // app code compares e.target with media()
      S.raw.dispatchEvent(ev);
    } catch (e) {}
  }
  function fakeRanges(S) {
    return { length: 1, start: function () { return 0; }, end: function () { return S.durMs >= 0 ? S.durMs / 1000 : 0; } };
  }
  function curTime(S) {
    var t = S.base;
    if (S.pwr && S.playing && !S.seeking) t += (now() - S.baseAt) * S.rate;
    if (S.durMs >= 0 && t > S.durMs) t = S.durMs;
    return Math.max(0, t) / 1000;
  }
  // A seek only counts as done once the native player is near the target. Early reports (often 0 right after a seek) are ignored.
  function seekLanded(S, posMs) { return Math.abs((posMs || 0) - (S.seekTarget || 0)) < 2000; }
  function confirmSeek(S) {
    var tries = 0;
    (function step() {
      if (!S.seeking) return;
      Player.getState().then(function (s) {
        if (!S.seeking) return;
        if (seekLanded(S, s.posMs)) {
          S.seeking = false; clearTimeout(S.seekTimer);
          S.base = s.posMs; S.baseAt = now();
          emit(S, 'seeked'); emit(S, 'timeupdate');
          if (s.state === 'ended') applySnap(S, s);          // the seek went to the very end
        } else if (++tries < 20) setTimeout(step, 200);
      }).catch(function () {});
    })();
  }
  function call(fn) { try { var p = fn(); if (p && p.catch) p.catch(function () {}); return p; } catch (e) { return Promise.resolve(); } }

  // ---------- media-element facade ----------
  function makeWrapper(raw, kind) {
    var S = {
      kind: kind, raw: raw, proxy: null, active: false, track: null, uri: null,
      pwr: false, playing: false, state: 'idle', ready: false, ended: false, seeking: false,
      base: 0, baseAt: 0, durMs: NaN, rate: 1, vol: 1, muted: false, loop: false, vw: 0, vh: 0,
      preservePitch: true, pitch: 1, loadId: 0, loading: Promise.resolve(), err: null, localAt: 0,
      advancedUri: null, adopting: false, seekTimer: 0
    };
    S.after = function (fn) { var id = S.loadId; S.loading = S.loading.then(function () { if (id === S.loadId && S.active) return fn(); }); return S.loading; };
    S.play = function () {
      S.pwr = true; S.ended = false; S.localAt = now(); emit(S, 'play');
      return S.after(function () { return Player.play(); }).then(function () {});
    };
    S.pause = function () {
      if (S.adopting) return Promise.resolve();     // JS is just re-syncing after a native auto-advance
      S.localAt = now();
      if (S.pwr) { S.pwr = false; emit(S, 'pause'); }
      return S.after(function () { return Player.pause(); }).then(function () {});
    };
    S.seek = function (sec) {
      if (!isFinite(sec)) return;
      S.seeking = true; S.seekTarget = Math.max(0, sec * 1000); S.base = S.seekTarget; S.baseAt = now(); S.ended = false;
      emit(S, 'seeking');
      clearTimeout(S.seekTimer);
      S.seekTimer = setTimeout(function () { if (S.seeking) { S.seeking = false; emit(S, 'seeked'); emit(S, 'timeupdate'); } }, 8000);
      S.after(function () { return Player.seek({ ms: Math.round(sec * 1000) }); }).then(function () { confirmSeek(S); });
    };
    S.applyRate = function () { S.after(function () { return Player.setRate({ rate: S.rate, preservePitch: S.preservePitch, pitch: S.pitch }); }); };
    S.applyVol = function () { S.after(function () { return Player.setVolume({ volume: S.muted ? 0 : S.vol }); }); };

    var proxy = new Proxy(raw, {
      get: function (target, prop) {
        if (prop === '__pp') return S;
        if (prop === '__raw') return target;
        if (S.active) {
          switch (prop) {
            case 'currentTime': return curTime(S);
            case 'duration': return S.durMs >= 0 ? S.durMs / 1000 : ((S.track && S.track.duration > 0) ? S.track.duration : NaN);
            case 'paused': return !S.pwr;
            case 'ended': return S.ended;
            case 'seeking': return S.seeking;
            case 'readyState': return S.ready ? 4 : (S.state === 'buffering' ? 2 : 0);
            case 'networkState': return 1;
            case 'playbackRate': case 'defaultPlaybackRate': return S.rate;
            case 'ppPitch': return S.pitch;
            case 'volume': return S.vol;
            case 'muted': return S.muted;
            case 'loop': return S.loop;
            case 'error': return S.err ? { code: 4, message: S.err } : null;
            case 'src': case 'currentSrc': return (S.track && (S.track.url || S.uri)) || '';
            case 'videoWidth': return S.vw;
            case 'videoHeight': return S.vh;
            case 'buffered': case 'seekable': case 'played': return fakeRanges(S);
            case 'play': return function () { return S.play(); };
            case 'pause': return function () { S.pause(); };
            case 'load': return function () {};
            case 'canPlayType': return function () { return 'maybe'; };
            case 'removeAttribute': return function (n) { if (n !== 'src') target.removeAttribute(n); };
            case 'getVideoPlaybackQuality': return function () {
              return { droppedVideoFrames: 0, corruptedVideoFrames: 0, totalVideoFrames: Math.floor(curTime(S) * 30), creationTime: now() };
            };
          }
        }
        var v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set: function (target, prop, value) {
        switch (prop) {
          case 'playbackRate': S.rate = +value || 1; S.rateAt = now(); if (S.active) S.applyRate(); break;
          case 'volume': S.vol = Math.max(0, Math.min(1, +value)); if (S.active) S.applyVol(); break;
          case 'muted': S.muted = !!value; if (S.active) S.applyVol(); break;
          case 'loop': S.loop = !!value; if (S.active) S.after(function () { return Player.setLoop({ loop: S.loop }); }); break;
          case 'preservesPitch': case 'mozPreservesPitch': case 'webkitPreservesPitch':
            S.preservePitch = !!value; if (S.active) S.applyRate(); break;
          case 'ppPitch': S.pitch = Math.max(0.25, Math.min(4, +value || 1)); if (S.active) S.applyRate(); break;   // pitch shift on its own (1 = none), on top of the speed
          case 'currentTime': if (S.active) { S.seek(+value); return true; } break;
          case 'src': if (S.active) return true; break;     // native owns the source; ignore stray writes
        }
        Reflect.set(target, prop, value, target);
        return true;
      }
    });
    S.proxy = proxy;
    wrappers[kind] = proxy;
    return proxy;
  }

  var origGetById = document.getElementById.bind(document);
  // Video uses the normal web <video> (MEMC, CSS filters, no transparent WebView) unless the
  // "Native video player (beta)" setting is on (localStorage.ppNativeVideo = 'on'). The native layer is told the
  // same thing at every start, so the two sides can never disagree (that mismatch used to give a black picture).
  var nativeVideo = false; try { nativeVideo = localStorage.getItem('ppNativeVideo') === 'on'; } catch (e) {}
  if (enabled && Player && Player.setNativeVideo) call(function () { return Player.setNativeVideo({ on: nativeVideo }); });
  N.nativeVideoSetting = function () { return nativeVideo; };
  // Switching players needs a fresh page (every <video> wrapper is set up at load), so the setting reloads the app.
  N.setNativeVideo = function (on) {
    try { localStorage.setItem('ppNativeVideo', on ? 'on' : 'off'); } catch (e) {}
    var done = function () { location.reload(); };
    if (!enabled || !Player || !Player.setNativeVideo) return done();
    var p = call(function () { return Player.setNativeVideo({ on: !!on }); });
    (p && p.then ? p : Promise.resolve()).then(done, done);
  };
  N.wrapMedia = function (el, kind) {
    if (!enabled || !el) return el;
    if (kind === 'video' && !nativeVideo) return el;
    if (el.__pp) return el;
    return makeWrapper(el, kind);
  };
  // Every other script in the page looks the elements up by id; hand them the same facade so
  // gestures, subtitles, XP counters etc. all read the native player's clock.
  if (enabled) {
    document.getElementById = function (id) {
      if (id === 'video-el' && wrappers.video) return wrappers.video;
      if (id === 'audio' && wrappers.audio) return wrappers.audio;
      return origGetById(id);
    };
  }
  N.raw = function (el) { return (el && el.__raw) || el; };
  N.sameUri = sameUri;
  var expect = null;
  N.expectAdvance = function (uri) {
    expect = uri; setTimeout(function () { if (expect === uri) expect = null; }, 4000);
    if (cur && cur.active) { cur.advancedUri = uri; cur.adopting = true; }
  };
  N.active = function () { return !!(cur && cur.active); };
  N.videoActive = function () { return !!(cur && cur.active && cur.kind === 'video'); };
  /** The native video's frame rate (0 if unknown), for exact frame stepping. */
  N.videoFps = function () { return N.videoActive() && cur.fps > 0 ? cur.fps : 0; };
  /** Motion smoothing / picture delay settings for the native renderer. Only sent when they change. */
  var lastMemc = '';
  N.setMemc = function (cfg) {
    var j = JSON.stringify(cfg);
    if (j === lastMemc) return;
    lastMemc = j;
    call(function () { return Player.setMemc(cfg); });
  };
  N.memcStatus = null;                                                  // latest status from the native engine
  /** An AI upscaler for the native engine: the shader passes the page builds for it (sent once per model). */
  var srSent = {};
  N.setSrModel = function (id, spec) {
    if (!enabled || !Player || !Player.setSrModel || srSent[id]) return;
    srSent[id] = true;
    call(function () { return Player.setSrModel({ id: id, spec: spec }); });
  };
  /** {w, h, luma[]} of the current native frame, for auto-levels. Rejects when there is no frame. */
  N.sampleLuma = function () { return Player.sampleLuma(); };

  function deactivate(S) {
    if (!S || !S.active) return;
    S.active = false; S.playing = false; S.pwr = false; S.loadId++; S.adopting = false; S.advancedUri = null;
    if (cur === S) cur = null;
    syncFxTimer();
  }

  // ---------- legacy IndexedDB blobs -> files on disk ----------
  var moving = {};
  function b64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function ensureLocal(t) {
    if (t.nativeUri) return Promise.resolve(t.nativeUri);
    if (t.remoteUrl) return Promise.resolve(t.remoteUrl);
    if (moving[t.dbId]) return moving[t.dbId];
    var p = (async function () {
      var blob = N.hooks.getBlob ? await N.hooks.getBlob(t) : null;
      if (!blob) {
        var r = await fetch(t.url); blob = await r.blob();       // blob: URL still alive this session
      }
      // Small pieces with a pause between them. Each piece crosses to Android as text, and the page cannot answer a
      // tap while one is being handed over: 3 MB pieces (4 MB of text each) back to back held it for seconds when a
      // track restored from a backup (kept in the app's database) was played the first time, a video above all.
      var CH = 512 * 1024, name = t.dbId + '.' + (t.ext || (t.kind === 'video' ? 'mp4' : 'mp3')), uri = null, size = 0;
      if (blob.size > 64 * 1024 * 1024 && N.hooks.toast) N.hooks.toast('Moving "' + (t.title || 'track') + '" to device storage…');
      for (var off = 0; off < blob.size || off === 0; off += CH) {
        if (off) await new Promise(function (r) { setTimeout(r, 0); });
        var res = await Lib.writeChunk({ name: name, first: off === 0, base64: await b64(blob.slice(off, off + CH)) });
        uri = res.uri; size = res.size;
        if (blob.size === 0) break;
      }
      if (size !== blob.size) throw new Error('size mismatch after copy');
      t.nativeUri = uri; t.nativeLocal = true;
      if (N.hooks.onMigrated) N.hooks.onMigrated(t);             // saves library meta, deletes the IndexedDB copy
      return uri;
    })();
    moving[t.dbId] = p;
    p.then(function () { delete moving[t.dbId]; }, function () { delete moving[t.dbId]; });
    return p;
  }
  N.ensureLocal = ensureLocal;

  function artFor(t) {
    var o = {};
    if (t.nativeArt) o.artUri = 'file://' + t.nativeArt.replace(/^file:\/\//, '');
    return o;
  }
  function metaFor(t, uri) {
    var o = { id: String(t.dbId || uri), uri: uri, kind: t.kind, title: t.title || '', artist: t.artist || '', album: t.album || '' };
    var a = artFor(t); for (var k in a) o[k] = a[k];
    // A CUE-sheet track is one stretch of a whole-album file: ExoPlayer plays just that part.
    if (t.cueStart != null) { o.clipStartMs = Math.round(t.cueStart * 1000); if (t.cueEnd > t.cueStart) o.clipEndMs = Math.round(t.cueEnd * 1000); }
    return o;
  }

  // ---------- loading ----------
  N.setSrc = function (el, t) {
    mirrorLast = null;           // ExoPlayer may take the session back; make the next mirror() call send in full
    var S = el && el.__pp;
    if (!S || !enabled) {
      // plain web <video>: make sure the native player is not still playing something else
      if (enabled && cur && cur.active) { var o = cur; deactivate(o); call(function () { return Player.stop(); }); }
      if (enabled) N.nowPlaying(t);
      el.src = t.url; return Promise.resolve();
    }
    var other = wrappers[S.kind === 'video' ? 'audio' : 'video'];
    if (other) deactivate(other.__pp);
    if (S.kind === 'audio') { var wv = origGetById('video-el'); if (wv && !wv.__pp) { try { wv.pause(); } catch (e) {} } }
    var id = ++S.loadId;
    S.active = true; S.track = t; S.uri = null; S.ready = false; S.ended = false; S.playing = false; S.pwr = false;
    S.seeking = false; S.base = 0; S.baseAt = now(); S.durMs = NaN; S.vw = S.vh = 0; S.err = null; S.state = 'idle';
    cur = S;
    emit(S, 'loadstart');

    S.loading = (async function () {
      var uri;
      try { uri = await ensureLocal(t); }
      catch (e) {
        if (id !== S.loadId) return;
        deactivate(S);                                   // couldn't hand it to native: use the web engine
        call(function () { return Player.stop(); });
        el.src = t.url;
        return;
      }
      if (id !== S.loadId) return;
      S.uri = uri;
      if ((S.advancedUri && sameUri(S.advancedUri, uri)) || (expect && sameUri(expect, uri))) {  // native already moved on to this item by itself
        S.advancedUri = null; S.adopting = false; expect = null;
        var snap = await Player.getState();
        if (id !== S.loadId) return;
        applySnap(S, snap, true);
        return;
      }
      S.adopting = false; S.advancedUri = null;
      // Loop, volume and rate belong to the player, not to the item, so they need not wait for the load: send them
      // together (these four bridge round trips used to run one after another before play() could go through).
      await Promise.all([
        Player.loadMedia(Object.assign(metaFor(t, uri), { autoplay: false })),
        Player.setLoop({ loop: S.loop }).catch(function () {}),
        Player.setVolume({ volume: S.muted ? 0 : S.vol }).catch(function () {}),
        Player.setRate({ rate: S.rate, preservePitch: S.preservePitch, pitch: S.pitch }).catch(function () {})
      ]);
      pushFx(true);
      syncViz();
      scheduleRect();
      if (S.kind === 'video') { lastFilterJson = ''; pushFilter(S.raw.style.filter || '', true); }
    })();
    return S.loading;
  };

  N.updateMeta = function (t) {
    if (!cur || !cur.active || !cur.uri || cur.track !== t) return;
    call(function () { return Player.updateMeta(metaFor(t, cur.uri)); });
  };

  // Queue the track JS will play next so ExoPlayer advances gaplessly and while the screen is off.
  var nextToken = 0;
  // Settings > Transitions, Crossfade: ask ExoPlayer to fade into the queued next item over ms (see PlaybackService).
  // Resolves true when the fade is set up; false means the normal gapless advance happens instead.
  N.crossfade = function (ms) {
    var S = cur;
    if (!S || !S.active || S.kind !== 'audio' || !Player.crossfade) return Promise.resolve(false);
    return Player.crossfade({ ms: Math.round(ms) }).then(function (r) { return !!(r && r.ok); }, function () { return false; });
  };
  N.cancelCrossfade = function () { if (cur && cur.active && Player.cancelCrossfade) call(function () { return Player.cancelCrossfade(); }); };
  // Sleep timer: the deadline is kept by the playback service, which keeps counting while the screen is off and the page's
  // own timers don't run. ms 0 clears it. True when the native engine is on, so the service stops (and fades) the music.
  N.sleep = function (ms, fadeMs) {
    if (!N.enabled || !Player.setSleep) return false;
    call(function () { return Player.setSleep({ ms: Math.max(0, Math.round(ms || 0)), fadeMs: Math.max(0, Math.round(fadeMs || 0)) }); });
    return true;
  };

  N.queueNext = function (t) {
    var tok = ++nextToken;
    var S = cur;
    if (!S || !S.active) return;
    var id = S.loadId;
    // Player.loadMedia replaces ExoPlayer's whole queue, so a "next" queued while a load is still in flight is
    // wiped (the race that made background auto-advance fail at random). Wait for the load, then queue.
    var ready = S.loading || Promise.resolve();
    var stale = function () { return tok !== nextToken || cur !== S || !S.active || id !== S.loadId; };
    if (!t) { ready.then(function () { if (!stale()) return Player.setNext({ uri: '' }); }).catch(function () {}); return; }
    ready.then(function () { return ensureLocal(t); }).then(function (uri) {
      if (stale()) return;
      return Player.setNext(metaFor(t, uri));
    }).catch(function () {});
  };

  // A video playing in the web engine has no ExoPlayer behind it, so Android would show no media notification.
  // Mirror its state into the media session (see WebMirrorPlayer); notification presses return as cmd events.
  var mirrorLast = null;
  N.mirror = function (o) {
    if (!o) {
      if (mirrorLast) { mirrorLast = null; call(function () { return Player.mirror({ on: false }); }); }
      return;
    }
    var t = o.track, uri = t.nativeUri || t.remoteUrl || '', at = now();
    var id = String(t.dbId || uri || t.title || '');
    if (mirrorLast && mirrorLast.id === id && mirrorLast.playing === o.playing && mirrorLast.rate === o.rate && mirrorLast.durMs === o.durMs) {
      var exp = mirrorLast.posMs + (mirrorLast.playing ? (at - mirrorLast.at) * mirrorLast.rate : 0);
      if (Math.abs(o.posMs - exp) < 1500) return;          // nothing the notification does not already know
    }
    mirrorLast = { id: id, playing: o.playing, rate: o.rate, durMs: o.durMs, posMs: o.posMs, at: at };
    var m = metaFor(t, uri); m.id = id; m.uri = uri;
    m.on = true; m.posMs = o.posMs; m.durMs = o.durMs; m.playing = o.playing; m.rate = o.rate;
    call(function () { return Player.mirror(m); });
  };

  // Tell the native side which track the UI is on when ExoPlayer is NOT the one playing it (web <video>).
  // Headset / notification / car "play" resumes from this, so it must match what the person sees.
  N.nowPlaying = function (t) {
    var uri = t && (t.nativeUri || t.remoteUrl);
    if (!uri) return;
    call(function () { return Player.setResume({ id: String(t.dbId || uri), uri: uri, title: t.title || '', artist: t.artist || '', posMs: 0 }); });
  };

  // ---------- native -> JS events ----------
  function applySnap(S, s, adopted) {
    if (!S.active) return;
    if (s.uri && S.uri && !sameUri(s.uri, S.uri)) return;     // stale event from the previous item
    var recentLocal = (now() - S.localAt) < 600;              // JS just pressed play/pause: don't let an old snapshot undo it
    var wasPwr = S.pwr, wasPlaying = S.playing;
    if (!recentLocal) S.pwr = !!s.playWhenReady;
    S.playing = !!s.playing; S.state = s.state;
    // While a seek is pending, keep the target the user chose. Snapshots from before the seek finished would move the bar back.
    if (!S.seeking) { S.base = s.posMs || 0; S.baseAt = now(); }
    S.durMs = s.durMs >= 0 ? s.durMs : NaN;
    // The page owns the speed. Ordinary reports still carry the player's OLD speed while a change is on its way
    // (queued behind a track load), and taking it from them undid the change: the new song kept the last song's
    // speed. Only a speed change made outside the page (a 'rate' report with no recent change of ours) is adopted.
    if (s.rate && s.why === 'rate' && now() - (S.rateAt || 0) > 1500) S.rate = s.rate;
    if (s.vw) { S.vw = s.vw; S.vh = s.vh; }
    if (s.fps) S.fps = s.fps;
    if ((s.state === 'ready' || adopted) && !S.ready) {
      S.ready = true;
      ['durationchange', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'].forEach(function (e) { emit(S, e); });
    }
    if (s.state === 'buffering' && S.ready) emit(S, 'waiting');
    if (s.state === 'ended') {
      // The app answers 'ended' with a seek (repeat). Reports from before that seek still say "ended": acting on
      // them fired 'ended' two or three times per finish, each one seeking and restarting again.
      if (S.seeking) return;
      if (!S.ended) { S.ended = true; S.pwr = false; emit(S, 'timeupdate'); emit(S, 'pause'); emit(S, 'ended'); }
      return;
    }
    if (s.playing && !wasPlaying) emit(S, 'playing');
    if (!recentLocal) {
      // Paused or started from outside the page (notification, widget, headset, car, another app taking over the sound).
      // The page is told directly as well: its own 'pause' handling deliberately ignores pauses while the app is hidden.
      if (!S.pwr && wasPwr && !S.ended) { emit(S, 'pause'); if (N.hooks.outsidePlayState) N.hooks.outsidePlayState(false); }
      if (S.pwr && !wasPwr) { emit(S, 'play'); if (N.hooks.outsidePlayState) N.hooks.outsidePlayState(true); }
    }
    if (s.why === 'seeked' && S.seeking && seekLanded(S, s.posMs)) { S.seeking = false; clearTimeout(S.seekTimer); S.base = s.posMs; S.baseAt = now(); emit(S, 'seeked'); emit(S, 'timeupdate'); }
    if (s.why === 'rate') emit(S, 'ratechange');
    if (s.why === 'size') emit(S, 'resize');
    syncViz();
    syncFxTimer();
  }

  var listenersReady = false;
  function wireEvents() {
    if (listenersReady) return; listenersReady = true;
    Player.addListener('state', function (s) { if (cur) applySnap(cur, s); });
    Player.addListener('time', function (t) {
      var S = cur; if (!S || !S.active || S.seeking) return;
      S.base = t.posMs; S.baseAt = now();
      var hadDur = S.durMs >= 0;
      if (t.durMs >= 0) S.durMs = t.durMs;
      if (!hadDur && S.durMs >= 0) emit(S, 'durationchange');   // length became known after 'ready' (VBR/headerless audio)
      emit(S, 'timeupdate');
    });
    Player.addListener('advanced', function (s) {
      var S = cur; if (!S || !S.active) return;
      if (N.hooks.matchesNext && N.hooks.syncTo && !N.hooks.matchesNext(s.uri)) { N.hooks.syncTo(s.uri); return; }  // e.g. a car queue
      // Native already started the queued item. Let the app run its normal "track ended" logic; it will
      // call loadTrack(next) and setSrc() will adopt the playing item instead of reloading it.
      S.advancedUri = s.uri; S.adopting = true;
      setTimeout(function () { if (S.adopting) { S.adopting = false; N.resync(); } }, 2500);
      S.ended = true; S.pwr = false;
      emit(S, 'timeupdate'); emit(S, 'pause'); emit(S, 'ended');
    });
    Player.addListener('error', function (e) {
      var S = cur; if (!S || !S.active) return;
      S.err = e.message || e.code || 'error'; emit(S, 'error');
      if (N.hooks.toast) N.hooks.toast('Playback error: ' + S.err, 'error');
    });
    Player.addListener('external', function (s) {          // Android Auto / Assistant / car kit started something
      if (N.hooks.syncTo && s.uri) N.hooks.syncTo(s.uri);
    });
    Player.addListener('diag', function (d) { if (N.hooks.toast) N.hooks.toast(d.msg, 'error'); });
    Player.addListener('notice', function (d) { if (N.hooks.toast) N.hooks.toast(d.msg); });
    // The file opened, but a stream in it has no decoder here (e.g. a DTS soundtrack): the page may hand it to VLC.
    Player.addListener('unsupported', function (d) {
      var S = cur; if (!S || !S.active) return;
      if (N.hooks.unsupported) N.hooks.unsupported(S.track, d);
    });
    Player.addListener('cmd', function (c) {
      if (N.hooks.command) N.hooks.command(c.name, c);
    });
    Player.addListener('fft', function (e) {
      fftF = dec(e.f); fftT = dec(e.t); if (e.sr > 0) fftRate = e.sr;
    });
    Player.addListener('memc', function (m) { N.memcStatus = m; if (N.hooks.memcStatus) N.hooks.memcStatus(m); });
    Player.addListener('pip', function (e) {
      document.documentElement.classList.toggle('pp-pip', !!e.on);
      if (!e.on) scheduleRect();
    });
    if (Lib) {
      Lib.addListener('scanBatch', function (e) { if (N.hooks.entries) N.hooks.entries(e.entries || [], 'scan'); });
      Lib.addListener('mediaChanged', function () { if (N.hooks.mediaChanged) N.hooks.mediaChanged(); });
      Lib.addListener('scanProgress', function (e) { if (N.hooks.scanProgress) N.hooks.scanProgress(e); });
      Lib.addListener('voiceSearch', function (e) { if (N.hooks.voiceSearch) N.hooks.voiceSearch(e.query || ''); });
      Lib.addListener('openUris', function (e) { if (N.hooks.entries) N.hooks.entries(e.entries || [], 'open'); });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) N.resync(); syncViz(); syncFxTimer(); });
  }
  wireEvents();

  // If JS was throttled while native advanced on its own, line the UI back up with what is actually playing.
  N.resync = async function () {
    var S = cur; if (!S || !S.active) return;
    try {
      var s = await Player.getState();
      if (s.alarm) return;                               // an alarm is playing its songs (AlarmActivity.kt): not ours to follow
      if (s.uri && S.uri && !sameUri(s.uri, S.uri) && N.hooks.syncTo) N.hooks.syncTo(s.uri);
      else applySnap(S, s);
    } catch (e) {}
  };

  // ---------- effects ----------
  var fxFn = null, fxLast = '';
  // A web video's soundtrack played by the native player (the WebView cannot decode it, see 29b "sound companion"):
  // the native player has no wrapper then, but the EQ and effects must still reach it.
  var fxCompanion = false;
  N.companionFx = function (on) {
    fxCompanion = !!on;
    if (fxCompanion) { fxLast = ''; pushFx(true); }
    syncFxTimer();
  };
  function pushFx(force) {
    if (!fxFn || !((cur && cur.active) || fxCompanion)) return;
    var f; try { f = fxFn(); } catch (e) { return; }
    var j = JSON.stringify(f);
    if (!force && j === fxLast) return;
    fxLast = j; call(function () { return Player.setFx(f); });
  }
  // The 400 ms housekeeping tick (push FX, poll the video filter, queue the next track) only runs while it can matter:
  // whenever the page is visible (sliders can move), or while native playback is running in the background
  // (auto-advance needs the next item queued). Hidden and idle = no timer, so the CPU can sleep.
  var fxTimer = 0;
  function fxTick() { pushFx(false); try { pollFilter(); } catch (e) {} if (N.hooks.tick) { try { N.hooks.tick(); } catch (e) {} } }
  function syncFxTimer() {
    if (!fxFn) return;
    var want = !document.hidden || fxCompanion || !!(cur && cur.active && (cur.playing || cur.pwr));
    if (want && !fxTimer) { fxTimer = setInterval(fxTick, 400); fxTick(); }
    else if (!want && fxTimer) { clearInterval(fxTimer); fxTimer = 0; }
  }
  // Knobs and sliders are followed closely while the page is on screen: at the housekeeping pace alone a turn of a
  // knob arrived in up to 0.4 s steps, which sounded nothing like the same knob on a video.
  var fxFast = 0;
  N.setFxProvider = function (fn) {
    fxFn = fn; syncFxTimer();
    if (!fxFast) fxFast = setInterval(function () { if (!document.hidden) pushFx(false); }, 60);
  };

  // ---------- visualizer ----------
  // The native player sends the spectrum of the sound that is audible right now (see VizClockSink), taken a little
  // ahead to cover the time the picture needs to reach the screen. vizTrim is the listener's own correction on top.
  var fftF = null, fftT = null, fftRate = 0, smooth = null, vizOn = false, VIZ_LEAD_MS = 45, vizTrim = 0;
  try { vizTrim = Math.max(-300, Math.min(300, parseInt(localStorage.getItem('ppVizTrim'), 10) || 0)); } catch (e) {}
  /** Later (+) or earlier (-) bars, in ms. For speakers and headphones that do not report their own delay. */
  N.setVizTrim = function (ms) {
    vizTrim = Math.max(-300, Math.min(300, +ms || 0));
    try { localStorage.setItem('ppVizTrim', String(vizTrim)); } catch (e) {}
    call(function () { return Player.setViz({ on: vizOn, leadMs: VIZ_LEAD_MS - vizTrim }); });
  };
  N.vizTrim = function () { return vizTrim; };
  /** Sample rate of the spectrum being fed to the analyser (0 while the analyser reads the page's own audio). */
  N.vizRate = function () { return (cur && cur.active && cur.playing && fftF) ? fftRate : 0; };
  function dec(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function syncViz() {
    // a video's sound feeds the bars too while a Visualiser widget is on screen (it stamps __ppVizWant), else only songs do
    var wid = (window.__ppVizWant || 0) > (window.performance ? performance.now() : 0) - 1500;
    var want = !!(cur && cur.active && (cur.kind === 'audio' || wid) && cur.playing && !document.hidden);
    if (want === vizOn) return; vizOn = want;
    call(function () { return Player.setViz({ on: want, leadMs: VIZ_LEAD_MS - vizTrim }); });
  }
  setInterval(syncViz, 1000);   // a Visualiser widget can appear or go away over a playing video
  N.decorateAnalyser = function (an) {
    var of = an.getByteFrequencyData.bind(an), ot = an.getByteTimeDomainData.bind(an);
    an.getByteFrequencyData = function (arr) {
      if (!(cur && cur.active && cur.playing && fftF)) return of(arr);
      var sm = an.smoothingTimeConstant == null ? 0.8 : an.smoothingTimeConstant;
      if (!smooth || smooth.length !== fftF.length) smooth = new Float32Array(fftF.length);
      for (var i = 0; i < arr.length; i++) {
        var v = i < fftF.length ? fftF[i] : 0;
        if (i < smooth.length) { smooth[i] = sm * smooth[i] + (1 - sm) * v; v = smooth[i]; }
        arr[i] = v;
      }
    };
    an.getByteTimeDomainData = function (arr) {
      if (!(cur && cur.active && cur.playing && fftT)) return ot(arr);
      for (var i = 0; i < arr.length; i++) arr[i] = fftT[Math.min(fftT.length - 1, Math.floor(i * fftT.length / arr.length))];
    };
  };

  // ---------- video surface placement ----------
  var rectRaf = 0, lastRect = '', rectTimer = 0, holeNodes = [], hiddenNodes = [], lastBackdrop = '', lastShow = false, hideAgain = 0, settleUntil = 0;
  // The page must be see-through above the video box: clear the backgrounds of everything that contains it,
  // and give the window itself the page colour so the rest of the screen looks unchanged.
  // Anything painted UNDER the video box (e.g. the home screen behind the full-screen player) would show through the
  // cleared backgrounds and cover the native picture, so it is hidden while the native video is on screen.
  // Returns false when the video box was not among the layers yet (the player still opening): try again later.
  function setHidden(found) {                                           // only touches what changed: this runs on every poll
    hiddenNodes.forEach(function (n) { if (!found.has(n)) n.classList.remove('pp-hole-hide'); });
    found.forEach(function (n) { if (hiddenNodes.indexOf(n) < 0) n.classList.add('pp-hole-hide'); });
    hiddenNodes = Array.from(found);
  }
  // The full-screen player covers the whole screen, so everything stacked below it is out of sight anyway. Those layers
  // are found from their own z-index, not by poking at points: no animation or timing can make it miss one. (Opening
  // from a Library row, the player grows out of the row, and a look at the wrong moment used to leave the Library
  // showing through the see-through player, so only its buttons showed and the native picture stayed covered.)
  function layersBelow(wrap, chain) {
    var top = null, Z = 0;
    for (var n = wrap; n && n !== document.body; n = n.parentElement) {   // the outermost layer of the player, and its z-index
      var cs = getComputedStyle(n);
      if (cs.position !== 'static' && cs.zIndex !== 'auto') { top = n; Z = +cs.zIndex || 0; }
    }
    if (!top || Z <= 0) return null;
    var found = new Set();
    for (var c = top; c && c.parentElement && c !== document.documentElement; c = c.parentElement) {
      var kids = c.parentElement.children;
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i]; if (chain.has(k) || /^(SCRIPT|STYLE|LINK|TEMPLATE|AUDIO|VIDEO)$/.test(k.tagName)) continue;
        var ks = getComputedStyle(k); if (ks.display === 'none') continue;
        var z = ks.position === 'static' || ks.zIndex === 'auto' ? 0 : (+ks.zIndex || 0);
        if (z < Z) found.add(k);
      }
      if (c.parentElement === document.body) break;
    }
    return found;
  }
  // deep = also poke at points when the box does not fill the screen (costs a style recalc, so only after a change).
  function hideBeneath(el, deep) {
    if (!el) { setHidden(new Set()); return true; }
    var wrap = el.parentElement || el, r = wrap.getBoundingClientRect(), seen = false;
    if (r.width < 4 || r.height < 4) { setHidden(new Set()); return false; }
    var chain = new Set(); for (var n = el; n; n = n.parentElement) chain.add(n);
    if (r.left <= 1 && r.top <= 1 && r.right >= window.innerWidth - 1 && r.bottom >= window.innerHeight - 1) {
      var all = layersBelow(wrap, chain); if (all) { setHidden(all); return true; }
    }
    if (!deep) return true;
    var probe = document.createElement('style');                        // hit-test layers that ignore taps too
    probe.textContent = '*{pointer-events:auto !important}'; document.head.appendChild(probe);
    hiddenNodes.forEach(function (n) { n.classList.remove('pp-hole-hide'); }); hiddenNodes = [];
    var pts = [[0.5, 0.5], [0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]], found = new Set();
    try {
      pts.forEach(function (q) {
        var list = document.elementsFromPoint(r.left + r.width * q[0], r.top + r.height * q[1]), below = false;
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (e === wrap || e === el) { below = true; seen = true; continue; }
          if (!below || chain.has(e)) continue;
          var top = e; while (top.parentElement && !chain.has(top.parentElement)) top = top.parentElement;   // the whole branch
          if (!chain.has(top)) found.add(top);
        }
      });
    } finally { probe.remove(); }
    setHidden(found);
    return seen;
  }
  function markHole(el) {
    if (!el) { holeNodes.forEach(function (n) { n.classList.remove('pp-hole-anc'); }); holeNodes = []; hideBeneath(null); return; }
    if (holeNodes.length) return;
    var bg = getComputedStyle(document.body).backgroundColor, m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
    for (var n = el.parentElement; n; n = n.parentElement) { n.classList.add('pp-hole-anc'); holeNodes.push(n); }
    if (m && bg !== lastBackdrop) {
      lastBackdrop = bg;
      var hex = '#' + [m[1], m[2], m[3]].map(function (x) { return ('0' + (+x).toString(16)).slice(-2); }).join('');
      call(function () { return Player.setBackdrop({ color: hex }); });
    }
  }
  function sendRect() {
    rectRaf = 0;
    var S = wrappers.video && wrappers.video.__pp;
    var show = !!(S && S.active && S.track && S.track.kind === 'video');
    document.documentElement.classList.toggle('pp-native-video', show);
    if (show !== lastShow) {                                           // let the page stop its own video effects (MEMC canvas)
      lastShow = show;
      try { window.dispatchEvent(new CustomEvent('pp-native-video', { detail: { on: show } })); } catch (e) {}
    }
    var r = { x: 0, y: 0, w: 0, h: 0, visible: false };
    if (show) {
      // The box is the video's container: <video> itself carries the zoom/pan/ratio transform, so its own rect moves
      // and grows when you zoom. The native renderer applies that transform inside the box instead.
      var wrapBox = S.raw.parentElement || S.raw, b = wrapBox.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      // The box is measured on its container: <video> itself is hidden on purpose in native mode, and a closed player
      // keeps its size but is visibility:hidden (or faded out), so size alone is not enough.
      var box = S.raw.parentElement || S.raw, bs = getComputedStyle(box);
      var shown = box.checkVisibility ? box.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : (bs.visibility !== 'hidden' && +bs.opacity > 0 && bs.display !== 'none');
      var onScreen = b.right > 2 && b.bottom > 2 && b.left < window.innerWidth - 2 && b.top < window.innerHeight - 2;   // a player slid away counts as closed
      var vis = b.width > 2 && b.height > 2 && onScreen && getComputedStyle(S.raw).display !== 'none' && shown && !document.hidden;
      var cs = getComputedStyle(S.raw), vf = (getComputedStyle(wrapBox).getPropertyValue('--vfit') || cs.objectFit || '').trim();
      var m = /matrix\(([^)]+)\)/.exec(cs.transform || ''), mv = m ? m[1].split(',').map(parseFloat) : [1, 0, 0, 1, 0, 0];
      r = { x: Math.round(b.left * dpr), y: Math.round(b.top * dpr), w: Math.round(b.width * dpr), h: Math.round(b.height * dpr), visible: vis,
        fit: vf === 'cover' || vf === 'fill' ? vf : 'contain',
        sx: +mv[0].toFixed(4) || 1, sy: +mv[3].toFixed(4) || 1, tx: Math.round(mv[4] * dpr), ty: Math.round(mv[5] * dpr) };
      watchView(S.raw);
    }
    // The page is only made see-through while the video box is actually on screen. With the player closed (a video
    // still loaded), the home screen, the custom background and everything else look exactly as normal.
    markHole(show && r.visible ? S.raw : null);
    var j = JSON.stringify(r), moved = j !== lastRect;
    // The layout moved (player opened, rotated...): look again. Tapping a video opens the player with an animation, and the
    // first look can come before the video box is on top of the page; then the page under it was never hidden and only the
    // player's buttons showed over it. So it keeps looking (every poll, a few seconds at most) until it finds the box.
    // Opening from a list row, the player grows out of that row, and while it does the list is stacked ABOVE the video
    // box. A look taken then hides nothing, so it also keeps looking for a while after the box last moved (and after any
    // animation on the page ends): the last look, on the settled page, is the one that counts.
    var t = now();
    if (show && r.visible) {
      if (moved) settleUntil = t + 1500;
      var deep = moved || hideAgain > 0 || t < settleUntil;          // the full-screen check is cheap and runs on every poll
      var ok = hideBeneath(S.raw, deep); if (deep) hideAgain = ok ? 0 : (moved ? 15 : Math.max(0, hideAgain - 1));
    } else { hideAgain = 0; settleUntil = 0; }
    if (moved) {
      lastRect = j;
      call(function () { return Player.setVideoRect(r); });
    }
    if (show && !rectTimer) rectTimer = setInterval(scheduleRect, 300);
    if (show && (hideAgain > 0 || now() < settleUntil)) setTimeout(scheduleRect, 250);
    if (!show && rectTimer) { clearInterval(rectTimer); rectTimer = 0; }
  }
  function scheduleRect() { if (!rectRaf) rectRaf = requestAnimationFrame(sendRect); }
  // Something on the page finished moving (the player's open/close animation, a list sliding...): look again.
  ['transitionend', 'animationend'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (!lastShow) return; settleUntil = Math.max(settleUntil, now() + 400); scheduleRect(); }, true);
  });
  // Zoom and pan change the video's inline transform (and the fit mode the container's style) many times a second
  // while dragging: follow them right away instead of waiting for the 300 ms poll.
  var viewObs = null, viewObsEl = null;
  function watchView(el) {
    if (viewObsEl === el || !window.MutationObserver) return;
    if (viewObs) viewObs.disconnect();
    viewObsEl = el;
    viewObs = new MutationObserver(scheduleRect);
    viewObs.observe(el, { attributes: true, attributeFilter: ['style'] });
    if (el.parentElement) viewObs.observe(el.parentElement, { attributes: true, attributeFilter: ['style', 'data-vfit', 'data-vzoomed'] });
  }
  window.addEventListener('resize', scheduleRect);
  window.addEventListener('orientationchange', scheduleRect);
  document.addEventListener('transitionend', scheduleRect, true);
  document.addEventListener('animationend', scheduleRect, true);
  document.addEventListener('scroll', scheduleRect, true);
  N.scheduleRect = scheduleRect;

  // ---------- video filters: the page's whole CSS filter chain -> one GPU shader ----------
  // The app composes `videoEl.style.filter` from presets (saturate/contrast/brightness/sepia/grayscale/hue-rotate/invert),
  // auto-levels, posterize, duotone, sharpen and clarity (SVG filters) and the Adjust sliders. We read that string,
  // resolve the url(#...) parts from the same SVG attributes the page already maintains, and send an ordered op list.
  var lastFilterJson = '', lastCss = '';
  function attr(id, name) { var el = origGetById(id); return el ? el.getAttribute(name) : null; }
  function nums(a) { return String(a || '').trim().split(/\s+/).filter(Boolean).map(Number); }
  function buildOps(css, scale) {
    var ops = [], re = /([a-z-]+)\(([^)]*)\)/g, m;
    while ((m = re.exec(css))) {
      var fn = m[1], arg = m[2].trim();
      if (fn === 'url') {
        var id = arg.replace(/["'#\s]/g, '');
        if (id === 'posterize-filter') {
          var n = nums(attr('posterize-r', 'tableValues')).length;
          if (n >= 2) ops.push([7, n, 0, 0, 0, 0, 0, 0]);
        } else if (id === 'duotone-filter') {
          var lo = [], hi = [];
          ['duotone-r', 'duotone-g', 'duotone-b'].forEach(function (k) {
            var t = nums(attr(k, 'tableValues')); lo.push(t.length ? t[0] : 0); hi.push(t.length ? t[t.length - 1] : 1);
          });
          ops.push([8, lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], 0]);
        } else if (id === 'sharpen-filter') {
          var km = nums(attr('sharpen-matrix', 'kernelMatrix'));
          if (km.length >= 9 && Math.abs(km[4] - 1) > 0.001) ops.push([9, km[4], km[1], 0, 0, 0, 0, 0]);
        } else if (id === 'clarity-filter') {
          var k2 = parseFloat(attr('clarity-boost', 'k2')) || 0;
          if (k2 > 0.001) ops.push([10, 2 * k2, 4 * scale, 0, 0, 0, 0, 0]);   // page formula: out = src + 2*slope*(src - blur)
        }
        continue;
      }
      var v = parseFloat(arg); if (isNaN(v)) continue;
      if (/%$/.test(arg)) v /= 100;
      switch (fn) {
        case 'brightness': if (Math.abs(v - 1) > 0.001) ops.push([0, v, 0, 0, 0, 0, 0, 0]); break;
        case 'contrast': if (Math.abs(v - 1) > 0.001) ops.push([1, v, 0, 0, 0, 0, 0, 0]); break;
        case 'saturate': if (Math.abs(v - 1) > 0.001) ops.push([2, v, 0, 0, 0, 0, 0, 0]); break;
        case 'sepia': if (v > 0.001) ops.push([3, Math.min(1, v), 0, 0, 0, 0, 0, 0]); break;
        case 'grayscale': if (v > 0.001) ops.push([4, Math.min(1, v), 0, 0, 0, 0, 0, 0]); break;
        case 'invert': if (v > 0.001) ops.push([6, Math.min(1, v), 0, 0, 0, 0, 0, 0]); break;
        case 'hue-rotate':
          var deg = /rad$/.test(arg) ? v * 180 / Math.PI : (/turn$/.test(arg) ? v * 360 : v);
          if (Math.abs(deg) > 0.01) ops.push([5, Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), 0, 0, 0, 0, 0]);
          break;
      }
    }
    return ops;
  }
  function pushFilter(css, force) {
    if (css != null) lastCss = css;
    var S = wrappers.video && wrappers.video.__pp;
    if (!S || !S.active || !S.track || S.track.kind !== 'video') return;
    var scale = 1;
    try { scale = Math.max(0.5, Math.min(8, (S.vh || 720) / Math.max(1, S.raw.getBoundingClientRect().height))); } catch (e) {}
    var flat = [].concat.apply([], (!lastCss || lastCss === 'none') ? [] : buildOps(lastCss, scale));
    var j = JSON.stringify(flat);
    if (!force && j === lastFilterJson) return;
    lastFilterJson = j;
    call(function () { return Player.setVideoFilter({ ops: flat }); });
  }
  N.setVideoFilterCss = function (css) { pushFilter(css, false); };
  function pollFilter() {       // sliders change the SVG attributes without changing the filter string, so watch both
    var S = wrappers.video && wrappers.video.__pp;
    if (S && S.active && S.track && S.track.kind === 'video') pushFilter(S.raw.style.filter || '', false);
  }
  N.snapshot = async function () {
    var r = await Player.snapshot(), bin = atob(r.png), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: 'image/png' });
  };
  N._buildOps = buildOps;       // exposed for tests

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#pip-btn');
    if (b && N.videoActive()) { e.stopImmediatePropagation(); e.preventDefault(); N.enterPip(); }
  }, true);
  N.screenOn = function () {};     // native keeps the screen on while video plays (see NativePlayerPlugin)
  N.enterPip = function () { return Player.enterPip(); };
  N.getTracks = function () { return Player.getTracks(); };
  N.audioInfo = function () { return Player.audioInfo(); };
  N.audioOptions = { get: function () { return Player.getAudioOptions(); }, set: function (o) { return Player.setAudioOptions(o); } };
  N.selectTrack = function (o) { return Player.selectTrack(o); };
  N.stop = function () { return Player.stop(); };
  /** Settings > Leaving the player: other media, calls, the media notification, swiping the app away. */
  N.setPlaybackPrefs = function (o) { return call(function () { return Player.setPlaybackPrefs(o); }); };
  /** Ends what is playing (Leaving the player: Stop the track). */
  N.closeTrack = function () { if (cur && cur.active) deactivate(cur); return call(function () { return Player.stop(); }); };

  // ---------- library / files ----------
  N.lib = {
    pickFiles: function () { return Lib.pickFiles(); },
    pickFolder: function () { return Lib.pickFolder(); },
    rescan: function (tree, known) { return Lib.rescan({ tree: tree, known: known || [] }); },
    listFolders: function () { return Lib.listFolders(); },
    mediaAccess: function () { return Lib.mediaAccess(); },
    requestMediaAccess: function () { return Lib.requestMediaAccess(); },
    scanDevice: function (known, video) { return Lib.scanDevice({ known: known || [], video: video !== false }); },
    missing: function (uris) { return Lib.missing({ uris: uris || [] }); },
    mediaDetails: function (uris) { return Lib.mediaDetails({ uris: uris || [] }); },
    readText: function (uri) { return Lib.readText({ uri: uri }); },
    hashFiles: function (uris) { return Lib.hashFiles({ uris: uris || [] }); },
    getPendingOpen: function () { return Lib.getPendingOpen(); },
    deleteLocal: function (uri) { return Lib.deleteLocal({ uri: uri }); },
    saveToDevice: function (o) { return Lib.saveToDevice(o); },
    fileSrc: function (path) { return Cap.convertFileSrc('file://' + String(path).replace(/^file:\/\//, '')); }
  };

  // ---------- background jobs ----------
  N.jobs = {
    run: async function (title, fn) {
      if (!Jobs) return fn(function () {});
      var id = 'j' + Date.now() + Math.random().toString(36).slice(2, 6);
      await Jobs.start({ id: id, title: title, text: 'Starting…', progress: -1 });
      var ok = true;
      try {
        return await fn(function (pct, text) { Jobs.update({ id: id, title: title, text: text || '', progress: pct == null ? -1 : Math.round(pct) }); });
      } catch (e) { ok = false; throw e; }
      finally { Jobs.finish({ id: id, title: title, ok: ok, text: ok ? 'Tap to open' : 'Something went wrong' }); }
    }
  };

  // ---------- library catalog for Android Auto / Assistant / car kits ----------
  N.pushCatalog = function (items, playlists) { call(function () { return Player.setCatalog({ items: items, playlists: playlists }); }); };
  // Move every legacy IndexedDB track onto disk so the whole library is playable/browsable natively.
  N.migrateAll = async function (tracks) {
    var todo = (tracks || []).filter(function (t) { return !t.nativeUri && !t.remoteUrl; }), i = 0;
    await N.jobs.run('Moving library to device storage', async function (progress) {
      for (; i < todo.length; i++) {
        progress(100 * i / Math.max(1, todo.length), (i + 1) + ' of ' + todo.length + ': ' + (todo[i].title || ''));
        try { await ensureLocal(todo[i]); } catch (e) {}
      }
    });
  };

  // ---------- boot ----------
  N.boot = async function () {
    try {
      var p = await Lib.getPendingOpen();
      if (p.entries && p.entries.length && N.hooks.entries) N.hooks.entries(p.entries, 'open');
      if (p.query != null && N.hooks.voiceSearch) N.hooks.voiceSearch(p.query);
    } catch (e) {}
  };
})();
