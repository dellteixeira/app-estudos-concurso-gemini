'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const device=fs.readFileSync('public/js/pdf/pdf-device-storage.js','utf8');
const adapter=fs.readFileSync('public/js/pdf/pdf-library-opfs-adapter.js','utf8');
const library=fs.readFileSync('public/js/pdf/pdf-library.js','utf8');
const manager=fs.readFileSync('public/js/pdf/pdf-offline-library-manager.js','utf8');
const mobileActions=fs.readFileSync('public/css/pdf-mobile-card-actions.css','utf8');
const headers=fs.readFileSync('public/_headers','utf8');

test('PDF salvo no dispositivo usa arquivo externo ao armazenamento privado do app',()=>{
  cp.execFileSync(process.execPath,['--check','public/js/pdf/pdf-device-storage.js'],{stdio:'pipe'});
  assert.match(device,/showSaveFilePicker/);
  assert.match(device,/URL\.createObjectURL\(blob\)/);
  assert.match(device,/anchor\.download = fileName/);
  assert.match(device,/saveToDevice/);
  assert.match(device,/Salvar no dispositivo/);
});

test('cancelamento do seletor não é reportado como salvamento concluído',()=>{
  assert.match(device,/error\?\.name === 'AbortError'/);
  assert.match(device,/cancelled: true/);
  assert.match(device,/Salvamento cancelado\. Nenhum arquivo foi criado\./);
});

test('exclusão global purga armazenamento local pelo caminho canônico da Biblioteca',()=>{
  cp.execFileSync(process.execPath,['--check','public/js/pdf/pdf-library.js'],{stdio:'pipe'});
  assert.match(library,/async function forgetDocuments\(ids\)/);
  assert.match(library,/PdfLibraryOfflineAdapter\?\.removeMany/);
  assert.match(library,/PdfLibraryOfflineAdapter\.removeMany\(user\.id,pdfIds\)/);
  assert.match(library,/OfflinePdfStore\?\.removeMany/);
  assert.match(library,/deletePdfBlobs\(user\.id,pdfIds\)/);
  assert.match(library,/pdf-local-copies-purged/);
  assert.match(library,/await forgetDocuments\(ids\)/);
  assert.match(adapter,/store\.removeMany\(userId, ids\)/);
  assert.match(adapter,/deleteLegacy\(userId, id\)/);
});

test('módulo de dispositivo não substitui nem envolve PdfStudyLibrary',()=>{
  assert.doesNotMatch(device,/integrateDeletion/);
  assert.doesNotMatch(device,/originalRemoveMany/);
  assert.doesNotMatch(device,/global\.PdfStudyLibrary\s*=/);
});

test('biblioteca offline persiste explicitamente no OPFS ou IndexedDB moderno',()=>{
  cp.execFileSync(process.execPath,['--check','public/js/pdf/pdf-offline-library-manager.js'],{stdio:'pipe'});
  assert.match(manager,/PdfLibraryOfflineAdapter\?\.put/);
  assert.match(manager,/persistOfflineBlob\(u\.id,doc,blob\)/);
  assert.match(manager,/PdfLibraryOfflineAdapter\?\.has/);
  assert.match(manager,/O navegador não conseguiu reservar armazenamento local para este PDF/);
});

test('mobile mantém ações do PDF em duas colunas e texto completo em viewports amplas de celular',()=>{
  assert.match(device,/@media \(max-width:900px\)/);
  assert.match(device,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(device,/white-space:normal!important/);
  assert.match(device,/overflow-wrap:break-word!important/);
  assert.match(device,/\.pdf-device-save-action[\s\S]*font-size:clamp\(\.68rem,2\.25vw,\.82rem\)!important/);

  assert.match(mobileActions,/@media \(max-width: 900px\)/);
  assert.match(mobileActions,/display: grid !important/);
  assert.match(mobileActions,/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(mobileActions,/min-height: 44px !important/);
  assert.match(mobileActions,/white-space: normal !important/);
  assert.match(mobileActions,/\.pdf-device-save-action[\s\S]*font-size: clamp\(\.68rem, 2\.25vw, \.82rem\) !important/);
  assert.match(mobileActions,/:last-child:nth-child\(odd\)[\s\S]*grid-column: 1 \/ -1 !important/);
});

test('adapter carrega CSS e módulos PDF com revisão explícita para impedir cache stale',()=>{
  assert.match(adapter,/const ASSET_REVISION = '10\.29\.3'/);
  assert.match(adapter,/asset\('\.\/css\/pdf-mobile-card-actions\.css'\)/);
  assert.match(adapter,/asset\('\.\/js\/pdf\/pdf-device-storage\.js'\)/);
  assert.match(adapter,/asset\('\.\/js\/pdf\/pdf-library-layout-fix\.js'\)/);
  assert.match(adapter,/data-pdf-device-storage/);
  assert.match(adapter,/loadDeviceStorage\(\)/);
  assert.match(headers,/\/css\/pdf-mobile-card-actions\.css[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
  assert.match(headers,/\/js\/pdf\/pdf-device-storage\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
});
