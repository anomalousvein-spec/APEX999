// APEX PWA Service Worker
// Cache-first strategy: app shell loads offline; network used for fresh content when available.

const CACHE = 'lift-v92';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './src/legacy-bridge.js',
  './src/core-utils.js',
  './src/storage/apex-storage.js',
  './src/state-facade.js',
  './src/runtime-shell.js',
  './src/shell-header.js',
  './src/features/workout-core.js',
  './src/features/workout.js',
  './src/features/workout-actions.js',
  './src/features/body.js',
  './src/features/edit.js',
  './src/features/review.js',
  './src/shell-feedback.js',
  './src/shell-rest-timer.js',
  './src/shell-ui.js',
  './src/shell-lifecycle.js',
  './src/pwa.js',
  './src/bootstrap.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];
const NETWORK_FIRST_PATHS = new Set(['/', '/index.html', '/manifest.webmanifest']);

// Install: cache the app shell immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for same-origin, network-only for Google Fonts (graceful fallback)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const useNetworkFirst = isSameOrigin &&
    (event.request.mode === 'navigate' || NETWORK_FIRST_PATHS.has(url.pathname));

  // Let Google Fonts and external CDN requests go straight to network
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request).then(cached => cached || new Response('', { status: 408 })))
    );
    return;
  }

  if (useNetworkFirst) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then(cached => cached || caches.match('./index.html') || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Cache-first for static app assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful same-origin GET responses
        if (response.ok && isSameOrigin) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — serve cached index for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
