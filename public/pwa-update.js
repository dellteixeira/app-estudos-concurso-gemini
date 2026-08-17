window.APP_VERSION = '10.6.9';
window.__pwaRegistration = null;
window.__pwaUpdateRequested = false;
window.__pwaUpdateCheckTimer = null;
window.__remoteVersionAvailable = null;

function setPwaUpdateBannerVisible(visible, remoteVersion = null) {
  const banner = document.getElementById('pwa-update-banner');
  if (!banner) return;
  banner.classList.toggle('visible', Boolean(visible));
  const copy = banner.querySelector('.pwa-update-copy span');
  if (copy && remoteVersion) copy.textContent = `Versão ${remoteVersion} disponível. Atualize para usar a versão mais recente do aplicativo.`;
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
    const response = await fetch(`./version.json?ts=${Date.now()}`, { cache:'no-store', headers:{ 'cache-control':'no-cache' } });
    if (!response.ok) return null;
    const payload = await response.json();
    const remoteVersion = String(payload?.version || '').trim();
    if (remoteVersion && compareVersions(remoteVersion, window.APP_VERSION) > 0) {
      window.__remoteVersionAvailable = remoteVersion;
      setPwaUpdateBannerVisible(true, remoteVersion);
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
      if (worker.state === 'installed' && navigator.serviceWorker.controller) announcePwaUpdate(reg);
    });
  });
}

async function checkForPwaUpdate() {
  const reg = window.__pwaRegistration;
  if (!navigator.onLine) return;
  await checkRemoteAppVersion();
  if (!reg) return;
  try {
    await reg.update();
    announcePwaUpdate(reg);
  } catch (err) {
    console.warn('Falha ao verificar atualização do app:', err);
  }
}

async function hardReloadLatestVersion() {
  if (!navigator.onLine) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map(reg => reg.unregister()));
    const cacheNames = await caches.keys();
    await Promise.allSettled(cacheNames.filter(name => name.startsWith('estudo-adaptativo-')).map(name => caches.delete(name)));
  } catch (error) {
    console.warn('Limpeza de cache durante atualização:', error);
  }
  const url = new URL(window.location.href);
  url.searchParams.set('__update', `${Date.now()}`);
  window.location.replace(url.href);
}

async function applyPwaUpdate() {
  const reg = window.__pwaRegistration;
  if (!navigator.onLine) return;
  window.__pwaUpdateRequested = true;
  setPwaUpdateBannerVisible(false);
  try {
    if (reg) {
      await reg.update();
      if (reg.waiting) {
        reg.waiting.postMessage({ type:'SKIP_WAITING' });
        return;
      }
    }
    // Se o navegador está preso em um registro antigo (ex.: V10.5.8) e nenhum worker
    // novo chega a waiting, desmonta apenas os caches/SWs do app e força uma navegação de rede.
    await hardReloadLatestVersion();
  } catch (error) {
    window.__pwaUpdateRequested = false;
    setPwaUpdateBannerVisible(true, window.__remoteVersionAvailable);
    console.error('Erro ao aplicar atualização do app:', error);
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!window.__pwaUpdateRequested) return;
    window.__pwaUpdateRequested = false;
    const url = new URL(window.location.href);
    url.searchParams.set('__update', `${Date.now()}`);
    window.location.replace(url.href);
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache:'none' })
      .then(async reg => {
        attachPwaUpdateLifecycle(reg);
        await checkForPwaUpdate();
        const prime = () => {
          const worker = navigator.serviceWorker.controller || reg.active;
          if (worker) worker.postMessage({ type:'PRIME_OFFLINE_ASSETS' });
        };
        prime();
        navigator.serviceWorker.ready.then(readyReg => { attachPwaUpdateLifecycle(readyReg); prime(); }).catch(() => {});
        window.addEventListener('online', checkForPwaUpdate);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForPwaUpdate(); });
        window.__pwaUpdateCheckTimer = window.setInterval(checkForPwaUpdate, 2 * 60 * 1000);
      })
      .catch(err => console.error('Erro no Service Worker:', err));
  });
} else {
  window.addEventListener('load', checkRemoteAppVersion);
}

window.applyPwaUpdate = applyPwaUpdate;
