'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const ui=fs.readFileSync('public/js/app-ui.js','utf8');
const dashboard=fs.readFileSync('public/css/dashboard.css','utf8');

test('menu compacto substitui a barra horizontal sem duplicar handlers',()=>{
  assert.match(html,/class="compact-actions-toggle"/);
  assert.match(html,/aria-controls="compactActionsDropdown"/);
  assert.match(html,/id="compactActionsDropdown"/);
  assert.doesNotMatch(html,/class="action-bar"/);
  assert.doesNotMatch(html,/mobile-tools-toggle|header-account-actions|btn-account-header|btn-theme-header|btn-logout-header/);
  for(const id of ['ih-001','ih-002','ih-003','ih-004','ih-005']) assert.equal((html.match(new RegExp(id,'g'))||[]).length,1);
});

test('ordem do menu termina com Conta, tema e Sair',()=>{
  const menu=html.slice(html.indexOf('id="compactActionsDropdown"'),html.indexOf('id="compactActionsDropdown"')+5000);
  const labels=['Sincronizar Agora','Ver / Anexar Edital PDF','Importar JSON','Analisar Edital com IA','Como Gerar JSON com IA','Limpar Edital Atual','Conta','Modo Claro/Escuro','Sair'];
  let last=-1;
  for(const label of labels){const pos=menu.indexOf(label);assert.ok(pos>last,`ordem inválida: ${label}`);last=pos;}
  assert.match(menu,/data-action="logout"[\s\S]*>Sair<\/button>/);
});

test('menu fecha por clique externo, seleção e Escape com aria sincronizado',()=>{
  assert.match(ui,/function closeCompactActionsMenu\(\)/);
  assert.match(ui,/if \(!root\.contains\(event\.target\)\)/);
  assert.match(ui,/event\.key !== 'Escape'/);
  assert.match(ui,/setAttribute\('aria-expanded', 'true'\)/);
  assert.match(ui,/setAttribute\('aria-expanded', 'false'\)/);
  assert.doesNotMatch(ui,/querySelector\('\.action-bar'\)|mobile-open/);
});

test('dropdown é ancorado ao hambúrguer, responsivo e suporta tema claro',()=>{
  assert.match(dashboard,/\.compact-actions-dropdown\s*\{[\s\S]*position:\s*absolute/);
  assert.match(dashboard,/width:\s*min\(320px, calc\(100vw - 24px\)\)/);
  assert.match(dashboard,/\.compact-actions-toggle span/);
  assert.match(dashboard,/body\.light-mode \.compact-actions-toggle/);
  assert.match(dashboard,/\.compact-menu-danger/);
});
