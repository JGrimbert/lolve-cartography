/**
 * FICHIER TEMPORAIRE - Méthodes extraites pour modification
 *
 * Généré le: 2026-01-17T08:34:17.270Z
 * Méthodes: MethodSearch.findRelevantMethods, SearchSession.getMethodsNeedingAnnotation, ExperienceMemory.findSimilar, Orchestrator.init, Orchestrator.buildOptimizedPrompt, AIClient.getStats, CacheAgent.find, CacheAgent.getStats, CacheAgent.getExtendedStats, MethodSearch.getMethodsContent, SearchSession.getAllLoadedFiles, SearchSession.getAtLevel, ContextAgent.findRelevantFiles, ContextAgent.getFilesContent, ContextAgent.getFilesByCategory, ExperienceMemory.updatePatterns, ExperienceMemory.getStats
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
// Score: 0
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

// Méthode: MethodSearch.getMethodsContent
// Fichier: lib\context\method-search.cjs:164
// Score: 0
  /**
   * Extrait le code des méthodes sélectionnées
   * @param {Array} methods - Liste des méthodes (depuis findRelevantMethods)
   * @returns {Array} Liste avec le code de chaque méthode
   */
  getMethodsContent(methods) {
    const contents = [];

    for (const item of methods) {
      const methodKey = typeof item === 'string' ? item : item.key;
      const method = typeof item === 'string'
        ? this.methodIndexer.index.methods[item]
        : item.method;

      if (!method) continue;

      const code = this.methodIndexer.extractMethodCode(methodKey);

      if (code) {
        contents.push({
          key: methodKey,
          file: method.file,
          class: method.class,
          name: method.name,
          signature: method.signature,
          role: method.role,
          description: method.description,
          code
        });
      }
    }

    return contents;
  }

// ============================================
// Classe: SearchSession
// ============================================

// Méthode: SearchSession.getMethodsNeedingAnnotation
// Fichier: lib\context\search-session.cjs:544
// Score: 0
  /**
   * Identifie les méthodes nécessitant une annotation LLM
   * Retourne les méthodes à annoter avec leur code (pour envoi au LLM)
   *
   * @param {Object} options - Options
   * @returns {Object} { needsAnnotation: [...], alreadyComplete: number, tokensEstimate: number }
   */
  getMethodsNeedingAnnotation(options = {}) {
    const {
      includeOutdated = true,
      includePartial = false,
      maxMethods = 5
    } = options;

    const status = this.checkAnnotations();

    const toAnnotate = [
      ...status.missing,
      ...(includeOutdated ? status.outdated : []),
      ...(includePartial ? status.partial : [])
    ].slice(0, maxMethods);

    const methodsWithCode = toAnnotate.map(key => {
      const method = this.agent.methodIndexer.index.methods[key];
      const code = this.agent.methodIndexer.extractMethodCode(key);

      return {
        key,
        file: method?.file,
        class: method?.class,
        name: method?.name,
        signature: method?.signature,
        currentRole: method?.role,
        currentDescription: method?.description,
        code,
        codeLength: code?.length || 0
      };
    }).filter(m => m.code);

    const totalChars = methodsWithCode.reduce((sum, m) => sum + m.codeLength, 0);
    const tokensEstimate = Math.ceil(totalChars / 4);

    this._addHistory('getMethodsNeedingAnnotation', {
      requested: toAnnotate.length,
      withCode: methodsWithCode.length,
      tokensEstimate
    });

    return {
      needsAnnotation: methodsWithCode,
      alreadyComplete: status.complete.length,
      tokensEstimate
    };
  }

// Méthode: SearchSession.getAllLoadedFiles
// Fichier: lib\context\search-session.cjs:410
// Score: 0
  /**
   * Récupère tous les fichiers chargés jusqu'ici
   * @returns {Map} Chemin → contenu
   */
  getAllLoadedFiles() {
    return new Map(this._loadedFiles);
  }

// Méthode: SearchSession.getAtLevel
// Fichier: lib\context\search-session.cjs:429
// Score: 0
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

// Méthode: ExperienceMemory.findSimilar
// Fichier: lib\experience-memory.cjs:386
// Score: 0
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
// Score: 0
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
// Score: 0
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
// Classe: Orchestrator
// ============================================

