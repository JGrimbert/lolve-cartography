/**
 * SpineExtractor - Chemin critique du DAG (longest-path DP)
 *
 * Trouve la séquence de nœuds la plus longue qu'on ne peut pas
 * paralléliser : chaque nœud dépend du précédent.
 *
 * Algo : DP O(V+E) sur le DAG trié topologiquement.
 */

class SpineExtractor {
  /**
   * @param {{ nodes: string[], edges: [string,string][], order: string[] }} dag
   *   edges = [[from, to]] où "from DEPENDS_ON to"
   *   order = fondational → dérivé
   * @returns {{ spine: string[], length: number, bottlenecks: string[] }}
   */
  extract(dag) {
    const { nodes, edges, order } = dag;

    // deps[n] = liste des nœuds dont n dépend directement
    const deps = {};
    for (const n of nodes) deps[n] = [];
    for (const [from, to] of edges) {
      if (!deps[from]) deps[from] = [];
      deps[from].push(to);
    }

    // DP : dp[n] = longueur du plus long chemin finissant en n
    const dp   = {};
    const prev = {};

    for (const n of order) {
      const nodeDeps = deps[n] || [];
      if (nodeDeps.length === 0) {
        dp[n]   = 1;
        prev[n] = null;
      } else {
        let best    = 0;
        let bestDep = null;
        for (const dep of nodeDeps) {
          const val = dp[dep] ?? 0;
          if (val > best) { best = val; bestDep = dep; }
        }
        dp[n]   = 1 + best;
        prev[n] = bestDep;
      }
    }

    // Nœud avec dp maximal = extrémité dérivée du spine
    let maxDp   = 0;
    let endNode = null;
    for (const n of nodes) {
      if ((dp[n] ?? 0) > maxDp) { maxDp = dp[n]; endNode = n; }
    }

    // Reconstruction : dérivé → fondational, puis inversion
    const spine = [];
    let cur = endNode;
    while (cur) {
      spine.push(cur);
      cur = prev[cur];
    }
    spine.reverse(); // fondational → dérivé

    // Bottlenecks : nœuds dont in-degree > 1 (beaucoup de dépendants)
    const inDeg = {};
    for (const n of nodes) inDeg[n] = 0;
    for (const [, to] of edges) inDeg[to] = (inDeg[to] || 0) + 1;

    const bottlenecks = nodes
      .filter(n => inDeg[n] > 1)
      .sort((a, b) => inDeg[b] - inDeg[a]);

    return { spine, length: spine.length, bottlenecks };
  }
}

module.exports = { SpineExtractor };
