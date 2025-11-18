// This is a basic service worker file that will be populated by workbox-webpack-plugin

// Ensure workbox is loaded
try {
  importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');
} catch (e) {
  console.error("Workbox couldn't be loaded.", e);
}


if (self.workbox) {
  console.log(`Workbox is loaded`);

  // This is a placeholder for the precache manifest that will be injected by the webpack plugin.
  // The `self.__WB_MANIFEST` will be replaced with an array of assets to be precached.
  self.workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

  // -- Caching Strategies --

  // Cache Pages
  self.workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new self.workbox.strategies.NetworkFirst({
      cacheName: 'pages',
      plugins: [
        new self.workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [200],
        }),
      ],
    })
  );

  // Cache Google Fonts
  self.workbox.routing.registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
    new self.workbox.strategies.StaleWhileRevalidate({
      cacheName: 'google-fonts',
      plugins: [
        new self.workbox.expiration.ExpirationPlugin({ maxEntries: 20 }),
      ],
    })
  );

  // Cache Other Assets (JS, CSS, etc.)
  self.workbox.routing.registerRoute(
    ({ request }) => ['script', 'style', 'worker'].includes(request.destination),
    new self.workbox.strategies.StaleWhileRevalidate({
      cacheName: 'assets',
    })
  );

  // Cache Images
  self.workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new self.workbox.strategies.CacheFirst({
      cacheName: 'images',
      plugins: [
        new self.workbox.expiration.ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
        }),
      ],
    })
  );

} else {
  console.log(`Workbox didn't load`);
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
