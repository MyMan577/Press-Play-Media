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
    d1.insertAdjacentHTML('afterbegin', '<div class="ppv-stx ppv-note">Ready</div><div class="ppv-pbar ppv-bar-tag"><i></i></div><select id="ppv-scope"><option value="cur">Tag: current track</option><option value="pick">Tag: a track I choose</option><option value="all">Tag: all tracks</option></select><select id="ppv-pick" style="display:none"></select><label class="ppv-c" id="ppv-redo-l" style="display:none"><input type="checkbox" id="ppv-redo"> Also redo tracks that already have tags</label><div class="ppv-row"><button id="ppv-tag">Tag current track</button><button id="ppv-stop" class="ppv-sec" style="display:none;width:auto;padding:6px 14px" data-keep="1">Stop</button></div><div id="ppv-tags" class="ppv-out"></div><details id="ppv-saved"><summary>Saved tags</summary><select id="ppv-sf"><option value="video">Videos</option><option value="audio">Songs</option><option value="all">Everything tagged</option></select><div id="ppv-slist" class="ppv-note"></div></details>');
    d2.insertAdjacentHTML('afterbegin', '<div class="ppv-stx ppv-note">Ready</div><div class="ppv-pbar ppv-bar-wh"><i></i></div>');
    d2.style.borderTop = '0'; d2.style.marginTop = '4px';
    const libHost = document.createElement('div'); libHost.className = 'ppv-scope'; libHost.id = 'ppv-libhost'; libHost.appendChild(d1);
    const whHost = document.createElement('div'); whHost.className = 'ppv-scope'; whHost.id = 'ppv-whhost'; whHost.appendChild(d2);
    d1.open = false; d2.open = true;
    const pane = document.getElementById('sidebar-pane-playlist'), srow = document.getElementById('search-row');
    if (pane && srow) srow.after(libHost); else if (pane) pane.prepend(libHost); else p.appendChild(libHost);   // fallback: old panel
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
    const busy = on => document.querySelectorAll('#ppv-panel button, .ppv-scope button').forEach(b => { if (!b.dataset.keep && !b.classList.contains('ppv-x')) b.disabled = on; });
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
    const renderSaved = () => {
      const a = A(), box = $('#ppv-slist'), f = $('#ppv-sf').value; if (!a || !box) return;
      const tg = loadTags(), rows = a.tracks().filter(t => tg[t.dbId] && (f === 'all' || (f === 'video') === (t.kind === 'video')));
      box.textContent = '';
      if (!rows.length) { box.textContent = f === 'video' ? 'No tagged videos yet. Pick a video with the Tag button above.' : 'Nothing tagged here yet.'; return; }
      rows.slice(0, 200).forEach(t => {
        const c = tg[t.dbId], row = document.createElement('div'), head = document.createElement('div'), body = document.createElement('div');
        row.style.cssText = 'border-top:1px solid var(--line,#333);padding:6px 0;cursor:pointer';
        head.innerHTML = '<b></b><div style="opacity:.7;font-size:11px"></div>';
        head.firstChild.textContent = (t.kind === 'video' ? '🎬 ' : '🎵 ') + t.title;
        head.lastChild.textContent = [c.bpm ? c.bpm + ' BPM' : '', c.key || '', c.gp && c.gp[0] ? c.gp[0][0] : '', c.md && c.md[0] ? c.md[0][0] : '', c.v != null ? (c.v >= 50 ? 'vocals' : 'instrumental') : ''].filter(Boolean).join(' · ') || 'tagged';
        body.style.cssText = 'display:none;white-space:pre-wrap;font-size:12px;margin-top:6px'; body.textContent = fmtStored(c);
        row.onclick = () => { body.style.display = body.style.display === 'none' ? 'block' : 'none'; };
        row.append(head, body); box.appendChild(row);
      });
      if (rows.length > 200) { const m = document.createElement('div'); m.textContent = 'Showing the first 200 of ' + rows.length + '.'; box.appendChild(m); }
    };
    const refreshCount = () => { const a = A(); if (!a) return; const tg = loadTags(), n = a.tracks().filter(t => tg[t.dbId]).length; cnt.textContent = n + ' of ' + a.tracks().length + ' tracks tagged'; renderSmart(); try { renderSaved(); } catch (e) {} };
    function renderSmart() {
      const a = A(), tg = loadTags(), box = $('#ppv-smart'); if (!a) return;
      const ticked = new Set([...box.querySelectorAll('input:checked')].map(i => i.value));
      const rows = a.tracks().map(t => tg[t.dbId]).filter(Boolean).map(c => [c, vibes(c)]);
      box.innerHTML = SMART.map(s => '<label><input type="checkbox" value="' + s.id + '"' + (ticked.has(s.id) ? ' checked' : '') + '> ' + s.name + ' <span style="opacity:.6">(' + rows.filter(r => s.test(r[0], r[1])).length + ')</span></label>').join('');
    }
    d1.addEventListener('toggle', () => { if (d1.open) refreshCount(); });
    $('#ppv-saved').addEventListener('toggle', () => { if ($('#ppv-saved').open) renderSaved(); }); $('#ppv-sf').onchange = renderSaved;
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
      const lv = h.LV(), cache = lv ? null : {}, list = a.tracks().slice(); let done = 0, fail = 0, skip = 0;
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
    function fill(name, pick) {
      const a = A(), pl = a.playlists().find(x => x.name === name) || a.createPlaylist(name); let n = 0;
      a.tracks().forEach(t => { if (pick(t) && a.addToPlaylist(t.dbId, pl.id)) n++; });
      return n;
    }
    $('#ppv-mk').onclick = () => {
      const a = A(), tg = loadTags(), ids = [...document.querySelectorAll('#ppv-smart input:checked')].map(i => i.value);
      if (!ids.length) { h.status('Tick at least one playlist.'); return; }
      ensureDetailed(); const msg = [];
      SMART.filter(s => ids.includes(s.id)).forEach(s => { const n = fill('✨ ' + s.name, t => { const c = tg[t.dbId]; return c && s.test(c, vibes(c)); }); msg.push(s.name + ': ' + n); });
      a.commitPlaylists(); lib.textContent = msg.join('\n'); h.status('Playlists updated. Switch the playlist view to see them.');
    };
    $('#ppv-mkq').onclick = () => {
      const q = $('#ppv-q').value.trim().toLowerCase(), a = A(); if (!q) { h.status('Type a search first.'); return; }
      ensureDetailed(); const words = q.split(/\s+/);
      const n = fill('🔎 ' + q, t => { const hay = (t.title + ' ' + t.artist + ' ' + window.__ppTagText(t.dbId)).toLowerCase(); return words.every(w => hay.includes(w)); });
      a.commitPlaylists(); h.status('Playlist made with ' + n + ' track' + (n === 1 ? '' : 's') + '.');
    };

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
        <g class="body"><circle class="bd" cx="32" cy="34" r="24"/><circle cx="32" cy="34" r="24" fill="url(#${g})"/>
        <g class="eyes"><circle class="eye" cx="24" cy="31" r="5.5"/><circle class="eye" cx="40" cy="31" r="5.5"/><circle class="pu" cx="25" cy="32" r="2.6"/><circle class="pu" cx="41" cy="32" r="2.6"/></g>
        <path class="xe" d="M20 27l8 8M28 27l-8 8M36 27l8 8M44 27l-8 8"/>
        <path class="m smile" d="M25 43q7 6 14 0"/><ellipse class="m open" cx="32" cy="44" rx="4" ry="3.2"/><path class="m flat" d="M27 44h10"/><path class="m wavy" d="M25 44q3-3 7 0t7 0"/>
        <g class="spark">${star(8, 14, 1.3)}${star(56, 10, 1)}${star(58, 36, .8)}</g></g></svg>`;
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
      start: ['On it!', "Let's go!", 'Rolling up my sleeves… well, my ball.', 'Here we go!'],
      dl: ['Fetching the brains (one time only)…', 'Downloading my homework…', 'Grabbing the model, hang tight!'],
      dec: ['Listening closely…', 'Giving the track a good listen…'],
      sep: ['Pulling the song apart…', 'Teasing the vocals from the beat…', 'Sorting voice from band…'],
      enc: ['Wrapping up the stems…', 'Packing it all up…'],
      tag: ['Sniffing out the vibe…', 'Checking the tempo and key…', 'Tapping my foot to find the BPM…'],
      wh: ['Writing down every word…', 'Listening for lyrics…'],
      gen: ['Working on it…', 'Rolling along…'],
      done: ['Ta-da!', 'All done!', 'Nailed it!', 'Fresh out of the oven!'],
      err: ['Oops, I got dizzy.', 'Hmm, that did not work.', 'Uh-oh. Check the message in the panel.'],
      idle: ['Ready for the next one!', 'What else can I do?', 'Got another song for me?'],
      tap: ['Boing!', 'Hehe, that tickles!', "I'm Bloop!", 'Need stems? Lyrics? Tags?'],
      busy: ['Busy rolling, one sec!', 'Almost there!', 'Working, working…']
    };
    function set(m, text, hold) {
      if (!on) return;
      mood = m; clearTimeout(tmr);
      [pb, fb].forEach(x => x.className = 'ppv-ball m-' + m);
      if (text != null) bub.textContent = fbub.textContent = text;
      if (hold) tmr = setTimeout(() => { key = ''; set('idle', pick(L.idle)); }, hold);
    }
    function pop() {
      if (!on || panel.style.display === 'block') return;
      fl.style.display = 'flex'; clearTimeout(ftmr); ftmr = setTimeout(() => { fl.style.display = 'none'; }, 6000);
    }
    function react(text) {
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
        return;
      }
      if (k === key) return;                                       // same phase, keep the current animation going
      key = k;
      if (m === 'work') { set('work', pick(lines)); return; }
      set(m, pick(lines), 6000); pop();
    }
    return {
      react,
      start() { key = ''; set('start', pick(L.start), 900); },
      opened() {
        if (greeted || !on) return; greeted = true;
        const h = new Date().getHours(), hi = h < 5 ? 'Up late?' : h < 12 ? 'Good morning!' : h < 18 ? 'Hey there!' : 'Good evening!';
        let met = lsGet('ppvMascotMet'); lsSet('ppvMascotMet', '1');
        set('greet', met ? hi + ' ' + pick(['Ready when you are.', 'What are we working on?', 'Got a song for me?'])
                         : hi + " I'm Bloop. I split songs, tag them and write lyrics. Pick a track and tap a button!", 5000);
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
      '<div id="ppv-st" style="margin-top:8px;opacity:.8">Ready</div><div id="ppv-bar"><i></i></div><button id="ppv-go">Split current track</button><button id="ppv-del" class="ppv-sec">Free up space (delete this model)</button>';
    document.body.appendChild(p);
    const mas = mascot(p);
    mas.ball.onclick = () => mas.tap();
    document.addEventListener('click', e => { const bt = e.target.closest && e.target.closest('button'); if (bt && !bt.disabled && ['ppv-go', 'ppv-tag', 'ppv-all', 'ppv-wgo', 'ppv-simgo', 'ppv-mk', 'ppv-mkq', 'ppv-eqall'].includes(bt.id)) mas.start(); }, true);
    p.insertAdjacentHTML('beforeend', '<label class="ppv-c" style="margin-top:10px"><input type="checkbox" id="ppv-mas"> Show Bloop, the mascot</label>');
    const mc = p.querySelector('#ppv-mas'); mc.checked = mas.isOn(); mc.onchange = () => mas.setOn(mc.checked);
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
    try { smartUI(p, { status, LV, sel, sl, prog: f => { document.querySelectorAll('.ppv-bar-tag i').forEach(e => { e.style.width = (f * 100) + '%'; }); } }); } catch (e) { console.error(e); }
    refresh();
  }
  window.PPVocals = { separate, separateDemucs, fft, _N: N, tagTrack, transcribe, similarTo, loadTags, vibes };
  const boot = () => { try { ui(); } catch (e) { console.error(e); } };
  if (typeof document !== 'undefined' && document.body) boot();
  else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', boot);
})();
