const CACHE_NAME = 'edital-dashboard-v7-20260811-4';

const APP_SHELL = [
  './manifest.json',
  './icon-192.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.map((name) =>
            name === CACHE_NAME
              ? Promise.resolve(false)
              : caches.delete(name)
          )
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // ==========================================================
  // SUPABASE
  // Nunca passa pelo cache do Service Worker.
  // ==========================================================

  if (url.hostname.includes('supabase.co')) {
    return;
  }


  // ==========================================================
  // HTML / NAVEGAÇÃO
  // Estratégia: NETWORK FIRST
  //
  // Sempre tenta buscar a versão mais recente na internet.
  // Se não houver conexão, utiliza a última versão disponível
  // no cache.
  // ==========================================================

  const isNavigation =
    request.mode === 'navigate' ||
    (
      request.method === 'GET' &&
      request.headers
        .get('accept')
        ?.includes('text/html')
    );

  if (isNavigation) {
    event.respondWith(
      fetch(request, {
        cache: 'no-store'
      })

        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();

            caches
              .open(CACHE_NAME)
              .then((cache) => {
                cache.put(request, copy);
              });
          }

          return response;
        })

        .catch(async () => {
          // Primeiro tenta encontrar exatamente a página solicitada.
          const exact = await caches.match(request);

          if (exact) {
            return exact;
          }

          // Depois tenta a raiz do aplicativo.
          const root = await caches.match('./');

          if (root) {
            return root;
          }

          // Caso seja a primeira visita e o usuário esteja offline.
          return new Response(
            'Aplicativo indisponível offline nesta primeira visita.',
            {
              status: 503,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              }
            }
          );
        })
    );

    return;
  }


  // ==========================================================
  // RECURSOS ESTÁTICOS
  //
  // Estratégia:
  // STALE-WHILE-REVALIDATE
  //
  // 1. Se houver cache, entrega imediatamente.
  // 2. Simultaneamente busca uma versão nova.
  // 3. Atualiza o cache para a próxima utilização.
  // ==========================================================

  if (request.method === 'GET') {
    event.respondWith(
      caches
        .match(request)
        .then((cached) => {

          const networkFetch = fetch(request)

            .then((response) => {

              if (
                response &&
                response.ok &&
                (
                  url.origin === self.location.origin ||
                  url.protocol === 'https:'
                )
              ) {

                caches
                  .open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(
                      request,
                      response.clone()
                    );
                  });
              }

              return response;
            })

            .catch(() => {
              return cached;
            });

          return cached || networkFetch;
        })
    );
  }
});
