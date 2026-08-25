# Fase 4J — expansão populacional em duas camadas

## Objetivo

Ampliar a população observada por `concursos_metadata` sem ampliar simultaneamente a profundidade de escrita remota.

## Política

- rollout-base: 25% dos usuários, determinado pelo bucket estável derivado de `user_id`;
- piloto interno: os 10% originais (`bucket < 10`);
- faixa expandida-base: `bucket >= 10 && bucket < 25`;
- excluídos: `bucket >= 25`.

## Orçamento remoto

- faixa expandida-base: permanece limitada ao orçamento-base de 1 write remoto por sessão canário;
- piloto interno: pode continuar elegível à Fase 4I, com no máximo 2 writes por sessão, somente após estabilidade 4H e opt-in 4I;
- o teto global da autoridade continua rigidamente limitado a 2.

## Guardrails preservados

- graduação 4F obrigatória;
- paridade/eligibilidade da autoridade de metadados;
- circuit breaker;
- kill switch compartilhado;
- fallback legado;
- isolamento por usuário;
- nenhuma alteração de schema, endpoint, tabela ou domínio;
- nenhuma alteração em `edital`, flashcards ou exclusões.

## Compatibilidade

Os buckets continuam usando o mesmo hash determinístico da Fase 4G. Assim, todos os usuários do piloto original permanecem no piloto; a Fase 4J apenas inclui adicionalmente os buckets 10–24 no rollout-base.

As chaves persistentes de opt-in e estado existentes permanecem compatíveis e não exigem migração.

## Fail-closed da Fase 4I

A expansão de orçamento não usa mais a simples participação no rollout-base. Ela exige explicitamente `getPilotCohortAssignment().included === true`. Dessa forma, um usuário da faixa 10–24 pode participar do canário-base e acumular evidência local, mas não pode receber o segundo write nesta fase.

## Critério para fase seguinte

Uma expansão posterior do piloto de dois writes só deve ser considerada depois que a faixa 10–24 acumular evidência longitudinal suficiente sem regressões, mantendo separados os eixos população e orçamento remoto.
