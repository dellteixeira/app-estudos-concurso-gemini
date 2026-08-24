const { test, expect } = require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const advisorSource=fs.readFileSync(path.join(__dirname,'../../public/js/learning-advisor.js'),'utf8');
const advisorCss=fs.readFileSync(path.join(__dirname,'../../public/css/learning-advisor.css'),'utf8');

for(const width of [320,390,560,1024,1440]){
  test(`Learning Advisor remains consultive, full-width and text-safe at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.setContent(`<!doctype html><html><head><style>${advisorCss}</style></head><body><section id="retentionDiagnosticPanel" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:100%;box-sizing:border-box"><div id="retentionDiagnosticRiskList" style="grid-column:1"></div><div style="grid-column:2">Diagnóstico</div></section></body></html>`);
    await page.evaluate(()=>{
      window.currentConcurso='Concurso Teste';
      window.getStudyTopicKey=(m,a)=>`${m}::${a}`.toLowerCase();
      window.editalItems=[{id:'t1',materia:'Direito Penal com identificação extensa para validar adaptação responsiva',assunto:'ConcursoDePessoasComTextoExtremamenteLongoSemEspacosParaValidarQuebraDentroDoContainerSemQualquerCorteVisual',prioridade:1,assunto_prioridade:1,teoria:true,questoes:true}];
      window.retentionDiagnosticRows=[{retention:38,questionAccuracy:42,state:{key:'direito penal com identificação extensa para validar adaptação responsiva::concursodepessoascomtextoextremamentelongosemespacosparavalidarquebradentrodocontainersemqualquercortevisual',retention:38,difficulty:8,reviewCount:4,lapseCount:2,sessionCount:7,totalMinutes:110,lastRating:'hard',ratingCounts:{hard:3},questionStats:{lastAccuracy:42,averageAccuracy:47,confidence:.7}}}];
      window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}};
      window.openLayeredReviewModal=index=>{window.__localInterventionIndex=index};
      window.fetch=async(url,options)=>{
        window.__advisorRequest={url:String(url),body:JSON.parse(options.body),authorization:options.headers.authorization};
        return new Response(JSON.stringify({advisorRole:'auxiliary',authority:'retention-engine',autoSchedule:false,aiUsed:true,provider:'gemini',model:'gemini-3.6-flash',interventions:[{topicId:'direito penal com identificação extensa para validar adaptação responsiva::concursodepessoascomtextoextremamentelongosemespacosparavalidarquebradentrodocontainersemqualquercortevisual',diagnosisType:'persistent',severity:'high',recommendedAction:'focused_restudy',suggestedMinutes:30,method:'ReestudoFocalizadoComUmaOrientaçãoMuitoLongaSemEspacosParaGarantirQueOTextoNuncaUltrapasseSeuContainerResponsivo.',rationale:'Baixa retenção após múltiplas revisões indica dificuldade persistente e exige uma intervenção pedagógica focalizada sem alterar automaticamente o cronograma.'}]}),{status:200,headers:{'content-type':'application/json'}});
      };
    });
    await page.addScriptTag({content:advisorSource});
    const panel=page.locator('#learningAdvisorPanel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('IA auxiliar');
    await expect(panel).toContainText('Retenção continua sendo a autoridade');

    const parentBox=await page.locator('#retentionDiagnosticPanel').boundingBox();
    const initialBox=await panel.boundingBox();
    expect(Math.abs(initialBox.x-parentBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((initialBox.x+initialBox.width)-(parentBox.x+parentBox.width))).toBeLessThanOrEqual(1);

    await panel.locator('#learningAdvisorAnalyze').click();
    await expect(panel.locator('.learning-advisor-card')).toHaveCount(1);
    await expect(panel).toContainText('Dificuldade persistente');
    await expect(panel).toContainText('Reestudo focalizado');
    const request=await page.evaluate(()=>window.__advisorRequest);
    expect(request.url).toBe('/api/ai/learning-diagnosis');
    expect(request.authorization).toBe('Bearer test-token');
    expect(request.body.topics).toHaveLength(1);
    expect(request.body.topics[0].frictionScore).toBeGreaterThanOrEqual(35);
    expect(await page.evaluate(()=>window.__localInterventionIndex)).toBeUndefined();
    await panel.locator('[data-learning-action="local-intervention"]').click();
    expect(await page.evaluate(()=>window.__localInterventionIndex)).toBe(0);

    const overflow=await panel.evaluate(root=>{
      const selectors=['.learning-advisor-head','.learning-advisor-head>div','.learning-advisor-head h4','.learning-advisor-head p','#learningAdvisorAnalyze','#learningAdvisorStatus','.learning-advisor-card','.learning-advisor-card-top','.learning-advisor-card-top strong','.learning-advisor-action','.learning-advisor-action span','.learning-advisor-controls'];
      return selectors.flatMap(selector=>[...root.querySelectorAll(selector)].map(el=>({selector,text:(el.textContent||'').trim().slice(0,80),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}))).filter(item=>item.scrollWidth>item.clientWidth+1);
    });
    expect(overflow).toEqual([]);

    const finalBox=await panel.boundingBox();
    expect(finalBox.x).toBeGreaterThanOrEqual(0);
    expect(finalBox.x+finalBox.width).toBeLessThanOrEqual(width+1);

    if(width<=700){
      const headColumns=await panel.locator('.learning-advisor-head').evaluate(el=>getComputedStyle(el).gridTemplateColumns);
      expect(headColumns.trim().split(/\s+/)).toHaveLength(1);
      const buttonBox=await panel.locator('#learningAdvisorAnalyze').boundingBox();
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    }
  });
}
