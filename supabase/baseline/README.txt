BASELINE SUPABASE — ESTUDO ADAPTATIVO INTELIGENTE

Objetivo
Este diretório documenta o contrato de dados conhecido pelo código e fornece a
rotina para capturar o schema real do Supabase (incluindo RLS, funções/RPCs,
triggers e grants) sem inventar definições que não estejam no repositório.

Estado da base canônica V10.10.0
O frontend acessa diretamente as tabelas public.edital, public.flashcards e
public.user_settings e chama a RPC public.delete_my_study_data(). O histórico
legado do projeto também pode conter public.user_flashcards, public.user_notes e
public.user_schedules; a migration de hardening da exclusão trata essas tabelas
somente quando elas existirem.

Captura do schema real
Execute, com SUPABASE_DB_URL disponível no ambiente:

  bash scripts/capture-supabase-baseline.sh

O comando gera em supabase/baseline/generated/:
- roles.sql
- schema.sql
- manifest.sha256

schema.sql é a fonte real para reconstruir schema, RLS, RPCs e objetos do banco.
Não edite o dump manualmente. Gere novamente após alterações estruturais no
Supabase e versione o resultado intencionalmente.

Importante
O ZIP canônico não continha o dump completo do Supabase remoto. Por isso esta
blindagem não fabrica um baseline falso. A infraestrutura para capturá-lo e
validá-lo fica versionada; o dump definitivo precisa ser executado contra o
projeto Supabase conectado.
