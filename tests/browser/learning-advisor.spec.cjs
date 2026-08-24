const { test, expect } = require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const advisorSource=fs.readFileSync(path.join(__dirname,'../../public/js/learning-advisor.js'),'utf8');
const advisorCss=fs.readFileSync(path.join(__dirname,'../../public/css/learning-advisor.css'),'utf8');

for(const width of [390,1024]){
  test(`Learning Advisor remains consultive and responsive at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.setContent(`<!doctype html><html><head><style>${advisorCss}</style></head><body><section id="retentionDiagnosticPanel"><div id="retentionDiagnosticRiskList"></div></section></body></html>`);
    await page.evaluate(()=>{
      window.currentConcurso='Concurso Teste';
      window.getStudyTopicKey=(m,a)=>`${m}::${a}`.toLowerCase();
      window.editalItems=[{id:'t1',materia:'Direito Penal',assunto:'Concurso de pessoas',prioridade:1,assunto_prioridade:1,teoria:true,questoes:true}];
      window.retentionDiagnosticRows=[{retention:38,questionAccuracy:42,state:{key:'direito penal::concurso de pessoas',retention:38,difficulty:8,reviewCount:4,lapseCount:2,sessionCount:7,totalMinutes:110,lastRating:'hard',ratingCounts:{hard:3},questionStats:{lastAccuracy:42,averageAccuracy:47,confidence:.7}}}];
      window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}};
      window.openLayeredReviewModal=index=>{window.__localInterventionIndex=index};
      window.fetch=async(url,options)=>{
        window.__advisorRequest={url:String(url),body:JSON.parse(options.body),authorization:options.headers.authorization};
        return new Response(JSON.stringify({advisorRole:'auxiliary',authority:'retention-engine',autoSchedule:false,aiUsed:true,provider:'gemini',model:'gemini-3.6-flash',interventions:[{topicId:'direito penal::concurso de pessoas',diagnosisType:'persistent',severity:'high',recommendedAction:'focused_restudy',suggestedMinutes:30,method:'Reestudo focalizado seguido de questões.',rationale:'Baixa retenção após múltiplas revisões indica dificuldade persistente.'}]}),{status:200,headers:{'content-type':'application/json'}});
      };
    });
    await page.addScriptTag({content:advisorSource});
    const panel=page.locator('#learningAdvisorPanel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('IA auxiliar');
    await expect(panel).toContainText('Retenção continua sendo a autoridade');
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
    const box=await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width+1);
  });
}
