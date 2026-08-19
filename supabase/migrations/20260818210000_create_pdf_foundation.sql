-- V10.12.0 — Fase 1 do módulo PDF: Workspaces, documentos, progresso e Storage privado.

create table if not exists public.study_workspaces (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    description text,
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint study_workspaces_name_not_blank check (length(trim(name)) between 1 and 120)
);

create unique index if not exists study_workspaces_user_name_uidx
    on public.study_workspaces (user_id, lower(trim(name)));

create unique index if not exists study_workspaces_one_default_per_user_uidx
    on public.study_workspaces (user_id)
    where is_default;

create table if not exists public.pdf_documents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    workspace_id uuid references public.study_workspaces(id) on delete set null,
    title text not null,
    original_file_name text not null,
    storage_path text not null,
    mime_type text not null default 'application/pdf',
    file_size bigint not null,
    page_count integer,
    materia text,
    assunto text,
    sha256 text,
    is_favorite boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pdf_documents_title_not_blank check (length(trim(title)) between 1 and 240),
    constraint pdf_documents_file_name_not_blank check (length(trim(original_file_name)) between 1 and 255),
    constraint pdf_documents_storage_path_not_blank check (length(trim(storage_path)) > 0),
    constraint pdf_documents_pdf_mime check (mime_type = 'application/pdf'),
    constraint pdf_documents_file_size_check check (file_size > 0 and file_size <= 104857600),
    constraint pdf_documents_page_count_check check (page_count is null or page_count > 0),
    constraint pdf_documents_sha256_check check (sha256 is null or sha256 ~ '^[0-9a-fA-F]{64}$')
);

create unique index if not exists pdf_documents_user_storage_path_uidx
    on public.pdf_documents (user_id, storage_path);

create index if not exists pdf_documents_user_workspace_idx
    on public.pdf_documents (user_id, workspace_id, created_at desc);

create index if not exists pdf_documents_user_subject_idx
    on public.pdf_documents (user_id, materia, assunto);

create table if not exists public.pdf_progress (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    pdf_id uuid not null references public.pdf_documents(id) on delete cascade,
    current_page integer not null default 1,
    progress_percentage numeric(5,2) not null default 0,
    reading_seconds bigint not null default 0,
    last_opened_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pdf_progress_current_page_check check (current_page >= 1),
    constraint pdf_progress_percentage_check check (progress_percentage between 0 and 100),
    constraint pdf_progress_reading_seconds_check check (reading_seconds >= 0),
    constraint pdf_progress_user_pdf_unique unique (user_id, pdf_id)
);

alter table public.study_workspaces enable row level security;
alter table public.pdf_documents enable row level security;
alter table public.pdf_progress enable row level security;

-- Workspaces: cada usuário enxerga e altera somente os próprios registros.
drop policy if exists study_workspaces_select_own on public.study_workspaces;
create policy study_workspaces_select_own on public.study_workspaces
for select to authenticated using (auth.uid() = user_id);

drop policy if exists study_workspaces_insert_own on public.study_workspaces;
create policy study_workspaces_insert_own on public.study_workspaces
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists study_workspaces_update_own on public.study_workspaces;
create policy study_workspaces_update_own on public.study_workspaces
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists study_workspaces_delete_own on public.study_workspaces;
create policy study_workspaces_delete_own on public.study_workspaces
for delete to authenticated using (auth.uid() = user_id);

-- PDFs: workspace, quando informado, também precisa pertencer ao mesmo usuário.
drop policy if exists pdf_documents_select_own on public.pdf_documents;
create policy pdf_documents_select_own on public.pdf_documents
for select to authenticated using (auth.uid() = user_id);

drop policy if exists pdf_documents_insert_own on public.pdf_documents;
create policy pdf_documents_insert_own on public.pdf_documents
for insert to authenticated with check (
    auth.uid() = user_id
    and (
        workspace_id is null
        or exists (
            select 1 from public.study_workspaces w
            where w.id = workspace_id and w.user_id = auth.uid()
        )
    )
);

drop policy if exists pdf_documents_update_own on public.pdf_documents;
create policy pdf_documents_update_own on public.pdf_documents
for update to authenticated using (auth.uid() = user_id)
with check (
    auth.uid() = user_id
    and (
        workspace_id is null
        or exists (
            select 1 from public.study_workspaces w
            where w.id = workspace_id and w.user_id = auth.uid()
        )
    )
);

drop policy if exists pdf_documents_delete_own on public.pdf_documents;
create policy pdf_documents_delete_own on public.pdf_documents
for delete to authenticated using (auth.uid() = user_id);

-- Progresso: além do user_id, o PDF referenciado precisa ser do usuário autenticado.
drop policy if exists pdf_progress_select_own on public.pdf_progress;
create policy pdf_progress_select_own on public.pdf_progress
for select to authenticated using (auth.uid() = user_id);

drop policy if exists pdf_progress_insert_own on public.pdf_progress;
create policy pdf_progress_insert_own on public.pdf_progress
for insert to authenticated with check (
    auth.uid() = user_id
    and exists (
        select 1 from public.pdf_documents d
        where d.id = pdf_id and d.user_id = auth.uid()
    )
);

drop policy if exists pdf_progress_update_own on public.pdf_progress;
create policy pdf_progress_update_own on public.pdf_progress
for update to authenticated using (auth.uid() = user_id)
with check (
    auth.uid() = user_id
    and exists (
        select 1 from public.pdf_documents d
        where d.id = pdf_id and d.user_id = auth.uid()
    )
);

drop policy if exists pdf_progress_delete_own on public.pdf_progress;
create policy pdf_progress_delete_own on public.pdf_progress
for delete to authenticated using (auth.uid() = user_id);

-- Bucket privado. 100 MiB por PDF na primeira versão.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-pdfs', 'study-pdfs', false, 104857600, array['application/pdf'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Caminho obrigatório: <auth.uid()>/<workspace-id-ou-unfiled>/<pdf-id>/original.pdf
-- O primeiro segmento impede acesso cruzado entre usuários.
drop policy if exists study_pdfs_select_own on storage.objects;
create policy study_pdfs_select_own on storage.objects
for select to authenticated using (
    bucket_id = 'study-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists study_pdfs_insert_own on storage.objects;
create policy study_pdfs_insert_own on storage.objects
for insert to authenticated with check (
    bucket_id = 'study-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists study_pdfs_update_own on storage.objects;
create policy study_pdfs_update_own on storage.objects
for update to authenticated using (
    bucket_id = 'study-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
) with check (
    bucket_id = 'study-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists study_pdfs_delete_own on storage.objects;
create policy study_pdfs_delete_own on storage.objects
for delete to authenticated using (
    bucket_id = 'study-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
);

comment on table public.study_workspaces is 'Coleções privadas de estudo do usuário para organizar PDFs e, futuramente, outros materiais.';
comment on table public.pdf_documents is 'Metadados dos PDFs privados; o arquivo físico permanece no bucket privado study-pdfs.';
comment on table public.pdf_progress is 'Estado de leitura por usuário/PDF: página atual, percentual e tempo acumulado.';
