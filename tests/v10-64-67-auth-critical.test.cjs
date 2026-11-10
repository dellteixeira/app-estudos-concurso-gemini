const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const auth=fs.readFileSync('public/js/app-auth.js','utf8');
const pwa=fs.readFileSync('public/js/app-pwa.js','utf8');
const ai=fs.readFileSync('public/js/app-ai.js','utf8');
const assets=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');

test('autenticacao critica carrega antes do app-pwa',()=>{
  const corePos=html.indexOf('./js/app-core.js');
  const authPos=html.indexOf('./js/app-auth.js');
  const pwaPos=html.indexOf('./js/app-pwa.js');
  assert.ok(corePos>=0&&authPos>corePos&&pwaPos>authPos);
});

test('login nao depende mais do modulo lazy de IA',()=>{
  assert.match(auth,/async function handleLogin/);
  assert.match(auth,/signInWithPassword/);
  assert.match(pwa,/window\.handleLogin = handleLogin/);
  assert.doesNotMatch(html,/src="\.\/js\/app-ai\.js"/);
});

test('sessao existente e restaurada no bootstrap critico',()=>{
  assert.match(auth,/async function checkAuthAndSync/);
  assert.match(auth,/supabaseClient\.auth\.getSession\(\)/);
  assert.match(auth,/DOMContentLoaded/);
});

test('recuperacao de senha usa fluxo oficial do Supabase',()=>{
  assert.match(html,/Esqueci minha senha/);
  assert.match(auth,/resetPasswordForEmail/);
  assert.match(auth,/event === 'PASSWORD_RECOVERY'/);
  assert.match(auth,/updateUser\(\{ password \}\)/);
});

test('senha digitada nao e trimada',()=>{
  assert.match(auth,/document\.getElementById\('password'\)\?\.value/);
  assert.doesNotMatch(auth,/getAuthFieldValue\('password'\)/);
});

test('modulo de autenticacao integra shell offline',()=>{
  assert.ok(assets.criticalAppShell.includes('/js/app-auth.js'));
  assert.match(sw,/\.\/js\/app-auth\.js/);
});

test('acoes pesadas de conta continuam lazy',()=>{
  assert.match(pwa,/lazyAppAiCall\('openAccountModal'/);
  assert.match(pwa,/lazyAppAiCall\('changeAccountPassword'/);
  assert.match(ai,/openAccountModal/);
  assert.match(ai,/changeAccountPassword/);
});
