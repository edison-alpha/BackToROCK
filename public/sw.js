// BackToRock service worker: lets the app install and open offline once it has been loaded.
// Pages are network-first (fresh when online, cached when offline). Big static files (score engine, soundfont,
// fonts, images) are cache-first, since their URLs do not change. API and sign-in calls are never cached.
const VERSION = "v2"; // bumped so installed copies pick up the drum kit files
const PAGES = `btr-pages-${VERSION}`;
const ASSETS = `btr-assets-${VERSION}`;
const PRECACHE = ["/", "/login", "/onboarding", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![PAGES, ASSETS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/_next/image") ||
  url.pathname.startsWith("/alphatab/") ||
  url.pathname.startsWith("/kits/") ||
  url.pathname.startsWith("/ALL%20MICS/") ||
  url.pathname.startsWith("/icons/") ||
  /\.(png|jpg|jpeg|svg|webp|woff2?|sf2|sf3|m4a)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGES).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/")) || Response.error()),
    );
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
