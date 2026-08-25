# Fase 4N — expansão populacional controlada após estabilidade 4M

## Objetivo

Retomar o eixo população após a Fase 4M confirmar estabilidade longitudinal pós-promoção, sem ampliar simultaneamente a profundidade de escrita remota.

Mode do rollout: `metadata-rollout-cohort-v3`.

## Política populacional

- piloto original: buckets 0–9;
- faixa `expanded-base` já validada: buckets 10–24;
- nova faixa `population-expanded-base`: buckets 25–34;
- excluídos: buckets 35–99.

A população-base cresce de 25% para 35%, em um anel adicional de 10 pontos percentuais.

## Orçamento remoto

A nova faixa 25–34 permanece no orçamento-base de 1 write remoto por sessão canário. Ela não pode herdar promoção 4L, porque a promoção continua exigindo explicitamente `tier === expanded-base`.

O teto global permanece em 2 writes apenas para usuários já elegíveis pelas políticas anteriores.

## Guardrails preservados

- graduação 4F obrigatória;
- paridade da autoridade de metadata;
- circuit breaker e kill switch;
- fallback legado;
- hash determinístico de bucket;
- isolamento por usuário;
- nenhum novo schema, endpoint, tabela ou domínio;
- nenhuma alteração em edital, flashcards ou exclusões.

## Separação de eixos

A 4N altera apenas população. As fases 4K, 4L e 4M continuam restritas aos buckets 10–24 por meio do tier `expanded-base`. A nova faixa 25–34 recebe somente rollout-base e deverá acumular evidência longitudinal antes de qualquer revisão futura de profundidade.

## Release

Durante implementação e pré-gate, a identidade permanece em `v10.44.0`. Somente após Syntax Check, testes automatizados, Structural Audit e Browser Responsive Audit integralmente verdes a candidata poderá ser promovida para `v10.45.0`.
