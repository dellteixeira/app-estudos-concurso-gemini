-- V10.27.0 — ordem persistente da Biblioteca PDF.
-- A posição manual prevalece entre sessões/dispositivos e pode ser recalculada pela UI.

alter table public.pdf_documents
    add column if not exists sort_order bigint;

with ranked as (
    select
        id,
        row_number() over (
            partition by user_id
            order by is_favorite desc, updated_at desc nulls last, created_at desc nulls last, id
        ) as position
    from public.pdf_documents
)
update public.pdf_documents d
set sort_order = ranked.position
from ranked
where d.id = ranked.id
  and d.sort_order is null;

create index if not exists idx_pdf_documents_user_sort_order
    on public.pdf_documents(user_id, sort_order, id);

create or replace function public.assign_pdf_document_sort_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.sort_order is null then
        select coalesce(max(d.sort_order), 0) + 1
          into new.sort_order
          from public.pdf_documents d
         where d.user_id = new.user_id;
    end if;
    return new;
end;
$$;

revoke all on function public.assign_pdf_document_sort_order() from public;

drop trigger if exists trg_pdf_documents_assign_sort_order on public.pdf_documents;
create trigger trg_pdf_documents_assign_sort_order
before insert on public.pdf_documents
for each row execute function public.assign_pdf_document_sort_order();

create or replace function public.reorder_my_pdf_documents(p_order uuid[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_user uuid := auth.uid();
    v_requested integer := coalesce(cardinality(p_order), 0);
    v_distinct integer := 0;
    v_owned integer := 0;
begin
    if v_user is null then
        raise exception 'Usuário não autenticado';
    end if;

    if v_requested = 0 then
        return;
    end if;

    select count(distinct value)
      into v_distinct
      from unnest(p_order) as value;

    if v_distinct <> v_requested then
        raise exception 'A ordem contém PDFs duplicados';
    end if;

    select count(*)
      into v_owned
      from public.pdf_documents d
     where d.user_id = v_user
       and d.id = any(p_order);

    if v_owned <> v_requested then
        raise exception 'A ordem contém PDF inexistente ou pertencente a outro usuário';
    end if;

    update public.pdf_documents d
       set sort_order = ordered.position
      from unnest(p_order) with ordinality as ordered(id, position)
     where d.id = ordered.id
       and d.user_id = v_user;
end;
$$;

grant execute on function public.reorder_my_pdf_documents(uuid[]) to authenticated;

comment on column public.pdf_documents.sort_order is
'Ordem canônica manual da Biblioteca PDF. Menor valor aparece primeiro.';

comment on function public.reorder_my_pdf_documents(uuid[]) is
'Reordena somente PDFs pertencentes ao usuário autenticado.';
