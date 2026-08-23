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

async function auditVisibleControls(page) {
  const failures = await page.evaluate(() => {
    const selectors = [
      'button',
      '.btn',
      '.btn-action',
      'label.btn-action'
    ];
    const seen = new Set();
    const bad = [];
    for (const el of document.querySelectorAll(selectors.join(','))) {
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
    return bad;
  });
  expect(failures, `Controles com texto cortado/escapando: ${JSON.stringify(failures, null, 2)}`).toEqual([]);
}

async function auditRetentionCards(page) {
  const result = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.rd-metric-card-v1077')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
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

async function exposeDashboard(page) {
  await page.evaluate(() => {
    for (const id of ['offline-banner', 'pwa-update-banner', 'pwa-install-banner', 'auth-screen']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
    const dashboard = document.getElementById('app-dashboard');
    if (dashboard) {
      dashboard.style.setProperty('display', 'block', 'important');
      dashboard.style.setProperty('visibility', 'visible', 'important');
      dashboard.removeAttribute('hidden');
    }
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  });
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: autenticação não estoura nem corta botões`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#auth-screen')).toBeVisible();
    await auditDocumentOverflow(page);
    await auditVisibleControls(page);
    await page.screenshot({
      path: testInfo.outputPath(`auth-${viewport.name}.png`),
      fullPage: true
    });
  });

  test(`${viewport.name}: dashboard preserva geometria responsiva`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await exposeDashboard(page);
    await expect(page.locator('.modern-header')).toBeVisible();
    await expect(page.locator('#retentionDiagnosticPanel')).toBeVisible();
    await auditDocumentOverflow(page);
    await auditVisibleControls(page);
    await auditRetentionCards(page);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${viewport.name}.png`),
      fullPage: true
    });
  });
}
