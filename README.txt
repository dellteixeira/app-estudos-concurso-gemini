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

V9.54 — EXCLUSÃO PERMANENTE MIGRADA PARA SUPABASE EDGE FUNCTION
- Remove a dependência de SUPABASE_SECRET_KEY no Cloudflare Worker para excluir contas.
- O frontend chama a Edge Function autenticada `delete-account` via supabase.functions.invoke().
- A função identifica exclusivamente o usuário pelo JWT da própria sessão; não recebe user_id arbitrário.
- A RPC `delete_my_study_data()` continua apagando os dados de estudo de forma transacional e com SECURITY INVOKER.
- Depois, a Edge Function usa a credencial administrativa fornecida automaticamente pelo ambiente hospedado do Supabase para remover auth.users.
- Após confirmação do servidor, o app limpa dados locais, IndexedDB, backups, sessão e memória, e retorna imediatamente ao login.
- O endpoint Cloudflare `/api/account/delete` foi removido e `/api/account/*` deixou de ser interceptado pelo Worker.
- O Secret SUPABASE_SECRET_KEY no Cloudflare não é mais necessário para exclusão de conta.


V9.55 — Auth Lifecycle Audit
- SIGNED_OUT/session null agora retorna imediatamente à tela de login.
- Logout usa scope local para não encerrar sessões em outros dispositivos.
- Primeiro cadastro trata corretamente projetos com ou sem confirmação de e-mail.
- Backup local registra appVersion 9.55.


V9.56 — Flashcard Smart Shuffle
- Removida a criação manual de flashcard individual da tela principal.
- Matéria e assunto permanecem como destino da importação rápida em lote.
- Todo início de treino agora embaralha os cartões com Fisher-Yates.
- Treino filtrado por matéria/assunto também é embaralhado.
- O sistema evita repetir o mesmo primeiro cartão e a mesma sequência da sessão anterior quando houver alternativas.
- Histórico de embaralhamento é isolado por usuário e concurso e removido na exclusão dos dados da conta.
- Backup local registra appVersion 9.56.

V9.57 — RETENTION ENGINE CORE
- Introduz motor de retenção em modo sombra, sem substituir o cronograma/revisões atuais.
- Estado individual por matéria/assunto: lastStudyAt, lastReviewAt, nextReviewAt, stability, difficulty, retention, reviewCount, lapseCount, totalMinutes, sessionCount e activityCounts.
- Retenção estimada por decaimento exponencial e estabilidade em dias.
- Novas sessões em studySessions alimentam automaticamente o motor.
- Histórico existente é migrado/reconstruído automaticamente a partir de studySessions.
- Sessões de revisão programada passam a registrar isRevision.
- Remoção de sessões e limpeza de cronograma reconciliam o motor de retenção.
- Dados ficam dentro de concursos_metadata, portanto entram automaticamente em Supabase user_settings, offline e Backup/Restaurar.
- Próxima etapa prevista: V9.58 — feedback Esqueci/Difícil/Bom/Fácil + reagendamento adaptativo.


V9.58 — ADAPTIVE REVIEWS
- Nova estratégia opcional Retenção Adaptativa nos dois métodos de cronograma.
- Revisões fixas deixam de ser pré-geradas quando o modo adaptativo é escolhido.
- Cada sessão de estudo agenda a próxima revisão a partir do Retention Engine.
- Após uma revisão, feedback Esqueci / Difícil / Bom / Fácil recalibra estabilidade, dificuldade, lapses e próxima revisão.
- O feedback fica persistido no studySessions e é reproduzível em rebuild do motor.
- O reagendamento respeita os dias de estudo configurados pelo cronograma atual.
- Revisões adaptativas concluídas permanecem visíveis no calendário como concluídas.
- Layout do feedback é responsivo para mobile.


V9.59 — ESTUDO POR OPORTUNIDADE / FLEXIBLE AVAILABILITY
- Novo Preenchimento 3 sem horários e sem meta diária fixa.
- Cada dia pode ser Estudo completo, Somente revisão ou Descanso.
- Novo botão “Tenho tempo agora” com 5/10/20/40/60+ min.
- Contextos: qualquer situação, deslocamento, caminhada e foco total.
- Recomendações cruzam retenção, prioridade, progresso, continuidade e flashcards.
- Retenção Adaptativa agenda revisões respeitando dias de descanso.
- Modo flexível usa o cronograma apenas para revisões; conteúdo novo é escolhido sob demanda.
- Layout responsivo otimizado para mobile.


