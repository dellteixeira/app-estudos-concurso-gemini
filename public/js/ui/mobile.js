(function (global) {
    'use strict';

    let activeEditalFieldId = null;
    const MOBILE_LAYOUT_STYLE_ID = 'appMobileLayoutFixes';

    function ensureMobileLayoutStyles() {
        if (document.getElementById(MOBILE_LAYOUT_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = MOBILE_LAYOUT_STYLE_ID;
        style.textContent = `
@media (max-width:900px) {
    /* A barra extra pertence ao botão Mais: fechada por padrão e visível somente quando acionada. */
    .action-bar:not(.mobile-open) {
        display:none!important;
    }
    .action-bar.mobile-open {
        display:grid!important;
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        box-sizing:border-box!important;
        gap:8px!important;
    }
    .action-bar.mobile-open .btn-action {
        width:100%!important;
        min-width:0!important;
        min-height:44px!important;
        white-space:normal!important;
        line-height:1.2!important;
    }

    /* Sincronização usa a mesma escala vertical dos controles principais do mobile. */
    header.modern-header .header-sync-status {
        min-height:44px!important;
        height:44px!important;
        width:100%!important;
        max-width:100%!important;
        box-sizing:border-box!important;
        padding:0 12px!important;
        border-radius:10px!important;
        font-size:.78rem!important;
        overflow:hidden!important;
    }
    header.modern-header .header-sync-status #syncStatusText,
    header.modern-header .header-sync-status .sync-last {
        min-width:0!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
    }
}

@media (max-width:700px) {
    /* Quatro ações do edital em duas colunas; exclusões permanecem lado a lado. */
    #tab-edital .edital-manual-actions,
    #tab-edital .manual-entry-actions {
        display:grid!important;
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        gap:8px!important;
        align-items:stretch!important;
    }
    #tab-edital .edital-manual-actions > button,
    #tab-edital .manual-entry-actions > button {
        grid-column:auto!important;
        width:100%!important;
        min-width:0!important;
        max-width:100%!important;
        min-height:44px!important;
        padding:8px 7px!important;
        justify-content:center!important;
        text-align:center!important;
        white-space:normal!important;
        line-height:1.12!important;
        font-size:clamp(.68rem,3.15vw,.82rem)!important;
    }
}

@media (max-width:390px) {
    .action-bar.mobile-open {
        grid-template-columns:1fr!important;
    }
}
`;
        document.head.appendChild(style);
    }

    function setMobileToolsState(open) {
        const bar = document.querySelector('.action-bar');
        if (!bar) return;
        const shouldOpen = Boolean(open);
        bar.classList.toggle('mobile-open', shouldOpen);
        document.querySelectorAll('[data-action="toggle-modern-tools"]').forEach(button => {
            button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        });
    }

    function toggleModernTools() {
        ensureMobileLayoutStyles();
        const bar = document.querySelector('.action-bar');
        if (!bar) return;
        const open = !bar.classList.contains('mobile-open');
        setMobileToolsState(open);
        if (open && window.innerWidth <= 900) {
            setTimeout(() => bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
        }
    }

    function openMobileEditalFieldEditor(fieldId, sourceInput) {
        if (window.innerWidth > 700) return;
        const modal = document.getElementById('modalMobileEditalField');
        const editor = document.getElementById('mobileEditalFieldInput');
        const title = document.getElementById('mobileEditalFieldTitle');
        const help = document.getElementById('mobileEditalFieldHelp');
        const original = document.getElementById(fieldId);
        if (!modal || !editor || !original) return;

        activeEditalFieldId = fieldId;
        if (sourceInput && typeof sourceInput.blur === 'function') sourceInput.blur();
        const isMateria = fieldId === 'materia';
        if (title) title.textContent = isMateria ? 'Matéria' : 'Assunto';
        if (help) help.textContent = isMateria ? 'Digite o nome da matéria.' : 'Digite o nome do assunto.';
        editor.value = original.value || '';
        editor.placeholder = isMateria ? 'Ex.: Direito Administrativo' : 'Ex.: Atos Administrativos';
        modal.style.display = 'flex';
        setTimeout(() => {
            editor.focus();
            editor.select();
        }, 50);
    }

    function closeMobileEditalFieldEditor(applyValue = false) {
        const modal = document.getElementById('modalMobileEditalField');
        const editor = document.getElementById('mobileEditalFieldInput');
        if (applyValue && activeEditalFieldId && editor) {
            const original = document.getElementById(activeEditalFieldId);
            if (original) {
                original.value = editor.value.trim();
                original.dispatchEvent(new Event('input', { bubbles: true }));
                original.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        if (modal) modal.style.display = 'none';
        activeEditalFieldId = null;
    }

    function handleMobileEditalFieldKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            closeMobileEditalFieldEditor(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeMobileEditalFieldEditor(false);
        }
    }

    function updateContextFab(tabId) {
        const fab = document.getElementById('contextFab');
        if (!fab) return;
        const active = tabId || document.querySelector('.tab-content.active')?.id || 'tab-edital';
        const labels = {
            'tab-edital': 'Adicionar tópico',
            'tab-calendario': 'Preencher cronograma',
            'tab-anotacoes': 'Nova anotação',
            'tab-flashcards': 'Importar flashcards'
        };
        const actionLabel = labels[active] || 'Adicionar';
        fab.setAttribute('aria-label', actionLabel);
        fab.title = actionLabel;
        const textNode = fab.querySelector('span');
        if (textNode) {
            textNode.textContent = active === 'tab-calendario'
                ? 'Preencher'
                : active === 'tab-anotacoes'
                    ? 'Nova nota'
                    : active === 'tab-flashcards'
                        ? 'Importar'
                        : 'Novo';
        }
    }

    function handleContextFab() {
        const active = document.querySelector('.tab-content.active')?.id || 'tab-edital';
        if (active === 'tab-anotacoes' && typeof global.openModalNovaNota === 'function') return global.openModalNovaNota();
        if (active === 'tab-calendario' && typeof global.openModalSelectCronogramaType === 'function') return global.openModalSelectCronogramaType();
        if (active === 'tab-flashcards') {
            document.getElementById('fcMateriaSelect')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => document.getElementById('fcMateriaSelect')?.focus(), 350);
            return;
        }
        document.getElementById('materia')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => document.getElementById('materia')?.focus(), 350);
    }

    function initializeMobileLayout() {
        ensureMobileLayoutStyles();
        if (window.innerWidth <= 900) setMobileToolsState(false);
        else document.querySelectorAll('[data-action="toggle-modern-tools"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    }

    global.AppMobileUI = Object.freeze({
        toggleModernTools,
        setModernToolsState: setMobileToolsState,
        openEditalFieldEditor: openMobileEditalFieldEditor,
        closeEditalFieldEditor: closeMobileEditalFieldEditor,
        handleEditalFieldKeydown: handleMobileEditalFieldKeydown,
        updateContextFab,
        handleContextFab
    });

    global.toggleModernTools = toggleModernTools;
    global.openMobileEditalFieldEditor = openMobileEditalFieldEditor;
    global.closeMobileEditalFieldEditor = closeMobileEditalFieldEditor;
    global.handleMobileEditalFieldKeydown = handleMobileEditalFieldKeydown;
    global.updateContextFab = updateContextFab;
    global.handleContextFab = handleContextFab;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeMobileLayout, { once: true });
    else initializeMobileLayout();
})(window);
