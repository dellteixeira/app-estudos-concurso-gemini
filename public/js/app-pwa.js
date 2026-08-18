        // =========================================================
        // PWA MULTIPLATAFORMA: INSTALAÇÃO ANDROID / iOS
        // =========================================================
        let deferredPwaInstallPrompt = null;

        function isPwaStandalone() {
            return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        }

        function markPwaInstalled() {
            try { localStorage.setItem('pwa_app_installed', '1'); } catch (_) {}
        }

        function isPwaKnownInstalled() {
            if (isPwaStandalone()) {
                markPwaInstalled();
                return true;
            }
            try { return localStorage.getItem('pwa_app_installed') === '1'; } catch (_) { return false; }
        }

        function getPwaPlatform() {
            const ua = navigator.userAgent || '';
            const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isAndroid = /Android/i.test(ua);
            return { isIOS, isAndroid };
        }

        function showPwaInstallBanner(mode = 'generic') {
            if (isPwaKnownInstalled() || sessionStorage.getItem('pwa_install_banner_dismissed') === '1') return;

            const banner = document.getElementById('pwa-install-banner');
            const title = document.getElementById('pwaInstallTitle');
            const message = document.getElementById('pwaInstallText');
            const installBtn = document.getElementById('pwaInstallButton');
            if (!banner || !title || !message || !installBtn) return;

            if (mode === 'ios') {
                title.textContent = 'Instalar no iPhone / iPad';
                message.textContent = 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
                installBtn.style.display = 'none';
            } else if (mode === 'android-manual') {
                title.textContent = 'Instalar no Android';
                message.textContent = 'Abra o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.';
                installBtn.style.display = 'none';
            } else {
                title.textContent = 'Instalar Estudo Adaptativo Inteligente';
                message.textContent = 'Instale o app para abrir em tela cheia e facilitar o uso offline.';
                installBtn.style.display = '';
            }

            banner.classList.add('visible');
        }

        function hidePwaInstallBanner() {
            const banner = document.getElementById('pwa-install-banner');
            if (banner) banner.classList.remove('visible');
        }

        function dismissPwaBanner() {
            sessionStorage.setItem('pwa_install_banner_dismissed', '1');
            hidePwaInstallBanner();
        }

        async function installPwaApp() {
            if (!deferredPwaInstallPrompt) {
                const { isIOS, isAndroid } = getPwaPlatform();
                showPwaInstallBanner(isIOS ? 'ios' : (isAndroid ? 'android-manual' : 'generic'));
                return;
            }

            deferredPwaInstallPrompt.prompt();
            try {
                await deferredPwaInstallPrompt.userChoice;
            } finally {
                deferredPwaInstallPrompt = null;
                hidePwaInstallBanner();
            }
        }

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            // Se o navegador voltou a oferecer instalação, o app não está mais
            // instalado neste perfil/dispositivo. Remove um marcador antigo.
            try { localStorage.removeItem('pwa_app_installed'); } catch (_) {}
            deferredPwaInstallPrompt = event;
            showPwaInstallBanner('prompt');
        });

        window.addEventListener('appinstalled', () => {
            deferredPwaInstallPrompt = null;
            markPwaInstalled();
            hidePwaInstallBanner();
        });

        window.addEventListener('load', () => {
            if (isPwaKnownInstalled()) { hidePwaInstallBanner(); return; }
            const { isIOS, isAndroid } = getPwaPlatform();
            if (isIOS) {
                setTimeout(() => showPwaInstallBanner('ios'), 900);
            } else if (isAndroid) {
                // Chromium dispara beforeinstallprompt quando elegível. Se não
                // disparar (ex.: Firefox), oferece orientação manual sem bloquear a UI.
                setTimeout(() => {
                    if (!deferredPwaInstallPrompt) showPwaInstallBanner('android-manual');
                }, 1800);
            }
        });

        window.installPwaApp = installPwaApp;
        window.dismissPwaBanner = dismissPwaBanner;
        window.handleSignUp = handleSignUp;
        window.handleLogin = handleLogin;
        window.handleLogout = handleLogout;
        window.toggleDarkMode = toggleDarkMode;
        window.startFocusTimer = startFocusTimer;
        window.startIntervalTimer = startIntervalTimer;
        window.populateNotaAssuntoDropdown = populateNotaAssuntoDropdown;
        window.handleNotaAssuntoChange = handleNotaAssuntoChange;
        window.switchTab = switchTab;
        window.openModalAnaliseEditalIA = openModalAnaliseEditalIA;
        window.closeModalAnaliseEditalIA = closeModalAnaliseEditalIA;
        window.executarAnaliseEditalIA = executarAnaliseEditalIA;
        window.importarAnaliseEditalIA = importarAnaliseEditalIA;
        window.importJSON = importJSON;
        window.clearData = clearData;
        window.addManualItem = addManualItem;
        window.toggleCheck = toggleCheck;
        window.clearRowCheckboxes = clearRowCheckboxes;
        window.toggleMateria = toggleMateria;
        window.toggleAllAccordions = toggleAllAccordions;
        window.updateMateriaPriority = updateMateriaPriority;
        window.updateAssuntoPriority = updateAssuntoPriority;
        window.excluirMateriaEspecifica = excluirMateriaEspecifica;
        window.excluirAssuntoEspecifico = excluirAssuntoEspecifico;
        window.changeConcurso = changeConcurso;
        window.openModalNovoConcurso = openModalNovoConcurso;
        window.closeModalNovoConcurso = closeModalNovoConcurso;
        window.confirmarNovoConcurso = confirmarNovoConcurso;
        window.renomearConcursoAtual = renomearConcursoAtual;
        window.removerConcursoAtual = removerConcursoAtual;
        window.editarDataProva = editarDataProva;
        window.startTimer = startTimer;
        window.resetTimer = resetTimer;
        window.updateTimerSettings = updateTimerSettings;
        window.openModalPromptIA = openModalPromptIA;
        window.closeModalPromptIA = closeModalPromptIA;
        window.copyPromptToClipboard = copyPromptToClipboard;
        window.openModalViewEdital = openModalViewEdital;
        window.closeModalViewEdital = closeModalViewEdital;
        window.uploadEditalFile = uploadEditalFile;
        window.downloadEditalFile = downloadEditalFile;
        window.removerEditalFile = removerEditalFile;
        window.forceFullSync = forceFullSync;
        window.removeFlashcard = removeFlashcard;
        window.openEditarFlashcardModal = openEditarFlashcardModal;
        window.closeModalEditarFlashcard = closeModalEditarFlashcard;
        window.salvarEdicaoFlashcard = salvarEdicaoFlashcard;
        window.onMonthYearChange = onMonthYearChange;
        window.goToCurrentMonth = goToCurrentMonth;
        window.limparCronogramaMesAtual = limparCronogramaMesAtual;
        window.limparMateriasEstudadas = limparMateriasEstudadas;
        window.filterDelayedList = filterDelayedList;
        window.updateFcAssuntoOptions = updateFcAssuntoOptions;
        window.processPastedFlashcardsText = processPastedFlashcardsText;
        window.startShuffleStudyModal = startShuffleStudyModal;
        window.toggleStudyCardAnswer = toggleStudyCardAnswer;
        window.nextStudyCard = nextStudyCard;
        window.closeStudyModal = closeStudyModal;
        window.openModalConfigHorarios = openModalConfigHorarios;
        window.closeModalConfigHorarios = closeModalConfigHorarios;
        window.gerarCronogramaInteligente = gerarCronogramaInteligente;
        window.renderNotesList = renderNotesList;
        window.openModalNovaNota = openModalNovaNota;
        window.closeModalNovaNota = closeModalNovaNota;
        window.salvarNota = salvarNota;
        window.editNota = editNota;
        window.deleteNota = deleteNota;
        window.handleActionButton = handleActionButton;
        window.openModalDayContent = openModalDayContent;
        window.closeModalDayContent = closeModalDayContent;
        window.toggleCheckFromModal = toggleCheckFromModal;
        window.deleteTopicFromDay = deleteTopicFromDay;
        window.openModalSelectCronogramaType = openModalSelectCronogramaType;
        window.closeModalSelectCronogramaType = closeModalSelectCronogramaType;
        window.chooseCronogramaType = chooseCronogramaType;
        window.openModalMentorisMethod = openModalMentorisMethod;
        window.closeModalMentorisMethod = closeModalMentorisMethod;
        window.toggleWeekdaySelect = toggleWeekdaySelect;
        window.selectHoursOption = selectHoursOption;
        window.selectCustomDailyHoursOption = selectCustomDailyHoursOption;
        window.setCustomDailyHours = setCustomDailyHours;
        window.toggleAdaptiveRevision = toggleAdaptiveRevision;
        window.gerarCronogramaMetodo2 = gerarCronogramaMetodo2;
        window.openFlexibleStudyConfig = openFlexibleStudyConfig;
        window.closeFlexibleStudyConfig = closeFlexibleStudyConfig;
        window.setFlexibleDayMode = setFlexibleDayMode;
        window.activateFlexibleStudyMode = activateFlexibleStudyMode;
        window.openOpportunityStudyModal = openOpportunityStudyModal;
        window.closeOpportunityStudyModal = closeOpportunityStudyModal;
        window.selectOpportunityMinutes = selectOpportunityMinutes;
        window.selectOpportunityContext = selectOpportunityContext;
        window.ignoreFlexibleRestForOpportunity = ignoreFlexibleRestForOpportunity;
        window.startOpportunityRecommendation = startOpportunityRecommendation;
        window.startRetentionDiagnosticTopic = startRetentionDiagnosticTopic;
        window.showEditTopicDropdown = showEditTopicDropdown;
        window.updateEditAssuntoDropdown = updateEditAssuntoDropdown;
        window.confirmEditTopicWithSwap = confirmEditTopicWithSwap;
        window.addManualTopicToDay = addManualTopicToDay;
        window.showAddTopicSelectors = showAddTopicSelectors;
        window.updateAddAssuntoDropdown = updateAddAssuntoDropdown;
        window.resetAddTopicArea = resetAddTopicArea;
        window.confirmAddTopicWithSwap = confirmAddTopicWithSwap;
        window.toggleFcFolder = toggleFcFolder;
        window.setFlashcardViewFilter = setFlashcardViewFilter;
        window.openModalFiltroEstudoFlashcards = openModalFiltroEstudoFlashcards;
        window.closeModalFiltroEstudoFlashcards = closeModalFiltroEstudoFlashcards;
        window.updateStudyFilterAssuntoOptions = updateStudyFilterAssuntoOptions;
        window.startFilteredStudyModal = startFilteredStudyModal;
        window.resetDailyPomodoroHours = resetDailyPomodoroHours;
