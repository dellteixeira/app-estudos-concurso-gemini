const APP_VERSION = '10.6.8';
const CACHE_NAME = 'estudo-adaptativo-v10-6-8-sem-retencao-pwa-fix-20260816';
const CACHE_PREFIX = 'estudo-adaptativo-';

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

async function primeOfflineAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(APP_SHELL.map(async asset => {
    const response = await fetch(asset, { cache: 'no-store' });
    if (!response || !response.ok) throw new Error(`Falha ao preparar ${asset}`);
    await cache.put(asset, response.clone());
  }));
}

async function deleteOldAppCaches() {
  const names = await caches.keys();
  await Promise.all(names.map(name => {
    if (name !== CACHE_NAME && name.startsWith(CACHE_PREFIX)) return caches.delete(name);
    return Promise.resolve(false);
  }));
}

async function refreshOpenClients() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.allSettled(windows.map(client => {
    try {
      const url = new URL(client.url);
      if (url.origin !== self.location.origin) return Promise.resolve();
      if (url.searchParams.get('__appv') === APP_VERSION) return Promise.resolve();
      url.searchParams.set('__appv', APP_VERSION);
      return client.navigate(url.href);
    } catch (_) {
      return Promise.resolve();
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await primeOfflineAssets().catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await deleteOldAppCaches();
    await self.clients.claim();
    await primeOfflineAssets().catch(() => {});
    await refreshOpenClients();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'PRIME_OFFLINE_ASSETS') {
    event.waitUntil(primeOfflineAssets().catch(() => {}));
    return;
  }
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === 'GET_APP_VERSION' && event.source) {
    event.source.postMessage({ type: 'APP_VERSION', version: APP_VERSION });
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname.includes('supabase.co')) return;

  const isNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
  if (isNavigation) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response?.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')) || new Response('Aplicativo indisponível offline.', { status:503 }))
    );
    return;
  }

  const isCoreAsset = url.origin === self.location.origin && [
    '/app.js','/app.css','/pwa-update.js','/sw.js','/index.html','/manifest.json'
  ].some(path => url.pathname.endsWith(path));

  if (isCoreAsset) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response?.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match(request)) || new Response('', { status:503 }))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response?.ok && url.origin === self.location.origin) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
