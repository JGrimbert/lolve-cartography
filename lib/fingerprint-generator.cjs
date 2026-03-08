/**
 * FingerprintGenerator - Génère des fingerprints sémantiques pour les tâches
 *
 * Responsabilités:
 * - Extraire l'intention (create, modify, debug, etc.)
 * - Détecter les domaines (math, domain, rendering, ui, debug)
 * - Identifier les mots-clés importants
 * - Estimer la complexité de la tâche
 */

const { log } = require('./utils/logger.cjs');

class FingerprintGenerator {
  constructor(config = {}) {
    this.config = config;

    // Patterns pour détecter les intentions
    this.intentPatterns = {
      create: ['ajoute', 'crée', 'implémente', 'nouveau', 'nouvelle', 'génère'],
      modify: ['modifie', 'change', 'met à jour', 'update', 'remplace'],
      debug: ['bug', 'erreur', 'problème', 'ne fonctionne pas', 'crash', 'fixe', 'corrige'],
      refactor: ['refactor', 'restructure', 'réorganise', 'simplifie', 'nettoie', 'clean'],
      optimize: ['optimise', 'performance', 'rapide', 'lent', 'mémoire', 'cache'],
      explain: ['explique', 'comment', 'pourquoi', 'qu\'est-ce', 'c\'est quoi', 'décris'],
      test: ['test', 'vérifie', 'valide', 'assertion', 'expect'],
      delete: ['supprime', 'enlève', 'retire', 'delete', 'remove']
    };

    // Patterns pour détecter les domaines
    this.domainPatterns = {
      math: ['calcul', 'compute', 'area', 'angle', 'distance', 'trigo', 'circumcenter', 'projection', 'interpolat'],
      domain: ['vertex', 'apex', 'orb', 'rosa', 'forma', 'unda', 'biblio', 'folia', 'peri', 'nucleus', 'delta', 'codex', 'clavis'],
      rendering: ['render', 'draw', 'canvas', 'svg', 'affich', 'visualis', 'color', 'style'],
      ui: ['bouton', 'button', 'click', 'input', 'form', 'dialog', 'modal', 'menu', 'composant', 'component'],
      state: ['state', 'store', 'reactive', 'ref', 'computed', 'watch', 'mutation'],
      async: ['async', 'await', 'promise', 'fetch', 'api', 'request', 'callback'],
      data: ['json', 'parse', 'serialize', 'format', 'transform', 'map', 'filter', 'reduce']
    };

    // Patterns pour détecter les effets
    this.effectPatterns = {
      mutation: ['modifie', 'change', 'set', 'update', 'push', 'splice', 'delete'],
      creation: ['crée', 'nouveau', 'nouvelle', 'génère', 'construit', 'build'],
      deletion: ['supprime', 'enlève', 'retire', 'delete', 'remove', 'clear'],
      io: ['read', 'write', 'fichier', 'file', 'save', 'load', 'fetch'],
      propagation: ['propage', 'emit', 'dispatch', 'trigger', 'notify', 'broadcast']
    };

    // Indicateurs de complexité
    this.complexityIndicators = {
      simple: ['simple', 'basique', 'juste', 'seulement', 'trivial'],
      medium: ['plusieurs', 'quelques', 'modifier', 'ajuster'],
      complex: ['refactor', 'système', 'architecture', 'tous les', 'partout', 'recursif', 'global']
    };

    // Mots à ignorer pour l'extraction de keywords
    this.stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'à', 'au', 'aux',
      'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
      'qui', 'que', 'quoi', 'dont', 'où', 'et', 'ou', 'mais', 'donc', 'car',
      'pour', 'avec', 'sans', 'dans', 'sur', 'sous', 'par', 'entre',
      'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles',
      'être', 'avoir', 'faire', 'pouvoir', 'vouloir', 'devoir',
      'est', 'sont', 'fait', 'peut', 'veut', 'doit'
    ]);
  }

  /**
   * Génère un fingerprint complet pour une tâche
   */
  generate(query, context = {}) {
    const queryLower = query.toLowerCase();

    const fingerprint = {
      intent: this.detectIntent(queryLower),
      domains: this.detectDomains(queryLower, context),
      keywords: this.extractKeywords(queryLower),
      effects: this.detectEffects(queryLower),
      roles: this.extractRoles(context),
      errorType: this.detectErrorType(queryLower),
      complexity: this.estimateComplexity(queryLower, context)
    };

    log('FingerprintGenerator', `Fingerprint: intent=${fingerprint.intent}, domains=[${fingerprint.domains.join(',')}]`);

    return fingerprint;
  }

  /**
   * Détecte l'intention principale de la requête
   */
  detectIntent(queryLower) {
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      if (patterns.some(p => queryLower.includes(p))) {
        return intent;
      }
    }
    return 'general';
  }

  /**
   * Détecte les domaines concernés par la requête
   */
  detectDomains(queryLower, context = {}) {
    const domains = new Set();

    // Détection par patterns dans la requête
    for (const [domain, patterns] of Object.entries(this.domainPatterns)) {
      if (patterns.some(p => queryLower.includes(p))) {
        domains.add(domain);
      }
    }

    // Détection via le contexte (méthodes, fichiers)
    if (context.methods) {
      for (const method of context.methods) {
        const methodLower = (method.key || method).toLowerCase();
        for (const [domain, patterns] of Object.entries(this.domainPatterns)) {
          if (patterns.some(p => methodLower.includes(p))) {
            domains.add(domain);
          }
        }
      }
    }

    // Si aucun domaine détecté, retourner 'general'
    if (domains.size === 0) {
      domains.add('general');
    }

    return Array.from(domains);
  }

  /**
   * Extrait les mots-clés significatifs de la requête
   */
  extractKeywords(queryLower) {
    // Tokenisation basique
    const words = queryLower
      .replace(/[^\wàâäéèêëïîôùûüç\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    // Filtrer les stop words
    const keywords = words.filter(w => !this.stopWords.has(w));

    // Déduplication et limite
    return [...new Set(keywords)].slice(0, 10);
  }

  /**
   * Détecte les effets attendus de la tâche
   */
  detectEffects(queryLower) {
    const effects = [];

    for (const [effect, patterns] of Object.entries(this.effectPatterns)) {
      if (patterns.some(p => queryLower.includes(p))) {
        effects.push(effect);
      }
    }

    return effects;
  }

  /**
   * Extrait les rôles des méthodes concernées depuis le contexte
   */
  extractRoles(context) {
    if (!context.methods) return [];

    const roles = new Set();
    for (const method of context.methods) {
      if (method.role) {
        roles.add(method.role);
      }
    }

    return Array.from(roles);
  }

  /**
   * Détecte si la requête mentionne un type d'erreur spécifique
   */
  detectErrorType(queryLower) {
    const errorTypes = {
      logic: ['boucle', 'condition', 'recursion', 'infini', 'incorrect', 'mauvais résultat'],
      state: ['mutation', 'undefined', 'null', 'état', 'réactif', 'ref'],
      async: ['race condition', 'timeout', 'promise', 'await', 'async'],
      integration: ['api', 'import', 'export', 'module', 'mismatch'],
      context: ['fichier', 'file not found', 'manquant', 'introuvable'],
      syntax: ['syntaxe', 'parse', 'unexpected', 'token']
    };

    for (const [type, patterns] of Object.entries(errorTypes)) {
      if (patterns.some(p => queryLower.includes(p))) {
        return type;
      }
    }

    return null;
  }

  /**
   * Estime la complexité de la tâche
   */
  estimateComplexity(queryLower, context = {}) {
    let score = 0;

    // Indicateurs textuels
    if (this.complexityIndicators.simple.some(p => queryLower.includes(p))) {
      score -= 1;
    }
    if (this.complexityIndicators.medium.some(p => queryLower.includes(p))) {
      score += 1;
    }
    if (this.complexityIndicators.complex.some(p => queryLower.includes(p))) {
      score += 2;
    }

    // Nombre de méthodes concernées
    if (context.methods) {
      if (context.methods.length > 5) score += 1;
      if (context.methods.length > 10) score += 1;
    }

    // Nombre de fichiers concernés
    if (context.files) {
      if (context.files.length > 3) score += 1;
      if (context.files.length > 7) score += 1;
    }

    // Catégorisation
    if (score <= 0) return 'simple';
    if (score <= 2) return 'medium';
    return 'complex';
  }

  /**
   * Convertit un fingerprint en chaîne canonique (pour comparaison)
   */
  toCanonicalString(fingerprint) {
    const parts = [
      `intent:${fingerprint.intent}`,
      ...fingerprint.domains.map(d => `domain:${d}`),
      ...fingerprint.keywords.slice(0, 5).map(k => `kw:${k}`),
      ...fingerprint.effects.map(e => `effect:${e}`),
      ...fingerprint.roles.map(r => `role:${r}`),
      `complexity:${fingerprint.complexity}`
    ];

    if (fingerprint.errorType) {
      parts.push(`errorType:${fingerprint.errorType}`);
    }

    return parts.sort().join('|');
  }

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
}

module.exports = { FingerprintGenerator };
