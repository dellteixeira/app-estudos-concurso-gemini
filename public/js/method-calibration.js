(function installMethodCalibration(global){
'use strict';
if(global.AppMethodCalibration)return;

const MIN_SAMPLES=3;
const SWITCH_MARGIN=8;
const MAX_MINUTES_DELTA=.2;
const DURATION_MARGIN=3;
const ALLOWED_BY_DIAGNOSIS={
  acquisition:['focused_restudy','short_review'],
  retention:['active_recall','short_review'],
  application:['questions','active_recall'],
  persistent:['focused_restudy','questions','active_recall'],
  false_mastery:['questions','active_recall'],
  mixed:['active_recall','short_review','questions','focused_restudy']
};

function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function statsMap(){const rows=global.AppAdaptiveFeedbackLoop?.getActionStats?.()||[];return new Map(rows.map(row=>[row.action,row]))}
function allowedActions(intervention){return ALLOWED_BY_DIAGNOSIS[intervention?.diagnosisType]||ALLOWED_BY_DIAGNOSIS.mixed}
function durationStats(action){return (global.AppAdaptiveFeedbackLoop?.getDurationStats?.(action)||[]).filter(row=>row.count>=MIN_SAMPLES)}
function chooseDuration(action,baseMinutes){
  const base=Math.max(5,Number(baseMinutes)||15);const rows=durationStats(action);
  if(!rows.length)return {minutes:base,reason:'insufficient-duration-evidence',samples:0,averageScore:0};
  rows.sort((a,b)=>b.averageScore-a.averageScore||b.count-a.count||b.averageCompletionRatio-a.averageCompletionRatio);
  const best=rows[0];const baseline=rows.reduce((sum,row)=>sum+row.averageScore*row.count,0)/rows.reduce((sum,row)=>sum+row.count,0);
  if(best.averageScore-baseline<DURATION_MARGIN)return {minutes:base,reason:'duration-margin-not-met',samples:best.count,averageScore:best.averageScore};
  const min=Math.max(5,Math.round(base*(1-MAX_MINUTES_DELTA)));const max=Math.max(min,Math.round(base*(1+MAX_MINUTES_DELTA)));
  return {minutes:Math.round(clamp(best.minutes,min,max)),reason:'personal-duration-evidence',samples:best.count,averageScore:best.averageScore};
}
function calibrate(intervention){
  if(!intervention?.recommendedAction)return intervention;
  const stats=statsMap();const current=stats.get(intervention.recommendedAction);const allowed=allowedActions(intervention);const eligible=allowed.map(action=>stats.get(action)).filter(row=>row&&row.count>=MIN_SAMPLES);
  let selected=intervention.recommendedAction;let reason='insufficient-evidence';
  if(eligible.length){eligible.sort((a,b)=>b.averageScore-a.averageScore||b.positive-a.positive);const preferred=eligible[0];const currentScore=current?.count>=MIN_SAMPLES?Number(current.averageScore)||0:0;if(preferred.action!==selected&&preferred.averageScore-currentScore>=SWITCH_MARGIN){selected=preferred.action;reason='personal-efficacy-margin'}else reason='keep-current-method';}
  const selectedStats=stats.get(selected);const duration=chooseDuration(selected,intervention.suggestedMinutes);const calibratedMinutes=duration.minutes;
  return {...intervention,recommendedAction:selected,suggestedMinutes:calibratedMinutes,calibration:{applied:selected!==intervention.recommendedAction||calibratedMinutes!==Number(intervention.suggestedMinutes),reason,samples:Number(selectedStats?.count)||0,averageScore:Number(selectedStats?.averageScore)||0,durationReason:duration.reason,durationSamples:duration.samples,durationAverageScore:duration.averageScore,authority:'pedagogical-method-only',durationAuthority:'pedagogical-duration-only'}};
}

global.AppMethodCalibration=Object.freeze({calibrate,chooseDuration,MIN_SAMPLES,SWITCH_MARGIN,MAX_MINUTES_DELTA,DURATION_MARGIN});
})(window);
