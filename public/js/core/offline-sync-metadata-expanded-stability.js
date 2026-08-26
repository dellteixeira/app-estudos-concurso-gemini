(function offlineSyncMetadataExpandedStabilityFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataExpandedStability) return;

  const MODE = 'metadata-expanded-stability-v1';
  const POPULATION_MODE = 'metadata-population-expanded-stability-v1';
  const RING2_MODE = 'metadata-population-ring2-stability-v1';
  const RING3_MODE = 'metadata-population-ring3-stability-v1';
  const REQUIRED_CLEAN_SUCCESSES = 5;

  let installed = false;
  let lastEvaluation = null;
  let lastPopulationEvaluation = null;
  let lastRing2Evaluation = null;
  let lastRing3Evaluation = null;

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

  function readEvidence(userId) {
    const baseReport = stability()?.getReport?.(userId) || null;
    const history = stability()?.readHistory?.(userId) || baseReport?.history || Object.freeze([]);
    const rows = [...history];
    return Object.freeze({
      baseReport,
      history:Object.freeze(rows),
      successes:rows.filter(row => row?.outcome === 'success').length,
      failures:rows.filter(row => row?.outcome === 'failure').length,
      aborted:rows.filter(row => row?.outcome === 'aborted').length
    });
  }

  function getReport(userId = currentUserId()) {
    const cohort = rollout()?.getCohortAssignment?.(userId) || null;
    const evidence = readEvidence(userId);
    const reasons = [];

    if (!userId) reasons.push('missing-user');
    if (cohort?.tier !== 'expanded-base') reasons.push('outside-expanded-base-tier');
    if (evidence.successes < REQUIRED_CLEAN_SUCCESSES) reasons.push('insufficient-clean-expanded-canaries');
    if (evidence.failures > 0) reasons.push('recent-expanded-canary-failure');
    if (evidence.aborted > 0) reasons.push('recent-expanded-canary-abort');
    if (!evidence.baseReport?.parity?.eligible) reasons.push('metadata-parity-not-eligible');

    const ready = reasons.length === 0;
    return Object.freeze({
      mode:MODE,
      userId:userId || null,
      cohort,
      tier:cohort?.tier || 'excluded',
      window:Number(evidence.baseReport?.window || stability()?.WINDOW_SIZE || 10),
      requiredCleanSuccesses:REQUIRED_CLEAN_SUCCESSES,
      sampleCount:evidence.history.length,
      successes:evidence.successes,
      failures:evidence.failures,
      aborted:evidence.aborted,
      stable:ready,
      readyForPilotReview:ready,
      reasons:Object.freeze(reasons),
      baseStability:evidence.baseReport,
      history:evidence.history
    });
  }

  function getPopulationReport(userId = currentUserId()) {
    const cohort = rollout()?.getCohortAssignment?.(userId) || null;
    const evidence = readEvidence(userId);
    const reasons = [];

    if (!userId) reasons.push('missing-user');
    if (cohort?.tier !== 'population-expanded-base') reasons.push('outside-population-expanded-base-tier');
    if (evidence.successes < REQUIRED_CLEAN_SUCCESSES) reasons.push('insufficient-clean-population-canaries');
    if (evidence.failures > 0) reasons.push('recent-population-canary-failure');
    if (evidence.aborted > 0) reasons.push('recent-population-canary-abort');
    if (!evidence.baseReport?.parity?.eligible) reasons.push('metadata-parity-not-eligible');

    const ready = reasons.length === 0;
    return Object.freeze({
      mode:POPULATION_MODE,
      userId:userId || null,
      cohort,
      tier:cohort?.tier || 'excluded',
      window:Number(evidence.baseReport?.window || stability()?.WINDOW_SIZE || 10),
      requiredCleanSuccesses:REQUIRED_CLEAN_SUCCESSES,
      sampleCount:evidence.history.length,
      successes:evidence.successes,
      failures:evidence.failures,
      aborted:evidence.aborted,
      stable:ready,
      readyForDepthReview:ready,
      reasons:Object.freeze(reasons),
      baseStability:evidence.baseReport,
      history:evidence.history,
      remoteWriteBudget:1,
      populationPercent:Number(cohort?.percent || 35)
    });
  }

  function getRing2Report(userId = currentUserId()) {
    const cohort = rollout()?.getCohortAssignment?.(userId) || null;
    const evidence = readEvidence(userId);
    const reasons = [];

    if (!userId) reasons.push('missing-user');
    if (cohort?.tier !== 'population-expanded-ring-2') reasons.push('outside-population-expanded-ring-2-tier');
    if (evidence.successes < REQUIRED_CLEAN_SUCCESSES) reasons.push('insufficient-clean-ring2-canaries');
    if (evidence.failures > 0) reasons.push('recent-ring2-canary-failure');
    if (evidence.aborted > 0) reasons.push('recent-ring2-canary-abort');
    if (!evidence.baseReport?.parity?.eligible) reasons.push('metadata-parity-not-eligible');

    const ready = reasons.length === 0;
    return Object.freeze({
      mode:RING2_MODE,
      userId:userId || null,
      cohort,
      tier:cohort?.tier || 'excluded',
      window:Number(evidence.baseReport?.window || stability()?.WINDOW_SIZE || 10),
      requiredCleanSuccesses:REQUIRED_CLEAN_SUCCESSES,
      sampleCount:evidence.history.length,
      successes:evidence.successes,
      failures:evidence.failures,
      aborted:evidence.aborted,
      stable:ready,
      readyForDepthReview:ready,
      reasons:Object.freeze(reasons),
      baseStability:evidence.baseReport,
      history:evidence.history,
      remoteWriteBudget:1,
      populationPercent:Number(cohort?.ring2Percent || 45)
    });
  }

  function getRing3Report(userId = currentUserId()) {
    const cohort = rollout()?.getCohortAssignment?.(userId) || null;
    const evidence = readEvidence(userId);
    const reasons = [];

    if (!userId) reasons.push('missing-user');
    if (cohort?.tier !== 'population-expanded-ring-3') reasons.push('outside-population-expanded-ring-3-tier');
    if (evidence.successes < REQUIRED_CLEAN_SUCCESSES) reasons.push('insufficient-clean-ring3-canaries');
    if (evidence.failures > 0) reasons.push('recent-ring3-canary-failure');
    if (evidence.aborted > 0) reasons.push('recent-ring3-canary-abort');
    if (!evidence.baseReport?.parity?.eligible) reasons.push('metadata-parity-not-eligible');

    const ready = reasons.length === 0;
    return Object.freeze({
      mode:RING3_MODE,
      userId:userId || null,
      cohort,
      tier:cohort?.tier || 'excluded',
      window:Number(evidence.baseReport?.window || stability()?.WINDOW_SIZE || 10),
      requiredCleanSuccesses:REQUIRED_CLEAN_SUCCESSES,
      sampleCount:evidence.history.length,
      successes:evidence.successes,
      failures:evidence.failures,
      aborted:evidence.aborted,
      stable:ready,
      readyForDepthReview:ready,
      reasons:Object.freeze(reasons),
      baseStability:evidence.baseReport,
      history:evidence.history,
      remoteWriteBudget:1,
      populationPercent:Number(cohort?.percent || 55)
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

  function evaluatePopulation(detail = null) {
    const userId = currentUserId();
    const report = getPopulationReport(userId);
    lastPopulationEvaluation = Object.freeze({
      mode:POPULATION_MODE,
      evaluatedAt:nowIso(),
      userId:userId || null,
      tier:report.tier,
      readyForDepthReview:report.readyForDepthReview,
      reasons:report.reasons,
      sourceDetail:detail || null
    });
    try {
      global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-population-stability:evaluated', { detail:lastPopulationEvaluation }));
    } catch (_) {}
    return report;
  }

  function evaluateRing2(detail = null) {
    const userId = currentUserId();
    const report = getRing2Report(userId);
    lastRing2Evaluation = Object.freeze({
      mode:RING2_MODE,
      evaluatedAt:nowIso(),
      userId:userId || null,
      tier:report.tier,
      readyForDepthReview:report.readyForDepthReview,
      reasons:report.reasons,
      sourceDetail:detail || null
    });
    try {
      global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-ring2-stability:evaluated', { detail:lastRing2Evaluation }));
    } catch (_) {}
    return report;
  }

  function evaluateRing3(detail = null) {
    const userId = currentUserId();
    const report = getRing3Report(userId);
    lastRing3Evaluation = Object.freeze({
      mode:RING3_MODE,
      evaluatedAt:nowIso(),
      userId:userId || null,
      tier:report.tier,
      readyForDepthReview:report.readyForDepthReview,
      reasons:report.reasons,
      sourceDetail:detail || null
    });
    try {
      global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-ring3-stability:evaluated', { detail:lastRing3Evaluation }));
    } catch (_) {}
    return report;
  }

  function getDiagnostics() {
    return Object.freeze({
      mode:MODE,
      populationMode:POPULATION_MODE,
      ring2Mode:RING2_MODE,
      ring3Mode:RING3_MODE,
      installed,
      userId:currentUserId(),
      report:getReport(),
      populationReport:getPopulationReport(),
      ring2Report:getRing2Report(),
      ring3Report:getRing3Report(),
      lastEvaluation,
      lastPopulationEvaluation,
      lastRing2Evaluation,
      lastRing3Evaluation,
      remoteAuthority:false,
      scope:Object.freeze([
        'local-diagnostic:expanded-base:concursos_metadata',
        'local-diagnostic:population-expanded-base:concursos_metadata',
        'local-diagnostic:population-expanded-ring-2:concursos_metadata',
        'local-diagnostic:population-expanded-ring-3:concursos_metadata'
      ])
    });
  }

  function onStabilityObserved(event) {
    const cohort = rollout()?.getCohortAssignment?.() || null;
    if (cohort?.tier === 'expanded-base') {
      evaluate(event?.detail || null);
      return;
    }
    if (cohort?.tier === 'population-expanded-base') {
      evaluatePopulation(event?.detail || null);
      return;
    }
    if (cohort?.tier === 'population-expanded-ring-2') {
      evaluateRing2(event?.detail || null);
      return;
    }
    if (cohort?.tier === 'population-expanded-ring-3') evaluateRing3(event?.detail || null);
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
    POPULATION_MODE,
    RING2_MODE,
    RING3_MODE,
    REQUIRED_CLEAN_SUCCESSES,
    install,
    evaluate,
    evaluatePopulation,
    evaluateRing2,
    evaluateRing3,
    getReport,
    getPopulationReport,
    getRing2Report,
    getRing3Report,
    getDiagnostics
  });
})(window);
