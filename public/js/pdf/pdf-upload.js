(function (global) {
  'use strict';

  function core() {
    if (!global.PdfStudyCore) throw new Error('PdfStudyCore não carregado.');
    return global.PdfStudyCore;
  }

  function links() {
    if (!global.PdfStudyLinks) throw new Error('PdfStudyLinks não carregado.');
    return global.PdfStudyLinks;
  }

  function uuid() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async function upload({ file, title, workspaceId, concurso, materia, assunto, onProgress }) {
    const validation = core().validatePdfFile(file);
    if (!validation.ok) throw new Error(validation.error);
    if (!workspaceId) throw new Error('Selecione um Workspace para organizar o vínculo.');
    const cleanConcurso = core().normalizeText(concurso, 180);
    const cleanMateria = core().normalizeText(materia, 180);
    const cleanAssunto = core().normalizeText(assunto, 300);
    if (!cleanConcurso) throw new Error('O primeiro vínculo precisa indicar o concurso atual.');
    if (!cleanMateria) throw new Error('Selecione uma matéria do edital.');
    if (!cleanAssunto) throw new Error('Selecione um assunto do edital.');

    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const pdfId = uuid();
    const storagePath = core().buildStoragePath({ userId: user.id, pdfId });
    const cleanTitle = core().normalizeText(title || String(file.name || '').replace(/\.pdf$/i, ''), 240);
    if (!cleanTitle) throw new Error('Informe um título para o PDF.');

    onProgress?.({ stage: 'uploading', percent: 20 });
    const { error: uploadError } = await client.storage.from(core().BUCKET).upload(storagePath, file, {
      contentType: 'application/pdf', cacheControl: '3600', upsert: false,
    });
    if (uploadError) throw uploadError;

    onProgress?.({ stage: 'registering', percent: 55 });
    const documentPayload = {
      id: pdfId,
      user_id: user.id,
      title: cleanTitle,
      original_file_name: core().normalizeText(file.name, 255),
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size: file.size,
      updated_at: new Date().toISOString(),
    };
    const { data: documentRow, error: insertError } = await client.from('pdf_documents').insert(documentPayload).select().single();
    if (insertError) {
      await client.storage.from(core().BUCKET).remove([storagePath]).catch(() => null);
      throw insertError;
    }

    const { error: progressError } = await client.from('pdf_progress').upsert({
      user_id: user.id, pdf_id: pdfId, current_page: 1, progress_percentage: 0, reading_seconds: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,pdf_id' });
    if (progressError) {
      await client.from('pdf_documents').delete().eq('id', pdfId).eq('user_id', user.id).catch(() => null);
      await client.storage.from(core().BUCKET).remove([storagePath]).catch(() => null);
      throw progressError;
    }

    onProgress?.({ stage: 'linking', percent: 80 });
    try {
      const link = await links().create({ pdfId, workspaceId, concurso: cleanConcurso, materia: cleanMateria, assunto: cleanAssunto });
      onProgress?.({ stage: 'done', percent: 100 });
      return { ...documentRow, links: [link], activeLink: link };
    } catch (linkError) {
      await client.from('pdf_documents').delete().eq('id', pdfId).eq('user_id', user.id).catch(() => null);
      await client.storage.from(core().BUCKET).remove([storagePath]).catch(() => null);
      throw linkError;
    }
  }

  global.PdfStudyUpload = Object.freeze({ upload });
})(window);
