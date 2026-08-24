'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const device=fs.readFileSync('public/js/pdf/pdf-device-storage.js','utf8');
const adapter=fs.readFileSync('public/js/pdf/pdf-library-opfs-adapter.js','utf8');
const library=fs.readFileSync('public/js/pdf/pdf-library.js','utf8');
const manager=fs.readFileSync('public/js/pdf/pdf-offline-library-manager.js','utf8');

test('PDF salvo no dispositivo usa arquivo externo ao armazenamento privado do app',()=>{
  cp.execFileSync(process.execPath,['--check','public/js/pdf/pdf-device-storage.js'],{stdio:'pipe'});
  assert.match(device,/showSaveFilePicker/);
  assert.match(device,/URL\.createObjectURL\(blob\)/);
  assert.match(device,/anchor\.download = fileName/);
  assert.match(device,/saveToDevice/);
  assert.match(device,/Salvar no dispositivo/);
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

test('mobile mantém ações do PDF em duas colunas dentro da viewport',()=>{
  assert.match(device,/@media \(max-width:700px\)/);
  assert.match(device,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(device,/width:100%!important/);
  assert.match(device,/min-width:0!important/);
  assert.match(device,/min-height:44px!important/);
  assert.match(device,/font-size:clamp\(\.69rem,3\.2vw,\.82rem\)!important/);
  assert.match(device,/> :last-child:nth-child\(3\)[\s\S]*grid-column:1\/-1!important/);
});

test('adapter carrega a integração de dispositivo de forma versionável e isolada',()=>{
  assert.match(adapter,/\.\/js\/pdf\/pdf-device-storage\.js/);
  assert.match(adapter,/data-pdf-device-storage/);
  assert.match(adapter,/loadDeviceStorage\(\)/);
});
