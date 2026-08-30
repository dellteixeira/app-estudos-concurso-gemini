#!/usr/bin/env node
import { spawn } from 'node:child_process';

const args=process.argv.slice(2);
let attempts=3;
let delayMs=5000;
while(args[0]?.startsWith('--')){
  const option=args.shift();
  if(option.startsWith('--attempts='))attempts=Math.max(1,Math.min(6,Number(option.split('=')[1])||3));
  else if(option.startsWith('--delay-ms='))delayMs=Math.max(500,Math.min(30000,Number(option.split('=')[1])||5000));
}
if(!args.length){console.error('Uso: node scripts/ci-retry.mjs [--attempts=N] [--delay-ms=N] comando [args...]');process.exit(2)}
const [command,...commandArgs]=args;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function run(){return new Promise(resolve=>{const child=spawn(command,commandArgs,{stdio:'inherit',shell:process.platform==='win32'});child.on('error',()=>resolve(127));child.on('exit',(code,signal)=>resolve(signal?128:Number(code??1)));});}
let lastCode=1;
for(let attempt=1;attempt<=attempts;attempt++){
  console.log(`CI retry: tentativa ${attempt}/${attempts}: ${command} ${commandArgs.join(' ')}`);
  lastCode=await run();
  if(lastCode===0)process.exit(0);
  if(attempt<attempts){const wait=delayMs*attempt;console.warn(`Comando falhou com código ${lastCode}; nova tentativa em ${wait} ms.`);await sleep(wait);}
}
console.error(`Comando falhou após ${attempts} tentativas.`);process.exit(lastCode||1);
