# Fase 4G — rollout controlado de `concursos_metadata`

Release-alvo: **v10.38.0**.

## Contrato

- `OfflineSyncMetadataRollout` é uma camada de governança externa à graduação 4F.
- A coorte inicial é determinística por `user_id`, com buckets 0–99 e inclusão nos primeiros 10%.
- Pertencer à coorte não concede autoridade por si só: `OfflineSyncMetadataGraduation.getEligibility()` deve permanecer elegível.
- A autoridade remota continua pertencendo exclusivamente a `OfflineSyncMetadataAuthority` (Fase 4E), com seu orçamento canário vigente.
- O rollout não possui `fetch`, `.from()`, `.upsert()` ou `.delete()` próprios.
- O rollout nasce desligado, mantém opt-in/estado por usuário e é reversível.
- Stop da graduação, circuit breaker/fallback propagado ou kill switch desativam a camada de rollout.
- O escopo continua restrito a `user_settings:concursos_metadata:upsert`.
- Nenhuma semântica de flashcards, exclusão de concurso ou autoridade do edital é alterada.

## Gates

A promoção somente pode ser considerada canônica depois de:

1. Quality Check do PR no SHA promovido;
2. squash merge preso ao SHA aprovado;
3. Quality Check da `main`;
4. Cloudflare Production Verify;
5. Canonical GitHub Release;
6. prova `v10.38.0...main` com `status=identical`, `ahead_by=0`, `behind_by=0` e `total_commits=0`.
