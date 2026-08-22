(function(){
'use strict';
function ensureButtonParityStyles(){
  if(document.getElementById('studyReportButtonParityStyles'))return;
  const style=document.createElement('style');
  style.id='studyReportButtonParityStyles';
  style.textContent=`
    .retention-report-actions .retention-study-now-v1072,
    .retention-report-actions .retention-export-report-btn{
      width:182px;
      min-width:182px;
      min-height:54px;
      height:54px;
      box-sizing:border-box;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:7px;
      padding:0 18px;
      white-space:nowrap;
    }
    @media(max-width:700px){
      .retention-report-actions .retention-study-now-v1072,
      .retention-report-actions .retention-export-report-btn{
        width:100%;
        min-width:0;
        height:54px;
        min-height:54px;
      }
    }
  `;
  document.head.appendChild(style);
}
function load(src,marker,onload){
  if(document.querySelector(`script[${marker}]`)){if(onload)onload();return;}
  const s=document.createElement('script');s.src=src;s.defer=true;s.setAttribute(marker,'1');if(onload)s.onload=onload;s.onerror=()=>console.warn(`Não foi possível carregar ${src}`);document.head.appendChild(s);
}
function boot(){
  ensureButtonParityStyles();
  load('./js/pdf/pdf-reader-panel-layout.js','data-pdf-reader-panel-layout');
  if(window.StudyPerformanceReport){load('./js/study-performance-report-v2.js','data-study-report-v2');return;}
  load('./js/study-performance-report-core.js','data-study-report-core',()=>load('./js/study-performance-report-v2.js','data-study-report-v2'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('load',boot,{once:true});
})();
