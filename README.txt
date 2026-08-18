V10.8.2 — EXCLUSÃO GRANULAR E ORDEM CANÔNICA POR PRIORIDADE
- Adicionado botão Excluir Assunto ao lado de Excluir Matéria.
- Exclusão de assunto remove apenas o item do Edital Verticalizado; matéria, notas, flashcards e histórico são preservados.
- Criada ordem canônica global: prioridade da matéria, ordem manual dentro da mesma prioridade e prioridade dos assuntos.
- Anotações, Flashcards, seletores e pastas passam a respeitar a ordem do Edital Verticalizado.
- Exportação de flashcards também preserva a ordem canônica.

V10.8.1 — NAVEGAÇÃO DIRETA PARA CRONOGRAMA, FLASHCARDS E ANOTAÇÕES
- Ao selecionar Cronograma, Flashcards ou Anotações, a viewport é posicionada diretamente na área de trabalho correspondente.
- O comportamento é o mesmo no mobile e no desktop, com compensação automática para o cabeçalho sticky no desktop.
- Cronograma abre diretamente no Calendário de Estudos, ignorando visualmente o painel de revisões acima.
- Flashcards abre diretamente em Flashcards e Estudo Ativo.
- Anotações abre diretamente em Anotações e Caderno de Resumos.
- A ordem das abas desktop foi alinhada à navegação mobile: Edital, Cronograma, Flashcards, Anotações.
- A navegação inferior mobile e a ação contextual existente foram preservadas.

V10.7.9 — ÁREA DE ESCRITA DAS NOTAS AMPLIADA
- Modal Nova Nota / Editar Nota passa a usar até 980 px de largura no desktop.
- Campo Conteúdo / Resumo / Dicas agora ocupa aproximadamente 46% da altura da viewport, com mínimo de 360 px e máximo de 620 px no desktop.
- Ajuste responsivo para notebooks com pouca altura e para celulares.
- Mantidos os campos de matéria, assunto, título e ações originais.
- Nenhuma alteração em armazenamento, sincronização ou lógica das notas.

V10.7.8 — AJUSTE TIPOGRÁFICO DE RETENÇÃO E DIAGNÓSTICO
- Redução dos rótulos Retenção média, Assuntos em risco, Revisões vencidas e Assuntos dominados.
- Menor peso tipográfico para reforçar o visual minimalista.
- Aumento do respiro lateral dos textos.
- Pequeno refinamento no tamanho dos ícones e no espaçamento interno dos cards.
- Estrutura, métricas, barras e lógica de retenção preservadas.

ESTUDO ADAPTATIVO INTELIGENTE — V10.7.5 — Aquisição Adaptativa de Conteúdo
Base incremental: V9.65.7 — Controle de Atualização do PWA
Data: 15/08/2026

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

V9.65.3 - Corrige Limpar Edital Atual com exclusao local imediata + fila Supabase e anexa a navegacao principal a barra de concurso.


V9.65.3 — correções de ações do concurso, Limpar Edital Atual e remoção da redundância Tenho tempo agora no topo.

V9.65.4 — reordenação fluida de matérias por Pointer Events: clique/segure e arraste, ghost visual, marcador de inserção, autoscroll, long-press mobile e ordem manual soberana entre matérias com a mesma prioridade.

V9.65.5 — ordem das barras do cabeçalho invertida: controles do concurso acima e navegação principal abaixo, mantendo mobile inalterado.


V9.65.6 — AUDITORIA CONSOLIDADA
- Auditoria estática e estrutural completa sobre a V9.65.5.
- Escala de prioridade unificada em P1–P4 no frontend e no Cloudflare Worker/Workers AI.
- Criação manual de matéria passa a usar peso coerente P1=4, P2=3, P3=2, P4=1.
- Normalização do preview/importador de IA aceita P4.
- Cache-busting do manifest/service worker atualizado.
- Ícones do PWA incluídos no app shell offline.
- Mantidas as correções anteriores de concursos, Limpar Edital Atual, drag fluido e barras invertidas.


