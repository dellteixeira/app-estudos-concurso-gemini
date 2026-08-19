-- V10.13.0 — Fase 2: vínculo explícito Workspace/PDF ↔ concurso atual.

alter table public.study_workspaces
    add column if not exists concurso text;

alter table public.pdf_documents
    add column if not exists concurso text;

alter table public.study_workspaces
    drop constraint if exists study_workspaces_concurso_length;
alter table public.study_workspaces
    add constraint study_workspaces_concurso_length
    check (concurso is null or length(trim(concurso)) between 1 and 180);

alter table public.pdf_documents
    drop constraint if exists pdf_documents_concurso_length;
alter table public.pdf_documents
    add constraint pdf_documents_concurso_length
    check (concurso is null or length(trim(concurso)) between 1 and 180);

create index if not exists study_workspaces_user_concurso_idx
    on public.study_workspaces (user_id, concurso, is_default desc, name);

create index if not exists pdf_documents_user_concurso_idx
    on public.pdf_documents (user_id, concurso, updated_at desc);

comment on column public.study_workspaces.concurso is 'Concurso do app ao qual este Workspace pertence.';
comment on column public.pdf_documents.concurso is 'Concurso do edital ao qual o PDF foi explicitamente vinculado no upload.';
