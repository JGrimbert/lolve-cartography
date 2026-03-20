/**
 * MethodSearch - Recherche et contexte au niveau méthode
 *
 * Responsabilités:
 * - Trouver les méthodes pertinentes pour une requête
 * - Extraire le code des méthodes sélectionnées
 * - Générer un contexte optimisé pour le LLM
 */

const MiniSearch = require('minisearch');
const crypto    = require('crypto');
const { log }   = require('../utils/logger.cjs');

// Stopwords FR/EN trop génériques pour discriminer des méthodes
const STOPWORDS = new Set([
  'les', 'des', 'une', 'est', 'que', 'qui', 'dans', 'pour', 'par', 'sur',
  'avec', 'son', 'ses', 'leur', 'mes', 'nos', 'vos', 'aux', 'pas', 'plus',
  'tout', 'mais', 'comme', 'bien', 'aussi', 'quand', 'donc', 'cette', 'ces',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'not', 'are', 'have',
  'when', 'get', 'set', 'add', 'run', 'new', 'use', 'can', 'should',
]);

// Champs indexés dans MiniSearch avec leurs boosts respectifs
const SEARCH_BOOST = {
  name:            4,   // nom de la méthode — signal le plus fort
  className:       2,   // classe — contexte structurel
  signature:       2,   // paramètres de la méthode — vocabulaire sémantique
  role:            2,   // entry/core/service — intent de haut niveau
  consumers:       2,   // qui appelle cette méthode — couplage sémantique
  contextProvides: 2,   // ce que retourne la méthode
  description:     1,   // texte libre — utile mais bruité
  contextRequires: 1,   // dépendances entrantes
  effectsCreates:  1.5, // objets créés — plus discriminant que mutates
  effectsMutates:  1,
  effectsEmits:    1,
};

/**
 * Tokenize un texte en séparant les mots camelCase/PascalCase
 * Ex: "getUserList" → ["get", "user", "list"]
 */
function tokenizeCamel(text) {
  if (!text) return [];
  return String(text)
    .split(/[\s\-_.,;:!?()[\]{}'"\/\\]+/)
    .flatMap(word => word.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/))
    .map(w => w.toLowerCase())
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Fingerprint rapide des clés de l'index — détecte ajouts, suppressions ET renames.
 * Plus robuste que le simple count.
 */
function _fingerprint(methods) {
  return crypto
    .createHash('md5')
    .update(Object.keys(methods).sort().join(','))
    .digest('hex')
    .slice(0, 8);
}

class MethodSearch {
  /**
   * @param {Object} methodIndexer  - Instance de MethodIndexer
   * @param {Object} annotationCache - Instance de AnnotationCache
   */
  constructor(methodIndexer, annotationCache) {
    this.methodIndexer  = methodIndexer;
    this.annotationCache = annotationCache;
    this._miniSearch        = null;
    this._indexFingerprint  = null;
  }

  /**
   * Trouve les méthodes pertinentes pour une requête
   * @param {string} query   - Requête utilisateur
   * @param {Object} options - Options de recherche
   * @returns {Array} Liste des méthodes avec leur score
   */
  findRelevantMethods(query, options = {}) {
    const {
      maxMethods   = 10,
      minScore     = 1,          // filtre le bruit MiniSearch (score très bas = match faible)
      roles        = null,
      excludeRoles = ['internal'],
      includePrivate = false,
      combineWith  = 'OR',       // 'AND' pour queries longues plus précises
      _isRetry     = false,
    } = options;

    log('MethodSearch', `Searching methods for: "${query.substring(0, 50)}..."${_isRetry ? ' (extended scope)' : ''}`);

    const results = this._doSearch(query, { maxMethods, minScore, roles, excludeRoles, includePrivate, combineWith });

    // Retry avec scope étendu si aucun résultat
    if (results.length === 0 && !_isRetry) {
      log('MethodSearch', 'No results, retrying with extended scope (including internal/private)...');
      return this._doSearch(query, {
        maxMethods,
        minScore:    0,
        roles:       null,
        excludeRoles: [],
        includePrivate: true,
        combineWith: 'OR',
        _isRetry:    true,
      });
    }

    return results;
  }

  /**
   * Construit (ou retourne) l'index MiniSearch.
   * Invalidation par fingerprint MD5 sur les clés — détecte renames et changements de structure.
   * @private
   */
  _buildIndex() {
    const methods = this.methodIndexer.index.methods || {};
    const fp = _fingerprint(methods);

    if (this._miniSearch && this._indexFingerprint === fp) {
      return this._miniSearch;
    }

    this._miniSearch = new MiniSearch({
      fields:      Object.keys(SEARCH_BOOST),
      idField:     'id',
      tokenize:    tokenizeCamel,
      processTerm: term => (STOPWORDS.has(term) ? null : term),
    });

    const docs = [];
    for (const [key, method] of Object.entries(methods)) {
      const effects = method.effects || {};
      const ctx     = method.context  || {};
      docs.push({
        id:              key,
        name:            method.name        || '',
        className:       method.class       || '',
        signature:       method.signature   || '',
        role:            method.role        || '',
        description:     method.description || '',
        consumers:       Array.isArray(method.consumers)  ? method.consumers.join(' ')          : '',
        contextRequires: Array.isArray(ctx.requires)      ? ctx.requires.join(' ')               : '',
        contextProvides: Array.isArray(ctx.provides)      ? ctx.provides.join(' ')               : '',
        effectsCreates:  Array.isArray(effects.creates)   ? effects.creates.join(' ')            : '',
        effectsMutates:  Array.isArray(effects.mutates)   ? effects.mutates.join(' ')            : '',
        effectsEmits:    Array.isArray(effects.emits)     ? effects.emits.join(' ')              : '',
      });
    }

    this._miniSearch.addAll(docs);
    this._indexFingerprint = fp;

    return this._miniSearch;
  }

  /**
   * Implémentation interne de la recherche
   * @private
   */
  _doSearch(query, options) {
    const { maxMethods, minScore, roles, excludeRoles, includePrivate, combineWith } = options;

    const methods = this.methodIndexer.index.methods || {};

    // Détecte les références explicites du type "Biblio.init" ou "Classe.methode"
    const explicitMethodPattern = /([A-Z][a-zA-Z]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const explicitMethods = new Set();
    let match;
    while ((match = explicitMethodPattern.exec(query)) !== null) {
      explicitMethods.add(`${match[1]}.${match[2]}`.toLowerCase());
    }

    const ms = this._buildIndex();

    const searchResults = ms.search(query, {
      boost:       SEARCH_BOOST,
      fuzzy:       0.2,
      prefix:      true,
      combineWith,
      tokenize:    tokenizeCamel,
    });

    const scored = [];

    for (const result of searchResults) {
      const key    = result.id;
      const method = methods[key];
      if (!method) continue;

      if (!includePrivate && method.isPrivate) continue;
      if (roles        && !roles.includes(method.role))                              continue;
      if (excludeRoles?.length > 0 && excludeRoles.includes(method.role))           continue;

      let score = result.score;

      // Bonus fort si la méthode est nommée explicitement dans la query (ex: "Biblio.init")
      if (explicitMethods.has(key.toLowerCase())) score += 50;

      // Bonus/malus sur les rôles structurels
      if (method.role === 'entry')    score += 2;
      if (method.role === 'core')     score += 1;
      if (method.role === 'internal') score -= 2;

      if (score >= minScore) {
        scored.push({ key, method, score });
      }
    }

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
