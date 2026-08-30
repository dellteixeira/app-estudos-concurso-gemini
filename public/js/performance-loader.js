(function performanceLoader(global) {
  'use strict';

  if (!global || global.AppPerformanceLoader) return;

  const loadedScripts = new Map();
  const loadedStyles = new Map();
  const loadedBundles = new Map();

  const FEATURE_BUNDLES = Object.freeze({
    pdf: Object.freeze({
      styles: Object.freeze([
        './vendor/pdf_viewer.min.css',
        './css/pdf-library.css',
        './css/pdf-reader.css'
      ]),
      scripts: Object.freeze([
        './vendor/pdf.min.js',
        './js/pdf/pdf-core.js',
        './js/pdf/pdf-workspaces.js',
        './js/pdf/pdf-links.js',
        './js/pdf/pdf-library.js',
        './js/pdf/pdf-upload.js',
        './js/pdf/pdf-annotations.js',
        './js/pdf/pdf-reader.js',
        './js/pdf/pdf-library-ui.js'
      ])
    }),
    ai: Object.freeze({
      styles: Object.freeze([
        './css/learning-advisor.css'
      ]),
      scripts: Object.freeze([
        './js/app-ai.js',
        './js/learning-advisor.js',
        './js/critical-points-actions.js'
      ])
    }),
    reports: Object.freeze({
      scripts: Object.freeze([
        './js/study-performance-report.js'
      ])
    }),
    notes: Object.freeze({
      scripts: Object.freeze([
        './js/notes-import-export.js'
      ])
    })
  });

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

  async function loadScriptsInOrder(sources) {
    for (const src of sources || []) {
      await loadScript(src);
    }
  }

  function loadBundle(name) {
    const key = String(name || '').trim();
    if (!key || !FEATURE_BUNDLES[key]) return Promise.reject(new Error(`Bundle desconhecido: ${key || 'vazio'}`));
    if (loadedBundles.has(key)) return loadedBundles.get(key);

    const bundle = FEATURE_BUNDLES[key];
    const promise = Promise.all((bundle.styles || []).map(loadStyle))
      .then(() => loadScriptsInOrder(bundle.scripts || []))
      .then(() => key)
      .catch(error => {
        loadedBundles.delete(key);
        throw error;
      });

    loadedBundles.set(key, promise);
    return promise;
  }

  function bundleForTab(tabId) {
    if (tabId === 'tab-biblioteca') return 'pdf';
    if (tabId === 'tab-flashcards') return 'ai';
    if (tabId === 'tab-anotacoes') return 'notes';
    return null;
  }

  function ensureFeaturesForTab(tabId) {
    const bundle = bundleForTab(tabId);
    return bundle ? loadBundle(bundle) : Promise.resolve(null);
  }

  function scheduleIdleTask(task, timeout = 1800) {
    return new Promise(resolve => {
      idle(async () => {
        try {
          resolve(await task());
        } catch (_error) {
          console.warn('[performance] tarefa ociosa indisponível');
          resolve(null);
        }
      }, timeout);
    });
  }

  function ensurePerformanceMetrics() {
    if (global.AppPerformanceMetrics) return Promise.resolve(global.AppPerformanceMetrics);
    return loadScript('./js/performance-metrics.js', { dataset: { performanceMetrics: '1' } })
      .catch(() => {
        console.warn('[performance] métricas indisponíveis');
        return null;
      });
  }

  function warmOptionalFeatures() {
    const profile = connectionProfile();
    if (!navigator.onLine || profile.constrained) return;
    scheduleIdleTask(() => loadBundle('notes'), 2400);
    scheduleIdleTask(() => loadBundle('reports'), 3600);
  }

  function bindIntentPreload() {
    const warmPdf = () => {
      if (!navigator.onLine && !global.pdfjsLib) return;
      scheduleIdleTask(() => loadBundle('pdf'), 1200);
    };

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
    ensurePerformanceMetrics();
    markHeavyRegions();
    bindIntentPreload();
    global.setTimeout(warmOptionalFeatures, 1100);
  }

  global.AppPerformanceLoader = Object.freeze({
    FEATURE_BUNDLES,
    connectionProfile,
    idle,
    loadScript,
    loadStyle,
    loadBundle,
    bundleForTab,
    ensureFeaturesForTab,
    scheduleIdleTask,
    ensurePerformanceMetrics,
    warmOptionalFeatures,
    markHeavyRegions
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})(typeof window !== 'undefined' ? window : globalThis);
