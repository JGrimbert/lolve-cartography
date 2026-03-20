/**
 * PipelineDetector - Détecte les chaînes d'appels linéaires (A→B→C→D)
 *
 * Une "pipeline" = chaîne où chaque nœud a exactement 1 caller et 1 callee
 * au sein de la chaîne (pas de branchements). Longueur min : 3.
 */

class PipelineDetector {
  /**
   * @param {Array<{entity,relation,target}>} facts
   * @returns {{ pipelines: Object[] }}
   */
  detect(facts) {
    // 1. Construire le call graph
    const callsBy  = {};  // caller  → [callees]
    const calledBy = {};  // callee  → [callers]
    const allNodes = new Set();

    for (const f of facts) {
      if (f.relation !== 'CALLS') continue;
      allNodes.add(f.entity);
      allNodes.add(f.target);
      if (!callsBy[f.entity])  callsBy[f.entity]  = [];
      if (!calledBy[f.target]) calledBy[f.target]  = [];
      callsBy[f.entity].push(f.target);
      calledBy[f.target].push(f.entity);
    }

    const pipelines = [];
    const inChain   = new Set(); // nœuds déjà affectés à une pipeline

    // 2. Pour chaque entrée (sans callers), suivre la chaîne
    for (const node of allNodes) {
      if ((calledBy[node] || []).length !== 0) continue; // pas une entrée
      if (inChain.has(node)) continue;

      const chain  = [node];
      let   current = node;

      while (true) {
        const callees = callsBy[current] || [];
        if (callees.length !== 1) break;
        const next = callees[0];
        if ((calledBy[next] || []).length !== 1) break; // plusieurs callers
        if (inChain.has(next)) break;
        chain.push(next);
        current = next;
      }

      if (chain.length >= 3) {
        for (const n of chain) inChain.add(n);
        pipelines.push({
          id:     `pipeline-${pipelines.length + 1}`,
          chain,
          length: chain.length,
          entry:  chain[0],
          exit:   chain[chain.length - 1],
        });
      }
    }

    return { pipelines };
  }
}

module.exports = { PipelineDetector };