V9.65.7 — CONTROLE DE ATUALIZAÇÃO DO PWA
- Exibe permanentemente a versão atual (V9.65.7) no cabeçalho.
- Detecta Service Worker novo sem ativá-lo silenciosamente.
- Mostra aviso 'Nova versão disponível' com botão 'Atualizar agora'.
- Ao confirmar, envia SKIP_WAITING ao Worker novo e recarrega apenas após controllerchange.
- Verifica atualizações ao abrir, ao voltar para a aba, ao recuperar conexão e a cada 5 minutos.
- Mantém updateViaCache='none' e cache-busting da URL do sw.js para reduzir retenção de versão antiga em Firefox/Chromium.
- CACHE_NAME: estudo-adaptativo-v9-65-7-controle-atualizacao-pwa-20260815.

V9.66.1 — PERFORMANCE, CONSISTÊNCIA E SEGURANÇA (15/08/2026)
- Modularização de baixo risco: CSS principal em public/app.css, lógica principal em public/app.js e ciclo de atualização PWA em public/pwa-update.js.
- public/index.html reduzido drasticamente para acelerar parsing inicial e permitir cache/revalidação independente de CSS e JavaScript.
- Sincronização local-first por delta: metadados, edital e flashcards são persistidos localmente de imediato e alterações rápidas são agrupadas antes do envio ao Supabase.
- Sincronização completa cancela timers de delta antes do flush, reduzindo requisições duplicadas e condições de corrida.
- Busca global com debounce para evitar recalcular resultados a cada tecla.
- Renderização do Edital Verticalizado passou a montar HTML em memória e aplicar ao DOM em uma única operação.
- Telemetria de performance estritamente local em window.__appPerformance, sem envio de dados para terceiros.
- Importações JSON e flashcards agora possuem limite de arquivo, profundidade, complexidade, quantidade de itens, tamanho de campos e bloqueio de chaves perigosas.
- Novo public/_headers com CSP, HSTS, anti-framing, nosniff, Referrer-Policy e Permissions-Policy para os assets servidos pela Cloudflare.
- Worker endurecido com Content-Type obrigatório, limite de payload, normalização de entradas e limites para matérias/tópicos.
- Rate limiting oficial da Cloudflare no endpoint /api/ai/analisar-edital: 12 solicitações por usuário a cada 60 segundos por localização Cloudflare.
- Service Worker inclui app.css, app.js e pwa-update.js no app shell offline.
- Supabase/RLS e studySessions permanecem sem mudança de contrato.


V9.66.1 — CORREÇÃO DA ORDENAÇÃO POR PRIORIDADE (15/08/2026)
- Prioridade da matéria volta a ser a regra soberana de exibição: P1, P2, P3 e P4.
- A ordem manual por arraste continua soberana apenas entre matérias da mesma prioridade.
- Matérias novas entram automaticamente no bloco correto de prioridade, mesmo quando já existe materiaOrder salvo.
- Ao arrastar para outro bloco, a matéria continua herdando a prioridade do destino.


V9.66.2 — CORREÇÃO DA CONTABILIZAÇÃO DE HORAS (15/08/2026)
- Encerramento automático do Pomodoro agora aguarda a gravação canônica em studySessions antes de concluir o fluxo.
- Contadores de horas, estudado hoje e horas por matéria atualizam imediatamente após a persistência local.
- Sincronização de concursos_metadata ganhou revisão monotônica para impedir que um upload antigo limpe o dirty flag de uma alteração mais nova.
- Se os metadados mudarem durante um upload, a nova revisão permanece pendente e é reenviada automaticamente.
- CACHE_NAME: estudo-adaptativo-v9-66-2-contabilizacao-horas-20260815.


V9.66.3 — AUDITORIA DE SESSÕES E GRÁFICO DE PROGRESSO (15/08/2026)
- Registro do Pomodoro passa a confirmar explicitamente o commit de studySessions.
- Contadores, checkboxes, tabela, modal diário e gráfico são atualizados imediatamente após a gravação local.
- Redução de dependência de renderização em idle callback para feedback pós-sessão.
- Diagnóstico local window.__studyDiagnostics guarda somente o último commit para depuração.
- Progresso geral exibe frações abaixo de 1% em vez de arredondar silenciosamente para 0%.
- Gráfico redesenhado com trilhos verticais arredondados e preenchimentos em gradiente, seguindo a referência visual enviada.
- CACHE_NAME: estudo-adaptativo-v9-66-3-auditoria-sessoes-grafico-20260815.


