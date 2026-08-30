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
- usar GitLab CI como executor independente;
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

## Validação canônica

```bash
node --check src/index.js
npm test
AUDIT_ALLOW_ANY_ROOT=1 npm run audit
node scripts/audit-secrets.mjs
```

O mesmo conjunto mínimo é executado por `.gitlab-ci.yml`.

## GitHub Actions: política de custo

- PR visual: Chromium apenas quando Actions estiver em modo normal.
- `main`/manual: cobertura completa Chromium + Firefox + WebKit quando Actions estiver em modo normal.
- Android CI: somente mudanças Android/Capacitor/toolchain.
- Secret scan da árvore atual: em PR quando Actions estiver em modo normal.
- Audit completo do histórico: semanal/manual quando Actions estiver em modo normal.
- Em `degraded`, ausência de workflow automático não significa verde.

## Produção Cloudflare

O deploy é fail-closed:

1. nenhum deploy novo ocorre em `degraded`;
2. deploy manual também reexecuta testes e auditorias quando permitido;
3. após publicar, versão, SHA, build e Service Worker precisam corresponder ao artefato validado;
4. há um stability re-check;
5. se o deploy aconteceu e uma verificação posterior falhar, `wrangler rollback` restaura a versão anterior;
6. execuções obsoletas podem ser canceladas antes de publicar uma revisão mais antiga; após publicação, falhas posteriores continuam protegidas por rollback.

## GitLab como contingência independente

O repositório contém `.gitlab-ci.yml` com:
- syntax check;
- testes Node;
- auditoria estrutural/release;
- secret scan.

### Caminho gratuito validado

Quando GitLab Pull Mirroring não estiver disponível no plano, use:

`GitHub push → Webhook → GitLab Pipeline Trigger → GitLab runner`

O webhook aponta para o endpoint de trigger do projeto GitLab e usa `ref/main` apenas para carregar a configuração do pipeline.

**Importante:** o pipeline não pode validar a árvore antiga da `main` do GitLab. Em `CI_PIPELINE_SOURCE == "trigger"`, `.gitlab-ci.yml` lê `TRIGGER_PAYLOAD`, extrai `after` e `ref`, baixa do GitHub o SHA exato do push, faz checkout detached e confirma `git rev-parse HEAD == payload.after` antes de executar testes.

Para repositório GitHub privado, configure no GitLab a variável CI/CD:

- `GITHUB_READ_TOKEN`;
- `Masked and hidden`;
- não proteger a variável enquanto branches não protegidas precisarem ser validadas;
- valor: PAT do GitHub com acesso somente de leitura ao repositório. Fine-grained com `Contents: Read-only` é preferível; token classic com escopo `repo` pode ser usado como fallback quando a política da conta impedir o fine-grained de autenticar via Git HTTPS.

Nunca colocar o token no YAML, no webhook público ou no repositório.

### Critério de validade do failover

Um pipeline GitLab só pode ser considerado evidência válida quando:
- `CI_PIPELINE_SOURCE == "trigger"` para pushes vindos do GitHub;
- o log confirmar `GitHub SHA validado: <sha>`;
- `<sha>` for exatamente o commit que se pretende validar;
- `quality` e `security_current_tree` concluírem com sucesso.

Um pipeline verde sobre a árvore local desatualizada do GitLab **não** substitui CI do commit GitHub.

## Proteção da main

A branch `main` deve exigir:
- pull request;
- checks válidos antes de merge;
- bloqueio de force-push/deleção;
- atualização da branch antes de merge quando necessário.

Enquanto GitHub Actions estiver em `degraded`, a evidência de GitLab deve ser conferida pelo SHA exato antes de qualquer promoção. Não criar status verde fictício no GitHub apenas porque o webhook respondeu `2xx`.

A proteção nativa precisa ser habilitada no painel do GitHub porque a integração atual usada pelo assistente não expõe escrita de branch protection/rulesets.

## Regra operacional

`CI externo indisponível != app quebrado`.

`Webhook entregue != commit validado`.

Quando não houver log de execução real sobre o SHA correto, nenhuma versão nova deve ser promovida. A última versão validada permanece como versão canônica de produção.
