#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'public/index.html');
const uiPath = path.join(root, 'public/js/app-ui.js');
const auditPath = path.join(root, 'scripts/audit-inline-csp.mjs');

let html = fs.readFileSync(indexPath, 'utf8');
let ui = fs.readFileSync(uiPath, 'utf8');
let audit = fs.readFileSync(auditPath, 'utf8');

if (ui.includes('INLINE_HANDLER_ADAPTERS_START')) throw new Error('Adapter block already exists.');

const adapters = [];
const events = new Set();
let sequence = 0;

function migrateAttribute(match, spacing, attr, quote, code) {
  const eventName = attr.slice(2).toLowerCase();
  sequence += 1;
  const id = `ih-${String(sequence).padStart(3, '0')}`;
  events.add(eventName);

  let replacement = `${spacing}data-inline-${eventName}="${id}"`;
  const tabMatch = code.match(/^\s*switchTab\(\s*['"]([^'"]+)['"]\s*,\s*this\s*\)\s*;?\s*$/);
  if (tabMatch) replacement += ` data-tab-target="${tabMatch[1]}"`;

  adapters.push({ id, eventName, code: code.trim() });
  return replacement;
}

// Static HTML handlers are trusted source code. This migration externalizes them at build time.
html = html.replace(/(\s+)(on[a-z]+)\s*=\s*(["'])([\s\S]*?)\3/gi, migrateAttribute);

const leftovers = [...html.matchAll(/\son[a-z]+\s*=\s*["']/gi)];
if (leftovers.length) throw new Error(`Inline handlers remaining after migration: ${leftovers.length}`);
if (!adapters.length) throw new Error('No inline handlers found to migrate.');
if (adapters.length !== 88) throw new Error(`Expected 88 static handlers, found ${adapters.length}.`);

// findDesktopTabButton historically inspected onclick source. It now uses semantic tab metadata.
const oldFinder = "return [...document.querySelectorAll('.nav-tabs .tab-btn')].find(btn => (btn.getAttribute('onclick') || '').includes(`'${tabId}'`));";
const newFinder = "return [...document.querySelectorAll('.nav-tabs .tab-btn')].find(btn => btn.dataset.tabTarget === tabId);";
if (!ui.includes(oldFinder)) throw new Error('Expected findDesktopTabButton legacy lookup not found.');
ui = ui.replace(oldFinder, newFinder);

const adapterEntries = adapters.map(({ id, code }) => {
  return `            '${id}': function(event) { ${code} }`;
}).join(',\n');
const eventList = JSON.stringify([...events].sort());

const block = `\n\n        // INLINE_HANDLER_ADAPTERS_START\n        // Generated once from the former static inline handlers. Explicit external functions only.\n        (function installExternalizedInlineHandlers() {\n            const adapters = {\n${adapterEntries}\n            };\n            const eventTypes = ${eventList};\n            const bindHandlers = () => {\n                for (const type of eventTypes) {\n                    const selector = '[data-inline-' + type + ']';\n                    document.querySelectorAll(selector).forEach(element => {\n                        if (element.dataset.inlineHandlerBound === '1') return;\n                        const id = element.getAttribute('data-inline-' + type);\n                        const adapter = adapters[id];\n                        if (typeof adapter !== 'function') return;\n                        element.addEventListener(type, function externalizedInlineHandler(event) {\n                            const result = adapter.call(this, event);\n                            if (result === false) {\n                                event.preventDefault();\n                                event.stopPropagation();\n                            }\n                        });\n                        element.dataset.inlineHandlerBound = '1';\n                    });\n                }\n            };\n            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindHandlers, { once:true });\n            else bindHandlers();\n        })();\n        // INLINE_HANDLER_ADAPTERS_END\n`;
ui += block;

if (/\beval\s*\(|\bnew\s+Function\b/.test(block)) throw new Error('Unsafe dynamic execution detected in generated adapters.');

const beforeBudget = audit.match(/const HANDLER_BUDGET = (\d+);/)?.[1];
if (!beforeBudget) throw new Error('Handler budget not found.');
if (Number(beforeBudget) !== 88) throw new Error(`Expected handler budget 88, found ${beforeBudget}.`);
audit = audit.replace(/const HANDLER_BUDGET = \d+;/, 'const HANDLER_BUDGET = 0;');

fs.writeFileSync(indexPath, html, 'utf8');
fs.writeFileSync(uiPath, ui, 'utf8');
fs.writeFileSync(auditPath, audit, 'utf8');

console.log(`Migrated ${adapters.length} static inline handlers across ${events.size} event types.`);
console.log(`Handler budget ${beforeBudget} -> 0.`);
console.log(`Event types: ${[...events].sort().join(', ')}`);
