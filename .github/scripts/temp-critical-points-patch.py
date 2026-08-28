from pathlib import Path


def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1, encontrado {count}')
    return text.replace(old, new, 1)


def section(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    end = text.find(end_marker, start + 1) if start >= 0 else -1
    if start < 0 or end < 0:
        raise SystemExit(f'{label}: marcadores não encontrados')
    return text[:start] + replacement + text[end:]


app_path = Path('public/js/app-ui.js')
app = app_path.read_text()
anchor = "        let retentionDiagnosticRows = [];\n        let pendingLayeredReview = null;\n"
helpers = r'''        let retentionDiagnosticRows = [];
        let pendingLayeredReview = null;
        const CRITICAL_REVIEW_SNOOZE_MS = 24 * 60 * 60 * 1000;
        const CRITICAL_REVIEW_HISTORY_MS = 72 * 60 * 60 * 1000;
        const CRITICAL_REVIEW_LEDGER_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

        function getCriticalReviewLedgerKey() {
            const uid = currentUser?.id || 'guest';
            return `critical_review_ledger_${uid}_${encodeURIComponent(currentConcurso || 'Concurso Geral')}`;
        }
        function readCriticalReviewLedger() {
            try {
                const parsed=JSON.parse(localStorage.getItem(getCriticalReviewLedgerKey())||'{}');
                return parsed&&typeof parsed==='object'?parsed:{};
            } catch (_) { return {}; }
        }
        function writeCriticalReviewLedger(ledger) {
            try { localStorage.setItem(getCriticalReviewLedgerKey(),JSON.stringify(ledger||{})); } catch (_) {}
        }
        function getCriticalTopicMemory(key,create=false) {
            const ledger=readCriticalReviewLedger();
            ledger.topics=ledger.topics&&typeof ledger.topics==='object'?ledger.topics:{};
            let topic=ledger.topics[key];
            if(!topic&&create)topic=ledger.topics[key]={events:[],snoozedUntil:0};
            if(topic){
                const cutoff=Date.now()-CRITICAL_REVIEW_LEDGER_MAX_AGE_MS;
                topic.events=(Array.isArray(topic.events)?topic.events:[]).filter(event=>Number(event?.at)>=cutoff).slice(-16);
                if(Number(topic.snoozedUntil||0)<=Date.now())topic.snoozedUntil=0;
            }
            if(create||topic)writeCriticalReviewLedger(ledger);
            return {ledger,topic:topic||null};
        }
        function getCriticalReviewHistory(key) {
            if(!key)return {recentRecommendedLayers:[],recentStartedLayers:[],lastRecommendedAt:0,lastStartedAt:0};
            const {topic}=getCriticalTopicMemory(key,false);
            const cutoff=Date.now()-CRITICAL_REVIEW_HISTORY_MS;
            const events=(topic?.events||[]).filter(event=>Number(event?.at)>=cutoff);
            const recommended=events.filter(event=>event.type==='recommended').sort((a,b)=>b.at-a.at);
            const started=events.filter(event=>event.type==='started').sort((a,b)=>b.at-a.at);
            return {
                recentRecommendedLayers:recommended.slice(0,4).map(event=>Number(event.layer)).filter(layer=>layer>=1&&layer<=4),
                recentStartedLayers:started.slice(0,4).map(event=>Number(event.layer)).filter(layer=>layer>=1&&layer<=4),
                lastRecommendedAt:Number(recommended[0]?.at)||0,
                lastStartedAt:Number(started[0]?.at)||0
            };
        }
        function recordCriticalReviewEvent(key,type,layer,source='local') {
            if(!key||!['recommended','started'].includes(type))return;
            const normalizedLayer=Number(layer);if(normalizedLayer<1||normalizedLayer>4)return;
            const {ledger,topic}=getCriticalTopicMemory(key,true);const now=Date.now();
            const last=[...(topic.events||[])].reverse().find(event=>event.type===type);
            if(last&&Number(last.layer)===normalizedLayer&&now-Number(last.at||0)<10*60*1000)return;
            topic.events.push({type,layer:normalizedLayer,source:String(source||'local').slice(0,24),at:now});
            topic.events=topic.events.slice(-16);ledger.topics[key]=topic;writeCriticalReviewLedger(ledger);
        }
        function isCriticalTopicSnoozed(key) {
            if(!key)return false;
            return Number(getCriticalTopicMemory(key,false).topic?.snoozedUntil||0)>Date.now();
        }
        async function snoozeCriticalReview24h() {
            const pending=pendingLayeredReview;
            const key=pending?.row?.state?.key||(pending?.item?getStudyTopicKey(pending.item.materia,pending.item.assunto):'');
            if(!key)return;
            const {ledger,topic}=getCriticalTopicMemory(key,true);
            topic.snoozedUntil=Date.now()+CRITICAL_REVIEW_SNOOZE_MS;ledger.topics[key]=topic;writeCriticalReviewLedger(ledger);
            closeLayeredReviewModal();try{closeRetentionMoreModal();}catch(_){}
            updateModernOverview();
            await appNotice('Este ponto crítico foi adiado por 24 horas. Ele voltará automaticamente se ainda houver risco após esse período.',{title:'Revisão adiada'});
        }
        window.AppCriticalReviewMemory=Object.freeze({getHistory:getCriticalReviewHistory,isSnoozed:isCriticalTopicSnoozed});
'''
app = once(app, anchor, helpers, 'ledger')

plan_block = r'''        function getLayeredReviewPlan(row, item, options = {}) {
            const contest=options.contest||getConcursosMetadata()[currentConcurso]||{};
            const state=row?.state||getRetentionTopicState(contest,item?.materia,item?.assunto,false);
            const retention=Number.isFinite(Number(row?.retention))?Number(row.retention):(state?.lastStudyAt?calculateRetentionFromState(state,new Date()):100);
            const accuracy=Number.isFinite(Number(row?.questionAccuracy))?Number(row.questionAccuracy):(Number.isFinite(Number(state?.questionStats?.lastAccuracy))?Number(state.questionStats.lastAccuracy):null);
            const confidence=Math.max(0,Math.min(1,Number(state?.questionStats?.confidence)||0));
            const overdue=!!(row?.scheduledOverdue||row?.overdue);const forgot=state?.lastRating==='forgot';
            const acquired=isContentAcquired(item);const sessionCount=Math.max(0,Number(state?.sessionCount)||0);
            const reviewCount=Math.max(0,Number(state?.reviewCount)||0);const lapseCount=Math.max(0,Number(state?.lapseCount)||0);
            const hardCount=Math.max(0,Number(state?.ratingCounts?.hard)||0);
            const history=getCriticalReviewHistory(state?.key||getStudyTopicKey(item?.materia,item?.assunto));
            const scores={1:0,2:0,3:0,4:0};
            const severeLoss=forgot||retention<38||(accuracy!=null&&confidence>=.25&&accuracy<42);
            if(severeLoss)scores[4]=200;
            else{
                scores[1]+=(retention>=78?28:retention>=65?16:4)+(sessionCount>=2?8:0)+(accuracy!=null&&accuracy>=72?10:0);
                scores[2]+=(overdue?14:0)+Math.max(0,82-retention)*.55+(retention>=55&&retention<82?10:0)+(reviewCount<=1?5:0);
                scores[3]+=(acquired?16:-12)+(accuracy==null?8:Math.max(0,82-accuracy)*.62)+(confidence>=.2?6:0)+(sessionCount>=2?5:0);
                scores[4]+=Math.max(0,70-retention)*.45+lapseCount*4+hardCount*2.5+(reviewCount>=3&&retention<65?12:0)+(acquired?0:8);
                const lastRecommended=history.recentRecommendedLayers[0],lastStarted=history.recentStartedLayers[0];
                if(lastRecommended&&Date.now()-history.lastRecommendedAt<24*60*60*1000)scores[lastRecommended]-=30;
                if(lastStarted&&Date.now()-history.lastStartedAt<48*60*60*1000)scores[lastStarted]-=12;
                history.recentRecommendedLayers.slice(1).forEach(layer=>{if(scores[layer]!=null)scores[layer]-=8;});
            }
            const recommendedLayer=severeLoss?4:[1,2,3,4].sort((a,b)=>scores[b]-scores[a]||a-b)[0];
            const reasons={1:'Os sinais permitem começar por recuperação mental, testando o que ainda está acessível sem consulta.',2:'Uma revisão curta é suficiente neste momento, sem custo de reestudo completo.',3:'O conteúdo já foi adquirido e o próximo ganho provável vem de aplicação objetiva em questões.',4:'Há sinais de perda relevante ou dificuldade persistente; o conteúdo precisa ser reconstruído antes de novo teste.'};
            const repeated=history.recentRecommendedLayers[0]===recommendedLayer;
            const reason=`${reasons[recommendedLayer]}${repeated?' A repetição foi mantida porque os sinais atuais ainda superam as alternativas.':history.recentRecommendedLayers.length?' O histórico recente foi considerado para evitar repetir mecanicamente a mesma intervenção.':''}`;
            const acquisition=getContentAcquisitionState(item);
            const reinforceWithVideo=acquisition.method==='videoaula'||(acquisition.method==='automatico'&&acquisition.teoria&&!acquisition.videoaula);
            const layers=[
                {layer:1,label:'Recuperação mental',minutes:5,description:'Tente explicar conceitos, regras e exceções sem consultar o material.'},
                {layer:2,label:'Revisão curta',minutes:10,description:'Consulte apenas resumo, anotação ou ponto central e confirme o que faltou.'},
                {layer:3,label:'Questões',minutes:20,description:'Resolva uma bateria curta e registre total de questões e acertos.'},
                {layer:4,label:reinforceWithVideo?'Vídeoaula de reforço':'Reestudo de teoria',minutes:30,activityType:reinforceWithVideo?'videoaula':'teoria',description:reinforceWithVideo?'Use uma explicação em vídeo para reconstruir o ponto que apresentou baixa retenção ou baixo desempenho.':'Reconstrua o conteúdo quando a retenção ou o desempenho indicarem perda relevante.'}
            ];
            return {recommendedLayer,reason,retention,accuracy,layers,scores,history,severeLoss,aiUsed:false};
        }

        function renderLayeredReviewPlan(pending) {
            if(!pending?.item||!pending?.plan)return;const {item,plan}=pending;
            const topic=document.getElementById('layeredReviewTopic'),meta=document.getElementById('layeredReviewMeta'),steps=document.getElementById('layeredReviewSteps');
            if(topic)topic.textContent=`${item.materia} — ${item.assunto}`;
            const perf=plan.accuracy==null?'':` · Questões ${Math.round(plan.accuracy)}%`,source=plan.aiUsed?' · Método refinado pela IA.':'';
            if(meta)meta.textContent=`Retenção ${Math.round(plan.retention)}%${perf}. ${plan.reason}${source}`;
            if(steps)steps.innerHTML=plan.layers.map(layer=>`<div class="layered-review-step ${layer.layer===plan.recommendedLayer?'recommended':''}"><div class="layered-review-number">${layer.layer}</div><div class="layered-review-content"><strong>${escapeHtml(layer.label)}${layer.layer===plan.recommendedLayer?' · recomendada':''}</strong><span>${escapeHtml(layer.description)} · ${layer.minutes} min sugeridos</span></div><button class="btn btn-secondary btn-sm" type="button" data-dynamic-action="start-layered-review" data-layer="${layer.layer}">Iniciar</button></div>`).join('');
        }
        function buildCriticalAdvisorCandidate(row,item,plan) {
            const state=row?.state||{},friction=window.AppLearningAdvisor?.computeLearningFriction?.(row,item);
            return {topicId:state.key||getStudyTopicKey(item.materia,item.assunto),materia:item.materia,assunto:item.assunto,prioridade:Number(item.prioridade)||2,assuntoPrioridade:Number(item.assunto_prioridade)||1,frictionScore:Number(friction?.score)||Math.max(0,Math.min(100,Math.round(100-plan.retention))),metrics:{retention:plan.retention,accuracy:plan.accuracy,confidence:Math.max(0,Math.min(1,Number(state?.questionStats?.confidence)||0)),lapseCount:Math.max(0,Number(state?.lapseCount)||0),reviewCount:Math.max(0,Number(state?.reviewCount)||0),sessionCount:Math.max(0,Number(state?.sessionCount)||0),totalMinutes:Math.max(0,Number(state?.totalMinutes)||0),difficulty:Math.max(1,Math.min(10,Number(state?.difficulty)||5)),forgot:state?.lastRating==='forgot',acquired:isContentAcquired(item)}};
        }
        async function refineLayeredReviewWithAI(pending) {
            const advisor=window.AppLearningAdvisor,key=pending?.row?.state?.key;
            if(!pending?.item||!key||typeof advisor?.recommendLayeredReview!=='function'){if(key)recordCriticalReviewEvent(key,'recommended',pending?.plan?.recommendedLayer,'local');return;}
            try{
                const advice=await advisor.recommendLayeredReview({candidate:buildCriticalAdvisorCandidate(pending.row,pending.item,pending.plan),history:getCriticalReviewHistory(key)});
                if(pendingLayeredReview!==pending||!advice)return;
                const aiLayer={active_recall:1,short_review:2,questions:3,focused_restudy:4}[advice.recommendedAction];if(!aiLayer)return;
                if(!(pending.plan.severeLoss&&aiLayer!==4)){pending.plan.recommendedLayer=aiLayer;pending.plan.reason=String(advice.rationale||advice.method||pending.plan.reason).slice(0,420);pending.plan.aiUsed=Boolean(advice.aiUsed);renderLayeredReviewPlan(pending);}
            }catch(error){console.warn('Refino de método dos Pontos críticos indisponível:',error?.message||error);}
            finally{if(pendingLayeredReview===pending)recordCriticalReviewEvent(key,'recommended',pending.plan.recommendedLayer,pending.plan.aiUsed?'gemini':'local');}
        }

'''
app = section(app, "        function getLayeredReviewPlan(row, item, options = {}) {", "        function openLayeredReviewModal(index) {", plan_block, 'planner')
open_start = app.find("        function openLayeredReviewModal(index) {")
open_end = app.find("\n        function closeLayeredReviewModal()", open_start)
if open_start < 0 or open_end < 0: raise SystemExit('modal markers')
new_open = r'''        function openLayeredReviewModal(index) {
            const row=retentionDiagnosticRows[index];if(!row?.state)return;
            const item=editalItems.find(i=>getStudyTopicKey(i.materia,i.assunto)===row.state.key);
            if(!item)return appNotice('Este assunto não está mais disponível no edital atual.',{title:'Pontos críticos'});
            const contest=getConcursosMetadata()[currentConcurso]||{},plan=getLayeredReviewPlan(row,item,{contest});
            const pending={index,row,item,plan};pendingLayeredReview=pending;renderLayeredReviewPlan(pending);
            const modal=document.getElementById('modalLayeredReview');setVisualState(modal,true);refineLayeredReviewWithAI(pending).catch(()=>{});
        }
'''
app = app[:open_start] + new_open + app[open_end:]
old = "            const base={kind:'study',materia:item.materia,assunto:item.assunto,itemId:item.id,isRevision:true,minutes:def.minutes,source:'layered_review',layer:Number(layer)};\n            const modal=document.getElementById('modalLayeredReview'); setVisualState(modal, false);\n            pendingLayeredReview=null;"
new = "            const base={kind:'study',materia:item.materia,assunto:item.assunto,itemId:item.id,isRevision:true,minutes:def.minutes,source:'layered_review',layer:Number(layer)};\n            const key=pending?.row?.state?.key||getStudyTopicKey(item.materia,item.assunto);recordCriticalReviewEvent(key,'started',Number(layer),'user');\n            const modal=document.getElementById('modalLayeredReview'); setVisualState(modal, false);\n            pendingLayeredReview=null;"
app = once(app, old, new, 'start history')
app = once(app, "            const diag = buildRetentionDiagnostics();\n            const totalRows = Math.max(1, diag.rows.length);", "            const diag = buildRetentionDiagnostics();\n            const visibleRisk = diag.risk.filter(row => !isCriticalTopicSnoozed(row?.state?.key));\n            const totalRows = Math.max(1, diag.rows.length);", 'visible risk')
app = once(app, "            set('retentionDiagRisk', diag.risk.length);", "            set('retentionDiagRisk', visibleRisk.length);", 'risk count')
app = once(app, "            setBar('retentionDiagRiskBar', countBar(diag.risk.length));", "            setBar('retentionDiagRiskBar', countBar(visibleRisk.length));", 'risk bar')
app = once(app, "            retentionDiagnosticRows = diag.risk.slice(0,20);", "            retentionDiagnosticRows = visibleRisk.slice(0,20);", 'risk rows')
action = "                if (action === 'start-layered-review') {\n                    startLayeredReviewLayer(Number(actionTarget.dataset.layer));\n                    return;\n                }"
app = once(app, action, action + "\n                if (action === 'snooze-critical-review') { snoozeCriticalReview24h().catch(error=>console.warn('Não foi possível adiar o ponto crítico:',error)); return; }", 'snooze action')
app_path.write_text(app)

index_path=Path('public/index.html')
index=index_path.read_bytes().decode('utf-8')
needle='                <button class="btn btn-primary btn-sm" type="button" id="layeredReviewStartRecommended" data-action="call" data-call="startRecommendedLayeredReview" data-enter-default="true">Iniciar camada recomendada</button>'
insert='                <button class="btn btn-secondary btn-sm" type="button" data-dynamic-action="snooze-critical-review">Adiar 24h</button>\r\n'+needle
index=once(index,needle,insert,'snooze modal button')
index_path.write_bytes(index.encode('utf-8'))

advisor_path=Path('public/js/learning-advisor.js')
advisor=advisor_path.read_text()
advisor=once(advisor,"  }).filter(Boolean).filter(item=>item.frictionScore>=MIN_FRICTION)","  }).filter(Boolean).filter(item=>!global.AppCriticalReviewMemory?.isSnoozed?.(item.topicId)).filter(item=>item.frictionScore>=MIN_FRICTION)",'advisor candidates')
advisor=once(advisor,"  }).filter(Boolean).sort((a,b)=>b.riskScore-a.riskScore||a.retention-b.retention);","  }).filter(Boolean).filter(entry=>!global.AppCriticalReviewMemory?.isSnoozed?.(entry?.row?.state?.key)).sort((a,b)=>b.riskScore-a.riskScore||a.retention-b.retention);",'advisor risks')
advisor=once(advisor,"async function requestAdvice(candidates){","async function requestAdvice(candidates,options={}){",'request signature')
old="body:JSON.stringify({contest:getContestName(),topics:candidates.map(({topicId,materia,assunto,prioridade,assuntoPrioridade,frictionScore,metrics})=>({topicId,materia,assunto,prioridade,assuntoPrioridade,frictionScore,metrics}))})"
new="body:JSON.stringify({contest:getContestName(),mode:options.mode||'general',topics:candidates.map(candidate=>({topicId:candidate.topicId,materia:candidate.materia,assunto:candidate.assunto,prioridade:candidate.prioridade,assuntoPrioridade:candidate.assuntoPrioridade,frictionScore:candidate.frictionScore,metrics:candidate.metrics,history:candidate.history||null}))})"
advisor=once(advisor,old,new,'request body')
method="""async function recommendLayeredReview(input={}){\n  const candidate=input?.candidate;if(!candidate?.topicId)return null;\n  const payload=await requestAdvice([{...candidate,history:input?.history||{}}],{mode:'layered_review'});\n  const intervention=Array.isArray(payload?.interventions)?payload.interventions.find(item=>item?.topicId===candidate.topicId):null;\n  return intervention?{...intervention,aiUsed:Boolean(payload?.aiUsed),provider:payload?.provider||'unknown'}:null;\n}\n\n"""
advisor=once(advisor,"async function analyze(options={}){",method+"async function analyze(options={}){",'layered advisor method')
advisor=once(advisor,"global.AppLearningAdvisor=Object.freeze({VERSION,computeLearningFriction,collectCandidates,getRiskRows,openRiskView,analyze,refresh,close:closeDialog,getDiagnostics:diagnostics});","global.AppLearningAdvisor=Object.freeze({VERSION,computeLearningFriction,collectCandidates,getRiskRows,openRiskView,analyze,recommendLayeredReview,refresh,close:closeDialog,getDiagnostics:diagnostics});",'advisor export')
advisor_path.write_text(advisor)

server_path=Path('src/learning-diagnosis.js')
server=server_path.read_text()
server=once(server,"const ACTIONS=new Set(['active_recall','short_review','questions','focused_restudy','flashcards','compare_map','law_reading']);","const ACTIONS=new Set(['active_recall','short_review','questions','focused_restudy','flashcards','compare_map','law_reading']);\nconst LAYER_ACTIONS=new Set(['active_recall','short_review','questions','focused_restudy']);",'layer actions')
server=once(server,"      acquired:Boolean(m.acquired)\n    }\n  };","      acquired:Boolean(m.acquired)\n    },\n    history:{recentRecommendedLayers:(Array.isArray(raw?.history?.recentRecommendedLayers)?raw.history.recentRecommendedLayers:[]).map(Number).filter(layer=>layer>=1&&layer<=4).slice(0,4),recentStartedLayers:(Array.isArray(raw?.history?.recentStartedLayers)?raw.history.recentStartedLayers:[]).map(Number).filter(layer=>layer>=1&&layer<=4).slice(0,4),lastRecommendedAt:clamp(raw?.history?.lastRecommendedAt,0,Date.now()),lastStartedAt:clamp(raw?.history?.lastStartedAt,0,Date.now())}\n  };",'history sanitize')
server=once(server,"  const severity=topic.frictionScore>=70?'high':topic.frictionScore>=50?'medium':'low';\n  return {topicId:topic.topicId,diagnosisType,severity,recommendedAction,suggestedMinutes:minutes,method,rationale:`Fricção ${Math.round(topic.frictionScore)}/100; retenção ${Math.round(m.retention)}%${m.accuracy==null?'':`; questões ${Math.round(m.accuracy)}%`}. A recomendação é consultiva e deve ser validada pelo motor local.`};","  const severity=topic.frictionScore>=70?'high':topic.frictionScore>=50?'medium':'low';\n  const layerByAction={active_recall:1,short_review:2,questions:3,focused_restudy:4},actionByLayer={1:'active_recall',2:'short_review',3:'questions',4:'focused_restudy'};\n  const recent=topic?.history?.recentRecommendedLayers||[],currentLayer=layerByAction[recommendedAction],severe=m.forgot||m.retention<38||(m.accuracy!=null&&m.confidence>=.25&&m.accuracy<42);\n  if(currentLayer&&recent[0]===currentLayer&&!severe){const alternate=m.acquired&&(m.accuracy==null||m.accuracy<75)?3:(m.retention>=62?1:4);recommendedAction=actionByLayer[alternate];method=alternate===3?'Resolva questões curtas e comentadas para testar a aplicação.':alternate===1?'Faça recuperação mental sem consulta e confira somente as lacunas.':'Reconstrua o ponto central e teste a recuperação logo depois.';minutes=alternate===3?20:alternate===1?8:30;}\n  return {topicId:topic.topicId,diagnosisType,severity,recommendedAction,suggestedMinutes:minutes,method,rationale:`Fricção ${Math.round(topic.frictionScore)}/100; retenção ${Math.round(m.retention)}%${m.accuracy==null?'':`; questões ${Math.round(m.accuracy)}%`}. O histórico recente de métodos também foi considerado para evitar repetição mecânica.`};",'fallback anti repeat')
server=once(server,"function validateIntervention(raw,topic){","function validateIntervention(raw,topic,mode='general'){",'validate mode')
server=once(server,"    recommendedAction:ACTIONS.has(raw.recommendedAction)?raw.recommendedAction:fallback.recommendedAction,","    recommendedAction:(mode==='layered_review'?LAYER_ACTIONS:ACTIONS).has(raw.recommendedAction)?raw.recommendedAction:fallback.recommendedAction,",'validate action')
server=once(server,"async function runGemini(env,contest,topics){","async function runGemini(env,contest,topics,mode='general'){",'run mode')
server=once(server,"  const system=`Você é um consultor pedagógico para preparação de concursos públicos. Você NÃO controla o cronograma, NÃO altera prioridades, NÃO cria assuntos e NÃO diagnostica condições médicas. O Retention Engine determinístico é a autoridade. Sua única função é interpretar métricas já calculadas e sugerir UMA intervenção de estudo por tópico. Seja conservador, objetivo e use somente os dados fornecidos. Nunca recomende excluir conteúdo. Retorne apenas JSON no schema solicitado.`;","  const layered=mode==='layered_review';\n  const system=`Você é um consultor pedagógico para preparação de concursos públicos. Você NÃO controla o cronograma, NÃO altera prioridades, NÃO cria assuntos e NÃO diagnostica condições médicas. O Retention Engine determinístico é a autoridade. Sua única função é interpretar métricas já calculadas e sugerir UMA intervenção de estudo por tópico. ${layered?'Neste modo escolha EXATAMENTE entre active_recall, short_review, questions e focused_restudy. Considere o histórico recente e evite repetir o mesmo método sem nova evidência; só repita quando os sinais atuais justificarem claramente.':''} Seja conservador, objetivo e use somente os dados fornecidos. Nunca recomende excluir conteúdo. Retorne apenas JSON no schema solicitado.`;",'AI prompt')
server=once(server,"recommendedAction:{type:'STRING',enum:[...ACTIONS]}","recommendedAction:{type:'STRING',enum:[...(layered?LAYER_ACTIONS:ACTIONS)]}",'AI schema')
server=once(server,"  const fallback=topics.map(deterministicIntervention);\n  let interventions=fallback,aiUsed=false;","  const mode=body?.mode==='layered_review'?'layered_review':'general';\n  const fallback=topics.map(deterministicIntervention);\n  let interventions=fallback,aiUsed=false;",'mode parse')
server=once(server,"    const raw=await runGemini(env,body?.contest,topics);","    const raw=await runGemini(env,body?.contest,topics,mode);",'run call')
server=once(server,"    interventions=topics.map(topic=>validateIntervention(byId.get(topic.topicId),topic));","    interventions=topics.map(topic=>validateIntervention(byId.get(topic.topicId),topic,mode));",'validate call')
server_path.write_text(server)

Path('.github/scripts/temp-critical-points-patch.py').unlink()
Path('.github/workflows/temp-critical-points-adaptive.yml').unlink()
