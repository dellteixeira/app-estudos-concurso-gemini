(function performanceLoader(global) {
  'use strict';

  if (!global || global.AppPerformanceLoader) return;

  const loadedScripts = new Map();
  const loadedStyles = new Map();
  let pdfFeaturePromise = null;

  const PDF_FEATURE_SCRIPTS = [
    './js/pdf/pdf-core.js',
    './js/pdf/pdf-workspaces.js',
    './js/pdf/pdf-links.js',
    './js/pdf/pdf-library.js',
    './js/pdf/pdf-upload.js',
    './js/pdf/pdf-annotations.js',
    './vendor/pdf.min.js',
    './js/pdf/pdf-reader.js',
    './js/pdf/pdf-library-ui.js'
  ];

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
      if (existing.dataset.loaded === '1' || existing.readyState === 'complete') {
        const ready = Promise.resolve(existing);
        loadedScripts.set(src, ready);
        return ready;
      }
      const pending = new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve(existing), { once:true });
        existing.addEventListener('error', () => reject(new Error(`Falha ao carregar ${src}`)), { once:true });
      });
      loadedScripts.set(src, pending);
      return pending;
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = options.async === true;
      script.defer = options.defer !== false;
      if (options.dataset) Object.assign(script.dataset, options.dataset);
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve(script);
      };
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

  function ensurePdfFeature() {
    if (global.PdfStudyLibraryUI && global.PdfStudyReader && global.PdfStudyLibrary) {
      return Promise.resolve(global.PdfStudyLibraryUI);
    }
    if (pdfFeaturePromise) return pdfFeaturePromise;
    pdfFeaturePromise = (async () => {
      for (const src of PDF_FEATURE_SCRIPTS) await loadScript(src);
      if (!global.PdfStudyLibraryUI || !global.PdfStudyReader || !global.PdfStudyLibrary) {
        throw new Error('A Biblioteca PDF não terminou de inicializar.');
      }
      return global.PdfStudyLibraryUI;
    })().catch(error => {
      pdfFeaturePromise = null;
      throw error;
    });
    return pdfFeaturePromise;
  }

  function warmOptionalFeatures() {
    const profile = connectionProfile();
    if (!navigator.onLine || profile.constrained) return;
    scheduleIdleTask(() => loadScript('./js/notes-import-export.js', { dataset: { notesImportExport: '1' } }), 5000);
    scheduleIdleTask(() => loadScript('./js/study-performance-report.js', { dataset: { studyPerformanceReport: '1' } }), 6500);
  }

  function openLibraryAfterLoad(target) {
    return ensurePdfFeature().then(async libraryUi => {
      if (typeof global.switchTab === 'function') global.switchTab('tab-biblioteca', target || null);
      await libraryUi?.activateLibrary?.();
      return libraryUi;
    }).catch(error => {
      console.error('[performance] Biblioteca PDF indisponível:', error);
      global.appNotice?.('Não foi possível carregar a Biblioteca agora. Tente novamente.', { title:'Biblioteca' });
      return null;
    });
  }

  function bindIntentPreload() {
    const warmPdf = () => scheduleIdleTask(warmPdfAssets, 600);

    document.querySelectorAll('[data-tab="tab-biblioteca"], [onclick*="tab-biblioteca"], [onclick*="openModalViewEdital"]').forEach(el => {
      el.addEventListener('pointerenter', warmPdf, { once: true, passive: true });
      el.addEventListener('touchstart', warmPdf, { once: true, passive: true });
      el.addEventListener('focus', warmPdf, { once: true });
    });

    document.addEventListener('click', event => {
      const target = event.target?.closest?.('[data-tab="tab-biblioteca"]');
      if (!target || target.dataset.pdfFeatureReady === '1') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openLibraryAfterLoad(target).then(libraryUi => {
        if (libraryUi) target.dataset.pdfFeatureReady = '1';
      });
    }, true);
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
    ensurePdfFeature,
    openLibraryAfterLoad,
    warmOptionalFeatures,
    markHeavyRegions
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})(typeof window !== 'undefined' ? window : globalThis);
