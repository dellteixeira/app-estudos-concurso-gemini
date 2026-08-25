# Fase 4S — estabilidade longitudinal da faixa 35–44

## Objetivo

Validar longitudinalmente a nova faixa populacional introduzida na Fase 4R (`population-expanded-ring-2`, buckets 35–44) antes de qualquer futura revisão de profundidade.

## Contrato

- rollout total permanece em **45%**;
- a faixa 35–44 permanece com orçamento-base de **1 write remoto**;
- janela longitudinal: **10 observações** já mantidas por `OfflineSyncMetadataStability`;
- mínimo de **5 sucessos limpos**;
- **0 failures** na janela;
- **0 aborted** na janela;
- paridade atual de metadata deve continuar elegível;
- saída é somente diagnóstica: `readyForDepthReview`;
- nenhuma promoção de profundidade é executada nesta fase.

## Isolamento

A 4S observa exclusivamente `tier === 'population-expanded-ring-2'`. As faixas históricas `pilot`, `expanded-base` e `population-expanded-base` mantêm seus contratos existentes e não são qualificadas pela 4S.

## Autoridade e persistência

A implementação reutiliza o asset canônico `offline-sync-metadata-expanded-stability.js` e o ledger longitudinal existente. Não cria:

- novo endpoint;
- nova tabela ou schema;
- novo domínio de persistência;
- novo caminho de escrita remota;
- novo ledger local;
- nova autoridade remota.

`remoteAuthority` permanece `false`.

## Próxima fronteira

Uma eventual promoção individual reversível da faixa 35–44 pertence a uma fase posterior. A 4S somente produz evidência de prontidão para revisão e não altera `maxRemoteWrites`.
