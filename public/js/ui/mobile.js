(function (global) {
    'use strict';

    let activeEditalFieldId = null;

    function toggleModernTools() {
        const bar = document.querySelector('.action-bar');
        if (!bar) return;
        bar.classList.toggle('mobile-open');
        if (bar.classList.contains('mobile-open') && window.innerWidth <= 900) {
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

    global.AppMobileUI = Object.freeze({
        toggleModernTools,
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
})(window);
