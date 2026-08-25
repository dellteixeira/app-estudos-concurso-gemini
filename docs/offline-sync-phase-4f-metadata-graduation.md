# Offline Sync — Fase 4F

Release-alvo: **v10.37.0**.

A Fase 4F adiciona um coordenador de graduação para `concursos_metadata` sem criar um novo caminho remoto.

## Contrato

- `OfflineSyncMetadataGraduation` governa exclusivamente `OfflineSyncMetadataAuthority`.
- A graduação nasce desligada e somente pode ser ativada quando a autoridade 4E já estiver elegível.
- O escopo permanece `user_settings:concursos_metadata:upsert`.
- O coordenador não executa `fetch`, `.from()`, `.upsert()` ou `.delete()`.
- Fallback, abertura de circuito ou encerramento do canário desabilitam imediatamente a graduação e a autoridade filha.
- O kill switch global continua soberano.
- Estado e opt-in da graduação são persistidos por usuário.
- Todo write remoto continua sujeito aos guardrails da 4E, incluindo paridade, merge preservando histórico, `metadataRevision`, orçamento e fallback legado.
