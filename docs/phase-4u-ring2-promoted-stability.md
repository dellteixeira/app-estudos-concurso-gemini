# Fase 4U — estabilidade longitudinal pós-promoção da ring-2

## Objetivo

Validar longitudinalmente a faixa `population-expanded-ring-2` (buckets 35–44) após a promoção individual reversível da Fase 4T, antes de qualquer nova expansão populacional ou aumento adicional de profundidade.

## Contrato

A Fase 4U é exclusivamente observacional e local:

- somente usuários `population-expanded-ring-2`;
- somente usuários atualmente promovidos pela 4T;
- janela móvel de 10 observações;
- exige 5 sucessos limpos;
- qualquer falha ou aborto dentro da janela bloqueia prontidão;
- exige paridade de metadata ainda elegível;
- produz `readyForPopulationReview` apenas quando todas as condições estão satisfeitas;
- população permanece em 45%;
- budget máximo permanece em 2 writes;
- `remoteAuthority:false`.

## Isolamento arquitetural

A 4U não cria:

- novo endpoint;
- nova tabela;
- novo schema;
- nova autoridade remota;
- novo caminho de escrita;
- nova ampliação de rollout;
- novo aumento de budget.

O módulo apenas observa os eventos de estabilidade já existentes e as revogações da 4T, mantendo histórico local bounded.

## Próximo passo

Qualquer expansão além de 45% deve permanecer bloqueada até que a 4U demonstre estabilidade longitudinal suficiente para a população promovida da ring-2 e um gate posterior seja aprovado separadamente.
