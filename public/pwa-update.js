(() => {
  const metaVersion = document.querySelector('meta[name="app-version"]')?.content?.trim();
  window.APP_VERSION = metaVersion || '0.0.0';
  window.__pwaRegistration = null;
  window.__pwaUpdateRequested = false;
  window.__pwaUpdateCheckTimer = null;
  window.__remoteVersionAvailable = null;

  function syncRuntimeVersionUi() {
    document.querySelectorAll('.app-version-badge').forEach(el => {
      el.textContent = `V${window.APP_VERSION}`;
      el.setAttribute('data-app-version', window.APP_VERSION);
    });
  }

  function setPwaUpdateBannerVisible(visible, remoteVersion = null) {
    const banner = document.getElementById('pwa-update-banner');
    if (!banner) return;
    banner.classList.toggle('visible', Boolean(visible));
    const copy = banner.querySelector('.pwa-update-copy span');
    if (copy) {
      copy.textContent = remoteVersion
        ? `Versão ${remoteVersion} disponível. Atualize para usar a versão mais recente do aplicativo.`
        : 'Atualize para usar a versão mais recente do aplicativo.';
    }
  }

  function compareVersions(a, b) {
    const pa = String(a || '').split('.').map(n => Number.parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map(n => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  async function checkRemoteAppVersion() {
    if (!navigator.onLine) return null;
    try {
      const response = await fetch(`./version.json?ts=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' }
      });
      if (!response.ok) return null;
      const payload = await response.json();
      const remoteVersion = String(payload?.version || '').trim();
      window.__remoteVersionAvailable = remoteVersion || null;
      if (remoteVersion && compareVersions(remoteVersion, window.APP_VERSION) > 0) {
        setPwaUpdateBannerVisible(true, remoteVersion);
      } else {
        setPwaUpdateBannerVisible(false);
      }
      return remoteVersion || null;
    } catch (error) {
      console.warn('Não foi possível consultar a versão publicada:', error);
      return null;
    }
  }

  function announcePwaUpdate(registration) {
    if (!registration) return;
    window.__pwaRegistration = registration;
    if (registration.waiting && navigator.serviceWorker.controller) {
      setPwaUpdateBannerVisible(true, window.__remoteVersionAvailable);
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

  async function checkForPwaUpdate() {
    if (!navigator.onLine) return;
    const remote = await checkRemoteAppVersion();
    const reg = window.__pwaRegistration;
    if (!reg) return remote;
    try {
      await reg.update();
      announcePwaUpdate(reg);
    } catch (err) {
      console.warn('Falha ao verificar atualização do app:', err);
    }
    return remote;
  }

  async function clearAppCachesAndRegistrations() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map(reg => reg.unregister()));
    const cacheNames = await caches.keys();
    await Promise.allSettled(
      cacheNames
        .filter(name => name.startsWith('estudo-adaptativo-'))
        .map(name => caches.delete(name))
    );
  }

  function reloadFromNetwork() {
    const url = new URL(window.location.href);
    url.searchParams.set('__update', `${Date.now()}`);
    window.location.replace(url.href);
  }

  async function hardReloadLatestVersion() {
    if (!navigator.onLine) return;
    try {
      await clearAppCachesAndRegistrations();
    } catch (error) {
      console.warn('Limpeza de cache durante atualização:', error);
    }
    reloadFromNetwork();
  }

  async function applyPwaUpdate() {
    if (!navigator.onLine) return;
    const reg = window.__pwaRegistration;
    window.__pwaUpdateRequested = true;
    setPwaUpdateBannerVisible(false);
    try {
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          return;
        }
      }
      await hardReloadLatestVersion();
    } catch (error) {
      window.__pwaUpdateRequested = false;
      setPwaUpdateBannerVisible(true, window.__remoteVersionAvailable);
      console.error('Erro ao aplicar atualização do app:', error);
    }
  }

  syncRuntimeVersionUi();
  document.addEventListener('DOMContentLoaded', syncRuntimeVersionUi, { once: true });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!window.__pwaUpdateRequested) return;
      window.__pwaUpdateRequested = false;
      reloadFromNetwork();
    });

    window.addEventListener('load', () => {
      const swUrl = `./sw.js?v=${encodeURIComponent(window.APP_VERSION)}`;
      navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
        .then(async reg => {
          attachPwaUpdateLifecycle(reg);
          await checkForPwaUpdate();
          const prime = () => {
            const worker = navigator.serviceWorker.controller || reg.active;
            if (worker) worker.postMessage({ type: 'PRIME_OFFLINE_ASSETS' });
          };
          prime();
          navigator.serviceWorker.ready
            .then(readyReg => { attachPwaUpdateLifecycle(readyReg); prime(); })
            .catch(() => {});
          window.addEventListener('online', checkForPwaUpdate);
          window.addEventListener('focus', checkForPwaUpdate);
          window.addEventListener('pageshow', checkForPwaUpdate);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') checkForPwaUpdate();
          });
          window.__pwaUpdateCheckTimer = window.setInterval(checkForPwaUpdate, 60 * 1000);
        })
        .catch(err => console.error('Erro no Service Worker:', err));
    });
  } else {
    window.addEventListener('load', checkRemoteAppVersion);
  }

  window.applyPwaUpdate = applyPwaUpdate;
  window.checkForPwaUpdate = checkForPwaUpdate;
})();
