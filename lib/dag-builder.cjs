/**
 * DAGBuilder - Construction d'un DAG depuis les facts DEPENDS_ON
 *
 * Algorithme de Kahn pour le tri topologique par niveaux.
 * Les cycles sont détectés et signalés (avertissement, ne bloquent pas).
 */

const { log } = require('./utils/logger.cjs');

class DAGBuilder {
  /**
   * Construit le DAG depuis les facts enrichis
   * @param {Array<{entity, relation, target, inferred?}>} facts
   * @returns {{ nodes: string[], edges: [string,string][], order: string[], levels: string[][], cycles: string[][] }}
   */
  build(facts) {
    log('DAGBuilder', 'Building DAG...');

    // Seules les dépendances directes (non inférées) pour le tri
    const directDeps = facts.filter(f => f.relation === 'DEPENDS_ON' && !f.inferred);

    // Collecter tous les nœuds
    const nodeSet = new Set();
    for (const f of facts) {
      if (f.entity) nodeSet.add(f.entity);
    }
    for (const f of directDeps) {
      nodeSet.add(f.entity);
      nodeSet.add(f.target);
    }

    const nodes = [...nodeSet].sort();
    const edges = directDeps.map(f => [f.entity, f.target]);

    // Adjacence : adj[to] = Set(from) — "to doit être fait avant from"
    // In-degree : inDeg[from] = nb de dépendances directes
    const adj = {};
    const inDeg = {};

    for (const n of nodes) {
      adj[n] = new Set();
      inDeg[n] = 0;
    }

    for (const [from, to] of edges) {
      // from DEPENDS_ON to → to avant from
      if (!adj[to]) { adj[to] = new Set(); inDeg[to] = inDeg[to] || 0; }
      adj[to].add(from);
      inDeg[from] = (inDeg[from] || 0) + 1;
    }

    const { order, levels, cycles } = this._kahn(nodes, adj, inDeg);

    const status = cycles.length
      ? `${cycles.length} cycle(s) detected ⚠`
      : 'acyclic';

    log('DAGBuilder',
      `${nodes.length} nodes · ${edges.length} edges · ${levels.length} levels · ${status}`,
      cycles.length ? 'warn' : 'success');

    if (cycles.length > 0) {
      for (const cycle of cycles) {
        log('DAGBuilder', `Cycle: ${cycle.join(' → ')}`, 'warn');
      }
    }

    return { nodes, edges, order, levels, cycles };
  }

  // ─── Algorithme de Kahn ───────────────────────────────────────────────────

  _kahn(nodes, adj, inDeg) {
    const order = [];
    const levels = [];
    const remaining = new Set(nodes);

    // Copie locale du degré pour ne pas muter l'original
    const deg = {};
    for (const n of nodes) deg[n] = inDeg[n] || 0;

    while (remaining.size > 0) {
      // Nœuds sans dépendances dans le set restant
      const level = [...remaining].filter(n => deg[n] === 0).sort();

      if (level.length === 0) break; // cycle détecté

      levels.push(level);
      order.push(...level);

      for (const n of level) {
        remaining.delete(n);
        for (const succ of (adj[n] || [])) {
          if (remaining.has(succ)) deg[succ]--;
        }
      }
    }

    // Nœuds restants = dans des cycles
    const cycles = [];
    if (remaining.size > 0) {
      const cycleNodes = [...remaining].sort();
      order.push(...cycleNodes);
      // On signale l'ensemble comme un cycle (simplification)
      cycles.push(cycleNodes);
    }

    return { order, levels, cycles };
  }
}

module.exports = { DAGBuilder };
