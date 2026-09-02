import fs from 'node:fs';
const patch=(file,from,to)=>{let s=fs.readFileSync(file,'utf8');if(!s.includes(from))throw new Error(`${file}: patch token not found`);s=s.replace(from,to);fs.writeFileSync(file,s)};

patch('tests/next-best-study-action.test.cjs',
"  const source=fs.readFileSync('public/js/core/next-best-study-action.js','utf8');",
"  const assessmentSource=fs.readFileSync('public/js/core/topic-assessment.js','utf8');\n  const source=fs.readFileSync('public/js/core/next-best-study-action.js','utf8');");
patch('tests/next-best-study-action.test.cjs',
"  vm.runInNewContext(source,{window,CustomEvent,Date,Math,Number,String,Object,Array,JSON,console});",
"  const context={window,CustomEvent,Date,Math,Number,String,Object,Array,JSON,console};\n  vm.runInNewContext(assessmentSource,context);\n  vm.runInNewContext(source,context);");

patch('tests/phase-6b-study-optimization.test.cjs',
"  const code=fs.readFileSync(path.join(process.cwd(),'public/js/core/study-optimization-engine.js'),'utf8');",
"  const assessmentCode=fs.readFileSync(path.join(process.cwd(),'public/js/core/topic-assessment.js'),'utf8');\n  const code=fs.readFileSync(path.join(process.cwd(),'public/js/core/study-optimization-engine.js'),'utf8');");
patch('tests/phase-6b-study-optimization.test.cjs',
"  vm.runInContext(code,context,{filename:'study-optimization-engine.js'});",
"  vm.runInContext(assessmentCode,context,{filename:'topic-assessment.js'});\n  vm.runInContext(code,context,{filename:'study-optimization-engine.js'});");

patch('tests/phase-6c-predictive-adaptive-tutor.test.cjs',
"const source=fs.readFileSync('public/js/core/predictive-adaptive-tutor.js','utf8');",
"const assessmentSource=fs.readFileSync('public/js/core/topic-assessment.js','utf8');\nconst source=fs.readFileSync('public/js/core/predictive-adaptive-tutor.js','utf8');");
patch('tests/phase-6c-predictive-adaptive-tutor.test.cjs',
"  vm.runInContext(source,context);",
"  vm.runInContext(assessmentSource,context,{filename:'topic-assessment.js'});\n  vm.runInContext(source,context,{filename:'predictive-adaptive-tutor.js'});");

patch('tests/phase-7c-7f-performance.test.cjs',
"  vm.runInContext(code,context,{filename:path});",
"  if(path==='public/js/core/predictive-adaptive-tutor.js'||path==='public/js/core/study-optimization-engine.js'){\n    const assessmentCode=fs.readFileSync('public/js/core/topic-assessment.js','utf8');\n    vm.runInContext(assessmentCode,context,{filename:'public/js/core/topic-assessment.js'});\n  }\n  vm.runInContext(code,context,{filename:path});");
