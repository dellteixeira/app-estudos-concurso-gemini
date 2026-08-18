#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const errors = [];
const ok = msg => console.log(`OK  ${msg}`);
const fail = msg => { errors.push(msg); console.error(`ERRO ${msg}`); };

let manifest;
try {
  manifest = JSON.parse(read('public/version.json'));
  ok('public/version.json é JSON válido');
} catch (error) {
  fail(`public/version.json inválido: ${error.message}`);
  manifest = { version: '' };
}
const version = String(manifest.version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`versão inválida em version.json: ${version || '(vazia)'}`);
else ok(`versão de release: ${version}`);

const expectedRootName = `ESTUDO_ADAPTATIVO_INTELIGENTE_V${version.replace(/\./g, '_')}`;
if (path.basename(root) !== expectedRootName) fail(`pasta raiz=${path.basename(root)} diverge do esperado=${expectedRootName}`);
else ok('nome da pasta raiz sincronizado com a versão');

const html = read('public/index.html');
const htmlVersion = html.match(/<meta name="app-version" content="([^"]+)">/)?.[1] || '';
const sw = read('public/sw.js');
const swVersion = sw.match(/const APP_VERSION = '([^']+)';/)?.[1] || '';
const worker = read('src/index.js');
const workerVersion = worker.match(/const APP_VERSION = "([^"]+)";/)?.[1] || '';

for (const [label, value] of [
  ['index.html meta app-version', htmlVersion],
  ['sw.js APP_VERSION', swVersion],
  ['src/index.js APP_VERSION', workerVersion],
]) {
  if (value !== version) fail(`${label}=${value || '(ausente)'} diverge de version.json=${version}`);
  else ok(`${label} sincronizado`);
}

if (/app-version-badge[^>]*>V\d+\.\d+\.\d+</.test(html)) fail('badge do cabeçalho contém versão hardcoded');
else ok('badge do cabeçalho não duplica versão');

if (/app(?:\.css|\.js)\?v=\d+\.\d+\.\d+|pwa-update\.js\?v=\d+\.\d+\.\d+/.test(html)) {
  fail('index.html contém versão duplicada em query string de assets centrais');
} else ok('assets centrais não duplicam versão em query string');

const pwa = read('public/pwa-update.js');
if (!/meta\[name="app-version"\]/.test(pwa)) fail('pwa-update.js não lê a versão em execução do meta app-version');
else ok('pwa-update.js lê a versão do HTML');
if (!/register\(swUrl, \{ updateViaCache: 'none' \}\)/.test(pwa)) fail('registro do Service Worker não força updateViaCache=none');
else ok('Service Worker registrado com updateViaCache=none');
if (!/sw\.js\?v=/.test(pwa)) fail('URL do Service Worker não é versionada');
else ok('URL do Service Worker é versionada');
if (!/cacheNames[\s\S]*startsWith\('estudo-adaptativo-'\)/.test(pwa)) fail('rotina de atualização não limpa caches antigos do app');
else ok('rotina de atualização limpa caches antigos');

