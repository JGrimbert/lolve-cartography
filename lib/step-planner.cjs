/**
 * StepPlanner - Groupe les nœuds du DAG en étapes de développement
 *
 * Stratégie :
 *   1. Même niveau topologique  → groupe candidat
 *   2. Même skill (HAS_SKILL)   → affinité
 *   3. Seuil max par step       → subdivision si nécessaire
 */

const { log } = require('./utils/logger.cjs');

const SKILL_LABELS = {
  domain:      'Core',
  entrypoint:  'Entry',
  api:         'Service',
  integration: 'Integration',
  flow:        'Flow',
  utility:     'Utility',
  internal:    'Internal',
};

class StepPlanner {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxNodesPerStep=5]
   */
  constructor(options = {}) {
    this.maxNodesPerStep = options.maxNodesPerStep || 5;
  }

  /**
   * @param {{ nodes, edges, order, levels, cycles }} dag
   * @param {Array<{entity, relation, target}>} facts
   * @returns {Object} Roadmap
   */
  plan(dag, facts) {
    log('StepPlanner', `Planning: ${dag.nodes.length} nodes, ${dag.levels.length} levels`);

    // Index entity → skill
    const skillOf = {};
    // Index entity → file
    const fileOf = {};

    for (const f of facts) {
      if (f.relation === 'HAS_SKILL') skillOf[f.entity] = f.target;
      if (f.relation === 'HAS_FILE')  fileOf[f.entity]  = f.target;
    }

    // Construire les groupes bruts (niveau × skill)
    const rawSteps = [];

    for (let li = 0; li < dag.levels.length; li++) {
      const level = dag.levels[li];

      // Grouper par skill
      const bySkill = {};
      for (const node of level) {
        const skill = skillOf[node] || 'internal';
        if (!bySkill[skill]) bySkill[skill] = [];
        bySkill[skill].push(node);
      }

      // Subdiviser les groupes trop grands
      for (const [skill, nodes] of Object.entries(bySkill)) {
        for (let i = 0; i < nodes.length; i += this.maxNodesPerStep) {
          rawSteps.push({
            skill,
            nodes: nodes.slice(i, i + this.maxNodesPerStep),
            levelIdx: li,
          });
        }
      }
    }

    const steps = this._buildSteps(rawSteps, dag, fileOf);

    log('StepPlanner', `${steps.length} steps`, 'success');

    return {
      generated: new Date().toISOString(),
      stats: {
        nodes:  dag.nodes.length,
        edges:  dag.edges.length,
        levels: dag.levels.length,
        steps:  steps.length,
        cycles: dag.cycles.length,
      },
      steps,
    };
  }

  // ─── Construction des Steps finaux ─────────────────────────────────────────

  _buildSteps(rawSteps, dag, fileOf) {
    // Map node → stepId
    const nodeToStep = {};
    rawSteps.forEach((raw, idx) => {
      for (const node of raw.nodes) nodeToStep[node] = idx + 1;
    });

    return rawSteps.map((raw, idx) => {
      const id    = idx + 1;
      const skill = raw.skill;

      // Dépendances : steps dont dépendent les nœuds de cette étape
      const depSteps = new Set();
      for (const node of raw.nodes) {
        for (const [from, to] of dag.edges) {
          if (from === node) {
            const s = nodeToStep[to];
            if (s && s !== id) depSteps.add(s);
          }
        }
      }

      // Steps parallélisables (même niveau, pas de dépendance mutuelle)
      const canParallelWith = [];
      rawSteps.forEach((other, oi) => {
        const oid = oi + 1;
        if (oid === id || other.levelIdx !== raw.levelIdx) return;
        if (!depSteps.has(oid)) canParallelWith.push(oid);
      });

      // Fichiers associés (dédupliqués)
      const files = [...new Set(
        raw.nodes.map(n => fileOf[n]).filter(Boolean)
      )];

      return {
        id,
        label:          this._makeLabel(skill, raw.nodes, raw.levelIdx),
        skill,
        nodes:          [...raw.nodes].sort(),
        files,
        rationale:      this._makeRationale(raw.levelIdx, depSteps.size),
        dependsOnSteps: [...depSteps].sort((a, b) => a - b),
        canParallelWith,
      };
    });
  }

  _makeLabel(skill, nodes, levelIdx) {
    const label = SKILL_LABELS[skill] || skill;
    const classes = [...new Set(nodes.map(n => n.split('.')[0]))];
    if (nodes.length === 1) return `${label}: ${nodes[0]}`;
    if (classes.length === 1) return `${label}: ${classes[0]}`;
    return `${label}: Level ${levelIdx + 1} (${nodes.length} nodes)`;
  }

  _makeRationale(levelIdx, depCount) {
    if (levelIdx === 0) return 'Foundational — no dependencies';
    if (depCount === 0) return `Level ${levelIdx + 1} — independent from prior steps`;
    return `Depends on ${depCount} prior step${depCount > 1 ? 's' : ''}`;
  }
}

module.exports = { StepPlanner };