V9.66.4 — UX DE AULAS E TRANSPARÊNCIA DE TEMPO (15/08/2026)
- Mudança incremental sobre a V9.66.3.
- No modo Número de aulas, o cartão diário mostra o tempo total já registrado para o assunto em studySessions, separado do percentual de aulas concluídas.
- O percentual foi rotulado como 'Progresso das aulas' para evitar confusão com horas estudadas.
- Campo de duração agora aparece como 'Sessão [N] min'.
- Botões renomeados para 'Estudar Teoria', 'Estudar Questões', 'Registrar questões externas' e '✓ Concluir esta aula'.
- Tooltips deixam explícito que sessões de estudo contabilizam minutos e que concluir aula não adiciona tempo.
- studySessions permanece como fonte canônica do tempo; nenhum schema, RLS ou contrato de sincronização foi alterado.
- CACHE_NAME: estudo-adaptativo-v9-66-4-ux-aulas-tempo-20260815.


V9.66.5 — LAYOUT COMPACTO DAS AÇÕES DE ESTUDO (15/08/2026)
- No cartão diário, "Sessão [N] min" foi movido para a mesma faixa dos checkboxes Teoria e Questões.
- Estudar Teoria, Estudar Questões, Registrar questões externas e Lei Seca ficam alinhados em uma única linha no desktop quando disponíveis.
- Os botões de estudo foram compactados sem alterar funções, eventos ou contabilização em studySessions.
- No mobile (até 700 px), os quatro botões passam para grade 2x2, evitando rolagem horizontal e mantendo boa área de toque.
- Em telas muito estreitas (até 390 px), tipografia, campo de minutos e espaçamentos recebem compactação adicional.
- Supabase, RLS, schema, sincronização e Worker permanecem inalterados.
- CACHE_NAME: estudo-adaptativo-v9-66-5-layout-acoes-cronograma-20260815.


V9.66.6 — REORGANIZAÇÃO VISUAL DAS AÇÕES DO CRONOGRAMA (15/08/2026)
- Mudança incremental sobre a V9.66.5, sem alteração da lógica de estudo ou de sincronização.
- Planejar e Editar foram movidos para a linha principal, imediatamente após Registrar questões externas.
- Apagar foi movido para junto de Sessão [N] min, reduzindo uma linha visual do cartão.
- No desktop, Estudar Teoria, Estudar Questões, Registrar questões externas, Planejar, Editar e Lei Seca formam uma faixa compacta quando disponíveis.
- No mobile, a faixa de ações usa grade responsiva 3 colunas até 700 px e 2 colunas até 480 px, sem rolagem horizontal.
- Em telas estreitas, Sessão [N] min e Apagar permanecem juntos e quebram como uma unidade para uma nova linha quando necessário.
- O botão ✓ Concluir esta aula permanece separado quando o planejamento usa Número de aulas.
- studySessions, Supabase, RLS, schema, sincronização e Worker permanecem inalterados.
- CACHE_NAME: estudo-adaptativo-v9-66-6-layout-acoes-cronograma-20260815.


V9.66.7 — CABEÇALHO COM BUSCA INTEGRADA E REORDENAÇÃO DE AÇÕES (16/08/2026)
- Barra de pesquisa movida para o cabeçalho, ao lado da ação Sair.
- Botão Modo Claro/Escuro reposicionado entre Conta e Sair.
- Barra de ações principal limpa, removendo o atalho duplicado de tema.
- Layout do cabeçalho reorganizado para melhor equilíbrio visual no desktop.
- No mobile, o cabeçalho passa a organizar Conta, Modo, Sair e Busca em grade responsiva, sem rolagem horizontal.
- CACHE_NAME: estudo-adaptativo-v9-66-7-header-busca-botoes-20260816.


V9.66.8 — REFINAMENTO PREMIUM DO CABEÇALHO (16/08/2026)
- Cabeçalho reorganizado em bloco de gestão do concurso/status e cluster de utilidades.
- Conta, Modo Claro/Escuro e Sair agrupados visualmente; pesquisa permanece imediatamente ao lado de Sair no desktop.
- Busca recebeu largura adaptativa, ícone discreto, foco visual e dropdown com ancoragem local.
- Melhor equilíbrio de espaçamento, alturas e densidade dos controles em telas grandes.
- Entre 901 e 1500 px, cluster de utilidades quebra para uma segunda faixa sem comprimir o seletor do concurso.
- No mobile, Conta/Modo/Sair formam três colunas e a pesquisa ocupa uma linha completa abaixo.
- Tema claro recebeu ajustes equivalentes de contraste e acabamento.
- CACHE_NAME: estudo-adaptativo-v9-66-8-header-premium-20260816.


