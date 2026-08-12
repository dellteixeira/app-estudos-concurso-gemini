const CACHE_NAME = 'edital-dashboard-v12-universal-v8_2-1-20260812';

const APP_SHELL = [
  './',
  './manifest.json',
  './icon-192.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        APP_SHELL.map((asset) => cache.add(asset))
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
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
  // NAVEGAÇÕES / HTML
  //
  // Estratégia: NETWORK FIRST
  //
  // Sempre tenta carregar a versão mais recente do aplicativo.
  // Se não houver internet, utiliza a última versão válida
  // armazenada no cache.
  //
  // Isso ajuda a evitar que uma versão antiga do index.html
  // permaneça presa no cache após uma nova publicação.
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
          // Primeiro tenta recuperar exatamente a página solicitada.
          const exact = await caches.match(request);

          if (exact) {
            return exact;
          }

          // Se não houver, tenta utilizar a raiz do aplicativo.
          const root = await caches.match('./');

          if (root) {
            return root;
          }

          // Caso seja a primeira utilização e não exista
          // nenhuma versão armazenada offline.
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
  // Estratégia: STALE-WHILE-REVALIDATE
  //
  // 1. Se existir no cache, entrega imediatamente.
  // 2. Ao mesmo tempo busca uma versão atualizada na rede.
  // 3. Atualiza o cache silenciosamente.
  //
  // Isso mantém o aplicativo rápido sem impedir atualizações.
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

            .catch(() => cached);

          return cached || networkFetch;
        })
    );
  }
});
