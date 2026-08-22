(function(global){
'use strict';

const MOBILE_BREAKPOINT='(max-width:700px)';
let installed=false;

function numberFromZoomLabel(){
  const raw=String(document.getElementById('pdfReaderZoomValue')?.textContent||'').replace(',','.');
  const value=Number.parseFloat(raw);
  return Number.isFinite(value)&&value>0?value/100:null;
}

function afterLayout(callback){
  requestAnimationFrame(()=>requestAnimationFrame(callback));
}

function install(){
  if(installed)return true;
  const reader=global.PdfStudyReader;
  if(!reader?.toggleSide||!reader?.zoom||!reader?.fitWidth||!reader?.fitPage)return false;

  const enhancedToggleSide=function(){
    const overlay=document.getElementById('pdfReaderOverlay');
    const canvasWrap=document.getElementById('pdfReaderCanvasWrap');
    if(!overlay||!canvasWrap)return reader.toggleSide();

    const beforeWidth=canvasWrap.clientWidth;
    const fitWidthActive=document.getElementById('pdfReaderFitWidth')?.classList.contains('active');
    const fitPageActive=document.getElementById('pdfReaderFitPage')?.classList.contains('active');
    const customScale=(!fitWidthActive&&!fitPageActive)?numberFromZoomLabel():null;

    overlay.classList.toggle('side-collapsed');
    const collapsed=overlay.classList.contains('side-collapsed');
    overlay.setAttribute('data-panel-collapsed',collapsed?'true':'false');

    afterLayout(()=>{
      const afterWidth=canvasWrap.clientWidth;
      const mobile=global.matchMedia?.(MOBILE_BREAKPOINT)?.matches;

      // No mobile o painel é um drawer sobreposto: o PDF já ocupa 100% da tela.
      // Não alteramos o zoom ao abrir/fechar para evitar saltos de leitura.
      if(mobile)return;

      // Nos modos de encaixe, reutilize o cálculo canônico do próprio Reader.
      if(fitWidthActive){reader.fitWidth();return;}
      if(fitPageActive){reader.fitPage();return;}

      // Em zoom manual, o Reader antigo mantinha a escala e deixava um vazio
      // onde estava o painel. A escala passa a acompanhar a largura liberada.
      if(customScale&&beforeWidth>0&&afterWidth>0){
        const widthRatio=afterWidth/beforeWidth;
        if(Number.isFinite(widthRatio)&&Math.abs(widthRatio-1)>.01){
          const target=Math.min(4,Math.max(.4,customScale*widthRatio));
          reader.zoom(target-customScale);
        }
      }
    });
  };

  global.PdfStudyReader=Object.freeze({...reader,toggleSide:enhancedToggleSide});
  installed=true;
  return true;
}

function boot(attempt=0){
  if(install())return;
  if(attempt<80)setTimeout(()=>boot(attempt+1),100);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot(),{once:true});
else boot();
global.addEventListener('load',()=>boot(),{once:true});
})(window);
