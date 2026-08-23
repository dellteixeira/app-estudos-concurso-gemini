const { test, expect } = require('@playwright/test');

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800, minTarget: 40 },
  { name: 'tablet-768', width: 768, height: 1024, minTarget: 36 },
  { name: 'desktop-1366', width: 1366, height: 768, minTarget: 36 }
];

async function waitForCanonicalUi(page) {
  await page.waitForFunction(() => {
    const link = document.querySelector('link[data-canonical-ui]');
    if (!link) return false;
    return [...document.styleSheets].some(sheet => {
      try {
        return sheet.href && sheet.href.includes('/css/canonical-ui.css');
      } catch {
        return false;
      }
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

async function exposeDashboard(page) {
  await page.evaluate(() => {
    const auth = document.getElementById('auth-screen');
    const dashboard = document.getElementById('app-dashboard');
    if (auth) auth.style.setProperty('display', 'none', 'important');
    if (!dashboard) throw new Error('app-dashboard ausente');
    dashboard.style.setProperty('display', 'block', 'important');
    dashboard.style.setProperty('visibility', 'visible', 'important');
    dashboard.removeAttribute('hidden');
    for (const id of ['offline-banner', 'pwa-update-banner', 'pwa-install-banner']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
  });
}

async function auditAccessibleNames(page, rootSelector) {
  const failures = await page.evaluate((root) => {
    const host = document.querySelector(root);
    if (!host) return [{ reason: 'root-ausente', root }];
    const candidates = [...host.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])')];
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 2 && rect.height >= 2;
    };
    const labelText = (el) => {
      const aria = (el.getAttribute('aria-label') || '').trim();
      if (aria) return aria;
      const labelledBy = (el.getAttribute('aria-labelledby') || '').trim();
      if (labelledBy) {
        const text = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
        if (text) return text;
      }
      if (el.labels?.length) {
        const text = [...el.labels].map(label => label.textContent || '').join(' ').trim();
        if (text) return text;
      }
      const title = (el.getAttribute('title') || '').trim();
      if (title) return title;
      const alt = (el.getAttribute('alt') || '').trim();
      if (alt) return alt;
      return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    };
    return candidates.filter(visible).filter(el => !labelText(el)).map(el => ({
      reason: 'sem-nome-acessivel',
      tag: el.tagName,
      id: el.id || '',
      className: String(el.className || '').slice(0, 120),
      type: el.getAttribute('type') || '',
      role: el.getAttribute('role') || ''
    }));
  }, rootSelector);
  expect(failures, `Controles sem nome acessível em ${rootSelector}: ${JSON.stringify(failures, null, 2)}`).toEqual([]);
}

async function auditTouchTargets(page, rootSelector, minimum) {
  const failures = await page.evaluate(({ root, min }) => {
    const host = document.querySelector(root);
    if (!host) return [{ reason: 'root-ausente', root }];
    const candidates = [...host.querySelectorAll('button, .btn, .btn-action, a[href], select, input[type="button"], input[type="submit"], [role="button"]')];
    return candidates.flatMap(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 2 || rect.height < 2) return [];
      if (rect.width >= min && rect.height >= min) return [];
      return [{
        text: (el.innerText || el.textContent || el.getAttribute('aria-label') || el.id || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 80),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        minimum: min
      }];
    });
  }, { root: rootSelector, min: minimum });
  expect(failures, `Alvos interativos menores que ${minimum}px em ${rootSelector}: ${JSON.stringify(failures, null, 2)}`).toEqual([]);
}

async function auditKeyboardFocus(page, rootSelector) {
  const result = await page.evaluate((root) => {
    const host = document.querySelector(root);
    if (!host) return { count: 0, candidates: [] };
    const selector = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const candidates = [...host.querySelectorAll(selector)].filter(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 2 && rect.height >= 2;
    });
    candidates.forEach((el, index) => el.setAttribute('data-phase4-focus-index', String(index)));
    return { count: candidates.length };
  }, rootSelector);

  expect(result.count, `Nenhum controle focável encontrado em ${rootSelector}`).toBeGreaterThan(0);
  const checks = Math.min(result.count, 12);
  const failures = [];

  for (let index = 0; index < checks; index += 1) {
    const locator = page.locator(`${rootSelector} [data-phase4-focus-index="${index}"]`);
    await locator.focus();
    const state = await locator.evaluate((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const focusVisible = el.matches(':focus') && (
        style.outlineStyle !== 'none' ||
        parseFloat(style.outlineWidth || '0') > 0 ||
        style.boxShadow !== 'none'
      );
      const inViewport = rect.bottom >= 0 && rect.top <= innerHeight && rect.right >= 0 && rect.left <= innerWidth;
      return {
        focusVisible,
        inViewport,
        tag: el.tagName,
        id: el.id || '',
        text: (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow
      };
    });
    if (!state.focusVisible || !state.inViewport) failures.push(state);
  }

  expect(failures, `Falhas de foco visível/alcançável em ${rootSelector}: ${JSON.stringify(failures, null, 2)}`).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: autenticação mantém nomes, foco e alvos utilizáveis`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForCanonicalUi(page);
    await exposeAuth(page);
    await expect(page.locator('#auth-screen')).toBeVisible();
    await auditAccessibleNames(page, '#auth-screen');
    await auditTouchTargets(page, '#auth-screen', viewport.minTarget);
    await auditKeyboardFocus(page, '#auth-screen');
  });

  test(`${viewport.name}: header mantém nomes, foco e alvos utilizáveis`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForCanonicalUi(page);
    await exposeDashboard(page);
    await expect(page.locator('.modern-header')).toBeVisible();
    await auditAccessibleNames(page, '.modern-header');
    await auditTouchTargets(page, '.modern-header', viewport.minTarget);
    await auditKeyboardFocus(page, '.modern-header');
  });
}
