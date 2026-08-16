-- V10.6.1 — método de aquisição do conteúdo por tópico
alter table public.edital
add column if not exists metodo_conteudo text not null default 'automatico';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'edital_metodo_conteudo_check'
          and conrelid = 'public.edital'::regclass
    ) then
        alter table public.edital
        add constraint edital_metodo_conteudo_check
        check (metodo_conteudo in ('automatico','teoria','videoaula','ambos'));
    end if;
end $$;

comment on column public.edital.metodo_conteudo is
'Método de aquisição do tópico: automatico (Teoria OU Vídeoaula), teoria, videoaula ou ambos (Teoria + Vídeoaula).';
