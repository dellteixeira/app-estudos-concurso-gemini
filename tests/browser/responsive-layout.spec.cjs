const { test, expect } = require('@playwright/test');

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'notebook-1366', width: 1366, height: 768 },
  { name: 'desktop-1920', width: 1920, height: 1080 }
];

async function auditDocumentOverflow(page) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    rootScroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth
  }));
  expect(metrics.rootScroll, `documentElement overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport + 2);
  expect(metrics.bodyScroll, `body overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport + 2);
}

async function auditVisibleControls(page, roots) {
  const failures = await page.evaluate((rootSelectors) => {
    const selectors = ['button', '.btn', '.btn-action', 'label.btn-action'];
    const rootNodes = rootSelectors.flatMap(selector => [...document.querySelectorAll(selector)]);
    const seen = new Set();
    const bad = [];
    for (const root of rootNodes) {
      for (const el of root.querySelectorAll(selectors.join(','))) {
        if (seen.has(el)) continue;
        seen.add(el);
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 2 || rect.height < 2) continue;
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const clipsX = el.scrollWidth > el.clientWidth + 2;
        const clipsY = el.scrollHeight > el.clientHeight + 2;
        if (clipsX || clipsY) {
          bad.push({
            text: text.slice(0, 80),
            className: String(el.className || ''),
            clientWidth: el.clientWidth,
            scrollWidth: el.scrollWidth,
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight
          });
        }
      }
    }
    return bad;
  }, roots);
  expect(failures, `Controles com texto cortado/escapando: ${JSON.stringify(failures, null, 2)}`).toEqual([]);
}

async function auditRetentionCards(page) {
  const result = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#visualAuditRetentionFixture .rd-metric-card-v1077')];
    return cards.map(card => {
      const cardRect = card.getBoundingClientRect();
      const icon = card.querySelector('.rd-metric-icon-v1077');
      const label = card.querySelector('.rd-metric-label-v1077');
      const iconRect = icon?.getBoundingClientRect();
      const labelRect = label?.getBoundingClientRect();
      return {
        label: label?.textContent?.trim() || '',
        labelInside: !!labelRect && labelRect.left >= cardRect.left - 1 && labelRect.right <= cardRect.right + 1 && labelRect.top >= cardRect.top - 1 && labelRect.bottom <= cardRect.bottom + 1,
        iconCenterDelta: iconRect ? Math.abs((iconRect.left + iconRect.width / 2) - (cardRect.left + cardRect.width / 2)) : 999,
        labelOverflowX: label ? label.scrollWidth > label.clientWidth + 2 : true,
        labelOverflowY: label ? label.scrollHeight > label.clientHeight + 2 : true
      };
    });
  });
  expect(result.length).toBe(4);
  for (const item of result) {
    expect(item.labelInside, `Rótulo fora do card: ${item.label}`).toBe(true);
    expect(item.iconCenterDelta, `Ícone não centralizado: ${item.label}`).toBeLessThanOrEqual(4);
    expect(item.labelOverflowX, `Rótulo cortado horizontalmente: ${item.label}`).toBe(false);
    expect(item.labelOverflowY, `Rótulo cortado verticalmente: ${item.label}`).toBe(false);
  }
}

async function loadAuditStyles(page) {
  await page.evaluate(async () => {
    const href = './css/canonical-ui.css?v=20260823-phase5';
    const absolute = new URL(href, location.href).href;
    const existing = [...document.styleSheets].some(sheet => sheet.href === absolute || sheet.href?.includes('/css/canonical-ui.css'));
    if (existing) return;
    await new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.canonicalUi = '1';
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  });
}

async function exposeAuth(page) {
  await page.evaluate(() => {
    const auth = document.getElementById('auth-screen');
    const dashboard = document.getElementById('app-dashboard');
    if (dashboard) dashboard.style.setProperty('display', 'none', 'important');
    if (auth) {
      auth.style.setProperty('display', 'flex', 'important');
      auth.style.setProperty('visibility', 'visible', 'important');
      auth.style.setProperty('opacity', '1', 'important');
      auth.removeAttribute('hidden');
    }
    for (const id of ['offline-banner', 'pwa-update-banner', 'pwa-install-banner']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
  });
}

async function exposeDashboardAuditFixture(page) {
  await loadAuditStyles(page);
  await page.evaluate(() => {
    for (const id of ['offline-banner', 'pwa-update-banner', 'pwa-install-banner', 'auth-screen']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
    const dashboard = document.getElementById('app-dashboard');
    if (!dashboard) throw new Error('app-dashboard ausente');
    dashboard.style.setProperty('display', 'block', 'important');
    dashboard.style.setProperty('visibility', 'visible', 'important');
    dashboard.removeAttribute('hidden');

    for (const tab of dashboard.querySelectorAll('.tab-content')) {
      tab.style.setProperty('display', 'none', 'important');
    }

    // O fixture precisa exercitar exatamente o seletor canônico de produção.
    // Remove o painel real (oculto nesta auditoria isolada) para não criar IDs duplicados.
    document.getElementById('retentionDiagnosticPanel')?.remove();

    let fixture = document.getElementById('visualAuditRetentionFixture');
    if (!fixture) {
      fixture = document.createElement('section');
      fixture.id = 'visualAuditRetentionFixture';
      fixture.className = 'card retention-diagnostic-panel';
      fixture.setAttribute('aria-label', 'Fixture visual dos cards de retenção');
      fixture.innerHTML = `
        <div id="retentionDiagnosticPanel">
          <div class="rd-center-v1077">
            <div class="rd-metrics-v1077">
              <div class="rd-metric-card-v1077"><span class="rd-metric-icon-v1077" aria-hidden="true">✓</span><span class="rd-metric-label-v1077">Retenção consolidada</span><strong>82%</strong><div class="rd-metric-progress-v1077"></div></div>
              <div class="rd-metric-card-v1077"><span class="rd-metric-icon-v1077" aria-hidden="true">◎</span><span class="rd-metric-label-v1077">Assuntos dominados</span><strong>18</strong><div class="rd-metric-progress-v1077"></div></div>
              <div class="rd-metric-card-v1077"><span class="rd-metric-icon-v1077" aria-hidden="true">↗</span><span class="rd-metric-label-v1077">Revisões em dia</span><strong>24</strong><div class="rd-metric-progress-v1077"></div></div>
              <div class="rd-metric-card-v1077"><span class="rd-metric-icon-v1077" aria-hidden="true">!</span><span class="rd-metric-label-v1077">Pontos de atenção</span><strong>3</strong><div class="rd-metric-progress-v1077"></div></div>
            </div>
          </div>
        </div>`;
      dashboard.appendChild(fixture);
    }
    fixture.style.setProperty('display', 'block', 'important');
    fixture.style.setProperty('visibility', 'visible', 'important');
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  });
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: autenticação não estoura nem corta botões`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await exposeAuth(page);
    await expect(page.locator('#auth-screen')).toBeVisible();
    await auditDocumentOverflow(page);
    await auditVisibleControls(page, ['#auth-screen']);
    await page.screenshot({ path: testInfo.outputPath(`auth-${viewport.name}.png`), fullPage: true });
  });

  test(`${viewport.name}: dashboard preserva geometria responsiva`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await exposeDashboardAuditFixture(page);
    await expect(page.locator('.modern-header')).toBeVisible();
    await expect(page.locator('#visualAuditRetentionFixture')).toBeVisible();
    await auditDocumentOverflow(page);
    await auditVisibleControls(page, ['.modern-header', '#visualAuditRetentionFixture']);
    await auditRetentionCards(page);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${viewport.name}.png`), fullPage: true });
  });
}
