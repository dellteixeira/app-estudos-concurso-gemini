(function (global) {
  'use strict';

  function core() {
    if (!global.PdfStudyCore) throw new Error('PdfStudyCore não carregado.');
    return global.PdfStudyCore;
  }

  function normalizeName(value) {
    return core().normalizeText(value, 120).toLocaleLowerCase('pt-BR');
  }

  async function list() {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const { data, error } = await client
      .from('study_workspaces')
      .select('id,user_id,name,description,is_default,created_at,updated_at')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function findByName(name, known = null) {
    const clean = normalizeName(name);
    if (!clean) return null;
    const rows = Array.isArray(known) ? known : await list();
    return rows.find(row => normalizeName(row.name) === clean) || null;
  }

  async function create({ name, description = '', isDefault = false }) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const cleanName = core().normalizeText(name, 120);
    if (!cleanName) throw new Error('Informe o nome do Workspace.');

    // Idempotência: o índice do banco é único por usuário + lower(trim(name)).
    // Se o Workspace já existe, reutilizamos o registro em vez de tentar duplicá-lo.
    const before = await list();
    const existing = await findByName(cleanName, before);
    if (existing) return existing;

    if (isDefault) {
      const { error: resetError } = await client
        .from('study_workspaces')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_default', true);
      if (resetError) throw resetError;
    }

    const payload = {
      user_id: user.id,
      name: cleanName,
      description: core().normalizeText(description, 500) || null,
      is_default: Boolean(isDefault),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client.from('study_workspaces').insert(payload).select().single();
    if (!error) return data;

    // Corrida entre abas/initializers: outro fluxo pode ter criado o mesmo nome
    // entre nosso SELECT e INSERT. O 23505 é recuperável, não deve quebrar a Biblioteca.
    if (String(error.code || '') === '23505' || /study_workspaces_user_name_uidx/i.test(String(error.message || ''))) {
      const raced = await findByName(cleanName);
      if (raced) return raced;
    }
    throw error;
  }

  async function ensureDefault() {
    const rows = await list();
    if (rows.length) return rows;
    await create({
      name: 'Biblioteca Geral',
      description: 'Workspace global padrão para materiais de estudo.',
      isDefault: true,
    });
    return list();
  }

  async function update(id, changes) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const payload = { updated_at: new Date().toISOString() };
    if ('name' in changes) {
      payload.name = core().normalizeText(changes.name, 120);
      if (!payload.name) throw new Error('Informe o nome do Workspace.');
      const rows = await list();
      const duplicate = rows.find(row => row.id !== id && normalizeName(row.name) === normalizeName(payload.name));
      if (duplicate) throw new Error(`Já existe um Workspace chamado “${duplicate.name}”.`);
    }
    if ('description' in changes) payload.description = core().normalizeText(changes.description, 500) || null;
    const { data, error } = await client.from('study_workspaces').update(payload).eq('id', id).eq('user_id', user.id).select().single();
    if (error) throw error;
    return data;
  }

  async function remove(id) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const { error } = await client.from('study_workspaces').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    return true;
  }

  global.PdfStudyWorkspaces = Object.freeze({ list, findByName, create, ensureDefault, update, remove });
})(window);
