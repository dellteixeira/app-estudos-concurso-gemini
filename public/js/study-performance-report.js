(function(){
'use strict';
function load(src,marker,onload){
  if(document.querySelector(`script[${marker}]`)){if(onload)onload();return;}
  const s=document.createElement('script');s.src=src;s.defer=true;s.setAttribute(marker,'1');if(onload)s.onload=onload;s.onerror=()=>console.warn(`Não foi possível carregar ${src}`);document.head.appendChild(s);
}
function boot(){
  if(window.StudyPerformanceReport){load('./js/study-performance-report-v2.js','data-study-report-v2');return;}
  load('./js/study-performance-report-core.js','data-study-report-core',()=>load('./js/study-performance-report-v2.js','data-study-report-v2'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('load',boot,{once:true});
})();
