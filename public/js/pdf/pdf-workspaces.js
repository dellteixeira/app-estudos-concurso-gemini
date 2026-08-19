(function (global) {
  'use strict';

  function core() {
    if (!global.PdfStudyCore) throw new Error('PdfStudyCore não carregado.');
    return global.PdfStudyCore;
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

  async function create({ name, description = '', isDefault = false }) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const cleanName = core().normalizeText(name, 120);
    if (!cleanName) throw new Error('Informe o nome do Workspace.');

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
    if (error) throw error;
    return data;
  }

  async function update(id, changes) {
    const user = await core().getAuthenticatedUser();
    const client = core().getSupabaseClient();
    const payload = { updated_at: new Date().toISOString() };
    if ('name' in changes) {
      payload.name = core().normalizeText(changes.name, 120);
      if (!payload.name) throw new Error('Informe o nome do Workspace.');
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

  global.PdfStudyWorkspaces = Object.freeze({ list, create, update, remove });
})(window);
