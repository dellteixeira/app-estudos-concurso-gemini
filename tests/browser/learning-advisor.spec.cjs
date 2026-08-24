const { test, expect } = require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const advisorSource=fs.readFileSync(path.join(__dirname,'../../public/js/learning-advisor.js'),'utf8');
const advisorCss=fs.readFileSync(path.join(__dirname,'../../public/css/learning-advisor.css'),'utf8');

for(const width of [320,390,560,1024,1440]){
  test(`Learning Advisor is contextual to risk and text-safe at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:940});
    await page.setContent(`<!doctype html><html><head><style>${advisorCss}</style></head><body><section id="retentionDiagnosticPanel"><button id="riskMetric" data-action="retention-details" data-metric="risk" type="button"><span>Assuntos em risco</span><strong id="retentionDiagRisk">1</strong></button></section></body></html>`);
    await page.evaluate(()=>{
      window.currentConcurso='Concurso Teste';
      window.getStudyTopicKey=(m,a)=>`${m}::${a}`.toLowerCase();
      window.editalItems=[{id:'t1',materia:'Direito Civil com identificação extensa para validar responsividade total',assunto:'PessoasNaturaisComTextoMuitoLongoSemEspacosParaValidarQuebraDentroDoDialogoSemQualquerOverflowVisual',prioridade:1,assunto_prioridade:1,teoria:true,questoes:true}];
      window.retentionDiagnosticRows=[{retention:38,questionAccuracy:42,retentionDue:true,retentionDueDays:6,scheduledPending:false,scheduledOverdue:false,overdue:false,riskScore:130,state:{key:'direito civil com identificação extensa para validar responsividade total::pessoasnaturaiscomtextomuitolongosemespacosparavalidarquebradentrododialogosemqualqueroverflowvisual',retention:38,difficulty:8,reviewCount:4,lapseCount:2,sessionCount:7,totalMinutes:110,lastRating:'hard',ratingCounts:{hard:3},questionStats:{lastAccuracy:42,averageAccuracy:47,confidence:.7}}}];
      window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}};
      window.openLayeredReviewModal=index=>{window.__localInterventionIndex=index};
      window.fetch=async(url,options)=>{
        window.__advisorRequest={url:String(url),body:JSON.parse(options.body),authorization:options.headers.authorization};
        return new Response(JSON.stringify({advisorRole:'auxiliary',authority:'retention-engine',autoSchedule:false,aiUsed:true,provider:'gemini',model:'gemini-3.6-flash',interventions:[{topicId:'direito civil com identificação extensa para validar responsividade total::pessoasnaturaiscomtextomuitolongosemespacosparavalidarquebradentrododialogosemqualqueroverflowvisual',diagnosisType:'persistent',severity:'high',recommendedAction:'focused_restudy',suggestedMinutes:30,method:'ReestudoFocalizadoComExplicacaoMuitoLongaSemEspacosParaValidarQueTodoTextoSeAjustaAoContainerSemCorte.',rationale:'Baixa retenção após múltiplas revisões indica dificuldade persistente sem alteração automática do cronograma.'}]}),{status:200,headers:{'content-type':'application/json'}});
      };
    });
    await page.addScriptTag({content:advisorSource});
    await expect(page.locator('#learningAdvisorOverlay')).toBeAttached();
    await expect(page.locator('#learningAdvisorPanel')).toHaveCount(0);

    await page.locator('#riskMetric').click();
    const overlay=page.locator('#learningAdvisorOverlay');
    const dialog=page.locator('#learningAdvisorDialog');
    await expect(overlay).toHaveClass(/is-open/);
    await expect(dialog).toContainText('Assuntos em risco');
    await expect(dialog).toContainText('Retenção pede revisão; não há revisão vencida no cronograma.');
    await expect(dialog).toContainText('Dificuldade persistente');
    await expect(dialog).not.toContainText('Fricção');
    await expect(dialog).toContainText('Analisar dificuldades com IA');

    const riskOverflow=await dialog.evaluate(root=>[...root.querySelectorAll('*')].filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>({tag:el.tagName,cls:el.className,text:(el.textContent||'').trim().slice(0,80),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth})));
    expect(riskOverflow).toEqual([]);

    await dialog.locator('#learningAdvisorAnalyze').click();
    await expect(dialog).toContainText('Intervenções para dificuldades persistentes');
    await expect(dialog.locator('.learning-advisor-card')).toHaveCount(1);
    await expect(dialog).toContainText('Reestudo focalizado');
    await expect(dialog).toContainText('Dificuldade persistente');
    await expect(dialog).not.toContainText('Fricção');

    const request=await page.evaluate(()=>window.__advisorRequest);
    expect(request.url).toBe('/api/ai/learning-diagnosis');
    expect(request.authorization).toBe('Bearer test-token');
    expect(request.body.topics).toHaveLength(1);
    expect(request.body.topics[0].frictionScore).toBeGreaterThanOrEqual(35);

    const interventionOverflow=await dialog.evaluate(root=>[...root.querySelectorAll('*')].filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>({tag:el.tagName,cls:el.className,text:(el.textContent||'').trim().slice(0,80),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth})));
    expect(interventionOverflow).toEqual([]);

    await dialog.locator('[data-learning-action="local-intervention"]').click();
    expect(await page.evaluate(()=>window.__localInterventionIndex)).toBe(0);
    await expect(overlay).not.toHaveClass(/is-open/);

    if(width<=700){
      await page.locator('#riskMetric').click();
      const buttonBox=await dialog.locator('#learningAdvisorAnalyze').boundingBox();
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
      expect(buttonBox.width).toBeGreaterThan(0);
    }
  });
}
