/* QR Link: connects two phones for a game with no server.
 *
 * The host shows a QR code, the guest scans it and shows one back, the host
 * scans that, and the phones talk directly over a WebRTC data channel.
 * Each code carries only what WebRTC needs (ICE username/password, DTLS
 * fingerprint, a few addresses), so it stays small and quick to scan.
 * Codes can also be copied and pasted, e.g. sent through a chat app.
 *
 * QUICK LINK (the default): the host gets a 4-letter room code; the other phone types it (or scans it) once.
 * The code is matched up through PeerJS's free public broker (0.peerjs.com, loaded from peerjs.min.js here);
 * once the phones are linked they talk directly and the broker is let go. With no internet, the two-QR flow
 * below still works ("No internet? Use QR codes").
 *
 * Usage:
 *   QRLink.open({ app:'kitchen', title:'Co-op', hostLabel:'Host', joinLabel:'Join',
 *                 onConnected(conn, role){...}, onClose(){...} });
 *   conn.send(obj)  conn.on('data'|'close', fn)  conn.close()  conn.open
 * role is 'host' or 'guest'. Messages are JSON.
 */
(function(){
  'use strict';
  var BASE = (function(){
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^\/]*$/, '') : '';
  })();
  // several public STUN servers: if one is blocked on a network, another still finds the phone's public address
  var ICE = [{ urls:['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls:'stun:stun.cloudflare.com:3478' }];
  var GATHER_MS = 2500;      // stop waiting for addresses after this
  var PING_MS = 1000, DEAD_MS = 7000;
  var VER = 'PPL1';

  // ---------- libraries (loaded when first needed) ----------
  var libs = {};
  function loadLib(name, globalName){
    if (window[globalName]) return Promise.resolve();
    if (libs[name]) return libs[name];
    libs[name] = new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = BASE + name; s.onload = res; s.onerror = function(){ libs[name] = null; rej(new Error('load ' + name)); };
      document.head.appendChild(s);
    });
    return libs[name];
  }

  // ---------- compact codes ----------
  function b64u(bytes){ var s=''; for (var i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function unb64u(str){ var s=atob(str.replace(/-/g,'+').replace(/_/g,'/')); var a=[]; for (var i=0;i<s.length;i++) a.push(s.charCodeAt(i)); return a; }

  function encode(app, kind, sdp){
    var ufrag, pwd, fp, cands = [], seen = {};
    sdp.split(/\r?\n/).forEach(function(l){
      if (l.indexOf('a=ice-ufrag:') === 0) ufrag = ufrag || l.slice(12);
      else if (l.indexOf('a=ice-pwd:') === 0) pwd = pwd || l.slice(10);
      else if (l.indexOf('a=fingerprint:sha-256 ') === 0) fp = fp || l.slice(22).split(':').map(function(h){ return parseInt(h,16); });
      else if (l.indexOf('a=candidate:') === 0){
        var p = l.slice(12).split(' ');
        // foundation component proto priority address port typ type ...
        if (p[1] !== '1' || p[2].toLowerCase() !== 'udp') return;
        var t = p[7] === 'host' ? 'h' : (p[7] === 'srflx' ? 's' : null);
        if (!t) return;
        var key = p[4] + ' ' + p[5];
        if (seen[key]) return; seen[key] = 1;
        cands.push(t + p[4] + ' ' + p[5]);
      }
    });
    if (!ufrag || !pwd || !fp) throw new Error('bad sdp');
    return [VER, app, kind, ufrag, pwd, b64u(fp)].concat(cands.slice(0, 8)).join('|');
  }

  function decode(app, wantKind, text){
    var f = String(text || '').trim().split('|');
    if (f[0] !== VER || f.length < 6) throw new Error('notcode');
    if (f[1] !== app) throw new Error('otherapp');
    if (f[2] !== wantKind) throw new Error(f[2] === 'o' ? 'gotoffer' : 'gotanswer');
    var fp = unb64u(f[5]).map(function(b){ return (b < 16 ? '0' : '') + b.toString(16).toUpperCase(); }).join(':');
    var lines = [
      'v=0', 'o=- ' + (Date.now() % 1e9) + ' 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
      'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:' + f[3], 'a=ice-pwd:' + f[4], 'a=ice-options:trickle',
      'a=fingerprint:sha-256 ' + fp,
      'a=setup:' + (wantKind === 'o' ? 'actpass' : 'active'),
      'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144'
    ];
    f.slice(6).forEach(function(c, i){
      var t = c[0], rest = c.slice(1).split(' ');
      if (rest.length !== 2) return;
      if (t === 'h') lines.push('a=candidate:' + (i+1) + ' 1 udp ' + (2122260223 - i) + ' ' + rest[0] + ' ' + rest[1] + ' typ host generation 0');
      else if (t === 's') lines.push('a=candidate:' + (i+1) + ' 1 udp ' + (1686052607 - i) + ' ' + rest[0] + ' ' + rest[1] + ' typ srflx raddr 0.0.0.0 rport 0 generation 0');
    });
    lines.push('a=end-of-candidates');
    return { type: wantKind === 'o' ? 'offer' : 'answer', sdp: lines.join('\r\n') + '\r\n' };
  }

  function gathered(pc){
    return new Promise(function(res){
      if (pc.iceGatheringState === 'complete') return res();
      var done = false, t = setTimeout(fin, GATHER_MS);
      function fin(){ if (done) return; done = true; clearTimeout(t); res(); }
      pc.addEventListener('icegatheringstatechange', function(){ if (pc.iceGatheringState === 'complete') fin(); });
      pc.addEventListener('icecandidate', function(e){ if (!e.candidate) fin(); });
    });
  }

  // ---------- connection wrapper ----------
  function makeConn(pc, dc){
    var handlers = { data:[], close:[] }, closed = false, lastHeard = Date.now(), ping;
    var conn = {
      open: true,
      role: null,
      on: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); return conn; },
      send: function(obj){ if (!conn.open) return; try { dc.send(JSON.stringify(obj)); } catch(e){} },
      sendText: function(text){ if (!conn.open) return; try { dc.send(text); } catch(e){} },
      // how many bytes are waiting to go out; senders can skip a frame when the link is backed up
      buffered: function(){ try { return dc.bufferedAmount; } catch(e){ return 0; } },
      close: function(){ shut(true); }
    };
    function emit(ev, arg){ (handlers[ev] || []).slice().forEach(function(fn){ try { fn(arg); } catch(e){ console.error(e); } }); }
    function shut(local){
      if (closed) return; closed = true; conn.open = false;
      clearInterval(ping);
      if (local) { try { dc.send('{"__q":1}'); } catch(e){} }
      setTimeout(function(){ try { dc.close(); } catch(e){} try { pc.close(); } catch(e){} }, local ? 150 : 0);
      emit('close');
    }
    dc.onmessage = function(e){
      lastHeard = Date.now();
      var m; try { m = JSON.parse(e.data); } catch(err){ return; }
      if (m && m.__p) return;
      if (m && m.__q) { shut(false); return; }
      emit('data', m);
    };
    dc.onclose = function(){ shut(false); };
    pc.addEventListener('connectionstatechange', function(){ if (pc.connectionState === 'failed' || pc.connectionState === 'closed') shut(false); });
    ping = setInterval(function(){
      if (Date.now() - lastHeard > DEAD_MS) { shut(false); return; }
      try { dc.send('{"__p":1}'); } catch(e){}
    }, PING_MS);
    // tidy up if the page goes away
    window.addEventListener('pagehide', function(){ shut(true); });
    return conn;
  }

  // ---------- UI ----------
  var CSS = '' +
  '#qrl{position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;' +
    'background:rgba(10,10,14,.96);color:#f1ece2;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;overflow-y:auto;touch-action:manipulation;-webkit-user-select:none;user-select:none}' +
  '#qrl h2{margin:0;font-size:22px;font-weight:700;letter-spacing:.3px}' +
  '#qrl p{margin:0;max-width:320px;color:#bdb6a8;font-size:14px}' +
  '#qrl .row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}' +
  '#qrl button{font:inherit;font-weight:700;min-width:120px;padding:12px 18px;border-radius:12px;border:0;background:var(--qrl-acc,#e8a33a);color:#1b140b;cursor:pointer}' +
  '#qrl button.ghost{background:rgba(255,255,255,.1);color:#f1ece2;font-weight:600}' +
  '#qrl button:active{transform:scale(.97)}' +
  '#qrl .qr{background:#fff;border-radius:14px;padding:10px;line-height:0}' +
  '#qrl .qr canvas{width:min(72vw,300px);height:auto;image-rendering:pixelated}' +
  '#qrl .cam{position:relative;width:min(80vw,320px);aspect-ratio:1;border-radius:16px;overflow:hidden;background:#000}' +
  '#qrl .cam video{width:100%;height:100%;object-fit:cover}' +
  '#qrl .cam::after{content:"";position:absolute;inset:14%;border:3px solid rgba(255,255,255,.85);border-radius:14px;box-shadow:0 0 0 999px rgba(0,0,0,.35)}' +
  '#qrl textarea{width:min(80vw,320px);height:70px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#f1ece2;font:12px monospace;padding:8px;-webkit-user-select:text;user-select:text}' +
  '#qrl .err{color:#ff9b8a;min-height:20px;font-size:13px}' +
  '#qrl p.detail{font-size:11px;opacity:.7;word-break:break-word;font-family:ui-monospace,monospace}' +
  '#qrl .code{font:800 54px/1 ui-monospace,monospace;letter-spacing:.18em;padding:6px 0 6px .18em;color:#fff}' +
  '#qrl .qr.small canvas{width:min(38vw,150px)}' +
  '#qrl input.codein{width:min(70vw,240px);font:800 34px/1 ui-monospace,monospace;letter-spacing:.3em;text-align:center;text-transform:uppercase;padding:12px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.07);color:#fff;-webkit-user-select:text;user-select:text}' +
  '#qrl button.link{background:none;min-width:0;padding:6px;color:#bdb6a8;font-weight:500;text-decoration:underline}' +
  '#qrl .spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.15);border-top-color:var(--qrl-acc,#e8a33a);animation:qrlspin .8s linear infinite}' +
  '@keyframes qrlspin{to{transform:rotate(360deg)}}';

  function el(tag, props, kids){
    var e = document.createElement(tag);
    if (props) for (var k in props){ if (k === 'text') e.textContent = props[k]; else if (k === 'cls') e.className = props[k]; else if (k.slice(0,2) === 'on') e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]); }
    (kids || []).forEach(function(c){ if (c) e.appendChild(c); });
    return e;
  }

  function drawQR(text){
    var q = window.qrcode(0, 'M'); q.addData(text, 'Byte'); q.make();
    var n = q.getModuleCount(), quiet = 2, scale = Math.max(4, Math.floor(600 / (n + quiet*2)));
    var c = document.createElement('canvas'); c.width = c.height = (n + quiet*2) * scale;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,c.width,c.height); g.fillStyle = '#000';
    for (var r=0;r<n;r++) for (var col=0;col<n;col++) if (q.isDark(r,col)) g.fillRect((col+quiet)*scale,(r+quiet)*scale,scale,scale);
    return c;
  }

  function copyText(t){
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(fallback);
    fallback(); return Promise.resolve();
    function fallback(){ var a = el('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch(e){} a.remove(); }
  }

  var ERRS = {
    notcode: "That isn't a link code.",
    otherapp: "That code is for a different game.",
    gotoffer: "That's a host code. Show this screen to the host instead.",
    gotanswer: "That's a reply code. Scan the host's code.",
    cam: "Can't use the camera. You can paste a code instead.",
    fail: "Couldn't connect. Make sure both phones are online, then try again.",
    nortc: "This browser has direct phone-to-phone connections (WebRTC) turned off, so it can't link up. Try Chrome, or turn WebRTC back on in the browser's settings.",
    make: "Couldn't make a link code on this phone. Try again; if it keeps happening, the details below say why."
  };
  // what failed, in a short line under the message (so a problem on one phone can be told apart from a network one)
  function why(step, e){ var m = e && (e.name && e.name !== 'Error' ? e.name + ': ' : '') + (e && e.message || String(e || '')); return step + (m ? ' · ' + m : ''); }

  function open(opts){
    opts = opts || {};
    var app = opts.app || 'game';
    var root, body, pc, dc, stream, scanTimer, finished = false, peer = null;

    if (!document.getElementById('qrl-css')){ var st = el('style', { id:'qrl-css' }); st.textContent = CSS; document.head.appendChild(st); }
    root = el('div', { id:'qrl' }); if (opts.accent) root.style.setProperty('--qrl-acc', opts.accent);
    document.body.appendChild(root);

    function screen(kids){ stopCam(); root.innerHTML = ''; kids.forEach(function(k){ if (k) root.appendChild(k); }); }
    function cancel(){ teardown(); if (opts.onCancel) opts.onCancel(); }
    function teardown(){
      stopCam();
      if (!finished){ try { if (dc) dc.close(); } catch(e){} try { if (pc) pc.close(); } catch(e){} }
      if (peer && !finished){ try { peer.destroy(); } catch(e){} peer = null; }
      if (root && root.parentNode) root.parentNode.removeChild(root);
    }
    function stopCam(){
      clearTimeout(scanTimer); scanTimer = null;
      if (stream){ stream.getTracks().forEach(function(t){ t.stop(); }); stream = null; }
    }
    function busy(msg){ screen([el('div',{cls:'spin'}), el('p',{text:msg}), el('button',{cls:'ghost', text:'Cancel', onclick:cancel})]); }

    // Asking for the camera up front also lets WebRTC share the phone's real
    // local address instead of a hidden one, which helps on the same Wi-Fi.
    function warmCamera(){
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(false);
      // with a time limit: a permission prompt that never gets answered (or never shows, inside a game frame) must not hang hosting
      return Promise.race([
        navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } })
          .then(function(s){ s.getTracks().forEach(function(t){ t.stop(); }); return true; })
          .catch(function(){ return false; }),
        new Promise(function(res){ setTimeout(function(){ res(false); }, 4000); })
      ]);
    }

    function newPeer(){
      var RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (!RTC){ var e = new Error('no RTCPeerConnection'); e.nortc = true; throw e; }
      try { pc = new RTC({ iceServers: ICE }); }
      catch (err){ pc = new RTC({ iceServers: [] }); }   // a browser that rejects one of the STUN entries: still link on the same Wi-Fi
      return pc;
    }

    function wire(channel, role){
      dc = channel;
      function ready(){
        if (finished) return; finished = true;
        var conn = makeConn(pc, dc); conn.role = role;
        teardown();
        if (opts.onConnected) opts.onConnected(conn, role);
      }
      if (dc.readyState === 'open') ready(); else dc.onopen = ready;
      pc.addEventListener('connectionstatechange', function(){
        if (!finished && pc.connectionState === 'failed') showError(ERRS.fail, why('linking', { message: 'the phones could not reach each other' }));
      });
    }

    function showError(msg, detail){
      screen([el('h2',{text:'Not connected'}), el('p',{text:msg}),
        detail ? el('p',{cls:'detail', text:detail}) : null,
        el('div',{cls:'row'},[ el('button',{text:'Try again', onclick:function(){ resetPeer(); start(); }}), el('button',{cls:'ghost', text:'Close', onclick:cancel}) ])]);
    }
    function resetPeer(){ try { if (pc) pc.close(); } catch(e){} pc = null; dc = null; }

    // Shows a code as a QR plus copy button; `next` is an optional follow-up button.
    function showCode(title, hint, code, next){
      QRLink.lastCode = code;   // read by automated tests
      var qr = el('div',{cls:'qr'},[el('div',{cls:'spin'})]);
      // the QR picture needs a small library; if it can't load, the code still works by Copy code (send it in a chat)
      loadLib('qrcode.min.js', 'qrcode').then(function(){ qr.innerHTML = ''; qr.appendChild(drawQR(code)); })
        .catch(function(){ qr.innerHTML = ''; qr.appendChild(el('p',{cls:'detail', text:"Couldn't draw the QR picture. Use Copy code and send it to the other phone."})); });
      screen([
        el('h2',{text:title}), el('p',{text:hint}),
        qr,
        el('div',{cls:'row'},[
          next || null,
          el('button',{cls:'ghost', text:'Copy code', onclick:function(e){ var b=e.currentTarget; copyText(code).then(function(){ b.textContent='Copied'; setTimeout(function(){ b.textContent='Copy code'; },1500); }); }}),
        ]),
        el('button',{cls:'ghost', text:'Cancel', onclick:cancel})
      ]);
    }

    // Camera scanner with a paste box underneath. onCode(text) returns an error key or null.
    function scan(title, hint, onCode){
      var err = el('div',{cls:'err'});
      var video = el('video',{ playsinline:'', muted:'', autoplay:'' });
      var box = el('textarea',{ placeholder:'…or paste a code here' });
      function tryCode(t){
        var bad = onCode(t);
        if (bad){ err.textContent = ERRS[bad] || ERRS.notcode; return false; }
        return true;
      }
      screen([
        el('h2',{text:title}), el('p',{text:hint}),
        el('div',{cls:'cam'},[video]), err, box,
        el('div',{cls:'row'},[
          el('button',{text:'Use pasted code', onclick:function(){ tryCode(box.value); }}),
          el('button',{cls:'ghost', text:'Cancel', onclick:cancel})
        ])
      ]);
      var lastBad = '';
      var detector = null;
      try { if ('BarcodeDetector' in window) detector = new window.BarcodeDetector({ formats:['qr_code'] }); } catch(e){ detector = null; }
      var cnv = document.createElement('canvas'), g = cnv.getContext('2d', { willReadFrequently:true });
      function tick(){
        if (!stream) return;
        if (video.readyState >= 2 && video.videoWidth){
          var p;
          if (detector){
            p = detector.detect(video).then(function(r){ return r && r[0] ? r[0].rawValue : null; }).catch(function(){ detector = null; return null; });
          } else if (window.jsQR){
            var w = video.videoWidth, h = video.videoHeight, k = Math.min(1, 640 / Math.max(w, h));
            cnv.width = Math.round(w*k); cnv.height = Math.round(h*k);
            g.drawImage(video, 0, 0, cnv.width, cnv.height);
            var img = g.getImageData(0, 0, cnv.width, cnv.height);
            var r = window.jsQR(img.data, img.width, img.height, { inversionAttempts:'dontInvert' });
            p = Promise.resolve(r ? r.data : null);
          } else p = Promise.resolve(null);
          p.then(function(text){
            if (!stream) return;
            if (text && text !== lastBad){
              if (tryCode(text)) return;   // handled, the screen has moved on
              lastBad = text;
            }
            scanTimer = setTimeout(tick, 120);
          });
          return;
        }
        scanTimer = setTimeout(tick, 120);
      }
      var libReady = loadLib('jsQR.min.js', 'jsQR').catch(function(){});
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ err.textContent = ERRS.cam; return; }
      navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment', width:{ ideal:1280 }, height:{ ideal:720 } } }).then(function(s){
        if (!root.parentNode || video.parentNode === null){ s.getTracks().forEach(function(t){ t.stop(); }); return; }
        stream = s; video.srcObject = s;
        var pl = video.play(); if (pl && pl.catch) pl.catch(function(){});
        libReady.then(tick);
      }).catch(function(){ err.textContent = ERRS.cam; });
    }

    // ---- host ----
    function host(){
      busy('Making your code…');
      var step = 'camera';
      warmCamera().then(function(){
        step = 'connection'; newPeer();
        wire(pc.createDataChannel('game', { ordered:true }), 'host');
        step = 'offer'; return pc.createOffer();
      }).then(function(o){ step = 'offer'; return pc.setLocalDescription(o); })
        .then(function(){ step = 'addresses'; return gathered(pc); })
        .then(function(){ step = 'code'; return encode(app, 'o', pc.localDescription.sdp); })
        .then(function(code){
          showCode('Your code', 'Have the other player scan this, then scan the code they show you.', code,
            el('button',{text:'Scan their code', onclick:scanAnswer}));
        }).catch(function(e){ console.error(e); showError(e && e.nortc ? ERRS.nortc : ERRS.make, why(step, e)); });
    }
    function scanAnswer(){
      scan('Scan their code', 'Point your camera at the code on the other phone.', function(text){
        var desc; try { desc = decode(app, 'a', text); } catch(e){ return e.message; }
        busy('Connecting…');
        pc.setRemoteDescription(desc).catch(function(e){ console.error(e); showError(ERRS.fail, why('their code', e)); });
        timeoutGuard();
        return null;
      });
    }

    // ---- guest ----
    function join(){
      scan('Scan the host’s code', 'Point your camera at the code on the host’s phone.', function(text){
        var desc; try { desc = decode(app, 'o', text); } catch(e){ return e.message; }
        busy('Making your reply…');
        var step = 'camera';
        warmCamera().then(function(){
          step = 'connection'; newPeer();
          pc.ondatachannel = function(e){ wire(e.channel, 'guest'); };
          step = 'their code'; return pc.setRemoteDescription(desc);
        }).then(function(){ step = 'reply'; return pc.createAnswer(); })
          .then(function(a){ return pc.setLocalDescription(a); })
          .then(function(){ step = 'addresses'; return gathered(pc); })
          .then(function(){
            if (finished) return;
            step = 'code';
            showCode('Show this to the host', 'The game starts once they scan it.', encode(app, 'a', pc.localDescription.sdp), null);
            timeoutGuard(90000);
          }).catch(function(e){ console.error(e); showError(e && e.nortc ? ERRS.nortc : ERRS.fail, why(step, e)); });
        return null;
      });
    }

    function timeoutGuard(ms){
      var mine = pc;
      setTimeout(function(){ if (!finished && pc === mine && root.parentNode) showError(ERRS.fail, why('linking', { message: 'no answer in ' + Math.round((ms || 20000) / 1000) + ' s (' + (pc && pc.iceConnectionState) + ')' })); }, ms || 20000);
    }

    // ---- quick link: a room code ----
    var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L: easy to read out and type
    function makeCode(){ var c = ''; var r = new Uint8Array(4); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach(function(_, i){ r[i] = Math.random() * 256; }); for (var i = 0; i < 4; i++) c += CODE_CHARS[r[i] % CODE_CHARS.length]; return c; }
    function peerId(code){ return 'pplink-' + String(app).toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + code.toLowerCase(); }
    function cleanCode(t){ var m = /^PPL2\|([^|]+)\|([A-Za-z0-9]{4})$/.exec(String(t || '').trim()); if (m) return m[1] === app ? m[2].toUpperCase() : 'otherapp'; return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }
    function freshPeer(id){
      try { if (peer) peer.destroy(); } catch(e){}
      var P = window.Peer, cfg = Object.assign({ config: { iceServers: ICE }, debug: 0 }, window.QRLinkBroker || {});   // (QRLinkBroker: { host, port, path, secure } for a self-hosted broker or tests)
      peer = id ? new P(id, cfg) : new P(cfg);
      return peer;
    }
    function linked(c, role){   // a PeerJS DataConnection opened: wrap its own channel, let the broker go
      if (finished) return;
      if (!c.dataChannel || !c.peerConnection) { quickFail({ message: 'no data channel' }); return; }
      finished = true; pc = c.peerConnection; dc = c.dataChannel;
      var conn = makeConn(pc, dc); conn.role = role;
      var pr = peer; peer = null; setTimeout(function(){ try { pr.disconnect(); } catch(e){} }, 1500);   // the link is direct now; keep it, drop the broker
      teardown();
      if (opts.onConnected) opts.onConnected(conn, role);
    }
    function quickFail(e){
      try { if (peer) peer.destroy(); } catch(err){} peer = null;
      if (!root.parentNode || finished) return;
      screen([el('h2',{text:'Not connected'}),
        el('p',{text:"Couldn't reach the link service. Check the internet on this phone and try again, or link with QR codes (that needs no internet)."}),
        el('p',{cls:'detail', text: why('code link', e)}),
        el('div',{cls:'row'},[ el('button',{text:'Try again', onclick:start}), el('button',{cls:'ghost', text:'Use QR codes', onclick:qrStart}) ]),
        el('button',{cls:'ghost', text:'Close', onclick:cancel})]);
    }
    function quickHost(){
      busy('Getting a room code…');
      var tries = 0;
      loadLib('peerjs.min.js', 'Peer').then(function next(){
        if (!root.parentNode || finished) return;
        var code = makeCode(), p = freshPeer(peerId(code)), shown = false;
        p.on('open', function(){
          if (p !== peer) return; shown = true;
          var qr = el('div',{cls:'qr small'});
          loadLib('qrcode.min.js', 'qrcode').then(function(){ qr.appendChild(drawQR('PPL2|' + app + '|' + code)); }).catch(function(){ qr.style.display = 'none'; });
          screen([el('h2',{text:'Your room code'}), el('div',{cls:'code', text:code}),
            el('p',{text:'On the other phone, tap Join and type this code, or scan it.'}), qr,
            el('div',{cls:'spin'}), el('p',{text:'Waiting for the other player…'}),
            el('button',{cls:'ghost', text:'Cancel', onclick:cancel})]);
        });
        p.on('connection', function(c){ if (c.open) linked(c, 'host'); else c.on('open', function(){ linked(c, 'host'); }); });
        p.on('error', function(e){
          if (p !== peer) return;
          if (e && e.type === 'unavailable-id' && ++tries < 5) { next(); return; }   // that code is taken right now: another one
          if (!shown || (e && /network|server-error|socket|disconnected/.test(e.type || ''))) quickFail(e);
        });
        setTimeout(function(){ if (p === peer && !shown && !finished) quickFail({ message: 'no answer from the link service in 10 s' }); }, 10000);
      }).catch(function(e){ quickFail(e); });
    }
    function quickJoin(errText){
      var box = el('input',{ cls:'codein', maxlength:'4', autocomplete:'off', autocapitalize:'characters', spellcheck:'false', placeholder:'CODE', 'aria-label':'Room code' });
      var err = el('div',{cls:'err', text: errText || ''});
      function go(){
        var code = cleanCode(box.value);
        if (code === 'otherapp') { err.textContent = ERRS.otherapp; return; }
        if (code.length !== 4) { err.textContent = 'The room code has 4 letters.'; return; }
        joinCode(code);
      }
      box.addEventListener('input', function(){ var v = cleanCode(box.value); if (v !== 'otherapp' && v !== box.value) box.value = v; err.textContent = ''; if (v.length === 4) go(); });
      box.addEventListener('keydown', function(e){ if (e.key === 'Enter') go(); });
      screen([el('h2',{text:'Join'}), el('p',{text:'Type the room code shown on the host’s phone.'}), box, err,
        el('div',{cls:'row'},[ el('button',{text:'Join', onclick:go}), el('button',{cls:'ghost', text:'Scan code', onclick:scanRoom}) ]),
        el('button',{cls:'ghost', text:'Back', onclick:start})]);
      setTimeout(function(){ try { box.focus(); } catch(e){} }, 50);
    }
    function scanRoom(){
      scan('Scan the room code', 'Point your camera at the code on the host’s phone.', function(text){
        var code = cleanCode(text);
        if (code === 'otherapp') return 'otherapp';
        if (code.length !== 4) return 'notcode';
        joinCode(code); return null;
      });
    }
    function joinCode(code){
      busy('Joining ' + code + '…');
      loadLib('peerjs.min.js', 'Peer').then(function(){
        if (!root.parentNode || finished) return;
        var p = freshPeer(null), asked = false;
        p.on('open', function(){
          if (p !== peer) return; asked = true;
          var c = p.connect(peerId(code), { reliable: true, serialization: 'raw' });
          c.on('open', function(){ linked(c, 'guest'); });
        });
        p.on('error', function(e){
          if (p !== peer) return;
          if (e && e.type === 'peer-unavailable') { try { p.destroy(); } catch(err){} peer = null; quickJoin('No game with code ' + code + '. Check the code on the host’s phone.'); return; }
          quickFail(e);
        });
        setTimeout(function(){ if (p === peer && !finished) quickFail({ message: asked ? 'the host did not answer in 15 s' : 'no answer from the link service in 15 s' }); }, 15000);
      }).catch(function(e){ quickFail(e); });
    }

    // ---- the two-QR flow, with no internet ----
    function qrStart(){
      try { if (peer) peer.destroy(); } catch(e){} peer = null;
      screen([
        el('h2',{text:'Link with QR codes'}),
        el('p',{text:'Works with no internet (on the same Wi-Fi, or close by). You’ll scan each other’s codes.'}),
        el('div',{cls:'row'},[
          el('button',{text: opts.hostLabel || 'Host', onclick:host}),
          el('button',{text: opts.joinLabel || 'Join', onclick:join})
        ]),
        el('button',{cls:'ghost', text:'Back', onclick:start})
      ]);
    }

    function start(){
      resetPeer();
      try { if (peer) peer.destroy(); } catch(e){} peer = null;
      screen([
        el('h2',{text: opts.title || 'Play together'}),
        el('p',{text: opts.hint || 'One phone hosts and gets a 4-letter code; the other joins with it.'}),
        el('div',{cls:'row'},[
          el('button',{text: opts.hostLabel || 'Host', onclick:quickHost}),
          el('button',{text: opts.joinLabel || 'Join', onclick:function(){ quickJoin(); }})
        ]),
        el('button',{cls:'link', text:'No internet? Use QR codes', onclick:qrStart}),
        el('button',{cls:'ghost', text:'Back', onclick:cancel})
      ]);
    }
    start();
    return { close: cancel };
  }

  window.QRLink = { open: open, _encode: encode, _decode: decode };
})();
