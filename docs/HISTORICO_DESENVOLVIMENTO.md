# HISTORICO DE DESENVOLVIMENTO

Este arquivo registra checkpoints e marcos consolidados. Nao substitui o historico Git.

## BACKUP-001 - 2026-08-20

- Versao observada: 10.23.0.
- Branch-base: `main`.
- Commit-base: `7a97bb2d2039e0ffbb2748bbb0e3f903bdc5f709`.
- Objetivo: instituir o primeiro checkpoint canonico e a memoria operacional portavel entre conversas/desktops.
- Marcos recentes: Reader PDF proprio da Biblioteca; barra de estudo persistente; separacao entre flashcards/anotacoes/sublinhado/marca-texto; melhorias de persistencia; zoom; busca; teclado; heuristicas de IA para flashcards.
- Infraestrutura observada: Quality Check, validacao/deploy de migrations Supabase, backup Supabase e mirror GitLab.
- O backup canonico deve excluir secrets e credenciais.

### Regra para proximos registros

Cada `faca backup` deve acrescentar novo `BACKUP-XXX`, registrar SHA da `main`, versao, mudancas desde o checkpoint anterior, testes/auditoria, migrations e pendencias relevantes.