V9.60 — RETENTION SCHEDULER + INTERFACE TEXT-ONLY
- Score único combina prioridade, peso, retenção, revisão vencida, proximidade da prova, continuidade, tempo disponível e diversidade.
- Score aplicado ao Estudo por Oportunidade e à ordenação interna das filas ponderadas do cronograma.
- Mantida intercalação de disciplinas para evitar monotonia.
- Removidos ícones/emoji visíveis de nomes, botões, navegação e rótulos; permanece apenas o símbolo gráfico do app.
- Mobile refinado para navegação textual e cartões de recomendação mais compactos.


V9.61 — ACTIVE RECALL ENGINE
- Questões passam a alimentar diretamente o Retention Engine por desempenho objetivo.
- Usuário informa somente total resolvido e acertos; erros e aproveitamento são calculados automaticamente.
- Amostras maiores têm maior confiança e impacto; 2/2 não equivale a 45/50.
- Resultado recalibra estabilidade, dificuldade, retenção e próxima revisão.
- Sessões de Questões abrem o registro de desempenho ao concluir o Pomodoro.
- Resultado de questões externas pode ser registrado sem contabilizar minutos.
- Revisões adaptativas por questões usam o desempenho objetivo no lugar da avaliação subjetiva.
- Integração com Tenho tempo agora e modal do dia.
- Interface mobile responsiva e textual, sem novos ícones.


V9.62 — RETENÇÃO E DIAGNÓSTICO + UX COMPACTA
- Painel de retenção média, risco, revisões vencidas e domínio.
- Ranking de até 5 assuntos que mais exigem atenção, com ação Estudar.
- Limpar Edital Atual agora exige duas confirmações internas consecutivas.
- Botões principais de Cronograma, Flashcards e Estudo Ativo foram compactados seguindo o padrão do botão Importar Flashcards.
- Ajustes responsivos específicos para mobile.

V9.63 — PROXIMIDADE DA PROVA + NOVA IDENTIDADE
- Nome do aplicativo alterado para Estudo Adaptativo Inteligente.
- Subtítulo antigo removido; título passa a usar a mesma altura estrutural do símbolo do app, com escala responsiva no mobile.
- Manifest/PWA atualizado para a nova identidade.
- Retention Scheduler passa a trabalhar por fases conforme a distância da prova: Construção, Consolidação, Aceleração, Revisão intensiva, Reta final e Dia da prova.
- Cada fase altera de verdade o peso de Teoria, Questões, Revisões e Lei Seca, além de reduzir conteúdo novo na reta final.
- Retenção e Diagnóstico mostra a fase atual e orientação estratégica.
- Tenho tempo agora passa a considerar a fase da prova nas recomendações.


V9.64 — Recuperação Ativa Inteligente
- Motor escolhe Questões, Flashcards, Revisão Ativa, Lei Seca, Reestudo ou Teoria.
- Decisão usa retenção, desempenho, tempo, contexto, fase da prova e recursos disponíveis.
- Revisão ativa guiada genérica funciona mesmo sem flashcards.
- Retenção Engine schema 4 registra revisao_ativa sem marcar teoria do edital indevidamente.
- Retenção e Diagnóstico também usa o seletor de método.
- Interface preservada sem ícones e responsiva no mobile.


V9.65 — Pontos Críticos e Revisão por Camadas
- Fila de pontos críticos ordenada por retenção, atraso, desempenho e sinal do Retention Scheduler.
- Quatro camadas: recuperação mental, revisão curta, questões e reestudo de teoria.
- Recomendação da camada inicial com base em evidência de domínio, sem obrigar reestudo completo.
- Integração com Retention Engine, desempenho em questões e sessões canônicas.
- Revisões curtas não concluem indevidamente a teoria do edital.
- Interface textual, compacta e responsiva para mobile.

V9.65.1 — Reorganização Adaptativa de Matérias
- O botão Reorganizar Matérias passa a usar score híbrido explícito por disciplina.
- O score combina peso, prioridade P1-P4, risco médio de retenção, revisões vencidas, desempenho recente em questões, urgência dos tópicos e proximidade da prova.
- Fair-share deixa de ser o fator dominante; passa a funcionar apenas como mecanismo de equilíbrio/frequência atendida.
- Diversidade diária e bloqueio de repetição consecutiva permanecem ativos.
- Mensagens de confirmação e conclusão foram atualizadas para refletir a lógica real do scheduler.
