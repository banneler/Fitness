const CACHE_NAME = 'constellation-v2'; // Increment this string manually on big updates!
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/today.html',
  '/gym.html',
  '/kitchen.html',
  '/tracker.html',
  '/workout.html',
  '/builder.html',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/vue@3/dist/vue.global.prod.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/lucide@latest',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js'
];

// Install: Cache everything
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Force new SW to take over immediately
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
});

// Activate: Clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  return self.clients.claim();
});

// Fetch: Smart Strategy
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Strategy 1: HTML files -> Network First (get latest), fall back to Cache (offline)
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Strategy 2: Static Assets (JS/CSS/Images) -> Cache First, fall back to Network
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
