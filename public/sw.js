const CACHE_NAME = 'safra-vision-pwa-v2';
const BASE_URL = self.registration.scope;
const APP_SHELL = [
  `${BASE_URL}`,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}favicon.ico`,
  `${BASE_URL}placeholder.svg`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      return cachedResponse || fetch(request).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match(`${BASE_URL}index.html`);
        }

        return undefined;
      });
    })
  );
});
