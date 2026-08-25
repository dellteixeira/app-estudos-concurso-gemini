# Fase 4Q — estabilidade pós-promoção da faixa 25–34

## Objetivo

Observar longitudinalmente, de forma local e reversível, os usuários da faixa `population-expanded-base` (buckets 25–34) que foram promovidos individualmente pela Fase 4P para até 2 writes.

## Contrato

- população total permanece em 35%;
- orçamento máximo permanece em 2 writes para usuários promovidos;
- nenhuma nova autoridade remota, endpoint ou schema Supabase;
- histórico local limitado a 10 observações por usuário;
- prontidão exige 5 sucessos limpos, zero `failure`, zero `aborted` e paridade de metadata elegível;
- apenas `tier === population-expanded-base` participa;
- apenas promoção 4P atualmente ativa pode acumular sucesso pós-promoção;
- revogações da 4P são registradas como `failure` ou `aborted` conforme a origem;
- a saída `readyForPopulationReview` é somente evidência diagnóstica para uma fase futura, sem ampliar rollout automaticamente.

## Sequência arquitetural

`4N expansão 35% → 4O estabilidade 25–34 → 4P promoção individual 1→2 writes → 4Q estabilidade pós-promoção`

A 4Q é deliberadamente separada da 4O. A 4O mede segurança antes do aumento de profundidade; a 4Q mede o comportamento depois da promoção, preservando causalidade, rollback e auditabilidade.

## Release

Durante implementação e pré-gate, a identidade pública permanece `v10.48.0`. A promoção para `v10.49.0` deve ocorrer somente após os gates integrais de qualidade e responsividade ficarem verdes.
