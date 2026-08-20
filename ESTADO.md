# ESTADO DO PROJETO

Ultima consolidacao: 2026-08-20
Checkpoint: BACKUP-001
Versao do app na base do checkpoint: 10.23.0
Branch de referencia: main
Commit-base: 7a97bb2d2039e0ffbb2748bbb0e3f903bdc5f709 (7a97bb2)

## Regra de continuidade

Ao receber o comando `consulte ESTADO.md no git`, este arquivo deve ser lido antes de qualquer nova implementacao. Confirmar tambem a HEAD atual da `main`; se ela tiver avancado depois deste checkpoint, analisar os commits posteriores antes de prosseguir.

## Estado funcional consolidado

- Aplicativo de estudos com frontend web/PWA e integracao Supabase.
- Biblioteca e Reader de PDF possuem infraestrutura propria.
- Reader atual inclui selecao de texto, marcacoes/anotacoes, flashcards, zoom, busca e controles de teclado.
- Geracao de flashcards a partir de PDF utiliza heuristicas contextuais mais inteligentes.
- Fluxos de flashcard, anotacao, sublinhado e marca-texto foram separados.
- Persistencia de anotacoes recebeu tolerancia a falhas de rede.
- Existe pipeline GitHub Actions para Quality Check.
- Existem workflows para validacao e deploy de migrations Supabase.
- Existe workflow de backup Supabase e espelhamento GitLab.

## Ultimas alteracoes relevantes antes do checkpoint

1. v10.23.0 - zoom, busca, controles de teclado e IA mais inteligente no Reader PDF.
2. v10.22.0 - correcao de anotacoes PDF e flashcards mais inteligentes.
3. PR #30 - separacao de flashcards, anotacoes, sublinhado e marca-texto.
4. PR #29 - barra de estudo permanentemente visivel no Reader.
5. PR #28 - visualizador PDF exclusivo da Biblioteca.

## Estrutura critica

- `public/` - aplicacao web/PWA.
- `public/js/pdf/` - modulos da Biblioteca/Reader PDF.
- `src/` - codigo do Worker/backend versionado.
- `supabase/migrations/` - migrations do banco.
- `.github/workflows/` - CI, migrations, backup e espelhamento.
- `tests/` - testes automatizados.
- `scripts/audit-release.mjs` - auditoria estrutural/release.

## Validacao disponivel

O `package.json` define:

- `npm test` - testes Node.
- `npm run audit` - auditoria de release.
- `npm run check` - testes + auditoria.

Node requerido: >=20.

## Protocolo operacional

- `diagnostique` - investigar sem alterar codigo inicialmente.
- `implemente` - implementar a melhoria aprovada em branch propria.
- `teste tudo` - executar a bateria completa de validacao disponivel.
- `verifique a producao` - conferir main, Actions, migrations e deploy.
- `faca backup` - consolidar memoria do projeto e gerar checkpoint/ZIP canonico.

## Identificadores

- Melhorias: `APP-XXX`.
- Backups/checkpoints: `BACKUP-XXX`.
- Este e o primeiro checkpoint formal: `BACKUP-001`.

## Pendencias

Consultar `docs/ROADMAP.md`. Novas ideias encontradas durante uma implementacao devem ser registradas, nao misturadas automaticamente ao escopo atual.

## Regra de seguranca

Nao armazenar tokens, senhas, chaves privadas ou outros secrets nestes documentos ou nos ZIPs canonicos. Alteracoes funcionais devem continuar por branch/PR e preservar implementacoes existentes salvo instrucao expressa em contrario.
