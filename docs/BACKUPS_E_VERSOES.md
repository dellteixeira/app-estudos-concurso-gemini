# BACKUPS E VERSOES

## BACKUP-001

- Data: 2026-08-20
- Versao da aplicacao: 10.23.0
- Branch-base: `main`
- SHA-base: `7a97bb2d2039e0ffbb2748bbb0e3f903bdc5f709`
- SHA curto: `7a97bb2`
- Tipo: primeiro checkpoint canonico formal
- Conteudo esperado no ZIP: arvore versionada do repositorio na base acima, sem `.git` e sem secrets externos ao repositorio.
- Nome recomendado: `APP_ESTUDOS_BACKUP-001_2026-08-20_v10.23.0_7a97bb2.zip`

## Convencao

Cada novo comando `faca backup` incrementa `BACKUP-XXX`, registra o SHA exato da `main`, a versao e as diferencas relevantes desde o backup anterior.
