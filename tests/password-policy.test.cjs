const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const domain = require(path.join(root, 'public/js/study-domain.js'));
const source = fs.readFileSync(path.join(root, 'public/js/study-domain.js'), 'utf8');

test('senha forte exige 8 caracteres e todos os grupos', () => {
  assert.equal(domain.validateStrongPassword('Abc1!def').valid, true);
  assert.equal(domain.validateStrongPassword('abc1!def').valid, false);
  assert.equal(domain.validateStrongPassword('ABC1!DEF').valid, false);
  assert.equal(domain.validateStrongPassword('Abcdef!x').valid, false);
  assert.equal(domain.validateStrongPassword('Abc12345').valid, false);
  assert.equal(domain.validateStrongPassword('Ab1!xyz').valid, false);
});

test('retorna requisitos faltantes de forma explícita', () => {
  const result = domain.validateStrongPassword('abc');
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('mínimo de 8 caracteres'));
  assert.ok(result.missing.includes('uma letra maiúscula'));
  assert.ok(result.missing.includes('um número'));
  assert.ok(result.missing.includes('um caractere especial'));
});

test('interface de autenticação recebe mensagem atualizada e cadastro é protegido', () => {
  assert.match(source, /Senha \(mín\. 8: A-Z, a-z, 0-9 e especial\)/);
  assert.match(source, /Para cadastrar: mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial\./);
  assert.match(source, /root\.handleSignUp = wrapped/);
  assert.match(source, /input\.minLength = 8/);
  assert.match(source, /__strongPasswordPolicyWrapped/);
});
