const CACHE_NAME = 'painel-estudos-v9-59-flexible-opportunity-study-20260815';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './vendor/supabase.js',
  './vendor/chart.umd.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js'
];

async function primeOfflineAssets() {
  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.allSettled(APP_SHELL.map(async asset => {
    const response = await fetch(asset, { cache: 'reload' });
    if (!response || !response.ok) throw new Error(`Falha ao preparar ${asset}`);
    await cache.put(asset, response.clone());
  }));
  const ready = results.every(result => result.status === 'fulfilled');
  if (ready) {
    const names = await caches.keys();
    await Promise.all(names.map(name => name === CACHE_NAME ? false : caches.delete(name)));
  }
  return ready;
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(primeOfflineAssets().catch(() => false));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim().then(() => primeOfflineAssets().catch(() => false)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'PRIME_OFFLINE_ASSETS') {
    event.waitUntil(primeOfflineAssets().catch(() => false));
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
