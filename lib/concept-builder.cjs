/**
 * ConceptBuilder - Regroupe les nœuds en "concepts" (une entité par fichier)
 *
 * Cohésion = proportion d'appels internes au fichier (CALLS vers nœuds
 * du même fichier) / total CALLS depuis les nœuds du groupe.
 */

// Repris de step-planner.cjs
function labelFromFile(filePath) {
  if (!filePath || filePath === '_misc') return '?';
  const p     = filePath.replace(/\\/g, '/');
  const parts = p.split('/');
  const basename = parts.pop() || p;
  if (basename.startsWith('+')) {
    const parent = parts.pop() || basename;
    return parent.replace(/\[|\]/g, '');
  }
  return basename.replace(/\.(ts|js|svelte|vue|cjs|mjs)$/, '');
}

class ConceptBuilder {
  /**
   * @param {Array<{entity,relation,target}>} facts
   * @param {{ nodes: string[], edges: [string,string][] }} dag
   * @returns {{ concepts: Object[], orphans: string[] }}
   */
  build(facts, dag) {
    // 1. Index node → file et node → skill
    const fileOf  = {};
    const skillOf = {};
    for (const f of facts) {
      if (f.relation === 'HAS_FILE')  fileOf[f.entity]  = f.target;
      if (f.relation === 'HAS_SKILL') skillOf[f.entity] = f.target;
    }

    // 2. Grouper dag.nodes par fichier
    const byFile  = {};
    const orphans = [];
    for (const node of dag.nodes) {
      const file = fileOf[node];
      if (!file) { orphans.push(node); continue; }
      const key = file.replace(/\\/g, '/');
      if (!byFile[key]) byFile[key] = [];
      byFile[key].push(node);
    }

    // 3. Index CALLS pour le calcul de cohésion
    const callsFrom = {};
    for (const f of facts) {
      if (f.relation === 'CALLS') {
        if (!callsFrom[f.entity]) callsFrom[f.entity] = [];
        callsFrom[f.entity].push(f.target);
      }
    }

    // 4. Construire les concepts
    const concepts = [];
    for (const [file, nodes] of Object.entries(byFile)) {
      const nodeSet = new Set(nodes);

      // Skill dominant
      const skillCount = {};
      for (const n of nodes) {
        const s = skillOf[n] || 'internal';
        skillCount[s] = (skillCount[s] || 0) + 1;
      }
      const skill = Object.entries(skillCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'internal';

      // Cohésion : CALLS internes / total CALLS
      let totalCalls    = 0;
      let internalCalls = 0;
      for (const n of nodes) {
        const callees = callsFrom[n] || [];
        totalCalls    += callees.length;
        internalCalls += callees.filter(c => nodeSet.has(c)).length;
      }
      const cohesion = totalCalls > 0 ? Math.round((internalCalls / totalCalls) * 100) / 100 : 0;

      // id = basename sans extension, lowercase, tirets
      const name = labelFromFile(file);
      const id   = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      concepts.push({
        id,
        name,
        skill,
        nodes: [...nodes].sort(),
        files: [file],
        cohesion,
      });
    }

    // Trier par nombre de nœuds décroissant
    concepts.sort((a, b) => b.nodes.length - a.nodes.length);

    return { concepts, orphans };
  }
}

module.exports = { ConceptBuilder };
