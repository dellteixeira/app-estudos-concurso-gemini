from pathlib import Path

manager = Path('public/js/pdf/pdf-offline-library-manager.js')
text = manager.read_text()
old = """function connectionAllowed(settings){
  if(!settings?.wifiOnly)return true;
  const c=global.navigator?.connection;
  if(!c)return true;
  const type=String(c.type||'').toLowerCase();
  return !type||type==='wifi'||type==='ethernet';
}
"""
new = """function connectionStatus(settings){
  if(!settings?.wifiOnly)return{allowed:true,supported:true,reason:''};
  const c=global.navigator?.connection;
  if(!c)return{allowed:true,supported:false,reason:'Este navegador não permite confirmar automaticamente se a conexão atual é Wi-Fi.'};
  const type=String(c.type||'').toLowerCase();
  if(!type)return{allowed:true,supported:false,reason:'O navegador não informou o tipo da conexão atual; a restrição de Wi-Fi não pode ser confirmada.'};
  const allowed=type==='wifi'||type==='ethernet';
  return{allowed,supported:true,reason:allowed?'':`Fila pausada: conexão atual detectada como ${type}; aguardando Wi-Fi.`};
}
function connectionAllowed(settings){return connectionStatus(settings).allowed}
"""
if old not in text: raise SystemExit('connectionAllowed original não encontrado')
text = text.replace(old,new,1)
old_worker = "    if(!connectionAllowed(s)){paused=true;lastError='Fila pausada: aguardando Wi-Fi.';emit('paused',{reason:lastError});break}\n"
new_worker = "    const network=connectionStatus(s);\n    if(!network.allowed){paused=true;lastError=network.reason||'Fila pausada: aguardando Wi-Fi.';emit('paused',{reason:lastError});break}\n    if(s.wifiOnly&&!network.supported)emit('wifi-detection-unavailable',{reason:network.reason});\n"
if old_worker not in text: raise SystemExit('worker Wi-Fi original não encontrado')
text = text.replace(old_worker,new_worker,1)
old_status = "async function getStatus(){return{...getStateSync(),settings:await getSettings(),budget:await budget()}}"
new_status = "async function getStatus(){const settings=await getSettings();return{...getStateSync(),settings,budget:await budget(),connection:connectionStatus(settings)}}"
if old_status not in text: raise SystemExit('getStatus original não encontrado')
text = text.replace(old_status,new_status,1)
old_export = "global.PdfOfflineLibraryManager=Object.freeze({getSettings,setMode,setWifiOnly,start,cancel,syncCurrentPolicy,getStatus,preflight,bytesLabel});"
new_export = "global.PdfOfflineLibraryManager=Object.freeze({getSettings,setMode,setWifiOnly,start,cancel,syncCurrentPolicy,getStatus,preflight,bytesLabel,connectionStatus});"
if old_export not in text: raise SystemExit('export original não encontrado')
manager.write_text(text.replace(old_export,new_export,1))

ui = Path('public/js/pdf/pdf-offline-library-ui.js')
text = ui.read_text()
old = "  const wifi=$('pdfOfflineWifiOnly');if(wifi)wifi.checked=!!s.wifiOnly;\n"
new = "  const wifi=$('pdfOfflineWifiOnly');if(wifi){wifi.checked=!!s.wifiOnly;const unsupported=!!s.wifiOnly&&data.connection?.supported===false;wifi.setAttribute('aria-describedby',unsupported?'pdfOfflineStatus':'');wifi.parentElement.title=unsupported?(data.connection?.reason||'Detecção automática de Wi-Fi indisponível neste navegador.'):'Somente Wi-Fi';}\n"
if old not in text: raise SystemExit('refresh Wi-Fi original não encontrado')
text = text.replace(old,new,1)
old_status = "  if(data.running)setStatus(data.paused?(data.lastError||'Fila pausada.'):`Preparando PDFs… ${done}/${total}`);else if(data.lastError)setStatus(data.lastError,'error');else setStatus(`Modo ativo: ${modeLabels[currentMode]}.`);\n"
new_status = "  if(data.running)setStatus(data.paused?(data.lastError||'Fila pausada.'):`Preparando PDFs… ${done}/${total}`);else if(data.lastError)setStatus(data.lastError,'error');else if(s.wifiOnly&&data.connection?.supported===false)setStatus(data.connection.reason||'Somente Wi-Fi está ativo, mas este navegador não permite confirmar o tipo da conexão.','warning');else setStatus(`Modo ativo: ${modeLabels[currentMode]}.`);\n"
if old_status not in text: raise SystemExit('status UI original não encontrado')
text = text.replace(old_status,new_status,1)
old_event = "  else if(d.type==='paused')setStatus(d.reason||'Fila pausada.');\n"
new_event = "  else if(d.type==='paused')setStatus(d.reason||'Fila pausada.');\n  else if(d.type==='wifi-detection-unavailable')setStatus(d.reason||'Não foi possível confirmar automaticamente a conexão Wi-Fi.','warning');\n"
if old_event not in text: raise SystemExit('evento UI original não encontrado')
ui.write_text(text.replace(old_event,new_event,1))

tests = Path('tests/offline-pdf-library-phase3.test.cjs')
text = tests.read_text()
addition = r"""

test('Somente Wi-Fi distingue detecção suportada de navegador sem Network Information API',()=>{
  assert.match(manager,/function connectionStatus\(settings\)/);
  assert.match(manager,/supported:false/);
  assert.match(manager,/não permite confirmar automaticamente se a conexão atual é Wi-Fi/);
  assert.match(manager,/connection:connectionStatus\(settings\)/);
  assert.match(manager,/wifi-detection-unavailable/);
  assert.match(ui,/data\.connection\?\.supported===false/);
  assert.match(ui,/Detecção automática de Wi-Fi indisponível neste navegador/);
});
"""
if "Somente Wi-Fi distingue detecção suportada" not in text:
    tests.write_text(text.rstrip() + addition.rstrip() + '\n')

for rel in ['package.json','public/version.json','config/app-assets.json','public/js/app-pwa.js','public/sw.js','src/index.js']:
    p=Path(rel); s=p.read_text()
    if '10.64.1' not in s: raise SystemExit(f'{rel} não contém 10.64.1')
    p.write_text(s.replace('10.64.1','10.64.2'))

Path('.github/workflows/temp-phase3-wifi-v10.64.2.yml').unlink(missing_ok=True)
Path('scripts/temp-phase3-wifi-v10.64.2.py').unlink(missing_ok=True)
