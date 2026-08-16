-- V10.6.0 — adiciona estado de Vídeoaula por tópico
alter table public.edital
add column if not exists videoaula boolean not null default false;

comment on column public.edital.videoaula is
'Indica se a etapa de Vídeoaula do tópico foi concluída. O efeito no progresso depende de metodo_conteudo.';
