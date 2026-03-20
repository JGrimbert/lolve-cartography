/**
 * StepPlanner - Groupe les nœuds du DAG en étapes de développement
 *
 * Stratégie de groupement :
 *   - Si les nœuds ont des skills variés (domain, api, flow…) → grouper par skill
 *   - Si tout est "internal" (codebases sans annotations) → grouper par fichier
 *   - Subdivision si le groupe dépasse maxNodesPerStep
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

// ─── Inférence de skill depuis le chemin de fichier ───────────────────────────

function fileToSkill(filePath) {
  if (!filePath) return 'internal';
  const p = filePath.replace(/\\/g, '/');
  if (p.includes('/routes/api/'))          return 'api';
  if (p.includes('/routes/'))              return 'entrypoint';
  if (p.includes('/server/services/'))     return 'domain';
  if (p.includes('/server/agent/'))        return 'flow';
  if (p.includes('/stores/'))              return 'adapter';
  if (p.includes('/components/'))          return 'integration';
  if (p.includes('/utils/'))               return 'utility';
  if (p.includes('/lib/'))                 return 'utility';
  return 'internal';
}

// ─── Label depuis un chemin de fichier ────────────────────────────────────────

function labelFromFile(filePath) {
  if (!filePath || filePath === '_misc') return '?';
  const p = filePath.replace(/\\/g, '/');
  const parts = p.split('/');
  const basename = parts.pop() || p;
  // Pour les routes SvelteKit : préférer le dossier parent (ex: atlas/+server → atlas)
  if (basename.startsWith('+')) {
    const parent = parts.pop() || basename;
    return parent.replace(/\[|\]/g, '');
  }
  return basename.replace(/\.(ts|js|svelte|vue|cjs|mjs)$/, '');
}

// ─── StepPlanner ──────────────────────────────────────────────────────────────

class StepPlanner {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxNodesPerStep=8]
   */
  constructor(options = {}) {
    this.maxNodesPerStep = options.maxNodesPerStep || 8;
  }

  /**
   * @param {{ nodes, edges, order, levels, cycles }} dag
   * @param {Array<{entity, relation, target}>} facts
   * @returns {Object} Roadmap
   */
  plan(dag, facts) {
    log('StepPlanner', `Planning: ${dag.nodes.length} nodes, ${dag.levels.length} levels`);

    // Index entity → skill, entity → file
    const skillOf = {};
    const fileOf  = {};
    for (const f of facts) {
      if (f.relation === 'HAS_SKILL') skillOf[f.entity] = f.target;
      if (f.relation === 'HAS_FILE')  fileOf[f.entity]  = f.target;
    }

    const rawSteps = [];

    for (let li = 0; li < dag.levels.length; li++) {
      const level = dag.levels[li];

      // Décider la stratégie de groupement pour ce niveau
      const nonInternal = level.filter(n => skillOf[n] && skillOf[n] !== 'internal').length;
      const useFileGrouping = nonInternal < level.length * 0.25;

      if (useFileGrouping) {
        // ── Groupement par fichier ────────────────────────────────────────────
        const byFile = {};
        for (const node of level) {
          const file = (fileOf[node] || '_misc').replace(/\\/g, '/');
          if (!byFile[file]) byFile[file] = [];
          byFile[file].push(node);
        }
        for (const [file, nodes] of Object.entries(byFile)) {
          const derivedSkill = fileToSkill(file);
          for (let i = 0; i < nodes.length; i += this.maxNodesPerStep) {
            rawSteps.push({
              groupKey:  file,
              skill:     derivedSkill,
              isFile:    true,
              nodes:     nodes.slice(i, i + this.maxNodesPerStep),
              levelIdx:  li,
            });
          }
        }
      } else {
        // ── Groupement par skill, sub-divisé par fichier ──────────────────────
        const bySkill = {};
        for (const node of level) {
          const skill = skillOf[node] || 'internal';
          if (!bySkill[skill]) bySkill[skill] = [];
          bySkill[skill].push(node);
        }
        for (const [skill, nodes] of Object.entries(bySkill)) {
          // Sous-grouper par fichier pour des labels plus parlants
          const byFile = {};
          for (const node of nodes) {
            const file = (fileOf[node] || '_misc').replace(/\\/g, '/');
            if (!byFile[file]) byFile[file] = [];
            byFile[file].push(node);
          }
          for (const [file, fileNodes] of Object.entries(byFile)) {
            // Préférer le skill dérivé du chemin de fichier pour les labels
            const fileSkill = file !== '_misc' ? fileToSkill(file) : skill;
            for (let i = 0; i < fileNodes.length; i += this.maxNodesPerStep) {
              rawSteps.push({
                groupKey:  file,
                skill:     fileSkill,
                isFile:    true,
                nodes:     fileNodes.slice(i, i + this.maxNodesPerStep),
                levelIdx:  li,
              });
            }
          }
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
    const nodeToStep = {};
    rawSteps.forEach((raw, idx) => {
      for (const node of raw.nodes) nodeToStep[node] = idx + 1;
    });

    return rawSteps.map((raw, idx) => {
      const id    = idx + 1;
      const skill = raw.skill;

      const depSteps = new Set();
      for (const node of raw.nodes) {
        for (const [from, to] of dag.edges) {
          if (from === node) {
            const s = nodeToStep[to];
            if (s && s !== id) depSteps.add(s);
          }
        }
      }

      const canParallelWith = [];
      rawSteps.forEach((other, oi) => {
        const oid = oi + 1;
        if (oid === id || other.levelIdx !== raw.levelIdx) return;
        if (!depSteps.has(oid)) canParallelWith.push(oid);
      });

      const files = [...new Set(
        raw.nodes.map(n => fileOf[n]).filter(Boolean)
      )];

      return {
        id,
        label:          this._makeLabel(raw),
        skill,
        nodes:          [...raw.nodes].sort(),
        files,
        rationale:      this._makeRationale(raw.levelIdx, depSteps.size),
        dependsOnSteps: [...depSteps].sort((a, b) => a - b),
        canParallelWith,
      };
    });
  }

  _makeLabel(raw) {
    const { groupKey, isFile, skill, nodes, levelIdx } = raw;

    if (isFile) {
      const name  = labelFromFile(groupKey);
      const label = SKILL_LABELS[skill] || skill;
      return `${label}: ${name}`;
    }

    // Groupement par skill
    const label = SKILL_LABELS[groupKey] || groupKey;
    const classes = [...new Set(nodes.map(n => n.split('.')[0]))];
    if (nodes.length === 1)   return `${label}: ${nodes[0]}`;
    if (classes.length === 1) return `${label}: ${classes[0]}`;
    return `${label}: Level ${levelIdx + 1} (${nodes.length})`;
  }

  _makeRationale(levelIdx, depCount) {
    if (levelIdx === 0) return 'Foundational — no dependencies';
    if (depCount === 0) return `Level ${levelIdx + 1} — independent`;
    return `Depends on ${depCount} prior step${depCount > 1 ? 's' : ''}`;
  }
}

module.exports = { StepPlanner };
