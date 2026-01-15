/**
 * MethodSearch - Recherche et contexte au niveau méthode
 *
 * Responsabilités:
 * - Trouver les méthodes pertinentes pour une requête
 * - Extraire le code des méthodes sélectionnées
 * - Générer un contexte optimisé pour le LLM
 */

const { log } = require('../utils/logger.cjs');

class MethodSearch {
  /**
   * @param {Object} methodIndexer - Instance de MethodIndexer
   * @param {Object} annotationCache - Instance de AnnotationCache
   */
  constructor(methodIndexer, annotationCache) {
    this.methodIndexer = methodIndexer;
    this.annotationCache = annotationCache;
  }

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
      includePrivate = false
    } = options;

    log('MethodSearch', `Searching methods for: "${query.substring(0, 50)}..."`);

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const methods = this.methodIndexer.index.methods || {};

    // Detect explicit method references like "Biblio.init" or "Classe.methode"
    const explicitMethodPattern = /([A-Z][a-zA-Z]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const explicitMethods = new Set();
    let match;
    while ((match = explicitMethodPattern.exec(query)) !== null) {
      explicitMethods.add(`${match[1]}.${match[2]}`.toLowerCase());
    }

    const scored = [];

    for (const [key, method] of Object.entries(methods)) {
      // Filtrer les méthodes privées si demandé
      if (!includePrivate && method.isPrivate) continue;

      // Filtrer par rôles
      if (roles && !roles.includes(method.role)) continue;
      if (excludeRoles && excludeRoles.includes(method.role)) continue;

      let score = 0;

      // HUGE bonus if method is explicitly named in query (e.g. "Biblio.init")
      if (explicitMethods.has(key.toLowerCase())) {
        score += 50;
      }

      // Score basé sur le nom de la méthode
      for (const word of queryWords) {
        if (method.name.toLowerCase() === word) {
          score += 5;  // Exact match
        } else if (word.length > 3 && method.name.toLowerCase().includes(word)) {
          score += 3;  // Partial match (only for longer words)
        }
        if (method.class && method.class.toLowerCase() === word) {
          score += 4;  // Exact class match
        }
      }

      // Score basé sur la description
      if (method.description) {
        for (const word of queryWords) {
          if (method.description.toLowerCase().includes(word)) {
            score += 3;
          }
        }
      }

      // Score basé sur les consumers
      if (method.consumers) {
        for (const consumer of method.consumers) {
          for (const word of queryWords) {
            if (consumer.toLowerCase().includes(word)) {
              score += 2;
            }
          }
        }
      }

      // Score basé sur les effets
      if (method.effects) {
        for (const [effectType, targets] of Object.entries(method.effects)) {
          for (const target of targets) {
            for (const word of queryWords) {
              if (target.toLowerCase().includes(word)) {
                score += 2;
              }
            }
          }
        }
      }

      // Bonus pour les rôles importants
      if (method.role === 'entry') score += 2;
      if (method.role === 'core') score += 1;

      if (score >= minScore) {
        scored.push({ key, method, score });
      }
    }

    // Trier par score décroissant
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, maxMethods);

    log('MethodSearch', `${results.length} relevant methods found`, 'success');

    return results;
  }

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

  /**
   * Génère un contexte optimisé pour le LLM (niveau méthode)
   * Retourne uniquement les métadonnées, pas le code
   * @param {string} query - Requête utilisateur
   * @param {Object} options - Options de recherche
   * @returns {Object} Contexte formaté
   */
  generateMethodContext(query, options = {}) {
    const relevantMethods = this.findRelevantMethods(query, options);

    return {
      query,
      methods: relevantMethods.map(({ key, method, score }) => ({
        key,
        file: method.file,
        class: method.class,
        signature: method.signature,
        role: method.role,
        description: method.description,
        effects: method.effects,
        consumers: method.consumers,
        score
      })),
      filesSummary: this.groupMethodsByFile(relevantMethods)
    };
  }

  /**
   * Groupe les méthodes par fichier
   * @param {Array} methods - Liste des méthodes
   * @returns {Array} Méthodes groupées par fichier
   */
  groupMethodsByFile(methods) {
    const byFile = {};

    for (const { method } of methods) {
      if (!byFile[method.file]) {
        byFile[method.file] = {
          file: method.file,
          methods: []
        };
      }
      byFile[method.file].methods.push(method.name);
    }

    return Object.values(byFile);
  }

  /**
   * Extrait le code des méthodes par leurs clés
   * @param {Array<string>} methodKeys - Liste des clés de méthodes
   * @returns {Array} Méthodes avec leur code
   */
  extractMethodsByKeys(methodKeys) {
    return methodKeys.map(key => {
      const code = this.methodIndexer.extractMethodCode(key);
      const method = this.methodIndexer.index.methods[key];

      return {
        key,
        file: method?.file,
        signature: method?.signature,
        role: method?.role,
        code: code || null
      };
    }).filter(m => m.code !== null);
  }

  /**
   * Recherche les méthodes par critères spécifiques
   * @param {Object} criteria - Critères de recherche
   * @returns {Array} Liste des méthodes correspondantes
   */
  searchMethods(criteria = {}) {
    return this.methodIndexer.searchMethods(criteria);
  }
}

module.exports = { MethodSearch };
