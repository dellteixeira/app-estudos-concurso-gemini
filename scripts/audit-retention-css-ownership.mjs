import fs from 'node:fs';
import path from 'node:path';

const ownerPath = 'public/css/components/retention.css';
const cssRoot = 'public/css';
const androidHotfixPath = 'android/mobile/android-mobile-hotfix.css';
const owner = fs.readFileSync(ownerPath, 'utf8');

const requiredContracts = [
  /#retentionDiagnosticPanel \.rd-metrics-v1077/,
  /grid-auto-rows:\s*minmax\(166px, auto\)/,
  /row-gap:\s*14px/,
  /#retentionDiagnosticPanel \.rd-metric-card-v1077/,
  /max-height:\s*none/,
  /#modalRetentionMetricDetails \.retention-metric-modal-content/
];

for (const pattern of requiredContracts) {
  if (!pattern.test(owner)) {
    throw new Error(`Retention owner missing contract: ${pattern}`);
  }
}

const responsiveFiles = fs.readdirSync(cssRoot)
  .filter(name => /^responsive-polish-v\d+\.\d+\.\d+\.css$/.test(name))
  .map(name => path.posix.join(cssRoot, name));

if (responsiveFiles.length !== 1) {
  throw new Error(`Expected exactly one versioned responsive-polish CSS, found ${responsiveFiles.length}: ${responsiveFiles.join(', ')}`);
}

const responsivePath = responsiveFiles[0];
const responsive = fs.readFileSync(responsivePath, 'utf8');
if (!/@import\s+url\(['"]\.\/components\/retention\.css['"]\)/.test(responsive)) {
  throw new Error(`${responsivePath} must import the canonical retention component`);
}

function listCssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listCssFiles(full);
    return entry.isFile() && entry.name.endsWith('.css') ? [full.replaceAll('\\', '/')] : [];
  });
}

const forbiddenOutsideOwner = [
  /#retentionDiagnosticPanel/,
  /\.rd-metric(?:s|-)/,
  /#modalRetentionMetricDetails/
];

const competitors = [
  ...listCssFiles(cssRoot).filter(file => file !== ownerPath),
  androidHotfixPath
];

for (const file of competitors) {
  const css = fs.readFileSync(file, 'utf8').replace(/@import[^;]+;/g, '');
  for (const pattern of forbiddenOutsideOwner) {
    if (pattern.test(css)) {
      throw new Error(`${file} contains retention CSS owned exclusively by ${ownerPath}: ${pattern}`);
    }
  }
}

console.log(`Retention CSS ownership OK: ${ownerPath}; audited ${competitors.length} competing CSS files`);
