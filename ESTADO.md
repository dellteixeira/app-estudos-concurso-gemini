# ESTADO DO PROJETO

Checkpoint: BACKUP-001
Data: 2026-08-20
Versao observada: 10.23.0
Branch canonica: main
Commit-base: 7a97bb2d2039e0ffbb2748bbb0e3f903bdc5f709
Commit curto: 7a97bb2

## Regra de continuidade
Ao receber o comando `consulte ESTADO.md no git`, ler este arquivo, confirmar o HEAD atual da `main` e continuar a partir do proximo pedido do usuario. Se o HEAD tiver avancado desde este checkpoint, considerar os commits posteriores antes de implementar.

## Estado funcional recente
- Visualizador PDF exclusivo da Biblioteca com canvas, camada de texto, selecao e cache offline.
- Barra de estudo do Reader permanentemente visivel.
- Flashcards, anotacoes, sublinhado e marca-texto separados funcionalmente.
- Persistencia de anotacoes aprimorada e flashcards mais inteligentes.
- Reader v10.23.0 com zoom, busca, controles por teclado e melhorias de IA.
- Quality Check, espelhamento GitLab, backup Supabase e workflows de migrations Supabase presentes no repositorio.

## Estrutura principal
- `public/`: aplicacao web/PWA e modulos do PDF Reader.
- `src/`: codigo de runtime/worker quando aplicavel.
- `tests/`: testes automatizados Node.
- `scripts/`: auditoria de release.
- `supabase/`: migrations e configuracao relacionada ao banco.
- `.github/workflows/`: CI, backups, mirror e pipeline Supabase.

## Validacao deste checkpoint
A estrutura versionada da `main` foi inspecionada via GitHub. `package.json` declara `npm test`, `npm run audit` e `npm run check`, com Node >=20. Nao houve status/check publicado pelo conector para o commit-base no momento do checkpoint. A execucao local nao foi possivel neste ambiente porque o runtime de arquivos nao possui acesso de rede ao GitHub; portanto, este checkpoint nao declara uma nova execucao local de testes.

## Protocolo operacional
- `faça backup`: consolidar memoria do projeto, registrar BACKUP-XXX, gerar ZIP integral da `main` e disponibilizar para download.
- `consulte ESTADO.md no git`: reconstruir contexto pelo repositorio antes do proximo pedido.
- `implemente`: implementar requisito aprovado em branch propria, testar e informar arquivos criados/alterados.
- `diagnostique`: investigar sem alterar inicialmente.
- `teste tudo`: executar toda a bateria disponivel.
- `verifique a produção`: conferir se Git/main, CI, migrations e deploy convergem.

## Proximo trabalho
Aguardando novo pedido de desenvolvimento apos BACKUP-001.
