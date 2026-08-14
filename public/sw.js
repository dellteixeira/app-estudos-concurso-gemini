const CACHE_NAME = 'painel-estudos-v9-41-offline-app-shell-20260814';

// Núcleo local necessário para abrir o aplicativo sem rede depois da primeira preparação.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// Dependências que a V9.40 carregava somente quando eram visitadas na CDN.
// Nesta versão elas são fixadas em versões conhecidas e preparadas antecipadamente no cache.
const EXTERNAL_OFFLINE_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

async function cacheLocalShell(cache) {
  const results = await Promise.allSettled(
    APP_SHELL.map(async (asset) => {
      const response = await fetch(asset, { cache: 'reload' });
      if (!response || !response.ok) throw new Error(`Falha no app shell: ${asset}`);
      await cache.put(asset, response.clone());
    })
  );

  // O ícone já era referenciado nas versões anteriores, mas nem todos os pacotes o continham.
  // Tenta armazená-lo sem tornar a instalação dependente dele.
  try {
    const iconResponse = await fetch('./icon-192.png', { cache: 'reload' });
    if (iconResponse && iconResponse.ok) await cache.put('./icon-192.png', iconResponse.clone());
  } catch (_) {}

  return results.every((result) => result.status === 'fulfilled');
}

async function cacheExternalAssets(cache) {
  const results = await Promise.allSettled(
    EXTERNAL_OFFLINE_ASSETS.map(async (asset) => {
      // no-cors permite armazenar respostas opacas de scripts de terceiros para posterior uso offline.
      const response = await fetch(asset, { mode: 'no-cors', cache: 'no-store' });
      if (!response) throw new Error(`Falha ao preparar recurso externo: ${asset}`);
      await cache.put(asset, response.clone());
    })
  );
  return results.every((result) => result.status === 'fulfilled');
}

async function cleanupOldCaches() {
  const names = await caches.keys();
  await Promise.all(
    names.map((name) => name === CACHE_NAME ? Promise.resolve(false) : caches.delete(name))
  );
}

async function primeOfflineAssets() {
  const cache = await caches.open(CACHE_NAME);
  const localReady = await cacheLocalShell(cache);
  const externalReady = await cacheExternalAssets(cache);

  // Só elimina a versão anterior quando o novo pacote offline ficou completo.
  // Se a atualização ocorrer com internet instável, o cache anterior continua servindo de fallback.
  if (localReady && externalReady) await cleanupOldCaches();
  return localReady && externalReady;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(primeOfflineAssets());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() => primeOfflineAssets().catch(() => false))
  );
});

// Permite ao aplicativo repetir a preparação quando a internet voltar.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'PRIME_OFFLINE_ASSETS') {
    event.waitUntil(primeOfflineAssets());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // ==========================================================
  // SUPABASE API / AUTH / DATABASE
  // Nunca armazena respostas privadas do backend no cache.
  // O SDK JS estático, hospedado no jsDelivr, é tratado como recurso estático abaixo.
  // ==========================================================
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // ==========================================================
  // NAVEGAÇÕES / HTML — NETWORK FIRST
  // ==========================================================
  const isNavigation =
    request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));

  if (isNavigation) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
              cache.put('./index.html', response.clone()).catch(() => {});
            });
          }
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(request);
          if (exact) return exact;

          const root = await caches.match('./');
          if (root) return root;

          const index = await caches.match('./index.html');
          if (index) return index;

          return new Response(
            'Aplicativo indisponível offline antes da preparação inicial.',
            { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // ==========================================================
  // RECURSOS ESTÁTICOS — STALE WHILE REVALIDATE
  // Inclui scripts CDN previamente preparados para offline.
  // ==========================================================
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (
              response &&
              (response.ok || response.type === 'opaque') &&
              (url.origin === self.location.origin || url.protocol === 'https:')
            ) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});
