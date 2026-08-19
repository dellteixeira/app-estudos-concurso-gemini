-- V10.12.0 — amplia a exclusão transacional para a fundação do módulo PDF.
-- O arquivo físico do Storage continua sendo removido pela Edge Function antes desta RPC.

create or replace function public.delete_my_study_data()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_table text;
    v_count integer;
    v_result jsonb := '{}'::jsonb;
    v_tables constant text[] := array[
        'pdf_progress',
        'pdf_documents',
        'study_workspaces',
        'edital',
        'flashcards',
        'user_flashcards',
        'user_notes',
        'user_schedules',
        'user_settings'
    ];
begin
    if v_uid is null then
        raise exception 'Usuário não autenticado';
    end if;

    foreach v_table in array v_tables loop
        if to_regclass(format('public.%I', v_table)) is not null then
            execute format('delete from public.%I where user_id = $1', v_table) using v_uid;
            get diagnostics v_count = row_count;
            v_result := v_result || jsonb_build_object(v_table, v_count);
        else
            v_result := v_result || jsonb_build_object(v_table, 0);
        end if;
    end loop;

    return v_result;
end;
$$;

revoke all on function public.delete_my_study_data() from public;
grant execute on function public.delete_my_study_data() to authenticated;

comment on function public.delete_my_study_data() is
'Exclui dados de estudo do usuário autenticado, incluindo fundação privada do módulo PDF. Storage físico é removido pela Edge Function delete-account.';
