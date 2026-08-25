# Fase 4K — estabilidade longitudinal da faixa expandida

## Objetivo

Medir separadamente a estabilidade dos usuários adicionados pela Fase 4J aos buckets 10–24, sem ampliar população nem orçamento remoto.

## Escopo

A Fase 4K é estritamente observacional. Ela reutiliza o histórico local já mantido pela Fase 4H e não cria um segundo ledger.

A qualificação `readyForPilotReview` exige, simultaneamente:

- `tier === expanded-base` (buckets 10–24);
- pelo menos 5 canários bem-sucedidos na janela local de até 10 observações da 4H;
- zero falhas na janela;
- zero abortos na janela;
- paridade atual da autoridade de metadados elegível.

## Limites intencionais

`readyForPilotReview` é somente diagnóstico. A Fase 4K:

- não habilita a Fase 4I;
- não libera segundo write;
- não altera o rollout-base de 25%;
- não altera o piloto original de 10%;
- não cria acesso Supabase, `fetch`, `upsert` ou `delete`;
- não altera schema, tabelas, endpoints ou domínios;
- não altera edital, flashcards ou exclusões.

## Arquitetura

O módulo `offline-sync-metadata-expanded-stability.js` consome `OfflineSyncMetadataStability.readHistory()` e `OfflineSyncMetadataRollout.getCohortAssignment()`. Ele reavalia o relatório quando a 4H emite `offline-sync-metadata-stability:observed`, somente para usuários da faixa `expanded-base`.

Isso mantém uma única fonte longitudinal de verdade e evita divergência entre dois históricos locais.

## Fase seguinte

Uma eventual expansão do piloto de 2 writes deve ser considerada somente após evidência suficiente da faixa 10–24 e deverá continuar separando os eixos população e profundidade de escrita.
