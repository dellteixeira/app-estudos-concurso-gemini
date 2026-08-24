const APP_VERSION = '10.26.1';
const CACHE_PREFIX = 'estudo-adaptativo-';
const CACHE_NAME = `${CACHE_PREFIX}v${APP_VERSION.replace(/\./g, '-')}`;

// Arquivos mínimos para o app iniciar e manter a experiência principal offline.
// Se qualquer um deles falhar durante a instalação, o novo Service Worker não
// substitui a versão anterior, evitando um PWA parcialmente instalado.
const CRITICAL_APP_SHELL = [
  './', './index.html', './manifest.json', './version.json', './pwa-update.js',
  './css/base.css', './css/dashboard.css', './css/features.css', './css/responsive-system.css', './css/canonical-ui.css', './css/pdf-library.css', './css/pdf-reader.css',
  './js/study-domain.js', './js/app-core.js', './js/adaptive-schedule-reconciliation.js', './js/app-ai.js', './js/app-ui.js',
  './js/ui/mobile.js', './js/ui/navigation.js', './js/ui/search.js', './js/app-pwa.js',
  './vendor/supabase.js', './vendor/chart.umd.min.js',
  './icon-192.png', './icon-512.png'
];

// Recursos complementares podem ser preparados quando disponíveis sem impedir
// a atualização do app. Eles serão buscados novamente quando a conexão voltar.
const OPTIONAL_OFFLINE_ASSETS = [
  './js/performance-loader.js', './js/performance-metrics.js',
  './js/notes-import-export.js', './js/notes-export-rich.js', './js/study-performance-report.js',
  './js/pdf/pdf-core.js', './js/pdf/pdf-workspaces.js', './js/pdf/pdf-links.js', './js/pdf/pdf-library.js',
  './js/pdf/pdf-library-ordering.js', './js/pdf/pdf-upload.js', './js/pdf/pdf-annotations.js',
  './js/pdf/pdf-reader.js', './js/pdf/pdf-library-ui.js',
  './vendor/pdf.min.js', './vendor/pdf_viewer.min.css', './vendor/pdf.worker.min.js'
];

function offlineResponse(message = 'Recurso indisponível offline.', contentType = 'text/plain; charset=utf-8') {
  return new Response(message, {
    status: 503,
    statusText: 'Offline',
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
      'x-app-offline': '1'
    }
  });
}

async function fetchAndCache(cache, asset) {
  const request = new Request(new URL(asset, self.location.origin), { cache: 'no-store' });
  const response = await fetch(request);
  if (!response || !response.ok) {
    throw new Error(`Falha ao preparar ${asset}${response ? ` (${response.status})` : ''}`);
  }
  await cache.put(request, response.clone());
  return response;
}

async function primeOfflineAssets({ requireCritical = true } = {}) {
  const cache = await caches.open(CACHE_NAME);

  if (requireCritical) {
    // Promise.all é intencional: uma falha crítica impede uma instalação incompleta.
    await Promise.all(CRITICAL_APP_SHELL.map(asset => fetchAndCache(cache, asset)));
  } else {
    await Promise.allSettled(CRITICAL_APP_SHELL.map(asset => fetchAndCache(cache, asset)));
  }

  // Complementos nunca invalidam uma instalação que já possui o núcleo íntegro.
  await Promise.allSettled(OPTIONAL_OFFLINE_ASSETS.map(asset => fetchAndCache(cache, asset)));
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

async function matchCurrentCache(request, url = new URL(request.url)) {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match(new Request(`${url.origin}${url.pathname}`), { ignoreSearch: true })) ||
    null
  );
}

