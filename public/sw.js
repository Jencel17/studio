
// This is a basic service worker that enables offline functionality.
// It uses a "cache-first" strategy.

const CACHE_NAME = `sortvision-cache-v1-${new Date().getTime()}`;
const OFFLINE_URL = '/offline';

// A list of assets to cache on install
const urlsToCache = [
  '/',
  OFFLINE_URL,
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// This is where the build manifest will be injected by a script.
// We'll leave it empty here. The build process should handle populating this.
// For now, we will rely on caching discovered assets during the fetch event.

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      console.log('[Service Worker] Caching all: app shell and content');
      await cache.addAll(urlsToCache);
    } catch(error) {
      console.error('[Service Worker] Pre-caching failed:', error);
    }
  })());
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  event.waitUntil((async () => {
    // Enable navigation preloading if it's supported.
    // See https://developers.google.com/web/updates/2017/02/navigation-preload
    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }
    
    // Clean up old caches
    const cacheWhitelist = [CACHE_NAME];
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((cacheName) => {
        if (cacheWhitelist.indexOf(cacheName) === -1) {
          console.log('[Service Worker] Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        }
      })
    );
  })());
});

self.addEventListener('fetch', (event) => {
  // We only want to intercept navigation requests, and requests for our own assets.
  if (event.request.mode !== 'navigate' && !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      
      // If it's in the cache, serve it (Cache-First).
      if (cachedResponse) {
        // console.log('[Service Worker] Returning from cache:', event.request.url);
        return cachedResponse;
      }
      
      // If it's not in the cache, try the network.
      // console.log('[Service Worker] Not in cache, fetching:', event.request.url);
      const networkResponse = await fetch(event.request);

      // If the network request is successful, cache it for next time.
      if (networkResponse.ok) {
        // console.log('[Service Worker] Caching new resource:', event.request.url);
        await cache.put(event.request, networkResponse.clone());
      }
      
      return networkResponse;
    } catch (error) {
      // The network failed.
      console.error('[Service Worker] Fetch failed; returning offline page instead.', error);

      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(OFFLINE_URL);
      return cachedResponse;
    }
  })());
});
