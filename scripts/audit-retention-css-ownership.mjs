import fs from 'node:fs';
import path from 'node:path';

const ownerPath = 'public/css/components/retention.css';
const cssRoot = 'public/css';
const androidHotfixPath = 'android/mobile/android-mobile-hotfix.css';
const baseRetentionLayerPath = 'public/css/features.css';
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

/* Actual ownership contracts: retention metric layout and its details modal. */
const forbiddenRetentionOwnership = [
  /\.rd-metric(?:s|-)/,
  /#modalRetentionMetricDetails/
];

/* Delegator/native layers must not contain any direct retention-panel override. */
const forbiddenDelegatorOverrides = [
  /#retentionDiagnosticPanel/,
  ...forbiddenRetentionOwnership
];

const delegatorLayers = [
  [responsivePath, responsive.replace(/@import[^;]+;/g, '')],
  [androidHotfixPath, fs.readFileSync(androidHotfixPath, 'utf8')]
];

for (const [file, css] of delegatorLayers) {
  for (const pattern of forbiddenDelegatorOverrides) {
    if (pattern.test(css)) {
      throw new Error(`${file} duplicates retention overrides owned by ${ownerPath}: ${pattern}`);
    }
  }
}

/*
 * features.css is the historical/base component stylesheet. The dedicated
 * owner file is the authoritative responsive/current metric layer loaded by
 * responsive-polish. learning-advisor.css may legitimately scope its own
 * critical-action controls under #retentionDiagnosticPanel (V10.64.15), but
 * it must not own .rd-metric* layout or the retention details modal.
 */
const competitors = listCssFiles(cssRoot).filter(file =>
  file !== ownerPath &&
  file !== baseRetentionLayerPath &&
  file !== responsivePath
);

for (const file of competitors) {
  const css = fs.readFileSync(file, 'utf8').replace(/@import[^;]+;/g, '');
  for (const pattern of forbiddenRetentionOwnership) {
    if (pattern.test(css)) {
      throw new Error(`${file} contains retention metric CSS owned by ${ownerPath}: ${pattern}`);
    }
  }
}

console.log(`Retention CSS ownership OK: base=${baseRetentionLayerPath}; responsive owner=${ownerPath}; audited ${competitors.length + delegatorLayers.length} non-owner CSS layers`);
