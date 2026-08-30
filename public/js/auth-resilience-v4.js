(function installAuthResilience(global){
'use strict';
if(global.AppAuthResilienceV4)return;

const LOGIN_SELECTOR='[data-action="auth-login"]';
const STATUS_ID='authStatusMessage';
let busy=false;
let bootstrapPromise=null;

function getClient(){
  try{return typeof supabaseClient!=='undefined'?supabaseClient:null}catch(_){return null}
}
function setStatus(message,type='info'){
  const el=document.getElementById(STATUS_ID);if(!el)return;
  el.hidden=false;el.setAttribute('aria-hidden','false');el.dataset.state=type;el.textContent=String(message||'');
}
function clearStatus(){
  const el=document.getElementById(STATUS_ID);if(!el)return;
  el.hidden=true;el.setAttribute('aria-hidden','true');el.textContent='';delete el.dataset.state;
}
function setBusy(value){
  busy=!!value;
  document.querySelectorAll(LOGIN_SELECTOR).forEach(btn=>{btn.disabled=busy;btn.setAttribute('aria-busy',busy?'true':'false')});
}
function setVisible(element,visible,mode='block'){
  if(!element)return;
  try{
    if(typeof setRuntimeDisplay==='function'){
      setRuntimeDisplay(element,visible?mode:'none');
      return;
    }
  }catch(_){}
  element.hidden=!visible;
  element.setAttribute('aria-hidden',visible?'false':'true');
  element.style.display=visible?mode:'none';
}
function dashboardVisible(){
  const dash=document.getElementById('app-dashboard');
  return !!dash&&getComputedStyle(dash).display!=='none'&&!dash.hidden;
}
function cleanAuthUrl(){
  try{
    const url=new URL(global.location.href);let changed=false;
    ['error','error_code','error_description','code','type'].forEach(key=>{if(url.searchParams.has(key)){url.searchParams.delete(key);changed=true}});
    if(url.hash&&/(error|error_code|error_description|access_token|refresh_token|type=recovery)/.test(url.hash)){url.hash='';changed=true}
    if(changed)history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);
  }catch(_){}
}
function authErrorMessage(error){
  const raw=String(error?.message||error||'').toLowerCase();
  if(raw.includes('invalid login credentials'))return'E-mail ou senha inválidos.';
  if(raw.includes('email not confirmed'))return'Confirme seu e-mail antes de entrar.';
  if(raw.includes('rate limit')||raw.includes('too many'))return'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if(raw.includes('refresh token')||raw.includes('session')&&raw.includes('invalid'))return'A sessão anterior expirou. Entre novamente.';
  if(raw.includes('failed to fetch')||raw.includes('network'))return'Não foi possível alcançar o servidor de autenticação. Verifique a conexão.';
  return error?.message||'Não foi possível entrar. Tente novamente.';
}
async function clearLocalSession(client){
  try{await client.auth.signOut({scope:'local'})}catch(_){try{await client.auth.signOut()}catch(__){}}
}
function assignCanonicalUser(user){
  try{
    currentUser=user;
    return !!currentUser?.id&&String(currentUser.id)===String(user?.id||'');
  }catch(error){
    console.error('[Auth] currentUser indisponível no app-core.',error);
    return false;
  }
}
async function completeAppSession(session,authority='supabase-session'){
  if(!session?.user?.id)return false;
  if(bootstrapPromise)return bootstrapPromise;
  bootstrapPromise=(async()=>{
    const auth=document.getElementById('auth-screen');
    const dash=document.getElementById('app-dashboard');
    if(!assignCanonicalUser(session.user))throw new Error('O estado principal do aplicativo não aceitou a sessão autenticada.');
    if(typeof loadData!=='function')throw new Error('O carregador principal do painel não está disponível.');

    setStatus('Login confirmado. Carregando seus estudos…','loading');
    setVisible(auth,false);
    setVisible(dash,true,'block');

    try{
      await loadData();
      clearStatus();
      global.dispatchEvent(new CustomEvent('auth-resilience-session-valid',{detail:{userId:session.user.id||'',authority}}));
      global.dispatchEvent(new CustomEvent('auth-resilience-dashboard-ready',{detail:{userId:session.user.id||'',authority}}));
      return dashboardVisible();
    }catch(error){
      setVisible(dash,false);
      setVisible(auth,true,'flex');
      throw error;
    }
  })().finally(()=>{bootstrapPromise=null});
  return bootstrapPromise;
}
async function login(){
  if(busy)return false;
  const client=getClient();
  if(!client){setStatus('Serviço de autenticação ainda não está disponível. Reabra o aplicativo e tente novamente.','error');return false}
  const email=String(document.getElementById('email')?.value||'').trim();
  const password=String(document.getElementById('password')?.value||'');
  if(!email||!password){setStatus('Informe e-mail e senha.','error');return false}
  setBusy(true);setStatus('Validando sua conta…','loading');
  try{
    await clearLocalSession(client);
    cleanAuthUrl();
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error)throw error;
    if(!data?.session||!data?.user)throw new Error('Sessão não foi criada pelo servidor.');
    const ready=await completeAppSession(data.session,'supabase-sign-in');
    if(!ready)throw new Error('A sessão foi autenticada, mas o painel não ficou visível.');
    return true;
  }catch(error){
    console.error('[Auth] Falha ao concluir autenticação/painel.',error);
    setStatus(authErrorMessage(error),'error');return false;
  }finally{setBusy(false)}
}
async function inspectStoredSession(){
  const client=getClient();if(!client)return null;
  try{
    const {data,error}=await client.auth.getSession();if(error)throw error;
    let session=data?.session||null;if(!session)return null;
    const expiresAt=Number(session.expires_at||0)*1000;
    if(expiresAt&&expiresAt<=Date.now()+30000){
      const refreshed=await client.auth.refreshSession();if(refreshed.error)throw refreshed.error;
      session=refreshed.data?.session||null;
    }
    return session;
  }catch(error){await clearLocalSession(client);setStatus(authErrorMessage(error),'warning');return null}
}
function recoveryErrorFromUrl(){
  try{
    const url=new URL(global.location.href);const params=new URLSearchParams(url.hash.startsWith('#')?url.hash.slice(1):url.hash);
    const code=url.searchParams.get('error_code')||params.get('error_code');const desc=url.searchParams.get('error_description')||params.get('error_description');
    if(code||desc)return{code,desc};
  }catch(_){}
  return null;
}
async function boot(){
  const recoveryError=recoveryErrorFromUrl();
  if(recoveryError){setStatus('O link de recuperação expirou ou já foi utilizado. Entre normalmente com sua senha atual.','warning');cleanAuthUrl()}
  const session=await inspectStoredSession();
  if(!session)return;
  try{
    await completeAppSession(session,'supabase-session');
  }catch(error){
    console.error('[Auth] Sessão persistida válida, mas o painel não inicializou.',error);
    setStatus('Sua sessão está válida, mas o painel não pôde ser carregado. Feche e abra o aplicativo novamente.','error');
  }
}

document.addEventListener('click',event=>{
  const button=event.target?.closest?.(LOGIN_SELECTOR);if(!button)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void login();
},true);
document.addEventListener('keydown',event=>{
  if(event.key!=='Enter')return;const auth=document.getElementById('auth-screen');
  if(!auth||getComputedStyle(auth).display==='none'||!auth.contains(event.target))return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void login();
},true);

void boot();
global.AppAuthResilienceV4=Object.freeze({login,inspectStoredSession,clearLocalSession,authErrorMessage,cleanAuthUrl,completeAppSession});
})(window);
