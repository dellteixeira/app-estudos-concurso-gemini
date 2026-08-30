(function (global) {
  'use strict';

  const IDS = Object.freeze({
    progress: 'modernOverviewProgress',
    today: 'modernOverviewToday',
    target: 'modernOverviewTarget',
    reviews: 'modernOverviewReviews',
    risk: 'retentionDiagRisk',
    overdue: 'retentionDiagOverdue'
  });

  function ensureStyle() {
    if (document.querySelector('link[data-dashboard-v2]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/dashboard-v2.css?v=20260830';
    link.dataset.dashboardV2 = '1';
    document.head.appendChild(link);
  }

  function readText(id, fallback = '—') {
    const value = document.getElementById(id)?.textContent?.trim();
    return value || fallback;
  }

  function numericText(id) {
    const value = readText(id, '0').match(/\d+/);
    return value ? Number(value[0]) : 0;
  }

  function nextActionCopy() {
    const risk = numericText(IDS.risk);
    const overdue = numericText(IDS.overdue);
    const reviews = numericText(IDS.reviews);

    if (overdue > 0) {
      return {
        title: `${overdue} revisão${overdue === 1 ? '' : 'ões'} vencida${overdue === 1 ? '' : 's'}`,
        copy: 'Priorize recuperar conteúdos atrasados antes de avançar para novos tópicos.',
        label: 'Ver prioridades',
        action: 'retention-details',
        metric: 'overdue'
      };
    }
    if (risk > 0) {
      return {
        title: `${risk} assunto${risk === 1 ? '' : 's'} pedindo atenção`,
        copy: 'O diagnóstico encontrou conteúdos com retenção ou desempenho abaixo do alvo.',
        label: 'Revisar riscos',
        action: 'retention-details',
        metric: 'risk'
      };
    }
    if (reviews > 0) {
      return {
        title: `${reviews} revisão${reviews === 1 ? '' : 'ões'} pendente${reviews === 1 ? '' : 's'}`,
        copy: 'Há revisões programadas para hoje. Um bloco curto já mantém o ciclo em dia.',
        label: 'Estudar agora',
        action: 'opportunity-study'
      };
    }
    return {
      title: 'Ciclo de revisão em dia',
      copy: 'Você pode avançar para o próximo conteúdo priorizado pelo planejamento adaptativo.',
      label: 'Escolher próximo estudo',
      action: 'opportunity-study'
    };
  }

  function buildActionButton(config) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-sm';
    button.dataset.action = config.action;
    if (config.metric) button.dataset.metric = config.metric;
    button.textContent = config.label;
    return button;
  }

  function createShell() {
    if (document.getElementById('dashboardV2Shell')) return document.getElementById('dashboardV2Shell');
    const overview = document.querySelector('.study-overview-grid');
    if (!overview?.parentNode) return null;

    const shell = document.createElement('section');
    shell.id = 'dashboardV2Shell';
    shell.className = 'dashboard-v2-shell';
    shell.setAttribute('aria-label', 'Painel de ação de hoje');
    shell.innerHTML = `
      <article class="dashboard-v2-hero">
        <div>
          <span class="dashboard-v2-eyebrow">Hoje</span>
          <h1 class="dashboard-v2-title">O que você deve estudar agora?</h1>
          <p class="dashboard-v2-copy">Comece pelo próximo bloco recomendado e deixe os detalhes analíticos para quando precisar deles.</p>
        </div>
        <div class="dashboard-v2-actions">
          <button class="btn btn-primary" type="button" data-action="opportunity-study">Continuar estudo</button>
          <button class="btn btn-secondary" type="button" data-action="switch-tab" data-tab="tab-calendario">Ver cronograma</button>
        </div>
      </article>
      <div class="dashboard-v2-side">
        <article class="dashboard-v2-next">
          <span class="dashboard-v2-section-label">Próxima melhor ação</span>
          <strong id="dashboardV2NextTitle">Calculando prioridade…</strong>
          <p id="dashboardV2NextCopy">Analisando retenção, revisões e progresso atual.</p>
          <div id="dashboardV2NextAction"></div>
        </article>
        <article class="dashboard-v2-today">
          <span class="dashboard-v2-section-label">Progresso de hoje</span>
          <div class="dashboard-v2-today-grid">
            <div class="dashboard-v2-stat"><span>Estudado</span><strong id="dashboardV2Today">00:00</strong></div>
            <div class="dashboard-v2-stat"><span>Meta</span><strong id="dashboardV2Target">—</strong></div>
            <div class="dashboard-v2-stat"><span>Progresso</span><strong id="dashboardV2Progress">0%</strong></div>
          </div>
        </article>
      </div>`;

    overview.parentNode.insertBefore(shell, overview);
    overview.classList.add('dashboard-v2-overview-secondary');

    const retention = document.getElementById('retentionDiagnosticPanel');
    if (retention) {
      retention.classList.add('dashboard-v2-secondary-analysis');
      if (!document.querySelector('.dashboard-v2-analysis-heading')) {
        const heading = document.createElement('div');
        heading.className = 'dashboard-v2-analysis-heading';
        heading.innerHTML = '<div><h3>Análise detalhada</h3><p>Retenção, risco e diagnóstico para aprofundar quando necessário.</p></div>';
        retention.parentNode?.insertBefore(heading, retention);
      }
    }
    return shell;
  }

  function syncDashboard() {
    const shell = createShell();
    if (!shell) return;

    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    };

    set('dashboardV2Today', readText(IDS.today, '00:00'));
    set('dashboardV2Target', readText(IDS.target, '—'));
    set('dashboardV2Progress', readText(IDS.progress, '0%'));

    const recommendation = nextActionCopy();
    set('dashboardV2NextTitle', recommendation.title);
    set('dashboardV2NextCopy', recommendation.copy);
    const actionBox = document.getElementById('dashboardV2NextAction');
    if (actionBox) {
      actionBox.replaceChildren(buildActionButton(recommendation));
    }
  }

  function observeSources() {
    const observer = new MutationObserver(syncDashboard);
    Object.values(IDS).forEach(id => {
      const node = document.getElementById(id);
      if (node) observer.observe(node, { childList: true, subtree: true, characterData: true });
    });
    return observer;
  }

  function init() {
    if (document.documentElement.dataset.dashboardV2Ready === '1') return;
    document.documentElement.dataset.dashboardV2Ready = '1';
    ensureStyle();
    syncDashboard();
    const observer = observeSources();
    global.AppDashboardV2 = Object.freeze({ sync: syncDashboard, observer });
    setTimeout(syncDashboard, 0);
    setTimeout(syncDashboard, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);
