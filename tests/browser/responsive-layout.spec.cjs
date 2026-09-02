const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const releaseContract = JSON.parse(fs.readFileSync('config/release-contract.json', 'utf8'));
const RESPONSIVE_POLISH_PATH = `/css/responsive-polish-v${releaseContract.version}.css`;

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

async function auditProductionStyles(page) {
  await page.waitForFunction((responsivePolishPath) => {
    const styles = [...document.styleSheets].map(sheet => sheet.href || '').filter(Boolean);
    const canonicalIndex = styles.findIndex(href => href.includes('/css/canonical-ui.css'));
    const polishIndexes = styles
      .map((href, index) => href.includes(responsivePolishPath) ? index : -1)
      .filter(index => index >= 0);
    return canonicalIndex >= 0 && polishIndexes.some(index => index > canonicalIndex);
  }, RESPONSIVE_POLISH_PATH, { timeout: 10000 });

  const styles = await page.evaluate(() => [...document.styleSheets]
    .map(sheet => sheet.href)
    .filter(Boolean));
  const canonicalIndex = styles.findIndex(href => href.includes('/css/canonical-ui.css'));
  const lastPolishIndex = styles.reduce((last, href, index) => href.includes(RESPONSIVE_POLISH_PATH) ? index : last, -1);
  expect(canonicalIndex, 'canonical-ui de produção não carregado').toBeGreaterThanOrEqual(0);
  expect(lastPolishIndex, 'responsive-polish de produção não carregado').toBeGreaterThan(canonicalIndex);
}

async function auditRetentionCards(page) {
  const result = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#visualAuditRetentionFixture .rd-metric-card-v1077')];
    return cards.map(card => {
      const cardRect = card.getBoundingClientRect();
      const icon = card.querySelector('.rd-metric-icon-v1077');
      const label = card.querySelector('.rd-metric-label-v1077');
      const iconStyle = icon ? getComputedStyle(icon) : null;
      const iconRect = icon?.getBoundingClientRect();
      const labelStyle = label ? getComputedStyle(label) : null;
      const labelRect = label?.getBoundingClientRect();
      return {
        label: label?.textContent?.trim() || '',
        labelInside: !!labelRect && labelRect.left >= cardRect.left - 1 && labelRect.right <= cardRect.right + 1 && labelRect.top >= cardRect.top - 1 && labelRect.bottom <= cardRect.bottom + 1,
        iconHidden: !icon || iconStyle?.display === 'none' || !iconRect || iconRect.width < 1 || iconRect.height < 1,
        labelOverflowX: label ? label.scrollWidth > label.clientWidth + 2 : true,
        labelOverflowY: label ? label.scrollHeight > label.clientHeight + 2 : true,
        labelFontSize: labelStyle ? Number.parseFloat(labelStyle.fontSize) : 0,
        labelFontWeight: labelStyle ? Number.parseInt(labelStyle.fontWeight, 10) || 0 : 0,
        labelTextAlign: labelStyle?.textAlign || ''
      };
    });
  });

  expect(result.length).toBe(4);
  for (const item of result) {
    expect(item.labelInside, `Rótulo fora do card: ${item.label}`).toBe(true);
    expect(item.iconHidden, `Ícone decorativo ainda visível: ${item.label}`).toBe(true);
    expect(item.labelOverflowX, `Rótulo cortado horizontalmente: ${item.label}`).toBe(false);
    expect(item.labelOverflowY, `Rótulo cortado verticalmente: ${item.label}`).toBe(false);
    expect(item.labelTextAlign, `Título não centralizado: ${item.label}`).toBe('center');
    expect(item.labelFontSize, `Título pequeno demais: ${item.label}`).toBeGreaterThanOrEqual(11);
    expect(item.labelFontSize, `Título maior que o contrato compacto: ${item.label}`).toBeLessThanOrEqual(14.75);
    expect(item.labelFontWeight, `Título sem peso visual suficiente: ${item.label}`).toBeGreaterThanOrEqual(700);
  }
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

    document.getElementById('retentionDiagnosticPanel')?.remove();

    let fixture = document.getElementById('visualAuditRetentionFixture');
    if (!fixture) {
      fixture = document.createElement('section');
      fixture.id = 'visualAuditRetentionFixture';
      fixture.className = 'card retention-diagnostic-panel';
      fixture.setAttribute('aria-label', 'Fixture visual dos cards de retenção');
      fixture.innerHTML = `
        <div class="rd-center-v1077">
          <div class="rd-metrics-v1077">
            <div class="rd-metric-card-v1077"><span class="rd-metric-icon-v1077" aria-hidden="true">✓</span><span class="rd-metric-label-v1077">Retenção média</span><strong>82%</strong><div class="rd-metric-progress-v1077"></div></div>
            <div class="rd-metric-card-v1077 rd-metric-risk-v1077"><span class="rd-metric-icon-v1077" aria-hidden="true">!</span><span class="rd-metric-label-v1077">Assuntos em risco</span><strong>3</strong><div class="rd-metric-progress-v1077"></div></div>
            <div class="rd-metric-card-v1077"><span class="rd-metric-icon-v1077" aria-hidden="true">◎</span><span class="rd-metric-label-v1077">Revisões vencidas</span><strong>0</strong><div class="rd-metric-progress-v1077"></div></div>
            <div class="rd-metric-card-v1077"><span class="rd-metric-icon-v1077" aria-hidden="true">✓</span><span class="rd-metric-label-v1077">Assuntos dominados</span><strong>18</strong><div class="rd-metric-progress-v1077"></div></div>
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
    await auditProductionStyles(page);
    await exposeAuth(page);
    await expect(page.locator('#auth-screen')).toBeVisible();
    await auditDocumentOverflow(page);
    await auditVisibleControls(page, ['#auth-screen']);
    await page.screenshot({ path: testInfo.outputPath(`auth-${viewport.name}.png`), fullPage: true });
  });

  test(`${viewport.name}: dashboard preserva geometria responsiva`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await auditProductionStyles(page);
    await exposeDashboardAuditFixture(page);
    await expect(page.locator('.modern-header')).toBeVisible();
    await expect(page.locator('#visualAuditRetentionFixture')).toBeVisible();
    await auditDocumentOverflow(page);
    await auditVisibleControls(page, ['.modern-header', '#visualAuditRetentionFixture']);
    await auditRetentionCards(page);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${viewport.name}.png`), fullPage: true });
  });
}
