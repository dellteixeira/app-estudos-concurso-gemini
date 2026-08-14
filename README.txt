PAINEL DE ESTUDOS — V9.49 — Intercalação Ponderada de Disciplinas
Base incremental: V9.47 — Mobile Layout Polish
Data: 14/08/2026

V9.46 — Backup local automático + recuperação

- Mantém dois snapshots locais por usuário: Backup Atual e Backup Anterior.
- Armazena os snapshots em IndexedDB separado: painel-estudos-backups / snapshots.
- Protege concursos, edital verticalizado, cronograma, sessões, horas, progresso, revisões, anotações, flashcards, Lei Seca e configurações do planejamento.
- PDFs anexados não são duplicados no backup; permanecem no IndexedDB de arquivos existente.
- Backup automático com debounce após alterações relevantes e criação manual disponível em "Backup / Restaurar".
- Restauração recria a fila pending_sync para que o estado recuperado seja sincronizado com o Supabase.
- Antes de restaurar, o estado atual é preservado como snapshot de segurança.

Nenhuma alteração no Supabase é necessária.


V9.49 — Intercalação Ponderada de Disciplinas (14/08/2026)
- Cronogramas dos Métodos 1 e 2 agora escolhem a disciplina antes do assunto.
- Prioridades 1–4 são ponderadas em P1=4, P2=3, P3=2, P4=1 quando não houver peso explícito.
- O mesmo dia tenta usar disciplinas diferentes antes de repetir uma matéria.
- A mesma disciplina não é repetida consecutivamente enquanto existir alternativa elegível.
- Reorganizar Matérias usa a mesma lógica de intercalação e preserva o histórico anterior.
- Horas personalizadas por dia da semana continuam sendo respeitadas.
- Planos de assuntos longos da V9.48 permanecem compatíveis.

V9.48 — Assuntos Longos / Blocos de Estudo (14/08/2026)
- Evolução incremental sobre a V9.47, sem troca de arquitetura.
- Novo planejamento opcional por assunto para Teoria: sessões/blocos, carga em minutos ou número de aulas.
- Assuntos sem plano continuam com o comportamento histórico.
- Uma sessão de Teoria não conclui automaticamente um assunto que possua plano ainda incompleto.
- Progresso do plano aparece no modal diário e no Edital Verticalizado.
- Modo Aulas possui ação explícita "✓ Aula", permitindo que uma aula utilize mais de um Pomodoro antes de ser marcada como concluída.
- Assuntos longos incompletos recebem continuação futura sem duplicar a linha do edital.
- Revisões do assunto planejado são removidas enquanto a Teoria estiver incompleta e reancoradas quando o plano de Teoria for concluído.
- studySessions permanece como fonte canônica de horas estudadas.
- Metadados novos ficam em concursos_metadata_<user_id> > <concurso> > topicStudyPlans.

V9.50 — Isolamento de primeiro acesso / troca de usuário
- Corrigido vazamento visual de estado entre contas usadas no mesmo navegador.
- O último concurso selecionado agora é salvo por usuário (`last_studied_concurso_<user_id>`), e a chave global antiga deixa de ser usada.
- Ao trocar de conta, o estado em memória (edital, flashcards, filtros, fila de estudo e contexto ativo) é zerado antes de carregar os dados do novo usuário.
- Conta nova sem dados inicia com "Crie um concurso para começar", 00:00 estudado e sem meta/cronograma herdados.
- Nenhum dado persistente de outra conta é apagado; os armazenamentos continuam separados por user_id.


V9.51 — MINHA CONTA E EXCLUSÃO TOTAL DE DADOS
- Botão Conta ao lado de Sair.
- Modal com e-mail, troca de senha e acesso ao Backup/Restaurar.
- Exclusão total dos dados de estudo preservando o login.
- Exclusão remota transacional via RPC delete_my_study_data.
- Limpeza local por usuário de localStorage, PDFs e backups IndexedDB.
- Requer executar o SQL SUPABASE_V9_51_DELETE_MY_STUDY_DATA.sql fornecido separadamente.


V9.52 — Account Backup Cleanup
- Remove o atalho duplicado Backup / Restaurar da barra principal de ações.
- Backup / Restaurar permanece acessível em Conta > Seus dados.
- No mobile, a grade de ferramentas mantém duas colunas e o último item ocupa a linha completa, reduzindo ruído visual.
- Nenhuma lógica de backup, restauração, Supabase ou IndexedDB foi alterada.

V9.53 — EXCLUSÃO PERMANENTE DE CONTA / LIMPEZA ESTRITA
- "Apagar todos os dados" foi explicitamente separado de "Excluir minha conta".
- A exclusão permanente remove primeiro os dados de estudo pela RPC delete_my_study_data() e depois remove o usuário do Supabase Auth por endpoint protegido no Cloudflare Worker.
- O frontend nunca recebe nem armazena a chave administrativa do Supabase.
- Após exclusão confirmada, o app limpa dados locais do usuário, PDFs, todos os snapshots de backup vinculados ao user_id, chaves legadas conhecidas, sessão Supabase e estado em memória; em seguida volta imediatamente à tela de login e recarrega em contexto anônimo.
- O endpoint /api/account/delete exige Bearer token válido do próprio usuário.
- CONFIGURAÇÃO OBRIGATÓRIA NO CLOUDFLARE: adicionar um Secret chamado SUPABASE_SECRET_KEY com uma Secret API Key do Supabase (sb_secret_...). Alternativamente, por compatibilidade, SUPABASE_SERVICE_ROLE_KEY também é aceito.
- Nunca colocar SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY no public/index.html, wrangler.jsonc versionado ou qualquer arquivo servido ao navegador.
- A RPC delete_my_study_data() da V9.51 continua obrigatória para a exclusão transacional dos dados antes da remoção de auth.users.
