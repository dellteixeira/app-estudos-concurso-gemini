# Fase 4T — promoção individual reversível da ring-2

A Fase 4T promove individualmente usuários da faixa 35–44 (`population-expanded-ring-2`) que já passaram pelo gate longitudinal 4S.

## Objetivo

Permitir profundidade remota de até 2 writes apenas para usuários ring-2 com evidência longitudinal suficiente, mantendo rollout populacional em 45% e preservando reversibilidade imediata.

## Elegibilidade

A promoção exige simultaneamente:

- tier `population-expanded-ring-2`;
- `getRing2Report().readyForDepthReview === true`;
- rollout elegível e ativo;
- graduação de metadata ativa;
- circuit breaker fechado;
- kill switch inativo.

## Segurança e reversibilidade

A promoção é revogada quando qualquer condição de elegibilidade regride. Eventos de parada do rollout, parada da graduação, fallback da autoridade e abertura do circuit breaker também revogam o grant.

A 4T é uma política local de orçamento. Ela não cria endpoint, schema, tabela, ledger ou nova autoridade remota.

## Budget

- base ring-2: 1 write remoto;
- ring-2 promovido: no máximo 2 writes remotos;
- população total: permanece 45%.

A política final `OfflineSyncMetadataExpansion` reconhece o grant 4T como uma das fontes válidas de profundidade, sem alterar os grants históricos das fases 4L e 4P.

## Próxima etapa

Depois de evidência suficiente da 4T, a próxima fase arquitetural deve medir estabilidade pós-promoção da ring-2 antes de qualquer nova expansão populacional.
