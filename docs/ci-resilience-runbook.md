# CI / Release Resilience Runbook

## Objetivo

Garantir que falhas do GitHub Actions não sejam confundidas com regressões do app e que nenhuma revisão não validada substitua a última versão funcional em produção.

## Classificação rápida de falha

### 1. Falha de infraestrutura antes da execução
Considere como falha de provisionamento quando o GitHub retornar job com `steps: []` ou `steps: null`, sem checkout e sem log substancial.

Ações:
- não alterar código do app apenas para tentar remover esse vermelho;
- verificar GitHub Actions Billing/Budget/Usage;
- verificar GitHub Status;
- usar GitLab CI como executor independente quando o pull mirror estiver habilitado;
- manter deploy bloqueado até existir validação real.

### 2. Falha real de código
É falha real quando algum step começou e produziu saída, por exemplo:
- `npm test`;
- `npm run audit`;
- Playwright;
- Gradle;
- instrumentation tests;
- secret audit.

Ações:
- corrigir a causa indicada no log;
- não mascarar falha com `continue-on-error`;
- não aplicar retry em testes funcionais/auditorias determinísticas.

## Validação canônica local

```bash
node --check src/index.js
npm test
AUDIT_ALLOW_ANY_ROOT=1 npm run audit
node scripts/audit-secrets.mjs
```

O mesmo conjunto mínimo é executado por `.gitlab-ci.yml`.

## GitHub Actions: política de custo

- PR visual: Chromium apenas.
- `main`/manual: cobertura completa Chromium + Firefox + WebKit.
- Android CI: somente mudanças Android/Capacitor/toolchain.
- Secret scan da árvore atual: em PR.
- Audit completo do histórico: semanal/manual.
- Mirror GitHub → GitLab: `main`, tags `v*` ou manual.

## Produção Cloudflare

O deploy é fail-closed:

1. `Quality Check` da `main` precisa concluir com `success` para disparar deploy automático.
2. Deploy manual também reexecuta testes e auditorias.
3. Após publicar, versão, SHA, build e Service Worker precisam corresponder ao artefato validado.
4. Há um stability re-check.
5. Se o deploy aconteceu e uma verificação posterior falhar, `wrangler rollback` restaura a versão anterior.
6. Deploy em andamento não é cancelado por outra execução.

## GitLab como contingência independente

O repositório contém `.gitlab-ci.yml` com:
- syntax check;
- testes Node;
- auditoria estrutural/release;
- secret scan.

Para independência real do GitHub Actions, habilite no projeto GitLab:

`Settings → Repository → Mirroring repositories → Pull`

Origem: repositório GitHub `dellteixeira/app-estudos-concurso-gemini`.

Sem pull mirror, o workflow `mirror-gitlab.yml` ainda depende de GitHub Actions para enviar atualizações ao GitLab.

## Proteção da main

A branch `main` deve exigir:
- pull request;
- Quality Check;
- Security Secrets Audit;
- Android Check quando aplicável;
- bloqueio de force-push/deleção;
- atualização da branch antes de merge quando necessário.

A proteção nativa precisa ser habilitada no painel do GitHub porque a integração atual usada pelo assistente não expõe escrita de branch protection/rulesets.

## Regra operacional

`CI externo indisponível != app quebrado`.

Quando não houver log de execução real, nenhuma versão nova deve ser promovida. A última versão validada permanece como versão canônica de produção.
