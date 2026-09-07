import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Command Center builds in a staging copy, swaps the finished .next into
  // place and restarts the app, so nothing here needs to know about deploys.
  reactStrictMode: true,

  // pdfkit reads its built-in font metrics (Helvetica.afm and friends) from
  // its own package directory at runtime. Bundling it would strip those files
  // and the first invoice PDF would fail with ENOENT, so it is required from
  // node_modules as-is instead.
  serverExternalPackages: ["pdfkit"],

  // Dev only. Next refuses to serve /_next/static chunks to a page loaded from
  // a host it does not recognise, which is a sensible default and a baffling
  // symptom: the page renders from server HTML, the scripts are blocked, React
  // never hydrates, and every button silently does nothing.
  //
  // Add any host you actually open the dev server on. The 169.254.x address is
  // the link-local one this machine surfaces; if it changes, the dev server
  // prints the blocked host in its output — add that.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "169.254.83.107",
  ],

  async redirects() {
    // The vanilla build was two static files. Anyone holding an old
    // link — a PM with the enquiry form bookmarked, most of all —
    // lands where they expect.
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/outreach.html", destination: "/outreach", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        // The service worker must not be served from a stale cache, or a
        // bad one can outlive its own replacement.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
