(function installAdaptivePomodoroBridge(global){
'use strict';
if(global.AppAdaptivePomodoroBridge)return;

const WRAPPED=Symbol('adaptivePomodoroWrapped');
const MAX_INSTALL_ATTEMPTS=40;
function activeExecution(){return global.AppAdaptiveSessionCompletion?.getActiveExecution?.()||null}
function elapsedMinutes(){try{return Math.max(0,Number(global.getCurrentTimerElapsedSeconds?.()||0)/60)}catch(_){return 0}}
function sameExecution(snapshot){const current=activeExecution();return Boolean(snapshot&&current&&current.topicId===snapshot.topicId&&current.startedAt===snapshot.startedAt)}
function emit(status,minutes,snapshot){
  if(!snapshot||!sameExecution(snapshot))return false;
  global.dispatchEvent(new CustomEvent('adaptive-study-execution',{detail:{status,elapsedMinutes:Number(Math.max(0,Number(minutes)||0).toFixed(1)),topicId:String(snapshot.topicId||'').slice(0,600),source:'pomodoro-runtime'}}));
  return true;
}
function wrapAsync(name,after){
  const original=global[name];
  if(typeof original!=='function')return false;
  if(original[WRAPPED])return true;
  const wrapped=async function(...args){const snapshot=activeExecution();const before=elapsedMinutes();const result=await original.apply(this,args);if(snapshot&&sameExecution(snapshot))after({snapshot,before,after:elapsedMinutes()});return result};
  wrapped[WRAPPED]=true;wrapped.__adaptiveOriginal=original;global[name]=wrapped;return true;
}
function wrapSync(name,after){
  const original=global[name];
  if(typeof original!=='function')return false;
  if(original[WRAPPED])return true;
  const wrapped=function(...args){const snapshot=activeExecution();const before=elapsedMinutes();const result=original.apply(this,args);if(snapshot&&sameExecution(snapshot))after({snapshot,before,after:elapsedMinutes()});return result};
  wrapped[WRAPPED]=true;wrapped.__adaptiveOriginal=original;global[name]=wrapped;return true;
}
function install(){
  const auto=wrapAsync('completeElapsedTimerCycle',({snapshot,before})=>{if(before>0)emit('completed',before,snapshot)});
  const manual=wrapAsync('completeFocusSessionNow',({snapshot,before,after})=>{if(before>=1&&after<.05)emit('completed',before,snapshot)});
  const reset=wrapSync('resetTimer',({snapshot,before})=>{emit(before>=1?'interrupted':'abandoned',before,snapshot)});
  return {auto,manual,reset,ready:auto&&manual&&reset};
}
function installUntilReady(){
  let attempts=0;
  const tryInstall=()=>{attempts+=1;const result=install();if(result.ready||attempts>=MAX_INSTALL_ATTEMPTS)return;setTimeout(tryInstall,100)};
  tryInstall();
}
installUntilReady();
global.AppAdaptivePomodoroBridge=Object.freeze({install,elapsedMinutes});
})(window);
