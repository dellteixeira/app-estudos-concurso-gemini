# Fase 8C — validação da consolidação

- Base canônica: `main` em `c91d60041b3ff18e38fdd44d1c79927139136b1b`.
- Release: Web `10.64.39`; Android `10.64.39-mobile.1`; `versionCode 106441`; revision `1`.
- `domain-risk-dashboard.js` graduado para `topic-assessment.js` sem alteração do runtime cognitivo.
- Dashboard/CSS autônomos da otimização removidos fisicamente do shell.
- Painel DOM oculto da Fase 6A removido.
- Service Worker, Cloudflare no-store e `_headers` sincronizados com `config/app-assets.json`.
- Contrato crítico preservado: `editalPriority` e `topicPriority` permanecem canônicos; recomendações são contextuais; `importedOrderMutation:false` continua explícito.
- Gates executados antes do commit final: validação JSON/sintaxe, release contract, testes focados 8C, suíte completa e auditoria estrutural — todos aprovados.
