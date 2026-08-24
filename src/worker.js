import app from './index.js';
import { handleLearningDiagnosis } from './learning-diagnosis.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai/learning-diagnosis') {
      return handleLearningDiagnosis(request, env);
    }
    return app.fetch(request, env, ctx);
  }
};
