(function(global){
'use strict';
const KEY='pdfLibrarySortMode';
const MODES=new Set(['manual','number-asc','number-desc','alpha-asc','alpha-desc']);
const alpha=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:false});
const natural=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
let draggedId='',persistTimer=0,mutating=false,lastPersisted='';
const $=id=>document.getElementById(id);
function mode(){try{const v=localStorage.getItem(KEY)||'manual';return MODES.has(v)?v:'manual'}catch(_){return'manual'}}
function setMode(v){const next=MODES.has(v)?v:'manual';try{localStorage.setItem(KEY,next)}catch(_){}const s=$('pdfLibrarySort');if(s)s.value=next;return next}
function title(card){return String(card.querySelector('.pdf-card-title-link')?.textContent||card.querySelector('h4')?.textContent||'').trim()}
function id(card){return String(card?.dataset?.pdfId||'')}
function leadingNumber(card){const m=title(card).match(/^\s*(\d+(?:[.,]\d+)?)/);return m?Number(m[1].replace(',','.')):null}
function compare(a,b,m){
  if(m==='alpha-asc')return alpha.compare(title(a),title(b));
  if(m==='alpha-desc')return alpha.compare(title(b),title(a));
  if(m==='number-asc'||m==='number-desc'){
    const an=leadingNumber(a),bn=leadingNumber(b),dir=m==='number-desc'?-1:1;
    if(an!==null&&bn!==null&&an!==bn)return(an-bn)*dir;
    if(an!==null&&bn===null)return-1;
    if(an===null&&bn!==null)return 1;
    return natural.compare(title(a),title(b))*dir;
  }
  return 0;
}
function cards(){return [...document.querySelectorAll('#pdfLibraryGrid .pdf-library-card[data-pdf-id]')]}
function currentOrder(){return cards().map(id).filter(Boolean)}
function status(text,kind=''){const el=$('pdfLibraryStatus');if(el){el.textContent=text;el.dataset.kind=kind}}
async function persistNow(){
  clearTimeout(persistTimer);const order=currentOrder();if(!order.length||!global.PdfStudyLibrary?.persistVisibleOrder)return;
  const fingerprint=order.join('|');if(fingerprint===lastPersisted)return;
  try{status('Salvando ordem dos PDFs…','warn');await global.PdfStudyLibrary.persistVisibleOrder(order);lastPersisted=fingerprint;status('Ordem dos PDFs salva.','ok')}
  catch(error){console.error('[PDF ordering]',error);status(error?.message||'Não foi possível salvar a ordem dos PDFs.','error');global.PdfStudyLibraryUI?.refresh?.().catch(()=>{})}
}
function schedulePersist(delay=350){clearTimeout(persistTimer);persistTimer=setTimeout(persistNow,delay)}
function sortVisible(m=mode(),persist=false){
  if(m==='manual')return;const grid=$('pdfLibraryGrid'),list=cards();if(!grid||list.length<2)return;
  const sorted=[...list].sort((a,b)=>compare(a,b,m));const changed=sorted.some((card,index)=>card!==list[index]);
  if(changed){mutating=true;sorted.forEach(card=>grid.appendChild(card));mutating=false}
  if(persist&&changed)schedulePersist();
}
function extractId(card){
  if(card.dataset.pdfId)return card.dataset.pdfId;
  const button=[...card.querySelectorAll('button')].find(b=>(b.getAttribute('onclick')||'').includes('PdfStudyLibraryUI.openDocument'));
  const match=(button?.getAttribute('onclick')||'').match(/openDocument\(['"]([^'"]+)['"]\)/);return match?.[1]||'';
}
function makeTitleClickable(card,pdfId){
  const h=card.querySelector('h4');if(!h||h.querySelector('.pdf-card-title-link'))return;
  const text=h.textContent.trim();h.classList.add('pdf-card-title');h.textContent='';
  const btn=document.createElement('button');btn.type='button';btn.className='pdf-card-title-link';btn.textContent=text;btn.title=`Abrir ${text}`;btn.addEventListener('click',event=>{event.stopPropagation();global.PdfStudyLibraryUI?.openDocument?.(pdfId)});h.appendChild(btn);
}
function augmentCard(card){
  const pdfId=extractId(card);if(!pdfId)return;card.dataset.pdfId=pdfId;
  makeTitleClickable(card,pdfId);
  const visual=[...card.querySelectorAll('.pdf-card-actions button')].find(b=>/^\s*Visualizar\s*$/i.test(b.textContent||''));visual?.remove();
  if(!card.querySelector('.pdf-drag-hint')){const top=card.querySelector('.pdf-card-top');if(top){const hint=document.createElement('span');hint.className='pdf-drag-hint';hint.textContent='⋮⋮';hint.title='Segure e arraste para mudar a posição';hint.setAttribute('aria-hidden','true');top.querySelector('.pdf-favorite-btn')?.before(hint)}}
  card.draggable=!card.querySelector('input[type="checkbox"]');
  if(card.dataset.orderBound)return;card.dataset.orderBound='1';
  card.addEventListener('dragstart',event=>{if(!card.draggable||event.target.closest('button,input,label,select,a')){event.preventDefault();return}draggedId=pdfId;card.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',pdfId);status('Arraste o PDF até a posição desejada.','warn')});
  card.addEventListener('dragover',event=>{if(!draggedId||draggedId===pdfId)return;event.preventDefault();event.dataTransfer.dropEffect='move';cards().forEach(x=>x.classList.remove('drag-over'));card.classList.add('drag-over')});
  card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
  card.addEventListener('drop',event=>{event.preventDefault();card.classList.remove('drag-over');const source=cards().find(x=>id(x)===(draggedId||event.dataTransfer.getData('text/plain')));if(!source||source===card)return;const grid=$('pdfLibraryGrid'),rect=card.getBoundingClientRect(),before=event.clientY<rect.top+rect.height/2;mutating=true;grid.insertBefore(source,before?card:card.nextSibling);mutating=false;setMode('manual');draggedId='';cards().forEach(x=>x.classList.remove('dragging','drag-over'));schedulePersist(100);status('Nova posição definida. Salvando…','warn')});
  card.addEventListener('dragend',()=>{draggedId='';cards().forEach(x=>x.classList.remove('dragging','drag-over'))});
}
function augment(){
  if(mutating)return;const list=[...document.querySelectorAll('#pdfLibraryGrid .pdf-library-card')];list.forEach(augmentCard);sortVisible(mode(),mode()!=='manual');
}
function ensureStyles(){if($('pdfLibraryOrderingStyles'))return;const style=document.createElement('style');style.id='pdfLibraryOrderingStyles';style.textContent=`
.pdf-library-sort-control{display:flex;align-items:center;gap:8px;min-height:48px;padding:4px 10px;border:1px solid var(--border-color,#29445d);border-radius:12px;background:rgba(7,25,41,.55);color:var(--text-muted,#9fb2c6)}.pdf-library-sort-control span{font-size:.78rem;font-weight:750;white-space:nowrap}.pdf-library-sort-control select{min-width:148px;background:#071d2d;color:#e8f3ff;border:0;outline:0;font:inherit;font-weight:650}.pdf-card-title-link{display:block;width:100%;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:800;line-height:1.35;text-align:left;cursor:pointer}.pdf-card-title-link:hover,.pdf-card-title-link:focus-visible{color:var(--accent-color,#55ddd2);text-decoration:underline;text-underline-offset:3px;outline:none}.pdf-drag-hint{margin-left:8px;color:#6f8ca4;font-weight:900;letter-spacing:-2px;cursor:grab;user-select:none}.pdf-library-card[draggable="true"]{cursor:grab}.pdf-library-card.dragging{opacity:.55;cursor:grabbing}.pdf-library-card.drag-over{outline:2px solid var(--accent-color,#55ddd2);outline-offset:2px;transform:translateY(-2px)}@media(max-width:700px){.pdf-library-sort-control{width:100%;grid-column:1/-1}.pdf-library-sort-control select{flex:1;min-width:0}.pdf-drag-hint{display:none}.pdf-library-card{cursor:default!important}}
`;document.head.appendChild(style)}
function ensureControl(){
  ensureStyles();if($('pdfLibrarySortControl'))return;const anchor=$('pdfLibraryViewToggle')||$('pdfAssuntoFilter');if(!anchor)return;
  const wrap=document.createElement('label');wrap.id='pdfLibrarySortControl';wrap.className='pdf-library-sort-control';wrap.innerHTML='<span>Ordenar</span><select id="pdfLibrarySort" aria-label="Ordenação dos PDFs"><option value="manual">Manual</option><option value="number-asc">Numérica ↑</option><option value="number-desc">Numérica ↓</option><option value="alpha-asc">A–Z</option><option value="alpha-desc">Z–A</option></select>';anchor.insertAdjacentElement('afterend',wrap);$('pdfLibrarySort').value=mode();$('pdfLibrarySort').addEventListener('change',event=>{const next=setMode(event.target.value);sortVisible(next,true);if(next==='manual')status('Ordem manual ativa. Segure e arraste um PDF para reposicioná-lo.','ok');else status('Organizando e salvando a nova ordem…','warn')})
}
function boot(){ensureControl();augment();const grid=$('pdfLibraryGrid');if(grid&&!grid.dataset.orderObserver){grid.dataset.orderObserver='1';new MutationObserver(()=>{if(mutating)return;requestAnimationFrame(()=>{ensureControl();augment()})}).observe(grid,{childList:true,subtree:true})}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
document.addEventListener('click',event=>{const button=event.target.closest('button');if((button?.getAttribute('onclick')||'').includes("switchTab('tab-biblioteca'"))setTimeout(boot,40)});
global.addEventListener('pageshow',()=>setTimeout(boot,40));
})(window);

(function loadAdaptiveScheduleReconciliation(){
  if(document.querySelector('script[data-adaptive-schedule-reconciliation]'))return;
  const script=document.createElement('script');
  script.src='./js/adaptive-schedule-reconciliation.js';
  script.defer=true;
  script.dataset.adaptiveScheduleReconciliation='1';
  document.head.appendChild(script);
})();
