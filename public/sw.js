const CACHE_VERSION = 'v4';
const APP_SHELL_CACHE = `safra-vision-app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `safra-vision-runtime-${CACHE_VERSION}`;
const BASE_URL = self.registration.scope;
const APP_SHELL = [
  `${BASE_URL}`,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}favicon.ico`,
  `${BASE_URL}placeholder.svg`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function networkFirstNavigate(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match(`${BASE_URL}index.html`));
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => undefined);

  return cached || networkPromise || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && (url.pathname.includes('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
