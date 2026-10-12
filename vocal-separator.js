/* Vocal separator for the player. Models live on Hugging Face, app lives on GitHub.
   1) Set HF_BASE below.  2) Add <script src="./vocal-separator.js" defer></script> before </body> in index.html. */
(() => {
  const HF_BASE = 'https://huggingface.co/Myman577/Splitter/resolve/main/'; // <-- CHANGE THIS
  const FILES = { vocals: 'spleeter-vocals.onnx', accomp: 'spleeter-accompaniment.onnx' };
  const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const SR = 44100, N = 4096, HOP = 1024, T = 512, F = 1024, BINS = N / 2 + 1, PAD = N - HOP;

  // ---------- model storage (own IndexedDB, survives sw.js cache cleanup) ----------
  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open('ppSpleeterDB', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('models');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const idbGet = async k => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('models').objectStore('models').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); };
  const idbPut = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('models', 'readwrite'); tx.objectStore('models').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };

  async function fetchModel(name, onProgress) {
    const r = await fetch(HF_BASE + FILES[name], { mode: 'cors' });
    if (!r.ok) throw new Error('Model download failed (' + r.status + '). Is the HF repo public and HF_BASE correct?');
    const total = +r.headers.get('content-length') || 0, chunks = []; let got = 0;
    const rd = r.body.getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onProgress && onProgress(got, total); }
    const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
    await idbPut(name, out.buffer);
    return out.buffer;
  }
  const haveModels = async () => (await idbGet('vocals')) && (await idbGet('accomp'));

  // ---------- DSP ----------
  const cosT = new Float32Array(N / 2), sinT = new Float32Array(N / 2), rev = new Uint16Array(N);
  for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = -Math.sin(2 * Math.PI * i / N); }
  for (let i = 0, b = Math.log2(N); i < N; i++) { let r = 0; for (let j = 0; j < b; j++) r |= ((i >> j) & 1) << (b - 1 - j); rev[i] = r; }
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); // periodic Hann
  function fft(re, im) {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let s = 0; s < N; s += size) for (let k = 0, w = 0; k < half; k++, w += step) {
        const a = s + k, b = a + half, wr = cosT[w], wi = sinT[w];
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  const tick = () => new Promise(r => setTimeout(r));

  // pcm: [L, R] Float32Array at 44.1k. Returns {vocals:[L,R], accomp:[L,R]}
  async function separate(pcm, sessions, onProgress) {
    const len = pcm[0].length;
    let L = PAD + len + PAD; L += (HOP - ((L - N) % HOP)) % HOP;
    const nFrames = (L - N) / HOP + 1, nSeg = Math.ceil(nFrames / T);
    const sig = pcm.map(c => { const a = new Float32Array(L); a.set(c, PAD); return a; });
    const outV = [new Float32Array(L), new Float32Array(L)], outA = [new Float32Array(L), new Float32Array(L)];
    const re = new Float32Array(N), im = new Float32Array(N);
    const specRe = [new Float32Array(T * BINS), new Float32Array(T * BINS)], specIm = [new Float32Array(T * BINS), new Float32Array(T * BINS)];
    const x = new Float32Array(2 * T * F);
    for (let s = 0; s < nSeg; s++) {
      x.fill(0); specRe.forEach(a => a.fill(0)); specIm.forEach(a => a.fill(0));
      for (let c = 0; c < 2; c++) for (let t = 0; t < T; t++) {
        const fr = s * T + t; if (fr >= nFrames) break;
        const off = fr * HOP;
        for (let i = 0; i < N; i++) { re[i] = sig[c][off + i] * win[i]; im[i] = 0; }
        fft(re, im);
        for (let k = 0; k < BINS; k++) { specRe[c][t * BINS + k] = re[k]; specIm[c][t * BINS + k] = im[k]; }
        for (let k = 0; k < F; k++) x[c * T * F + t * F + k] = Math.hypot(re[k], im[k]);
      }
      const feed = { x: new ort.Tensor('float32', x, [2, 1, T, F]) };
      const V = (await sessions.vocals.run(feed)).y.data;
      await tick();
      const A = sessions.accomp ? (await sessions.accomp.run(feed)).y.data : null;
      for (let c = 0; c < 2; c++) for (let t = 0; t < T; t++) {
        const fr = s * T + t; if (fr >= nFrames) break;
        const m = new Float32Array(BINS), base = c * T * F + t * F;
        for (let k = 0; k < F; k++) {
          if (A) { const v2 = V[base + k] ** 2, a2 = A[base + k] ** 2; m[k] = (v2 + 5e-11) / (v2 + a2 + 1e-10); }
          else m[k] = Math.min(1, V[base + k] / Math.max(x[base + k], 1e-9));
        }
        let avg = 0; for (let k = F - 64; k < F; k++) avg += m[k]; avg /= 64;
        for (let k = F; k < BINS; k++) m[k] = avg;           // Spleeter zeroes >11kHz; hold the mask instead
        for (let pass = 0; pass < 2; pass++) {
          const out = pass ? outA : outV;
          for (let k = 0; k < BINS; k++) {
            const g = pass ? 1 - m[k] : m[k], r = specRe[c][t * BINS + k] * g, i = specIm[c][t * BINS + k] * g;
            re[k] = r; im[k] = -i;                            // conj for inverse-via-forward
            if (k > 0 && k < N / 2) { re[N - k] = r; im[N - k] = i; }
          }
          fft(re, im);
          const off = fr * HOP, o = out[c];
          for (let i = 0; i < N; i++) o[off + i] += (re[i] / N) * win[i] / 1.5;
        }
      }
      onProgress && onProgress((s + 1) / nSeg);
      await tick();
    }
    const cut = a => a.subarray(PAD, PAD + len);
    return { vocals: outV.map(cut), accomp: outA.map(cut) };
  }

  // ---------- audio in/out ----------
  async function decode(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
    const ab = await ctx.decodeAudioData(buf); ctx.close && ctx.close();
    const l = ab.getChannelData(0), r = ab.numberOfChannels > 1 ? ab.getChannelData(1) : l;
    return [Float32Array.from(l), Float32Array.from(r)];
  }
  const i16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 32768 : v * 32767; } return o; };
  function encode(ch) {
    const l = i16(ch[0]), r = i16(ch[1]);
    if (window.lamejs) {
      const enc = new lamejs.Mp3Encoder(2, SR, 192), parts = [];
      for (let i = 0; i < l.length; i += 1152) { const b = enc.encodeBuffer(l.subarray(i, i + 1152), r.subarray(i, i + 1152)); if (b.length) parts.push(new Uint8Array(b)); }
      const e = enc.flush(); if (e.length) parts.push(new Uint8Array(e));
      return { blob: new Blob(parts, { type: 'audio/mpeg' }), ext: 'mp3' };
    }
    const n = l.length, dv = new DataView(new ArrayBuffer(44 + n * 4)); const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, l[i], true); dv.setInt16(46 + i * 4, r[i], true); }
    return { blob: new Blob([dv], { type: 'audio/wav' }), ext: 'wav' };
  }
  function addToLibrary(files) {
    const inp = document.getElementById('file-input'); if (!inp) throw new Error('file-input not found');
    const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- runtime ----------
  let sessions = null;
  const loadOrt = () => window.ort ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = ORT + 'ort.wasm.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load onnxruntime-web'));
    document.head.appendChild(s);
  });
  async function getSessions(status) {
    if (sessions) return sessions;
    await loadOrt();
    ort.env.wasm.wasmPaths = ORT; ort.env.wasm.numThreads = 1;
    const mk = async n => ort.InferenceSession.create(new Uint8Array(await idbGet(n)), { executionProviders: ['wasm'] });
    status('Loading models…');
    sessions = { vocals: await mk('vocals'), accomp: await mk('accomp') };
    return sessions;
  }
  async function downloadModels(status) {
    for (const n of Object.keys(FILES)) {
      if (await idbGet(n)) continue;
      await fetchModel(n, (g, t) => status('Downloading ' + FILES[n] + ' ' + (t ? Math.round(g / t * 100) + '%' : (g / 1048576 | 0) + ' MB')));
    }
  }

  // ---------- UI ----------
  function ui() {
    const css = document.createElement('style');
    css.textContent = '#ppv-btn{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99998;width:42px;height:42px;border-radius:50%;border:1px solid #888;background:#1b1c20;color:#fff;font-size:20px}#ppv-panel{position:fixed;left:12px;bottom:calc(62px + env(safe-area-inset-bottom,0px));z-index:99998;width:min(300px,calc(100vw - 24px));padding:12px;border-radius:12px;background:#1b1c20;color:#eee;font:13px system-ui,sans-serif;display:none;box-shadow:0 6px 24px #0008}#ppv-panel button{width:100%;margin-top:8px;padding:9px;border-radius:8px;border:0;background:#7c3aed;color:#fff;font:600 13px system-ui}#ppv-panel button:disabled{opacity:.5}#ppv-bar{height:6px;background:#333;border-radius:3px;margin-top:8px}#ppv-bar i{display:block;height:100%;width:0;background:#7c3aed;border-radius:3px}';
    document.head.appendChild(css);
    const b = document.createElement('button'); b.id = 'ppv-btn'; b.textContent = '🎤'; b.title = 'Vocal separator';
    const p = document.createElement('div'); p.id = 'ppv-panel';
    p.innerHTML = '<b>Vocal separator</b><div id="ppv-st" style="margin-top:6px;opacity:.8">Ready</div><div id="ppv-bar"><i></i></div><button id="ppv-go">Split current track</button>';
    document.body.append(b, p);
    const st = p.querySelector('#ppv-st'), bar = p.querySelector('#ppv-bar i'), go = p.querySelector('#ppv-go');
    const status = t => st.textContent = t;
    b.onclick = async () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; if (!(await haveModels())) status('Models not downloaded yet (~80 MB, one time).'); };
    go.onclick = async () => {
      go.disabled = true; bar.style.width = '0';
      try {
        const A = window.__ppApi, t = A && A.tracks()[A.currentIndex()];
        if (!t) throw new Error('Play or select a track first.');
        await downloadModels(status);
        const s = await getSessions(status);
        status('Decoding audio…');
        const pcm = await decode(t.url);
        const res = await separate(pcm, s, f => { bar.style.width = (f * 100) + '%'; status('Separating… ' + Math.round(f * 100) + '%'); });
        status('Encoding…'); await tick();
        const v = encode(res.vocals), a = encode(res.accomp);
        addToLibrary([new File([a.blob], t.title + ' (Instrumental).' + a.ext, { type: a.blob.type }), new File([v.blob], t.title + ' (Vocals).' + v.ext, { type: v.blob.type })]);
        status('Done. Added Instrumental + Vocals to your library.');
      } catch (e) { console.error(e); status('Error: ' + e.message); }
      go.disabled = false;
    };
  }
  window.PPVocals = { separate, fft, _N: N };
  if (typeof document !== 'undefined' && document.body) ui();
  else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', ui);
})();
