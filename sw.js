const CACHE_NAME = 'press-play-media-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
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
  return req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
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
async function cacheFirst(req){
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok){
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    return cached; // nothing to fall back to; request just fails
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    isAppShellRequest(event.request) ? networkFirst(event.request) : cacheFirst(event.request)
  );
});
