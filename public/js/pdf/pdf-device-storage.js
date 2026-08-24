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
    if (typeof global.showSaveFilePicker !== 'function') return { handled: false, saved: false, cancelled: false };
    try {
      const handle = await global.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { handled: true, saved: true, cancelled: false };
    } catch (error) {
      if (error?.name === 'AbortError') return { handled: true, saved: false, cancelled: true };
      return { handled: false, saved: false, cancelled: false };
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
    const pickerResult = await saveBlobWithPicker(typedBlob, fileName);
    if (pickerResult.cancelled) return { pdfId: String(doc.id), fileName, size: Number(typedBlob.size || 0), cancelled: true };
    if (!pickerResult.handled) saveBlobWithDownload(typedBlob, fileName);

    try {
      global.dispatchEvent(new CustomEvent('pdf-saved-to-device', {
        detail: { pdfId: String(doc.id), fileName, size: Number(typedBlob.size || 0) }
      }));
    } catch (_) {}

    return { pdfId: String(doc.id), fileName, size: Number(typedBlob.size || 0), cancelled: false };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .pdf-device-save-action { min-width:0; }
      @media (max-width:900px) {
        .pdf-card-actions.pdf-device-storage-actions {
          display:grid!important;
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:10px!important;
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          align-items:stretch!important;
          box-sizing:border-box!important;
        }
        .pdf-card-actions.pdf-device-storage-actions > .pdf-library-card-action {
          display:flex!important;
          align-items:center!important;
          justify-content:center!important;
          width:100%!important;
          min-width:0!important;
          max-width:100%!important;
          min-height:44px!important;
          padding:9px 8px!important;
          white-space:normal!important;
          overflow:visible!important;
          overflow-wrap:break-word!important;
          word-break:normal!important;
          text-wrap:balance!important;
          text-align:center!important;
          line-height:1.15!important;
          font-size:clamp(.72rem,2.4vw,.88rem)!important;
          grid-column:auto!important;
          box-sizing:border-box!important;
        }
        .pdf-card-actions.pdf-device-storage-actions > .pdf-device-save-action {
          font-size:clamp(.68rem,2.25vw,.82rem)!important;
          line-height:1.12!important;
          padding-inline:6px!important;
        }
        .pdf-card-actions.pdf-device-storage-actions > .pdf-library-card-action:last-child:nth-child(odd) {
          grid-column:1/-1!important;
        }
      }
      @media (max-width:420px) {
        .pdf-card-actions.pdf-device-storage-actions { gap:8px!important; }
        .pdf-card-actions.pdf-device-storage-actions > .pdf-library-card-action {
          padding:8px 6px!important;
          font-size:clamp(.69rem,3vw,.82rem)!important;
        }
        .pdf-card-actions.pdf-device-storage-actions > .pdf-device-save-action {
          font-size:clamp(.64rem,2.85vw,.76rem)!important;
          padding-inline:4px!important;
        }
      }
      @media (max-width:340px) {
        .pdf-card-actions.pdf-device-storage-actions { gap:6px!important; }
        .pdf-card-actions.pdf-device-storage-actions > .pdf-library-card-action {
          padding:7px 5px!important;
          font-size:clamp(.66rem,3.2vw,.76rem)!important;
        }
        .pdf-card-actions.pdf-device-storage-actions > .pdf-device-save-action {
          font-size:clamp(.61rem,3vw,.72rem)!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function extractPdfIdFromInline(value) {
    const inline = String(value || '');
    const patterns = [
      /openDocument\(['"]([^'"]+)['"]\)/,
      /openLinkModal\(['"]([^'"]+)['"]\)/,
      /unlinkDocument\(['"]([^'"]+)['"]\)/,
      /deleteDocument\(['"]([^'"]+)['"]\)/,
      /toggleFavorite\(['"]([^'"]+)['"]\)/
    ];
    for (const pattern of patterns) {
      const match = inline.match(pattern);
      if (match?.[1]) return match[1];
    }
    return '';
  }

  function extractPdfId(card) {
    if (!card) return '';
    const direct = card.dataset?.pdfId || card.getAttribute?.('data-pdf-id') || '';
    if (direct) return String(direct);
    for (const node of card.querySelectorAll?.('[onclick]') || []) {
      const id = extractPdfIdFromInline(node.getAttribute('onclick'));
      if (id) return id;
    }
    return '';
  }

  function createSaveButton(pdfId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-sm pdf-library-card-action pdf-device-save-action';
    button.textContent = 'Salvar no dispositivo';
    button.setAttribute('aria-label', 'Salvar PDF no dispositivo');
    button.dataset.pdfId = String(pdfId);
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const currentPdfId = button.dataset.pdfId || pdfId;
      const originalText = 'Salvar no dispositivo';
      button.disabled = true;
      button.textContent = 'Salvando…';
      try {
        const result = await saveToDevice(currentPdfId);
        const status = document.getElementById('pdfLibraryStatus');
        if (result.cancelled) {
          button.textContent = originalText;
          if (status) {
            status.textContent = 'Salvamento cancelado. Nenhum arquivo foi criado.';
            status.dataset.kind = 'info';
          }
          return;
        }
        button.textContent = 'Salvo';
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
    return button;
  }

  function injectSaveButtons(root = document) {
    ensureStyles();
    const cards = root.querySelectorAll?.('.pdf-library-card') || [];
    for (const card of cards) {
      const actions = card.querySelector('.pdf-card-actions');
      if (!actions) continue;
      const pdfId = extractPdfId(card);
      if (!pdfId) continue;

      actions.classList.add('pdf-device-storage-actions');
      const existing = actions.querySelector('.pdf-device-save-action');
      if (existing) {
        existing.dataset.pdfId = String(pdfId);
        continue;
      }

      const button = createSaveButton(pdfId);
      const openButton = actions.querySelector('[onclick*="openDocument("]');
      if (openButton) openButton.insertAdjacentElement('afterend', button);
      else actions.insertAdjacentElement('afterbegin', button);
    }
  }

  function observeLibrary() {
    const root = document.getElementById('tab-biblioteca') || document.body;
    if (!root || root.dataset.pdfDeviceStorageObserved === '1') return;
    root.dataset.pdfDeviceStorageObserved = '1';
    let scheduled = false;
    const scheduleInjection = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        injectSaveButtons(root);
      });
    };
    const observer = new MutationObserver(scheduleInjection);
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
