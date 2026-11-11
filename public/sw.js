// Offline shell: cache-first for app assets, network-first for navigation,
// stale-while-revalidate for map tiles and fonts.
const VERSION = 'wayfare-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.includes('nominatim')) return; // never cache geocoding

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { caches.open(VERSION).then((c) => c.put('./index.html', r.clone())); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  const runtime = url.hostname.includes('basemaps.cartocdn.com') || url.hostname.includes('fonts.g');
  if (url.origin === location.origin || runtime) {
    e.respondWith(
      caches.open(VERSION + (runtime ? '-rt' : '')).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      }),
    );
  }
});
