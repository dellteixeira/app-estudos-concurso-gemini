// No seu arquivo sw.js:
const CACHE_NAME = 'edital-dashboard-v3'; // <--- mude a versão aqui

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// Forçar a ativação do novo Service Worker e apagar caches antigos
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache); // Apaga a versão antiga da memória do navegador
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
