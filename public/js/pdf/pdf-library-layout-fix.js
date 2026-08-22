(function (global) {
  'use strict';

  const STYLE_ID = 'pdfLibrarySingleRowDesktopFix';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* Desktop: cabeçalho, ações e filtros ocupam toda a largura útil da Biblioteca. */
@media (min-width:1101px) {
  .pdf-library-hero {
    display:grid!important;
    grid-template-columns:minmax(0,1fr)!important;
    align-items:start!important;
    gap:16px!important;
    width:100%!important;
  }
  .pdf-library-title {
    width:100%!important;
    min-width:0!important;
  }
  .pdf-library-actions {
    display:flex!important;
    flex-wrap:nowrap!important;
    align-items:stretch!important;
    justify-content:space-between!important;
    gap:clamp(10px,1.5vw,24px)!important;
    width:100%!important;
    max-width:none!important;
    margin-left:0!important;
  }
  .pdf-library-actions>.btn,
  .pdf-library-actions>.pdf-library-sort-control {
    flex:1 1 0!important;
    width:auto!important;
    min-width:150px!important;
    max-width:240px!important;
    min-height:48px!important;
    height:48px!important;
    box-sizing:border-box!important;
  }
  .pdf-library-actions>.pdf-library-sort-control {
    display:flex!important;
  }

  /* Hoje a barra possui exatamente cinco filtros. Eles dividem 100% da linha. */
  .pdf-library-filters {
    display:grid!important;
    grid-template-columns:repeat(5,minmax(0,1fr))!important;
    gap:10px!important;
    align-items:stretch!important;
    overflow:visible!important;
    padding-bottom:0!important;
    width:100%!important;
  }
  .pdf-library-filters>* {
    min-width:0!important;
    width:100%!important;
    max-width:none!important;
  }
  .pdf-library-filters #pdfLibrarySearch,
  .pdf-library-filters #pdfLibraryScope,
  .pdf-library-filters #pdfWorkspaceFilter,
  .pdf-library-filters #pdfMateriaFilter,
  .pdf-library-filters #pdfAssuntoFilter {
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    grid-column:auto!important;
  }

  #pdfOfflineManager {
    grid-column:1/-1!important;
    width:100%!important;
    max-width:none!important;
  }

  #pdfOfflineManager .pdf-offline-controls {
    display:grid!important;
    grid-template-columns:minmax(170px,210px) max-content minmax(220px,1fr) auto!important;
    align-items:center!important;
    gap:10px!important;
    overflow:visible!important;
    padding-bottom:0!important;
    width:100%!important;
  }
  #pdfOfflineManager .pdf-offline-limit-wrap{width:100%!important;min-width:0!important;}
  #pdfOfflineManager .pdf-offline-storage{min-width:0!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left!important;}
  #pdfOfflineManager .pdf-offline-actions{display:flex!important;flex-wrap:nowrap!important;gap:8px!important;justify-content:flex-end!important;}
  #pdfOfflineManager .pdf-offline-actions button{width:auto!important;min-width:118px!important;white-space:nowrap!important;}
  #pdfOfflineManager .pdf-offline-actions .primary{min-width:150px!important;}
}

/* Tablet/mobile: uma linha rolável, sem reduzir os alvos de toque. */
@media (max-width:1100px) {
  .pdf-library-hero{width:100%!important;}
  .pdf-library-actions {
    display:flex!important;
    flex-wrap:nowrap!important;
    width:100%!important;
    max-width:100%!important;
    margin-left:0!important;
    gap:9px!important;
    overflow-x:auto!important;
    overflow-y:hidden!important;
    padding-bottom:6px!important;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior-inline:contain;
    scrollbar-width:thin;
  }
  .pdf-library-actions>* {
    flex:0 0 150px!important;
    width:150px!important;
    min-width:150px!important;
    max-width:150px!important;
  }

  .pdf-library-filters {
    display:flex!important;
    flex-wrap:nowrap!important;
    align-items:stretch!important;
    gap:9px!important;
    overflow-x:auto!important;
    overflow-y:hidden!important;
    padding-bottom:6px!important;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior-inline:contain;
    scrollbar-width:thin;
  }
  .pdf-library-filters>*{flex:0 0 auto!important;}
  .pdf-library-filters #pdfLibrarySearch{width:220px!important;min-width:220px!important;}
  .pdf-library-filters #pdfLibraryScope{width:190px!important;min-width:190px!important;}
  .pdf-library-filters #pdfWorkspaceFilter{width:210px!important;min-width:210px!important;}
  .pdf-library-filters #pdfMateriaFilter,
  .pdf-library-filters #pdfAssuntoFilter{width:200px!important;min-width:200px!important;}

  #pdfOfflineManager{width:100%!important;max-width:none!important;}
  #pdfOfflineManager .pdf-offline-controls{
    display:flex!important;
    flex-wrap:nowrap!important;
    align-items:center!important;
    gap:8px!important;
    overflow-x:auto!important;
    overflow-y:hidden!important;
    padding-bottom:6px!important;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior-inline:contain;
    scrollbar-width:thin;
  }
  #pdfOfflineManager .pdf-offline-controls>*{flex:0 0 auto!important;}
  #pdfOfflineManager .pdf-offline-limit-wrap{width:190px!important;}
  #pdfOfflineManager .pdf-offline-storage{white-space:nowrap!important;}
  #pdfOfflineManager .pdf-offline-actions{display:flex!important;flex-wrap:nowrap!important;gap:7px!important;}
  #pdfOfflineManager .pdf-offline-actions button{width:auto!important;min-width:116px!important;min-height:44px!important;white-space:nowrap!important;}
  #pdfOfflineManager .pdf-offline-actions .primary{min-width:145px!important;}
}
`;
    document.head.appendChild(style);
  }

  function placeOfflinePanel() {
    const filters = document.querySelector('.pdf-library-filters');
    const panel = document.getElementById('pdfOfflineManager');
    if (!filters || !panel) return false;
    if (panel.previousElementSibling !== filters) {
      filters.insertAdjacentElement('afterend', panel);
    }
    return true;
  }

  function apply() {
    ensureStyles();
    placeOfflinePanel();
  }

  function boot() {
    apply();
    const root = document.getElementById('tab-biblioteca') || document.body;
    const observer = new MutationObserver(() => requestAnimationFrame(apply));
    observer.observe(root, { childList: true, subtree: true });
    global.addEventListener('resize', apply, { passive: true });
    global.addEventListener('pageshow', apply);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window);
