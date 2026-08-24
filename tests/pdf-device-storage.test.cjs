'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const device=fs.readFileSync('public/js/pdf/pdf-device-storage.js','utf8');
const adapter=fs.readFileSync('public/js/pdf/pdf-library-opfs-adapter.js','utf8');

test('PDF salvo no dispositivo usa arquivo externo ao armazenamento privado do app',()=>{
  cp.execFileSync(process.execPath,['--check','public/js/pdf/pdf-device-storage.js'],{stdio:'pipe'});
  assert.match(device,/showSaveFilePicker/);
  assert.match(device,/URL\.createObjectURL\(blob\)/);
  assert.match(device,/anchor\.download = fileName/);
  assert.match(device,/saveToDevice/);
  assert.match(device,/Salvar no dispositivo/);
});

test('exclusão global purga OPFS, IndexedDB moderno e legado após remoção remota',()=>{
  assert.match(device,/PdfLibraryOfflineAdapter/);
  assert.match(device,/adapter\.removeMany\(userId, pdfIds\)/);
  assert.match(device,/originalRemoveMany\(docs, options\)/);
  assert.match(device,/await purgeLocalCopies\(user\.id, validDocs\.map\(doc => doc\.id\)\)/);
  assert.match(adapter,/store\.removeMany\(userId, ids\)/);
  assert.match(adapter,/deleteLegacy\(userId, id\)/);
});

test('mobile mantém ações do PDF em duas colunas dentro da viewport',()=>{
  assert.match(device,/@media \(max-width:700px\)/);
  assert.match(device,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(device,/width:100%!important/);
  assert.match(device,/min-width:0!important/);
  assert.match(device,/font-size:clamp\(\.69rem,3\.2vw,\.82rem\)!important/);
  assert.match(device,/> :last-child:nth-child\(3\)[\s\S]*grid-column:1\/-1!important/);
});

test('adapter carrega a integração de dispositivo de forma versionável e isolada',()=>{
  assert.match(adapter,/\.\/js\/pdf\/pdf-device-storage\.js/);
  assert.match(adapter,/data-pdf-device-storage/);
  assert.match(adapter,/loadDeviceStorage\(\)/);
});
