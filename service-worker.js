const CACHE_NAME = "brick-bun-pwa-v29";
const OFFLINE_URL = "/offline.html";

const APP_FILES = [
  "/",
  "/index.html",
  "/menu.html",
  "/account.html",
  "/admin.html",
  "/auth-callback.html",
  "/checkout.html",
  "/login.html",
  "/offline.html",
  "/privacy.html",
  "/signup.html",
  "/terms.html",
  "/manifest.json",
  "/favicon.svg",
  "/styles/style.css",
  "/scripts/app.js",
  "/scripts/pwa.js",
  "/scripts/menu.js",
  "/scripts/menu-catalog.js",
  "/assets/brick-bun-delivery.svg",
  "/assets/icons/icon-192.svg",
  "/assets/icons/icon-512.svg",
  "/assets/icons/icon-maskable.svg"
];

const CLEAN_URL_ALIASES = {
  "/": ["/index.html"], "/index.html": ["/"],
  "/menu.html": ["/menu"], "/menu": ["/menu.html"],
  "/account.html": ["/account"], "/account": ["/account.html"],
  "/admin.html": ["/admin"], "/admin": ["/admin.html"],
  "/auth-callback.html": ["/auth-callback"], "/auth-callback": ["/auth-callback.html"],
  "/checkout.html": ["/checkout"], "/checkout": ["/checkout.html"],
  "/login.html": ["/login"], "/login": ["/login.html"],
  "/offline.html": ["/offline"], "/offline": ["/offline.html"],
  "/privacy.html": ["/privacy"], "/privacy": ["/privacy.html"],
  "/signup.html": ["/signup"], "/signup": ["/signup.html"],
  "/terms.html": ["/terms"], "/terms": ["/terms.html"]
};

function pageCacheKeys(url) {
  const pathname = url.pathname;
  if (pathname === "/" || pathname === "") return ["/", "/index.html"];
  if (pathname.endsWith(".html")) return [pathname, pathname.slice(0, -5)];
  return [pathname, `${pathname}.html`];
}

async function cachePage(cache, request, response) {
  if (!response.ok) return;
  const pathname = new URL(request.url).pathname;
  if (["/auth-callback", "/auth-callback.html"].includes(pathname)) return;

  await cache.put(request, response.clone());
  await Promise.all(pageCacheKeys(new URL(request.url)).map((key) =>
    cache.put(key, response.clone()).catch(() => undefined)
  ));
}

async function getOfflinePage(cache) {
  return (await cache.match("/offline.html")) || (await cache.match("/offline"));
}

let currentCacheProgress = { completed: 0, total: APP_FILES.length, percent: 0, file: "Preparing offline files" };

async function broadcastCacheProgress(completed, total, file) {
  currentCacheProgress = { completed, total, percent: Math.round((completed / total) * 100), file };
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({
    type: "BRICK_BUN_CACHE_PROGRESS",
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    file
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    for (let index = 0; index < APP_FILES.length; index += 1) {
      const file = APP_FILES[index];
      await broadcastCacheProgress(index, APP_FILES.length, file);
      try {
        await cache.add(file);
      } catch (error) {
        console.warn(`Failed to cache ${file}`, error);
      }
    }
    await broadcastCacheProgress(APP_FILES.length, APP_FILES.length, "download complete");

    await Promise.all(Object.entries(CLEAN_URL_ALIASES).map(async ([url, aliases]) => {
      const response = await cache.match(url);
      if (response) await Promise.all(aliases.map((alias) => cache.put(alias, response.clone())));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => (name.startsWith("brick-bun-") || name.startsWith("brickabun-")) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "BRICK_BUN_GET_CACHE_PROGRESS") {
    event.source?.postMessage({ type: "BRICK_BUN_CACHE_PROGRESS", ...currentCacheProgress });
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;


  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cachePage(cache, request, response);
          return response;
        }
        throw new Error(`Page request failed: ${response?.status}`);
      } catch (error) {
        for (const key of pageCacheKeys(url)) {
          const cached = await cache.match(key, { ignoreSearch: true });
          if (cached) return cached;
        }

        const offline = await getOfflinePage(cache);
        if (offline) return offline;
        return new Response("Offline page unavailable", { status: 503 });
      }
    })());
    return;
  }

  const needsConnection = request.method !== "GET" || url.pathname.startsWith("/api/") ||
    url.searchParams.has("__need_connection") || request.headers.get("accept")?.includes("application/json");
  if (needsConnection) {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch (error) {
        const cache = await caches.open(CACHE_NAME);
        const offline = await getOfflinePage(cache);
        return offline || new Response("Internet connection required.", { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    } catch (error) {
      return new Response("Resource unavailable offline.", { status: 503 });
    }
  })());
});