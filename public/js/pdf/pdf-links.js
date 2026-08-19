(function (global) {
  'use strict';

  function core() {
    if (!global.PdfStudyCore) throw new Error('PdfStudyCore não carregado.');
    return global.PdfStudyCore;
  }

  function cleanContext({ concurso, materia, assunto, workspaceId = null }) {
    const ctx = {
      concurso: core().normalizeText(concurso, 180),
      materia: core().normalizeText(materia, 180),
      assunto: core().normalizeText(assunto, 300),
      workspace_id: workspaceId || null,
    };
    if (!ctx.concurso) throw new Error('Selecione um concurso para o vínculo.');
    if (ctx.assunto && !ctx.materia) throw new Error('Selecione uma matéria antes de escolher um assunto.');
    return ctx;
  }

  async function list({ concurso = '', workspaceId = '', materia = '', assunto = '', pdfIds = [] } = {}) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    let query = client
      .from('pdf_document_links')
      .select('id,user_id,pdf_id,workspace_id,concurso,materia,assunto,created_at,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (concurso) query = query.eq('concurso', concurso);
    if (workspaceId) query = query.eq('workspace_id', workspaceId);
    if (materia) query = query.eq('materia', materia);
    if (assunto) query = query.eq('assunto', assunto);
    if (Array.isArray(pdfIds) && pdfIds.length) query = query.in('pdf_id', pdfIds);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function create({ pdfId, workspaceId = null, concurso, materia, assunto }) {
    if (!pdfId) throw new Error('PDF inválido para vínculo.');
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const ctx = cleanContext({ concurso, materia, assunto, workspaceId });
    const payload = { user_id: user.id, pdf_id: pdfId, ...ctx, updated_at: new Date().toISOString() };
    const { data, error } = await client.from('pdf_document_links').insert(payload).select().single();
    if (error) {
      if (String(error.code || '') === '23505') throw new Error('Este PDF já está vinculado a esse mesmo contexto de estudo.');
      throw error;
    }
    return data;
  }

  async function remove(id) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const { error } = await client.from('pdf_document_links').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    return true;
  }

  async function removeForPdfInConcurso(pdfId, concurso) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const clean = core().normalizeText(concurso, 180);
    const { error } = await client.from('pdf_document_links').delete().eq('user_id', user.id).eq('pdf_id', pdfId).eq('concurso', clean);
    if (error) throw error;
    return true;
  }

  const PENDING_CONTEST_OPS_PREFIX = 'pdf_study_pending_contest_ops_';

  async function pendingKey() {
    const user = await core().getAuthenticatedUser();
    return `${PENDING_CONTEST_OPS_PREFIX}${user.id}`;
  }

  async function readPendingContestOperations() {
    try { return JSON.parse(localStorage.getItem(await pendingKey()) || '[]'); }
    catch (_) { return []; }
  }

  async function writePendingContestOperations(ops) {
    localStorage.setItem(await pendingKey(), JSON.stringify(Array.isArray(ops) ? ops : []));
  }

  async function queueContestOperation(operation) {
    const ops = await readPendingContestOperations();
    ops.push({ ...operation, queuedAt: new Date().toISOString() });
    await writePendingContestOperations(ops.slice(-30));
  }

  async function renameConcursoNow(oldName, newName) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const oldClean = core().normalizeText(oldName, 180);
    const newClean = core().normalizeText(newName, 180);
    if (!oldClean || !newClean || oldClean === newClean) return true;
    const { error } = await client
      .from('pdf_document_links')
      .update({ concurso: newClean, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('concurso', oldClean);
    if (error) throw error;
    return true;
  }

  async function deleteConcursoNow(concurso) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const clean = core().normalizeText(concurso, 180);
    if (!clean) return true;
    const { error } = await client.from('pdf_document_links').delete().eq('user_id', user.id).eq('concurso', clean);
    if (error) throw error;
    return true;
  }

  async function handleConcursoRename(oldName, newName) {
    if (navigator.onLine) return renameConcursoNow(oldName, newName);
    await queueContestOperation({ type: 'rename', oldName, newName });
    return true;
  }

  async function handleConcursoDelete(concurso) {
    if (navigator.onLine) return deleteConcursoNow(concurso);
    await queueContestOperation({ type: 'delete', concurso });
    return true;
  }

  async function processPendingContestOperations() {
    if (!navigator.onLine) return false;
    const ops = await readPendingContestOperations();
    if (!ops.length) return true;
    const remaining = [];
    for (const op of ops) {
      try {
        if (op.type === 'rename') await renameConcursoNow(op.oldName, op.newName);
        else if (op.type === 'delete') await deleteConcursoNow(op.concurso);
      } catch (error) {
        console.warn('[PDF Links] operação de concurso pendente:', error);
        remaining.push(op);
      }
    }
    await writePendingContestOperations(remaining);
    return remaining.length === 0;
  }

  global.PdfStudyLinks = Object.freeze({
    list, create, remove, removeForPdfInConcurso,
    handleConcursoRename, handleConcursoDelete, processPendingContestOperations,
  });
})(window);
