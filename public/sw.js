
const CACHE_NAME = 'sortvision-cache-v1';
const OFFLINE_URL = '/offline';

const PRECACHE_ASSETS = [
  '/',
  '/offline',
  // You would add more critical assets here like JS, CSS bundles, but we will cache them dynamically
];

// On install, pre-cache the offline page and other essential assets.
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install event');
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[Service Worker] Caching pre-cache assets');
      await cache.addAll(PRECACHE_ASSETS);
    })()
  );
  self.skipWaiting();
});

// On activate, clean up old caches.
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate event');
  event.waitUntil(
    (async () => {
      // Enable navigation preloading if it's supported.
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
      
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })()
  );
  self.clients.claim();
});

// The fetch handler is the most important part.
// It intercepts requests and serves from cache if available (Cache-First strategy).
self.addEventListener('fetch', (event) => {
  // We only want to handle GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  // For navigation requests, try network first, then cache, then offline page.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }
          const networkResponse = await fetch(event.request);
          return networkResponse;
        } catch (error) {
          console.log('[Service Worker] Fetch failed; returning offline page instead.', error);
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(OFFLINE_URL);
          return cachedResponse;
        }
      })()
    );
    return;
  }

  // For all other requests (CSS, JS, images), use a Cache-First strategy.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      
      if (cachedResponse) {
        // Return from cache
        return cachedResponse;
      }
      
      try {
        // Not in cache, so fetch from network
        const networkResponse = await fetch(event.request);
        
        // Cache the new response for future use
        // Make sure we only cache successful responses
        if (networkResponse && networkResponse.status === 200) {
          await cache.put(event.request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        // If network fetch fails (and it's not in cache), we can't do much.
        // For image requests, you might return a placeholder. For now, we'll just fail.
        console.log('[Service Worker] Fetch failed and not in cache:', event.request.url);
        // We don't return the offline page here, as it's not appropriate for assets.
        return new Response(null, { status: 404 });
      }
    })()
  );
});
