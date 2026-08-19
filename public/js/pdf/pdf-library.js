(function (global) {
  'use strict';
  const core = () => global.PdfStudyCore;
  const links = () => global.PdfStudyLinks;

  async function list({ scope='contest', concurso='', workspaceId='', materia='', assunto='', search='' }={}) {
    const user = await core().getAuthenticatedUser(); const client = core().getSupabaseClient();
    let matchedLinks = [];
    if (scope !== 'global' || workspaceId || materia || assunto) {
      matchedLinks = await links().list({ concurso: scope === 'global' ? '' : concurso, workspaceId, materia, assunto });
      if (!matchedLinks.length) return [];
    }
    let q = client.from('pdf_documents').select('id,user_id,title,original_file_name,storage_path,mime_type,file_size,page_count,sha256,is_favorite,created_at,updated_at').eq('user_id',user.id).order('is_favorite',{ascending:false}).order('updated_at',{ascending:false});
    if (matchedLinks.length) q = q.in('id',[...new Set(matchedLinks.map(x=>x.pdf_id))]);
    if (search) { const safe=String(search).replace(/[,%()]/g,' ').trim(); if(safe) q=q.or(`title.ilike.%${safe}%,original_file_name.ilike.%${safe}%`); }
    const {data,error}=await q; if(error) throw error; const docs=data||[]; if(!docs.length)return[];
    const ids=docs.map(d=>d.id);
    const allLinks = await links().list({ pdfIds: ids });
    const {data:pr,error:pe}=await client.from('pdf_progress').select('pdf_id,current_page,progress_percentage,reading_seconds,last_opened_at').eq('user_id',user.id).in('pdf_id',ids); if(pe)throw pe;
    const pm=new Map((pr||[]).map(x=>[x.pdf_id,x]));
    return docs.map(d=>{const dl=allLinks.filter(x=>x.pdf_id===d.id); const active= scope==='global'?null:(dl.find(x=>x.concurso===concurso && (!workspaceId||x.workspace_id===workspaceId) && (!materia||x.materia===materia) && (!assunto||x.assunto===assunto))||dl.find(x=>x.concurso===concurso)||null); return {...d,links:dl,activeLink:active,progress:pm.get(d.id)||null};});
  }
  async function setFavorite(id,v){const u=await core().getAuthenticatedUser();const c=core().getSupabaseClient();const {data,error}=await c.from('pdf_documents').update({is_favorite:!!v,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',u.id).select().single();if(error)throw error;return data;}
  async function remove(doc){if(!doc?.id||!doc?.storage_path)throw new Error('Documento inválido.');const u=await core().getAuthenticatedUser();if(!String(doc.storage_path).startsWith(`${u.id}/`))throw new Error('Caminho inválido.');const c=core().getSupabaseClient();const {error:se}=await c.storage.from(core().BUCKET).remove([doc.storage_path]);if(se)throw se;const {error}=await c.from('pdf_documents').delete().eq('id',doc.id).eq('user_id',u.id);if(error)throw error;return true;}
  async function createSignedUrl(doc,sec=900){const c=core().getSupabaseClient();const {data,error}=await c.storage.from(core().BUCKET).createSignedUrl(doc.storage_path,sec);if(error)throw error;return data?.signedUrl;}
  global.PdfStudyLibrary=Object.freeze({list,setFavorite,remove,createSignedUrl});
})(window);
