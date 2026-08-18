        // =========================================================
        // UI MODERNA 2026 — BUSCA, RESUMO, NAVEGAÇÃO MOBILE E FAB
        // =========================================================
        function toggleModernTools() {
            const bar = document.querySelector('.action-bar');
            if (!bar) return;
            bar.classList.toggle('mobile-open');
            if (bar.classList.contains('mobile-open') && window.innerWidth <= 900) {
                setTimeout(() => bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
            }
        }

        function getStructuredNotesForCurrentConcurso() {
            try {
                const metadata = getConcursosMetadata();
                return metadata[currentConcurso]?.structuredNotes || [];
            } catch (_) { return []; }
        }

        let activeMobileEditalFieldId = null;

        function openMobileEditalFieldEditor(fieldId, sourceInput) {
            if (window.innerWidth > 700) return;
            const modal = document.getElementById('modalMobileEditalField');
            const editor = document.getElementById('mobileEditalFieldInput');
            const title = document.getElementById('mobileEditalFieldTitle');
            const help = document.getElementById('mobileEditalFieldHelp');
            const original = document.getElementById(fieldId);
            if (!modal || !editor || !original) return;
            activeMobileEditalFieldId = fieldId;
            if (sourceInput && typeof sourceInput.blur === 'function') sourceInput.blur();
            const isMateria = fieldId === 'materia';
            if (title) title.textContent = isMateria ? 'Matéria' : 'Assunto';
            if (help) help.textContent = isMateria ? 'Digite o nome da matéria.' : 'Digite o nome do assunto.';
            editor.value = original.value || '';
            editor.placeholder = isMateria ? 'Ex.: Direito Administrativo' : 'Ex.: Atos Administrativos';
            modal.style.display = 'flex';
            setTimeout(() => { editor.focus(); editor.select(); }, 50);
        }

        function closeMobileEditalFieldEditor(applyValue = false) {
            const modal = document.getElementById('modalMobileEditalField');
            const editor = document.getElementById('mobileEditalFieldInput');
            if (applyValue && activeMobileEditalFieldId && editor) {
                const original = document.getElementById(activeMobileEditalFieldId);
                if (original) {
                    original.value = editor.value.trim();
                    original.dispatchEvent(new Event('input', { bubbles:true }));
                    original.dispatchEvent(new Event('change', { bubbles:true }));
                }
            }
            if (modal) modal.style.display = 'none';
            activeMobileEditalFieldId = null;
        }

        function handleMobileEditalFieldKeydown(event) {
            if (event.key === 'Enter') { event.preventDefault(); closeMobileEditalFieldEditor(true); }
            if (event.key === 'Escape') { event.preventDefault(); closeMobileEditalFieldEditor(false); }
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
                if (input) {
                    input.focus();
                    if ((input.value || '').trim().length >= 2) runGlobalStudySearch(input.value);
                }
            }, 40);
        }

        function closeGlobalSearchModal() {
            const modal = document.getElementById('modalGlobalSearch');
            const results = document.getElementById('globalSearchResults');
            if (modal) modal.style.display = 'none';
            if (results) results.classList.remove('visible');
        }

        let globalSearchTimer = null;
        function scheduleGlobalStudySearch(rawTerm, delay = 140) {
            if (globalSearchTimer) clearTimeout(globalSearchTimer);
            globalSearchTimer = setTimeout(() => {
                globalSearchTimer = null;
                runGlobalStudySearch(rawTerm);
            }, delay);
        }

        function runGlobalStudySearch(rawTerm) {
            const box = document.getElementById('globalSearchResults');
            if (!box) return;
            const term = (rawTerm || '').trim().toLocaleLowerCase('pt-BR');
            if (term.length < 2) { box.innerHTML = '<div class="global-search-empty">Digite ao menos 2 caracteres para pesquisar.</div>'; box.classList.add('visible'); return; }

            const results = [];
            editalItems.forEach(item => {
                const mat = item.materia || 'Geral';
                const assunto = item.assunto || '';
                if (`${mat} ${assunto}`.toLocaleLowerCase('pt-BR').includes(term)) {
                    results.push({ type:'Edital', title:assunto || mat, sub:mat, action:() => openSearchEditalResult(mat) });
                }
            });
            getStructuredNotesForCurrentConcurso().forEach(note => {
                const searchableNoteContent = note.formato === 'html' ? (note.conteudoTexto || noteHtmlToPlainText(note.conteudo || '')) : (note.conteudo || '');
                const txt = `${note.materia || ''} ${note.titulo || ''} ${searchableNoteContent}`.toLocaleLowerCase('pt-BR');
                if (txt.includes(term)) results.push({ type:'Nota', title:note.titulo || 'Anotação', sub:note.materia || '', action:() => openSearchNotesResult(note.materia || '') });
            });
            (flashcardsList || []).forEach(fc => {
                const txt = `${fc.materia || ''} ${fc.assunto || ''} ${fc.pergunta || ''} ${fc.resposta || ''}`.toLocaleLowerCase('pt-BR');
                if (txt.includes(term)) results.push({ type:'Flashcard', title:fc.pergunta || 'Flashcard', sub:[fc.materia,fc.assunto].filter(Boolean).join(' · '), action:() => openSearchFlashcardResult(fc) });
            });

            const limited = results.slice(0, 16);
            if (!limited.length) {
                box.innerHTML = '<div style="padding:12px;color:var(--modern-muted);font-size:.84rem;">Nenhum resultado encontrado.</div>';
                box.classList.add('visible');
                return;
            }
            box.innerHTML = limited.map((r, idx) => `
                <button class="search-result-item" type="button" onclick="activateGlobalSearchResult(${idx})">
                    <span class="search-result-type">${escapeHtml(r.type)}</span>${escapeHtml(r.title)}
                    <span class="search-result-sub">${escapeHtml(r.sub || '')}</span>
                </button>`).join('');
            window.__globalStudySearchResults = limited;
            box.classList.add('visible');
        }

        function activateGlobalSearchResult(index) {
            const result = window.__globalStudySearchResults?.[index];
            if (result?.action) result.action();
            const box = document.getElementById('globalSearchResults');
            if (box) box.classList.remove('visible');
            closeGlobalSearchModal();
        }

        function findDesktopTabButton(tabId) {
            return [...document.querySelectorAll('.nav-tabs .tab-btn')].find(btn => (btn.getAttribute('onclick') || '').includes(`'${tabId}'`));
        }

        function openSearchEditalResult(materia) {
            openMaterias[materia] = true;
            const btn = findDesktopTabButton('tab-edital');
            if (btn) switchTab('tab-edital', btn);
            renderTable();
            setTimeout(() => document.getElementById('edital-title')?.scrollIntoView({behavior:'smooth', block:'start'}), 60);
        }
        function openSearchNotesResult(materia) {
            const btn = findDesktopTabButton('tab-anotacoes');
            if (btn) switchTab('tab-anotacoes', btn);
            loadNotesData();
            const sel = document.getElementById('notesMateriaSelect');
            if (sel && [...sel.options].some(o => o.value === materia)) { sel.value = materia; renderNotesList(); }
        }
        function openSearchFlashcardResult(fc) {
            const btn = findDesktopTabButton('tab-flashcards');
            if (btn) switchTab('tab-flashcards', btn);
            if (typeof setFlashcardViewFilter === 'function') setFlashcardViewFilter(fc.materia || '', fc.assunto || '');
        }

        function mobileSwitchTab(tabId, mobileBtn) {
            const desktopBtn = findDesktopTabButton(tabId);
            if (desktopBtn) switchTab(tabId, desktopBtn);
            else switchTab(tabId, null);
            document.querySelectorAll('.mobile-nav-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
            updateContextFab(tabId);
        }

        function updateContextFab(tabId) {
            const fab = document.getElementById('contextFab');
            if (!fab) return;
            const active = tabId || document.querySelector('.tab-content.active')?.id || 'tab-edital';
            const labels = {
                'tab-edital':'Adicionar tópico',
                'tab-calendario':'Preencher cronograma',
                'tab-anotacoes':'Nova anotação',
                'tab-flashcards':'Importar flashcards'
            };
            const actionLabel = labels[active] || 'Adicionar';
            fab.setAttribute('aria-label', actionLabel);
            fab.title = actionLabel;
            const textNode = fab.querySelector('span');
            if (textNode) textNode.textContent = active === 'tab-calendario' ? 'Preencher' : active === 'tab-anotacoes' ? 'Nova nota' : active === 'tab-flashcards' ? 'Importar' : 'Novo';
        }

        function handleContextFab() {
            const active = document.querySelector('.tab-content.active')?.id || 'tab-edital';
            if (active === 'tab-anotacoes') return openModalNovaNota();
            if (active === 'tab-calendario') return openModalSelectCronogramaType();
            if (active === 'tab-flashcards') {
                document.getElementById('fcMateriaSelect')?.scrollIntoView({behavior:'smooth', block:'center'});
                setTimeout(() => document.getElementById('fcMateriaSelect')?.focus(), 350);
                return;
            }
            document.getElementById('materia')?.scrollIntoView({behavior:'smooth', block:'center'});
            setTimeout(() => document.getElementById('materia')?.focus(), 350);
        }

        let retentionDiagnosticRows = [];
        let pendingLayeredReview = null;

        function getLayeredReviewPlan(row, item, options = {}) {
            const contest = options.contest || getConcursosMetadata()[currentConcurso] || {};
            const state = row?.state || getRetentionTopicState(contest,item?.materia,item?.assunto,false);
            const retention = Number.isFinite(Number(row?.retention)) ? Number(row.retention) : (state?.lastStudyAt ? calculateRetentionFromState(state,new Date()) : 100);
            const accuracy = Number.isFinite(Number(row?.questionAccuracy)) ? Number(row.questionAccuracy) : (Number.isFinite(Number(state?.questionStats?.lastAccuracy)) ? Number(state.questionStats.lastAccuracy) : null);
            const confidence = Math.max(0,Math.min(1,Number(state?.questionStats?.confidence)||0));
            const overdue = !!row?.overdue;
            const forgot = state?.lastRating === 'forgot';
            let recommendedLayer = 1;
            let reason = 'Comece testando a recuperação sem consultar material.';
            if (forgot || retention < 40 || (accuracy != null && confidence >= .25 && accuracy < 45)) {
                recommendedLayer = 4;
                reason = 'Há evidência forte de perda do conteúdo; o reestudo é mais eficiente do que insistir em recuperação superficial.';
            } else if (isContentAcquired(item) && (accuracy == null || accuracy < 75) && retention < 72) {
                recommendedLayer = 3;
                reason = 'A etapa de conteúdo já existe, mas os sinais de domínio ainda pedem teste objetivo por questões.';
            } else if (overdue || retention < 82) {
                recommendedLayer = 2;
                reason = 'Uma revisão curta tende a recuperar o assunto sem exigir reestudo completo.';
            }
            const acquisition = getContentAcquisitionState(item);
            const reinforceWithVideo = acquisition.method === 'videoaula' || (acquisition.method === 'automatico' && acquisition.teoria && !acquisition.videoaula);
            const layers = [
                { layer:1, label:'Recuperação mental', minutes:5, description:'Tente explicar conceitos, regras e exceções sem consultar o material.' },
                { layer:2, label:'Revisão curta', minutes:10, description:'Consulte apenas resumo, anotação ou ponto central e confirme o que faltou.' },
                { layer:3, label:'Questões', minutes:20, description:'Resolva uma bateria curta e registre total de questões e acertos.' },
                { layer:4, label:reinforceWithVideo?'Vídeoaula de reforço':'Reestudo de teoria', minutes:30, activityType:reinforceWithVideo?'videoaula':'teoria', description:reinforceWithVideo?'Use uma explicação em vídeo para reconstruir o ponto que apresentou baixa retenção ou baixo desempenho.':'Reconstrua o conteúdo quando a retenção ou o desempenho indicarem perda relevante.' }
            ];
            return { recommendedLayer, reason, retention, accuracy, layers };
        }

        function openLayeredReviewModal(index) {
            const row = retentionDiagnosticRows[index];
            if (!row?.state) return;
            const item = editalItems.find(i => getStudyTopicKey(i.materia,i.assunto) === row.state.key);
            if (!item) return appNotice('Este assunto não está mais disponível no edital atual.', { title:'Pontos críticos' });
            const contest = getConcursosMetadata()[currentConcurso] || {};
            const plan = getLayeredReviewPlan(row,item,{contest});
            pendingLayeredReview = { index, row, item, plan };
            const topic=document.getElementById('layeredReviewTopic');
            const meta=document.getElementById('layeredReviewMeta');
            const steps=document.getElementById('layeredReviewSteps');
            if(topic) topic.textContent=`${item.materia} — ${item.assunto}`;
            const perf = plan.accuracy == null ? '' : ` · Questões ${Math.round(plan.accuracy)}%`;
            if(meta) meta.textContent=`Retenção ${Math.round(plan.retention)}%${perf}. ${plan.reason}`;
            if(steps) steps.innerHTML=plan.layers.map(layer=>`<div class="layered-review-step ${layer.layer===plan.recommendedLayer?'recommended':''}"><div class="layered-review-number">${layer.layer}</div><div class="layered-review-content"><strong>${escapeHtml(layer.label)}${layer.layer===plan.recommendedLayer?' · recomendada':''}</strong><span>${escapeHtml(layer.description)} · ${layer.minutes} min sugeridos</span></div><button class="btn btn-secondary btn-sm" type="button" onclick="startLayeredReviewLayer(${layer.layer})">Iniciar</button></div>`).join('');
            const modal=document.getElementById('modalLayeredReview'); if(modal) modal.style.display='flex';
        }

        function closeLayeredReviewModal() {
            const modal=document.getElementById('modalLayeredReview'); if(modal) modal.style.display='none';
            pendingLayeredReview=null;
        }

        function startRecommendedLayeredReview() {
            const layer=pendingLayeredReview?.plan?.recommendedLayer;
            if(layer) startLayeredReviewLayer(layer);
        }

        function startLayeredReviewLayer(layer) {
            const pending=pendingLayeredReview; if(!pending?.item) return;
            const item=pending.item;
            const def=pending.plan.layers.find(x=>x.layer===Number(layer)); if(!def) return;
            const base={kind:'study',materia:item.materia,assunto:item.assunto,itemId:item.id,isRevision:true,minutes:def.minutes,source:'layered_review',layer:Number(layer)};
            const modal=document.getElementById('modalLayeredReview'); if(modal) modal.style.display='none';
            pendingLayeredReview=null;
            if(Number(layer)===1) return openActiveRecallGuide({...base,activityType:'revisao_ativa',method:'revisao_ativa',methodLabel:'Recuperação mental',recoveryMethod:'revisao_ativa'});
            if(Number(layer)===2) return launchOpportunityPomodoro({...base,activityType:'teoria',method:'revisao_curta',methodLabel:'Revisão curta',recoveryMethod:'revisao_curta'});
            if(Number(layer)===3) return launchOpportunityPomodoro({...base,activityType:'questoes',method:'questoes',methodLabel:'Questões',recoveryMethod:'questoes'});
            const acquisitionActivity = def.activityType || 'teoria';
            return launchOpportunityPomodoro({...base,activityType:acquisitionActivity,method:acquisitionActivity==='videoaula'?'videoaula':'reestudo',methodLabel:def.label,recoveryMethod:acquisitionActivity==='videoaula'?'videoaula':'reestudo'});
        }

        function hasRetentionMasteryEvidence(state) {
            return StudyDomain.hasRetentionMasteryEvidence(state);
        }

        function buildRetentionDiagnostics() {
            const contest = getConcursosMetadata()[currentConcurso] || {};
            const engine = getRetentionEngine(contest, false);
            const now = new Date();
            const activeTopicKeys = new Set((editalItems || []).map(item => getStudyTopicKey(item.materia, item.assunto)));
            const states = StudyDomain.filterActiveRetentionStates(Object.values(engine?.topics || {}), activeTopicKeys);
            const rows = states.map(state => {
                const retention = Math.max(0, Math.min(100, calculateRetentionFromState(state, now)));
                const nextAt = state.nextReviewAt ? new Date(state.nextReviewAt) : null;
                const overdue = !!(nextAt && Number.isFinite(nextAt.getTime()) && nextAt < now);
                const overdueDays = overdue ? Math.max(0, Math.floor((now - nextAt) / 86400000)) : 0;
                const questionAccuracy = Number.isFinite(Number(state?.questionStats?.lastAccuracy)) ? Number(state.questionStats.lastAccuracy) : null;
                const item = editalItems.find(i => getStudyTopicKey(i.materia,i.assunto) === state.key);
                const schedulerScore = item ? computeRetentionSchedulerScore(item,{contest,now,state,isRevision:true,activityType:'revisao_ativa',availableMinutes:20,suggestedMinutes:15}).total : 0;
                const prioritySignal = Math.max(0,Math.min(50,schedulerScore/25));
                const riskScore = (100-retention) + (overdue ? 28 + Math.min(30,overdueDays*3) : 0) + (questionAccuracy!=null && questionAccuracy<60 ? (60-questionAccuracy)*.7 : 0) + prioritySignal;
                return { state, retention, nextAt, overdue, overdueDays, questionAccuracy, riskScore, schedulerScore };
            });
            const avg = rows.length ? rows.reduce((sum,row)=>sum+row.retention,0)/rows.length : null;
            const risk = rows.filter(row => row.retention < 70 || row.overdue || (row.questionAccuracy!=null && row.questionAccuracy<60));
            const overdue = rows.filter(row => row.overdue);
            const mastered = rows.filter(row => row.retention >= 85 && !row.overdue && hasRetentionMasteryEvidence(row.state));
            risk.sort((a,b)=>b.riskScore-a.riskScore || a.retention-b.retention);
            return { rows, avg, risk, overdue, mastered };
        }

        function renderRetentionRiskCard(row, index) {
            const state = row.state;
            const item = editalItems.find(i => getStudyTopicKey(i.materia,i.assunto) === state.key);
            const plan = item ? getLayeredReviewPlan(row,item) : null;
            const retention = Math.max(0, Math.min(100, Math.round(Number(row.retention) || 0)));
            const severity = row.overdue || retention < 45 || (row.questionAccuracy!=null && row.questionAccuracy<45)
                ? 'high'
                : (retention < 65 || (row.questionAccuracy!=null && row.questionAccuracy<60) ? 'medium' : 'low');
            const severityLabel = severity === 'high' ? 'Alto' : severity === 'medium' ? 'Médio' : 'Baixo';
            const status = row.overdue ? `Revisão vencida${row.overdueDays?` há ${row.overdueDays}d`:''}` : (row.questionAccuracy!=null && row.questionAccuracy<60 ? `Questões ${Math.round(row.questionAccuracy)}%` : 'Retenção abaixo do alvo');
            const layerDef = plan?.layers?.find(x=>x.layer===plan.recommendedLayer);
            const layerText = plan ? `Camada ${plan.recommendedLayer}: ${layerDef?.label||'Revisão'}` : 'Revisão adaptativa';
            return `<button class="retention-risk-row v965 retention-risk-card-v1071 risk-${severity}" type="button" onclick="openLayeredReviewModal(${index})" aria-label="Abrir revisão de ${escapeHtml(state.materia)} — ${escapeHtml(state.assunto)}. Risco ${severityLabel}. Retenção ${retention}%"><span class="critical-rank">${index+1}</span><span class="retention-risk-copy"><span class="retention-risk-topline"><span class="retention-risk-title">${escapeHtml(state.materia)} — ${escapeHtml(state.assunto)}</span><span class="retention-risk-badge ${severity}">${severityLabel}</span></span><span class="retention-risk-meta">${escapeHtml(status)}</span><span class="critical-layer-label">${escapeHtml(layerText)}</span><span class="retention-risk-progress" aria-hidden="true"><span style="width:${retention}%"></span></span></span><span class="retention-risk-value">${retention}%</span></button>`;
        }

        function getRetentionMetricConfig(kind) {
            return {
                risk: { title:'Assuntos em risco', subtitle:'Conteúdos que exigem atenção por retenção, atraso de revisão ou desempenho em questões.', key:'risk' },
                overdue: { title:'Revisões vencidas', subtitle:'Conteúdos cuja próxima revisão prevista já ultrapassou a data recomendada.', key:'overdue' },
                mastered: { title:'Assuntos dominados', subtitle:'Conteúdos com retenção alta, sem revisão vencida e desempenho compatível com domínio.', key:'mastered' }
            }[kind] || null;
        }

        function renderRetentionMetricDetailRow(row, index, kind) {
            const state = row?.state || {};
            const retention = Math.round(Number(row?.retention) || 0);
            const accuracy = Number.isFinite(Number(row?.questionAccuracy)) ? `${Math.round(Number(row.questionAccuracy))}%` : '—';
            const nextReview = row?.nextAt instanceof Date && Number.isFinite(row.nextAt.getTime()) ? row.nextAt.toLocaleDateString('pt-BR') : '—';
            const overdueText = row?.overdue ? `Vencida${row.overdueDays ? ` há ${row.overdueDays}d` : ''}` : `Próxima: ${nextReview}`;
            const indexInRisk = retentionDiagnosticRows.findIndex(item => item?.state?.key === state.key);
            const clickable = kind !== 'mastered' && indexInRisk >= 0;
            const tag = clickable ? 'button' : 'div';
            const action = clickable ? ` type="button" onclick="closeRetentionMetricDetails(); openLayeredReviewModal(${indexInRisk})"` : '';
            return `<${tag} class="retention-metric-detail-row${clickable?' is-clickable':''}"${action}><span class="retention-detail-rank">${index+1}</span><span class="retention-detail-copy"><strong>${escapeHtml(state.materia||'Matéria')} — ${escapeHtml(state.assunto||'Assunto')}</strong><span>Retenção ${retention}% · Questões ${accuracy} · ${escapeHtml(overdueText)}</span></span><span class="retention-detail-value">${retention}%</span></${tag}>`;
        }

        function openRetentionMetricDetails(kind) {
            const config = getRetentionMetricConfig(kind); if(!config) return;
            const modal=document.getElementById('modalRetentionMetricDetails');
            const title=document.getElementById('retentionMetricModalTitle');
            const subtitle=document.getElementById('retentionMetricModalSubtitle');
            const list=document.getElementById('retentionMetricModalList');
            if(!modal || !title || !subtitle || !list) return;
            const diag=buildRetentionDiagnostics();
            const rows=Array.isArray(diag[config.key]) ? diag[config.key] : [];
            title.textContent=config.title;
            subtitle.textContent=config.subtitle;
            list.innerHTML=rows.length ? rows.map((row,index)=>renderRetentionMetricDetailRow(row,index,kind)).join('') : '<div class="retention-empty">Nenhum conteúdo nesta categoria no momento.</div>';
            modal.style.display='flex';
        }

        function closeRetentionMetricDetails() {
            const modal=document.getElementById('modalRetentionMetricDetails');
            if(modal) modal.style.display='none';
        }

        function renderRetentionDiagnostics() {
            const panel = document.getElementById('retentionDiagnosticPanel');
            if (!panel) return;
            const set = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
            const setBar = (id,value) => {
                const el=document.getElementById(id);
                if(el) el.style.width=`${Math.max(0,Math.min(100,Number(value)||0))}%`;
            };
            const list = document.getElementById('retentionDiagnosticRiskList');
            const moreButton = document.getElementById('retentionMoreButton');
            const phaseBox = document.getElementById('retentionExamPhase');

            if (!hasRealCurrentConcurso()) {
                set('retentionDiagAverage','—'); set('retentionDiagRisk','0'); set('retentionDiagOverdue','0'); set('retentionDiagMastered','0');
                setBar('retentionDiagAverageBar',0); setBar('retentionDiagRiskBar',0); setBar('retentionDiagOverdueBar',0); setBar('retentionDiagMasteredBar',0);
                if(phaseBox) phaseBox.innerHTML='<span class="rd-exam-icon-v1077" aria-hidden="true">▦</span><span class="rd-exam-copy-v1077"><strong>Selecione um concurso</strong><span>Crie ou selecione um concurso para ativar a estratégia progressiva.</span></span><button class="rd-exam-action-v1077" type="button" disabled>Definir data da prova</button>';
                if(list) list.innerHTML='<div class="retention-empty">Crie ou selecione um concurso para iniciar o diagnóstico.</div>';
                if(moreButton) moreButton.hidden=true;
                retentionDiagnosticRows=[]; return;
            }

            const metadata = getConcursosMetadata();
            const contestMeta = metadata[currentConcurso] || {};
            const phase = getExamPhaseProfile(contestMeta);
            if (phaseBox) {
                const hasExamDate = !!String(contestMeta.dataProva || '').trim();
                const dayText = phase.days == null ? '' : (phase.days < 0 ? 'Prova realizada' : phase.days === 0 ? 'Hoje' : `${phase.days} dia${phase.days===1?'':'s'}`);
                const title = hasExamDate ? `${phase.label}${dayText ? ` · ${dayText}` : ''}` : 'Sem data de prova definida';
                const guidance = hasExamDate ? phase.guidance : 'Defina a data da prova para ativar a estratégia progressiva.';
                const actionText = hasExamDate ? 'Alterar data' : 'Definir data da prova';
                phaseBox.innerHTML = `<span class="rd-exam-icon-v1077" aria-hidden="true">▦</span><span class="rd-exam-copy-v1077"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(guidance)}</span></span><button class="rd-exam-action-v1077" type="button" onclick="editarDataProva()">${escapeHtml(actionText)}</button>`;
            }

            const diag = buildRetentionDiagnostics();
            const totalRows = Math.max(1, diag.rows.length);
            const average = Number.isFinite(diag.avg) ? Math.round(diag.avg) : null;
            set('retentionDiagAverage', average != null ? `${average}%` : '—');
            set('retentionDiagRisk', diag.risk.length);
            set('retentionDiagOverdue', diag.overdue.length);
            set('retentionDiagMastered', diag.mastered.length);
            const countBar = count => count > 0 ? Math.max(8, (count / totalRows) * 100) : 0;
            setBar('retentionDiagAverageBar', average ?? 0);
            setBar('retentionDiagRiskBar', countBar(diag.risk.length));
            setBar('retentionDiagOverdueBar', countBar(diag.overdue.length));
            setBar('retentionDiagMasteredBar', countBar(diag.mastered.length));

            retentionDiagnosticRows = diag.risk.slice(0,20);
            if(!list) return;
            if (!diag.rows.length) {
                list.innerHTML='<div class="retention-empty">Ainda não há sessões suficientes para estimar retenção. O diagnóstico aparecerá conforme você estudar.</div>';
                if(moreButton) moreButton.hidden=true; return;
            }
            if (!retentionDiagnosticRows.length) {
                list.innerHTML='<div class="retention-empty">Nenhum assunto está em risco neste momento.</div>';
                if(moreButton) moreButton.hidden=true; return;
            }
            list.innerHTML=retentionDiagnosticRows.slice(0,2).map((row,index)=>renderRetentionRiskCard(row,index)).join('');
            if(moreButton) {
                const extra = retentionDiagnosticRows.length - 2;
                moreButton.hidden = extra <= 0;
                moreButton.title = extra > 0 ? `Ver mais ${extra} ponto${extra===1?'':'s'} crítico${extra===1?'':'s'}` : '';
                moreButton.setAttribute('aria-label', moreButton.title || 'Ver mais pontos críticos');
            }
        }

        function openRetentionMoreModal() {
            const modal=document.getElementById('modalRetentionMore');
            const list=document.getElementById('retentionMoreList');
            if(!modal || !list) return;
            const rows=retentionDiagnosticRows.slice(2);
            list.innerHTML=rows.length ? rows.map((row,offset)=>renderRetentionRiskCard(row,offset+2)).join('') : '<div class="retention-empty">Não há outros pontos críticos.</div>';
            modal.style.display='flex';
        }

        function closeRetentionMoreModal() {
            const modal=document.getElementById('modalRetentionMore');
            if(modal) modal.style.display='none';
        }

        function startRetentionDiagnosticTopic(index) {
            return openLayeredReviewModal(index);
        }

        function updateModernOverview() {
            const topics = editalItems || [];
            const progressBreakdown = getStudyProgressBreakdown(topics);
            const pct = Math.round(progressBreakdown.total);
            const delayedText = document.getElementById('delayedBadgeCount')?.textContent || '0';
            const delayed = (delayedText.match(/\d+/) || ['0'])[0];
            const today = document.getElementById('dailyPomodoroTotal')?.textContent || '00:00';
            const target = document.getElementById('dailyPomodoroTarget')?.textContent || '—';
            const set = (id, value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
            set('modernOverviewProgress', `${pct}%`);
            set('modernOverviewTopics', topics.length);
            set('modernOverviewReviews', delayed);
            set('modernOverviewToday', today);
            set('modernOverviewTarget', target === 'Sem meta' ? '—' : target);
            set('modernOverviewStudiedHours', formatStudyMinutes(getTotalRecordedStudyMinutes()));
            renderRetentionDiagnostics();
        }

        document.addEventListener('click', (event) => {
            const modal = document.getElementById('modalGlobalSearch');
            if (modal && event.target === modal) closeGlobalSearchModal();
        });

        window.addEventListener('load', () => {
            updateModernOverview();
            updateContextFab();
            updateDesktopStickyTabsOffset();
            const stickyHeader = document.querySelector('header.modern-header');
            if (stickyHeader && 'ResizeObserver' in window) {
                new ResizeObserver(updateDesktopStickyTabsOffset).observe(stickyHeader);
            }
            window.addEventListener('resize', updateDesktopStickyTabsOffset, { passive: true });
            const observedIds = ['edital-list','dailyPomodoroTotal','dailyPomodoroTarget','delayedBadgeCount'];
            observedIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) new MutationObserver(updateModernOverview).observe(el, {childList:true,subtree:true,characterData:true});
            });
        });

