from pathlib import Path

js = Path('public/js/critical-points-actions.js')
s = js.read_text()
s = s.replace("const VERSION='1.1.0';", "const VERSION='1.1.1';")
old = """  const copy=article.querySelector('.retention-risk-copy');
  if(copy)copy.appendChild(controls);
  else article.appendChild(controls);"""
if old not in s:
    raise SystemExit('critical controls append anchor not found')
s = s.replace(old, "  article.appendChild(controls);", 1)
js.write_text(s)

css = Path('public/css/learning-advisor.css')
c = css.read_text()
marker = '/* V10.64.15 — Pontos críticos: ações ocupam toda a largura útil do card. */'
if marker not in c:
    c += '''\n\n/* V10.64.15 — Pontos críticos: ações ocupam toda a largura útil do card. */
#retentionDiagnosticPanel.retention-dashboard-v1072 .retention-risk-card-v1071.critical-actions-enabled > .critical-point-controls{
  grid-column:2 / -1 !important;
  width:100% !important;
  max-width:none !important;
  box-sizing:border-box !important;
  grid-template-columns:minmax(0,1.2fr) minmax(0,1.16fr) minmax(0,.9fr) !important;
  gap:8px !important;
  margin-top:4px !important;
}
#retentionDiagnosticPanel.retention-dashboard-v1072 .retention-risk-card-v1071.critical-actions-enabled > .critical-point-controls button{
  min-width:0 !important;
  width:100% !important;
  box-sizing:border-box !important;
  padding:7px 7px !important;
  font-size:.70rem !important;
  line-height:1.1 !important;
  white-space:nowrap !important;
  overflow-wrap:normal !important;
  word-break:keep-all !important;
  hyphens:none !important;
}
#retentionDiagnosticPanel.retention-dashboard-v1072 .retention-risk-card-v1071.critical-actions-enabled > .critical-point-controls .critical-point-note{
  grid-column:1 / -1 !important;
}
@media(max-width:820px){
  #retentionDiagnosticPanel.retention-dashboard-v1072 .retention-risk-card-v1071.critical-actions-enabled > .critical-point-controls{
    grid-column:2 / -1 !important;
    grid-template-columns:minmax(0,1.2fr) minmax(0,1.16fr) minmax(0,.9fr) !important;
    gap:6px !important;
  }
  #retentionDiagnosticPanel.retention-dashboard-v1072 .retention-risk-card-v1071.critical-actions-enabled > .critical-point-controls button{
    padding:7px 5px !important;
    font-size:.65rem !important;
  }
}
@media(max-width:520px){
  #retentionDiagnosticPanel.retention-dashboard-v1072 .retention-risk-card-v1071.critical-actions-enabled > .critical-point-controls{gap:5px !important;}
  #retentionDiagnosticPanel.retention-dashboard-v1072 .retention-risk-card-v1071.critical-actions-enabled > .critical-point-controls button{padding-inline:4px !important;font-size:.61rem !important;}
}
'''
css.write_text(c)

for file in ['package.json','public/version.json','src/index.js','public/sw.js','config/app-assets.json','public/js/app-pwa.js']:
    p = Path(file)
    t = p.read_text()
    if '10.64.14' not in t:
        raise SystemExit(f'expected version 10.64.14 not found in {file}')
    p.write_text(t.replace('10.64.14','10.64.15'))

old_test = Path('tests/critical-buttons-fit-v10.64.14.test.cjs')
t = old_test.read_text()
t = t.replace("test('release do ajuste é 10.64.14',()=>assert.equal(pkg.version,'10.64.14'));", "test('release do ajuste permanece na linha canônica 10.64.x',()=>assert.match(pkg.version,/^10\\.64\\.\\d+$/));")
old_test.write_text(t)

Path('tests/critical-buttons-full-width-v10.64.15.test.cjs').write_text('''const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('public/js/critical-points-actions.js','utf8');
const css=fs.readFileSync('public/css/learning-advisor.css','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('ações críticas são filhas diretas do card e não da coluna de texto',()=>{
  assert.match(js,/article\\.appendChild\\(controls\\);/);
  assert.doesNotMatch(js,/copy\\.appendChild\\(controls\\)/);
});

test('grupo de ações atravessa a coluna de conteúdo até o fim do card',()=>{
  assert.match(css,/V10\\.64\\.15 — Pontos críticos: ações ocupam toda a largura útil do card/);
  assert.match(css,/critical-actions-enabled > \\.critical-point-controls\\{[\\s\\S]*grid-column:2 \\/ -1 !important/);
  assert.match(css,/grid-template-columns:minmax\\(0,1\\.2fr\\) minmax\\(0,1\\.16fr\\) minmax\\(0,\\.9fr\\) !important/);
  assert.match(css,/font-size:\\.65rem !important/);
  assert.match(css,/white-space:nowrap !important/);
});

test('promoção estrutural usa a versão 10.64.15',()=>assert.equal(pkg.version,'10.64.15'));
''')