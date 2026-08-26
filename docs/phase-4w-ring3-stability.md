# Fase 4W — estabilidade longitudinal da ring-3

## Objetivo

Validar longitudinalmente a nova faixa `population-expanded-ring-3` introduzida pela Fase 4V antes de qualquer aumento de profundidade de escrita remota.

## Escopo

A 4W aplica-se exclusivamente aos buckets 45–54, classificados como `population-expanded-ring-3` pelo rollout global de 55%.

A fase é diagnóstica e não amplia autoridade remota.

## Critérios de prontidão

A avaliação reutiliza o ledger longitudinal já existente em `OfflineSyncMetadataStability` e exige simultaneamente:

- janela longitudinal de 10 observações;
- pelo menos 5 sucessos limpos;
- zero falhas na janela;
- zero abortos na janela;
- paridade atual de metadata elegível;
- usuário pertencente ao tier `population-expanded-ring-3`.

Quando todos os critérios são satisfeitos, o diagnóstico expõe `readyForDepthReview: true`.

## Invariantes preservados

- rollout global permanece em 55%;
- buckets 45–54 permanecem com budget base de 1 write remoto;
- nenhuma promoção para 2 writes ocorre na 4W;
- grants históricos 4L, 4P e 4T permanecem restritos aos respectivos tiers;
- nenhuma nova tabela, schema, endpoint, ledger ou persistência é criada;
- `remoteAuthority:false` permanece explícito;
- kill switch, graduação e circuit breaker continuam soberanos;
- a implementação reutiliza `offline-sync-metadata-expanded-stability.js`, sem novo loader ou asset PWA.

## Diagnóstico

Modo: `metadata-population-ring3-stability-v1`.

Evento: `offline-sync-metadata-ring3-stability:evaluated`.

Escopo: `local-diagnostic:population-expanded-ring-3:concursos_metadata`.

## Próxima fase possível

Somente após estabilidade comprovada pela 4W, uma fase posterior poderá avaliar promoção individual reversível da ring-3 de 1 para até 2 writes, mantendo o rollout populacional em 55% e sem conceder profundidade automaticamente a toda a faixa.
