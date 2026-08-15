const APP_VERSION = '9.66.1';
const CACHE_NAME = 'estudo-adaptativo-v9-66-2-contabilizacao-horas-20260815';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app.css',
  './app.js',
  './pwa-update.js',
  './vendor/supabase.js',
  './vendor/chart.umd.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './icon-192.png',
  './icon-512.png'
];

async function primeOfflineAssets(cleanupOldCaches = false) {
  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.allSettled(APP_SHELL.map(async asset => {
    const response = await fetch(asset, { cache: 'reload' });
    if (!response || !response.ok) throw new Error(`Falha ao preparar ${asset}`);
    await cache.put(asset, response.clone());
  }));
  const ready = results.every(result => result.status === 'fulfilled');
  if (ready && cleanupOldCaches) {
    const names = await caches.keys();
    await Promise.all(names.map(name => name === CACHE_NAME ? false : caches.delete(name)));
  }
  return ready;
}

self.addEventListener('install', event => {
  event.waitUntil(primeOfflineAssets(false).catch(() => false));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim().then(() => primeOfflineAssets(true).catch(() => false)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'PRIME_OFFLINE_ASSETS') {
    event.waitUntil(primeOfflineAssets(true).catch(() => false));
    return;
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'GET_APP_VERSION' && event.source) {
    event.source.postMessage({ type: 'APP_VERSION', version: APP_VERSION });
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Respostas privadas do Supabase nunca entram no Cache Storage.
  if (url.hostname.includes('supabase.co')) return;

  const isNavigation = request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));

  if (isNavigation) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response?.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, copy);
              cache.put('./index.html', response.clone()).catch(() => {});
            });
          }
          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) ||
            (await caches.match('./')) ||
            (await caches.match('./index.html')) ||
            new Response('Aplicativo indisponível offline antes da preparação inicial.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        })
    );
    return;
  }

  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(response => {
            if (response?.ok && url.origin === self.location.origin) {
              caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
