const APP_VERSION = '10.56.0';
const CACHE_PREFIX = 'estudo-adaptativo-';
const CACHE_NAME = `${CACHE_PREFIX}v${APP_VERSION.replace(/\./g, '-')}`;

const CRITICAL_APP_SHELL = [
  './', './index.html', './manifest.json', './version.json', './pwa-update.js',
  './css/base.css', './css/dashboard.css', './css/features.css', './css/responsive-system.css', './css/canonical-ui.css', './css/pdf-library.css', './css/pdf-reader.css', './css/learning-advisor.css',
  './js/study-domain.js', './js/core/edital-integrity.js', './js/core/local-backup-store.js', './js/core/offline-outbox-store.js', './js/core/offline-sync-shadow.js', './js/core/offline-sync-metadata-shadow.js', './js/core/offline-sync-metadata-authority.js', './js/core/offline-sync-metadata-graduation.js', './js/core/offline-sync-metadata-rollout.js', './js/core/offline-sync-metadata-stability.js', './js/core/offline-sync-metadata-expanded-stability.js', './js/core/offline-sync-metadata-expanded-promotion.js', './js/core/offline-sync-metadata-promoted-stability.js', './js/core/offline-sync-metadata-population-promotion.js', './js/core/offline-sync-metadata-population-promoted-stability.js', './js/core/offline-sync-metadata-ring2-promotion.js', './js/core/offline-sync-metadata-ring2-promoted-stability.js',
  './js/core/offline-sync-metadata-ring3-promotion.js', './js/core/offline-sync-metadata-expansion.js', './js/core/offline-sync-authority.js', './js/core/offline-sync-delete-authority.js', './js/core/offline-sync-edital-graduation.js', './js/app-core.js', './js/app-state.js', './js/sync-engine.js', './js/adaptive-schedule-reconciliation.js', './js/learning-advisor.js', './js/app-ai.js', './js/app-ui.js',
  './js/ui/mobile.js', './js/ui/navigation.js', './js/ui/search.js', './js/app-pwa.js',
  './vendor/supabase.js', './vendor/chart.umd.min.js', './icon-192.png', './icon-512.png'
];

const OPTIONAL_OFFLINE_ASSETS = [
  './js/performance-loader.js', './js/performance-metrics.js', './js/notes-import-export.js', './js/notes-export-rich.js', './js/study-performance-report.js',
  './js/pdf/pdf-core.js', './js/pdf/pdf-workspaces.js', './js/pdf/pdf-links.js', './js/pdf/pdf-library.js', './js/pdf/pdf-library-ordering.js', './js/pdf/pdf-upload.js', './js/pdf/pdf-annotations.js', './js/pdf/pdf-reader.js', './js/pdf/pdf-library-ui.js', './js/pdf/pdf-library-opfs-adapter.js', './js/pdf/pdf-library-layout-fix.js', './js/pdf/pdf-device-storage.js', './js/pdf/offline-pdf-store.js', './js/pdf/pdf-offline-library-manager.js', './js/pdf/pdf-offline-integrity.js', './js/pdf/pdf-offline-library-ui.js', './css/pdf-mobile-card-actions.css', './vendor/pdf.min.js', './vendor/pdf_viewer.min.css', './vendor/pdf.worker.min.js'
];

const ALWAYS_NETWORK_FIRST = new Set(['/pwa-update.js', '/sw.js', '/version.json', '/manifest.json']);

function offlineResponse(message = 'Recurso indisponível offline.', contentType = 'text/plain; charset=utf-8') {
  return new Response(message, { status:503, statusText:'Offline', headers:{ 'content-type':contentType, 'cache-control':'no-store', 'x-app-offline':'1' } });
}

async function fetchAndCache(cache, asset) {
  const request = new Request(new URL(asset, self.location.origin), { cache:'reload' });
  const response = await fetch(request);
  if (!response || !response.ok) throw new Error(`Falha ao preparar ${asset}${response ? ` (${response.status})` : ''}`);
  await cache.put(request, response.clone());
  return response;
}

async function primeCriticalAssets({ strict = true } = {}) {
  const cache = await caches.open(CACHE_NAME);
  const jobs = CRITICAL_APP_SHELL.map(asset => fetchAndCache(cache, asset));
  if (strict) await Promise.all(jobs); else await Promise.allSettled(jobs);
}

async function primeOptionalAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(OPTIONAL_OFFLINE_ASSETS.map(asset => fetchAndCache(cache, asset)));
}

async function deleteOldAppCaches() {
  const names = await caches.keys();
  await Promise.all(names.map(name => name !== CACHE_NAME && name.startsWith(CACHE_PREFIX) ? caches.delete(name) : Promise.resolve(false)));
}

async function matchCurrentCache(request, url = new URL(request.url)) {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(request, { ignoreSearch:true })) || (await cache.match(new Request(`${url.origin}${url.pathname}`), { ignoreSearch:true })) || null;
}

async function updateCacheFromNetwork(request, url = new URL(request.url), cacheMode = 'no-cache') {
  const response = await fetch(request, { cache:cacheMode });
  if (response?.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(new Request(`${url.origin}${url.pathname}${url.search}`), response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('install', event => event.waitUntil(primeCriticalAssets({ strict:true })));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await deleteOldAppCaches();
  await self.clients.claim();
  await primeCriticalAssets({ strict:false }).catch(() => {});
})()));

