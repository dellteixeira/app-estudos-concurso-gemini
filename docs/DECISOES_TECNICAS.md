# Decisoes Tecnicas

## DT-001 - GitHub como memoria tecnica portavel
Data: 2026-08-20

O historico de chat nao sera a unica fonte de continuidade do projeto. O repositorio deve conter um checkpoint legivel por novas sessoes, desktops e agentes.

## DT-002 - PR independente de ESTADO.md
A conclusao de uma Pull Request funcional nao depende da atualizacao de `ESTADO.md`. A consolidacao documental ocorre sob comando explicito `faça backup`.

## DT-003 - Backup sob demanda
O gatilho `faça backup` deve:
1. confirmar o estado atual da `main`;
2. atualizar a memoria documental;
3. registrar `BACKUP-XXX`;
4. gerar ZIP integral para armazenamento local;
5. informar commit-base e validacoes.

## DT-004 - Implementacao segura
Mudancas funcionais devem preferir branch propria e PR, preservando a `main`. Informar sempre arquivos criados e alterados.

## DT-005 - Identificadores
- Requisitos implementados: `APP-XXX`.
- Checkpoints/backup: `BACKUP-XXX`.