V9.66.9 — PADRONIZAÇÃO DO CABEÇALHO E BUSCA CONTIDA (16/08/2026)
- Padronização visual dos botões do cabeçalho: mesma altura, raio e linguagem visual.
- Remoção do agrupamento visual inconsistente dos botões Conta/Modo/Sair; agora seguem padrão uniforme.
- Barra de pesquisa ajustada para respeitar o espaço disponível da barra, com largura fluida e margem de segurança.
- Cluster utilitário reorganizado para evitar estouro horizontal no desktop.
- Breakpoints refinados para preservar o padrão visual no mobile.
- CACHE_NAME: estudo-adaptativo-v9-66-9-header-padrao-busca-segura-20260816.


V10.0.0 — DESIGN SYSTEM DARK COACHING UI — ETAPA 1 (16/08/2026)
- Nova identidade visual baseada na referência fornecida: azul-preto profundo, superfícies em camadas e ciano/turquesa como acento principal.
- Padronização global de cards, bordas, sombras, botões, inputs, tabelas, modais, barras de progresso e navegação.
- Acentos secundários: violeta para contexto/status, âmbar para atenção e vermelho suave para ações destrutivas.
- Redução de saturação e sombras para aparência mais técnica e premium.
- Nenhum módulo principal foi reposicionado nesta etapa.
- Nenhuma alteração de lógica, banco, sincronização ou studySessions.
- CACHE_NAME: estudo-adaptativo-v10-0-0-design-system-dark-coaching-20260816.


V10.1.0 — ETAPA 2 / COMPOSIÇÃO E DENSIDADE DO DASHBOARD (16/08/2026)
- Alteração exclusivamente visual, sem mudança de regras de negócio ou eventos.
- Dashboard ampliado e alinhado em malha mais densa.
- Cards de resumo compactados e padronizados.
- Retenção e Diagnóstico reorganizado em faixa analítica horizontal no desktop.
- Pomodoro reorganizado em composição compacta de duas colunas no desktop.
- Painel de Progresso recebeu proporção maior e melhor aproveitamento vertical.
- Barra de ações compactada.
- Breakpoints específicos para desktop intermediário, tablet e mobile.
- CACHE_NAME: estudo-adaptativo-v10-1-0-dashboard-composition-20260816.


V10.1.1 — FIXES CRONOGRAMA E FLASHCARDS (16/08/2026)
- Botão Lei Seca ajustado para respeitar a largura da linha e os respiros do card no cronograma.
- Botão Fechar (ESC) do modal de conteúdo do dia corrigido para ficar contido no layout, sem extrapolar o rodapé.
- Cor do numeral/quantidade de cartões em Flashcards alinhada ao botão Abrir Caixa.
- Ajustes responsivos adicionais para o cronograma e rodapé do modal.
- CACHE_NAME: estudo-adaptativo-v10-1-1-fixes-cronograma-flashcards-20260816.


V10.1.2 — BUSCA MODAL E GRADIENTES POR MATÉRIA (16/08/2026)
- Busca inline do cabeçalho substituída por botão Pesquisar.
- Botão abre diálogo dedicado de busca global com resultados do edital, anotações e flashcards.
- Cada matéria do gráfico/legenda passa a receber gradiente próprio, distribuído pelo círculo cromático para reduzir repetições.
- Cabeçalho ganha mais espaço útil e elimina campo de busca comprimido.
- CACHE_NAME: estudo-adaptativo-v10-1-2-busca-modal-gradientes-materias-20260816.


V10.3.0 — AUDITORIA MOBILE DE LAYOUT (16/08/2026)
- Cabeçalho mobile: Conta, Modo Claro/Escuro e Sair alinhados em uma única linha.
- Gráfico de progresso mobile: barras e trilhos mais finos, espaçamento ampliado e legenda refinada.
- Formulário manual do edital: Matéria, Assunto e Importância na mesma linha; Matéria/Assunto abrem editor mobile dedicado.
- Cronograma: seis ações principais mantidas em uma única linha com rótulos compactos em até duas linhas.
- Flashcards: dois botões de estudo alinhados em uma única linha.
- Auditoria adicional de overflow, FAB, áreas de toque e contenção de componentes.
- CACHE_NAME: estudo-adaptativo-v10-2-0-auditoria-mobile-layout-20260816.


