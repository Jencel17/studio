
const CACHE_NAME = 'sort-vision-cache-v2';
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching offline assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // We only want to handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // For navigation requests, use a network-first strategy to get the latest page,
  // but fall back to the offline page if the network fails.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.open(CACHE_NAME)
            .then((cache) => cache.match('/offline'));
        })
    );
    return;
  }

  // For all other requests (CSS, JS, images), use a cache-first strategy.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request)
        .then((response) => {
          // If we found a response in the cache, return it.
          if (response) {
            return response;
          }

          // Otherwise, fetch from the network.
          return fetch(event.request).then((networkResponse) => {
            // If the fetch was successful, clone it and store it in the cache for next time.
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
    })
  );
});
