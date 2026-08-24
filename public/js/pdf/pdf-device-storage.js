(function (global) {
  'use strict';

  const STYLE_ID = 'pdfDeviceStorageStyles';

  function sanitizeFileName(value) {
    const base = String(value || 'documento.pdf')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'documento.pdf';
    return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
  }

  async function findDocument(pdfId) {
    if (!pdfId) throw new Error('PDF inválido.');
    const docs = await global.PdfStudyLibrary?.list?.({ scope: 'global' });
    const doc = (docs || []).find(item => String(item.id) === String(pdfId));
    if (!doc) throw new Error('PDF não encontrado na Biblioteca Global.');
    return doc;
  }

  async function saveBlobWithPicker(blob, fileName) {
    if (typeof global.showSaveFilePicker !== 'function') return false;
    try {
      const handle = await global.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return true;
      return false;
    }
  }

  function saveBlobWithDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  }

  async function saveToDevice(pdfId) {
    const doc = await findDocument(pdfId);
    const fileName = sanitizeFileName(doc.original_file_name || doc.title || 'documento.pdf');
    const blob = await global.PdfStudyLibrary.downloadBlob(doc);
    if (!blob?.size) throw new Error('Não foi possível preparar o PDF para salvar no dispositivo.');

    const typedBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
    const pickerHandled = await saveBlobWithPicker(typedBlob, fileName);
    if (!pickerHandled) saveBlobWithDownload(typedBlob, fileName);

    try {
      global.dispatchEvent(new CustomEvent('pdf-saved-to-device', {
        detail: { pdfId: String(doc.id), fileName, size: Number(typedBlob.size || 0) }
      }));
    } catch (_) {}

    return { pdfId: String(doc.id), fileName, size: Number(typedBlob.size || 0) };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .pdf-device-save-action { min-width:0; }
      @media (max-width:700px) {
        .pdf-card-actions.pdf-device-storage-actions {
          display:grid!important;
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:8px!important;
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
        }
        .pdf-card-actions.pdf-device-storage-actions > .pdf-library-card-action {
          width:100%!important;
          min-width:0!important;
          max-width:100%!important;
          min-height:44px!important;
          padding:8px 7px!important;
          white-space:normal!important;
          overflow-wrap:anywhere!important;
          line-height:1.12!important;
          font-size:clamp(.69rem,3.2vw,.82rem)!important;
          grid-column:auto!important;
        }
        .pdf-card-actions.pdf-device-storage-actions > :last-child:nth-child(3) {
          grid-column:1/-1!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function extractPdfId(button) {
    const inline = button?.getAttribute?.('onclick') || '';
    return inline.match(/openDocument\(['"]([^'"]+)['"]\)/)?.[1] || '';
  }

  function injectSaveButtons(root = document) {
    ensureStyles();
    const cards = root.querySelectorAll?.('.pdf-library-card') || [];
    for (const card of cards) {
      const actions = card.querySelector('.pdf-card-actions');
      const openButton = actions?.querySelector('[onclick*="openDocument("]');
      if (!actions || !openButton) continue;
      actions.classList.add('pdf-device-storage-actions');
      if (actions.querySelector('.pdf-device-save-action')) continue;
      const pdfId = extractPdfId(openButton);
      if (!pdfId) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary btn-sm pdf-library-card-action pdf-device-save-action';
      button.textContent = 'Salvar no dispositivo';
      button.setAttribute('aria-label', 'Salvar PDF no dispositivo');
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Salvando…';
        try {
          const result = await saveToDevice(pdfId);
          button.textContent = 'Salvo';
          const status = document.getElementById('pdfLibraryStatus');
          if (status) {
            status.textContent = `${result.fileName} foi enviado para o armazenamento do dispositivo.`;
            status.dataset.kind = 'ok';
          }
          setTimeout(() => { if (button.isConnected) button.textContent = originalText; }, 1800);
        } catch (error) {
          console.error('[PDF Device Storage]', error);
          button.textContent = originalText;
          const status = document.getElementById('pdfLibraryStatus');
          if (status) {
            status.textContent = error?.message || 'Não foi possível salvar o PDF no dispositivo.';
            status.dataset.kind = 'error';
          }
        } finally {
          button.disabled = false;
        }
      });
      openButton.insertAdjacentElement('afterend', button);
    }
  }

  function observeLibrary() {
    const root = document.getElementById('tab-biblioteca') || document.body;
    if (!root || root.dataset.pdfDeviceStorageObserved === '1') return;
    root.dataset.pdfDeviceStorageObserved = '1';
    const observer = new MutationObserver(() => requestAnimationFrame(() => injectSaveButtons(root)));
    observer.observe(root, { childList: true, subtree: true });
    injectSaveButtons(root);
  }

  function boot() {
    ensureStyles();
    observeLibrary();
    injectSaveButtons();
  }

  global.PdfDeviceStorage = Object.freeze({
    saveToDevice,
    sanitizeFileName,
    injectSaveButtons
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window);
