/* Stem separator for the player. Models live on Hugging Face, app lives on GitHub.
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
    tg_hgenre: 'genre_discogs400-discogs-effnet-1.onnx'                 // optional, looked up in HF_BASE
  };
  const INST40 = ["accordion","acousticbassguitar","acousticguitar","bass","beat","bell","bongo","brass","cello","clarinet","classicalguitar","computer","doublebass","drummachine","drums","electricguitar","electricpiano","flute","guitar","harmonica","harp","horn","keyboard","oboe","orchestra","organ","pad","percussion","piano","pipeorgan","rhodes","sampler","saxophone","strings","synthesizer","trombone","trumpet","viola","violin","voice"], DISCOGS = ["Boogie Woogie (Blues)","Chicago Blues (Blues)","Country Blues (Blues)","Delta Blues (Blues)","Electric Blues (Blues)","Harmonica Blues (Blues)","Jump Blues (Blues)","Louisiana Blues (Blues)","Modern Electric Blues (Blues)","Piano Blues (Blues)","Rhythm & Blues (Blues)","Texas Blues (Blues)","Brass Band (Brass & Military)","Marches (Brass & Military)","Military (Brass & Military)","Educational (Children's)","Nursery Rhymes (Children's)","Story (Children's)","Baroque (Classical)","Choral (Classical)","Classical (Classical)","Contemporary (Classical)","Impressionist (Classical)","Medieval (Classical)","Modern (Classical)","Neo-Classical (Classical)","Neo-Romantic (Classical)","Opera (Classical)","Post-Modern (Classical)","Renaissance (Classical)","Romantic (Classical)","Abstract (Electronic)","Acid (Electronic)","Acid House (Electronic)","Acid Jazz (Electronic)","Ambient (Electronic)","Bassline (Electronic)","Beatdown (Electronic)","Berlin-School (Electronic)","Big Beat (Electronic)","Bleep (Electronic)","Breakbeat (Electronic)","Breakcore (Electronic)","Breaks (Electronic)","Broken Beat (Electronic)","Chillwave (Electronic)","Chiptune (Electronic)","Dance-pop (Electronic)","Dark Ambient (Electronic)","Darkwave (Electronic)","Deep House (Electronic)","Deep Techno (Electronic)","Disco (Electronic)","Disco Polo (Electronic)","Donk (Electronic)","Downtempo (Electronic)","Drone (Electronic)","Drum n Bass (Electronic)","Dub (Electronic)","Dub Techno (Electronic)","Dubstep (Electronic)","Dungeon Synth (Electronic)","EBM (Electronic)","Electro (Electronic)","Electro House (Electronic)","Electroclash (Electronic)","Euro House (Electronic)","Euro-Disco (Electronic)","Eurobeat (Electronic)","Eurodance (Electronic)","Experimental (Electronic)","Freestyle (Electronic)","Future Jazz (Electronic)","Gabber (Electronic)","Garage House (Electronic)","Ghetto (Electronic)","Ghetto House (Electronic)","Glitch (Electronic)","Goa Trance (Electronic)","Grime (Electronic)","Halftime (Electronic)","Hands Up (Electronic)","Happy Hardcore (Electronic)","Hard House (Electronic)","Hard Techno (Electronic)","Hard Trance (Electronic)","Hardcore (Electronic)","Hardstyle (Electronic)","Hi NRG (Electronic)","Hip Hop (Electronic)","Hip-House (Electronic)","House (Electronic)","IDM (Electronic)","Illbient (Electronic)","Industrial (Electronic)","Italo House (Electronic)","Italo-Disco (Electronic)","Italodance (Electronic)","Jazzdance (Electronic)","Juke (Electronic)","Jumpstyle (Electronic)","Jungle (Electronic)","Latin (Electronic)","Leftfield (Electronic)","Makina (Electronic)","Minimal (Electronic)","Minimal Techno (Electronic)","Modern Classical (Electronic)","Musique Concr\u00e8te (Electronic)","Neofolk (Electronic)","New Age (Electronic)","New Beat (Electronic)","New Wave (Electronic)","Noise (Electronic)","Nu-Disco (Electronic)","Power Electronics (Electronic)","Progressive Breaks (Electronic)","Progressive House (Electronic)","Progressive Trance (Electronic)","Psy-Trance (Electronic)","Rhythmic Noise (Electronic)","Schranz (Electronic)","Sound Collage (Electronic)","Speed Garage (Electronic)","Speedcore (Electronic)","Synth-pop (Electronic)","Synthwave (Electronic)","Tech House (Electronic)","Tech Trance (Electronic)","Techno (Electronic)","Trance (Electronic)","Tribal (Electronic)","Tribal House (Electronic)","Trip Hop (Electronic)","Tropical House (Electronic)","UK Garage (Electronic)","Vaporwave (Electronic)","African (Folk, World, & Country)","Bluegrass (Folk, World, & Country)","Cajun (Folk, World, & Country)","Canzone Napoletana (Folk, World, & Country)","Catalan Music (Folk, World, & Country)","Celtic (Folk, World, & Country)","Country (Folk, World, & Country)","Fado (Folk, World, & Country)","Flamenco (Folk, World, & Country)","Folk (Folk, World, & Country)","Gospel (Folk, World, & Country)","Highlife (Folk, World, & Country)","Hillbilly (Folk, World, & Country)","Hindustani (Folk, World, & Country)","Honky Tonk (Folk, World, & Country)","Indian Classical (Folk, World, & Country)","La\u00efk\u00f3 (Folk, World, & Country)","Nordic (Folk, World, & Country)","Pacific (Folk, World, & Country)","Polka (Folk, World, & Country)","Ra\u00ef (Folk, World, & Country)","Romani (Folk, World, & Country)","Soukous (Folk, World, & Country)","S\u00e9ga (Folk, World, & Country)","Volksmusik (Folk, World, & Country)","Zouk (Folk, World, & Country)","\u00c9ntekhno (Folk, World, & Country)","Afrobeat (Funk / Soul)","Boogie (Funk / Soul)","Contemporary R&B (Funk / Soul)","Disco (Funk / Soul)","Free Funk (Funk / Soul)","Funk (Funk / Soul)","Gospel (Funk / Soul)","Neo Soul (Funk / Soul)","New Jack Swing (Funk / Soul)","P.Funk (Funk / Soul)","Psychedelic (Funk / Soul)","Rhythm & Blues (Funk / Soul)","Soul (Funk / Soul)","Swingbeat (Funk / Soul)","UK Street Soul (Funk / Soul)","Bass Music (Hip Hop)","Boom Bap (Hip Hop)","Bounce (Hip Hop)","Britcore (Hip Hop)","Cloud Rap (Hip Hop)","Conscious (Hip Hop)","Crunk (Hip Hop)","Cut-up/DJ (Hip Hop)","DJ Battle Tool (Hip Hop)","Electro (Hip Hop)","G-Funk (Hip Hop)","Gangsta (Hip Hop)","Grime (Hip Hop)","Hardcore Hip-Hop (Hip Hop)","Horrorcore (Hip Hop)","Instrumental (Hip Hop)","Jazzy Hip-Hop (Hip Hop)","Miami Bass (Hip Hop)","Pop Rap (Hip Hop)","Ragga HipHop (Hip Hop)","RnB/Swing (Hip Hop)","Screw (Hip Hop)","Thug Rap (Hip Hop)","Trap (Hip Hop)","Trip Hop (Hip Hop)","Turntablism (Hip Hop)","Afro-Cuban Jazz (Jazz)","Afrobeat (Jazz)","Avant-garde Jazz (Jazz)","Big Band (Jazz)","Bop (Jazz)","Bossa Nova (Jazz)","Contemporary Jazz (Jazz)","Cool Jazz (Jazz)","Dixieland (Jazz)","Easy Listening (Jazz)","Free Improvisation (Jazz)","Free Jazz (Jazz)","Fusion (Jazz)","Gypsy Jazz (Jazz)","Hard Bop (Jazz)","Jazz-Funk (Jazz)","Jazz-Rock (Jazz)","Latin Jazz (Jazz)","Modal (Jazz)","Post Bop (Jazz)","Ragtime (Jazz)","Smooth Jazz (Jazz)","Soul-Jazz (Jazz)","Space-Age (Jazz)","Swing (Jazz)","Afro-Cuban (Latin)","Bai\u00e3o (Latin)","Batucada (Latin)","Beguine (Latin)","Bolero (Latin)","Boogaloo (Latin)","Bossanova (Latin)","Cha-Cha (Latin)","Charanga (Latin)","Compas (Latin)","Cubano (Latin)","Cumbia (Latin)","Descarga (Latin)","Forr\u00f3 (Latin)","Guaguanc\u00f3 (Latin)","Guajira (Latin)","Guaracha (Latin)","MPB (Latin)","Mambo (Latin)","Mariachi (Latin)","Merengue (Latin)","Norte\u00f1o (Latin)","Nueva Cancion (Latin)","Pachanga (Latin)","Porro (Latin)","Ranchera (Latin)","Reggaeton (Latin)","Rumba (Latin)","Salsa (Latin)","Samba (Latin)","Son (Latin)","Son Montuno (Latin)","Tango (Latin)","Tejano (Latin)","Vallenato (Latin)","Audiobook (Non-Music)","Comedy (Non-Music)","Dialogue (Non-Music)","Education (Non-Music)","Field Recording (Non-Music)","Interview (Non-Music)","Monolog (Non-Music)","Poetry (Non-Music)","Political (Non-Music)","Promotional (Non-Music)","Radioplay (Non-Music)","Religious (Non-Music)","Spoken Word (Non-Music)","Ballad (Pop)","Bollywood (Pop)","Bubblegum (Pop)","Chanson (Pop)","City Pop (Pop)","Europop (Pop)","Indie Pop (Pop)","J-pop (Pop)","K-pop (Pop)","Kay\u014dkyoku (Pop)","Light Music (Pop)","Music Hall (Pop)","Novelty (Pop)","Parody (Pop)","Schlager (Pop)","Vocal (Pop)","Calypso (Reggae)","Dancehall (Reggae)","Dub (Reggae)","Lovers Rock (Reggae)","Ragga (Reggae)","Reggae (Reggae)","Reggae-Pop (Reggae)","Rocksteady (Reggae)","Roots Reggae (Reggae)","Ska (Reggae)","Soca (Reggae)","AOR (Rock)","Acid Rock (Rock)","Acoustic (Rock)","Alternative Rock (Rock)","Arena Rock (Rock)","Art Rock (Rock)","Atmospheric Black Metal (Rock)","Avantgarde (Rock)","Beat (Rock)","Black Metal (Rock)","Blues Rock (Rock)","Brit Pop (Rock)","Classic Rock (Rock)","Coldwave (Rock)","Country Rock (Rock)","Crust (Rock)","Death Metal (Rock)","Deathcore (Rock)","Deathrock (Rock)","Depressive Black Metal (Rock)","Doo Wop (Rock)","Doom Metal (Rock)","Dream Pop (Rock)","Emo (Rock)","Ethereal (Rock)","Experimental (Rock)","Folk Metal (Rock)","Folk Rock (Rock)","Funeral Doom Metal (Rock)","Funk Metal (Rock)","Garage Rock (Rock)","Glam (Rock)","Goregrind (Rock)","Goth Rock (Rock)","Gothic Metal (Rock)","Grindcore (Rock)","Grunge (Rock)","Hard Rock (Rock)","Hardcore (Rock)","Heavy Metal (Rock)","Indie Rock (Rock)","Industrial (Rock)","Krautrock (Rock)","Lo-Fi (Rock)","Lounge (Rock)","Math Rock (Rock)","Melodic Death Metal (Rock)","Melodic Hardcore (Rock)","Metalcore (Rock)","Mod (Rock)","Neofolk (Rock)","New Wave (Rock)","No Wave (Rock)","Noise (Rock)","Noisecore (Rock)","Nu Metal (Rock)","Oi (Rock)","Parody (Rock)","Pop Punk (Rock)","Pop Rock (Rock)","Pornogrind (Rock)","Post Rock (Rock)","Post-Hardcore (Rock)","Post-Metal (Rock)","Post-Punk (Rock)","Power Metal (Rock)","Power Pop (Rock)","Power Violence (Rock)","Prog Rock (Rock)","Progressive Metal (Rock)","Psychedelic Rock (Rock)","Psychobilly (Rock)","Pub Rock (Rock)","Punk (Rock)","Rock & Roll (Rock)","Rockabilly (Rock)","Shoegaze (Rock)","Ska (Rock)","Sludge Metal (Rock)","Soft Rock (Rock)","Southern Rock (Rock)","Space Rock (Rock)","Speed Metal (Rock)","Stoner Rock (Rock)","Surf (Rock)","Symphonic Rock (Rock)","Technical Death Metal (Rock)","Thrash (Rock)","Twist (Rock)","Viking Metal (Rock)","Y\u00e9-Y\u00e9 (Rock)","Musical (Stage & Screen)","Score (Stage & Screen)","Soundtrack (Stage & Screen)","Theme (Stage & Screen)"], AUDIOSET = ["Speech","Male speech, man speaking","Female speech, woman speaking","Child speech, kid speaking","Conversation","Narration, monologue","Babbling","Speech synthesizer","Shout","Bellow","Whoop","Yell","Battle cry","Children shouting","Screaming","Whispering","Laughter","Baby laughter","Giggle","Snicker","Belly laugh","Chuckle, chortle","Crying, sobbing","Baby cry, infant cry","Whimper","Wail, moan","Sigh","Singing","Choir","Yodeling","Chant","Mantra","Male singing","Female singing","Child singing","Synthetic singing","Rapping","Humming","Groan","Grunt","Whistling","Breathing","Wheeze","Snoring","Gasp","Pant","Snort","Cough","Throat clearing","Sneeze","Sniff","Run","Shuffle","Walk, footsteps","Chewing, mastication","Biting","Gargling","Stomach rumble","Burping, eructation","Hiccup","Fart","Hands","Finger snapping","Clapping","Heart sounds, heartbeat","Heart murmur","Cheering","Applause","Chatter","Crowd","Hubbub, speech noise, speech babble","Children playing","Animal","Domestic animals, pets","Dog","Bark","Yip","Howl","Bow-wow","Growling","Whimper (dog)","Cat","Purr","Meow","Hiss","Caterwaul","Livestock, farm animals, working animals","Horse","Clip-clop","Neigh, whinny","Cattle, bovinae","Moo","Cowbell","Pig","Oink","Goat","Bleat","Sheep","Fowl","Chicken, rooster","Cluck","Crowing, cock-a-doodle-doo","Turkey","Gobble","Duck","Quack","Goose","Honk","Wild animals","Roaring cats (lions, tigers)","Roar","Bird","Bird vocalization, bird call, bird song","Chirp, tweet","Squawk","Pigeon, dove","Coo","Crow","Caw","Owl","Hoot","Bird flight, flapping wings","Canidae, dogs, wolves","Rodents, rats, mice","Mouse","Patter","Insect","Cricket","Mosquito","Fly, housefly","Buzz","Bee, wasp, etc.","Frog","Croak","Snake","Rattle","Whale vocalization","Music","Musical instrument","Plucked string instrument","Guitar","Electric guitar","Bass guitar","Acoustic guitar","Steel guitar, slide guitar","Tapping (guitar technique)","Strum","Banjo","Sitar","Mandolin","Zither","Ukulele","Keyboard (musical)","Piano","Electric piano","Organ","Electronic organ","Hammond organ","Synthesizer","Sampler","Harpsichord","Percussion","Drum kit","Drum machine","Drum","Snare drum","Rimshot","Drum roll","Bass drum","Timpani","Tabla","Cymbal","Hi-hat","Wood block","Tambourine","Rattle (instrument)","Maraca","Gong","Tubular bells","Mallet percussion","Marimba, xylophone","Glockenspiel","Vibraphone","Steelpan","Orchestra","Brass instrument","French horn","Trumpet","Trombone","Bowed string instrument","String section","Violin, fiddle","Pizzicato","Cello","Double bass","Wind instrument, woodwind instrument","Flute","Saxophone","Clarinet","Harp","Bell","Church bell","Jingle bell","Bicycle bell","Tuning fork","Chime","Wind chime","Change ringing (campanology)","Harmonica","Accordion","Bagpipes","Didgeridoo","Shofar","Theremin","Singing bowl","Scratching (performance technique)","Pop music","Hip hop music","Beatboxing","Rock music","Heavy metal","Punk rock","Grunge","Progressive rock","Rock and roll","Psychedelic rock","Rhythm and blues","Soul music","Reggae","Country","Swing music","Bluegrass","Funk","Folk music","Middle Eastern music","Jazz","Disco","Classical music","Opera","Electronic music","House music","Techno","Dubstep","Drum and bass","Electronica","Electronic dance music","Ambient music","Trance music","Music of Latin America","Salsa music","Flamenco","Blues","Music for children","New-age music","Vocal music","A capella","Music of Africa","Afrobeat","Christian music","Gospel music","Music of Asia","Carnatic music","Music of Bollywood","Ska","Traditional music","Independent music","Song","Background music","Theme music","Jingle (music)","Soundtrack music","Lullaby","Video game music","Christmas music","Dance music","Wedding music","Happy music","Funny music","Sad music","Tender music","Exciting music","Angry music","Scary music","Wind","Rustling leaves","Wind noise (microphone)","Thunderstorm","Thunder","Water","Rain","Raindrop","Rain on surface","Stream","Waterfall","Ocean","Waves, surf","Steam","Gurgling","Fire","Crackle","Vehicle","Boat, Water vehicle","Sailboat, sailing ship","Rowboat, canoe, kayak","Motorboat, speedboat","Ship","Motor vehicle (road)","Car","Vehicle horn, car horn, honking","Toot","Car alarm","Power windows, electric windows","Skidding","Tire squeal","Car passing by","Race car, auto racing","Truck","Air brake","Air horn, truck horn","Reversing beeps","Ice cream truck, ice cream van","Bus","Emergency vehicle","Police car (siren)","Ambulance (siren)","Fire engine, fire truck (siren)","Motorcycle","Traffic noise, roadway noise","Rail transport","Train","Train whistle","Train horn","Railroad car, train wagon","Train wheels squealing","Subway, metro, underground","Aircraft","Aircraft engine","Jet engine","Propeller, airscrew","Helicopter","Fixed-wing aircraft, airplane","Bicycle","Skateboard","Engine","Light engine (high frequency)","Dental drill, dentist's drill","Lawn mower","Chainsaw","Medium engine (mid frequency)","Heavy engine (low frequency)","Engine knocking","Engine starting","Idling","Accelerating, revving, vroom","Door","Doorbell","Ding-dong","Sliding door","Slam","Knock","Tap","Squeak","Cupboard open or close","Drawer open or close","Dishes, pots, and pans","Cutlery, silverware","Chopping (food)","Frying (food)","Microwave oven","Blender","Water tap, faucet","Sink (filling or washing)","Bathtub (filling or washing)","Hair dryer","Toilet flush","Toothbrush","Electric toothbrush","Vacuum cleaner","Zipper (clothing)","Keys jangling","Coin (dropping)","Scissors","Electric shaver, electric razor","Shuffling cards","Typing","Typewriter","Computer keyboard","Writing","Alarm","Telephone","Telephone bell ringing","Ringtone","Telephone dialing, DTMF","Dial tone","Busy signal","Alarm clock","Siren","Civil defense siren","Buzzer","Smoke detector, smoke alarm","Fire alarm","Foghorn","Whistle","Steam whistle","Mechanisms","Ratchet, pawl","Clock","Tick","Tick-tock","Gears","Pulleys","Sewing machine","Mechanical fan","Air conditioning","Cash register","Printer","Camera","Single-lens reflex camera","Tools","Hammer","Jackhammer","Sawing","Filing (rasp)","Sanding","Power tool","Drill","Explosion","Gunshot, gunfire","Machine gun","Fusillade","Artillery fire","Cap gun","Fireworks","Firecracker","Burst, pop","Eruption","Boom","Wood","Chop","Splinter","Crack","Glass","Chink, clink","Shatter","Liquid","Splash, splatter","Slosh","Squish","Drip","Pour","Trickle, dribble","Gush","Fill (with liquid)","Spray","Pump (liquid)","Stir","Boiling","Sonar","Arrow","Whoosh, swoosh, swish","Thump, thud","Thunk","Electronic tuner","Effects unit","Chorus effect","Basketball bounce","Bang","Slap, smack","Whack, thwack","Smash, crash","Breaking","Bouncing","Whip","Flap","Scratch","Scrape","Rub","Roll","Crushing","Crumpling, crinkling","Tearing","Beep, bleep","Ping","Ding","Clang","Squeal","Creak","Rustle","Whir","Clatter","Sizzle","Clicking","Clickety-clack","Rumble","Plop","Jingle, tinkle","Hum","Zing","Boing","Crunch","Silence","Sine wave","Harmonic","Chirp tone","Sound effect","Pulse","Inside, small room","Inside, large room or hall","Inside, public space","Outside, urban or manmade","Outside, rural or natural","Reverberation","Echo","Noise","Environmental noise","Static","Mains hum","Distortion","Sidetone","Cacophony","White noise","Pink noise","Throbbing","Vibration","Television","Radio","Field recording"];
  const AS_GENRE = [216, 265], AS_MOOD = [276, 282], AS_NOT_INST = new Set([145, 146, 166, 167, 192]);
  const asInst = i => (i >= 140 && i <= 199 && !AS_NOT_INST.has(i)) || [208, 209, 210, 211, 213].includes(i);

  async function ensureTagFile(key, status, low) {
    if (await idbGet(key)) return;
    const f = TAG_FILES[key];
    await fetchPart(key, f, (g, t) => status('Downloading ' + f.split('/').pop() + ' ' + (t ? Math.round(g / t * 100) + '%' : (g / 1048576 | 0) + ' MB')), low);
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
  async function tagTrack(url, status, lv) {
    await loadOrt();
    const low = !!(lv && lv.blob), r = { errors: [] };
    for (const k of ['tg_effnet', 'tg_hinst', 'tg_hvoice', 'tg_mel', 'tg_mn10']) await ensureTagFile(k, status, low);
    let hasGenre = true; try { await ensureTagFile('tg_hgenre', status, low); } catch (e) { hasGenre = false; }
    // 1) Discogs-EffNet
    try {
      status('Listening (1 of 2)…');
      let x = await decodeMono(url, 16000);
      const SEC = 140 * 16000; if (x.length > SEC) { const o = (x.length - SEC) >> 1; x = x.slice(o, o + SEC); }   // the middle ~2 minutes is plenty
      status('Analysing sound (1 of 2)…'); await tick();
      const mel = await effnetMel(x, parseNpy(await getPart('tg_mel'))); x = null;
      const nF = mel.length / 96, nP = nF >= 128 ? Math.floor((nF - 128) / 62) + 1 : 1, take = Math.min(nP, 128);
      const idx = Array.from({ length: take }, (_, i) => Math.floor(i * nP / take));
      const ss = [];
      try {
        const eff = await makeSession('tg_effnet', false, lv); ss.push(eff);
        const hI = await makeSession('tg_hinst', false, lv); ss.push(hI);
        const hV = await makeSession('tg_hvoice', false, lv); ss.push(hV);
        const hG = hasGenre ? await makeSession('tg_hgenre', false, lv) : null; if (hG) ss.push(hG);
        const inst = new Float32Array(40), g400 = new Float32Array(400); let voice = 0, rows = 0, gotG = false;
        for (let b = 0; b < take; b += 64) {
          const cnt = Math.min(64, take - b), X = new Float32Array(64 * 128 * 96);      // the graph wants exactly 64 patches
          for (let i = 0; i < cnt; i++) { const s0 = idx[b + i] * 62 * 96; X.set(mel.subarray(s0, Math.min(mel.length, s0 + 128 * 96)), i * 128 * 96); }
          status('Listening… ' + Math.min(b + 64, take) + ' of ' + take + ' patches'); await tick();
          const res = await eff.run({ [eff.inputNames[0]]: new ort.Tensor('float32', X, [64, 128, 96]) });
          let emb = null, p400 = null;
          for (const n of eff.outputNames) { const o = res[n], d = o.dims[o.dims.length - 1]; if (d === 1280) emb = o.data; else if (d === 400) p400 = o.data; }
          if (!emb) throw new Error('embedding output not found');
          const E = new ort.Tensor('float32', emb, [64, 1280]);
          const yi = (await hI.run({ [hI.inputNames[0]]: E }))[hI.outputNames[0]].data, yv = (await hV.run({ [hV.inputNames[0]]: E }))[hV.outputNames[0]].data;
          const yg = hG ? (await hG.run({ [hG.inputNames[0]]: E }))[hG.outputNames[0]].data : p400;
          for (let i = 0; i < cnt; i++) {
            for (let c = 0; c < 40; c++) inst[c] = Math.max(inst[c], yi[i * 40 + c]);
            voice += yv[i * 2 + 1];                                    // classes: instrumental, voice
            if (yg) { gotG = true; for (let c = 0; c < 400; c++) g400[c] += yg[i * 400 + c]; }
          }
          rows += cnt; await tick();
        }
        r.voice = voice / rows;
        r.inst = INST40.map((n, i) => [n, inst[i]]);
        if (gotG) {
          let lo = Infinity, hi = -Infinity; for (let c = 0; c < 400; c++) { g400[c] /= rows; lo = Math.min(lo, g400[c]); hi = Math.max(hi, g400[c]); }
          if (lo < 0 || hi > 1) for (let c = 0; c < 400; c++) g400[c] = 1 / (1 + Math.exp(-g400[c]));       // raw scores -> probabilities
          r.style = DISCOGS.map((n, i) => [n, g400[i]]);
        } else r.errors.push('Styles skipped: upload genre_discogs400-discogs-effnet-1.onnx to your repo.');
      } finally { ss.forEach(s => s.release && s.release()); }
    } catch (e) { console.error(e); r.errors.push('EffNet: ' + e.message); }
    // 2) AudioSet tagger
    try {
      status('Listening (2 of 2)…');
      let x = await decodeMono(url, 32000);
      const W = 160000, nW = Math.max(1, Math.min(6, Math.floor(x.length / W))), probs = new Float32Array(527);
      const sess = await makeSession('tg_mn10', false, lv);
      try {
        for (let w = 0; w < nW; w++) {
          const wav = new Float32Array(W), st = x.length > W ? Math.floor((x.length - W) * (w + 0.5) / nW) : 0;
          wav.set(x.subarray(st, st + W));
          const y = (await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', wav, [1, W]) }))[sess.outputNames[0]].data;
          for (let c = 0; c < 527; c++) probs[c] += y[c] / nW;
          status('Listening (2 of 2)… ' + (w + 1) + ' of ' + nW); await tick();
        }
      } finally { sess.release && sess.release(); }
      x = null;
      const pick = (lo, hi) => { const o = []; for (let i = lo; i <= hi; i++) o.push([AUDIOSET[i], probs[i]]); return o; };
      r.genre = pick(AS_GENRE[0], AS_GENRE[1]); r.mood = pick(AS_MOOD[0], AS_MOOD[1]); r.music = probs[137];
      r.inst2 = []; for (let i = 140; i <= 213; i++) if (asInst(i)) r.inst2.push([AUDIOSET[i], probs[i]]);
    } catch (e) { console.error(e); r.errors.push('AudioSet: ' + e.message); }
    return r;
  }
  function fmtTags(r) {
    const pct = p => Math.round(p * 100) + '%', top = (a, n, min) => a.filter(v => v[1] >= min).sort((u, v) => v[1] - u[1]).slice(0, n).map(v => v[0] + ' ' + pct(v[1])).join(', ') || 'none';
    const L = [];
    if (r.music != null && r.music < 0.3) L.push('Mostly not music (' + pct(r.music) + ')');
    if (r.voice != null) L.push(r.voice >= 0.5 ? 'Vocals: yes (' + pct(r.voice) + ')' : 'Instrumental (' + pct(1 - r.voice) + ')');
    if (r.style) L.push('Style: ' + top(r.style, 4, 0.05));
    if (r.genre) L.push('Genre: ' + top(r.genre, 3, 0.08));
    if (r.mood) L.push('Mood: ' + top(r.mood, 2, 0.08));
    if (r.inst) L.push('Instruments: ' + top(r.inst, 6, 0.4));
    if (r.inst2) L.push('Also heard: ' + top(r.inst2, 6, 0.2));
    (r.errors || []).forEach(e => L.push('! ' + e));
    return L.join('\n') || 'Nothing found.';
  }

  // ---------- UI ----------
  function ui() {
    const css = document.createElement('style');
    css.textContent = '#ppv-panel{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:99998;width:min(320px,calc(100vw - 24px));max-height:70vh;overflow:auto;padding:12px;border-radius:12px;background:#1b1c20;color:#eee;font:13px system-ui,sans-serif;display:none;box-shadow:0 6px 24px #0008}#ppv-panel button{width:100%;margin-top:8px;padding:9px;border-radius:8px;border:0;background:#7c3aed;color:#fff;font:600 13px system-ui}#ppv-panel button:disabled{opacity:.5}#ppv-panel button.ppv-x{width:auto;margin:0;padding:0 8px;background:transparent;font-size:22px;line-height:1}#ppv-panel button.ppv-sec{background:transparent;border:1px solid #555;font-weight:500;font-size:12px;padding:6px}#ppv-panel select{width:100%;margin-top:6px;padding:7px;border-radius:8px;background:#2a2b31;color:#eee;border:1px solid #444}#ppv-panel label.ppv-c{display:inline-block;margin:6px 10px 0 0}#ppv-bar{height:6px;background:#333;border-radius:3px;margin-top:8px}#ppv-bar i{display:block;height:100%;width:0;background:#7c3aed;border-radius:3px}';
    document.head.appendChild(css);
    const b = document.createElement('button'); b.id = 'ppv-btn'; b.type = 'button'; b.className = 'pill-btn'; b.title = 'Split into stems'; b.setAttribute('aria-label', 'Stem separator');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg><span>Stems</span>';
    const p = document.createElement('div'); p.id = 'ppv-panel';
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b>Stem separator</b><button id="ppv-x" class="ppv-x" type="button" aria-label="Close">&times;</button></div><select id="ppv-model">' + Object.entries(MODELS).map(([k, m]) => '<option value="' + k + '">' + m.label + '</option>').join('') + '</select>' +
      '<div style="margin-top:8px">Optimization</div><select id="ppv-lvl"><option value="0">Off</option><option value="1">Light (big savings)</option><option value="2">Medium (+ lean runtime)</option><option value="3">Max (+ every small saving)</option></select><div id="ppv-lvi" style="opacity:.6;font-size:11px;margin-top:4px"></div>' +
      '<div id="ppv-stems"></div>' +
      '<div style="margin-top:8px">Mute vocal gaps</div><select id="ppv-gate"><option value="0">Off</option><option value="1">Gentle</option><option value="2">Normal</option><option value="3">Strong</option></select><div style="opacity:.6;font-size:11px;margin-top:4px">Silences leftover noise between sung lines. Vocals stem only.</div>' +
      '<div id="ppv-spl" style="margin-top:8px">Strength: <span id="ppv-sv">1</span><input id="ppv-sl" type="range" min="1" max="4" step="0.5" value="1" style="width:100%"><div style="opacity:.6;font-size:11px">Higher = less bleed, more watery artifacts</div><div style="margin-top:8px">Quality</div><select id="ppv-q"><option value="0">Standard</option><option value="1">Better (smooth seams, ~1.3x time)</option><option value="2">Best (+ averaged 2nd pass, ~2.7x time)</option></select></div>' +
      '<label id="ppv-gpu" class="ppv-c" style="display:none;margin-top:8px"><input type="checkbox" id="ppv-gpuc"> Use GPU (faster, experimental)</label>' +
      '<div id="ppv-st" style="margin-top:8px;opacity:.8">Ready</div><div id="ppv-bar"><i></i></div><button id="ppv-go">Split current track</button><button id="ppv-tag" class="ppv-sec">Tag current track</button><div id="ppv-tags" style="margin-top:6px;font-size:12px;white-space:pre-wrap"></div><button id="ppv-del" class="ppv-sec">Free up space (delete this model)</button>';
    document.body.appendChild(p);
    const place = () => { const host = document.getElementById('extra-transport'); if (!host) return false; const cut = document.getElementById('cutter-btn'); if (cut && cut.parentNode === host) cut.after(b); else host.appendChild(b); return true; };
    if (!place()) { let n = 0; const iv = setInterval(() => { if (place() || ++n > 40) clearInterval(iv); }, 250); }
    setInterval(() => { if (!b.isConnected) place(); }, 2000);
    const $ = s => p.querySelector(s), st = $('#ppv-st'), bar = $('#ppv-bar i'), go = $('#ppv-go'), sel = $('#ppv-model'), sl = $('#ppv-sl'), sv = $('#ppv-sv'), gpu = $('#ppv-gpuc'), lsel = $('#ppv-lvl'), lvi = $('#ppv-lvi'), qsel = $('#ppv-q'), gsel = $('#ppv-gate');
    const LV = () => LEVELS[+lsel.value] || null, showLv = () => lvi.textContent = LV() ? LV().info : 'No limits. Fastest, but can crash weak phones.';
    const status = t => st.textContent = t, ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} };
    const savedModel = ls('ppvModel'); if (savedModel && MODELS[savedModel]) sel.value = savedModel;
    if (ls('ppvStrength')) { sl.value = ls('ppvStrength'); sv.textContent = sl.value; }
    lsel.value = ls('ppvLevel') || (ls('ppvLow') === '0' ? '0' : '2'); showLv(); gpu.checked = ls('ppvGpu') === '1'; if (navigator.gpu) $('#ppv-gpu').style.display = 'block';
    sl.oninput = () => { sv.textContent = sl.value; ls('ppvStrength', sl.value); };
    gpu.onchange = () => ls('ppvGpu', gpu.checked ? '1' : '0');
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
      if (!go.disabled) status(have ? 'Ready' : 'Model not downloaded yet (one time).');
    }
    $('#ppv-x').onclick = () => { p.style.display = 'none'; };
    sel.onchange = () => { ls('ppvModel', sel.value); refresh(); };
    b.onclick = () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; refresh(); };
    $('#ppv-del').onclick = async () => { await deleteModel(sel.value); status('Deleted.'); refresh(); };
    go.onclick = async () => {
      go.disabled = true; bar.style.width = '0'; let wl = null;
      try {
        if (LV() && LV().wake && navigator.wakeLock) { try { wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
        const A = window.__ppApi, t = A && A.tracks()[A.currentIndex()], id = sel.value, want = picked();
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
        addToLibrary(files);
        status('Done. Added ' + files.length + ' track' + (files.length > 1 ? 's' : '') + ' to your library.');
      } catch (e) { console.error(e); status('Error: ' + e.message); }
      wl && wl.release().catch(() => {});
      go.disabled = false; refresh();
    };
    const tagBtn = $('#ppv-tag'), tagOut = $('#ppv-tags');
    tagBtn.onclick = async () => {
      tagBtn.disabled = go.disabled = true; tagOut.textContent = '';
      try {
        const A = window.__ppApi, t = A && A.tracks()[A.currentIndex()];
        if (!t) throw new Error('Play or select a track first.');
        tagOut.textContent = fmtTags(await tagTrack(t.url, status, LV())); status('Tagged.');
      } catch (e) { console.error(e); status('Error: ' + e.message); }
      tagBtn.disabled = go.disabled = false;
    };
    refresh();
  }
  window.PPVocals = { separate, separateDemucs, fft, _N: N };
  const boot = () => { try { ui(); } catch (e) { console.error(e); } };
  if (typeof document !== 'undefined' && document.body) boot();
  else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', boot);
})();
