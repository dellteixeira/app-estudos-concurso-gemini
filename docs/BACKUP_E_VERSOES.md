# Backups e Versoes Canonicas

## BACKUP-001
- Data: 2026-08-20
- Versao do app: 10.23.0
- Branch-base: `main`
- Commit-base: `7a97bb2d2039e0ffbb2748bbb0e3f903bdc5f709`
- Commit curto: `7a97bb2`
- Tipo: primeiro checkpoint canonico do novo protocolo.
- Conteudo esperado do ZIP: snapshot integral dos arquivos versionados da `main`, sem secrets externos ao repositorio.
- Memoria documental: criada em branch `chore/backup-001-project-memory` para incorporacao via PR.

### Convencao de nome
`ESTUDO_ADAPTATIVO_INTELIGENTE_BACKUP-XXX_YYYY-MM-DD_<sha-curto>.zip`

### Regra
Um backup canonico deve ser reproduzivel pelo commit-base registrado aqui.
