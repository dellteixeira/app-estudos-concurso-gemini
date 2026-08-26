# Fase 4X — promoção individual reversível da ring-3

A Fase 4X promove individualmente usuários da faixa 45–54 (`population-expanded-ring-3`) que já passaram pelo gate longitudinal 4W.

## Objetivo

Permitir profundidade remota de até 2 writes apenas para usuários ring-3 com evidência longitudinal suficiente, mantendo rollout populacional em 55% e preservando reversibilidade imediata.

## Elegibilidade

A promoção exige simultaneamente:

- tier `population-expanded-ring-3`;
- `getRing3Report().readyForDepthReview === true`;
- rollout elegível e ativo;
- graduação de metadata ativa;
- circuit breaker fechado;
- kill switch inativo.

## Segurança e reversibilidade

A promoção é revogada quando qualquer condição de elegibilidade regride. Eventos de parada do rollout, parada da graduação, fallback da autoridade e abertura do circuit breaker também revogam o grant.

A 4X é uma política local de orçamento. Ela não cria endpoint, schema, tabela, ledger ou nova autoridade remota.

## Budget

- base ring-3: 1 write remoto;
- ring-3 promovido: no máximo 2 writes remotos;
- população total: permanece 55%.

A política final `OfflineSyncMetadataExpansion` reconhece o grant 4X como fonte válida de profundidade sem alterar os grants históricos das fases 4L, 4P ou 4T.

## Próxima etapa

Depois de evidência suficiente da 4X, a próxima fase arquitetural deve medir estabilidade pós-promoção da ring-3 antes de qualquer nova expansão populacional.
