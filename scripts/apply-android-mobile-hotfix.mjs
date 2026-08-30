#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexFile = path.join(root, 'public/index.html');
const cssSource = path.join(root, 'android/mobile/android-mobile-hotfix.css');
const cssTargetDir = path.join(root, 'public/css');
const cssTarget = path.join(cssTargetDir, 'android-mobile-hotfix.css');
const manifestFile = path.join(root, 'android/app/src/main/AndroidManifest.xml');
const logoSource = path.join(root, 'public/icon-512.png');
const drawableDir = path.join(root, 'android/app/src/main/res/drawable-nodpi');
const logoTarget = path.join(drawableDir, 'estudo_adaptativo_launcher.png');

for (const required of [indexFile, cssSource, manifestFile, logoSource]) {
  if (!fs.existsSync(required)) throw new Error(`Arquivo obrigatório ausente: ${path.relative(root, required)}`);
}

// Copy the Android-only stylesheet into the temporary web shell only while
// building the native package. Its source lives outside public/ so it does not
// change the canonical browser runtime identity.
{
  fs.mkdirSync(cssTargetDir, { recursive: true });
  fs.copyFileSync(cssSource, cssTarget);
  if (fs.statSync(cssTarget).size < 1024) throw new Error('Stylesheet Android gerado parece inválido.');

  let html = fs.readFileSync(indexFile, 'utf8');
  html = html.replace(/^\s*<link\b[^>]*href=["']\.\/css\/android-mobile-hotfix\.css(?:\?[^"']*)?["'][^>]*>\s*(?:\r?\n)?/gim, '');
  const tag = '    <link rel="stylesheet" href="./css/android-mobile-hotfix.css">';

  // Phase 2 removes PDF CSS from the Android app shell before this hotfix is
  // applied, so the injection anchor must belong to the stable document shell.
  // Inserting immediately before </head> keeps ordering deterministic and does
  // not reintroduce any eager PDF dependency.
  const headClose = /^(\s*)<\/head>\s*$/im;
  if (!headClose.test(html)) throw new Error('Não foi possível localizar </head> para inserir o hotfix mobile Android.');
  html = html.replace(headClose, `${tag}\n$&`);
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
