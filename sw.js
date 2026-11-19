// Service worker: network-first (so new versions show up), cache fallback (so the app opens offline).
// Bump CACHE_NAME and add new files to PRECACHE whenever you add files to the app.
const CACHE_NAME = 'moneyamplifier-v7';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest',
  './css/styles.css',
  './js/app.js', './js/util.js', './js/store.js', './js/components.js', './js/prices.js',
  './js/views/home.js', './js/views/add.js', './js/views/history.js',
  './js/views/invest.js', './js/views/wealth.js', './js/views/settings.js',
  './vendor/chart.umd.js', './fonts/nunito-latin.woff2', './icons/mascot.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))));
});
