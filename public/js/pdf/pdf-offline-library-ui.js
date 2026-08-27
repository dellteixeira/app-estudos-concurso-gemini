(function(global){
'use strict';
const $=id=>document.getElementById(id);
const modeOrder=['opened','favorites','all'];
const modeLabels={opened:'Apenas PDFs que eu abrir',favorites:'PDFs favoritos',all:'Biblioteca inteira'};
let currentMode='opened';
let lastRender=0;

function css(){
  if($('pdfOfflineManagerStyles'))return;
  const style=document.createElement('style');style.id='pdfOfflineManagerStyles';style.textContent=`
/* Filtros da Biblioteca: uma linha; em telas estreitas, rolagem horizontal. */
.pdf-library-filters{display:flex!important;grid-template-columns:none!important;flex-wrap:nowrap!important;align-items:stretch;gap:10px;width:100%!important;overflow-x:hidden;overflow-y:hidden;padding-bottom:6px;scrollbar-width:thin}
.pdf-library-filters>*{flex:1 1 0!important;min-width:0!important;width:0!important;scroll-snap-align:start}
.pdf-library-filters #pdfLibrarySearch,.pdf-library-filters #pdfLibraryScope,.pdf-library-filters #pdfMateriaFilter{flex:1 1 0!important;width:0!important;min-width:0!important}
.pdf-library-filters::-webkit-scrollbar{height:6px}.pdf-library-filters::-webkit-scrollbar-thumb{background:rgba(148,163,184,.28);border-radius:999px}.pdf-library-filters::-webkit-scrollbar-track{background:transparent}

.pdf-offline-manager{grid-column:1/-1;width:100%;border:1px solid var(--border-color,#29445d);border-radius:14px;background:rgba(7,25,41,.72);padding:13px 14px;display:grid;gap:11px;color:var(--text-color,#e8f3ff)}
.pdf-offline-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.pdf-offline-head strong{font-size:.95rem}.pdf-offline-head small{display:block;color:var(--text-muted,#9fb2c6);margin-top:3px;line-height:1.35}.pdf-offline-badge{font-size:.72rem;padding:5px 8px;border-radius:999px;background:rgba(85,221,210,.14);color:var(--accent-color,#55ddd2);white-space:nowrap}
/* Todos os comandos da Biblioteca Offline vivem na mesma linha. */
.pdf-offline-controls{display:flex;flex-wrap:nowrap;align-items:center;gap:9px;width:100%;overflow-x:auto;overflow-y:hidden;padding-bottom:6px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;overscroll-behavior-inline:contain;scrollbar-width:thin}
.pdf-offline-controls>*{flex:0 0 auto;scroll-snap-align:start}.pdf-offline-mode{flex:1 1 260px!important;min-width:220px;max-width:420px;min-height:44px;height:44px;padding:0 14px;border-radius:10px;background:rgba(85,221,210,.15)!important;color:var(--accent-color,#55ddd2)!important;border:1px solid var(--accent-color,#55ddd2)!important;box-shadow:none!important;font-weight:700;white-space:nowrap;text-align:center}.pdf-offline-mode::after{content:' ›';font-size:1.05em}.pdf-offline-wifi{display:flex;align-items:center;gap:7px;min-height:44px;padding:0 4px;font-size:.78rem;color:var(--text-muted,#9fb2c6);white-space:nowrap}.pdf-offline-wifi input{width:18px;height:18px}.pdf-offline-storage{font-size:.76rem;color:var(--text-muted,#9fb2c6);white-space:nowrap;padding:0 4px;min-width:max-content}.pdf-offline-controls>.btn{min-height:44px;height:44px;white-space:nowrap;min-width:112px;padding-inline:14px}#btnPdfSelectionMode,#pdfOfflineSyncBtn,#pdfOfflineCancelBtn{background:transparent!important;color:var(--text-color,#e8f3ff)!important;border:1px solid var(--border-color,#29445d)!important;box-shadow:none!important}
.pdf-offline-controls::-webkit-scrollbar{height:6px}.pdf-offline-controls::-webkit-scrollbar-thumb{background:rgba(148,163,184,.28);border-radius:999px}.pdf-offline-controls::-webkit-scrollbar-track{background:transparent}
.pdf-offline-progress{height:7px;border-radius:999px;background:rgba(148,163,184,.16);overflow:hidden}.pdf-offline-progress span{display:block;height:100%;background:var(--accent-color,#55ddd2);width:0;transition:width .2s ease}.pdf-offline-status{font-size:.78rem;color:var(--text-muted,#9fb2c6);min-height:18px}
@media(max-width:700px){.pdf-library-filters{gap:9px;margin-inline:0;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;overscroll-behavior-inline:contain}.pdf-library-filters>*{flex:0 0 auto!important;width:auto!important}.pdf-library-filters #pdfLibrarySearch{width:220px!important;min-width:220px!important}.pdf-library-filters #pdfLibraryScope{width:190px!important;min-width:190px!important}.pdf-library-filters #pdfMateriaFilter{width:200px!important;min-width:200px!important}.pdf-offline-manager{padding:12px;border-radius:12px}.pdf-offline-head{display:block}.pdf-offline-badge{display:inline-block;margin-top:7px}.pdf-offline-controls{gap:8px}.pdf-offline-mode{flex:0 0 auto!important;width:230px;min-width:230px}.pdf-offline-controls>.btn{min-width:108px}}
`;document.head.appendChild(style);
}
function anchor(){return $('pdfLibraryViewToggle')||$('pdfLibrarySortControl')||$('pdfLibraryGrid')}
function nextMode(mode){const index=modeOrder.indexOf(mode);return modeOrder[(index+1+modeOrder.length)%modeOrder.length]}
function updateModeButton(mode){
  currentMode=modeOrder.includes(mode)?mode:'opened';
  const button=$('pdfOfflineModeBtn');if(!button)return;
  const label=modeLabels[currentMode];button.textContent=label;button.dataset.mode=currentMode;button.setAttribute('aria-label',`Modo offline: ${label}. Clique para mudar.`);button.title='Clique para alternar o modo offline';
}
async function cycleMode(){
  const mode=nextMode(currentMode);setStatus(`Ativando: ${modeLabels[mode]}…`);
  const result=await global.PdfOfflineLibraryManager.setMode(mode).catch(error=>({reason:error?.message||'Falha ao ativar modo.'}));
  if(result?.reason)setStatus(result.reason,'error');
  await refresh();
}
async function mount(){
  if(!global.PdfOfflineLibraryManager)return;
  css();
  let panel=$('pdfOfflineManager');
  if(!panel){
    panel=document.createElement('section');panel.id='pdfOfflineManager';panel.className='pdf-offline-manager';panel.setAttribute('aria-label','Biblioteca Offline Gerenciada');
    panel.innerHTML=`<div class="pdf-offline-head"><div><strong>Biblioteca Offline</strong><small>Escolha quais PDFs devem ficar disponíveis neste dispositivo.</small></div><span id="pdfOfflineBackend" class="pdf-offline-badge">Verificando…</span></div>
    <div class="pdf-offline-controls" aria-label="Controles da Biblioteca Offline"><button class="btn pdf-offline-mode" id="pdfOfflineModeBtn" type="button">Apenas PDFs que eu abrir</button><label class="pdf-offline-wifi"><input id="pdfOfflineWifiOnly" type="checkbox"> Somente Wi-Fi</label><div id="pdfOfflineStorage" class="pdf-offline-storage">Calculando armazenamento…</div><button class="btn btn-secondary" id="btnPdfSelectionMode" type="button" data-action="call" data-call="PdfStudyLibraryUI.toggleSelectionMode">Selecionar</button><button class="btn btn-secondary" id="pdfOfflineSyncBtn" type="button">Enviar</button><button class="btn btn-secondary" id="pdfOfflineCancelBtn" type="button">Cancelar fila</button></div>
    <div class="pdf-offline-progress"><span id="pdfOfflineProgressBar"></span></div><div id="pdfOfflineStatus" class="pdf-offline-status">Pronto.</div>`;
    const a=anchor();if(a?.parentElement)a.insertAdjacentElement('afterend',panel);else $('pdfLibraryGrid')?.before(panel);
    $('pdfOfflineModeBtn')?.addEventListener('click',()=>cycleMode().catch(error=>setStatus(error?.message||'Falha ao ativar modo.','error')));
    $('pdfOfflineWifiOnly')?.addEventListener('change',async event=>{await global.PdfOfflineLibraryManager.setWifiOnly(event.target.checked);await refresh()});
    $('pdfOfflineSyncBtn')?.addEventListener('click',()=>global.PdfOfflineLibraryManager.syncCurrentPolicy().catch(e=>setStatus(e?.message||'Falha ao preparar PDFs.','error')));
    $('pdfOfflineCancelBtn')?.addEventListener('click',()=>global.PdfOfflineLibraryManager.cancel());
  }
  await refresh();
}
function setStatus(text,kind=''){const el=$('pdfOfflineStatus');if(el){el.textContent=text||'';el.dataset.kind=kind}}
async function refresh(){
  if(!global.PdfOfflineLibraryManager)return;
  const data=await global.PdfOfflineLibraryManager.getStatus().catch(()=>null);if(!data)return;
  const s=data.settings||{};updateModeButton(s.mode);
  const wifi=$('pdfOfflineWifiOnly');if(wifi)wifi.checked=!!s.wifiOnly;
  const b=data.budget||{},backend=b.caps?.preferredBackend||'none';const badge=$('pdfOfflineBackend');if(badge)badge.textContent=backend==='opfs'?'OPFS ativo':backend==='indexeddb'?'IndexedDB':'Sem armazenamento';
  const st=$('pdfOfflineStorage');if(st)st.textContent=`Uso: ${global.PdfOfflineLibraryManager.bytesLabel(b.usage||0)} · livre seguro: ${global.PdfOfflineLibraryManager.bytesLabel(b.safeAvailable||0)}`;
  const total=Math.max(0,Number(data.total)||0),done=Math.max(0,Number(data.completed)||0)+Math.max(0,Number(data.failed)||0),pct=total?Math.min(100,Math.round(done/total*100)):0;const bar=$('pdfOfflineProgressBar');if(bar)bar.style.width=`${pct}%`;
  if(data.running)setStatus(data.paused?(data.lastError||'Fila pausada.'):`Preparando PDFs… ${done}/${total}`);else if(data.lastError)setStatus(data.lastError,'error');else setStatus(`Modo ativo: ${modeLabels[currentMode]}.`);
  lastRender=Date.now();
}
global.addEventListener('pdf-offline-library',event=>{
  const d=event.detail||{},state=d.state||{},total=Number(state.total)||0,done=(Number(state.completed)||0)+(Number(state.failed)||0),bar=$('pdfOfflineProgressBar');if(bar)bar.style.width=`${total?Math.min(100,Math.round(done/total*100)):0}%`;
  if(d.type==='blocked'||d.type==='error')setStatus(d.reason||d.error||state.lastError,'error');
  else if(d.type==='paused')setStatus(d.reason||'Fila pausada.');
  else if(d.type==='downloaded')setStatus(`PDFs preparados: ${done}/${total}`);
  else if(d.type==='complete')setStatus(d.message||`Preparação concluída. ${state.completed||0} PDF(s) offline.`);
  else if(d.type==='cancelled')setStatus('Fila cancelada.');
  if(Date.now()-lastRender>400)refresh().catch(()=>{});
});
function boot(){if(global.PdfOfflineLibraryManager)mount().catch(()=>{});else setTimeout(boot,100)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
document.addEventListener('click',event=>{const b=event.target.closest('button');if((b?.getAttribute('onclick')||'').includes("switchTab('tab-biblioteca'"))setTimeout(()=>mount().catch(()=>{}),80)});
})(window);
