# Fase 4L — promoção individual da faixa expanded-base

## Objetivo

A Fase 4L permite que usuários individuais da faixa `expanded-base` (buckets 10–24) recebam profundidade de escrita de até 2 operações remotas para `user_settings:concursos_metadata`, sem ampliar a população-base acima de 25% e sem criar nova autoridade remota.

Mode: `metadata-expanded-pilot-promotion-v1`.

## Pré-condições cumulativas

A promoção somente permanece ativa quando todas as condições abaixo estão válidas:

- usuário pertence a `tier === expanded-base`;
- `OfflineSyncMetadataExpandedStability.getReport().readyForPilotReview === true`;
- elegibilidade atual do rollout está saudável;
- rollout está ativo;
- graduation está ativa;
- kill switch está inativo;
- circuit breaker da autoridade de metadata está fechado.

## Persistência e reversibilidade

A decisão é local e persistida por usuário sob o prefixo:

`offline_sync_metadata_expanded_pilot_promotion_v1_`

A promoção é revogada quando qualquer pré-condição deixa de ser satisfeita. Eventos de falha da autoridade, parada de rollout/graduation ou regressão da estabilidade provocam reavaliação/revogação.

## Integração com a Fase 4I

A Fase 4I continua sendo o único policy layer que fornece o orçamento máximo à autoridade de metadata.

A 4I agora aceita duas origens para profundidade 2:

1. piloto original (buckets 0–9), mantendo o fluxo de opt-in já existente;
2. promoção individual 4L válida na faixa `expanded-base`.

O método manual `OfflineSyncMetadataExpansion.setEnabled(true)` continua restrito ao piloto original. Assim, a 4L não transforma a faixa 10–24 em piloto global nem amplia buckets.

## Garantias arquiteturais

A 4L não contém `.from()`, `.upsert()`, `.delete()` ou `fetch()` e não cria caminho Supabase próprio.

Também não altera:

- schema Supabase;
- edital;
- flashcards;
- exclusões;
- população-base de 25%;
- autoridade de metadata;
- kill switch;
- circuit breaker.

## Budget

- baseline: 1 write;
- piloto original elegível: até 2 writes;
- expanded-base promovido individualmente: até 2 writes;
- expanded-base não promovido: 1 write;
- buckets 25–99: fora da população-base.

## Cache e diagnóstico

O módulo é carregado pelo AppState após a 4K e antes da 4I. Ele integra app shell, network-first e contratos no-store do Service Worker/Cloudflare Worker/_headers.

O AppState expõe `getOfflineSyncMetadataExpandedPromotionDiagnostics()`.

## Release

A implementação permanece sob identidade `v10.42.0` até aprovação do pré-gate integral. Somente após todos os gates verdes a versão deve ser promovida para `v10.43.0`.