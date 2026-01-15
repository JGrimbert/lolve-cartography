/**
 * SearchSession - Session de recherche itérative avec raffinement
 *
 * Fonctionnalités:
 * - Exclure les faux positifs sans relancer la recherche complète
 * - Étendre le scope en suivant les dépendances (calls/callers)
 * - Charger progressivement plus de détails (metadata → code → fichier complet)
 * - Historique des opérations pour le débogage
 *
 * @example
 * const session = agent.createSearchSession("vertex création");
 * console.log(session.results); // Résultats initiaux (metadata only)
 *
 * session.exclude(['Forma.getSlot']); // Exclure un faux positif
 * session.expand('Orb.novaFormae');   // Suivre les dépendances
 * session.loadCode(['Orb.novaFormae']); // Charger le code
 * session.loadFile('src/prima/Peri/Aion/Orb.js'); // Fallback vers fichier complet
 */

const fs = require('fs');
const path = require('path');

class SearchSession {
  /**
   * @param {Object} agent - Agent de contexte parent
   * @param {string} query - Requête initiale
   * @param {Object} options - Options de recherche
   */
  constructor(agent, query, options = {}) {
    this.agent = agent;
    this.query = query;
    this.options = {
      maxMethods: 15,
      minScore: 1,
      roles: null,
      excludeRoles: ['internal'],
      includePrivate: false,
      ...options
    };

    // État de la session
    this._results = [];           // Résultats actuels (avec métadonnées)
    this._excluded = new Set();   // Clés exclues
    this._loadedCode = new Map(); // Clés → code chargé
    this._loadedFiles = new Map();// Chemins → contenu fichier
    this._expanded = new Set();   // Clés déjà expandues
    this._history = [];           // Historique des opérations

    // Effectuer la recherche initiale
    this._search();
  }

  /**
   * Effectue la recherche avec les critères actuels
   * @private
   */
  _search() {
    const rawResults = this.agent.findRelevantMethods(this.query, this.options);

    // Filtrer les exclusions
    this._results = rawResults.filter(r => !this._excluded.has(r.key));

    this._addHistory('search', {
      query: this.query,
      found: rawResults.length,
      afterExclusion: this._results.length
    });
  }

  /**
   * Ajoute une entrée à l'historique
   * @private
   */
  _addHistory(action, details) {
    this._history.push({
      timestamp: Date.now(),
      action,
      ...details
    });
  }

  // ==========================================================================
  // Getters - Accès aux résultats
  // ==========================================================================

  /**
   * Résultats actuels (métadonnées uniquement, pas de code)
   * @returns {Array} Liste des méthodes avec métadonnées
   */
  get results() {
    return this._results.map(({ key, method, score }) => ({
      key,
      file: method.file,
      class: method.class,
      name: method.name,
      signature: method.signature,
      role: method.role,
      description: method.description,
      effects: method.effects,
      consumers: method.consumers,
      score,
      hasCode: this._loadedCode.has(key)
    }));
  }

  /**
   * Nombre de résultats actuels
   */
  get count() {
    return this._results.length;
  }

  /**
   * Clés des résultats actuels
   */
  get keys() {
    return this._results.map(r => r.key);
  }

  /**
   * Historique des opérations
   */
  get history() {
    return [...this._history];
  }

  /**
   * Résumé de l'état de la session
   */
  get summary() {
    return {
      query: this.query,
      resultCount: this._results.length,
      excludedCount: this._excluded.size,
      loadedCodeCount: this._loadedCode.size,
      loadedFilesCount: this._loadedFiles.size,
      expandedCount: this._expanded.size
    };
  }

  // ==========================================================================
  // Actions - Raffinement des résultats
  // ==========================================================================

