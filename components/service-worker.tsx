"use client";

/* ============================================================
   Service worker registration — and, just as importantly, the
   upgrade path away from the old one.

   The vanilla build shipped a service worker at /sw.js with a
   fixed list of files to cache. Anyone who opened that build has
   it registered for this origin, and a service worker outlives
   the app that installed it: it keeps intercepting requests and
   can hand back a stale asset, which breaks hydration — the page
   renders from the server HTML and then nothing responds to a
   click.

   So in development we actively tear down whatever is registered
   and bin its caches, rather than leaving a stranger in charge of
   the requests. In production the new worker takes over cleanly
   (it skips waiting, claims clients, and deletes every cache but
   its own), so registering is enough.
   ============================================================ */

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Dev: no worker should be in the way of the dev server.
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(async (results) => {
          if (!results.some(Boolean)) return;
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          // The page is still being served by the worker we just
          // removed, so reload once to get out from under it.
          window.location.reload();
        })
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
