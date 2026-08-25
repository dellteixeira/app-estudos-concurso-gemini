(() => {
  'use strict';

  const METHOD_RANK = { automatico: 0, teoria: 1, videoaula: 1, teoria_videoaula: 2 };

  function normalizePart(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('pt-BR');
  }

  function topicKey(item) {
    return [
      normalizePart(item?.concurso || 'Concurso Geral'),
      normalizePart(item?.materia || ''),
      normalizePart(item?.assunto || '')
    ].join('\u241f');
  }

  function hasSameTopic(a, b) {
    return topicKey(a) === topicKey(b);
  }

  function findDuplicate(items, candidate, options = {}) {
    const ignoreId = options.ignoreId == null ? null : String(options.ignoreId);
    const key = topicKey(candidate);
    return (Array.isArray(items) ? items : []).find(item => {
      if (ignoreId != null && String(item?.id) === ignoreId) return false;
      return topicKey(item) === key;
    }) || null;
  }

  function chooseMethod(a, b, merged) {
    const am = String(a?.metodo_conteudo || 'automatico');
    const bm = String(b?.metodo_conteudo || 'automatico');
    if (merged.teoria && merged.videoaula) return 'teoria_videoaula';
    if ((METHOD_RANK[bm] ?? 0) > (METHOD_RANK[am] ?? 0)) return bm;
    return am;
  }

  function mergePair(keeper, duplicate) {
    const merged = { ...keeper };
    merged.prioridade = Math.min(Number(keeper?.prioridade) || 1, Number(duplicate?.prioridade) || 1);
    merged.assunto_prioridade = Math.min(Number(keeper?.assunto_prioridade) || 1, Number(duplicate?.assunto_prioridade) || 1);
    merged.peso = Math.max(Number(keeper?.peso) || 0, Number(duplicate?.peso) || 0) || keeper?.peso || duplicate?.peso;
    for (const field of ['teoria', 'questoes', 'videoaula', 'rev_24h', 'rev_7d', 'rev_30d']) {
      merged[field] = !!keeper?.[field] || !!duplicate?.[field];
    }
    merged.metodo_conteudo = chooseMethod(keeper, duplicate, merged);
    merged.concurso = String(keeper?.concurso || duplicate?.concurso || 'Concurso Geral').trim() || 'Concurso Geral';
    merged.materia = String(keeper?.materia || duplicate?.materia || 'Geral').trim() || 'Geral';
    merged.assunto = String(keeper?.assunto || duplicate?.assunto || 'Tópico').trim() || 'Tópico';
    return merged;
  }

  function dedupe(items) {
    const source = Array.isArray(items) ? items : [];
    const output = [];
    const indexByKey = new Map();
    const removedIds = [];
    let changed = false;

    source.forEach(raw => {
      const item = { ...raw };
      const key = topicKey(item);
      if (!indexByKey.has(key)) {
        indexByKey.set(key, output.length);
        output.push(item);
        return;
      }
      const index = indexByKey.get(key);
      const keeper = output[index];
      output[index] = mergePair(keeper, item);
      if (item?.id != null && String(item.id) !== String(keeper?.id)) removedIds.push(String(item.id));
      changed = true;
    });

    return { items: output, removedIds: [...new Set(removedIds)], changed };
  }

  window.EditalIntegrity = Object.freeze({ normalizePart, topicKey, hasSameTopic, findDuplicate, mergePair, dedupe });
})();
