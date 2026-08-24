import fs from 'node:fs';

const uiPath='public/js/app-ui.js';
const corePath='public/js/app-core.js';
const budgetPath='security/runtime-style-debt.json';
const testPath='tests/runtime-style-debt-batch8.test.cjs';
const workflowPath='.github/workflows/quality-check.yml';

let ui=fs.readFileSync(uiPath,'utf8');
let core=fs.readFileSync(corePath,'utf8');
let test=fs.readFileSync(testPath,'utf8');

ui=ui.replace('<span class="retention-risk-progress" aria-hidden="true"><span style="width:${retention}%"></span></span>','<span class="retention-risk-progress" aria-hidden="true"><span class="${getProgressWidthClass(retention)}"></span></span>');
fs.writeFileSync(uiPath,ui,'utf8');

const count=(s,re)=>(s.match(re)||[]).length;
const budget={
  batch:8,
  policy:'UI/non-PDF runtime styles migrated to semantic/bounded classes. Remaining direct style geometry is explicitly isolated and must not grow.',
  migratedDisplay:{core:55,ui:0},
  remaining:{
    coreStyleDisplay:count(core,/\.style\.display\b/g),
    uiStyleDisplay:count(ui,/\.style\.display\b/g),
    coreTemplateStyle:count(core,/style=\\?["']/g),
    uiTemplateStyle:count(ui,/style=\\?["']/g),
    coreStyleWidth:count(core,/\.style\.width\b/g),
    uiStyleWidth:count(ui,/\.style\.width\b/g),
    coreStyleLeft:count(core,/\.style\.left\b/g),
    coreStyleTop:count(core,/\.style\.top\b/g),
    coreSetProperty:count(core,/\.style\.setProperty\b/g),
    uiSetProperty:count(ui,/\.style\.setProperty\b/g)
  },
  geometryExceptions:[
    {module:'public/js/app-core.js',feature:'materia drag ghost',properties:['width','left','top'],reason:'pointer-position geometry; isolated from ordinary UI state and presentation'}
  ]
};
fs.writeFileSync(budgetPath,JSON.stringify(budget,null,2)+'\n','utf8');

if(!test.includes("final budget keeps generated UI style attributes at zero")){
  test += `\ntest('final budget keeps generated UI style attributes at zero',()=>{\n  const finalBudget=JSON.parse(fs.readFileSync('security/runtime-style-debt.json','utf8'));\n  assert.equal(finalBudget.remaining.coreStyleDisplay,0);\n  assert.equal(finalBudget.remaining.uiStyleDisplay,0);\n  assert.equal(finalBudget.remaining.coreTemplateStyle,0);\n  assert.equal(finalBudget.remaining.uiTemplateStyle,0);\n  assert.equal(finalBudget.remaining.coreSetProperty,0);\n  assert.equal(finalBudget.remaining.uiSetProperty,0);\n  assert.equal(finalBudget.migratedDisplay.core,55);\n  assert.deepEqual(finalBudget.geometryExceptions[0].properties,['width','left','top']);\n});\n`;
  fs.writeFileSync(testPath,test,'utf8');
}

if(budget.remaining.coreStyleDisplay!==0||budget.remaining.uiStyleDisplay!==0||budget.remaining.coreTemplateStyle!==0||budget.remaining.uiTemplateStyle!==0){
  throw new Error('runtime style debt final gate failed: '+JSON.stringify(budget.remaining));
}

const canonical=`name: Quality Check\n\non:\n  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  test-and-audit:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 30\n    steps:\n      - name: Checkout\n        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n\n      - name: Setup Node\n        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4\n        with:\n          node-version: '22.23.2'\n\n      - name: Syntax check\n        run: node --check src/index.js\n\n      - name: Automated tests\n        run: npm test\n\n      - name: Structural audit\n        env:\n          AUDIT_ALLOW_ANY_ROOT: '1'\n        run: npm run audit\n\n      - name: Install Playwright test runner\n        run: npm install --no-save --package-lock=false @playwright/test@1.55.0\n\n      - name: Install Playwright browsers\n        run: npx playwright install --with-deps chromium firefox webkit\n\n      - name: Browser responsive audit\n        run: npm run test:browser\n\n      - name: Upload Playwright report and screenshots\n        if: always()\n        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\n        with:\n          name: playwright-responsive-audit-\${{ github.run_id }}\n          path: |\n            playwright-report/\n            test-results/\n          if-no-files-found: ignore\n          retention-days: 14\n`;
fs.writeFileSync(workflowPath,canonical,'utf8');

for(const p of ['scripts/migrate-runtime-style-debt.mjs','scripts/migrate-runtime-style-debt-pass2.mjs','scripts/finalize-runtime-style-debt-batch8.mjs']){
  try{fs.unlinkSync(p)}catch(_){ }
}

console.log(JSON.stringify(budget,null,2));
