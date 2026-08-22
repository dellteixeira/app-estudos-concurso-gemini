(() => {
  const UPDATE_TIMEOUT_MS = 15000;
  const CHECK_INTERVAL_MS = 60000;
  const CACHE_PREFIX = 'estudo-adaptativo-';

  window.APP_VERSION = '—';
  window.__pwaRegistration = null;
  window.__pwaUpdateCheckTimer = null;
  window.__remoteVersionAvailable = null;
  window.__pwaUpdateInProgress = false;

  function compareVersions(a, b) {
    const pa = String(a || '').split('.').map(n => Number.parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map(n => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  function syncRuntimeVersionUi(version = window.APP_VERSION) {
    const normalized = String(version || '—').trim() || '—';
    window.APP_VERSION = normalized;
    document.querySelectorAll('.app-version-badge').forEach(el => {
      el.textContent = normalized === '—' ? 'V—' : `V${normalized}`;
      el.setAttribute('data-app-version', normalized);
      el.title = normalized === '—' ? 'Versão em execução' : `Versão em execução: ${normalized}`;
    });
  }

  function setPwaUpdateBannerVisible(visible, remoteVersion = null, message = null) {
    const banner = document.getElementById('pwa-update-banner');
    if (!banner) return;
    banner.classList.toggle('visible', Boolean(visible));
    const copy = banner.querySelector('.pwa-update-copy span');
    if (copy) {
      copy.textContent = message || (remoteVersion
        ? `Versão ${remoteVersion} disponível. Atualize para usar a versão mais recente do aplicativo.`
        : 'Atualize para usar a versão mais recente do aplicativo.');
    }
    const button = banner.querySelector('[onclick="applyPwaUpdate()"]');
    if (button) {
      button.disabled = window.__pwaUpdateInProgress;
      button.textContent = window.__pwaUpdateInProgress ? 'Atualizando…' : 'Atualizar agora';
    }
  }

  async function fetchRemoteVersion() {
    if (!navigator.onLine) return null;
    try {
      const response = await fetch(`./version.json?ts=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache, no-store' }
      });
      if (!response.ok) return null;
      const payload = await response.json();
      const version = String(payload?.version || '').trim();
      window.__remoteVersionAvailable = version || null;
      return version || null;
    } catch (error) {
      console.warn('Não foi possível consultar a versão publicada:', error);
      return null;
    }
  }

  function getWorkerVersion(worker) {
    return new Promise(resolve => {
      if (!worker) return resolve(null);
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 1800);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        resolve(String(event.data?.version || '').trim() || null);
      };
      try {
        worker.postMessage({ type: 'GET_APP_VERSION' }, [channel.port2]);
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  async function resolveRunningVersion(registration = window.__pwaRegistration) {
    const controller = navigator.serviceWorker.controller;
    const active = registration?.active;
    const version = await getWorkerVersion(controller || active);
    if (version) syncRuntimeVersionUi(version);
    return version;
  }

  async function refreshUpdateState() {
    const remote = await fetchRemoteVersion();
    const running = await resolveRunningVersion();
    if (!running && remote) syncRuntimeVersionUi(remote);
    if (remote && running && compareVersions(remote, running) > 0) setPwaUpdateBannerVisible(true, remote);
    else setPwaUpdateBannerVisible(false);
    return { remote, running };
  }

  function waitForState(worker, targetStates = ['installed', 'activated'], timeout = UPDATE_TIMEOUT_MS) {
    return new Promise(resolve => {
      if (!worker) return resolve(null);
      if (targetStates.includes(worker.state)) return resolve(worker);
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.removeEventListener('statechange', onState);
        resolve(value);
      };
      const onState = () => {
        if (targetStates.includes(worker.state)) finish(worker);
        if (worker.state === 'redundant') finish(null);
      };
      const timer = setTimeout(() => finish(null), timeout);
      worker.addEventListener('statechange', onState);
    });
  }

  function waitForControllerVersion(targetVersion, timeout = UPDATE_TIMEOUT_MS) {
    return new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        resolve(value);
      };
      const verify = async () => {
        const version = await getWorkerVersion(navigator.serviceWorker.controller);
        if (!targetVersion || version === targetVersion) finish(version || targetVersion || null);
      };
      const onControllerChange = () => { verify(); };
      const timer = setTimeout(async () => {
        const version = await getWorkerVersion(navigator.serviceWorker.controller);
        finish(version);
      }, timeout);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      verify();
    });
  }

  async function deleteOldAppCaches(keepVersion = null) {
    if (!('caches' in window)) return;
    const keepName = keepVersion ? `${CACHE_PREFIX}v${keepVersion.replace(/\./g, '-')}` : null;
    const cacheNames = await caches.keys();
    await Promise.allSettled(cacheNames.filter(name => name.startsWith(CACHE_PREFIX) && name !== keepName).map(name => caches.delete(name)));
  }

  function reloadFromNetwork(targetVersion = null) {
    const url = new URL(window.location.href);
    url.searchParams.set('__app_update', targetVersion || `${Date.now()}`);
    url.searchParams.set('__ts', `${Date.now()}`);
    window.location.replace(url.href);
  }

  async function registerLatestWorker(remoteVersion = null) {
    const token = remoteVersion || `check-${Date.now()}`;
    const swUrl = `./sw.js?v=${encodeURIComponent(token)}`;
    const reg = await navigator.serviceWorker.register(swUrl, { scope: './', updateViaCache: 'none' });
    window.__pwaRegistration = reg;
    await reg.update();
    return reg;
  }

  async function checkForPwaUpdate() {
    if (!navigator.onLine || window.__pwaUpdateInProgress) return null;
    const remote = await fetchRemoteVersion();
    let reg = window.__pwaRegistration;
    try {
      if (!reg) reg = await registerLatestWorker(remote);
      else await reg.update();
    } catch (error) {
      console.warn('Falha ao verificar Service Worker:', error);
    }
    const running = await resolveRunningVersion(reg);
    if (remote && running && compareVersions(remote, running) > 0) setPwaUpdateBannerVisible(true, remote);
    else setPwaUpdateBannerVisible(false);
    return { remote, running };
  }

  async function applyPwaUpdate() {
    if (!navigator.onLine || window.__pwaUpdateInProgress) return;
    window.__pwaUpdateInProgress = true;
    setPwaUpdateBannerVisible(true, window.__remoteVersionAvailable, 'Preparando a versão mais recente…');
    try {
      const remoteVersion = (await fetchRemoteVersion()) || window.__remoteVersionAvailable;
      if (!remoteVersion) throw new Error('Não foi possível confirmar a versão publicada.');
      const reg = await registerLatestWorker(remoteVersion);
      let candidate = reg.waiting;
      if (!candidate && reg.installing) candidate = await waitForState(reg.installing, ['installed', 'activated']);
      if (!candidate && reg.waiting) candidate = reg.waiting;
      const activeVersion = await getWorkerVersion(reg.active || navigator.serviceWorker.controller);
      if (activeVersion === remoteVersion && !candidate) {
        await deleteOldAppCaches(remoteVersion);
        syncRuntimeVersionUi(remoteVersion);
        reloadFromNetwork(remoteVersion);
        return;
      }
      if (!candidate) {
        await reg.update();
        if (reg.installing) await waitForState(reg.installing, ['installed', 'activated'], 6000);
        candidate = reg.waiting || reg.installing;
      }
      if (candidate && candidate.state !== 'activated') {
        setPwaUpdateBannerVisible(true, remoteVersion, `Instalando versão ${remoteVersion}…`);
        candidate.postMessage({ type: 'SKIP_WAITING' });
        const switchedVersion = await waitForControllerVersion(remoteVersion);
        if (switchedVersion !== remoteVersion) throw new Error(`O novo Service Worker não assumiu o controle (ativo: ${switchedVersion || 'desconhecido'}).`);
      }
      await deleteOldAppCaches(remoteVersion);
      syncRuntimeVersionUi(remoteVersion);
      sessionStorage.setItem('__pwa_last_applied_version', remoteVersion);
      reloadFromNetwork(remoteVersion);
    } catch (error) {
      console.error('Erro ao aplicar atualização do app:', error);
      window.__pwaUpdateInProgress = false;
      setPwaUpdateBannerVisible(true, window.__remoteVersionAvailable, 'Não foi possível concluir a atualização automática. Toque novamente em “Atualizar agora”.');
    }
  }

  async function bootstrapPwa() {
    syncRuntimeVersionUi('—');
    if (!('serviceWorker' in navigator)) {
      const remote = await fetchRemoteVersion();
      if (remote) syncRuntimeVersionUi(remote);
      return;
    }
    const remote = await fetchRemoteVersion();
    try {
      const reg = await registerLatestWorker(remote);
      await navigator.serviceWorker.ready;
      await resolveRunningVersion(reg);
      await refreshUpdateState();
      const worker = navigator.serviceWorker.controller || reg.active;
      if (worker) worker.postMessage({ type: 'PRIME_OFFLINE_ASSETS' });
      window.addEventListener('online', checkForPwaUpdate);
      window.addEventListener('focus', checkForPwaUpdate);
      window.addEventListener('pageshow', checkForPwaUpdate);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForPwaUpdate(); });
      window.__pwaUpdateCheckTimer = window.setInterval(checkForPwaUpdate, CHECK_INTERVAL_MS);
    } catch (error) {
      console.error('Erro no Service Worker:', error);
      if (remote) syncRuntimeVersionUi(remote);
    }
  }

  function loadStudyPerformanceReport() {
    if (window.StudyPerformanceReport || document.querySelector('script[data-study-performance-report]')) return;
    const script = document.createElement('script');
    script.src = './js/study-performance-report.js';
    script.defer = true;
    script.dataset.studyPerformanceReport = '1';
    script.onerror = () => console.warn('Não foi possível carregar o relatório de desempenho.');
    document.head.appendChild(script);
  }

  function loadNotesRichExport() {
    if (window.NotesRichExport || document.querySelector('script[data-notes-rich-export]')) return;
    const rich = document.createElement('script');
    rich.src = './js/notes-export-rich.js';
    rich.defer = true;
    rich.dataset.notesRichExport = '1';
    rich.onerror = () => console.warn('Não foi possível carregar o exportador PDF formatado. O exportador simples continuará disponível.');
    document.head.appendChild(rich);
  }

  function loadNotesImportExport() {
    if (window.NotesImportExport || document.querySelector('script[data-notes-import-export]')) {
      loadNotesRichExport();
      return;
    }
    const script = document.createElement('script');
    script.src = './js/notes-import-export.js';
    script.defer = true;
    script.dataset.notesImportExport = '1';
    script.onload = loadNotesRichExport;
    script.onerror = () => console.warn('Não foi possível carregar os recursos de importação/exportação de anotações.');
    document.head.appendChild(script);
  }

  document.addEventListener('DOMContentLoaded', () => syncRuntimeVersionUi(window.APP_VERSION), { once: true });
  window.addEventListener('load', bootstrapPwa, { once: true });
  window.addEventListener('load', loadNotesImportExport, { once: true });
  window.addEventListener('load', loadStudyPerformanceReport, { once: true });
  window.applyPwaUpdate = applyPwaUpdate;
  window.checkForPwaUpdate = checkForPwaUpdate;
})();