  /**
   * Exclut des méthodes des résultats (faux positifs)
   * @param {string|string[]} methodKeys - Clé(s) à exclure
   * @returns {SearchSession} this (chaînable)
   */
  exclude(methodKeys) {
    const keys = Array.isArray(methodKeys) ? methodKeys : [methodKeys];

    for (const key of keys) {
      this._excluded.add(key);
    }

    // Retirer des résultats actuels
    this._results = this._results.filter(r => !this._excluded.has(r.key));

    this._addHistory('exclude', { excluded: keys });

    return this;
  }

  /**
   * Réinitialise les exclusions et relance la recherche
   * @returns {SearchSession} this (chaînable)
   */
  resetExclusions() {
    this._excluded.clear();
    this._search();
    this._addHistory('resetExclusions', {});
    return this;
  }

  /**
   * Relance la recherche avec une nouvelle requête
   * @param {string} newQuery - Nouvelle requête (optionnel, garde la précédente si absent)
   * @param {Object} newOptions - Nouvelles options (fusionnées avec les existantes)
   * @returns {SearchSession} this (chaînable)
   */
  retry(newQuery = null, newOptions = {}) {
    if (newQuery) {
      this.query = newQuery;
    }
    this.options = { ...this.options, ...newOptions };

    this._search();
    this._addHistory('retry', { query: this.query, options: newOptions });

    return this;
  }

  /**
   * Étend le scope en suivant les dépendances d'une méthode
   * Ajoute les méthodes appelées (effects) et les appelants (consumers)
   * @param {string} methodKey - Clé de la méthode à étendre
   * @param {Object} options - { depth: 1, direction: 'both'|'callers'|'calls' }
   * @returns {SearchSession} this (chaînable)
   */
  expand(methodKey, options = {}) {
    const { depth = 1, direction = 'both' } = options;

    if (this._expanded.has(methodKey)) {
      return this; // Déjà étendu
    }

    const method = this.agent.methodIndexer.index.methods[methodKey];
    if (!method) {
      this._addHistory('expand', { key: methodKey, error: 'Method not found' });
      return this;
    }

    const toAdd = new Set();

    // Ajouter les consumers (méthodes qui appellent celle-ci)
    if (direction === 'both' || direction === 'callers') {
      if (method.consumers) {
        for (const consumer of method.consumers) {
          const consumerMethods = this._findMethodsOfClass(consumer);
          for (const m of consumerMethods) {
            if (!this._excluded.has(m)) {
              toAdd.add(m);
            }
          }
        }
      }
    }

    // Ajouter les méthodes appelées (via effects.creates)
    if (direction === 'both' || direction === 'calls') {
      if (method.effects?.creates) {
        for (const created of method.effects.creates) {
          const creatorMethods = this._findCreatorMethods(created);
          for (const m of creatorMethods) {
            if (!this._excluded.has(m)) {
              toAdd.add(m);
            }
          }
        }
      }
    }

    // Ajouter les nouvelles méthodes aux résultats
    const methods = this.agent.methodIndexer.index.methods;
    for (const key of toAdd) {
      if (!this._results.some(r => r.key === key) && methods[key]) {
        this._results.push({
          key,
          method: methods[key],
          score: 0 // Score 0 = ajouté par expansion
        });
      }
    }

    this._expanded.add(methodKey);
    this._addHistory('expand', {
      key: methodKey,
      direction,
      added: [...toAdd]
    });

    // Expansion récursive si depth > 1
    if (depth > 1) {
      for (const key of toAdd) {
        this.expand(key, { depth: depth - 1, direction });
      }
    }

    return this;
  }

  /**
   * Trouve les méthodes d'une classe
   * @private
   */
  _findMethodsOfClass(className) {
    const methods = this.agent.methodIndexer.index.methods;
    const result = [];

    for (const key of Object.keys(methods)) {
      if (key.startsWith(className + '.')) {
        result.push(key);
      }
    }

    return result;
  }

