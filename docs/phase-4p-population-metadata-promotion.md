# Fase 4P — promoção reversível da nova faixa populacional

## Objetivo

Promover individualmente usuários da faixa `population-expanded-base` (buckets 25–34) de 1 para 2 writes remotos por sessão canário, somente após a evidência longitudinal produzida pela Fase 4O.

Mode: `metadata-population-promotion-v1`.

A 4P não amplia população. O rollout-base permanece em 35%.

## Pré-condição obrigatória

A promoção exige `OfflineSyncMetadataExpandedStability.getPopulationReport(userId).readyForDepthReview === true`.

Logo, cada usuário promovido já precisa ter acumulado, na janela longitudinal da 4O:

- pelo menos 5 sucessos limpos;
- zero failures;
- zero aborts;
- paridade atual elegível;
- `tier === population-expanded-base`.

## Elegibilidade adicional

Além da 4O, a promoção exige:

- rollout de metadata elegível e ativo;
- graduação de metadata ativa;
- ausência de circuit breaker para o usuário;
- ausência de hard kill/kill switch.

## Política de profundidade

- baseline da faixa 25–34: 1 write remoto;
- usuário 4P promovido: no máximo 2 writes remotos;
- o teto absoluto continua 2;
- a promoção é individual e persistida localmente por usuário;
- nenhum bucket 35–99 passa a fazer parte do rollout.

## Reversibilidade

Uma promoção ativa é revogada quando sua elegibilidade regride. Também há revogação imediata em eventos de segurança:

- rollout parado;
- graduação parada;
- fallback da autoridade de metadata;
- abertura do circuit breaker.

A revogação retorna o orçamento efetivo para 1 write.

## Integração

Novo módulo:

`public/js/core/offline-sync-metadata-population-promotion.js`

O módulo é carregado depois da estabilidade longitudinal e antes de `offline-sync-metadata-expansion.js`.

`OfflineSyncMetadataExpansion` passa a reconhecer três fontes legítimas de depth grant:

1. piloto original;
2. promoção 4L da faixa `expanded-base` 10–24;
3. promoção 4P da faixa `population-expanded-base` 25–34.

A autoridade remota continua centralizada em `OfflineSyncMetadataAuthority`; a 4P é apenas política local de orçamento.

## Garantias arquiteturais

A 4P:

- não contém `.from()`, `.upsert()`, `.delete()` ou `fetch()`;
- não altera schema Supabase;
- não altera endpoints;
- não altera `COHORT_PERCENT`;
- não aumenta população acima de 35%;
- não aumenta o teto acima de 2 writes;
- mantém `remoteAuthority:false`.

## Release

Durante implementação e pré-gate, a identidade permanece em `v10.47.0`.

Somente após Syntax Check, testes automatizados, Structural Audit e Browser Responsive Audit integralmente verdes a candidata poderá ser promovida para `v10.48.0`.
