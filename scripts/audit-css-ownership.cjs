const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cssDir = path.join(root, 'public', 'css');
const indexPath = path.join(root, 'public', 'index.html');

const canonicalPath = path.join(cssDir, 'responsive-system.css');
const canonical = fs.readFileSync(canonicalPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

const legacyFiles = ['base.css', 'dashboard.css', 'features.css'];
const specializedFiles = ['pdf-library.css', 'pdf-reader.css'];

const canonicalSelectors = [
  '#app-dashboard',
  '.study-overview-grid',
  '.grid-top',
  'header.modern-header',
  '.header-nav-tabs',
  '.action-bar'
];

const errors = [];
const warnings = [];

for (const selector of canonicalSelectors) {
  if (!canonical.includes(selector)) {
    errors.push(`responsive-system.css perdeu o seletor canônico ${selector}`);
  }
}

for (const forbidden of ['.pdf-library-actions', '.pdf-reader-shell', '.pdf-reader-toolbar']) {
  if (canonical.includes(forbidden)) {
    errors.push(`responsive-system.css não deve assumir layout especializado: ${forbidden}`);
  }
}

const links = [
  './css/base.css',
  './css/dashboard.css',
  './css/features.css',
  './css/pdf-library.css',
  './css/pdf-reader.css',
  './css/responsive-system.css'
];

const positions = new Map(links.map(link => [link, index.indexOf(link)]));
for (const link of links) {
  if (positions.get(link) < 0) errors.push(`index.html não carrega ${link}`);
}

const responsivePos = positions.get('./css/responsive-system.css');
for (const link of links.filter(link => link !== './css/responsive-system.css')) {
  if (positions.get(link) >= 0 && responsivePos >= 0 && responsivePos < positions.get(link)) {
    errors.push(`responsive-system.css deve carregar depois de ${link}`);
  }
}

const canonicalMedia = [
  '@media (max-width: 600px)',
  '@media (min-width: 601px) and (max-width: 900px)',
  '@media (min-width: 901px) and (max-width: 1200px)',
  '@media (min-width: 1201px)',
  '@media (prefers-reduced-motion: reduce)'
];

const mediaMatches = canonical.match(/@media\s*\([^\n{]+\)/g) || [];
for (const media of mediaMatches) {
  if (!canonicalMedia.includes(media.trim())) {
    errors.push(`breakpoint não canônico em responsive-system.css: ${media.trim()}`);
  }
}

for (const file of legacyFiles) {
  const source = fs.readFileSync(path.join(cssDir, file), 'utf8');
  const overlaps = canonicalSelectors.filter(selector => source.includes(selector));
  if (overlaps.length) {
    warnings.push(`${file}: dívida legada congelada em ${overlaps.join(', ')}`);
  }
}

for (const file of specializedFiles) {
  const source = fs.readFileSync(path.join(cssDir, file), 'utf8');
  if (!source.trim()) errors.push(`${file} está vazio`);
}

if (warnings.length) {
  console.log('CSS ownership audit — compatibilidade legada detectada:');
  for (const warning of warnings) console.log(`  - ${warning}`);
}

if (errors.length) {
  console.error('CSS ownership audit falhou:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('CSS ownership audit OK: responsive-system.css permanece como camada canônica final.');
