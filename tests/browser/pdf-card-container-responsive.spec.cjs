const { test, expect } = require('@playwright/test');

async function mountCards(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    if (!document.querySelector('link[data-test-pdf-card-actions]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './css/pdf-mobile-card-actions.css?container-test=1';
      link.dataset.testPdfCardActions = '1';
      document.head.appendChild(link);
      await new Promise((resolve, reject) => {
        link.onload = resolve;
        link.onerror = reject;
      });
    }

    const host = document.createElement('div');
    host.id = 'containerQueryPdfCards';
    host.style.cssText = 'display:grid;gap:24px;padding:24px;width:100%;box-sizing:border-box;';
    host.innerHTML = `
      <article class="pdf-library-card" data-test-card="narrow" style="width:480px;max-width:480px">
        <div class="pdf-card-actions pdf-device-storage-actions">
          <button class="btn btn-secondary pdf-library-card-action pdf-device-save-action">Salvar no dispositivo</button>
          <button class="btn btn-secondary pdf-library-card-action">Vincular</button>
          <button class="btn btn-danger pdf-library-card-action pdf-library-card-delete">Excluir</button>
        </div>
      </article>
      <article class="pdf-library-card" data-test-card="wide" style="width:700px;max-width:700px">
        <div class="pdf-card-actions pdf-device-storage-actions">
          <button class="btn btn-secondary pdf-library-card-action pdf-device-save-action">Salvar no dispositivo</button>
          <button class="btn btn-secondary pdf-library-card-action">Vincular</button>
          <button class="btn btn-danger pdf-library-card-action pdf-library-card-delete">Excluir</button>
        </div>
      </article>`;
    document.body.innerHTML = '';
    document.body.appendChild(host);
  });
}

function metricsFor(selector) {
  return selector.evaluate(card => {
    const actions = card.querySelector('.pdf-card-actions');
    const buttons = [...actions.querySelectorAll('button')].map(button => {
      const rect = button.getBoundingClientRect();
      return {
        label: button.textContent.trim(),
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
        fontSize: Number.parseFloat(getComputedStyle(button).fontSize),
        whiteSpace: getComputedStyle(button).whiteSpace
      };
    });
    const actionRect = actions.getBoundingClientRect();
    return {
      display: getComputedStyle(actions).display,
      columns: getComputedStyle(actions).gridTemplateColumns.split(' ').filter(Boolean),
      actionLeft: actionRect.left,
      actionRight: actionRect.right,
      buttons
    };
  });
}

test('desktop: card estreito usa composição compacta pela própria largura', async ({ page }) => {
  await mountCards(page);
  const metrics = await metricsFor(page.locator('[data-test-card="narrow"]'));
  expect(metrics.display).toBe('grid');
  expect(metrics.columns).toHaveLength(2);
  expect(metrics.buttons).toHaveLength(3);
  expect(metrics.buttons.at(-1).width).toBeGreaterThan(metrics.buttons[0].width * 1.8);
  for (const button of metrics.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(metrics.actionLeft - 1);
    expect(button.right).toBeLessThanOrEqual(metrics.actionRight + 1);
    expect(button.height).toBeGreaterThanOrEqual(43);
    expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 2);
  }
  const save = metrics.buttons[0];
  expect(save.label).toBe('Salvar no dispositivo');
  expect(save.whiteSpace).toBe('normal');
});

test('desktop: card largo usa três colunas e reserva mais espaço ao botão longo', async ({ page }) => {
  await mountCards(page);
  const metrics = await metricsFor(page.locator('[data-test-card="wide"]'));
  expect(metrics.display).toBe('grid');
  expect(metrics.columns).toHaveLength(3);
  expect(metrics.buttons).toHaveLength(3);
  expect(metrics.buttons[0].width).toBeGreaterThan(metrics.buttons[1].width * 1.15);
  for (const button of metrics.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(metrics.actionLeft - 1);
    expect(button.right).toBeLessThanOrEqual(metrics.actionRight + 1);
    expect(button.height).toBeGreaterThanOrEqual(43);
    expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 2);
  }
  expect(metrics.buttons[0].label).toBe('Salvar no dispositivo');
});
