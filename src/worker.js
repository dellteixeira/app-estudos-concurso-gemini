import app from './index.js';
import { handleLearningDiagnosis } from './learning-diagnosis.js';

const EXTENDED_NO_STORE_PATHS = new Set([
  '/css/learning-advisor.css',
  '/js/adaptive-schedule-reconciliation.js',
  '/js/learning-advisor.js',
  '/js/core/offline-outbox-store.js',
  '/js/core/offline-sync-shadow.js',
  '/js/core/offline-sync-authority.js'
]);

function withNoStore(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-cache, no-store, must-revalidate');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai/learning-diagnosis') {
      return handleLearningDiagnosis(request, env);
    }
    if (request.method === 'GET' && EXTENDED_NO_STORE_PATHS.has(url.pathname)) {
      return withNoStore(await env.ASSETS.fetch(request));
    }
    return app.fetch(request, env, ctx);
  }
};
