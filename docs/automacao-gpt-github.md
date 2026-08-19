# Automacao GPT + GitHub

Este projeto deve usar um fluxo seguro para alteracoes feitas com GPT/Codex.

## Fluxo padrao

1. O pedido entra como issue usando o modelo `Pedido para GPT/Codex`, ou diretamente em uma tarefa do Codex com o repositorio indicado.
2. A implementacao acontece em uma branch propria, nunca diretamente na `main`.
3. A branch abre um Pull Request para `main`.
4. O GitHub executa o workflow `Quality Check`.
5. O merge so deve acontecer quando os checks estiverem verdes.
6. Depois do merge, a hospedagem/deploy configurada no projeto publica a versao atualizada.

## Regras praticas

- Nao editar a `main` manualmente quando a branch estiver protegida.
- Nao mesclar PR com check vermelho.
- Incluir migrations quando houver mudanca de banco.
- Incluir testes quando a mudanca alterar comportamento do app.
- Gerar ZIP dos arquivos canonicos alterados quando a entrega for feita por Codex.

## Como pedir uma nova alteracao

Abra uma issue em `Issues > New issue > Pedido para GPT/Codex` e preencha:

- objetivo;
- comportamento atual;
- comportamento esperado;
- prints, arquivos ou links;
- validacoes esperadas.

Depois, use essa issue como referencia na conversa com Codex/GPT.

## Como validar antes do merge

No Pull Request, confira:

- aba `Files changed`, para ver os arquivos alterados;
- area de checks, para confirmar que `Quality Check / test-and-audit` passou;
- descricao do PR, para confirmar testes, auditoria e migrations.

## Como rodar a auditoria manualmente

Na aba `Actions`, abra `Quality Check` e use `Run workflow` quando quiser reexecutar testes e auditoria sem esperar um novo push.
