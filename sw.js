const CACHE_NAME = 'constellation-v3.44';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/today.html',
  '/gym.html',
  '/kitchen.html',
  '/tracker.html',
  '/workout.html',
  '/recap.html',
  '/builder.html',
  '/leaderboard.html',
  '/prs.html',
  '/arena-history.html',
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
  '/js/social.js',
  '/js/arena-prs.js',
  '/js/arena-history.js',
  '/js/giphy-config.js',
  '/js/config.js',
  '/js/user-prefs.js',
  '/js/bottom-nav.js',
  '/js/exercise-library.js',
  '/body-map.svg',
  '/js/exercise-history.js',
  '/js/routine-library.js',
  '/js/heatmap.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/vue@3/dist/vue.global.prod.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/lucide@0.469.0',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
});

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

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // HTML Files: Network First (Get fresh), Fallback to Cache (Offline support)
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

  // Assets (JS/CSS/Images): Cache First (Speed), Fallback to Network
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
