/* Crafty Central — service worker: cache the app shell for offline + install */
const CACHE = 'crafty-central-v9';
const SHELL = [
  '.',
  'index.html',
  'outreach.html',
  'css/app.css',
  'firebase-config.js',
  'js/cloud.js',
  'js/icons.js',
  'js/store.js',
  'js/ui.js',
  'js/app.js',
  'js/views/dashboard.js',
  'js/views/calendar.js',
  'js/views/schedule.js',
  'js/views/menus.js',
  'js/views/chat.js',
  'js/views/directory.js',
  'js/views/finances.js',
  'icon.svg',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* network-first for same-origin, falling back to cache offline */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // revalidate: never trust heuristic HTTP caching
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
