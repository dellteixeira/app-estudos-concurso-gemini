const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const config=JSON.parse(fs.readFileSync('config/ci-mode.json','utf8'));
const audit=fs.readFileSync('scripts/audit-ci-mode.mjs','utf8');
const toggle=fs.readFileSync('scripts/set-ci-mode.mjs','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('modo degradado é explícito e bloqueia produção',()=>{
  assert.equal(config.mode,'degraded');
  assert.equal(config.productionDeployAllowed,false);
  assert.match(audit,/Cloudflare Production Verify/);
  assert.match(audit,/deploy de produção bloqueado/);
});

test('recuperação do CI é centralizada e reversível',()=>{
  assert.match(toggle,/normal/);
  assert.match(toggle,/degraded/);
  assert.match(toggle,/quality-check\.yml/);
  assert.match(toggle,/security-secrets-audit\.yml/);
  assert.match(toggle,/android-ci\.yml/);
  assert.equal(pkg.scripts['ci:normal'],'node scripts/set-ci-mode.mjs normal');
  assert.equal(pkg.scripts['ci:degraded'],'node scripts/set-ci-mode.mjs degraded');
});
