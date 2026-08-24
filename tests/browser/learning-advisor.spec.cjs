const { test, expect } = require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const advisorSource=fs.readFileSync(path.join(__dirname,'../../public/js/learning-advisor.js'),'utf8');
const advisorCss=fs.readFileSync(path.join(__dirname,'../../public/css/learning-advisor.css'),'utf8');

for(const width of [320,390,560,1024,1440]){
  test(`Learning Advisor matches approved full-width layout and remains text-safe at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:940});
    const desktopGrid=width>=1281?'minmax(190px,.8fr) minmax(320px,1.35fr) minmax(360px,1.8fr)':width>=901?'minmax(200px,.75fr) minmax(430px,1.5fr)':'1fr';
    await page.setContent(`<!doctype html><html><head><style>
      html,body{margin:0;padding:0}
      #retentionDiagnosticPanel{display:grid;grid-template-columns:${desktopGrid};gap:12px;width:100%;box-sizing:border-box;padding:12px}
      #retentionDiagnosticPanel>.retention-diagnostic-head{grid-column:1;min-width:0}
      #retentionDiagnosticPanel>.rd-center-v1077{grid-column:${width>=901?'2':'1'};min-width:0}
      #retentionDiagnosticPanel>.retention-critical-column{grid-column:${width>=1281?'3':'1 / -1'};min-width:0}
      #retentionDiagnosticPanel>section{grid-column:auto}
      ${advisorCss}
    </style></head><body><section id="retentionDiagnosticPanel"><div class="retention-diagnostic-head">Retenção e Diagnóstico</div><div class="rd-center-v1077">Métricas</div><div class="retention-critical-column">Pontos críticos<div id="retentionDiagnosticRiskList"></div></div></section></body></html>`);
    await page.evaluate(()=>{
      window.currentConcurso='Concurso Teste';
      window.getStudyTopicKey=(m,a)=>`${m}::${a}`.toLowerCase();
      window.editalItems=[{id:'t1',materia:'Direito Civil com nome extenso para validar responsividade total do box',assunto:'PessoasNaturaisComTextoMuitoLongoSemEspacosParaValidarQuebraDeLinhaDentroDoComponenteSemOverflowVisual',prioridade:1,assunto_prioridade:1,teoria:true,questoes:true}];
      window.retentionDiagnosticRows=[{retention:38,questionAccuracy:42,state:{key:'direito civil com nome extenso para validar responsividade total do box::pessoasnaturaiscomtextomuitolongosemespacosparavalidarquebradelinhadentrodocomponentesemoverflowvisual',retention:38,difficulty:8,reviewCount:4,lapseCount:2,sessionCount:7,totalMinutes:110,lastRating:'hard',ratingCounts:{hard:3},questionStats:{lastAccuracy:42,averageAccuracy:47,confidence:.7}}}];
      window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}};
      window.openLayeredReviewModal=index=>{window.__localInterventionIndex=index};
      window.fetch=async(url,options)=>{
        window.__advisorRequest={url:String(url),body:JSON.parse(options.body),authorization:options.headers.authorization};
        return new Response(JSON.stringify({advisorRole:'auxiliary',authority:'retention-engine',autoSchedule:false,aiUsed:true,provider:'gemini',model:'gemini-3.6-flash',interventions:[{topicId:'direito civil com nome extenso para validar responsividade total do box::pessoasnaturaiscomtextomuitolongosemespacosparavalidarquebradelinhadentrodocomponentesemoverflowvisual',diagnosisType:'persistent',severity:'high',recommendedAction:'focused_restudy',suggestedMinutes:30,method:'ReestudoFocalizadoComExplicacaoMuitoLongaSemEspacosParaValidarQueTodoTextoSeAjustaAoContainerSemCorte.',rationale:'Baixa retenção após múltiplas revisões indica dificuldade persistente sem alteração automática do cronograma.'}]}),{status:200,headers:{'content-type':'application/json'}});
      };
    });
    await page.addScriptTag({content:advisorSource});
    const panel=page.locator('#learningAdvisorPanel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('IA auxiliar');
    await expect(panel).toContainText('Retenção continua sendo a autoridade');

    const parentBox=await page.locator('#retentionDiagnosticPanel').boundingBox();
    const initialBox=await panel.boundingBox();
    const parentPadding=await page.locator('#retentionDiagnosticPanel').evaluate(el=>({left:parseFloat(getComputedStyle(el).paddingLeft||'0'),right:parseFloat(getComputedStyle(el).paddingRight||'0')}));
    const innerLeft=parentBox.x+parentPadding.left;
    const innerRight=parentBox.x+parentBox.width-parentPadding.right;
    expect(Math.abs(initialBox.x-innerLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs((initialBox.x+initialBox.width)-innerRight)).toBeLessThanOrEqual(1);

    if(width>=901){
      const placement=await panel.evaluate(el=>({columnStart:getComputedStyle(el).gridColumnStart,columnEnd:getComputedStyle(el).gridColumnEnd}));
      expect(placement.columnStart).toBe('1');
      expect(placement.columnEnd).toBe('-1');
      const head=panel.locator('.learning-advisor-head');
      const headBox=await head.boundingBox();
      const copyBox=await head.locator('> div').boundingBox();
      const buttonBox=await panel.locator('#learningAdvisorAnalyze').boundingBox();
      expect(buttonBox.x).toBeGreaterThan(copyBox.x+copyBox.width-1);
      expect(buttonBox.x+buttonBox.width).toBeLessThanOrEqual(headBox.x+headBox.width+1);
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    }

    if(width<=900){
      const headColumns=await panel.locator('.learning-advisor-head').evaluate(el=>getComputedStyle(el).gridTemplateColumns);
      expect(headColumns.trim().split(/\s+/)).toHaveLength(1);
      const buttonBox=await panel.locator('#learningAdvisorAnalyze').boundingBox();
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
      const headBox=await panel.locator('.learning-advisor-head').boundingBox();
      expect(Math.abs(buttonBox.width-headBox.width)).toBeLessThanOrEqual(1);
    }

    await panel.locator('#learningAdvisorAnalyze').click();
    await expect(panel.locator('.learning-advisor-card')).toHaveCount(1);
    await expect(panel).toContainText('Dificuldade persistente');
    await expect(panel).toContainText('Reestudo focalizado');
    const request=await page.evaluate(()=>window.__advisorRequest);
    expect(request.url).toBe('/api/ai/learning-diagnosis');
    expect(request.authorization).toBe('Bearer test-token');
    expect(request.body.topics).toHaveLength(1);
    expect(request.body.topics[0].frictionScore).toBeGreaterThanOrEqual(35);
    await panel.locator('[data-learning-action="local-intervention"]').click();
    expect(await page.evaluate(()=>window.__localInterventionIndex)).toBe(0);

    const overflow=await panel.evaluate(root=>{
      const selectors=['.learning-advisor-head','.learning-advisor-head>div','.learning-advisor-head h4','.learning-advisor-head p','#learningAdvisorAnalyze','#learningAdvisorStatus','.learning-advisor-card','.learning-advisor-card-top','.learning-advisor-card-top strong','.learning-advisor-action','.learning-advisor-action span','.learning-advisor-controls'];
      return selectors.flatMap(selector=>[...root.querySelectorAll(selector)].map(el=>({selector,text:(el.textContent||'').trim().slice(0,100),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}))).filter(item=>item.scrollWidth>item.clientWidth+1);
    });
    expect(overflow).toEqual([]);
  });
}
