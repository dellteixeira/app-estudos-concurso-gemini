# Menu compacto de ações — v10.50.1

## Objetivo

Substituir a antiga barra horizontal de ações por um menu compacto no cabeçalho, reduzindo ocupação vertical e horizontal sem alterar os fluxos funcionais existentes.

## Contrato funcional

- O botão hambúrguer `.compact-actions-toggle` controla exclusivamente `#compactActionsDropdown`.
- O estado visual e acessível permanece sincronizado por `hidden`, `.is-open`, `aria-hidden` e `aria-expanded`.
- O menu fecha por novo clique no botão, clique externo, seleção de item e tecla Escape.
- As ações existentes de sincronização, PDF, JSON, IA, conta, tema e logout são preservadas.
- `Sair` permanece como última ação do menu.

## Limpeza de legado

A antiga `.action-bar` foi aposentada integralmente. O runtime mobile não pode reintroduzir `.action-bar`, `.mobile-open`, `setMobileToolsState` ou sobrescrever `window.toggleModernTools` com a implementação anterior.

## Validação

O pré-gate v10.50.0 concluiu com sucesso no Quality Check #1355 após a atualização dos testes Playwright e remoção do runtime legado. A identidade pública foi promovida para v10.50.1. O release candidate v10.50.1 deve passar novamente pelo gate integral antes do merge.
