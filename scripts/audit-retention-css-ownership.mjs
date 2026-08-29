import fs from 'node:fs';

const ownerPath = 'public/css/components/retention.css';
const responsivePath = 'public/css/responsive-polish-v10.64.19.css';
const androidHotfixPath = 'android/mobile/android-mobile-hotfix.css';

const owner = fs.readFileSync(ownerPath, 'utf8');
const responsive = fs.readFileSync(responsivePath, 'utf8');
const androidHotfix = fs.readFileSync(androidHotfixPath, 'utf8');

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

if (!/@import\s+url\(['"]\.\/components\/retention\.css['"]\)/.test(responsive)) {
  throw new Error('responsive-polish must import the canonical retention component');
}

const forbiddenOutsideOwner = [
  /#retentionDiagnosticPanel/,
  /\.rd-metric(?:s|-)/,
  /#modalRetentionMetricDetails/
];

for (const [label, css] of [
  [responsivePath, responsive.replace(/@import[^;]+;/g, '')],
  [androidHotfixPath, androidHotfix]
]) {
  for (const pattern of forbiddenOutsideOwner) {
    if (pattern.test(css)) {
      throw new Error(`${label} contains retention override owned by ${ownerPath}: ${pattern}`);
    }
  }
}

console.log(`Retention CSS ownership OK: ${ownerPath}`);
