(function installAuthResilience(global){
'use strict';
if(global.AppAuthResilience)return;

const LOGIN_SELECTOR='[data-action="auth-login"]';
const STATUS_ID='authStatusMessage';
const RELOAD_GUARD='auth_resilience_reload_guard';
let busy=false;

function getClient(){
  try{return typeof supabaseClient!=='undefined'?supabaseClient:null}catch(_){return null}
}
function setStatus(message,type='info'){
  const el=document.getElementById(STATUS_ID);if(!el)return;
  el.hidden=false;el.setAttribute('aria-hidden','false');el.dataset.state=type;el.textContent=String(message||'');
}
function setBusy(value){
  busy=!!value;
  document.querySelectorAll(LOGIN_SELECTOR).forEach(btn=>{btn.disabled=busy;btn.setAttribute('aria-busy',busy?'true':'false')});
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
  try{await client.auth.signOut({scope:'local'})}catch(_){
    try{await client.auth.signOut()}catch(__){}
  }
}
async function login(){
  if(busy)return false;
  const client=getClient();if(!client){setStatus('Serviço de autenticação ainda não está disponível. Recarregue a página.','error');return false}
  const email=String(document.getElementById('email')?.value||'').trim();
  const password=String(document.getElementById('password')?.value||'');
  if(!email||!password){setStatus('Informe e-mail e senha.','error');return false}
  setBusy(true);setStatus('Validando sua conta…','loading');
  try{
    await clearLocalSession(client);
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error)throw error;
    if(!data?.session||!data?.user)throw new Error('Sessão não foi criada pelo servidor.');
    sessionStorage.removeItem(RELOAD_GUARD);cleanAuthUrl();setStatus('Login confirmado. Abrindo o painel…','success');
    setTimeout(()=>global.location.reload(),80);return true;
  }catch(error){
    setStatus(authErrorMessage(error),'error');return false;
  }finally{setBusy(false)}
}
async function inspectStoredSession(){
  const client=getClient();if(!client)return null;
  try{
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    const session=data?.session||null;
    if(!session)return null;
    const expiresAt=Number(session.expires_at||0)*1000;
    if(expiresAt&&expiresAt<=Date.now()+30000){
      const refreshed=await client.auth.refreshSession();
      if(refreshed.error)throw refreshed.error;
      return refreshed.data?.session||null;
    }
    return session;
  }catch(error){
    await clearLocalSession(client);setStatus(authErrorMessage(error),'warning');return null;
  }
}
function recoveryErrorFromUrl(){
  try{
    const url=new URL(global.location.href);
    const params=new URLSearchParams(url.hash.startsWith('#')?url.hash.slice(1):url.hash);
    const code=url.searchParams.get('error_code')||params.get('error_code');
    const desc=url.searchParams.get('error_description')||params.get('error_description');
    if(code||desc)return{code,desc};
  }catch(_){}
  return null;
}
async function boot(){
  const recoveryError=recoveryErrorFromUrl();
  if(recoveryError){setStatus('O link de recuperação expirou ou já foi utilizado. Entre normalmente com sua senha atual.','warning');cleanAuthUrl()}
  const session=await inspectStoredSession();
  if(session){
    global.dispatchEvent(new CustomEvent('auth-resilience-session-valid',{detail:{userId:session.user?.id||'',authority:'supabase-session'}}));
    const auth=document.getElementById('auth-screen');
    if(auth&&getComputedStyle(auth).display!=='none'&&!sessionStorage.getItem(RELOAD_GUARD)){
      sessionStorage.setItem(RELOAD_GUARD,'1');
      try{await getClient().auth.refreshSession()}catch(_){}
      setTimeout(()=>{if(getComputedStyle(auth).display!=='none')global.location.reload()},350);
    }else if(!auth||getComputedStyle(auth).display==='none')sessionStorage.removeItem(RELOAD_GUARD);
  }
}

document.addEventListener('click',event=>{
  const button=event.target?.closest?.(LOGIN_SELECTOR);if(!button)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();login();
},true);
document.addEventListener('keydown',event=>{
  if(event.key!=='Enter')return;const auth=document.getElementById('auth-screen');
  if(!auth||getComputedStyle(auth).display==='none'||!auth.contains(event.target))return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();login();
},true);

boot();
global.AppAuthResilience=Object.freeze({login,inspectStoredSession,clearLocalSession,authErrorMessage,cleanAuthUrl});
})(window);
