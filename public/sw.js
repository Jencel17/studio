
// A custom service worker can be used to customize the caching strategy.
// This is a simple example of a service worker that caches the main page and some static assets.
// It's a good starting point for a more complex offline experience.

const CACHE_NAME = 'sort-vision-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/manifest.json',
  // Add other critical assets here.
  // Be careful with what you add, as it will be downloaded on service worker installation.
  // The browser will automatically cache JS/CSS chunks if they are versioned.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching offline page');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        // Force the waiting service worker to become the active service worker.
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  // Tell the active service worker to take control of the page immediately.
  event.waitUntil(self.clients.claim());

  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // We only want to handle navigation requests for this simple example.
  if (event.request.mode !== 'navigate') {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // First, try to use the navigation preload response if it's supported.
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) {
          return preloadResponse;
        }

        // Always try the network first for navigation requests.
        const networkResponse = await fetch(event.request);
        return networkResponse;
      } catch (error) {
        // catch is only triggered if an exception is thrown, which happens
        // when there's a network error.
        // If fetch() returns a valid HTTP response with a 4xx or 5xx status,
        // the catch() will NOT be called.
        console.log('[Service Worker] Fetch failed; returning offline page instead.', error);

        const cache = await caches.open(CACHE_NAME);
        // This will serve the /offline page cached during install.
        const cachedResponse = await cache.match('/offline');
        return cachedResponse;
      }
    })()
  );
});
