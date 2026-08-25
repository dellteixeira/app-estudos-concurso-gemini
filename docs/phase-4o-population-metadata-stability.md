# Fase 4O — estabilidade longitudinal da nova faixa populacional

## Objetivo

Observar a estabilidade dos usuários adicionados pela Fase 4N aos buckets 25–34 antes de qualquer revisão futura de profundidade de escrita remota.

Mode diagnóstico: `metadata-population-expanded-stability-v1`.

A 4O é estritamente observacional. Ela não amplia população, não concede segundo write, não promove usuários e não cria nova autoridade remota.

## Faixa observada

Somente usuários com `tier === population-expanded-base`, isto é, buckets 25–34 do rollout-base de 35%.

Os buckets 0–9 permanecem como piloto original, os buckets 10–24 continuam sob as políticas 4K–4M e os buckets 35–99 continuam excluídos.

## Fonte longitudinal

A 4O reutiliza o histórico local já mantido por `OfflineSyncMetadataStability`, exatamente para evitar um segundo ledger e divergência entre observadores.

A janela permanece limitada às 10 observações mais recentes.

## Critérios de prontidão

`readyForDepthReview === true` exige cumulativamente:

- `tier === population-expanded-base`;
- pelo menos 5 canários bem-sucedidos na janela;
- zero failures na janela;
- zero aborts na janela;
- paridade atual da autoridade de metadata elegível.

O sinal é apenas diagnóstico e não dispara promoção automaticamente.

## Orçamento e população

- população-base permanece em 35%;
- a faixa 25–34 permanece em 1 write remoto por sessão canário;
- o teto de 2 writes continua restrito às políticas anteriores da faixa `expanded-base` 10–24;
- a 4O não altera `COHORT_PERCENT`, rollout, graduação, kill switch ou circuit breaker.

## Integração

A 4O evolui o módulo já canônico `offline-sync-metadata-expanded-stability.js`, que passa a manter dois relatórios independentes:

- relatório 4K para `expanded-base` com `readyForPilotReview`;
- relatório 4O para `population-expanded-base` com `readyForDepthReview`.

Isso reaproveita o asset já integrado ao AppState, app shell, network-first e contratos no-store, sem adicionar um novo arquivo de runtime ao PWA.

O evento diagnóstico da 4O é:

`offline-sync-metadata-population-stability:evaluated`

## Garantias arquiteturais

A 4O não contém `.from()`, `.upsert()`, `.delete()` ou `fetch()` e mantém `remoteAuthority:false`.

Não há alteração de schema, Supabase, endpoints, edital, flashcards, exclusões ou demais domínios do aplicativo.

## Release

Durante implementação e pré-gate, a identidade permanece em `v10.46.0`.

Somente após Syntax Check, testes automatizados, Structural Audit e Browser Responsive Audit integralmente verdes a candidata poderá ser promovida para `v10.47.0`.