  /**
   * Trouve les méthodes de création (nova, constructor) d'une classe
   * @private
   */
  _findCreatorMethods(className) {
    const methods = this.agent.methodIndexer.index.methods;
    const result = [];

    const creatorPatterns = [
      `${className}.nova`,
      `${className}.new`,
      `${className}.create`,
      `${className}.init`
    ];

    for (const pattern of creatorPatterns) {
      if (methods[pattern]) {
        result.push(pattern);
      }
    }

    return result;
  }

  // ==========================================================================
  // Chargement progressif du code
  // ==========================================================================

  /**
   * Charge le code de méthodes spécifiques
   * @param {string|string[]} methodKeys - Clé(s) de méthode à charger
   * @returns {Array} Code des méthodes chargées
   */
  loadCode(methodKeys) {
    const keys = Array.isArray(methodKeys) ? methodKeys : [methodKeys];
    const loaded = [];

    for (const key of keys) {
      if (this._loadedCode.has(key)) {
        loaded.push({
          key,
          code: this._loadedCode.get(key),
          cached: true
        });
        continue;
      }

      const code = this.agent.methodIndexer.extractMethodCode(key);
      if (code) {
        this._loadedCode.set(key, code);
        loaded.push({
          key,
          code,
          cached: false
        });
      }
    }

    this._addHistory('loadCode', {
      requested: keys,
      loaded: loaded.map(l => l.key)
    });

    return loaded;
  }

