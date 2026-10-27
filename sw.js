const CACHE_NAME = 'press-play-media-v28';
const CORE_ASSETS = [
  './',
  './index.html',
  './vocal-separator.js',
  './update-option.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];


// ---- Update mode (user option) ----------------------------------------
// 'always' (default): app shell + own .js are network-first, so every load checks for updates.
// 'cached': app shell is served straight from cache (fast, works offline, no network check) until
// the user taps "Check now" in Settings, or CACHE_NAME changes. Saved in IndexedDB because a
// service worker can't use localStorage, and so it survives cache cleanup in activate.
function swDb(){ return new Promise((res, rej) => { const r = indexedDB.open('ppSwSettings', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function readMode(){
  try { const db = await swDb(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get('mode'); q.onsuccess = () => res(q.result === 'cached' ? 'cached' : 'always'); q.onerror = () => res('always'); }); }
  catch (e) { return 'always'; }
}
async function writeMode(m){
  try { const db = await swDb(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(m, 'mode'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) {}
}
// Multi-thread (cross-origin isolation) setting: OFF unless the user turns it on in the splitter panel.
async function readIso(){
  try { const db = await swDb(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get('isolate'); q.onsuccess = () => res(q.result === 'on'); q.onerror = () => res(false); }); }
  catch (e) { return false; }
}
async function writeIso(v){
  try { const db = await swDb(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v ? 'on' : 'off', 'isolate'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) {}
}
let isoPromise = null;
const getIso = () => isoPromise || (isoPromise = readIso());

let modePromise = null;
const getMode = () => modePromise || (modePromise = readMode());

async function refreshShell(){
  try {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_ASSETS.map(async (u) => {
      const r = await fetch(new Request(u, { cache: 'reload' }));
      if (r && r.ok) await cache.put(u, r);
    }));
    return true;
  } catch (e) { return false; }
}

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'set-update-mode' && (d.mode === 'always' || d.mode === 'cached')) {
    modePromise = Promise.resolve(d.mode);
    event.waitUntil(writeMode(d.mode));
  } else if (d.type === 'set-isolation') {
    isoPromise = Promise.resolve(!!d.on);
    event.waitUntil(writeIso(!!d.on).then(() => { if (event.source) event.source.postMessage({ type: 'isolation-set', on: !!d.on }); }));
  } else if (d.type === 'check-now') {
    event.waitUntil(refreshShell().then((ok) => { if (event.source) event.source.postMessage({ type: 'check-done', ok }); }));
  }
});

async function shellCacheFirst(req){
  const cached = (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match('./index.html') : null);
  return cached || networkFirst(req);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// The app shell (index.html / the page itself) goes network-first: try to
// fetch the latest copy from the server on every load, and cache whatever
// comes back. That's the "search for an update" - it happens automatically
// on each visit, with no need to remember to bump CACHE_NAME every deploy.
// If the network request fails outright - offline, no signal, DNS hiccup -
// that's the "skip it" case: fall back to whatever's already cached rather
// than erroring, so the player still opens with the last-known-good copy.
// An identical response from the server (no real update) just re-caches
// the same bytes - harmless, and cheaper than trying to diff it ourselves.
function isAppShellRequest(req){
  const url = new URL(req.url);
  const ownJs = url.origin === self.location.origin && url.pathname.endsWith('.js'); // vocal-separator.js etc: always check for updates
  return req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/') || ownJs;
}

async function networkFirst(req){
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok){
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(req);
    return cached || caches.match('./index.html');
  }
}

// Everything else (icons, manifest) rarely changes, so stays cache-first -
// no reason to hit the network for an icon on every single load. Anything
// missing from the cache still falls back to the network once.
//
// Range requests (byte-range GETs) are never cached: the Cache API throws
// on 206 Partial Content responses, and caches.match() only keys on the
// URL - not the Range header - so a cached partial response could get
// served back for a completely different byte range than what was asked
// for. Media elements rely on correct, consistent Range handling to
// scrub/stream; get this wrong and the browser gives up on range support
// mid-playback and restarts the download from scratch, which looks like
// constant stalling/resetting. So: Range requests just go straight to the
// network, untouched, no caching involved.
async function cacheFirst(req){
  if (req.headers.has('range')) {
    return fetch(req);
  }
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok && fresh.status !== 206){
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    return cached; // nothing to fall back to; request just fails
  }
}

// ---- Cross-origin isolation ---------------------------------------------
// GitHub Pages can't send COOP/COEP headers, so this adds them to our own responses. That turns on
// SharedArrayBuffer, which lets the stem splitter run its AI engine on several CPU threads (much faster).
// COEP 'credentialless' (not 'require-corp') keeps CDN scripts and remote images/audio working as before.
// Browsers that don't know it simply ignore it. Optional: only active when the user ticks "Multi-thread" in the splitter panel (then the app reloads).
function isolate(resp, req){
  try {
    if (!resp || resp.status === 0 || resp.type === 'opaque' || resp.type === 'opaqueredirect') return resp;
    if (new URL(req.url).origin !== self.location.origin) return resp;
    const h = new Headers(resp.headers);
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'credentialless');
    h.set('Cross-Origin-Resource-Policy', 'same-origin');
    const nullBody = resp.status === 101 || resp.status === 204 || resp.status === 205 || resp.status === 304;
    return new Response(nullBody ? null : resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
  } catch (e) { return resp; }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Big AI model downloads from Hugging Face skip this cache; the app stores them itself.
  if (/(^|\.)(huggingface\.co|hf\.co)$/.test(new URL(event.request.url).hostname)) return;
  event.respondWith((async () => {
    const r = !isAppShellRequest(event.request) ? await cacheFirst(event.request)
      : (await getMode()) === 'cached' ? await shellCacheFirst(event.request) : await networkFirst(event.request);
    return (await getIso()) ? isolate(r, event.request) : r;
  })());
});
