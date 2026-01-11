const CACHE_NAME = 'constellation-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/today.html',
  '/gym.html',
  '/kitchen.html',
  '/tracker.html',
  '/c-logo.svg',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/vue@3/dist/vue.global.prod.js',
  'https://unpkg.com/lucide@latest'
];

// Install: Cache core assets
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

// Fetch: Serve from cache if offline
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
