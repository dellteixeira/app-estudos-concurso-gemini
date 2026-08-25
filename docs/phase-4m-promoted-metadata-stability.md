# Fase 4M — estabilidade longitudinal após promoção 4L

## Objetivo

A Fase 4M observa, localmente e por usuário, a estabilidade dos membros `expanded-base` que já foram promovidos pela Fase 4L para profundidade máxima de 2 writes em `user_settings:concursos_metadata`.

Mode: `metadata-promoted-stability-v1`.

A 4M não amplia a população, não promove usuários e não concede orçamento remoto. Seu único resultado decisório é o sinal diagnóstico `readyForPopulationReview`.

## Escopo observado

Somente usuários que:

- pertencem a `tier === expanded-base`;
- possuem histórico de promoção 4L (`promotedAt`);
- permanecem com a promoção 4L atualmente válida.

Piloto original (buckets 0–9) e usuários fora da base expandida não entram no histórico 4M.

## Janela e critérios

O histórico próprio utiliza o prefixo:

`offline_sync_metadata_promoted_stability_v1_`

A janela é limitada às 10 observações mais recentes, deduplicadas por sessão.

`readyForPopulationReview === true` exige cumulativamente:

- pelo menos 5 sucessos limpos após promoção;
- zero failures na janela;
- zero aborts na janela;
- promoção 4L ainda ativa e elegível;
- paridade da autoridade de metadata elegível;
- usuário ainda pertencente à faixa `expanded-base`.

O sinal indica apenas que a estabilidade pós-promoção está apta a revisão humana/técnica. Ele não altera buckets nem dispara expansão automaticamente.

## Eventos

A 4M observa `offline-sync-metadata-stability:observed` e registra `success` somente quando a promoção 4L está ativa.

Quando recebe `offline-sync-metadata-expanded-promotion:revoked`, registra a regressão no histórico pós-promoção:

- `failure` para falha de canário, fallback, circuito ou regressão de paridade;
- `aborted` para interrupções administrativas ou de segurança que não representam falha remota.

## Garantias arquiteturais

O módulo não contém `.from()`, `.upsert()`, `.delete()` ou `fetch()` e declara `remoteAuthority:false`.

A 4M não altera:

- Supabase ou schema;
- autoridade remota de metadata;
- orçamento máximo da 4L, que permanece em 2 writes;
- população-base de 25%;
- buckets do piloto original;
- rollout/graduation;
- kill switch ou circuit breaker;
- edital, flashcards ou exclusões.

## Integração

No AppState, a ordem passa a ser:

4K (`expanded stability`) → 4L (`expanded promotion`) → 4M (`promoted stability`) → 4I (`expansion policy`).

O AppState expõe `getOfflineSyncMetadataPromotedStabilityDiagnostics()`.

O asset integra app shell, network-first e contratos no-store do Service Worker, Cloudflare Worker e `_headers`.

## Release

Durante a implementação e o pré-gate da Fase 4M, toda a identidade do aplicativo permanece em `v10.43.0`.

Somente após Syntax Check, testes automatizados, Structural Audit e Browser Responsive Audit integralmente verdes a release candidate poderá ser promovida para `v10.44.0`.