V10.3.0 — MINIMALISMO DO HEADER + CRONOGRAMA POR PRIORIDADE (16/08/2026)
- Cabeçalho desktop reorganizado em uma única linha, com botões uniformes e visual mais minimalista.
- Gráfico de Progresso Geral refinado com barras mais finas e discretas.
- Removido o destaque ciano lateral das linhas adaptativas do edital.
- Implementado aviso de reorganização inteligente do cronograma quando prioridades/ordem do Edital Verticalizado forem alteradas.
- Diagnóstico de retenção redistribuído em uma composição mais equilibrada, preservando a responsividade mobile.
- CACHE_NAME: estudo-adaptativo-v10-3-0-layout-minimal-prioridade-cronograma-20260816.


V10.4.0 — CALENDÁRIO ESTILO PAINEL + AJUSTES DE POMODORO E DIAGNÓSTICO (16/08/2026)
- Calendário mensal redesenhado com cabeçalho próprio, rodapé-resumo, progresso por dia e cards mais próximos da referência visual escolhida.
- Painel Retenção e Diagnóstico reorganizado com distribuição em três áreas e texto auxiliar explicativo.
- Pomodoro ajustado para padronizar hierarquia visual dos títulos e manter Intervalo/Concluir sessão com a mesma linguagem cromática.


V10.6.7 — AUDITORIA MOBILE CONSOLIDADA (16/08/2026)
- Corrigido espaço lateral desperdiçado no cabeçalho mobile.
- Ação contextual Novo integrada à barra inferior, eliminando sobreposição sobre os cards.
- Ajustados alinhamentos, contenção horizontal, gaps e densidade visual em telas pequenas.
- Auditoria conservadora das regras legadas de CSS documentada em RELATORIO_AUDITORIA_MOBILE_V10_5_0.txt.
- CACHE_NAME: estudo-adaptativo-v10-5-0-auditoria-mobile-consolidada-20260816.


V10.6.7 — RETENÇÃO E DIAGNÓSTICO ALINHADO AO LAYOUT DE REFERÊNCIA (16/08/2026)
- Removido o texto explicativo extra do painel Retenção e Diagnóstico.
- Reorganização do painel para espelhar o layout de referência: bloco esquerdo com título/subtítulo/CTA, bloco central com métricas e estratégia da prova, bloco direito com Pontos críticos e mensagem/itens.
- Ajustes finos de alinhamento, proporção e espaçamento no desktop e preservação da responsividade mobile.


V10.6.7 — AJUSTES PONTUAIS DE CALENDÁRIO E CRONOGRAMA (16/08/2026)
- Calendário: removida a barra de rolagem interna dos cards do dia e preservado o indicador +N de matérias extras.
- Cronograma diário: reorganizadas apenas as linhas de botões do modal do dia, com Estudar Teoria/Estudar Questões ao lado da sessão e, abaixo, Apagar/Registrar questões externas/Planejar/Editar.
- Mantida coerência no mobile sem alterar outros blocos do layout.


V10.6.7 — AJUSTES ESTRITAMENTE PONTUAIS DE CALENDÁRIO E MODAL DO DIA (16/08/2026)
- Removido o botão “Abrir” dos cards do calendário mensal.
- O indicador de matérias ocultas (+N) passou para o canto superior direito do card do dia, no lugar do antigo botão Abrir.
- No modal do dia, em desktop, Estudar Teoria e Estudar Questões ficam ao lado do campo Sessão/min na mesma linha.
- Na linha inferior ficaram: Apagar, Planejar, Editar e Registrar questões externas.
- Nenhum outro bloco de layout foi alterado nesta versão.


V10.6.7 — AJUSTES PONTUAIS POMODORO E AÇÕES DO DIA (16/08/2026)
- Alinhado o título Relógio Pomodoro ao título Progresso Geral de Estudo e harmonizados somente os espaçamentos internos do card Pomodoro.
- Modal do dia: Sessão/min + Estudar Teoria + Estudar Questões passam a integrar a mesma linha estrutural.
- Linha inferior mantida exclusivamente com Apagar, Planejar, Editar e Registrar questões externas.
- Nenhum outro layout foi alterado.


