(function performanceMetrics(global) {
  'use strict';

  if (!global || global.AppPerformanceMetrics) return;

  const STORAGE_KEY = 'app_performance_samples_v1';
  const MAX_SAMPLES = 20;
  const supportedEntryTypes = new Set(global.PerformanceObserver?.supportedEntryTypes || []);
  const state = {
    startedAt: performance.now(),
    lcp: null,
    cls: 0,
    inp: null,
    longTasks: { count: 0, totalMs: 0, maxMs: 0 },
    navigation: {},
    interactions: new Map(),
    finalized: false,
    observers: [],
    support: {
      lcp: supportedEntryTypes.has('largest-contentful-paint'),
      cls: supportedEntryTypes.has('layout-shift'),
      inp: supportedEntryTypes.has('event'),
      longtask: supportedEntryTypes.has('longtask')
    }
  };

  const thresholds = Object.freeze({
    lcp: { good: 2500, needsImprovement: 4000 },
    inp: { good: 200, needsImprovement: 500 },
    cls: { good: 0.1, needsImprovement: 0.25 },
    startup: { good: 2000, needsImprovement: 4000 },
    longTaskMax: { good: 50, needsImprovement: 200 }
  });

  function round(value, digits = 0) {
    if (!Number.isFinite(Number(value))) return null;
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  }

  function rating(value, limit, isSupported = true) {
    if (!isSupported || !Number.isFinite(Number(value))) return 'indisponível';
    if (Number(value) <= limit.good) return 'bom';
    if (Number(value) <= limit.needsImprovement) return 'atenção';
    return 'ruim';
  }

  function observe(type, callback, options = {}) {
    if (!('PerformanceObserver' in global) || !supportedEntryTypes.has(type)) return null;
    try {
      const observer = new PerformanceObserver(list => callback(list.getEntries()));
      const config = { type, buffered: options.buffered !== false };
      if (options.durationThreshold != null) config.durationThreshold = options.durationThreshold;
      observer.observe(config);
      state.observers.push(observer);
      return observer;
    } catch (_) {
      return null;
    }
  }

  function computeInp() {
    const durations = [...state.interactions.values()].filter(Number.isFinite).sort((a, b) => b - a);
    if (!durations.length) return null;
    const index = Math.min(Math.floor(durations.length / 50), durations.length - 1);
    return durations[index];
  }

  function readNavigationTiming() {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (nav) {
      state.navigation = {
        ttfbMs: round(nav.responseStart - nav.startTime),
        domContentLoadedMs: round(nav.domContentLoadedEventEnd - nav.startTime),
        loadMs: round(nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.startTime : performance.now())
      };
      return;
    }
    const legacy = performance.timing;
    if (legacy?.navigationStart) {
      state.navigation = {
        ttfbMs: round(legacy.responseStart - legacy.navigationStart),
        domContentLoadedMs: round(legacy.domContentLoadedEventEnd - legacy.navigationStart),
        loadMs: round((legacy.loadEventEnd || Date.now()) - legacy.navigationStart)
      };
    }
  }

  function getConnectionClass() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return connection?.effectiveType || 'desconhecida';
  }

  function getDeviceClass() {
    const width = global.innerWidth || document.documentElement.clientWidth || 0;
    if (width <= 600) return 'mobile';
    if (width <= 900) return 'tablet';
    if (width <= 1200) return 'notebook';
    return 'desktop';
  }

  function getCurrentReport() {
    readNavigationTiming();
    state.inp = computeInp();
    const startupMs = state.navigation.loadMs ?? round(performance.now());
    const longTaskMax = state.support.longtask ? state.longTasks.maxMs : null;
    return {
      collectedAt: new Date().toISOString(),
      version: String(global.APP_VERSION || '—'),
      deviceClass: getDeviceClass(),
      connection: getConnectionClass(),
      support: { ...state.support },
      metrics: {
        lcpMs: state.support.lcp ? round(state.lcp) : null,
        inpMs: state.support.inp ? round(state.inp) : null,
        cls: state.support.cls ? round(state.cls, 3) : null,
        startupMs: round(startupMs),
        domContentLoadedMs: round(state.navigation.domContentLoadedMs),
        ttfbMs: round(state.navigation.ttfbMs),
        longTaskCount: state.support.longtask ? state.longTasks.count : null,
        longTaskTotalMs: state.support.longtask ? round(state.longTasks.totalMs) : null,
        longTaskMaxMs: round(longTaskMax)
      },
      ratings: {
        lcp: rating(state.lcp, thresholds.lcp, state.support.lcp),
        inp: rating(state.inp, thresholds.inp, state.support.inp),
        cls: rating(state.cls, thresholds.cls, state.support.cls),
        startup: rating(startupMs, thresholds.startup, true),
        longTask: rating(longTaskMax, thresholds.longTaskMax, state.support.longtask)
      }
    };
  }

  function loadSamples() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveSample() {
    const report = getCurrentReport();
    try {
      const samples = loadSamples();
      const index = samples.findIndex(sample => sample.sessionId === global.__performanceSessionId);
      const next = { ...report, sessionId: global.__performanceSessionId };
      if (index >= 0) samples[index] = next;
      else samples.push(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(samples.slice(-MAX_SAMPLES)));
    } catch (_) {}
    return report;
  }

  function finalize() {
    if (state.finalized) return getCurrentReport();
    state.finalized = true;
    const report = saveSample();
    state.observers.forEach(observer => {
      try { observer.disconnect(); } catch (_) {}
    });
    return report;
  }

  function formatMetric(label, value, unit, metricRating) {
    const shown = value == null ? '—' : `${value}${unit || ''}`;
    return `<div class="perf-metric-card perf-${metricRating}"><span>${label}</span><strong>${shown}</strong><small>${metricRating}</small></div>`;
  }

  function ensureModal() {
    if (document.getElementById('modalPerformanceDiagnostics')) return;
    const modal = document.createElement('div');
    modal.id = 'modalPerformanceDiagnostics';
    modal.className = 'modal-overlay';
    modal.classList.add('performance-diagnostics-overlay');
    modal.innerHTML = `
      <div class="modal performance-diagnostics-modal">
        <h3>Diagnóstico de performance</h3>
        <p class="performance-diagnostics-intro">Métricas medidas neste navegador. Nenhum dado é enviado para servidor externo.</p>
        <div id="performanceDiagnosticsSummary" class="perf-diagnostics-grid"></div>
        <div id="performanceDiagnosticsDetails" class="performance-diagnostics-details"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" onclick="AppPerformanceMetrics.copyDiagnostics()">Copiar diagnóstico</button>
          <button class="btn btn-secondary" type="button" onclick="AppPerformanceMetrics.clearHistory()">Limpar histórico</button>
          <button class="btn btn-secondary" type="button" onclick="AppPerformanceMetrics.closeDiagnostics()">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    if (!document.getElementById('performanceMetricsStyles')) {
      const style = document.createElement('style');
      style.id = 'performanceMetricsStyles';
      style.textContent = `.performance-diagnostics-overlay{z-index:1460}.performance-diagnostics-modal{max-width:860px}.performance-diagnostics-intro{font-size:.85rem;opacity:.8;line-height:1.5}.performance-diagnostics-details{margin-top:14px;font-size:.82rem;line-height:1.55}.perf-diagnostics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.perf-metric-card{padding:12px;border:1px solid var(--border-color);border-radius:10px;background:rgba(0,0,0,.14);display:grid;gap:4px}.perf-metric-card span{font-size:.75rem;opacity:.78}.perf-metric-card strong{font-size:1.15rem}.perf-metric-card small{text-transform:uppercase;font-size:.65rem;font-weight:800}.perf-bom small{color:#22c55e}.perf-atenção small{color:#f59e0b}.perf-ruim small{color:#ef4444}.perf-indisponível small{opacity:.6}`;
      document.head.appendChild(style);
    }
  }

  function renderDiagnostics() {
    ensureModal();
    const report = getCurrentReport();
    const m = report.metrics;
    const r = report.ratings;
    const summary = document.getElementById('performanceDiagnosticsSummary');
    if (summary) {
      summary.innerHTML = [
        formatMetric('LCP', m.lcpMs, ' ms', r.lcp),
        formatMetric('INP', m.inpMs, ' ms', r.inp),
        formatMetric('CLS', m.cls, '', r.cls),
        formatMetric('Inicialização', m.startupMs, ' ms', r.startup),
        formatMetric('Long task máx.', m.longTaskMaxMs, ' ms', r.longTask)
      ].join('');
    }
    const samples = loadSamples();
    const details = document.getElementById('performanceDiagnosticsDetails');
    if (details) {
      const longTaskText = m.longTaskCount == null ? 'indisponível neste navegador' : `${m.longTaskCount} (${m.longTaskTotalMs ?? 0} ms acumulados)`;
      details.innerHTML = `<strong>Detalhes da sessão</strong><br>TTFB: ${m.ttfbMs ?? '—'} ms · DOMContentLoaded: ${m.domContentLoadedMs ?? '—'} ms · Long tasks: ${longTaskText} · Perfil: ${report.deviceClass} · Rede: ${report.connection}<br><br><strong>Histórico local:</strong> ${samples.length} sessão(ões) armazenada(s), máximo ${MAX_SAMPLES}.`;
    }
    return report;
  }

  function openDiagnostics() {
    renderDiagnostics();
    const modal = document.getElementById('modalPerformanceDiagnostics');
    if (modal) modal.style.display = 'flex';
  }

  function closeDiagnostics() {
    const modal = document.getElementById('modalPerformanceDiagnostics');
    if (modal) modal.style.display = 'none';
  }

  function clearHistory() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    renderDiagnostics();
  }

  async function copyDiagnostics() {
    const report = saveSample();
    const payload = JSON.stringify({ current: report, recent: loadSamples().slice(-5) }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      if (typeof global.appNotice === 'function') global.appNotice('Diagnóstico copiado.', { title: 'Performance' });
    } catch (_) {
      console.info('Diagnóstico de performance:', payload);
    }
    return payload;
  }

  function installAccountButton() {
    const account = document.getElementById('modalAccount');
    if (!account || document.getElementById('btnPerformanceDiagnostics')) return;
    const actions = account.querySelector('.account-inline-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = 'btnPerformanceDiagnostics';
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.textContent = 'Diagnóstico de performance';
    button.addEventListener('click', openDiagnostics);
    actions.appendChild(button);
  }

  global.__performanceSessionId = global.__performanceSessionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  observe('largest-contentful-paint', entries => {
    const last = entries[entries.length - 1];
    if (last) state.lcp = last.startTime;
  });

  observe('layout-shift', entries => {
    for (const entry of entries) {
      if (!entry.hadRecentInput) state.cls += entry.value || 0;
    }
  });

  observe('event', entries => {
    for (const entry of entries) {
      if (!entry.interactionId || !Number.isFinite(entry.duration)) continue;
      const previous = state.interactions.get(entry.interactionId) || 0;
      if (entry.duration > previous) state.interactions.set(entry.interactionId, entry.duration);
    }
    state.inp = computeInp();
  }, { durationThreshold: 40 });

  observe('longtask', entries => {
    for (const entry of entries) {
      const duration = Number(entry.duration) || 0;
      state.longTasks.count += 1;
      state.longTasks.totalMs += duration;
      state.longTasks.maxMs = Math.max(state.longTasks.maxMs, duration);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    readNavigationTiming();
    installAccountButton();
  }, { once: true });

  global.addEventListener('load', () => {
    readNavigationTiming();
    global.setTimeout(saveSample, 2500);
  }, { once: true });

  global.addEventListener('pagehide', finalize, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveSample();
  });

  global.AppPerformanceMetrics = Object.freeze({
    getReport: getCurrentReport,
    getHistory: loadSamples,
    saveSample,
    finalize,
    openDiagnostics,
    closeDiagnostics,
    clearHistory,
    copyDiagnostics,
    renderDiagnostics,
    thresholds
  });
  global.openPerformanceDiagnostics = openDiagnostics;
})(typeof window !== 'undefined' ? window : globalThis);
