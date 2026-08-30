import fs from 'node:fs';

const mode = JSON.parse(fs.readFileSync('config/ci-mode.json','utf8'));
const quality = fs.readFileSync('.github/workflows/quality-check.yml','utf8');
const secrets = fs.readFileSync('.github/workflows/security-secrets-audit.yml','utf8');
const android = fs.readFileSync('.github/workflows/android-ci.yml','utf8');

const failures=[];
if(!['normal','degraded'].includes(mode.mode)) failures.push(`modo inválido: ${mode.mode}`);
if(typeof mode.productionDeployAllowed!=='boolean') failures.push('productionDeployAllowed deve ser boolean');

const hasPullRequest = source => /\n\s*pull_request\s*:/.test(source);
if(mode.mode==='degraded'){
  if(mode.productionDeployAllowed!==false) failures.push('modo degradado deve bloquear deploy de produção');
  if(hasPullRequest(quality)) failures.push('Quality Check não pode disparar em PR no modo degradado');
  if(hasPullRequest(secrets)) failures.push('Security Secrets Audit não pode disparar em PR no modo degradado');
  if(hasPullRequest(android)) failures.push('Android Check não pode disparar em PR no modo degradado');
}
if(mode.mode==='normal'){
  if(mode.productionDeployAllowed!==true) failures.push('modo normal deve permitir deploy de produção');
  if(!hasPullRequest(quality)) failures.push('Quality Check deve voltar a disparar em PR no modo normal');
  if(!hasPullRequest(secrets)) failures.push('Security Secrets Audit deve voltar a disparar em PR no modo normal');
  if(!hasPullRequest(android)) failures.push('Android Check deve voltar a disparar em PR no modo normal');
}

if(failures.length){
  console.error('CI mode audit FAILED:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`CI mode audit OK: ${mode.mode} (${mode.reason||'sem motivo'})`);
