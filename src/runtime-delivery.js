export const EAGER_FEATURE_STYLES = Object.freeze([
  './css/pdf-library.css',
  './vendor/pdf_viewer.min.css',
  './css/pdf-reader.css'
]);

export const EAGER_FEATURE_SCRIPTS = Object.freeze([
  './js/pdf/pdf-core.js',
  './js/pdf/pdf-workspaces.js',
  './js/pdf/pdf-links.js',
  './js/pdf/pdf-library.js',
  './js/pdf/pdf-upload.js',
  './js/app-ai.js',
  './js/pdf/pdf-annotations.js',
  './vendor/pdf.min.js',
  './js/pdf/pdf-reader.js',
  './js/pdf/pdf-library-ui.js'
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeTagByAsset(html, tagName, attribute, asset) {
  const escaped = escapeRegExp(asset);
  const pattern = new RegExp(`\\s*<${tagName}\\b[^>]*${attribute}=["']${escaped}["'][^>]*>(?:\\s*</${tagName}>)?`, 'gi');
  return html.replace(pattern, '');
}

export function stripEagerFeatureAssets(html) {
  let output = String(html || '');
  for (const href of EAGER_FEATURE_STYLES) output = removeTagByAsset(output, 'link', 'href', href);
  for (const src of EAGER_FEATURE_SCRIPTS) output = removeTagByAsset(output, 'script', 'src', src);
  return output;
}

export function isAppShellPath(pathname) {
  return pathname === '/' || pathname === '/index.html';
}
