const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');

const auth=fs.readFileSync('public/js/auth-resilience-v4.js','utf8');
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

test('sessão autenticada inicializa explicitamente o estado canônico e o painel',()=>{
  assert.match(auth,/currentUser=user/);
  assert.match(auth,/typeof loadData!=='function'/);
  assert.match(auth,/await loadData\(\)/);
  assert.match(auth,/document\.getElementById\('auth-screen'\)/);
  assert.match(auth,/document\.getElementById\('app-dashboard'\)/);
  assert.match(auth,/setVisible\(auth,false\)/);
  assert.match(auth,/setVisible\(dash,true,'block'\)/);
  assert.match(auth,/auth-resilience-dashboard-ready/);
});

test('login e boot usam o mesmo bootstrap do painel, sem depender de reload',()=>{
  assert.match(auth,/completeAppSession\(data\.session,'supabase-sign-in'\)/);
  assert.match(auth,/completeAppSession\(session,'supabase-session'\)/);
  assert.doesNotMatch(auth,/location\.reload/);
  assert.doesNotMatch(auth,/RECOVERY_GUARD/);
  assert.doesNotMatch(auth,/waitForAppTransition/);
});

test('login limpa somente a sessão local e preserva dados do usuário',()=>{
  assert.match(auth,/signOut\(\{scope:'local'\}\)/);
  assert.match(auth,/await clearLocalSession\(client\)/);
  assert.doesNotMatch(auth,/localStorage\.clear\(/);
  assert.doesNotMatch(auth,/indexedDB\.deleteDatabase/);
  assert.doesNotMatch(auth,/pending_sync_/);
  assert.doesNotMatch(auth,/concursos_metadata_/);
});

test('credenciais nunca são persistidas nem registradas',()=>{
  assert.doesNotMatch(auth,/setItem\([^\n]*(password|senha)/i);
  assert.doesNotMatch(auth,/console\.(log|info|warn|error)\([^\n]*(password|senha)/i);
});

test('runtime usa caminho físico v4 para escapar do cache anterior',()=>{
  assert.match(runtime,/DOMContentLoaded', loadAuthResilience/);
  assert.match(runtime,/auth-resilience-v4\.js\?v=20260830-2/);
  assert.doesNotMatch(runtime,/auth-resilience-v3\.js\?v=/);
});

test('revisão Android mobile.5 está coerente e preserva dependências canônicas',()=>{
  assert.equal(release.android.revision,5);
  assert.equal(release.android.versionCode,106425);
  assert.match(gradle,/versionCode 106425/);
  assert.match(gradle,/versionName "10\.64\.19-mobile\.5"/);
  assert.match(gradle,/androidx\.coordinatorlayout:coordinatorlayout:\$androidxCoordinatorLayoutVersion/);
  assert.match(gradle,/androidx\.test\.espresso:espresso-core:\$androidxEspressoCoreVersion/);
});

test('scripts modificados passam no parser do Node',()=>{
  for(const file of ['public/js/auth-resilience-v4.js','public/capacitor-runtime.js']){
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr||`${file} falhou no node --check`);
  }
});
