const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');

const auth=fs.readFileSync('public/js/auth-resilience-v2.js','utf8');
const runtime=fs.readFileSync('public/capacitor-runtime.js','utf8');

test('módulo de autenticação mantém Supabase como fonte de verdade para sessão',()=>{
  assert.match(auth,/typeof supabaseClient!=='undefined'/);
  assert.match(auth,/auth\.getSession\(\)/);
  assert.match(auth,/auth\.refreshSession\(\)/);
});

test('login explícito descarta somente sessão local antes de delegar ao fluxo canônico',()=>{
  assert.match(auth,/signOut\(\{scope:'local'\}\)/);
  assert.match(auth,/await clearLocalSession\(client\)/);
  assert.match(auth,/typeof handleLogin==='function'/);
  assert.match(auth,/const result=legacyLogin\(\)/);
  assert.doesNotMatch(auth,/signInWithPassword/);
  assert.doesNotMatch(auth,/location\.reload/);
  assert.doesNotMatch(auth,/localStorage\.clear\(/);
  assert.doesNotMatch(auth,/indexedDB\.deleteDatabase/);
});

test('credenciais nunca são persistidas pelo módulo',()=>{
  assert.doesNotMatch(auth,/setItem\([^\n]*(password|senha)/i);
  assert.doesNotMatch(auth,/console\.(log|info|warn|error)\([^\n]*(password|senha)/i);
});

test('link expirado de recovery é tratado sem apagar dados do usuário',()=>{
  assert.match(auth,/error_code/);
  assert.match(auth,/link de recuperação expirou ou já foi utilizado/i);
  assert.match(auth,/history\.replaceState/);
  assert.doesNotMatch(auth,/pending_sync_/);
  assert.doesNotMatch(auth,/concursos_metadata_/);
});

test('camada intercepta clique e Enter antes do dispatcher legado',()=>{
  assert.match(auth,/event\.stopImmediatePropagation\(\)/);
  assert.match(auth,/LOGIN_SELECTOR='\[data-action="auth-login"\]'/);
  assert.match(auth,/event\.key!=='Enter'/);
});

test('runtime carrega hotfix por caminho novo para escapar do cache legado',()=>{
  assert.match(runtime,/DOMContentLoaded', loadAuthResilience/);
  assert.match(runtime,/auth-resilience-v2\.js\?v=20260830/);
  assert.doesNotMatch(runtime,/auth-resilience\.js\?v=/);
  const loaderIndex=runtime.indexOf('loadAuthResilience');
  const nativeReturn=runtime.indexOf('if (!isNative) return');
  assert.ok(loaderIndex>=0&&nativeReturn>loaderIndex);
});

test('scripts modificados passam no parser do Node',()=>{
  for(const file of ['public/js/auth-resilience-v2.js','public/capacitor-runtime.js']){
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr||`${file} falhou no node --check`);
  }
});
