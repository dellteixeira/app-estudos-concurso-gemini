#!/usr/bin/env node
import fs from 'node:fs';

// 1) Load native runtime before every deferred app/vendor script.
{
  const file = 'public/index.html';
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('./capacitor-runtime.js')) {
    text = text.replace('    <script src="./pwa-update.js" defer></script>', '    <script src="./capacitor-runtime.js" defer></script>\n    <script src="./pwa-update.js" defer></script>');
  }
  fs.writeFileSync(file, text);
}

// 2) Canonical asset manifest.
{
  const file = 'config/app-assets.json';
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const route = '/capacitor-runtime.js';
  for (const key of ['criticalAppShell', 'networkFirstPaths', 'workerNoStorePaths', 'headersNoStorePaths']) {
    const list = manifest[key];
    if (!list.includes(route)) {
      const pivot = list.indexOf('/pwa-update.js');
      list.splice(pivot >= 0 ? pivot + 1 : 0, 0, route);
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

// 3) Service Worker inventory parity.
{
  const file = 'public/sw.js';
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes("'./capacitor-runtime.js'")) {
    text = text.replace("'./', './index.html', './manifest.json', './version.json', './pwa-update.js',", "'./', './index.html', './manifest.json', './version.json', './pwa-update.js', './capacitor-runtime.js',");
  }
  if (!text.includes("'/capacitor-runtime.js'")) {
    text = text.replace("'/pwa-update.js', '/sw.js', '/index.html', '/manifest.json', '/version.json',", "'/pwa-update.js', '/capacitor-runtime.js', '/sw.js', '/index.html', '/manifest.json', '/version.json',");
  }
  if (!text.includes("'./capacitor-runtime.js'") || !text.includes("'/capacitor-runtime.js'")) {
    throw new Error('Falha ao sincronizar capacitor-runtime.js no Service Worker.');
  }
  fs.writeFileSync(file, text);
}

// 4) Worker no-store + CORS restricted to the packaged native origin.
{
  const file = 'src/index.js';
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('"/capacitor-runtime.js"')) {
    text = text.replace('"/", "/index.html", "/sw.js", "/pwa-update.js", "/version.json",', '"/", "/index.html", "/sw.js", "/pwa-update.js", "/capacitor-runtime.js", "/version.json",');
  }

  if (!text.includes('const NATIVE_APP_ORIGINS')) {
    const marker = '\nexport default {\n';
    const helper = `\nconst NATIVE_APP_ORIGINS = new Set(["https://localhost", "capacitor://localhost"]);\n\nfunction withNativeCors(request, response) {\n  const origin = request.headers.get("origin") || "";\n  if (!NATIVE_APP_ORIGINS.has(origin)) return response;\n  const headers = new Headers(response.headers);\n  headers.set("access-control-allow-origin", origin);\n  headers.set("access-control-allow-methods", "POST, OPTIONS");\n  headers.set("access-control-allow-headers", "authorization, content-type");\n  headers.set("access-control-max-age", "86400");\n  headers.append("vary", "Origin");\n  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });\n}\n\nfunction nativeCorsPreflight(request) {\n  const origin = request.headers.get("origin") || "";\n  if (!NATIVE_APP_ORIGINS.has(origin)) return new Response(null, { status: 403 });\n  return new Response(null, { status: 204, headers: {\n    "access-control-allow-origin": origin,\n    "access-control-allow-methods": "POST, OPTIONS",\n    "access-control-allow-headers": "authorization, content-type",\n    "access-control-max-age": "86400",\n    "vary": "Origin"\n  }});\n}\n`;
    if (!text.includes(marker)) throw new Error('Não foi possível localizar export default em src/index.js.');
    text = text.replace(marker, `${helper}${marker}`);
  }

  if (!text.includes('nativeCorsPreflight(request)')) {
    text = text.replace('    const url = new URL(request.url);\n\n    if (request.method === "GET"', '    const url = new URL(request.url);\n\n    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {\n      return nativeCorsPreflight(request);\n    }\n\n    if (request.method === "GET"');
  }
  text = text.replace('      return analyzeEdital(request, env);', '      return withNativeCors(request, await analyzeEdital(request, env));');
  text = text.replace('      return generateFlashcard(request, env);', '      return withNativeCors(request, await generateFlashcard(request, env));');
  text = text.replace('      return learningDiagnosis(request, env);', '      return withNativeCors(request, await learningDiagnosis(request, env));');
  text = text.replace('        return json({ error: "Método não permitido." }, 405);\n      }\n      return withNativeCors(request, await analyzeEdital', '        return withNativeCors(request, json({ error: "Método não permitido." }, 405));\n      }\n      return withNativeCors(request, await analyzeEdital');
  text = text.replace('      if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);\n      return withNativeCors(request, await generateFlashcard', '      if (request.method !== "POST") return withNativeCors(request, json({ error: "Método não permitido." }, 405));\n      return withNativeCors(request, await generateFlashcard');
  text = text.replace('      if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);\n      return withNativeCors(request, await learningDiagnosis', '      if (request.method !== "POST") return withNativeCors(request, json({ error: "Método não permitido." }, 405));\n      return withNativeCors(request, await learningDiagnosis');
  fs.writeFileSync(file, text);
}

// 5) Static cache header parity.
{
  const file = 'public/_headers';
  let text = fs.readFileSync(file, 'utf8');
  if (!/^\/capacitor-runtime\.js$/m.test(text)) {
    text += '\n/capacitor-runtime.js\n  Cache-Control: no-cache, no-store, must-revalidate\n';
  }
  fs.writeFileSync(file, text);
}

console.log('Android Phase 1B migration applied.');
