from pathlib import Path
import json

reader_path=Path('public/js/pdf/pdf-reader.js')
r=reader_path.read_text(encoding='utf-8')

old="let pdfDoc=null,pageObserver=null,baseViewport=null,renderToken=0,currentScale=1,nativeObjectUrl=null,flashcardDraft=null,loadTimer=null,searchIndex=new Map(),searchResults=[],searchCursor=-1,currentSearchQuery='';"
new="let pdfDoc=null,pageObserver=null,baseViewport=null,renderToken=0,currentScale=1,nativeObjectUrl=null,flashcardDraft=null,loadTimer=null,searchIndex=new Map(),searchResults=[],searchCursor=-1,currentSearchQuery='',pinchBound=false,pinchState={points:new Map(),active:false,startDistance:0,startScale:1,targetScale:1,anchorX:0,anchorY:0,scrollLeft:0,scrollTop:0};"
if old not in r: raise SystemExit('state anchor not found')
r=r.replace(old,new,1)

anchor="function zoom(delta=0){if(!pdfDoc)return;state.viewMode='custom';currentScale=Math.min(4,Math.max(.4,currentScale+(Number(delta)||.1)));renderToken++;setupCustomViewer();updateFitButtons()}function fitWidth(){state.viewMode='width';applyFit()}"
insert="""function pinchDistance(){const pts=[...pinchState.points.values()];if(pts.length<2)return 0;return Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)}
function pinchMidpoint(){const pts=[...pinchState.points.values()];if(pts.length<2)return{x:0,y:0};return{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}}
function resetPinchPreview(){const host=$('pdfReaderPageHost'),box=$('pdfReaderCanvasWrap');if(host){host.style.transform='';host.style.transformOrigin=''}box?.classList.remove('is-pinching');pinchState.active=false;pinchState.points.clear()}
function beginPinch(){const box=$('pdfReaderCanvasWrap'),host=$('pdfReaderPageHost');if(!box||!host||pinchState.points.size<2)return;const mid=pinchMidpoint(),rect=box.getBoundingClientRect();pinchState.active=true;pinchState.startDistance=Math.max(1,pinchDistance());pinchState.startScale=currentScale;pinchState.targetScale=currentScale;pinchState.anchorX=mid.x-rect.left;pinchState.anchorY=mid.y-rect.top;pinchState.scrollLeft=box.scrollLeft;pinchState.scrollTop=box.scrollTop;host.style.transformOrigin=`${pinchState.scrollLeft+pinchState.anchorX}px ${pinchState.scrollTop+pinchState.anchorY}px`;box.classList.add('is-pinching');clearSelection()}
function updatePinch(e){if(!pinchState.active||pinchState.points.size<2)return;const host=$('pdfReaderPageHost');if(!host)return;e.preventDefault();const factor=pinchDistance()/Math.max(1,pinchState.startDistance);pinchState.targetScale=Math.min(4,Math.max(.4,pinchState.startScale*factor));host.style.transform=`scale(${pinchState.targetScale/currentScale})`;if($('pdfReaderZoomValue'))$('pdfReaderZoomValue').textContent=`${Math.round(pinchState.targetScale*100)}%`}
function commitPinch(){if(!pinchState.active)return;const box=$('pdfReaderCanvasWrap'),host=$('pdfReaderPageHost'),previous=currentScale,target=Math.min(4,Math.max(.4,pinchState.targetScale||currentScale)),ratio=target/Math.max(.001,previous),left=pinchState.scrollLeft,top=pinchState.scrollTop,ax=pinchState.anchorX,ay=pinchState.anchorY;pinchState.active=false;if(host){host.style.transform='';host.style.transformOrigin=''}box?.classList.remove('is-pinching');if(Math.abs(target-previous)<.01){updateFitButtons();return}state.viewMode='custom';currentScale=target;renderToken++;setupCustomViewer();updateFitButtons();requestAnimationFrame(()=>{if(!box)return;box.scrollLeft=Math.max(0,(left+ax)*ratio-ax);box.scrollTop=Math.max(0,(top+ay)*ratio-ay)})}
function bindPinchZoom(){const box=$('pdfReaderCanvasWrap');if(!box||pinchBound)return;pinchBound=true;box.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;pinchState.points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinchState.points.size===2)beginPinch()},{passive:true});box.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||!pinchState.points.has(e.pointerId))return;pinchState.points.set(e.pointerId,{x:e.clientX,y:e.clientY});updatePinch(e)},{passive:false});const end=e=>{if(e.pointerType!=='touch')return;pinchState.points.delete(e.pointerId);if(pinchState.active&&pinchState.points.size<2)commitPinch()};box.addEventListener('pointerup',end,{passive:true});box.addEventListener('pointercancel',end,{passive:true});box.addEventListener('pointerleave',e=>{if(e.pointerType==='touch'&&pinchState.points.has(e.pointerId)){pinchState.points.delete(e.pointerId);if(pinchState.active&&pinchState.points.size<2)commitPinch()}},{passive:true})}
function zoom(delta=0){if(!pdfDoc)return;state.viewMode='custom';currentScale=Math.min(4,Math.max(.4,currentScale+(Number(delta)||.1)));renderToken++;setupCustomViewer();updateFitButtons()}function fitWidth(){state.viewMode='width';applyFit()}"""
if anchor not in r: raise SystemExit('zoom anchor not found')
r=r.replace(anchor,insert,1)

