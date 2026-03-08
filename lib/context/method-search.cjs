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

  /**
   * Internal search implementation
   * @private
   */
  _doSearch(query, options) {
    const { maxMethods, minScore, roles, excludeRoles, includePrivate } = options;

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
      if (excludeRoles && excludeRoles.length > 0 && excludeRoles.includes(method.role)) continue;

      let score = 0;

      // HUGE bonus if method is explicitly named in query (e.g. "Biblio.init")
      if (explicitMethods.has(key.toLowerCase())) {
        score += 50;
      }

      // Score basé sur le nom de la méthode
      for (const word of queryWords) {
        // Exact match on method name (without class prefix)
        if (method.name.toLowerCase() === word) {
          score += 20;  // STRONG bonus for exact method name match
        } else if (word.length > 3 && method.name.toLowerCase().includes(word)) {
          score += 3;  // Partial match (only for longer words)
        }
        // Exact match on class name
        if (method.class && method.class.toLowerCase() === word) {
          score += 10;  // Bonus for exact class match
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
   * Recherche les méthodes par critères spécifiques
   * @param {Object} criteria - Critères de recherche
   * @returns {Array} Liste des méthodes correspondantes
   */
  searchMethods(criteria = {}) {
    return this.methodIndexer.searchMethods(criteria);
  }
}

module.exports = { MethodSearch };
