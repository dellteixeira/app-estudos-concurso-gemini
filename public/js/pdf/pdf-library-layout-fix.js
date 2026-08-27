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
    display:grid!important;
    grid-template-columns:repeat(4,minmax(0,1fr))!important;
    align-items:stretch!important;
    gap:10px!important;
    width:100%!important;
    max-width:none!important;
    margin:0!important;
  }
  .pdf-library-actions>.btn,
  .pdf-library-actions>.pdf-library-sort-control {
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    min-height:48px!important;
    height:48px!important;
    box-sizing:border-box!important;
  }
  .pdf-library-actions>.btn {
    justify-content:flex-start!important;
    padding-inline:22px!important;
    white-space:nowrap!important;
  }
  .pdf-library-actions>.pdf-library-sort-control {
    display:flex!important;
    padding-inline:18px!important;
  }
  .pdf-library-actions>.pdf-library-sort-control select {
    width:100%!important;
    min-width:0!important;
  }

  /* A barra possui quatro filtros. Eles dividem 100% da linha. */
  .pdf-library-filters {
    display:grid!important;
    grid-template-columns:repeat(4,minmax(0,1fr))!important;
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
  #pdfOfflineManager .pdf-offline-actions{display:contents!important;}
  #pdfOfflineManager .pdf-offline-actions button{
    flex:0 0 auto!important;
    width:auto!important;
    min-width:116px!important;
    min-height:44px!important;
    white-space:nowrap!important;
  }
  #pdfOfflineManager .pdf-offline-actions .primary{min-width:145px!important;}
}

/* Mobile: nenhum elemento da Biblioteca pode ampliar a viewport.
   Barras permanecem roláveis, com trilho visível e respiro nas bordas. */
@media (max-width:700px) {
  #tab-biblioteca,
  #pdfLibraryWorkspace,
  .pdf-library-shell,
  .pdf-library-hero,
  .pdf-library-title,
  .pdf-library-grid,
  .pdf-library-card,
  #pdfOfflineManager {
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    box-sizing:border-box!important;
  }

  #pdfLibraryWorkspace {
    overflow-x:hidden!important;
  }

  .pdf-library-shell,
  .pdf-library-hero,
  .pdf-library-title {
    overflow-wrap:anywhere;
  }

  .pdf-library-title p,
  .pdf-library-contest {
    max-width:100%!important;
    white-space:normal!important;
    overflow-wrap:anywhere!important;
  }

  .pdf-library-actions,
  .pdf-library-filters,
  #pdfOfflineManager .pdf-offline-controls {
    width:100%!important;
    max-width:100%!important;
    box-sizing:border-box!important;
    padding:0 14px 9px 2px!important;
    scroll-padding-inline:2px 14px;
    scrollbar-width:auto!important;
    scrollbar-color:rgba(83,227,213,.48) rgba(148,163,184,.10);
  }

  .pdf-library-actions::-webkit-scrollbar,
  .pdf-library-filters::-webkit-scrollbar,
  #pdfOfflineManager .pdf-offline-controls::-webkit-scrollbar {
    display:block!important;
    height:8px!important;
  }

  .pdf-library-actions::-webkit-scrollbar-thumb,
  .pdf-library-filters::-webkit-scrollbar-thumb,
  #pdfOfflineManager .pdf-offline-controls::-webkit-scrollbar-thumb {
    background:rgba(83,227,213,.48)!important;
    border-radius:999px!important;
  }

  .pdf-library-actions::-webkit-scrollbar-track,
  .pdf-library-filters::-webkit-scrollbar-track,
  #pdfOfflineManager .pdf-offline-controls::-webkit-scrollbar-track {
    background:rgba(148,163,184,.10)!important;
    border-radius:999px!important;
  }

  .pdf-library-actions>*:last-child,
  .pdf-library-filters>*:last-child,
  #pdfOfflineManager .pdf-offline-controls>*:last-child {
    margin-right:2px!important;
  }

  .pdf-library-grid {
    grid-template-columns:minmax(0,1fr)!important;
    overflow:visible!important;
  }

  .pdf-library-card {
    overflow:hidden!important;
    padding:14px!important;
  }

  .pdf-library-card h4,
  .pdf-card-context,
  .pdf-card-workspace,
  .pdf-card-meta {
    min-width:0!important;
    max-width:100%!important;
    overflow-wrap:anywhere!important;
    word-break:break-word;
  }

  .pdf-card-meta {
    flex-wrap:wrap!important;
  }

  .pdf-card-actions {
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
  }

  .pdf-card-actions .pdf-library-card-action {
    width:100%!important;
    min-width:0!important;
    max-width:100%!important;
    white-space:normal!important;
  }

  .pdf-card-actions .pdf-library-card-delete {
    grid-column:1/-1!important;
  }

  #pdfOfflineManager {
    overflow:hidden!important;
    padding-inline:12px!important;
  }

  #pdfOfflineManager .pdf-offline-options,
  #pdfOfflineManager .pdf-offline-progress,
  #pdfOfflineManager .pdf-offline-status {
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    box-sizing:border-box!important;
  }
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
