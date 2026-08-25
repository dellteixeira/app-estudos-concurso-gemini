# Fase 4E — autoridade canário de concursos_metadata

A Fase 4E promove o domínio `concursos_metadata`, iniciado em shadow na v10.35.0, para um canário remoto controlado.

## Guardrails

- nasce desligado e exige opt-in explícito;
- exige no mínimo 8 amostras shadow saudáveis, isoladas por `user_id`;
- atua somente em `user_settings` com `setting_key = concursos_metadata`;
- preserva a sequência legada `read remoto → merge preservando histórico → upsert`;
- protege alterações concorrentes por `metadataRevision`;
- limita cada sessão canário a um único write remoto;
- usa circuito próprio e o kill switch global da nova arquitetura offline;
- qualquer falha devolve a pendência intacta ao `flushPendingMetadata()` legado.

## Fora de escopo

A fase não altera sincronização de flashcards, edital, exclusão de concursos ou schema do Supabase.
