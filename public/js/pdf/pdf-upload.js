(function (global) {
  'use strict';
  const core = () => { if (!global.PdfStudyCore) throw new Error('PdfStudyCore não carregado.'); return global.PdfStudyCore; };
  const links = () => { if (!global.PdfStudyLinks) throw new Error('PdfStudyLinks não carregado.'); return global.PdfStudyLinks; };
  const ERROR_CODES = Object.freeze({
    INVALID_TYPE:'INVALID_TYPE', EMPTY_FILE:'EMPTY_FILE', TOO_LARGE:'TOO_LARGE', INVALID_PDF:'INVALID_PDF',
    NETWORK_ERROR:'NETWORK_ERROR', STORAGE_ERROR:'STORAGE_ERROR', DATABASE_ERROR:'DATABASE_ERROR',
    PROGRESS_ERROR:'PROGRESS_ERROR', LINK_ERROR:'LINK_ERROR', UNKNOWN_ERROR:'UNKNOWN_ERROR'
  });
  function uuid(){if(global.crypto?.randomUUID)return global.crypto.randomUUID();return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)})}
  function cleanContext({workspaceId,concurso,materia,assunto}){
    if(!workspaceId)throw new Error('Selecione um Workspace para organizar o vínculo.');
    const ctx={workspaceId,concurso:core().normalizeText(concurso,180),materia:core().normalizeText(materia,180),assunto:core().normalizeText(assunto,300)};
    if(!ctx.concurso)throw new Error('O primeiro vínculo precisa indicar o concurso atual.');
    if(ctx.assunto&&!ctx.materia)throw new Error('Selecione uma matéria antes de escolher um assunto.');
    return ctx;
  }
  function uploadError({code,message,file,stage,technical,cause}){
    const error=new Error(message);error.name='PdfUploadError';error.code=code||ERROR_CODES.UNKNOWN_ERROR;error.fileName=file?.name||'';error.stage=stage||'unknown';error.userMessage=message;error.technicalMessage=String(technical||cause?.message||cause||'').trim();error.cause=cause;return error;
  }
  function classifyError(error,{file,stage='unknown'}={}){
    if(error?.name==='PdfUploadError')return error;
    const raw=String(error?.message||error||'');const lower=raw.toLowerCase();
    if(core().isNetworkError?.(error)||/network|fetch|failed to fetch|timeout|offline/.test(lower))return uploadError({code:ERROR_CODES.NETWORK_ERROR,message:'Falha de conexão durante o envio. Verifique a internet e tente novamente.',file,stage,technical:raw,cause:error});
    if(/password|encrypted|encrypt|senha|protected/.test(lower))return uploadError({code:ERROR_CODES.INVALID_PDF,message:'O PDF parece protegido por senha ou criptografado e não pôde ser processado.',file,stage,technical:raw,cause:error});
    if(stage==='storage'||/storage|bucket|object/.test(lower))return uploadError({code:ERROR_CODES.STORAGE_ERROR,message:'O Storage não aceitou o arquivo. Tente novamente; se persistir, verifique espaço, política ou conexão.',file,stage,technical:raw,cause:error});
    if(stage==='database')return uploadError({code:ERROR_CODES.DATABASE_ERROR,message:'O arquivo chegou ao servidor, mas não foi possível registrar seus metadados no banco.',file,stage,technical:raw,cause:error});
    if(stage==='progress')return uploadError({code:ERROR_CODES.PROGRESS_ERROR,message:'O PDF foi enviado, mas o estado inicial de leitura não pôde ser criado. O envio foi desfeito com segurança.',file,stage,technical:raw,cause:error});
    if(stage==='link')return uploadError({code:ERROR_CODES.LINK_ERROR,message:'O PDF foi enviado, mas não foi possível vinculá-lo ao destino escolhido. O envio foi desfeito com segurança.',file,stage,technical:raw,cause:error});
    return uploadError({code:ERROR_CODES.UNKNOWN_ERROR,message:'Não foi possível carregar este PDF por um erro inesperado.',file,stage,technical:raw,cause:error});
  }
  async function preflight(file){
    const validation=core().validatePdfFile(file);
    if(!validation.ok){
      const msg=String(validation.error||'Arquivo PDF inválido.');
      const code=file?.size===0?ERROR_CODES.EMPTY_FILE:/100|limite|MB|grande|tamanho/i.test(msg)?ERROR_CODES.TOO_LARGE:ERROR_CODES.INVALID_TYPE;
      throw uploadError({code,message:msg,file,stage:'validation',technical:msg});
    }
    if(Number(file?.size||0)===0)throw uploadError({code:ERROR_CODES.EMPTY_FILE,message:'O arquivo está vazio (0 bytes).',file,stage:'validation'});
    try{
      const head=await file.slice(0,1024).text();
      if(!head.includes('%PDF-'))throw uploadError({code:ERROR_CODES.INVALID_PDF,message:'O arquivo tem extensão PDF, mas o conteúdo não possui uma assinatura PDF válida. Ele pode estar corrompido ou ter sido renomeado incorretamente.',file,stage:'validation'});
    }catch(error){if(error?.name==='PdfUploadError')throw error;throw classifyError(error,{file,stage:'validation'})}
    return true;
  }
  async function uploadOne({file,title,context,user,client,onProgress}){
    await preflight(file);
    const pdfId=uuid(),storagePath=core().buildStoragePath({userId:user.id,pdfId});
    const cleanTitle=core().normalizeText(title||String(file.name||'').replace(/\.pdf$/i,''),240);if(!cleanTitle)throw uploadError({code:ERROR_CODES.INVALID_PDF,message:'Informe um título para o PDF.',file,stage:'validation'});
    onProgress?.({stage:'uploading',percent:20});
    let uploadResult;
    try{uploadResult=await client.storage.from(core().BUCKET).upload(storagePath,file,{contentType:'application/pdf',cacheControl:'3600',upsert:false})}catch(error){throw classifyError(error,{file,stage:'storage'})}
    if(uploadResult?.error)throw classifyError(uploadResult.error,{file,stage:'storage'});
    onProgress?.({stage:'registering',percent:55});
    const documentPayload={id:pdfId,user_id:user.id,title:cleanTitle,original_file_name:core().normalizeText(file.name,255),storage_path:storagePath,mime_type:'application/pdf',file_size:file.size,updated_at:new Date().toISOString()};
    let documentRow;
    try{
      const res=await client.from('pdf_documents').insert(documentPayload).select().single();
      if(res.error)throw res.error;documentRow=res.data;
    }catch(error){await client.storage.from(core().BUCKET).remove([storagePath]).catch(()=>null);throw classifyError(error,{file,stage:'database'})}
    try{
      const res=await client.from('pdf_progress').upsert({user_id:user.id,pdf_id:pdfId,current_page:1,progress_percentage:0,reading_seconds:0,updated_at:new Date().toISOString()},{onConflict:'user_id,pdf_id'});
      if(res.error)throw res.error;
    }catch(error){await client.from('pdf_documents').delete().eq('id',pdfId).eq('user_id',user.id).catch(()=>null);await client.storage.from(core().BUCKET).remove([storagePath]).catch(()=>null);throw classifyError(error,{file,stage:'progress'})}
    onProgress?.({stage:'linking',percent:80});
    try{
      const link=await links().create({pdfId,workspaceId:context.workspaceId,concurso:context.concurso,materia:context.materia,assunto:context.assunto});
      const result={...documentRow,links:[link],activeLink:link,progress:{pdf_id:pdfId,current_page:1,progress_percentage:0,reading_seconds:0}};
      try{await global.PdfStudyLibrary?.rememberDocument?.(result)}catch(_){}
      onProgress?.({stage:'done',percent:100});return result;
    }catch(error){await client.from('pdf_documents').delete().eq('id',pdfId).eq('user_id',user.id).catch(()=>null);await client.storage.from(core().BUCKET).remove([storagePath]).catch(()=>null);throw classifyError(error,{file,stage:'link'})}
  }
  async function upload(args){
    const context=cleanContext(args);const user=await core().getAuthenticatedUser(),client=core().getSupabaseClient();
    return uploadOne({file:args.file,title:args.title,context,user,client,onProgress:args.onProgress});
  }
  async function uploadMany({files,workspaceId,concurso,materia,assunto,concurrency=3,onProgress,onItemProgress}){
    const queue=[...(files||[])];if(!queue.length)throw new Error('Selecione pelo menos um PDF.');
    const context=cleanContext({workspaceId,concurso,materia,assunto});
    const user=await core().getAuthenticatedUser(),client=core().getSupabaseClient();
    const successful=[],failed=[];let cursor=0,completed=0;
    const workerCount=Math.max(1,Math.min(Number(concurrency)||3,4,queue.length));
    onProgress?.({completed:0,total:queue.length,percent:0,successful:0,failed:0});
    async function worker(){
      while(true){
        const index=cursor++;if(index>=queue.length)return;const file=queue[index];
        try{
          const doc=await uploadOne({file,title:String(file.name||'').replace(/\.pdf$/i,''),context,user,client,onProgress:p=>onItemProgress?.({index,file,...p})});
          successful.push(doc);onItemProgress?.({index,file,stage:'done',percent:100,document:doc});
        }catch(error){const classified=classifyError(error,{file,stage:error?.stage||'unknown'});failed.push({file,error:classified,code:classified.code,stage:classified.stage,message:classified.userMessage,technicalMessage:classified.technicalMessage});onItemProgress?.({index,file,stage:'error',percent:100,error:classified,code:classified.code,message:classified.userMessage})}
        completed++;onProgress?.({completed,total:queue.length,percent:Math.round((completed/queue.length)*100),successful:successful.length,failed:failed.length});
      }
    }
    await Promise.all(Array.from({length:workerCount},worker));
    return {successful,failed,total:queue.length};
  }
  global.PdfStudyUpload=Object.freeze({upload,uploadMany,preflight,classifyError,ERROR_CODES});
})(window);