// Méthode: Orchestrator.init
// Fichier: lib\orchestrator.cjs:55
// Score: 0
  /**
   * Initialise l'orchestrator et les agents nécessaires
   */
  async init() {
    section('LOLVE Agent System - API Mode');

    // Charger la configuration
    this.config = readJSON(this.configPath);
    if (!this.config) {
      throw new Error('Configuration non trouvée: agents.config.json');
    }

    log('Orchestrator', 'Initialisation des agents...');

    // Initialiser les agents
    this.agents = {
      context: await new ContextAgent(this.config).init(),
      cache: await new CacheAgent(this.config).init(),
      preprocess: await new PreprocessAgent(this.config).init(),
      analysis: await new AnalysisAgent(this.config).init(),
      proposal: await new ProposalAgent(this.config).init()
    };

    // Initialiser le système d'apprentissage
    this.experienceMemory = await new ExperienceMemory(this.config).init();
    this.fingerprintGenerator = new FingerprintGenerator(this.config);
    this.riskEngine = new RiskInferenceEngine(this.experienceMemory);

    // Initialiser le client API
    this.aiClient = new AIClient();

    log('Orchestrator', 'Agents initialisés', 'success');
    log('Orchestrator', `Mémoire d'expérience: ${this.experienceMemory.getStats().totalEvents} événements`, 'info');

    // Vérifier l'API (sauf en dry-run)
    if (!this.options.dryRun) {
      if (!this.aiClient.isAvailable()) {
        throw new Error(`
❌ API Anthropic requise !

Votre système d'optimisation par méthode nécessite l'API directe.

Solution: Définissez ANTHROPIC_API_KEY dans un fichier .env à la racine du projet:
  ANTHROPIC_API_KEY=sk-ant-votre-clé-ici

Pour obtenir une clé API: https://console.anthropic.com

Note: L'optimisation par méthode réduit la consommation de tokens de ~95%,
      rendant l'utilisation de l'API très économique.
        `);
      }
      log('Orchestrator', '✓ API Anthropic disponible', 'success');
    }

    return this;
  }

// Méthode: Orchestrator.buildOptimizedPrompt
// Fichier: lib\orchestrator.cjs:342
// Score: 0
  /**
   * Construit le prompt optimisé avec méthodes extraites
   */
  buildOptimizedPrompt(originalQuery, preprocessed, analysis, proposal, methodsWithCode, context) {
    const parts = [];

    // En-tête contexte
    parts.push(`# Contexte LOLVE`);
    parts.push(`Catégorie détectée: ${context.detectedCategory || 'général'}`);

    if (preprocessed.detectedTerms.length > 0) {
      parts.push(`Termes domain: ${preprocessed.detectedTerms.map(t => t.term).join(', ')}`);
    }

    // Méthodes pertinentes avec leur code
    if (methodsWithCode.length > 0) {
      parts.push(`\n# Méthodes pertinentes\n`);
      parts.push(`${methodsWithCode.length} méthode(s) sélectionnée(s) par analyse sémantique:\n`);
      
      for (const method of methodsWithCode) {
        parts.push(`## ${method.key}`);
        parts.push(`Fichier: ${method.file}`);
        parts.push(`Rôle: ${method.role || 'non spécifié'}`);
        
        if (method.description) {
          parts.push(`Description: ${method.description}`);
        }
        
        if (method.effects && Object.keys(method.effects).length > 0) {
          parts.push(`Effets: ${Object.entries(method.effects).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}`);
        }
        
        if (method.consumers && method.consumers.length > 0) {
          parts.push(`Appelée par: ${method.consumers.join(', ')}`);
        }
        
        parts.push(`\n\`\`\`javascript`);
        parts.push(`// ${method.signature}`);
        parts.push(method.code);
        parts.push(`\`\`\`\n`);
      }
    }

    // Expérience passée (warnings et recommandations)
    if (context.experienceContext) {
      const exp = context.experienceContext;

      if (exp.warnings?.length > 0 || exp.blockedApproaches?.length > 0) {
        parts.push(`\n# Leçons de l'expérience passée`);
        parts.push(`Niveau de risque: ${exp.riskLevel?.toUpperCase() || 'N/A'}`);

        if (exp.warnings?.length > 0) {
          parts.push(`\nAvertissements:`);
          for (const w of exp.warnings) {
            parts.push(`- ${w.message}`);
            if (w.lesson) parts.push(`  Leçon: ${w.lesson}`);
          }
        }

        if (exp.blockedApproaches?.length > 0) {
          parts.push(`\nApproches à éviter:`);
          for (const b of exp.blockedApproaches) {
            parts.push(`- ${b.approach}: ${b.reason || 'échec précédent'}`);
          }
        }
      }

      if (exp.recommendations?.length > 0) {
        parts.push(`\nRecommandations:`);
        for (const r of exp.recommendations) {
          parts.push(`- ${r.message}`);
        }
      }
    }

    // Analyse
    parts.push(`\n# Analyse`);
    parts.push(`- Type: ${analysis.summary.type}`);
    parts.push(`- Complexité: ${analysis.complexity.label}`);

    if (analysis.risks.length > 0) {
      parts.push(`- Risques: ${analysis.risks.map(r => r.description).join(', ')}`);
    }

    // Approche choisie
    if (proposal) {
      parts.push(`\n# Approche choisie`);
      parts.push(`**${proposal.title}**`);
      parts.push(proposal.description);
      if (proposal.snippet) {
        parts.push(`\nExemple:\n\`\`\`javascript\n${proposal.snippet}\n\`\`\``);
      }
    }

    // Requête
    parts.push(`\n# Requête`);
    parts.push(originalQuery);

    return parts.join('\n');
  }

// ============================================
// Classe: AIClient
// ============================================