self.addEventListener('install', event => {
  // Não engolir erro aqui: se o núcleo não puder ser preparado, o navegador
  // mantém o Service Worker anterior em vez de instalar uma versão incompleta.
  event.waitUntil(primeOfflineAssets({ requireCritical: true }));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Só removemos caches anteriores depois que esta versão foi instalada.
    await deleteOldAppCaches();
    await self.clients.claim();
    // Revalidação tolerante para preencher eventuais recursos opcionais.
    await primeOfflineAssets({ requireCritical: false }).catch(() => {});
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'PRIME_OFFLINE_ASSETS') {
    event.waitUntil(primeOfflineAssets({ requireCritical: false }).catch(() => {}));
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

  // Dados privados e autenticação do Supabase jamais passam pelo cache do SW.
  if (url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co')) return;

  // Não interferir em recursos de terceiros. Dependências necessárias ao app são
  // expostas pelo próprio domínio em /vendor/* e podem ser armazenadas com segurança.
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response?.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new Request(new URL('./index.html', self.location.origin)), response.clone()).catch(() => {});
        }
        return response || offlineResponse('Aplicativo indisponível offline.');
      } catch {
        return (
          (await matchCurrentCache(new Request(new URL('./index.html', self.location.origin)))) ||
          (await matchCurrentCache(new Request(new URL('./', self.location.origin)))) ||
          offlineResponse(
            '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estudo Adaptativo</title><body><h1>Aplicativo indisponível offline</h1><p>Conecte-se à internet uma vez para preparar os arquivos do aplicativo.</p></body></html>',
            'text/html; charset=utf-8'
          )
        );
      }
    })());
    return;
  }

  // Mantido de forma explícita porque este bloco também funciona como contrato
  // auditável dos arquivos centrais que usam estratégia network-first.
  const isCoreAsset = url.origin === self.location.origin && [
    '/pwa-update.js', '/sw.js', '/index.html', '/manifest.json', '/version.json', '/vendor/pdf.min.js', '/vendor/pdf_viewer.min.css', '/vendor/pdf.worker.min.js',
    '/css/base.css', '/css/dashboard.css', '/css/features.css', '/css/responsive-system.css', '/css/canonical-ui.css', '/css/pdf-library.css', '/css/pdf-reader.css',
    '/js/study-domain.js', '/js/app-core.js', '/js/adaptive-schedule-reconciliation.js', '/js/notes-import-export.js', '/js/notes-export-rich.js', '/js/study-performance-report.js',
    '/js/performance-loader.js', '/js/performance-metrics.js',
    '/js/pdf/pdf-core.js', '/js/pdf/pdf-workspaces.js', '/js/pdf/pdf-links.js', '/js/pdf/pdf-library.js', '/js/pdf/pdf-library-ordering.js', '/js/pdf/pdf-upload.js',
    '/js/app-ai.js', '/js/app-ui.js', '/js/ui/mobile.js', '/js/ui/navigation.js', '/js/ui/search.js',
    '/js/pdf/pdf-annotations.js', '/js/pdf/pdf-reader.js', '/js/pdf/pdf-library-ui.js', '/js/app-pwa.js'
  ].some(path => url.pathname.endsWith(path));

  if (isCoreAsset) {
    // Network-first para o núcleo: online recebe sempre a versão publicada;
    // offline utiliza a última cópia íntegra preparada para esta versão.
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response?.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new Request(`${url.origin}${url.pathname}`), response.clone()).catch(() => {});
        }
        if (response) return response;
      } catch {}

      const cached = await matchCurrentCache(request, url);
      if (cached) return cached;

      const contentType = url.pathname.endsWith('.js')
        ? 'application/javascript; charset=utf-8'
        : url.pathname.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : 'text/plain; charset=utf-8';
      return offlineResponse('', contentType);
    })());
    return;
  }

  // Demais recursos do mesmo domínio: cache-first com atualização em segundo plano.
  // Se nem rede nem cache estiverem disponíveis, sempre devolvemos uma Response válida.
  event.respondWith((async () => {
    const cached = await matchCurrentCache(request, url);
    if (cached) {
      event.waitUntil(
        fetch(request)
          .then(async response => {
            if (response?.ok) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(new Request(`${url.origin}${url.pathname}${url.search}`), response.clone());
            }
          })
          .catch(() => {})
      );
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response?.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(new Request(`${url.origin}${url.pathname}${url.search}`), response.clone()).catch(() => {});
      }
      return response || offlineResponse();
    } catch {
      return offlineResponse();
    }
  })());
});
