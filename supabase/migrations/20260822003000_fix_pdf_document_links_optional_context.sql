-- Corrige definitivamente os vínculos de PDF para permitir matéria/assunto vazios.
-- Idempotente: pode ser aplicada mesmo se a migration anterior já tiver sido executada.

alter table public.pdf_document_links
    drop constraint if exists pdf_document_links_materia_check;

alter table public.pdf_document_links
    drop constraint if exists pdf_document_links_assunto_check;

alter table public.pdf_document_links
    add constraint pdf_document_links_materia_check
    check (length(trim(materia)) between 0 and 180);

alter table public.pdf_document_links
    add constraint pdf_document_links_assunto_check
    check (length(trim(assunto)) between 0 and 300);
