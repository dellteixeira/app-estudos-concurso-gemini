window.APP_VERSION = '10.5.5';
      window.__pwaRegistration = null;
      window.__pwaUpdateRequested = false;
      window.__pwaUpdateCheckTimer = null;

      function setPwaUpdateBannerVisible(visible) {
        const banner = document.getElementById('pwa-update-banner');
        if (!banner) return;
        banner.classList.toggle('visible', Boolean(visible));
      }

      function announcePwaUpdate(registration) {
        if (!registration) return;
        window.__pwaRegistration = registration;
        if (registration.waiting && navigator.serviceWorker.controller) {
          setPwaUpdateBannerVisible(true);
        }
      }

      async function checkForPwaUpdate() {
        const reg = window.__pwaRegistration;
        if (!reg || !navigator.onLine) return;
        try {
          await reg.update();
          announcePwaUpdate(reg);
        } catch (err) {
          console.warn('Falha ao verificar atualização do app:', err);
        }
      }

      function attachPwaUpdateLifecycle(reg) {
        if (!reg || reg.__updateLifecycleAttached) return;
        reg.__updateLifecycleAttached = true;
        window.__pwaRegistration = reg;

        announcePwaUpdate(reg);

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              announcePwaUpdate(reg);
            }
          });
        });
      }

      async function applyPwaUpdate() {
        const reg = window.__pwaRegistration;
        if (!reg) return;
        window.__pwaUpdateRequested = true;
        setPwaUpdateBannerVisible(false);
        try {
          if (!reg.waiting) await reg.update();
          const waiting = reg.waiting;
          if (waiting) {
            waiting.postMessage({ type: 'SKIP_WAITING' });
          } else {
            window.__pwaUpdateRequested = false;
            setPwaUpdateBannerVisible(true);
          }
        } catch (err) {
          window.__pwaUpdateRequested = false;
          setPwaUpdateBannerVisible(true);
          console.error('Erro ao aplicar atualização do app:', err);
        }
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!window.__pwaUpdateRequested) return;
          window.__pwaUpdateRequested = false;
          window.location.reload();
        });

        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js?v=20260815-9663', { updateViaCache: 'none' })
            .then(async reg => {
              attachPwaUpdateLifecycle(reg);
              await checkForPwaUpdate();

              const prime = () => {
                const worker = navigator.serviceWorker.controller || reg.active;
                if (worker) worker.postMessage({ type: 'PRIME_OFFLINE_ASSETS' });
              };
              prime();
              navigator.serviceWorker.ready.then(readyReg => {
                attachPwaUpdateLifecycle(readyReg);
                prime();
              }).catch(() => {});

              window.addEventListener('online', () => {
                prime();
                checkForPwaUpdate();
              });

              document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') checkForPwaUpdate();
              });

              window.__pwaUpdateCheckTimer = window.setInterval(checkForPwaUpdate, 5 * 60 * 1000);
              return reg;
            })
            .catch(err => console.error('Erro no Service Worker:', err));
        });
      }

      window.applyPwaUpdate = applyPwaUpdate;
