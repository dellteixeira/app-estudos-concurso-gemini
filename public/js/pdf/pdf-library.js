(function (global) {
  'use strict';
  const core = () => global.PdfStudyCore;
  const links = () => global.PdfStudyLinks;
  const CACHE_PREFIX = 'pdf_study_library_cache_';

  function cacheKey(userId) { return `${CACHE_PREFIX}${userId}`; }
  function writeCache(userId, docs) {
    try { localStorage.setItem(cacheKey(userId), JSON.stringify({ savedAt: Date.now(), docs })); } catch (_) {}
  }
  function readCache(userId) {
    try {
      const parsed = JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null');
      return Array.isArray(parsed?.docs) ? parsed.docs : [];
    } catch (_) { return []; }
  }
  function filterCached(docs,{scope='contest',concurso='',workspaceId='',materia='',assunto='',search=''}) {
    let out = Array.isArray(docs) ? docs : [];
    if (scope !== 'global') out = out.filter(d => (d.links || []).some(l => l.concurso === concurso));
    if (workspaceId) out = out.filter(d => (d.links || []).some(l => l.workspace_id === workspaceId));
    if (materia) out = out.filter(d => (d.links || []).some(l => l.materia === materia));
    if (assunto) out = out.filter(d => (d.links || []).some(l => l.assunto === assunto));
    if (search) { const q=String(search).toLocaleLowerCase('pt-BR'); out=out.filter(d=>String(d.title||d.original_file_name||'').toLocaleLowerCase('pt-BR').includes(q)); }
    return out.map(d=>({...d,activeLink:scope==='global'?null:((d.links||[]).find(l=>l.concurso===concurso && (!workspaceId||l.workspace_id===workspaceId) && (!materia||l.materia===materia) && (!assunto||l.assunto===assunto))||(d.links||[]).find(l=>l.concurso===concurso)||null)}));
  }

  async function listRemote({ scope='contest', concurso='', workspaceId='', materia='', assunto='', search='' }={}) {
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
    const [allLinks,progressResult]=await Promise.all([
      links().list({ pdfIds: ids }),
      client.from('pdf_progress').select('pdf_id,current_page,progress_percentage,reading_seconds,last_opened_at').eq('user_id',user.id).in('pdf_id',ids)
    ]);
    const {data:pr,error:pe}=progressResult;if(pe)throw pe;
    const pm=new Map((pr||[]).map(x=>[x.pdf_id,x]));
    const result = docs.map(d=>{const dl=allLinks.filter(x=>x.pdf_id===d.id); const active= scope==='global'?null:(dl.find(x=>x.concurso===concurso && (!workspaceId||x.workspace_id===workspaceId) && (!materia||x.materia===materia) && (!assunto||x.assunto===assunto))||dl.find(x=>x.concurso===concurso)||null); return {...d,links:dl,activeLink:active,progress:pm.get(d.id)||null};});
    // Guarda o acervo completo conhecido para manter a Biblioteca visível em falhas transitórias.
    if (scope === 'global' && !workspaceId && !materia && !assunto && !search) writeCache(user.id,result);
    else {
      try {
        const existing=readCache(user.id); const map=new Map(existing.map(d=>[d.id,d])); result.forEach(d=>map.set(d.id,d)); writeCache(user.id,[...map.values()]);
      } catch (_) {}
    }
    return result;
  }

  async function list(filters={}) {
    const user = await core().getAuthenticatedUser();
    try { return await core().retry(()=>listRemote(filters),{attempts:2,delayMs:300}); }
    catch (error) {
      if (!core().isNetworkError(error)) throw error;
      const cached = filterCached(readCache(user.id), filters);
      if (cached.length) return cached.map(d=>({...d,__fromCache:true}));
      throw error;
    }
  }

  async function getCached(filters={}) {
    const user = await core().getAuthenticatedUser();
    return filterCached(readCache(user.id), filters);
  }

  async function rememberDocument(doc) {
    if (!doc?.id) return;
    const user=await core().getAuthenticatedUser();
    const current=readCache(user.id); const map=new Map(current.map(d=>[d.id,d]));
    map.set(doc.id,doc); writeCache(user.id,[...map.values()]);
  }

  async function forgetDocuments(ids){
    const list=new Set((Array.isArray(ids)?ids:[ids]).filter(Boolean));if(!list.size)return;
    const user=await core().getAuthenticatedUser();writeCache(user.id,readCache(user.id).filter(d=>!list.has(d.id)));
  }
  async function removeMany(docs,{chunkSize=25,onProgress}={}){
    const valid=(Array.isArray(docs)?docs:[]).filter(d=>d?.id&&d?.storage_path);if(!valid.length)return{deleted:0,total:0};
    const user=await core().getAuthenticatedUser(),client=core().getSupabaseClient();
    for(const d of valid)if(!String(d.storage_path).startsWith(`${user.id}/`))throw new Error('Um dos PDFs possui caminho de Storage inválido.');
    let deleted=0;const size=Math.max(1,Math.min(Number(chunkSize)||25,50));
    for(let i=0;i<valid.length;i+=size){
      const chunk=valid.slice(i,i+size),paths=chunk.map(d=>d.storage_path),ids=chunk.map(d=>d.id);
      const {error:storageError}=await client.storage.from(core().BUCKET).remove(paths);if(storageError)throw storageError;
      const {error:dbError}=await client.from('pdf_documents').delete().eq('user_id',user.id).in('id',ids);if(dbError)throw dbError;
      deleted+=chunk.length;await forgetDocuments(ids);onProgress?.({deleted,total:valid.length,percent:Math.round((deleted/valid.length)*100)});
    }
    return{deleted,total:valid.length};
  }

  async function setFavorite(id,v){const u=await core().getAuthenticatedUser();const c=core().getSupabaseClient();const {data,error}=await c.from('pdf_documents').update({is_favorite:!!v,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',u.id).select().single();if(error)throw error;return data;}
  async function remove(doc){const result=await removeMany([doc]);return result.deleted===1;}
  async function createSignedUrl(doc,sec=900){const c=core().getSupabaseClient();const {data,error}=await c.storage.from(core().BUCKET).createSignedUrl(doc.storage_path,sec);if(error)throw error;return data?.signedUrl;}
  async function downloadBlob(doc){if(!doc?.storage_path)throw new Error('PDF sem caminho de Storage.');const c=core().getSupabaseClient();const {data,error}=await core().retry(()=>c.storage.from(core().BUCKET).download(doc.storage_path),{attempts:3,delayMs:350});if(error)throw error;if(!data)throw new Error('Não foi possível baixar o PDF.');return data;}
  async function updatePageCount(id,pageCount){const u=await core().getAuthenticatedUser(),c=core().getSupabaseClient();const {error}=await c.from('pdf_documents').update({page_count:Number(pageCount)||null,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',u.id);if(error)throw error;return true;}
  global.PdfStudyLibrary=Object.freeze({list,getCached,setFavorite,remove,removeMany,forgetDocuments,createSignedUrl,rememberDocument,downloadBlob,updatePageCount});
})(window);
