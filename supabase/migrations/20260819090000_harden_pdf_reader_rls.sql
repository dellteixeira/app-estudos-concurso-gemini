-- V10.15.3 — hardening do Reader PDF.
-- Reforça integridade entre usuário, PDF e marcações sem alterar dados existentes.

-- UPDATE de anotação: o PDF referenciado continua obrigatoriamente pertencendo ao usuário.
drop policy if exists pdf_annotations_update_own on public.pdf_annotations;
create policy pdf_annotations_update_own on public.pdf_annotations
for update to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.pdf_documents d
    where d.id = pdf_id and d.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.pdf_documents d
    where d.id = pdf_id and d.user_id = auth.uid()
  )
);

-- Bookmark: só pode apontar para PDF do próprio usuário.
drop policy if exists pdf_bookmarks_insert_own on public.pdf_bookmarks;
create policy pdf_bookmarks_insert_own on public.pdf_bookmarks
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.pdf_documents d
    where d.id = pdf_id and d.user_id = auth.uid()
  )
);

-- Histórico de versão: INSERT passa a ser exclusivo do trigger.
-- A policy de DELETE do próprio usuário é preservada para que delete_my_study_data() continue funcional.
drop policy if exists pdf_annotation_versions_insert_own on public.pdf_annotation_versions;

-- O trigger precisa gravar o snapshot mesmo sem policy de INSERT para authenticated.
-- SECURITY DEFINER é limitado a esta função e o search_path permanece fixo.
create or replace function public.snapshot_pdf_annotation_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  select coalesce(max(version_number),0)+1 into v_next
  from public.pdf_annotation_versions
  where annotation_id = old.id and user_id = old.user_id;

  insert into public.pdf_annotation_versions(
    annotation_id,user_id,pdf_id,page_number,annotation_type,selected_text,note_text,color,rects,version_number
  ) values (
    old.id,old.user_id,old.pdf_id,old.page_number,old.annotation_type,old.selected_text,old.note_text,old.color,old.rects,v_next
  );
  return new;
end;
$$;

revoke all on function public.snapshot_pdf_annotation_version() from public;

comment on table public.pdf_annotation_versions is
'Histórico de versões das anotações PDF; INSERT exclusivo do trigger snapshot_pdf_annotation_version.';
