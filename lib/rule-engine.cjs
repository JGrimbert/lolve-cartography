/**
 * RuleEngine - Forward-chaining sur un ensemble de facts
 *
 * Applique des règles de déduction pour enrichir les facts avec des relations
 * de plus haut niveau : DEPENDS_ON, HAS_SKILL.
 * Transitivité bornée (depth=2) pour éviter l'explosion combinatoire.
 */

const { log } = require('./utils/logger.cjs');

// ─── Règles ───────────────────────────────────────────────────────────────────

const RULES = [
  // Relations directes → DEPENDS_ON
  { name: 'calls→depends',
    match: { relation: 'CALLS' },
    derive: ({ entity, target }) => ({ entity, relation: 'DEPENDS_ON', target }) },

  { name: 'imports→depends',
    match: { relation: 'IMPORTS' },
    derive: ({ entity, target }) => ({ entity, relation: 'DEPENDS_ON', target }) },

  { name: 'extends→depends',
    match: { relation: 'EXTENDS' },
    derive: ({ entity, target }) => ({ entity, relation: 'DEPENDS_ON', target }) },

  { name: 'creates→depends',
    match: { relation: 'CREATES' },
    derive: ({ entity, target }) => ({ entity, relation: 'DEPENDS_ON', target }) },

  // Rôles → Skills
  { name: 'role-entry→skill',
    match: { relation: 'HAS_ROLE', target: 'entry' },
    derive: ({ entity }) => ({ entity, relation: 'HAS_SKILL', target: 'entrypoint' }) },

  { name: 'role-core→skill',
    match: { relation: 'HAS_ROLE', target: 'core' },
    derive: ({ entity }) => ({ entity, relation: 'HAS_SKILL', target: 'domain' }) },

  { name: 'role-service→skill',
    match: { relation: 'HAS_ROLE', target: 'service' },
    derive: ({ entity }) => ({ entity, relation: 'HAS_SKILL', target: 'api' }) },

  { name: 'role-bridge→skill',
    match: { relation: 'HAS_ROLE', target: 'bridge' },
    derive: ({ entity }) => ({ entity, relation: 'HAS_SKILL', target: 'integration' }) },

  { name: 'role-adapter→skill',
    match: { relation: 'HAS_ROLE', target: 'adapter' },
    derive: ({ entity }) => ({ entity, relation: 'HAS_SKILL', target: 'integration' }) },

  { name: 'role-flow→skill',
    match: { relation: 'HAS_ROLE', target: 'flow' },
    derive: ({ entity }) => ({ entity, relation: 'HAS_SKILL', target: 'flow' }) },

  { name: 'role-helper→skill',
    match: { relation: 'HAS_ROLE', target: 'helper' },
    derive: ({ entity }) => ({ entity, relation: 'HAS_SKILL', target: 'utility' }) },

  { name: 'role-internal→skill',
    match: { relation: 'HAS_ROLE', target: 'internal' },
    derive: ({ entity }) => ({ entity, relation: 'HAS_SKILL', target: 'internal' }) },
];

// ─── Transitivité ─────────────────────────────────────────────────────────────

/**
 * Applique la transitivité sur DEPENDS_ON (profondeur max `depth`)
 * Si A → B et B → C alors A → C (inféré)
 */
function applyTransitivity(facts, depth = 2) {
  const added = [];
  const seen = new Set(facts.map(f => `${f.entity}|${f.relation}|${f.target}`));

  // Index entity → Set<target> pour les DEPENDS_ON directs
  const byEntity = {};
  for (const f of facts) {
    if (f.relation !== 'DEPENDS_ON') continue;
    if (!byEntity[f.entity]) byEntity[f.entity] = new Set();
    byEntity[f.entity].add(f.target);
  }

  // Itérations de profondeur
  let frontier = facts.filter(f => f.relation === 'DEPENDS_ON');

  for (let d = 0; d < depth; d++) {
    const nextFrontier = [];
    for (const f of frontier) {
      const targets = byEntity[f.target];
      if (!targets) continue;
      for (const t of targets) {
        if (f.entity === t) continue; // éviter les cycles triviaux
        const key = `${f.entity}|DEPENDS_ON|${t}`;
        if (!seen.has(key)) {
          const derived = { entity: f.entity, relation: 'DEPENDS_ON', target: t, inferred: true };
          seen.add(key);
          added.push(derived);
          nextFrontier.push(derived);
          if (!byEntity[f.entity]) byEntity[f.entity] = new Set();
          byEntity[f.entity].add(t);
        }
      }
    }
    if (nextFrontier.length === 0) break;
    frontier = nextFrontier;
  }

  return added;
}

// ─── RuleEngine ───────────────────────────────────────────────────────────────

class RuleEngine {
  /**
   * Applique toutes les règles sur les facts initiaux
   * @param {Array<{entity, relation, target}>} facts
   * @returns {Array<{entity, relation, target, inferred?}>} Facts enrichis
   */
  run(facts) {
    log('RuleEngine', `Running on ${facts.length} initial facts`);

    const result = [...facts];
    const seen = new Set(facts.map(f => `${f.entity}|${f.relation}|${f.target}`));

    // Forward-chaining sur les règles simples
    for (const rule of RULES) {
      for (const fact of facts) {
        let matches = true;
        for (const [k, v] of Object.entries(rule.match)) {
          if (fact[k] !== v) { matches = false; break; }
        }
        if (!matches) continue;

        const derived = rule.derive(fact);
        if (!derived) continue;

        const key = `${derived.entity}|${derived.relation}|${derived.target}`;
        if (!seen.has(key)) {
          seen.add(key);
          // Pas de flag inferred pour les dérivations simples (premier ordre)
          result.push({ ...derived });
        }
      }
    }

    // Transitivité bornée sur DEPENDS_ON (depth=2)
    const transitive = applyTransitivity(result, 2);
    result.push(...transitive);

    log('RuleEngine',
      `${result.length} facts after inference (+${result.length - facts.length} derived)`,
      'success');
    return result;
  }
}

module.exports = { RuleEngine };
