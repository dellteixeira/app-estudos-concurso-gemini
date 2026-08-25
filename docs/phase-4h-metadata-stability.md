# Fase 4H — estabilidade longitudinal de `concursos_metadata`

## Objetivo

A Fase 4H adiciona evidência longitudinal por usuário antes de qualquer expansão posterior do rollout iniciado na 4G. Ela **não amplia coorte, não aumenta orçamento remoto e não cria nova autoridade**.

## Componente

- `public/js/core/offline-sync-metadata-stability.js`
- modo: `metadata-rollout-stability-v1`
- armazenamento: `localStorage`, isolado por `user_id`
- janela: 10 observações
- requisito de estabilidade: 3 canários bem-sucedidos, zero falhas e zero aborts recentes

## Eventos observados

O ledger observa exclusivamente eventos emitidos pela autoridade 4E:

- `offline-sync-metadata-authority:flushed` → sucesso quando `handled=true` e `fallback=false`;
- `offline-sync-metadata-authority:fallback` → falha;
- `offline-sync-metadata-authority:circuit-open` → falha;
- `offline-sync-metadata-authority:canary-stopped` → abort para paradas anormais, preservando `budget-exhausted` e `completed` como encerramentos normais.

Kill switch e desativação manual não contam como falha de estabilidade.

## Critério `readyForExpansion`

O diagnóstico só retorna `readyForExpansion=true` quando, simultaneamente:

1. o usuário continua dentro da coorte determinística 4G;
2. existem pelo menos 3 canários bem-sucedidos na janela;
3. não há falha recente;
4. não há abort recente;
5. a paridade da autoridade 4E continua elegível.

Esse indicador é **apenas diagnóstico** nesta fase. Nenhum comportamento remoto muda automaticamente.

## Guardrails preservados

- orçamento remoto da 4E continua em 1 write por sessão canário;
- rollout 4G continua em 10%;
- graduação 4F continua obrigatória;
- circuit breaker e kill switch permanecem soberanos;
- nenhuma chamada Supabase, `fetch`, `upsert`, `delete` ou nova tabela é introduzida pelo ledger;
- nenhum impacto em `edital`, flashcards ou exclusões de concursos;
- histórico local é limitado a 10 observações e separado estritamente por `user_id`.

## Integração

Ordem no `AppState`:

1. metadata shadow;
2. metadata authority;
3. metadata graduation;
4. metadata rollout;
5. metadata stability;
6. autoridades do edital.

O asset integra app shell crítico, network-first e políticas no-store do PWA/Worker/Cloudflare.

## Próxima decisão

Uma fase posterior só deve ampliar orçamento ou população quando o indicador de estabilidade puder ser usado sem violar o princípio de evidência. A Fase 4H, isoladamente, não concede essa expansão.