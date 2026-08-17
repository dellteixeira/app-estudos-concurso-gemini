window.APP_VERSION = '10.6.8';
window.__pwaRegistration = null;
window.__pwaUpdateCheckTimer = null;

function setPwaUpdateBannerVisible(visible) {
  const banner = document.getElementById('pwa-update-banner');
  if (!banner) return;
  banner.classList.toggle('visible', Boolean(visible));
}

async function checkForPwaUpdate() {
  const reg = window.__pwaRegistration;
  if (!reg || !navigator.onLine) return;
  try {
    await reg.update();
  } catch (err) {
    console.warn('Falha ao verificar atualização do app:', err);
  }
}

async function applyPwaUpdate() {
  const reg = window.__pwaRegistration;
  if (!reg) return;
  try {
    await reg.update();
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch (err) {
    console.error('Erro ao aplicar atualização do app:', err);
  }
}

function cleanupVersionRefreshParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('__appv')) return;
    url.searchParams.delete('__appv');
    history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
  } catch (_) {}
}

cleanupVersionRefreshParam();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(async reg => {
        window.__pwaRegistration = reg;
        setPwaUpdateBannerVisible(false);
        await checkForPwaUpdate();

        const prime = () => {
          const worker = navigator.serviceWorker.controller || reg.active;
          if (worker) worker.postMessage({ type: 'PRIME_OFFLINE_ASSETS' });
        };
        prime();
        navigator.serviceWorker.ready.then(() => prime()).catch(() => {});

        window.addEventListener('online', checkForPwaUpdate);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForPwaUpdate();
        });
        window.__pwaUpdateCheckTimer = window.setInterval(checkForPwaUpdate, 5 * 60 * 1000);
      })
      .catch(err => console.error('Erro no Service Worker:', err));
  });
}

window.applyPwaUpdate = applyPwaUpdate;
