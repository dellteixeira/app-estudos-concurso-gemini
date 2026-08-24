const { test, expect } = require('@playwright/test');

async function exposeLibrary(page) {
  await page.waitForFunction(() => !!window.PdfDeviceStorage, null, { timeout: 10000 });
  await page.evaluate(() => {
    for (const id of ['auth-screen', 'offline-banner', 'pwa-update-banner', 'pwa-install-banner']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
    const dashboard = document.getElementById('app-dashboard');
    if (dashboard) {
      dashboard.style.setProperty('display', 'block', 'important');
      dashboard.style.setProperty('visibility', 'visible', 'important');
      dashboard.removeAttribute('hidden');
      for (const tab of dashboard.querySelectorAll('.tab-content')) tab.style.setProperty('display', 'none', 'important');
    }
    const library = document.getElementById('tab-biblioteca');
    if (!library) throw new Error('tab-biblioteca ausente');
    library.style.setProperty('display', 'block', 'important');
    library.style.setProperty('visibility', 'visible', 'important');

    const grid = document.getElementById('pdfLibraryGrid');
    if (!grid) throw new Error('pdfLibraryGrid ausente');
    grid.innerHTML = `<article class="pdf-library-card">
      <div class="pdf-card-top"><span class="pdf-file-badge">PDF</span></div>
      <h4>PDF de teste com título muito longo para validar os limites da tela do celular</h4>
      <p class="pdf-card-context">Biblioteca Global</p>
      <div class="pdf-card-actions">
        <button class="btn btn-secondary btn-sm pdf-library-card-action" onclick="PdfStudyLibraryUI.openDocument('pdf-test')">Visualizar</button>
        <button class="btn btn-secondary btn-sm pdf-library-card-action">Vincular</button>
        <button class="btn btn-danger btn-sm pdf-library-card-action pdf-library-card-delete">Excluir</button>
      </div>
    </article>`;
    window.PdfDeviceStorage.injectSaveButtons(grid);
  });
  await expect(page.locator('.pdf-device-save-action')).toHaveCount(1);
}

for (const width of [320, 390]) {
  test(`mobile ${width}px adiciona Salvar no dispositivo sem ultrapassar a viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await exposeLibrary(page);

    const save = page.locator('.pdf-device-save-action');
    await expect(save).toHaveCount(1);
    await expect(save).toHaveText('Salvar no dispositivo');

    const geometry = await page.locator('.pdf-library-card').evaluate(card => {
      const cardRect = card.getBoundingClientRect();
      const actions = card.querySelector('.pdf-card-actions');
      const actionRect = actions.getBoundingClientRect();
      const buttons = [...actions.querySelectorAll('.pdf-library-card-action')].map(button => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      });
      return {
        viewport: document.documentElement.clientWidth,
        bodyScroll: document.body.scrollWidth,
        rootScroll: document.documentElement.scrollWidth,
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        actionLeft: actionRect.left,
        actionRight: actionRect.right,
        columns: getComputedStyle(actions).gridTemplateColumns,
        buttons
      };
    });

    expect(geometry.cardLeft).toBeGreaterThanOrEqual(-1);
    expect(geometry.cardRight).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.actionLeft).toBeGreaterThanOrEqual(geometry.cardLeft - 1);
    expect(geometry.actionRight).toBeLessThanOrEqual(geometry.cardRight + 1);
    expect(geometry.rootScroll).toBeLessThanOrEqual(geometry.viewport + 2);
    expect(geometry.bodyScroll).toBeLessThanOrEqual(geometry.viewport + 2);
    expect(geometry.buttons).toHaveLength(4);
    for (const button of geometry.buttons) {
      expect(button.left).toBeGreaterThanOrEqual(geometry.actionLeft - 1);
      expect(button.right).toBeLessThanOrEqual(geometry.actionRight + 1);
      expect(button.width).toBeGreaterThan(0);
      expect(button.height).toBeGreaterThanOrEqual(43);
    }
  });
}

test('Salvar no dispositivo gera arquivo PDF externo ao armazenamento privado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await exposeLibrary(page);

  await page.evaluate(() => {
    window.showSaveFilePicker = undefined;
    window.PdfStudyLibrary = {
      list: async () => [{
        id: 'pdf-test',
        title: 'Direito Constitucional',
        original_file_name: 'Direito Constitucional - Aula 01.pdf',
        storage_path: 'u/pdf-test/original.pdf'
      }],
      downloadBlob: async () => new Blob(['%PDF-1.7\nPDF de teste'], { type: 'application/pdf' })
    };
  });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('.pdf-device-save-action').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Direito Constitucional - Aula 01.pdf');
});

test('cancelar o seletor não dispara download nem confirma salvamento', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await exposeLibrary(page);

  await page.evaluate(() => {
    window.PdfStudyLibrary = {
      list: async () => [{ id: 'pdf-test', title: 'PDF Teste', storage_path: 'u/pdf-test/original.pdf' }],
      downloadBlob: async () => new Blob(['%PDF-1.7\nPDF de teste'], { type: 'application/pdf' })
    };
    window.showSaveFilePicker = async () => {
      const error = new Error('cancelled');
      error.name = 'AbortError';
      throw error;
    };
  });

  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.locator('.pdf-device-save-action').click();
  await expect(page.locator('.pdf-device-save-action')).toHaveText('Salvar no dispositivo');
  await expect(page.locator('#pdfLibraryStatus')).toContainText('Salvamento cancelado');
  expect(downloads).toBe(0);
});

test('forgetDocuments solicita limpeza local moderna pelo caminho canônico', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.PdfStudyLibrary?.forgetDocuments, null, { timeout: 10000 });

  const result = await page.evaluate(async () => {
    const calls = [];
    window.PdfStudyCore = {
      ...(window.PdfStudyCore || {}),
      getAuthenticatedUser: async () => ({ id: 'user-test' })
    };
    window.PdfLibraryOfflineAdapter = {
      ...(window.PdfLibraryOfflineAdapter || {}),
      removeMany: async (userId, ids) => {
        calls.push({ userId, ids: [...ids] });
        return ids.length;
      }
    };

    await window.PdfStudyLibrary.forgetDocuments(['pdf-a', 'pdf-a']);
    return { calls };
  });

  expect(result.calls).toEqual([{ userId: 'user-test', ids: ['pdf-a'] }]);
});
