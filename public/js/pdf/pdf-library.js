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
  function manualCompare(a,b) {
    const ap = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
    const bp = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
    if (ap !== bp) return ap - bp;
    return String(a?.created_at || '').localeCompare(String(b?.created_at || '')) || String(a?.id || '').localeCompare(String(b?.id || ''));
  }
  function filterCached(docs,{scope='contest',concurso='',workspaceId='',materia='',assunto='',search=''}) {
    let out = Array.isArray(docs) ? [...docs].sort(manualCompare) : [];
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
    let q = client.from('pdf_documents').select('id,user_id,title,original_file_name,storage_path,mime_type,file_size,page_count,sha256,is_favorite,sort_order,created_at,updated_at').eq('user_id',user.id).order('sort_order',{ascending:true,nullsFirst:false}).order('created_at',{ascending:true});
    if (matchedLinks.length) q = q.in('id',[...new Set(matchedLinks.map(x=>x.pdf_id))]);
    if (search) { const safe=String(search).replace(/[,%()]/g,' ').trim(); if(safe) q=q.or(`title.ilike.%${safe}%,original_file_name.ilike.%${safe}%`); }
    const {data,error}=await q; if(error) throw error; const docs=(data||[]).sort(manualCompare); if(!docs.length)return[];
    const ids=docs.map(d=>d.id);
    const [allLinks,progressResult]=await Promise.all([
      links().list({ pdfIds: ids }),
      client.from('pdf_progress').select('pdf_id,current_page,progress_percentage,reading_seconds,last_opened_at').eq('user_id',user.id).in('pdf_id',ids)
    ]);
    const {data:pr,error:pe}=progressResult;if(pe)throw pe;
    const pm=new Map((pr||[]).map(x=>[x.pdf_id,x]));
    const result = docs.map(d=>{const dl=allLinks.filter(x=>x.pdf_id===d.id); const active= scope==='global'?null:(dl.find(x=>x.concurso===concurso && (!workspaceId||x.workspace_id===workspaceId) && (!materia||x.materia===materia) && (!assunto||x.assunto===assunto))||dl.find(x=>x.concurso===concurso)||null); return {...d,links:dl,activeLink:active,progress:pm.get(d.id)||null};});
    if (scope === 'global' && !workspaceId && !materia && !assunto && !search) writeCache(user.id,result);
    else {
      try {
        const existing=readCache(user.id); const map=new Map(existing.map(d=>[d.id,d])); result.forEach(d=>map.set(d.id,d)); writeCache(user.id,[...map.values()].sort(manualCompare));
      } catch (_) {}
    }
    return result;
  }

  async function list(filters={}) {
    const user = await core().getAuthenticatedUser();
    try { return await core().retry(()=>listRemote(filters),{attempts:3,delayMs:350}); }
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
    map.set(doc.id,doc); writeCache(user.id,[...map.values()].sort(manualCompare));
  }

  async function forgetDocuments(ids){
    const list=new Set((Array.isArray(ids)?ids:[ids]).filter(Boolean));if(!list.size)return;
    const user=await core().getAuthenticatedUser();writeCache(user.id,readCache(user.id).filter(d=>!list.has(d.id)));
  }

  async function persistVisibleOrder(visibleIds){
    const desired=[...new Set((Array.isArray(visibleIds)?visibleIds:[]).map(String).filter(Boolean))];
    if(!desired.length)return[];
    const user=await core().getAuthenticatedUser(),client=core().getSupabaseClient();
    const {data,error}=await client.from('pdf_documents').select('id,sort_order,created_at').eq('user_id',user.id).order('sort_order',{ascending:true,nullsFirst:false}).order('created_at',{ascending:true});
    if(error)throw error;
    const all=(data||[]).map(x=>String(x.id));
    const allSet=new Set(all);
    if(desired.some(id=>!allSet.has(id)))throw new Error('A Biblioteca mudou durante a reordenação. Atualize e tente novamente.');
    const visibleSet=new Set(desired),queue=[...desired];
    const merged=all.map(id=>visibleSet.has(id)?queue.shift():id);
    if(queue.length)merged.push(...queue);
    const {error:rpcError}=await client.rpc('reorder_my_pdf_documents',{p_order:merged});
    if(rpcError)throw rpcError;
    const positions=new Map(merged.map((id,index)=>[id,index+1]));
    const cache=readCache(user.id).map(d=>positions.has(String(d.id))?{...d,sort_order:positions.get(String(d.id))}:d).sort(manualCompare);
    writeCache(user.id,cache);
    return merged;
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

  async function createSignedUrl(doc,sec=900){
    const c=core().getSupabaseClient();
    return core().retry(async()=>{
      const {data,error}=await c.storage.from(core().BUCKET).createSignedUrl(doc.storage_path,sec);
      if(error)throw error;
      if(!data?.signedUrl)throw new Error('Não foi possível criar o acesso temporário ao PDF.');
      return data.signedUrl;
    },{attempts:3,delayMs:450});
  }

  async function downloadBlob(doc){
    if(!doc?.storage_path)throw new Error('PDF sem caminho de Storage.');
    const c=core().getSupabaseClient();
    try{
      return await core().retry(async()=>{
        const {data,error}=await c.storage.from(core().BUCKET).download(doc.storage_path);
        if(error)throw error;
        if(!data)throw new Error('Não foi possível baixar o PDF.');
        return data;
      },{attempts:5,delayMs:500});
    }catch(primaryError){
      if(!core().isNetworkError(primaryError))throw primaryError;
      try{
        const signedUrl=await createSignedUrl(doc,180);
        const response=await core().retry(async()=>{
          const r=await fetch(signedUrl,{cache:'no-store',credentials:'omit'});
          if(!r.ok)throw new Error(`Falha temporária ao baixar o PDF (HTTP ${r.status}).`);
          return r;
        },{attempts:3,delayMs:650});
        const blob=await response.blob();
        if(!blob?.size)throw new Error('O PDF retornou vazio.');
        return blob;
      }catch(fallbackError){
        console.warn('[PDF Library] download temporariamente indisponível após retries:',fallbackError);
        const friendly=new Error('A conexão oscilou ao abrir este PDF. O arquivo continua salvo com segurança. Aguarde alguns segundos e tente novamente.');
        friendly.cause=fallbackError;
        throw friendly;
      }
    }
  }

  async function updatePageCount(id,pageCount){const u=await core().getAuthenticatedUser(),c=core().getSupabaseClient();const {error}=await c.from('pdf_documents').update({page_count:Number(pageCount)||null,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',u.id);if(error)throw error;return true;}
  global.PdfStudyLibrary=Object.freeze({list,getCached,setFavorite,remove,removeMany,forgetDocuments,createSignedUrl,rememberDocument,downloadBlob,updatePageCount,persistVisibleOrder});
})(window);
