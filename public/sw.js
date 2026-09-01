/* DRISHTI service worker — offline support for the finale demo laptop.
 * Strategies:
 *  - navigations: network-first → cached "/" → /offline.html
 *  - static assets (/_next/static, /icons, /logo.svg): network-first → cache
 *    (network-first even for "immutable" assets because Next DEV reuses chunk
 *    URLs across content edits — cache-first would serve stale code; in a
 *    production build network still wins and the cache covers offline)
 *  - /api/* GET: network-first (4s timeout) → cache → JSON 503
 * Never caches non-GET, non-200, opaque or cross-origin responses. */
const VERSION = "v8";
const PRECACHE = `drishti-${VERSION}`;
const RUNTIME = `drishti-runtime-${VERSION}`;
const RUNTIME_MAX = 60;

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
  "/logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== PRECACHE && k !== RUNTIME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** FIFO-trim a cache to RUNTIME_MAX entries. */
async function trimRuntime() {
  const cache = await caches.open(RUNTIME);
  const keys = await cache.keys();
  if (keys.length > RUNTIME_MAX) {
    await Promise.all(keys.slice(0, keys.length - RUNTIME_MAX).map((k) => cache.delete(k)));
  }
}

/** Cache a response only if it is same-origin, GET-sourced and status 200. */
async function putIfCacheable(request, response) {
  if (request.method !== "GET") return;
  if (response.type === "opaque" || response.status !== 200) return;
  const cache = await caches.open(RUNTIME);
  await cache.put(request, response.clone());
  await trimRuntime();
}

function offlineJson() {
  return new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleNavigate(request) {
  try {
    const response = await fetch(request);
    await putIfCacheable(request, response);
    return response;
  } catch {
    const cachedHome = await caches.match("/");
    if (cachedHome) return cachedHome;
    return (await caches.match("/offline.html")) || Response.error();
  }
}

async function handleApi(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    await putIfCacheable(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineJson();
  } finally {
    clearTimeout(timer);
  }
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/logo.svg"
  );
}

/** Network-first with cache fallback — see header note about DEV chunk reuse. */
async function handleAsset(request) {
  try {
    const response = await fetch(request);
    await putIfCacheable(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return Response.error();
  }
}

async function handleOther(request) {
  try {
    const response = await fetch(request);
    await putIfCacheable(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // offline.html is only for document navigations (handled above)
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(request));
  } else if (url.pathname.startsWith("/api/")) {
    event.respondWith(handleApi(request));
  } else if (isStaticAsset(url)) {
    event.respondWith(handleAsset(request));
  } else {
    event.respondWith(handleOther(request));
  }
});
