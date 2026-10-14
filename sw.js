// Service worker: makes the app work offline (app shell cache).
const CACHE = 'milliondollarhour-v2';
const SHELL = ['./', 'index.html', 'app.js', 'logic.js', 'config.js', 'style.css', 'manifest.json', 'icon-192.png', 'icon-512.png', 'privacy.html'];
const CDN = ['https://cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache API / auth traffic (Supabase etc.).
  if (url.origin !== location.origin && !CDN.some((c) => req.url.startsWith(c))) return;

  // Network first, fall back to cache: users get updates, offline still works.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          // Only page navigations may fall back to the app shell. Returning index.html for a
          // failed script/style request makes the browser parse HTML as JavaScript.
          return req.mode === 'navigate' ? caches.match('index.html') : Response.error();
        })
      )
  );
});
