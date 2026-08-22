const APP_VERSION = '10.26.0';
const CACHE_PREFIX = 'estudo-adaptativo-';
const CACHE_NAME = `${CACHE_PREFIX}v${APP_VERSION.replace(/\./g, '-')}`;

const APP_SHELL = [
  './', './index.html', './manifest.json', './version.json', './pwa-update.js',
  './css/base.css', './css/dashboard.css', './css/features.css', './css/pdf-library.css', './css/pdf-reader.css',
  './js/study-domain.js', './js/app-core.js', './js/adaptive-schedule-reconciliation.js', './js/notes-import-export.js', './js/notes-export-rich.js', './js/study-performance-report.js', './js/pdf/pdf-core.js', './js/pdf/pdf-workspaces.js', './js/pdf/pdf-links.js', './js/pdf/pdf-library.js', './js/pdf/pdf-library-ordering.js', './js/pdf/pdf-upload.js', './js/app-ai.js', './js/app-ui.js', './js/pdf/pdf-annotations.js', './js/pdf/pdf-reader.js', './js/pdf/pdf-library-ui.js', './js/app-pwa.js',
  './vendor/supabase.js', './vendor/chart.umd.min.js', './vendor/pdf.min.js', './vendor/pdf_viewer.min.css', './vendor/pdf.worker.min.js',
  './icon-192.png', './icon-512.png'
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
  await Promise.all(
    names.map(name =>
      name !== CACHE_NAME && name.startsWith(CACHE_PREFIX)
        ? caches.delete(name)
        : Promise.resolve(false)
    )
  );
}

self.addEventListener('install', event => {
  event.waitUntil(primeOfflineAssets().catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await deleteOldAppCaches();
    await self.clients.claim();
    await primeOfflineAssets().catch(() => {});
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
  if (event.data?.type === 'GET_APP_VERSION') {
    const payload = { type: 'APP_VERSION', version: APP_VERSION };
    if (event.ports?.[0]) event.ports[0].postMessage(payload);
    else if (event.source) event.source.postMessage(payload);
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
            caches.open(CACHE_NAME)
              .then(cache => cache.put('./index.html', response.clone()))
              .catch(() => {});
          }
          return response;
        })
        .catch(async () =>
          (await caches.match('./index.html')) ||
          (await caches.match('./')) ||
          new Response('Aplicativo indisponível offline.', { status: 503 })
        )
    );
    return;
  }

  const isCoreAsset = url.origin === self.location.origin && [
    '/pwa-update.js', '/sw.js', '/index.html', '/manifest.json', '/version.json', '/vendor/pdf.min.js', '/vendor/pdf_viewer.min.css', '/vendor/pdf.worker.min.js',
    '/css/base.css', '/css/dashboard.css', '/css/features.css', '/css/pdf-library.css', '/css/pdf-reader.css',
    '/js/study-domain.js', '/js/app-core.js', '/js/adaptive-schedule-reconciliation.js', '/js/notes-import-export.js', '/js/notes-export-rich.js', '/js/study-performance-report.js', '/js/pdf/pdf-core.js', '/js/pdf/pdf-workspaces.js', '/js/pdf/pdf-links.js', '/js/pdf/pdf-library.js', '/js/pdf/pdf-library-ordering.js', '/js/pdf/pdf-upload.js', '/js/app-ai.js', '/js/app-ui.js', '/js/pdf/pdf-annotations.js', '/js/pdf/pdf-reader.js', '/js/pdf/pdf-library-ui.js', '/js/app-pwa.js'
  ].some(path => url.pathname.endsWith(path));

  if (isCoreAsset) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response?.ok) {
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, response.clone()))
              .catch(() => {});
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(request)) ||
          (await caches.match(url.pathname.replace(/^\//, './'))) ||
          new Response('', { status: 503 })
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response?.ok && url.origin === self.location.origin) {
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, response.clone()))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
