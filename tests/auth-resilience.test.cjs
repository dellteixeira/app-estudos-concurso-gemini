const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');

const auth=fs.readFileSync('public/js/auth-resilience-v3.js','utf8');
const runtime=fs.readFileSync('public/capacitor-runtime.js','utf8');
const release=JSON.parse(fs.readFileSync('config/release-contract.json','utf8'));
const gradle=fs.readFileSync('android/app/build.gradle','utf8');

test('módulo usa Supabase como fonte de verdade e não depende de handleLogin global',()=>{
  assert.match(auth,/typeof supabaseClient!=='undefined'/);
  assert.match(auth,/auth\.getSession\(\)/);
  assert.match(auth,/auth\.refreshSession\(\)/);
  assert.match(auth,/auth\.signInWithPassword\(\{email,password\}\)/);
  assert.doesNotMatch(auth,/handleLogin/);
});

test('login limpa somente a sessão local e preserva dados do usuário',()=>{
  assert.match(auth,/signOut\(\{scope:'local'\}\)/);
  assert.match(auth,/await clearLocalSession\(client\)/);
  assert.doesNotMatch(auth,/localStorage\.clear\(/);
  assert.doesNotMatch(auth,/indexedDB\.deleteDatabase/);
  assert.doesNotMatch(auth,/pending_sync_/);
  assert.doesNotMatch(auth,/concursos_metadata_/);
});

test('pós-login aguarda a transição do app antes de qualquer recarga de recuperação',()=>{
  assert.match(auth,/waitForAppTransition\(3200\)/);
  assert.match(auth,/if\(transitioned\)/);
  assert.match(auth,/recoverTransition\(client\)/);
  assert.match(auth,/RECOVERY_GUARD/);
  assert.match(auth,/global\.location\.reload\(\)/);
  assert.ok(auth.indexOf('waitForAppTransition(3200)') < auth.indexOf('return await recoverTransition(client)'));
});

test('boot de sessão persistida também evita loop de reload',()=>{
  assert.match(auth,/sessionStorage\.getItem\(RECOVERY_GUARD\)==='1'/);
  assert.match(auth,/waitForAppTransition\(1800\)/);
  assert.match(auth,/sessionStorage\.removeItem\(RECOVERY_GUARD\)/);
});

test('credenciais nunca são persistidas nem registradas',()=>{
  assert.doesNotMatch(auth,/setItem\([^\n]*(password|senha)/i);
  assert.doesNotMatch(auth,/console\.(log|info|warn|error)\([^\n]*(password|senha)/i);
});

test('runtime usa caminho físico v3 para escapar do cache anterior',()=>{
  assert.match(runtime,/DOMContentLoaded', loadAuthResilience/);
  assert.match(runtime,/auth-resilience-v3\.js\?v=20260830/);
  assert.doesNotMatch(runtime,/auth-resilience-v2\.js\?v=/);
});

test('revisão Android mobile.4 está coerente',()=>{
  assert.equal(release.android.revision,4);
  assert.equal(release.android.versionCode,106424);
  assert.match(gradle,/versionCode 106424/);
  assert.match(gradle,/versionName "10\.64\.19-mobile\.4"/);
  assert.match(gradle,/androidx\.coordinatorlayout:coordinatorlayout:\$androidxCoordinatorLayoutVersion/);
  assert.match(gradle,/androidx\.test\.espresso:espresso-core:\$androidxEspressoCoreVersion/);
});

test('scripts modificados passam no parser do Node',()=>{
  for(const file of ['public/js/auth-resilience-v3.js','public/capacitor-runtime.js']){
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr||`${file} falhou no node --check`);
  }
});