open_anchor="readerOverlay?.classList.add('open');document.body.classList.add('pdf-reader-open');$('pdfReaderTitle').textContent=doc.title||doc.original_file_name||'PDF';"
open_new="readerOverlay?.classList.add('open');document.body.classList.add('pdf-reader-open');bindPinchZoom();$('pdfReaderTitle').textContent=doc.title||doc.original_file_name||'PDF';"
if open_anchor not in r: raise SystemExit('open anchor not found')
r=r.replace(open_anchor,open_new,1)

dispose_anchor="async function dispose(){finishLoading();renderToken++;pageObserver?.disconnect();pageObserver=null;"
dispose_new="async function dispose(){finishLoading();resetPinchPreview();renderToken++;pageObserver?.disconnect();pageObserver=null;"
if dispose_anchor not in r: raise SystemExit('dispose anchor not found')
r=r.replace(dispose_anchor,dispose_new,1)
reader_path.write_text(r,encoding='utf-8')

css_path=Path('public/css/pdf-reader.css')
c=css_path.read_text(encoding='utf-8')
marker='/* V10.24.11 — pinch-to-zoom mobile */'
if marker not in c:
    c += """\n\n/* V10.24.11 — pinch-to-zoom mobile */\n@media(max-width:700px){\n  .pdf-reader-canvas-wrap{touch-action:pan-x pan-y!important}\n  .pdf-reader-canvas-wrap.is-pinching{touch-action:none!important;overscroll-behavior:none!important}\n  .pdf-reader-canvas-wrap.is-pinching .pdf-reader-page-host{will-change:transform}\n}\n"""
css_path.write_text(c,encoding='utf-8')

for p in [Path('package.json'),Path('public/version.json')]:
    data=json.loads(p.read_text(encoding='utf-8'));data['version']='10.24.11';p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for p in [Path('public/sw.js'),Path('src/index.js')]:
    s=p.read_text(encoding='utf-8').replace('10.24.10','10.24.11');p.write_text(s,encoding='utf-8')
for p in Path('tests').glob('*.test.cjs'):
    s=p.read_text(encoding='utf-8').replace("'10.24.10'","'10.24.11'").replace('"10.24.10"','"10.24.11"');p.write_text(s,encoding='utf-8')

Path('tests/v10-24-11-pinch-zoom.test.cjs').write_text("""const test=require('node:test');\nconst assert=require('node:assert/strict');\nconst fs=require('node:fs');\nconst r=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');\nconst c=fs.readFileSync('public/css/pdf-reader.css','utf8');\ntest('Reader mobile possui pinch-to-zoom por dois toques',()=>{\n  for(const token of ['function beginPinch()','function updatePinch(e)','function commitPinch()','function bindPinchZoom()']) assert.ok(r.includes(token),token);\n  assert.match(r,/pointerdown/);assert.match(r,/pointermove/);assert.match(r,/pointerup/);\n  assert.match(r,/Math\.min\(4,Math\.max\(\.4/);\n  assert.match(r,/bindPinchZoom\(\)/);\n});\ntest('pinch preserva navegação de um dedo e ativa modo exclusivo durante gesto',()=>{\n  assert.match(c,/pinch-to-zoom mobile/);\n  assert.match(c,/touch-action:pan-x pan-y!important/);\n  assert.match(c,/is-pinching\{touch-action:none!important/);\n});\n""",encoding='utf-8')
print('v10.24.11 pinch zoom applied')
