from pathlib import Path

reader_path=Path('public/js/pdf/pdf-reader.js')
s=reader_path.read_text(encoding='utf-8')
s=s.replace("captureDirectSelection();const selected=state.selected?.text&&Date.now()-Number(state.selected.capturedAt||Date.now())<15000?state.selected:null,link=currentLink()||{};flashcardDraft=", "captureDirectSelection();const link=currentLink()||{},selected=state.selected?.text&&Date.now()-Number(state.selected.capturedAt||Date.now())<15000?state.selected:null;flashcardDraft=",1)
s=s.replace("Pergunta gerada com IA${result.model?' · '+result.model:''}. Revise e edite antes de salvar.", "Gerado por IA real${result.model?' · '+result.model:''}. Revise e edite antes de salvar.",1)
reader_path.write_text(s,encoding='utf-8')

p=Path('tests/pdf-reader.test.cjs'); t=p.read_text(encoding='utf-8')
t=t.replace("/flashcardDraft=\\{text:state\\.selected\\.text,page:state\\.selected\\.page/", "/flashcardDraft=\\{text:selected\\?\\.text\\|\\|'',page:selected\\?\\.page\\|\\|state\\.page/")
p.write_text(t,encoding='utf-8')

print('compatibility assertions updated')
