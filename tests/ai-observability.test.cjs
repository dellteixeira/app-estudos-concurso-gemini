const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const test=require('node:test');
const {pathToFileURL}=require('node:url');

const root=path.resolve(__dirname,'..');
const modulePath=path.join(root,'src','ai-observability.js');
const diagnosisPath=path.join(root,'src','learning-diagnosis.js');

async function loadModule(){
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}-${Math.random()}`);
}

test('AI observability expõe apenas campos operacionais permitidos',async()=>{
  const {buildAiObservation}=await loadModule();
  const event=buildAiObservation({
    feature:'learning-advisor',provider:'gemini',model:'gemini-3.6-flash',outcome:'success',fallback:'none',latencyMs:913,itemCount:4,
    prompt:'SEGREDO',response:'CONTEUDO',materia:'Direito Penal',assunto:'Homicídio',userId:'abc',email:'x@y.z'
  });
  assert.deepEqual(Object.keys(event).sort(),['attempt','errorClass','fallback','feature','itemCount','latencyMs','model','outcome','provider','schemaVersion'].sort());
  const serialized=JSON.stringify(event);
  for(const forbidden of ['SEGREDO','CONTEUDO','Direito Penal','Homicídio','abc','x@y.z'])assert.equal(serialized.includes(forbidden),false);
});

test('AI observability normaliza valores arbitrários e classifica erros',async()=>{
  const {buildAiObservation,classifyAiError}=await loadModule();
  const event=buildAiObservation({feature:'custom',provider:'other',model:'modelo com espaço',outcome:'weird',fallback:'raw',latencyMs:999999,attempt:99,itemCount:999});
  assert.equal(event.feature,'unknown');
  assert.equal(event.provider,'unknown');
  assert.equal(event.outcome,'error');
  assert.equal(event.fallback,'none');
  assert.equal(event.latencyMs,120000);
  assert.equal(event.attempt,8);
  assert.equal(event.itemCount,100);
  assert.equal(classifyAiError(Object.assign(new Error('aborted'),{name:'AbortError'})),'timeout');
  assert.equal(classifyAiError(new Error('Gemini HTTP 429')),'rate_limited');
  assert.equal(classifyAiError(new Error('Resposta Gemini inválida')),'invalid_response');
});

test('Learning Advisor usa observabilidade comum sem logar payload sensível',()=>{
  const source=fs.readFileSync(diagnosisPath,'utf8');
  assert.match(source,/createAiObservationTimer\(\{feature:'learning-advisor'/);
  assert.match(source,/observability:observation/);
  assert.match(source,/console\.warn\('Learning Advisor Gemini fallback:',errorClass\)/);
  assert.doesNotMatch(source,/console\.(?:log|info|warn|error)\([^\n]*(?:topics|body|contest|interventions)/i);
});
