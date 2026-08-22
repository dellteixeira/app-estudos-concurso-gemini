(function(){
'use strict';
const PANEL_BREAKPOINT='(max-width:700px)';

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

function ensureReaderPanelStyles(){
  if(document.getElementById('pdfReaderPanelExpansionStyles'))return;
  const style=document.createElement('style');
  style.id='pdfReaderPanelExpansionStyles';
  style.textContent=`
    .pdf-reader-overlay.side-collapsed .pdf-reader-body{
      grid-template-columns:minmax(0,1fr)!important;
      width:100%!important;
      max-width:none!important;
    }
    .pdf-reader-overlay.side-collapsed #pdfReaderCanvasWrap{
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
    }
    .pdf-reader-overlay.side-collapsed #pdfReaderPageHost{
      min-width:100%!important;
    }
    @media(max-width:700px){
      .pdf-reader-body{grid-template-columns:minmax(0,1fr)!important}
      #pdfReaderCanvasWrap{width:100%!important;max-width:none!important}
    }
  `;
  document.head.appendChild(style);
}

function readZoomScale(){
  const raw=String(document.getElementById('pdfReaderZoomValue')?.textContent||'').replace(',','.');
  const value=Number.parseFloat(raw);
  return Number.isFinite(value)&&value>0?value/100:null;
}

function afterReaderLayout(callback){
  requestAnimationFrame(()=>requestAnimationFrame(callback));
}

function installReaderPanelExpansion(attempt=0){
  ensureReaderPanelStyles();
  const reader=window.PdfStudyReader;
  if(!reader?.toggleSide||!reader?.zoom||!reader?.fitWidth||!reader?.fitPage){
    if(attempt<100)setTimeout(()=>installReaderPanelExpansion(attempt+1),100);
    return false;
  }
  if(reader.toggleSide?.__panelExpansionV2)return true;

  const enhancedToggleSide=function(){
    const overlay=document.getElementById('pdfReaderOverlay');
    const canvasWrap=document.getElementById('pdfReaderCanvasWrap');
    if(!overlay||!canvasWrap)return;

    const mobile=window.matchMedia?.(PANEL_BREAKPOINT)?.matches;
    const beforeWidth=canvasWrap.getBoundingClientRect().width||canvasWrap.clientWidth;
    const fitWidthActive=document.getElementById('pdfReaderFitWidth')?.classList.contains('active');
    const fitPageActive=document.getElementById('pdfReaderFitPage')?.classList.contains('active');
    const customScale=(!fitWidthActive&&!fitPageActive)?readZoomScale():null;

    overlay.classList.toggle('side-collapsed');
    const collapsed=overlay.classList.contains('side-collapsed');
    overlay.dataset.panelCollapsed=collapsed?'true':'false';

    afterReaderLayout(()=>{
      const afterWidth=canvasWrap.getBoundingClientRect().width||canvasWrap.clientWidth;
      if(mobile)return;
      if(fitWidthActive){reader.fitWidth();return;}
      if(fitPageActive){reader.fitPage();return;}
      if(customScale&&beforeWidth>0&&afterWidth>0){
        const ratio=afterWidth/beforeWidth;
        if(Number.isFinite(ratio)&&Math.abs(ratio-1)>.01){
          const target=Math.min(4,Math.max(.4,customScale*ratio));
          reader.zoom(target-customScale);
        }
      }
    });
  };
  enhancedToggleSide.__panelExpansionV2=true;
  window.PdfStudyReader=Object.freeze({...reader,toggleSide:enhancedToggleSide});
  return true;
}

function load(src,marker,onload){
  if(document.querySelector(`script[${marker}]`)){if(onload)onload();return;}
  const s=document.createElement('script');s.src=src;s.defer=true;s.setAttribute(marker,'1');if(onload)s.onload=onload;s.onerror=()=>console.warn(`Não foi possível carregar ${src}`);document.head.appendChild(s);
}

function boot(){
  ensureButtonParityStyles();
  installReaderPanelExpansion();
  // Compatibilidade: o módulo auxiliar continua referenciado, mas se a V2 já foi
  // instalada ele apenas encerra sem substituir a implementação ativa.
  load('./js/pdf/pdf-reader-panel-layout.js?rev=20260822-2','data-pdf-reader-panel-layout-v2');
  if(window.StudyPerformanceReport){load('./js/study-performance-report-v2.js','data-study-report-v2');return;}
  load('./js/study-performance-report-core.js','data-study-report-core',()=>load('./js/study-performance-report-v2.js','data-study-report-v2'));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('load',boot,{once:true});
})();
