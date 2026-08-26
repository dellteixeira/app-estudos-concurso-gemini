# Fase 4V — expansão populacional de metadata 45% → 55%

## Objetivo

Expandir de forma conservadora o rollout de `concursos_metadata` de 45% para 55% da população elegível, preservando todas as fronteiras históricas e sem ampliar profundidade de escrita para a nova faixa.

## Contrato

- rollout global: 55%;
- buckets 0–9: `pilot`;
- buckets 10–24: `expanded-base`;
- buckets 25–34: `population-expanded-base`;
- buckets 35–44: `population-expanded-ring-2`;
- buckets 45–54: `population-expanded-ring-3`;
- buckets 55–99: `excluded`;
- a nova faixa 45–54 recebe somente o budget base de 1 write remoto;
- grants históricos 4L, 4P e 4T não são herdados pela nova faixa;
- nenhuma nova tabela, schema, endpoint ou autoridade remota;
- `remoteAuthority:false` permanece no rollout;
- kill switch, graduação 4F e circuit breaker continuam soberanos.

## Segurança arquitetural

A 4V altera apenas a segmentação populacional do rollout existente. A política final de profundidade continua em `OfflineSyncMetadataExpansion`, cujo budget base é 1 write. As promoções individuais existentes são condicionadas a tiers exatos e, portanto, não alcançam `population-expanded-ring-3`.

## Critério para a próxima fase

A faixa 45–54 deve acumular estabilidade longitudinal própria antes de qualquer promoção individual. A fase seguinte deve introduzir um gate observacional equivalente às fases 4O/4S, sem aumentar o budget remoto.
