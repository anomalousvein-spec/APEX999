// APEX PWA Service Worker
// Cache-first strategy: app shell loads offline; network used for fresh content when available.

const CACHE = 'lift-v93-modular';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './src/legacy-bridge.js',
  './src/core-utils.js',
  './src/storage/apex-storage.js',
  './src/state-modules/shared-utils.js',
  './src/state-modules/workout-state.js',
  './src/state-modules/body-state.js',
  './src/state-modules/review-state.js',
  './src/state-modules/edit-state.js',
  './src/features/storage-health.js',
  './src/state-facade.js',
  './src/runtime-shell.js',
  './src/shell-header.js',
  './src/features/workout-core.js',
  './src/features/workout.js',
  './src/features/workout-actions.js',
  './src/features/anchor-validation.js',
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
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE) return caches.delete(key);
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
