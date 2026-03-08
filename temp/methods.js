/**
 * FICHIER TEMPORAIRE - Méthodes extraites pour modification
 *
 * Généré le: 2026-01-17T12:00:10.098Z
 * Méthodes: SearchSession.getAtLevel, ExperienceMemory.updatePatterns, ExperienceMemory.getStats, FingerprintGenerator.getPatternSignature, ContextAgent.findRelevantMethods
 *
 * INSTRUCTIONS:
 * - Modifiez les méthodes ci-dessous
 * - Ne changez PAS les noms de méthodes
 * - La réinjection est AUTOMATIQUE (watcher MCP)
 */

// ============================================
// Classe: SearchSession
// ============================================

// Méthode: SearchSession.getAtLevel
// Fichier: lib\context\search-session.cjs:429
// Score: 6
  // ==========================================================================
  // Niveaux de détail progressifs
  // ==========================================================================

  /**
   * Récupère les résultats avec un niveau de détail spécifique
   * @param {number} level - Niveau de détail (0-4)
   *   0: Clés uniquement
   *   1: + descriptions
   *   2: + signatures complètes
   *   3: + code des méthodes
   *   4: + fichiers complets
   * @param {Object} options - Options supplémentaires
   * @returns {Array|Object} Résultats au niveau demandé
   */
  getAtLevel(level = 1, options = {}) {
    const { includeDescriptions = true } = options;

    switch (level) {
      case 0:
        return this.keys;

      case 1:
        return this._results.map(({ key, method, score }) => {
          const result = {
            key,
            class: method.class,
            name: method.name,
            role: method.role,
            score
          };
          if (includeDescriptions && method.description) {
            result.description = method.description;
          }
          return result;
        });

      case 2:
        return this._results.map(({ key, method, score }) => {
          const result = {
            key,
            file: method.file,
            class: method.class,
            signature: method.signature,
            role: method.role,
            effects: method.effects,
            consumers: method.consumers,
            score
          };
          if (includeDescriptions && method.description) {
            result.description = method.description;
          }
          return result;
        });

      case 3:
        return this._results.map(({ key, method, score }) => {
          if (!this._loadedCode.has(key)) {
            const code = this.agent.methodIndexer.extractMethodCode(key);
            if (code) {
              this._loadedCode.set(key, code);
            }
          }
          const result = {
            key,
            file: method.file,
            class: method.class,
            signature: method.signature,
            role: method.role,
            code: this._loadedCode.get(key) || null,
            score
          };
          if (includeDescriptions && method.description) {
            result.description = method.description;
          }
          return result;
        });

      case 4:
        const fileGroups = {};
        for (const { key, method } of this._results) {
          const file = method.file;
          if (!fileGroups[file]) {
            const loaded = this.loadFile(file);
            fileGroups[file] = {
              path: file,
              content: loaded?.content || null,
              methods: []
            };
          }
          fileGroups[file].methods.push(key);
        }
        return Object.values(fileGroups);

      default:
        return this.getAtLevel(1);
    }
  }

// ============================================
// Classe: ExperienceMemory
// ============================================

// Méthode: ExperienceMemory.updatePatterns
// Fichier: lib\experience-memory.cjs:353
// Score: 6
  /**
   * Met à jour les statistiques de patterns
   */
  updatePatterns(event, outcome) {
    const signature = this.getPatternSignature(event.task.fingerprint);

    if (!this.patterns[signature]) {
      this.patterns[signature] = { successes: 0, failures: 0 };
    }

    if (outcome === 'success') {
      this.patterns[signature].successes++;
    } else {
      this.patterns[signature].failures++;
    }
  }

// Méthode: ExperienceMemory.getStats
// Fichier: lib\experience-memory.cjs:437
// Score: 6
  /**
   * Obtient les statistiques
   */
  getStats() {
    const total = this.events.length;
    const successes = this.events.filter(e => e.outcome.status === 'success').length;
    const failures = this.events.filter(e => e.outcome.status === 'failure').length;
    const pending = this.events.filter(e => e.outcome.status === 'pending').length;

    return {
      totalEvents: total,
      successes,
      failures,
      pending,
      successRate: total > 0 ? ((successes / (total - pending)) * 100).toFixed(1) + '%' : 'N/A',
      patternsCount: Object.keys(this.patterns).length,
      vocabularySize: this.tfidf.vocabulary.size
    };
  }

// ============================================
// Classe: FingerprintGenerator
// ============================================

// Méthode: FingerprintGenerator.getPatternSignature
// Fichier: lib\fingerprint-generator.cjs:262
// Score: 6
  /**
   * Calcule une signature de pattern (pour statistiques)
   */
  getPatternSignature(fingerprint) {
    // Signature simplifiée pour les statistiques de patterns
    const parts = [
      `intent:${fingerprint.intent}`,
      ...fingerprint.domains.map(d => `domain:${d}`)
    ];

    if (fingerprint.errorType) {
      parts.push(`errorType:${fingerprint.errorType}`);
    }

    return parts.sort().join('+');
  }

// ============================================
// Classe: ContextAgent
// ============================================

// Méthode: ContextAgent.findRelevantMethods
// Fichier: lib\mcp\context-agent.cjs:141
// Score: 6
  // ==========================================================================
  // METHOD-LEVEL GRANULARITY (delegated to MethodSearch)
  // ==========================================================================

  /**
   * Find relevant methods for a query
   * @param {string} query - User query
   * @param {Object} options - Search options
   * @returns {Array} List of relevant methods with their score
   */
  findRelevantMethods(query, options = {}) {
    return this.methodSearch.findRelevantMethods(query, options);
  }

