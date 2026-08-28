#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexFile = path.join(root, 'public/index.html');
const cssFile = path.join(root, 'public/css/android-mobile-hotfix.css');
const manifestFile = path.join(root, 'android/app/src/main/AndroidManifest.xml');
const logoSource = path.join(root, 'public/icon-512.png');
const drawableDir = path.join(root, 'android/app/src/main/res/drawable-nodpi');
const logoTarget = path.join(drawableDir, 'estudo_adaptativo_launcher.png');

for (const required of [indexFile, cssFile, manifestFile, logoSource]) {
  if (!fs.existsSync(required)) throw new Error(`Arquivo obrigatório ausente: ${path.relative(root, required)}`);
}

// Native-only stylesheet. It is injected into the packaged web shell during
// Android CI and therefore does not alter the canonical browser presentation.
{
  let html = fs.readFileSync(indexFile, 'utf8');
  html = html.replace(/^\s*<link\b[^>]*href=["']\.\/css\/android-mobile-hotfix\.css(?:\?[^"']*)?["'][^>]*>\s*(?:\r?\n)?/gim, '');
  const tag = '    <link rel="stylesheet" href="./css/android-mobile-hotfix.css">';
  const pivot = /^(\s*)<link\b[^>]*href=["']\.\/css\/pdf-reader\.css(?:\?[^"']*)?["'][^>]*>\s*$/im;
  if (!pivot.test(html)) throw new Error('Não foi possível localizar pdf-reader.css para inserir o hotfix mobile Android.');
  html = html.replace(pivot, `$&\n${tag}`);
  fs.writeFileSync(indexFile, html);
}

// Use the same canonical product logo already used by the web/PWA as the
// Android launcher icon. A drawable-nodpi bitmap avoids the generic Capacitor
// adaptive foreground that was being shown by some launchers.
{
  fs.mkdirSync(drawableDir, { recursive: true });
  fs.copyFileSync(logoSource, logoTarget);
  if (fs.statSync(logoTarget).size < 1024) throw new Error('Logo Android gerado parece inválido.');

  let manifest = fs.readFileSync(manifestFile, 'utf8');
  manifest = manifest
    .replace(/android:icon="@[^"]+"/, 'android:icon="@drawable/estudo_adaptativo_launcher"')
    .replace(/android:roundIcon="@[^"]+"/, 'android:roundIcon="@drawable/estudo_adaptativo_launcher"');

  if (!manifest.includes('android:icon="@drawable/estudo_adaptativo_launcher"') ||
      !manifest.includes('android:roundIcon="@drawable/estudo_adaptativo_launcher"')) {
    throw new Error('Falha ao aplicar o logo canônico no AndroidManifest.xml.');
  }
  fs.writeFileSync(manifestFile, manifest);
}

console.log('Android mobile hotfix applied: responsive UI + canonical launcher logo.');