self.addEventListener('message', event => {
  if (event.data?.type === 'PRIME_OFFLINE_ASSETS') {
    event.waitUntil(Promise.all([primeCriticalAssets({ strict:false }), primeOptionalAssets()]).catch(() => {}));
    return;
  }
  if (event.data?.type === 'SKIP_WAITING') { event.waitUntil(self.skipWaiting()); return; }
  if (event.data?.type === 'GET_APP_VERSION') {
    const payload = { type:'APP_VERSION', version:APP_VERSION };
    if (event.ports?.[0]) event.ports[0].postMessage(payload); else if (event.source) event.source.postMessage(payload);
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co')) return;
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache:'no-cache' });
        if (response?.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new Request(new URL('./index.html', self.location.origin)), response.clone()).catch(() => {});
        }
        return response || offlineResponse('Aplicativo indisponível offline.');
      } catch {
        return (await matchCurrentCache(new Request(new URL('./index.html', self.location.origin)))) || (await matchCurrentCache(new Request(new URL('./', self.location.origin)))) || offlineResponse('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estudo Adaptativo</title><body><h1>Aplicativo indisponível offline</h1><p>Conecte-se à internet uma vez para preparar os arquivos do aplicativo.</p></body></html>', 'text/html; charset=utf-8');
      }
    })());
    return;
  }

  if (ALWAYS_NETWORK_FIRST.has(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await updateCacheFromNetwork(request, url, 'no-cache');
        if (response) return response;
      } catch {}
      return (await matchCurrentCache(request, url)) || offlineResponse();
    })());
    return;
  }

  // Lista explícita preserva os contratos de shell/offline; o runtime abaixo usa SWR.
  const isCoreAsset = [
    '/css/base.css', '/css/dashboard.css', '/css/features.css', '/css/responsive-system.css', '/css/canonical-ui.css', '/css/pdf-library.css', '/css/pdf-reader.css', '/css/pdf-mobile-card-actions.css', '/css/learning-advisor.css',
    '/js/study-domain.js', '/js/core/edital-integrity.js', '/js/core/local-backup-store.js', '/js/core/offline-outbox-store.js', '/js/core/offline-sync-shadow.js', '/js/core/offline-sync-metadata-shadow.js', '/js/core/offline-sync-metadata-authority.js', '/js/core/offline-sync-metadata-graduation.js', '/js/core/offline-sync-metadata-rollout.js', '/js/core/offline-sync-metadata-stability.js', '/js/core/offline-sync-metadata-expanded-stability.js', '/js/core/offline-sync-metadata-expanded-promotion.js', '/js/core/offline-sync-metadata-promoted-stability.js', '/js/core/offline-sync-metadata-population-promotion.js', '/js/core/offline-sync-metadata-population-promoted-stability.js', '/js/core/offline-sync-metadata-ring2-promotion.js', '/js/core/offline-sync-metadata-ring2-promoted-stability.js', '/js/core/offline-sync-metadata-ring3-promotion.js', '/js/core/offline-sync-metadata-expansion.js', '/js/core/offline-sync-authority.js', '/js/core/offline-sync-delete-authority.js', '/js/core/offline-sync-edital-graduation.js',
    '/js/app-core.js', '/js/app-state.js', '/js/sync-engine.js', '/js/adaptive-schedule-reconciliation.js', '/js/learning-advisor.js', '/js/notes-import-export.js', '/js/notes-export-rich.js', '/js/study-performance-report.js', '/js/performance-loader.js', '/js/performance-metrics.js', '/js/app-ai.js', '/js/app-ui.js', '/js/ui/mobile.js', '/js/ui/navigation.js', '/js/ui/search.js', '/js/app-pwa.js',
    '/js/pdf/pdf-core.js', '/js/pdf/pdf-workspaces.js', '/js/pdf/pdf-links.js', '/js/pdf/pdf-library.js', '/js/pdf/pdf-library-ordering.js', '/js/pdf/pdf-upload.js', '/js/pdf/pdf-annotations.js', '/js/pdf/pdf-reader.js', '/js/pdf/pdf-library-ui.js', '/js/pdf/pdf-library-opfs-adapter.js', '/js/pdf/pdf-library-layout-fix.js', '/js/pdf/pdf-device-storage.js', '/js/pdf/offline-pdf-store.js', '/js/pdf/pdf-offline-library-manager.js', '/js/pdf/pdf-offline-integrity.js', '/js/pdf/pdf-offline-library-ui.js',
    '/vendor/pdf.min.js', '/vendor/pdf_viewer.min.css', '/vendor/pdf.worker.min.js'
  ].some(path => url.pathname.endsWith(path));

  if (isCoreAsset) {
    event.respondWith((async () => {
      const cached = await matchCurrentCache(request, url);
      if (cached) {
        event.waitUntil(updateCacheFromNetwork(request, url, 'no-cache').catch(() => null));
        return cached;
      }
      try {
        return (await updateCacheFromNetwork(request, url, 'default')) || offlineResponse();
      } catch {
        const contentType = url.pathname.endsWith('.js') ? 'application/javascript; charset=utf-8' : url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8';
        return offlineResponse('', contentType);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await matchCurrentCache(request, url);
    if (cached) {
      event.waitUntil(updateCacheFromNetwork(request, url, 'no-cache').catch(() => null));
      return cached;
    }
    try {
      const response = await updateCacheFromNetwork(request, url, 'default');
      return response || offlineResponse();
    } catch {
      return offlineResponse();
    }
  })());
});