V10.6.7 — POMODORO: INTERVALO E CONCLUIR SESSÃO IGUAIS AO RESETAR (16/08/2026)
- Alteração estritamente visual: Intervalo e Concluir sessão agora usam exatamente a mesma classe visual de Resetar (btn-secondary).
- Removido o estilo ciano específico desses dois botões.
- Resultado válido nos modos claro e escuro.
- Nenhum outro layout ou comportamento foi alterado.


V10.6.7 — LEI SECA NA MESMA LINHA DAS AÇÕES DE ESTUDO (16/08/2026)
- Alteração exclusiva do grupo de ações do tópico no modal do calendário.
- Lei Seca passa a ficar ao lado de Estudar Questões, na mesma linha de Sessão/min, Estudar Teoria e Estudar Questões.
- Três botões de estudo com altura idêntica e larguras proporcionais, com compactação responsiva no mobile.
- Nenhum outro bloco de layout foi alterado.


V10.6.7 — CORREÇÃO DE CACHE/PWA (16/08/2026)
- Sem mudança de layout.
- Eliminado identificador antigo fixo ?v=20260815-9663 dos assets principais.
- Assets centrais passam a priorizar rede e usar cache apenas como fallback offline.
- CACHE_NAME: estudo-adaptativo-v10-5-7-cache-busting-assets-20260816.


V10.6.7 — AJUSTE EXCLUSIVO DO POMODORO (16/08/2026)
- Título Relógio Pomodoro reposicionado alguns pixels para alinhar visualmente sua linha de base ao título Progresso Geral de Estudo (%).
- Aumentado de forma sutil o respiro antes e dentro do bloco Horas Pomodoro do Dia.
- Nenhum outro layout ou componente foi alterado.


V10.6.7 — ALINHAMENTO VERTICAL EXCLUSIVO DO TÍTULO DO POMODORO (16/08/2026)
- Título Relógio Pomodoro deslocado verticalmente no desktop para alinhar sua linha-base com Progresso Geral de Estudo (%).
- O deslocamento ocorre dentro do próprio grid do card, fazendo apenas o conteúdo do Pomodoro acompanhar o novo alinhamento.
- Nenhum outro layout foi alterado.


V10.6.7 — RETENÇÃO E DIAGNÓSTICO RESPONSIVO (16/08/2026)
- Corrigidas larguras mínimas rígidas que causavam overflow no painel.
- Separadas as áreas de Pontos críticos e lista de risco no grid para evitar sobreposição.
- Breakpoints próprios para desktop amplo, desktop estreito/tablet e mobile.
- Nenhum outro bloco de layout foi alterado.
- O pacote ZIP não inclui relatórios/auditorias/SHA em .txt.


V10.6.7 — VÍDEOAULA INTEGRADA (16/08/2026)
- Novo checkbox Vídeoaula por assunto no Edital Verticalizado e no modal do dia.
- Novo botão Vídeoaula vinculado ao Pomodoro com activityType=videoaula.
- Minutos de Vídeoaula entram em studySessions, Horas Estudadas, Horas por Matéria e distribuição das horas.
- Retenção registra Vídeoaula como atividade própria com comportamento de construção teórica.
- O progresso geral permanece 50% Teoria + 50% Questões; Vídeoaula é informação complementar e não cria uma terceira obrigação de conclusão.


V10.6.7 — AQUISIÇÃO ADAPTATIVA DE CONTEÚDO (16/08/2026)
- Automático é o método padrão para todos os tópicos existentes e novos.
- Progresso: aquisição do conteúdo = 50%; questões = 50%.
- Automático: Teoria OU Vídeoaula completam os 50% de aquisição.
- Teoria: apenas Teoria completa os 50%.
- Vídeoaula: apenas Vídeoaula completa os 50%.
- Teoria + Vídeoaula: cada modalidade vale 25% do total do assunto; Questões permanecem 50%.
- Método configurável dentro de Planejar, sem criar um novo painel.
- Retenção/desempenho baixos podem fazer o motor recomendar Vídeoaula como reforço no modo Automático.
- studySessions continua sendo a fonte canônica das horas e mantém videoaula como activityType próprio.


V10.6.7 — Ajustes pontuais: pontos críticos em grade, lista de estudados hoje no Pomodoro e assinatura by Dell no cabeçalho.

V10.6.7 — Ajuste exclusivo de Retenção e Diagnóstico conforme referência minimalista e responsiva.

