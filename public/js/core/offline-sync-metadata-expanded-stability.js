(function offlineSyncMetadataExpandedStabilityFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataExpandedStability) return;

  const MODE = 'metadata-expanded-stability-v1';
  const REQUIRED_CLEAN_SUCCESSES = 5;

  let installed = false;
  let lastEvaluation = null;

  function nowIso() { return new Date().toISOString(); }

  function currentUserId() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser?.id) return String(currentUser.id);
    } catch (_) {}
    try { return global.currentUser?.id ? String(global.currentUser.id) : null; }
    catch (_) { return null; }
  }

  function stability() { return global.OfflineSyncMetadataStability || null; }
  function rollout() { return global.OfflineSyncMetadataRollout || null; }

  function getReport(userId = currentUserId()) {
    const cohort = rollout()?.getCohortAssignment?.(userId) || null;
    const baseReport = stability()?.getReport?.(userId) || null;
    const history = stability()?.readHistory?.(userId) || baseReport?.history || Object.freeze([]);
    const successes = [...history].filter(row => row?.outcome === 'success').length;
    const failures = [...history].filter(row => row?.outcome === 'failure').length;
    const aborted = [...history].filter(row => row?.outcome === 'aborted').length;
    const reasons = [];

    if (!userId) reasons.push('missing-user');
    if (cohort?.tier !== 'expanded-base') reasons.push('outside-expanded-base-tier');
    if (successes < REQUIRED_CLEAN_SUCCESSES) reasons.push('insufficient-clean-expanded-canaries');
    if (failures > 0) reasons.push('recent-expanded-canary-failure');
    if (aborted > 0) reasons.push('recent-expanded-canary-abort');
    if (!baseReport?.parity?.eligible) reasons.push('metadata-parity-not-eligible');

    const ready = reasons.length === 0;
    return Object.freeze({
      mode:MODE,
      userId:userId || null,
      cohort,
      tier:cohort?.tier || 'excluded',
      window:Number(baseReport?.window || stability()?.WINDOW_SIZE || 10),
      requiredCleanSuccesses:REQUIRED_CLEAN_SUCCESSES,
      sampleCount:history.length,
      successes,
      failures,
      aborted,
      stable:ready,
      readyForPilotReview:ready,
      reasons:Object.freeze(reasons),
      baseStability:baseReport,
      history:Object.freeze([...history])
    });
  }

  function evaluate(detail = null) {
    const userId = currentUserId();
    const report = getReport(userId);
    lastEvaluation = Object.freeze({
      mode:MODE,
      evaluatedAt:nowIso(),
      userId:userId || null,
      tier:report.tier,
      readyForPilotReview:report.readyForPilotReview,
      reasons:report.reasons,
      sourceDetail:detail || null
    });
    try {
      global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-expanded-stability:evaluated', { detail:lastEvaluation }));
    } catch (_) {}
    return report;
  }

  function getDiagnostics() {
    return Object.freeze({
      mode:MODE,
      installed,
      userId:currentUserId(),
      report:getReport(),
      lastEvaluation,
      remoteAuthority:false,
      scope:Object.freeze(['local-diagnostic:expanded-base:concursos_metadata'])
    });
  }

  function onStabilityObserved(event) {
    const cohort = rollout()?.getCohortAssignment?.() || null;
    if (cohort?.tier !== 'expanded-base') return;
    evaluate(event?.detail || null);
  }

  function install() {
    if (installed) return true;
    if (!stability() || !rollout()) return false;
    global.addEventListener?.('offline-sync-metadata-stability:observed', onStabilityObserved);
    installed = true;
    return true;
  }

  global.OfflineSyncMetadataExpandedStability = Object.freeze({
    MODE,
    REQUIRED_CLEAN_SUCCESSES,
    install,
    evaluate,
    getReport,
    getDiagnostics
  });
})(window);
