'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadIntegrity() {
  const source = fs.readFileSync('public/js/core/edital-integrity.js', 'utf8');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'edital-integrity.js' });
  return context.window.EditalIntegrity;
}

test('normaliza assunto ignorando caixa, acentos e espaços excedentes', () => {
  const integrity = loadIntegrity();
  assert.equal(integrity.normalizePart('  Prescrição   e Decadência  '), 'prescricao e decadencia');
  assert.equal(integrity.normalizePart('PRESCRICAO E DECADENCIA'), 'prescricao e decadencia');
});

test('chave semântica inclui concurso, matéria e assunto', () => {
  const integrity = loadIntegrity();
  const base = { concurso:'TJ', materia:'Direito Civil', assunto:'Obrigações' };
  assert.equal(integrity.hasSameTopic(base, { concurso:' tj ', materia:'DIREITO CÍVIL', assunto:' obrigacoes ' }), true);
  assert.equal(integrity.hasSameTopic(base, { concurso:'TRF', materia:'Direito Civil', assunto:'Obrigações' }), false);
  assert.equal(integrity.hasSameTopic(base, { concurso:'TJ', materia:'Direito Administrativo', assunto:'Obrigações' }), false);
});

test('dedupe preserva primeiro id e funde todo o progresso sem perder marcações', () => {
  const integrity = loadIntegrity();
  const result = integrity.dedupe([
    { id:'a', concurso:'TJ', materia:'Direito Civil', assunto:'Pessoas naturais e jurídicas', prioridade:2, assunto_prioridade:4, teoria:true, questoes:false, videoaula:false, rev_24h:false, metodo_conteudo:'teoria' },
    { id:'b', concurso:' tj ', materia:'direito civil', assunto:' Pessoas naturais e juridicas ', prioridade:1, assunto_prioridade:2, teoria:false, questoes:true, videoaula:true, rev_24h:true, rev_7d:true, metodo_conteudo:'videoaula' }
  ]);
  assert.equal(result.changed, true);
  assert.deepEqual(Array.from(result.removedIds), ['b']);
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.id, 'a');
  assert.equal(item.prioridade, 1);
  assert.equal(item.assunto_prioridade, 2);
  assert.equal(item.teoria, true);
  assert.equal(item.questoes, true);
  assert.equal(item.videoaula, true);
  assert.equal(item.rev_24h, true);
  assert.equal(item.rev_7d, true);
  assert.equal(item.metodo_conteudo, 'teoria_videoaula');
});

test('findDuplicate bloqueia novo UUID para o mesmo tópico e permite editar o próprio item', () => {
  const integrity = loadIntegrity();
  const items = [{ id:'old', concurso:'TJ', materia:'Processo Civil', assunto:'Competência' }];
  assert.equal(integrity.findDuplicate(items, { id:'new', concurso:'tj', materia:'PROCESSO CIVIL', assunto:'competencia' })?.id, 'old');
  assert.equal(integrity.findDuplicate(items, items[0], { ignoreId:'old' }), null);
});

test('migração cria proteção única semântica no Supabase', () => {
  const sql = fs.readFileSync('supabase/migrations/20260825164000_dedupe_edital_topics_and_enforce_unique_identity.sql', 'utf8');
  assert.match(sql, /normalize_edital_identity/i);
  assert.match(sql, /create unique index if not exists edital_user_concurso_materia_assunto_unique_idx/i);
  assert.match(sql, /delete from public\.edital/i);
  assert.match(sql, /bool_or\(coalesce\(teoria, false\)\)/i);
});
