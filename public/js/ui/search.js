(function (global) {
    'use strict';

    let timer = null;
    let resultsCache = [];

    function safeEscape(value) {
        if (typeof global.escapeHtml === 'function') return global.escapeHtml(String(value ?? ''));
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function structuredNotes() {
        try {
            const metadata = getConcursosMetadata();
            return metadata[currentConcurso]?.structuredNotes || [];
        } catch (_) {
            return [];
        }
    }

    function navigate(tabId) {
        if (global.AppNavigation?.navigateTo) return global.AppNavigation.navigateTo(tabId);
        const btn = global.findDesktopTabButton?.(tabId);
        if (typeof global.switchTab === 'function') global.switchTab(tabId, btn || null);
        return true;
    }

    function openGlobalSearchModal() {
        const modal = document.getElementById('modalGlobalSearch');
        const input = document.getElementById('globalStudySearch');
        const results = document.getElementById('globalSearchResults');
        if (!modal) return;
        modal.style.display = 'flex';
        if (results) {
            results.innerHTML = '<div class="global-search-empty">Digite ao menos 2 caracteres para pesquisar.</div>';
            results.classList.add('visible');
        }
        setTimeout(() => {
            if (!input) return;
            input.focus();
            if ((input.value || '').trim().length >= 2) runGlobalStudySearch(input.value);
        }, 40);
    }

    function closeGlobalSearchModal() {
        const modal = document.getElementById('modalGlobalSearch');
        const results = document.getElementById('globalSearchResults');
        if (modal) modal.style.display = 'none';
        if (results) results.classList.remove('visible');
    }

    function scheduleGlobalStudySearch(rawTerm, delay = 140) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            runGlobalStudySearch(rawTerm);
        }, delay);
    }

    function openEditalResult(materia) {
        try { openMaterias[materia] = true; } catch (_) {}
        navigate('tab-edital');
        if (typeof global.renderTable === 'function') global.renderTable();
        setTimeout(() => document.getElementById('edital-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }

    function openNotesResult(materia) {
        navigate('tab-anotacoes');
        if (typeof global.loadNotesData === 'function') global.loadNotesData();
        const select = document.getElementById('notesMateriaSelect');
        if (select && [...select.options].some(option => option.value === materia)) {
            select.value = materia;
            if (typeof global.renderNotesList === 'function') global.renderNotesList();
        }
    }

    function openFlashcardResult(card) {
        navigate('tab-flashcards');
        if (typeof global.setFlashcardViewFilter === 'function') {
            global.setFlashcardViewFilter(card.materia || '', card.assunto || '');
        }
    }

    function runGlobalStudySearch(rawTerm) {
        const box = document.getElementById('globalSearchResults');
        if (!box) return;
        const term = (rawTerm || '').trim().toLocaleLowerCase('pt-BR');
        if (term.length < 2) {
            resultsCache = [];
            box.innerHTML = '<div class="global-search-empty">Digite ao menos 2 caracteres para pesquisar.</div>';
            box.classList.add('visible');
            return;
        }

        const found = [];
        try {
            (editalItems || []).forEach(item => {
                const materia = item.materia || 'Geral';
                const assunto = item.assunto || '';
                if (`${materia} ${assunto}`.toLocaleLowerCase('pt-BR').includes(term)) {
                    found.push({ type: 'Edital', title: assunto || materia, sub: materia, action: () => openEditalResult(materia) });
                }
            });
        } catch (_) {}

        structuredNotes().forEach(note => {
            let content = note.conteudo || '';
            if (note.formato === 'html') {
                try { content = note.conteudoTexto || noteHtmlToPlainText(note.conteudo || ''); } catch (_) { content = note.conteudoTexto || ''; }
            }
            const text = `${note.materia || ''} ${note.titulo || ''} ${content}`.toLocaleLowerCase('pt-BR');
            if (text.includes(term)) {
                found.push({ type: 'Nota', title: note.titulo || 'Anotação', sub: note.materia || '', action: () => openNotesResult(note.materia || '') });
            }
        });

        try {
            (flashcardsList || []).forEach(card => {
                const text = `${card.materia || ''} ${card.assunto || ''} ${card.pergunta || ''} ${card.resposta || ''}`.toLocaleLowerCase('pt-BR');
                if (text.includes(term)) {
                    found.push({ type: 'Flashcard', title: card.pergunta || 'Flashcard', sub: [card.materia, card.assunto].filter(Boolean).join(' · '), action: () => openFlashcardResult(card) });
                }
            });
        } catch (_) {}

        resultsCache = found.slice(0, 16);
        global.__globalStudySearchResults = resultsCache;
        if (!resultsCache.length) {
            box.innerHTML = '<div class="global-search-empty">Nenhum resultado encontrado.</div>';
            box.classList.add('visible');
            return;
        }

        box.innerHTML = resultsCache.map((result, index) => `
            <button class="search-result-item" type="button" onclick="activateGlobalSearchResult(${index})">
                <span class="search-result-type">${safeEscape(result.type)}</span>${safeEscape(result.title)}
                <span class="search-result-sub">${safeEscape(result.sub || '')}</span>
            </button>`).join('');
        box.classList.add('visible');
    }

    function activateGlobalSearchResult(index) {
        const result = resultsCache[index] || global.__globalStudySearchResults?.[index];
        if (result?.action) result.action();
        closeGlobalSearchModal();
    }

    global.AppSearch = Object.freeze({
        open: openGlobalSearchModal,
        close: closeGlobalSearchModal,
        schedule: scheduleGlobalStudySearch,
        run: runGlobalStudySearch,
        activate: activateGlobalSearchResult
    });

    global.openGlobalSearchModal = openGlobalSearchModal;
    global.closeGlobalSearchModal = closeGlobalSearchModal;
    global.scheduleGlobalStudySearch = scheduleGlobalStudySearch;
    global.runGlobalStudySearch = runGlobalStudySearch;
    global.activateGlobalSearchResult = activateGlobalSearchResult;
})(window);
