(function (global) {
  'use strict';

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const unique = values => [...new Set(values.filter(Boolean))];
  const safeText = value => String(value ?? '').trim();

  function getFlashcards() {
    try { return Array.isArray(flashcardsList) ? flashcardsList : []; } catch (_) { return []; }
  }

  function getContestNotes() {
    try {
      const metadata = typeof getConcursosMetadata === 'function' ? getConcursosMetadata() : {};
      const contest = typeof currentConcurso !== 'undefined' ? currentConcurso : 'Concurso Geral';
      return Array.isArray(metadata?.[contest]?.structuredNotes) ? metadata[contest].structuredNotes : [];
    } catch (_) { return []; }
  }

  function ensureFlashcardsDashboard() {
    const workspace = qs('#flashcardsWorkspace');
    const header = qs('.flashcards-header', workspace);
    if (!workspace || !header) return;

    let dashboard = qs('[data-web-flashcards-dashboard]', workspace);
    if (!dashboard) {
      dashboard = document.createElement('section');
      dashboard.className = 'study-workspace-dashboard flashcards-workspace-dashboard';
      dashboard.dataset.webFlashcardsDashboard = '1';
      dashboard.setAttribute('aria-label', 'Resumo dos flashcards');
      dashboard.innerHTML = `
        <div class="study-workspace-dashboard-head">
          <div><span class="study-workspace-eyebrow">Estudo ativo</span><h4>Seu painel de flashcards</h4><p>Revise o conteúdo por concurso, matéria ou assunto sem perder o contexto do edital.</p></div>
          <button class="btn btn-primary study-workspace-primary" type="button" data-web-action="start-flashcards">Começar revisão</button>
        </div>
        <div class="study-workspace-stats" data-flashcard-stats></div>
        <div class="study-workspace-quick-actions" aria-label="Filtros de flashcards">
          <button class="study-workspace-chip is-active" type="button" data-web-action="flashcards-all">Todos</button>
          <button class="study-workspace-chip" type="button" data-web-action="flashcards-filter">Por matéria / assunto</button>
        </div>`;
      header.insertAdjacentElement('afterend', dashboard);
    }

    const cards = getFlashcards();
    const materias = unique(cards.map(card => safeText(card?.materia)));
    const assuntos = unique(cards.map(card => safeText(card?.assunto)));
    let filteredCount = cards.length;
    try {
      if (activeFcMateriaFilter || activeFcAssuntoFilter) {
        filteredCount = cards.filter(card => (!activeFcMateriaFilter || card?.materia === activeFcMateriaFilter) && (!activeFcAssuntoFilter || card?.assunto === activeFcAssuntoFilter)).length;
      }
    } catch (_) {}
    const stats = qs('[data-flashcard-stats]', dashboard);
    if (stats) stats.innerHTML = [
      ['Total', cards.length, 'cartões disponíveis'],
      ['Matérias', materias.length, 'com flashcards'],
      ['Assuntos', assuntos.length, 'cobertos'],
      ['No filtro', filteredCount, 'prontos para estudar']
    ].map(([label, value, hint]) => `<article class="study-workspace-stat"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`).join('');
  }

  function ensureLibraryDashboard() {
    const workspace = qs('#pdfLibraryWorkspace');
    const hero = qs('.pdf-library-hero', workspace);
    if (!workspace || !hero) return;
    let dashboard = qs('[data-web-library-dashboard]', workspace);
    if (!dashboard) {
      dashboard = document.createElement('section');
      dashboard.className = 'study-workspace-dashboard library-workspace-dashboard';
      dashboard.dataset.webLibraryDashboard = '1';
      dashboard.setAttribute('aria-label', 'Organização da biblioteca');
      dashboard.innerHTML = `
        <div class="study-workspace-dashboard-head compact">
          <div><span class="study-workspace-eyebrow">Biblioteca</span><h4>Encontre seu material mais rápido</h4><p>A busca atua sobre os arquivos já carregados na biblioteca atual.</p></div>
          <label class="study-workspace-search"><span class="sr-only">Pesquisar na biblioteca</span><input type="search" placeholder="Buscar arquivo, matéria ou assunto" data-library-search autocomplete="off"></label>
        </div>
        <div class="study-workspace-stats" data-library-stats></div>`;
      hero.insertAdjacentElement('afterend', dashboard);
    }
    refreshLibraryDashboard();
  }

  function refreshLibraryDashboard() {
    const workspace = qs('#pdfLibraryWorkspace');
    const grid = qs('#pdfLibraryGrid', workspace);
    const dashboard = qs('[data-web-library-dashboard]', workspace);
    if (!grid || !dashboard) return;
    const items = qsa(':scope > *', grid);
    const visible = items.filter(item => !item.hidden && item.style.display !== 'none').length;
    const stats = qs('[data-library-stats]', dashboard);
    if (stats) stats.innerHTML = [
      ['Arquivos', items.length, 'na biblioteca'],
      ['Visíveis', visible, 'no filtro atual']
    ].map(([label, value, hint]) => `<article class="study-workspace-stat"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`).join('');
  }

  function filterLibrary(rawValue) {
    const term = safeText(rawValue).toLocaleLowerCase('pt-BR');
    const grid = qs('#pdfLibraryGrid');
    if (!grid) return;
    qsa(':scope > *', grid).forEach(item => {
      const match = !term || safeText(item.textContent).toLocaleLowerCase('pt-BR').includes(term);
      item.hidden = !match;
    });
    refreshLibraryDashboard();
  }

  function ensureNotesDashboard() {
    const workspace = qs('#notesWorkspace');
    const header = qs('.notes-section-header', workspace);
    if (!workspace || !header) return;
    let dashboard = qs('[data-web-notes-dashboard]', workspace);
    if (!dashboard) {
      dashboard = document.createElement('section');
      dashboard.className = 'study-workspace-dashboard notes-workspace-dashboard';
      dashboard.dataset.webNotesDashboard = '1';
      dashboard.setAttribute('aria-label', 'Resumo das anotações');
      dashboard.innerHTML = `
        <div class="study-workspace-dashboard-head compact">
          <div><span class="study-workspace-eyebrow">Caderno inteligente</span><h4>Anotações ligadas ao estudo</h4><p>Use matéria e assunto como contexto para reencontrar rapidamente seus registros.</p></div>
          <button class="btn btn-primary study-workspace-primary" type="button" data-web-action="new-note">Nova anotação</button>
        </div>
        <div class="study-workspace-stats" data-notes-stats></div>
        <label class="study-workspace-search notes-search"><span class="sr-only">Pesquisar anotações</span><input type="search" placeholder="Buscar título, matéria, assunto ou conteúdo" data-notes-search autocomplete="off"></label>`;
      header.insertAdjacentElement('afterend', dashboard);
    }
    refreshNotesDashboard();
  }

  function refreshNotesDashboard() {
    const dashboard = qs('[data-web-notes-dashboard]');
    if (!dashboard) return;
    const notes = getContestNotes();
    const materias = unique(notes.map(note => safeText(note?.materia)));
    const assuntos = unique(notes.map(note => safeText(note?.assunto)));
    const linked = notes.filter(note => safeText(note?.materia) || safeText(note?.assunto)).length;
    const stats = qs('[data-notes-stats]', dashboard);
    if (stats) stats.innerHTML = [
      ['Notas', notes.length, 'no concurso atual'],
      ['Matérias', materias.length, 'com registros'],
      ['Assuntos', assuntos.length, 'referenciados'],
      ['Contextualizadas', linked, 'ligadas ao estudo']
    ].map(([label, value, hint]) => `<article class="study-workspace-stat"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`).join('');
  }

  function filterNotes(rawValue) {
    const term = safeText(rawValue).toLocaleLowerCase('pt-BR');
    const container = qs('#notesContainer');
    if (!container) return;
    qsa(':scope > *', container).forEach(item => {
      const match = !term || safeText(item.textContent).toLocaleLowerCase('pt-BR').includes(term);
      item.hidden = !match;
    });
  }

  function refreshAll() {
    ensureFlashcardsDashboard();
    ensureLibraryDashboard();
    ensureNotesDashboard();
  }

  document.addEventListener('click', event => {
    const action = event.target.closest('[data-web-action]')?.dataset.webAction;
    if (!action) return;
    if (action === 'start-flashcards' && typeof global.startShuffleStudyModal === 'function') global.startShuffleStudyModal();
    if (action === 'flashcards-filter' && typeof global.openModalFiltroEstudoFlashcards === 'function') global.openModalFiltroEstudoFlashcards();
    if (action === 'flashcards-all' && typeof global.setFlashcardViewFilter === 'function') global.setFlashcardViewFilter('', '');
    if (action === 'new-note' && typeof global.openModalNovaNota === 'function') global.openModalNovaNota();
  });

  document.addEventListener('input', event => {
    if (event.target.matches('[data-library-search]')) filterLibrary(event.target.value);
    if (event.target.matches('[data-notes-search]')) filterNotes(event.target.value);
  });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-tab="tab-flashcards"], [data-tab="tab-biblioteca"], [data-tab="tab-anotacoes"]')) {
      setTimeout(refreshAll, 0);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshAll, { once: true });
  else refreshAll();

  const observer = new MutationObserver(() => {
    if (qs('#tab-flashcards.active')) ensureFlashcardsDashboard();
    if (qs('#tab-biblioteca.active')) refreshLibraryDashboard();
    if (qs('#tab-anotacoes.active')) refreshNotesDashboard();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });

  global.AppWebStudyWorkspaces = Object.freeze({ refresh: refreshAll, filterLibrary, filterNotes });
})(window);
