const STATIC_CACHE = 'readfox-static-v1';
const PRECACHE_URLS = ['/offline.html', '/offline-reader.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PURGE_RUNTIME_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))),
        ),
    );
  }
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/logo.png' ||
    pathname === '/offline.html' ||
    pathname === '/offline-reader.js'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses or runtime env bootstrap script.
  if (url.pathname.startsWith('/api/') || url.pathname === '/__env.js') return;

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(req).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(req);
        if (response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone));
        }
        return response;
      }),
    );
    return;
  }

  // Never cache authenticated navigation HTML; only fall back to the standalone
  // offline reader shell when the network is unreachable.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const fallback = await caches.match('/offline.html');
        return fallback || Response.error();
      }),
    );
  }
});
