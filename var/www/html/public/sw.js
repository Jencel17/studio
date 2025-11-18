
const CACHE_NAME = 'sort-vision-cache-v1';
const MANIFEST_URL = '/_next/build-manifest.json';

// This function is called when the service worker is first installed.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      
      // 1. Get the build manifest to find all the Next.js generated files.
      const response = await fetch(MANIFEST_URL);
      if (!response.ok) {
        throw new Error('Failed to fetch build manifest');
      }
      const manifest = await response.json();

      // 2. Extract all the page and chunk files that need to be cached.
      const urlsToCache = new Set();
      // Add root page
      urlsToCache.add('/');
      urlsToCache.add('/offline');

      // Add static files from the public directory
      urlsToCache.add('/manifest.json');
      urlsToCache.add('/icon-192x192.png');
      urlsToCache.add('/icon-512x512.png');

      // Add Next.js's generated files from the manifest
      Object.values(manifest.pages).forEach((files) => {
        if (Array.isArray(files)) {
          files.forEach(file => urlsToCache.add(`/_next/${file}`));
        }
      });

      // Add low-priority chunks
      if (manifest.lowPriorityFiles) {
        manifest.lowPriorityFiles.forEach(file => urlsToCache.add(`/_next/${file}`));
      }

      console.log('[SW] Caching the following URLs:', Array.from(urlsToCache));

      // 3. Add all extracted URLs to the cache.
      await cache.addAll(Array.from(urlsToCache));
      console.log('[SW] Caching complete!');

    } catch (error) {
      console.error('[SW] Caching failed:', error);
    }
  })());
});

// This function is called to clean up old caches.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
});


// This function intercepts all network requests.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // For navigation requests (e.g., loading a page), use a network-first strategy.
  // This ensures the user gets the latest version if they are online.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Try the network first.
        const networkResponse = await fetch(request);
        return networkResponse;
      } catch (error) {
        // If the network fails, try to serve the page from the cache.
        console.log('[SW] Network fetch failed, trying cache for navigation.');
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        // If the page is in the cache, serve it. Otherwise, show the offline fallback page.
        return cachedResponse || await cache.match('/offline');
      }
    })());
    return;
  }
  
  // For all other requests (JS, CSS, images), use a cache-first strategy.
  // This makes the app load instantly and work offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    // If the resource is in the cache, return it immediately.
    if (cachedResponse) {
      return cachedResponse;
    }

    // If not in the cache, try to fetch it from the network.
    try {
        const networkResponse = await fetch(request);
        // Don't cache API calls or other dynamic content
        if (request.url.includes('/api/')) {
            return networkResponse;
        }
        // For other assets, put a copy in the cache for next time.
        // Cloning is necessary as a response can only be consumed once.
        await cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        console.error('[SW] Network fetch failed for non-navigation request:', request.url, error);
        // For assets like images that might fail, we can return a placeholder or nothing.
        // Here we just let the browser's default error handling take over.
        // For a more robust solution, one could return a placeholder image.
    }
  })());
});
