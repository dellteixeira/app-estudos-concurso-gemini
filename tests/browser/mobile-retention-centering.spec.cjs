const { test, expect } = require('@playwright/test');
const { version: RELEASE_VERSION } = require('../../config/release-contract.json');

const MOBILE_VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 }
];

const RESPONSIVE_STYLESHEET = `/css/responsive-polish-v${RELEASE_VERSION}.css`;

async function installRetentionFixture(page) {
  await page.evaluate(() => {
    for (const id of ['offline-banner', 'pwa-update-banner', 'pwa-install-banner', 'auth-screen', 'app-dashboard']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }

    document.getElementById('visualAuditRetentionCenteringFixture')?.remove();
    const fixture = document.createElement('section');
    fixture.id = 'visualAuditRetentionCenteringFixture';
    fixture.style.cssText = 'display:block;width:100%;max-width:680px;margin:0 auto;padding:16px;box-sizing:border-box;';
    fixture.innerHTML = `
      <div id="retentionDiagnosticPanel">
        <div class="rd-center-v1077">
          <div class="retention-diagnostic-tools">
            <button type="button" class="retention-study-now-v1072">Estudar agora</button>
            <button type="button" class="retention-export-btn">Exportar dados</button>
          </div>
          <div class="rd-metrics-v1077">
            <div class="rd-metric-card-v1077"><span class="rd-metric-label-v1077">Retenção média</span><strong>98%</strong><div class="rd-metric-progress-v1077"></div></div>
            <div class="rd-metric-card-v1077"><span class="rd-metric-label-v1077">Assuntos em risco</span><strong>1</strong><div class="rd-metric-progress-v1077"></div></div>
            <div class="rd-metric-card-v1077"><span class="rd-metric-label-v1077">Revisões vencidas</span><strong>0</strong><div class="rd-metric-progress-v1077"></div></div>
            <div class="rd-metric-card-v1077"><span class="rd-metric-label-v1077">Assuntos dominados</span><strong>3</strong><div class="rd-metric-progress-v1077"></div></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(fixture);
  });
}

async function readCentering(page) {
  return page.evaluate(() => {
    const centerX = rect => rect.left + rect.width / 2;
    const metrics = [...document.querySelectorAll('#visualAuditRetentionCenteringFixture .rd-metric-card-v1077')].map(card => {
      const cardRect = card.getBoundingClientRect();
      const label = card.querySelector('.rd-metric-label-v1077');
      const value = card.querySelector('strong');
      const labelRect = label.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();
      return {
        label: label.textContent.trim(),
        value: value.textContent.trim(),
        labelDelta: Math.abs(centerX(cardRect) - centerX(labelRect)),
        valueDelta: Math.abs(centerX(cardRect) - centerX(valueRect)),
        labelAlign: getComputedStyle(label).textAlign,
        valueAlign: getComputedStyle(value).textAlign
      };
    });

    const tools = document.querySelector('#visualAuditRetentionCenteringFixture .retention-diagnostic-tools');
    const toolsRect = tools.getBoundingClientRect();
    const actions = [...tools.querySelectorAll('.retention-study-now-v1072, .retention-export-btn')].map(button => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent.trim(),
        centerDelta: Math.abs(centerX(toolsRect) - centerX(rect)),
        textAlign: getComputedStyle(button).textAlign
      };
    });

    return { metrics, actions };
  });
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`${viewport.name}: retenção mantém títulos, valores e ações centralizados`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(expectedStylesheet => [...document.styleSheets]
      .some(sheet => (sheet.href || '').includes(expectedStylesheet)), RESPONSIVE_STYLESHEET);

    await installRetentionFixture(page);
    const result = await readCentering(page);

    expect(result.metrics).toHaveLength(4);
    for (const metric of result.metrics) {
      expect(metric.labelAlign, `Título sem text-align center: ${metric.label}`).toBe('center');
      expect(metric.valueAlign, `Valor sem text-align center: ${metric.label}`).toBe('center');
      expect(metric.labelDelta, `Título fora do centro: ${metric.label}`).toBeLessThanOrEqual(3);
      expect(metric.valueDelta, `Valor fora do centro: ${metric.label} (${metric.value})`).toBeLessThanOrEqual(3);
    }

    expect(result.actions).toHaveLength(2);
    for (const action of result.actions) {
      expect(action.textAlign, `Texto do botão sem centralização: ${action.text}`).toBe('center');
      expect(action.centerDelta, `Botão fora do centro: ${action.text}`).toBeLessThanOrEqual(3);
    }
  });
}