// Méthode: AIClient.getStats
// Fichier: lib\ai-client.cjs:231
// Score: 0
  /**
   * Obtient les statistiques d'utilisation
   * @returns {Object} Statistiques
   */
  getStats() {
    const totalTokens = this.stats.totalInputTokens + this.stats.totalOutputTokens;
    
    // Coût estimé (Sonnet 4: $3/1M input, $15/1M output)
    const inputCost = (this.stats.totalInputTokens / 1000000) * 3;
    const outputCost = (this.stats.totalOutputTokens / 1000000) * 15;
    const totalCost = inputCost + outputCost;

    return {
      ...this.stats,
      totalTokens,
      estimatedCost: {
        input: inputCost.toFixed(4),
        output: outputCost.toFixed(4),
        total: totalCost.toFixed(4),
        currency: 'USD'
      }
    };
  }

// ============================================
// Classe: CacheAgent
// ============================================

// Méthode: CacheAgent.find
// Fichier: lib\cache-agent.cjs:99
// Score: 0
  /**
   * Cherche une entrée similaire dans le cache
   */
  find(query) {
    log('CacheAgent', 'Recherche dans le cache...');

    let bestMatch = null;
    let bestScore = 0;

    for (const entry of this.cache.entries) {
      const score = this.similarity(query, entry.query);

      if (score > bestScore && score >= this.similarityThreshold) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      this.cache.stats.hits++;
      log('CacheAgent', `Cache HIT! Similarité: ${(bestScore * 100).toFixed(1)}%`, 'success');
      return {
        hit: true,
        entry: bestMatch,
        similarity: bestScore
      };
    }

    this.cache.stats.misses++;
    log('CacheAgent', 'Cache MISS');
    return { hit: false };
  }

// Méthode: CacheAgent.getStats
// Fichier: lib\cache-agent.cjs:188
// Score: 0
  /**
   * Obtient les statistiques du cache
   */
  getStats() {
    const total = this.cache.stats.hits + this.cache.stats.misses;
    const hitRate = total > 0 ? (this.cache.stats.hits / total * 100).toFixed(1) : 0;

    return {
      entries: this.cache.entries.length,
      hits: this.cache.stats.hits,
      misses: this.cache.stats.misses,
      hitRate: `${hitRate}%`
    };
  }

// Méthode: CacheAgent.getExtendedStats
// Fichier: lib\cache-agent.cjs:253
// Score: 0
  /**
   * Obtient les statistiques combinées cache + experience
   * @param {ExperienceMemory} experienceMemory - Instance de ExperienceMemory
   * @returns {Object} Statistiques combinées
   */
  getExtendedStats(experienceMemory) {
    const cacheStats = this.getStats();
    const experienceStats = experienceMemory ? experienceMemory.getStats() : null;

    return {
      cache: cacheStats,
      experience: experienceStats,
      combined: {
        totalInteractions: cacheStats.entries + (experienceStats?.totalEvents || 0),
        cacheHitRate: cacheStats.hitRate,
        taskSuccessRate: experienceStats?.successRate || 'N/A',
        learningProgress: experienceStats?.vocabularySize || 0
      }
    };
  }

// ============================================
// Classe: ContextAgent
// ============================================

// Méthode: ContextAgent.findRelevantFiles
// Fichier: lib\mcp\context-agent.cjs:135
// Score: 0
  /**
   * Find relevant files for a query
   */
  findRelevantFiles(query, maxFiles = 10) {
    log('ContextAgent', `Searching files for: "${query.substring(0, 50)}..."`);

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    const scored = [];

    for (const [filePath, info] of Object.entries(this.index.files)) {
      let score = 0;

      // Score based on keywords
      for (const word of queryWords) {
        if (info.keywords.some(k => k.includes(word) || word.includes(k))) {
          score += 3;
        }
        if (info.name.toLowerCase().includes(word)) {
          score += 2;
        }
        if (info.exports.some(e => e.toLowerCase().includes(word))) {
          score += 2;
        }
      }

      // Score based on category detected in query
      const detectedCategory = this.detectQueryCategory(queryLower);
      if (detectedCategory && info.category === detectedCategory) {
        score += 5;
      }

      if (score > 0) {
        scored.push({ path: filePath, info, score });
      }
    }

    // Sort by score and limit
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, maxFiles);

    log('ContextAgent', `${results.length} relevant files found`, 'success');

    return results;
  }

// Méthode: ContextAgent.getFilesContent
// Fichier: lib\mcp\context-agent.cjs:201
// Score: 0
  /**
   * Get content of selected files
   */
  getFilesContent(files) {
    const contents = [];

    for (const file of files) {
      const filePath = typeof file === 'string' ? file : file.path;
      const content = readFile(filePath);

      if (content) {
        contents.push({
          path: filePath,
          content: content.length > 5000 ? content.substring(0, 5000) + '\n// ... truncated' : content
        });
      }
    }

    return contents;
  }

// Méthode: ContextAgent.getFilesByCategory
// Fichier: lib\mcp\context-agent.cjs:246
// Score: 0
  /**
   * Get files from a specific category
   */
  getFilesByCategory(category) {
    return this.index.categories[category] || [];
  }

