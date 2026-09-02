(function installStudyOptimizationDashboardCompat(global){
'use strict';
if(global.AppStudyOptimizationDashboard)return;
const noop=()=>null;
global.AppStudyOptimizationDashboard=Object.freeze({
  disabled:true,
  headless:true,
  init:()=>false,
  generate:noop,
  renderPlan:noop,
  selectBlock:()=>false,
  methodLabel:method=>String(method||''),
  get selectedMinutes(){return 60},
  get latestPlan(){return null}
});
})(window);
