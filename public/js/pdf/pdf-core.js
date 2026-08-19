(function (global) {
  'use strict';

  const BUCKET = 'study-pdfs';
  const MAX_PDF_BYTES = 100 * 1024 * 1024;

  function getSupabaseClient() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    throw new Error('Cliente Supabase ainda não está disponível.');
  }

  async function getAuthenticatedUser() {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data?.user?.id) throw new Error('Usuário não autenticado.');
    return data.user;
  }

  function normalizeText(value, maxLength) {
    const text = String(value ?? '').trim();
    return maxLength ? text.slice(0, maxLength) : text;
  }

  function buildStoragePath({ userId, pdfId }) {
    if (!userId || !pdfId) throw new Error('userId e pdfId são obrigatórios.');
    return `${userId}/${pdfId}/original.pdf`;
  }

  function validatePdfFile(file) {
    if (!file) return { ok: false, error: 'Nenhum arquivo selecionado.' };
    const fileName = String(file.name || '').toLowerCase();
    const mime = String(file.type || '').toLowerCase();
    if (mime && mime !== 'application/pdf') return { ok: false, error: 'O arquivo precisa ser um PDF.' };
    if (!fileName.endsWith('.pdf')) return { ok: false, error: 'A extensão do arquivo precisa ser .pdf.' };
    if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'O PDF está vazio ou possui tamanho inválido.' };
    if (file.size > MAX_PDF_BYTES) return { ok: false, error: 'O PDF ultrapassa o limite de 100 MB.' };
    return { ok: true };
  }

  global.PdfStudyCore = Object.freeze({
    BUCKET,
    MAX_PDF_BYTES,
    getSupabaseClient,
    getAuthenticatedUser,
    normalizeText,
    buildStoragePath,
    validatePdfFile,
  });
})(window);
