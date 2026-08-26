(function performanceLoader(global) {
  'use strict';

  if (!global || global.AppPerformanceLoader) return;

  const loadedScripts = new Map();
  const loadedStyles = new Map();

  function connectionProfile() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();
    return {
      saveData: Boolean(connection?.saveData),
      constrained: Boolean(connection?.saveData) || effectiveType === 'slow-2g' || effectiveType === '2g',
      effectiveType
    };
  }

  function idle(callback, timeout = 1800) {
    if (typeof global.requestIdleCallback === 'function') {
      return global.requestIdleCallback(callback, { timeout });
    }
    return global.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 220);
  }

  function loadScript(src, options = {}) {
    if (!src) return Promise.reject(new Error('Script sem src.'));
    if (loadedScripts.has(src)) return loadedScripts.get(src);

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      const ready = Promise.resolve(existing);
      loadedScripts.set(src, ready);
      return ready;
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = options.defer !== false;
      if (options.dataset) Object.assign(script.dataset, options.dataset);
      script.onload = () => resolve(script);
      script.onerror = () => {
        loadedScripts.delete(src);
        reject(new Error(`Falha ao carregar ${src}`));
      };
      document.head.appendChild(script);
    });

    loadedScripts.set(src, promise);
    return promise;
  }

  function loadStyle(href) {
    if (!href) return Promise.reject(new Error('Stylesheet sem href.'));
    if (loadedStyles.has(href)) return loadedStyles.get(href);

    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) {
      const ready = Promise.resolve(existing);
      loadedStyles.set(href, ready);
      return ready;
    }

    const promise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve(link);
      link.onerror = () => {
        loadedStyles.delete(href);
        reject(new Error(`Falha ao carregar ${href}`));
      };
      document.head.appendChild(link);
    });

    loadedStyles.set(href, promise);
    return promise;
  }

  function scheduleIdleTask(task, timeout = 1800) {
    return new Promise(resolve => {
      idle(async () => {
        try {
          resolve(await task());
        } catch (error) {
          console.warn('[performance] tarefa ociosa falhou:', error);
          resolve(null);
        }
      }, timeout);
    });
  }

  function ensurePerformanceMetrics() {
    if (global.AppPerformanceMetrics) return Promise.resolve(global.AppPerformanceMetrics);
    return loadScript('./js/performance-metrics.js', { dataset: { performanceMetrics: '1' } })
      .catch(error => {
        console.warn('[performance] métricas indisponíveis:', error);
        return null;
      });
  }

  function warmPdfAssets() {
    const profile = connectionProfile();
    if (!navigator.onLine || profile.constrained) return Promise.resolve(null);
    return Promise.all([
      loadScript('./vendor/pdf.min.js'),
      loadStyle('./vendor/pdf_viewer.min.css')
    ]).catch(error => {
      console.warn('[performance] pré-carga de PDF indisponível:', error);
      return null;
    });
  }

  function warmOptionalFeatures() {
    const profile = connectionProfile();
    if (!navigator.onLine || profile.constrained) return;
    scheduleIdleTask(() => loadScript('./js/notes-import-export.js', { dataset: { notesImportExport: '1' } }), 5000);
    scheduleIdleTask(() => loadScript('./js/study-performance-report.js', { dataset: { studyPerformanceReport: '1' } }), 6500);
  }

  function bindIntentPreload() {
    const warmPdf = () => scheduleIdleTask(warmPdfAssets, 600);

    document.querySelectorAll('[onclick*="tab-biblioteca"], [data-tab="tab-biblioteca"], [onclick*="openModalViewEdital"]').forEach(el => {
      el.addEventListener('pointerenter', warmPdf, { once: true, passive: true });
      el.addEventListener('touchstart', warmPdf, { once: true, passive: true });
      el.addEventListener('focus', warmPdf, { once: true });
    });
  }

  function markHeavyRegions() {
    document.querySelectorAll('.retention-diagnostic-panel, .tab-workspace-anchor').forEach(region => {
      if (!region.style.contentVisibility) region.style.contentVisibility = 'auto';
      if (!region.style.containIntrinsicSize) region.style.containIntrinsicSize = '1px 760px';
    });
  }

  function bootstrap() {
    markHeavyRegions();
    bindIntentPreload();
    scheduleIdleTask(ensurePerformanceMetrics, 2600);
    global.setTimeout(warmOptionalFeatures, 3600);
  }

  global.AppPerformanceLoader = Object.freeze({
    connectionProfile,
    idle,
    loadScript,
    loadStyle,
    scheduleIdleTask,
    ensurePerformanceMetrics,
    warmPdfAssets,
    warmOptionalFeatures,
    markHeavyRegions
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})(typeof window !== 'undefined' ? window : globalThis);
