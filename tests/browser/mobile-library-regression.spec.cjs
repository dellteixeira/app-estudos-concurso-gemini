const { test, expect } = require('@playwright/test');

async function exposeDashboard(page) {
  await page.evaluate(() => {
    for (const id of ['auth-screen', 'offline-banner', 'pwa-update-banner', 'pwa-install-banner']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
    const dashboard = document.getElementById('app-dashboard');
    if (!dashboard) throw new Error('app-dashboard ausente');
    dashboard.style.setProperty('display', 'block', 'important');
    dashboard.style.setProperty('visibility', 'visible', 'important');
    dashboard.removeAttribute('hidden');
    for (const tab of dashboard.querySelectorAll('.tab-content')) tab.style.setProperty('display', 'none', 'important');
    const library = document.getElementById('tab-biblioteca');
    if (!library) throw new Error('tab-biblioteca ausente');
    library.style.setProperty('display', 'block', 'important');
    library.style.setProperty('visibility', 'visible', 'important');

    const grid = document.getElementById('pdfLibraryGrid');
    if (grid) {
      grid.innerHTML = `<article class="pdf-library-card">
        <div class="pdf-card-top"><span class="pdf-file-badge">PDF</span></div>
        <h4>2. Teoria do Delito_parte I_tipicidade e ilicitude com um título propositalmente longo para validar a contenção mobile</h4>
        <p class="pdf-card-context">1 vínculo de estudo</p>
        <p class="pdf-card-workspace">Biblioteca Global</p>
        <div class="pdf-progress-line"><span></span></div>
        <div class="pdf-card-meta"><span>0% lido · pág. 1</span><span>28 MB</span></div>
        <div class="pdf-card-actions">
          <button class="btn btn-secondary pdf-library-card-action">Visualizar</button>
          <button class="btn btn-secondary pdf-library-card-action">Vincular</button>
          <button class="btn btn-danger pdf-library-card-action pdf-library-card-delete">Excluir</button>
        </div>
      </article>`;
    }

    let offline = document.getElementById('pdfOfflineManager');
    if (!offline) {
      offline = document.createElement('section');
      offline.id = 'pdfOfflineManager';
      offline.className = 'pdf-offline-manager';
      offline.innerHTML = `<div class="pdf-offline-options"><label class="pdf-offline-option"><span>Apenas PDFs que eu abrir</span></label></div>
        <div class="pdf-offline-controls">
          <label class="pdf-offline-limit-wrap"><select><option>Limite: 1 GB</option></select></label>
          <label class="pdf-offline-wifi"><input type="checkbox"> Somente Wi-Fi</label>
          <div class="pdf-offline-storage">Uso: 0 MB · livre seguro: 1 GB</div>
          <div class="pdf-offline-actions"><button>Preparar agora</button><button>Pausar</button><button>Cancelar fila</button></div>
        </div>
        <div class="pdf-offline-progress"><span></span></div><div class="pdf-offline-status">Pronto.</div>`;
      document.querySelector('.pdf-library-filters')?.insertAdjacentElement('afterend', offline);
    }
  });
  await page.addScriptTag({ url: '/js/pdf/pdf-library-layout-fix.js' });
  await page.addScriptTag({ url: '/js/ui/mobile.js' });
  await page.waitForTimeout(80);
}

async function assertScrollableRail(page, selector) {
  const result = await page.locator(selector).evaluate(el => {
    const rect = el.getBoundingClientRect();
    const before = { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, left: rect.left, right: rect.right };
    el.scrollLeft = el.scrollWidth;
    const lastGroup = el.lastElementChild;
    const terminal = lastGroup?.querySelector?.('button:last-of-type, select:last-of-type, input:last-of-type, a:last-of-type') || lastGroup;
    const last = terminal?.getBoundingClientRect();
    return {
      ...before,
      viewport: document.documentElement.clientWidth,
      scrollLeft: el.scrollLeft,
      lastLeft: last?.left ?? 0,
      lastRight: last?.right ?? 0
    };
  });
  expect(result.right).toBeLessThanOrEqual(result.viewport + 1);
  expect(result.left).toBeGreaterThanOrEqual(-1);
  expect(result.scrollWidth).toBeGreaterThan(result.clientWidth);
  expect(result.scrollLeft).toBeGreaterThan(0);
  expect(result.lastRight).toBeLessThanOrEqual(result.right + 2);
  expect(result.lastLeft).toBeGreaterThanOrEqual(result.left - 2);
}

test('mobile Biblioteca mantém cards na viewport e trilhos alcançáveis', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await exposeDashboard(page);

  const geometry = await page.evaluate(() => {
    const workspace = document.getElementById('pdfLibraryWorkspace')?.getBoundingClientRect();
    const card = document.querySelector('.pdf-library-card')?.getBoundingClientRect();
    return {
      viewport: document.documentElement.clientWidth,
      rootScroll: document.documentElement.scrollWidth,
      bodyScroll: document.body.scrollWidth,
      workspaceLeft: workspace?.left ?? 0,
      workspaceRight: workspace?.right ?? 9999,
      cardLeft: card?.left ?? 0,
      cardRight: card?.right ?? 9999
    };
  });

  expect(geometry.workspaceLeft).toBeGreaterThanOrEqual(-1);
  expect(geometry.workspaceRight).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.cardLeft).toBeGreaterThanOrEqual(geometry.workspaceLeft - 1);
  expect(geometry.cardRight).toBeLessThanOrEqual(geometry.workspaceRight + 1);
  expect(geometry.rootScroll).toBeLessThanOrEqual(geometry.viewport + 2);
  expect(geometry.bodyScroll).toBeLessThanOrEqual(geometry.viewport + 2);

  await assertScrollableRail(page, '.pdf-library-actions');
  await assertScrollableRail(page, '.pdf-library-filters');
  await assertScrollableRail(page, '#pdfOfflineManager .pdf-offline-controls');
});

test('mobile Mais realmente abre e fecha a barra extra', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await exposeDashboard(page);

  const bar = page.locator('.action-bar');
  await expect(bar).toHaveCSS('display', 'none');
  await page.evaluate(() => window.toggleModernTools());
  await expect(bar).toHaveCSS('display', 'grid');
  await expect(page.locator('[data-action="toggle-modern-tools"]').first()).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => window.toggleModernTools());
  await expect(bar).toHaveCSS('display', 'none');
  await expect(page.locator('[data-action="toggle-modern-tools"]').first()).toHaveAttribute('aria-expanded', 'false');
});
