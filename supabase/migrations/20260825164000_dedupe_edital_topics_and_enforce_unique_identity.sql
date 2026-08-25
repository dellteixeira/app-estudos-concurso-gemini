-- Fase de integridade do edital verticalizado.
-- Um assunto é único por usuário + concurso + matéria + assunto,
-- com comparação case/accent/whitespace-insensitive.

create or replace function public.normalize_edital_identity(value text)
returns text
language sql
immutable
parallel safe
as $$
  select translate(
    lower(regexp_replace(btrim(coalesce(value, '')), '[[:space:]]+', ' ', 'g')),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
$$;

-- Consolida registros já duplicados antes de criar o índice único.
-- O registro mais antigo permanece como identidade canônica e absorve
-- o progresso/flags dos demais para não perder trabalho do usuário.
with ranked as (
  select
    e.*,
    row_number() over (
      partition by
        e.user_id,
        public.normalize_edital_identity(coalesce(e.concurso, 'Concurso Geral')),
        public.normalize_edital_identity(e.materia),
        public.normalize_edital_identity(e.assunto)
      order by e.created_at nulls last, e.id
    ) as rn,
    first_value(e.id) over (
      partition by
        e.user_id,
        public.normalize_edital_identity(coalesce(e.concurso, 'Concurso Geral')),
        public.normalize_edital_identity(e.materia),
        public.normalize_edital_identity(e.assunto)
      order by e.created_at nulls last, e.id
    ) as keeper_id
  from public.edital e
), merged as (
  select
    keeper_id,
    min(coalesce(prioridade, 1)) as prioridade,
    min(coalesce(assunto_prioridade, 1)) as assunto_prioridade,
    bool_or(coalesce(teoria, false)) as teoria,
    bool_or(coalesce(questoes, false)) as questoes,
    bool_or(coalesce(videoaula, false)) as videoaula,
    bool_or(coalesce(rev_24h, false)) as rev_24h,
    bool_or(coalesce(rev_7d, false)) as rev_7d,
    bool_or(coalesce(rev_30d, false)) as rev_30d,
    case
      when bool_or(metodo_conteudo = 'teoria_videoaula') then 'teoria_videoaula'
      when bool_or(metodo_conteudo = 'teoria') and bool_or(metodo_conteudo = 'videoaula') then 'teoria_videoaula'
      when bool_or(metodo_conteudo = 'teoria') then 'teoria'
      when bool_or(metodo_conteudo = 'videoaula') then 'videoaula'
      else 'automatico'
    end as metodo_conteudo
  from ranked
  group by keeper_id
)
update public.edital e
set
  prioridade = m.prioridade,
  assunto_prioridade = m.assunto_prioridade,
  teoria = m.teoria,
  questoes = m.questoes,
  videoaula = m.videoaula,
  rev_24h = m.rev_24h,
  rev_7d = m.rev_7d,
  rev_30d = m.rev_30d,
  metodo_conteudo = m.metodo_conteudo
from merged m
where e.id = m.keeper_id;

with ranked as (
  select
    e.id,
    row_number() over (
      partition by
        e.user_id,
        public.normalize_edital_identity(coalesce(e.concurso, 'Concurso Geral')),
        public.normalize_edital_identity(e.materia),
        public.normalize_edital_identity(e.assunto)
      order by e.created_at nulls last, e.id
    ) as rn
  from public.edital e
)
delete from public.edital e
using ranked r
where e.id = r.id
  and r.rn > 1;

create unique index if not exists edital_user_concurso_materia_assunto_unique_idx
on public.edital (
  user_id,
  public.normalize_edital_identity(coalesce(concurso, 'Concurso Geral')),
  public.normalize_edital_identity(materia),
  public.normalize_edital_identity(assunto)
);

comment on index public.edital_user_concurso_materia_assunto_unique_idx is
  'Impede assuntos duplicados no mesmo concurso/matéria por usuário, ignorando caixa, acentos e espaços excedentes.';
