import fs from 'node:fs';
const file='scripts/tmp-phase8c-consolidate.mjs';
let source=fs.readFileSync(file,'utf8');
const from="if(!exists(file)||file===oldAssessment)continue;";
const to="if(!exists(file)||file===oldAssessment||file.startsWith('scripts/tmp-phase8c-')||file==='.github/workflows/tmp-phase8c-consolidate.yml'||file==='phase8c-focused.log')continue;";
if(!source.includes(from))throw new Error('Phase 8C migration loop guard not found');
source=source.replace(from,to);
fs.writeFileSync(file,source);
