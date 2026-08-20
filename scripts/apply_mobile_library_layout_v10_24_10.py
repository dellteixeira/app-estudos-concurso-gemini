from pathlib import Path
import json

# Reader mobile: PDF starts visible; panel opens only on demand.
reader_path=Path('public/js/pdf/pdf-reader.js')
r=reader_path.read_text(encoding='utf-8')
old="$('pdfReaderOverlay').classList.add('open');document.body.classList.add('pdf-reader-open');"
new="const readerOverlay=$('pdfReaderOverlay');if(global.matchMedia?.('(max-width:700px)').matches)readerOverlay?.classList.add('side-collapsed');else readerOverlay?.classList.remove('side-collapsed');readerOverlay?.classList.add('open');document.body.classList.add('pdf-reader-open');"
if old not in r: raise SystemExit('reader open anchor not found')
r=r.replace(old,new,1)
reader_path.write_text(r,encoding='utf-8')

reader_css=Path('public/css/pdf-reader.css')
c=reader_css.read_text(encoding='utf-8')
marker='/* V10.24.10 — mobile Reader visible-first and complete toolbars */'
if marker not in c:
    c += '''\n\n/* V10.24.10 — mobile Reader visible-first and complete toolbars */\n@media(max-width:700px){\n  .pdf-reader-topbar{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:7px!important;padding:7px 8px!important}\n  .pdf-reader-title-group{width:100%!important;justify-content:flex-start!important;min-width:0!important}\n  .pdf-reader-tools{width:100%!important;margin:0!important;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(44px,1fr))!important;gap:6px!important;overflow:visible!important}\n  .pdf-reader-tools .pdf-reader-icon-btn{width:100%!important;min-width:0!important;justify-content:center!important;padding-inline:6px!important}\n  #pdfReaderSelectionBar.pdf-reader-selection-bar{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;overflow:visible!important;padding:8px!important}\n  #pdfReaderSelectionBar .pdf-reader-copy-btn{justify-self:center!important;max-width:220px!important;width:auto!important}\n  #pdfReaderSelectionBar .pdf-reader-study-actions{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;width:100%!important;gap:6px!important;margin:0!important}\n  #pdfReaderSelectionBar .pdf-reader-action{width:100%!important;min-width:0!important;padding:8px 5px!important;text-align:center!important}\n  .pdf-reader-body{position:relative!important;grid-template-columns:minmax(0,1fr)!important}\n  .pdf-reader-overlay.side-collapsed .pdf-reader-canvas-wrap{display:block!important;width:100%!important;min-width:0!important}\n  .pdf-reader-side{top:0!important;bottom:0!important;width:min(92vw,360px)!important;max-width:calc(100vw - 18px)!important;border-radius:14px 0 0 14px!important}\n  .pdf-reader-side-list{padding:14px!important}\n  .pdf-reader-side-main{padding:14px!important}\n  .pdf-reader-side-actions{padding:10px!important}\n}\n'''
reader_css.write_text(c,encoding='utf-8')

base_css=Path('public/css/base.css')
b=base_css.read_text(encoding='utf-8')
marker2='/* V10.24.10 — mobile action grids harmonized */'
if marker2 not in b:
    b += '''\n\n/* V10.24.10 — mobile action grids harmonized */\n@media(max-width:700px){\n  .concurso-selector-bar{display:grid!important;grid-template-columns:1fr!important;gap:10px!important;padding:14px!important}\n  .concurso-selector-bar>select{width:100%!important;min-width:0!important}\n  .concurso-selector-bar>.btn-primary{width:100%!important;justify-content:center!important}\n  .header-utility-cluster{width:100%!important;display:grid!important;grid-template-columns:1fr!important;gap:10px!important}\n  .header-account-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;width:100%!important}\n  .header-account-actions .btn,.btn-search-header{width:100%!important;min-width:0!important;justify-content:center!important}\n  .edital-manual-form{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}\n  .edital-manual-form>#prioridade{grid-column:1/-1!important;width:100%!important}\n  .edital-manual-actions{grid-column:1/-1!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;width:100%!important}\n  .edital-manual-actions .btn{width:100%!important;min-width:0!important;justify-content:center!important;white-space:normal!important;text-align:center!important}\n  .edital-guide-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;width:100%!important}\n  .edital-guide-actions .btn{width:100%!important;min-width:0!important;justify-content:center!important;white-space:normal!important;text-align:center!important}\n}\n@media(max-width:430px){\n  .header-account-actions{grid-template-columns:1fr!important}\n  .edital-manual-form{grid-template-columns:1fr!important}\n  .edital-manual-form>#prioridade,.edital-manual-actions{grid-column:1!important}\n  .edital-manual-actions,.edital-guide-actions{grid-template-columns:1fr!important}\n}\n'''
base_css.write_text(b,encoding='utf-8')

# Version/cache synchronization.
for p in [Path('package.json'),Path('public/version.json')]:
    data=json.loads(p.read_text(encoding='utf-8'));data['version']='10.24.10';p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for p in [Path('public/sw.js'),Path('src/index.js')]:
    s=p.read_text(encoding='utf-8').replace('10.24.9','10.24.10');p.write_text(s,encoding='utf-8')
for p in Path('tests').glob('*.test.cjs'):
    s=p.read_text(encoding='utf-8').replace("'10.24.9'","'10.24.10'").replace('"10.24.9"','"10.24.10"');p.write_text(s,encoding='utf-8')

Path('tests/v10-24-10-mobile-layout.test.cjs').write_text("""const test=require('node:test');\nconst assert=require('node:assert/strict');\nconst fs=require('node:fs');\nconst r=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');\nconst c=fs.readFileSync('public/css/pdf-reader.css','utf8');\nconst b=fs.readFileSync('public/css/base.css','utf8');\ntest('Reader mobile inicia com PDF visível e painel recolhido',()=>{assert.match(r,/matchMedia\\?\\.\\('\\(max-width:700px\\)'\\)\\.matches/);assert.match(r,/classList\\.add\\('side-collapsed'\\)/);});\ntest('Reader mobile mostra todas as ferramentas sem rolagem horizontal obrigatória',()=>{assert.match(c,/mobile Reader visible-first and complete toolbars/);assert.match(c,/grid-template-columns:repeat\\(auto-fit,minmax\\(44px,1fr\\)\\)/);assert.match(c,/grid-template-columns:repeat\\(4,minmax\\(0,1fr\\)\\)/);});\ntest('Ações mobile do cabeçalho e edital usam grids harmônicos',()=>{assert.match(b,/mobile action grids harmonized/);assert.match(b,/\\.edital-manual-actions\\{[^}]*grid-template-columns:repeat\\(2,minmax\\(0,1fr\\)\\)/s);assert.match(b,/\\.edital-guide-actions\\{[^}]*grid-template-columns:repeat\\(2,minmax\\(0,1fr\\)\\)/s);assert.match(b,/\\.header-account-actions\\{[^}]*grid-template-columns:repeat\\(3,minmax\\(0,1fr\\)\\)/s);});\n""",encoding='utf-8')
print('v10.24.10 mobile layout applied')
