# Fase 4R — expansão populacional controlada após estabilidade 4Q

## Objetivo

Retomar o eixo população após a Fase 4Q confirmar estabilidade longitudinal pós-promoção da faixa 25–34, sem ampliar simultaneamente a profundidade de escrita remota.

Mode do rollout: `metadata-rollout-cohort-v4`.

## Política populacional

- piloto original: buckets 0–9;
- faixa `expanded-base`: buckets 10–24;
- faixa `population-expanded-base`: buckets 25–34;
- nova faixa `population-expanded-ring-2`: buckets 35–44;
- excluídos: buckets 45–99.

A população-base cresce de 35% para 45%, em um novo anel de 10 pontos percentuais.

## Orçamento remoto

A nova faixa 35–44 permanece no orçamento-base de 1 write remoto por sessão canário. Ela não herda promoção 4L nem 4P, porque essas promoções continuam exigindo explicitamente os tiers `expanded-base` e `population-expanded-base`.

O teto global permanece em 2 writes apenas para usuários que já conquistaram grants de profundidade pelas políticas anteriores.

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

A 4R altera apenas população. As fases 4K–4M continuam restritas aos buckets 10–24, e 4O–4Q continuam restritas aos buckets 25–34. A nova faixa 35–44 recebe somente rollout-base e deverá acumular evidência longitudinal antes de qualquer revisão futura de profundidade.

## Release

Release candidate promovida para `v10.50.0` após pré-gate integralmente verde em sintaxe, testes automatizados, auditoria estrutural e Browser Responsive Audit. O SHA final deve repetir os mesmos gates antes do merge em `main`.
