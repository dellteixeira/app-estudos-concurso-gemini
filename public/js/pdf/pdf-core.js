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
    // getSession() lê a sessão persistida localmente e evita uma chamada de rede
    // desnecessária a cada operação da Biblioteca. getUser() fica como fallback.
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (!sessionError && sessionData?.session?.user?.id) return sessionData.session.user;
    } catch (_) {}
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data?.user?.id) throw new Error('Usuário não autenticado.');
    return data.user;
  }

  function isNetworkError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('networkerror') || message.includes('failed to fetch') || message.includes('fetch resource') || message.includes('network request failed');
  }

  async function retry(operation, { attempts = 2, delayMs = 350 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
      try { return await operation(attempt); }
      catch (error) {
        lastError = error;
        if (!isNetworkError(error) || attempt >= attempts) break;
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
    throw lastError;
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
    isNetworkError,
    retry,
    normalizeText,
    buildStoragePath,
    validatePdfFile,
  });
})(window);
