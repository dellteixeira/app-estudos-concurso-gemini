-- V10.14.0 — Biblioteca global: PDF físico independente do concurso.
-- O documento passa a existir uma única vez em pdf_documents.
-- Contextos de estudo ficam em pdf_document_links e podem apontar o mesmo PDF
-- para vários concursos/workspaces/matérias/assuntos.

create table if not exists public.pdf_document_links (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    pdf_id uuid not null references public.pdf_documents(id) on delete cascade,
    workspace_id uuid references public.study_workspaces(id) on delete set null,
    concurso text not null,
    materia text not null,
    assunto text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pdf_document_links_concurso_check check (length(trim(concurso)) between 1 and 180),
    constraint pdf_document_links_materia_check check (length(trim(materia)) between 1 and 180),
    constraint pdf_document_links_assunto_check check (length(trim(assunto)) between 1 and 300)
);

create unique index if not exists pdf_document_links_context_uidx
    on public.pdf_document_links (
        user_id,
        pdf_id,
        concurso,
        materia,
        assunto,
        coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

create index if not exists pdf_document_links_user_concurso_idx
    on public.pdf_document_links (user_id, concurso, updated_at desc);

create index if not exists pdf_document_links_user_workspace_idx
    on public.pdf_document_links (user_id, workspace_id, updated_at desc);

create index if not exists pdf_document_links_pdf_idx
    on public.pdf_document_links (pdf_id, updated_at desc);

alter table public.pdf_document_links enable row level security;

drop policy if exists pdf_document_links_select_own on public.pdf_document_links;
create policy pdf_document_links_select_own on public.pdf_document_links
for select to authenticated using (auth.uid() = user_id);

drop policy if exists pdf_document_links_insert_own on public.pdf_document_links;
create policy pdf_document_links_insert_own on public.pdf_document_links
for insert to authenticated with check (
    auth.uid() = user_id
    and exists (
        select 1 from public.pdf_documents d
        where d.id = pdf_id and d.user_id = auth.uid()
    )
    and (
        workspace_id is null
        or exists (
            select 1 from public.study_workspaces w
            where w.id = workspace_id and w.user_id = auth.uid()
        )
    )
);

drop policy if exists pdf_document_links_update_own on public.pdf_document_links;
create policy pdf_document_links_update_own on public.pdf_document_links
for update to authenticated using (auth.uid() = user_id)
with check (
    auth.uid() = user_id
    and exists (
        select 1 from public.pdf_documents d
        where d.id = pdf_id and d.user_id = auth.uid()
    )
    and (
        workspace_id is null
        or exists (
            select 1 from public.study_workspaces w
            where w.id = workspace_id and w.user_id = auth.uid()
        )
    )
);

drop policy if exists pdf_document_links_delete_own on public.pdf_document_links;
create policy pdf_document_links_delete_own on public.pdf_document_links
for delete to authenticated using (auth.uid() = user_id);

-- Migra vínculos gravados pela V10.13.0, caso ela já tenha sido publicada.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'pdf_documents' and column_name = 'concurso'
    ) and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'pdf_documents' and column_name = 'workspace_id'
    ) and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'pdf_documents' and column_name = 'materia'
    ) and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'pdf_documents' and column_name = 'assunto'
    ) then
        execute $migrate$
            insert into public.pdf_document_links (user_id, pdf_id, workspace_id, concurso, materia, assunto, created_at, updated_at)
            select user_id, id, workspace_id, trim(concurso), trim(materia), trim(assunto), created_at, updated_at
            from public.pdf_documents
            where nullif(trim(concurso), '') is not null
              and nullif(trim(materia), '') is not null
              and nullif(trim(assunto), '') is not null
            on conflict do nothing
        $migrate$;
    end if;
end $$;

-- pdf_documents volta a representar somente o arquivo global.
drop policy if exists pdf_documents_insert_own on public.pdf_documents;
drop policy if exists pdf_documents_update_own on public.pdf_documents;

create policy pdf_documents_insert_own on public.pdf_documents
for insert to authenticated with check (auth.uid() = user_id);

create policy pdf_documents_update_own on public.pdf_documents
for update to authenticated using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop index if exists public.pdf_documents_user_workspace_idx;
drop index if exists public.pdf_documents_user_subject_idx;
drop index if exists public.pdf_documents_user_concurso_idx;
drop index if exists public.study_workspaces_user_concurso_idx;

alter table public.pdf_documents drop column if exists workspace_id;
alter table public.pdf_documents drop column if exists concurso;
alter table public.pdf_documents drop column if exists materia;
alter table public.pdf_documents drop column if exists assunto;
alter table public.study_workspaces drop column if exists concurso;

create index if not exists pdf_documents_user_updated_idx
    on public.pdf_documents (user_id, is_favorite desc, updated_at desc);

comment on table public.pdf_documents is 'Acervo global privado de PDFs. Um arquivo existe uma única vez e não pertence a concurso, matéria ou workspace.';
comment on table public.pdf_document_links is 'Vínculos contextuais entre um PDF global e concurso/workspace/matéria/assunto. Excluir o contexto não exclui o arquivo.';
comment on table public.study_workspaces is 'Coleções privadas globais do usuário para organizar materiais, independentes de concurso.';

-- O Storage novo também deixa de carregar workspace no caminho.
-- Novos uploads: <auth.uid()>/<pdf-id>/original.pdf
-- As policies existentes continuam válidas porque protegem pelo primeiro segmento (auth.uid()).
