/* Settings option: check for app updates on every load (default) or use the cached copy. Talks to sw.js. */
(() => {
  const KEY = 'ppUpdateMode';
  const get = () => { try { return localStorage.getItem(KEY) === 'cached' ? 'cached' : 'always'; } catch (e) { return 'always'; } };
  const send = (msg) => navigator.serviceWorker && navigator.serviceWorker.ready.then(r => r.active && r.active.postMessage(msg)).catch(() => {});
  send({ type: 'set-update-mode', mode: get() });            // keep the worker in sync with this setting

  function build() {
    const pane = document.getElementById('sidebar-pane-settings');
    if (!pane || document.getElementById('pp-upd-row')) return !!pane;
    const row = document.createElement('div');
    row.id = 'pp-upd-row'; row.className = 'settings-row'; row.style.marginTop = '12px';
    row.innerHTML = '<div class="settings-row-text"><div class="settings-row-title">Check for updates on every load</div>' +
      '<div class="settings-row-sub">On: the app fetches the newest version each time it opens. Off: opens instantly from the saved copy (works offline) until you check manually.</div>' +
      '<button type="button" id="pp-upd-now" style="margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid var(--line,#555);background:transparent;color:inherit;font:600 12px system-ui">Check for update now</button> <span id="pp-upd-msg" style="font-size:12px;opacity:.7"></span></div>' +
      '<label class="settings-switch"><input type="checkbox" id="pp-upd-toggle"><span class="settings-switch-track"><span class="settings-switch-thumb"></span></span></label>';
    pane.appendChild(row);
    const cb = row.querySelector('#pp-upd-toggle'), msg = row.querySelector('#pp-upd-msg');
    cb.checked = get() === 'always';
    cb.onchange = () => { const m = cb.checked ? 'always' : 'cached'; try { localStorage.setItem(KEY, m); } catch (e) {} send({ type: 'set-update-mode', mode: m }); };
    row.querySelector('#pp-upd-now').onclick = () => { msg.textContent = 'Checking…'; send({ type: 'check-now' }); };
    return true;
  }
  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'check-done') return;
    const msg = document.getElementById('pp-upd-msg');
    if (e.data.ok) { if (msg) msg.textContent = 'Updated. Reloading…'; setTimeout(() => location.reload(), 600); }
    else if (msg) msg.textContent = 'Could not reach the server.';
  });
  let n = 0; const iv = setInterval(() => { if (build() || ++n > 40) clearInterval(iv); }, 250);
  setInterval(() => build(), 3000);                            // re-add if settings get re-rendered
})();
