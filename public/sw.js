/* ============================================================
   Crafty Central — service worker

   Rewritten for the Next.js build. The old one cached a fixed
   list of source files; there is no such list any more, and the
   filenames now carry content hashes.

   The rules:
   - /_next/static/* is immutable (hashed filenames) → cache first.
   - Everything else same-origin and GET → network first, falling
     back to whatever was cached, so a truck with no signal still
     opens the last screens someone looked at.
   - API calls are never cached. Stale job data read as current is
     worse than an honest error on set.

   The cache version below must change whenever this file does —
   activate() deletes every cache that is not the current one, and
   that is what clears out the old vanilla-build caches too.
   ============================================================ */

const CACHE = "crafty-central-next-v1";
const OFFLINE_FALLBACK = "/";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(OFFLINE_FALLBACK))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Never cache the API: a stale call sheet is a wrong call sheet.
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets never change under a given name.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: true })
          .then((hit) => hit || caches.match(OFFLINE_FALLBACK))
          .then((hit) => hit || Response.error()),
      ),
  );
});
