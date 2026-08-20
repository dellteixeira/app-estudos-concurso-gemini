# DECISOES TECNICAS

## DT-001 - GitHub como fonte de verdade do projeto

O estado tecnico permanente deve ficar no repositorio, nao apenas em conversas do ChatGPT/Codex.

## DT-002 - Checkpoint sob comando

Pull Requests nao dependem da atualizacao de `ESTADO.md`. A consolidacao documental e feita quando o usuario disser `faca backup`.

## DT-003 - Continuidade portavel

O comando `consulte ESTADO.md no git` deve reconstruir o contexto pelo repositorio e pela `main` atual antes de novo desenvolvimento.

## DT-004 - Branches para alteracoes funcionais

Novas implementacoes e correcoes devem preferencialmente ocorrer em `feature/...`, `fix/...` ou equivalente, com testes e PR antes da incorporacao na `main`.

## DT-005 - Segredos fora do backup

Tokens, senhas, chaves e secrets de GitHub/Supabase/Cloudflare ou outros provedores nao devem ser gravados em documentos de memoria nem empacotados deliberadamente em backups canonicos.
