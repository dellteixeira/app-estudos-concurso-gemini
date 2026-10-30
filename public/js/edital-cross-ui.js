(function(global){
'use strict';
function ensureUi(){
  if(!document.querySelector('link[data-edital-cross-style]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='./css/edital-cross-tool.css';link.dataset.editalCrossStyle='1';document.head.appendChild(link);
  }
  if(!document.querySelector('[data-call="EditalCrossTool.open"]')){
    const clearBtn=document.querySelector('[data-call="clearData"]');
    if(clearBtn?.parentElement){
      const btn=document.createElement('button');btn.className='compact-menu-item';btn.type='button';btn.dataset.action='call';btn.dataset.call='EditalCrossTool.open';btn.setAttribute('role','menuitem');btn.textContent='Cruzar Editais / Plano Integrado';clearBtn.parentElement.insertBefore(btn,clearBtn);
    }
  }
  if(document.getElementById('modalEditalCrossTool'))return;
  const wrapper=document.createElement('div');
  wrapper.innerHTML=`
  <div class="modal-overlay cross-edital-overlay" id="modalEditalCrossTool" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="crossEditalTitle">
    <div class="modal cross-edital-modal">
      <div class="cross-edital-head">
        <div><h3 id="crossEditalTitle">Cruzamento de Editais</h3><p>Compare concursos, consolide conteúdos semelhantes e monte um plano integrado sem alterar os editais originais.</p></div>
        <button class="btn btn-secondary btn-sm" type="button" data-action="call" data-call="EditalCrossTool.close">Fechar</button>
      </div>

      <section class="cross-edital-select-panel">
        <div class="cross-section-title">
          <div><strong>1. Selecione os editais</strong><span>Escolha dois ou mais concursos já cadastrados.</span></div>
          <div class="cross-inline-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="call" data-call="EditalCrossTool.selectAll">Selecionar todos</button><button class="btn btn-secondary btn-sm" type="button" data-action="call" data-call="EditalCrossTool.clearSelection">Limpar</button></div>
        </div>
        <div id="crossEditalContestList" class="cross-contest-list"></div>
        <button class="btn btn-primary" type="button" data-action="call" data-call="EditalCrossTool.analyze">Analisar cruzamento</button>
      </section>

      <section id="crossEditalResults" class="cross-edital-results" hidden>
        <div class="cross-section-title">
          <div><strong>2. Revise o resultado consolidado</strong><span>Os conteúdos aparecem agrupados por matéria, com os assuntos correlatos dos editais selecionados.</span></div>
          <button class="btn btn-secondary btn-sm" type="button" data-action="call" data-call="EditalCrossTool.addManualRow">+ Adicionar matéria</button>
        </div>

        <div id="crossEditalSummary" class="cross-summary-grid"></div>

        <div class="cross-toolbar">
          <div class="cross-filter-row">
            <button type="button" class="cross-filter-btn active" data-cross-filter="all">Todos</button>
            <button type="button" class="cross-filter-btn" data-cross-filter="common">Comuns</button>
            <button type="button" class="cross-filter-btn" data-cross-filter="related">Relacionados</button>
            <button type="button" class="cross-filter-btn" data-cross-filter="unique">Exclusivos</button>
          </div>
          <select id="crossSourceFilter" class="cross-source-filter"><option value="all">Editais selecionados</option></select>
        </div>

        <div class="cross-scope-row">
          <span>Compor plano:</span>
          <button type="button" class="cross-filter-btn" data-cross-scope="common">Somente comuns</button>
          <button type="button" class="cross-filter-btn" data-cross-scope="connected">Comuns + relacionados</button>
          <button type="button" class="cross-filter-btn" data-cross-scope="all">Todos</button>
        </div>

        <div class="cross-view-caption"><span>Visualização</span><strong>Agrupado por matéria</strong><small>Cada matéria aparece uma única vez.</small></div>
        <div id="crossEditalRows" class="cross-rows"></div>

        <div class="cross-create-panel">
          <label class="cross-name-field"><span>Nome do novo plano integrado</span><input id="crossIntegratedName" type="text" maxlength="180" placeholder="Ex.: Plano Integrado — TRT-4 + TRT-8"></label>
          <div class="cross-create-copy"><strong>3. Criar e montar cronograma</strong><span>O novo plano será independente e poderá ser editado, reorganizado, limpo ou excluído normalmente.</span></div>
          <button class="btn btn-primary cross-create-button" type="button" data-action="call" data-call="EditalCrossTool.createIntegrated">Criar plano e montar cronograma</button>
        </div>
      </section>
    </div>
  </div>`;
  document.body.appendChild(wrapper.firstElementChild);
}
function boot(){if(!global.EditalCrossTool){setTimeout(boot,50);return;}ensureUi();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