V10.6.7 — Correção isolada da marca: nome integral e assinatura by Dell alinhada ao final do título.

V10.6.7 — Ajuste exclusivo de Retenção e Diagnóstico conforme referência 05; cartões críticos inteiros clicáveis, sem botão Revisar.


V10.6.7 — Pontos críticos: 2 itens visíveis, botão + para pendências adicionais e modal expansível responsivo.

V10.6.7 — Retenção e Diagnóstico reestruturado para reproduzir a referência 01; 2 pontos críticos visíveis e expansão por +.

V10.6.8 — Remoção visual completa de Retenção e Diagnóstico e correção robusta de atualização PWA entre dispositivos.


V10.7.2 — Integridade de horas e atualização multi-dispositivo
- Horas Estudadas soma permanentemente todas as studySessions do concurso.
- Reset diário não apaga mais o histórico geral; usa baseline sincronizado.
- Limpar cronograma preserva studySessions.
- Limpar Edital Atual é a única ação que zera o histórico do concurso.
- Sincronização de metadata faz união de studySessions entre dispositivos antes de baixar/enviar.
- Recuperação preventiva tenta reintroduzir sessões encontradas nos backups locais IndexedDB.
- Aviso de nova versão restaurado; version.json + Worker-first de assets centrais tornam a atualização robusta inclusive para clientes antigos.

V10.7.2 — Painel Retenção e Diagnóstico ajustado para corresponder ao mockup aprovado, mantendo as correções de horas e atualização.

V10.7.2 — Painel Retenção e Diagnóstico reconstruído conforme mockup aprovado; métricas de risco, revisões vencidas e dominados abrem detalhes; PWA auditado.


V10.7.4 — Retenção e Diagnóstico
- Redesenho consolidado do painel de retenção.
- Criticidade visual Alto/Médio/Baixo nos pontos críticos.
- Barra de retenção individual por assunto.
- Legenda de risco e hierarquia visual aprimorada.
- Responsividade preservada para desktop, tablet e mobile.


V10.7.5 — Auditoria e correção definitiva do ciclo de atualização PWA
- Versionamento sincronizado entre version.json, HTML, Service Worker e Cloudflare Worker.
- A versão em execução passa a ser lida do meta app-version; o badge do cabeçalho é preenchido dinamicamente.
- app.js deixa de duplicar versão em snapshots de backup e passa a usar window.APP_VERSION.
- Registro do Service Worker usa URL versionada (sw.js?v=<versão>) e updateViaCache=none.
- Cache do Service Worker deriva automaticamente da versão do app.
- Atualização manual remove registros/caches antigos e força navegação de rede com cache-busting.
- Incluídos scripts/release-version.mjs e scripts/audit-release.mjs para evitar divergência de versão em releases futuros.

V10.7.6 — Retenção e Diagnóstico: estratégia da prova e métricas sem sobreposição
- Reorganiza o bloco central em fluxo vertical real: estratégia da prova acima e métricas abaixo.
- Adiciona CTA contextual para definir/alterar a data da prova.
- Remove alturas/posicionamentos conflitantes que causavam sobreposição.
- Padroniza quatro métricas em cards iguais com ícones contextuais e barras de leitura rápida.
- Mantém responsividade em desktop, tablet e mobile sem alterar a lógica de retenção.


V10.7.7 — Correção definitiva do bloco central de Retenção e Diagnóstico
- Isolado o layout central com classes exclusivas rd-* para eliminar conflitos com CSS legado.
- Faixa da data da prova posicionada em fluxo próprio acima das métricas, com CTA à direita.
- Quatro cards de métricas mantidos em uma linha no desktop, 2x2 em tablet e 1 coluna no mobile.
- Removido do bloco central o reuso das classes legadas exam-phase-strip, retention-metric-grid e retention-center-column.
- Auditoria de release ampliada para validar ordem do DOM, quatro cards, ausência de classes legadas conflitantes e CSS isolado.

V10.8.0 — EDITOR RICO DE ANOTAÇÕES
- Adicionado negrito, itálico, sublinhado e tamanhos de fonte nas notas.
- Compatibilidade mantida com notas antigas em texto simples.
- Conteúdo formatado é sanitizado antes de salvar e exibir.
- Atalhos Ctrl/Cmd+B, Ctrl/Cmd+I e Ctrl/Cmd+U disponíveis.
- Área ampliada da V10.7.9 preservada.