if (!/CACHE_NAME = `\$\{CACHE_PREFIX\}v\$\{APP_VERSION\.replace/.test(sw)) fail('CACHE_NAME não deriva automaticamente de APP_VERSION');
else ok('CACHE_NAME deriva automaticamente da versão');
if (!/self\.skipWaiting\(\)/.test(sw)) fail('Service Worker não aceita ativação solicitada pelo usuário');
else ok('Service Worker suporta SKIP_WAITING');
if (!/self\.clients\.claim\(\)/.test(sw)) fail('Service Worker não reivindica clientes na ativação');
else ok('Service Worker usa clients.claim()');

const headers = read('public/_headers');
for (const route of ['/', '/index.html', '/app.js', '/app.css', '/pwa-update.js', '/sw.js', '/version.json']) {
  if (!headers.includes(`${route}\n`) && route !== '/') fail(`_headers não contém regra explícita para ${route}`);
}
if (!/Cache-Control: no-cache, no-store, must-revalidate/.test(headers)) fail('_headers não contém política no-store para assets críticos');
else ok('_headers contém política anti-cache para assets críticos');

const workerCore = worker.match(/CORE_NO_STORE_PATHS = new Set\(\[([^\]]+)\]\)/)?.[1] || '';
for (const route of ['/', '/index.html', '/sw.js', '/pwa-update.js', '/app.js', '/app.css', '/version.json']) {
  if (!workerCore.includes(`"${route}"`)) fail(`Cloudflare Worker não força no-store em ${route}`);
}
if (!errors.some(e => e.includes('Cloudflare Worker'))) ok('Cloudflare Worker cobre todos os assets críticos');

for (const rel of ['public/app.js', 'public/pwa-update.js', 'public/sw.js', 'src/index.js']) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, rel)], { stdio: 'pipe' });
    ok(`${rel} passou no node --check`);
  } catch (error) {
    fail(`${rel} possui erro de sintaxe`);
  }
}

for (const rel of ['public/manifest.json', 'wrangler.jsonc']) {
  try {
    const raw = read(rel).replace(/^\s*\/\/.*$/gm, '');
    JSON.parse(raw);
    ok(`${rel} é JSON válido`);
  } catch (error) {
    fail(`${rel} inválido: ${error.message}`);
  }
}


// V10.7.7 — Auditoria estrutural do bloco central de Retenção e Diagnóstico.
const retentionPanel = html.match(/<section class="retention-diagnostic-panel[\s\S]*?<\/section>/)?.[0] || '';
if (!retentionPanel) {
  fail('painel Retenção e Diagnóstico não encontrado no index.html');
} else {
  const requiredClasses = [
    'rd-center-v1077',
    'rd-exam-banner-v1077',
    'rd-exam-icon-v1077',
    'rd-exam-copy-v1077',
    'rd-exam-action-v1077',
    'rd-metrics-v1077',
    'rd-metric-card-v1077',
    'rd-metric-progress-v1077'
  ];
  for (const className of requiredClasses) {
    if (!retentionPanel.includes(className)) fail(`Retenção/Diagnóstico: classe isolada ${className} ausente`);
  }
  if (!errors.some(e => e.includes('classe isolada'))) ok('Retenção/Diagnóstico usa classes rd-* isoladas do CSS legado');

  const bannerPos = retentionPanel.indexOf('rd-exam-banner-v1077');
  const metricsPos = retentionPanel.indexOf('rd-metrics-v1077');
  if (bannerPos < 0 || metricsPos < 0 || bannerPos > metricsPos) fail('Retenção/Diagnóstico: faixa da prova não aparece antes das métricas no DOM');
  else ok('Retenção/Diagnóstico mantém faixa da prova acima das métricas');

  const metricCount = (retentionPanel.match(/rd-metric-card-v1077/g) || []).length;
  if (metricCount !== 4) fail(`Retenção/Diagnóstico: esperado 4 cards isolados, encontrados ${metricCount}`);
  else ok('Retenção/Diagnóstico contém exatamente 4 cards de métricas');

  if (/retention-center-column|retention-metric-grid|exam-phase-strip/.test(retentionPanel)) {
    fail('Retenção/Diagnóstico: bloco central ainda reutiliza classes legadas conflitantes');
  } else ok('Retenção/Diagnóstico central não reutiliza classes legadas conflitantes');
}

const appCss = read('public/app.css');
if (!/#retentionDiagnosticPanel\.retention-dashboard-v1072 \.rd-center-v1077/.test(appCss)) fail('CSS isolado rd-center-v1077 ausente');
else ok('CSS isolado rd-center-v1077 presente');
if (!/#retentionDiagnosticPanel \.rd-exam-banner-v1077[\s\S]*?position:\s*relative\s*!important/.test(appCss)) fail('faixa da prova isolada não fixa position:relative');
else ok('faixa da prova usa fluxo próprio, sem sobreposição absoluta');
if (!/#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,1fr\)\)/.test(appCss)) fail('grade desktop das métricas não possui quatro colunas');
else ok('grade desktop das métricas possui quatro colunas');


// V10.8.0 — Auditoria do editor rico de anotações.
if (!/class="note-format-toolbar"/.test(html)) fail('Notas: barra de formatação ausente no modal');
else ok('Notas: barra de formatação presente');
if (!/id="inputNotaConteudo"[^>]*contenteditable="true"/.test(html)) fail('Notas: editor contenteditable ausente');
else ok('Notas: editor contenteditable presente');
for (const cmd of ['bold','italic','underline']) {
  if (!html.includes(`data-note-command="${cmd}"`)) fail(`Notas: comando ${cmd} ausente`);
}
if (!html.includes('id="noteFontSizeSelect"')) fail('Notas: seletor de tamanho da fonte ausente');
else ok('Notas: seletor de tamanho da fonte presente');
const appJsRich = read('public/app.js');
for (const fn of ['sanitizeNoteHtml','formatNoteText','setNoteFontSize','noteHtmlToPlainText','getNoteStoredHtml']) {
  if (!appJsRich.includes(`function ${fn}(`)) fail(`Notas: função ${fn} ausente`);
}
if (!/formato:'html'/.test(appJsRich) || !/conteudoTexto/.test(appJsRich)) fail('Notas: persistência rica compatível não foi encontrada');
else ok('Notas: persistência HTML + texto de busca configurada');
if (!/const allowed = new Set\(\['B','STRONG','I','EM','U','BR','DIV','P','SPAN','FONT'\]\)/.test(appJsRich)) fail('Notas: whitelist de sanitização ausente ou alterada');
else ok('Notas: whitelist de sanitização presente');
const cssRich = read('public/app.css');
if (!/\.note-format-toolbar/.test(cssRich) || !/\.note-rich-editor/.test(cssRich)) fail('Notas: estilos do editor rico ausentes');
else ok('Notas: estilos do editor rico presentes');


// V10.8.1 — Auditoria da navegação orientada ao objetivo.
const appJs = read('public/app.js');
const navTargets = [
  ['tab-calendario', 'calendarWorkspace'],
  ['tab-flashcards', 'flashcardsWorkspace'],
  ['tab-anotacoes', 'notesWorkspace']
];
for (const [tabId, workspaceId] of navTargets) {
  if (!html.includes(`id="${workspaceId}"`)) fail(`Navegação direta: destino ${workspaceId} ausente no HTML`);
  if (!appJs.includes(`'${tabId}': '${workspaceId}'`)) fail(`Navegação direta: mapeamento ${tabId} → ${workspaceId} ausente`);
}
if (!errors.some(e => e.includes('Navegação direta:'))) ok('Navegação direta possui os três destinos de trabalho');
if (!/function focusTabWorkspace\(/.test(appJs) || !/function scheduleTabWorkspaceFocus\(/.test(appJs)) fail('Navegação direta: rotina de posicionamento da viewport ausente');
else ok('Navegação direta possui rotina de posicionamento da viewport');
if (/function mobileSwitchTab[\s\S]*?window\.scrollTo\(\{ top: 0/.test(appJs)) fail('Navegação mobile ainda força retorno ao topo da página');
else ok('Navegação mobile não retorna mais ao topo da página');
const desktopOrder = [
  html.indexOf("switchTab('tab-edital'"),
  html.indexOf("switchTab('tab-calendario'"),
  html.indexOf("switchTab('tab-flashcards'"),
  html.indexOf("switchTab('tab-anotacoes'")
];
if (desktopOrder.some(v => v < 0) || desktopOrder.some((v,i,a) => i && v <= a[i-1])) fail('Ordem das abas desktop não está alinhada a Edital → Cronograma → Flashcards → Anotações');
else ok('Ordem das abas desktop alinhada à navegação mobile');

// V10.8.2 — Exclusão granular e ordem canônica por prioridade.
const editalHtml = html.match(/<div[^>]+id="tab-edital"[\s\S]*?<\/div>\s*<div[^>]+id="tab-/)?.[0] || html;
if (!/onclick="excluirAssuntoEspecifico\(\)"/.test(editalHtml)) fail('Edital não expõe botão Excluir Assunto');
else ok('Edital expõe botão Excluir Assunto');
if (!/async function excluirAssuntoEspecifico\(\)/.test(appJs)) fail('função excluirAssuntoEspecifico ausente');
else ok('exclusão granular de assunto implementada');
for (const helper of ['getCanonicalMateriaOrder','getCanonicalAssuntosForMateria','sortMateriaNamesByCanonicalOrder','sortAssuntoNamesByCanonicalOrder']) {
  if (!new RegExp(`function ${helper}\\(`).test(appJs)) fail(`helper canônico ${helper} ausente`);
}
if (!errors.some(e => e.includes('helper canônico'))) ok('helpers canônicos de ordenação por prioridade presentes');
if (!/sortMateriaNamesByCanonicalOrder\(Object\.keys\(deckHierarchy\)\)/.test(appJs)) fail('pastas de flashcards não usam ordem canônica de matérias');
else ok('pastas de flashcards usam ordem canônica');
if (!/const assuntos = getCanonicalAssuntosForMateria\(materia\);/.test(appJs)) fail('anotações não usam ordem canônica de assuntos');
else ok('anotações usam ordem canônica de assuntos');
if (!/getCanonicalMateriaOrder\(\)\.forEach\(mat =>/.test(appJs)) fail('seletor de flashcards não usa ordem canônica de matérias');
else ok('seletor de flashcards usa ordem canônica');


// V10.9.0 — Auditoria de confiabilidade: timer, progresso e retenção.
if (!/let timerEndAtMs = null;/.test(appJs)) fail('Timer: deadline absoluto ausente');
if (!/timerEndAtMs = Date\.now\(\) \+/.test(appJs)) fail('Timer: deadline não deriva de Date.now()');
if (!/function syncTimerFromClock\(\)/.test(appJs)) fail('Timer: reconciliação com relógio real ausente');
if (!/visibilitychange/.test(appJs) || !/pageshow/.test(appJs)) fail('Timer: reconciliação ao retornar do background ausente');
if (/function startTimer\(\)[\s\S]*?timeLeft--/.test(appJs)) fail('Timer: startTimer ainda depende de decremento por tick');
else ok('Timer usa relógio absoluto e não decremento por setInterval');

if (!/function getQuestionProgressFraction\(/.test(appJs) || !/function getStudyProgressBreakdown\(/.test(appJs)) fail('Progresso: métrica calibrada de questões ausente');
else ok('Progresso usa volume + desempenho em questões');
if (!/volumeFraction = 0\.80/.test(appJs) || !/accuracy >= 75/.test(appJs)) fail('Progresso: faixas de volume/desempenho não encontradas');
if (!/const progressBreakdown = getStudyProgressBreakdown\(topics\);/.test(appJs)) fail('Overview: não reutiliza a métrica calibrada');
else ok('Overview reutiliza a métrica calibrada');
if (!/sortMateriaNamesByCanonicalOrder\(Object\.keys\(counts\)\)/.test(appJs)) fail('Gráfico: matérias não seguem ordem canônica');
else ok('Gráfico de progresso segue ordem canônica');

if (!/const activeTopicKeys = new Set\(\(editalItems \|\| \[\]\)\.map/.test(appJs)) fail('Retenção: filtro por assuntos ativos do edital ausente');
else ok('Retenção ignora assuntos removidos do edital no diagnóstico ativo');
if (!/function hasRetentionMasteryEvidence\(/.test(appJs)) fail('Retenção: regra de evidência de domínio ausente');
if (!/qTotal >= 10/.test(appJs) || !/qAccuracy >= 75/.test(appJs) || !/positiveRecallRatings >= 2/.test(appJs)) fail('Retenção: domínio não exige evidência objetiva/subjetiva suficiente');
else ok('Assunto dominado exige evidência suficiente');

if (errors.length) {
  console.error(`\nAUDITORIA REPROVADA: ${errors.length} problema(s).`);
  process.exit(1);
}
console.log('\nAUDITORIA APROVADA: release consistente para empacotamento.');
