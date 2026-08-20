# BACKUPS E VERSOES

## BACKUP-001

- Data: 2026-08-20
- Versao do app no commit-base: 10.23.0
- Branch canonica auditada: `main`
- Commit-base: `7a97bb2d2039e0ffbb2748bbb0e3f903bdc5f709`
- Commit curto: `7a97bb2`
- Tipo: primeiro checkpoint canonico sob demanda
- Conteudo: snapshot integral dos arquivos versionados da `main`, acompanhado da memoria operacional do projeto.
- Seguranca: secrets, tokens e senhas nao devem ser adicionados ao pacote documental.
- Observacao de validacao: a estrutura remota foi inspecionada; os scripts declarados sao `npm test`, `npm run audit` e `npm run check`. O status combinado do commit-base nao apresentou checks publicados no momento da consulta.

### Alteracoes imediatamente anteriores ao checkpoint

- v10.23.0: zoom, busca, controles de teclado e IA mais inteligente no PDF Reader.
- v10.22.0: persistencia de anotacoes e flashcards mais inteligentes.
- PR #30: separacao de flashcards, anotacoes, sublinhado e marca-texto.
- PR #29: barra de estudo sempre visivel.
- PR #28: visualizador PDF exclusivo da Biblioteca.

### Regra para BACKUP-002 e posteriores

Antes de registrar novo checkpoint, comparar o HEAD atual da `main` com o commit-base do backup anterior e resumir as mudancas acumuladas.
