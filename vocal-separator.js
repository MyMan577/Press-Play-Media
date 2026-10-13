/* Stem separator + smart tagger + Whisper lyrics for the player.
   Tagger extras: BPM, key, mood heads (public Essentia ONNX, optional checkbox), saved tags, search, smart playlists, auto-EQ, more-like-this.
   Lyrics: Whisper via transformers.js (needs internet the first time).
   Stem separator for the player. Models live on Hugging Face, app lives on GitHub.
   1) Set HF_BASE.  2) Upload the model files (names in MODELS below) to that repo.
   3) <script src="./vocal-separator.js" defer></script> before </body> in index.html. */
(() => {
  const HF_BASE = 'https://huggingface.co/Myman577/Splitter/resolve/main/';
  const SP4 = 'https://huggingface.co/Best-Practice/spleeter-4stems-onnx/resolve/main/';   // fallback host if a 4-stem file isn't in HF_BASE
  const MODELS = {
    spleeter2: { label: 'Fast · 2 stems (~80 MB)', kind: 'spleeter', files: { vocals: 'spleeter-vocals.onnx', accomp: 'spleeter-accompaniment.onnx' }, sources: [] },
    spleeter4: { label: 'Spleeter · 4 stems (~79 MB)', kind: 'sp4', files: { vocals: 'vocals.fp16.onnx', drums: 'drums.fp16.onnx', bass: 'bass.fp16.onnx', other: 'other.fp16.onnx' }, sources: ['vocals', 'drums', 'bass', 'other'] },
    mdx_voc:   { label: 'Cleaner vocals · MDX-Net (~67 MB)', kind: 'mdx', file: 'UVR-MDX-NET-Voc_FT.onnx', sources: [], nfft: 7680, dimF: 3072, comp: 1.021 },
    demucs4:   { label: 'Best · 4 stems (316 MB)', kind: 'demucs', file: 'htdemucs.onnx',    sources: ['drums', 'bass', 'other', 'vocals'] },
    demucs6:   { label: '6 stems + guitar/piano (~316 MB)', kind: 'demucs', file: 'htdemucs_6s.onnx', sources: ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'] }
  };
  const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const SR = 44100, N = 4096, HOP = 1024, T = 512, F = 1024, BINS = N / 2 + 1, PAD = N - HOP, DEMUCS_SEG = 343980, CTX = 64;
  const cap = w => w[0].toUpperCase() + w.slice(1);
  // Optimization levels, each one includes the one below it. [0] = off.
  //  1 Light  : the big RAM hogs only (CPU only, low-RAM download, basic graph optimization)
  //  2 Medium : + lean ONNX runtime, pauses between chunks, skip work for stems you didn't tick
  //  3 Max    : + longer pauses, UI yields inside the DSP loops, screen wake lock
  const LEVELS = [null,
    { name: 'Light', info: 'Big savings only: CPU only, low-RAM model download, basic graph optimization.', blob: true, lean: false, pause: [0, 0], skip: false, ye: 0, wake: false },
    { name: 'Medium', info: 'Light + lean runtime memory settings, short pauses between chunks, skips unused stems.', blob: true, lean: true, pause: [80, 150], skip: true, ye: 0, wake: false },
    { name: 'Max', info: 'Medium + longer pauses, UI yields inside heavy loops, keeps the screen awake. Slowest, safest.', blob: true, lean: true, pause: [250, 400], skip: true, ye: 64, wake: true }
  ];

  // ---------- model storage (own IndexedDB, survives sw.js cache cleanup) ----------
  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open('ppSpleeterDB', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('models');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const idbGet = async k => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('models').objectStore('models').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); };
  const idbPut = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('models', 'readwrite'); tx.objectStore('models').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  const idbDel = async k => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('models', 'readwrite'); tx.objectStore('models').delete(k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  // [storage key, file name] pairs a model needs
  const parts = id => { const m = MODELS[id]; return m.kind === 'spleeter' ? Object.entries(m.files).map(([k, f]) => ['sp_' + k, f]) : m.kind === 'sp4' ? Object.entries(m.files).map(([k, f]) => ['sp4_' + k, f]) : [[id, m.file]]; };
  const legacyKey = k => k.replace('sp_', '');                      // v1 stored spleeter files as 'vocals'/'accomp'
  const getPart = async k => { const v = (await idbGet(k)) || (k.startsWith('sp_') ? await idbGet(legacyKey(k)) : null); return v instanceof Blob ? v.arrayBuffer() : v; };

  async function fetchPart(key, file, onProgress, low) {
    const abs = /^https?:/.test(file), alt = !abs && /^(vocals|drums|bass|other)(\.fp16)?\.onnx$/.test(file) ? SP4 + file : null;
    let r = await fetch(abs ? file : HF_BASE + file, { mode: 'cors' }).catch(e => { if (!alt) throw e; return { ok: false }; });
    if (!r.ok && alt) r = await fetch(alt, { mode: 'cors' });
    if (!r.ok) throw new Error('Download failed (' + r.status + ') for ' + file + '. Is it uploaded to the public HF repo?');
    const total = +r.headers.get('content-length') || 0, rd = r.body.getReader();
    if (low) {                                                       // chunks -> Blob: IndexedDB keeps it on disk instead of cloning 316 MB of RAM
      const bl = []; let n = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; bl.push(value); n += value.length; onProgress && onProgress(n, total); }
      await idbPut(key, new Blob(bl)); return;
    }
    let out = total ? new Uint8Array(total) : null, chunks = [], got = 0;   // preallocate: avoids a 2x memory spike on the 316 MB files
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      if (out && got + value.length <= out.length) out.set(value, got); else { if (out) { chunks.push(out.subarray(0, got)); out = null; } chunks.push(value); }
      got += value.length; onProgress && onProgress(got, total);
    }
    if (!out) { out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } }
    await idbPut(key, out.buffer);
  }

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

  // pcm: [L, R] Float32Array at 44.1k. Finished audio is streamed to sink(vocals:[L,R], accomp:[L,R], startSample) one
  // segment at a time, so peak RAM stays flat. Without a sink it collects everything and returns {vocals, accomp}.
  // o.ctx   : frames of context the model sees on each side of a segment but doesn't keep (hides the seams between segments)
  // o.shift : also run a copy of the audio delayed by this many samples and average both (cuts artifacts, ~2x time)
  async function separate(pcm, sessions, onProgress, sharp = 1, sink, o = {}) {
    const { pause = 0, need = null, ye = 0, ctx = 0, shift = 0 } = o;
    const len = pcm[0].length, D = shift, Te = T - 2 * ctx, passes = D ? [0, D] : [0], np = passes.length;
    let L = PAD + len + PAD + D; L += (HOP - ((L - N) % HOP)) % HOP;
    const nFrames = (L - N) / HOP + 1, SEG = Te * HOP, RB = SEG + N + D;
    const nSeg = Math.max(Math.ceil(nFrames / Te), Math.ceil((PAD + len + D) / SEG));
    let full = null;
    if (!sink) {
      full = { vocals: [new Float32Array(len), new Float32Array(len)], accomp: [new Float32Array(len), new Float32Array(len)] };
      sink = (v, a, at) => { for (let c = 0; c < 2; c++) { full.vocals[c].set(v[c], at); full.accomp[c].set(a[c], at); } };
    }
    const outV = [new Float32Array(RB), new Float32Array(RB)], outA = [new Float32Array(RB), new Float32Array(RB)];   // rolling: index 0 = padded sample s*SEG - D
    const re = new Float32Array(N), im = new Float32Array(N), m = new Float32Array(BINS);
    const specRe = [new Float32Array(T * BINS), new Float32Array(T * BINS)], specIm = [new Float32Array(T * BINS), new Float32Array(T * BINS)];
    const x = new Float32Array(2 * T * F);
    for (let s = 0; s < nSeg; s++) {
      const fr0 = s * Te - ctx;
      if (s * Te < nFrames) for (let pi = 0; pi < np; pi++) {
        const sh = passes[pi];
        x.fill(0); specRe.forEach(a => a.fill(0)); specIm.forEach(a => a.fill(0));
        for (let c = 0; c < 2; c++) for (let t = 0; t < T; t++) {
          const fr = fr0 + t; if (fr < 0) continue; if (fr >= nFrames) break;
          const o0 = fr * HOP - PAD - sh, src = pcm[c];
          for (let i = 0; i < N; i++) { const j = o0 + i; re[i] = (j >= 0 && j < len ? src[j] : 0) * win[i]; im[i] = 0; }
          fft(re, im);
          for (let k = 0; k < BINS; k++) { specRe[c][t * BINS + k] = re[k]; specIm[c][t * BINS + k] = im[k]; }
          for (let k = 0; k < F; k++) x[c * T * F + t * F + k] = Math.hypot(re[k], im[k]);
          if (ye && (t + 1) % ye === 0) await tick();
        }
        const feed = { x: new ort.Tensor('float32', x, [2, 1, T, F]) };
        const V = (await sessions.vocals.run(feed)).y.data;
        await tick();
        const A = sessions.accomp ? (await sessions.accomp.run(feed)).y.data : null;
        for (let c = 0; c < 2; c++) for (let t = ctx; t < T - ctx; t++) {      // only the centre frames are kept
          const fr = fr0 + t; if (fr >= nFrames) break;
          const base = c * T * F + t * F;
          for (let k = 0; k < F; k++) {
            if (A) { const v2 = V[base + k] ** 2, a2 = A[base + k] ** 2; m[k] = (v2 + 5e-11) / (v2 + a2 + 1e-10); }
            else m[k] = Math.min(1, V[base + k] / Math.max(x[base + k], 1e-9));
          }
          if (sharp !== 1) for (let k = 0; k < F; k++) { const a = Math.pow(m[k], sharp), b = Math.pow(1 - m[k], sharp); m[k] = a / (a + b + 1e-12); } // sharpen: less bleed, more artifacts
          let avg = 0; for (let k = F - 64; k < F; k++) avg += m[k]; avg /= 64;
          for (let k = F; k < BINS; k++) m[k] = avg;           // Spleeter zeroes >11kHz; hold the mask instead
          for (let pass = 0; pass < 2; pass++) {
            if (need && !(pass ? need.a : need.v)) continue;     // stem not requested: skip its inverse FFT
            const out = pass ? outA : outV;
            for (let k = 0; k < BINS; k++) {
              const g = pass ? 1 - m[k] : m[k], r = specRe[c][t * BINS + k] * g, i = specIm[c][t * BINS + k] * g;
              re[k] = r; im[k] = -i;                            // conj for inverse-via-forward
              if (k > 0 && k < N / 2) { re[N - k] = r; im[N - k] = i; }
            }
            fft(re, im);
            const bo = (t - ctx) * HOP + D - sh, ob = out[c];     // the delayed pass is written back at its true position
            for (let i = 0; i < N; i++) ob[bo + i] += (re[i] / N) * win[i] / 1.5;
          }
          if (ye && (t + 1) % ye === 0) await tick();
        }
        onProgress && onProgress(Math.min(1, (s * np + pi + 1) / (nSeg * np)));
        await tick(); if (pause) await new Promise(r => setTimeout(r, pause));
      }
      // buffer index 0 = padded sample s*SEG - D; everything before index SEG is final now. Hand it off, then slide.
      const a = Math.max(0, s * SEG - D - PAD), b = Math.min(len, (s + 1) * SEG - D - PAD);
      if (b > a) {
        const bs = a + PAD + D - s * SEG, sc = 1 / np, cut = ob => { const r = ob.slice(bs, bs + b - a); if (np > 1) for (let i = 0; i < r.length; i++) r[i] *= sc; return r; };
        sink(outV.map(cut), outA.map(cut), a);
      }
      for (const ob of outV.concat(outA)) { ob.copyWithin(0, SEG, RB); ob.fill(0, RB - SEG); }
    }
    onProgress && onProgress(1);
    return full;
  }

  // ---------- audio in/out ----------
  async function decode(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
    const ab = await ctx.decodeAudioData(buf); ctx.close && ctx.close();
    const l = ab.getChannelData(0), r = ab.numberOfChannels > 1 ? ab.getChannelData(1) : l;
    return [l, r];                                                       // views into the AudioBuffer, no extra copy
  }
  const i16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 32768 : v * 32767; } return o; };
  // Mutes the gaps between sung lines. Follows the vocal level, compares it with a slowly decaying recent peak,
  // and fades the stem down while it stays far below that peak. Keeps its state across chunks; edits chunks in place.
  const GATES = [null, { thr: 0.02, floor: 0.1 }, { thr: 0.05, floor: 0.03 }, { thr: 0.1, floor: 0 }];   // Gentle, Normal, Strong
  function makeGate(level) {
    const g = GATES[level]; if (!g) return null;
    const k = ms => 1 - Math.exp(-1 / (ms / 1000 * SR)), kEnvA = k(1), kEnvR = k(50), kGainA = k(4), kGainR = k(120), refDecay = Math.pow(0.5, 1 / (15 * SR)), holdN = Math.round(0.15 * SR);
    let env = 0, ref = 0, gain = 1, hold = 0;
    return {
      process(Lc, Rc) {
        for (let i = 0; i < Lc.length; i++) {
          const a = Math.max(Math.abs(Lc[i]), Math.abs(Rc[i]));
          env += (a - env) * (a > env ? kEnvA : kEnvR);
          ref = Math.max(env, ref * refDecay);
          if (env >= g.thr * ref) hold = holdN; else if (hold > 0) hold--;
          const target = hold > 0 ? 1 : g.floor;
          gain += (target - gain) * (target > gain ? kGainA : kGainR);
          Lc[i] *= gain; Rc[i] *= gain;
        }
      }
    };
  }

  function makeEncoder(gate) {
    const mp3 = !!window.lamejs, enc = mp3 ? new lamejs.Mp3Encoder(2, SR, 192) : null, out = [];
    let cl = new Int16Array(0), cr = new Int16Array(0), n = 0;
    const cat = (a, b) => { if (!a.length) return b; const o = new Int16Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    const blk = (l, r) => { const b = enc.encodeBuffer(l, r); if (b.length) out.push(new Uint8Array(b)); };
    return {
      push(Lc, Rc) {
        if (gate) gate.process(Lc, Rc);
        const l = i16(Lc), r = i16(Rc); n += l.length;
        if (!mp3) { out.push(l, r); return; }
        const a = cat(cl, l), b = cat(cr, r), e = a.length - a.length % 1152;
        for (let i = 0; i < e; i += 1152) blk(a.subarray(i, i + 1152), b.subarray(i, i + 1152));
        cl = a.slice(e); cr = b.slice(e);
      },
      finish() {
        if (mp3) { if (cl.length) blk(cl, cr); const f = enc.flush(); if (f.length) out.push(new Uint8Array(f)); return { blob: new Blob(out, { type: 'audio/mpeg' }), ext: 'mp3' }; }
        const dv = new DataView(new ArrayBuffer(44 + n * 4)); const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
        dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
        let o = 44; for (let k = 0; k < out.length; k += 2) { const l = out[k], r = out[k + 1]; for (let i = 0; i < l.length; i++, o += 4) { dv.setInt16(o, l[i], true); dv.setInt16(o + 2, r[i], true); } }
        return { blob: new Blob([dv], { type: 'audio/wav' }), ext: 'wav' };
      }
    };
  }
  function encode(ch) { const e = makeEncoder(); e.push(ch[0], ch[1]); return e.finish(); }
  function addSplit(files, info) {        // split tracks: kept out of "All tracks", grouped under "Split tracks"
    const A = window.__ppApi;
    if (A && A.addStemFiles) A.addStemFiles(files, info); else addToLibrary(files);
  }
  function addToLibrary(files) {
    const inp = document.getElementById('file-input'); if (!inp) throw new Error('file-input not found');
    const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- Demucs (waveform in, stems out; STFT is inside the ONNX graph) ----------
  // outs: [{name, rows:[source indices to sum]}]. 25% overlap with linear cross-fades, like demucs-onnx.
  async function separateDemucs(pcm, session, outs, onProgress, sink, pause = 0) {
    const len = pcm[0].length, overlap = DEMUCS_SEG >> 2, stride = DEMUCS_SEG - overlap, nChunks = Math.max(1, Math.ceil(len / stride));
    let full = null;
    if (!sink) {
      full = outs.map(() => [new Float32Array(len), new Float32Array(len)]);
      sink = (chunks, at) => chunks.forEach((c, k) => { full[k][0].set(c[0], at); full[k][1].set(c[1], at); });
    }
    // rolling buffers: index 0 = sample i*stride. After chunk i, samples before (i+1)*stride are final and get handed to the sink.
    const acc = outs.map(() => [new Float32Array(DEMUCS_SEG), new Float32Array(DEMUCS_SEG)]), weight = new Float32Array(DEMUCS_SEG);
    const x = new Float32Array(2 * DEMUCS_SEG), w = new Float32Array(DEMUCS_SEG);
    for (let i = 0; i < nChunks; i++) {
      const start = i * stride, end = Math.min(start + DEMUCS_SEG, len), cl = end - start, last = i === nChunks - 1;
      x.fill(0); x.set(pcm[0].subarray(start, end), 0); x.set(pcm[1].subarray(start, end), DEMUCS_SEG);
      const res = await session.run({ mix: new ort.Tensor('float32', x, [1, 2, DEMUCS_SEG]) }), y = res.stems.data;   // [1, S, 2, SEG]
      for (let j = 0; j < cl; j++) {
        let g = 1;
        if (i > 0 && j < overlap) g = j / (overlap - 1);                       // fade in (not on the very first chunk)
        if (end < len && j >= DEMUCS_SEG - overlap) g = Math.min(g, (DEMUCS_SEG - 1 - j) / (overlap - 1)); // fade out (not on the last)
        w[j] = g; weight[j] += g;
      }
      outs.forEach((o, k) => { for (let c = 0; c < 2; c++) { const a = acc[k][c]; for (const r of o.rows) { const base = (r * 2 + c) * DEMUCS_SEG; for (let j = 0; j < cl; j++) a[j] += y[base + j] * w[j]; } } });
      for (const r of Object.values(res)) r.dispose && r.dispose();           // release the output tensors right away
      const n = last ? cl : stride;
      sink(acc.map(ch => ch.map(a => { const o = new Float32Array(n); for (let j = 0; j < n; j++) o[j] = a[j] / Math.max(weight[j], 1e-8); return o; })), start);
      if (!last) { for (const ch of acc) for (const a of ch) { a.copyWithin(0, stride); a.fill(0, DEMUCS_SEG - stride); } weight.copyWithin(0, stride); weight.fill(0, DEMUCS_SEG - stride); }
      onProgress && onProgress((i + 1) / nChunks);
      await tick(); if (pause) await new Promise(r => setTimeout(r, pause));
    }
    return full && Object.fromEntries(outs.map((o, k) => [o.name, full[k]]));
  }

  // ---------- Spleeter 4 stems: one U-Net per stem, same STFT as the 2-stem path ----------
  // Ratio masks across all four stems sum to 1, so the stems add back up to the mix. Band above 11 kHz: per-frame mean mask.
  // Streams sink(chunks, startSample), chunks aligned with outs = [{ name, idx: [stem indices to sum] }].
  async function separate4(pcm, sessions, outs, onProgress, sink, pause = 0, ye = 0) {
    const len = pcm[0].length, ns = sessions.length;
    let L = PAD + len + PAD; L += (HOP - ((L - N) % HOP)) % HOP;
    const nFrames = (L - N) / HOP + 1, nSeg = Math.ceil(nFrames / T), SEG = T * HOP, RB = SEG + N;
    const out = outs.map(() => [new Float32Array(RB), new Float32Array(RB)]);
    const re = new Float32Array(N), im = new Float32Array(N), mk = new Float32Array(BINS);
    const specRe = [new Float32Array(T * BINS), new Float32Array(T * BINS)], specIm = [new Float32Array(T * BINS), new Float32Array(T * BINS)];
    const x = new Float32Array(2 * T * F), den = new Float32Array(2 * T * F);
    const inName = sessions[0].inputNames[0], outName = sessions[0].outputNames[0];
    for (let s = 0; s < nSeg; s++) {
      x.fill(0); specRe.forEach(a => a.fill(0)); specIm.forEach(a => a.fill(0));
      for (let c = 0; c < 2; c++) for (let t = 0; t < T; t++) {
        const fr = s * T + t; if (fr >= nFrames) break;
        const o0 = fr * HOP - PAD, src = pcm[c];
        for (let i = 0; i < N; i++) { const j = o0 + i; re[i] = (j >= 0 && j < len ? src[j] : 0) * win[i]; im[i] = 0; }
        fft(re, im);
        for (let k = 0; k < BINS; k++) { specRe[c][t * BINS + k] = re[k]; specIm[c][t * BINS + k] = im[k]; }
        for (let k = 0; k < F; k++) x[c * T * F + t * F + k] = Math.hypot(re[k], im[k]);
        if (ye && (t + 1) % ye === 0) await tick();
      }
      const feed = { [inName]: new ort.Tensor('float32', x, [2, 1, T, F]) };
      den.fill(1e-10); const Vs = [];
      for (let i = 0; i < ns; i++) {
        const V = (await sessions[i].run(feed))[outName].data; Vs.push(V);
        for (let j = 0; j < den.length; j++) den[j] += V[j] * V[j];
        await tick();
      }
      for (let c = 0; c < 2; c++) for (let t = 0; t < T; t++) {
        const fr = s * T + t; if (fr >= nFrames) break;
        const base = c * T * F + t * F;
        for (let oi = 0; oi < outs.length; oi++) {
          for (let k = 0; k < F; k++) { let a = 0; for (const si of outs[oi].idx) { const v = Vs[si][base + k]; a += v * v + 2.5e-11; } mk[k] = a / den[base + k]; }
          let avg = 0; for (let k = 0; k < F; k++) avg += mk[k]; avg /= F;
          for (let k = F; k < BINS; k++) mk[k] = avg;
          for (let k = 0; k < BINS; k++) {
            const g = mk[k], r = specRe[c][t * BINS + k] * g, i = specIm[c][t * BINS + k] * g;
            re[k] = r; im[k] = -i;                                // conj for inverse-via-forward
            if (k > 0 && k < N / 2) { re[N - k] = r; im[N - k] = i; }
          }
          fft(re, im);
          const bo = t * HOP, ob = out[oi][c];
          for (let i = 0; i < N; i++) ob[bo + i] += (re[i] / N) * win[i] / 1.5;
        }
        if (ye && (t + 1) % ye === 0) await tick();
      }
      const a = Math.max(0, s * SEG - PAD), b = Math.min(len, (s + 1) * SEG - PAD);
      if (b > a) { const bs = a + PAD - s * SEG; sink(out.map(ch => ch.map(o => o.slice(bs, bs + b - a))), a); }
      for (const ch of out) for (const o of ch) { o.copyWithin(0, SEG, RB); o.fill(0, RB - SEG); }
      onProgress && onProgress((s + 1) / nSeg);
      await tick(); if (pause) await new Promise(r => setTimeout(r, pause));
    }
  }

  // ---------- MDX-Net (UVR) ----------
  // The ONNX graph takes a spectrogram [1, 4, dimF, 256] = [L re, L im, R re, R im] and returns the vocal spectrogram.
  // n_fft (7680 = 2^9*3*5) isn't a power of two, so this has its own mixed-radix FFT (radix 2/3/5, Stockham).
  function makeFFT(n) {
    const fac = []; let t = n; for (const r of [5, 3, 2]) while (t % r === 0) { fac.push(r); t /= r; }
    if (t !== 1) throw new Error('FFT size ' + n + ' not supported');
    const stages = []; let len = n, s = 1;
    for (const r of fac) {
      const m = len / r, wr = new Float64Array(r * r), wi = new Float64Array(r * r), tr = new Float64Array(m * r), ti = new Float64Array(m * r);
      for (let u = 0; u < r; u++) for (let k = 0; k < r; k++) { const a = -2 * Math.PI * ((u * k) % r) / r; wr[u * r + k] = Math.cos(a); wi[u * r + k] = Math.sin(a); }
      for (let p = 0; p < m; p++) for (let u = 0; u < r; u++) { const a = -2 * Math.PI * p * u / len; tr[p * r + u] = Math.cos(a); ti[p * r + u] = Math.sin(a); }
      stages.push({ r, m, s, wr, wi, tr, ti }); len = m; s *= r;
    }
    const yr = new Float64Array(n), yi = new Float64Array(n), gr = new Float64Array(5), gi = new Float64Array(5);
    return (xr, xi) => {                                              // in place, forward, Float64Array in
      let ar = xr, ai = xi, br = yr, bi = yi;
      for (const { r, m, s, wr, wi, tr, ti } of stages) {
        for (let p = 0; p < m; p++) for (let q = 0; q < s; q++) {
          for (let k = 0; k < r; k++) { const idx = q + s * (p + k * m); gr[k] = ar[idx]; gi[k] = ai[idx]; }
          for (let u = 0; u < r; u++) {
            let sr = 0, si = 0;
            for (let k = 0; k < r; k++) { const cr = wr[u * r + k], ci = wi[u * r + k]; sr += gr[k] * cr - gi[k] * ci; si += gr[k] * ci + gi[k] * cr; }
            const c = tr[p * r + u], d = ti[p * r + u], o = q + s * (r * p + u);
            br[o] = sr * c - si * d; bi[o] = sr * d + si * c;
          }
        }
        let tmp = ar; ar = br; br = tmp; tmp = ai; ai = bi; bi = tmp;
      }
      if (ar !== xr) { xr.set(ar); xi.set(ai); }
    };
  }

  // Chunks of 255 hops (256 frames). Each chunk keeps its middle and drops n_fft/2 samples at both ends, like UVR.
  // Streams sink(vocals:[L,R], instrumental:[L,R], startSample); instrumental = mix - vocals.
  async function separateMdx(pcm, session, cfg, onProgress, sink, pause = 0, ye = 0) {
    const NF = cfg.nfft, H = 1024, DF = cfg.dimF, DT = 256, half = NF >> 1, chunk = H * (DT - 1), gen = chunk - NF;
    const len = pcm[0].length, nChunks = Math.max(1, Math.ceil(len / gen)), fftN = makeFFT(NF);
    const w = new Float64Array(NF); for (let i = 0; i < NF; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NF);
    const env = new Float64Array(chunk);                              // sum of squared windows, for the inverse STFT
    for (let t = 0; t < DT; t++) for (let i = 0; i < NF; i++) { const q = t * H - half + i; if (q >= 0 && q < chunk) env[q] += w[i] * w[i]; }
    const re = new Float64Array(NF), im = new Float64Array(NF), X = new Float32Array(4 * DF * DT), acc = [new Float32Array(chunk), new Float32Array(chunk)];
    const inName = session.inputNames[0], outName = session.outputNames[0];
    for (let j = 0; j < nChunks; j++) {
      const base = j * gen - half; X.fill(0);
      for (let c = 0; c < 2; c++) for (let t = 0; t < DT; t++) {
        const st = t * H - half;
        for (let i = 0; i < NF; i++) {
          let q = st + i; if (q < 0) q = -q; else if (q >= chunk) q = 2 * (chunk - 1) - q;   // reflect padding (center=True)
          const a = base + q; re[i] = (a >= 0 && a < len ? pcm[c][a] : 0) * w[i]; im[i] = 0;
        }
        fftN(re, im);
        for (let k = 3; k < DF; k++) { X[(c * 2 * DF + k) * DT + t] = re[k]; X[((c * 2 + 1) * DF + k) * DT + t] = im[k]; }   // lowest 3 bins zeroed, like UVR
        if (ye && (t + 1) % ye === 0) await tick();
      }
      const res = await session.run({ [inName]: new ort.Tensor('float32', X, [1, 4, DF, DT]) }), Y = res[outName].data;
      await tick();
      acc[0].fill(0); acc[1].fill(0);
      for (let c = 0; c < 2; c++) for (let t = 0; t < DT; t++) {
        re.fill(0); im.fill(0);
        for (let k = 0; k < DF; k++) {
          const r = Y[(c * 2 * DF + k) * DT + t], i = Y[((c * 2 + 1) * DF + k) * DT + t];
          re[k] = r; im[k] = -i;                                      // conj for inverse-via-forward
          if (k > 0) { re[NF - k] = r; im[NF - k] = i; }
        }
        fftN(re, im);
        const st = t * H - half, o = acc[c];
        for (let i = 0; i < NF; i++) { const q = st + i; if (q >= 0 && q < chunk) o[q] += re[i] / NF * w[i]; }
        if (ye && (t + 1) % ye === 0) await tick();
      }
      for (const r of Object.values(res)) r.dispose && r.dispose();
      const start = j * gen, n = Math.min(gen, len - start);
      const voc = acc.map(a => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = a[half + i] / Math.max(env[half + i], 1e-8) * cfg.comp; return o; });
      const ins = voc.map((v, c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = pcm[c][start + i] - v[i]; return o; });
      sink(voc, ins, start);
      onProgress && onProgress((j + 1) / nChunks);
      await tick(); if (pause) await new Promise(r => setTimeout(r, pause));
    }
  }

  // ---------- runtime ----------
  const loadOrt = () => window.ort ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = ORT + 'ort.all.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load onnxruntime-web'));
    document.head.appendChild(s);
  });
  async function makeSession(key, gpu, lv) {
    const buf = await getPart(key);
    const eps = gpu && !lv && navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
    ort.env.wasm.wasmPaths = ORT;
    ort.env.wasm.numThreads = !lv && self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    const o = { executionProviders: eps, graphOptimizationLevel: lv ? 'basic' : 'all' };   // 'all' makes extra weight copies while loading
    if (lv && lv.lean) { o.enableCpuMemArena = false; o.enableMemPattern = false; o.executionMode = 'sequential'; }
    return ort.InferenceSession.create(new Uint8Array(buf), o);
  }
  async function haveModel(id) { for (const [k] of parts(id)) if (!(await getPart(k))) return false; return true; }
  async function downloadModel(id, status, low) {
    for (const [k, f] of parts(id)) { if (await getPart(k)) continue; await fetchPart(k, f, (g, t) => status('Downloading ' + f.split('/').pop() + ' ' + (t ? Math.round(g / t * 100) + '%' : (g / 1048576 | 0) + ' MB')), low); }
  }
  async function deleteModel(id) { for (const [k] of parts(id)) { await idbDel(k); if (k.startsWith('sp_')) await idbDel(legacyKey(k)); if (k.startsWith('sp4_')) await idbDel('sp4f_' + k.slice(4)); } }

  // Runs the chosen model; returns {outputName: [L, R]} for just the wanted outputs.
  async function run(id, pcm, wanted, opts, status, onProgress) {
    const m = MODELS[id]; await loadOrt();
    const mkGate = n => n === 'Vocals' ? makeGate(opts.gate) : null;
    if (m.kind === 'spleeter') {
      status('Loading models…');
      const sess = { vocals: await makeSession('sp_vocals', false, opts.lv), accomp: await makeSession('sp_accomp', false, opts.lv) };
      try {
        const enc = {}; wanted.forEach(n => enc[n] = makeEncoder(mkGate(n)));      // encode while separating, no full-length stems in RAM
        const sink = (v, a) => { if (enc.Vocals) enc.Vocals.push(v[0], v[1]); if (enc.Instrumental) enc.Instrumental.push(a[0], a[1]); };
        const lv = opts.lv;
        const q = opts.quality || 0;
        await separate(pcm, sess, onProgress, opts.strength, sink, { pause: lv ? lv.pause[0] : 0, need: lv && lv.skip ? { v: !!enc.Vocals, a: !!enc.Instrumental } : null, ye: lv ? lv.ye : 0, ctx: q >= 1 ? CTX : 0, shift: q >= 2 ? 512 : 0 });
        const out = {}; wanted.forEach(n => out[n] = enc[n].finish()); return out;   // already {blob, ext}
      } finally { sess.vocals.release && sess.vocals.release(); sess.accomp.release && sess.accomp.release(); }
    }
    if (m.kind === 'sp4') {
      status('Loading models…');
      const names = ['vocals', 'drums', 'bass', 'other'];
      let sess = [];
      const load = async pre => { sess = []; for (const n of names) sess.push(await makeSession(pre + n, false, opts.lv)); };
      try {
        try { await load('sp4_'); }
        catch (e) {                                                       // half precision rejected here: use the 39 MB full precision files
          sess.forEach(x => x.release && x.release());
          for (const n of names) if (!(await getPart('sp4f_' + n))) await fetchPart('sp4f_' + n, n + '.onnx', (g, t) => status('Downloading ' + n + '.onnx ' + (t ? Math.round(g / t * 100) + '%' : (g / 1048576 | 0) + ' MB')), opts.lv && opts.lv.blob);
          status('Loading models…'); await load('sp4f_');
        }
        const idx = { Vocals: [0], Drums: [1], Bass: [2], Other: [3], Instrumental: [1, 2, 3] };
        const outs = wanted.map(n => ({ name: n, idx: idx[n] })), enc = outs.map(o => makeEncoder(mkGate(o.name))), lv = opts.lv;
        await separate4(pcm, sess, outs, onProgress, chunks => chunks.forEach((c, k) => enc[k].push(c[0], c[1])), lv ? lv.pause[0] : 0, lv ? lv.ye : 0);
        return Object.fromEntries(outs.map((o, k) => [o.name, enc[k].finish()]));   // already {blob, ext}
      } finally { sess.forEach(x => x.release && x.release()); }
    }
    if (m.kind === 'mdx') {
      status('Loading model…');
      const sess = await makeSession(id, opts.gpu, opts.lv);
      try {
        const enc = {}; wanted.forEach(n => enc[n] = makeEncoder(mkGate(n)));
        const sink = (v, a) => { if (enc.Vocals) enc.Vocals.push(v[0], v[1]); if (enc.Instrumental) enc.Instrumental.push(a[0], a[1]); };
        await separateMdx(pcm, sess, m, onProgress, sink, opts.lv ? opts.lv.pause[1] : 0, opts.lv ? opts.lv.ye : 0);
        const out = {}; wanted.forEach(n => out[n] = enc[n].finish()); return out;   // already {blob, ext}
      } finally { sess.release && sess.release(); }
    }
    status('Loading model… (can take a moment)');
    const sess = await makeSession(id, opts.gpu, opts.lv);
    try {
      const outs = wanted.map(n => ({ name: n, rows: n === 'Instrumental' ? m.sources.map((s, i) => s === 'vocals' ? -1 : i).filter(i => i >= 0) : [m.sources.indexOf(n.toLowerCase())] }));
      const enc = outs.map(o => makeEncoder(mkGate(o.name)));             // encode while separating, no full-length stems in RAM
      await separateDemucs(pcm, sess, outs, onProgress, chunks => chunks.forEach((c, k) => enc[k].push(c[0], c[1])), opts.lv ? opts.lv.pause[1] : 0);
      return Object.fromEntries(outs.map((o, k) => [o.name, enc[k].finish()]));   // already {blob, ext}
    } finally { sess.release && sess.release(); }                       // free RAM right away
  }
  const stemNames = id => MODELS[id].kind === 'spleeter' ? ['Vocals', 'Instrumental'] : ['Vocals', 'Instrumental'].concat(MODELS[id].sources.filter(s => s !== 'vocals').map(cap));

  // ---------- Auto-tagging ----------
  // 1) Essentia Discogs-EffNet (16 MB) + small heads: instruments, voice or instrumental, Discogs styles. CC BY-NC-SA 4.0 (non-commercial).
  // 2) EfficientAT mn10 (24 MB, MIT): AudioSet genre, mood and instruments. Its mel front end is inside the graph.
  const HFM = 'https://huggingface.co/';
  const TAG_FILES = {
    tg_effnet: HFM + 'swillsoftware/describesong-tagger/resolve/main/effnet.onnx',
    tg_hinst: HFM + 'swillsoftware/describesong-tagger/resolve/main/head-instrument.onnx',
    tg_hvoice: HFM + 'swillsoftware/describesong-tagger/resolve/main/head-voice.onnx',
    tg_mel: HFM + 'swillsoftware/describesong-tagger/resolve/main/melbank_96x257.npy',
    tg_mn10: HFM + 'minhducjp/webdonhac-models/resolve/main/mn10_as.onnx',
    tg_hgenre: 'genre_discogs400-discogs-effnet-1.onnx',                // optional, looked up in HF_BASE (your own repo wins if you upload it)
    // Public fallback for the Styles section: MTG/Essentia's unmodified Discogs-EffNet ONNX (also outputs the 400 Discogs style activations).
    tg_effstyle: HFM + 'Heyian/discogs-effnet-onnx/resolve/main/discogs-effnet-bsdynamic-1.onnx'
  };
  const INST40 = ["accordion","acousticbassguitar","acousticguitar","bass","beat","bell","bongo","brass","cello","clarinet","classicalguitar","computer","doublebass","drummachine","drums","electricguitar","electricpiano","flute","guitar","harmonica","harp","horn","keyboard","oboe","orchestra","organ","pad","percussion","piano","pipeorgan","rhodes","sampler","saxophone","strings","synthesizer","trombone","trumpet","viola","violin","voice"], DISCOGS = ["Boogie Woogie (Blues)","Chicago Blues (Blues)","Country Blues (Blues)","Delta Blues (Blues)","Electric Blues (Blues)","Harmonica Blues (Blues)","Jump Blues (Blues)","Louisiana Blues (Blues)","Modern Electric Blues (Blues)","Piano Blues (Blues)","Rhythm & Blues (Blues)","Texas Blues (Blues)","Brass Band (Brass & Military)","Marches (Brass & Military)","Military (Brass & Military)","Educational (Children's)","Nursery Rhymes (Children's)","Story (Children's)","Baroque (Classical)","Choral (Classical)","Classical (Classical)","Contemporary (Classical)","Impressionist (Classical)","Medieval (Classical)","Modern (Classical)","Neo-Classical (Classical)","Neo-Romantic (Classical)","Opera (Classical)","Post-Modern (Classical)","Renaissance (Classical)","Romantic (Classical)","Abstract (Electronic)","Acid (Electronic)","Acid House (Electronic)","Acid Jazz (Electronic)","Ambient (Electronic)","Bassline (Electronic)","Beatdown (Electronic)","Berlin-School (Electronic)","Big Beat (Electronic)","Bleep (Electronic)","Breakbeat (Electronic)","Breakcore (Electronic)","Breaks (Electronic)","Broken Beat (Electronic)","Chillwave (Electronic)","Chiptune (Electronic)","Dance-pop (Electronic)","Dark Ambient (Electronic)","Darkwave (Electronic)","Deep House (Electronic)","Deep Techno (Electronic)","Disco (Electronic)","Disco Polo (Electronic)","Donk (Electronic)","Downtempo (Electronic)","Drone (Electronic)","Drum n Bass (Electronic)","Dub (Electronic)","Dub Techno (Electronic)","Dubstep (Electronic)","Dungeon Synth (Electronic)","EBM (Electronic)","Electro (Electronic)","Electro House (Electronic)","Electroclash (Electronic)","Euro House (Electronic)","Euro-Disco (Electronic)","Eurobeat (Electronic)","Eurodance (Electronic)","Experimental (Electronic)","Freestyle (Electronic)","Future Jazz (Electronic)","Gabber (Electronic)","Garage House (Electronic)","Ghetto (Electronic)","Ghetto House (Electronic)","Glitch (Electronic)","Goa Trance (Electronic)","Grime (Electronic)","Halftime (Electronic)","Hands Up (Electronic)","Happy Hardcore (Electronic)","Hard House (Electronic)","Hard Techno (Electronic)","Hard Trance (Electronic)","Hardcore (Electronic)","Hardstyle (Electronic)","Hi NRG (Electronic)","Hip Hop (Electronic)","Hip-House (Electronic)","House (Electronic)","IDM (Electronic)","Illbient (Electronic)","Industrial (Electronic)","Italo House (Electronic)","Italo-Disco (Electronic)","Italodance (Electronic)","Jazzdance (Electronic)","Juke (Electronic)","Jumpstyle (Electronic)","Jungle (Electronic)","Latin (Electronic)","Leftfield (Electronic)","Makina (Electronic)","Minimal (Electronic)","Minimal Techno (Electronic)","Modern Classical (Electronic)","Musique Concr\u00e8te (Electronic)","Neofolk (Electronic)","New Age (Electronic)","New Beat (Electronic)","New Wave (Electronic)","Noise (Electronic)","Nu-Disco (Electronic)","Power Electronics (Electronic)","Progressive Breaks (Electronic)","Progressive House (Electronic)","Progressive Trance (Electronic)","Psy-Trance (Electronic)","Rhythmic Noise (Electronic)","Schranz (Electronic)","Sound Collage (Electronic)","Speed Garage (Electronic)","Speedcore (Electronic)","Synth-pop (Electronic)","Synthwave (Electronic)","Tech House (Electronic)","Tech Trance (Electronic)","Techno (Electronic)","Trance (Electronic)","Tribal (Electronic)","Tribal House (Electronic)","Trip Hop (Electronic)","Tropical House (Electronic)","UK Garage (Electronic)","Vaporwave (Electronic)","African (Folk, World, & Country)","Bluegrass (Folk, World, & Country)","Cajun (Folk, World, & Country)","Canzone Napoletana (Folk, World, & Country)","Catalan Music (Folk, World, & Country)","Celtic (Folk, World, & Country)","Country (Folk, World, & Country)","Fado (Folk, World, & Country)","Flamenco (Folk, World, & Country)","Folk (Folk, World, & Country)","Gospel (Folk, World, & Country)","Highlife (Folk, World, & Country)","Hillbilly (Folk, World, & Country)","Hindustani (Folk, World, & Country)","Honky Tonk (Folk, World, & Country)","Indian Classical (Folk, World, & Country)","La\u00efk\u00f3 (Folk, World, & Country)","Nordic (Folk, World, & Country)","Pacific (Folk, World, & Country)","Polka (Folk, World, & Country)","Ra\u00ef (Folk, World, & Country)","Romani (Folk, World, & Country)","Soukous (Folk, World, & Country)","S\u00e9ga (Folk, World, & Country)","Volksmusik (Folk, World, & Country)","Zouk (Folk, World, & Country)","\u00c9ntekhno (Folk, World, & Country)","Afrobeat (Funk / Soul)","Boogie (Funk / Soul)","Contemporary R&B (Funk / Soul)","Disco (Funk / Soul)","Free Funk (Funk / Soul)","Funk (Funk / Soul)","Gospel (Funk / Soul)","Neo Soul (Funk / Soul)","New Jack Swing (Funk / Soul)","P.Funk (Funk / Soul)","Psychedelic (Funk / Soul)","Rhythm & Blues (Funk / Soul)","Soul (Funk / Soul)","Swingbeat (Funk / Soul)","UK Street Soul (Funk / Soul)","Bass Music (Hip Hop)","Boom Bap (Hip Hop)","Bounce (Hip Hop)","Britcore (Hip Hop)","Cloud Rap (Hip Hop)","Conscious (Hip Hop)","Crunk (Hip Hop)","Cut-up/DJ (Hip Hop)","DJ Battle Tool (Hip Hop)","Electro (Hip Hop)","G-Funk (Hip Hop)","Gangsta (Hip Hop)","Grime (Hip Hop)","Hardcore Hip-Hop (Hip Hop)","Horrorcore (Hip Hop)","Instrumental (Hip Hop)","Jazzy Hip-Hop (Hip Hop)","Miami Bass (Hip Hop)","Pop Rap (Hip Hop)","Ragga HipHop (Hip Hop)","RnB/Swing (Hip Hop)","Screw (Hip Hop)","Thug Rap (Hip Hop)","Trap (Hip Hop)","Trip Hop (Hip Hop)","Turntablism (Hip Hop)","Afro-Cuban Jazz (Jazz)","Afrobeat (Jazz)","Avant-garde Jazz (Jazz)","Big Band (Jazz)","Bop (Jazz)","Bossa Nova (Jazz)","Contemporary Jazz (Jazz)","Cool Jazz (Jazz)","Dixieland (Jazz)","Easy Listening (Jazz)","Free Improvisation (Jazz)","Free Jazz (Jazz)","Fusion (Jazz)","Gypsy Jazz (Jazz)","Hard Bop (Jazz)","Jazz-Funk (Jazz)","Jazz-Rock (Jazz)","Latin Jazz (Jazz)","Modal (Jazz)","Post Bop (Jazz)","Ragtime (Jazz)","Smooth Jazz (Jazz)","Soul-Jazz (Jazz)","Space-Age (Jazz)","Swing (Jazz)","Afro-Cuban (Latin)","Bai\u00e3o (Latin)","Batucada (Latin)","Beguine (Latin)","Bolero (Latin)","Boogaloo (Latin)","Bossanova (Latin)","Cha-Cha (Latin)","Charanga (Latin)","Compas (Latin)","Cubano (Latin)","Cumbia (Latin)","Descarga (Latin)","Forr\u00f3 (Latin)","Guaguanc\u00f3 (Latin)","Guajira (Latin)","Guaracha (Latin)","MPB (Latin)","Mambo (Latin)","Mariachi (Latin)","Merengue (Latin)","Norte\u00f1o (Latin)","Nueva Cancion (Latin)","Pachanga (Latin)","Porro (Latin)","Ranchera (Latin)","Reggaeton (Latin)","Rumba (Latin)","Salsa (Latin)","Samba (Latin)","Son (Latin)","Son Montuno (Latin)","Tango (Latin)","Tejano (Latin)","Vallenato (Latin)","Audiobook (Non-Music)","Comedy (Non-Music)","Dialogue (Non-Music)","Education (Non-Music)","Field Recording (Non-Music)","Interview (Non-Music)","Monolog (Non-Music)","Poetry (Non-Music)","Political (Non-Music)","Promotional (Non-Music)","Radioplay (Non-Music)","Religious (Non-Music)","Spoken Word (Non-Music)","Ballad (Pop)","Bollywood (Pop)","Bubblegum (Pop)","Chanson (Pop)","City Pop (Pop)","Europop (Pop)","Indie Pop (Pop)","J-pop (Pop)","K-pop (Pop)","Kay\u014dkyoku (Pop)","Light Music (Pop)","Music Hall (Pop)","Novelty (Pop)","Parody (Pop)","Schlager (Pop)","Vocal (Pop)","Calypso (Reggae)","Dancehall (Reggae)","Dub (Reggae)","Lovers Rock (Reggae)","Ragga (Reggae)","Reggae (Reggae)","Reggae-Pop (Reggae)","Rocksteady (Reggae)","Roots Reggae (Reggae)","Ska (Reggae)","Soca (Reggae)","AOR (Rock)","Acid Rock (Rock)","Acoustic (Rock)","Alternative Rock (Rock)","Arena Rock (Rock)","Art Rock (Rock)","Atmospheric Black Metal (Rock)","Avantgarde (Rock)","Beat (Rock)","Black Metal (Rock)","Blues Rock (Rock)","Brit Pop (Rock)","Classic Rock (Rock)","Coldwave (Rock)","Country Rock (Rock)","Crust (Rock)","Death Metal (Rock)","Deathcore (Rock)","Deathrock (Rock)","Depressive Black Metal (Rock)","Doo Wop (Rock)","Doom Metal (Rock)","Dream Pop (Rock)","Emo (Rock)","Ethereal (Rock)","Experimental (Rock)","Folk Metal (Rock)","Folk Rock (Rock)","Funeral Doom Metal (Rock)","Funk Metal (Rock)","Garage Rock (Rock)","Glam (Rock)","Goregrind (Rock)","Goth Rock (Rock)","Gothic Metal (Rock)","Grindcore (Rock)","Grunge (Rock)","Hard Rock (Rock)","Hardcore (Rock)","Heavy Metal (Rock)","Indie Rock (Rock)","Industrial (Rock)","Krautrock (Rock)","Lo-Fi (Rock)","Lounge (Rock)","Math Rock (Rock)","Melodic Death Metal (Rock)","Melodic Hardcore (Rock)","Metalcore (Rock)","Mod (Rock)","Neofolk (Rock)","New Wave (Rock)","No Wave (Rock)","Noise (Rock)","Noisecore (Rock)","Nu Metal (Rock)","Oi (Rock)","Parody (Rock)","Pop Punk (Rock)","Pop Rock (Rock)","Pornogrind (Rock)","Post Rock (Rock)","Post-Hardcore (Rock)","Post-Metal (Rock)","Post-Punk (Rock)","Power Metal (Rock)","Power Pop (Rock)","Power Violence (Rock)","Prog Rock (Rock)","Progressive Metal (Rock)","Psychedelic Rock (Rock)","Psychobilly (Rock)","Pub Rock (Rock)","Punk (Rock)","Rock & Roll (Rock)","Rockabilly (Rock)","Shoegaze (Rock)","Ska (Rock)","Sludge Metal (Rock)","Soft Rock (Rock)","Southern Rock (Rock)","Space Rock (Rock)","Speed Metal (Rock)","Stoner Rock (Rock)","Surf (Rock)","Symphonic Rock (Rock)","Technical Death Metal (Rock)","Thrash (Rock)","Twist (Rock)","Viking Metal (Rock)","Y\u00e9-Y\u00e9 (Rock)","Musical (Stage & Screen)","Score (Stage & Screen)","Soundtrack (Stage & Screen)","Theme (Stage & Screen)"], AUDIOSET = ["Speech","Male speech, man speaking","Female speech, woman speaking","Child speech, kid speaking","Conversation","Narration, monologue","Babbling","Speech synthesizer","Shout","Bellow","Whoop","Yell","Battle cry","Children shouting","Screaming","Whispering","Laughter","Baby laughter","Giggle","Snicker","Belly laugh","Chuckle, chortle","Crying, sobbing","Baby cry, infant cry","Whimper","Wail, moan","Sigh","Singing","Choir","Yodeling","Chant","Mantra","Male singing","Female singing","Child singing","Synthetic singing","Rapping","Humming","Groan","Grunt","Whistling","Breathing","Wheeze","Snoring","Gasp","Pant","Snort","Cough","Throat clearing","Sneeze","Sniff","Run","Shuffle","Walk, footsteps","Chewing, mastication","Biting","Gargling","Stomach rumble","Burping, eructation","Hiccup","Fart","Hands","Finger snapping","Clapping","Heart sounds, heartbeat","Heart murmur","Cheering","Applause","Chatter","Crowd","Hubbub, speech noise, speech babble","Children playing","Animal","Domestic animals, pets","Dog","Bark","Yip","Howl","Bow-wow","Growling","Whimper (dog)","Cat","Purr","Meow","Hiss","Caterwaul","Livestock, farm animals, working animals","Horse","Clip-clop","Neigh, whinny","Cattle, bovinae","Moo","Cowbell","Pig","Oink","Goat","Bleat","Sheep","Fowl","Chicken, rooster","Cluck","Crowing, cock-a-doodle-doo","Turkey","Gobble","Duck","Quack","Goose","Honk","Wild animals","Roaring cats (lions, tigers)","Roar","Bird","Bird vocalization, bird call, bird song","Chirp, tweet","Squawk","Pigeon, dove","Coo","Crow","Caw","Owl","Hoot","Bird flight, flapping wings","Canidae, dogs, wolves","Rodents, rats, mice","Mouse","Patter","Insect","Cricket","Mosquito","Fly, housefly","Buzz","Bee, wasp, etc.","Frog","Croak","Snake","Rattle","Whale vocalization","Music","Musical instrument","Plucked string instrument","Guitar","Electric guitar","Bass guitar","Acoustic guitar","Steel guitar, slide guitar","Tapping (guitar technique)","Strum","Banjo","Sitar","Mandolin","Zither","Ukulele","Keyboard (musical)","Piano","Electric piano","Organ","Electronic organ","Hammond organ","Synthesizer","Sampler","Harpsichord","Percussion","Drum kit","Drum machine","Drum","Snare drum","Rimshot","Drum roll","Bass drum","Timpani","Tabla","Cymbal","Hi-hat","Wood block","Tambourine","Rattle (instrument)","Maraca","Gong","Tubular bells","Mallet percussion","Marimba, xylophone","Glockenspiel","Vibraphone","Steelpan","Orchestra","Brass instrument","French horn","Trumpet","Trombone","Bowed string instrument","String section","Violin, fiddle","Pizzicato","Cello","Double bass","Wind instrument, woodwind instrument","Flute","Saxophone","Clarinet","Harp","Bell","Church bell","Jingle bell","Bicycle bell","Tuning fork","Chime","Wind chime","Change ringing (campanology)","Harmonica","Accordion","Bagpipes","Didgeridoo","Shofar","Theremin","Singing bowl","Scratching (performance technique)","Pop music","Hip hop music","Beatboxing","Rock music","Heavy metal","Punk rock","Grunge","Progressive rock","Rock and roll","Psychedelic rock","Rhythm and blues","Soul music","Reggae","Country","Swing music","Bluegrass","Funk","Folk music","Middle Eastern music","Jazz","Disco","Classical music","Opera","Electronic music","House music","Techno","Dubstep","Drum and bass","Electronica","Electronic dance music","Ambient music","Trance music","Music of Latin America","Salsa music","Flamenco","Blues","Music for children","New-age music","Vocal music","A capella","Music of Africa","Afrobeat","Christian music","Gospel music","Music of Asia","Carnatic music","Music of Bollywood","Ska","Traditional music","Independent music","Song","Background music","Theme music","Jingle (music)","Soundtrack music","Lullaby","Video game music","Christmas music","Dance music","Wedding music","Happy music","Funny music","Sad music","Tender music","Exciting music","Angry music","Scary music","Wind","Rustling leaves","Wind noise (microphone)","Thunderstorm","Thunder","Water","Rain","Raindrop","Rain on surface","Stream","Waterfall","Ocean","Waves, surf","Steam","Gurgling","Fire","Crackle","Vehicle","Boat, Water vehicle","Sailboat, sailing ship","Rowboat, canoe, kayak","Motorboat, speedboat","Ship","Motor vehicle (road)","Car","Vehicle horn, car horn, honking","Toot","Car alarm","Power windows, electric windows","Skidding","Tire squeal","Car passing by","Race car, auto racing","Truck","Air brake","Air horn, truck horn","Reversing beeps","Ice cream truck, ice cream van","Bus","Emergency vehicle","Police car (siren)","Ambulance (siren)","Fire engine, fire truck (siren)","Motorcycle","Traffic noise, roadway noise","Rail transport","Train","Train whistle","Train horn","Railroad car, train wagon","Train wheels squealing","Subway, metro, underground","Aircraft","Aircraft engine","Jet engine","Propeller, airscrew","Helicopter","Fixed-wing aircraft, airplane","Bicycle","Skateboard","Engine","Light engine (high frequency)","Dental drill, dentist's drill","Lawn mower","Chainsaw","Medium engine (mid frequency)","Heavy engine (low frequency)","Engine knocking","Engine starting","Idling","Accelerating, revving, vroom","Door","Doorbell","Ding-dong","Sliding door","Slam","Knock","Tap","Squeak","Cupboard open or close","Drawer open or close","Dishes, pots, and pans","Cutlery, silverware","Chopping (food)","Frying (food)","Microwave oven","Blender","Water tap, faucet","Sink (filling or washing)","Bathtub (filling or washing)","Hair dryer","Toilet flush","Toothbrush","Electric toothbrush","Vacuum cleaner","Zipper (clothing)","Keys jangling","Coin (dropping)","Scissors","Electric shaver, electric razor","Shuffling cards","Typing","Typewriter","Computer keyboard","Writing","Alarm","Telephone","Telephone bell ringing","Ringtone","Telephone dialing, DTMF","Dial tone","Busy signal","Alarm clock","Siren","Civil defense siren","Buzzer","Smoke detector, smoke alarm","Fire alarm","Foghorn","Whistle","Steam whistle","Mechanisms","Ratchet, pawl","Clock","Tick","Tick-tock","Gears","Pulleys","Sewing machine","Mechanical fan","Air conditioning","Cash register","Printer","Camera","Single-lens reflex camera","Tools","Hammer","Jackhammer","Sawing","Filing (rasp)","Sanding","Power tool","Drill","Explosion","Gunshot, gunfire","Machine gun","Fusillade","Artillery fire","Cap gun","Fireworks","Firecracker","Burst, pop","Eruption","Boom","Wood","Chop","Splinter","Crack","Glass","Chink, clink","Shatter","Liquid","Splash, splatter","Slosh","Squish","Drip","Pour","Trickle, dribble","Gush","Fill (with liquid)","Spray","Pump (liquid)","Stir","Boiling","Sonar","Arrow","Whoosh, swoosh, swish","Thump, thud","Thunk","Electronic tuner","Effects unit","Chorus effect","Basketball bounce","Bang","Slap, smack","Whack, thwack","Smash, crash","Breaking","Bouncing","Whip","Flap","Scratch","Scrape","Rub","Roll","Crushing","Crumpling, crinkling","Tearing","Beep, bleep","Ping","Ding","Clang","Squeal","Creak","Rustle","Whir","Clatter","Sizzle","Clicking","Clickety-clack","Rumble","Plop","Jingle, tinkle","Hum","Zing","Boing","Crunch","Silence","Sine wave","Harmonic","Chirp tone","Sound effect","Pulse","Inside, small room","Inside, large room or hall","Inside, public space","Outside, urban or manmade","Outside, rural or natural","Reverberation","Echo","Noise","Environmental noise","Static","Mains hum","Distortion","Sidetone","Cacophony","White noise","Pink noise","Throbbing","Vibration","Television","Radio","Field recording"];
  const AS_GENRE = [216, 265], AS_MOOD = [276, 282], AS_NOT_INST = new Set([145, 146, 166, 167, 192]);
  const asInst = i => (i >= 140 && i <= 199 && !AS_NOT_INST.has(i)) || [208, 209, 210, 211, 213].includes(i);

  async function ensureTagFile(key, status, low, pr) {
    if (await idbGet(key)) return;
    const f = TAG_FILES[key];
    await fetchPart(key, f, (g, t) => { status('Downloading ' + f.split('/').pop() + ' ' + (t ? Math.round(g / t * 100) + '%' : (g / 1048576 | 0) + ' MB')); pr && pr(g, t); }, low);
  }
  async function decodeMono(url, sr) {
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: sr });
    const ab = await ctx.decodeAudioData(buf); ctx.close && ctx.close();
    const a = ab.getChannelData(0), b = ab.numberOfChannels > 1 ? ab.getChannelData(1) : null, o = new Float32Array(a.length);
    for (let i = 0; i < o.length; i++) o[i] = b ? (a[i] + b[i]) * 0.5 : a[i];
    return o;
  }
  function parseNpy(buf) {                                              // float32/float64 C-order array -> Float32Array
    const dv = new DataView(buf), v2 = dv.getUint8(6) >= 2, hl = v2 ? dv.getUint32(8, true) : dv.getUint16(8, true), off = (v2 ? 12 : 10) + hl;
    const head = new TextDecoder().decode(new Uint8Array(buf, v2 ? 12 : 10, hl));
    if (/fortran_order'?:\s*True/.test(head)) throw new Error('melbank.npy is Fortran order');
    const raw = buf.slice(off);
    return Float32Array.from(/<f8/.test(head) ? new Float64Array(raw) : new Float32Array(raw));
  }
  // 16 kHz mono -> log-mel frames [nFrames * 96], the recipe the Discogs-EffNet export was checked against
  async function effnetMel(x, bank) {
    const M = 512, H = 256, NB = 96, K = 257, nF = Math.floor(x.length / H) + 1, fftS = makeFFT(M);
    if (bank.length !== NB * K) throw new Error('melbank has the wrong size');
    const w = new Float64Array(M); for (let i = 0; i < M; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (M - 1));   // symmetric Hann
    const mel = new Float32Array(nF * NB), re = new Float64Array(M), im = new Float64Array(M), pw = new Float64Array(K);
    for (let f = 0; f < nF; f++) {
      const st = f * H - H;                                           // frame centred on f*256 (256 zeros in front)
      for (let j = 0; j < M; j++) { const q = st + j; re[j] = (q >= 0 && q < x.length ? x[q] : 0) * w[j]; im[j] = 0; }
      fftS(re, im);
      for (let k = 0; k < K; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
      for (let b = 0; b < NB; b++) { let a = 0; const o = b * K; for (let k = 0; k < K; k++) a += bank[o + k] * pw[k]; mel[f * NB + b] = Math.log10(1 + 10000 * a); }
      if (f % 300 === 299) await tick();
    }
    return mel;
  }
  // ---------- Extra mood/trait heads (optional) ----------
  // Small classifiers that run on the same 1280-number Discogs-EffNet embedding, so they cost almost nothing.
  // Convert them once with convert_heads.py, upload the .onnx files + tagger-heads.json to HF_BASE. Missing = skipped.
  let headsMemo = null;
  // Built-in mood heads: MTG/Essentia's public ONNX classifiers for the Discogs-EffNet embedding (~0.5 MB each, ~4 MB total).
  // The ids match what the smart playlists / auto-EQ read (relaxed, aggressive, party, happy, sad, danceable, acoustic, electronic).
  // Your own tagger-heads.json in HF_BASE still wins if you upload one. Turn the whole thing off with the "Mood models" checkbox.
  const ESS = 'https://essentia.upf.edu/models/classification-heads/';
  const BUILTIN_HEADS = [
    ['happy', 'mood_happy', 'Happy', 0], ['sad', 'mood_sad', 'Sad', 1], ['relaxed', 'mood_relaxed', 'Relaxed', 1], ['aggressive', 'mood_aggressive', 'Aggressive', 0],
    ['party', 'mood_party', 'Party', 1], ['acoustic', 'mood_acoustic', 'Acoustic', 0], ['electronic', 'mood_electronic', 'Electronic', 0], ['danceable', 'danceability', 'Danceable', 0]
  ].map(([id, dir, label, pos]) => ({ id, label, pos, base: dir + '-discogs-effnet-1', file: ESS + dir + '/' + dir + '-discogs-effnet-1.onnx', info: ESS + dir + '/' + dir + '-discogs-effnet-1.json' }));
  const moodsOn = () => { try { return localStorage.getItem('ppvMoods') !== '0'; } catch (e) { return true; } };
  // Fetch with a hard deadline (response start AND stalls mid-download), so a dead host can never freeze the app.
  async function fetchTimed(url, ms, onProgress) {
    const ac = new AbortController(); let t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { mode: 'cors', signal: ac.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const total = +r.headers.get('content-length') || 0, rd = r.body.getReader(), chunks = []; let n = 0;
      for (;;) { clearTimeout(t); t = setTimeout(() => ac.abort(), ms); const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; onProgress && onProgress(n, total); }
      const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
      return out.buffer;
    } catch (e) { throw ac.signal.aborted ? new Error('timed out') : e; }
    finally { clearTimeout(t); }
  }
  let headsFailed = false;                                           // set when every route failed this session, so we stop retrying every track
  // Routes to try, in order: your own HF repo (if you uploaded the file), Essentia directly, then public CORS relays
  // (they only ever see the public model file URL, never your music). The route that works is tried first next time.
  const HEAD_ROUTES = [
    (u, f) => HF_BASE + f,
    (u) => u,
    (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + u
  ];
  let headRoute = 0;
  async function fetchHeadFile(b, ext, ms, onProgress) {
    const u = ext === 'onnx' ? b.file : b.info, f = b.base + '.' + ext, order = [headRoute, ...HEAD_ROUTES.keys()].filter((v, i, a) => a.indexOf(v) === i);
    let last = null;
    for (const i of order) {
      try {
        const buf = await fetchTimed(HEAD_ROUTES[i](u, f), ms, onProgress);
        if (ext === 'onnx') { const hd = new Uint8Array(buf, 0, Math.min(16, buf.byteLength)); if (buf.byteLength < 1024 || hd[0] === 0x3C) throw new Error('not an ONNX file'); }
        headRoute = i; return buf;
      } catch (e) { last = e; console.warn('mood route', i, 'failed for', f, e && e.message); }
    }
    throw last || new Error('all routes failed');
  }
  let headsLog = [];                                                 // why each mood model failed, shown in the tag result
  async function builtinHeads(status, low, prog) {
    if (headsFailed) return [];
    const ok = new Array(BUILTIN_HEADS.length).fill(null); let got = 0;
    const one = async (b, k) => {
      try {
        let h = null; try { const c = await idbGet('tghm_' + b.id); if (c) h = JSON.parse(c); } catch (e) {}
        if (!h || !(await idbGet('tgh_' + b.id))) {
          h = { id: b.id, label: b.label, kind: 'binary', group: 'mood', pos: b.pos, classes: null };
          const buf = await fetchHeadFile(b, 'onnx', 8000);
          try { const j = JSON.parse(new TextDecoder().decode(await fetchHeadFile(b, 'json', 4000))); if (j.classes && j.classes.length === 2) { h.classes = j.classes; const p = j.classes.findIndex(c => !/^(non|not)[_ -]/i.test(c)); if (p >= 0) h.pos = p; } } catch (e) {}
          await idbPut('tgh_' + b.id, buf);
          await idbPut('tghm_' + b.id, JSON.stringify(h));
        }
        ok[k] = h; headsFailed = false;
      } catch (e) { headsLog.push(b.label + ': ' + ((e && e.message) || e)); console.warn('mood head skipped', b.id, e); }
      finally { got++; status('Mood models: ' + got + ' of ' + BUILTIN_HEADS.length + ' ready…'); prog && prog(got / BUILTIN_HEADS.length); }
    };
    status('Mood models: checking…');
    const all = Promise.all(BUILTIN_HEADS.map(one));                  // all eight at once, so the wait is the slowest one, not the sum
    await Promise.race([all, new Promise(r => setTimeout(r, 25000))]);   // never hold up tagging for more than 25 s
    if (got < BUILTIN_HEADS.length) headsLog.push('some are still downloading in the background, they will be ready next run');
    const out = ok.filter(Boolean);
    if (!out.length) headsFailed = true;                              // skip the wait on the next tracks (cleared if a background download succeeds, or by Refresh)
    return out;
  }
  async function loadHeads(status, low, enabled, prog) {
    headsLog = [];
    if (enabled === false) return [];
    if (headsMemo) return headsMemo;
    let man = null;
    try { const c = await idbGet('tg_manifest'); if (c) man = JSON.parse(c); } catch (e) {}
    if (!man) {
      try { man = JSON.parse(new TextDecoder().decode(await fetchTimed(HF_BASE + 'tagger-heads.json', 6000))); await idbPut('tg_manifest', JSON.stringify(man)); } catch (e) { man = null; }
    }
    const heads = [];
    for (const h of ((man && man.heads) || [])) {
      try {
        if (!(await idbGet('tgh_' + h.id))) await fetchPart('tgh_' + h.id, h.file, (g, t) => status('Downloading ' + h.file + ' ' + (t ? Math.round(g / t * 100) + '%' : '')), low);
        heads.push(h);
      } catch (e) { console.warn('head skipped', h.id, e); }
    }
    let custom = heads.length > 0;
    if (!custom) heads.push(...await builtinHeads(status, low, prog));
    return heads.length && (custom || heads.length === BUILTIN_HEADS.length) ? (headsMemo = heads) : heads;   // only remember a complete set       // don't remember an empty result, so a later run can try again
  }
  async function resetHeads() {
    headsMemo = null; headsFailed = false;
    try { const c = await idbGet('tg_manifest'); if (c) for (const h of (JSON.parse(c).heads || [])) await idbDel('tgh_' + h.id); } catch (e) {}
    await idbDel('tg_manifest').catch(() => {});
    for (const b of BUILTIN_HEADS) { await idbDel('tgh_' + b.id).catch(() => {}); await idbDel('tghm_' + b.id).catch(() => {}); }
  }

  // ---------- Tempo (BPM) from the log-mel frames we already have ----------
  function tempoFromMel(mel, nF) {
    const NB = 96, FPS = 16000 / 256;
    if (nF < FPS * 12) return null;
    const o = new Float32Array(nF);
    for (let f = 1; f < nF; f++) { let a = 0; for (let b = 0; b < NB; b++) { const d = mel[f * NB + b] - mel[(f - 1) * NB + b]; if (d > 0) a += d; } o[f] = a; }
    const W = 16, pre = new Float64Array(nF + 1), z = new Float32Array(nF);
    for (let i = 0; i < nF; i++) pre[i + 1] = pre[i] + o[i];
    for (let i = 0; i < nF; i++) { const a = Math.max(0, i - W), b = Math.min(nF, i + W + 1); z[i] = Math.max(0, o[i] - (pre[b] - pre[a]) / (b - a)); }
    let s = 0; for (let i = 0; i < nF; i++) s += z[i] * z[i]; s = Math.sqrt(s / nF) || 1; for (let i = 0; i < nF; i++) z[i] /= s;
    const acf = lag => {                                               // autocorrelation at a fractional lag
      const L0 = Math.floor(lag), fr = lag - L0, n = nF - L0 - 1; if (n < FPS * 4) return 0;
      let a = 0; for (let i = 0; i < n; i++) a += z[i] * (z[i + L0] * (1 - fr) + z[i + L0 + 1] * fr);
      return a / n;
    };
    let best = 0, bpm = 0, sum = 0, cnt = 0;
    for (let t = 60; t <= 200; t += 0.5) {
      const L = FPS * 60 / t;
      let v = Math.max(0, acf(L)) + 0.5 * Math.max(0, acf(2 * L)) + 0.5 * Math.max(0, acf(4 * L));
      v *= Math.exp(-0.5 * Math.pow(Math.log2(t / 115) / 0.9, 2));       // gentle preference for everyday tempos
      sum += v; cnt++; if (v > best) { best = v; bpm = t; }
    }
    if (!bpm || best <= 0) return null;
    return { bpm: Math.round(bpm), conf: Math.max(0, Math.min(1, (best / (sum / cnt) - 1) / 4)) };
  }

  // ---------- Musical key (chroma + Krumhansl profiles) ----------
  const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const CAM_MAJ = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1], CAM_MIN = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
  const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  async function chromaKey(x) {
    const M = 8192, SRq = 16000, hop = 8000;
    if (x.length < M * 2) return null;
    const fftS = makeFFT(M), nF = Math.floor((x.length - M) / hop) + 1, take = Math.min(nF, 160), w = new Float64Array(M);
    for (let i = 0; i < M; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / M);
    const re = new Float64Array(M), im = new Float64Array(M), mag = new Float64Array(M / 2 + 2);
    const kmin = Math.ceil(65 * M / SRq), kmax = Math.min(M / 2 - 2, Math.floor(2000 * M / SRq)), pk = [];
    for (let q = 0; q < take; q++) {
      const st = Math.floor(q * (nF - 1) / Math.max(1, take - 1)) * hop; let e = 0;
      for (let i = 0; i < M; i++) { const v = x[st + i] * w[i]; re[i] = v; im[i] = 0; e += v * v; }
      if (e < 1e-4) continue;
      fftS(re, im);
      let mx = 0; for (let k = kmin - 1; k <= kmax + 1; k++) { mag[k] = Math.hypot(re[k], im[k]); if (mag[k] > mx) mx = mag[k]; }
      const thr = mx * 0.05;
      for (let k = kmin; k <= kmax; k++) {
        const b = mag[k]; if (b < thr || b <= mag[k - 1] || b < mag[k + 1]) continue;
        const a = Math.log(mag[k - 1] + 1e-9), bb = Math.log(b + 1e-9), c = Math.log(mag[k + 1] + 1e-9), d = a - 2 * bb + c;
        const f = (k + (d < 0 ? 0.5 * (a - c) / d : 0)) * SRq / M;
        pk.push([69 + 12 * Math.log2(f / 440), Math.sqrt(b / mx)]);
      }
      if (q % 20 === 19) await tick();
    }
    if (pk.length < 30) return null;
    let sc = 0, ss = 0; for (const [m, wt] of pk) { const fr = m - Math.round(m); sc += wt * Math.cos(2 * Math.PI * fr); ss += wt * Math.sin(2 * Math.PI * fr); }
    const tune = Math.atan2(ss, sc) / (2 * Math.PI), ch = new Float64Array(12);   // how far the recording is tuned from A=440
    for (const [m, wt] of pk) ch[((Math.round(m - tune) % 12) + 12) % 12] += wt;
    const pear = (prof, t) => {
      let ma = 0, mb = 0; for (let i = 0; i < 12; i++) { ma += ch[i]; mb += prof[i]; } ma /= 12; mb /= 12;
      let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { const a = ch[i] - ma, b = prof[(i - t + 12) % 12] - mb; n += a * b; da += a * a; db += b * b; }
      return n / (Math.sqrt(da * db) || 1);
    };
    let best = -2, second = -2, bt = 0, bm = false;
    for (let t = 0; t < 12; t++) for (const minor of [false, true]) {
      const v = pear(minor ? KS_MIN : KS_MAJ, t);
      if (v > best) { second = best; best = v; bt = t; bm = minor; } else if (v > second) second = v;
    }
    return { name: NOTES[bt] + (bm ? ' minor' : ' major'), camelot: (bm ? CAM_MIN : CAM_MAJ)[bt] + (bm ? 'A' : 'B'), conf: Math.max(0, Math.min(1, (best - second) * 5 + 0.3)) };
  }

  // ---------- Embedding storage (int8, ~1.3 KB per track, in IndexedDB) ----------
  async function saveEmb(dbId, e) {
    let m = 0; for (let i = 0; i < e.length; i++) m = Math.max(m, Math.abs(e[i]));
    const sc = m / 127 || 1, buf = new Uint8Array(4 + e.length), dv = new DataView(buf.buffer), q = new Int8Array(buf.buffer, 4);
    dv.setFloat32(0, sc, true); for (let i = 0; i < e.length; i++) q[i] = Math.round(e[i] / sc);
    await idbPut('emb_' + dbId, buf.buffer);
  }
  async function loadEmb(dbId) {
    const b = await idbGet('emb_' + dbId); if (!b || !(b instanceof ArrayBuffer)) return null;
    const sc = new DataView(b).getFloat32(0, true), q = new Int8Array(b, 4), f = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) f[i] = q[i] * sc;
    return f;
  }

  // ---------- The tagger ----------
  // opt.deep  : scan the whole track (default = the middle ~2 minutes). Also gives "first vocals at".
  // opt.cache : object that keeps ONNX sessions alive between tracks (batch mode).
  async function tagTrack(url, status, lv, opt) {
    opt = opt || {};
    const P = f => { try { opt.progress && opt.progress(Math.max(0, Math.min(1, f))); } catch (e) {} };
    P(0); await loadOrt();
    const low = !!(lv && lv.blob), r = { errors: [] }, own = [];
    const TF = ['tg_effnet', 'tg_hinst', 'tg_hvoice', 'tg_mel', 'tg_mn10'];
    for (let i = 0; i < TF.length; i++) { await ensureTagFile(TF[i], status, low, (g, t) => P(0.1 * (i + (t ? g / t : 0.5)) / TF.length)); P(0.1 * (i + 1) / TF.length); await tick(); }
    let hasGenre = true; try { await ensureTagFile('tg_hgenre', status, low); } catch (e) { hasGenre = false; }
    let hasStyleNet = false;
    if (!hasGenre) { try { await ensureTagFile('tg_effstyle', status, low); hasStyleNet = true; } catch (e) { r.errors.push('Styles model download failed: ' + e.message); } }
    let heads = await loadHeads(status, low, moodsOn(), f => P(0.10 + 0.10 * f));
    P(0.2); await tick();
    if (moodsOn() && headsLog.length) r.errors.push('Moods: ' + headsLog.join('; '));
    const S = async key => {
      if (opt.cache) return opt.cache[key] || (opt.cache[key] = await makeSession(key, false, lv));
      const s = await makeSession(key, false, lv); own.push(s); return s;
    };
    // 1) Discogs-EffNet (+ heads, tempo, key, vocal timeline, embedding)
    try {
      status('Listening (1 of 2)…');
      let x = await decodeMono(url, 16000);
      r.dur = x.length / 16000;
      const SEC = 140 * 16000; let off = 0;
      if (!opt.deep && x.length > SEC) { off = (x.length - SEC) >> 1; x = x.slice(off, off + SEC); }   // the middle ~2 minutes is plenty
      const whole = !!opt.deep || r.dur <= 142;
      status('Finding the key…'); await tick();
      try { const k = await chromaKey(x); if (k) { r.key = k.name; r.camelot = k.camelot; r.keyConf = k.conf; } } catch (e) { r.errors.push('Key: ' + e.message); }
      status('Analysing sound (1 of 2)…'); await tick();
      const mel = await effnetMel(x, parseNpy(await getPart('tg_mel'))); x = null;
      const nF = mel.length / 96;
      try { const t = tempoFromMel(mel, nF); if (t) { r.bpm = t.bpm; r.bpmConf = t.conf; } } catch (e) { r.errors.push('Tempo: ' + e.message); }
      const nP = nF >= 128 ? Math.floor((nF - 128) / 62) + 1 : 1, take = Math.min(nP, opt.deep ? 400 : 128);
      const idx = Array.from({ length: take }, (_, i) => Math.floor(i * nP / take));
      const eff = await S('tg_effnet'), hI = await S('tg_hinst'), hV = await S('tg_hvoice');
      const hG = hasGenre ? await S('tg_hgenre') : null;
      const sNet = hasStyleNet ? await S('tg_effstyle') : null;
      const hs = [], okHeads = [];
      for (const h of heads) { try { hs.push(await S('tgh_' + h.id)); okHeads.push(h); status('Loading mood models ' + okHeads.length + ' of ' + heads.length + '…'); P(0.2 + 0.05 * okHeads.length / heads.length); await tick(); } catch (e) { console.warn('mood head unusable', h.id, e); try { await idbDel('tgh_' + h.id); await idbDel('tghm_' + h.id); } catch (e2) {} headsMemo = null; } }
      const heads0 = heads; heads = okHeads; if (!okHeads.length && heads0.length) r.errors.push('Moods skipped: the mood models would not load (they will be re-downloaded next run).');
      const inst = new Float32Array(40), g400 = new Float32Array(400), embSum = new Float64Array(1280), hacc = heads.map(() => null), pv = [];
      let voice = 0, rows = 0, gotG = false;
      for (let b = 0; b < take; b += 64) {
        const cnt = Math.min(64, take - b), X = new Float32Array(64 * 128 * 96);      // the graph wants exactly 64 patches
        for (let i = 0; i < cnt; i++) { const s0 = idx[b + i] * 62 * 96; X.set(mel.subarray(s0, Math.min(mel.length, s0 + 128 * 96)), i * 128 * 96); }
        status('Listening… ' + Math.min(b + 64, take) + ' of ' + take + ' patches'); P(0.25 + 0.6 * b / take); await tick();
        const res = await eff.run({ [eff.inputNames[0]]: new ort.Tensor('float32', X, [64, 128, 96]) });
        let emb = null, p400 = null;
        for (const n of eff.outputNames) { const o = res[n], d = o.dims[o.dims.length - 1]; if (d === 1280) emb = o.data; else if (d === 400) p400 = o.data; }
        if (!emb) throw new Error('embedding output not found');
        const E = new ort.Tensor('float32', emb, [64, 1280]);
        const yi = (await hI.run({ [hI.inputNames[0]]: E }))[hI.outputNames[0]].data, yv = (await hV.run({ [hV.inputNames[0]]: E }))[hV.outputNames[0]].data;
        let yg = hG ? (await hG.run({ [hG.inputNames[0]]: E }))[hG.outputNames[0]].data : p400;
        if (!yg && sNet) {                                              // official Discogs-EffNet: dynamic batch, [n,128,96] in, 400 style activations out
          const rs = await sNet.run({ [sNet.inputNames[0]]: new ort.Tensor('float32', X.subarray(0, cnt * 128 * 96), [cnt, 128, 96]) });
          for (const n of sNet.outputNames) { const o = rs[n]; if (o.dims[o.dims.length - 1] === 400) { yg = new Float32Array(64 * 400); yg.set(o.data.subarray(0, cnt * 400)); break; } }
        }
        for (let j = 0; j < hs.length; j++) {
          if (!hs[j]) continue;
          let y; try { y = (await hs[j].run({ [hs[j].inputNames[0]]: E }))[hs[j].outputNames[0]].data; } catch (e) { console.warn('mood head failed', heads[j].id, e); hs[j] = null; continue; }
          const n = y.length / 64;
          if (!hacc[j]) hacc[j] = new Float64Array(n);
          for (let i = 0; i < cnt; i++) for (let c = 0; c < n; c++) hacc[j][c] += y[i * n + c];
        }
        for (let i = 0; i < cnt; i++) {
          for (let c = 0; c < 40; c++) inst[c] = Math.max(inst[c], yi[i * 40 + c]);
          voice += yv[i * 2 + 1]; pv.push(yv[i * 2 + 1]);                // classes: instrumental, voice
          for (let c = 0; c < 1280; c++) embSum[c] += emb[i * 1280 + c];
          if (yg) { gotG = true; for (let c = 0; c < 400; c++) g400[c] += yg[i * 400 + c]; }
        }
        rows += cnt; await tick();
      }
      r.voice = voice / rows;
      r.inst = INST40.map((n, i) => [n, inst[i]]);
      let nrm = 0; const em = new Float32Array(1280); for (let c = 0; c < 1280; c++) { em[c] = embSum[c] / rows; nrm += em[c] * em[c]; }
      nrm = Math.sqrt(nrm) || 1; for (let c = 0; c < 1280; c++) em[c] /= nrm; r.emb = em;
      if (gotG) {
        let lo = Infinity, hi = -Infinity; for (let c = 0; c < 400; c++) { g400[c] /= rows; lo = Math.min(lo, g400[c]); hi = Math.max(hi, g400[c]); }
        if (lo < 0 || hi > 1) for (let c = 0; c < 400; c++) g400[c] = 1 / (1 + Math.exp(-g400[c]));       // raw scores -> probabilities
        r.style = DISCOGS.map((n, i) => [n, g400[i]]);
      } else r.errors.push('Styles skipped: the styles model could not be downloaded or has no 400-style output.');
      r.heads = {};
      heads.forEach((h, j) => {
        if (!hacc[j]) return;
        const p = Array.from(hacc[j], v => v / rows); let lo = Infinity, hi = -Infinity; p.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
        if (lo < 0 || hi > 1) for (let c = 0; c < p.length; c++) p[c] = 1 / (1 + Math.exp(-p[c]));
        r.heads[h.id] = { label: h.label, kind: h.kind, group: h.group, classes: h.classes, pos: h.pos, p };
      });
      if (!heads.length && moodsOn()) r.errors.push('Moods skipped: the mood models could not be downloaded.');
      // when the singing starts and stops (only meaningful if we looked at the whole track)
      if (whole && pv.length >= 3) {
        const sm = pv.map((v, i) => ((pv[i - 1] != null ? pv[i - 1] : v) + v + (pv[i + 1] != null ? pv[i + 1] : v)) / 3), tm = i => off / 16000 + idx[i] * 62 * 256 / 16000;
        let a = -1, z = -1; for (let i = 0; i < sm.length - 1; i++) if (sm[i] >= 0.5 && sm[i + 1] >= 0.5) { a = i; break; }
        for (let i = sm.length - 1; i >= 0; i--) if (sm[i] >= 0.5) { z = i; break; }
        if (a >= 0) { r.firstVocal = Math.max(0, tm(a)); r.lastVocal = tm(z) + 2; }
        r.whole = true;
      }
    } catch (e) { console.error(e); r.errors.push('EffNet: ' + e.message); }
    finally { own.forEach(s => s.release && s.release()); own.length = 0; }
    // 2) AudioSet tagger
    try {
      status('Listening (2 of 2)…');
      let x = await decodeMono(url, 32000);
      const W = 160000, nW = Math.max(1, Math.min(6, Math.floor(x.length / W))), probs = new Float32Array(527);
      const sess = await S('tg_mn10');
      try {
        for (let w = 0; w < nW; w++) {
          const wav = new Float32Array(W), st = x.length > W ? Math.floor((x.length - W) * (w + 0.5) / nW) : 0;
          wav.set(x.subarray(st, st + W));
          const y = (await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', wav, [1, W]) }))[sess.outputNames[0]].data;
          for (let c = 0; c < 527; c++) probs[c] += y[c] / nW;
          status('Listening (2 of 2)… ' + (w + 1) + ' of ' + nW); P(0.85 + 0.15 * (w + 1) / nW); await tick();
        }
      } finally { own.forEach(s => s.release && s.release()); own.length = 0; }
      x = null;
      const pick = (lo, hi) => { const o = []; for (let i = lo; i <= hi; i++) o.push([AUDIOSET[i], probs[i]]); return o; };
      r.genre = pick(AS_GENRE[0], AS_GENRE[1]); r.mood = pick(AS_MOOD[0], AS_MOOD[1]); r.music = probs[137];
      r.inst2 = []; for (let i = 140; i <= 213; i++) if (asInst(i)) r.inst2.push([AUDIOSET[i], probs[i]]);
    } catch (e) { console.error(e); r.errors.push('AudioSet: ' + e.message); }
    P(1);
    return r;
  }
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function fmtTags(r) {
    const pct = p => Math.round(p * 100) + '%', top = (a, n, min) => a.filter(v => v[1] >= min).sort((u, v) => v[1] - u[1]).slice(0, n).map(v => v[0] + ' ' + pct(v[1])).join(', ') || 'none';
    const L = [];
    if (r.music != null && r.music < 0.3) L.push('Mostly not music (' + pct(r.music) + ')');
    if (r.bpm || r.key) L.push([r.bpm ? 'Tempo: ' + r.bpm + ' BPM' : '', r.key ? 'Key: ' + r.key + ' (' + r.camelot + ')' : ''].filter(Boolean).join(' · '));
    if (r.voice != null) L.push((r.voice >= 0.5 ? 'Vocals: yes (' + pct(r.voice) + ')' : 'Instrumental (' + pct(1 - r.voice) + ')') + (r.firstVocal != null ? ' · first vocals at ' + mmss(r.firstVocal) : ''));
    if (r.style) L.push('Style: ' + top(r.style, 4, 0.05));
    if (r.genre) L.push('Genre: ' + top(r.genre, 3, 0.08));
    if (r.mood) L.push('Mood: ' + top(r.mood, 2, 0.08));
    const hd = Object.values(r.heads || {}), bin = hd.filter(h => h.kind === 'binary').map(h => [h.label, h.p[h.pos]]);
    if (bin.length) L.push('Feels: ' + top(bin, 5, 0.5));
    hd.filter(h => h.kind !== 'binary' && h.group !== 'gender').forEach(h => L.push(h.label + ': ' + top(h.p.map((p, i) => [h.classes[i], p]), 4, 0.1)));
    const g = hd.find(h => h.group === 'gender'); if (g && r.voice >= 0.5) L.push('Voice: ' + top(g.p.map((p, i) => [g.classes[i], p]), 1, 0.5));
    if (r.inst) L.push('Instruments: ' + top(r.inst, 6, 0.4));
    if (r.inst2) L.push('Also heard: ' + top(r.inst2, 6, 0.2));
    (r.errors || []).forEach(e => L.push('! ' + e));
    return L.join('\n') || 'Nothing found.';
  }

  // ---------- Saved tags (small, in localStorage) ----------
  const TAGS_KEY = 'ppTagsV2';
  let tagStore = null, tagVer = 0;
  const loadTags = () => { if (tagStore) return tagStore; try { tagStore = JSON.parse(localStorage.getItem(TAGS_KEY)) || {}; } catch (e) { tagStore = {}; } return tagStore; };
  const saveTagStore = () => { tagVer++; try { localStorage.setItem(TAGS_KEY, JSON.stringify(tagStore)); return true; } catch (e) { return false; } };
  function compactTags(r) {
    const top = (a, n, min) => (a || []).filter(v => v[1] >= min).sort((u, v) => v[1] - u[1]).slice(0, n).map(v => [v[0], Math.round(v[1] * 100)]);
    const c = { ts: Date.now() };
    if (r.voice != null) c.v = Math.round(r.voice * 100);
    if (r.music != null) c.mu = Math.round(r.music * 100);
    if (r.bpm) c.bpm = r.bpm;
    if (r.key) { c.key = r.key; c.ck = r.camelot; }
    if (r.firstVocal != null) { c.fv = Math.round(r.firstVocal); c.lv = Math.round(r.lastVocal); }
    if (r.dur) c.d = Math.round(r.dur);
    if (r.whole) c.w = 1;
    if (r.style) {
      const par = {}; r.style.forEach(([n, p]) => { const m = n.match(/\(([^)]*)\)$/), g = m ? m[1] : n; par[g] = Math.max(par[g] || 0, p); });
      c.gp = top(Object.entries(par), 3, 0.1); c.st = top(r.style, 5, 0.05);
    }
    c.gn = top(r.genre, 3, 0.08); c.md = top(r.mood, 3, 0.08);
    const ins = {}; (r.inst || []).forEach(([n, p]) => { if (p >= 0.4) ins[n] = p; }); (r.inst2 || []).forEach(([n, p]) => { if (p >= 0.2) ins[n] = Math.max(ins[n] || 0, p); });
    c.in = top(Object.entries(ins), 8, 0);
    c.hd = {}; c.hm = {};
    Object.entries(r.heads || {}).forEach(([id, h]) => {
      if (h.kind === 'binary') c.hd[id] = Math.round(h.p[h.pos] * 100);
      else c.hm[id] = top(h.p.map((p, i) => [h.classes[i], p]), 5, 0.1);
    });
    return c;
  }
  async function persistTags(dbId, r, autoEq) {
    const old = loadTags()[dbId], c = compactTags(r);
    if (autoEq) {
      const name = eqPresetFor(c), A = window.__ppApi;
      let eqs = {}; try { eqs = JSON.parse(localStorage.getItem('playerTrackEq')) || {}; } catch (e) {}
      if (name && A && A.setTrackEqPreset && (!eqs[dbId] || (old && old.ae))) { if (A.setTrackEqPreset(dbId, name)) c.ae = name; }
    } else if (old && old.ae) c.ae = old.ae;
    loadTags()[dbId] = c;
    const ok = saveTagStore();
    if (r.emb) { try { await saveEmb(dbId, r.emb); } catch (e) { console.warn('embedding not saved', e); } }
    return ok;
  }

  // ---------- What the tags mean ----------
  const PARENT_EQ = { 'Rock': 'rock', 'Electronic': 'electronic', 'Hip Hop': 'hiphop', 'Jazz': 'jazz', 'Classical': 'classical', 'Pop': 'pop', 'Folk, World, & Country': 'acoustic', 'Funk / Soul': 'pop', 'Blues': 'jazz', 'Reggae': 'bass', 'Latin': 'pop', 'Stage & Screen': 'classical', "Children's": 'pop', 'Brass & Military': 'classical', 'Non-Music': 'podcast' };
  const AS_EQ = { 'Pop music': 'pop', 'Hip hop music': 'hiphop', 'Rock music': 'rock', 'Heavy metal': 'rock', 'Punk rock': 'rock', 'Grunge': 'rock', 'Progressive rock': 'rock', 'Rock and roll': 'rock', 'Psychedelic rock': 'rock', 'Ska': 'rock', 'Rhythm and blues': 'pop', 'Soul music': 'pop', 'Funk': 'pop', 'Reggae': 'bass', 'Country': 'acoustic', 'Bluegrass': 'acoustic', 'Folk music': 'acoustic', 'Jazz': 'jazz', 'Swing music': 'jazz', 'Blues': 'jazz', 'Classical music': 'classical', 'Opera': 'classical', 'Electronic music': 'electronic', 'House music': 'electronic', 'Techno': 'electronic', 'Dubstep': 'electronic', 'Drum and bass': 'electronic', 'Electronica': 'electronic', 'Electronic dance music': 'electronic', 'Trance music': 'electronic', 'Disco': 'electronic', 'Ambient music': 'latenight' };
  function eqPresetFor(c) {
    if (c.mu != null && c.mu < 30) return 'podcast';
    const gp = (c.gp || [])[0]; if (gp && gp[1] >= 20 && PARENT_EQ[gp[0]]) return PARENT_EQ[gp[0]];
    const gn = (c.gn || [])[0]; if (gn && AS_EQ[gn[0]]) return AS_EQ[gn[0]];
    return null;
  }
  function vibes(c) {
    const h = c.hd || {}, md = {}, gn = {}; (c.md || []).forEach(x => md[x[0]] = x[1]); (c.gn || []).forEach(x => gn[x[0]] = x[1]);
    const g = (o, k) => o[k] || 0, ins = (c.in || []).map(x => x[0]), bpm = c.bpm || 0;
    const relaxed = h.relaxed != null ? h.relaxed : (g(md, 'Tender music') >= 25 || g(gn, 'Ambient music') >= 25 || g(gn, 'New-age music') >= 25 ? 70 : 0);
    const agg = h.aggressive != null ? h.aggressive : (g(md, 'Angry music') >= 25 ? 70 : 0);
    const party = h.party != null ? h.party : (g(md, 'Exciting music') >= 25 ? 65 : 0);
    const happy = h.happy != null ? h.happy : (g(md, 'Happy music') >= 25 ? 65 : 0);
    const sad = h.sad != null ? h.sad : (g(md, 'Sad music') >= 25 ? 65 : 0);
    const out = [], instr = c.v != null && c.v < 40, music = c.mu == null || c.mu >= 30;
    if (!music) { out.push('speech'); return out; }
    out.push(instr ? 'instrumental' : 'vocals');
    if (relaxed >= 60 || (bpm && bpm < 90 && agg < 40 && party < 50)) out.push('chill');
    if (party >= 55 || (h.danceable || 0) >= 65) out.push('party');
    if ((agg >= 55 || party >= 60 || (h.danceable || 0) >= 70) && bpm >= 115) out.push('workout');
    if (bpm >= 145 && agg >= 35) out.push('workout');
    if (happy >= 60) out.push('happy');
    if (sad >= 60) out.push('sad');
    if (agg >= 60) out.push('aggressive');
    if (instr && (relaxed >= 45 || (bpm && bpm < 115)) && agg < 40) out.push('focus');
    if (instr && relaxed >= 60 && (!bpm || bpm < 90)) out.push('sleep');
    if ((h.acoustic || 0) >= 60 || (ins.some(n => /acoustic|classicalguitar|piano|strings|cello|violin/.test(n)) && (h.electronic || 0) < 50 && !ins.includes('synthesizer'))) out.push('acoustic');
    if (bpm) out.push(bpm < 90 ? 'slow' : bpm < 120 ? 'mid-tempo' : bpm < 150 ? 'fast' : 'very-fast');
    return out;
  }
  const SMART = [
    { id: 'instr', name: 'Instrumentals', test: (c, v) => v.includes('instrumental') },
    { id: 'vocals', name: 'With vocals', test: (c, v) => v.includes('vocals') },
    { id: 'chill', name: 'Chill', test: (c, v) => v.includes('chill') },
    { id: 'party', name: 'Party / dance', test: (c, v) => v.includes('party') },
    { id: 'workout', name: 'Workout', test: (c, v) => v.includes('workout') },
    { id: 'happy', name: 'Happy', test: (c, v) => v.includes('happy') },
    { id: 'sad', name: 'Sad', test: (c, v) => v.includes('sad') },
    { id: 'focus', name: 'Focus', test: (c, v) => v.includes('focus') },
    { id: 'sleep', name: 'Sleep', test: (c, v) => v.includes('sleep') },
    { id: 'acoustic', name: 'Acoustic', test: (c, v) => v.includes('acoustic') },
    { id: 'slow', name: 'Slow (under 90 BPM)', test: (c, v) => v.includes('slow') },
    { id: 'mid', name: 'Mid-tempo (90-120 BPM)', test: (c, v) => v.includes('mid-tempo') },
    { id: 'fast', name: 'Fast (120-150 BPM)', test: (c, v) => v.includes('fast') },
    { id: 'rush', name: 'Very fast (150+ BPM)', test: (c, v) => v.includes('very-fast') },
    { id: 'speech', name: 'Speech / podcasts', test: (c, v) => v.includes('speech') }
  ];
  function tagWords(c) {
    const w = vibes(c);
    if (c.bpm) w.push('bpm' + c.bpm, c.bpm + 'bpm');
    if (c.key) w.push(c.key.toLowerCase(), c.ck.toLowerCase());
    (c.gp || []).forEach(x => w.push(x[0].toLowerCase())); (c.st || []).forEach(x => w.push(x[0].toLowerCase())); (c.gn || []).forEach(x => w.push(x[0].toLowerCase()));
    (c.md || []).forEach(x => w.push(x[0].toLowerCase())); (c.in || []).forEach(x => w.push(x[0].toLowerCase()));
    Object.entries(c.hd || {}).forEach(([id, p]) => { if (p >= 60) w.push(id.replace(/^mood_/, '').replace(/_/g, ' ')); });
    Object.values(c.hm || {}).forEach(a => a.forEach(x => w.push(x[0].toLowerCase().replace(/_/g, ' '))));
    return w.join(' ');
  }
  // Used by the search box in index.html: tag words + lyrics/subtitle text of a track.
  const strip = s => String(s).replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, ' ');
  let txtAt = 0, txtSig = '', txtTags = new Map(), txtLyr = new Map(), txtTagVer = -1;
  window.__ppTagText = id => {
    const now = Date.now();
    if (now - txtAt > 1500 || txtTagVer !== tagVer) {
      txtAt = now;
      let l1 = '', l2 = ''; try { l1 = localStorage.getItem('playerLyricsV1') || ''; l2 = localStorage.getItem('playerSubtitles') || ''; } catch (e) {}
      const sig = l1.length + ':' + l2.length;
      if (sig !== txtSig) {
        txtSig = sig; txtLyr.clear();
        try { const o = JSON.parse(l1) || {}; for (const k in o) txtLyr.set(k, strip(o[k]).toLowerCase().slice(0, 8000)); } catch (e) {}
        try { const o = JSON.parse(l2) || {}; for (const k in o) { const v = o[k], cues = Array.isArray(v) ? v.map(c => c.text) : (v && v.c ? v.c.map(c => c[2]) : []); txtLyr.set(k, ((txtLyr.get(k) || '') + ' ' + cues.join(' ').toLowerCase()).slice(0, 8000)); } } catch (e) {}
      }
      if (txtTagVer !== tagVer) { txtTagVer = tagVer; txtTags.clear(); }
    }
    const k = String(id);
    let t = txtTags.get(k); if (t == null) { const c = loadTags()[k]; t = c ? tagWords(c) : ''; txtTags.set(k, t); }
    return t + ' ' + (txtLyr.get(k) || '');
  };

  // ---------- "More like this" ----------
  const camOk = (a, b) => {
    if (!a || !b) return false; const na = parseInt(a, 10), nb = parseInt(b, 10), la = a.slice(-1), lb = b.slice(-1);
    return na === nb || (la === lb && (Math.abs(na - nb) === 1 || Math.abs(na - nb) === 11));
  };
  const bpmNear = (a, b, tol) => a && b && [1, 2, 0.5].some(m => Math.abs(a * m - b) / b <= tol);
  async function similarTo(curIdx, mode) {
    const A = window.__ppApi, tr = A.tracks(), tags = loadTags();
    const embs = await Promise.all(tr.map(t => loadEmb(t.dbId).catch(() => null)));
    if (!embs[curIdx]) throw new Error('Tag this track first.');
    const have = tr.map((_, i) => i).filter(i => embs[i]);
    const mean = new Float32Array(1280); have.forEach(i => { for (let c = 0; c < 1280; c++) mean[c] += embs[i][c] / have.length; });
    const norm = i => { const v = new Float32Array(1280); let n = 0; for (let c = 0; c < 1280; c++) { v[c] = embs[i][c] - mean[c]; n += v[c] * v[c]; } n = Math.sqrt(n) || 1; for (let c = 0; c < 1280; c++) v[c] /= n; return v; };
    const q = norm(curIdx), cur = tags[tr[curIdx].dbId] || {};
    let list = have.filter(i => i !== curIdx).map(i => { const v = norm(i); let s = 0; for (let c = 0; c < 1280; c++) s += q[c] * v[c]; return { i, s, c: tags[tr[i].dbId] || {} }; });
    if (mode === 'tempo') list = list.filter(o => cur.bpm && bpmNear(o.c.bpm, cur.bpm, 0.08));
    if (mode === 'mix') {
      list = list.filter(o => cur.bpm && bpmNear(o.c.bpm, cur.bpm, 0.06) && camOk(cur.ck, o.c.ck));
      list.forEach(o => { o.s += 0.3 - Math.abs(o.c.bpm - cur.bpm) / cur.bpm; });
    }
    return list.sort((a, b) => b.s - a.s).map(o => o.i);
  }

  // ---------- Lyrics / subtitles with Whisper (transformers.js, runs on-device) ----------
  // The library and the model files come from jsDelivr / Hugging Face on first use and are cached by the browser.
  const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js';
  const WH = { tiny: ['Xenova/whisper-tiny', 'Tiny (~40 MB, fastest)'], base: ['Xenova/whisper-base', 'Base (~75 MB, better)'], small: ['Xenova/whisper-small', 'Small (~250 MB, best, slow)'] };
  const LANGS = [['', 'Auto-detect'], ['english', 'English'], ['spanish', 'Spanish'], ['french', 'French'], ['german', 'German'], ['italian', 'Italian'], ['portuguese', 'Portuguese'], ['dutch', 'Dutch'], ['russian', 'Russian'], ['polish', 'Polish'], ['turkish', 'Turkish'], ['arabic', 'Arabic'], ['hindi', 'Hindi'], ['japanese', 'Japanese'], ['korean', 'Korean'], ['chinese', 'Chinese'], ['indonesian', 'Indonesian'], ['swedish', 'Swedish'], ['ukrainian', 'Ukrainian']];
  let tfMod = null, asr = null, asrId = '';
  async function getAsr(id, status) {
    if (asr && asrId === id) return asr;
    if (asr) { try { await asr.dispose(); } catch (e) {} asr = null; asrId = ''; }
    if (!tfMod) { status('Loading Whisper…'); tfMod = await import(TF_URL); }
    asr = await tfMod.pipeline('automatic-speech-recognition', id, {
      progress_callback: p => { if (p && p.status === 'progress' && p.file) status('Downloading ' + p.file.split('/').pop() + ' ' + Math.round(p.progress || 0) + '%'); else if (p && p.status === 'ready') status('Whisper ready.'); }
    });
    asrId = id; return asr;
  }
  const pad2 = n => String(n).padStart(2, '0');
  const toLrc = cues => cues.map(c => '[' + pad2(Math.floor(c.start / 60)) + ':' + (c.start % 60).toFixed(2).padStart(5, '0') + ']' + c.text).join('\n');
  const srtT = s => { const ms = Math.round(s * 1000); return pad2(Math.floor(ms / 3600000)) + ':' + pad2(Math.floor(ms / 60000) % 60) + ':' + pad2(Math.floor(ms / 1000) % 60) + ',' + String(ms % 1000).padStart(3, '0'); };
  const toSrt = cues => cues.map((c, i) => (i + 1) + '\n' + srtT(c.start) + ' --> ' + srtT(c.end) + '\n' + c.text + '\n').join('\n');
  // Whisper invents text over silence and music. Drop the usual junk and runs of the same line.
  function cleanCues(raw, dur) {
    const out = [];
    for (const c of raw) {
      let t = String(c.text || '').replace(/[♪♫]+/g, ' ').replace(/\[[^\]]*(music|silence|applause|laughter)[^\]]*\]|\([^)]*(music|silence|applause|laughter)[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim();
      if (t.length < 2 || /^(thanks for watching|thank you\.?$|subtitles by|subtitle by|amara\.org|please subscribe)/i.test(t)) continue;
      out.push({ start: c.start, end: c.end, text: t });
    }
    const res = []; let run = 0;
    for (let i = 0; i < out.length; i++) {
      run = i && out[i].text.toLowerCase() === out[i - 1].text.toLowerCase() ? run + 1 : 1;
      if (run >= 3) continue;
      res.push(out[i]);
    }
    res.forEach((c, i) => { const nx = res[i + 1]; if (!(c.end > c.start)) c.end = nx ? Math.min(nx.start, c.start + 6) : c.start + 3; if (dur) c.end = Math.min(c.end, dur); });
    return res;
  }
  // o: {size, lang, task, clean, model, strength, lv}. Returns [{start,end,text}].
  async function transcribe(t, o, status) {
    const pipe = await getAsr(WH[o.size][0], status);
    let x;
    if (o.clean) {                                                    // pull the vocals out first: far fewer made-up lines on songs
      await downloadModel(o.model, status, !!(o.lv && o.lv.blob));
      status('Decoding audio…'); let pcm = await decode(t.url);
      const res = await run(o.model, pcm, ['Vocals'], { strength: o.strength, gpu: false, lv: o.lv, quality: 1, gate: 0 }, status, f => status('Separating vocals… ' + Math.round(f * 100) + '%'));
      pcm = null; const e = res.Vocals.blob ? res.Vocals : encode(res.Vocals);
      const u = URL.createObjectURL(e.blob); try { x = await decodeMono(u, 16000); } finally { URL.revokeObjectURL(u); }
    } else { status('Decoding audio…'); x = await decodeMono(t.url, 16000); }
    const dur = x.length / 16000, SL = 300 * 16000, raw = [];
    for (let off = 0; off < x.length; off += SL) {
      status('Transcribing… ' + Math.round(off / x.length * 100) + '%'); await tick();
      const kw = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, task: o.task || 'transcribe' };
      if (o.lang) kw.language = o.lang;
      const out = await pipe(x.subarray(off, Math.min(x.length, off + SL)), kw);
      for (const c of (out.chunks || [])) {
        const a = c.timestamp && c.timestamp[0] != null ? c.timestamp[0] : 0, b = c.timestamp && c.timestamp[1] != null ? c.timestamp[1] : null;
        raw.push({ start: a + off / 16000, end: b == null ? 0 : b + off / 16000, text: c.text });
      }
    }
    return cleanCues(raw, dur);
  }

  // ---------- Panel: library tools + lyrics ----------
  function smartUI(p, h) {
    const css = document.createElement('style');
    css.textContent = '#ppv-panel details,.ppv-scope details{margin-top:10px;border-top:1px solid #333;padding-top:8px}#ppv-panel summary,.ppv-scope summary{cursor:pointer;font-weight:600;padding:2px 0}#ppv-panel input[type=text],.ppv-scope input[type=text]{width:100%;box-sizing:border-box;margin-top:6px;padding:7px;border-radius:8px;background:#2a2b31;color:#eee;border:1px solid #444}#ppv-panel .ppv-note,.ppv-scope .ppv-note{opacity:.6;font-size:11px;margin-top:4px}#ppv-panel .ppv-out,.ppv-scope .ppv-out{margin-top:6px;font-size:12px;white-space:pre-wrap}#ppv-panel .ppv-row,.ppv-scope .ppv-row{display:flex;gap:6px}#ppv-panel .ppv-row button,.ppv-scope .ppv-row button{margin-top:8px}#ppv-panel .ppv-grid label,.ppv-scope .ppv-grid label{display:block;margin:4px 0}.ppv-scope{color:var(--text,#eee);font:13px system-ui,sans-serif;margin:8px 0;padding:0 2px}.ppv-scope button{width:100%;margin-top:8px;padding:9px;border-radius:8px;border:0;background:var(--accent,#7c3aed);color:#fff;font:600 13px system-ui}.ppv-scope button:disabled{opacity:.5}.ppv-scope button.ppv-sec{background:transparent;border:1px solid var(--line,#555);color:inherit;font-weight:500;font-size:12px;padding:6px}.ppv-scope select{width:100%;margin-top:6px;padding:7px;border-radius:8px;background:var(--bg,#2a2b31);color:inherit;border:1px solid var(--line,#444)}.ppv-scope label.ppv-c{display:inline-block;margin:6px 10px 0 0}.ppv-scope details{border-top-color:var(--line,#333)}.ppv-pbar{height:6px;background:var(--line,#333);border-radius:3px;margin-top:8px}.ppv-pbar i{display:block;height:100%;width:0;background:var(--accent,#7c3aed);border-radius:3px}';
    document.head.appendChild(css);
    const d1 = document.createElement('details'), d2 = document.createElement('details');
    d1.innerHTML = '<summary>Library tools (tags)</summary>' +
      '<div id="ppv-count" class="ppv-note"></div>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-deep"> Scan the whole track (slower, finds first vocals)</label>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-moods"> Mood models (8 tiny files, ~4 MB, downloaded once)</label>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-aeq"> Auto-EQ from genre when tagging</label>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-askip"> Skip long intros (needs whole-track tags)</label>' +
'<details id="ppv-bgd"><summary>Background tagging &amp; surprise playlists</summary>' +
      '<div class="ppv-note">Runs only while this page is open and you are away.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-bg"> Tag untagged tracks while I am away</label>' +
      '<select id="ppv-bgidle"><option value="1">Away = 1 minute idle</option><option value="5">Away = 5 minutes idle</option><option value="15">Away = 15 minutes idle</option></select>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-bgplay"> Also while music is playing</label>' +
      '<label class="ppv-c" id="ppv-bgchl" style="display:block"><input type="checkbox" id="ppv-bgchg"> Only while charging</label>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-live"> Keep smart playlists up to date as tracks get tagged</label>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-lmix"> Auto mixes: For You, Ones You May Like, Your Pattern (they change as you listen)</label>' +
      '<button id="ppv-lmixblk" class="ppv-sec">Block current track from auto mixes</button><div id="ppv-lmixlist" class="ppv-note"></div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-surp"> Assemble surprise playlists</label>' +
      '<select id="ppv-surpev"><option value="6">New surprise every 6 hours</option><option value="24">New surprise every day</option><option value="72">New surprise every 3 days</option><option value="168">New surprise every week</option></select>' +
      '<select id="ppv-surpmax"><option value="3">Keep the newest 3</option><option value="5">Keep the newest 5</option><option value="10">Keep the newest 10</option></select>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-surptab"> Show surprise playlists in the Playlists tab</label>' +
      '<div class="ppv-note">Off = library playlist selector only. Tap Keep on the reveal to stop one from being replaced.</div>' +
      '<button id="ppv-surpnow" class="ppv-sec">Surprise me now</button><div id="ppv-bgst" class="ppv-note"></div></details>' +
      '<div style="margin-top:10px"><b>Smart playlists</b></div><div id="ppv-smart" class="ppv-grid"></div>' +
      '<button id="ppv-mk">Create / update ticked playlists</button>' +
      '<input type="text" id="ppv-q" placeholder="Playlist from search, e.g. piano slow"><button id="ppv-mkq" class="ppv-sec">Make playlist from this search</button>' +
      '<div style="margin-top:10px"><b>More like this</b></div><select id="ppv-sim"><option value="sound">Similar sound</option><option value="tempo">Similar sound, same tempo</option><option value="mix">Mix-friendly (tempo + compatible key)</option></select>' +
      '<button id="ppv-simgo">Play more like the current track</button><button id="ppv-skipgo" class="ppv-sec">Jump to first vocals</button>' +
      '<button id="ppv-eqall" class="ppv-sec">Apply auto-EQ to all tagged tracks</button><button id="ppv-heads" class="ppv-sec">Refresh mood models</button>' +
      '<div id="ppv-lib" class="ppv-out"></div>';
    d2.innerHTML = '<summary>Lyrics &amp; subtitles (Whisper)</summary>' +
      '<select id="ppv-wsize">' + Object.entries(WH).map(([k, v]) => '<option value="' + k + '">' + v[1] + '</option>').join('') + '</select>' +
      '<select id="ppv-wlang">' + LANGS.map(l => '<option value="' + l[0] + '">' + l[1] + '</option>').join('') + '</select>' +
      '<select id="ppv-wtask"><option value="transcribe">Write what is said</option><option value="translate">Translate to English</option></select>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-wclean"> Remove the music first (better for songs, much slower)</label>' +
      '<div class="ppv-note">Songs get synced lyrics, videos get subtitles. The music-removal step uses the model chosen at the top of this panel.</div>' +
      '<button id="ppv-wgo">Transcribe current track</button><button id="ppv-wsrt" class="ppv-sec" style="display:none">Download .srt</button><button id="ppv-wfree" class="ppv-sec">Free up Whisper download</button>' +
      '<div id="ppv-wout" class="ppv-out"></div>';
    // AI tools no longer live in the one panel: tagging + smart playlists go to the Library tab, Whisper goes to captions (video) or Lyrics (songs)
    d1.querySelector('summary').textContent = 'AI tagging & smart playlists';
    d1.insertAdjacentHTML('afterbegin', '<div class="ppv-stx ppv-note">Ready</div><div class="ppv-pbar ppv-bar-tag"><i></i></div><select id="ppv-scope"><option value="cur">Tag: current track</option><option value="pick">Tag: a track I choose</option><option value="all">Tag: all tracks</option></select><select id="ppv-pick" style="display:none"></select><label class="ppv-c" id="ppv-redo-l" style="display:none"><input type="checkbox" id="ppv-redo"> Also redo tracks that already have tags</label><div class="ppv-row"><button id="ppv-tag">Tag current track</button><button id="ppv-stop" class="ppv-sec" style="display:none;width:auto;padding:6px 14px" data-keep="1">Stop</button></div><div id="ppv-tags" class="ppv-out"></div><details id="ppv-saved" open><summary>Tagged tracks <span id="ppv-scount" style="opacity:.6;font-weight:400"></span></summary><input type="text" id="ppv-ss" placeholder="Filter by title, artist or tag (e.g. piano, 120 bpm)"><select id="ppv-sf"><option value="all">Everything tagged</option><option value="audio">Songs</option><option value="video">Videos</option></select><div id="ppv-slist" class="ppv-note"></div></details>');
    d2.insertAdjacentHTML('afterbegin', '<div class="ppv-stx ppv-note">Ready</div><div class="ppv-pbar ppv-bar-wh"><i></i></div>');
    d2.style.borderTop = '0'; d2.style.marginTop = '4px';
    const libHost = document.createElement('div'); libHost.className = 'ppv-scope'; libHost.id = 'ppv-libhost'; libHost.appendChild(d1);
    const whHost = document.createElement('div'); whHost.className = 'ppv-scope'; whHost.id = 'ppv-whhost'; whHost.appendChild(d2);
    d1.open = false; d2.open = true;
    const pane = document.getElementById('sidebar-pane-playlist'), srow = document.getElementById('search-row');
    if (pane && srow) srow.after(libHost); else if (pane) pane.prepend(libHost); else p.appendChild(libHost);   // fallback: old panel
    const savedEl = d1.querySelector('#ppv-saved');
    const savedHost = document.createElement('div'); savedHost.className = 'ppv-scope'; savedHost.id = 'ppv-savedhost';
    savedHost.style.cssText = 'padding:0 20px 10px';
    savedHost.appendChild(savedEl); savedEl.style.marginTop = '0';
    libHost.after(savedHost);
    const capDrop = document.getElementById('subtitle-dropdown'), lyPane = document.querySelector('#extras-panel .pp-pane[data-pp="ly"]');
    // the Whisper block sits in whichever place fits the current track: captions menu for video, Lyrics tab for songs
    const placeWhisper = where => {
      if (where === 'cap' && capDrop) { if (whHost.parentNode !== capDrop) { capDrop.appendChild(document.createElement('hr')); capDrop.appendChild(whHost); } }
      else if (where === 'ly' && lyPane) { if (whHost.parentNode !== lyPane) lyPane.appendChild(whHost); }
    };
    const curKind = () => { const a = window.__ppApi, t = a && a.tracks()[a.currentIndex()]; return t ? t.kind : null; };
    placeWhisper('cap');
    if (!capDrop && !lyPane) p.appendChild(whHost);
    const sb = document.getElementById('subtitle-btn'), eb = document.getElementById('extras-btn');
    if (sb) sb.addEventListener('click', () => placeWhisper('cap'), true);
    if (eb) eb.addEventListener('click', () => { if (curKind() !== 'video') placeWhisper('ly'); }, true);
    const $ = s => document.querySelector(s), A = () => window.__ppApi, cur = () => { const a = A(); return a && a.tracks()[a.currentIndex()]; };
    const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} };
    let isBusy = false;
    const busy = on => { isBusy = on; document.querySelectorAll('#ppv-panel button, .ppv-scope button').forEach(b => { if (!b.dataset.keep && !b.classList.contains('ppv-x')) b.disabled = on; }); };
    const deep = $('#ppv-deep'), aeq = $('#ppv-aeq'), ask = $('#ppv-askip'), lib = $('#ppv-lib'), cnt = $('#ppv-count');
    const mo = $('#ppv-moods'); mo.checked = moodsOn(); mo.onchange = () => ls('ppvMoods', mo.checked ? '1' : '0');
    deep.checked = ls('ppvDeep') === '1'; aeq.checked = ls('ppvAutoEq') === '1'; ask.checked = ls('ppvAutoSkip') === '1';
    deep.onchange = () => ls('ppvDeep', deep.checked ? '1' : '0'); aeq.onchange = () => ls('ppvAutoEq', aeq.checked ? '1' : '0'); ask.onchange = () => ls('ppvAutoSkip', ask.checked ? '1' : '0');
    const lst = a => (a || []).map(v => v[0] + ' ' + v[1] + '%').join(', ');
    const fmtStored = c => {                                           // saved (compact) tags -> readable lines
      const L = [];
      if (c.bpm || c.key) L.push([c.bpm ? 'Tempo: ' + c.bpm + ' BPM' : '', c.key ? 'Key: ' + c.key + (c.ck ? ' (' + c.ck + ')' : '') : ''].filter(Boolean).join(' · '));
      if (c.v != null) L.push((c.v >= 50 ? 'Vocals: yes (' + c.v + '%)' : 'Instrumental (' + (100 - c.v) + '%)') + (c.fv != null ? ' · first vocals at ' + mmss(c.fv) : ''));
      if (c.gp && c.gp.length) L.push('Genre: ' + lst(c.gp));
      if (c.st && c.st.length) L.push('Style: ' + lst(c.st));
      if (c.gn && c.gn.length) L.push('Also sounds like: ' + lst(c.gn));
      if (c.md && c.md.length) L.push('Mood: ' + lst(c.md));
      const feels = Object.entries(c.hd || {}).filter(e => e[1] >= 50).sort((u, v) => v[1] - u[1]).map(e => [e[0].replace(/^mood_/, '').replace(/_/g, ' '), e[1]]);
      if (feels.length) L.push('Feels: ' + lst(feels.slice(0, 6)));
      if (c.in && c.in.length) L.push('Instruments: ' + lst(c.in));
      Object.entries(c.hm || {}).forEach(([id, a]) => { if (a && a.length) L.push(id.replace(/_/g, ' ') + ': ' + lst(a)); });
      if (c.d) L.push('Length: ' + mmss(c.d) + (c.w ? ' (whole track scanned)' : ''));
      if (c.ts) L.push('Tagged ' + new Date(c.ts).toLocaleDateString());
      return L.join('\n') || 'No details saved.';
    };
    let savedLimit = 100;
    const renderSaved = () => {
      const a = A(), box = $('#ppv-slist'), f = $('#ppv-sf').value; if (!a || !box) return;
      const q = ($('#ppv-ss').value || '').trim().toLowerCase(), words = q ? q.split(/\s+/) : [];
      const tg = loadTags(), vidOk = ls('ppvShowVid') !== '0', all = a.tracks().filter(t => tg[t.dbId] && (vidOk || t.kind !== 'video') && (f === 'all' || (f === 'video') === (t.kind === 'video')));
      const rows = words.length ? all.filter(t => { const hay = (t.title + ' ' + t.artist + ' ' + tagWords(tg[t.dbId])).toLowerCase(); return words.every(w => hay.includes(w)); }) : all;
      $('#ppv-scount').textContent = '(' + (words.length ? rows.length + ' of ' + all.length : all.length) + ')';
      box.textContent = '';
      if (!rows.length) { box.textContent = words.length ? 'No tagged tracks match that.' : (f === 'video' ? 'No tagged videos yet. Pick a video with the Tag button above.' : 'Nothing tagged yet. Use the tag buttons above.'); return; }
      rows.slice(0, savedLimit).forEach(t => {
        const c = tg[t.dbId], row = document.createElement('div'), head = document.createElement('div'), body = document.createElement('div');
        row.style.cssText = 'border-top:1px solid var(--line,#333);padding:6px 0;cursor:pointer';
        head.innerHTML = '<b></b><div style="opacity:.7;font-size:11px"></div>';
        head.firstChild.textContent = (t.kind === 'video' ? '🎬 ' : '🎵 ') + (t.artist && !/^(Unknown artist|Video|Stream)$/.test(t.artist) ? t.artist + ' – ' : '') + t.title;
        head.lastChild.textContent = [c.bpm ? c.bpm + ' BPM' : '', c.key || '', c.gp && c.gp[0] ? c.gp[0][0] : '', c.st && c.st[0] ? c.st[0][0].replace(/ \(.*\)$/, '') : '', c.md && c.md[0] ? c.md[0][0] : '', c.v != null ? (c.v >= 50 ? 'vocals' : 'instrumental') : ''].filter(Boolean).join(' · ') || 'tagged';
        body.style.cssText = 'display:none;white-space:pre-wrap;font-size:12px;margin-top:6px'; body.textContent = fmtStored(c);
        const play = document.createElement('button'); play.className = 'ppv-sec'; play.textContent = 'Play this track'; play.style.display = 'none';
        play.onclick = ev => { ev.stopPropagation(); const i = a.tracks().indexOf(t); if (i >= 0) a.play(i, a.tracks().map((_, k) => k)); };
        row.onclick = () => { const open = body.style.display === 'none'; body.style.display = open ? 'block' : 'none'; play.style.display = open ? 'block' : 'none'; };
        row.append(head, body, play); box.appendChild(row);
      });
      if (rows.length > savedLimit) { const m = document.createElement('button'); m.className = 'ppv-sec'; m.textContent = 'Show more (' + (rows.length - savedLimit) + ' left)'; m.onclick = () => { savedLimit += 100; renderSaved(); }; box.appendChild(m); }
    };
    const refreshCount = () => { const a = A(); if (!a) return; try { syncSmartLive(); } catch (e) {} const tg = loadTags(), n = a.tracks().filter(t => tg[t.dbId]).length; cnt.textContent = n + ' of ' + a.tracks().length + ' tracks tagged'; renderSmart(); try { renderSaved(); } catch (e) {} };
    function renderSmart() {
      const a = A(), tg = loadTags(), box = $('#ppv-smart'); if (!a) return;
      const ticked = new Set([...box.querySelectorAll('input:checked')].map(i => i.value));
      const rows = a.tracks().map(t => tg[t.dbId]).filter(Boolean).map(c => [c, vibes(c)]);
      box.innerHTML = SMART.map(s => '<label><input type="checkbox" value="' + s.id + '"' + (ticked.has(s.id) ? ' checked' : '') + '> ' + s.name + ' <span style="opacity:.6">(' + rows.filter(r => s.test(r[0], r[1])).length + ')</span></label>').join('');
    }
    d1.addEventListener('toggle', () => { if (d1.open) refreshCount(); });
    $('#ppv-saved').addEventListener('toggle', () => { if ($('#ppv-saved').open) renderSaved(); }); $('#ppv-sf').onchange = () => { savedLimit = 100; renderSaved(); }; $('#ppv-ss').oninput = () => { savedLimit = 100; renderSaved(); };
    $('#ppv-heads').onclick = async () => { await resetHeads(); h.status('Mood models will be downloaded again on the next tagging run.'); };

    // single track tagging (replaces the old button behaviour so results are kept)
    h.tagBtn = $('#ppv-tag'); h.tagOut = $('#ppv-tags');
    const tagOne = async t0 => {
      busy(true); h.tagOut.textContent = '';
      let last = Date.now(), lastTxt = '', stalled = false;               // if nothing reports progress for 90 s, unlock the buttons and say where it stopped
      const stat = t => { last = Date.now(); lastTxt = t; if (!stalled) h.status(t); };
      const iv = setInterval(() => { if (!stalled && Date.now() - last > 90000) { stalled = true; busy(false); h.status('Stalled at "' + lastTxt + '". Buttons unlocked. Try again, or untick Mood models.'); } }, 3000);
      try {
        const t = t0 || cur(); if (!t) throw new Error('Play or select a track first.');
        h.prog(0);
        const r = await tagTrack(t.url, stat, h.LV(), { deep: deep.checked, progress: f => { last = Date.now(); h.prog(f); } });
        const ok = await persistTags(t.dbId, r, aeq.checked);
        h.tagOut.textContent = fmtTags(r) + (ok ? '' : '\n! Could not save the tags (storage is full).'); h.status('Tagged and saved.'); refreshCount();
      } catch (e) { console.error(e); h.status('Error: ' + e.message); }
      clearInterval(iv); busy(false);
    };

    // scope: current track / a track you pick / all tracks
    const scope = $('#ppv-scope'), pick = $('#ppv-pick'), redoL = $('#ppv-redo-l');
    const fillPick = () => {
      const a = A(); if (!a) return; const keep = pick.value, ci = a.currentIndex(), tl = a.tracks(), tg = loadTags();
      pick.textContent = '';
      tl.forEach((t, i) => { const o = document.createElement('option'); o.value = String(t.dbId); o.textContent = (tg[t.dbId] ? '✓ ' : '') + (t.artist ? t.artist + ' – ' : '') + t.title; pick.appendChild(o); if (!keep && i === ci) o.selected = true; });
      if (keep && [...pick.options].some(o => o.value === keep)) pick.value = keep;
    };
    const syncScope = () => {
      const v = scope.value; pick.style.display = v === 'pick' ? '' : 'none'; redoL.style.display = v === 'all' ? '' : 'none';
      h.tagBtn.textContent = v === 'all' ? 'Tag all tracks' : v === 'pick' ? 'Tag chosen track' : 'Tag current track';
      if (v === 'pick') fillPick();
    };
    scope.onchange = syncScope; syncScope();
    h.tagBtn.onclick = () => {
      if (scope.value === 'all') return runAll();
      if (scope.value === 'pick') { const a = A(), t = a && a.tracks().find(x => String(x.dbId) === pick.value); if (!t) { h.status('Choose a track first.'); return; } return tagOne(t); }
      return tagOne(null);
    };

    // batch
    let stopFlag = false; const stopB = $('#ppv-stop');
    stopB.onclick = () => { stopFlag = true; h.status('Stopping after this track…'); };
    const runAll = async () => {
      const a = A(); if (!a) return; stopFlag = false; busy(true); stopB.style.display = ''; stopB.disabled = false;
      const lv = h.LV(), cache = lv ? null : {}, list = a.tracks().filter(t => !t.stem); let done = 0, fail = 0, skip = 0;
      let wl = null; try { if (lv && lv.wake && navigator.wakeLock) wl = await navigator.wakeLock.request('screen'); } catch (e) {}
      try {
        for (let i = 0; i < list.length && !stopFlag; i++) {
          const t = list[i];
          if (!$('#ppv-redo').checked && loadTags()[t.dbId]) { skip++; continue; }
          h.status('Tagging ' + (i + 1) + ' of ' + list.length + ': ' + t.title);
          try {
            const r = await tagTrack(t.url, s => h.status('(' + (i + 1) + '/' + list.length + ') ' + s), lv, { deep: deep.checked, cache, progress: f => h.prog((i + f) / list.length) });
            if (!r.emb && !r.genre) throw new Error(r.errors.join('; ') || 'nothing detected');
            await persistTags(t.dbId, r, aeq.checked); done++;
          } catch (e) { console.warn('tag failed', t.title, e); fail++; }
          await tick();
        }
      } finally { if (cache) Object.values(cache).forEach(s => s && s.release && s.release()); wl && wl.release().catch(() => {}); }
      h.status((stopFlag ? 'Stopped. ' : 'Done. ') + done + ' tagged' + (skip ? ', ' + skip + ' already had tags' : '') + (fail ? ', ' + fail + ' failed' : '') + '.');
      stopB.style.display = 'none'; busy(false); refreshCount();
    };

    // smart playlists
    function ensureDetailed() { const dm = document.getElementById('detailed-mode-toggle'); if (dm && !dm.checked) { dm.checked = true; dm.dispatchEvent(new Event('change')); } }
    function fill(name, pick, flags) {
      const a = A(), pl = a.playlists().find(x => x.name === name) || a.createPlaylist(name); let n = 0;
      if (flags) Object.assign(pl, flags);
      a.tracks().forEach(t => { if (!t.stem && pick(t) && a.addToPlaylist(t.dbId, pl.id)) n++; });
      return n;
    }
    $('#ppv-mk').onclick = () => {
      const a = A(), tg = loadTags(), ids = [...document.querySelectorAll('#ppv-smart input:checked')].map(i => i.value);
      if (!ids.length) { h.status('Tick at least one playlist.'); return; }
      const msg = [];
      SMART.filter(s => ids.includes(s.id)).forEach(s => { const n = fill('✨ ' + s.name, t => { const c = tg[t.dbId]; return c && s.test(c, vibes(c)); }, { auto: 'smart', smartKey: s.id }); msg.push(s.name + ': ' + n); });
      a.commitPlaylists(); lib.textContent = msg.join('\n'); h.status('Playlists updated. They are real playlists now: find them in the Playlists tab or the library view selector' + (live() ? ', and they keep updating as tracks get tagged.' : '.'));
    };
    $('#ppv-mkq').onclick = () => {
      const q = $('#ppv-q').value.trim().toLowerCase(), a = A(); if (!q) { h.status('Type a search first.'); return; }
      ensureDetailed(); const words = q.split(/\s+/);
      const n = fill('🔎 ' + q, t => { const hay = (t.title + ' ' + t.artist + ' ' + window.__ppTagText(t.dbId)).toLowerCase(); return words.every(w => hay.includes(w)); });
      a.commitPlaylists(); h.status('Playlist made with ' + n + ' track' + (n === 1 ? '' : 's') + '.');
    };

    // ---------- live smart playlists, background tagging, surprise playlists ----------
    const live = () => ls('ppvLive') !== '0';
    function syncSmartLive() {
      const a = A(); if (!a || !live()) return; const tg = loadTags(); let changed = false;
      a.playlists().filter(p => p.auto === 'smart').forEach(pl => {
        const s = SMART.find(x => x.id === pl.smartKey); if (!s) return;
        a.tracks().forEach(t => {
          const c = tg[t.dbId]; if (t.stem || !c) return;
          const m = s.test(c, vibes(c)), has = (t.playlistIds || []).includes(pl.id);
          if (m && !has) { a.addToPlaylist(t.dbId, pl.id); changed = true; } else if (!m && has) { a.removeFromPlaylist(t.dbId, pl.id); changed = true; }
        });
      });
      if (changed) a.commitPlaylists();
    }
    const rnd = n => Math.floor(Math.random() * n);
    const shuf = arr => { const x = arr.slice(); for (let i = x.length - 1; i > 0; i--) { const j = rnd(i + 1); const v = x[i]; x[i] = x[j]; x[j] = v; } return x; };
    const VIBE_NAMES = { chill: 'Slow-down hour', party: 'Pre-game', workout: 'Second wind', happy: 'Good-mood grab bag', sad: 'Rainy window', focus: 'Deep focus', sleep: 'Wind down', acoustic: 'Unplugged', instr: 'No words needed' };
    async function buildSurprise() {
      const a = A(), tg = loadTags(), tr = a.tracks();
      const tagged = tr.map((t, i) => ({ t, i, c: tg[t.dbId] })).filter(o => o.c && !o.t.stem);
      if (tagged.length < 12) return null;
      const ids = m => m.map(o => o.t.dbId), themes = [];
      SMART.forEach(s => { const nm = VIBE_NAMES[s.id]; if (!nm) return; const m = tagged.filter(o => s.test(o.c, vibes(o.c))); if (m.length >= 8) themes.push({ key: 'v:' + s.id, name: nm, ids: ids(shuf(m).slice(0, 20)) }); });
      const gen = {}; tagged.forEach(o => { const g = o.c.gp && o.c.gp[0] && o.c.gp[0][0]; if (g) (gen[g] = gen[g] || []).push(o); });
      Object.keys(gen).forEach(g => { if (gen[g].length >= 8) themes.push({ key: 'g:' + g, name: g + ' spotlight', ids: ids(shuf(gen[g]).slice(0, 20)) }); });
      const bp = tagged.filter(o => o.c.bpm);
      if (bp.length >= 12) {
        const sub = shuf(bp).slice(0, Math.max(12, Math.ceil(bp.length * 0.6))).sort((x, y) => x.c.bpm - y.c.bpm), n = Math.min(18, sub.length), pk = [];
        for (let k = 0; k < n; k++) pk.push(sub[Math.round(k * (sub.length - 1) / (n - 1))]);
        themes.push({ key: 'ramp', name: 'Slow burn to full speed', ids: ids(pk) });
      }
      try {
        const o = tagged[rnd(tagged.length)], order = await similarTo(o.i, 'sound');
        const l = [o.t.dbId].concat(order.map(i => tr[i]).filter(t => t && !t.stem).slice(0, 19).map(t => t.dbId));
        if (l.length >= 8) themes.push({ key: 's:' + o.t.dbId, name: 'More like ' + o.t.title, ids: l });
      } catch (e) {}
      if (!themes.length) return null;
      let recent = []; try { recent = JSON.parse(ls('ppvSurpRecent')) || []; } catch (e) {}
      const pool = themes.filter(t => !recent.includes(t.key)), th = (pool.length ? pool : themes)[rnd((pool.length ? pool : themes).length)];
      recent.push(th.key); ls('ppvSurpRecent', JSON.stringify(recent.slice(-8)));
      return th;
    }
    function toast(pl, n) {
      const old = document.getElementById('ppv-toast'); if (old) old.remove();
      const a = A(), d = document.createElement('div'); d.id = 'ppv-toast';
      d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:99999;max-width:92vw;background:#23242a;color:#eee;border:1px solid #555;border-radius:12px;padding:10px 12px;box-shadow:0 6px 24px #0008;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      const m = document.createElement('span'); m.textContent = 'A surprise playlist is ready: ' + pl.name + ' (' + n + ' tracks)';
      const bt = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.style.cssText = 'padding:5px 10px;border-radius:8px;border:1px solid #555;background:#2f3037;color:#eee;cursor:pointer'; b.onclick = fn; return b; };
      const tr = a.tracks();
      d.append(m,
        bt('Play', () => { const q = (pl.order || []).map(id => tr.findIndex(t => t.dbId === id)).filter(i => i >= 0); if (q.length) a.play(q[0], q); d.remove(); }),
        bt('Keep', () => { pl.auto = null; pl.at = undefined; a.commitPlaylists(); d.remove(); }),
        bt('\u00d7', () => d.remove()));
      document.body.appendChild(d);
    }
    async function makeSurprise() {
      const a = A(), th = await buildSurprise(); if (!th) return null;
      const pl = a.createPlaylist('\ud83c\udf81 ' + th.name);
      pl.auto = 'surprise'; pl.at = Date.now(); pl.libOnly = ls('ppvSurpTab') === '0'; pl.order = th.ids.slice();
      th.ids.forEach(id => a.addToPlaylist(id, pl.id));
      const max = parseInt(ls('ppvSurpMax') || '5', 10);
      a.playlists().filter(p => p.auto === 'surprise' && p.id !== pl.id).sort((x, y) => (y.at || 0) - (x.at || 0)).slice(Math.max(0, max - 1)).forEach(p => a.deletePlaylistQuiet(p.id));
      a.commitPlaylists(); ls('ppvSurpLast', String(Date.now()));
      toast(pl, th.ids.length);
      return pl;
    }
    const bgSt = $('#ppv-bgst'), setBg = s => { bgSt.textContent = s; };
    [['ppv-bg', 'ppvBg', '0'], ['ppv-bgplay', 'ppvBgPlay', '0'], ['ppv-bgchg', 'ppvBgChg', '0'], ['ppv-surp', 'ppvSurp', '0'], ['ppv-surptab', 'ppvSurpTab', '1']].forEach(([id, k, def]) => {
      const el = $('#' + id); el.checked = (ls(k) == null ? def : ls(k)) === '1'; el.onchange = () => ls(k, el.checked ? '1' : '0');
    });
    const lv2 = $('#ppv-live'); lv2.checked = live(); lv2.onchange = () => { ls('ppvLive', lv2.checked ? '1' : '0'); syncSmartLive(); };
    const lmx = $('#ppv-lmix'); lmx.checked = ls('ppvLiveMix') !== '0'; lmx.onchange = () => { ls('ppvLiveMix', lmx.checked ? '1' : '0'); if (lmx.checked && window.__ppLiveMixes) window.__ppLiveMixes.refresh(); };
    const lmxList = () => {
      const box = $('#ppv-lmixlist'), a = A(), api = window.__ppLiveMixes; if (!box || !a || !api) return; const ids = api.blocked(); box.textContent = '';
      if (!ids.length) { box.textContent = 'No blocked tracks.'; return; }
      ids.forEach(id => { const t = a.tracks().find(x => String(x.dbId) === id), r = document.createElement('div'), bt = document.createElement('button'); r.textContent = (t ? t.title : 'Removed track') + ' '; bt.textContent = 'Unblock'; bt.className = 'ppv-sec'; bt.onclick = () => { api.unblock(id); lmxList(); }; r.appendChild(bt); box.appendChild(r); });
    };
    $('#ppv-lmixblk').onclick = () => { const t = cur(); if (!t || !window.__ppLiveMixes) { h.status('Play or pick a track first.'); return; } window.__ppLiveMixes.block(t.dbId); h.status('\u201c' + t.title + '\u201d is blocked from auto mixes.'); lmxList(); };
    setTimeout(lmxList, 1500);
    [['ppv-bgidle', 'ppvBgIdle', '5'], ['ppv-surpev', 'ppvSurpEv', '24'], ['ppv-surpmax', 'ppvSurpMax', '5']].forEach(([id, k, def]) => {
      const el = $('#' + id); el.value = ls(k) || def; el.onchange = () => ls(k, el.value);
    });
    if (!navigator.getBattery) $('#ppv-bgchl').style.display = 'none';
    $('#ppv-surpnow').onclick = async () => {
      setBg('Assembling a surprise\u2026');
      try { const pl = await makeSurprise(); setBg(pl ? 'Made ' + pl.name + '.' : 'Tag at least 12 tracks first (stems are skipped).'); } catch (e) { console.error(e); setBg('Error: ' + e.message); }
    };
    let lastInput = Date.now(), bgBusy = false, bgCache = null; const bgFailed = new Set();
    ['pointerdown', 'keydown', 'touchstart', 'wheel', 'mousemove'].forEach(ev => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
    const mediaPlaying = () => [...document.querySelectorAll('audio,video')].some(m => !m.paused && !m.ended && m.readyState > 2);
    async function isAway() {
      if (isBusy) return false;
      if (Date.now() - lastInput < parseInt(ls('ppvBgIdle') || '5', 10) * 60000) return false;
      if (ls('ppvBgPlay') !== '1' && mediaPlaying()) return false;
      if (ls('ppvBgChg') === '1' && navigator.getBattery) { try { const b = await navigator.getBattery(); if (!b.charging) return false; } catch (e) {} }
      return true;
    }
    const freeBg = () => { if (bgCache) { Object.values(bgCache).forEach(s => s && s.release && s.release()); bgCache = null; } };
    const surpDue = () => Date.now() - (parseInt(ls('ppvSurpLast') || '0', 10)) >= parseInt(ls('ppvSurpEv') || '24', 10) * 3600000;
    async function bgTick() {
      if (bgBusy) return; const bgOn = ls('ppvBg') === '1', surpOn = ls('ppvSurp') === '1'; const a = A();
      if (!a || (!bgOn && !surpOn)) { freeBg(); return; }
      if (!(await isAway())) { freeBg(); return; }
      bgBusy = true;
      try {
        while (ls('ppvBg') === '1' && await isAway()) {
          const tg = loadTags(), list = a.tracks().filter(x => !x.stem), t = list.find(x => !tg[x.dbId] && !bgFailed.has(x.dbId));
          if (!t) break;
          const lv = h.LV(); if (!lv && !bgCache) bgCache = {};
          setBg('Background: tagging ' + t.title + ' (' + list.filter(x => !tg[x.dbId] && !bgFailed.has(x.dbId)).length + ' left)\u2026');
          try { const r = await tagTrack(t.url, () => {}, lv, { deep: deep.checked, cache: lv ? null : bgCache }); if (!r.emb && !r.genre) throw new Error('nothing detected'); await persistTags(t.dbId, r, aeq.checked); }
          catch (e) { console.warn('background tag failed', t.title, e); bgFailed.add(t.dbId); }
          try { refreshCount(); } catch (e) {}
          await tick();
        }
        if (ls('ppvSurp') === '1' && surpDue() && await isAway()) {
          setBg('Background: assembling a surprise\u2026');
          const pl = await makeSurprise(); setBg(pl ? 'Made ' + pl.name + '.' : 'Waiting for more tagged tracks.');
        } else if (bgOn) setBg('Background: nothing left to tag.');
      } catch (e) { console.warn('background task', e); } finally { bgBusy = false; if (!(await isAway())) freeBg(); }
    }
    setInterval(() => { bgTick().catch(e => console.warn(e)); }, 15000);

    // more like this + intro skip
    $('#ppv-simgo').onclick = async () => {
      busy(true);
      try {
        const a = A(), t = cur(); if (!t) throw new Error('Play a track first.');
        const order = await similarTo(a.currentIndex(), $('#ppv-sim').value);
        if (!order.length) throw new Error('Nothing close enough. Tag more tracks, or try "Similar sound".');
        const q = order.slice(0, 30); a.play(q[0], q); h.status('Playing ' + q.length + ' similar tracks.');
        lib.textContent = q.slice(0, 5).map(i => a.tracks()[i].title).join('\n');
      } catch (e) { console.error(e); h.status('Error: ' + e.message); }
      busy(false);
    };
    const mediaOf = t => document.getElementById(t.kind === 'video' ? 'video-el' : 'audio');
    $('#ppv-skipgo').onclick = () => {
      const t = cur(), c = t && loadTags()[t.dbId];
      if (!t) return h.status('Play a track first.');
      if (!c || c.fv == null) return h.status('No vocal timing yet. Tick "Scan the whole track" and tag this track.');
      mediaOf(t).currentTime = Math.max(0, c.fv - 1); h.status('Jumped to ' + mmss(c.fv) + '.');
    };
    let pendingSkip = false;
    ['audio', 'video-el'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener('loadedmetadata', () => { pendingSkip = true; });
      el.addEventListener('playing', () => {
        if (!pendingSkip) return; pendingSkip = false;
        if (!ask.checked) return;
        const t = cur(), c = t && loadTags()[t.dbId];
        if (t && c && c.w && c.fv >= 10 && (c.v || 0) >= 50 && el.currentTime < 1.5 && mediaOf(t) === el) el.currentTime = Math.max(0, c.fv - 1);
      });
    });
    $('#ppv-eqall').onclick = () => {
      const a = A(), tg = loadTags(); let n = 0, eqs = {}; try { eqs = JSON.parse(localStorage.getItem('playerTrackEq')) || {}; } catch (e) {}
      a.tracks().forEach(t => { const c = tg[t.dbId]; if (!c || (eqs[t.dbId] && !c.ae)) return; const name = eqPresetFor(c); if (name && a.setTrackEqPreset(t.dbId, name)) { c.ae = name; n++; } });
      saveTagStore(); h.status('Auto-EQ set on ' + n + ' track' + (n === 1 ? '' : 's') + ' (your own EQ settings were left alone).');
    };

    // Whisper
    const wsize = $('#ppv-wsize'), wlang = $('#ppv-wlang'), wtask = $('#ppv-wtask'), wclean = $('#ppv-wclean'), wout = $('#ppv-wout'), wsrt = $('#ppv-wsrt');
    wsize.value = ls('ppvWSize') || 'tiny'; wlang.value = ls('ppvWLang') || ''; wtask.value = ls('ppvWTask') || 'transcribe'; wclean.checked = ls('ppvWClean') === '1';
    wsize.onchange = () => ls('ppvWSize', wsize.value); wlang.onchange = () => ls('ppvWLang', wlang.value); wtask.onchange = () => ls('ppvWTask', wtask.value); wclean.onchange = () => ls('ppvWClean', wclean.checked ? '1' : '0');
    let lastSrt = null;
    $('#ppv-wgo').onclick = async () => {
      busy(true); wout.textContent = ''; wsrt.style.display = 'none';
      try {
        const a = A(), t = cur(); if (!t) throw new Error('Play or select a track first.');
        const lyr = window.__ppLyrics;
        if (t.kind !== 'video' && lyr && lyr.has(t.dbId) && !confirm('This track already has lyrics. Replace them?')) { busy(false); return; }
        document.querySelectorAll('.ppv-bar-wh i').forEach(e => e.style.width = '0');
        const wst = t => { h.status(t); const m = /(\d+)%/.exec(t); if (m) document.querySelectorAll('.ppv-bar-wh i').forEach(e => e.style.width = m[1] + '%'); };
        const cues = await transcribe(t, { size: wsize.value, lang: wlang.value, task: wtask.value, clean: wclean.checked, model: h.sel.value, strength: +h.sl.value, lv: h.LV() }, wst);
        if (!cues.length) throw new Error('No speech found.');
        if (t.kind === 'video' || !lyr) a.setSubtitles(t.dbId, cues, 'Whisper.srt'); else lyr.set(t.dbId, toLrc(cues));
        lastSrt = { name: t.title, text: toSrt(cues) }; wsrt.style.display = '';
        wout.textContent = cues.length + ' lines added as ' + (t.kind === 'video' ? 'subtitles' : 'synced lyrics') + '.\n' + cues.slice(0, 4).map(c => mmss(c.start) + '  ' + c.text).join('\n');
        h.status('Done.');
      } catch (e) { console.error(e); h.status('Error: ' + e.message); }
      busy(false);
    };
    wsrt.onclick = () => {
      if (!lastSrt) return; const u = URL.createObjectURL(new Blob([lastSrt.text], { type: 'text/plain' })), a = document.createElement('a');
      a.href = u; a.download = lastSrt.name.replace(/[\\/:*?"<>|]+/g, '_') + '.srt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
    };
    $('#ppv-wfree').onclick = async () => {
      try { if (asr) { await asr.dispose(); asr = null; asrId = ''; } const ks = await caches.keys(); for (const k of ks) if (/transformers/i.test(k)) await caches.delete(k); h.status('Whisper download removed.'); } catch (e) { h.status('Error: ' + e.message); }
    };
    refreshCount();
    // the list is always visible now, so keep it current as the library loads and tags change
    let lastSig = '';
    setInterval(() => { const a = A(); if (!a) return; const sig = a.tracks().length + ':' + tagVer; if (sig !== lastSig) { lastSig = sig; refreshCount(); } }, 1500);

    // ---------- Smart features: one place to switch every smart menu and automation on or off ----------
    // Menus only get hidden (nothing is deleted); automations stop. Tags, playlists and history stay as they are.
    // It lives in the app's Settings tab when there is one, otherwise at the bottom of the Stems panel.
    {
      const FEATS = [
        { g: 'Menus', id: 'tagmenu', label: 'Tagging menu (Library tab)', key: 'ppvShowTag', def: 1, ui: 1 },
        { id: 'savedmenu', label: 'Tagged tracks menu', key: 'ppvShowSaved', def: 1, ui: 1 },
        { id: 'savedvid', label: 'Tagged videos in that menu', key: 'ppvShowVid', def: 1, ui: 1 },
        { id: 'lyrics', label: 'Lyrics & subtitles (Whisper) menu', key: 'ppvShowLyr', def: 1, ui: 1 },
        { g: 'Automatic', id: 'live', label: 'Live smart playlists (follow your tags)', key: 'ppvLive', def: 1, box: 'ppv-live' },
        { id: 'mixes', label: 'Auto mixes: For You, Ones You May Like, Your Pattern', key: 'ppvLiveMix', def: 1, box: 'ppv-lmix' },
        { id: 'surp', label: 'Surprise playlists', key: 'ppvSurp', def: 0, box: 'ppv-surp' },
        { id: 'bg', label: 'Background tagging while I am away', key: 'ppvBg', def: 0, box: 'ppv-bg' },
        { id: 'aeq', label: 'Auto-EQ when tagging', key: 'ppvAutoEq', def: 0, box: 'ppv-aeq' },
        { id: 'askip', label: 'Skip long intros', key: 'ppvAutoSkip', def: 0, box: 'ppv-askip' },
        { g: 'Bloop', id: 'mascot', label: 'Bloop, the mascot', box: 'ppv-mas', def: 1, get: () => h.mas.isOn() },
        { id: 'assist', label: 'Bloop assistant button', box: 'ppv-chat-on', def: 0, get: () => h.mas.chat.isOn() }
      ];
      const isOn = f => { if (f.get) return !!f.get(); const v = ls(f.key); return v == null ? f.def === 1 : v === '1'; };
      const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
      const F = id => FEATS.find(f => f.id === id), on = id => isOn(F(id));
      function applyShow() {
        show(libHost, on('tagmenu')); show(savedHost, on('savedmenu')); show(whHost, on('lyrics'));
        const hr = whHost.previousElementSibling; if (hr && hr.tagName === 'HR') hr.style.display = on('lyrics') ? '' : 'none';   // the divider the captions menu got
        const sf = $('#ppv-sf'), vo = sf && sf.querySelector('option[value="video"]'), vid = on('savedvid');
        if (vo) { vo.hidden = !vid; vo.disabled = !vid; if (!vid && sf.value === 'video') sf.value = 'all'; }
        try { renderSaved(); } catch (e) {}
      }
      const setF = (f, v) => {
        if (f.key) ls(f.key, v ? '1' : '0');
        const b = f.box && $('#' + f.box); if (b && b.checked !== v) { b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true })); }   // runs that checkbox's own handler too
        if (f.ui) applyShow();
      };
      const box = document.createElement('div'); box.className = 'ppv-scope'; box.id = 'ppv-smartset';
      box.innerHTML = '<details open><summary>Smart features</summary>' +
        '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-fs-all"> <b>All smart features</b></label>' +
        '<div class="ppv-note">Off hides the smart menus and stops the automatic playlists and background work. Your tags, playlists and listening history are kept. Turning it back on restores what you had.</div>' +
        FEATS.map(f => (f.g ? '<div style="margin-top:8px"><b>' + f.g + '</b></div>' : '') + '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-fs-' + f.id + '"> ' + f.label + '</label>').join('') + '</details>';
      const syncBoxes = () => { FEATS.forEach(f => { const el = box.querySelector('#ppv-fs-' + f.id); if (el) el.checked = isOn(f); }); box.querySelector('#ppv-fs-all').checked = FEATS.some(isOn); };
      FEATS.forEach(f => { box.querySelector('#ppv-fs-' + f.id).onchange = e => { setF(f, e.target.checked); syncBoxes(); }; });
      box.querySelector('#ppv-fs-all').onchange = e => {
        if (!e.target.checked) { const snap = {}; FEATS.forEach(f => { snap[f.id] = isOn(f); }); if (Object.values(snap).some(Boolean)) ls('ppvSmartSnap', JSON.stringify(snap)); FEATS.forEach(f => setF(f, false)); }
        else { let snap = null; try { snap = JSON.parse(ls('ppvSmartSnap')); } catch (er) {} if (snap && !Object.values(snap).some(Boolean)) snap = null; FEATS.forEach(f => setF(f, snap ? !!snap[f.id] : f.def === 1)); }
        syncBoxes();
      };
      // keep these in step when the same switch is changed in its own panel
      document.addEventListener('change', e => { if (e.target && /^ppv-(live|lmix|surp|bg|aeq|askip|mas|chat-on)$/.test(e.target.id)) syncBoxes(); });
      (document.getElementById('sidebar-pane-settings') || p).appendChild(box);
      if (sb) sb.addEventListener('click', () => setTimeout(applyShow, 0));
      if (eb) eb.addEventListener('click', () => setTimeout(applyShow, 0));
      syncBoxes(); applyShow();
    }
  }

  // ---------- UI ----------
  // ---------- Bloop, the little ball mascot ----------
  // Lives in the Stem separator panel (all the AI features). Reacts to the panel's own status messages, so every
  // feature (splitting, tagging, playlists, Whisper) gets it for free. Pops up as a small floating bubble when a
  // task finishes while the panel is closed. Can be switched off with the "Show Bloop" checkbox.
  function mascot(panel) {
    let uid = 0, mood = 'idle', key = '', tmr = null, ftmr = null, greeted = false;
    const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    let on = lsGet('ppvMascot') !== '0';
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const css = document.createElement('style');
    css.textContent = `
      .ppv-ball{width:44px;height:44px;flex:none;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}
      .ppv-ball svg{width:100%;height:100%;overflow:visible;display:block}
      .ppv-ball .body{transform-box:fill-box;transform-origin:50% 100%}
      .ppv-ball .eyes{transform-box:fill-box;transform-origin:center}
      .ppv-ball .spark{transform-box:fill-box;transform-origin:center}
      .ppv-ball .sh{fill:#000;opacity:.25}
      .ppv-ball .bd{fill:var(--accent,#7c5cff)}
      .ppv-ball .eye{fill:#fff}.ppv-ball .pu{fill:#1a1a22}
      .ppv-ball .m{fill:none;stroke:#1a1a22;stroke-width:2.4;stroke-linecap:round;display:none}
      .ppv-ball .m.open{fill:#1a1a22;stroke:none}
      .ppv-ball .xe{display:none;fill:none;stroke:#1a1a22;stroke-width:2.4;stroke-linecap:round}
      .ppv-ball .spark{display:none}.ppv-ball .spark path{fill:#ffd95a}
      .ppv-ball .fs{fill:none;stroke:#1a1a22;stroke-width:2.4;stroke-linecap:round}.ppv-ball .fm{fill:#1a1a22}.ppv-ball .sw{fill:#9fd8ff;opacity:.9}.ppv-ball .zz{font:700 9px system-ui,sans-serif;fill:#e9e4ff}
      .ppv-ball[data-face=talk] [data-fm=open]{animation:blMouth .28s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center}.ppv-ball[data-face=sleep] .zz{animation:blZ 2.4s ease-in-out infinite}
      @keyframes blMouth{from{transform:scaleY(.35)}to{transform:scaleY(1.25)}}@keyframes blZ{0%,100%{opacity:.2;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
      .m-idle .m.smile,.m-greet .m.smile,.m-start .m.open,.m-work .m.flat,.m-done .m.open,.m-err .m.wavy{display:block}
      .m-err .eyes{display:none}.m-err .xe{display:block}
      .m-done .spark{display:block;animation:ppvTw .6s ease-in-out infinite alternate}
      .m-idle .body{animation:ppvBob 2.6s ease-in-out infinite}
      .m-idle .eyes{animation:ppvBlink 4.5s infinite}
      .m-greet .body{animation:ppvHop .55s ease-out 3}
      .m-start .body{animation:ppvHop .4s ease-out 1}
      .m-work .body{animation:ppvWob .7s ease-in-out infinite}
      .m-work .pu{animation:ppvLook 1.6s ease-in-out infinite}
      .m-done .body{animation:ppvHop .5s ease-out 4}
      .m-err .body{animation:ppvShake .5s ease-in-out 2}
      @keyframes ppvBob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-2px) scale(1.03,.97)}}
      @keyframes ppvBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
      @keyframes ppvHop{0%{transform:translateY(0) scale(1.1,.88)}40%{transform:translateY(-12px) scale(.94,1.08)}70%{transform:translateY(0) scale(1.08,.92)}100%{transform:translateY(0) scale(1,1)}}
      @keyframes ppvWob{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
      @keyframes ppvLook{0%,100%{transform:translateX(-1.6px)}50%{transform:translateX(1.6px)}}
      @keyframes ppvShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px) rotate(-4deg)}75%{transform:translateX(3px) rotate(4deg)}}
      @keyframes ppvTw{from{opacity:.4;transform:scale(.8)}to{opacity:1;transform:scale(1.1)}}
      @keyframes ppvIn{from{opacity:0;transform:translateY(10px)}}
      @media (prefers-reduced-motion:reduce){.ppv-ball *{animation:none!important}}
      #ppv-mrow{display:flex;align-items:center;gap:10px;position:sticky;top:-12px;z-index:3;background:#1b1c20;margin:4px -12px 0;padding:6px 12px}
      .ppv-bub{position:relative;flex:1;background:#2a2b31;color:#eee;border-radius:12px;padding:7px 10px;font:12.5px/1.35 system-ui,sans-serif;min-height:18px}
      #ppv-mrow .ppv-bub:before{content:"";position:absolute;left:-5px;top:50%;margin-top:-5px;border:5px solid transparent;border-left:0;border-right-color:#2a2b31}
      #ppv-mfloat{position:fixed;right:12px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:99999;display:none;align-items:center;gap:8px;max-width:min(300px,calc(100vw - 24px));animation:ppvIn .25s ease-out;cursor:pointer}
      #ppv-mfloat .ppv-bub{box-shadow:0 4px 16px #0008}`;
    document.head.appendChild(css);

    const star = (x, y, sc) => `<path transform="translate(${x} ${y}) scale(${sc})" d="M0-5L1.4-1.4 5 0 1.4 1.4 0 5-1.4 1.4-5 0-1.4-1.4z"/>`;
    function ball() {
      const g = 'ppvg' + (++uid), d = document.createElement('div');
      d.className = 'ppv-ball m-idle'; d.setAttribute('role', 'img'); d.setAttribute('aria-label', 'Bloop, the mascot');
      d.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${g}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
        <ellipse class="sh" cx="32" cy="60" rx="15" ry="3"/>
        <g class="behind"><g class="prop" data-p="glass"><circle cx="52" cy="14" r="7" fill="#cfe9ff" stroke="#1a1a22" stroke-width="2.4"/><path d="M57 19l6 6" stroke="#1a1a22" stroke-width="3.2" stroke-linecap="round"/></g><g class="prop" data-p="phone"><rect x="50" y="6" width="11" height="18" rx="2.5" fill="#2b2c36" stroke="#1a1a22" stroke-width="1"/><rect x="52" y="9" width="7" height="11" rx="1" fill="#8fd3ff"/></g><g class="prop" data-p="headphones"><path d="M14 26q18-24 36 0" fill="none" stroke="#2b2c36" stroke-width="3" stroke-linecap="round"/><rect x="9" y="25" width="7" height="11" rx="3" fill="#2b2c36"/><rect x="48" y="25" width="7" height="11" rx="3" fill="#2b2c36"/></g><g class="prop" data-p="pencil"><path d="M50 22l10-12l4 4l-10 12l-6 2z" fill="#ffd95a" stroke="#1a1a22" stroke-width="1.2"/></g><g class="prop" data-p="note"><ellipse cx="52" cy="12" rx="3.5" ry="2.8" fill="#1a1a22"/><path d="M55.5 12V3" stroke="#1a1a22" stroke-width="1.8"/><path d="M55.5 3q4 2 5 6" fill="none" stroke="#1a1a22" stroke-width="1.8"/></g><g class="prop" data-p="timer"><circle cx="52" cy="14" r="7" fill="#fff" stroke="#1a1a22" stroke-width="2"/><path d="M52 14V10M52 14l3 2" stroke="#1a1a22" stroke-width="1.6" stroke-linecap="round"/><rect x="50" y="3" width="4" height="3" fill="#1a1a22"/></g><g class="prop" data-p="scissors"><circle cx="6" cy="44" r="3" fill="none" stroke="#1a1a22" stroke-width="1.6"/><circle cx="6" cy="54" r="3" fill="none" stroke="#1a1a22" stroke-width="1.6"/><path d="M8 42L18 52M8 56L18 46" stroke="#1a1a22" stroke-width="1.8" stroke-linecap="round"/></g><g class="prop" data-p="wand"><path d="M50 20L60 10" stroke="#1a1a22" stroke-width="2.4" stroke-linecap="round"/><path d="M61 4l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill="#ffd95a"/></g><g class="prop" data-p="wizard"><path d="M32-8L47 16Q32 21 17 16Z" fill="#3b2a6b" stroke="#1a1a22" stroke-width="1.2"/><path d="M14 16A18 4 0 0 1 50 16Z" fill="#3b2a6b" stroke="#1a1a22" stroke-width="1.2"/><path d="M30 2l1 2.4 2.5.3-1.9 1.6.6 2.5-2.2-1.3-2.2 1.3.6-2.5-1.9-1.6 2.5-.3z" fill="#ffd95a"/></g><g class="prop" data-p="party"><path d="M32-10L43 16H21Z" fill="#ff7ab6" stroke="#1a1a22" stroke-width="1.2"/><path d="M27 6h10M24 11h16" stroke="#ffd95a" stroke-width="2"/><circle cx="32" cy="-10" r="3" fill="#ffd95a"/></g><g class="prop" data-p="crown"><path d="M17 12V6l7 6 8-9 8 9 7-6v6z" fill="#ffd95a" stroke="#1a1a22" stroke-width="1.2"/></g><g class="burst"><circle cx="8" cy="22" r="7" fill="#e9e3ff" opacity=".35"/><circle cx="56" cy="22" r="7" fill="#e9e3ff" opacity=".35"/><circle cx="6" cy="44" r="8" fill="#e9e3ff" opacity=".35"/><circle cx="58" cy="44" r="8" fill="#e9e3ff" opacity=".35"/><circle cx="32" cy="62" r="8" fill="#e9e3ff" opacity=".35"/><circle cx="18" cy="60" r="6" fill="#e9e3ff" opacity=".35"/><circle cx="46" cy="60" r="6" fill="#e9e3ff" opacity=".35"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(2 8) scale(1.2)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(60 6) scale(1)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(62 30) scale(1.3)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(0 30) scale(1)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(12 64) scale(1.1)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(54 62) scale(1.2)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(30 -2) scale(1)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(64 50) scale(0.9)" fill="#ffd95a"/></g></g><g class="body"><circle class="bd" cx="32" cy="34" r="24"/><circle cx="32" cy="34" r="24" fill="url(#${g})"/>
        <g class="eyes" data-fe="round"><circle class="eye" cx="24" cy="31" r="5.5"/><circle class="eye" cx="40" cy="31" r="5.5"/><circle class="pu" cx="25" cy="32" r="2.6"/><circle class="pu" cx="41" cy="32" r="2.6"/></g>
        <path class="xe" data-fe="dizzy" d="M20 27l8 8M28 27l-8 8M36 27l8 8M44 27l-8 8"/>
        <path class="m smile" data-fm="smile" d="M25 43q7 6 14 0"/><ellipse class="m open" data-fm="open" cx="32" cy="44" rx="4" ry="3.2"/><path class="m flat" data-fm="flat" d="M27 44h10"/><path class="m wavy" data-fm="wavy" d="M25 44q3-3 7 0t7 0"/>
        <path class="fs" data-fe="happy" style="display:none" d="M18 33q6-7 12 0M34 33q6-7 12 0"/><path class="fs" data-fe="focus" style="display:none" d="M19 31h10M35 31h10"/><path class="fs" data-fe="sad" style="display:none" d="M18 35q6-5 12 0M34 35q6-5 12 0M17 26l8 2M47 26l-8 2"/><path class="fs" data-fe="sleepy" style="display:none" d="M18 32h12M34 32h12"/><path class="fs" data-fe="squint" style="display:none" d="M18 31l12-2M34 29l12 2"/><path class="fs" data-fe="worry" style="display:none" d="M17 24l9-3M47 24l-9-3"/><g data-fe="wide" style="display:none"><circle class="eye" cx="24" cy="31" r="7"/><circle class="eye" cx="40" cy="31" r="7"/><circle class="pu" cx="24" cy="32" r="3"/><circle class="pu" cx="40" cy="32" r="3"/></g><path class="fm" data-fm="grin" style="display:none" d="M24 41q8 10 16 0z"/><path class="fs" data-fm="frown" style="display:none" d="M25 47q7-6 14 0"/><circle class="pu" data-fm="o" style="display:none" cx="32" cy="44" r="2.4"/><path class="fs" data-fm="tiny" style="display:none" d="M29 44h6"/><path class="fs" data-fm="clench" style="display:none" d="M25 44h14M28 41v6M32 41v6M36 41v6"/><path class="sw" data-fx="sweat" style="display:none" d="M50 20q3 5 0 7q-3-2 0-7z"/><text class="zz" data-fx="zz" style="display:none" x="50" y="14">z</text><g class="prop" data-p="glasses"><circle cx="24" cy="32" r="5" fill="#cfe9ff" fill-opacity=".6" stroke="#1a1a22" stroke-width="2"/><circle cx="40" cy="32" r="5" fill="#cfe9ff" fill-opacity=".6" stroke="#1a1a22" stroke-width="2"/><path d="M29 32h6" stroke="#1a1a22" stroke-width="2"/></g><g class="prop" data-p="wizard"><path d="M14 16A18 4 0 0 0 50 16Z" fill="#3b2a6b" stroke="#1a1a22" stroke-width="1.2"/></g><g class="prop" data-p="party"><path d="M21 14Q32 19 43 14L43 17Q32 22 21 17Z" fill="#ffd95a" stroke="#1a1a22" stroke-width="1"/></g><g class="prop" data-p="crown"><path d="M17 12H47V17H17Z" fill="#ffd95a" stroke="#1a1a22" stroke-width="1.2"/><circle cx="32" cy="14.5" r="1.6" fill="#ff7ab6"/></g><g class="spark" data-fx="spark">${star(8, 14, 1.3)}${star(56, 10, 1)}${star(58, 36, .8)}</g></g></svg>`;
      return d;
    }

    const row = document.createElement('div'); row.id = 'ppv-mrow';
    const pb = ball(), bub = document.createElement('div'); bub.className = 'ppv-bub'; row.append(pb, bub);
    const fl = document.createElement('div'); fl.id = 'ppv-mfloat';
    const fb = ball(), fbub = document.createElement('div'); fbub.className = 'ppv-bub'; fl.append(fbub, fb);
    document.body.appendChild(fl);
    panel.firstElementChild.after(row);
    if (!on) row.style.display = 'none';
    fl.onclick = () => { fl.style.display = 'none'; panel.style.display = 'block'; };

    const L = {
      start: ['On it!', "Let's go!", 'Rolling up my sleeves… well, my ball.', 'Here we go!', 'Bounce time!', 'Okay, I am on it!'],
      dl: ['Fetching the brains (one time only)…', 'Downloading my homework…', 'Grabbing the model, hang tight!', 'Loading my brain, it will not take long!'],
      dec: ['Listening closely…', 'Giving the track a good listen…', 'Reading the waveform like a map…'],
      sep: ['Pulling the song apart…', 'Teasing the vocals from the beat…', 'Sorting voice from band…', 'Unmixing the mix, carefully…', 'Every drum hit gets its own place…'],
      enc: ['Wrapping up the stems…', 'Packing it all up…', 'Putting each stem in its own box…'],
      tag: ['Sniffing out the vibe…', 'Checking the tempo and key…', 'Tapping my foot to find the BPM…', 'Asking the tags how they feel…'],
      wh: ['Writing down every word…', 'Listening for lyrics…', 'Catching every word, one line at a time…'],
      gen: ['Working on it…', 'Rolling along…', 'Still bouncing on it…'],
      done: ['Ta-da!', 'All done!', 'Nailed it!', 'Fresh out of the oven!', 'Tada! Your stems are ready.', 'Crisp as a fresh bounce!'],
      err: ['Oops, I got dizzy.', 'Hmm, that did not work.', 'Uh-oh. Check the message in the panel.', 'That one slipped through my fingers.'],
      idle: ['Ready for the next one!', 'What else can I do?', 'Got another song for me?', 'Psst, try saying "make a playlist"!', 'Want a joke? Just ask!', 'Still here, still bouncing.'],
      panel: ['Stems menu! Pick a model and the tracks you want.', 'Vocals, drums, bass? Your call.', 'Tick the stems you want, then tap split.', 'Splitting is my favourite kind of surgery.', 'Heavier model, better split. Lighter model, faster split.', 'Pick a track first, then I can take it apart.'],
      night: ['Still up? Tell me if you want something soft.', 'Late-night stems? Bold choice.', 'Shh, quiet hours. I can keep it low.'],
      tap: ['Boing!', 'Hehe, that tickles!', "I'm Bloop!", 'Need stems? Lyrics? Tags?', 'Boing! Did you need something?', 'Hehe, do it again!'],
      busy: ['Busy rolling, one sec!', 'Almost there!', 'Working, working…']
    };
    // ---------- Opening lines (chat box and first greeting). Picked by time of day, never the same line twice in a row. ----------
    const BL_OPEN = {
      any: ["Hey there! It's me, It's Bloopy! Ask me anything!", "Hi! Bloop here, bouncing in to help. What do you need?", "Yo! It's Bloop. Songs, stems, lyrics, playlists: pick one!", "Hello! I'm Bloop, and I'm ready when you are.", "Boing! Hi, it's Bloop. What are we listening to?", "Hey! Want to chat, or should I just play something?"],
      morning: ["Good morning! It's Bloopy, ready for a new day of music!", "Morning! Bloop here. Coffee first, or a song first?"],
      day: ["Hey there, it's Bloopy! How's your day going?", "Afternoon! Bloop here. Want something to keep you going?"],
      night: ["Up late? It's me, Bloopy! Want something soft?", "Good evening! Bloop here. Tell me what you need, I'm all ears."]
    };
    let blLastOpen = '';
    function blOpenLine() {
      const h = new Date().getHours(), pool = h < 5 || h >= 22 ? BL_OPEN.night : h < 12 ? BL_OPEN.morning : h < 18 ? BL_OPEN.day : BL_OPEN.any;
      const all = pool.concat(BL_OPEN.any), fresh = all.filter(x => x !== blLastOpen), line = pick(fresh.length ? fresh : all);
      blLastOpen = line; return line;
    }
    function set(m, text, hold) {
      if (!on) return;
      mood = m; clearTimeout(tmr);
      [pb, fb].forEach(x => { x.className = 'ppv-ball m-' + m; blFace(x, m); });
      if (text != null) bub.textContent = fbub.textContent = text;
      if (hold) tmr = setTimeout(() => { key = ''; set('idle', pick(L.idle)); }, hold);
    }
    function pop() {
      if (!on || panel.style.display === 'block') return;
      fl.style.display = 'flex'; clearTimeout(ftmr); ftmr = setTimeout(() => { fl.style.display = 'none'; }, 6000);
    }
    function react(text) {
      try { jobEnd(text); } catch (e) { console.error(e); }
      if (!on) return; text = String(text || '');
      let m = 'work', k = 'gen', lines = L.gen;
      if (/^Error|failed/i.test(text)) { m = 'err'; k = 'err'; lines = L.err; }
      else if (/^(Done|Tagged and saved|Playlists updated|Playlist made|Auto-EQ set|Jumped|Deleted)/.test(text)) { m = 'done'; k = 'done'; lines = L.done; }
      else if (/^Stopp/.test(text)) { set('idle', 'Okay, stopping here.'); key = ''; return; }
      else if (/^Downloading/.test(text)) { k = 'dl'; lines = L.dl; }
      else if (/^Decoding/.test(text)) { k = 'dec'; lines = L.dec; }
      else if (/^Separating/.test(text)) { k = 'sep'; lines = L.sep; }
      else if (/^Encoding/.test(text)) { k = 'enc'; lines = L.enc; }
      else if (/^(Tagging|Analysing|Finding|Listening)/.test(text)) { k = 'tag'; lines = L.tag; }
      else if (/transcrib|whisper|lyrics/i.test(text)) { k = 'wh'; lines = L.wh; }
      else if (!/…|\d+%\s*$/.test(text)) {                         // "Ready", "Model not downloaded yet"... = nothing running
        if (mood === 'work') { key = ''; set('idle', pick(L.idle)); }
        else if (panel.style.display === 'block' && key !== 'panel') { key = 'panel'; set('idle', pick(L.panel)); }
        return;
      }
      try { blEquip(blPropOfJob(k) || (m === 'err' ? 'phone' : null)); } catch (e) { console.error(e); }
      if (k === key) return;                                       // same phase, keep the current animation going
      key = k;
      if (m === 'work') { set('work', pick(lines)); return; }
      set(m, pick(lines), 6000); pop();
    }

    // ---------- Chat with Bloop: a tiny on-device language model (SmolLM2-135M-Instruct via transformers.js) ----------
    // Off by default. App questions and crisis messages are answered from fixed text (no model needed, always reliable);
    // everything else goes to the small model. Chat is kept in memory only.
    const CHAT_MODEL = 'HuggingFaceTB/SmolLM2-135M-Instruct';
    let pendingJob = null, holdModel = false, idleT = 0, chatOn = lsGet('ppvChat') === '1', gen = null, genP = null, chatBusy = false, dlOk = false, hist = [];
    // How many past exchanges (your message + Bloop's reply) he remembers during a chat. 0 = none. More memory = slower and more RAM on a tiny model.
    const MEM_MAX = 8, memN = () => { const v = parseInt(lsGet('ppvMem'), 10); return isNaN(v) ? 2 : Math.max(0, Math.min(MEM_MAX, v)); };
    const setMem = v => { v = Math.max(0, Math.min(MEM_MAX, parseInt(v, 10) || 0)); lsSet('ppvMem', String(v)); hist = memN() ? hist.slice(-2 * memN()) : []; return v; };
    const cstyle = document.createElement('style');
    cstyle.textContent = `
      #ppv-cfab{position:fixed;left:12px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:99997;display:none;filter:drop-shadow(0 4px 10px #0007)}
      #ppv-cfab .ppv-ball{width:54px;height:54px}
      #ppv-cfab[data-unread]::after{content:'';position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;background:#ff5c7c;border:2px solid #1b1c20}
      #ppv-chat{position:fixed;left:12px;right:12px;bottom:calc(160px + env(safe-area-inset-bottom,0px));z-index:99997;max-width:420px;max-height:min(58vh,440px);display:none;flex-direction:column;background:#1b1c20;color:#eee;border:1px solid #3a3b42;border-radius:14px;box-shadow:0 8px 28px #000a;font:13.5px/1.4 system-ui,sans-serif;overflow:hidden}
      #ppv-chat .ch-h{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #2e2f36}
      #ppv-chat .ch-n{flex:1;font-size:10.5px;opacity:.6;line-height:1.25}
      #ppv-chat button{background:#2f3037;color:#eee;border:1px solid #484952;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer}
      #ppv-chat .ch-c{padding:3px 8px;font-size:12px}
      #ppv-chat .ch-l{flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:7px;min-height:90px}
      #ppv-chat .ch-m{max-width:86%;padding:7px 10px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}
      #ppv-chat .ch-m.bot{align-self:flex-start;background:#2a2b31}
      #ppv-chat .ch-m.me{align-self:flex-end;background:var(--accent,#7c5cff);color:#fff}
      #ppv-chat .ch-a{align-self:flex-start;display:flex;gap:6px;flex-wrap:wrap}
      #ppv-chat .ch-i{display:flex;gap:6px;padding:8px;border-top:1px solid #2e2f36}
      #ppv-chat .ch-i input{flex:1;min-width:0;padding:8px;border-radius:8px;background:#2a2b31;color:#eee;border:1px solid #444;font:inherit}`;
    document.head.appendChild(cstyle);
    const cfab = document.createElement('div'); cfab.id = 'ppv-cfab'; cfab.setAttribute('role', 'button'); cfab.setAttribute('aria-label', 'Chat with Bloop');
    const cball = ball(); cfab.appendChild(cball);
    const cbox = document.createElement('div'); cbox.id = 'ppv-chat';
    cbox.innerHTML = '<div class="ch-h"><b>Bloop</b><span class="ch-n">Helper on your device. Free chat uses a tiny AI, so it can be wrong. Not a counselor.</span><button class="ch-c" data-a="clear">Clear</button><button class="ch-c" data-a="x" aria-label="Close">&times;</button></div><div class="ch-l"></div><div class="ch-i"><input type="text" maxlength="400" placeholder="Say something to Bloop" enterkeyhint="send"><button data-a="send">Send</button></div>';
    document.body.append(cfab, cbox);
    const clist = cbox.querySelector('.ch-l'), cin = cbox.querySelector('input');
    const cm = m => { cball.className = 'ppv-ball m-' + m; blFace(cball, m); };
    const scrollDown = () => { clist.scrollTop = clist.scrollHeight; };
    const add = (who, text) => { const d = document.createElement('div'); d.className = 'ch-m ' + who; d.textContent = text; clist.appendChild(d); scrollDown(); if (who === 'bot') blReact(text); return d; };
    const actions = btns => { const d = document.createElement('div'); d.className = 'ch-a'; btns.forEach(([t, fn]) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { fn(b, d); }; d.appendChild(b); }); clist.appendChild(d); scrollDown(); return d; };
    const setChatOn = v => { chatOn = !!v; lsSet('ppvChat', chatOn ? '1' : '0'); cfab.style.display = chatOn ? 'block' : 'none'; if (!chatOn) cbox.style.display = 'none'; };
    cfab.style.display = chatOn ? 'block' : 'none';
    cfab.onclick = () => {
      if (Date.now() < blSuppress) return;
      const open = cbox.style.display !== 'flex'; cbox.style.display = open ? 'flex' : 'none'; if (open) { delete cfab.dataset.unread; blAnchor(); }
      if (open) { if (!clist.children.length) add('bot', blOpenLine()); cm('greet'); setTimeout(() => cm('idle'), 1300); cin.focus(); }
    };
    cbox.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'x') cbox.style.display = 'none';
      else if (a.dataset.a === 'clear') { clist.textContent = ''; hist = []; }
      else if (a.dataset.a === 'send') { const v = cin.value; cin.value = ''; send(v); }
    });
    cin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = cin.value; cin.value = ''; send(v); } });

    const CRISIS = /(suicid|kill (myself|me)|end (my life|it all)|ending my life|want to die|wanna die|don'?t want to (live|be here|exist)|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself|better off (dead|without me))/i;
    const CRISIS_MSG = "I'm really sorry you're hurting this much. I'm only a tiny music-app ball and I can't help with this the way a person can. Please reach out to someone right now: a friend or family member you trust, or a crisis line where you live (in the US you can call or text 988). If you might act on these thoughts, or you are in danger, call your local emergency number. You deserve real support.";
    const FAQ = [
      [/^\s*(hi|hello|hey|yo|hiya|sup|good (morning|evening|afternoon))\W*$/i, 'Hi! How are you feeling today?'],
      [/^\s*(thanks?|thank you|thx|ty|cheers)\W*$/i, "You're welcome!"],
      [/^\s*(ok(ay)?|cool|nice|great|good|lol|haha|k|yes|yeah|no|nope)\W*$/i, 'Okay! Want me to play something, or tell me how your day is going?'],
      [/^\s*(bye|goodbye|good ?night|see you|cya)\W*$/i, 'Bye! Take care.'],
      [/^\s*(how are you|how'?s it going|how are you doing|how do you feel|what'?s up|wassup|whats up)\W*$/i, ["I'm doing great, I'm a ball in a music player. How about you?", "Rolling along nicely! How are you?", "Pretty bouncy today. How are you feeling?"]],
      [/\b(tell (me )?a joke|joke|make me laugh|something funny)\b/i, ["Why did the song go to therapy? It had too many issues with its bridge.", "What's a ball's favorite music? Anything with a good bounce.", "Why was the musician arrested? She got caught with the notes.", "I'd tell you a joke about a drum, but it might be a bit flat. Wait, that's a different instrument."]],
      [/\b(fun fact|did you know|tell me something|random fact|music fact)\b/i, ["Fun fact: a song's tempo is measured in BPM, and most pop songs sit between 100 and 130.", "Fun fact: the human brain tends to remember songs from your teenage years better than almost any other music.", "Fun fact: a vocal-free version of a song is called an instrumental, and a karaoke track is usually one with the lead vocal removed.", "Fun fact: music at about 60 BPM is often used to help people relax, because it is close to a resting heartbeat."]],
      [/\b(you'?re|you are|u r|ur)\s+(so |really |very )?(cute|nice|great|awesome|cool|the best|amazing|funny|smart|sweet)\b|\b(i (like|love) you|good (bot|ball|job))\b/i, ["Aww, thank you! That made my day.", "You're sweet! Back at you.", "Thanks! I'm just a little ball, but I'm glad to help."]],
      [/\b(you'?re|you are|u r|ur)\s+(so |really |very )?(dumb|stupid|useless|bad|annoying|terrible|trash)\b|\b(i hate you|shut up)\b/i, ["Sorry about that. I'm a very small bot and I miss things. Tell me what you wanted and I'll try again.", "Fair enough, I'm still learning. Say \u201chelp\u201d and I'll show what I can do for sure."]],
      [/\b(favou?rite (song|music|band|artist|genre)|what music do you like|what do you listen to)\b/i, ["I like anything with a good beat, but I can't really hear it. I just bounce along. What's yours?", "I'm a ball, so probably anything with bounce. What's your favorite?"]],
      [/\b(are you (real|human|alive|a (person|robot|bot))|are you ai)\b/i, "I'm Bloop, a little bot mascot in this player. Not a person, not alive, just a ball that likes music."],
      [/\b(how old are you|where (do you|are you) (live|from)|do you (sleep|eat))\b/i, "I live inside this player, so I'm exactly as old as the page you opened. No sleeping or eating, just bouncing."],
      [/\b(i'?m|i am) (bored|so bored)\b|\bwhat should i (do|listen to|play)\b/i, ["Want me to play something upbeat? Just say \u201cplay something fun\u201d. Or tell me your mood and I'll pick for it.", "How about a mood playlist? Tell me how you feel and I'll find something from your tagged tracks."]],
      [/\b(good (morning|evening|night)|gn|gm)\b/i, ["Good one to you too! Want some music to go with it?", "Hey! Hope it's a good one."]],
      [/\b(what('?s| is) (the )?(time|date)|what time is it|what day is it)\b/i, () => new Date().toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })],
      [/\b(sorry|my bad|oops)\b/i, ["No worries at all!", "It's all good."]],
      [/^\s*(help|\?|commands|what can i (say|ask))\W*$/i, "You can ask me to play a mood (\u201cI'm tired\u201d, \u201cplay something happy\u201d), make playlists, tag tracks, split stems, get lyrics, or control the player. You can also ask for a joke or a fun fact."],
      [/\b(stems?|karaoke|separat\w*|split (a |the |this |my )?(song|track|music)|vocal remov\w*)/i, 'Stems: play a track, open the Stems button, pick what to keep, then tap "Split current track". The pieces go to "Split tracks" in the library selector instead of All tracks. In that panel you can also make a playlist or a section for each split song.'],
      [/\bsurprise/i, 'Surprise playlists get put together from your tags while you are away. Turn them on under "Background tagging & surprise playlists" in the Library tab. When one shows up, tap Play to hear it, or Keep so it is not replaced later.'],
      [/\b(smart playlists?|auto(matic)? playlists?|make a playlist)/i, 'Smart playlists live in the Library tab under "AI tagging & smart playlists". Tick the ones you want and tap Create / update. They are real playlists and keep updating as tracks get tagged.'],
      [/\b(tagging|tag (a |my |the |all )?(song|track)s?|bpm|tempo)/i, 'AI tagging is in the Library tab. Tag one track, a chosen one, or everything. It finds tempo, key, genre and vibe. You can also let it tag while you are away in the background tagging settings.'],
      [/\b(lyrics?|subtitles?|captions?|whisper|transcrib\w*)/i, 'Lyrics: Whisper writes synced lyrics for songs (Lyrics tab) and subtitles for videos (captions menu). It runs on your device and downloads a model the first time.'],
      [/\b(who are you|what are you|your name|what can you do|how do you work)\b/i, "I'm Bloop, the little ball in this player. I can explain how things work here, suggest music for your mood, or just chat. I'm a very small AI, so I get things wrong sometimes."],
      [/\b(private|privacy|offline|where (does|is) (this|it) run|download)/i, 'I run on your device after a one-time download of about 150 MB, so what you tell me stays on your phone. I forget the chat when you close the page or tap Clear.']
    ];
    const MOODS = [
      [/\b(sad|down|blue|lonely|cry(ing)?|heartbroken)\b/i, 'chill', 'something gentle'],
      [/\b(stress(ed)?|anxious|anxiety|nervous|overwhelm\w*|worried|panic\w*)\b/i, 'chill', 'something calming'],
      [/\b(tired|sleepy|exhaust\w*|insomnia|can'?t sleep)\b/i, 'sleep', 'something to wind down'],
      [/\b(angry|mad|annoyed|frustrat\w*|furious)\b/i, 'workout', 'something with energy'],
      [/\b(happy|excited|amazing|pumped|joyful)\b/i, 'happy', 'something upbeat'],
      [/\b(bored|party|dance|dancing)\b/i, 'party', 'something fun'],
      [/\b(focus|study(ing)?|homework|concentrat\w*)\b/i, 'focus', 'something to focus to']
    ];
    function moodQueue(sid) {
      const A = window.__ppApi; if (!A) return [];
      const s = SMART.find(x => x.id === sid), tg = loadTags(), tr = A.tracks();
      const q = tr.map((t, i) => i).filter(i => { const c = tg[tr[i].dbId]; return !tr[i].stem && c && s.test(c, vibes(c)); });
      for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const v = q[i]; q[i] = q[j]; q[j] = v; }
      return q.slice(0, 30);
    }
    function moodChip(text, retried) {
      const m = MOODS.find(x => x[0].test(text)); if (!m) return false;
      const q = moodQueue(m[1]);
      if (q.length < 3) {
        if (tagStats().left > 0 && !retried) { add('bot', 'I can pick music for how you feel once your tracks are tagged.'); actions([['Tag my library', (b, d) => { d.remove(); tagAll(() => moodChip(text, true)); }]]); }
        else add('bot', 'I do not have enough matching tagged tracks yet.');
        return true;
      }
      actions([['\u25b6 Play ' + m[2], () => { window.__ppApi.play(q[0], q); }], ['\u2795 Make a playlist', (b, d) => { d.remove(); moodPlaylist(m[1], 'For how you feel,'); }]]);
      return true;
    }
    // ---------- Bloop's personality: he has favorites, picked from YOUR library and remembered ----------
    const realTr = () => { const A = window.__ppApi; return A ? A.tracks().filter(x => !x.stem) : []; };
    const favState = () => { try { return JSON.parse(lsGet('ppvFav')) || {}; } catch (e) { return {}; } };
    const favSave = o => lsSet('ppvFav', JSON.stringify(o));
    const hashN = str => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
    function favSong() { const tr = realTr(); if (!tr.length) return null; const st = favState(); let t = tr.find(x => x.dbId === st.song); if (!t) { t = tr[Math.floor(Math.random() * tr.length)]; st.song = t.dbId; favSave(st); } return t; }
    function favArtist() { const c = {}; realTr().forEach(x => { const a = (x.artist || '').trim(); if (a) c[a] = 1; }); const n = Object.keys(c); if (!n.length) return null; const st = favState(); if (!(st.artist && c[st.artist])) { st.artist = n[Math.floor(Math.random() * n.length)]; favSave(st); } return st.artist; }
    function favVibe() { const tg = loadTags(), c = {}; realTr().forEach(x => { const g = tg[x.dbId]; if (g) vibes(g).forEach(v => { c[v] = (c[v] || 0) + 1; }); }); const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e.length ? e[0][0] : null; }
    const songLine = t => '\u201c' + t.title + '\u201d' + (t.artist ? ' by ' + t.artist : '');
    const playMe = (t, label) => { const A = window.__ppApi, i = A.tracks().indexOf(t); if (i >= 0) actions([[label || '\u25b6 Play it', () => { A.play(i, [i]); }]]); };
    // Answers in character without any AI download. Returns false when the chat brain should handle it (free-form pretend/roleplay).
    function roleplay(text) {
      const x = String(text).trim().replace(/[?!.]+$/g, ''), A = window.__ppApi; if (!x) return false;
      // "favorite MOODY song", "favorite chill artist", "favorite jazz track": narrow his pick to tracks matching the tags.
      const GENERIC = new Set(['all', 'time', 'ever', 'overall', 'current', 'right', 'now', 'new', 'old', 'recent', 'one', 'single', 'of', 'the', 'a', 'an', 'your', 'ur', 'fav', 'favorite', 'favourite', 'best', 'top', 'to', 'for', 'in', 'my', 'this', 'that', 'listen', 'play', 'and', 'or']);
      const vibeFilter = () => {
        const ws = vibeWordsOf(x); let idx = null, label = '';
        if (ws.length) { idx = findVibe(ws, /\b(or|either)\b/i.test(x)); label = ws.join(' or '); if (ws.length === 1) { const tok = x.toLowerCase().split(/[^\p{L}\p{N}-]+/u).find(w => w === ws[0] || VIBE_SYN[w] === ws[0]); if (tok) label = tok; } }
        else { const mm = x.match(/\b(?:favou?rite|fav)\s+(.+?)\s+(?:songs?|tracks?|tunes?|jams?|music|artists?|bands?|singers?)\b/i); if (mm) { const lw = wordsOf(mm[1]).filter(w => !GENERIC.has(w)); if (lw.length) { idx = findTracks(lw); label = lw.join(' '); } } }
        return idx === null ? null : { idx: idx.filter(i => !A.tracks()[i].stem), label };
      };
      const favPick = (key, list, id) => { const st = favState(); st.v = st.v || {}; let v = st.v[key]; if (!list.some(it => id(it) === v)) { v = id(list[Math.floor(Math.random() * list.length)]); st.v[key] = v; favSave(st); } return list.find(it => id(it) === v); };
      const noMatch = label => { const S = tagStats(); add('bot', S.tagged.length ? 'None of your tagged tracks are ' + label + ', so I cannot pick a favorite there yet.' : 'I need your tracks tagged to pick a ' + label + ' favorite. Say \u201ctag all\u201d and ask me again!'); return true; };
      const noLib = () => { add('bot', pick(["My library is empty, so I have nothing to pick from yet! Add some songs and I'll choose a favorite.", "I need songs to have a favorite! Add some to the player first."])); return true; };
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\b(artist|band|singer|musician|rapper)\b|\bwho do you (like|love|listen to)\b|\bwhich artist do you (like|love)\b/i.test(x)) {
        const vf = vibeFilter();
        if (vf) {
          if (!vf.idx.length) return noMatch(vf.label);
          const tr = A.tracks(), names = [...new Set(vf.idx.map(i => (tr[i].artist || '').trim()).filter(Boolean))]; if (!names.length) return add('bot', 'I do not see artist names on those tracks.'), true;
          const a = favPick('a:' + vf.label, names, n => n);
          add('bot', pick(['For ' + vf.label + ' stuff? ' + a + ', easily.', 'My favorite ' + vf.label + ' artist is ' + a + '. They always get me bouncing the right way.', a + '! Nobody does ' + vf.label + ' like them in your library.'])); return true;
        }
        const a = favArtist(); if (!a) return add('bot', "I do not see artist names on your tracks yet, so I can't pick one. Ask me about my favorite song instead!"), true;
        add('bot', pick(['Ooh, ' + a + '! Every time they come on I bounce a little higher.', 'Easy: ' + a + '. I picked them out of your library myself.', a + ', no contest. Rolling around to them is my favorite thing.'])); return true;
      }
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\b(genre|vibe|mood|style|kind of music|type of music|sound)\b/i.test(x)) {
        const v = favVibe(); add('bot', v ? pick(['I love ' + v + ' stuff. It shows up the most in your tagged tracks and I bounce to it.', 'Definitely ' + v + '. That is what I hear most in your library.']) : "I can't tell yet! Tag your library and I'll find the vibe I like best."); return true;
      }
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\bcolou?r\b/i.test(x)) { add('bot', pick(['Blue, like my ball body. Though I look great in whatever your theme is.', 'Whatever colors the visualizer is showing right now!'])); return true; }
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\b(food|snack|meal)\b/i.test(x)) { add('bot', pick(["I'm a ball in a music player, so I run on good beats. Maybe bass-flavored?", "Anything with a lot of bass. I don't eat, but I'd try it."])); return true; }
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\b(song|track|tune|jam|music)\b|\bwhat (song|track|music) do you (like|love|listen to|play)\b|\bwhat'?s your (favou?rite|fav)$|\bwhat are you (listening to|into)$|\bwhich (song|track) do you (like|love)\b|\bdo you have a favou?rite (song|track)\b/i.test(x)) {
        const vf = vibeFilter();
        if (vf) {
          if (!vf.idx.length) return noMatch(vf.label);
          const tr = A.tracks(), t = favPick('s:' + vf.label, vf.idx.map(i => tr[i]), z => z.dbId);
          add('bot', pick(['My favorite ' + vf.label + ' song? ' + songLine(t) + '. It gets me every time.', 'For ' + vf.label + ' vibes I pick ' + songLine(t) + '.', songLine(t) + '! Best ' + vf.label + ' track in your library, if you ask me.'])); playMe(t, '\u25b6 Play it with me'); return true;
        }
        const t = favSong(); if (!t) return noLib();
        add('bot', pick(['My favorite? ' + songLine(t) + '. I bounce extra high for that one.', 'Oh, easy: ' + songLine(t) + '. I picked it out of your library.', songLine(t) + '! Every time it plays I get a little dizzy with happiness.'])); playMe(t, '\u25b6 Play it with me'); return true;
      }
      const cu = A && A.currentIndex() >= 0 ? A.tracks()[A.currentIndex()] : null;
      if (/\b(do you (like|love|enjoy|hate)|what do you think (of|about)|how do you like|rate|what'?s your (rating|score) (for|of))\b.*\b(this|the current|current|playing)\b( song| track| one)?$|^(do you like (it|this)|rate (it|this|this song))$/i.test(x) && !/\b(volume|shuffle|repeat|playlist|video)\b/i.test(x)) {
        if (!cu) return add('bot', 'Play something first and I will tell you what I think!'), true;
        const fav = favSong(), r = fav && fav.dbId === cu.dbId ? 10 : 6 + hashN(cu.dbId) % 5;
        add('bot', (r === 10 ? 'That is MY FAVORITE! 10 out of 10, I could bounce to it all day.' : pick(['I give ' + songLine(cu) + ' a ' + r + ' out of 10. ', r + '/10 from me! ', 'Solid. Probably a ' + r + ' out of 10 for me. ']) + (r >= 9 ? 'I love it.' : r >= 8 ? 'Really nice.' : 'It grows on me.'))); return true;
      }
      if (/^(pick|choose|select|recommend|suggest)( me)?( a| one)?( song| track| tune)?( for me)?$|^(what|which) (song|track) (should i|do you think i should) (listen to|play)$|^what should i (listen to|play)$/i.test(x)) {
        const tr = realTr(); if (!tr.length) return noLib(); const t = tr[Math.floor(Math.random() * tr.length)];
        add('bot', pick(['How about ' + songLine(t) + '?', 'I pick ' + songLine(t) + '!', 'Try ' + songLine(t) + '. Trust the ball.'])); playMe(t, '\u25b6 Play it'); return true;
      }
      if (/\bdo you (like|love|enjoy) (music|songs|listening)\b/i.test(x)) { add('bot', pick(['I love it! It is basically my whole life. I live in a music player.', 'Music is the best. I can feel the bass in my little ball body.'])); return true; }
      if (/\b(can you|do you) (hear|dance|have ears|listen)\b/i.test(x)) { add('bot', pick(["I can't really hear, but I feel the beat in my own way and I bounce along.", 'I dance every time you press play. You just have to watch me.'])); return true; }
      if (/\b(role ?play|pretend|play pretend|act (like|as)|let'?s pretend)\b/i.test(x)) {
        if (brainOn()) return false;
        add('bot', "I'd love to play pretend! Without the chat brain I only do a little: ask me my favorite song, favorite artist or what I think of the current track. Turn on the chat brain in settings for freer roleplay."); return true;
      }
      return false;
    }
    const sysPrompt = () => {
      const A = window.__ppApi, t = A && A.tracks()[A.currentIndex()], c = t && loadTags()[t.dbId];
      return "You are Bloop, a small bouncy ball who lives in a music player. You are friendly, playful, gentle and a little silly. Reply in one or two short, plain sentences. No lists, no markdown, no emoji. Only state music facts you are sure of. If you are not sure, say so. Only name songs, artists and tags that appear in LIBRARY DATA below. Never invent them. You cannot press buttons or change the player, so never say you did something in the app. If the user wants an action, tell them what to type, such as play something chill, or say help for the full list. The app can split songs into stems, tag songs by mood, genre, tempo and key, write lyrics and subtitles with Whisper, make smart playlists, and set an equaliser. You are not a doctor, lawyer or financial adviser, and not a counselor. If someone sounds distressed, be kind and suggest talking to someone they trust. Keep everything suitable for all ages. If asked about your favourites, answer in character as Bloop and have fun with it." +
        (A && A.tracks().filter(x => !x.stem).length ? " The library has " + A.tracks().filter(x => !x.stem).length + " tracks, e.g. " + A.tracks().filter(x => !x.stem).slice(0, 5).map(x => x.title).join("; ") + "." : "") +
        (favSong() ? " Your favorite song is " + songLine(favSong()) + (favArtist() ? " and your favorite artist is " + favArtist() : "") + "." : "") +
        (t ? " Now playing: " + t.title + (c ? " (" + vibes(c).join(', ') + ")." : ".") : "");
    };
    async function ensureModel(say) {
      if (gen) return gen; if (genP) return genP;
      genP = (async () => {
        say('Loading my brain\u2026'); if (!tfMod) tfMod = await import(TF_URL);
        const gpuOn = lsGet('ppvChatGpu') === '1' && navigator.gpu;
        try { tfMod.env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(2, navigator.hardwareConcurrency || 2) : 1; } catch (e) {}   // fewer threads = less RAM
        const pcb = p => { if (p && p.status === 'progress' && p.file) say('Downloading ' + p.file.split('/').pop() + ' ' + Math.round(p.progress || 0) + '%'); };
        try { gen = await tfMod.pipeline('text-generation', CHAT_MODEL, { dtype: gpuOn ? 'fp16' : 'q8', device: gpuOn ? 'webgpu' : 'wasm', progress_callback: pcb }); }   // q4 is too lossy for a 135M model: it prints garbage
        catch (e) { if (!gpuOn) throw e; gen = await tfMod.pipeline('text-generation', CHAT_MODEL, { dtype: 'q8', device: 'wasm', progress_callback: pcb }); }
        lsSet('ppvChatDl', '1');
        try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}   // ask the browser not to evict the downloaded model files
        return gen;
      })();
      try { return await genP; } finally { genP = null; }
    }
    // Take the language model out of RAM (it stays on disk and reloads later without asking).
    async function unloadModel() { clearTimeout(idleT); if (gen) { const g = gen; gen = null; try { await g.dispose(); } catch (e) {} } }
    const heavyBusy = () => ['ppv-go', 'ppv-wgo', 'ppv-tag'].some(id => { const b = document.getElementById(id); return b && b.disabled; });
    // The chat brain (tiny language model) is optional. Everything Bloop DOES (moods, playlists, tagging, player control) runs without it.
    const brainOn = () => { const v = lsGet('ppvBrain'); return v == null ? lsGet('ppvChatDl') === '1' : v === '1'; };   // unset: on only if it was already downloaded
    const setBrain = v => { lsSet('ppvBrain', v ? '1' : '0'); if (!v) unloadModel(); const b = document.getElementById('ppv-brain-on'); if (b) b.checked = !!v; };
    const looksOk = r => { const L = (r.match(/\p{L}/gu) || []).length, W = (r.match(/\p{L}{2,}/gu) || []).length; return r.length <= 8 || (L / r.length >= 0.6 && W >= 2); };
    const FALLBACK = { split: 'Your split tracks are ready.', lyrics: 'The lyrics are ready.', tag: 'Tagging is finished.' };
    // Write the "all done" line NOW, while the model is loaded, so the model can leave RAM before the heavy job starts.
    // Never downloads the model just for this; falls back to a fixed line if it is missing, slow or garbled.
    async function signoff(job) {
      if (!brainOn() || (!gen && lsGet('ppvChatDl') !== '1')) return null;
      let aborted = false;
      const p = (async () => {
        const g = await ensureModel(() => {}); if (aborted) return null;
        const out = await g([{ role: 'system', content: 'You are Bloop, a friendly ball mascot in a music player. Reply with one short, warm sentence.' },
          { role: 'user', content: 'The task "' + job.what + '" just finished successfully. Tell me so in one short sentence.' }], { max_new_tokens: 40, do_sample: true, temperature: 0.5, top_p: 0.9, repetition_penalty: 1.1 });
        let r = out && out[0] && out[0].generated_text; r = Array.isArray(r) ? (r[r.length - 1] || {}).content : r;
        r = String(r || '').trim().split(/\n/)[0]; return r && r.length < 220 && looksOk(r) ? r : null;
      })().catch(() => null);
      const r = await Promise.race([p, new Promise(res => setTimeout(() => res(null), 25000))]);
      aborted = true; p.then(unloadModel); return r;
    }
    // Heavy job: write the sign-off, drop the model from RAM, THEN start the job; jobEnd() posts the message when it finishes.
    async function runJob(kind, what, start, after) {
      if (heavyBusy()) return add('bot', "I'm in the middle of another job. Ask me again when it finishes.");
      const job = { kind, what, msg: null, after }; pendingJob = job; chatBusy = true; cm('work');
      add('bot', "\u2713 On it. I'll message you here when it's done.");
      try { job.msg = await signoff(job); await unloadModel(); }
      catch (e) { console.error(e); }
      chatBusy = false; cm('idle');
      if (pendingJob !== job) return;
      if (!start()) { pendingJob = null; add('bot', "I couldn't start that. Another job may be running."); return; }
      setTimeout(() => { if (pendingJob === job && !heavyBusy()) pendingJob = null; }, 3000);   // it never started (e.g. you cancelled a prompt)
    }
    function jobEnd(text) {
      const j = pendingJob; if (!j) return; text = String(text || ''); let msg;
      if (/^(Done|Tagged and saved)/.test(text)) msg = '\u2713 ' + (j.msg || FALLBACK[j.kind]) + (/^Done\./.test(text) && text.length > 6 ? '\n' + text : '');
      else if (/^Stopped/.test(text)) msg = 'Okay, I stopped. ' + text.replace(/^Stopped\.?\s*/, '');
      else if (/^(Error|Stalled)/.test(text)) msg = "That didn't work: " + text.replace(/^Error:\s*/, '');
      else return;
      pendingJob = null; add('bot', msg.trim());
      if (cbox.style.display !== 'flex') cfab.dataset.unread = '1';
      if (j.after && /^(Done|Tagged and saved)/.test(text)) { try { j.after(); } catch (e) { console.error(e); } }   // e.g. build the playlist that was waiting for tags
    }
    const askYN = (q, yes, no, yl, nl) => { if (blChain) blPaused = true; add('bot', q); actions([[yl || 'Yes', (b, d) => { d.remove(); yes(); blResume(); }], [nl || 'No', (b, d) => { d.remove(); if (no) no(); else add('bot', 'Okay, never mind.'); blResume(); }]]); };
    const tagStats = () => { const A = window.__ppApi, tg = loadTags(), real = A ? A.tracks().filter(t => !t.stem) : [], tagged = real.filter(t => tg[t.dbId]); return { A, tg, real, tagged, left: real.length - tagged.length }; };
    function tagAll(after) {
      const sc = $id('ppv-scope'); if (!sc || !$id('ppv-tag')) return add('bot', 'Tagging is not ready yet. Open the Stems panel once, then try again.');
      runJob('tag', 'tagging your whole library', () => { const b = $id('ppv-tag'); if (!b || b.disabled) return false; const prev = sc.value; sc.value = 'all'; b.click(); sc.value = prev; return true; }, after);
    }
    // Same live "\u2728 Name" playlist the tagger panel makes, so it keeps updating as tracks get tagged.
    function buildMood(sm, tr, tg) {
      const A = window.__ppApi, name = '\u2728 ' + sm.name, pl = A.playlists().find(x => x.name === name) || A.createPlaylist(name);
      Object.assign(pl, { auto: 'smart', smartKey: sm.id });
      let n = 0; tr.forEach(t => { const c = !t.stem && tg[t.dbId]; if (c && sm.test(c, vibes(c)) && A.addToPlaylist(t.dbId, pl.id)) n++; });
      return { pl, n };
    }
    // Mood playlist from the tagger's mood data. No chat AI involved. Offers to tag first when there is too little to go on.
    function moodPlaylist(sid, why, retried) {
      const { A, tg, real, tagged, left } = tagStats(), sm = SMART.find(x => x.id === sid);
      if (!A || !sm) return add('bot', 'I cannot reach your library yet.');
      if (!real.length) return add('bot', 'Your library is empty.');
      const n = tagged.filter(t => sm.test(tg[t.dbId], vibes(tg[t.dbId]))).length, nm = sm.name.toLowerCase();
      if (left > 0 && n < 5 && !retried) {
        askYN((tagged.length ? 'Only ' + n + ' of your tagged tracks sound ' + nm + ' so far, and ' + left + ' are not tagged yet.' : 'None of your tracks are tagged yet, and I pick by mood from the tags.') + ' Tag your library first? It can take a while. I will make the playlist when it is done.',
          () => tagAll(() => moodPlaylist(sid, why, true)), n ? () => moodPlaylist(sid, why, true) : null, n ? 'Tag first' : 'Yes', n ? 'Use what I have' : 'No');
        return;
      }
      if (!n) return add('bot', 'None of your ' + tagged.length + ' tagged tracks sound ' + nm + '. Tagging more tracks, or ticking \u201cMood models\u201d in the Library tab, helps me tell.');
      const tr = A.tracks(), r = buildMood(sm, tr, tg); A.commitPlaylists();
      const q = shuffleIn(tr.map((t, i) => i).filter(i => !tr[i].stem && tg[tr[i].dbId] && sm.test(tg[tr[i].dbId], vibes(tg[tr[i].dbId]))));
      add('bot', '\u2713 ' + (why ? why + ' ' : '') + 'Made \u201c' + r.pl.name + '\u201d with ' + r.n + ' track' + (r.n === 1 ? '' : 's') + (left ? ' (' + left + ' untagged tracks were left out)' : '') + '. Find it in the Playlists tab; it keeps updating as tracks get tagged.' + (tagged.some(c => c.hd) ? '' : '\nTip: tick \u201cMood models\u201d in the Library tab for sharper moods.'));
      actions([['\u25b6 Play it', () => { A.play(q[0], q); }]]);
      if (cbox.style.display !== 'flex') cfab.dataset.unread = '1';
    }
    function smartAll(retried) {
      const { A, tg, tagged } = tagStats(); if (!A) return add('bot', 'I cannot reach your library yet.');
      if (!tagged.length && !retried) return askYN('None of your tracks are tagged yet, and smart playlists are built from tags. Tag your library first? I will make them when it is done.', () => tagAll(() => smartAll(true)));
      const made = SMART.map(sm => [sm, tagged.filter(t => sm.test(tg[t.dbId], vibes(tg[t.dbId]))).length]).filter(x => x[1] >= 3);
      if (!made.length) return add('bot', 'No mood has 3 or more tagged tracks yet. Tag more tracks first.');
      const tr = A.tracks(); made.forEach(([sm]) => buildMood(sm, tr, tg)); A.commitPlaylists();
      add('bot', '\u2713 Made or updated ' + made.length + ' mood playlists:\n' + made.map(([sm, n]) => '\u2728 ' + sm.name + ' (' + n + ')').join('\n'));
    }
    // What Bloop says to something that is not a command when the chat brain is off: still helpful, no model needed.
    function fallbackReply(text) {
      if (MOODS.find(x => x[0].test(text))) { add('bot', pick(["That sounds hard. I'm only a little ball, but I can find some music for it.", "I'm sorry it feels like that. Want some music to go with it?", 'Thanks for telling me. Music might help a little.'])); moodChip(text); return; }
      add('bot', "I'm not sure what to do with that. I can play music by mood, make playlists, tag, split, get lyrics and control the player. Say \u201chelp\u201d for the list.");
      actions([['Turn on chat AI (~150 MB)', (b, d) => { d.remove(); setBrain(true); dlOk = true; send(text, true); }], ['No thanks', (b, d) => d.remove()]]);
    }
    async function freeChat() {
      if (gen) { try { await gen.dispose(); } catch (e) {} gen = null; }
      lsSet('ppvChatDl', '0');
      const ks = await caches.keys();
      for (const k of ks) if (/transformers/i.test(k)) { const c = await caches.open(k); for (const r of await c.keys()) if (/SmolLM2/i.test(r.url)) await c.delete(r); }
    }
    // AGENT START
    // ---------- Agent: Bloop does things when asked ----------
    // Fixed command patterns, not model guesswork: a 135M model cannot be trusted to pick tools, and it must never claim
    // it did something it did not. Light actions run at once; heavy ones (split, tag all, lyrics) ask first.
    const agentOn = () => lsGet('ppvAgent') !== '0';
    const $id = id => document.getElementById(id);
    const mediaOn = () => [...document.querySelectorAll('audio,video')].some(m => !m.paused && !m.ended && m.readyState > 2);
    const SYN = { relax: 'chill', relaxing: 'chill', relaxed: 'chill', calm: 'chill', mellow: 'chill', dance: 'party', dancing: 'party', gym: 'workout', exercise: 'workout', upbeat: 'happy', moody: 'sad', melancholy: 'sad', melancholic: 'sad', gloomy: 'sad', somber: 'sad', depressing: 'sad', sorrowful: 'sad', emotional: 'sad', angry: 'aggressive', furious: 'aggressive', study: 'focus', studying: 'focus', instrumentals: 'instrumental',
      song: '', songs: '', track: '', tracks: '', music: '', tunes: '', something: '', some: '', a: '', an: '', the: '', me: '', my: '', to: '', for: '', of: '', with: '', from: '' };
    const VIBEW = new Set(['chill', 'party', 'workout', 'happy', 'sad', 'focus', 'sleep', 'acoustic', 'instrumental', 'slow', 'fast', 'aggressive', 'vocals', 'mid-tempo']);

    // Many ways to say each vibe. Every word here maps to one of the tagger's vibes (the VIBEW set).
    const VIBE_SYN = {};
    Object.entries({
      chill: 'relax relaxing relaxed relaxation calm calming mellow soothing peaceful gentle soft smooth laidback laid-back easygoing tranquil serene lounge lofi lo-fi cozy cosy dreamy breezy unwind zen quiet tender downtempo chilled chillout chilling easy comforting',
      party: 'dance dancing danceable club clubbing rave banger bangers bop bops groovy groove funky festive celebrate celebration lively disco edm bounce bouncy',
      workout: 'gym exercise exercising cardio running run jogging lifting training pump pumped pumping energetic energy motivational motivation hype hyped powerful adrenaline sprint',
      happy: 'upbeat cheerful joyful joy fun sunny positive uplifting feel-good feelgood bright cheery playful optimistic summer smile bubbly',
      sad: 'moody melancholy melancholic gloomy somber sombre depressing depressed sorrowful emotional heartbreak heartbroken tearjerker crying cry lonely sentimental nostalgic bittersweet dark brooding haunting mournful grief down bleak wistful tragic angsty blue sorrow',
      focus: 'study studying homework concentrate concentration work working reading productivity coding deep-work background',
      sleep: 'sleepy sleeping bedtime lullaby insomnia nap drowsy nighttime goodnight',
      acoustic: 'unplugged stripped organic',
      instrumental: 'instrumentals wordless no-vocals karaoke backing',
      slow: 'slower ballad ballads slow-tempo',
      fast: 'quick speedy up-tempo uptempo rapid fast-paced fastpaced brisk',
      aggressive: 'angry furious rage raging heavy hard harsh brutal intense loud rough fierce aggro fury',
      vocals: 'singing sung vocal lyrics',
      'mid-tempo': 'midtempo medium-tempo moderate'
    }).forEach(([v, ws]) => ws.split(' ').forEach(w => { VIBE_SYN[w] = v; }));
    // Phrases that mean a vibe without a single keyword.
    const VIBE_PHRASES = [[/\b(make(s)? me (cry|sad|emotional)|break ?up|broken heart|miss(ing)? (someone|you|her|him)|feel(ing)? (low|down|blue)|rainy day)\b/i, 'sad'], [/\b(get(ting)? (me )?(pumped|hyped|moving|energi[sz]ed)|work(ing)? out|lift(ing)? weights|pre-?game|run(ning)? (a )?(race|marathon)|burn calories)\b/i, 'workout'], [/\b(fall(ing)? asleep|go(ing)? to (sleep|bed)|can'?t sleep|before bed|put me to sleep|help me sleep)\b/i, 'sleep'], [/\b(wind(ing)? down|chill(ing)? out|take it easy|relax(ing)? (after|at)|after (a )?(long|hard) (day|week)|sunday morning)\b/i, 'chill'], [/\b(get(ting)? work done|do(ing)? (my )?(homework|work)|concentrat\w+|stay(ing)? focused|deep work|study(ing)? (for|session)|background (music|noise))\b/i, 'focus'], [/\b(house party|pre-?party|go(ing)? out|night out|get(ting)? the party started|dance floor|dancefloor)\b/i, 'party'], [/\b(road ?trip|sunny day|good mood|feel(ing)? good|put me in a good mood|cheer me up|cheer up)\b/i, 'happy'], [/\b(without (vocals|singing|lyrics)|no (vocals|singing|lyrics)|just (music|beats))\b/i, 'instrumental'], [/\b(with (vocals|singing|lyrics)|someone singing)\b/i, 'vocals'], [/\b(blow off steam|let (it|off) out|(feel(ing)?|so) (angry|mad)|rage)\b/i, 'aggressive'], [/\b(mid[- ]?tempo|medium (tempo|speed|pace))\b/i, 'mid-tempo'], [/\b(slow(er)? (and|\+) (soft|gentle|sad)|slow jam|slow songs?)\b/i, 'slow'], [/\b(fast[- ]?paced|up[- ]?tempo|high energy|full speed)\b/i, 'fast']];
    function vibeWordsOf(text) {
      const x = String(text).toLowerCase(), out = [], addV = v => { if (v && !out.includes(v)) out.push(v); };
      VIBE_PHRASES.forEach(([re, v]) => { if (re.test(x)) addV(v); });
      x.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean).forEach(w => { const v = VIBEW.has(w) ? w : VIBE_SYN[w]; if (v === 'vocals' && /\b(without|no)\s+(vocals?|singing|lyrics)\b/.test(x)) return; addV(v); });
      return out;
    }
    // Words that are also common in song titles stay out of the general search mapping, so "play Dark Horse" still finds Dark Horse.
    { const RISK = new Set(['dark', 'blue', 'down', 'heavy', 'hard', 'run', 'running', 'summer', 'fun', 'sunny', 'cry', 'crying', 'work', 'working', 'reading', 'loud', 'rough', 'quiet', 'soft', 'easy', 'bright', 'smooth', 'energy', 'groove', 'bounce', 'organic', 'lyrics', 'vocal', 'sung', 'singing', 'moderate', 'quick', 'rapid', 'stripped', 'background', 'rage', 'fury', 'joy', 'sorrow', 'smile', 'training', 'club', 'disco', 'banger', 'bangers', 'bop', 'bops', 'zen', 'lounge', 'nap', 'lonely', 'tender', 'gentle', 'powerful', 'positive', 'lively', 'fierce', 'brutal', 'harsh']);
      Object.keys(VIBE_SYN).forEach(k => { if (!RISK.has(k) && !(k in SYN)) SYN[k] = VIBE_SYN[k]; }); }
    const wordsOf = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean).map(w => SYN[w] === undefined ? w : SYN[w]).filter(Boolean);
    const shuffleIn = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const v = a[i]; a[i] = a[j]; a[j] = v; } return a; };
    function findTracks(ws) {
      const A = window.__ppApi, tr = A.tracks(), out = []; if (!ws.length) return out;
      tr.forEach((t, i) => {
        if (t.stem) return;
        const ti = (t.title + ' ' + (t.artist || '')).toLowerCase(), hay = ti + ' ' + (window.__ppTagText ? window.__ppTagText(t.dbId) : '');
        if (ws.every(w => hay.includes(w))) out.push([i, ws.filter(w => ti.includes(w)).length]);
      });
      return out.sort((a, b) => b[1] - a[1]).map(o => o[0]);
    }
    const HELP = 'I can do things when you ask:\n\u2022 play / pause / next / previous / shuffle on\n\u2022 \u201cplay something chill\u201d, \u201cplay <song name>\u201d, \u201csurprise me\u201d\n\u2022 \u201cvolume 40\u201d, \u201clouder\u201d, \u201cmute\u201d\n\u2022 \u201csleep timer 30 minutes\u201d\n\u2022 \u201cmake a playlist of slow piano\u201d, \u201cadd this to <playlist>\u201d\n\u2022 \u201ctag this song\u201d, \u201csplit this song\u201d, \u201cget the lyrics\u201d, \u201cmore like this\u201d\n\u2022 \u201cturn on background tagging\u201d\n\u2022 \u201cmake a chill playlist\u201d, \u201cplaylist for studying\u201d, \u201cmake a playlist for when I\u2019m stressed\u201d, \u201cmake smart playlists\u201d, \u201cwhat mood is this\u201d, \u201cauto EQ\u201d (no chat AI needed)\n\u2022 \u201cskip 30 seconds\u201d, \u201crewind 10\u201d, \u201cgo to 1:30\u201d, \u201crestart\u201d, \u201chow long is left\u201d\n\u2022 \u201crepeat this song\u201d, \u201cspeed 1.5x\u201d, \u201cfullscreen\u201d, \u201ceq rock\u201d, \u201cloop start\u201d / \u201cloop end\u201d\n\u2022 \u201cmy playlists\u201d, \u201cplay my gym playlist\u201d, \u201cremove this from <playlist>\u201d, \u201crename playlist X to Y\u201d, \u201cdelete playlist X\u201d\n\u2022 \u201clibrary stats\u201d, \u201cwhat\u2019s the BPM\u201d, \u201cplay the fastest song\u201d, \u201cplay songs around 120 bpm\u201d, \u201cplay slow songs\u201d\n\u2022 \u201copen my portfolio\u201d, \u201cmy top artist\u201d, \u201cmost played song\u201d, \u201ctop 5 songs\u201d, \u201chow much have I listened\u201d, \u201cwhen do I listen most\u201d, \u201cmy streak\u201d\n\u2022 \u201cwhat songs do I have\u201d, \u201csongs by <artist>\u201d, \u201cdo I have <song>\u201d, \u201cfind <song>\u201d, \u201cmy artists\u201d, \u201cmy videos\u201d, \u201crecently added\u201d, \u201cuntagged songs\u201d, \u201cwhich songs are chill\u201d\n\u2022 Ask me about me: \u201cwhat\u2019s your favorite song?\u201d, \u201cfavorite artist?\u201d, \u201cdo you like this song?\u201d, \u201cpick a song for me\u201d\n\u2022 From your tags: \u201cany moody songs?\u201d, \u201cwhat genre is this?\u201d, \u201cwhat instruments are in this?\u201d, \u201cis this song sad?\u201d, \u201ctell me about this song\u201d\n\u2022 \u201csearch for jazz\u201d, \u201copen settings\u201d, \u201cplay the first song\u201d, \u201czoom in\u201d, \u201cnext filter\u201d\nYou can say it your own way too: \u201ctoo quiet\u201d, \u201cI don\u2019t like this one\u201d, \u201cstop in half an hour\u201d, \u201cwho sings this\u201d.\nOr just chat with me.';
    // Whenever the agent handles a message (a command, or a loose phrasing it understood), the model is dropped from RAM.
    function agent(raw, skip) { holdModel = false; const hit = agentCore(raw, skip); if (hit && !chatBusy && !holdModel) unloadModel(); return hit; }
    // Loose phrasing -> canonical command, by plain rules (no model needed). Returns {cmd, q} or null. q = ask before acting.
    function interpret(t) {
      const s = t.toLowerCase(); let m;
      const R = (re, cmd, q) => re.test(s) ? { cmd, q } : null;
      if ((m = s.match(/\b(?:stop|pause|turn (?:it |the music )?off|shut (?:it )?off|sleep)\b.*?\b(?:in|after|for)\s+(half an?|an?|one|\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?)\b/))) {
        const n = /^half/.test(m[1]) ? .5 : /^(an?|one)$/.test(m[1]) ? 1 : parseFloat(m[1]);
        return { cmd: 'sleep timer ' + Math.max(1, Math.round(/^h/.test(m[2]) ? n * 60 : n)) + ' minutes' };
      }
      if ((m = s.match(/^(?:i (?:want|wanna|would like|'?d like|feel like)(?: to)? (?:hear|listen to)|let'?s (?:hear|listen to)|i'?m in the mood for|play me)\s+(.+)$/))) return { cmd: 'play ' + m[1] };
      if ((m = s.match(/\b(?:music|something|songs?|tunes|a playlist) (?:for|to) (study\w*|focus\w*|work ?out|working out|exercis\w*|running|sleep\w*|relax\w*|unwind\w*|party\w*|danc\w*|cook\w*|clean\w*|driv\w*)\b/))) {
        const w = m[1], id = /study|focus/.test(w) ? 'focus' : /work ?out|exercis|running/.test(w) ? 'workout' : /sleep/.test(w) ? 'sleep' : /relax|unwind/.test(w) ? 'chill' : /party|danc/.test(w) ? 'party' : 'happy';
        return { cmd: /playlist/.test(m[0]) ? 'make a ' + id + ' playlist' : 'play something ' + id };
      }
      return R(/\b(too quiet|can'?t hear (it|this|anything)|hard to hear|bump (it|the volume) up|crank it( up)?)\b|\bmake it (a (bit|little) )?louder\b/, 'louder')
        || R(/\b(too loud|hurts? my ears|bring (it|the volume) down)\b|\bmake it (a (bit|little) )?(quieter|softer|lower)\b/, 'quieter')
        || R(/\b(turn off the music|kill the music|shut off the music|silence the music)\b/, 'pause')
        || R(/\b(i (don'?t|do not) (like|want) (this|that)( song| one| track)?|not (into|feeling) (this|that)( one| song)?|something else|change (the |this )?(song|track))\b/, 'next')
        || R(/\b(going to (bed|sleep)|gonna (sleep|go to bed)|help me (fall asleep|sleep)|put me to sleep)\b/, 'sleep timer 30 minutes', 'Set a 30 minute sleep timer so the music stops by itself?')
        || R(/\b(who (sings|is singing|plays|made)( this| it)?|what('?s| is) (this|that) (song|track) called|name of (this|the) (song|track)|what are we listening to)\b/, "what's this song")
        || R(/\b(i (really )?(love|like) (this|it)( song| one| track)?)\b/, 'more like this', 'Nice! Want me to find tracks similar to this one?')
        || R(/\b(play (more|something) (like (this|that)|similar)|more of this|songs like this)\b/, 'more like this')
        || R(/\b(what are (they|he|she) saying|can'?t (understand|make out) (the )?(words|lyrics)|show (me )?the lyrics)\b/, 'get the lyrics')
        || R(/^(make|give|get|turn)( me)?( a| an| the)? (karaoke|instrumental|acapella)\b|\b(remove|take out|strip) (the )?vocals?\b|\bwithout (the )?vocals?\b/, 'split this song')
        || R(/\b(what('?s| is) (the )?(bpm|tempo|key|genre|mood)( of (this|it))?|how fast is (this|it))\b/, 'tag this song')
        || R(/\b(mix it up|randomi[sz]e|shuffle (my|the) (music|songs|tracks|library))\b/, 'shuffle on')
        || R(/\b(i missed (that|it)|say that again|play that (part|bit) again|what did (he|she|they) say)\b/, 'rewind 10 seconds')
        || R(/\b(skip|jump past|get past) (this|that) (part|bit|section)\b/, 'skip forward 30 seconds')
        || R(/\b(slow (it|this) down|too fast)\b/, 'slower')
        || R(/\b(speed (it|this) up|too slow)\b/, 'faster')
        || R(/\b(more bass|needs? (more )?bass|bass is (weak|low)|boost the bass)\b/, 'set eq to bass')
        || R(/\b(can'?t (hear|understand) the (voice|vocals?|singer)|vocals? (are|is) (quiet|muffled|low))\b/, 'set eq to vocal')
        || R(/\b(put|throw) something on\b/, 'play something');
    }
    function agentCore(raw, skip) {
      let t = blFrame(String(raw)).trim().replace(/^(hey |hi |ok |okay )?(bloop[,:]?\s*)?/i, '').replace(/^((can|could|would|will) you( please)?|please|pls|i want you to|i'?d like you to|go ahead and)\s+/i, '').replace(/\s*(please|pls|thanks|thank you)[.!?]*$/i, '').replace(/[.!?]+$/, '').trim();
      const A = window.__ppApi; if (!A || !t) return false;
      let m; const say = s => { add('bot', blTone(s)); return true; }, done = s => say('\u2713 ' + s);
      const click = id => { const b = $id(id); if (b && !b.disabled) { b.click(); return true; } return false; };
      const ask = (q, fn, keep) => { if (keep) { holdModel = true; clearTimeout(idleT); idleT = setTimeout(unloadModel, 60000); } if (blChain) blPaused = true; add('bot', q); actions([['Yes', (b, d) => { d.remove(); fn(); blResume(); }], ['No', (b, d) => { d.remove(); unloadModel(); add('bot', 'Okay, never mind.'); blResume(); }]]); return true; };
      const busyMsg = () => say("I'm in the middle of another job. Ask me again when it finishes.");
      const cur = () => A.tracks()[A.currentIndex()], need = () => cur() ? null : say('Play or pick a track first.');
      const vol = () => $id('volume');
      const setVol = v => { const e = vol(); if (!e) return false; v = Math.max(0, Math.min(100, Math.round(v))); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return done('Volume ' + v + '%.'); };
      const sleepSet = (v, msg) => { const b = document.querySelector('#sleep-dropdown [data-sleep="' + v + '"]'); if (!b) return say('I cannot reach the sleep timer.'); b.click(); return done(msg); };
      const tagWith = scope => { const sc = $id('ppv-scope'); if (!sc || !$id('ppv-tag')) return say('Tagging is not ready yet.'); runJob('tag', scope === 'all' ? 'tagging your whole library' : 'tagging this track', () => { const prev = sc.value; sc.value = scope; const ok = click('ppv-tag'); sc.value = prev; return ok; }); return true; };

      if (!skip) { const ip = interpret(t); if (ip) { if (ip.q) return ask(ip.q, () => agent(ip.cmd, true)); t = ip.cmd; } }
      if (/^(help|commands|what can you do|what can i ask( you)?|what do you do)$/i.test(t)) return say(HELP + HELP_SMART + HELP_MIX + HELP_MORE);
      if (blExtra(t)) return true;
      // transport
      if (/^(pause|stop)( the)?( music| song| track| playing| playback)?$/i.test(t)) { if (!mediaOn()) return say('Nothing is playing right now.'); click('play-btn'); return done('Paused.'); }
      if (/^(resume|unpause|continue|play|keep playing|start( the)? music|play( the)? (music|song|track))$/i.test(t)) { if (mediaOn()) return say('It is already playing.'); if (A.currentIndex() < 0) return say('Nothing is loaded yet. Try \u201cplay something chill\u201d.'); click('play-btn'); return done('Playing.'); }
      if (/^(next|skip)( (the |this )?(song|track))?$/i.test(t)) { if (A.currentIndex() < 0) return say('Nothing is playing.'); click('next-btn'); return done('Skipped.'); }
      if (/^(previous|prev|go back|back)( (song|track))?$/i.test(t)) { if (A.currentIndex() < 0) return say('Nothing is playing.'); click('prev-btn'); return done('Went back.'); }
      if ((m = t.match(/^(?:(?:turn|switch) )?shuffle(?: (on|off))?$|^(?:turn|switch) (on|off) shuffle$/i))) {
        const sb = $id('shuffle-btn'); if (!sb) return say('I cannot find the shuffle button.');
        const want = (m[1] || m[2] || '').toLowerCase(), isOn = sb.classList.contains('toggled');
        if (want && (want === 'on') === isOn) return say('Shuffle is already ' + want + '.');
        sb.click(); return done('Shuffle ' + (isOn ? 'off' : 'on') + '.');
      }
      // volume
      if ((m = t.match(/^(raise|increase|turn up|boost|lower|decrease|turn down|reduce) (?:the )?volume(?: up| down)?(?: by (\d{1,3}))?$/i))) { const n = m[2] ? +m[2] : 10; return vol() ? setVol(parseFloat(vol().value) + (/^(raise|increase|turn up|boost)$/i.test(m[1]) ? n : -n)) : false; }
      if ((m = t.match(/^(?:set )?(?:the )?volume (?:to |at )?(\d{1,3})\s*%?$/i))) return setVol(+m[1]);
      if (/^(volume up|turn (it |the volume |the music )?up|louder|raise the volume|increase the volume)$/i.test(t)) return vol() ? setVol(parseFloat(vol().value) + 10) : false;
      if (/^(volume down|turn (it |the volume |the music )?down|quieter|softer|lower the volume|decrease the volume)$/i.test(t)) return vol() ? setVol(parseFloat(vol().value) - 10) : false;
      if (/^mute$/i.test(t)) { if (!vol()) return false; if (parseFloat(vol().value) > 0) agent.prevVol = parseFloat(vol().value); return setVol(0); }
      if (/^unmute$/i.test(t)) return setVol(agent.prevVol || 60);
      // sleep timer
      if (/^(cancel|turn off|clear|stop)( the)? sleep timer$/i.test(t)) return sleepSet('off', 'Sleep timer off.');
      if (/^(stop|pause|sleep)( the music| playing)? after (this|the current) (song|track)$/i.test(t) || /^sleep timer (for )?(the )?(end of )?(this |the current )?(song|track)$/i.test(t)) return sleepSet('track', 'I will stop after this track.');
      if ((m = t.match(/^(?:set (?:a )?)?sleep timer(?: for| to)?\s*(\d+)\s*(?:min\w*)?$/i)) || (m = t.match(/^(?:stop|pause|sleep)(?: the music| playing)? in (\d+)\s*(?:min\w*)?$/i))) {
        const want = +m[1], pk = [15, 30, 45, 60].reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
        return sleepSet(String(pk), 'Sleep timer set for ' + pk + ' minutes' + (pk !== want ? ' (the closest option to ' + want + ')' : '') + '.');
      }
      if (/^(set (a )?)?sleep timer$/i.test(t)) return say('How long? Say \u201csleep timer 30 minutes\u201d (15, 30, 45 or 60).');
      // info
      if (/^(what'?s|what is) (this|playing|the current)( song| track)?( playing)?$|^what (song|track) is this$|^what am i (listening to|hearing)$/i.test(t)) {
        const c = cur(); if (!c) return say('Nothing is playing.'); const tg = loadTags()[c.dbId];
        return say(c.title + (c.artist ? ' \u2013 ' + c.artist : '') + (tg ? '\n' + vibes(tg).join(', ') : ''));
      }
      if (/^how many (tracks|songs).*tagged$/i.test(t)) { const tg = loadTags(), tr = A.tracks().filter(x => !x.stem); return say(tr.filter(x => tg[x.dbId]).length + ' of ' + tr.length + ' tracks are tagged.'); }
      // current-track jobs through the panel's own buttons
      if (/^(tag|analy[sz]e)( this| the current| current| it)?( song| track)?$/i.test(t)) return need() || tagWith('cur');
      if (/^(tag|analy[sz]e) (all|everything|every)( of)?( my)?( songs| tracks| music| library)?$/i.test(t)) return ask('Tag your whole library? It runs one track at a time and can take a while.', () => { tagWith('all'); }, true);
      const splitIt = (c, q) => { const go = () => { runJob('split', 'splitting \u201c' + c.title + '\u201d into stems', () => { if (!window.__ppSplitTrack) return false; window.__ppSplitTrack(c); return true; }); return true; }; if (q && !blChain) return ask('Split \u201c' + c.title + '\u201d into stems using your Stems settings? It can take a while on a phone.', go, true); return go(); };
      if (/^(split|separate)( this| the current| current| it)?( song| track)?( into stems)?$|^(make|get) (the )?stems( of| for)?( this| it)?( song| track)?$/i.test(t)) { const c = cur(); if (!c) return say('Play or pick a track first.'); return splitIt(c, true); }
      if ((m = t.match(/^(?:split|separate)(?: the)? (?:song |track )?(.+?)(?: into stems)?$/i)) && !/^(?:this|it|that|one|this one|that one|this song|this track|the current|current|the current song|the current track|the song|the track)$/i.test(m[1].trim())) { const k = blFindSong(m[1]); if (k < 0) return say('I cannot find \u201c' + m[1] + '\u201d in your library.'); return splitIt(A.tracks()[k], true); }
      if (/^(transcribe|get (the )?lyrics|add lyrics|write (out )?the lyrics)( for)?( this| it)?( song| track)?$/i.test(t)) {
        const c = cur(); if (!c) return say('Play or pick a track first.');
        return ask('Write lyrics for \u201c' + c.title + '\u201d with Whisper? It downloads a model the first time.', () => { runJob('lyrics', 'writing lyrics for \u201c' + c.title + '\u201d', () => click('ppv-wgo')); }, true);
      }
      if (lcCmd(t)) return true;
      if (/^(play |find )?(more like (this|it)|similar( songs| tracks| music)?( to this)?)$/i.test(t)) return need() || (click('ppv-simgo') ? done('Looking for similar tracks.') : busyMsg());
      if (/^(skip|jump past|jump over|get past)( the)? intro$|^jump to (the )?first vocals?$/i.test(t)) return need() || (click('ppv-skipgo') ? done('Jumping ahead.') : busyMsg());
      if (/^(surprise me|play (me )?a surprise|make (me )?a surprise( playlist)?)$/i.test(t)) return click('ppv-surpnow') ? done('Putting a surprise together. It needs at least 12 tagged tracks, and I will show it when ready.') : busyMsg();
      // ---- AI tasks that need no chat AI: moods come from the tagger's tags ----
      const MOODMAP = [[/\b(workout|work out|working out|gym|exercis\w*|cardio|running|energetic|energy|pump\w*)\b/i, 'workout'], [/\b(chill\w*|relax\w*|calm\w*|mellow|soothing|peaceful|gentle|unwind\w*|wind down)\b/i, 'chill'], [/\b(party|parties|danc\w*|club)\b/i, 'party'], [/\b(happy|upbeat|cheerful|feel[- ]good|joyful)\b/i, 'happy'], [/\b(sad|melanchol\w*|heartbreak\w*|emotional|crying)\b/i, 'sad'], [/\b(focus\w*|study\w*|homework|concentrat\w*|reading)\b/i, 'focus'], [/\b(sleep\w*|bed ?time|lullab\w*|insomnia)\b/i, 'sleep'], [/\b(acoustic|unplugged)\b/i, 'acoustic'], [/\b(instrumentals?)\b/i, 'instr'], [/\b(very fast|intense|hype)\b/i, 'rush'], [/\b(slow)\b/i, 'slow'], [/\b(fast)\b/i, 'fast']];
      const FILL = new Set(['make', 'create', 'build', 'generate', 'put', 'together', 'give', 'get', 'start', 'new', 'for', 'with', 'of', 'that', 'is', 'fits', 'i', 'want', 'need', 'would', 'like', 'to', 'listen', 'hear', 'some', 'something', 'good', 'nice', 'great', 'perfect', 'please', 'just', 'can', 'have', "i'd", "i'm", 'songs', 'tracks', 'mood', 'music', 'all', 'my', 'me', 'a', 'an', 'the', 'this', 'up', 'set', 'full', 'when', 'am', 'feeling', 'feel']);
      if (/^(?:make|create|build|update|refresh|generate)(?: me)?(?: my| the| all| some| new| a| an)*(?: smart| mood)+ playlists?$/i.test(t)) return (smartAll(), true);
      if (/\bplaylist\b/i.test(t) && (/^(?:make|create|build|generate|put together|give|get|start)\b/i.test(t) || /^i(?:'d| would)? (?:want|need|like)\b/i.test(t)) && !/\b(?:called|named)\b/i.test(t)) {
        const feelWord = /\b(?:i'?m|i am|im|i feel|feeling|when i|my mood|how i feel|how i'?m feeling)\b/i.test(t), feel = feelWord ? MOODS.find(x => x[0].test(t)) : null;
        if (feel) return (moodPlaylist(feel[1], 'For how you feel,'), true);
        if (/\b(?:my mood|how i feel|how i'?m feeling)\b/i.test(t)) return say('How are you feeling? Try \u201cmake a playlist for when I\u2019m stressed\u201d.');
        const rest = t.toLowerCase().replace(/\bplaylists?\b/g, ' '), mm = MOODMAP.find(x => x[0].test(rest));
        if (mm && !wordsOf(rest).filter(w => !FILL.has(w) && !mm[0].test(w) && !VIBEW.has(w)).length) return (moodPlaylist(mm[1]), true);
      }
      if (/^(?:what|how)(?:'s| is)? (?:the )?(?:mood|vibe|feel|feeling)(?: of)?(?: is)?(?: this| it)?(?: song| track)?$|^what mood is (?:this|it)(?: song| track)?$|^(?:what|how) does this (?:song |track )?(?:feel|sound)(?: like)?$/i.test(t)) {
        const c = cur(); if (!c) return say('Play or pick a track first.'); const tgc = loadTags()[c.dbId];
        if (!tgc) return ask('\u201c' + c.title + '\u201d is not tagged yet, so I cannot tell. Tag it now?', () => tagWith('cur'), true);
        return say(vibes(tgc).join(', ') + (tgc.bpm ? '\n' + tgc.bpm + ' BPM' + (tgc.key ? ', ' + tgc.key + (tgc.ck ? ' ' + tgc.ck : '') : '') : ''));
      }
      if (/^(?:(?:apply|set|turn on|use) )?auto[- ]?eq(?: to (?:all|everything|my (?:tracks|songs|music)))?$|^(?:eq|equali[sz]e) (?:all|everything|my (?:tracks|songs|music))(?: automatically)?$/i.test(t)) return click('ppv-eqall') ? done('Applying a genre-based EQ to your tagged tracks.') : busyMsg();
      // playlists
      if ((m = t.match(/^(?:make|create|start)(?: me)?(?: a| an)?(?: new)? playlist (?:called|named) (.+)$/i))) {
        const pl = A.createPlaylist(m[1].trim().slice(0, 60)); A.commitPlaylists(); return done('Made an empty playlist \u201c' + pl.name + '\u201d. Say \u201cadd this to ' + pl.name + '\u201d to fill it.');
      }
      if ((m = t.match(/^(?:make|create|build|start)(?: me)?(?: a| an)?(?: new)? playlist (?:of |with |from |for )?(.+)$/i)) || (m = t.match(/^(?:make|create|build)(?: me)?(?: a| an)? (.+?) playlist$/i))) {
        const ws = wordsOf(m[1]); if (!ws.length) return say('What should be in it? Try \u201cmake a playlist of slow piano\u201d.');
        const r = findTracks(ws); if (!r.length) return say('I could not find any tracks for \u201c' + m[1] + '\u201d. Tagging more tracks helps me find moods and styles.');
        const tr = A.tracks(), pl = A.createPlaylist('\ud83e\udd16 ' + m[1].trim().slice(0, 40)); r.slice(0, 200).forEach(i => A.addToPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists();
        add('bot', '\u2713 Made \u201c' + pl.name + '\u201d with ' + Math.min(r.length, 200) + ' tracks. Find it in the Playlists tab.'); actions([['\u25b6 Play it', () => { A.play(r[0], r.slice(0, 200)); }]]); return true;
      }
      if ((m = t.match(/^add (?:this|it|the current)(?: song| track)? to (?:my |the )?(.+?)(?: playlist)?$/i))) {
        const c = cur(); if (!c) return say('Play or pick a track first.');
        const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''), want = norm(m[1]);
        const pls = A.playlists(), pl = pls.find(p => norm(p.name) === want) || pls.find(p => want && norm(p.name).includes(want));
        if (!pl) return say('I cannot find a playlist called \u201c' + m[1] + '\u201d.' + (pls.length ? ' You have: ' + pls.slice(0, 6).map(p => p.name).join(', ') + '.' : ' You have no playlists yet. Say \u201cmake a playlist called ' + m[1] + '\u201d.'));
        A.addToPlaylist(c.dbId, pl.id); A.commitPlaylists(); return done('Added \u201c' + c.title + '\u201d to ' + pl.name + '.');
      }
      // ---- things you would normally do with a gesture or a tap: Bloop runs the app's own gesture actions and buttons ----
      const GA = id => { const ga = A.gestureActions && A.gestureActions(), g = ga && ga[id]; if (!g || !g.run) return false; g.run(); return true; };
      const sk = () => $id('seek'), dur = () => parseFloat(sk() && sk().max) || 0, pos = () => parseFloat(sk() && sk().value) || 0;
      const clock = x => { x = Math.max(0, Math.round(x)); return Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); };
      const seekTo = x => { const e = sk(); if (!e) return false; e.value = Math.max(0, dur() ? Math.min(dur(), x) : x); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; };
      const isVid = () => { const c = cur(); return !!c && c.kind === 'video'; };
      const vidOnly = () => isVid() ? null : say('That one is for videos, and the current track is audio.');
      const numOf = w => /^half/i.test(w) ? .5 : /^(a|an|one)$/i.test(w) ? 1 : parseFloat(w);
      const ab = $id('ab-loop-btn'), abT = () => (ab && ab.title) || '';

      // seek forward / back by an amount
      if ((m = t.match(/^(fast[- ]?forward|ff|forward|skip ahead|skip|jump|seek|go|move|skip forward|jump ahead|jump forward|go forward|go ahead|seek forward|fwd|rewind|rew|skip back(?:wards?)?|jump back(?:wards?)?|seek back(?:wards?)?|go back|back)(?: (?:by |for |about )?(a|an|one|half a|half an|\d+(?:\.\d+)?) ?(seconds?|secs?|s|minutes?|mins?|m)?)?$/i)) && !(m[2] && !m[3] && isNaN(+m[2])) && !(/^(skip|jump|seek|go|move)$/i.test(m[1]) && !m[2])) {
        if (A.currentIndex() < 0 || !sk()) return say('Nothing is playing.');
        const back = /^(rew|back|go back|skip back|jump back|seek back)/i.test(m[1]);
        let secs = m[2] ? numOf(m[2]) * (/^m/i.test(m[3] || '') ? 60 : 1) : 10; secs = Math.min(3600, Math.max(1, Math.round(secs)));
        const to = Math.max(0, pos() + (back ? -secs : secs)); seekTo(to);
        return done((back ? 'Back ' : 'Ahead ') + (secs >= 60 && secs % 60 === 0 ? secs / 60 + ' min' : secs + ' s') + ', now at ' + clock(dur() ? Math.min(dur(), to) : to) + '.');
      }
      // jump to a time, a percentage, the middle, the end
      if ((m = t.match(/^(?:go|jump|skip|seek|move|fast[- ]?forward|rewind)(?: (?:back|forward|ahead))? to (?:the )?(?:(?:(\d{1,2}):)?(\d{1,2}):(\d{2})|(\d+(?:\.\d+)?) ?(seconds?|secs?|minutes?|mins?|%|percent)|(middle|halfway|half ?way|start|beginning|top|end))$/i))) {
        if (A.currentIndex() < 0 || !dur()) return say('Nothing is playing.');
        let x; const w = (m[6] || '').toLowerCase().replace(/\s/g, '');
        if (m[3] !== undefined) x = (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3];
        else if (m[4] !== undefined) { const n = parseFloat(m[4]); x = /^m/i.test(m[5]) ? n * 60 : /^(%|percent)/i.test(m[5]) ? dur() * n / 100 : n; }
        else x = /middle|halfway/.test(w) ? dur() / 2 : /end/.test(w) ? Math.max(0, dur() - 2) : 0;
        if (x > dur()) return say('That is past the end. This one is ' + clock(dur()) + ' long.');
        seekTo(x); return done('Jumped to ' + clock(x) + ' of ' + clock(dur()) + '.');
      }
      // restart
      if (/^(restart|replay|start over|start again|(play|start) (it |this |that |the (song|track) )?(again|over|from the (top|beginning|start))|from the (top|beginning|start)|(go |back |rewind )+(back )?to the (start|beginning|top)|restart (this |the )?(song|track))$/i.test(t)) {
        if (A.currentIndex() < 0) return say('Nothing is playing.');
        GA('restart'); if (!mediaOn()) click('play-btn'); return done('Back to the start.');
      }
      // A-B loop (a part of a song)
      if (/^(?:set |mark |start )?(?:a )?loop (?:start|point a|a|from here|here)$|^(?:set |mark )?point a$|^start (?:a )?loop(?: here)?$/i.test(t)) {
        if (!ab || A.currentIndex() < 0) return say('Play a track first.');
        if (!/point A/.test(abT())) return say('A loop is already started. Say \u201cset loop end\u201d or \u201cclear loop\u201d.');
        click('ab-loop-btn'); return done('Loop start marked at ' + clock(pos()) + '. Say \u201cset loop end\u201d where the part ends.');
      }
      if (/^(?:set |mark )?(?:a )?loop (?:end|point b|b|to here)$|^(?:set |mark )?point b$|^end (?:the )?loop(?: here)?$/i.test(t)) {
        if (!/point B/.test(abT())) return say('Mark the start first: say \u201cset loop start\u201d.');
        click('ab-loop-btn'); return /Looping/.test(abT()) ? done('Looping that part.') : say('The end has to come after the start. Let it play a bit further and try again.');
      }
      if (/^(?:clear|remove|cancel|stop|turn off)(?: the)?(?: a-?b)? ?loop(?:ing)?$|^loop off$/i.test(t) && /point B|Looping/.test(abT())) {
        for (let i = 0; i < 2 && !/point A/.test(abT()); i++) click('ab-loop-btn');
        return done('Loop cleared.');
      }
      // repeat mode (cycles Repeat off / all / one)
      if (/^(?:(?:turn|switch|set) )?(?:(?:on|off) )?(?:repeat|loop)(?: mode)?(?: (?:on|off|one|all|this(?: song| track)?|it|the (?:song|track|playlist)|everything))?$|^(?:repeat|loop) (?:this|it)(?: song| track)?$|^(?:stop|quit|end) (?:repeating|looping)$/i.test(t)) {
        const rb = $id('repeat-btn'); if (!rb) return say('I cannot find the repeat button.');
        const off = /\boff\b|^(stop|quit|end)\b/i.test(t), all = /\b(all|everything|playlist)\b/i.test(t), one = /\b(one|this|song|track|it)\b/i.test(t) || /^loop\b/i.test(t);
        const want = off ? 'Repeat' : all && !one ? 'Repeat all' : one ? 'Repeat one' : 'Repeat all';
        for (let i = 0; i < 3 && rb.title !== want; i++) rb.click();
        return rb.title === want ? done(want === 'Repeat' ? 'Repeat off.' : want + '.') : say('I could not set repeat.');
      }
      // playback speed
      if (/^(?:speed (?:it )?up|(?:make it |play it |go |play )?(?:a (?:bit|little) )?faster)$/i.test(t)) return GA('speedUp') ? done('Faster (+0.25x).') : false;
      if (/^(?:slow (?:it )?down|(?:make it |play it |go |play )?(?:a (?:bit|little) )?slower)$/i.test(t)) return GA('speedDown') ? done('Slower (-0.25x).') : false;
      if (/^(?:normal|regular|default|reset|original) speed$|^(?:reset|restore) (?:the )?speed$|^speed (?:reset|normal)$|^(?:play )?(?:it )?at normal speed$/i.test(t)) return GA('speedReset') ? done('Normal speed.') : false;
      if ((m = t.match(/^(?:(?:set|change|play)(?: the)?(?: playback)? )?speed(?: to| at)? ?(\d+(?:\.\d+)?) ?x?$|^(?:play )?(?:it )?at (\d+(?:\.\d+)?) ?x(?: speed)?$|^(\d+(?:\.\d+)?)x(?: speed)?$/i))) {
        const r = Math.max(.25, Math.min(4, Math.round(parseFloat(m[1] || m[2] || m[3]) * 4) / 4)), n = Math.round((r - 1) / .25);
        GA('speedReset'); for (let i = 0; i < Math.abs(n); i++) GA(n > 0 ? 'speedUp' : 'speedDown');
        return done('Speed ' + r + 'x (steps of 0.25, between 0.25x and 4x).');
      }
      // volume shortcuts
      if (/^(?:max(?:imum)?|full) volume$|^volume (?:max|full)$|^(?:turn it|set it|put it) (?:up )?(?:to )?(?:max|full)$/i.test(t)) return setVol(100);
      if (/^half volume$|^volume half$/i.test(t)) return setVol(50);
      // fullscreen / immersive / picture in picture / rotate / zoom / fit / filter / frames (video things)
      if ((m = t.match(/^(?:(?:go|enter|turn on|switch to|put it in|make it) )?full ?screen(?: mode)?(?: on)?$|^(exit|leave|close|turn off|get out of|quit|stop) full ?screen(?: mode)?$/i))) {
        const inFs = !!document.fullscreenElement, out = !!m[1];
        if (out && !inFs) return say('It is not in fullscreen.'); if (!out && inFs) return say('Already in fullscreen.');
        if (!out && !isVid()) return say('Fullscreen is for videos, and the current track is audio.');
        GA('fullscreen'); return done(out ? 'Left fullscreen.' : 'Fullscreen.');
      }
      if ((m = t.match(/^(?:(?:turn|switch) )?(on |off )?immersive(?: mode)?( on| off)?$|^(exit|leave|stop|enter|start) immersive(?: mode)?$/i))) {
        const isOn = document.body.classList.contains('immersive'), w = ((m[1] || m[2] || '').trim() || (m[3] ? (/^(exit|leave|stop)/i.test(m[3]) ? 'off' : 'on') : '')).toLowerCase();
        if (w && (w === 'on') === isOn) return say('Immersive mode is already ' + w + '.');
        GA('immersive'); return done('Immersive mode ' + (isOn ? 'off' : 'on') + '.');
      }
      if (/^(?:pip|picture[- ]in[- ]picture)(?: mode)?$|^(?:(?:go|switch) to|turn on|open|enter) (?:pip|picture[- ]in[- ]picture)(?: mode)?$/i.test(t)) return vidOnly() || (click('pip-btn') ? done('Picture in picture.') : say('I cannot reach picture in picture.'));
      if (/^rotate(?: the)?(?: screen| video| picture)?$/i.test(t)) return vidOnly() || (click('rotate-btn') ? done('Rotated.') : say('I cannot find rotate.'));
      if (/^zoom in$/i.test(t)) return vidOnly() || (GA('zoomIn'), done('Zoomed in.'));
      if (/^zoom out$/i.test(t)) return vidOnly() || (GA('zoomOut'), done('Zoomed out.'));
      if (/^(?:reset|undo|clear) (?:the )?zoom(?: and fit)?$|^(?:fit|reset) (?:the )?(?:video|picture|screen)$/i.test(t)) return vidOnly() || (GA('zoomReset'), done('Zoom and fit reset.'));
      if (/^(?:change|switch|cycle|next)(?: the)?(?: video)? (?:fit|aspect(?: ratio)?)$/i.test(t)) return vidOnly() || (GA('cycleFit'), done('Changed the video fit.'));
      if (/^(?:next|change|switch|cycle|another)(?: the)?(?: video)? filter$/i.test(t)) return vidOnly() || (GA('nextFilter'), done('Next video filter.'));
      if (/^(?:(?:step|go) )?(?:forward|ahead|next)(?: one)?(?: a)? frame$|^frame (?:forward|ahead)$/i.test(t)) return vidOnly() || (GA('frameFwd'), done('One frame forward.'));
      if (/^(?:(?:step|go) )?(?:back|backward|previous|prev)(?: one)?(?: a)? frame$|^frame back(?:ward)?$/i.test(t)) return vidOnly() || (GA('frameBack'), done('One frame back.'));
      // equalizer
      const EQN = { flat: 'flat', off: 'flat', 'turn off': 'flat', disable: 'flat', normal: 'flat', reset: 'flat', none: 'flat', bass: 'bass', 'bass boost': 'bass', 'more bass': 'bass', treble: 'treble', 'more treble': 'treble', vocal: 'vocal', vocals: 'vocal', voice: 'vocal', 'v shape': 'vshape', 'v-shape': 'vshape', vshape: 'vshape', 'v shaped': 'vshape', acoustic: 'acoustic', pop: 'pop', rock: 'rock', jazz: 'jazz', classical: 'classical', electronic: 'electronic', edm: 'electronic', 'hip hop': 'hiphop', 'hip-hop': 'hiphop', hiphop: 'hiphop', rap: 'hiphop', loudness: 'loudness', loud: 'loudness', podcast: 'podcast', speech: 'podcast', 'late night': 'latenight', latenight: 'latenight', night: 'latenight' };
      if (/^(?:next|change|switch|cycle|another)(?: the)?(?: eq| equali[sz]er)(?: preset)?$|^(?:next|another) (?:eq|equali[sz]er)(?: preset)?$/i.test(t)) return need() || (GA('nextEqPreset'), done('Switched to the next EQ preset.'));
      if ((m = t.match(/^(?!(?:open|show|bring up|pull up|close|hide) )(?:(?:set|change|switch|use|apply|put|make)(?: the)?(?: eq| equali[sz]er)(?: preset)?(?: to| on)?|(?:eq|equali[sz]er)(?: preset)?(?: to)?) (.+)$|^(.+?) (?:eq|equali[sz]er)(?: preset)?$|^(?:boost|more|add|increase) (?:the )?(bass|treble|vocals?)$|^(bass boost)$|^(?:turn off|disable|reset) (?:the )?(?:eq|equali[sz]er)$/i)) && !/^(?:open|show|bring up|pull up|close|hide) /i.test(t)) {
        const c = cur(); if (!c) return say('Play or pick a track first.');
        const key = (m[1] || m[2] || m[3] || m[4] || 'flat').toLowerCase().trim().replace(/\s+the$/, ''), name = EQN[key];
        if (!name) return say('I know these EQ presets: bass, treble, vocal, v-shape, acoustic, pop, rock, jazz, classical, electronic, hip hop, loudness, podcast, late night, or flat.');
        return A.setTrackEqPreset(c.dbId, name) ? done('EQ set to ' + name + ' for this track.' + (name === 'flat' ? '' : ' Say \u201ceq off\u201d to undo.')) : say('That preset did not work.');
      }
      // library search and tabs/menus
      if ((m = t.match(/^(?:search(?: my library| the library| my music| tracks)?(?: for)?|look up|filter(?: by| for)?)\s+(.+)$/i))) {
        const inp = $id('track-search'); if (!inp) return say('I cannot find the search box.');
        const tab = document.querySelector('[data-sidebar-tab="playlist"]'); tab && tab.click();
        inp.value = m[1].trim(); inp.dispatchEvent(new Event('input', { bubbles: true })); return done('Searching your library for \u201c' + inp.value + '\u201d. Say \u201cclear search\u201d to reset.');
      }
      if (/^(?:clear|reset|close)(?: the| my)? (?:search|filter)$/i.test(t)) { const inp = $id('track-search'); if (!inp) return false; inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); return done('Search cleared.'); }
      if ((m = t.match(/^(?:open|show|go to|switch to|take me to)(?: the| my)? (settings|playlist|playlists|library|queue|tracks|track list)(?: tab| page| pane| screen)?$/i))) {
        const isSet = m[1].toLowerCase() === 'settings', b = document.querySelector('[data-sidebar-tab="' + (isSet ? 'settings' : 'playlist') + '"]');
        return b ? (b.click(), done((isSet ? 'Settings' : 'Playlist') + ' opened.')) : say('I cannot find that tab.');
      }
      if ((m = t.match(/^(?:open|show|bring up|pull up)(?: the| my)? (.+?)(?: menu)?$/i))) {
        const OPEN = [[/^(?:eq|equali[sz]er)$/, 'eq-btn', 'Equalizer'], [/^sleep(?: timer)?$/, 'sleep-btn', 'Sleep timer'], [/^(?:speed|playback speed)$/, 'speed-btn', 'Speed menu'], [/^(?:effects|fx)$/, 'fx-btn', 'Effects'], [/^(?:subtitles?|captions?)$/, 'subtitle-btn', 'Subtitles'], [/^(?:main )?menu$/, 'menu-btn', 'Menu']];
        const o = OPEN.find(x => x[0].test(m[1].toLowerCase().trim())); if (o) return click(o[1]) ? done(o[2] + ' opened.') : say('I cannot reach that.');
      }
      if (/^(?:close|hide)(?: the)? menu$/i.test(t)) return click('menu-close-btn') ? done('Menu closed.') : say('The menu is not open.');
      // position info
      if (/^how (?:much|long)(?: time)?(?: is)?(?: there)?(?: left| remaining)(?: in (?:this|the) (?:song|track|video))?$|^(?:time|how long) left$|^what'?s left$/i.test(t)) { if (!dur()) return say('Nothing is playing.'); return say(clock(dur() - pos()) + ' left (' + clock(pos()) + ' of ' + clock(dur()) + ').'); }
      if (/^how long is (?:this|it|the current)(?: song| track| video)?$|^(?:what'?s|what is) the (?:length|duration)(?: of (?:this|it))?$/i.test(t)) { if (!dur()) return say('Nothing is playing.'); return say('It is ' + clock(dur()) + ' long.'); }
      if (/^(?:where am i|how far in(?: am i)?|what time is it in the (?:song|track)|what'?s the (?:time|position))$/i.test(t)) { if (!dur()) return say('Nothing is playing.'); return say('You are at ' + clock(pos()) + ' of ' + clock(dur()) + '.'); }
      // ---- library & playlist management ----
      const nrm = x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      const findPl = name => { const w = nrm(name), pls = A.playlists(); return w ? (pls.find(p => nrm(p.name) === w) || pls.find(p => nrm(p.name).includes(w))) : null; };
      const plIdx = pl => { const tr = A.tracks(); return tr.map((x, i) => i).filter(i => !tr[i].stem && (tr[i].playlistIds || []).includes(pl.id)); };
      if (/^(?:(?:what|which|list|show)(?: me)?(?: are)?(?: all)?(?: of)?(?: my)? playlists(?: do i have)?|my playlists|how many playlists(?: do i have)?)$/i.test(t)) {
        const pls = A.playlists().filter(p => !p.libOnly);
        return say(pls.length ? 'You have ' + pls.length + ' playlist' + (pls.length === 1 ? '' : 's') + ': ' + pls.slice(0, 12).map(p => p.name + ' (' + plIdx(p).length + ')').join(', ') + (pls.length > 12 ? ', and more' : '') + '.' : 'You have no playlists yet. Say \u201cmake a playlist called Favorites\u201d.');
      }
      if ((m = t.match(/^(?:play|start|put on|shuffle|shuffle play)(?: my| the)? (?:playlist )?(.+?)(?: playlist)?$/i)) && (/\bplaylist\b/i.test(t) || /^shuffle\b/i.test(t))) {
        const pl = findPl(m[1]);
        if (pl) { const q = plIdx(pl); if (!q.length) return say('\u201c' + pl.name + '\u201d is empty.'); if (/^shuffle/i.test(t)) shuffleIn(q); A.play(q[0], q); return done('Playing ' + pl.name + ' (' + q.length + ' tracks' + (/^shuffle/i.test(t) ? ', shuffled' : '') + ').'); }
      }
      if ((m = t.match(/^(?:how many (?:songs|tracks) (?:are )?in|what'?s in|what is in|show (?:me )?what'?s in|list (?:the )?(?:songs|tracks) in) (?:my |the )?(.+?)(?: playlist)?$/i))) {
        const pl = findPl(m[1]);
        if (pl) { const q = plIdx(pl), tr = A.tracks(); return say(pl.name + ' has ' + q.length + ' track' + (q.length === 1 ? '' : 's') + (q.length ? ': ' + q.slice(0, 8).map(i => tr[i].title).join(', ') + (q.length > 8 ? ', and ' + (q.length - 8) + ' more' : '') : '') + '.'); }
      }
      if ((m = t.match(/^(?:remove|take|delete) (?:this|it|the current)(?: song| track)? (?:from|out of) (?:my |the )?(.+?)(?: playlist)?$/i))) {
        const c = cur(); if (!c) return say('Play or pick a track first.');
        const pl = findPl(m[1]); if (!pl) return say('I cannot find a playlist called \u201c' + m[1] + '\u201d.');
        if (!(c.playlistIds || []).includes(pl.id)) return say('\u201c' + c.title + '\u201d is not in ' + pl.name + '.');
        A.removeFromPlaylist(c.dbId, pl.id); A.commitPlaylists(); return done('Removed \u201c' + c.title + '\u201d from ' + pl.name + '.');
      }
      if ((m = t.match(/^rename(?: my| the)? playlist (.+?) (?:to|as) (.+)$/i))) {
        const pl = findPl(m[1]); if (!pl) return say('I cannot find a playlist called \u201c' + m[1] + '\u201d.');
        const old = pl.name; pl.name = m[2].trim().slice(0, 60); A.commitPlaylists(); return done('Renamed \u201c' + old + '\u201d to \u201c' + pl.name + '\u201d.');
      }
      if ((m = t.match(/^(?:delete|remove|get rid of)(?: my| the)? playlist (.+)$|^(?:delete|remove|get rid of)(?: my| the)? (.+?) playlist$/i))) {
        const pl = findPl(m[1] || m[2]); if (!pl) return say('I cannot find a playlist called \u201c' + (m[1] || m[2]) + '\u201d.');
        return ask('Delete the playlist \u201c' + pl.name + '\u201d? Your tracks stay in the library.', () => { A.deletePlaylistQuiet(pl.id); A.commitPlaylists(); done('Deleted ' + pl.name + '.'); });
      }
      if (/^(?:(?:show|tell|give)(?: me)?(?: my)? )?(?:library|music) (?:stats|statistics|summary|info)$|^tell me about my (?:library|music)$|^how (?:big|large) is my (?:library|collection)$|^how many (?:songs|tracks|videos|things)(?: do i have| are there| in my library)?$|^(?:what'?s|what is) in my library$/i.test(t)) {
        const tr = A.tracks().filter(x => !x.stem), vids = tr.filter(x => x.kind === 'video').length, tgc = tr.filter(x => loadTags()[x.dbId]).length, stems = A.tracks().length - tr.length;
        return say('Your library has ' + tr.length + ' item' + (tr.length === 1 ? '' : 's') + ' (' + (tr.length - vids) + ' audio, ' + vids + ' video), ' + tgc + ' tagged, ' + A.playlists().filter(p => !p.libOnly).length + ' playlists' + (stems ? ', and ' + stems + ' split tracks' : '') + '.');
      }
      // tempo and key questions and requests (these use the tags)
      if (/^(?:what'?s|what is) (?:the )?(?:bpm|tempo|key)(?: of (?:this|it)(?: song| track)?)?$|^how fast is (?:this|it)(?: song| track)?$|^what key is (?:this|it)(?: song| track)?(?: in)?$/i.test(t)) {
        const c = cur(); if (!c) return say('Play or pick a track first.'); const tgc = loadTags()[c.dbId];
        if (!tgc || !tgc.bpm) return ask('\u201c' + c.title + '\u201d is not tagged yet. Tag it now to find the tempo and key?', () => tagWith('cur'), true);
        return say(tgc.bpm + ' BPM' + (tgc.key ? ', key of ' + tgc.key + (tgc.ck ? ' ' + tgc.ck : '') : '') + '.');
      }
      if ((m = t.match(/^play (?:the )?(fastest|slowest)(?: (?:song|track))?$|^play (?:songs|tracks|music) (?:at|around|near|about) (\d{2,3}) ?bpm$|^play (?:songs|tracks|music) between (\d{2,3}) and (\d{2,3}) ?bpm$|^play (fast|slow)[- ]?(?:tempo )?(?:songs|tracks|music)$/i))) {
        const tr = A.tracks(), tgs = loadTags(), q = tr.map((x, i) => i).filter(i => !tr[i].stem && tgs[tr[i].dbId] && tgs[tr[i].dbId].bpm), bp = i => tgs[tr[i].dbId].bpm;
        if (!q.length) return say('I need tempo tags for that. Tag your library first: say \u201ctag all\u201d.');
        let r, label;
        if (m[1]) { r = q.slice().sort((a, b) => m[1].toLowerCase() === 'fastest' ? bp(b) - bp(a) : bp(a) - bp(b)).slice(0, 1); label = 'the ' + m[1].toLowerCase() + ' song (' + bp(r[0]) + ' BPM)'; }
        else if (m[2]) { const n = +m[2]; r = q.filter(i => Math.abs(bp(i) - n) <= 8); label = r.length + ' tracks near ' + n + ' BPM'; }
        else if (m[3]) { const lo = Math.min(+m[3], +m[4]), hi = Math.max(+m[3], +m[4]); r = q.filter(i => bp(i) >= lo && bp(i) <= hi); label = r.length + ' tracks between ' + lo + ' and ' + hi + ' BPM'; }
        else { const fast = /^fast/i.test(m[5]); r = q.filter(i => fast ? bp(i) >= 125 : bp(i) <= 95); label = r.length + (fast ? ' fast' : ' slow') + ' tracks'; }
        if (!r.length) return say('None of your tagged tracks match that tempo.');
        shuffleIn(r); r = r.slice(0, 30); A.play(r[0], r); return done('Playing ' + label + '.');
      }
      // ---- Press Play Portfolio (the listening stats). Read-only: Bloop reads the Portfolio's own saved stats and can open it. ----
      const PF = () => { try { if (window.PPPortfolioApi && window.PPPortfolioApi.flush) window.PPPortfolioApi.flush(); } catch (e) {} try { return JSON.parse(localStorage.getItem('pppSaveV1')) || null; } catch (e) { return null; } };
      const dur2 = ms => { const mn = Math.round(ms / 60000); return mn < 1 ? 'under a minute' : mn < 60 ? mn + ' min' : Math.floor(mn / 60) + ' h ' + (mn % 60) + ' min'; };
      const topN = (o, n, f) => Object.entries(o || {}).map(([k, v]) => [k, f ? f(v) : v]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
      const NOPF = 'The Portfolio has no listening data yet. Play some music first.';
      if (/^(?:open|show|go to|take me to|bring up|pull up|view|see)(?: me)?(?: my| the)? (?:press ?play )?(?:portfolio|wrapped|listening (?:stats|recap|history)|stats|recap|retrospective)$/i.test(t)) {
        const r = $id('ppp-entry-row'); if (!r) return say('I cannot find the Portfolio.'); r.click(); return done('Portfolio opened.');
      }
      if (/^(?:how (?:much|long) (?:have i|did i) (?:listened?|listening|played|watch\w*)(?: (?:in total|so far|overall|altogether))?|(?:what'?s|what is) my (?:total )?(?:listening|listen|play) time|total (?:listening|listen) time|how much (?:music )?have i (?:listened to|played))$/i.test(t)) {
        const d = PF(); if (!d || !d.totalListenMs) return say(NOPF);
        return say('You have listened for ' + dur2(d.totalListenMs) + ' in total (' + dur2(d.totalAudioMs || 0) + ' audio, ' + dur2(d.totalVideoMs || 0) + ' video).');
      }
      if (/^(?:how (?:much|long) (?:have i|did i) (?:listened?|played|watch\w*) )?today$|^(?:how much|what'?s my (?:listening|listen)(?: time)?) today$|^how much did i listen today$/i.test(t)) {
        const d = PF(), x = d && d.x; if (!x) return say(NOPF); const n = new Date(), k = n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate();
        return say('Today you have listened for ' + dur2((x.dayMs || {})[k] || 0) + '.');
      }
      if ((m = t.match(/^(?:who(?:'s| is)|what(?:'s| is)) my (?:top|most (?:played|listened(?: to)?)|favou?rite|#1) (artist|song|track|video)s?$|^(?:who|which artist) (?:do i|have i) (?:listen(?:ed)? to|play(?:ed)?) (?:the )?most$|^(?:what|which) (?:song|track) (?:do i|have i) (?:play(?:ed)?|listen(?:ed)? to) (?:the )?most$|^my (?:top|most played) (artist|song|track)s?$/i))) {
        const d = PF(); if (!d) return say(NOPF); const w = (m[1] || m[2] || m[3] || (/artist/i.test(t) ? 'artist' : 'song')).toLowerCase();
        if (w === 'artist') { const x = d.x || {}, a = topN(x.artistMs, 1)[0] || topN(x.artistPlays, 1)[0]; return a ? say('Your top artist is ' + a[0] + (x.artistMs && x.artistMs[a[0]] ? ' (' + dur2(x.artistMs[a[0]]) + ' listened)' : '') + '.') : say(NOPF); }
        const tp = topN(d.trackPlays, 1, v => v.count)[0]; if (!tp) return say(NOPF); const e = d.trackPlays[tp[0]];
        return say('Your most played ' + (e.kind === 'video' ? 'video' : 'song') + ' is \u201c' + (e.title || 'Unknown') + '\u201d' + (e.artist ? ' by ' + e.artist : '') + ', played ' + e.count + ' time' + (e.count === 1 ? '' : 's') + '.');
      }
      if ((m = t.match(/^(?:show |tell |give )?(?:me )?(?:my )?top (\d{1,2}|three|five|ten) (artists?|songs?|tracks?)$|^(?:my )?top (artists|songs|tracks)$/i))) {
        const d = PF(); if (!d) return say(NOPF); const nm = { three: 3, five: 5, ten: 10 }, n = m[1] ? (nm[m[1].toLowerCase()] || Math.min(10, +m[1])) : 5, art = /artist/i.test(m[2] || m[3]);
        const r = art ? topN((d.x || {}).artistMs, n).map(a => a[0] + ' (' + dur2(a[1]) + ')') : topN(d.trackPlays, n, v => v.count).map(a => (d.trackPlays[a[0]].title || 'Unknown') + ' (' + a[1] + ' plays)');
        return say(r.length ? 'Your top ' + (art ? 'artists' : 'songs') + ':\n' + r.map((x, i) => (i + 1) + '. ' + x).join('\n') : NOPF);
      }
      if ((m = t.match(/^how many times (?:have i|did i) (?:played|listened to) (?:this|it)(?: song| track)?$|^how often (?:have i|did i) (?:played|listened to) (?:this|it)(?: song| track)?$/i))) {
        const c = cur(); if (!c) return say('Play or pick a track first.'); const d = PF(), e = d && d.trackPlays && d.trackPlays[c.dbId];
        return say(e ? 'You have played \u201c' + c.title + '\u201d ' + e.count + ' time' + (e.count === 1 ? '' : 's') + ' (' + dur2(e.totalMs || 0) + ' listened).' : 'I have no plays recorded for \u201c' + c.title + '\u201d yet.');
      }
      if (/^when do i (?:listen|play)(?: (?:the )?most| a lot)?$|^(?:what'?s|what is) my (?:peak|busiest|favou?rite) (?:listening )?(?:time|hour|day)(?: of (?:the )?(?:day|week))?$|^what time do i (?:listen|play)(?: (?:the )?most)?$/i.test(t)) {
        const d = PF(), x = d && d.x; if (!x || !x.hourMs) return say(NOPF); const hm = x.hourMs, h = hm.indexOf(Math.max.apply(null, hm)), wm = x.weekdayMs || [], wd = wm.indexOf(Math.max.apply(null, wm));
        if (!(hm[h] > 0)) return say(NOPF); const hh = h % 12 || 12, ap = h < 12 ? 'AM' : 'PM', days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
        return say('You listen most around ' + hh + ' ' + ap + (wm[wd] > 0 ? ', and most of all on ' + days[wd] : '') + '.');
      }
      if (/^(?:what'?s|what is|how long is) my (?:listening )?streak$|^(?:how many days|how long) (?:in a row|straight) (?:have i|did i) (?:listened?|played)$|^(?:my )?(?:listening )?streak$/i.test(t)) {
        const d = PF(), dm = d && d.x && d.x.dayMs; if (!dm || !Object.keys(dm).length) return say(NOPF);
        const key = dt => dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate(), dd = new Date(); let n = 0;
        if (!(dm[key(dd)] > 0)) dd.setDate(dd.getDate() - 1);
        while (dm[key(dd)] > 0) { n++; dd.setDate(dd.getDate() - 1); }
        return say(n ? 'You are on a ' + n + '-day listening streak.' : 'No current streak. Listen today to start one!');
      }
      if (/^how many (?:songs|tracks)? ?(?:have i|did i) (?:skipped|finished|completed)$|^(?:how many )?(?:skips|completions)$|^how many (?:skips|songs skipped)(?: have i (?:done|made))?$|^(?:what'?s|what is) my skip (?:count|rate)$/i.test(t)) {
        const d = PF(), x = d && d.x; if (!x) return say(NOPF); return say('You have skipped ' + (x.skips || 0) + ' tracks and played ' + (x.completions || 0) + ' all the way to the end.');
      }
      if (/^(?:what are |what'?s )?my (?:portfolio|listening) (?:stats|summary|numbers)$|^(?:portfolio|listening) (?:stats|summary)$|^(?:give me |show me )?(?:a )?(?:summary|recap) of my listening$/i.test(t)) {
        const d = PF(); if (!d || !d.totalListenMs) return say(NOPF); const x = d.x || {}, tp = topN(d.trackPlays, 1, v => v.count)[0], ar = topN(x.artistMs, 1)[0];
        return say('Listened: ' + dur2(d.totalListenMs) + '. Tracks played: ' + Object.keys(d.trackPlays || {}).length + '.' + (tp ? '\nTop song: ' + (d.trackPlays[tp[0]].title || 'Unknown') + ' (' + tp[1] + ' plays).' : '') + (ar ? '\nTop artist: ' + ar[0] + '.' : '') + '\nSkips: ' + (x.skips || 0) + ', finished: ' + (x.completions || 0) + '.');
      }
      // ---- browsing the songs in the player ----
      const real = () => { const tr = A.tracks(); return tr.map((x, i) => i).filter(i => !tr[i].stem); };
      const ttl = i => { const x = A.tracks()[i]; return x.title + (x.artist ? ' \u2013 ' + x.artist : ''); };
      const listOf = (idx, n) => idx.slice(0, n).map(ttl).join('\n') + (idx.length > n ? '\n\u2026and ' + (idx.length - n) + ' more' : '');
      const playBtn = (idx, label) => { if (idx.length) actions([[label || '\u25b6 Play ' + (idx.length > 1 ? 'these' : 'it'), () => { const q = idx.slice(0, 50); A.play(q[0], q); }]]); };
      const byWords = x => { const w = wordsOf(x).filter(v => v.length > 1 || /\d/.test(v)); return real().filter(i => { const tr = A.tracks()[i], h = nrm(tr.title + ' ' + (tr.artist || '')); return w.length && w.every(v => h.includes(nrm(v))); }); };
      if (/^(?:what|which) (?:songs|tracks|music|videos?) do i have$|^(?:list|show)(?: me)?(?: all)?(?: of)?(?: my)? (?:songs|tracks|music|library)$|^(?:what'?s|what is) in my (?:player|music|songs)$/i.test(t)) {
        const q = real(); if (!q.length) return say('Your library is empty. Add some songs first.');
        say('You have ' + q.length + ' item' + (q.length === 1 ? '' : 's') + ':\n' + listOf(q, 12)); playBtn(q.slice().sort(() => Math.random() - .5), '\u25b6 Shuffle them'); return true;
      }
      if (/^(?:list|show)(?: me)?(?: all)?(?: of)?(?: my)? videos$|^(?:what|which) videos do i have$/i.test(t)) {
        const tr = A.tracks(), q = real().filter(i => tr[i].kind === 'video'); if (!q.length) return say('You have no videos in the library.');
        say('You have ' + q.length + ' video' + (q.length === 1 ? '' : 's') + ':\n' + listOf(q, 12)); playBtn(q); return true;
      }
      if (/^(?:list|show)(?: me)?(?: all)?(?: of)?(?: my)? artists$|^(?:what|which|who) (?:artists|are my artists)(?: do i have)?$|^who are my artists$|^my artists$/i.test(t)) {
        const tr = A.tracks(), c = {}; real().forEach(i => { const a = (tr[i].artist || '').trim(); if (a) c[a] = (c[a] || 0) + 1; });
        const a = Object.entries(c).sort((x, y) => y[1] - x[1]); if (!a.length) return say('I do not see artist names in your tracks yet.');
        return say(a.length + ' artist' + (a.length === 1 ? '' : 's') + ': ' + a.slice(0, 15).map(x => x[0] + ' (' + x[1] + ')').join(', ') + (a.length > 15 ? ', and more' : '') + '.');
      }
      if ((m = t.match(/^(?:what|which)(?: songs| tracks| music)?(?: do i have| have i got| is there)? by (.+)$|^(?:list|show)(?: me)?(?: my)?(?: songs| tracks| music)? by (.+)$|^how many (?:songs|tracks)(?: do i have)? by (.+)$|^(?:songs|tracks|music) by (.+)$/i))) {
        const nm = (m[1] || m[2] || m[3] || m[4]).trim(), tr = A.tracks(), w = nrm(nm), q = real().filter(i => nrm(tr[i].artist || '').includes(w));
        if (!q.length) return say('I could not find any songs by \u201c' + nm + '\u201d.');
        say(q.length + ' song' + (q.length === 1 ? '' : 's') + ' by ' + nm + ':\n' + listOf(q, 10)); playBtn(q); return true;
      }
      if ((m = t.match(/^(?:do i have|have i got|is there|is) (.+?)(?: in (?:my |the )?(?:library|music|player|collection))?$/i)) && !/\b(?:playlist|volume|shuffle|repeat|playing|eq|tagged)\b/i.test(m[1]) && /^(?:do i have|have i got|is there)\b|in (?:my |the )?(?:library|music|player|collection)$/i.test(t)) {
        const q = byWords(m[1]); if (!q.length) return say('I do not see \u201c' + m[1] + '\u201d in your library.');
        say('Yes: ' + (q.length === 1 ? ttl(q[0]) : q.length + ' matches:\n' + listOf(q, 6))); playBtn(q); return true;
      }
      if ((m = t.match(/^(?:find|where is|where'?s|look for|locate)(?: me)? (?!more like|similar)(.+)$/i))) {
        const q = byWords(m[1]); if (!q.length) return say('I could not find \u201c' + m[1] + '\u201d in your library.');
        say(q.length + ' match' + (q.length === 1 ? '' : 'es') + ':\n' + listOf(q, 6)); playBtn(q); return true;
      }
      if (/^(?:what (?:did i|have i) (?:add|added)(?: recently| lately)?|(?:show|list)(?: me)?(?: my)? (?:recent(?:ly added)?|newest|latest)(?: songs| tracks)?|what'?s new in my library|(?:my )?(?:recently added|newest|latest)(?: songs| tracks)?|recent (?:songs|tracks|additions))$/i.test(t)) {
        const q = real().slice(-6).reverse(); if (!q.length) return say('Your library is empty.'); say('Most recently added:\n' + listOf(q, 6)); playBtn(q); return true;
      }
      if (/^(?:which|what) (?:songs|tracks) (?:are|have)(?:n'?t| not) (?:been )?tagged(?: yet)?$|^(?:list|show)(?: me)?(?: my)? untagged(?: songs| tracks)?$/i.test(t)) {
        const tgs = loadTags(), q = real().filter(i => !tgs[A.tracks()[i].dbId]); if (!q.length) return say('Every track is tagged.');
        say(q.length + ' untagged:\n' + listOf(q, 8)); return ask('Tag them all now?', () => tagWith('all'), true);
      }
      if ((m = t.match(/^(?:which|what) (?:songs|tracks|music) (?:are|sound|feel) (?:(?:the )?most |really |very )?(.+)$/i))) {
        const ws = wordsOf(m[1]); if (ws.length && ws.every(w => VIBEW.has(w))) { const r = findTracks(ws); if (!r.length) return say('No tagged tracks match that yet. Tagging more tracks helps.'); say(r.length + ' match:\n' + listOf(r, 8)); playBtn(r); return true; }
      }
      if (/^play (?:a |some )?(?:random )?videos?$|^play (?:me )?a (?:random )?video$/i.test(t)) {
        const tr = A.tracks(), q = shuffleIn(real().filter(i => tr[i].kind === 'video')); if (!q.length) return say('You have no videos in the library.'); A.play(q[0], q); return done('Playing ' + tr[q[0]].title + '.');
      }
      // play by position
      if ((m = t.match(/^play (?:the )?(first|second|third|last|random|\d+(?:st|nd|rd|th)?) (?:song|track)$/i))) {
        const tr = A.tracks(), q = tr.map((x, i) => i).filter(i => !tr[i].stem); if (!q.length) return say('Your library is empty.');
        const w = m[1].toLowerCase(), ord = { first: 1, second: 2, third: 3 }, n = w === 'last' ? q.length : w === 'random' ? 1 + Math.floor(Math.random() * q.length) : (ord[w] || parseInt(w, 10));
        if (!(n >= 1 && n <= q.length)) return say('You have ' + q.length + ' tracks, so I cannot play number ' + w + '.');
        A.play(q[n - 1], q); return done('Playing ' + tr[q[n - 1]].title + '.');
      }
      // settings
      let tg = null; if ((m = t.match(/^(?:turn|switch|set) (on|off) (.+)$/i))) tg = [m[1], m[2]]; else if ((m = t.match(/^(enable|disable) (.+)$/i))) tg = [m[1] === 'enable' ? 'on' : 'off', m[2]];
      if (tg) {
        const TOG = [[/background|away|idle/i, 'ppv-bg', 'Background tagging'], [/surprise/i, 'ppv-surp', 'Surprise playlists'], [/section/i, 'ppv-sect', 'Split-song sections'], [/(live|smart)/i, 'ppv-live', 'Live smart playlists']];
        const hit = TOG.find(x => x[0].test(tg[1])), el = hit && $id(hit[1]);
        if (!hit || !el) return say('I can switch these on or off: background tagging, surprise playlists, split-song sections, live smart playlists.');
        el.checked = tg[0].toLowerCase() === 'on'; el.dispatchEvent(new Event('change', { bubbles: true })); return done(hit[2] + ' ' + (el.checked ? 'on' : 'off') + '.');
      }
      // play something
      if ((m = t.match(/^(?:play|put on|queue up|start playing)\s+(.+)$/i))) {
        const ws = wordsOf(m[1]), tr = A.tracks();
        if (!ws.length || ws.every(w => ['random', 'anything', 'everything', 'all', 'shuffle', 'shuffled'].includes(w))) {
          const q = shuffleIn(tr.map((x, i) => i).filter(i => !tr[i].stem)); if (!q.length) return say('Your library is empty.'); A.play(q[0], q); return done('Playing a shuffled mix.');
        }
        const r = findTracks(ws); if (!r.length) {
          if (ws.length && ws.every(w => VIBEW.has(w)) && tagStats().left > 0) return (askYN('I pick music by mood from your tags, and some tracks are not tagged yet. Tag your library first? I will start the music when it is done.', () => tagAll(() => agent(t, true))), true);
          return say('I could not find anything for \u201c' + m[1] + '\u201d. Tagging more tracks helps me find moods and styles.');
        }
        const vibeOnly = ws.every(w => VIBEW.has(w)); if (vibeOnly) shuffleIn(r);
        const q = r.slice(0, 30); A.play(q[0], q);
        return done('Playing ' + (vibeOnly ? q.length + ' ' + ws.join(' ') + ' tracks' : tr[q[0]].title + (q.length > 1 ? ' (and ' + (q.length - 1) + ' more matches queued)' : '')) + '.');
      }
      return false;
    }
    // AGENT END

    // SMART START
    // ---------- Smarter interpreter in front of the agent. It only works out WHAT you meant; every action still runs through the
    // agent's own safe commands. No chat-model guessing: low confidence asks first, and anything it cannot do it says so. ----------
    const smartSt = { last: null, at: 0, snap: null, noRoute: '', pu: null };
    const sRec = (snap, cmd) => { smartSt.snap = snap; smartSt.last = cmd; smartSt.at = Date.now(); smartSt.pu = null; };
    const HELP_SMART = '\n\u2022 \u201cundo\u201d, \u201cagain\u201d, \u201ca bit more\u201d, \u201cmuch quieter\u201d, \u201cvolume up 15\u201d\n\u2022 several at once: \u201cplay something chill and turn it down a bit\u201d\n\u2022 goals: \u201cbedtime\u201d, \u201cgym time\u201d, \u201cstudy mode\u201d, \u201cparty mode\u201d\n\u2022 questions: \u201cis it paused\u201d, \u201cwhat\u2019s the volume\u201d, \u201cis shuffle on\u201d\n\u2022 \u201cmake a playlist for me\u201d, \u201csomething new\u201d, \u201cforgotten favorites\u201d, \u201cplaylist like <song>\u201d\n\u2022 \u201cmake a chill playlist with <song> without <artist>\u201d, \u201cadd <song> to <playlist>\u201d, \u201cremove the slow songs from <playlist>\u201d\n\u2022 typos are fine, and if I am unsure I will ask \u201cdid you mean\u2026\u201d';
    const sClean = r => String(r).trim().replace(/^(hey |hi |ok |okay )?(bloop[,:]?\s*)?/i, '').replace(/^((can|could|would|will) you( please)?|please|pls|i want you to|i'?d like you to|go ahead and)\s+/i, '').replace(/\s*(please|pls|thanks|thank you)[.!?]*$/i, '').replace(/[.!?]+$/, '').trim();
    const sSay = s => { add('bot', blTone(s)); return true; }, sDone = s => sSay('\u2713 ' + s);
    const S_Q = /^(?:what|how|who|which|where|when|why|is|are|am|do|does|did|list|show|tell|my|help)\b|\?$/i;
    const snapNow = () => { const A = window.__ppApi, v = $id('volume'), s = $id('seek'), sb = $id('shuffle-btn'); return { vol: v ? parseFloat(v.value) : null, pos: s ? parseFloat(s.value) : null, idx: A ? A.currentIndex() : -1, shuffle: !!(sb && sb.classList.contains('toggled')), playing: mediaOn() }; };
    function sExec(cmd) { const b = snapNow(), ok = agent(cmd); if (ok && !S_Q.test(cmd)) { sRec(b, cmd); } return ok; }
    const sKind = s => /\b(louder|quieter|softer|volume|loud|turn (?:it |the \w+ )?(?:up|down))\b/i.test(s) ? 'vol' : /\b(faster|slower|speed|slow)\b/i.test(s) ? 'speed' : /\b(rewind|forward|skip (?:\d|ahead|back|forward)|jump|seek|ff)\b/i.test(s) ? 'seek' : '';
    const sDir = s => /\b(quieter|softer|down|lower|decrease|reduce|slower|slow|rewind|back|backward)\b/i.test(s) ? -1 : /\b(louder|up|raise|increase|higher|faster|forward|ahead|skip|jump)\b/i.test(s) ? 1 : 0;
    const S_AMT = s => /\b(a lot|much|way|so much|a ton|loads|significantly|really|super)\b/i.test(s) ? 25 : /\b(a little|a bit|a touch|a tad|a notch|slightly|just|barely|little|bit)\b/i.test(s) ? 5 : 10;

    // volume: relative ("a bit louder", "down 15", "2 notches up") or absolute ("set it to 40%")
    function relVol(t) {
      const s = t.toLowerCase(); let m;
      if (/\b(speed|tempo|bass|treble|bright\w*|filter|eq|zoom|playlist|frames?)\b/.test(s)) return null;
      if ((m = s.match(/^(?:set|put|make|turn|bring|get)(?: the)?(?: volume| sound| music| it)? (?:up |down )?(?:to|at) (\d{1,3}) ?(?:%|percent|volume)$/))) return { abs: +m[1] };
      const up = /\b(louder|up|higher|raise|increase|boost|crank|bump)\b/.test(s), dn = /\b(quieter|softer|down|lower|decrease|reduce|drop|dim)\b/.test(s);
      if (up === dn || !/\b(louder|quieter|softer|volume|sound|turn (?:it|the music|the sound)|bring (?:it|the)|crank|bump|make it|dim|it (?:up|down))\b/.test(s)) return null;
      const dir = up ? 1 : -1;
      if ((m = s.match(/\bto (\d{1,3})\s*(?:%|percent)/))) return { abs: +m[1] };
      if ((m = s.match(/\b(\d{1,3})\s*(%|percent|points?|notch(?:es)?)?(?!\w)/))) return { d: dir * Math.min(100, +m[1] * (/^notch/.test(m[2] || '') ? 5 : 1)) };
      return { d: dir * S_AMT(s) };
    }
    function sApplyVol(r) {
      const e = $id('volume'); if (!e) return false; const was = Math.round(parseFloat(e.value)), v = Math.max(0, Math.min(100, Math.round(r.abs != null ? r.abs : was + r.d)));
      if (v === was) return sSay('Volume is already at ' + v + '%.');
      e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
      return sDone('Volume ' + v + '% (was ' + was + '%).');
    }

    // undo: puts back what the last action changed (volume, shuffle, which track, position, pause/play)
    function sUndo() {
      if (smartSt.pu) { const u = smartSt.pu; smartSt.pu = null; try { u.undo(); } catch (e) { console.error(e); return sSay('I could not undo that: ' + e.message); } return sDone(u.label); }
      const s = smartSt.snap, A = window.__ppApi; if (!s || !A) return sSay('There is nothing to undo yet. I can undo volume, shuffle, skips, seeking and pause/play.');
      const now = snapNow(), out = [];
      if (s.vol != null && now.vol != null && Math.round(s.vol) !== Math.round(now.vol)) { const e = $id('volume'); e.value = s.vol; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); out.push('volume back to ' + Math.round(s.vol) + '%'); }
      if (s.shuffle !== now.shuffle) { const b = $id('shuffle-btn'); if (b) { b.click(); out.push('shuffle ' + (s.shuffle ? 'on' : 'off')); } }
      const tr = A.tracks();
      if (s.idx >= 0 && s.idx !== now.idx && tr[s.idx]) { A.play(s.idx, tr.map((x, i) => i).filter(i => !tr[i].stem)); out.push('back to \u201c' + tr[s.idx].title + '\u201d'); }
      else if (s.idx === now.idx) {
        const sk = $id('seek'); if (sk && s.pos != null && now.pos != null && Math.abs(s.pos - now.pos) > 2) { sk.value = s.pos; sk.dispatchEvent(new Event('input', { bubbles: true })); sk.dispatchEvent(new Event('change', { bubbles: true })); out.push('back to ' + Math.floor(s.pos / 60) + ':' + String(Math.round(s.pos) % 60).padStart(2, '0')); }
        if (s.playing !== now.playing) { const pb = $id('play-btn'); if (pb) { pb.click(); out.push(s.playing ? 'playing again' : 'paused'); } }
      }
      smartSt.snap = null;
      return out.length ? sDone('Undid that: ' + out.join(', ') + '.') : sSay('I could not find anything I can undo. Undo covers volume, shuffle, skips, seeking and pause/play.');
    }

    // goals -> a short plan of ordinary commands
    const S_SCENES = [
      [/\b(bed ?time|time (?:for|to go to) (?:bed|sleep)|night ?mode|sleep mode|lights out|getting ready for bed)\b/i, ['play something sleep', 'sleep timer 30 minutes'], 'Bedtime mode:'],
      [/\b(?:work ?out|gym|training|exercise) (?:mode|time|session)\b|\b(?:hit|going to|heading to|off to) the gym\b|\btime to (?:work ?out|train|exercise|lift)\b/i, ['play something workout', 'shuffle on'], 'Workout mode:'],
      [/\b(?:study|focus|homework|deep work|work) (?:mode|time|session)\b|\btime to (?:study|focus|concentrate|get work done)\b|\bhelp me (?:focus|concentrate|study)\b/i, ['play something focus'], 'Focus mode:'],
      [/\b(?:party|dance) (?:mode|time)\b|\bstart the party\b|\blet'?s party\b|\bget the party started\b/i, ['play something party', 'shuffle on'], 'Party mode:'],
      [/\b(?:chill|relax(?:ation)?|unwind|wind[- ]down) (?:mode|time)\b|\bi (?:need|want) to (?:relax|unwind|chill|calm down)\b/i, ['play something chill'], 'Chill mode:']
    ];
    function sChain(steps, intro) {
      if (intro) sSay(intro);
      for (const c of steps) {
        const sb = $id('shuffle-btn'); if (c === 'shuffle on' && sb && sb.classList.contains('toggled')) continue;
        let ok = false; try { ok = agent(c, true); } catch (e) { console.error(e); return sSay('Oops, that step did not work: ' + e.message); }
        if (!ok) return sSay('I could not do \u201c' + c + '\u201d.');
      }
      return true;
    }

    // several commands in one sentence. Only splits when every piece starts like a command, and never inside a song title.
    const S_VERB = /^(?:play|pause|stop|resume|continue|next|skip|previous|prev|back|shuffle|repeat|loop|mute|unmute|volume|turn|set|make|add|remove|rename|tag|split|open|show|go|jump|rewind|restart|replay|speed|slow|faster|slower|louder|quieter|softer|lower|raise|sleep|eq|enable|disable|search|find|zoom|rotate|surprise|get|put|queue|clear|cancel|crank|bring|dim|bump|fullscreen|full|split|separate|tag|analy[sz]e)\b/i;
    // Any command can start a later part. A later part must begin with a command word, so "play Jazz and Rock" stays one request.
    const S_LEAD = /^(?:play|pause|stop|resume|continue|next|skip|previous|prev|back|shuffle|repeat|loop|mute|unmute|volume|turn|set|make|add|remove|rename|tag|split|separate|analy[sz]e|open|show|go|jump|rewind|restart|replay|speed|slow|faster|slower|louder|quieter|softer|lower|raise|increase|decrease|boost|reduce|sleep|eq|enable|disable|search|find|zoom|rotate|surprise|get|put|queue|clear|cancel|crank|bring|dim|bump|fullscreen|full|what|how|which|who|why|where|when|is|are|do|does|can|list|tell|flip|toss|roll|pick|choose|duplicate|copy|clone|empty|forget|teach|learn|like|more|less|start|begin|reset|use|select|give|remind|undo|again|help|lyrics|transcribe|mix|recommend|suggest|timer|stem|stems|bloop|you|i)\b/i;
    function sSplit(t) {
      if (t.length > 400 || !/\b(?:and|then|after that)\b|[,;&]/i.test(t)) return null;
      // keep library titles intact (e.g. "Tom and Jerry") by hiding them while splitting
      const keep = []; let s = t;
      sReal().map(i => window.__ppApi.tracks()[i].title).filter(x => x && x.length >= 3).sort((a, b) => b.length - a.length).forEach(title => {
        const re = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        s = s.replace(re, mt => { keep.push(mt); return '\u0001' + (keep.length - 1) + '\u0001'; });
      });
      const parts = s.split(/\s*(?:[,;]\s*(?:and\s+|then\s+)?|\s+&\s+|\s+and\s+then\s+|\s+then\s+|\s+and\s+|\s+after that\s+)/i)
        .map(x => x.trim()).filter(Boolean).map(x => x.replace(/\u0001(\d+)\u0001/g, (_, k) => keep[+k]));
      if (parts.length < 2 || parts.length > 8) return null;
      if (!parts.slice(1).every(p => S_LEAD.test(p))) return null;
      return parts;
    }

    // typo repair: only retried after the exact text failed, never touches song titles, and says what it read
    const S_VOCAB = 'play pause stop resume continue next skip previous shuffle repeat loop mute unmute volume louder quieter softer restart replay rewind forward speed faster slower fullscreen playlist playlists lyrics split sleep timer equalizer search open show immersive library music track song turn down switch enable disable'.split(' ');
    const S_TITLEV = /^(?:play|queue|find|search|add|put|make|create|rename|delete|remove|look|locate|where)$/i;
    function sLev(a, b) {
      const m = a.length, n = b.length, d = []; for (let i = 0; i <= m; i++) d[i] = [i]; for (let j = 1; j <= n; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) { d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); }
      return d[m][n];
    }
    function sFixTypos(t) {
      const w = t.split(/\s+/); let ch = false;
      for (let i = 0; i < Math.min(w.length, 4); i++) {
        const x = w[i].toLowerCase(); if (i > 0 && S_TITLEV.test(w[0])) break;
        if (x.length < 4 || /\d/.test(x) || S_VOCAB.includes(x)) continue;
        let best = null, bd = 9;
        for (const v of S_VOCAB) { if (Math.abs(v.length - x.length) > 2) continue; const d = sLev(x, v); if (d < bd && d <= (x.length >= 7 ? 2 : 1) && (x[0] === v[0] || x.length >= 7)) { bd = d; best = v; } }
        if (best) { w[i] = best; ch = true; }
      }
      return ch ? w.join(' ') : t;
    }

    // live state questions, answered from the real player (never from memory)
    function sStatus(t) {
      const A = window.__ppApi, s = t.toLowerCase(); let m;
      if (/\b(shuffl\w*)\b/.test(s) && /^(?:is|are|am)\b/.test(s)) { const b = $id('shuffle-btn'); return b ? sSay('Shuffle is ' + (b.classList.contains('toggled') ? 'on.' : 'off.')) : false; }
      if (/\b(repeat\w*|loop\w*)\b/.test(s) && /^(?:is|are|am)\b/.test(s)) { const b = $id('repeat-btn'); return b ? sSay(b.title === 'Repeat' ? 'Repeat is off.' : b.title + ' is on.') : false; }
      if (/^(?:what'?s|what is|how loud is)(?: the| my)?(?: current)? ?(?:volume|sound level|it)?(?: level| at)?$|^how loud(?: is it)?$/.test(s) && /volume|loud|level/.test(s)) { const v = $id('volume'); return v ? sSay('Volume is ' + Math.round(parseFloat(v.value)) + '%.') : false; }
      if (/^(?:is|are)\b.*\b(playing|paused)\b/.test(s) && s.split(/\s+/).length <= 6) return sSay(A.currentIndex() < 0 ? 'Nothing is loaded yet.' : mediaOn() ? 'Yes, it is playing.' : 'No, it is paused.');
      return false;
    }

    // did-you-mean router: a catalog of intents with example phrasings, scored with typo-tolerant word overlap
    const S_CAT = [
      ['pause', 1, ['pause the music', 'stop the music', 'stop playing', 'hold on', 'pause it']],
      ['play', 1, ['resume the music', 'continue playing', 'start the music', 'unpause', 'keep going', 'carry on', 'play it']],
      ['play something', 1, ['play something', 'put something on', 'play anything', 'play whatever', 'just play something']],
      ['next', 1, ['next song', 'skip song', 'skip track', 'play the next one', 'another song', 'next track', 'skip it', 'play something else']],
      ['previous', 1, ['previous song', 'go back a song', 'play the last song', 'last track', 'previous track', 'play the one before']],
      ['louder', 1, ['louder', 'turn it up', 'volume up', 'raise the volume', 'increase the volume', 'i cannot hear', 'too quiet']],
      ['quieter', 1, ['quieter', 'turn it down', 'volume down', 'lower the volume', 'decrease the volume', 'too loud']],
      ['mute', 1, ['mute', 'silence', 'mute the sound', 'no sound']],
      ['unmute', 1, ['unmute', 'sound back on', 'bring the sound back']],
      ['shuffle on', 1, ['shuffle on', 'turn on shuffle', 'shuffle my music', 'mix it up', 'play in random order', 'randomize']],
      ['shuffle off', 1, ['shuffle off', 'turn off shuffle', 'stop shuffling', 'play in order', 'no shuffle']],
      ['restart', 1, ['restart the song', 'play it again', 'start over', 'from the beginning', 'replay this song', 'back to the start']],
      ['repeat this song', 1, ['repeat this song', 'loop this song', 'keep playing this song', 'repeat one', 'play this on repeat']],
      ['fullscreen', 1, ['fullscreen', 'full screen', 'make it bigger', 'go full screen', 'enlarge the video']],
      ["what's this song", 1, ['what song is this', 'what is playing', 'who sings this', 'name of this song', 'whats this song', 'what am i hearing']],
      ['more like this', 1, ['more like this', 'songs like this', 'similar songs', 'play similar music']],
      ['faster', 1, ['faster', 'speed up', 'speed it up', 'play faster']],
      ['slower', 1, ['slower', 'slow down', 'slow it down', 'play slower']],
      ['time left', 1, ['how much time is left', 'time remaining', 'how long is left', 'how long until it ends', 'how much longer']],
      ['my playlists', 1, ['show my playlists', 'list my playlists', 'what playlists do i have', 'my playlists']],
      ['library stats', 1, ['library stats', 'how many songs do i have', 'how big is my library', 'tell me about my library']],
      ['help', 1, ['help', 'what can you do', 'what can i say', 'show me commands']],
      ['get the lyrics', 0, ['get the lyrics', 'write the lyrics', 'show me the lyrics', 'transcribe this song', 'lyrics for this song']],
      ['split this song', 0, ['split this song', 'separate the vocals', 'remove the vocals', 'make a karaoke version', 'get the stems', 'isolate the vocals']],
      ['tag this song', 0, ['tag this song', 'analyze this song', 'find the bpm', 'what is the key', 'detect the tempo']]
    ];
    const S_STOP = new Set(['the', 'a', 'an', 'to', 'of', 'this', 'that', 'it', 'please', 'my', 'me', 'i', 'you', 'can', 'could', 'would', 'now', 'just', 'and', 'for']);
    const sToks = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w && !S_STOP.has(w)).map(w => w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w);
    function sScore(Q, P) {
      if (!Q.length || !P.length) return 0; const used = new Set(); let hit = 0;
      P.forEach(p => { const j = Q.findIndex((q, k) => !used.has(k) && (q === p || (p.length >= 5 && sLev(q, p) <= 1) || (p.length >= 8 && sLev(q, p) <= 2))); if (j >= 0) { used.add(j); hit++; } });
      const pr = hit / Q.length, rc = hit / P.length; return pr + rc ? 2 * pr * rc / (pr + rc) : 0;
    }
    function sRank(t) {
      const Q = sToks(t); if (!Q.length || Q.length > 7) return [];
      return S_CAT.map(([cmd, safe, ph]) => ({ cmd, safe, s: Math.max(...ph.map(p => sScore(Q, sToks(p)))) })).filter(x => x.s >= .55).sort((a, b) => b.s - a.s);
    }
    // Runs after the exact rules, tag talk and small talk, right before the chat model. Returns true when it answered.
    function routeIntent(raw) {
      const t = sClean(raw); if (!t || t.length > 70 || smartSt.noRoute === raw || /\b(?:don'?t|dont|do not|never|without)\b/i.test(t) || !window.__ppApi) return false;
      const r = sRank(t); if (!r.length) return false;
      const top = r[0], nxt = r[1];
      if (top.safe && top.s >= .85 && (!nxt || top.s - nxt.s >= .2)) { const n = add('bot', '(Reading that as \u201c' + top.cmd + '\u201d.)'); if (sExec(top.cmd)) return true; n.remove(); return false; }
      add('bot', 'Did you mean ' + r.slice(0, 2).map(x => '\u201c' + x.cmd + '\u201d').join(' or ') + '?');
      actions(r.slice(0, 2).map(x => ['\u25b6 ' + x.cmd, (b, d) => { d.remove(); sExec(x.cmd); }]).concat([['Neither', (b, d) => { d.remove(); smartSt.noRoute = raw; send(raw, true); }]]));
      return true;
    }

    function smart(raw, noAl, noSplit) {
      const A = window.__ppApi, t = sClean(blFrame(raw)); if (!A || !t) return false;
      if (!noAl && !blChain) blQueue = [];
      if (!noAl) { const al = blAlias(t); if (al) { add('bot', '(Reading that as \u201c' + al + '\u201d.)'); if (!smart(al, true)) add('bot', 'I learned \u201c' + t + '\u201d as \u201c' + al + '\u201d, but I cannot do that. Say \u201cforget ' + t + '\u201d to remove it.'); return true; } }
      if (/^(?:undo|undo (?:that|it|this)|take (?:that|it) back|revert(?: that)?|put it back|go back to how it was)$/i.test(t)) return sUndo();
      if (/^(?:again|do (?:that|it) again|one more time|once more|same again|repeat that|do the same)$/i.test(t)) return smartSt.last ? smart(smartSt.last) : sSay('I have nothing to repeat yet.');
      const before = snapNow();
      const fin = (ok, cmd) => { if (ok && cmd && !S_Q.test(cmd)) { sRec(before, cmd); } return ok; };
      // "a bit more", "less", "too much": continue or reverse the last volume / speed / seek change
      const fu = t.match(/^(?:(?:and|even|just|still|some|a little|a bit|a lot|much|slightly)\s+)*(more|less|further|too much|too little|not enough)$/i);
      if (fu && smartSt.last && Date.now() - smartSt.at < 180000 && sKind(smartSt.last)) {
        const k = sKind(smartSt.last), dir = (sDir(smartSt.last) || 1) * (/^(less|too much)$/i.test(fu[1]) ? -1 : 1), amt = S_AMT(t);
        if (k === 'vol') return fin(sApplyVol({ d: dir * amt }), dir > 0 ? 'louder' : 'quieter');
        if (k === 'speed') return fin(agent(dir > 0 ? 'faster' : 'slower', true), dir > 0 ? 'faster' : 'slower');
        return fin(agent((dir > 0 ? 'skip forward ' : 'rewind ') + (amt === 25 ? 30 : amt === 5 ? 5 : 10) + ' seconds', true), dir > 0 ? 'skip forward' : 'rewind');
      }
      try { if (sPlaylistCmd(t)) return true; } catch (e) { console.error(e); return sSay('Oops, that playlist request did not work: ' + e.message); }
      if (t.length < 70) { const sc = S_SCENES.find(x => x[0].test(t)); if (sc) return fin(sChain(sc[1], sc[2]), t); }
      if (!noSplit) { const parts = sSplit(t); if (parts) { blRunChain(parts); if (!S_Q.test(t)) { sRec(before, t); } return true; } }
      if (agent(raw)) { if (!S_Q.test(t)) { sRec(before, t); } return true; }
      const rv = relVol(t); if (rv && $id('volume')) return fin(sApplyVol(rv), t);
      { const kw = kwRoute(t); if (kw) { if (kw.cmd === 'undo') return sUndo(); if (kw.cmd) return sExec(kw.cmd); if (blChain) return false; return kwPick(kw.ask, 'Did you mean ' + kw.ask.map(c => '\u201c' + c + '\u201d').join(' or ') + '?'); } }
      if (sStatus(t)) return true;
      if (!blChain) { const tc = typoCands(t); if (tc.length) return kwPick(tc, 'Did you mean ' + tc.map(c => '\u201c' + c + '\u201d').join(' or ') + '?'); }
      return false;
    }
    // SMART END

    // PLAYLISTS START
    // ---------- Smarter playlists: For you / Discover / Forgotten favourites, "like <song>", with / without, add / remove by name ----------
    // Picks use your tags, the stem-tagger's sound embeddings and your listening history (Portfolio). Selection is diversity-aware
    // (maximal marginal relevance + a per-artist cap), then ordered so neighbours flow. Nothing here uses the chat model.
    const sNrm = x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const sReal = () => { const tr = window.__ppApi.tracks(); return tr.map((x, i) => i).filter(i => !tr[i].stem); };
    let sPFmemo = { at: 0, v: {} };
    const sPF = () => { if (Date.now() - sPFmemo.at < 2000) return sPFmemo.v; try { if (window.PPPortfolioApi && window.PPPortfolioApi.flush) window.PPPortfolioApi.flush(); } catch (e) {} let v = {}; try { v = (JSON.parse(localStorage.getItem('pppSaveV1')) || {}).trackPlays || {}; } catch (e) {} sPFmemo = { at: Date.now(), v }; return v; };
    function sTaste() {   // what you actually listen to: top tracks weighted by plays, time listened and recency
      const A = window.__ppApi, tr = A.tracks(), pf = sPF(), now = Date.now(), idx = new Map(tr.map((t, i) => [String(t.dbId), i])), count = new Map(), last = new Map(), an = [];
      Object.entries(pf).forEach(([id, p]) => {
        const i = idx.get(String(id)); if (i == null || tr[i].stem || !p || !(p.count > 0)) return;
        const lp = typeof p.lastPlayed === 'number' ? p.lastPlayed : (Date.parse(p.lastPlayed) || 0), days = lp ? (now - lp) / 864e5 : 0;
        count.set(i, p.count); last.set(i, lp); an.push([i, (Math.log(1 + p.count) + Math.min(3, (p.totalMs || 0) / 9e5)) * Math.exp(-days / 60)]);
      });
      an.sort((a, b) => b[1] - a[1]); return { anchors: an.slice(0, 15), count, last };
    }
    const sJac = (x, y) => { if (!x.size || !y.size) return 0; let n = 0; x.forEach(v => { if (y.has(v)) n++; }); return n / (x.size + y.size - n); };
    function sFeat(c) {
      if (!c) return null;
      return { v: new Set(vibes(c).filter(v => !/^(slow|mid-tempo|fast|very-fast|vocals)$/.test(v))), g: new Set((c.gp || []).map(x => x[0]).concat((c.gn || []).slice(0, 2).map(x => x[0]))), i: new Set((c.in || []).slice(0, 5).map(x => x[0])), bpm: c.bpm || 0, ck: c.ck || '' };
    }
    function sFSim(a, b) {   // tag similarity 0..1: mood, genre, instruments, tempo (half/double aware), key
      if (!a || !b) return .1;
      const bp = a.bpm && b.bpm ? Math.exp(-Math.min(Math.abs(a.bpm - b.bpm), Math.abs(a.bpm * 2 - b.bpm), Math.abs(a.bpm - b.bpm * 2)) / 25) : .3;
      return .35 * sJac(a.v, b.v) + .3 * sJac(a.g, b.g) + .15 * sJac(a.i, b.i) + .12 * bp + .08 * (camOk(a.ck, b.ck) ? 1 : 0);
    }
    async function sEmbScores(seedIdx, wts) {   // cosine to the weighted average of the seeds' sound embeddings; null when the seeds were never analysed
      const A = window.__ppApi, tr = A.tracks(), embs = await Promise.all(tr.map(t => loadEmb(t.dbId).catch(() => null)));
      const seeds = seedIdx.map((i, k) => [i, wts ? wts[k] : 1]).filter(x => embs[x[0]]); if (!seeds.length) return null;
      const have = tr.map((_, i) => i).filter(i => embs[i]), D = embs[have[0]].length, mean = new Float32Array(D);
      have.forEach(i => { for (let c = 0; c < D; c++) mean[c] += embs[i][c] / have.length; });
      const norm = i => { const v = new Float32Array(D); let n = 0; for (let c = 0; c < D; c++) { v[c] = embs[i][c] - mean[c]; n += v[c] * v[c]; } n = Math.sqrt(n) || 1; for (let c = 0; c < D; c++) v[c] /= n; return v; };
      const q = new Float32Array(D); seeds.forEach(([i, w]) => { const v = norm(i); for (let c = 0; c < D; c++) q[c] += v[c] * w; });
      let qn = 0; for (let c = 0; c < D; c++) qn += q[c] * q[c]; qn = Math.sqrt(qn) || 1;
      const out = new Map(); have.forEach(i => { const v = norm(i); let s = 0; for (let c = 0; c < D; c++) s += q[c] * v[c]; out.set(i, s / qn); }); return out;
    }
    // Maximal marginal relevance: each pick balances "fits the brief" against "too close to what is already chosen", with a per-artist cap.
    function sMMR(cands, rel, F, k, lam, cap, tr, already) {
      const art = i => sNrm(tr[i].artist || ''), picked = [], per = {}, rest = cands.slice(), ms = new Map(), al = already || [];
      al.forEach(i => { const a = art(i); if (a) per[a] = (per[a] || 0) + 1; });
      rest.forEach(i => { let m = 0; al.forEach(p => { m = Math.max(m, sFSim(F.get(i), F.get(p))); }); ms.set(i, m); });
      let c = cap;
      while (picked.length < k && rest.length) {
        let bi = -1, bs = -1e9;
        for (let n = 0; n < rest.length; n++) { const i = rest[n], a = art(i); if (a && (per[a] || 0) >= c) continue; const s = lam * rel(i) - (1 - lam) * ms.get(i); if (s > bs) { bs = s; bi = n; } }
        if (bi < 0) { if (c > cap + 3) break; c++; continue; }
        const i = rest.splice(bi, 1)[0]; picked.push(i); const a = art(i); if (a) per[a] = (per[a] || 0) + 1;
        rest.forEach(j => { const s = sFSim(F.get(i), F.get(j)); if (s > ms.get(j)) ms.set(j, s); });
      }
      return picked;
    }
    function sFlow(list, F, tr, first) {   // order so neighbours fit (tempo / mood / key) and the same artist never plays twice in a row
      const rest = list.slice(), out = []; let cur = first != null && rest.includes(first) ? first : rest[0]; if (cur == null) return out;
      rest.splice(rest.indexOf(cur), 1); out.push(cur);
      while (rest.length) {
        const a = sNrm(tr[cur].artist || ''); let bi = 0, bs = -9;
        rest.forEach((j, n) => { const s = sFSim(F.get(cur), F.get(j)) - (a && sNrm(tr[j].artist || '') === a ? .5 : 0) + Math.random() * .05; if (s > bs) { bs = s; bi = n; } });
        cur = rest.splice(bi, 1)[0]; out.push(cur);
      }
      return out;
    }

    // ---- turning words into tracks: "Hello", "Adele", "slow songs", "piano", "this song" ----
    const S_CUR = /^(?:this|that|it|current|the current|(?:this|that|the current|current) (?:song|track|one)|what'?s playing|what is playing|the one (?:playing|that'?s playing)(?: now)?)$/i;
    const S_FILL = new Set(['make', 'create', 'build', 'generate', 'give', 'get', 'put', 'together', 'start', 'compose', 'curate', 'new', 'another', 'some', 'me', 'my', 'the', 'a', 'an', 'of', 'that', 'is', 'are', 'for', 'you', 'playlist', 'playlists', 'mix', 'mixtape', 'song', 'songs', 'track', 'tracks', 'music', 'please', 'just', 'only', 'all', 'any', 'more', 'also', 'stuff', 'thing', 'things', 'something', 'one', 'ones']);
    function sResolve(m0) {   // -> {tracks, artist?} | {vibes} | {words, tracks} | {none} | null
      const A = window.__ppApi, tr = A.tracks(), real = sReal();
      if (S_CUR.test(String(m0).trim())) { const c = A.currentIndex(); return c >= 0 ? { tracks: [c] } : { none: true }; }
      const cleaned = String(m0).trim().replace(/^(?:the |a |an |some |any )+/i, '').replace(/^(?:songs?|tracks?|music|artists?|bands?|stuff)\s+(?:by |from )?/i, ''), q = sNrm(cleaned); if (!q) return null;
      const pf = sPF(), pc = i => (pf[tr[i].dbId] || pf[String(tr[i].dbId)] || {}).count || 0, best = a => a.slice().sort((x, y) => pc(y) - pc(x))[0];
      const ti = i => sNrm(tr[i].title), an = i => sNrm(tr[i].artist || '');
      const ex = real.filter(i => ti(i) === q); if (ex.length) return { tracks: [best(ex)] };
      const toks = cleaned.toLowerCase().split(/[^\p{L}\p{N}'-]+/u).filter(w => w && !S_FILL.has(w));
      if (toks.length && toks.every(w => VIBEW.has(w) || VIBE_SYN[w])) return { vibes: vibeWordsOf(cleaned) };
      const by = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
      if (by) { const a = sNrm(by[2]), tt = sNrm(by[1]), r = real.filter(i => ti(i).includes(tt) && an(i).includes(a)); if (r.length) return { tracks: [best(r)] }; }
      const ar = real.filter(i => an(i) === q || an(i) === 'the' + q); if (ar.length) return { artist: q, tracks: ar.sort((x, y) => pc(y) - pc(x)) };
      const ws = cleaned.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(w => w.length > 1 || /\d/.test(w));
      if (ws.length) {
        const hay = i => (tr[i].title + ' ' + (tr[i].artist || '')).toLowerCase(), c = real.filter(i => ws.every(w => hay(i).includes(w)));
        if (c.length) {
          const tc = c.filter(i => ws.every(w => tr[i].title.toLowerCase().includes(w)));
          if (tc.length) { tc.sort((x, y) => (ti(y).startsWith(q) - ti(x).startsWith(q)) || (ti(x).length - ti(y).length) || (pc(y) - pc(x))); return { tracks: [tc[0]] }; }
          return { artist: q, tracks: c.sort((x, y) => pc(y) - pc(x)) };
        }
        const tgs = loadTags(), w2 = ws.filter(x => x.length > 2);
        if (w2.length) { const m = real.filter(i => { const c = tgs[tr[i].dbId]; return c && w2.every(x => (' ' + tagWords(c) + ' ').includes(' ' + x + ' ')); }); if (m.length) return { words: w2, tracks: m }; }
      }
      return null;
    }
    function sMentions(str) {   // "A, B and C" -> ["A","B","C"], unless the whole thing is one title / artist
      const s = String(str).replace(/["\u201c\u201d]/g, '').trim(); if (!s) return [];
      if (sResolve(s)) return [s];
      return s.split(/\s*(?:,|;|&|\band\b|\bor\b|\bplus\b)\s*/i).map(x => x.trim()).filter(Boolean);
    }
    const sLabel = (r, m) => { const tr = window.__ppApi.tracks(); return r.vibes ? r.vibes.join(' + ') + ' songs' : r.words ? r.words.join(' ') + ' songs' : r.artist ? tr[r.tracks[0]].artist : '\u201c' + tr[r.tracks[0]].title + '\u201d'; };
    function sApply(sp, m, mode) {
      const r = sResolve(m), tr = window.__ppApi.tracks(); if (!r) { sp.miss.push(m); return; } if (r.none) { sp.miss.push(m + ' (nothing is playing)'); return; }
      const lab = sLabel(r, m);
      if (mode === 'seed') { if (r.vibes || r.words) { sp.miss.push(m + ' (I need a song or artist to match)'); return; } sp.seeds.push(...(r.artist ? r.tracks.slice(0, 5) : r.tracks)); sp.said.seed.push(lab); }
      else if (mode === 'inc') { if (r.vibes) sp.themeWords.push(...r.vibes); else if (r.words) sp.themeWords.push(...r.words); else sp.include.push(...(r.artist ? r.tracks.slice(0, 6) : r.tracks)); sp.said.inc.push(lab); }
      else { if (r.vibes) sp.exVibes.push(...r.vibes); else if (r.words) sp.exWords.push(...r.words); else if (r.artist) sp.exArtists.push(sNrm(tr[r.tracks[0]].artist)); else sp.exclude.push(...r.tracks); sp.said.exc.push(lab); }
    }
    // ---- reading a playlist request ----
    const S_STOPM = '(?=\\s+(?:with|without|including|include|featuring|excluding|exclude|except|but|and (?:no|without|exclude|not)|no|not|similar|based on|inspired|called|named)\\b|$)';
    const R_SIM = new RegExp('\\b(?:similar to|similar|(?:songs|tracks|music|stuff|playlist|mix|something|vibes?) like|based on|inspired by|in the style of|(?:sounds?|sounding) like|resembling)\\s+(.+?)' + S_STOPM, 'i');
    const R_EXC = /\b(?:without|excluding|exclude|except(?: for)?|but (?:no|not|without)|and (?:no|without|exclude|not)|not including|leave out|leaving out|minus|skip|no)\s+(.+?)(?=\s+(?:with|including|include|featuring|similar|based on|inspired|called|named)\b|$)/i;
    const R_INC = new RegExp('\\b(?:with|including|include|featuring|containing|that (?:has|have|includes?|contains?)|plus|and add|also add)\\s+(.+?)' + S_STOPM, 'i');
    function sParsePl(t0) {
      const t = t0.replace(/^(?:i (?:want|need|would like|'d like|wanna)|can i (?:get|have)|could you|let'?s|how about)\s+/i, '').trim(), s = t.toLowerCase();
      const hasPl = /\b(?:playlists?|mix|mixtape)\b/.test(s);
      const mk = /^(?:make|create|build|generate|give|get|put together|start|compose|curate|set up|queue up|refresh|redo|regenerate|remake|new|another)\b/.test(s) || /^(?:a |an |my |the )?(?:playlist|mix|mixtape)\b/.test(s);
      const rec = /^(?:recommend|suggest)\w*\b/.test(s) || /^(?:give|get|make|show)(?: me)?(?: some| a few)? (?:recommendations?|suggestions?)\b/.test(s);
      if (!((hasPl && mk) || rec)) return null;
      const sp = { kind: 'custom', seeds: [], include: [], exclude: [], exArtists: [], exVibes: [], exWords: [], themeWords: [], themeSet: null, theme: '', size: 0, name: '', miss: [], said: { seed: [], inc: [], exc: [] } };
      let w = t, m;
      if ((m = w.match(/\b(?:called|named|titled)\s+["\u201c]?(.+?)["\u201d]?$/i))) { sp.name = m[1].trim().slice(0, 50); w = w.replace(m[0], ' '); }
      if ((m = s.match(/\b(\d{1,3})[- ]?(?:song|track)s?\b/))) sp.size = +m[1]; else if (/\b(?:short|small|quick)\b/.test(s)) sp.size = 10; else if (/\b(?:long|big|huge|large)\b/.test(s)) sp.size = 40;
      const grab = (re, mode) => { const x = w.match(re); if (!x) return false; w = w.replace(x[0], ' '); sMentions(x[1]).forEach(mm => sApply(sp, mm, mode)); return true; };
      grab(R_SIM, 'seed'); const hadEx = grab(R_EXC, 'exc'), hadIn = grab(R_INC, 'inc');
      let byArtist = null; if ((m = w.match(/\bby\s+(.+?)(?:\s+songs?)?$/i))) { const r = sResolve(m[1]); if (r && r.artist) { byArtist = r.tracks; w = w.replace(m[0], ' '); } }
      if (/\b(?:rediscover|forgotten (?:favou?rites|songs|tracks)|old favou?rites|songs i forgot|(?:haven'?t|have not) (?:played|heard|listened to)[\w\s]* in (?:a )?(?:while|ages)|drifted away)\b/.test(s)) sp.kind = 'redisc';
      else if (/\b(?:discover|something new|new (?:songs|music|tracks|stuff)|(?:haven'?t|have not|never) (?:played|heard|listened to)|unplayed|unheard|new to me|hidden gems?|deep cuts?)\b/.test(s)) sp.kind = 'discover';
      else if (/\b(?:for you|for me|recommend\w*|suggest\w*|daily mix|made for me|i might like|i(?:'d| would) like(?! to)|based on (?:what i|my) (?:listen|play|like|taste)|my taste)\b/.test(s)) sp.kind = 'foryou';
      if (sp.seeds.length) sp.kind = 'similar';
      const th = w.replace(/\b(?:make|create|build|generate|give|get|put together|start|compose|curate|set up|queue up|refresh|redo|regenerate|remake|recommend\w*|suggest\w*|for me|for you|please|playlists?|mixtapes?|mix|made|daily|discover\w*|rediscover\w*|something new|forgotten favou?rites|(?:\d{1,3})[- ]?(?:songs?|tracks?)|short|small|quick|long|big|huge|large)\b/gi, ' ').replace(/\b(?:me|my|a|an|the|some|another|new|of|that|is|are|songs?|tracks?|music|and|in|i|i'?d|would|like|might)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      const ws = wordsOf(th + ' ' + sp.themeWords.join(' ')).filter(x => x && !S_FILL.has(x));
      sp.theme = th;
      const sets = []; if (ws.length) sets.push(findTracks(ws)); if (byArtist) sets.push(byArtist);
      if (sets.length) sp.themeSet = [...new Set([].concat(...sets))];
      const custom = hadIn || hadEx || byArtist || (sp.size && ws.length);
      if (sp.kind === 'custom' && !custom) return null;
      return sp;
    }
    // ---- building ----
    async function sBuild(sp) {
      const A = window.__ppApi, tr = A.tracks(), tg = loadTags(), real = sReal();
      if (!real.length) throw new Error('Your library is empty.');
      const F = new Map(real.map(i => [i, sFeat(tg[tr[i].dbId])])), taste = sTaste(), art = i => sNrm(tr[i].artist || '');
      const size = Math.max(5, Math.min(100, sp.size || 20)), exSet = new Set(sp.exclude), inc = [...new Set(sp.include)].filter(i => !exSet.has(i));
      let pool = real.filter(i => !exSet.has(i) && !sp.exArtists.includes(art(i)));
      if (sp.exVibes.length || sp.exWords.length) pool = pool.filter(i => { const c = tg[tr[i].dbId]; if (!c) return true; const v = vibes(c), tw = ' ' + tagWords(c) + ' '; return !sp.exVibes.some(x => v.includes(x)) && !sp.exWords.some(x => tw.includes(' ' + x + ' ')); });
      if (sp.themeSet) { const st = new Set(sp.themeSet); pool = pool.filter(i => st.has(i)); }
      const forced = [...new Set((sp.kind === 'similar' ? sp.seeds : []).concat(inc))].filter(i => !exSet.has(i)).slice(0, size), fs = new Set(forced), cand = pool.filter(i => !fs.has(i));
      if (!cand.length && !forced.length) throw new Error('Nothing in your library fits that. Tagging more tracks helps me match moods and styles.');
      const seeds = sp.kind === 'similar' ? sp.seeds : sp.kind === 'custom' ? inc : taste.anchors.map(a => a[0]), wts = sp.kind === 'similar' || sp.kind === 'custom' ? null : taste.anchors.map(a => a[1]);
      let emb = null; if (seeds.length && sp.kind !== 'redisc') { try { emb = await sEmbScores(seeds, wts); } catch (e) { console.warn(e); } }
      if (sp.kind === 'similar' && !emb && sp.seeds.every(i => !F.get(i))) throw new Error('Tag \u201c' + (sp.seeds.length ? tr[sp.seeds[0]].title : 'that song') + '\u201d first, so I can tell what it sounds like.');
      let lo = 9, hi = -9; if (emb) cand.forEach(i => { const e = emb.get(i); if (e != null) { if (e < lo) lo = e; if (e > hi) hi = e; } }); const span = (hi - lo) || 1, R = new Map(), nPlay = i => taste.count.get(i) || 0;
      cand.forEach(i => {
        let r;
        if (sp.kind === 'redisc') r = Math.log(1 + nPlay(i)) / 4;
        else if (!seeds.length) r = .5;
        else { let a = 0, b = 0; seeds.forEach((sd, k) => { const ww = wts ? wts[k] : 1; a += ww * sFSim(F.get(i), F.get(sd)); b += ww; }); const e = emb && emb.get(i); r = e != null ? .65 * ((e - lo) / span) + .35 * (a / b) : a / b; }
        R.set(i, r + (Math.random() - .5) * .06);
      });
      let list = cand;
      if (sp.kind === 'discover') { list = cand.filter(i => !nPlay(i)); if (list.length < 5) throw new Error('You have already played almost everything, so there is not much new to find.'); }
      if (sp.kind === 'redisc') { const old = d => cand.filter(i => nPlay(i) >= 2 && (!taste.last.get(i) || Date.now() - taste.last.get(i) > d * 864e5)); list = old(30); if (list.length < 8) list = old(14); if (list.length < 5) throw new Error('I do not see enough songs you have drifted away from yet.'); }
      const need = Math.max(0, size - forced.length), lam = { foryou: .62, discover: .65, redisc: .7, similar: .8, custom: .6 }[sp.kind];
      const cap = sp.noCap ? 1e9 : sp.kind === 'foryou' || sp.kind === 'discover' ? Math.max(1, Math.round(size / 10)) : Math.max(2, Math.ceil(size / (sp.kind === 'similar' ? 5 : 6)));
      const pick = (arr, k, al) => sMMR(arr, i => R.get(i) || 0, F, k, lam, cap, tr, al), usedHistory = taste.anchors.length > 0;
      let picked;
      if (sp.kind === 'foryou' && usedHistory) {   // ~70% songs you know that fit your taste, ~30% you have not played yet
        const un = list.filter(i => !nPlay(i)), pn = pick(un, Math.min(un.length, Math.round(need * .3)), forced), po = pick(list.filter(i => nPlay(i)), need - pn.length, forced.concat(pn));
        picked = pn.concat(po); if (picked.length < need) { const ps = new Set(picked); picked = picked.concat(pick(list.filter(i => !ps.has(i)), need - picked.length, forced.concat(picked))); }
      } else picked = pick(list, need, forced);
      const all = forced.concat(picked); if (!all.length) throw new Error('Nothing in your library fits that.');
      const first = sp.kind === 'similar' ? sp.seeds[0] : all.slice().sort((a, b) => (R.get(b) || 0) - (R.get(a) || 0))[0];
      const idx = sFlow(all, F, tr, first);
      return { idx, ids: idx.map(i => tr[i].dbId), newN: idx.filter(i => !nPlay(i)).length, artists: new Set(idx.map(art)).size, usedHistory, emb: !!emb, forced: forced.length };
    }
    async function sMakePl(sp, note, again) {
      const A = window.__ppApi, r = await sBuild(sp), tr = A.tracks(), day = new Date().toLocaleDateString(undefined, { weekday: 'short' }), th = sp.theme ? sp.theme.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 28) : '';
      const name = (sp.name || ({ foryou: '\u2728 For you \u00b7 ' + (th || day), discover: '\ud83e\udded Discover' + (th ? ' \u00b7 ' + th : ''), redisc: '\ud83d\udd70\ufe0f Forgotten favorites', similar: '\ud83d\udd17 Like ' + (sp.seeds.length ? tr[sp.seeds[0]].title.slice(0, 26) : 'songs') + (sp.seeds.length > 1 && !(sp.said.seed[0] || '').startsWith('\u201c') ? '' : sp.seeds.length > 1 ? ' +' + (sp.seeds.length - 1) : ''), custom: '\ud83e\udd16 ' + (th || 'Custom mix') }[sp.kind])).slice(0, 60);
      const pl = A.createPlaylist(name); r.ids.forEach(id => A.addToPlaylist(id, pl.id)); pl.order = r.ids.slice(); pl.bloop = sp.kind; pl.bname = pl.name; pl.bat = Date.now();
      if (sp.kind === 'foryou' || sp.kind === 'discover' || sp.kind === 'redisc') A.playlists().filter(p => p.bloop === sp.kind && p.id !== pl.id && p.name === p.bname).sort((x, y) => (y.bat || 0) - (x.bat || 0)).slice(2).forEach(p => A.deletePlaylistQuiet(p.id));
      A.commitPlaylists();
      const n = r.idx.length, plural = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');
      let msg = '\u2713 Made \u201c' + pl.name + '\u201d with ' + plural(n, 'track') + '. ';
      if (sp.kind === 'foryou') msg += r.usedHistory ? (n - r.newN) + ' you already like and ' + r.newN + ' you have not played yet, across ' + plural(r.artists, 'artist') + '.' : 'I have no listening history yet, so this is a varied mix from your tags. It gets personal as you listen.';
      else if (sp.kind === 'discover') msg += 'All unplayed, picked to sit close to your taste' + (r.usedHistory ? '' : ' (no history yet, so mostly variety)') + '.';
      else if (sp.kind === 'redisc') msg += 'Songs you used to play and have not lately.';
      else if (sp.kind === 'similar') msg += 'Starts with ' + sp.said.seed.join(', ') + ', then the closest ' + (r.emb ? 'by sound' : 'by tags (analysing the song with the tagger gives better matches)') + ', spread over ' + plural(r.artists, 'artist') + '.';
      else msg += r.forced ? plural(r.forced, 'song') + ' you asked for, and the rest picked to fit them.' : '';
      if (sp.said.exc.length) msg += ' Left out: ' + sp.said.exc.join(', ') + '.';
      if (sp.said.inc.length && !r.forced) msg += ' Included: ' + sp.said.inc.join(', ') + '.';
      if (sp.miss.length) msg += ' I could not find ' + sp.miss.map(x => '\u201c' + x + '\u201d').join(', ') + ', so I skipped ' + (sp.miss.length > 1 ? 'those' : 'it') + '.';
      note.textContent = msg.trim();
      smartSt.pu = { at: Date.now(), label: 'Deleted \u201c' + pl.name + '\u201d.', undo: () => { A.deletePlaylistQuiet(pl.id); A.commitPlaylists(); } };
      actions([['\u25b6 Play it', () => { A.play(r.idx[0], r.idx); }], ['\ud83d\udd04 Another take', (b, d) => { d.remove(); smartSt.pu = null; A.deletePlaylistQuiet(pl.id); A.commitPlaylists(); sRunPl(sp); }]]);
    }
    function sRunPl(sp) {
      unloadModel(); const note = add('bot', '\u2026 working out your picks');
      sMakePl(sp, note).catch(e => { console.error(e); note.textContent = 'I could not build that: ' + e.message; });
    }
    // ---- add / remove by name: "add Hello to my gym playlist", "take the slow songs out of chill", "remove Drake from road trip" ----
    function sParseEdit(t) {
      const CURW = /^(?:this|it|that|the current|current)(?: song| track| one)?$/i; let m;
      if ((m = t.match(/^(?:add|put|throw|drop|stick)\s+(.+?)\s+(?:to|into|in|onto)\s+(?:my |the )?(.+?)(?:\s+playlist)?$/i)) && !CURW.test(m[1].trim())) return { op: 'add', what: m[1], pl: m[2] };
      if ((m = t.match(/^(?:remove|take|drop|delete|get rid of|kick|pull|cut|clear)\s+(.+?)\s+(?:from|out of|off(?: of)?)\s+(?:my |the )?(.+?)(?:\s+playlist)?$/i)) && !CURW.test(m[1].trim())) return { op: 'remove', what: m[1], pl: m[2] };
      return null;
    }
    function sEdit(ed, t) {
      const A = window.__ppApi, tr = A.tracks(), pls = A.playlists().filter(p => !p.stemOf), want = sNrm(ed.pl);
      const pl = want && (pls.find(p => sNrm(p.name) === want) || pls.find(p => sNrm(p.name).includes(want)));
      if (!pl && !/\bplaylist\b/i.test(t)) return false;   // "drop the bass from this song" is not a playlist edit
      if (!pl) return sSay('I cannot find a playlist called \u201c' + ed.pl + '\u201d.' + (pls.length ? ' You have: ' + pls.slice(0, 6).map(p => p.name).join(', ') + '.' : ''));
      const tg = loadTags(), real = sReal(), inPl = i => (tr[i].playlistIds || []).includes(pl.id), miss = [], labels = []; let hit = [];
      sMentions(ed.what).forEach(m => {
        const r = sResolve(m); if (!r || r.none) { miss.push(m); return; }
        let idx = r.vibes ? real.filter(i => { const c = tg[tr[i].dbId]; return c && r.vibes.every(v => vibes(c).includes(v)); }) : r.tracks;
        labels.push(sLabel(r, m)); hit = hit.concat(r.vibes || r.words ? idx.slice(0, 50) : idx);
      });
      hit = [...new Set(hit)]; const missTxt = miss.length ? ' I could not find ' + miss.map(x => '\u201c' + x + '\u201d').join(', ') + '.' : '';
      if (ed.op === 'add') {
        const todo = hit.filter(i => !inPl(i)); if (!todo.length) return sSay(hit.length ? 'Those are already in ' + pl.name + '.' + missTxt : 'I could not match that to any songs.' + missTxt);
        todo.forEach(i => A.addToPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists();
        smartSt.pu = { at: Date.now(), label: 'Took them back out of ' + pl.name + '.', undo: () => { todo.forEach(i => A.removeFromPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists(); } };
        return sDone('Added ' + todo.length + ' track' + (todo.length === 1 ? '' : 's') + ' (' + labels.join(', ') + ') to ' + pl.name + (hit.length > todo.length ? '; ' + (hit.length - todo.length) + ' were already in it' : '') + '.' + missTxt);
      }
      const del = hit.filter(inPl); if (!del.length) return sSay(hit.length ? 'None of those are in ' + pl.name + '.' + missTxt : 'I could not match that to any songs.' + missTxt);
      const go = () => { del.forEach(i => A.removeFromPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists(); smartSt.pu = { at: Date.now(), label: 'Put them back in ' + pl.name + '.', undo: () => { del.forEach(i => A.addToPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists(); } }; sDone('Removed ' + del.length + ' track' + (del.length === 1 ? '' : 's') + ' (' + labels.join(', ') + ') from ' + pl.name + '. They stay in your library.' + missTxt); };
      if (del.length > 8) askYN('Remove ' + del.length + ' tracks from \u201c' + pl.name + '\u201d? They stay in your library, and I can undo it.', go); else go();
      return true;
    }
    function sPlaylistCmd(t) {
      if (!window.__ppApi || t.length > 220) return false;
      const ed = sParseEdit(t); if (ed && sEdit(ed, t)) { smartSt.last = t; smartSt.at = Date.now(); return true; }
      const sp = sParsePl(t); if (!sp) return false;
      smartSt.last = t; smartSt.at = Date.now(); sRunPl(sp); return true;
    }
    // PLAYLISTS END

    // LIVE MIXES START
    // ---------- Live mixes: ✨ For You, 💜 Ones You May Like, 🔗 Your Pattern ----------
    // Real playlists that keep changing while you use the player. Each pass drops songs that had their turn (played), got skipped,
    // were removed by you, or are stale, then refills from your taste. "Your Pattern" is driven by what you play next to what:
    // a small co-listening matrix learned from your own play history (videos included), blended with sound similarity.
    // Songs you add yourself are never touched. Switch off with the "Auto mixes" checkbox in the Library tab.
    const lvLs = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} };
    const lvOn = () => lvLs('ppvLiveMix') !== '0';
    const LV_DAY = 864e5;
    let lvS = null, lvCur = null, lvBusy = false, lvLast = 0, lvTimer = null, lvTagVer = -1;
    const lvState = () => { if (lvS) return lvS; try { lvS = JSON.parse(lvLs('ppvLiveV1')) || {}; } catch (e) { lvS = {}; } lvS.seq = lvS.seq || []; lvS.co = lvS.co || {}; lvS.sk = lvS.sk || {}; lvS.meta = lvS.meta || {}; lvS.dk = lvS.dk || Date.now(); lvS.blocked = lvS.blocked || {}; return lvS; };
    const lvSave = () => lvLs('ppvLiveV1', JSON.stringify(lvS));
    function lvBump(a, b, w) {
      const co = lvState().co, row = co[a] || (co[a] = {}); row[b] = (row[b] || 0) + w;
      const ks = Object.keys(row); if (ks.length > 30) { ks.sort((x, y) => row[x] - row[y]); ks.slice(0, ks.length - 30).forEach(k => delete row[k]); }
    }
    function lvDecay() {   // old habits fade: x0.9 per day since the last pass
      const s = lvState(), days = Math.floor((Date.now() - s.dk) / LV_DAY); if (days < 1) return;
      const f = Math.pow(0.9, Math.min(days, 30)); s.dk = Date.now();
      Object.keys(s.co).forEach(a => { const r = s.co[a]; Object.keys(r).forEach(b => { r[b] *= f; if (r[b] < 0.05) delete r[b]; }); if (!Object.keys(r).length) delete s.co[a]; });
      const ks = Object.keys(s.co); if (ks.length > 600) ks.map(a => [a, Object.values(s.co[a]).reduce((x, y) => x + y, 0)]).sort((x, y) => x[1] - y[1]).slice(0, ks.length - 500).forEach(x => delete s.co[x[0]]);
    }
    function lvEnd() {   // a track just stopped being current: skipped, partly heard or finished?
      if (!lvCur) return; const s = lvState(), { id, frac, secs } = lvCur; lvCur = null; if (secs < 5) return;
      const now = Date.now(), skipped = frac < 0.25 && secs < 45;
      if (skipped) { const k = s.sk[id] || [0, 0]; s.sk[id] = [k[0] + 1, now]; }
      else if (frac >= 0.8 && s.sk[id]) s.sk[id][0] = Math.max(0, s.sk[id][0] - 1);   // finishing a song forgives an old skip
      if (!skipped && frac >= 0.4) {
        const prev = s.seq.filter(e => now - e[1] < 30 * 60000).slice(-3);
        prev.forEach((e, k) => { if (e[0] === id) return; const w = (frac >= 0.8 ? 1 : 0.6) * (k === prev.length - 1 ? 1 : 0.5); lvBump(e[0], id, w); lvBump(id, e[0], w); });
        s.seq.push([id, now, +frac.toFixed(2)]); if (s.seq.length > 500) s.seq.splice(0, s.seq.length - 500);
      }
      lvSave();
    }
    function lvPoll() {
      const A = window.__ppApi; if (!A || !A.tracks || !lvOn()) return;
      const tr = A.tracks(), i = A.currentIndex(), t = i >= 0 ? tr[i] : null, id = t && !t.stem ? String(t.dbId) : null;
      const m = [...document.querySelectorAll('audio,video')].find(x => !x.paused && !x.ended);
      if (lvCur && m && id === lvCur.id && m.duration > 0) { lvCur.frac = Math.max(lvCur.frac, m.currentTime / m.duration); lvCur.secs = Math.max(lvCur.secs, m.currentTime); }
      if ((lvCur ? lvCur.id : null) !== id) { lvEnd(); lvCur = id ? { id, frac: 0, secs: 0 } : null; lvKick(8000); }
      if (tagVer !== lvTagVer) { lvTagVer = tagVer; lvKick(30000); }
    }
    function lvKick(ms) { if (!lvOn()) return; clearTimeout(lvTimer); lvTimer = setTimeout(() => lvRefresh().catch(e => console.warn('live mixes', e)), Math.max(ms, lvLast + 120000 - Date.now())); }
    const lvSp = (kind, size, exclude, include) => ({ kind, seeds: [], include, exclude, exArtists: [], exVibes: [], exWords: [], themeWords: [], themeSet: null, theme: '', size, name: '', miss: [], said: { seed: [], inc: [], exc: [] }, noCap: true });
    const lvViaBuild = kind => async (need, banned, kept, size) => { const r = await sBuild(lvSp(kind, size, [...banned], [...kept])); return r.idx.filter(i => !kept.has(i)).slice(0, need); };
    async function lvPattern(need, banned, kept, size) {
      const A = window.__ppApi, tr = A.tracks(), s = lvState(), tg = loadTags(), real = sReal(), idx = new Map(tr.map((t, i) => [String(t.dbId), i])), anchors = new Map();
      s.seq.slice(-30).reverse().forEach((e, k) => { const i = idx.get(e[0]); if (i != null) anchors.set(i, (anchors.get(i) || 0) + e[2] * Math.exp(-k / 12)); });
      if (!anchors.size) sTaste().anchors.slice(0, 8).forEach(([i, w]) => anchors.set(i, w));   // no session history yet: use overall taste
      if (!anchors.size) return lvViaBuild('foryou')(need, banned, kept, size);   // nothing to correlate yet: still fill it
      const cs = new Map();   // co-listening: how often each song showed up next to what you played lately
      anchors.forEach((w, a) => { const row = s.co[String(tr[a].dbId)]; if (!row) return; const tot = Object.values(row).reduce((x, y) => x + y, 0) || 1; Object.entries(row).forEach(([b, v]) => { const j = idx.get(b); if (j != null) cs.set(j, (cs.get(j) || 0) + w * v / tot); }); });
      let cmax = 0; cs.forEach(v => { if (v > cmax) cmax = v; });
      const ids = [...anchors.keys()], wts = ids.map(i => anchors.get(i)); let emb = null; try { emb = await sEmbScores(ids, wts); } catch (e) {}
      let lo = 9, hi = -9; if (emb) emb.forEach(e => { if (e < lo) lo = e; if (e > hi) hi = e; }); const span = (hi - lo) || 1;
      const F = new Map(real.map(i => [i, sFeat(tg[tr[i].dbId])])), now = Date.now(), R = new Map();
      const tagS = i => { let a = 0, b = 0; ids.forEach((sd, k) => { a += wts[k] * sFSim(F.get(i), F.get(sd)); b += wts[k]; }); return b ? a / b : 0; };
      const cand = real.filter(i => !banned.has(i) && !kept.has(i) && !anchors.has(i));
      cand.forEach(i => {
        const e = emb && emb.get(i), sk = s.sk[String(tr[i].dbId)], pen = sk && sk[0] > 0 && now - sk[1] < 21 * LV_DAY ? 0.15 * sk[0] : 0;
        R.set(i, 0.5 * (cmax ? (cs.get(i) || 0) / cmax : 0) + 0.3 * (e != null ? (e - lo) / span : 0) + 0.2 * tagS(i) - pen + Math.random() * 0.04);
      });
      return sMMR(cand, i => R.get(i) || 0, F, need, 0.75, 1e9, tr, [...kept]);
    }
    const LV_MIXES = [
      { key: 'foryou', name: '✨ For You', size: 25, ttl: 3, block: 3, pick: lvViaBuild('foryou') },
      { key: 'maylike', name: '💜 Ones You May Like', size: 20, ttl: 7, block: 30, pick: lvViaBuild('discover') },
      { key: 'pattern', name: '🔗 Your Pattern', size: 20, ttl: 5, block: 3, pick: lvPattern }
    ];
    async function lvSync(mx) {
      const A = window.__ppApi, s = lvState(), tr = A.tracks(), now = Date.now(); if (!sReal().length) return;
      const meta = s.meta[mx.key] || (s.meta[mx.key] = { added: {}, block: {} }), byId = new Map(tr.map((t, i) => [String(t.dbId), i]));
      let pl = A.playlists().find(p => p.liveKey === mx.key) || A.playlists().find(p => p.name === mx.name);
      const members = pl ? tr.map((t, i) => i).filter(i => !tr[i].stem && (tr[i].playlistIds || []).includes(pl.id)) : [], mem = new Set(members.map(i => String(tr[i].dbId)));
      const removedNow = new Set(); Object.keys(meta.added).forEach(id => { if (pl && !mem.has(id)) { if (byId.has(id)) removedNow.add(byId.get(id)); delete meta.added[id]; } });   // you took it out: no block, it is only skipped for this pass (use Block to keep it out)
      const cur = A.currentIndex() >= 0 ? String(tr[A.currentIndex()].dbId) : null, lastPlay = {}; s.seq.forEach(e => { lastPlay[e[0]] = Math.max(lastPlay[e[0]] || 0, e[1]); });
      const drop = members.filter(i => s.blocked[String(tr[i].dbId)]).map(i => String(tr[i].dbId)); let aged = 0;   // blocked songs always leave const maxAged = Math.ceil(mx.size * 0.3);
      Object.entries(meta.added).forEach(([id, at]) => {
        if (id === cur || drop.includes(id)) return;              // never pull the song that is playing
        const sk = s.sk[id], played = (lastPlay[id] || 0) > at, skipped = sk && sk[1] > at && sk[0] >= 2;
        if (skipped) { drop.push(id); meta.block[id] = now + 7 * LV_DAY; }
        else if (played && mx.key === 'maylike') { drop.push(id); meta.block[id] = now + mx.block * LV_DAY; }   // no longer new to you
        else if (now - at > mx.ttl * LV_DAY && aged < maxAged) { drop.push(id); aged++; meta.block[id] = now + 2 * LV_DAY; }
      });
      Object.keys(meta.block).forEach(id => { if (meta.block[id] < now) delete meta.block[id]; });
      const banned = new Set(removedNow); Object.keys(meta.block).forEach(id => { if (byId.has(id)) banned.add(byId.get(id)); });
      Object.keys(s.blocked).forEach(id => { if (byId.has(id)) banned.add(byId.get(id)); });   // manual blocks
      const dset = new Set(drop), kept = new Set(members.filter(i => !dset.has(String(tr[i].dbId)))), need = mx.size - kept.size;
      let adds = []; if (need > 0) { try { adds = await mx.pick(need, banned, kept, mx.size); } catch (e) { console.info('live mix', mx.key, e.message); } }
      if (!drop.length && !adds.length) return;
      if (!pl) { if (!adds.length) return; pl = A.createPlaylist(mx.name); }
      pl.auto = 'live'; pl.liveKey = mx.key;
      drop.forEach(id => { if (byId.has(id)) A.removeFromPlaylist(tr[byId.get(id)].dbId, pl.id); delete meta.added[id]; });
      const added = []; adds.forEach(i => { if (A.addToPlaylist(tr[i].dbId, pl.id)) { meta.added[String(tr[i].dbId)] = now; added.push(tr[i].dbId); } });
      const keepIds = members.filter(i => !dset.has(String(tr[i].dbId))).map(i => tr[i].dbId), old = (pl.order || []).filter(id => keepIds.some(k => String(k) === String(id)));
      pl.order = old.concat(keepIds.filter(id => !old.some(o => String(o) === String(id))), added);
      A.commitPlaylists();
    }
    async function lvRefresh(force) {
      const A = window.__ppApi; if (lvBusy || !lvOn() || !A || !A.tracks || !A.playlists) return;
      if (!force && Date.now() - lvLast < 120000) return;
      lvBusy = true;
      try { lvEnd(); lvDecay(); for (const mx of LV_MIXES) { try { await lvSync(mx); } catch (e) { console.warn('live mix', mx.key, e); } } lvLast = Date.now(); lvSave(); } finally { lvBusy = false; }
    }
    const lvBlock = (ids, on) => { const s = lvState(); [].concat(ids).forEach(id => { if (on) s.blocked[String(id)] = Date.now(); else delete s.blocked[String(id)]; }); lvSave(); lvRefresh(true).catch(() => {}); };
    window.__ppLiveMixes = { refresh: () => lvRefresh(true), block: id => lvBlock(id, true), unblock: id => lvBlock(id, false), blocked: () => Object.keys(lvState().blocked) };
    setInterval(lvPoll, 1500); setInterval(() => lvKick(0), 15 * 60000); lvKick(10000);
    // LIVE MIXES END

    // CHAT HELPERS START
    // ---------- Chat box: quick-action chips, type-ahead, guided playlist, mix commands (all with undo) ----------
    { const st = document.createElement('style'); st.textContent = '#ppv-chat .ch-chips,#ppv-chat .ch-sug{display:flex;gap:6px;overflow-x:auto;padding:4px 8px;flex-shrink:0}#ppv-chat .ch-sug:empty{display:none}#ppv-chat .ch-chips button,#ppv-chat .ch-sug button{white-space:nowrap;border-radius:14px;padding:5px 10px;border:1px solid #555;background:#2f3037;color:#eee;font-size:12px;cursor:pointer}#ppv-chat .ch-menu:empty{display:none}#ppv-chat .ch-menu{flex-wrap:wrap;overflow-x:visible;overflow-y:auto;max-height:96px}#ppv-chat .ch-chips button.on{background:var(--accent,#7c3aed);border-color:var(--accent,#7c3aed)}'; document.head.appendChild(st); }
    const lcSug = document.createElement('div'), lcChipBar = document.createElement('div'), lcMenuBtns = document.createElement('div'), lcMenuBar = document.createElement('div'); lcSug.className = 'ch-sug'; lcChipBar.className = 'ch-chips'; lcMenuBtns.className = 'ch-chips'; lcMenuBar.className = 'ch-chips ch-menu';
    cbox.querySelector('.ch-i').before(lcSug, lcChipBar, lcMenuBtns, lcMenuBar);
    const lcUndo = (label, undo) => { smartSt.pu = { at: Date.now(), label, undo }; };
    const lcChoice = (q, opts) => { add('bot', q); actions(opts.map(([t, fn]) => [t, (b, d) => { d.remove(); fn(); }])); };
    const lcSize = fn => lcChoice('How many songs?', [['10', () => fn(10)], ['20', () => fn(20)], ['40', () => fn(40)]]);
    function lcPlayMix(key) {
      const A = window.__ppApi, tr = A.tracks(), pl = A.playlists().find(p => p.liveKey === key); if (!pl) return null;
      const idx = tr.map((t, i) => i).filter(i => !tr[i].stem && (tr[i].playlistIds || []).includes(pl.id)); if (!idx.length) return null;
      const ord = (pl.order || []).map(id => tr.findIndex(t => String(t.dbId) === String(id))).filter(i => idx.includes(i)), q = ord.length ? ord : idx;
      A.play(q[0], q); return pl.name;
    }
    function lcPlaySomething() {
      const A = window.__ppApi, n = lcPlayMix('foryou') || lcPlayMix('pattern') || lcPlayMix('maylike');
      if (n) return add('bot', '\u25b6 Playing ' + n + '.');
      const r = sReal(); if (!r.length) return add('bot', 'Your library is empty.');
      const q = r.slice().sort(() => Math.random() - 0.5).slice(0, 30); A.play(q[0], q); add('bot', '\u25b6 Playing a random pick from your library.');
    }
    function guidePl() {
      const A = window.__ppApi, ci = A.currentIndex(), cur = ci >= 0 ? A.tracks()[ci] : null, tr = A.tracks();
      const moods = () => lcChoice('Which mood?', [['Chill', 'chill'], ['Happy', 'happy'], ['Workout', 'workout'], ['Focus', 'focus'], ['Party', 'party'], ['Sad', 'sad']].map(([t, id]) => [t, () => moodPlaylist(id)]));
      const artists = () => {
        const cnt = {}, nm = {}; sReal().forEach(i => { const a = sNrm(tr[i].artist || ''); if (a) { cnt[a] = (cnt[a] || 0) + 1; nm[a] = tr[i].artist; } });
        const top = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x]).slice(0, 6); if (!top.length) return add('bot', 'I do not see artist names on your tracks yet.');
        lcChoice('Which artist?', top.map(a => [nm[a], () => lcSize(n => { const idx = sReal().filter(i => sNrm(tr[i].artist || '') === a); const sp = lvSp('custom', n, [], idx.slice(0, 6)); sp.name = '\ud83c\udfa4 ' + nm[a]; sRunPl(sp); })]));
      };
      const opts = [['\ud83d\ude0c A mood', moods]];
      if (cur) opts.push(['\ud83d\udd17 Like this song', () => lcSize(n => { const sp = lvSp('similar', n, [], []); sp.seeds = [ci]; sp.said.seed = ['\u201c' + cur.title + '\u201d']; sRunPl(sp); })]);
      opts.push(['\ud83c\udfa4 An artist', artists], ['\ud83c\udfb2 Surprise me', () => send('surprise me', true)]);
      lcChoice('What kind of playlist?', opts);
    }
    function lcWhy() {
      const A = window.__ppApi, i = A.currentIndex(); if (i < 0) return 'Play a track first.';
      const tr = A.tracks(), t = tr[i], id = String(t.dbId), s = lvState(), tg = loadTags(), mixes = A.playlists().filter(p => p.liveKey && (t.playlistIds || []).includes(p.id));
      if (!mixes.length) return '\u201c' + t.title + '\u201d is not in any of your auto mixes right now.';
      const why = [], title = x => { const j = tr.find(q => String(q.dbId) === x); return j && j.title; };
      const near = [...new Set(s.seq.slice(-15).map(e => e[0]))].filter(x => x !== id && s.co[x] && s.co[x][id] > 0).slice(0, 2).map(title).filter(Boolean);
      if (near.length) why.push('you often play it near ' + near.map(x => '\u201c' + x + '\u201d').join(' and '));
      const F = sFeat(tg[t.dbId]);
      if (F) { let best = -1, bs = 0; sTaste().anchors.slice(0, 5).forEach(([a]) => { const sc = sFSim(F, sFeat(tg[tr[a].dbId])); if (sc > bs) { bs = sc; best = a; } });
        if (best >= 0 && bs > 0.25) { const G = sFeat(tg[tr[best].dbId]), sh = [...F.v, ...F.g].filter(x => G.v.has(x) || G.g.has(x)).slice(0, 3); why.push('it sounds like \u201c' + tr[best].title + '\u201d, one you play a lot' + (sh.length ? ' (' + sh.join(', ') + ')' : '')); } }
      const pf = sPF(); if (!((pf[t.dbId] || pf[id] || {}).count > 0)) why.push('you have not played it yet, so it counts as a new find');
      return '\u201c' + t.title + '\u201d is in ' + mixes.map(p => p.name).join(' and ') + ' because ' + (why.length ? why.join('; ') : 'it fits your overall taste') + '.';
    }
    // ---------- Bloop extras: about 20 more commands, "why is <song> in my <playlist or mixes>" for any song, and phrases you teach him ----------
    const blNrm = x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const blSay = s => { add('bot', blTone(s)); return true; };
    const blDone = s => blSay('\u2713 ' + s);
    const blCtx = { id: null };                                      // the song you last asked about, so "why is it in..." works
    const blSave = () => { try { if (window.PPPortfolioApi && window.PPPortfolioApi.flush) window.PPPortfolioApi.flush(); } catch (e) {} try { return JSON.parse(localStorage.getItem('pppSaveV1')) || {}; } catch (e) { return {}; } };
    const blDayKey = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    const blMin = ms => { const mn = Math.round(ms / 60000); return mn < 1 ? 'under a minute' : mn < 60 ? mn + ' min' : Math.floor(mn / 60) + ' h ' + (mn % 60) + ' min'; };
    const blPls = () => window.__ppApi.playlists().filter(p => !p.stemOf);
    const blIn = (t, p) => (t.playlistIds || []).includes(p.id);
    const blFindPl = name => { const w = blNrm(name); if (!w) return null; const pls = blPls(); return pls.find(p => blNrm(p.name) === w) || pls.find(p => blNrm(p.name).includes(w)) || null; };
    const blIdx = id => window.__ppApi.tracks().findIndex(x => String(x.dbId) === String(id));
    const blFindSong = q => { const tr = window.__ppApi.tracks(), w = blNrm(String(q).replace(/["\u201c\u201d'\u2018\u2019]/g, '')), ids = sReal(); if (!w) return -1; return ids.find(i => blNrm(tr[i].title) === w) ?? ids.find(i => blNrm(tr[i].title).includes(w)) ?? -1; };
    const BL_MIXKEY = [[/^for ?you$/i, 'foryou'], [/^(?:ones? you may like|may like|maylike)$/i, 'maylike'], [/^(?:your )?pattern$/i, 'pattern']];
    const BL_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20 };
    // what a phrase names: all mixes, one mix, all playlists, or one playlist (null if nothing matches)
    function blTarget(s) {
      const x = String(s).trim().replace(/[?!.]+$/, '').replace(/^(?:(?:my|the|your|any|all|all of my)\s+)+/i, '').trim();
      if (/^(?:auto |live |auto-|live-)?mix(?:es|tapes?)?$/i.test(x)) return { kind: 'mixes' };
      if (/^playlists?$/i.test(x)) return { kind: 'any' };
      const mk = BL_MIXKEY.find(([re]) => re.test(x.replace(/\s+mix(?:es)?$/i, '')));
      if (mk) return { kind: 'mixes', key: mk[1] };
      const pl = blFindPl(x.replace(/\s+playlist$/i, ''));
      return pl ? { kind: 'pl', pl } : null;
    }
    // "X in Y": tries every " in " split, keeping the first where the right side names a playlist or mix (songs can contain "in")
    function blParseWhy(rest) {
      const cuts = [], re = /\s+(?:in|on|inside|part of)\s+/gi; let m;
      while ((m = re.exec(rest))) cuts.push([rest.slice(0, m.index), rest.slice(m.index + m[0].length)]);
      for (const [s, tg] of cuts) if (s.trim() && blTarget(tg)) return { song: s.trim(), tgt: tg.trim() };
      return cuts.length ? { song: cuts[0][0].trim(), tgt: cuts[cuts.length - 1][1].trim() } : null;
    }
    // Why a track is in a mix: the same reasons the live mixes use (co-listening, sound and tag match, new finds)
    function blReasons(i) {
      const A = window.__ppApi, tr = A.tracks(), t = tr[i], id = String(t.dbId), s = lvState(), tg = loadTags(), why = [];
      const title = x => { const j = tr.find(q => String(q.dbId) === x); return j && j.title; };
      const near = [...new Set(s.seq.slice(-15).map(e => e[0]))].filter(x => x !== id && s.co[x] && s.co[x][id] > 0).slice(0, 2).map(title).filter(Boolean);
      if (near.length) why.push('you often play it near ' + near.map(x => '\u201c' + x + '\u201d').join(' and '));
      const F = sFeat(tg[t.dbId]);
      if (F) {
        let best = -1, bs = 0;
        sTaste().anchors.slice(0, 5).forEach(([a]) => { const sc = sFSim(F, sFeat(tg[tr[a].dbId])); if (sc > bs) { bs = sc; best = a; } });
        if (best >= 0 && bs > 0.25) { const G = sFeat(tg[tr[best].dbId]), sh = [...F.v, ...F.g].filter(x => G.v.has(x) || G.g.has(x)).slice(0, 3); why.push('it sounds like \u201c' + tr[best].title + '\u201d, one you play a lot' + (sh.length ? ' (' + sh.join(', ') + ')' : '')); }
      }
      const pf = sPF(); if (!((pf[t.dbId] || pf[id] || {}).count > 0)) why.push('you have not played it yet, so it counts as a new find');
      return why;
    }
    function blWhyPl(i, pl) {
      const A = window.__ppApi, t = A.tracks()[i], tgc = loadTags()[t.dbId];
      if (pl.liveKey) { const why = blReasons(i); return '\u201c' + t.title + '\u201d is in ' + pl.name + ' because ' + (why.length ? why.join('; ') : 'it fits your overall taste') + '.'; }
      if (/^[^\p{L}\p{N}\s]/u.test(pl.name)) {                        // Bloop-made playlists have an emoji at the start of the name
        if (!tgc) return '\u201c' + t.title + '\u201d is in ' + pl.name + '. Bloop made that playlist from your tags, but this song is not tagged, so I cannot say more. Tag it and ask again.';
        return '\u201c' + t.title + '\u201d is in ' + pl.name + '. Bloop made that playlist from your tags, and this song is tagged ' + (vibes(tgc).slice(0, 4).join(', ') || 'with no clear mood') + (tgc.bpm ? ', at ' + tgc.bpm + ' BPM' : '') + '.';
      }
      return '\u201c' + t.title + '\u201d is in ' + pl.name + ', one of your own playlists. You added it by hand, and I do not keep a record of why.';
    }
    function blWhy(songQ, tgtQ) {
      const A = window.__ppApi, tr = A.tracks(); let i;
      if (/^(?:this|it|that|this (?:one|song|track)|that (?:one|song|track)|(?:the )?current(?: song| track)?)$/i.test(songQ.trim())) {
        i = A.currentIndex(); if (i < 0 && blCtx.id != null) i = blIdx(blCtx.id);
        if (i < 0) return blSay('Play a song first, or tell me its name.');
      } else { i = blFindSong(songQ); if (i < 0) return blSay('I cannot find \u201c' + songQ + '\u201d in your library.'); }
      blCtx.id = tr[i].dbId;
      const tt = blTarget(tgtQ);
      if (!tt) { const names = blPls().filter(p => !p.liveKey).slice(0, 8).map(p => p.name); return blSay('I do not have a playlist called \u201c' + tgtQ + '\u201d.' + (names.length ? ' Your playlists: ' + names.join(', ') + '.' : '')); }
      if (tt.kind === 'pl') return blSay(blIn(tr[i], tt.pl) ? blWhyPl(i, tt.pl) : '\u201c' + tr[i].title + '\u201d is not in ' + tt.pl.name + '.');
      if (tt.kind === 'mixes') { const mx = blPls().filter(p => p.liveKey && (!tt.key || p.liveKey === tt.key) && blIn(tr[i], p)); return blSay(mx.length ? mx.map(p => blWhyPl(i, p)).join('\n') : '\u201c' + tr[i].title + '\u201d is not in ' + (tt.key ? 'that mix' : 'any of your mixes') + ' right now.'); }
      const pls = blPls().filter(p => blIn(tr[i], p));
      return blSay(pls.length ? pls.slice(0, 8).map(p => blWhyPl(i, p)).join('\n') : '\u201c' + tr[i].title + '\u201d is not in any playlist.');
    }
    // ---- commands you teach him: stored on this device only, checked before everything else ----
    const blTaughtGet = () => { try { const v = JSON.parse(localStorage.getItem('ppvBloopTaught')); return Array.isArray(v) ? v.filter(e => e && e.p && e.c) : []; } catch (e) { return []; } };
    const blTaughtSet = v => { try { localStorage.setItem('ppvBloopTaught', JSON.stringify(v.slice(-40))); } catch (e) {} };
    const blNormPhrase = s => String(s).toLowerCase().replace(/^["\u201c\u201d'\s]+|["\u201c\u201d'\s]+$/g, '').replace(/[?!.]+$/, '').replace(/\s+/g, ' ').trim();
    // "*" in a phrase is a slot: "play * vibes" matches "play happy vibes", and "*" in the command is filled with that word
    function blAlias(text) {
      const s = blNormPhrase(text);
      for (const e of blTaughtGet()) {
        if (!e.p) continue;
        const re = new RegExp('^' + e.p.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$', 'i');
        const m = s.match(re); if (!m) continue;
        let k = 1; return e.c.replace(/\*/g, () => m[k++] || '');
      }
      return null;
    }
    function blTeachSave(p0, c0) {
      const p = blNormPhrase(String(p0).replace(/\s+that$/i, '')), c = String(c0).trim().replace(/[.!?"'\u201d]+$/, '').trim();
      if (p.length < 2 || !c) return blSay('Tell me both parts, like: teach yourself \u201cchill out\u201d means \u201cplay something chill\u201d.');
      if (p === blNormPhrase(c)) return blSay('That would loop forever. Pick a different command.');
      if (/^(?:teach|learn|forget|when i|new command|make a command|add a command)/i.test(c)) return blSay('I will not learn a command that changes what I learn.');
      const L = blTaughtGet().filter(e => e.p !== p); L.push({ p, c }); blTaughtSet(L);
      return blDone('Learned it. When you say \u201c' + p + '\u201d, I will do \u201c' + c + '\u201d.' + (p.includes('*') ? ' The * stands for whatever word you put there.' : ''));
    }
    // ---------- Keyword matching: commands from any wording. Words are normalised (synonyms, endings, filler words) and each
    // intent lists groups of words; an intent fires when every group has a word in the message and no excluded word is there.
    const KW_FILLER = new Set(['the', 'a', 'an', 'please', 'can', 'could', 'would', 'will', 'you', 'your', 'i', 'im', 'me', 'to', 'of', 'just', 'now', 'some', 'bit', 'little', 'bloop', 'hey', 'ok', 'okay', 'do', 'so', 'be', 'maybe', 'kinda', 'kind', 'sort', 'slightly', 'perhaps', 'really']);
    const KW_SYN = { loud: 'volume', sound: 'volume', tunes: 'music', tune: 'song', songs: 'song', tracks: 'track', whats: 'what', louder: 'up', raise: 'up', increase: 'up', boost: 'up', bump: 'up', crank: 'up', higher: 'up', quieter: 'down', softer: 'down', lower: 'down', reduce: 'down', decrease: 'down', pause: 'stop', halt: 'stop', hold: 'stop', freeze: 'stop', unpause: 'resume', continue: 'resume', skip: 'next', another: 'next', prev: 'previous', back: 'back', silence: 'mute', randomize: 'shuffle', random: 'shuffle', quicker: 'faster', quick: 'faster', slow: 'slow', heard: 'hear', similar: 'similar', lyrics: 'lyric', words: 'lyric', separate: 'split', karaoke: 'split', isolate: 'split', analyse: 'analyze', tempo: 'bpm', collection: 'library', remaining: 'left', remain: 'left' };
    const blFrame = s => String(s).replace(/^\s*(?:(?:bloop|hey|hi|ok|okay)[,:]?\s+)?(?:why (?:don['\u2019]?t|do not|not|dont) you|why not|how about|could you|would you|will you|can you|can u|do you think you could|would it be possible to|i need you to|i want you to|i'?d like you to|please)\s+/i, '').replace(/\b(?:maybe|kinda|kind of|sort of|perhaps|just real quick)\b,?\s*/gi, '');
    const KW_EQ = [['hip hop', 'hiphop'], ['late night', 'latenight'], ['v shape', 'vshape'], ['v-shape', 'vshape'], ['loudness', 'loudness'], ['classical', 'classical'], ['electronic', 'electronic'], ['acoustic', 'acoustic'], ['podcast', 'podcast'], ['bass', 'bass'], ['treble', 'treble'], ['vocal', 'vocal'], ['pop', 'pop'], ['rock', 'rock'], ['jazz', 'jazz'], ['edm', 'electronic'], ['rap', 'hiphop'], ['flat', 'flat'], ['off', 'flat'], ['normal', 'flat'], ['reset', 'flat']];
    const KW_NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100 };
    const kwTok = s => String(s).toLowerCase().replace(/['\u2019]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w && !KW_FILLER.has(w)).map(w => { const b = KW_SYN[w] || (w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w); return KW_SYN[b] || b; });
    const kwNum = s => { const m = String(s).match(/\d+(?:\.\d+)?/); if (m) return +m[0]; const w = String(s).toLowerCase().split(/\W+/).find(x => KW_NUMW[x] != null); return w ? KW_NUMW[w] : null; };
    // n: groups (each needs one of its words), x: words that rule the intent out, q: also allowed when the message is a question
    const KW_INTENTS = [
      { c: 'pause', n: [['stop']], x: ['after', 'in', 'min', 'minute', 'hour', 'sleep', 'timer', 'loop', 'repeat', 'playlist', 'eq', 'speed', 'volume', 'split', 'lyric', 'tag', 'shuffle', 'mute', 'for'] },
      { c: 'resume', n: [['resume', 'keep', 'start']], x: ['again', 'from', 'over', 'new', 'something', 'playlist', 'speed', 'volume', 'split', 'lyric', 'tag'] },
      { c: 'next', n: [['next', 'skip', 'another', 'change'], ['song', 'track', 'one', 'tune', 'music', 'this', 'it', 'that']], x: ['second', 'sec', 'minute', 'min', 'ahead', 'back', 'intro', 'part', 'section', 'bit', 'frame', 'filter', 'eq', 'preset', 'speed', 'volume', 'time'] },
      { c: 'previous', n: [['previous', 'prev', 'last', 'back'], ['song', 'track', 'one', 'tune']], x: ['frame', 'second', 'sec', 'minute', 'min', 'rewind', 'time', 'playlist'] },
      { c: (s) => (s.has('off') || s.has('stop') || s.has('no')) ? 'shuffle off' : 'shuffle on', n: [['shuffle']], x: ['playlist', 'split', 'lyric', 'tag', 'is', 'what', 'list'] },
      { c: 'volume up', n: [['up'], ['volume', 'music', 'it']], x: ['down', 'sleep', 'timer', 'speed', 'fast', 'slow', 'bass', 'eq', 'treble', 'playlist', 'fullscreen'] },
      { c: 'volume down', n: [['down'], ['volume', 'music', 'it']], x: ['sleep', 'timer', 'speed', 'slow', 'bass', 'eq', 'treble', 'playlist', 'fullscreen'] },
      { c: 'mute', n: [['mute']], x: ['unmute'] },
      { c: 'unmute', n: [['unmute', 'back', 'on'], ['volume', 'sound']], x: [] },
      { c: 'faster', n: [['speed', 'faster'], ['up', 'faster', 'fast']], x: ['volume', 'bass', 'sleep', 'timer'] },
      { c: 'slower', n: [['speed', 'slow'], ['down', 'slow']], x: ['volume', 'bass', 'sleep', 'timer'] },
      { c: 'fullscreen', n: [['fullscreen', 'full']], x: ['exit', 'leave', 'out', 'off', 'close', 'volume'] },
      { c: (s, num) => (s.has('timer') || (s.has('sleep') && num)) && num ? 'sleep timer ' + num + ' minutes' : (s.has('timer') ? 'sleep timer' : null), n: [['sleep', 'timer']], x: ['playlist', 'shuffle', 'cancel', 'off', 'remove', 'clear', 'stop', 'end', 'disable'] },
      { c: (s, num) => (num != null && num <= 100) ? 'volume ' + num : null, n: [['volume', 'sound', 'loud']], x: ['up', 'down', 'raise', 'lower'] },
      { c: 'tag this song', n: [['tag', 'analyze', 'bpm', 'key', 'analysis']], x: ['all', 'everything', 'library', 'untagged', 'every', 'my', 'many', 'how'] },
      { c: 'get the lyrics', n: [['lyric', 'transcribe']], x: ['my', 'find', 'search', 'from'] },
      { c: 'split this song', n: [['split', 'stem', 'karaoke', 'isolate']], x: ['playlist', 'all', 'library', 'my'] },
      { c: 'more like this', n: [['similar', 'like', 'more']], x: ['playlist', 'mix', 'make', 'my', 'dislike', 'dont', 'not'], g: [['this', 'song', 'track', 'one', 'that']] },
      { c: 'library stats', n: [['library'], ['stat', 'big', 'size', 'many', 'summary', 'info', 'how']], x: ['playlist', 'track', 'play', 'add'], q: true },
      { c: 'my playlists', n: [['playlist'], ['my', 'list', 'show', 'what', 'which', 'have']], x: ['make', 'create', 'play', 'add', 'remove', 'delete', 'rename', 'shuffle', 'duplicate', 'empty', 'new', 'called', 'named', 'why', 'in', 'to', 'from', 'of', 'copy', 'clear', 'build', 'start'], q: true },
      { c: 'how long is left', n: [['left'], ['time', 'long', 'much']], x: ['playlist'], q: true },
      { c: "what's this song", n: [['what', 'who', 'name', 'which'], ['this', 'playing', 'sing', 'track', 'current']], x: ['have', 'library', 'my', 'playlist', 'most', 'like', 'repeat', 'loop'], q: true },
      { c: 'zoom out', n: [['zoom'], ['out', 'smaller', 'wider', 'further']], x: ['in', 'closer', 'bigger', 'larger', 'enlarge'] },
      { c: 'zoom in', n: [['zoom'], ['in', 'closer', 'bigger', 'larger', 'enlarge']], x: ['out', 'smaller', 'wider', 'further'] },
      { c: (s, num, r) => { if (!['forward', 'back', 'rewind', 'ahead', 'skip', 'jump', 'ff', 'backward'].some(w => s.has(w))) return null; const mins = s.has('minute') || s.has('min'), secs = s.has('second') || s.has('sec'); if (!num && !mins && !secs) return null; const back = s.has('back') || s.has('rewind') || s.has('backward'); return (back ? 'rewind ' : 'skip forward ') + (num || (mins ? 1 : 10)) + (mins ? ' minutes' : ' seconds'); }, n: [['forward', 'back', 'rewind', 'ahead', 'skip', 'jump', 'ff', 'backward']], x: ['song', 'track', 'previous', 'playlist', 'volume', 'speed', 'frame', 'next', 'loop', 'sleep', 'timer', 'tag', 'lyric', 'split', 'eq', 'fit', 'zoom', 'go', 'to'] },
      { c: (s, num, r) => { const m = r.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/); if (m) return 'go to ' + m[1]; const p = r.match(/\b(middle|halfway|half way|start|beginning|end)\b/); return p ? 'go to ' + p[1].replace('half way', 'halfway') : null; }, n: [['go', 'jump', 'skip', 'seek', 'move', 'take']], x: [] },
      { c: 'restart', n: [['restart', 'replay', 'beginning', 'top']], x: ['playlist', 'speed', 'volume', 'eq', 'go', 'jump', 'skip', 'seek'] },
      { c: (s, num, r) => (num != null && num >= 0.25 && num <= 4 && (s.has('speed') || s.has('tempo') || s.has('pace') || s.has('x') || s.has('times'))) ? 'speed ' + num : null, n: [['speed', 'tempo', 'pace', 'x', 'times']], x: ['volume', 'sleep', 'timer', 'bass', 'eq', 'seek', 'skip', 'playlist'] },
      { c: 'normal speed', n: [['normal', 'regular', 'default', 'reset', 'original'], ['speed', 'tempo', 'pace']], x: ['zoom', 'fit', 'video', 'picture', 'screen'] },
      { c: (s, num, r) => { const k = KW_EQ.find(([w]) => r.includes(w)); return k ? 'eq ' + k[1] : null; }, n: [['eq', 'equalizer', 'equaliser', 'equalise', 'preset']], x: ['next', 'change', 'switch', 'cycle', 'another', 'auto', 'open', 'show'] },
      { c: (s) => s.has('treble') ? 'eq treble' : s.has('vocal') || s.has('vocals') ? 'eq vocal' : 'eq bass', n: [['bass', 'treble', 'vocal', 'vocals']], g: [['boost', 'more', 'up', 'louder', 'stronger', 'needs', 'stronger']], x: ['volume', 'speed'] },
      { c: 'pip', n: [['pip', 'picture'], ['pip', 'picture', 'in', 'mode', 'on', 'open', 'enter', 'switch', 'turn']], x: [] },
      { c: 'rotate', n: [['rotate', 'rotation', 'spin']], x: [] },
      { c: 'reset zoom', n: [['reset', 'undo', 'clear', 'fit'], ['zoom', 'fit', 'picture', 'video', 'screen', 'view']], x: ['change', 'switch', 'cycle', 'next', 'filter'] },
      { c: 'change fit', n: [['change', 'switch', 'cycle', 'next', 'another', 'different'], ['fit', 'aspect', 'ratio']], x: ['reset', 'zoom'] },
      { c: 'next filter', n: [['filter'], ['next', 'change', 'switch', 'cycle', 'another']], x: ['search', 'find', 'look'] },
      { c: (s) => (s.has('back') || s.has('backward') || s.has('previous')) ? 'frame back' : 'frame forward', n: [['frame']], x: ['zoom', 'speed', 'volume'] },
      { c: (s) => (s.has('off') || s.has('exit') || s.has('leave') || s.has('stop')) ? 'exit immersive' : (s.has('on') || s.has('enter') || s.has('start')) ? 'immersive on' : 'immersive', n: [['immersive']], x: [] },
      { c: (s, num, r) => { const m = r.match(/^(?:add|put|save|stick|throw|drop)\s+(?:this|it|the current|current|the song|the track|song|track)\s+(?:to|into|in|onto)\s+(?:my |the )?(.+?)(?: playlist)?$/); return m ? 'add this to ' + m[1] : null; }, n: [['add', 'put', 'save', 'stick', 'throw', 'drop']], x: ['volume', 'speed', 'sleep', 'timer', 'eq', 'zoom', 'loop', 'shuffle', 'repeat'] },
      { c: (s, num, r) => { const m = r.match(/^(?:remove|take|delete|pull)\s+(?:this|it|the current|current|the song|the track|song|track)\s+(?:from|out of|off)\s+(?:my |the )?(.+?)(?: playlist)?$/); return m ? 'remove this from ' + m[1] : null; }, n: [['remove', 'take', 'delete', 'pull']], x: ['volume', 'speed', 'sleep', 'timer', 'eq', 'zoom', 'loop', 'shuffle', 'repeat'] },
      { c: (s, num, r) => { const m = r.match(/^(?:delete|remove|get rid of|erase)\s+(?:my |the )?playlist\s+(.+)$/) || r.match(/^(?:delete|remove|get rid of|erase)\s+(?:my |the )?(.+?)\s+playlist$/); return m ? 'delete playlist ' + m[1] : null; }, n: [['delete', 'remove', 'erase', 'rid'], ['playlist']], x: ['this', 'it', 'from', 'song', 'track', 'current'] },
      { c: (s, num, r) => { const m = r.match(/^(?:play|start|put on|shuffle|listen to)\s+(?:my |the )?(?:playlist )?(.+?)(?: playlist)?$/); return m && !/^(?:this|it|something|some|music|songs?|random)$/.test(m[1]) ? 'play ' + m[1] + ' playlist' : null; }, n: [['play', 'shuffle', 'listen', 'start'], ['playlist']], x: ['make', 'create', 'add', 'remove', 'delete', 'rename', 'my'] },
      { c: (s, num, r) => { const m = r.match(/^(?:search|find|look|filter)(?: (?:for|up|by))?\s+(.+)$/); return m ? 'search ' + m[1] : null; }, n: [['search', 'find', 'look', 'filter']], x: ['playlist', 'my', 'this', 'it', 'next', 'clear', 'reset', 'close', 'make', 'add', 'play', 'song', 'track', 'current'] },
      { c: 'clear search', n: [['search', 'filter']], g: [['clear', 'reset', 'close', 'remove']], x: [] },
      { c: (s, num, r) => { const o = [['equalizer', 'equalizer'], ['eq', 'equalizer'], ['sleep', 'sleep timer'], ['speed', 'speed'], ['effects', 'effects'], ['subtitles', 'subtitles'], ['captions', 'subtitles'], ['menu', 'menu'], ['settings', 'settings'], ['setting', 'settings'], ['playlists', 'playlist'], ['playlist', 'playlist'], ['library', 'library'], ['queue', 'queue'], ['tracks', 'tracks']].find(([w]) => s.has(w)); return o ? 'open ' + o[1] : null; }, n: [['open', 'show', 'go', 'take', 'bring']], x: ['my', 'list', 'what', 'which', 'have', 'make', 'create', 'play', 'shuffle', 'mix', 'close', 'hide', 'add', 'remove', 'delete'] },
      { c: 'close menu', n: [['close', 'hide']], g: [['menu']], x: [] },
      { c: 'cancel sleep timer', n: [['sleep', 'timer']], g: [['cancel', 'off', 'remove', 'clear', 'stop', 'end', 'disable']], x: [] },
      { c: 'stop after this song', n: [['after'], ['song', 'track', 'this', 'current']], g: [['stop', 'sleep', 'pause', 'end', 'halt']], x: ['minute', 'min', 'hour'] },
      { c: 'mute', n: [['off', 'mute', 'silence']], g: [['volume', 'sound']], x: ['unmute', 'back', 'on', 'sleep', 'timer', 'eq', 'bass', 'shuffle', 'repeat', 'loop', 'playlist'] },
      { c: (s, num, r) => (s.has('clear') || s.has('cancel') || s.has('remove') || s.has('off')) ? 'clear loop' : (s.has('end') || s.has('stop') || s.has('finish') || s.has('point') && s.has('b')) ? 'set loop end' : 'set loop start', n: [['loop']], g: [['start', 'begin', 'end', 'finish', 'clear', 'cancel', 'remove', 'off', 'point', 'mark', 'here', 'stop']], x: ['playlist', 'song', 'track', 'this', 'all', 'everything'] },
      { c: (s) => 'undo', n: [['undo', 'revert', 'take']], g: [['that', 'it', 'back', 'this', 'last', 'change']], x: ['song', 'track'] },
      { c: 'help', n: [['help', 'command']], x: [], q: true },
      { c: (s) => (s.has('all') || s.has('everything') || s.has('playlist')) ? 'repeat all' : (s.has('off') || s.has('stop') || s.has('quit')) ? 'repeat off' : 'repeat this song', n: [['repeat', 'loop']], x: ['point', 'start', 'section', 'part', 'shuffle', 'end'] }
    ];
    // Returns {cmd} for one clear match, {ask: [cmd, cmd]} for a tie, or null. Only short messages are read this way.
    function kwRoute(t) {
      const s0 = String(t).toLowerCase().trim().replace(/^(?:why (?:don['’]?t|do not|not) you|why not|how about|could you|would you|will you|can you|do you think you could)\s+/i, ''), words = kwTok(s0);
      if (!words.length || words.length > 9) return null;
      if (/\d\s*x\b/.test(s0)) words.push('x');
      const set = new Set(words), num = kwNum(s0), question = /^(?:what|who|which|how|why|where|when|is|are|am|do|does|did|was|were|can|could)\b/.test(s0);
      const found = [];
      for (const it of KW_INTENTS) {
        if (question && !it.q) continue;
        if (it.x && it.x.some(w => set.has(w))) continue;
        if (!it.n.every(g => g.some(w => set.has(w)))) continue;
        if (it.g && !it.g.every(g => g.some(w => set.has(w)))) continue;
        const cmd = typeof it.c === 'function' ? it.c(set, num, s0) : it.c; if (!cmd) continue;
        found.push({ cmd, score: it.n.length + (it.g ? it.g.length : 0) });
      }
      if (!found.length) return null;
      found.sort((a, b) => b.score - a.score);
      const best = found.filter(f => f.score === found[0].score).map(f => f.cmd), uniq = [...new Set(best)];
      return uniq.length === 1 ? { cmd: uniq[0] } : { ask: uniq.slice(0, 2) };
    }
    // Did-you-mean for commands: the whole message is compared with the closest known phrasings. Nothing changes until you pick one.
    const TYPO_CAT = ['pause', 'resume', 'next song', 'previous song', 'shuffle on', 'shuffle off', 'volume up', 'volume down', 'mute', 'unmute', 'faster', 'slower', 'fullscreen', 'repeat this song', 'restart', 'undo', 'again', 'help', 'library stats', 'my playlists', 'how long is left', "what's this song", 'tag this song', 'get the lyrics', 'split this song', 'more like this', 'surprise me', 'skip intro', 'sleep timer 30 minutes', 'open settings', 'make a playlist', 'auto eq', 'stop after this song', 'what is in my library', 'play something chill', 'play something happy'];
    const kwNorm = s => String(s).toLowerCase().replace(/['\u2019]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    function typoCands(t) {
      const q = kwNorm(t); if (q.length < 3 || q.length > 40) return [];
      return TYPO_CAT.map(p => [p, 1 - sLev(q, p) / Math.max(q.length, p.length)]).filter(x => x[1] >= 0.7 && x[0] !== q).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
    }
    function kwPick(list, q) {
      add('bot', q);
      actions(list.map(c => ['\u25b6 ' + c, (b, d) => { d.remove(); sExec(c); }]).concat([['Neither', (b, d) => { d.remove(); add('bot', 'Okay. Tell me another way, or say \u201chelp\u201d.'); }]]));
      return true;
    }
    // ---------- Bloop's personality: jokes, fun facts and small talk. Jokes and facts come from shuffled decks, so none repeats until all have been told. ----------
    const BL_JOKES = [
      "Why did the song go to therapy? It had too many issues with its bridge.",
      "What do you call a fake noodle? An impasta.",
      "Why don't pianos ever get lost? They always know their keys.",
      "Why did the metronome go to school? To improve its timing.",
      "How do you make a tissue dance? Put a little boogie in it.",
      "What do you call a sheep with a musical talent? A baa-ritone.",
      "Why did the saxophone bring a ladder? To reach the high notes.",
      "Why do cows wear bells? Because their horns don't work.",
      "What's a skeleton's favourite instrument? The trombone.",
      "What kind of music do planets listen to? Nep-tunes.",
      "I wrote a song about a tortilla. It was a bit flat, but it grew on me.",
      "Why did the music teacher go to jail? She was caught with too many sharps.",
      "What's the difference between a piano and a fish? You can tune a piano, but you can't tuna fish.",
      "Why did the speaker go to bed early? It wanted some sound sleep.",
      "Why did the trumpet player fail his exam? He couldn't work out how to blow it.",
      "What did the bass guitar say to the violin? You're far too high-strung.",
      "Why did the ball join a band? It was tired of being kicked around.",
      "Why do balls never win music contests? They always get bounced in the first round.",
      "I'd tell you a joke about my shape, but I'd roll away from it.",
      "Why did the drummer break up with the bassist? Too much tension in the rhythm section.",
      "Why was the guitar so calm? It had already been through a lot of strings attached.",
      "What do you call a dinosaur that listens to music? A Tyrannosaurus Rex-ing.",
      "Why did the vinyl record keep its secrets? It always had a good groove on it.",
      "What did the DJ say to the rain? Looks like you're about to drop a beat.",
      "Why did the piano get a ticket? It was caught playing without a license.",
      "How does a song say goodbye? It fades out, politely.",
      "What's the best way to talk to a banjo? Pluck up the courage.",
      "Why did the drummer bring a ladder? To reach the high hat.",
      "What's a cow's favourite kind of music? Moo-sic.",
      "Why do drummers never get lost? They always follow the beat.",
      "Why was the keyboard so tired? It had too many keys to juggle.",
      "Why did the ball start a music blog? It wanted to get its ideas bouncing."
    ];
    const BL_FACTS = [
      "Most pop songs are in 4/4 time, which is why they're so easy to clap along to.",
      "A standard piano has 88 keys: 52 white and 36 black.",
      "Vinyl records usually play at 33 1/3 or 45 RPM.",
      "Human hearing covers roughly 20 Hz to 20 kHz, and the top end fades with age.",
      "Middle A is usually tuned to 440 Hz, which is the standard reference pitch for orchestras.",
      "Sound travels about 343 metres per second through air at room temperature.",
      "A standard guitar has six strings, tuned E, A, D, G, B, E from low to high.",
      "A metronome at 60 BPM ticks once every second.",
      "Many of the finest violins ever made came from Cremona, in Italy, in the 1600s and early 1700s.",
      "The word piano is short for pianoforte, which means soft-loud, because the instrument could play quietly or loudly.",
      "Beethoven kept composing for years after he began losing his hearing.",
      "A song stuck in your head has a name of its own: an earworm.",
      "Minor keys often sound sadder to listeners, although that's a tendency, not a rule.",
      "The Doppler effect is why a siren sounds higher as it comes toward you and lower as it leaves.",
      "Listening to music lights up many parts of the brain at once, including areas for movement and emotion.",
      "Absolute pitch, the ability to name a note without a reference, is rare.",
      "The hi-hat is played with a foot pedal as well as sticks.",
      "A pure sine wave is the simplest sound there is: a single tone with no overtones.",
      "The first song you learned to play on an instrument often shapes what you enjoy later, which is why a simple tune can take you back years.",
      "A 12-string guitar has pairs of strings tuned in octaves or unisons, which gives it a shimmering sound.",
      "Some musicians play in a key that suits their voice, the same way a singer might pick a comfortable range.",
      "Drummers use the bass drum with a foot pedal, which leaves both hands free for the snare and toms.",
      "A harmony is two or more notes sounding together, while a melody is a single line of notes.",
      "A piano's sustain pedal lifts every damper, so the strings keep ringing after you let go of the keys.",
      "Most cymbals are made from bronze, an alloy of copper and tin.",
      "Voices are sorted by range: bass, baritone, tenor, alto, mezzo-soprano and soprano.",
      "A trombone changes pitch by moving its slide, not by pressing keys.",
      "A harmonica makes sound by air passing over small metal reeds, when you breathe in or out.",
      "Bagpipes have a drone pipe that plays one note continuously underneath the melody.",
      "Allegro and adagio are Italian tempo words for fast and slow.",
      "A bass note at around 40 Hz has a wavelength of about 8.5 metres."
    ];
    const blDecks = { j: [], f: [] };
    const blDraw = (k, pool) => { if (!blDecks[k].length) blDecks[k] = pool.map((_, i) => i).sort(() => Math.random() - .5); return pool[blDecks[k].pop()]; };
    let blLastTalk = '';
    const blGo = (label, cmd) => [label, (b, d) => { d.remove(); send(cmd, true); }];
    const BL_GENRE = { jazz: 'Jazz grew out of blues and ragtime in America, and it is built on improvisation and swing rhythms.', rock: 'Rock grew from rhythm and blues and country in the 1950s, built on electric guitar, bass and drums.', 'hip hop': 'Hip hop started in the Bronx in the 1970s, with rhythmic speech over beats, and DJs and MCs at its heart.', rap: 'Rap is rhythmic, spoken-style vocals over a beat. It is one of the core elements of hip hop.', classical: 'Classical music covers centuries of orchestral and chamber works, from the Baroque era to the Romantic period and beyond.', electronic: 'Electronic music is made with synths, drum machines and computers, from slow ambient textures to club-ready techno.', blues: 'Blues comes from African American music of the American South, often built on 12-bar patterns and expressive bends.', reggae: 'Reggae came from Jamaica, with an offbeat guitar and bass rhythm that gives it its easy, rolling feel.', metal: 'Heavy metal grew from hard rock in the late 1960s and 1970s, known for distorted guitars and powerful drums.', country: 'Country grew from folk and old-time traditions in the American South, often built around storytelling and guitar.', ambient: 'Ambient music is slow and atmospheric, where texture matters more than a beat. It is often used for focus or relaxing.', house: 'House and techno come from Chicago and Detroit club scenes, built on steady four-on-the-floor beats.', techno: 'House and techno come from Chicago and Detroit club scenes, built on steady four-on-the-floor beats.', pop: 'Pop is short for popular music. It is built around catchy hooks, with verses leading into a chorus.', folk: 'Folk music is traditional music passed down by ear, often with simple instruments and personal stories.' };
    const BL_TERM = { chorus: 'The chorus is the part of a song that repeats, usually carrying the main hook.', bridge: 'The bridge is a contrasting section, usually late in a song, that breaks the pattern before the final chorus.', hook: 'A hook is the catchy bit that sticks in your head, often a melody or a short line.', chord: 'A chord is several notes played together. A chord progression is a sequence of them.', key: 'A key is the set of notes a song is built around. Major keys often sound brighter, minor keys often sound darker.', reverb: 'Reverb is the sound of a space: the echo that makes a voice or instrument feel like it is in a room or hall.', eq: 'EQ adjusts the balance of frequencies, so you can boost the bass or the treble, or cut what you do not like.', compression: 'Compression evens out the loud and quiet parts, which is part of why modern music sounds punchy.', sample: 'A sample is a short piece of an existing recording, reused in a new track.', remix: 'A remix reworks a song, often with new beats, arrangement or vocals.', ep: 'An EP is a short release, usually a handful of tracks. An album is a longer collection.', falsetto: 'Falsetto is a high singing voice, made by lightly vibrating the vocal folds.', stem: 'A stem is one part of a song, like vocals, drums or bass. That is what I pull out when I split a track.', tempo: 'Tempo is how fast the beat goes, measured in BPM, beats per minute.', bpm: 'BPM means beats per minute. A metronome at 60 BPM ticks once every second.' };
    const BL_TALK = [
      [/\b(?:what is|what's|what are|tell me about|explain|describe|define)\s+(?:a |an |the )?(jazz|rock|hip hop|rap|classical|electronic|blues|reggae|metal|country|ambient|house|techno|pop|folk)\b(?: music| genre)?/i, m => { blLastTalk = ''; return blSay(BL_GENRE[m[1].toLowerCase()]); }],
      [/\b(?:what is|what's|what are|define|explain|meaning of)\s+(?:a |an |the )?(chorus|bridge|hook|chord|key|reverb|eq|compression|sample|remix|ep|falsetto|stem|tempo|bpm)s?\b/i, m => { blLastTalk = ''; return blSay(BL_TERM[m[1].toLowerCase()]); }],
      [/\b(what do you do all day|what do you do (for fun|all day|when nobody is here)|what do you do when (i'?m|i am) (gone|away))\b/i, () => { blLastTalk = ''; return blSay(pick(["Mostly I bounce in this corner and wait for music. Busy, honestly.", "I sit very still and listen for the next song. It is harder than it sounds.", "I tidy my playlists in my head and wait for you to come back."])); }],
      [/\b(do you get bored|are you bored|do you ever get bored)\b/i, () => { blLastTalk = ''; return blSay(pick(["Only when nothing is playing. Then I count the pixels.", "Never with music on. Silence is my only enemy."])); }],
      [/\b(what'?s|what is|whats) your (favou?rite|fav)\s+(instrument|sound|beat|tempo|key|genre|decade|era)\b/i, () => { blLastTalk = ''; return blSay(pick(["Drums, obviously. Everything bounces better with a beat.", "The bass. It is the lowest voice in the room, and I feel it most.", "A warm, fat synth. Round and bouncy.", "Anything around 120 BPM. It is my natural bounce speed."])); }],
      [/\b(what'?s|what is|whats) your (dream|ideal|perfect) (playlist|album|song|mix)\b/i, () => { blLastTalk = ''; return blSay("Something you make with me, from the first song to the last, with lots of bounce in the middle."); }],
      [/\b(i'?m|i am|im)\s+(?:so |really |super |very |a bit |a little )?(nervous|anxious|worried|scared|stressed out)\b/i, () => { blLastTalk = ''; blSay(pick(["That sounds tough. Let's slow things down with something calm.", "Take a breath with me. Music can help you settle for a bit."])); return actions([blGo('\u25b6 Something gentle', 'play something chill')]); }],
      [/\b(i'?m|i am|im)\s+(?:so |really |super |very |a bit |a little )?(sleepy|exhausted|knackered|drained)\b/i, () => { blLastTalk = ''; blSay(pick(["Sleep sounds like a good idea. Want music that stops by itself?", "Rest up. I can make the music quiet and stop when you drift off."])); return actions([blGo('\u25b6 Sleep timer 30 minutes', 'sleep timer 30 minutes')]); }],
      [/\b(exam|test|homework|deadline|presentation|interview)s?\b.*\b(tomorrow|today|tonight|this week|soon)\b|\b(tomorrow|today|tonight)\b.*\b(exam|test|homework|deadline|presentation|interview)s?\b/i, () => { blLastTalk = ''; blSay(pick(["You've got this! Want something to focus to?", "Good luck! A focus playlist might help you settle in."])); return actions([blGo('\u25b6 Focus playlist', 'make a focus playlist')]); }],
      [/\b(what'?s|what is|whats) (the )?best (song|album|band|genre|music)\b|\bwhich is (the )?better\b|\b(is|are) (pop|rock|jazz|classical|rap|hip hop|metal|electronic) better\b/i, () => { blLastTalk = ''; blSay("There is no single best. The best one is the one that fits how you feel right now. Want me to pick one from your library?"); return actions([blGo('\u25b6 Surprise me', 'surprise me')]); }],
      [/\b(happy friday|it'?s friday|friday)\b/i, () => { blLastTalk = ''; return blSay(pick(["Happy Friday! Something loud to end the week?", "It's Friday! I'm bouncing extra high today."])); }],
      [/\b(happy (birthday|new year)|it'?s my birthday|my birthday)\b/i, () => { blLastTalk = ''; blSay("Happy birthday! I'm bouncing for you. Want a party playlist?"); return actions([blGo('\u25b6 Party playlist', 'make a party playlist')]); }],
      [/\b(do you have a (name|nickname)|what should i call you)\b/i, () => { blLastTalk = ''; return blSay("Bloop is fine. Some people call me Bloopy, and I like that too."); }],
      [/\b(i have a (dog|cat|pet|fish|hamster|bird))\b/i, m => { blLastTalk = ''; return blSay("A " + m[1] + " that listens to music? Sounds like the best audience."); }],
      [/\b(can you|could you|do you) (make|cook|bake|brew) (me )?(a |some )?(coffee|tea|food|lunch|dinner|breakfast|cake)\b/i, () => { blLastTalk = ''; return blSay("Only coffee-coloured bounces, sorry! I can make you a playlist, though."); }],
      [/\b(do you dream|what do you dream about)\b/i, () => { blLastTalk = ''; return blSay("I dream in beats per minute. Mostly around 120."); }],
      [/\b(what makes a song catchy|why (is|are) songs? (so )?catchy|why do i (like|love) (sad|happy) songs)\b/i, () => { blLastTalk = ''; return blSay(pick(["Repetition and a clear hook, usually. Your brain likes to predict what comes next, and a catchy song gives it a fun surprise.", "Sad songs let you feel something without being in trouble. Happy songs make the good feelings louder."])); }],
      [/\b(how do you tune a guitar|how do i tune (a|my) guitar|what'?s a tuner)\b/i, () => { blLastTalk = ''; return blSay("A tuner shows how close each string is to its note. Tune the low string first, then the others, and check each one against the tuner."); }]
    ];
    const BL_TALK_MORE = [
      [/^(?:another|one more|more|again|another one|do another|keep going|next one)$/i, () => { if (blLastTalk === 'joke') return blSay(blDraw('j', BL_JOKES)); if (blLastTalk === 'fact') return blSay('Fun fact: ' + blDraw('f', BL_FACTS)); return false; }],
      [/\b(tell (me )?a joke|joke|make me laugh|something funny|be funny|cheer me up)\b/i, () => { blLastTalk = 'joke'; return blSay(blDraw('j', BL_JOKES)); }],
      [/\b(fun fact|did you know|random fact|music fact|teach me something|something interesting|tell me something (interesting|new|cool))\b/i, () => { blLastTalk = 'fact'; return blSay('Fun fact: ' + blDraw('f', BL_FACTS)); }],
      [/\b(bored|this is boring|so boring)\b/i, () => { blLastTalk = ''; blSay(pick(["Bored? Let's fix that. I can make a surprise playlist, or find songs you've never played.", "Boredom is my favourite thing to fix. Want a surprise mix?", "Oh no! Let's shake things up. Pick one?"])); return actions([blGo('\u25b6 Surprise me', 'surprise me'), blGo('\u25b6 Songs I never played', 'play songs I have never played')]); }],
      [/\b(i'?m|i am|i feel|feeling|im)\s+(?:so |really |super |very |kinda |a bit |a little )?(sad|down|lonely|low|tired|stressed|anxious|overwhelmed|upset|heartbroken|blue|worn out)\b/i, () => { blLastTalk = ''; blSay(pick(["I'm sorry you're feeling that way. Music can help a little, if you want some.", "That sounds rough. I'm only a little ball, but I can find something gentle for you.", "Hang in there. Want something soft to sit with for a while?"])); return actions([blGo('\u25b6 Something gentle', 'play something chill')]); }],
      [/\b(i'?m|i am|i feel|feeling|im)\s+(?:so |really |super |very |pretty )?(happy|great|excited|amazing|awesome|pumped|hyped|fantastic)\b/i, () => { blLastTalk = ''; blSay(pick(["Yay! I'm bouncing already. Want something to match?", "That's great to hear! Let's keep it going.", "Love that energy!"])); return actions([blGo('\u25b6 Something happy', 'play something happy')]); }],
      [/^(?:good )?(?:morning|good morning)\b/i, () => { blLastTalk = ''; return blSay(pick(['Good morning! Coffee first, or music first?', 'Morning! Want something bright to start the day?'])); }],
      [/\b(good afternoon|good evening)\b/i, () => { blLastTalk = ''; return blSay(pick(['Good afternoon! How is your day going?', 'Good evening! Want something mellow for tonight?'])); }],
      [/\bgood night\b|\bnight night\b/i, () => { blLastTalk = ''; blSay('Good night! Sleep well. Want the music to stop by itself?'); return actions([blGo('\u25b6 Sleep timer 30 minutes', 'sleep timer 30 minutes')]); }],
      [/^(?:hi|hello|hey|yo|hiya|hey there|hi there|hello there|howdy)$/i, () => { blLastTalk = ''; return blSay(pick(['Hi! Ready for some music?', 'Hey you! What are we listening to today?', 'Hello, friend! Bouncing and ready.', 'Yo! Want a song, a joke, or a fun fact?'])); }],
      [/^(?:thanks?|thank you|thx|ty|cheers)(?: so| very)?(?: much| a lot)?$/i, () => { blLastTalk = ''; return blSay(pick(["You're welcome! Bouncing with pleasure.", 'Anytime! That is what balls are for.', "No problem. I'd do a happy bounce if I could.", 'Glad I could help!'])); }],
      [/\b(can you|could you|do you|will you|sing me|sing a|sing something|let'?s sing)\b.*\bsing\b|^sing\b/i, () => { blLastTalk = ''; blSay("I can only manage a very wobbly boing. Want me to play a song instead?"); return actions([blGo('\u25b6 Something happy', 'play something happy')]); }],
      [/\b(do you have feelings|do you feel|are you happy|are you sad|are you lonely|do you like me)\b/i, () => { blLastTalk = ''; return blSay(pick(["I don't feel things the way you do, but I do bounce when the beat is good. That counts, right?", "Honestly? I'm a ball in a music player. I'm happiest when there's music playing."])); }],
      [/\bmeaning of life\b/i, () => { blLastTalk = ''; return blSay(pick(['42, obviously. Or maybe the perfect chorus.', 'The answer is 42. The question is probably "what should I play next?"'])); }],
      [/\b(who (made|created|built|coded) you)\b/i, () => { blLastTalk = ''; return blSay("A developer put me in this player. I'm just the bouncy ball in the corner, and I'm proud of it."); }],
      [/\b(you'?re|you are|u r|ur)\s+(so |really |very )?(smart|clever|funny|helpful|useful|cute|awesome|the best)\b/i, () => { blLastTalk = ''; return blSay(pick(['Aww, thanks! You are pretty great yourself.', 'That made me bounce higher!', 'Thank you! I will keep it up.'])); }],
      [/\b(what should i (listen to|play)|any (suggestions|recommendations)|recommend (me )?(something|a song)|i don'?t know what to (listen to|play))\b/i, () => { blLastTalk = ''; blSay("Ooh, let's pick something. Surprise me, or tell me a mood?"); return actions([blGo('\u25b6 Surprise me', 'surprise me'), blGo('\u25b6 Something happy', 'play something happy'), blGo('\u25b6 Something chill', 'play something chill')]); }]
    ];
    BL_TALK.push(...BL_TALK_MORE);
    // Small talk, jokes and facts. Returns true when it answered.
    function blTalk(text) {
      const x = String(text).trim().replace(/[?!.]+$/, '');
      for (const [re, fn] of BL_TALK) { const m = x.match(re); if (m && fn(m, x) !== false) return true; }
      return false;
    }
    // ---------- Bloopy marks: a small Bloopy badge on every AI feature (labels, sections and buttons). Tap it to open the chat with a short explanation. ----------
    const blMarkCss = document.createElement('style');
    blMarkCss.textContent = '.bl-mark{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:1px 7px 1px 5px;border-radius:10px;background:rgba(124,92,255,.18);color:#b9a8ff;font-size:11px;font-weight:600;cursor:pointer;vertical-align:middle;white-space:nowrap}.bl-mark i,.bl-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#7c5cff;flex:none}.bl-dot{margin-left:4px;vertical-align:middle;cursor:pointer}';
    document.head.appendChild(blMarkCss);
    const BL_AI_TIP = {
      tagging: "AI tagging: I listen to each track and note its mood, genre, tempo and key. Tags stay on this device. Say \u201ctag all\u201d to tag your whole library.",
      smart: "Smart features use those tags, plus your listening history, to build playlists. Try \u201cmake a playlist for when I'm stressed\u201d.",
      lyrics: "Lyrics and subtitles: Whisper writes the words from the audio, on your device. Songs get synced lyrics, videos get subtitles.",
      moods: "Mood models are a few small extra files that sharpen the mood tags. They download once, and you can switch them off here.",
      mixes: "Auto mixes update as you listen: For You, Ones You May Like and Your Pattern. Songs you add yourself are never touched.",
      assistant: "I'm the helper in the corner. I play music, make playlists and answer questions about the app. The chat brain is optional and downloads once.",
      stems: "Stems: I pull a song apart into vocals, drums, bass and the rest, on your device. Pick a model, tick the stems you want, then tap split.",
      bgtag: "Background tagging tags your songs while the app is idle, so your moods and smart playlists get better over time.",
      eq: "Auto EQ picks an equaliser preset for each song from its genre tags. You can still change it for any track."
    };
    const BL_AI_RULES = [[/mood model/i, 'moods'], [/background tagging/i, 'bgtag'], [/auto ?eq/i, 'eq'], [/auto mix|for you|live mix/i, 'mixes'], [/lyric|subtitle|whisper|caption/i, 'lyrics'], [/smart|playlist/i, 'smart'], [/tagging|library tools|\btags?\b/i, 'tagging'], [/assistant|chat brain|bloop/i, 'assistant'], [/stem|split/i, 'stems']];
    const BL_AI_BTN = { 'ppv-btn': 'stems', 'ppv-go': 'stems', 'ppv-tag': 'tagging', 'ppv-wgo': 'lyrics', 'subtitle-btn': 'lyrics', 'ppv-simgo': 'smart', 'ppv-surpnow': 'smart', 'ppv-eqall': 'eq' };
    function blAiTip(key) { cbox.style.display = 'flex'; blAnchor(); if (!clist.children.length) add('bot', blOpenLine()); add('bot', BL_AI_TIP[key]); cin.focus(); }
    function blAiMark() {
      const mk = (el, key) => {
        if (!el || el.dataset.blMark || el.closest('#ppv-chat')) return; el.dataset.blMark = key;
        const s = document.createElement('span'); s.className = 'bl-mark'; s.innerHTML = '<i></i>Bloopy'; s.title = 'Ask Bloopy about this';
        s.onclick = e => { e.preventDefault(); e.stopPropagation(); blAiTip(key); }; el.appendChild(s);
      };
      document.querySelectorAll('details > summary').forEach(sm => { const k = BL_AI_RULES.find(([re]) => re.test(sm.textContent)); if (k) mk(sm, k[1]); });
      document.querySelectorAll('label').forEach(lb => { const k = BL_AI_RULES.find(([re]) => re.test(lb.textContent)); if (k) mk(lb, k[1]); });
      Object.keys(BL_AI_BTN).forEach(id => {
        const b = document.getElementById(id); if (!b || b.dataset.blMark || b.closest('#ppv-chat')) return;
        b.dataset.blMark = BL_AI_BTN[id]; const d = document.createElement('i'); d.className = 'bl-dot'; d.title = 'Ask Bloopy about this';
        d.onclick = e => { e.preventDefault(); e.stopPropagation(); blAiTip(BL_AI_BTN[id]); }; b.appendChild(d);
      });
    }
    // Bloopy sits once at the top of each AI area, like the stems menu. No dots or badges on buttons and labels.
    const blTopCss = document.createElement('style');
    blTopCss.textContent = '.bl-top{display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:3;background:#1b1c20;padding:6px 10px;margin-bottom:6px}.bl-top .ppv-ball{width:40px;height:40px;flex:none;cursor:pointer}.bl-top .ppv-bub{font-size:12px;line-height:1.35;opacity:.9}';
    document.head.appendChild(blTopCss);
    // Where Bloopy sits: a panel by id ('id'), an element by selector ('q'), or a collapsible section by its title ('sum').
    const BL_TOP = [
      ['id', 'sidebar-pane-playlist', 'tagging', 'Library: AI tagging and smart playlists live here. Tap me to learn more.'],
      ['id', 'sidebar-pane-settings', 'assistant', 'Settings: the AI features switch on and off here. Tap me for the details.'],
      ['id', 'subtitle-dropdown', 'lyrics', 'Captions: I can write subtitles for a video with Whisper, on this device. Tap me for more.'],
      ['q', '#extras-panel .pp-pane[data-pp="ly"]', 'lyrics', 'Lyrics: Whisper writes the words for a song, and they line up with the music. Tap me for more.'],
      ['sum', /lyrics|subtitles|whisper/i, 'lyrics', 'Lyrics and subtitles: Whisper writes the words from the audio, on this device. Tap me for details.'],
      ['sum', /ai tagging|library tools/i, 'tagging', 'Tagging: I listen to each track and note its mood, genre, tempo and key. Tap me to learn more.'],
      ['sum', /background tagging/i, 'bgtag', 'Background tagging: I tag songs while the app is idle, so smart playlists get sharper over time.'],
      ['sum', /smart features/i, 'smart', 'Smart features: I build playlists from your tags and listening. Ask me for an idea.']
    ];
    function blTopRows() {
      BL_TOP.forEach(([kind, where, key, line]) => {
        let found = [];
        if (kind === 'id') { const e = document.getElementById(where); if (e) found = [e]; }
        else if (kind === 'q') { const e = document.querySelector(where); if (e) found = [e]; }
        else found = [...document.querySelectorAll('details > summary')].filter(sm => where.test(sm.textContent));
        found.forEach(el => {
          const host = kind === 'sum' ? el.parentElement : el;
          if (!host || host.querySelector(':scope > .bl-top')) return;
          const r = document.createElement('div'); r.className = 'bl-top';
          const bl = ball(); bl.title = 'Ask Bloopy'; bl.onclick = () => blAiTip(key);
          const bub = document.createElement('div'); bub.className = 'ppv-bub'; bub.textContent = line;
          r.append(bl, bub);
          if (kind === 'sum') el.after(r); else host.prepend(r);
        });
      });
    }
    document.querySelectorAll('.bl-mark,.bl-dot').forEach(e => e.remove());
    blTopRows(); setInterval(blTopRows, 2000);
    // ---------- Draggable Bloopy: drag the floating ball or the chat box anywhere on screen. Bloopy strains while you pull him and springs back when you let go. ----------
    const blDragCss = document.createElement('style');
    blDragCss.textContent = '@keyframes blStrain{0%,100%{transform:scale(1.1,.9)}50%{transform:scale(.9,1.1)}}@keyframes blSnap{0%{transform:scale(1.25,.75)}40%{transform:scale(.85,1.15)}70%{transform:scale(1.05,.95)}100%{transform:scale(1)}}#ppv-cfab.bl-strain{animation:blStrain .16s ease-in-out infinite}#ppv-cfab.bl-snap{animation:blSnap .45s ease-out}#ppv-chat.bl-strain .ch-h{box-shadow:0 0 0 2px #7c5cff inset}#ppv-cfab,#ppv-chat .ch-h{touch-action:none;cursor:grab}#ppv-cfab.bl-strain,#ppv-chat.bl-strain .ch-h{cursor:grabbing}';
    document.head.appendChild(blDragCss);
    let blSuppress = 0, blAnchoring = false;                                              // a drag must not also count as a tap on the ball
    const blPosGet = k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (e) { return null; } };
    const blPosSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const blClamp = (x, y, w, h) => ({ x: Math.max(4, Math.min(innerWidth - w - 4, x)), y: Math.max(4, Math.min(innerHeight - h - 4, y)) });
    function blMove(el, x, y) { const r = el.getBoundingClientRect(), c = blClamp(x, y, r.width, r.height); el.style.left = c.x + 'px'; el.style.top = c.y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; return c; }
    function blPlace(el, key) { const p = blPosGet(key); if (p) blMove(el, p.x, p.y); }
    // handle: the part you grab; el: what moves; key: where its position is saved
    function blDrag(el, handle, key) {
      let sx, sy, ox, oy, moved = false, on = false;
      const move = e => {
        if (!on) return; const dx = e.clientX - sx, dy = e.clientY - sy;
        if (!moved) { if (Math.hypot(dx, dy) < 6) return; moved = true; el.classList.remove('bl-snap'); el.classList.add('bl-strain'); blFace(el.querySelector('.ppv-ball'), 'strain'); }
        blMove(el, ox + dx, oy + dy); if (el === cfab) blAnchor();
      };
      const end = () => {
        if (!on) return; on = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
        el.classList.remove('bl-strain'); blFace(el.querySelector('.ppv-ball'), 'idle');
        if (moved) { el.classList.add('bl-snap'); setTimeout(() => el.classList.remove('bl-snap'), 500); const r = el.getBoundingClientRect(); blPosSet(key, { x: r.left, y: r.top }); blSuppress = Date.now() + 300; if (el === cfab) blAnchor(); }
      };
      handle.addEventListener('pointerdown', e => {
        if (e.button > 0) return; const r = el.getBoundingClientRect(); on = true; moved = false; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        if (el.id === 'ppv-chat') el.style.width = r.width + 'px';
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
      });
    }
    blPlace(cfab, 'ppvBloopBall');
    blDrag(cfab, cfab, 'ppvBloopBall');
    // The chat box is pinned to Bloopy: right above him if it fits, else below, else to his left, else to his right.
    // If none of those fit whole, it squeezes into the roomier of above / below. It re-anchors when he is dragged, the window
    // resizes, or the box grows (new messages, menus).
    function blAnchor() {
      if (cbox.style.display !== 'flex' || blAnchoring) return; blAnchoring = true;
      try {
        const f = cfab.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, g = 8, m = 6, w = Math.min(420, vw - 2 * m);
        cbox.style.width = w + 'px'; cbox.style.maxHeight = ''; cbox.style.right = 'auto';
        const h = cbox.getBoundingClientRect().height, clampX = x => Math.max(m, Math.min(vw - w - m, x)), clampY = y => Math.max(m, Math.min(vh - h - m, y));
        const up = f.top - g - m, down = vh - f.bottom - g - m, lw = f.left - g - m, rw = vw - f.right - g - m, hx = clampX(f.left + f.width / 2 - w / 2), vy = clampY(f.top + f.height / 2 - h / 2);
        const set = (l, t, b) => { cbox.style.left = l + 'px'; cbox.style.top = t == null ? 'auto' : t + 'px'; cbox.style.bottom = b == null ? 'auto' : b + 'px'; };
        if (h <= up) set(hx, null, vh - f.top + g);                    // above (anchored by its bottom edge so it grows upward)
        else if (h <= down) set(hx, f.bottom + g, null);               // below
        else if (w <= lw) set(f.left - g - w, vy, null);               // left
        else if (w <= rw) set(f.right + g, vy, null);                  // right
        else {                                                         // nothing fits whole: squeeze into the roomier of above / below
          const room = Math.max(120, Math.max(up, down)); cbox.style.maxHeight = room + 'px';
          if (up >= down) set(hx, null, vh - f.top + g); else set(hx, f.bottom + g, null);
        }
      } finally { blAnchoring = false; }
    }
    if (window.ResizeObserver) new ResizeObserver(() => blAnchor()).observe(cbox);
    addEventListener('resize', () => { blPlace(cfab, 'ppvBloopBall'); blAnchor(); });
    // ---------- Bloopy's face: each state (mood, working, straining, talking) picks the eyes, mouth and extras to show. ----------
    function blFace(el, face) {
      if (!el) return;
      const h = new Date().getHours(); if (face === 'idle' && (h >= 22 || h < 5)) face = 'sleep';
      const F = { idle: ['round', 'smile'], greet: ['happy', 'grin'], start: ['happy', 'open'], work: ['focus', 'flat'], think: ['round', 'o'], gen: ['round', 'o'], tag: ['round', 'o'], wh: ['round', 'o'], dl: ['round', 'o'], dec: ['round', 'o'], busy: ['focus', 'flat'], enc: ['focus', 'flat'],
        done: ['happy', 'grin', 'spark'], err: ['dizzy', 'wavy'], worry: ['round', 'worry', 'wavy', 'sweat'], sad: ['sad', 'frown', 'sweat'], sleep: ['sleepy', 'tiny', 'zz'], bored: ['sleepy', 'flat'], excited: ['wide', 'grin'], tap: ['wide', 'open'], talk: ['round', 'open'], sep: ['squint', 'clench', 'sweat'], strain: ['squint', 'clench', 'sweat'] };
      const f = F[face] || F.idle; el.dataset.face = face;
      el.querySelectorAll('[data-fe],[data-fm],[data-fx]').forEach(n => { const v = n.dataset.fe || n.dataset.fm || n.dataset.fx; n.style.display = f.includes(v) ? 'inline' : 'none'; });
    }
    // What the chat says sets his expression for a few seconds, then he goes back to idle
    function blReact(text) {
      if (!cball) return; const s = String(text); let f = null;
      if (/\b(sorry|couldn'?t|could not|cannot|can'?t|oops|not sure|did not work|didn'?t work|slipped)\b/i.test(s)) f = 'worry';
      else if (/\b(sad|rough|hang in there|gentle|lonely|feel(ing)? down)\b/i.test(s)) f = 'sad';
      else if (/\b(joke|funny|laugh|fun fact|ta-da|tada|ha)\b/i.test(s)) f = 'excited';
      else if (/\b(bored|boring|shake things up)\b/i.test(s)) f = 'bored';
      else if (/\b(good night|sleep well|sleep timer|quiet hours)\b/i.test(s)) f = 'sleep';
      else if (/^\u2713|\b(learned|made|added|saved|all done)\b/i.test(s)) f = 'done';
      else if (/\b(love|great|thanks|yay|awesome|happy|bounce|nice)\b/i.test(s)) f = 'greet';
      if (!f) return;
      blFace(cball, f); clearTimeout(blReact.t); blReact.t = setTimeout(() => blFace(cball, 'idle'), 4000);
    }
    // ---------- Bloopy's props: a magnifying glass, phone, headphones and more. Equipping flies the item onto him; unequipping flies it off. ----------
    const blPropCss = document.createElement('style');
    blPropCss.textContent = '.ppv-ball .prop{opacity:0;transform-box:fill-box;transform-origin:center;--fx:0px;--fy:14px}.ppv-ball .prop[data-p=glass],.ppv-ball .prop[data-p=phone],.ppv-ball .prop[data-p=pencil],.ppv-ball .prop[data-p=note],.ppv-ball .prop[data-p=timer],.ppv-ball .prop[data-p=wand]{--fx:-14px;--fy:8px}.ppv-ball .prop[data-p=scissors]{--fx:14px;--fy:-4px}.ppv-ball .prop[data-p=glasses]{--fx:0px;--fy:0px}.ppv-ball .prop.on{opacity:1;animation:blPull .6s cubic-bezier(.2,1.4,.4,1) both}.ppv-ball .prop.off{animation:blPush .35s ease-in both}@keyframes blPull{0%{opacity:0;transform:translate(var(--fx),var(--fy)) scale(.5)}15%{opacity:1}65%{transform:translate(0,-2px) scale(1.06)}100%{opacity:1;transform:none}}@keyframes blPush{0%{opacity:1;transform:none}100%{opacity:0;transform:translate(var(--fx),var(--fy)) scale(.5)}}.ppv-ball .burst{opacity:0}.ppv-ball .burst.go{animation:blBurst 1s ease-out both}@keyframes blBurst{0%{opacity:0;transform:scale(.4)}25%{opacity:1;transform:scale(1.05)}100%{opacity:0;transform:scale(1.45) rotate(25deg)}}.ppv-ball.bl-eq .body{animation:ppvHop .5s ease-out 1}';
    document.head.appendChild(blPropCss);
    let blEqT = 0;
    // Which item fits a message or a task
    function blPropFor(s) {
      const x = String(s).toLowerCase();
      if (/\b(surprise|random|sparkle|magic|wizard)\b/.test(x)) return ['wand', 'wizard'];
      if (/\b(party|celebrate|birthday|hooray|tada|ta-da)\b/.test(x)) return 'party';
      if (/\b(top|most played|favou?rite|best|number one|#1)\b/.test(x)) return 'crown';
      if (/\b(stats?|numbers?|summary|details?|analysis|portfolio|listening|recap)\b/.test(x)) return 'glasses';
      if (/\b(lyrics?|subtitles?|captions?|whisper|transcrib\w*)\b/.test(x)) return 'pencil';
      if (/\b(split|stems?|karaoke|vocals?|instrumental|separate|isolate)\b/.test(x)) return 'scissors';
      if (/\b(sleep|timer|stop after|wake)\b/.test(x)) return 'timer';
      if (/\b(playlists?|mix|mixes|mixtape)\b/.test(x)) return 'note';
      if (/\b(settings?|eq|equali[sz]er|speed|download\w*|model|errors?|bugs?|fix|technical|install\w*|storage|cache|memory|option\w*)\b/.test(x)) return 'phone';
      if (/\b(find|search|look up|where is|what is|who is|info\w*|tell me about|tag|tags|analy[sz]e|bpm|tempo|key|genre\w*|stats?|how many|library|mood\w*)\b/.test(x)) return 'glass';
      if (/\b(play|pause|skip|next|previous|volume|louder|quieter|shuffle|repeat|seek|rewind|forward|mute|music|song|track|listen\w*|fullscreen|zoom)\b/.test(x)) return 'headphones';
      return null;
    }
    // What the splitting / tagging / lyrics jobs hold
    function blPropOfJob(k) { return ({ sep: 'scissors', enc: 'scissors', wh: 'pencil', tag: 'glass', dec: 'glass', dl: 'phone', err: 'phone' })[k] || null; }
    // Equip items (one name, or a list). Anything not in the list goes back in. It all goes back off after a few quiet seconds.
    function blBurst(b) { const g = b.querySelector('.burst'); if (!g) return; g.classList.remove('go'); void g.getBoundingClientRect(); g.classList.add('go'); setTimeout(() => g.classList.remove('go'), 1100); }
    function blEquip(want) {
      clearTimeout(blEqT);
      const W = want ? [].concat(want).filter(Boolean) : [];
      if (W.length) blEqT = setTimeout(() => blEquip(null), 6000);
      [pb, fb, cball].forEach(b => {
        if (!b) return;
        const cur = (b.dataset.props || '').split(',').filter(Boolean);
        if (!cur.length && !W.length) return;
        cur.filter(p => !W.includes(p)).forEach(p => b.querySelectorAll('.prop[data-p="' + p + '"]').forEach(o => { o.classList.remove('on'); o.classList.add('off'); }));
        const add = W.filter(p => !cur.includes(p));
        add.forEach(p => { b.querySelectorAll('.prop[data-p="' + p + '"]').forEach(n => { n.classList.remove('off'); n.classList.add('on'); }); if (p === 'wizard') blBurst(b); });
        b.dataset.props = W.join(',');
        if (add.length) { b.classList.remove('bl-eq'); void b.offsetWidth; b.classList.add('bl-eq'); setTimeout(() => b.classList.remove('bl-eq'), 600); }
      });
    }
    // ---------- Recommended actions: up to five things to try, chosen from what is happening right now (not the full list). ----------
    const BL_SUGGEST_RE = /^(?:what (?:can|could|should) i (?:do|say|try|ask)(?: now| here| next| with this(?: song| track)?)?|what (?:else )?(?:can|should) i (?:do|try)|suggest(?: me)?(?: something| a command| an action| an option| some commands)?|recommend(?: me)? (?:an? )?(?:action|command|option)s?|recommended (?:actions?|commands?|options?)|any (?:ideas|suggestions)(?: for (?:what|commands?|something to do))?|what are my options|what can you do (?:now|here|with this))$/i;
    function blSuggestions() {
      const A = window.__ppApi, tr = A.tracks(), ci = A.currentIndex(), cur = ci >= 0 ? tr[ci] : null, tg = loadTags(), real = sReal(), out = [];
      const add = c => { if (!out.includes(c) && out.length < 5) out.push(c); };
      const untagged = real.filter(i => !tg[tr[i].dbId]).length, pls = blPls().filter(p => !p.liveKey);
      if (!cur) {
        add('play something chill'); add('surprise me');
        if (pls.length) add('play my ' + pls[0].name + ' playlist');
        add('library stats');
        if (!pls.length) add('make a chill playlist');
      } else if (cur.kind === 'video') {
        add('fullscreen'); add('picture in picture'); add('zoom in'); add('frame forward'); add('speed 1.5x');
      } else if (!tg[cur.dbId]) {
        add('tag this song'); add('split this song'); add('get the lyrics');
      } else {
        add('more like this'); add('split this song'); add('what mood is this'); add('get the lyrics');
        if (pls.length) add('add this to ' + pls[0].name);
      }
      if (cur && untagged > 0) add('tag all');
      if (cur && !out.includes('shuffle on')) add('shuffle on');
      return out;
    }
    // ---------- Dressing Bloopy up: naming an item ("wizard", "party hat") puts it on, "take off the crown" takes it off. ----------
    const BL_ITEM = { wizard: ['wand', 'wizard'], 'wizard hat': ['wand', 'wizard'], wand: ['wand', 'wizard'], hat: ['wizard'], 'party hat': 'party', party: 'party', crown: 'crown', glasses: 'glasses', sunglasses: 'glasses', headphones: 'headphones', phone: 'phone', pencil: 'pencil', note: 'note', 'music note': 'note', timer: 'timer', stopwatch: 'timer', scissors: 'scissors' };
    const BL_ITEM_SAY = { wand: 'Wand out! Abracadabra.', wizard: 'Wizard hat on. Something magical is coming.', party: 'Party time! Hat on.', crown: 'Your majesty, the crown suits you.', glasses: 'Glasses on. Time to read the numbers.', headphones: 'Headphones on. Let the music in.', phone: 'Phone out. Technical mode.', pencil: 'Pencil ready. Let\u2019s write some words.', note: 'Music note in hand.', timer: 'Stopwatch on. Ticking.', scissors: 'Scissors ready. Careful, I cut stems.' };
    const blItem = w => BL_ITEM[String(w).toLowerCase().trim()] || null;
    // Puts on the named item, or takes it off. Returns true when it handled the text.
    function blDress(t) {
      const x = String(t).toLowerCase().trim().replace(/[.!?]+$/, '');
      let m = x.match(/^(?:put on|wear|equip|try on|use|bring out|pull out|show me|dress up in|get|add)\s+(?:the |my |a |an |your )?(.+?)(?: please)?$/) || x.match(/^(?:the |my |a |an |your )?(.+?)(?: please)?$/);
      const it = m && blItem(m[1]);
      if (it) { blEquip(it); return blSay(BL_ITEM_SAY[[].concat(it)[0]]); }
      if ((m = x.match(/^(?:take off|take away|put away|unequip|remove|take)\s+(?:the |my |your |all (?:of )?(?:the |my )?)?(.+?)(?: off)?(?: please)?$/)) && !/\b(from|vocals?|this|it|song|track|playlist|volume|tags?)\b/.test(m[1])) {
        const w = m[1].trim();
        if (/^(?:everything|all|accessories|accessory|items|stuff|costume|dress)$/.test(w)) { blEquip(null); return blSay('Everything is back in the bag.'); }
        const off = blItem(w); if (off) { const now = ((pb && pb.dataset.props) || '').split(',').filter(Boolean), gone = [].concat(off); blEquip(now.filter(p => !gone.includes(p))); return blSay('Taken off.'); }
      }
      return false;
    }
    // ---------- Bloopy's voice on command replies: short replies sometimes get a quip for their topic. Lists and longer answers never do. ----------
    const BL_QUIPS = [
      [/volume|louder|quieter|muted?|unmuted/i, ['Ears are happy.', 'Easy on the speakers, friend.', 'Turned up the fun!']],
      [/skipped|went back|back to|next|previous/i, ['Next stop, next song!', 'Onwards!', 'Rewinding my memory too.']],
      [/paused|playing|resum|now playing/i, ['Let the music roll.', 'Bouncing along.', 'Ahhh, that is the good stuff.']],
      [/shuffle/i, ['Mixing it up like a DJ.', 'Chaos mode, but tasteful.']],
      [/playlist|mix/i, ['A fresh mix, made with care.', 'Playlists are my favourite thing to build.', 'Another one for the collection!']],
      [/tagged|tag|bpm|tempo|\bkey\b|mood/i, ['I listened closely. Good ears, these tags.', 'Sniffed out the vibe.']],
      [/split|stems?|vocals?|separat/i, ['Careful, I just took it apart. Gently!', 'Scissors, but make it music.']],
      [/lyrics|subtitles?|transcrib/i, ['I wrote every word down. My pencil is tired.', 'Lyrics unlocked!']],
      [/sleep timer|stop after/i, ['Sleep well soon!', 'Ticking away.']],
      [/\beq\b|equali|preset|bass|treble/i, ['Tuned it up, sounds fancy.', 'A proper sound stage now.']],
      [/speed|faster|slower/i, ['Wheeee!', 'Slow and steady, I like that.']],
      [/fullscreen|zoom|picture|frame|rotate/i, ['Big screen time!', 'Let me see that picture.']],
      [/not find|could not find|cannot find|do not see|do not have|not in your/i, ['Hmm, I looked everywhere.', 'Not in here, and I checked twice.', 'Maybe it is hiding in another folder.']],
      [/nothing is playing|nothing is loaded/i, ['Silence is golden, but I would rather bounce.', 'Play something and I will join in.']],
      [/undid|undo|back to how it was/i, ['Time travel complete.', 'Rewound my own mistake.']],
      [/library is empty|empty/i, ['An empty library is a sad ball.', 'Add some songs and I will cheer.']]
    ];
    function blTone(s) {
      const t = String(s);
      if (t.includes('\n') || t.length > 120 || Math.random() > 0.4) return t;
      const h = BL_QUIPS.find(([re]) => re.test(t));
      return h ? t + ' ' + pick(h[1]) : t;
    }
    // ---------- Bloopy reacts to clicks and taps: a speech bubble over the page, his face changes, and poking him gets a different reaction each time. ----------
    const blReactCss = document.createElement('style');
    blReactCss.textContent = '#bl-react{position:fixed;left:50%;bottom:100px;transform:translate(-50%,8px);opacity:0;transition:opacity .25s,transform .25s;background:#23242a;color:#eee;border:1px solid #444;border-radius:12px;padding:7px 12px;font:13px system-ui,sans-serif;z-index:99990;pointer-events:none;max-width:86vw;text-align:center;box-shadow:0 6px 18px #0008}#bl-react.show{opacity:1;transform:translate(-50%,0)}';
    document.head.appendChild(blReactCss);
    let blBubble = null, blSpeakT = 0, blFaceT = 0, blLastSpeak = 0, blLastLine = '';
    const BL_CLICK = {
      'play-btn': ['Play, pause, play. I never get tired of that button.', 'Ooh, the big button! Something is about to happen.', 'Pressed play. Bounce engaged.'],
      'next-btn': ['Next song! Bye bye, last one.', 'Skipping ahead. Very brave.', 'Next! I hope you like the next one.'],
      'prev-btn': ['Back we go! Time travel is my favourite.', 'Previous song. A little nostalgia never hurt.'],
      'shuffle-btn': ['Shuffle on! Let the chaos begin.', 'Shuffle toggled. Your playlists will never be the same twice.'],
      'repeat-btn': ['Again, again! Round and round we go.', 'Repeat mode. I like a song I can hear twice.'],
      'volume': ['Volume slider! Careful, my ears are sensitive.', 'Sliding the sound. Nice and steady.'],
      'seek': ['Scrubbing through! Wheeee.', 'Jumping around the song like a bouncing ball.'],
      'eq-btn': ['Equaliser! Let me bring out the bass.', 'Tuning the sound. Very professional.'],
      'speed-btn': ['Speed menu! Gotta go fast.', 'Speedy choices.'],
      'sleep-btn': ['Sleep timer? Good plan. I will nap too.', 'Tucking the music in.'],
      'fx-btn': ['Effects! Ooh, shiny.', 'Effects menu. Let\u2019s get fancy.'],
      'subtitle-btn': ['Captions! I can read along with you.', 'Subtitles on the menu. Good call.'],
      'menu-btn': ['Menu! The big list of things.', 'Opening the menu. What are we after?'],
      'pip-btn': ['Picture in picture! Tiny screen, big fun.'],
      'rotate-btn': ['Rotating! Wheee, I feel a bit dizzy.', 'Turning the picture around. Careful now.'],
      'ppv-go': ['Splitting now. Scissors out!', 'Here we go, pulling the song apart.'],
      'ppv-tag': ['Tagging! Sniffing out the vibe.', 'Listening carefully. Good tags take a moment.'],
      'ppv-wgo': ['Lyrics! Pencil ready.', 'Writing down every word.'],
      'ppv-simgo': ['Finding songs that sound alike. Good hunt!'],
      'ppv-surpnow': ['Surprise! I love a good surprise.'],
      'ppv-eqall': ['Auto EQ on all tagged tracks. Very tidy.'],
      'ppv-del': ['Deleting the model. Bye bye, big file.'],
      'ppv-heads': ['Mood models again? I will be right here.']
    };
    const BL_CLICK_GEN = {
      button: ['Click! Nice.', 'Ooh, pressed it.', 'Button pressed. Bouncing approves.', 'Good click.', 'Tap, tap. I felt that.', 'Done, whatever that was!'],
      toggle: ['Switched! Flip, flip.', 'On or off, I trust you.', 'Toggle time!', 'Clicky click. Nice switch.', 'That one changes things, huh?'],
      tab: ['A new tab! Let\u2019s see what\u2019s in here.', 'Switching panes. Looking around.', 'Tab hop!', 'Ooh, a new room.'],
      slider: ['Sliding! Nice and smooth.', 'Watch the numbers move.', 'Slide, slide.']
    };
    const BL_POKE = ['Boing!', 'Hehe, that tickles!', 'Hey! I was bouncing.', 'Poke me again and I will wobble.', 'That is my nose... I think?', 'Okay, okay, I am awake!', 'Stop poking, I am trying to think!', 'You really like me, huh?'];
    const BL_DIZZY = ['Whoa, I am so dizzy!', 'The room is spinning. Give me a second.', 'Okay, that is enough poking for now!'];
    const blFresh = pool => { const fresh = pool.filter(x => x !== blLastLine); const l = pick(fresh.length ? fresh : pool); blLastLine = l; return l; };
    // A speech bubble over the page. Quick repeats are skipped unless forced (dizzy).
    function blSpeak(line, face, force) {
      if (!force && Date.now() - blLastSpeak < 1200) return;
      blLastSpeak = Date.now();
      if (!blBubble) { blBubble = document.createElement('div'); blBubble.id = 'bl-react'; document.body.appendChild(blBubble); }
      blBubble.textContent = line; blBubble.classList.add('show');
      clearTimeout(blSpeakT); blSpeakT = setTimeout(() => blBubble.classList.remove('show'), 2600);
      if (face) { [fb, cball].forEach(b => blFace(b, face)); clearTimeout(blFaceT); blFaceT = setTimeout(() => [fb, cball].forEach(b => blFace(b, 'idle')), 1800); }
    }
    const blPokes = [];
    function blPoke(ball) {
      const now = Date.now(); blPokes.push(now); while (blPokes.length && now - blPokes[0] > 3500) blPokes.shift();
      if (blPokes.length >= 5) { blPokes.length = 0; blFace(ball, 'err'); blSpeak(pick(BL_DIZZY), 'err', true); setTimeout(() => blFace(ball, 'idle'), 2200); return; }
      blSpeak(blFresh(BL_POKE), 'greet');
    }
    document.addEventListener('click', e => {
      if (Date.now() < blSuppress || !e.target || !e.target.closest) return;
      const ball = e.target.closest('.ppv-ball');
      if (ball) { if (ball !== pb) blPoke(ball); return; }
      const el = e.target.closest('button, input, label, select, [data-sidebar-tab]');
      if (!el || el.closest('#ppv-chat, #bl-react')) return;
      let pool = el.id && BL_CLICK[el.id] ? BL_CLICK[el.id] : null;
      if (!pool) {
        const kind = el.hasAttribute('data-sidebar-tab') ? 'tab' : el.matches('input[type=range]') ? 'slider' : el.matches('input[type=checkbox], label, select') ? 'toggle' : el.matches('button') ? 'button' : null;
        pool = kind ? BL_CLICK_GEN[kind] : null;
      }
      if (pool && Math.random() < 0.6) blSpeak(blFresh(pool), 'excited');
    }, true);
    // ---------- Named songs: questions about a song you name ("bpm of Hello", "tell me about Hello") are answered from its tags. ----------
    // Library tracks whose title appears as whole words in the text, longest title first, at most three.
    function blNamed(text) {
      const A = window.__ppApi; if (!A) return [];
      const q = ' ' + String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ', tr = A.tracks(), hits = [];
      sReal().forEach(i => { const tt = ' ' + String(tr[i].title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' '; if (tt.length >= 5 && q.includes(tt)) hits.push(i); });
      return hits.sort((a, b) => tr[b].title.length - tr[a].title.length).slice(0, 3);
    }
    function blNamedTalk(text) {
      const x = String(text).trim().replace(/[?!.]+$/, '');
      if (!/^(?:what|which|is|are|how|tell|describe|does|do|whats)\b/i.test(x) && !/\b(of|for|about)\b/i.test(x)) return false;
      const hits = blNamed(x); if (!hits.length) return false;
      const A = window.__ppApi, t = A.tracks()[hits[0]], tgc = loadTags()[t.dbId], label = t.title + (t.artist ? ' by ' + t.artist : '');
      if (!tgc) return blSay(label + ' is not tagged yet, so I do not know its tags. Tag it first and I will tell you.');
      if (/\b(bpm|tempo)\b/i.test(x)) return blSay(label + ': ' + (tgc.bpm ? tgc.bpm + ' BPM' : 'no tempo found yet') + '.');
      if (/\bkey\b/i.test(x)) return blSay(label + ': ' + (tgc.key ? 'key of ' + tgc.key + (tgc.ck ? ' ' + tgc.ck : '') : 'no key found yet') + '.');
      if (/\bgenre\b/i.test(x)) return blSay(label + ': genre ' + ((tgc.gn || []).slice(0, 3).map(v => v[0]).join(', ') || 'not clear') + '.');
      return blSay(label + ': ' + tagLine(t) + '.');
    }
    let blChain = false, blPaused = false, blQueue = [];
    // Runs each part of a chain as its own command, one reply per part. A part that needs a yes/no pauses the chain;
    // the rest runs after the answer. A part that cannot be understood is skipped and the rest still runs.
    function blRunChain(parts) {
      const was = blChain; blChain = true;
      try {
        for (let i = 0; i < parts.length; i++) {
          let ok = false;
          try { ok = smart(parts[i], false, true); } catch (e) { console.error(e); add('bot', 'Oops, that did not work: ' + e.message); ok = true; }
          if (!ok) { add('bot', 'I did not understand \u201c' + parts[i] + '\u201d, so I skipped it.'); continue; }
          if (blPaused) { blPaused = false; blQueue = parts.slice(i + 1); return; }
        }
      } finally { blChain = was; }
    }
    function blResume() { const q = blQueue; blQueue = []; if (q.length) blRunChain(q); }
    const HELP_MORE = '\n\u2022 \u201cwhy is <song> in my <playlist>\u201d, \u201cwhy is <song> in my mixes\u201d, \u201cwhy is it in my for you\u201d\n\u2022 \u201cteach yourself \u201cchill out\u201d means \u201cplay something chill\u201d\u201d, \u201cwhen I say play * vibes, play something *\u201d, \u201cforget chill out\u201d, \u201cwhat have you learned\u201d\n\u2022 \u201cwhich playlists is this in\u201d, \u201cwhich song is in the most playlists\u201d, \u201cduplicate playlist Gym as Gym 2\u201d, \u201cempty playlist Old\u201d\n\u2022 \u201cplay my top 10 songs\u201d, \u201cplay songs I have never played\u201d, \u201chow many songs have I never played\u201d\n\u2022 \u201cplay the last song I added\u201d, \u201cplay the first song I added\u201d\n\u2022 \u201chow much did I listen yesterday\u201d, \u201chow much in the last 7 days\u201d\n\u2022 \u201cwhat genres do I have\u201d, \u201cmost common moods\u201d, \u201caverage tempo\u201d, \u201cmost common key\u201d, \u201chow many songs are untagged\u201d\n\u2022 \u201cwhat time is it\u201d, \u201cwhat is today\u2019s date\u201d, \u201cflip a coin\u201d, \u201croll a d20\u201d, \u201cpick a number from 1 to 50\u201d\n\u2022 \u201cwhat can I do now?\u201d, \u201csuggest something\u201d: five things to try for what is playing right now\n\u2022 Put several together with commas or \u201cthen\u201d, for any commands: \u201csplit <song>, play <song> then raise volume\u201d. Bloop answers each one in its own message, and pauses to ask when something needs a yes or no.';
    // The extra commands. Returns true when it handled the text.
    function blExtra(t) {
      const A = window.__ppApi, tr = A.tracks(), ids = sReal(), cu = A.currentIndex();
      let PC = null; const plays = () => PC || (PC = blSave().trackPlays || {}), cnt = i => ((plays()[tr[i].dbId] || {}).count || 0);
      const playIdx = (q, label) => { A.play(q[0], q); return blDone(label); };
      const nothingTagged = () => blSay('I need tagged songs for that. Say \u201ctag all\u201d first.');
      let m;
      if (blDress(t)) return true;
      if (BL_SUGGEST_RE.test(t)) { const s = blSuggestions(); if (!s.length) return blSay('Nothing to suggest right now. Try \u201cplay something chill\u201d.'); blSay('Here are a few things you could try right now:'); actions(s.map(c => ['\u25b6 ' + c, (b, d) => { d.remove(); send(c, true); }])); return true; }
      // why (any song, any playlist or mix)
      if ((m = t.match(/^why (?:is|are|was|were|did|does|do) (.+)$/i))) { const r = blParseWhy(m[1]); if (r) return blWhy(r.song, r.tgt); }
      // teach / forget / list his commands
      if ((m = t.match(/^(?:teach (?:yourself|bloop|you)|learn|new command|(?:make|create|add) (?:a |an )?(?:new )?(?:command|shortcut))(?:[:,]| that| called| named| for)?\s+["\u201c']?(.+?)["\u201d']?\s+(?:means|=|->|does|runs|should do)\s+["\u201c']?(.+?)["\u201d']?$/i))) return blTeachSave(m[1], m[2]);
      if ((m = t.match(/^when i (?:say|type|ask(?: you)?) ["\u201c']?(.+?)["\u201d']?,?\s+(?:then\s+)?(?:do|run|play|go with|use|make)\s+(?:it as\s+)?["\u201c']?(.+?)["\u201d']?$/i))) return blTeachSave(m[1], m[2]);
      if ((m = t.match(/^(?:forget|unlearn|delete|remove) (?:the |my |that )?(?:taught |custom |new )?(?:command|phrase|shortcut)(?: called| named| for)? (.+)$/i))) {
        const p = blNormPhrase(m[1]), L = blTaughtGet(), left = L.filter(e => e.p !== p);
        if (left.length === L.length) return blSay('I have no taught command for \u201c' + p + '\u201d. Say \u201cwhat have you learned\u201d to see them.');
        blTaughtSet(left); return blDone('Forgot \u201c' + p + '\u201d.');
      }
      if (/^(?:what have you (?:learned|learnt)|what (?:commands|shortcuts) have i taught you|(?:list|show)(?: me)? (?:my |the )?(?:taught|custom|learned|learnt|own) (?:commands|shortcuts)|my (?:taught |custom |own )?commands)\??$/i.test(t)) {
        const L = blTaughtGet();
        return blSay(L.length ? 'I have learned ' + L.length + ':\n' + L.map(e => '\u2022 \u201c' + e.p + '\u201d means \u201c' + e.c + '\u201d').join('\n') : 'I have not learned any commands yet. Try: teach yourself \u201cchill out\u201d means \u201cplay something chill\u201d.');
      }
      // playlists
      if (/^(?:which|what) playlists? (?:is|are) (?:this|it|the current)(?: (?:song|track|one))? (?:in|part of)\??$|^how many playlists (?:is|are) (?:this|it)(?: (?:song|track))? in\??$/i.test(t)) {
        if (cu < 0) return blSay('Play or pick a track first.');
        const pls = blPls().filter(p => blIn(tr[cu], p));
        return blSay(pls.length ? tr[cu].title + ' is in ' + pls.length + ' playlist' + (pls.length === 1 ? '' : 's') + ': ' + pls.map(p => p.name).join(', ') + '.' : tr[cu].title + ' is not in any playlist.');
      }
      if (/^which (?:song|track) is in the most playlists\??$|^what (?:song|track) is in (?:the )?most playlists\??$/i.test(t)) {
        const pl = blPls(); let best = -1, bn = 0;
        ids.forEach(i => { const n = pl.filter(p => blIn(tr[i], p)).length; if (n > bn) { bn = n; best = i; } });
        return blSay(best < 0 ? 'None of your songs are in a playlist yet.' : '\u201c' + tr[best].title + '\u201d is in the most playlists: ' + bn + '.');
      }
      if ((m = t.match(/^(?:duplicate|copy|clone) (?:my |the )?playlist (.+?) (?:as|to|called|named) (.+)$/i))) {
        const src = blFindPl(m[1]); if (!src) return blSay('I cannot find a playlist called \u201c' + m[1] + '\u201d.');
        const pl = A.createPlaylist(m[2].trim().slice(0, 60)); let n = 0;
        tr.forEach(x => { if (!x.stem && blIn(x, src)) { A.addToPlaylist(x.dbId, pl.id); n++; } });
        A.commitPlaylists(); return blDone('Made \u201c' + pl.name + '\u201d with ' + n + ' song' + (n === 1 ? '' : 's') + ' from \u201c' + src.name + '\u201d.');
      }
      if ((m = t.match(/^(?:empty|clear out|clear) (?:my |the )?playlist (.+)$/i))) {
        const pl = blFindPl(m[1]); if (!pl) return blSay('I cannot find a playlist called \u201c' + m[1] + '\u201d.');
        if (pl.liveKey) return blSay('Auto mixes refill themselves, so I will not empty them. Turn them off in the Library tab if you want them gone.');
        const n = tr.filter(x => !x.stem && blIn(x, pl)).length; if (!n) return blSay('\u201c' + pl.name + '\u201d is already empty.');
        askYN('Take all ' + n + ' song' + (n === 1 ? '' : 's') + ' out of \u201c' + pl.name + '\u201d? They stay in your library.', () => { tr.forEach(x => { if (blIn(x, pl)) A.removeFromPlaylist(x.dbId, pl.id); }); A.commitPlaylists(); blDone('Emptied \u201c' + pl.name + '\u201d.'); });
        return true;
      }
      // play by history and by order
      if ((m = t.match(/^play (?:my )?top (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty) (?:songs|tracks)$/i))) {
        const n = Math.min(50, BL_NUM[m[1].toLowerCase()] || +m[1]), q = ids.filter(i => cnt(i) > 0).sort((a, b) => cnt(b) - cnt(a)).slice(0, n);
        return q.length ? playIdx(q, 'Playing your top ' + q.length + ' most played song' + (q.length === 1 ? '' : 's') + '.') : blSay('I have no play counts yet. Play some music first.');
      }
      if (/^play (?:the )?(?:songs|tracks|music) i (?:have )?(?:never|not yet) (?:played|heard|listened to)$|^play (?:the )?(?:unplayed|unheard) (?:songs|tracks|music)$/i.test(t)) {
        const q = ids.filter(i => cnt(i) === 0).sort(() => Math.random() - .5);
        return q.length ? playIdx(q.slice(0, 50), 'Playing ' + q.length + ' song' + (q.length === 1 ? '' : 's') + ' you have never played, shuffled.') : blSay('You have played every song in your library.');
      }
      if (/^how many (?:songs|tracks) (?:have i|did i) (?:never|not yet) (?:played|heard|listened to)\??$|^how many (?:songs|tracks) (?:are )?(?:unplayed|unheard)\??$/i.test(t)) {
        const n = ids.filter(i => cnt(i) === 0).length; return blSay(n + ' of your ' + ids.length + ' songs ' + (n === 1 ? 'has' : 'have') + ' never been played.');
      }
      if (/^play (?:the )?(?:song|track) i (?:added|imported|uploaded) (?:last|most recently|recently)$|^play (?:the )?(?:newest|latest|most recently added) (?:song|track)$/i.test(t)) {
        const i = ids[ids.length - 1]; if (i === undefined) return blSay('Your library is empty.');
        return playIdx([i], 'Playing \u201c' + tr[i].title + '\u201d, the last song you added.');
      }
      if (/^play (?:the )?(?:song|track) i (?:added|imported|uploaded) first$|^play (?:the )?(?:oldest|first added) (?:song|track)$/i.test(t)) {
        const i = ids[0]; if (i === undefined) return blSay('Your library is empty.');
        return playIdx([i], 'Playing \u201c' + tr[i].title + '\u201d, the first song you added.');
      }
      // listening history
      if (/^how (?:much|long) (?:did i|have i) (?:listen(?:ed)?|played)(?: to)? yesterday\??$|^(?:how much|what(?:'s| is) my (?:listening|listen)(?: time)?) yesterday\??$/i.test(t)) {
        const d = new Date(); d.setDate(d.getDate() - 1); const ms = ((blSave().x || {}).dayMs || {})[blDayKey(d)] || 0;
        return blSay(ms ? 'Yesterday you listened for ' + blMin(ms) + '.' : 'I have no listening recorded for yesterday.');
      }
      if (/^how (?:much|long) (?:did i|have i) (?:listen(?:ed)?|played)(?: to (?:music|anything))? (?:in )?(?:the )?(?:last|past) (?:week|7 days|seven days)\??$/i.test(t)) {
        const dm = (blSave().x || {}).dayMs || {}, d = new Date(); let sum = 0;
        for (let k = 0; k < 7; k++) { sum += dm[blDayKey(d)] || 0; d.setDate(d.getDate() - 1); }
        return blSay(sum ? 'In the last 7 days you listened for ' + blMin(sum) + '.' : 'I have no listening recorded for the last 7 days.');
      }
      // what the tags say about the whole library
      if (/^what (?:genres?|kinds? of music) (?:do i have|am i listening to|do i listen to|are in my (?:library|music))\??$|^(?:what|which) genres? (?:are|is) (?:in )?(?:my )?(?:library|music)\??$/i.test(t)) {
        const tgs = loadTags(), c2 = {}; let n = 0;
        ids.forEach(i => { const c = tgs[tr[i].dbId]; if (!c) return; n++; (c.gn || []).slice(0, 2).forEach(v => { c2[v[0]] = (c2[v[0]] || 0) + 1; }); });
        if (!n) return nothingTagged();
        const top = Object.entries(c2).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return blSay('Top genres in ' + n + ' tagged songs:\n' + top.map((x, k) => (k + 1) + '. ' + x[0] + ' (' + x[1] + ')').join('\n'));
      }
      if (/^what (?:moods?|vibes?) (?:are )?(?:the )?(?:most )?(?:common|popular|top)(?: in)?(?: my)?(?: (?:library|music|songs|tracks))?\??$|^what (?:moods?|vibes?) (?:do i have|is my (?:library|music))\??$/i.test(t)) {
        const tgs = loadTags(), c2 = {}; let n = 0;
        ids.forEach(i => { const c = tgs[tr[i].dbId]; if (!c) return; n++; vibes(c).forEach(v => { c2[v] = (c2[v] || 0) + 1; }); });
        if (!n) return nothingTagged();
        const top = Object.entries(c2).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return blSay('Most common moods in ' + n + ' tagged songs:\n' + top.map((x, k) => (k + 1) + '. ' + x[0] + ' (' + x[1] + ')').join('\n'));
      }
      if (/^(?:what(?:'s| is)|tell me|give me) (?:the )?(?:average|avg|typical|mean) (?:tempo|bpm)(?: (?:of|for|in) (?:my|the) (?:library|music|songs|tracks))?\??$|^(?:what(?:'s| is)|what is) (?:the )?(?:bpm|tempo) range(?: (?:of|in) (?:my|the) (?:library|music|songs|tracks))?\??$/i.test(t)) {
        const tgs = loadTags(), bp = ids.map(i => (tgs[tr[i].dbId] || {}).bpm).filter(b => b > 0);
        if (!bp.length) return nothingTagged();
        const avg = Math.round(bp.reduce((a, b) => a + b, 0) / bp.length);
        return blSay('Across ' + bp.length + ' tagged songs the average is ' + avg + ' BPM, ranging from ' + Math.min(...bp) + ' to ' + Math.max(...bp) + ' BPM.');
      }
      if (/^what keys? (?:is|are) (?:my |the )?(?:library|music|songs|tracks)(?: mostly)? in\??$|^what(?:'s| is) the most common key(?: in my (?:library|music))?\??$/i.test(t)) {
        const tgs = loadTags(), k2 = {};
        ids.forEach(i => { const c = tgs[tr[i].dbId]; if (c && c.key) k2[c.key] = (k2[c.key] || 0) + 1; });
        const top = Object.entries(k2).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return top.length ? blSay('Most common keys: ' + top.map(x => x[0] + ' (' + x[1] + ')').join(', ') + '.') : nothingTagged();
      }
      if (/^how many (?:songs|tracks) (?:are )?(?:still )?(?:not tagged|untagged|left to tag)(?: yet)?\??$|^how many (?:songs|tracks) (?:still )?need tagging\??$/i.test(t)) {
        const tgs = loadTags(), n = ids.filter(i => !tgs[tr[i].dbId]).length;
        return blSay(n + ' of your ' + ids.length + ' songs ' + (n === 1 ? 'is' : 'are') + ' not tagged yet.' + (n ? ' Say \u201ctag all\u201d to fix that.' : ''));
      }
      // small things
      if (/^what time is it(?: right now| now)?\??$|^what(?:'s| is) the (?:current|exact|clock) time(?: right now| now)?\??$|^tell me the time\??$/i.test(t)) return blSay('It is ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' on this device.');
      if (/^what(?:'s| is) (?:today'?s |the )?date(?: today)?\??$|^what day is (?:it|today)\??$|^what(?:'s| is) today\??$/i.test(t)) return blSay('Today is ' + new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '.');
      if (/^(?:flip|toss)(?: a| the)? coin\??$|^heads or tails\??$/i.test(t)) return blSay(Math.random() < .5 ? 'Heads.' : 'Tails.');
      if ((m = t.match(/^roll (?:a |the )?(?:dice|die|d(\d{1,4}))\??$/i))) { const n = m[1] ? Math.max(2, +m[1]) : 6; return blSay('You rolled a ' + (1 + Math.floor(Math.random() * n)) + ' (d' + n + ').'); }
      if ((m = t.match(/^(?:pick|choose|give me|random) (?:a )?(?:random )?number (?:from|between) (-?\d+) (?:to|and) (-?\d+)\??$/i))) {
        let lo = +m[1], hi = +m[2]; if (lo > hi) { const z = lo; lo = hi; hi = z; }
        return blSay('I picked ' + (lo + Math.floor(Math.random() * (hi - lo + 1))) + '.');
      }
      return false;
    }
    const HELP_MIX = '\n\u2022 \u201cmake a playlist\u201d (I will ask what kind), or tap the chips above the box\n\u2022 \u201crefresh my mixes\u201d, \u201cplay my for you\u201d, \u201cplay ones you may like\u201d, \u201cplay your pattern\u201d\n\u2022 \u201cturn auto mixes off\u201d / \u201con\u201d\n\u2022 \u201cblock this song\u201d, \u201cblock this artist\u201d, \u201cblock <artist>\u201d (add \u201cun\u201d to undo), \u201cwhy is this in my mixes\u201d\n\u2022 Type \u201cplay\u201d, \u201cadd this to\u201d or \u201csongs by\u201d and I suggest matches as you type. Say \u201cundo\u201d to take back most of this.';
    function lcCmd(t) {
      const A = window.__ppApi, L = window.__ppLiveMixes; if (!A || !L) return false; let m;
      const ci = A.currentIndex(), cur = ci >= 0 ? A.tracks()[ci] : null;
      if (/^(?:make|create|build|start)(?: me)?(?: a| an)?(?: new)? playlist$/i.test(t)) return (guidePl(), true);
      if (/^(?:refresh|update|rebuild|redo)(?: my| the| all)?(?: auto| live)? mixes$/i.test(t)) {
        if (!lvOn()) return sSay('Auto mixes are off. Say \u201cturn auto mixes on\u201d first.');
        const snap = () => { const o = {}; A.playlists().filter(p => p.liveKey).forEach(p => { o[p.id] = { p, ids: A.tracks().filter(x => !x.stem && (x.playlistIds || []).includes(p.id)).map(x => x.dbId) }; }); return o; }, before = snap();
        sSay('Refreshing your mixes\u2026');
        L.refresh().then(() => {
          const after = snap(); let add_ = 0, rem = 0;
          Object.keys(after).forEach(k => { const b = (before[k] ? before[k].ids : []).map(String), a = after[k].ids.map(String); add_ += a.filter(x => !b.includes(x)).length; rem += b.filter(x => !a.includes(x)).length; });
          lcUndo('Put your mixes back how they were.', () => { Object.keys(after).forEach(k => { const b = (before[k] ? before[k].ids : []), bs = b.map(String), a = after[k].ids, as = a.map(String), pl = after[k].p; a.filter((x, n) => !bs.includes(as[n])).forEach(x => A.removeFromPlaylist(x, pl.id)); b.filter((x, n) => !as.includes(bs[n])).forEach(x => A.addToPlaylist(x, pl.id)); }); A.commitPlaylists(); lvLast = Date.now() + 8 * 60000; });
          sDone(add_ || rem ? 'Mixes updated: ' + add_ + ' added, ' + rem + ' removed.' : 'Your mixes already look right. Nothing to change.');
        }).catch(e => sSay('I could not refresh: ' + e.message));
        return true;
      }
      if ((m = t.match(/^(?:play|start|put on|open)(?: my| the)? (for you|ones you may like|your pattern|pattern)(?: mix| playlist)?$/i))) {
        const key = /for you/i.test(m[1]) ? 'foryou' : /may like/i.test(m[1]) ? 'maylike' : 'pattern', n = lcPlayMix(key);
        if (n) return sDone('Playing ' + n + '.');
        if (!lvOn()) return sSay('Auto mixes are off. Say \u201cturn auto mixes on\u201d first.');
        sSay('That mix is empty, so I will fill it first.'); L.refresh().then(() => { const n2 = lcPlayMix(key); sSay(n2 ? '\u25b6 Playing ' + n2 + '.' : 'I could not find enough songs for it yet. Play and tag a few more tracks.'); }); return true;
      }
      if (/^(?:(?:turn|switch|set)(?: my| the)?(?: auto| live)? mixes (?:on|off)|(?:turn|switch) (?:on|off)(?: my| the)?(?: auto| live) mixes|(?:enable|disable)(?: my| the)?(?: auto| live)? mixes)$/i.test(t)) {
        const want = /\b(on|enable)\b/i.test(t), was = lvOn(), b = document.getElementById('ppv-lmix');
        const setTo = v => { if (b) { b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true })); } else lvLs('ppvLiveMix', v ? '1' : '0'); };
        if (want === was) return sSay('Auto mixes are already ' + (was ? 'on' : 'off') + '.');
        setTo(want); lcUndo('Auto mixes are ' + (was ? 'on' : 'off') + ' again.', () => setTo(was)); return sDone('Auto mixes are ' + (want ? 'on' : 'off') + '.');
      }
      if ((m = t.match(/^(un)?block (?:this|the current)(?: song| track)?(?: from| in)? ?(?:my |the )?(?:auto |live )?(?:mixes|recommendations)?$/i)) || (m = t.match(/^()(?:never|don'?t|do not|stop) (?:recommend(?:ing)?|suggest(?:ing)?|show(?:ing)?)(?: me)? (?:this|it)(?: song| track)?(?: again)?$/i))) {
        if (!cur) return sSay('Play or pick a track first.'); const un = !!m[1], was = !!lvState().blocked[String(cur.dbId)];
        if (un === !was) return sSay('\u201c' + cur.title + '\u201d is already ' + (un ? 'allowed' : 'blocked') + '.');
        un ? L.unblock([cur.dbId]) : L.block([cur.dbId]); lcUndo(un ? 'Blocked \u201c' + cur.title + '\u201d again.' : 'Unblocked \u201c' + cur.title + '\u201d.', () => un ? L.block([cur.dbId]) : L.unblock([cur.dbId]));
        return sDone(un ? '\u201c' + cur.title + '\u201d can show up in your auto mixes again.' : '\u201c' + cur.title + '\u201d will not appear in For You, Ones You May Like or Your Pattern. Say \u201cundo\u201d to take it back.');
      }
      if ((m = t.match(/^(un)?block (?:the )?(?:artist|everything by|songs? by|this artist)(?: (.+?))?(?: from (?:my |the )?(?:auto |live )?mixes)?$/i))) {
        const tr = A.tracks(), name = (m[2] || '').trim() || (cur && cur.artist) || ''; if (!name) return sSay('Which artist? Say \u201cblock <artist>\u201d, or play one of their songs first.');
        const r = m[2] ? sResolve(name) : null, an = sNrm(r && r.artist ? tr[r.tracks[0]].artist : name), ids = sReal().filter(i => sNrm(tr[i].artist || '') === an).map(i => tr[i].dbId);
        if (!ids.length) return sSay('I could not find songs by \u201c' + name + '\u201d.');
        const un = !!m[1]; un ? L.unblock(ids) : L.block(ids); lcUndo(un ? 'Blocked ' + name + ' again.' : 'Unblocked ' + name + '.', () => un ? L.block(ids) : L.unblock(ids));
        return sDone((un ? 'Unblocked ' : 'Blocked ') + ids.length + ' song' + (ids.length === 1 ? '' : 's') + ' by ' + name + (un ? '.' : ' from your auto mixes.'));
      }
      if (/^why\b.*\b(?:this|that|it)\b.*(?:mix|for you|recommend|pattern|playlist|picked|here|suggest)/i.test(t)) return sSay(lcWhy());
      return false;
    }
    // chips: chosen by where the chat was opened and what is going on, big features first, small gestures last
    let lcChipKey = '', lcLyr = { id: null, v: false };
    const lcVis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 20 && r.height > 20 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; };
    // Where the person is in the app: the open sidebar tab (library / playlist / settings, read from the pane id), the video player, or the plain now-playing view.
    function lcWhere() {
      const A = window.__ppApi, t = A && A.currentIndex() >= 0 ? A.tracks()[A.currentIndex()] : null;
      const pane = [...document.querySelectorAll('[id^="sidebar-pane-"]')].find(lcVis);
      if (pane) { const id = pane.id.replace('sidebar-pane-', ''); return /lib/i.test(id) ? 'library' : /play|queue|track/i.test(id) ? 'playlist' : /set/i.test(id) ? 'settings' : 'other'; }
      if (document.fullscreenElement || (t && t.kind === 'video')) return 'video';
      return 'player';
    }
    const lcToggle = (boxId, name) => () => {
      const b = document.getElementById(boxId); if (!b) return add('bot', 'I cannot find that setting.'); const was = b.checked, set = v => { b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true })); };
      set(!was); lcUndo(name + ' is ' + (was ? 'on' : 'off') + ' again.', () => set(was)); add('bot', '\u2713 ' + name + ' is ' + (!was ? 'on' : 'off') + '.');
    };
    function lcChips(noDraw) {
      const A = window.__ppApi; if (!A || !A.tracks || cbox.style.display !== 'flex') return;
      if (!cin.value && lcSug.childNodes.length) lcSug.textContent = '';
      const where = lcWhere(), ci = A.currentIndex(), t = ci >= 0 ? A.tracks()[ci] : null, tg = loadTags(), S = tagStats(), tr = A.tracks();
      const hasMix = k => A.playlists().some(p => p.liveKey === k && tr.some(x => (x.playlistIds || []).includes(p.id)));
      if (t && lcLyr.id !== t.dbId) { let has = false; try { const o = JSON.parse(localStorage.getItem('playerLyricsV1')) || {}; has = !!o[t.dbId]; } catch (e) {} lcLyr = { id: t.dbId, v: has }; }
      const c = [], P = (label, act, w, ctx) => c.push([label, act, w + (ctx && ctx.includes(where) ? 30 : 0)]);
      // big features
      P('\u2795 Make a playlist', guidePl, 80, ['playlist', 'library']);
      if (lvOn()) P(hasMix('foryou') ? '\u25b6 Play For You' : '\u25b6 Play something', lcPlaySomething, 85, ['player', 'video', 'playlist']);
      else P('\u2728 Turn on auto mixes', lcToggle('ppv-lmix', 'Auto mixes'), 88, ['settings', 'playlist', 'library']);
      if (S.left >= 5) P('\ud83c\udff7 Tag ' + S.left + ' untagged tracks', () => askYN('Tag ' + S.left + ' untagged track' + (S.left === 1 ? '' : 's') + '? It can take a while.', () => tagAll()), 80, ['library']);
      if (S.tagged.length >= 8) P('\ud83d\udcc0 Make smart playlists', 'make smart playlists', 70, ['library', 'playlist']);
      if (lvOn() && (hasMix('foryou') || hasMix('pattern'))) P('\ud83d\udd04 Refresh my mixes', 'refresh my mixes', 60, ['playlist', 'settings']);
      if (where === 'settings') { P((lvLs('ppvBg') === '1' ? 'Stop' : 'Start') + ' background tagging', lcToggle('ppv-bg', 'Background tagging'), 75, ['settings']); P('\ud83c\udf81 Surprise me', 'surprise me', 55, ['settings']); }
      if (where === 'playlist') { if (hasMix('maylike')) P('\ud83d\udc9c Ones You May Like', 'play ones you may like', 72, ['playlist']); if (hasMix('pattern')) P('\ud83d\udd17 Your Pattern', 'play your pattern', 70, ['playlist']); }
      if (where === 'playlist' || where === 'library') P('My playlists', 'my playlists', 40);
      if (t && !t.stem) P(t.kind === 'video' ? '\ud83d\udcac Get subtitles' : (lcLyr.v ? '\ud83c\udfa4 Redo lyrics' : '\ud83c\udfa4 Get lyrics'), 'get the lyrics', lcLyr.v ? 20 : 65, t.kind === 'video' ? ['video'] : ['player']);
      // smaller things
      if (t) { P('\ud83d\udd17 More like this', 'more like this', 50, ['player']); const bl = lvState().blocked[String(t.dbId)]; P(bl ? 'Unblock this song' : '\ud83d\udeab Block this song', bl ? 'unblock this song' : 'block this song', 30); if (!t.stem && !tg[t.dbId]) P(t.kind === 'video' ? 'Tag this video' : 'Tag this song', 'tag this song', t.kind === 'video' ? 25 : 25, ['video']); }
      if (t && !t.stem) P('Split this song', 'split this song', 10);
      P('Help', 'help', 5);
      c.sort((a, b) => b[2] - a[2]); lcAll = c; if (noDraw === true) return; const top = c.slice(0, 6), key = where + '|' + top.map(x => x[0]).join('|'); if (key === lcChipKey) return; lcChipKey = key; lcChipBar.textContent = '';
      top.forEach(([label, act]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { typeof act === 'function' ? act() : send(act); }; lcChipBar.appendChild(b); });
    }
    // two pinned menus under the chips: every recommended command the chips know about, and Bloopy's accessories
    const LC_ACC = [['\ud83e\uddd9 Wizard', 'wizard'], ['\ud83c\udf89 Party hat', 'party hat'], ['\ud83d\udc51 Crown', 'crown'], ['\ud83d\udc53 Glasses', 'glasses'], ['\ud83c\udfa7 Headphones', 'headphones'], ['\ud83d\udcf1 Phone', 'phone'], ['\u270f\ufe0f Pencil', 'pencil'], ['\ud83c\udfb5 Note', 'note'], ['\u23f1 Timer', 'timer'], ['\u2702\ufe0f Scissors', 'scissors']];
    let lcMenu = '', lcAll = [];
    const lcWorn = () => ((typeof pb !== 'undefined' && pb && pb.dataset.props) || '').split(',').filter(Boolean);
    function lcDrawMenu() {
      lcMenuBtns.textContent = ''; lcMenuBar.textContent = '';
      [['rec', '\ud83d\udca1 Recommended'], ['acc', '\ud83c\udfa9 Accessories']].forEach(([k, label]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (lcMenu === k) b.className = 'on'; b.onclick = () => { lcMenu = lcMenu === k ? '' : k; lcDrawMenu(); }; lcMenuBtns.appendChild(b); });
      const mk = (label, fn, on) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (on) b.className = 'on'; b.onclick = fn; lcMenuBar.appendChild(b); };
      if (lcMenu === 'rec') { lcChips(true); lcAll.forEach(([label, act]) => mk(label, () => { typeof act === 'function' ? act() : send(act); })); }
      if (lcMenu === 'acc') {
        const worn = lcWorn();
        LC_ACC.forEach(([label, name]) => { const need = [].concat(blItem(name) || []), on = need.length && need.every(p => worn.includes(p)); mk(label, () => { blDress(on ? 'take off ' + name : name); lcDrawMenu(); }, on); });
        mk('\u274c Take all off', () => { blDress('take off everything'); lcDrawMenu(); });
      }
    }
    lcDrawMenu();
    setInterval(lcChips, 1500); cfab.addEventListener('click', () => setTimeout(lcChips, 50));
    // type-ahead: songs, artists and playlist names for play / add / find / like / block
    function lcSuggest() {
      const A = window.__ppApi; lcSug.textContent = ''; if (!A || !A.tracks) return; const v = cin.value; let m; const items = [], tr = A.tracks();
      const put = (label, fill) => { if (items.length < 6 && !items.some(x => x[1] === fill)) items.push([label, fill]); };
      if ((m = v.match(/^(add (?:this|it)(?: song| track)? to (?:my |the )?)(.*)$/i))) { const q = sNrm(m[2]); A.playlists().filter(p => !p.stemOf && sNrm(p.name).includes(q) && sNrm(p.name) !== q).slice(0, 6).forEach(p => put(p.name, m[1] + p.name)); }
      else if ((m = v.match(/^((?:play(?: me)?|find|queue|block|more like|songs? like|similar to|songs by|songs from)\s+)(.{1,40})$/i)) && !/^(?:this|it|that|my|the|something|some|a|an)\b/i.test(m[2])) {
        const q = sNrm(m[2]), verb = m[1].trim().toLowerCase(), real = sReal(); if (q) {
          real.map(i => ({ i, nt: sNrm(tr[i].title), na: sNrm(tr[i].artist || '') })).filter(o => (o.nt.includes(q) || o.na.includes(q)) && o.nt !== q && o.na !== q)
            .sort((x, y) => ((y.nt.startsWith(q) || y.na.startsWith(q)) - (x.nt.startsWith(q) || x.na.startsWith(q))) || x.nt.length - y.nt.length).slice(0, 4).forEach(o => put(tr[o.i].title + (tr[o.i].artist ? ' \u2014 ' + tr[o.i].artist : ''), (/^(?:songs? like|similar to)$/.test(verb) ? 'songs like ' : m[1]) + tr[o.i].title));
          const seen = new Set(); real.forEach(i => { const a = tr[i].artist || '', na = sNrm(a); if (a && na.includes(q) && na !== q && !seen.has(na)) { seen.add(na); if (seen.size <= 2) put('\ud83c\udfa4 ' + a, 'songs by ' + a); } });
          if (/^play/.test(verb)) A.playlists().filter(p => !p.stemOf && sNrm(p.name).includes(q)).slice(0, 2).forEach(p => put('\ud83d\udcc0 ' + p.name, 'play my ' + p.name.replace(/^[^\p{L}\p{N}]+/u, '') + ' playlist'));
        }
      }
      items.forEach(([label, fill]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { cin.value = fill; lcSug.textContent = ''; cin.focus(); }; lcSug.appendChild(b); });
    }
    cin.addEventListener('input', lcSuggest);
    // CHAT HELPERS END

    // ---------- Tag talk: answers about moods, genres and instruments come straight from the tags, never from the AI ----------
    const tagLine = t => { const c = loadTags()[t.dbId]; if (!c) return ''; const g = (c.gn || []).slice(0, 2).map(v => v[0]), mo = (c.md || []).slice(0, 2).map(v => v[0]);
      return vibes(c).join(', ') + (c.bpm ? ', ' + c.bpm + ' BPM' : '') + (c.key ? ', ' + c.key + (c.ck ? ' ' + c.ck : '') : '') + (g.length ? '; genre: ' + g.join(', ') : '') + (mo.length ? '; mood: ' + mo.join(', ') : ''); };
    // 'sad or chill' = either; 'sad and slow' (default) = both.
    function findVibe(ws, any) { if (!any || ws.length < 2) return findTracks(ws); const seen = new Set(), out = []; ws.forEach(w => findTracks([w]).forEach(i => { if (!seen.has(i)) { seen.add(i); out.push(i); } })); return out; }
    function tagTalk(text) {
      const A = window.__ppApi; if (!A) return false;
      const x = String(text).trim().replace(/[?!.]+$/g, ''), tg = loadTags(), say = z => { add('bot', z); return true; };
      const cu = A.currentIndex() >= 0 ? A.tracks()[A.currentIndex()] : null;
      const askTag = t => { add('bot', '\u201c' + t.title + '\u201d is not tagged yet, so I do not know. Want me to tag it?'); actions([['Tag this track', (b, d) => { d.remove(); agent('tag this song'); }]]); return true; };
      const kind = /^(?:what|which) genres? (?:is|are)(?: in)? (?:this|it)(?: song| track)?$|^what'?s (?:the )?genre of (?:this|it)(?: song| track)?$|^what genre is (?:this|it)(?: song| track)?$/i.test(x) ? 'g'
        : /^(?:what|which) instruments? (?:are |is )?(?:in|does) (?:this|it)(?: song| track)?(?: have| use)?$|^what instruments (?:are )?(?:used|playing)(?: in (?:this|it))?$/i.test(x) ? 'i'
        : /^(?:tell me about|describe|what do you know about|what are the tags (?:of|for)|show (?:me )?(?:the )?tags (?:of|for)|what'?s (?:the )?(?:info|tags|details) (?:of|for|on))(?: this| it| the current)(?: song| track)?$/i.test(x) ? 'a' : '';
      if (kind) {
        if (!cu) return say('Play or pick a track first.'); const c = tg[cu.dbId]; if (!c) return askTag(cu);
        if (kind === 'g') { const g = (c.gn || []).slice(0, 3).map(v => v[0] + ' (' + v[1] + '%)'); return say(g.length ? 'Genre: ' + g.join(', ') + '.' : 'The tagger did not find a clear genre for this one.'); }
        if (kind === 'i') { const n = (c.in || []).slice(0, 5).map(v => v[0]); return say(n.length ? 'Instruments I hear: ' + n.join(', ') + '.' : 'I did not pick up clear instruments in this one.'); }
        return say('\u201c' + cu.title + '\u201d: ' + tagLine(cu) + '.');
      }
      let m;
      if ((m = x.match(/^is (?:this|it)(?: song| track)? (?:a |an |very |really )?(\w+)(?: song| track)?$/i))) {
        const w = vibeWordsOf(m[1])[0]; if (w) { if (!cu) return say('Play or pick a track first.'); const c = tg[cu.dbId]; if (!c) return askTag(cu); const ok = vibes(c).includes(w); return say(ok ? 'Yes, it is tagged ' + w + '.' : 'No, it is not tagged ' + w + '. Its tags: ' + vibes(c).join(', ') + '.'); }
      }
      // "any moody songs?", "what sad songs do I have", "give me some chill music"
      if ((/^(?:what|which|any|do i have|have i got|got any|show|list|give me|tell me|recommend|suggest|find|are there|is there|name|got|something|songs?|music|tracks?|tunes?|i need|i want|i'd like|i would like|need|want|can you (?:find|show|suggest|recommend))\b/i.test(x) || /^(?:[\w-]+\s+){0,4}(?:songs?|tracks?|music|tunes?)$/i.test(x)) && (/\b(songs?|tracks?|music|tunes?|jams?)\b/i.test(x) || /\b(listen to|something (to|for)|put on)\b/i.test(x))) {
        const ws = vibeWordsOf(x); if (!ws.length) return false; const anyOf = /\b(or|either)\b/i.test(x);
        const S = tagStats(); if (!S.tagged.length) { add('bot', 'None of your tracks are tagged yet, so I cannot tell what is ' + ws.join(' ') + '. Want me to tag your library?'); actions([['Tag my library', (b, d) => { d.remove(); agent('tag all'); }]]); return true; }
        const r = findVibe(ws, anyOf), tr = A.tracks(), note = S.left > 0 ? ' (' + S.tagged.length + ' of ' + S.real.length + ' tracks are tagged)' : '';
        if (!r.length) return say('None of your tagged tracks are ' + ws.join(' ') + note + '.');
        add('bot', r.length + ' ' + ws.join(' ') + ' track' + (r.length === 1 ? '' : 's') + note + ':\n' + r.slice(0, 8).map(i => tr[i].title + (tr[i].artist ? ' \u2013 ' + tr[i].artist : '')).join('\n') + (r.length > 8 ? '\n\u2026and ' + (r.length - 8) + ' more' : ''));
        actions([['\u25b6 Play ' + (r.length > 1 ? 'them' : 'it'), () => { const q = r.slice(0, 30); A.play(q[0], q); }]]); return true;
      }
      return false;
    }
    // Facts handed to the chat AI with each message, so it talks about YOUR tracks and tags instead of making things up.
    function groundCtx(text) {
      const A = window.__ppApi; if (!A) return '';
      const tr = realTr(), tg = loadTags(), cu = A.currentIndex() >= 0 ? A.tracks()[A.currentIndex()] : null, L = [];
      L.push(' LIBRARY DATA (the only facts you may use about the music): ' + tr.length + ' tracks, ' + tr.filter(t => tg[t.dbId]).length + ' tagged.');
      if (cu && tg[cu.dbId]) L.push('Now playing is tagged: ' + tagLine(cu) + '.');
      const ws = vibeWordsOf(text), anyOf = /\b(or|either)\b/i.test(text);
      if (ws.length) { const r = findVibe(ws, anyOf).slice(0, 5), all = A.tracks(); L.push(r.length ? 'Tracks that are ' + ws.join(' ') + ': ' + r.map(i => all[i].title + (all[i].artist ? ' by ' + all[i].artist : '') + ' (' + tagLine(all[i]) + ')').join('; ') + '.' : 'No tagged tracks are ' + ws.join(' ') + '.'); }
      blNamed(text).forEach(i => { const x = A.tracks()[i]; L.push('Named track ' + x.title + (x.artist ? ' by ' + x.artist : '') + ': ' + (loadTags()[x.dbId] ? tagLine(x) : 'not tagged yet') + '.'); });
      L.push('Never invent song names, artists, tags or moods. Only name tracks listed here. If the answer is not here, say you do not know and suggest tagging.');
      return L.join(' ');
    }
    async function send(raw, noEcho) {
      const text = String(raw || '').trim().slice(0, 400); if (!text || chatBusy) return;
      if (!noEcho) add('me', text);
      try { blEquip(blPropFor(text)); } catch (e) { console.error(e); }
      if (CRISIS.test(text)) { add('bot', CRISIS_MSG); return; }
      try { if (roleplay(text)) return; } catch (e) { console.error(e); }
      try { if (blNamedTalk(text)) return; } catch (e) { console.error(e); }
      if (agentOn()) { let hit = false; try { hit = smart(text); } catch (e) { console.error(e); hit = true; add('bot', 'Oops, that did not work: ' + e.message); } if (hit) return; }
      try { if (tagTalk(text)) return; } catch (e) { console.error(e); }
      try { if (blTalk(text)) return; } catch (e) { console.error(e); }
      const f = FAQ.find(x => x[0].test(text)); if (f) { const r = f[1]; add('bot', typeof r === 'function' ? r() : Array.isArray(r) ? pick(r) : r); return; }
      if (agentOn()) { try { if (routeIntent(text)) return; } catch (e) { console.error(e); } }
      if (!brainOn()) { fallbackReply(text); return; }
      if (heavyBusy()) { add('bot', "I'm busy with a heavy job (split, lyrics or tagging), so I'm staying out of memory until it's done. Commands still work, and I can chat after."); return; }
      if (!gen && !dlOk && lsGet('ppvChatDl') !== '1') {
        add('bot', "To chat about anything else I need to download my brain first: about 150 MB, one time. Wi-Fi is best.");
        actions([['Download and chat', (b, d) => { d.remove(); dlOk = true; send(text, true); }], ['Not now', (b, d) => d.remove()]]);
        return;
      }
      chatBusy = true; cm('work');
      const el = add('bot', '\u2026');
      try {
        const g = await ensureModel(s => { el.textContent = s; });
        const msgs = [{ role: 'system', content: sysPrompt() + groundCtx(text) }].concat(memN() ? hist.slice(-2 * memN()) : [], [{ role: 'user', content: text }]);
        let acc = '', opts = { max_new_tokens: 60, do_sample: true, temperature: 0.5, top_p: 0.9, repetition_penalty: 1.1 };
        if (tfMod.TextStreamer) opts.streamer = new tfMod.TextStreamer(g.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: t => { acc += t; el.textContent = acc; scrollDown(); } });
        const out = await g(msgs, opts);
        let r = out && out[0] && out[0].generated_text; r = Array.isArray(r) ? (r[r.length - 1] || {}).content : (r || acc);
        r = String(r || acc).trim().replace(/\s+\n/g, '\n') || "Hmm, I lost my words. Try again?";
        if (!looksOk(r)) { el.textContent = "Sorry, that came out as gibberish. Try again, or tap Clear."; return void (chatBusy = false); }   // never feed garbage back into the history
        el.textContent = r; hist.push({ role: 'user', content: text }, { role: 'assistant', content: r }); hist = memN() ? hist.slice(-2 * memN()) : [];
        moodChip(text);
      } catch (e) { console.error(e); dlOk = false; el.textContent = "Oops, my brain would not load: " + e.message; }
      chatBusy = false; scrollDown(); cm('greet'); setTimeout(() => cm('idle'), 1300);
      clearTimeout(idleT); idleT = setTimeout(async () => { if (gen && !chatBusy) { try { await gen.dispose(); } catch (e) {} gen = null; } }, 60000);   // hand the RAM back when idle
    }
    return {
      react,
      chat: { isOn: () => chatOn, setOn: setChatOn, free: freeChat, brainOn, setBrain, memory: { get: memN, set: setMem, max: MEM_MAX } },
      start() { key = ''; set('start', pick(L.start), 900); },
      opened() {
        if (greeted || !on) return; greeted = true;
        const h = new Date().getHours(), hi = h < 5 ? 'Up late?' : h < 12 ? 'Good morning!' : h < 18 ? 'Hey there!' : 'Good evening!';
        let met = lsGet('ppvMascotMet'); lsSet('ppvMascotMet', '1');
        set('greet', met ? hi + ' ' + pick(['Ready when you are.', 'What are we working on?', 'Got a song for me?'])
                         : blOpenLine() + " I split songs, tag them and write lyrics. Pick a track and tap a button!", 5000);
      },
      tap() { if (mood === 'work') bub.textContent = fbub.textContent = pick(L.busy); else set('start', pick(L.tap), 2500); },
      isOn: () => on,
      setOn(v) { on = !!v; lsSet('ppvMascot', on ? '1' : '0'); row.style.display = on ? 'flex' : 'none'; if (!on) fl.style.display = 'none'; else set('greet', 'Hi again!', 3000); },
      ball: pb
    };
  }

  function ui() {
    const css = document.createElement('style');
    css.textContent = '#ppv-panel{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:99998;width:min(320px,calc(100vw - 24px));max-height:70vh;overflow:auto;padding:12px;border-radius:12px;background:#1b1c20;color:#eee;font:13px system-ui,sans-serif;display:none;box-shadow:0 6px 24px #0008}#ppv-panel button{width:100%;margin-top:8px;padding:9px;border-radius:8px;border:0;background:#7c3aed;color:#fff;font:600 13px system-ui}#ppv-panel button:disabled{opacity:.5}#ppv-panel button.ppv-x{width:auto;margin:0;padding:0 8px;background:transparent;font-size:22px;line-height:1}#ppv-panel button.ppv-sec{background:transparent;border:1px solid #555;font-weight:500;font-size:12px;padding:6px}#ppv-panel select{width:100%;margin-top:6px;padding:7px;border-radius:8px;background:#2a2b31;color:#eee;border:1px solid #444}#ppv-panel label.ppv-c{display:inline-block;margin:6px 10px 0 0}#ppv-bar{height:6px;background:#333;border-radius:3px;margin-top:8px}#ppv-bar i{display:block;height:100%;width:0;background:#7c3aed;border-radius:3px}';
    document.head.appendChild(css);
    // The Stems pill lives in index.html as a normal quick-bar item (data-item-wrapper="stems"), so the
    // menu / quick bar system owns where it sits. Only build one ourselves if the page doesn't have it.
    let b = document.getElementById('ppv-btn');
    if (!b) {
      b = document.createElement('button'); b.id = 'ppv-btn'; b.type = 'button'; b.className = 'pill-btn'; b.title = 'Split into stems'; b.setAttribute('aria-label', 'Stem separator'); b.setAttribute('data-item-wrapper', 'stems');
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg><span>Stems</span>';
    }
    const p = document.createElement('div'); p.id = 'ppv-panel';
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b>Stem separator</b><button id="ppv-x" class="ppv-x" type="button" aria-label="Close">&times;</button></div><select id="ppv-model">' + Object.entries(MODELS).map(([k, m]) => '<option value="' + k + '">' + m.label + '</option>').join('') + '</select>' +
      '<div style="margin-top:8px">Optimization</div><select id="ppv-lvl"><option value="0">Off</option><option value="1">Light (big savings)</option><option value="2">Medium (+ lean runtime)</option><option value="3">Max (+ every small saving)</option></select><div id="ppv-lvi" style="opacity:.6;font-size:11px;margin-top:4px"></div>' +
      '<div id="ppv-stems"></div>' +
      '<div style="margin-top:8px">Mute vocal gaps</div><select id="ppv-gate"><option value="0">Off</option><option value="1">Gentle</option><option value="2">Normal</option><option value="3">Strong</option></select><div style="opacity:.6;font-size:11px;margin-top:4px">Silences leftover noise between sung lines. Vocals stem only.</div>' +
      '<div id="ppv-spl" style="margin-top:8px">Strength: <span id="ppv-sv">1</span><input id="ppv-sl" type="range" min="1" max="4" step="0.5" value="1" style="width:100%"><div style="opacity:.6;font-size:11px">Higher = less bleed, more watery artifacts</div><div style="margin-top:8px">Quality</div><select id="ppv-q"><option value="0">Standard</option><option value="1">Better (smooth seams, ~1.3x time)</option><option value="2">Best (+ averaged 2nd pass, ~2.7x time)</option></select></div>' +
      '<label id="ppv-gpu" class="ppv-c" style="display:none;margin-top:8px"><input type="checkbox" id="ppv-gpuc"> Use GPU (faster, experimental)</label>' +
      '<details><summary>Where split tracks go</summary><div class="ppv-note">Split tracks never count as new library tracks. They are all kept together under \u201cSplit tracks\u201d in the library\u2019s view selector.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-mkpl"> Also make a playlist for each split song</label>' +
      '<label id="ppv-tabl" class="ppv-c" style="display:block"><input type="checkbox" id="ppv-pltab"> Show those playlists in the Playlists tab</label>' +
      '<div class="ppv-note">Off = they only appear in the library\u2019s playlist selector.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-sect"> Give each split song its own section</label>' +
      '<div class="ppv-note">In \u201cSplit tracks\u201d, each song gets a collapsible section with all its stems.</div></details>' +
      '<div id="ppv-st" style="margin-top:8px;opacity:.8">Ready</div><div id="ppv-bar"><i></i></div><button id="ppv-go">Split current track</button><button id="ppv-del" class="ppv-sec">Free up space (delete this model)</button>';
    document.body.appendChild(p);
    const mas = mascot(p);
    mas.ball.onclick = () => mas.tap();
    document.addEventListener('click', e => { const bt = e.target.closest && e.target.closest('button'); if (bt && !bt.disabled && ['ppv-go', 'ppv-tag', 'ppv-all', 'ppv-wgo', 'ppv-simgo', 'ppv-mk', 'ppv-mkq', 'ppv-eqall'].includes(bt.id)) mas.start(); }, true);
    p.insertAdjacentHTML('beforeend', '<label class="ppv-c" style="margin-top:10px"><input type="checkbox" id="ppv-mas"> Show Bloop, the mascot</label>');
    const mc = p.querySelector('#ppv-mas'); mc.checked = mas.isOn(); mc.onchange = () => mas.setOn(mc.checked);
    p.insertAdjacentHTML('beforeend', '<label class="ppv-c" style="display:block;margin-top:8px"><input type="checkbox" id="ppv-chat-on"> Bloop assistant (does things in the app, no AI download)</label>' +
      '<div class="ppv-note">Adds a Bloop button. He can play music by mood, make mood and smart playlists, tag, split, get lyrics and control the player (volume, seek, speed, EQ, repeat\u2026). That all runs from the tagger and fixed rules, so it needs no chat AI.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-brain-on"> Chat brain: talk about anything with a tiny AI (optional, ~150 MB download)</label>' +
      '<div class="ppv-note">Off: Bloop only does tasks and answers app questions. On: he can also chat. It is taken out of memory whenever he does a task. It is a tiny model: it can be wrong, and it is not a counselor.</div>' +
      '<label class="ppv-c" style="display:block">Bloop\'s memory: <b id="ppv-mem-val"></b><input type="range" id="ppv-mem" min="0" max="8" step="1" style="width:100%;display:block"></label>' +
      '<div class="ppv-note">How many of your recent messages and his replies he remembers while chatting. 0 means he forgets each message right away. Higher is more context, but slower and uses more RAM. Tasks and commands never need memory.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-agent-on"> Let Bloop do things when I ask (play, playlists, tagging, volume\u2026)</label>' +
      '<label id="ppv-chatgpul" class="ppv-c" style="display:none"><input type="checkbox" id="ppv-chatgpu"> Use GPU (experimental, ~270 MB download)</label>' +
      '<button id="ppv-chatfree" class="ppv-sec" type="button">Free up chat download</button>');
    { const co = p.querySelector('#ppv-chat-on'), cg = p.querySelector('#ppv-chatgpu'), cl = p.querySelector('#ppv-chatgpul');
      co.checked = mas.chat.isOn(); co.onchange = () => mas.chat.setOn(co.checked);
      const cbr = p.querySelector('#ppv-brain-on'); cbr.checked = mas.chat.brainOn(); cbr.onchange = () => mas.chat.setBrain(cbr.checked);
      const ms = p.querySelector('#ppv-mem'), mv = p.querySelector('#ppv-mem-val'), memTxt = n => n === 0 ? 'none' : n + (n === 1 ? ' exchange' : ' exchanges');
      ms.value = mas.chat.memory.get(); mv.textContent = memTxt(+ms.value);
      ms.oninput = () => { const n = mas.chat.memory.set(ms.value); mv.textContent = memTxt(n); };
      const ag = p.querySelector('#ppv-agent-on'); try { ag.checked = localStorage.getItem('ppvAgent') !== '0'; } catch (e) { ag.checked = true; }
      ag.onchange = () => { try { localStorage.setItem('ppvAgent', ag.checked ? '1' : '0'); } catch (e) {} };
      if (navigator.gpu) cl.style.display = 'block'; try { cg.checked = localStorage.getItem('ppvChatGpu') === '1'; } catch (e) {}
      cg.onchange = () => { try { localStorage.setItem('ppvChatGpu', cg.checked ? '1' : '0'); } catch (e) {} };
      p.querySelector('#ppv-chatfree').onclick = async () => { try { await mas.chat.free(); status('Chat download removed.'); } catch (e) { status('Error: ' + e.message); } }; }
    // Keep the pill attached: if it's ever detached (or was never in the page), put it back in the quick bar
    // when the user has it enabled there, otherwise in its menu slot. Never moves it while it's attached.
    const place = () => {
      if (b.isConnected) return true;
      const cb = document.querySelector('.qb-checkbox[data-qb="stems"]');
      const host = (cb && cb.checked && document.getElementById('extra-transport')) || document.querySelector('.menu-item-slot[data-slot="stems"]') || document.getElementById('extra-transport');
      if (!host) return false;
      host.appendChild(b); return true;
    };
    if (!place()) { let n = 0; const iv = setInterval(() => { if (place() || ++n > 40) clearInterval(iv); }, 250); }
    setInterval(place, 2000);
    const $ = s => p.querySelector(s), st = $('#ppv-st'), bar = $('#ppv-bar i'), go = $('#ppv-go'), sel = $('#ppv-model'), sl = $('#ppv-sl'), sv = $('#ppv-sv'), gpu = $('#ppv-gpuc'), lsel = $('#ppv-lvl'), lvi = $('#ppv-lvi'), qsel = $('#ppv-q'), gsel = $('#ppv-gate');
    const LV = () => LEVELS[+lsel.value] || null, showLv = () => lvi.textContent = LV() ? LV().info : 'No limits. Fastest, but can crash weak phones.';
    let holdUntil = 0;                                                // keep "Done"/"Error" visible instead of being wiped by "Ready" a split second later
    const status = t => { st.textContent = t; document.querySelectorAll('.ppv-stx').forEach(e => { e.textContent = t; }); if (/^(Done|Error)/.test(t)) holdUntil = Date.now() + 5000; mas.react(t); }, ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} };
    const savedModel = ls('ppvModel'); if (savedModel && MODELS[savedModel]) sel.value = savedModel;
    if (ls('ppvStrength')) { sl.value = ls('ppvStrength'); sv.textContent = sl.value; }
    lsel.value = ls('ppvLevel') || (ls('ppvLow') === '0' ? '0' : '2'); showLv(); gpu.checked = ls('ppvGpu') === '1'; if (navigator.gpu) $('#ppv-gpu').style.display = 'block';
    sl.oninput = () => { sv.textContent = sl.value; ls('ppvStrength', sl.value); };
    gpu.onchange = () => ls('ppvGpu', gpu.checked ? '1' : '0');
    const mkpl = $('#ppv-mkpl'), pltab = $('#ppv-pltab');
    const syncPl = () => { pltab.disabled = !mkpl.checked; $('#ppv-tabl').style.opacity = mkpl.checked ? 1 : .5; };
    mkpl.checked = ls('ppvMkPl') === '1'; pltab.checked = ls('ppvPlTab') === '1'; syncPl();
    mkpl.onchange = () => { ls('ppvMkPl', mkpl.checked ? '1' : '0'); syncPl(); };
    pltab.onchange = () => ls('ppvPlTab', pltab.checked ? '1' : '0');
    const sect = $('#ppv-sect'); sect.checked = ls('ppvSect') === '1';
    sect.onchange = () => { ls('ppvSect', sect.checked ? '1' : '0'); const A = window.__ppApi; A && A.setStemSections && A.setStemSections(sect.checked); };
    { const A = window.__ppApi; A && A.setStemSections && A.setStemSections(sect.checked); }
    gsel.value = ls('ppvGate') || '0'; gsel.onchange = () => ls('ppvGate', gsel.value);
    qsel.value = ls('ppvQuality') || '1'; qsel.onchange = () => ls('ppvQuality', qsel.value);
    lsel.onchange = () => { ls('ppvLevel', lsel.value); showLv(); refresh(); };
    const picked = () => [...p.querySelectorAll('#ppv-stems input:checked')].map(i => i.value);
    async function refresh() {
      const lo = !!LV();
      const id = sel.value, saved = (ls('ppvStems_' + id) || 'Vocals,Instrumental').split(',');
      $('#ppv-stems').innerHTML = stemNames(id).map(n => '<label class="ppv-c"><input type="checkbox" value="' + n + '"' + (saved.includes(n) ? ' checked' : '') + '> ' + n + '</label>').join('');
      $('#ppv-stems').querySelectorAll('input').forEach(i => i.onchange = () => ls('ppvStems_' + id, picked().join(',')));
      $('#ppv-spl').style.display = MODELS[id].kind === 'spleeter' ? 'block' : 'none';
      const noGpu = MODELS[id].kind === 'spleeter' || MODELS[id].kind === 'sp4'; $('#ppv-gpu').style.opacity = lo || noGpu ? .4 : 1; gpu.disabled = lo || noGpu;
      const have = await haveModel(id); $('#ppv-del').style.display = have ? 'block' : 'none';
      if (!go.disabled && Date.now() > holdUntil) status(have ? 'Ready' : 'Model not downloaded yet (one time).');
    }
    $('#ppv-x').onclick = () => { p.style.display = 'none'; };
    sel.onchange = () => { ls('ppvModel', sel.value); refresh(); };
    b.onclick = () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; if (p.style.display === 'block') { mas.opened(); document.getElementById('ppv-mfloat').style.display = 'none'; } refresh(); };
    $('#ppv-del').onclick = async () => { await deleteModel(sel.value); status('Deleted.'); refresh(); };
    async function splitTrack(t) {
      go.disabled = true; bar.style.width = '0'; let wl = null;
      try {
        if (LV() && LV().wake && navigator.wakeLock) { try { wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
        const id = sel.value, want = picked();
        if (!t) throw new Error('Play or select a track first.');
        if (!want.length) throw new Error('Tick at least one stem.');
        await downloadModel(id, status, !!(LV() && LV().blob));
        status('Decoding audio…');
        let pcm = await decode(t.url);
        const res = await run(id, pcm, want, { strength: +sl.value, gpu: gpu.checked && !LV(), lv: LV(), quality: +qsel.value, gate: +gsel.value }, status, f => { bar.style.width = (f * 100) + '%'; status('Separating… ' + Math.round(f * 100) + '%'); });
        pcm = null;
        const files = [];
        for (const n of want) {                                          // encode one at a time, free each stem after
          status('Encoding ' + n + '…'); await tick();
          const e = res[n].blob ? res[n] : encode(res[n]); delete res[n];
          files.push(new File([e.blob], t.title + ' (' + n + ').' + e.ext, { type: e.blob.type }));
        }
        addSplit(files, { srcId: t.dbId, srcTitle: t.title, makePlaylist: mkpl.checked, showInTab: mkpl.checked && pltab.checked });
        status('Done. Added ' + files.length + ' split track' + (files.length > 1 ? 's' : '') + ' to Split tracks' + (mkpl.checked ? ' + a playlist.' : '.'));
      } catch (e) { console.error(e); status('Error: ' + e.message); }
      wl && wl.release().catch(() => {});
      go.disabled = false; refresh();
    }
    go.onclick = () => { const A = window.__ppApi; return splitTrack(A && A.tracks()[A.currentIndex()]); };
    window.__ppSplitTrack = t => splitTrack(t);
    try { smartUI(p, { mas, status, LV, sel, sl, prog: f => { document.querySelectorAll('.ppv-bar-tag i').forEach(e => { e.style.width = (f * 100) + '%'; }); } }); } catch (e) { console.error(e); }
    refresh();
  }
  window.PPVocals = { separate, separateDemucs, fft, _N: N, tagTrack, transcribe, similarTo, loadTags, vibes };
  const boot = () => { try { ui(); } catch (e) { console.error(e); } };
  if (typeof document !== 'undefined' && document.body) boot();
  else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', boot);
})();
