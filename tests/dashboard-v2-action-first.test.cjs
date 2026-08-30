const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const dashboard = read('public/js/dashboard-v2.js');
const navigation = read('public/js/ui/navigation.js');
const css = read('public/css/dashboard-v2.css');

assert.match(dashboard, /id = 'dashboardV2Shell'/, 'Dashboard 2.0 deve montar um shell próprio.');
assert.match(dashboard, /O que você deve estudar agora\?/, 'Dashboard deve ser orientado à próxima ação.');
assert.match(dashboard, /data-action=\"opportunity-study\"/, 'CTA principal deve reutilizar o fluxo adaptativo existente.');
assert.match(dashboard, /retentionDiagRisk/, 'Próxima melhor ação deve considerar risco de retenção.');
assert.match(dashboard, /retentionDiagOverdue/, 'Próxima melhor ação deve considerar revisões vencidas.');
assert.match(dashboard, /MutationObserver/, 'Dashboard deve acompanhar atualizações das métricas existentes sem duplicar fonte de verdade.');
assert.match(navigation, /ensureDashboardV2/, 'Navegação deve carregar o Dashboard 2.0 no bootstrap crítico.');
assert.match(navigation, /\.\/js\/dashboard-v2\.js/, 'Bootstrap deve apontar para o módulo do Dashboard 2.0.');
assert.match(css, /grid-template-columns:minmax\(0,1\.6fr\)/, 'Layout desktop deve priorizar o bloco de ação principal.');
assert.match(css, /@media \(max-width:700px\)/, 'Dashboard deve possuir contrato mobile dedicado.');

console.log('Dashboard 2.0 action-first contract OK');
