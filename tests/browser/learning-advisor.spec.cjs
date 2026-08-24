const { test, expect } = require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const advisorSource=fs.readFileSync(path.join(__dirname,'../../public/js/learning-advisor.js'),'utf8');
const advisorCss=fs.readFileSync(path.join(__dirname,'../../public/css/learning-advisor.css'),'utf8');

const VIEWPORTS=[320,390,560,1024,1440];

async function expectNoTextOverflow(page,rootSelector){
  const failures=await page.locator(rootSelector).evaluate(root=>{
    const isVisible=el=>{
      const style=getComputedStyle(el);
      const rect=el.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
    };
    const nodes=[root,...root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,strong,label,button,a')];
    return nodes.filter(isVisible).flatMap(el=>{
      const rect=el.getBoundingClientRect();
      const parent=el.parentElement?.getBoundingClientRect();
      const style=getComputedStyle(el);
      const horizontalOverflow=el.scrollWidth>el.clientWidth+1;
      const outsideParent=parent?(rect.left<parent.left-1||rect.right>parent.right+1):false;
      const clippedText=(style.overflowX==='hidden'||style.overflowX==='clip')&&horizontalOverflow;
      return horizontalOverflow||outsideParent||clippedText?[{
        tag:el.tagName,
        text:(el.textContent||'').trim().slice(0,120),
        clientWidth:el.clientWidth,
        scrollWidth:el.scrollWidth,
        left:rect.left,
        right:rect.right,
        parentLeft:parent?.left,
        parentRight:parent?.right,
        overflowX:style.overflowX,
        whiteSpace:style.whiteSpace
      }]:[];
    });
  });
  expect(failures,`Text overflow detected: ${JSON.stringify(failures,null,2)}`).toEqual([]);
}

for(const width of VIEWPORTS){
  test(`Learning Advisor remains consultive, full-width and text-safe at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.setContent(`<!doctype html><html><head><style>
      *{box-sizing:border-box}
      html,body{margin:0;max-width:100%;overflow-x:hidden}
      body{padding:${width<=390?'8px':'16px'};background:#061321;color:#eef6ff;font-family:Arial,sans-serif}
      #retentionDiagnosticPanel{width:100%;max-width:1180px;margin:0 auto;padding:${width<=390?'8px':'16px'};border:1px solid #29445d}
      .btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid #49647c;border-radius:9px;padding:8px 12px;background:#17334b;color:#fff;font:inherit}
      ${advisorCss}
    </style></head><body><section id="retentionDiagnosticPanel"><div id="retentionDiagnosticRiskList"></div></section></body></html>`);
    await page.evaluate(()=>{
      window.currentConcurso='Concurso Teste';
      window.getStudyTopicKey=(m,a)=>`${m}::${a}`.toLowerCase();
      window.editalItems=[{id:'t1',materia:'Direito Penal com denominação deliberadamente extensa para validar adaptação',assunto:'Concurso de pessoas e responsabilidade penal em uma descrição longa que precisa permanecer integralmente visível no respectivo container',prioridade:1,assunto_prioridade:1,teoria:true,questoes:true}];
      window.retentionDiagnosticRows=[{retention:38,questionAccuracy:42,state:{key:'direito penal com denominação deliberadamente extensa para validar adaptação::concurso de pessoas e responsabilidade penal em uma descrição longa que precisa permanecer integralmente visível no respectivo container',retention:38,difficulty:8,reviewCount:4,lapseCount:2,sessionCount:7,totalMinutes:110,lastRating:'hard',ratingCounts:{hard:3},questionStats:{lastAccuracy:42,averageAccuracy:47,confidence:.7}}}];
      window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}};
      window.openLayeredReviewModal=index=>{window.__localInterventionIndex=index};
      window.fetch=async(url,options)=>{
        window.__advisorRequest={url:String(url),body:JSON.parse(options.body),authorization:options.headers.authorization};
        return new Response(JSON.stringify({advisorRole:'auxiliary',authority:'retention-engine',autoSchedule:false,aiUsed:true,provider:'gemini',model:'gemini-3.6-flash',interventions:[{topicId:'direito penal com denominação deliberadamente extensa para validar adaptação::concurso de pessoas e responsabilidade penal em uma descrição longa que precisa permanecer integralmente visível no respectivo container',diagnosisType:'persistent',severity:'high',recommendedAction:'focused_restudy',suggestedMinutes:30,method:'Reestudo focalizado seguido de questões comentadas, comparação de alternativas e nova medição de retenção sem alterar automaticamente o cronograma.',rationale:'Baixa retenção após múltiplas revisões indica dificuldade persistente e exige uma explicação suficientemente longa para testar quebra de linha e preservação integral do conteúdo.'}]}),{status:200,headers:{'content-type':'application/json'}});
      };
    });
    await page.addScriptTag({content:advisorSource});

    const panel=page.locator('#learningAdvisorPanel');
    const parent=page.locator('#retentionDiagnosticPanel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('IA auxiliar');
    await expect(panel).toContainText('Retenção continua sendo a autoridade');

    const dimensions=await page.evaluate(()=>{
      const panel=document.getElementById('learningAdvisorPanel').getBoundingClientRect();
      const parent=document.getElementById('retentionDiagnosticPanel').getBoundingClientRect();
      const button=document.getElementById('learningAdvisorAnalyze').getBoundingClientRect();
      const head=getComputedStyle(document.querySelector('.learning-advisor-head'));
      return {panelWidth:panel.width,parentInnerWidth:parent.width-parseFloat(getComputedStyle(document.getElementById('retentionDiagnosticPanel')).paddingLeft)-parseFloat(getComputedStyle(document.getElementById('retentionDiagnosticPanel')).paddingRight),buttonHeight:button.height,headColumns:head.gridTemplateColumns};
    });
    expect(Math.abs(dimensions.panelWidth-dimensions.parentInnerWidth)).toBeLessThanOrEqual(2);
    if(width<=560)expect(dimensions.buttonHeight).toBeGreaterThanOrEqual(44);

    await expectNoTextOverflow(page,'#learningAdvisorPanel');

    await panel.locator('#learningAdvisorAnalyze').click();
    await expect(panel.locator('.learning-advisor-card')).toHaveCount(1);
    await expect(panel).toContainText('Dificuldade persistente');
    await expect(panel).toContainText('Reestudo focalizado');
    await expectNoTextOverflow(page,'#learningAdvisorPanel');

    const request=await page.evaluate(()=>window.__advisorRequest);
    expect(request.url).toBe('/api/ai/learning-diagnosis');
    expect(request.authorization).toBe('Bearer test-token');
    expect(request.body.topics).toHaveLength(1);
    expect(request.body.topics[0].frictionScore).toBeGreaterThanOrEqual(35);
    expect(await page.evaluate(()=>window.__localInterventionIndex)).toBeUndefined();

    await panel.locator('[data-learning-action="local-intervention"]').click();
    expect(await page.evaluate(()=>window.__localInterventionIndex)).toBe(0);

    const [box,parentBox]=await Promise.all([panel.boundingBox(),parent.boundingBox()]);
    expect(box.x).toBeGreaterThanOrEqual(parentBox.x-1);
    expect(box.x+box.width).toBeLessThanOrEqual(parentBox.x+parentBox.width+1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width+1);
  });
}
