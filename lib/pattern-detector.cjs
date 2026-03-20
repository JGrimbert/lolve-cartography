/**
 * PatternDetector - Heuristiques légères pour identifier Factory, Repository, Adapter
 *
 * | Pattern    | Signal                                              | Seuil         |
 * |------------|-----------------------------------------------------|---------------|
 * | Factory    | Nœud avec ≥ 2 CREATES distincts                    | conf ∝ nb     |
 * | Repository | Nœud avec READS + WRITES vers ≥ 3 targets distincts | conf ∝ nb     |
 * | Adapter    | Nœud avec CALLS vers ≥ 2 skills distincts           | conf ∝ skills |
 */

class PatternDetector {
  /**
   * @param {Array<{entity,relation,target}>} facts
   * @returns {{ factories: Object[], repositories: Object[], adapters: Object[] }}
   */
  detect(facts) {
    const factories    = [];
    const repositories = [];
    const adapters     = [];

    // Index skill de chaque nœud
    const skillOf = {};
    for (const f of facts) {
      if (f.relation === 'HAS_SKILL') skillOf[f.entity] = f.target;
    }

    // ── Factory : ≥ 2 CREATES distincts ──────────────────────────────────────
    const createsMap = {};
    for (const f of facts) {
      if (f.relation === 'CREATES') {
        if (!createsMap[f.entity]) createsMap[f.entity] = new Set();
        createsMap[f.entity].add(f.target);
      }
    }
    for (const [name, targets] of Object.entries(createsMap)) {
      if (targets.size >= 2) {
        factories.push({
          name,
          creates:    [...targets],
          confidence: Math.min(1, targets.size / 5),
        });
      }
    }

    // ── Repository : READS + WRITES vers ≥ 3 targets distincts ───────────────
    const readsSet  = new Set();
    const writesSet = new Set();
    const rwTargets = {};
    for (const f of facts) {
      if (f.relation === 'READS') {
        readsSet.add(f.entity);
        if (!rwTargets[f.entity]) rwTargets[f.entity] = new Set();
        rwTargets[f.entity].add(f.target);
      }
      if (f.relation === 'WRITES') {
        writesSet.add(f.entity);
        if (!rwTargets[f.entity]) rwTargets[f.entity] = new Set();
        rwTargets[f.entity].add(f.target);
      }
    }
    for (const [name, targets] of Object.entries(rwTargets)) {
      if (readsSet.has(name) && writesSet.has(name) && targets.size >= 3) {
        repositories.push({
          name,
          targets:    [...targets],
          confidence: Math.min(1, targets.size / 10),
        });
      }
    }

    // ── Adapter : CALLS vers ≥ 2 skills distincts ────────────────────────────
    const callSkillsMap = {};
    for (const f of facts) {
      if (f.relation === 'CALLS') {
        const skill = skillOf[f.target];
        if (skill) {
          if (!callSkillsMap[f.entity]) callSkillsMap[f.entity] = new Set();
          callSkillsMap[f.entity].add(skill);
        }
      }
    }
    for (const [name, skills] of Object.entries(callSkillsMap)) {
      if (skills.size >= 2) {
        const [fromSkill, toSkill] = [...skills];
        adapters.push({
          name,
          fromSkill,
          toSkill,
          confidence: Math.min(1, skills.size / 4),
        });
      }
    }

    return { factories, repositories, adapters };
  }
}

module.exports = { PatternDetector };