  /**
   * Charge un fichier complet (fallback quand la granularité méthode ne suffit pas)
   * @param {string} filePath - Chemin du fichier (relatif ou absolu)
   * @returns {Object} { path, content, lines }
   */
  loadFile(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');

    if (this._loadedFiles.has(normalizedPath)) {
      return {
        path: normalizedPath,
        content: this._loadedFiles.get(normalizedPath),
        cached: true
      };
    }

    let fullPath = path.join(this.agent.rootPath, filePath);
    if (!fs.existsSync(fullPath)) {
      fullPath = filePath;
    }

    if (!fs.existsSync(fullPath)) {
      this._addHistory('loadFile', { path: filePath, error: 'File not found' });
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    this._loadedFiles.set(normalizedPath, content);

    this._addHistory('loadFile', {
      path: normalizedPath,
      lines: content.split('\n').length
    });

    return {
      path: normalizedPath,
      content,
      lines: content.split('\n').length,
      cached: false
    };
  }

  /**
   * Récupère tout le code chargé jusqu'ici
   * @returns {Map} Clé → code
   */
  getAllLoadedCode() {
    return new Map(this._loadedCode);
  }

  /**
   * Récupère tous les fichiers chargés jusqu'ici
   * @returns {Map} Chemin → contenu
   */
  getAllLoadedFiles() {
    return new Map(this._loadedFiles);
  }

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

  // ==========================================================================
  // Annotations JIT (Just-In-Time)
  // ==========================================================================

  /**
   * Vérifie le statut d'annotation des méthodes dans les résultats
   * @returns {Object} { complete, outdated, partial, missing }
   */
  checkAnnotations() {
    const result = this.agent.methodIndexer.checkAnnotations(
      this.keys,
      this.agent.annotationCache
    );

    this._addHistory('checkAnnotations', {
      complete: result.complete.length,
      outdated: result.outdated.length,
      partial: result.partial.length,
      missing: result.missing.length
    });

    return result;
  }

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

  /**
   * Applique des annotations générées (depuis LLM ou heuristiques) au cache
   *
   * @param {Array} annotations - [{ key, role, description, effects, consumers, source }]
   * @returns {number} Nombre d'annotations appliquées
   */
  applyAnnotations(annotations) {
    let applied = 0;

    for (const ann of annotations) {
      const method = this.agent.methodIndexer.index.methods[ann.key];
      if (!method) continue;

      this.agent.annotationCache.set(ann.key, {
        role: ann.role,
        description: ann.description,
        effects: ann.effects || {},
        consumers: ann.consumers || [],
        context: ann.context || { requires: [], provides: [] },
        source: ann.source || 'llm'
      }, method.bodyHash);

      applied++;
    }

    if (applied > 0) {
      this.agent.annotationCache.save();
    }

    this._addHistory('applyAnnotations', { applied });

    return applied;
  }

  /**
   * Génère un prompt pour demander des annotations au LLM
   * @param {Object} options - Options pour getMethodsNeedingAnnotation
   * @returns {Object} { prompt, methods, tokensEstimate }
   */
  generateAnnotationPrompt(options = {}) {
    const { needsAnnotation, tokensEstimate } = this.getMethodsNeedingAnnotation(options);

    if (needsAnnotation.length === 0) {
      return { prompt: null, methods: [], tokensEstimate: 0 };
    }

    const lines = [
      '## Annotation Request',
      '',
      'Analyze the following methods and provide JSDoc annotations.',
      'For each method, return a JSON object with:',
      '- `key`: the method key',
      '- `role`: entry|core|service|flow|helper|internal|adapter',
      '- `description`: short description (1 line)',
      '- `effects`: { creates: [...], mutates: [...], emits: [...] }',
      '- `consumers`: [classes that call this method]',
      '',
      '### Methods to annotate',
      ''
    ];

    for (const method of needsAnnotation) {
      lines.push(`#### ${method.key}`);
      lines.push(`File: ${method.file}`);
      lines.push('```javascript');
      lines.push(method.code);
      lines.push('```');
      lines.push('');
    }

    lines.push('### Expected response format');
    lines.push('```json');
    lines.push('[');
    lines.push('  { "key": "ClassName.methodName", "role": "...", "description": "...", "effects": {}, "consumers": [] }');
    lines.push(']');
    lines.push('```');

    return {
      prompt: lines.join('\n'),
      methods: needsAnnotation.map(m => m.key),
      tokensEstimate
    };
  }

  // ==========================================================================
  // Export pour LLM
  // ==========================================================================

  /**
   * Génère un contexte optimisé pour le LLM
   * @param {Object} options - Options de génération
   * @returns {Object} Contexte formaté pour le LLM
   */
  toContext(options = {}) {
    const { includeCode = false, includeDescriptions = true, maxMethods = 10 } = options;

    const results = this._results.slice(0, maxMethods);

    return {
      query: this.query,
      methodCount: results.length,
      totalFound: this._results.length,
      excluded: [...this._excluded],
      methods: results.map(({ key, method, score }) => {
        const base = {
          key,
          file: method.file,
          signature: method.signature,
          role: method.role,
          score
        };

        if (includeDescriptions && method.description) {
          base.description = method.description;
        }

        if (includeCode) {
          base.code = this._loadedCode.get(key) || null;
        }

        return base;
      }),
      loadedFiles: [...this._loadedFiles.keys()]
    };
  }

  /**
   * Génère un prompt descriptif pour le LLM
   * @returns {string} Description textuelle des résultats
   */
  toPrompt() {
    const lines = [];
    lines.push(`## Search results for: "${this.query}"`);
    lines.push('');
    lines.push(`Found ${this._results.length} relevant methods:`);
    lines.push('');

    for (const { key, method, score } of this._results.slice(0, 15)) {
      let line = `- **${key}**`;
      if (method.role) line += ` [${method.role}]`;
      if (score > 0) line += ` (score: ${score})`;
      lines.push(line);

      if (method.description) {
        lines.push(`  ${method.description}`);
      }

      if (this._loadedCode.has(key)) {
        lines.push('  ```javascript');
        lines.push('  ' + this._loadedCode.get(key).split('\n').slice(0, 10).join('\n  '));
        if (this._loadedCode.get(key).split('\n').length > 10) {
          lines.push('  // ...');
        }
        lines.push('  ```');
      }
    }

    if (this._excluded.size > 0) {
      lines.push('');
      lines.push(`Exclusions: ${[...this._excluded].join(', ')}`);
    }

    return lines.join('\n');
  }
}

module.exports = { SearchSession };
