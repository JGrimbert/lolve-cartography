/**
 * FICHIER TEMPORAIRE - Méthodes extraites pour modification
 *
 * Généré le: 2026-01-17T11:14:34.194Z
 * Méthodes: MethodSearch.findRelevantMethods, ExperienceMemory.findSimilar, SearchSession.getAllLoadedFiles, SearchSession.getAtLevel, ExperienceMemory.updatePatterns, ExperienceMemory.getStats
 *
 * INSTRUCTIONS:
 * - Modifiez les méthodes ci-dessous
 * - Ne changez PAS les noms de méthodes
 * - La réinjection est AUTOMATIQUE (watcher MCP)
 */

// ============================================
// Classe: MethodSearch
// ============================================

// Méthode: MethodSearch.findRelevantMethods
// Fichier: lib\context\method-search.cjs:28
// Score: 6
  /**
   * Trouve les méthodes pertinentes pour une requête
   * @param {string} query - Requête utilisateur
   * @param {Object} options - Options de recherche
   * @returns {Array} Liste des méthodes avec leur score
   */
  findRelevantMethods(query, options = {}) {
    const {
      maxMethods = 10,
      minScore = 3,
      roles = null,
      excludeRoles = ['internal'],
      includePrivate = false,
      _isRetry = false  // Internal flag for retry
    } = options;

    log('MethodSearch', `Searching methods for: "${query.substring(0, 50)}..."${_isRetry ? ' (extended scope)' : ''}`);

    const results = this._doSearch(query, { maxMethods, minScore, roles, excludeRoles, includePrivate });

    // If no results and not already retrying, try with extended scope
    if (results.length === 0 && !_isRetry) {
      log('MethodSearch', 'No results, retrying with extended scope (including internal/private)...');
      return this._doSearch(query, {
        maxMethods,
        minScore: Math.max(1, minScore - 2),  // Lower threshold too
        roles: null,
        excludeRoles: [],  // Include internal
        includePrivate: true,
        _isRetry: true
      });
    }

    return results;
  }

// ============================================
// Classe: ExperienceMemory
// ============================================

// Méthode: ExperienceMemory.findSimilar
// Fichier: lib\experience-memory.cjs:386
// Score: 6
  /**
   * Recherche les expériences similaires
   */
  findSimilar(fingerprint, options = {}) {
    const { limit = 5, minSimilarity = 0.3, excludePending = true } = options;

    const queryTerms = this.fingerprintToTerms(fingerprint);
    const queryEmbedding = this.tfidf.embed(queryTerms);

    if (queryEmbedding.length === 0) {
      return [];
    }

    const results = [];

    for (const event of this.events) {
      if (excludePending && event.outcome.status === 'pending') {
        continue;
      }

      const similarity = this.tfidf.cosineSimilarity(queryEmbedding, event.embedding);

      if (similarity >= minSimilarity) {
        results.push({
          event,
          similarity
        });
      }
    }

    // Trier par similarité décroissante
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, limit);
  }

// Méthode: ExperienceMemory.updatePatterns
// Fichier: lib\experience-memory.cjs:353
// Score: 3
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
// Score: 3
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
// Classe: SearchSession
// ============================================

// Méthode: SearchSession.getAllLoadedFiles
// Fichier: lib\context\search-session.cjs:410
// Score: 3
  /**
   * Récupère tous les fichiers chargés jusqu'ici
   * @returns {Map} Chemin → contenu
   */
  getAllLoadedFiles() {
    return new Map(this._loadedFiles);
  }

// Méthode: SearchSession.getAtLevel
// Fichier: lib\context\search-session.cjs:429
// Score: 3
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

