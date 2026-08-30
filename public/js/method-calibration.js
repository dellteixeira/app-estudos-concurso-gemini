(function installMethodCalibration(global){
'use strict';
if(global.AppMethodCalibration)return;

const MIN_SAMPLES=3;
const SWITCH_MARGIN=8;
const MAX_MINUTES_DELTA=.2;
const ALLOWED_BY_DIAGNOSIS={
  acquisition:['focused_restudy','short_review'],
  retention:['active_recall','short_review'],
  application:['questions','active_recall'],
  persistent:['focused_restudy','questions','active_recall'],
  false_mastery:['questions','active_recall'],
  mixed:['active_recall','short_review','questions','focused_restudy']
};

function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function statsMap(){
  const rows=global.AppAdaptiveFeedbackLoop?.getActionStats?.()||[];
  return new Map(rows.map(row=>[row.action,row]));
}
function allowedActions(intervention){
  return ALLOWED_BY_DIAGNOSIS[intervention?.diagnosisType]||ALLOWED_BY_DIAGNOSIS.mixed;
}
function adjustMinutes(minutes,score){
  const base=Math.max(5,Number(minutes)||15);
  const factor=score>=8?1.1:score<=-8?.9:1;
  const limited=clamp(factor,1-MAX_MINUTES_DELTA,1+MAX_MINUTES_DELTA);
  return Math.max(5,Math.round(base*limited));
}
function calibrate(intervention){
  if(!intervention?.recommendedAction)return intervention;
  const stats=statsMap();
  const current=stats.get(intervention.recommendedAction);
  const allowed=allowedActions(intervention);
  const eligible=allowed.map(action=>stats.get(action)).filter(row=>row&&row.count>=MIN_SAMPLES);
  let selected=intervention.recommendedAction;
  let reason='insufficient-evidence';
  if(eligible.length){
    eligible.sort((a,b)=>b.averageScore-a.averageScore||b.positive-a.positive);
    const preferred=eligible[0];
    const currentScore=current?.count>=MIN_SAMPLES?Number(current.averageScore)||0:0;
    if(preferred.action!==selected&&preferred.averageScore-currentScore>=SWITCH_MARGIN){
      selected=preferred.action;
      reason='personal-efficacy-margin';
    }else reason='keep-current-method';
  }
  const selectedStats=stats.get(selected);
  const calibratedMinutes=adjustMinutes(intervention.suggestedMinutes,selectedStats?.averageScore||0);
  return {
    ...intervention,
    recommendedAction:selected,
    suggestedMinutes:calibratedMinutes,
    calibration:{
      applied:selected!==intervention.recommendedAction||calibratedMinutes!==Number(intervention.suggestedMinutes),
      reason,
      samples:Number(selectedStats?.count)||0,
      averageScore:Number(selectedStats?.averageScore)||0,
      authority:'pedagogical-method-only'
    }
  };
}

global.AppMethodCalibration=Object.freeze({calibrate,MIN_SAMPLES,SWITCH_MARGIN});
})(window);
