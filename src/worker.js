import app from './index.js';
import { handleLearningDiagnosis } from './learning-diagnosis.js';
import { isAppShellPath, stripEagerFeatureAssets } from './runtime-delivery.js';

const EXTENDED_NO_STORE_PATHS = new Set([
  '/css/learning-advisor.css',
  '/js/adaptive-schedule-reconciliation.js',
  '/js/learning-advisor.js',
  '/js/core/edital-integrity.js',
  '/js/core/offline-outbox-store.js',
  '/js/core/offline-sync-shadow.js',
  '/js/core/offline-sync-metadata-shadow.js',
  '/js/core/offline-sync-metadata-authority.js',
  '/js/core/offline-sync-metadata-graduation.js',
  '/js/core/offline-sync-metadata-rollout.js',
  '/js/core/offline-sync-metadata-stability.js',
  '/js/core/offline-sync-metadata-expanded-stability.js',
  '/js/core/offline-sync-metadata-expanded-promotion.js',
  '/js/core/offline-sync-metadata-promoted-stability.js',
  '/js/core/offline-sync-metadata-population-promotion.js',
  '/js/core/offline-sync-metadata-population-promoted-stability.js',
  '/js/core/offline-sync-metadata-ring2-promotion.js',
  '/js/core/offline-sync-metadata-ring2-promoted-stability.js',
  '/js/core/offline-sync-metadata-ring3-promotion.js',
  '/js/core/offline-sync-metadata-expansion.js',
  '/js/core/offline-sync-authority.js',
  '/js/core/offline-sync-delete-authority.js',
  '/js/core/offline-sync-edital-graduation.js'
]);

function withNoStore(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-cache, no-store, must-revalidate');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}

async function withOnDemandAppShell(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const optimizedHtml = stripEagerFeatureAssets(html);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('x-painel-runtime-delivery', 'on-demand-v1');
  return new Response(optimizedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai/learning-diagnosis') return handleLearningDiagnosis(request, env);
    if (request.method === 'GET' && EXTENDED_NO_STORE_PATHS.has(url.pathname)) return withNoStore(await env.ASSETS.fetch(request));

    const response = await app.fetch(request, env, ctx);
    if (request.method === 'GET' && isAppShellPath(url.pathname)) return withOnDemandAppShell(response);
    return response;
  }
};
