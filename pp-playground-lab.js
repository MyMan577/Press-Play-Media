/* Press Play Playground: the Lab.
   Three tabs for the Playground hub:
   - Beat Lab: a 16-step sequencer and live pads with three sound palettes named after the Prodigy's EQ modes
     (Crescendo, Titan Bass, Deep Resonance), all synthesized here.
   - Rhythm Rush: a four-lane rhythm game on a 64-beat backing track. Perfect hits fill Hype, a full meter drops the beat for double score.
   - Nebula: a particle toy in the spirit of Nebula Touch, with palettes, brushes and an optional trail that follows your finger around the whole app. */
(function(){
  'use strict';
  var PP = window.PPPlayground; if (!PP) return;
  var S = PP.S, esc = PP.esc, body = document.getElementById('pgr-body');
  var COL = ['#6ee7d0', '#8b5cff', '#ff5fd8', '#ffb36e'];

  /* ------------------------------------------------------------------ shared synth */
  var AC = null, master = null, echoIn = null, noiseBuf = null;
  function audio(){
    if (AC){ if (AC.state === 'suspended') { try { AC.resume(); } catch(e){} } return AC; }
    try {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      AC = new C(); master = AC.createGain(); master.gain.value = 0.55;
      var comp = AC.createDynamicsCompressor(); master.connect(comp); comp.connect(AC.destination);
      echoIn = AC.createGain();
      var d = AC.createDelay(1), fb = AC.createGain(), wet = AC.createGain();
      d.delayTime.value = 0.27; fb.gain.value = 0.38; wet.gain.value = 0.5;
      echoIn.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(master);
      noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      var arr = noiseBuf.getChannelData(0); for (var i = 0; i < arr.length; i++) arr[i] = Math.random() * 2 - 1;
    } catch(e){ AC = null; }
    return AC;
  }
  function osc(type, f, t, dur, vol, o){
    o = o || {};
    var a = AC, n = a.createOscillator(), g = a.createGain(), node = n;
    n.type = type; n.frequency.setValueAtTime(f, t);
    if (o.slide) n.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    if (o.det) n.detune.setValueAtTime(o.det, t);
    if (o.cut){ var fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = o.q || 4; fl.frequency.setValueAtTime(o.cut, t); if (o.cutEnd) fl.frequency.exponentialRampToValueAtTime(o.cutEnd, t + dur); n.connect(fl); node = fl; }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (o.att || 0.006)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(master); if (o.echo){ var e = a.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(echoIn); }
    n.start(t); n.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, ftype, cut, o){
    o = o || {};
    var a = AC, s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; s.loop = true; fl.type = ftype; fl.frequency.setValueAtTime(cut, t); fl.Q.value = o.q || 1;
    if (o.cutEnd) fl.frequency.exponentialRampToValueAtTime(o.cutEnd, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); if (o.echo){ var e = a.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(echoIn); }
    s.start(t); s.stop(t + dur + 0.05);
  }
  // notes: A minor pentatonic
  var BASSN = { cres:[55, 55, 65.41, 55, 73.42, 55, 65.41, 82.41], titan:[41.2, 41.2, 49, 41.2, 55, 41.2, 49, 61.74], deep:[55, 55, 49, 55, 65.41, 55, 49, 73.42] };
  var LEADN = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
  var VOICES = {
    kick:  function(t, p){ if (p === 'titan'){ osc('sine', 115, t, 0.5, 0.95, { slide:30 }); osc('sawtooth', 60, t, 0.16, 0.22, { cut:300 }); } else if (p === 'deep'){ osc('sine', 100, t, 0.42, 0.7, { slide:38 }); } else { osc('sine', 150, t, 0.28, 0.8, { slide:42 }); } noise(t, 0.02, 0.12, 'highpass', 3000); },
    snare: function(t, p){ var c = p === 'titan' ? 1100 : p === 'deep' ? 900 : 1800; noise(t, p === 'titan' ? 0.26 : 0.18, 0.4, 'bandpass', c, { q:0.8, echo: p === 'deep' ? 0.5 : 0 }); osc('triangle', 200, t, 0.1, 0.25, { slide:120 }); },
    clap:  function(t, p){ for (var i = 0; i < 3; i++) noise(t + i * 0.012, 0.09, 0.25, 'bandpass', 1500, { q:1.2, echo: p === 'deep' ? 0.4 : 0 }); },
    hat:   function(t, p){ noise(t, 0.04, p === 'deep' ? 0.12 : 0.2, 'highpass', 7000); },
    ohat:  function(t, p){ noise(t, 0.22, 0.17, 'highpass', 6000, { cutEnd:3000 }); },
    tom:   function(t, p){ osc('sine', p === 'titan' ? 130 : 180, t, 0.3, 0.6, { slide:70 }); },
    bass:  function(t, p, i){ var f = BASSN[p][i % 8]; if (p === 'cres') osc('sawtooth', f, t, 0.22, 0.38, { cut:700, cutEnd:200 }); else if (p === 'titan'){ osc('sawtooth', f, t, 0.3, 0.35, { cut:320 }); osc('sine', f, t, 0.3, 0.55); } else osc('sine', f, t, 0.34, 0.6); },
    lead:  function(t, p, i){ var f = LEADN[(i * 3 + (i >> 2)) % 8]; if (p === 'cres') osc('square', f, t, 0.16, 0.16, { cut:3200, cutEnd:700 }); else if (p === 'titan') osc('sawtooth', f / 2, t, 0.22, 0.2, { cut:1200, cutEnd:300, det:8 }); else osc('triangle', f * 2, t, 0.34, 0.2, { echo:0.55 }); }
  };
  var ROWS = [['kick', 'Kick', '#ff5fd8'], ['snare', 'Snare', '#ffb36e'], ['clap', 'Clap', '#ffd66e'], ['hat', 'Hat', '#6ee7d0'], ['ohat', 'Open', '#39d5ff'], ['tom', 'Tom', '#8b5cff'], ['bass', 'Bass', '#3ddc84'], ['lead', 'Lead', '#b79bff']];
  var PALS = [['cres', 'Crescendo'], ['titan', 'Titan Bass'], ['deep', 'Deep Resonance']];
  function steps(a){ var r = []; for (var i = 0; i < 16; i++) r.push(a.indexOf(i) >= 0 ? 1 : 0); return r; }
  var PRESETS = {
    floor:  { n:'Four on the floor', bpm:128, p:{ kick:steps([0, 4, 8, 12]), snare:steps([4, 12]), clap:steps([12]), hat:steps([2, 6, 10, 14]), ohat:steps([14]), tom:steps([]), bass:steps([2, 3, 6, 10, 11, 14]), lead:steps([0, 3, 6, 8, 11]) } },
    break_: { n:'Breakbeat',         bpm:136, p:{ kick:steps([0, 6, 10]), snare:steps([4, 12, 15]), clap:steps([]), hat:steps([0, 2, 4, 6, 8, 10, 12, 14]), ohat:steps([7]), tom:steps([13]), bass:steps([0, 6, 10, 13]), lead:steps([2, 5, 9, 14]) } },
    half:   { n:'Half-time',         bpm:90,  p:{ kick:steps([0, 10]), snare:steps([8]), clap:steps([8]), hat:steps([0, 2, 4, 6, 8, 10, 12, 14]), ohat:steps([15]), tom:steps([]), bass:steps([0, 3, 10]), lead:steps([4, 12]) } },
    trap:   { n:'Trap',              bpm:140, p:{ kick:steps([0, 7, 10]), snare:steps([8]), clap:steps([8]), hat:steps([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15]), ohat:steps([7]), tom:steps([]), bass:steps([0, 7, 10]), lead:steps([3, 11]) } }
  };
  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  var css = document.createElement('style'); css.id = 'pgl-style';
  css.textContent = [
    '.pgl-grid{overflow-x:auto;padding-bottom:4px}',
    '.pgl-row{display:flex;align-items:center;gap:3px;margin-bottom:4px;min-width:340px}',
    '.pgl-lab{width:38px;flex:0 0 38px;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}',
    '.pgl-st{flex:1;min-width:15px;aspect-ratio:1;max-width:30px;border-radius:5px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.pgl-st.q{border-color:rgba(255,255,255,.28)}.pgl-st.on{border-color:transparent;background:var(--c);box-shadow:0 0 8px var(--c)}.pgl-st.now{outline:2px solid #fff;outline-offset:-1px}',
    '.pgl-pads{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}',
    '.pgl-pad{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;aspect-ratio:1.5;border-radius:14px;border:2px solid var(--c);background:rgba(255,255,255,.05);color:var(--c);font:800 12px inherit;font-family:inherit;text-transform:uppercase;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent}',
    '.pgl-pad.hit{background:var(--c);color:#0c0d10;box-shadow:0 0 18px var(--c)}',
    '.pgl-slider{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:12.5px}.pgl-slider input{flex:1}',
    '#pgl-rush{display:block;width:100%;border-radius:16px;background:#07060d;touch-action:none;user-select:none;-webkit-user-select:none}',
    '#pgl-neb{display:block;width:100%;height:340px;border-radius:16px;background:#07060d;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-user-drag:none}',
    '#pgl-trail{position:fixed;inset:0;width:100%;height:100%;z-index:99970;pointer-events:none}'
  ].join('\n');
  document.head.appendChild(css);

  /* ================================================================== BEAT LAB */
  S.lab = S.lab || {};
  var L = S.lab;
  if (!L.p){ var fl = clone(PRESETS.floor); L.p = fl.p; L.bpm = fl.bpm; }
  L.pal = L.pal || 'cres'; L.swing = L.swing || 0; L.slots = L.slots || [null, null, null];
  var lab = { playing:false, step:0, next:0, timer:null, raf:0, queue:[], bars:0, sec:null };

  function labStepDur(){ return 60 / L.bpm / 4; }
  function labSchedule(){
    if (!lab.playing || !audio()) return;
    while (lab.next < AC.currentTime + 0.12){
      var s = lab.step, sw = (s % 2 ? L.swing * labStepDur() * 0.33 : 0), t = lab.next + sw;
      ROWS.forEach(function(r){ if (L.p[r[0]][s]) VOICES[r[0]](t, L.pal, s); });
      lab.queue.push({ t: lab.next, s: s });
      lab.next += labStepDur(); lab.step = (s + 1) % 16;
      if (lab.step === 0){
        lab.bars++; PP.stat('labBars', 1);
        if (lab.bars % 32 === 0){ var d = PP.dayKey(); S.labDay = S.labDay && S.labDay.d === d ? S.labDay : { d:d, n:0 }; if (S.labDay.n < 15){ S.labDay.n++; PP.addStars(1, 'for making beats', true); } }
      }
    }
  }
  function labFrame(){
    if (!lab.playing) return;
    var now = AC ? AC.currentTime : 0, cur = -1;
    while (lab.queue.length && lab.queue[0].t <= now){ cur = lab.queue.shift().s; }
    if (cur >= 0){
      var g = document.getElementById('pgl-grid');
      if (g){ var p = g.querySelector('.pgl-st.now'); while (p){ p.classList.remove('now'); p = g.querySelector('.pgl-st.now'); } g.querySelectorAll('[data-s="' + cur + '"]').forEach(function(b){ b.classList.add('now'); }); }
    }
    lab.raf = requestAnimationFrame(labFrame);
  }
  function labPlay(){
    if (!audio()) { PP.toast('Sound is not available here.'); return; }
    if (lab.playing) return;
    lab.playing = true; lab.step = 0; lab.next = AC.currentTime + 0.06; lab.queue = [];
    lab.timer = setInterval(labSchedule, 25); labSchedule(); lab.raf = requestAnimationFrame(labFrame);
    lab.sec = setInterval(function(){ PP.stat('labMs', 1000); }, 1000);
    updateLabBtn();
  }
  function labStop(){
    if (!lab.playing) return;
    lab.playing = false; clearInterval(lab.timer); clearInterval(lab.sec); cancelAnimationFrame(lab.raf); lab.queue = [];
    var g = document.getElementById('pgl-grid'); if (g) g.querySelectorAll('.now').forEach(function(b){ b.classList.remove('now'); });
    updateLabBtn(); PP.save();
  }
  function updateLabBtn(){ var b = document.getElementById('pgl-play'); if (b) b.textContent = lab.playing ? '■ Stop' : '▶ Play'; }
  function renderLab(el){
    var rows = ROWS.map(function(r){
      var cells = ''; for (var i = 0; i < 16; i++) cells += '<button type="button" class="pgl-st' + (i % 4 === 0 ? ' q' : '') + (L.p[r[0]][i] ? ' on' : '') + '" data-r="' + r[0] + '" data-s="' + i + '" style="--c:' + r[2] + '" aria-label="' + r[1] + ' step ' + (i + 1) + '"></button>';
      return '<div class="pgl-row"><span class="pgl-lab" style="color:' + r[2] + '">' + r[1] + '</span>' + cells + '</div>';
    }).join('');
    var pads = ROWS.map(function(r){ return '<button type="button" class="pgl-pad" data-pad="' + r[0] + '" style="--c:' + r[2] + '">' + r[1] + '</button>'; }).join('');
    el.innerHTML = '<div class="pgr-card pgr-hero"><h3>Beat Lab</h3><p class="pgr-sub" style="margin:0">Tap steps to build a 16-step beat, press Play, and tap the pads to jam over it. Pick a sound palette: they are named after the Prodigy\'s EQ modes. Every 32 bars you play earns a ⭐ Star (up to 15 a day).</p></div>' +
      '<div class="pgr-card"><div class="pgr-row" style="margin-bottom:10px">' + PALS.map(function(p){ return '<button type="button" class="pgr-pre" data-pal="' + p[0] + '" style="' + (L.pal === p[0] ? 'background:linear-gradient(90deg,#6ee7d0,#b79bff);color:#0c0d10;border-color:transparent' : '') + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<div class="pgl-grid" id="pgl-grid">' + rows + '</div>' +
      '<div class="pgl-slider"><span style="width:62px">Tempo</span><input type="range" id="pgl-bpm" min="70" max="170" value="' + L.bpm + '"><b id="pgl-bpmv" style="width:34px;text-align:right">' + L.bpm + '</b></div>' +
      '<div class="pgl-slider"><span style="width:62px">Swing</span><input type="range" id="pgl-swing" min="0" max="100" value="' + Math.round(L.swing * 100) + '"><b style="width:34px"></b></div>' +
      '<div class="pgr-row"><button type="button" class="pgr-btn" id="pgl-play">▶ Play</button><button type="button" class="pgr-btn alt" data-lab="random">Random</button><button type="button" class="pgr-btn alt" data-lab="clear">Clear</button></div>' +
      '<p class="pgr-sub" style="margin:12px 0 6px">Starting beats</p><div class="pgr-row">' + Object.keys(PRESETS).map(function(k){ return '<button type="button" class="pgr-pre" data-preset="' + k + '">' + PRESETS[k].n + '</button>'; }).join('') + '</div>' +
      '<p class="pgr-sub" style="margin:12px 0 6px">Your slots</p><div class="pgr-row">' + [0, 1, 2].map(function(i){ return '<span style="display:inline-flex;gap:4px"><button type="button" class="pgr-pre" data-save="' + i + '">Save ' + (i + 1) + '</button><button type="button" class="pgr-pre" data-load="' + i + '"' + (L.slots[i] ? '' : ' disabled style="opacity:.45"') + '>Load</button></span>'; }).join('') + '</div></div>' +
      '<div class="pgr-card"><h3>Pads</h3><p class="pgr-sub" style="margin:0">Jam along. Each pad plays that instrument in the palette you picked.</p><div class="pgl-pads">' + pads + '</div></div>';
    updateLabBtn();
  }
  function hitPad(id, btn){
    if (!audio()) return;
    var i = Math.floor(Math.random() * 8);
    VOICES[id](AC.currentTime + 0.005, L.pal, i);
    if (btn){ btn.classList.add('hit'); setTimeout(function(){ btn.classList.remove('hit'); }, 110); }
  }
  body.addEventListener('pointerdown', function(e){
    var b = e.target.closest('[data-pad]'); if (b){ e.preventDefault(); hitPad(b.getAttribute('data-pad'), b); }
  });
  body.addEventListener('click', function(e){
    var b;
    if ((b = e.target.closest('.pgl-st'))){
      var r = b.getAttribute('data-r'), s = +b.getAttribute('data-s'); L.p[r][s] = L.p[r][s] ? 0 : 1; b.classList.toggle('on', !!L.p[r][s]); PP.save();
      if (L.p[r][s] && audio()) VOICES[r](AC.currentTime + 0.005, L.pal, s);
      return;
    }
    if ((b = e.target.closest('#pgl-play'))){ lab.playing ? labStop() : labPlay(); return; }
    if ((b = e.target.closest('[data-pal]'))){ L.pal = b.getAttribute('data-pal'); PP.save(); PP.reflow('lab'); return; }
    if ((b = e.target.closest('[data-lab]'))){
      var act = b.getAttribute('data-lab');
      ROWS.forEach(function(r){ for (var i = 0; i < 16; i++) L.p[r[0]][i] = act === 'clear' ? 0 : (Math.random() < (r[0] === 'hat' ? 0.5 : r[0] === 'kick' ? 0.3 : 0.18) ? 1 : 0); });
      if (act === 'random') for (var k = 0; k < 16; k += 4) L.p.kick[k] = 1;
      PP.save(); PP.reflow('lab'); return;
    }
    if ((b = e.target.closest('[data-preset]'))){ var pr = clone(PRESETS[b.getAttribute('data-preset')]); L.p = pr.p; L.bpm = pr.bpm; PP.save(); PP.reflow('lab'); return; }
    if ((b = e.target.closest('[data-save]'))){ L.slots[+b.getAttribute('data-save')] = { p:clone(L.p), bpm:L.bpm, pal:L.pal }; PP.save(true); PP.toast('Saved to slot ' + (+b.getAttribute('data-save') + 1)); PP.reflow('lab'); return; }
    if ((b = e.target.closest('[data-load]'))){ var sl = L.slots[+b.getAttribute('data-load')]; if (sl){ L.p = clone(sl.p); L.bpm = sl.bpm; L.pal = sl.pal; PP.save(); PP.reflow('lab'); } return; }
  });
  body.addEventListener('input', function(e){
    if (e.target.id === 'pgl-bpm'){ L.bpm = +e.target.value; var v = document.getElementById('pgl-bpmv'); if (v) v.textContent = L.bpm; PP.save(); }
    else if (e.target.id === 'pgl-swing'){ L.swing = +e.target.value / 100; PP.save(); }
  });
  PP.registerTab({ id:'lab', label:'🥁 Beat Lab', order:50, render:renderLab, onHide:labStop });
  PP.lab = lab;

  /* ================================================================== RHYTHM RUSH */
  S.rush = S.rush || { best:{} };
  var DIFFS = {
    cres:  { name:'Crescendo',      bpm:110, dens:0.55, note:'Easy · 110 BPM' },
    titan: { name:'Titan Bass',     bpm:128, dens:0.78, note:'Normal · 128 BPM' },
    deep:  { name:'Deep Resonance', bpm:150, dens:0.98, note:'Hard · 150 BPM' }
  };
  var LANEKEYS = ['d', 'f', 'j', 'k'], RR = null, rrDiff = 'titan', rrResult = null;
  var FALL = 1.5;

  function rrBuild(diff){
    var d = DIFFS[diff], beat = 60 / d.bpm, notes = [], seed = 7, i;
    function rnd(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    seed = 11 + d.bpm;
    for (var b = 0; b < 64; b++){
      var t0 = (b + 4) * beat, strong = b % 4 === 0;
      if (b % 2 === 0 ? rnd() < d.dens * 0.8 || strong : rnd() < d.dens * 0.35) notes.push({ t:t0, lane:0 });
      if (b % 2 === 1 && rnd() < 0.9) notes.push({ t:t0, lane:1 });
      if (rnd() < d.dens * 0.8) notes.push({ t:t0 + beat / 2, lane:2 });
      if (rnd() < d.dens * 0.32) notes.push({ t:t0 + beat * 0.25, lane:3 });
      if (rnd() < d.dens * 0.32) notes.push({ t:t0 + beat * 0.75, lane:3 });
      if (strong && b > 8 && rnd() < d.dens * 0.5) notes.push({ t:t0, lane:3 });
    }
    notes.sort(function(a, b2){ return a.t - b2.t; });
    var clean = [], lastT = {};   // one note per lane at least 0.12s apart
    notes.forEach(function(n){ if (lastT[n.lane] != null && n.t - lastT[n.lane] < 0.12) return; lastT[n.lane] = n.t; clean.push({ t:n.t, lane:n.lane, done:false }); });
    return { notes: clean, beat: beat, bpm: d.bpm, end: (68) * beat + 1.2 };
  }
  function rrStart(){
    if (!audio()){ PP.toast('Sound is not available here.'); return; }
    var song = rrBuild(rrDiff), t0 = AC.currentTime + 0.25;
    RR = { diff: rrDiff, notes: song.notes, beat: song.beat, end: song.end, start: t0, score: 0, combo: 0, maxCombo: 0, hype: 0, dropUntil: 0, p: 0, g: 0, m: 0, over: false, auto: !!(PP.rushAuto), floats: [], flash: 0, pal: rrDiff };
    // backing track on the audio clock
    for (var b = 0; b < 68; b++){
      var t = t0 + b * song.beat, pal = rrDiff;
      if (b < 4){ osc('triangle', b === 3 ? 880 : 660, t, 0.1, 0.12); continue; }
      VOICES.kick(t, pal); VOICES.hat(t + song.beat / 2, pal);
      if (b % 2 === 1) VOICES.snare(t, pal);
      if (b % 2 === 0) VOICES.bass(t, pal, b >> 1);
      if (b % 4 === 0) VOICES.bass(t + song.beat * 1.5, pal, (b >> 1) + 3);
    }
    PP.stat('rushPlays', 1); PP.stat('rush', 1);
    rrResult = null; renderRush(rrEl);
  }
  var rrEl = null, rrRaf = 0;
  function rrJudge(n, dt){
    var perfect = dt <= 0.065, add = perfect ? 100 : 50;
    n.done = true; RR.combo++; if (RR.combo > RR.maxCombo) RR.maxCombo = RR.combo;
    var drop = AC.currentTime < RR.dropUntil, mult = Math.min(4, 1 + RR.combo / 10) * (drop ? 2 : 1);
    RR.score += Math.round(add * mult);
    if (perfect) RR.p++; else RR.g++;
    RR.hype = Math.min(1, RR.hype + (perfect ? 0.05 : 0.025));
    if (RR.hype >= 1 && !drop){ RR.hype = 0; RR.dropUntil = AC.currentTime + RR.beat * 8; RR.flash = 1; PP.chime(); RR.floats.push({ x:0.5, y:0.4, t:0, txt:'THE DROP ×2', c:'#ffb36e', big:true }); }
    RR.floats.push({ x:(n.lane + 0.5) / 4, y:0.78, t:0, txt: perfect ? 'PERFECT' : 'GOOD', c: perfect ? '#6ee7d0' : '#ffd66e' });
    var f = LEADN[(n.lane * 2 + (RR.combo >> 2)) % 8] * (perfect ? 2 : 1);
    osc('triangle', f, AC.currentTime, 0.16, 0.18, { echo: RR.diff === 'deep' ? 0.4 : 0 });
    try { if (navigator.vibrate) navigator.vibrate(8); } catch(e){}
  }
  function rrTap(lane){
    if (!RR || RR.over) return;
    var now = AC.currentTime - RR.start, best = null, bd = 9;
    RR.notes.forEach(function(n){ if (!n.done && n.lane === lane){ var d = Math.abs(n.t - now); if (d < bd){ bd = d; best = n; } } });
    if (best && bd <= 0.13) rrJudge(best, bd);
    else RR.floats.push({ x:(lane + 0.5) / 4, y:0.9, t:0, txt:'', c:'#fff' });
    RR.laneFlash = RR.laneFlash || [0, 0, 0, 0]; RR.laneFlash[lane] = 1;
  }
  function rrFinish(){
    RR.over = true;
    var total = RR.notes.length, max = total * 100, acc = Math.round((RR.p * 100 + RR.g * 50) / max * 100);
    var score = Math.round(RR.score * PP.mult('rush')), rank = acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D';
    var best = S.rush.best[RR.diff] || 0, newBest = score > best; if (newBest) S.rush.best[RR.diff] = score;
    var stars = Math.min(30, Math.round(score / 900) + (rank === 'S' ? 5 : rank === 'A' ? 2 : 0)), grooves = Math.round(Math.max(300, PP.ps() * score / 40));
    PP.addStars(stars, '', true); PP.addGrooves(grooves);
    if (rank === 'S') PP.stat('rushS', 1);
    PP.stat('rushScore', 0); S.stats.rushBest = Math.max(S.stats.rushBest || 0, score);
    PP.save(true); PP.chime(); if (PP.checkAch) PP.checkAch();
    rrResult = { score: score, rank: rank, acc: acc, combo: RR.maxCombo, p: RR.p, g: RR.g, m: total - RR.p - RR.g, stars: stars, grooves: grooves, newBest: newBest, diff: RR.diff, boosted: PP.mult('rush') > 1 };
    RR = null; cancelAnimationFrame(rrRaf); renderRush(rrEl);
  }
  function rrDraw(){
    var cv = document.getElementById('pgl-rush'); if (!cv || !RR){ return; }
    var W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr)){ cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var now = AC.currentTime - RR.start, hitY = H - 92, lw = W / 4, drop = AC.currentTime < RR.dropUntil, beatPh = ((now / RR.beat) % 1 + 1) % 1;
    ctx.clearRect(0, 0, W, H);
    var bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#07060d'); bg.addColorStop(1, drop ? '#2a1450' : '#14102a'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (now > 0){ ctx.fillStyle = 'rgba(139,92,255,' + (0.1 * (1 - beatPh)) + ')'; ctx.fillRect(0, 0, W, H); }
    if (RR.flash > 0){ ctx.fillStyle = 'rgba(255,255,255,' + (RR.flash * 0.25) + ')'; ctx.fillRect(0, 0, W, H); RR.flash = Math.max(0, RR.flash - 0.04); }
    for (var l = 0; l < 4; l++){
      ctx.fillStyle = 'rgba(255,255,255,' + (l % 2 ? 0.03 : 0.015) + ')'; ctx.fillRect(l * lw, 0, lw, H);
      var lf = (RR.laneFlash && RR.laneFlash[l]) || 0; if (lf > 0){ ctx.fillStyle = COL[l] + '33'; ctx.fillRect(l * lw, 0, lw, H); RR.laneFlash[l] = Math.max(0, lf - 0.08); }
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(l * lw, 0); ctx.lineTo(l * lw, H); ctx.stroke();
    }
    ctx.strokeStyle = drop ? '#ffb36e' : '#fff'; ctx.lineWidth = 3; ctx.shadowColor = drop ? '#ffb36e' : '#8b5cff'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.moveTo(0, hitY); ctx.lineTo(W, hitY); ctx.stroke(); ctx.shadowBlur = 0;
    for (l = 0; l < 4; l++){ ctx.fillStyle = COL[l] + '55'; ctx.beginPath(); ctx.arc(l * lw + lw / 2, hitY, 24, 0, 7); ctx.fill(); ctx.strokeStyle = COL[l]; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(LANEKEYS[l].toUpperCase(), l * lw + lw / 2, hitY + 4); }
    var live = 0;
    RR.notes.forEach(function(n){
      if (n.done) return;
      var dt = n.t - now;
      if (RR.auto && dt <= 0.004 && dt > -0.05 && AC.currentTime >= RR.start){ rrJudge(n, 0.001); return; }
      if (dt < -0.14){ n.done = true; RR.combo = 0; RR.hype = Math.max(0, RR.hype - 0.03); RR.floats.push({ x:(n.lane + 0.5) / 4, y:0.78, t:0, txt:'MISS', c:'#ff5f7a' }); return; }
      if (dt > FALL) return;
      live++;
      var y = hitY - dt / FALL * (hitY + 10), x = n.lane * lw + lw / 2;
      ctx.fillStyle = COL[n.lane]; ctx.shadowColor = COL[n.lane]; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.roundRect(x - lw * 0.38, y - 11, lw * 0.76, 22, 8); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.roundRect(x - lw * 0.3, y - 7, lw * 0.6, 5, 3); ctx.fill();
    });
    RR.floats = RR.floats.filter(function(f){ return f.t < 1; });
    RR.floats.forEach(function(f){ f.t += 0.035; if (!f.txt) return; ctx.globalAlpha = 1 - f.t; ctx.fillStyle = f.c; ctx.font = (f.big ? '800 26px' : '800 14px') + ' sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.txt, f.x * W, f.y * H - f.t * 40); ctx.globalAlpha = 1; });
    // hud
    ctx.fillStyle = '#fff'; ctx.font = '800 22px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(String(RR.score), 14, 30);
    ctx.font = '700 12px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText('x' + Math.min(4, 1 + RR.combo / 10).toFixed(1) + (drop ? ' x2 DROP' : ''), 14, 48);
    ctx.textAlign = 'right'; ctx.font = '800 22px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(RR.combo + ' combo', W - 14, 30);
    var hw = W - 28; ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(14, H - 22, hw, 8);
    var hg = ctx.createLinearGradient(14, 0, 14 + hw, 0); hg.addColorStop(0, '#6ee7d0'); hg.addColorStop(0.5, '#8b5cff'); hg.addColorStop(1, '#ff5fd8');
    ctx.fillStyle = drop ? '#ffb36e' : hg; ctx.fillRect(14, H - 22, hw * (drop ? Math.max(0, (RR.dropUntil - AC.currentTime) / (RR.beat * 8)) : RR.hype), 8);
    ctx.textAlign = 'center'; ctx.font = '700 10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(drop ? 'THE DROP' : 'HYPE', W / 2, H - 28);
    if (now < 0){ ctx.fillStyle = '#fff'; ctx.font = '800 54px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(Math.ceil(-now / RR.beat)), W / 2, H / 2); }
    if (now > RR.end){ rrFinish(); return; }
    rrRaf = requestAnimationFrame(rrDraw);
  }
  function renderRush(el){
    rrEl = el; if (!el) return; cancelAnimationFrame(rrRaf);
    if (RR && !RR.over){
      el.innerHTML = '<canvas id="pgl-rush" style="height:' + Math.round(Math.min(560, window.innerHeight * 0.62)) + 'px"></canvas><div class="pgr-note" style="text-align:center">Tap a lane (or press D F J K) as a note reaches the ring. Perfect hits fill Hype; a full meter drops the beat for double score.</div><div style="text-align:center"><button type="button" class="pgr-btn alt sm" data-rr="quit">Quit</button></div>';
      rrRaf = requestAnimationFrame(rrDraw); return;
    }
    if (rrResult){
      var r = rrResult, rc = { S:'#ffb36e', A:'#6ee7d0', B:'#6ea8ff', C:'#9aa3b2', D:'#ff5f7a' }[r.rank];
      el.innerHTML = '<div class="pgr-card pgr-hero" style="text-align:center"><div style="font-size:64px;font-weight:900;color:' + rc + '">' + r.rank + '</div><h3>' + r.score.toLocaleString() + ' points' + (r.newBest ? ' · New best!' : '') + '</h3>' +
        '<p class="pgr-sub">' + esc(DIFFS[r.diff].name) + ' · ' + r.acc + '% accuracy · best combo ' + r.combo + (r.boosted ? ' · charm bonus on' : '') + '</p>' +
        '<div class="pgr-stats"><div class="pgr-stat"><b>' + r.p + '</b><small>Perfect</small></div><div class="pgr-stat"><b>' + r.g + '</b><small>Good</small></div><div class="pgr-stat"><b>' + r.m + '</b><small>Missed</small></div></div>' +
        '<div class="pgr-chips" style="justify-content:center"><span class="pgr-chip">⭐ +' + r.stars + '</span><span class="pgr-chip">🎵 +' + PP.fmt(r.grooves) + ' grooves</span></div>' +
        '<div style="margin-top:14px"><button type="button" class="pgr-btn" data-rr="again">Play again</button> <button type="button" class="pgr-btn alt" data-rr="menu">Menu</button></div></div>';
      return;
    }
    el.innerHTML = '<div class="pgr-card pgr-hero"><h3>Rhythm Rush</h3><p class="pgr-sub" style="margin:0">Four lanes, a 64-beat track and your timing. Hit notes on the ring for points; Perfect hits build Hype, and a full meter drops the beat for double score. Earns ⭐ Stars and grooves by score. The Prodigy\'s Pulse charm boosts your score.</p></div>' +
      '<div class="pgr-card"><h3>Pick a track</h3><div class="pgr-row" style="margin:8px 0">' + Object.keys(DIFFS).map(function(k){ return '<button type="button" class="pgr-pre" data-rrd="' + k + '" style="' + (rrDiff === k ? 'background:linear-gradient(90deg,#6ee7d0,#b79bff);color:#0c0d10;border-color:transparent' : '') + '">' + DIFFS[k].name + '<br><small>' + DIFFS[k].note + '</small></button>'; }).join('') + '</div>' +
      '<div class="pgr-meta" style="margin-bottom:10px">Best: ' + (S.rush.best[rrDiff] ? S.rush.best[rrDiff].toLocaleString() : 'none yet') + '</div><button type="button" class="pgr-btn" data-rr="start">▶ Start</button></div>';
  }
  body.addEventListener('pointerdown', function(e){
    var cv = e.target.closest('#pgl-rush'); if (!cv || !RR) return;
    e.preventDefault(); var r = cv.getBoundingClientRect(); rrTap(Math.max(0, Math.min(3, Math.floor((e.clientX - r.left) / r.width * 4))));
  });
  body.addEventListener('click', function(e){
    var b;
    if ((b = e.target.closest('[data-rrd]'))){ rrDiff = b.getAttribute('data-rrd'); renderRush(rrEl); return; }
    if ((b = e.target.closest('[data-rr]'))){
      var a = b.getAttribute('data-rr');
      if (a === 'start' || a === 'again') rrStart();
      else if (a === 'menu'){ rrResult = null; renderRush(rrEl); }
      else if (a === 'quit'){ RR = null; cancelAnimationFrame(rrRaf); rrResult = null; renderRush(rrEl); }
    }
  });
  document.addEventListener('keydown', function(e){ if (!RR) return; var i = LANEKEYS.indexOf((e.key || '').toLowerCase()); if (i >= 0 && !e.repeat) rrTap(i); });
  PP.registerTab({ id:'rush', label:'🎮 Rush', order:60, render:renderRush, onHide:function(){ RR = null; cancelAnimationFrame(rrRaf); } });
  PP.rush = { get state(){ return RR; }, start: function(d){ if (d) rrDiff = d; rrStart(); }, tap: rrTap, get result(){ return rrResult; } };

  /* ================================================================== NEBULA */
  S.nb = S.nb || { pal:'pp', mode:'swirl', trail:false };
  var NB = S.nb;
  var NPALS = {
    pp:     ['Press Play', ['#6ee7d0', '#8b5cff', '#ff5fd8', '#ffffff', '#a68bff']],
    sunset: ['Sunset',     ['#ffb36e', '#ff6a5c', '#ff5fd8', '#8b5cff', '#fff1d6']],
    frost:  ['Frost',      ['#a8f0ff', '#6ee7d0', '#6aa8ff', '#e9f6ff', '#8b5cff']],
    mono:   ['Mono',       ['#ffffff', '#c9ccd4', '#8d919c', '#5c606b', '#3a3d46']],
    aurora: ['Aurora',     ['#7cf0d0', '#39d5ff', '#8b5cff', '#3ddc84', '#e9f6ff']],
    ember:  ['Ember',      ['#ff6a3d', '#ffb36e', '#ffd66e', '#ff5f7a', '#fff1d6']]
  };
  var nb = { ps:[], px:0, py:0, down:false, raf:0, sec:null, el:null, lastX:0, lastY:0 };
  function spawn(list, x, y, vx, vy, pal, n){
    var cols = NPALS[pal][1];
    for (var i = 0; i < n; i++){ if (list.length > 700) list.shift(); var a = Math.random() * 7, sp = 0.5 + Math.random() * 2.2;
      list.push({ x:x + (Math.random() - 0.5) * 8, y:y + (Math.random() - 0.5) * 8, vx:vx * 0.35 + Math.cos(a) * sp, vy:vy * 0.35 + Math.sin(a) * sp, life:1, d:0.008 + Math.random() * 0.014, c:cols[Math.floor(Math.random() * cols.length)], s:1.5 + Math.random() * 3 }); }
  }
  function nbFrame(){
    var cv = document.getElementById('pgl-neb'); if (!cv){ return; }
    var W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr)){ cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(7,6,13,.2)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    if (nb.down){
      var vx = nb.px - nb.lastX, vy = nb.py - nb.lastY; nb.lastX = nb.px; nb.lastY = nb.py;
      spawn(nb.ps, nb.px, nb.py, vx, vy, NB.pal, NB.mode === 'burst' ? 7 : 4);
    } else if (Math.random() < 0.15) spawn(nb.ps, W / 2 + Math.cos(Date.now() / 900) * W * 0.2, H / 2 + Math.sin(Date.now() / 700) * H * 0.2, 0, 0, NB.pal, 1);
    for (var i = nb.ps.length - 1; i >= 0; i--){
      var p = nb.ps[i];
      if (nb.down){
        var dx = nb.px - p.x, dy = nb.py - p.y, d = Math.hypot(dx, dy) + 20;
        if (NB.mode === 'swirl'){ p.vx += (dx / d) * 0.3 - (dy / d) * 0.35; p.vy += (dy / d) * 0.3 + (dx / d) * 0.35; }
        else if (NB.mode === 'burst'){ p.vx -= (dx / d) * 0.08; p.vy -= (dy / d) * 0.08; }
        else { p.vx += (dx / d) * 0.12; p.vy += (dy / d) * 0.12; }
      }
      p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.life -= p.d;
      if (p.life <= 0){ nb.ps.splice(i, 1); continue; }
      ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.4 + p.life * 0.8), 0, 7); ctx.fill();
      if (NB.mode === 'ribbon'){ ctx.strokeStyle = p.c; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4); ctx.stroke(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    nb.raf = requestAnimationFrame(nbFrame);
  }
  function renderNeb(el){
    nb.el = el; nb.ps = [];
    el.innerHTML = '<div class="pgr-card pgr-hero"><h3>Nebula</h3><p class="pgr-sub" style="margin:0">Stir a field of light with your finger, the way Nebula Touch does. Pick a palette and a brush. Time here counts toward orders.</p></div>' +
      '<canvas id="pgl-neb"></canvas>' +
      '<div class="pgr-card" style="margin-top:12px"><div class="pgr-row" style="margin-bottom:8px">' + Object.keys(NPALS).map(function(k){ return '<button type="button" class="pgr-pre" data-npal="' + k + '" style="' + (NB.pal === k ? 'background:linear-gradient(90deg,#6ee7d0,#b79bff);color:#0c0d10;border-color:transparent' : '') + '">' + NPALS[k][0] + '</button>'; }).join('') + '</div>' +
      '<div class="pgr-row" style="margin-bottom:10px">' + [['swirl', 'Swirl'], ['burst', 'Burst'], ['ribbon', 'Ribbon']].map(function(m){ return '<button type="button" class="pgr-pre" data-nmode="' + m[0] + '" style="' + (NB.mode === m[0] ? 'background:linear-gradient(90deg,#ffb36e,#ff5fd8);color:#0c0d10;border-color:transparent' : '') + '">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<label style="display:flex;align-items:center;gap:10px;font-size:13px"><input type="checkbox" id="pgl-trailopt"' + (NB.trail ? ' checked' : '') + '> Sparkle trail that follows your finger across the whole app</label></div>';
    var cv = el.querySelector('#pgl-neb');
    cv.setAttribute('draggable', 'false'); cv.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    cv.addEventListener('pointerdown', function(e){ e.preventDefault(); var r = cv.getBoundingClientRect(); nb.down = true; nb.px = nb.lastX = e.clientX - r.left; nb.py = nb.lastY = e.clientY - r.top; try { cv.setPointerCapture(e.pointerId); } catch(x){} });
    cv.addEventListener('pointermove', function(e){ if (!nb.down) return; var r = cv.getBoundingClientRect(); nb.px = e.clientX - r.left; nb.py = e.clientY - r.top; });
    ['pointerup', 'pointercancel'].forEach(function(t){ cv.addEventListener(t, function(){ nb.down = false; }); });
    cancelAnimationFrame(nb.raf); nb.raf = requestAnimationFrame(nbFrame);
    clearInterval(nb.sec); nb.sec = setInterval(function(){ if (nb.down) PP.stat('nebMs', 1000); }, 1000);
  }
  function nbHide(){ cancelAnimationFrame(nb.raf); clearInterval(nb.sec); nb.down = false; }
  body.addEventListener('click', function(e){
    var b;
    if ((b = e.target.closest('[data-npal]'))){ NB.pal = b.getAttribute('data-npal'); PP.save(); PP.reflow('nebula'); return; }
    if ((b = e.target.closest('[data-nmode]'))){ NB.mode = b.getAttribute('data-nmode'); PP.save(); PP.reflow('nebula'); return; }
  });
  body.addEventListener('change', function(e){ if (e.target.id === 'pgl-trailopt'){ NB.trail = e.target.checked; PP.save(true); trailSync(); } });
  PP.registerTab({ id:'nebula', label:'✨ Nebula', order:70, render:renderNeb, onHide:nbHide });

  // the trail: sparkles that follow a finger anywhere in the app (not while a game is open)
  var tr = { cv:null, ps:[], raf:0, last:0 };
  function trailSync(){
    var want = PP.on() && NB.trail;
    if (want && !tr.cv){
      tr.cv = document.createElement('canvas'); tr.cv.id = 'pgl-trail'; document.body.appendChild(tr.cv);
      window.addEventListener('pointermove', trailMove, { passive:true }); window.addEventListener('pointerdown', trailMove, { passive:true });
    } else if (!want && tr.cv){
      window.removeEventListener('pointermove', trailMove); window.removeEventListener('pointerdown', trailMove);
      tr.cv.remove(); tr.cv = null; tr.ps = []; cancelAnimationFrame(tr.raf); tr.raf = 0;
    }
  }
  function trailMove(e){
    if (!tr.cv || document.body.classList.contains('pp-gaming')) return;
    if (e.type === 'pointermove' && e.pressure === 0 && e.pointerType === 'mouse' && !e.buttons && Math.random() < 0.6) return;
    spawn(tr.ps, e.clientX, e.clientY, 0, 0, NB.pal, 2);
    if (!tr.raf) tr.raf = requestAnimationFrame(trailFrame);
  }
  function trailFrame(){
    tr.raf = 0; if (!tr.cv) return;
    var W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (tr.cv.width !== Math.round(W * dpr)){ tr.cv.width = Math.round(W * dpr); tr.cv.height = Math.round(H * dpr); }
    var ctx = tr.cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
    for (var i = tr.ps.length - 1; i >= 0; i--){
      var p = tr.ps[i]; p.vx *= 0.96; p.vy = p.vy * 0.96 + 0.02; p.x += p.vx; p.y += p.vy; p.life -= p.d * 1.6;
      if (p.life <= 0){ tr.ps.splice(i, 1); continue; }
      ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * p.life, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (tr.ps.length) tr.raf = requestAnimationFrame(trailFrame);
  }
  new MutationObserver(trailSync).observe(document.body, { attributes:true, attributeFilter:['class'] });
  trailSync();

  /* ------------------------------------------------------------------ orders and achievements */
  PP.addOrderKind({ id:'lab',  stat:'labMs',     unit:'ms', t:function(n){ return 'Make beats in the Beat Lab for ' + n + ' min'; }, tgt:[1, 3, 6] });
  PP.addOrderKind({ id:'rush', stat:'rushPlays', unit:'',   t:function(n){ return n === 1 ? 'Play a round of Rhythm Rush' : 'Play ' + n + ' rounds of Rhythm Rush'; }, tgt:[1, 2, 4] });
  PP.addOrderKind({ id:'neb',  stat:'nebMs',     unit:'ms', t:function(n){ return 'Stir the Nebula for ' + n + ' min'; }, tgt:[1, 3, 5] });
  PP.registerAch([
    ['pg_lab',    'In the Groove',     'Play 32 bars in the Beat Lab',     30,  function(){ return PP.get('labBars'); }, 32],
    ['pg_lab2',   'Studio Rat',        'Play 400 bars in the Beat Lab',    90,  function(){ return PP.get('labBars'); }, 400],
    ['pg_rush1',  'On the Beat',       'Finish a round of Rhythm Rush',    20,  function(){ return PP.get('rush'); }, 1],
    ['pg_rushS',  'S-Rank',            'Get an S rank in Rhythm Rush',     80,  function(){ return PP.get('rushS'); }, 1],
    ['pg_rush20k','Hot Streak',        'Score 20,000 in Rhythm Rush',      70,  function(){ return PP.get('rushBest'); }, 20000],
    ['pg_neb5',   'Stargazer',         'Stir the Nebula for 5 minutes',    30,  function(){ return PP.get('nebMs') / 60000; }, 5]
  ]);
})();
