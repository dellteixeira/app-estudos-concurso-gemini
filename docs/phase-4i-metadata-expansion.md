# Fase 4I — expansão limitada de `concursos_metadata`

## Objetivo

A Fase 4I transforma a evidência longitudinal da 4H em uma expansão **limitada e reversível** da profundidade do canário. Ela não amplia a população do rollout: a coorte 4G permanece em 10%.

## Componente

- `public/js/core/offline-sync-metadata-expansion.js`
- modo: `metadata-stability-expansion-v1`
- política local por `user_id`
- desligada por padrão
- opt-in próprio

## Regra de expansão

A autoridade 4E continua com `MAX_REMOTE_WRITES = 1` como fallback/base. Somente quando a 4I estiver explicitamente habilitada e elegível o teto efetivo passa para **2 writes remotos por sessão canário**.

O teto dinâmico é rigidamente limitado a 2 na própria autoridade. Se o controlador estiver ausente, desabilitado, inelegível ou lançar erro, o teto volta automaticamente a 1.

## Elegibilidade

A expansão só pode ser habilitada quando, simultaneamente:

1. existe usuário autenticado;
2. a Fase 4H retorna `readyForExpansion=true`;
3. o usuário continua dentro da coorte determinística 4G de 10%;
4. o rollout 4G continua elegível;
5. não existe circuit breaker aberto na autoridade de metadados;
6. o kill switch global não está ativo.

## Fail-closed

A expansão é interrompida e retorna ao teto base de 1 quando ocorrer:

- regressão da estabilidade 4H;
- fallback da autoridade;
- abertura do circuit breaker;
- parada do rollout subjacente;
- kill switch;
- desativação manual.

## Semântica da sessão

Com o teto base de 1, o comportamento permanece idêntico à fase anterior: após o primeiro write o orçamento fica esgotado e o canário é encerrado.

Com a expansão elegível, o primeiro write não encerra automaticamente a sessão se ainda existir orçamento. A mesma sessão pode absorver no máximo mais um write posterior. Ao atingir 2 writes, a autoridade encerra o canário com `budget-exhausted`.

## Guardrails preservados

- mesma tabela remota: `user_settings`;
- mesma chave: `concursos_metadata`;
- mesmo merge canônico com preservação de `studySessions`;
- mesmas verificações de `metadataRevision` e fingerprint;
- mesmo outbox/preflight;
- mesmo circuit breaker;
- mesmo kill switch global;
- mesma coorte 4G de 10%;
- nenhuma alteração em `edital`, flashcards ou exclusões de concursos;
- nenhum novo endpoint, tabela ou operação remota no controlador 4I;
- teto absoluto de 2 writes, mesmo se um controlador externo retornar valor maior.

## Integração

Ordem no `AppState`:

1. metadata shadow;
2. metadata authority;
3. metadata graduation;
4. metadata rollout;
5. metadata stability;
6. metadata expansion;
7. autoridades do edital.

O asset integra app shell crítico, network-first e políticas no-store do PWA/Worker/Cloudflare.

## Próxima decisão

Uma fase posterior poderá avaliar expansão de população somente depois de evidência suficiente do comportamento com teto 2. A 4I, isoladamente, mantém a coorte em 10% e não concede autoridade ampla.

## Release candidate

Após o pré-gate funcional integralmente verde, a identidade coordenada foi promovida para **v10.40.0**. Este registro documental não altera a lógica da Fase 4I e existe para produzir o SHA final auditável do candidato de release.