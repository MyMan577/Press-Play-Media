/* Weapon Ball online: Duel and Draft between two phones (QR Link, ../qrlink).
 *
 * Both phones run the same fight: same balls, same arena size, same random
 * seed, stepped at a fixed 60 per second (so a 120 Hz phone doesn't run it
 * twice as fast). The host leads: the guest never runs ahead of it, the host
 * sends small corrections (ball positions, health and the random state) twice
 * a second in case anything drifts, and the host decides who won each round.
 *
 * Host plays RED, guest plays BLUE.
 *   Duel:  each player secretly picks a ball, best of 3.
 *   Draft: the solo Draft screens, with the friend taking the bot's turns.
 */
(function(){
  'use strict';
  var STEP = 1 / 60;
  var SYNC_EVERY = 30;   // ticks between corrections
  var TICK_EVERY = 3;    // ticks between "I'm at tick N" notes

  var OL = {
    conn: null, role: null, kind: null,      // kind: 'duel' | 'draft'
    battle: false, localEnd: null, pendingResult: null,
    hostTick: 0, corrections: {}, rng: null, origRandom: Math.random,
    acc: 0, last: 0,
    duel: null, draftDeploy: { mine: null, theirs: null }, duelPick: { mine: null, theirs: null }
  };
  window.__wbOnline = OL;
  var mySide = function(){ return OL.role === 'host' ? 'red' : 'blue'; };

  // ---------- seeded random (mulberry32), swapped in only while the fight steps ----------
  function makeRng(seed){
    var s = seed >>> 0;
    var f = function(){
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.get = function(){ return s; };
    f.set = function(v){ s = v >>> 0; };
    return f;
  }
  function seeded(fn){
    var orig = Math.random; Math.random = OL.rng;
    try { return fn(); } finally { Math.random = orig; }
  }

  // ---------- UI ----------
  var css = document.createElement('style');
  css.textContent =
    '#wbOlChip{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9500;display:none;align-items:center;gap:8px;padding:6px 8px 6px 12px;' +
      'border-radius:999px;background:rgba(14,16,28,.9);color:#eef;font:600 13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35)}' +
    '#wbOlChip button{border:0;border-radius:999px;padding:5px 10px;background:rgba(255,255,255,.15);color:#fff;font:600 12px system-ui,sans-serif}' +
    '#wbOl{position:fixed;inset:0;z-index:9400;display:none;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;padding:56px 14px 20px;' +
      'background:rgba(10,12,22,.96);color:#eef;font:14px system-ui,sans-serif;overflow-y:auto;text-align:center}' +
    '#wbOl h2{margin:0;font:700 20px Orbitron,system-ui,sans-serif;letter-spacing:.06em}' +
    '#wbOl p{margin:0;color:#aab;max-width:340px}' +
    '#wbOl .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}' +
    '#wbOl .big{border:0;border-radius:12px;padding:12px 18px;font:700 15px system-ui,sans-serif;color:#fff;background:#3a6df0;min-width:130px}' +
    '#wbOl .big.alt{background:#c07820}' +
    '#wbOl .big.ghost{background:rgba(255,255,255,.12)}' +
    '#wbOl .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;width:100%;max-width:560px}' +
    '#wbOl .ball{border:2px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.05);color:#eef;padding:8px 4px;font:600 11px system-ui,sans-serif}' +
    '#wbOl .ball .i{font-size:24px;display:block;margin-bottom:2px}' +
    '#wbOl .ball.sel{border-color:#ffcc44;background:rgba(255,204,68,.15)}' +
    '#wbOl .score{font:700 16px system-ui,sans-serif}' +
    '#wbOlResult{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9450;display:none;flex-direction:column;align-items:center;gap:10px;' +
      'padding:18px 22px;border-radius:16px;background:rgba(10,12,22,.92);color:#fff;font:700 18px system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.5)}' +
    '#wbOlResult .sub{font:500 13px system-ui,sans-serif;color:#bbc}' +
    '#wbOlResult button{border:0;border-radius:10px;padding:10px 16px;font:700 14px system-ui,sans-serif;color:#fff;background:#3a6df0}' +
    '#wbOlResult button.ghost{background:rgba(255,255,255,.14)}';
  document.head.appendChild(css);

  var chip = el('div', { id: 'wbOlChip' });
  chip.innerHTML = '<span id="wbOlChipTxt">🌐 Online</span><button type="button" id="wbOlLeave">Leave</button>';
  document.body.appendChild(chip);
  document.getElementById('wbOlLeave').onclick = function(){ leave(true); };
  var panel = el('div', { id: 'wbOl' }); document.body.appendChild(panel);
  var result = el('div', { id: 'wbOlResult' }); document.body.appendChild(result);

  function el(tag, props){ var e = document.createElement(tag); for (var k in props) e[k] = props[k]; return e; }
  function chipText(t){ document.getElementById('wbOlChipTxt').textContent = t; }
  function showPanel(html){ panel.innerHTML = html; panel.style.display = 'flex'; }
  function hidePanel(){ panel.style.display = 'none'; panel.innerHTML = ''; }
  function hideResult(){ result.style.display = 'none'; result.innerHTML = ''; }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  // Online button next to the mode buttons
  (function addButton(){
    var draftBtn = document.getElementById('btnDraft');
    if (!draftBtn) return;
    var b = el('button', { className: 'mode-btn', id: 'btnOnline', type: 'button', textContent: '🌐 ONLINE' });
    b.style.borderColor = '#3a6df0'; b.style.color = '#3a6df0';
    b.onclick = openLink;
    draftBtn.insertAdjacentElement('afterend', b);
  })();

  function openLink(){
    if (OL.conn) { showMenu(); return; }
    if (state !== 'setup') { var r = document.getElementById('btnReset'); if (r) r.click(); }
    if (!window.QRLink) { alert("Online play isn't available."); return; }
    QRLink.open({
      app: 'weaponball', accent: '#3a6df0',
      title: 'Play online',
      hint: 'Duel or Draft against a friend. One phone hosts, the other joins.',
      onConnected: start
    });
  }

  // ---------- session ----------
  function start(conn, role){
    OL.conn = conn; OL.role = role; OL.kind = null;
    conn.on('data', onMessage);
    conn.on('close', function(){ if (OL.conn === conn) leave(false); });
    chip.style.display = 'flex';
    chipText('🌐 Online · you are ' + (role === 'host' ? 'RED' : 'BLUE'));
    showMenu();
  }

  function showMenu(){
    stopBattle(); hideResult();
    if (OL.kind === 'draft') endDraftUi();
    OL.kind = null;
    if (OL.role === 'host') {
      showPanel('<h2>PLAY ONLINE</h2><p>You are <b style="color:#ff5555">RED</b>. Pick how to play.</p>' +
        '<div class="row"><button class="big" id="wbOlDuel">⚔ DUEL</button><button class="big alt" id="wbOlDraft">🏆 DRAFT</button></div>' +
        '<p>Duel: each of you secretly picks a ball. Best of 3.<br>Draft: take turns building a team of 18, then three 6-on-6 battles.</p>');
      document.getElementById('wbOlDuel').onclick = function(){ send({ t: 'mode', kind: 'duel' }); beginDuel(); };
      document.getElementById('wbOlDraft').onclick = function(){ send({ t: 'mode', kind: 'draft' }); beginDraft(); };
    } else {
      showPanel('<h2>PLAY ONLINE</h2><p>You are <b style="color:#5599ff">BLUE</b>.</p><p>Waiting for the host to pick Duel or Draft…</p>');
    }
  }

  function leave(byMe){
    var c = OL.conn; OL.conn = null;
    if (byMe && c) { try { c.close(); } catch(e){} }
    stopBattle(); hideResult(); hidePanel();
    if (OL.kind === 'draft') { endDraftUi(); try { closeDraftMode(); } catch(e){} }
    OL.kind = null; OL.role = null;
    chip.style.display = 'none';
    var r = document.getElementById('btnReset'); if (r) r.click();
    if (!byMe) alert('Your friend left.');
  }

  function send(m){ if (OL.conn) OL.conn.send(m); }

  function onMessage(m){
    if (!m) return;
    switch (m.t) {
      case 'mode': if (OL.role === 'guest') { if (m.kind === 'duel') beginDuel(); else beginDraft(); } break;
      case 'menu': if (OL.role === 'guest') showMenu(); break;
      case 'dpick': OL.duelPick.theirs = m.id; maybeGoDuel(); break;
      case 'pick': if (OL.kind === 'draft') remoteDraftPick(m.id); break;
      case 'deploy': OL.draftDeploy.theirs = m.list; maybeGoDraft(); break;
      case 'go': if (OL.role === 'guest') launch(m); break;
      case 'tk': OL.hostTick = Math.max(OL.hostTick, m.n); break;
      case 'sync': OL.corrections[m.n] = m; OL.hostTick = Math.max(OL.hostTick, m.n); break;
      case 'result': if (OL.role === 'guest') { OL.pendingResult = m.side; finishRound(m.side); } break;
    }
  }

  // ---------- the fight ----------
  function setChecked(id, v){ var e = document.getElementById(id); if (e) e.checked = !!v; }

  function launch(cfg){
    hidePanel(); hideResult();
    OL.duelPick = { mine: null, theirs: null };
    if (window.setMode && state === 'setup') { try { setMode(2); } catch(e){} }
    battleMode = 2;
    RL.active = false; window._cmActive = false;
    var isDraft = cfg.kind === 'draft';
    DRAFT.active = isDraft; window._draftRoundHooked = isDraft;   // draft: battle ends when a whole side is down
    var aw = isDraft ? 720 : MODE_SIZES[2][0], ah = isDraft ? 520 : MODE_SIZES[2][1];
    canvas.width = aw; canvas.height = ah; W = aw; H = ah;
    canvas.style.aspectRatio = aw + ' / ' + ah;
    setChecked('toggleHazards', cfg.hazards); setChecked('togglePowerups', cfg.powerups);
    ['Red','Blue','Green','Orange'].forEach(function(c){ setChecked('playMode' + c, false); setChecked('autoShoot' + c, true); });
    selectedTypes.red = cfg.red[0]; selectedTypes.blue = cfg.blue[0];
    if (isDraft) document.getElementById('draftOverlay').style.display = 'none';

    initAudio();
    OL.rng = makeRng(cfg.seed);
    seeded(function(){
      initGame();
      spawnRest(cfg.red, 'red'); spawnRest(cfg.blue, 'blue');
    });
    state = 'running';
    document.getElementById('btnStart').disabled = true;
    document.querySelectorAll('.weapon-btn').forEach(function(b){ b.disabled = true; });
    document.getElementById('logBox').innerHTML = '';
    initMusic(); startMusicTier(0);
    updateHUD();

    OL.battle = true; OL.localEnd = null; OL.pendingResult = null;
    OL.hostTick = 0; OL.corrections = {}; OL.acc = 0; OL.last = 0;
    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(frame);
  }

  // Extra balls for 6-on-6, placed the way the solo Draft places them.
  function spawnRest(list, side){
    if (list.length < 2) return;
    var c = SIDE_COLORS[side], spacing = Math.min(80, (H - BALL_R * 4) / 6), startY = H / 2 - spacing * 2.5;
    for (var i = 1; i < list.length; i++) {
      var t = BALL_TYPES.find(function(x){ return x.id === list[i]; });
      var bx = side === 'red' ? 90 + (i % 2) * 25 : W - 90 - (i % 2) * 25;
      var by = Math.max(BALL_R + 10, Math.min(H - BALL_R - 10, startY + i * spacing));
      balls.push(makeBall(bx, by, c.ball, c.glow, t, side.toUpperCase() + ' ' + t.name + ' Ball', side));
    }
    var lead = balls.find(function(b){ return b.side === side; });
    if (lead) lead.y = Math.max(BALL_R + 10, Math.min(H - BALL_R - 10, startY));
  }

  function step(){
    seeded(function(){ update(); });
    if (OL.role === 'host') {
      if (tick % TICK_EVERY === 0) send({ t: 'tk', n: tick });
      if (tick % SYNC_EVERY === 0) send({ t: 'sync', n: tick, r: OL.rng.get(), b: balls.map(ballState) });
    } else {
      var c = OL.corrections[tick];
      if (c) { applySync(c); delete OL.corrections[tick]; }
    }
  }
  // exact values: even tiny rounding here would nudge the guest's fight off course
  function ballState(b){ return [b.x, b.y, b.vx, b.vy, b.hp, b.alive ? 1 : 0]; }
  function applySync(c){
    OL.rng.set(c.r);
    if (c.b.length !== balls.length) return;   // drifted into a different set of balls: random state still realigns
    c.b.forEach(function(s, i){
      var b = balls[i];
      var d = Math.abs(b.x - s[0]) + Math.abs(b.y - s[1]);
      OL.drift = Math.max(OL.drift || 0, d);   // how far apart the phones got (for testing)
      if (d > 3 && OL.driftLog && OL.driftLog.length < 20) OL.driftLog.push(c.n + ' #' + i + ' ' + b.ballType.id + ' ' + d.toFixed(1) + ' hp ' + b.hp.toFixed(1) + '/' + s[4]);
      b.x = s[0]; b.y = s[1]; b.vx = s[2]; b.vy = s[3]; b.hp = s[4];
    });
  }

  function frame(ts){
    if (!OL.battle) return;
    if (!OL.last) OL.last = ts;
    OL.acc += Math.min(0.25, (ts - OL.last) / 1000); OL.last = ts;
    var steps = 0, maxSteps = 4;
    while (OL.acc >= STEP && steps < maxSteps && state === 'running') {
      if (OL.role === 'guest' && tick >= OL.hostTick) { OL.acc = Math.min(OL.acc, STEP); break; }  // never run ahead of the host
      step(); OL.acc -= STEP; steps++;
    }
    if (window._cmActive && window._cmFrameHook) window._cmFrameHook();
    draw();
    if (OL.battle) animId = requestAnimationFrame(frame);
  }

  function stopBattle(){
    OL.battle = false;
    if (animId) cancelAnimationFrame(animId);
    if (state === 'running') { state = 'over'; try { stopMusic(); } catch(e){} }
  }

  // Every way a fight ends lands here while online.
  var prevEnd = window.endGame;
  window.endGame = function(winner){
    if (!OL.battle && !OL.kind) return prevEnd.apply(this, arguments);
    var side = winner && (winner.side || (winner.originalRef && winner.originalRef.side));
    state = 'over'; OL.battle = false;
    try { stopMusic(); } catch(e){}
    if (OL.role === 'host') { send({ t: 'result', side: side }); finishRound(side); }
    else { OL.localEnd = side; if (OL.pendingResult) finishRound(OL.pendingResult); }
  };

  var roundShown = false;
  function finishRound(side){
    if (OL.role === 'guest') { if (OL.battle) stopBattle(); }
    if (roundShown) return; roundShown = true;
    setTimeout(function(){ roundShown = false; }, 500);
    draw();
    var won = side === mySide();
    if (OL.kind === 'duel') duelRoundOver(won);
    else if (OL.kind === 'draft') draftRoundOver(won);
  }

  // ---------- Duel ----------
  function beginDuel(){
    OL.kind = 'duel';
    OL.duel = { me: 0, them: 0, round: 0 };
    OL.duelPick = { mine: null, theirs: null };
    duelPickScreen();
  }
  function duelScore(){ return '<div class="score">YOU ' + OL.duel.me + ' – ' + OL.duel.them + ' FRIEND</div>'; }
  function duelPickScreen(){
    OL.duelPick.mine = null;   // their pick may already be here; it's cleared when a fight starts
    var color = mySide() === 'red' ? '#ff5555' : '#5599ff';
    var html = '<h2>DUEL · ROUND ' + (OL.duel.round + 1) + '</h2>' + duelScore() +
      '<p>Pick your ball. Your friend can’t see it until the fight starts. You are <b style="color:' + color + '">' + mySide().toUpperCase() + '</b>.</p><div class="grid">';
    BALL_TYPES.forEach(function(t){
      html += '<button type="button" class="ball" data-id="' + esc(t.id) + '"><span class="i">' + t.icon + '</span>' + esc(t.name) + '</button>';
    });
    html += '</div><div class="row"><button class="big ghost" id="wbOlBack">Back</button></div>';
    showPanel(html);
    panel.querySelectorAll('.ball').forEach(function(b){
      b.onclick = function(){
        if (OL.duelPick.mine) return;
        OL.duelPick.mine = b.getAttribute('data-id');
        b.classList.add('sel');
        send({ t: 'dpick', id: OL.duelPick.mine });
        var t = BALL_TYPES.find(function(x){ return x.id === OL.duelPick.mine; });
        showPanel('<h2>DUEL · ROUND ' + (OL.duel.round + 1) + '</h2>' + duelScore() +
          '<p>You picked <b>' + t.icon + ' ' + esc(t.name) + '</b>.</p><p>Waiting for your friend…</p>');
        maybeGoDuel();
      };
    });
    document.getElementById('wbOlBack').onclick = backToMenu;
  }
  function maybeGoDuel(){
    if (OL.role !== 'host' || OL.kind !== 'duel' || !OL.duelPick.mine || !OL.duelPick.theirs) return;
    var cfg = { t: 'go', kind: 'duel', seed: (Math.random() * 4294967296) >>> 0,
      red: [OL.duelPick.mine], blue: [OL.duelPick.theirs],
      hazards: !!(document.getElementById('toggleHazards') || {}).checked, powerups: !!(document.getElementById('togglePowerups') || {}).checked };
    send(cfg); launch(cfg);
  }
  function duelRoundOver(won){
    OL.duel.round++;
    if (won) OL.duel.me++; else OL.duel.them++;
    var over = OL.duel.me >= 2 || OL.duel.them >= 2;
    result.innerHTML = '<div>' + (won ? '🏆 You win the round!' : '💥 Your friend wins the round') + '</div>' +
      '<div class="sub">YOU ' + OL.duel.me + ' – ' + OL.duel.them + ' FRIEND</div>' +
      (over ? '<div>' + (OL.duel.me > OL.duel.them ? '🎉 You win the duel!' : 'Your friend wins the duel') + '</div>' +
              '<div class="row" style="display:flex;gap:8px"><button id="wbOlAgain">Duel again</button><button class="ghost" id="wbOlMenu">Menu</button></div>'
            : '<div class="sub">Next round coming up…</div>');
    result.style.display = 'flex';
    if (over) {
      document.getElementById('wbOlAgain').onclick = function(){ hideResult(); OL.duel = { me: 0, them: 0, round: 0 }; duelPickScreen(); };
      document.getElementById('wbOlMenu').onclick = backToMenu;
    } else setTimeout(function(){ if (OL.kind === 'duel') { hideResult(); duelPickScreen(); } }, 2200);
  }
  function backToMenu(){ send({ t: 'menu' }); showMenu(); }

  // ---------- Draft (the solo screens, with the friend in the bot's seat) ----------
  var orig = {};
  function beginDraft(){
    endDraftUi();   // put the originals back first if a draft was already running
    OL.kind = 'draft';
    hidePanel();
    orig.botPick = window.draftBotPick; orig.playerPick = window.draftPlayerPick;
    orig.confirm = window.draftConfirmDeploy; orig.renderPick = window.draftRenderPickScreen;
    orig.renderDeploy = window.draftRenderDeployScreen; orig.showResult = window.draftShowResult;
    window.draftBotPick = function(){};                       // the friend picks instead
    window.draftPlayerPick = function(id){
      if (DRAFT.pickTurn !== 'player') return;
      var before = DRAFT.picksDone;
      orig.playerPick(id);
      if (DRAFT.picksDone > before) send({ t: 'pick', id: id });
    };
    window.draftConfirmDeploy = function(){
      if (DRAFT.playerDeployed.length !== 6 || OL.draftDeploy.mine) return;
      OL.draftDeploy.mine = DRAFT.playerDeployed.slice();
      send({ t: 'deploy', list: OL.draftDeploy.mine });
      var b = document.getElementById('draftDeployConfirm'); if (b) { b.disabled = true; b.textContent = 'Waiting for your friend…'; }
      maybeGoDraft();
    };
    window.draftRenderPickScreen = function(){ orig.renderPick(); relabel(); };
    window.draftRenderDeployScreen = function(){ orig.renderDeploy(); relabel(); };
    window.draftShowResult = function(){ orig.showResult(); relabel(); addDraftResultButtons(); };

    startDraftMode();
    var diff = document.getElementById('draftDifficultyRow'); if (diff) diff.style.display = 'none';
    var exit = document.getElementById('draftExitBtn'); if (exit) { exit.dataset.olHidden = '1'; exit.style.display = 'none'; }
    OL.draftDeploy = { mine: null, theirs: null };
    if (OL.role === 'guest') DRAFT.pickTurn = 'bot';           // the host picks first
    draftRenderPickScreen();
  }
  function endDraftUi(){
    if (!orig.botPick) return;
    window.draftBotPick = orig.botPick; window.draftPlayerPick = orig.playerPick;
    window.draftConfirmDeploy = orig.confirm; window.draftRenderPickScreen = orig.renderPick;
    window.draftRenderDeployScreen = orig.renderDeploy; window.draftShowResult = orig.showResult;
    orig = {};
    var diff = document.getElementById('draftDifficultyRow'); if (diff) diff.style.display = '';
    var exit = document.getElementById('draftExitBtn'); if (exit && exit.dataset.olHidden) { exit.style.display = ''; delete exit.dataset.olHidden; }
    DRAFT.active = false; window._draftRoundHooked = false;
    document.getElementById('draftOverlay').style.display = 'none';
  }

  // The friend's pick, applied the way the bot's would be.
  function remoteDraftPick(id){
    if (DRAFT.pickTurn !== 'bot') return;
    if (DRAFT.playerRoster.includes(id) || DRAFT.botRoster.includes(id)) return;
    DRAFT.botRoster.push(id);
    DRAFT.picksDone++; DRAFT.picksThisTurn++;
    if (DRAFT.picksThisTurn >= draftPicksInSegment(DRAFT.picksDone - 1)) draftAdvanceTurn();
    draftRenderPickScreen();
    if (DRAFT.picksDone >= DRAFT_ROSTER_SIZE * 2) setTimeout(function(){ draftBeginBattle(); }, 800);
  }

  function maybeGoDraft(){
    if (OL.role !== 'host' || OL.kind !== 'draft' || !OL.draftDeploy.mine || !OL.draftDeploy.theirs) return;
    var cfg = { t: 'go', kind: 'draft', seed: (Math.random() * 4294967296) >>> 0,
      red: OL.draftDeploy.mine, blue: OL.draftDeploy.theirs, hazards: false, powerups: false };
    send(cfg); startDraftBattle(cfg);
  }
  // guest gets 'go' through launch(); route draft ones through here first
  var baseLaunch = launch;
  launch = function(cfg){
    if (cfg.kind === 'draft') { startDraftBattle(cfg); return; }
    baseLaunch(cfg);
  };
  function startDraftBattle(cfg){
    var mine = OL.role === 'host' ? cfg.red : cfg.blue, theirs = OL.role === 'host' ? cfg.blue : cfg.red;
    DRAFT.playerDeployed = mine.slice(); DRAFT.botDeployed = theirs.slice();
    DRAFT.playerUsed.push.apply(DRAFT.playerUsed, mine); DRAFT.botUsed.push.apply(DRAFT.botUsed, theirs);
    OL.draftDeploy = { mine: null, theirs: null };
    log('🏆 Online draft battle ' + DRAFT.battleRound + '/3 — RED vs BLUE. You are ' + mySide().toUpperCase() + '.', 'sys');
    baseLaunch(cfg);
  }

  function draftRoundOver(won){
    if (won) DRAFT.playerScore++; else DRAFT.botScore++;
    result.innerHTML = '<div>' + (won ? '🏆 You win battle ' + DRAFT.battleRound + '!' : '💥 Your friend wins battle ' + DRAFT.battleRound) + '</div>' +
      '<div class="sub">YOU ' + DRAFT.playerScore + ' – ' + DRAFT.botScore + ' FRIEND</div>';
    result.style.display = 'flex';
    setTimeout(function(){
      hideResult();
      document.getElementById('draftOverlay').style.display = 'block';
      if (DRAFT.playerScore >= 2 || DRAFT.botScore >= 2 || DRAFT.battleRound >= 3) draftShowResult();
      else draftBeginBattle();
    }, 1800);
  }

  function addDraftResultButtons(){
    var scr = document.getElementById('draftResultScreen');
    if (!scr) return;
    scr.querySelectorAll('button').forEach(function(b){ b.style.display = 'none'; });
    var row = el('div', { className: 'row' }); row.style.cssText = 'display:flex;gap:10px;justify-content:center;margin-top:14px';
    var again = el('button', { textContent: 'Draft again', type: 'button' });
    var menu = el('button', { textContent: 'Menu', type: 'button' });
    [again, menu].forEach(function(b){ b.style.cssText = 'border:0;border-radius:10px;padding:10px 16px;font:700 14px system-ui,sans-serif;color:#fff;background:#3a6df0'; });
    menu.style.background = 'rgba(255,255,255,.15)';
    again.onclick = function(){ if (OL.role === 'host') { send({ t: 'mode', kind: 'draft' }); endDraftUi(); beginDraft(); } else { again.textContent = 'The host starts the next draft'; } };
    menu.onclick = backToMenu;
    row.appendChild(again); row.appendChild(menu); scr.appendChild(row);
  }

  // "Bot" → "Friend" on the draft screens
  function relabel(){
    var root = document.getElementById('draftOverlay'); if (!root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      var v = n.nodeValue, nv = v.replace(/\bBOT'S\b/g, "FRIEND'S").replace(/\bBOT\b/g, 'FRIEND').replace(/\bBot's\b/g, "Friend's").replace(/\bBot\b/g, 'Friend').replace(/\bbot\b/g, 'friend');
      if (nv !== v) n.nodeValue = nv;
    }
  }
})();
