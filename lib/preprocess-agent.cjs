/**
 * PreprocessAgent - Nettoie et enrichit les requêtes
 *
 * Responsabilités:
 * - Nettoyer les requêtes (enlever le superflu)
 * - Ajouter automatiquement le contexte pertinent
 * - Formater les requêtes de manière optimale pour le LLM
 */

const { log } = require('./utils/logger.cjs');

class PreprocessAgent {
  constructor(config) {
    this.config = config;
    this.addProjectContext = config.agents.preprocess.addProjectContext;

    // Patterns de nettoyage
    this.cleanPatterns = [
      { pattern: /s'il te pla[iî]t/gi, replacement: '' },
      { pattern: /svp/gi, replacement: '' },
      { pattern: /merci d'avance/gi, replacement: '' },
      { pattern: /est-ce que tu (peux|pourrais)/gi, replacement: '' },
      { pattern: /j'aimerais que tu/gi, replacement: '' },
      { pattern: /je voudrais que tu/gi, replacement: '' },
      { pattern: /peux-tu/gi, replacement: '' },
      { pattern: /pourrais-tu/gi, replacement: '' },
      { pattern: /\s+/g, replacement: ' ' }
    ];

    // Termes du domaine LOLVE pour enrichissement
    this.domainTerms = {
      vertex: 'Vertex (entité géométrique avec voisinage orbital Orb)',
      apex: 'Apex (point intermédiaire pouvant être promu en Vertex)',
      orb: 'Orb (collection circulaire de voisins autour d\'un Vertex)',
      rosa: 'Rosa (arrangement cyclique des valeurs Apex)',
      forma: 'Forma (polygone composé de Vertices)',
      unda: 'Unda (générateur de vague récursif via kyklos())',
      biblio: 'Biblio (orchestrateur principal, point d\'entrée genesis())',
      folia: 'Folia (configuration seed comme [3,4,6,4])',
      peri: 'Peri (liste doublement chaînée circulaire)',
      nucleus: 'Nucleus (nœud de base avec prev/item/next)',
      delta: 'Delta (nœud direction/angle, étend Trigo)',
      trigo: 'Trigo (calculs trigonométriques, projections)',
      codex: 'Codex (registre typé avec factory nova())',
      clavis: 'Clavis (générateur de clés uniques)',
      kyklos: 'kyklos() (expansion récursive de la structure)',
      circumcenter: 'circumcenter (centre du cercle circonscrit)'
    };

    // Synonymes courants
    this.synonyms = {
      'polygone': 'forma',
      'forme': 'forma',
      'sommet': 'vertex',
      'point': 'apex',
      'voisin': 'orb',
      'angle': 'delta',
      'seed': 'folia',
      'configuration': 'folia',
      'registre': 'codex',
      'clé': 'clavis',
      'expansion': 'unda/kyklos'
    };
  }

  /**
   * Initialise l'agent
   */
  async init() {
    log('PreprocessAgent', 'Initialisé');
    return this;
  }

  /**
   * Traite une requête complète
   */
  process(query, context = {}) {
    log('PreprocessAgent', 'Traitement de la requête...');

    let processed = query;

    // 1. Nettoyage de base
    processed = this.clean(processed);

    // 2. Normalisation des termes du domaine
    processed = this.normalizeTerms(processed);

    // 3. Détection d'intention
    const intent = this.detectIntent(processed);

    // 4. Enrichissement avec contexte
    const enriched = this.enrich(processed, context, intent);

    log('PreprocessAgent', `Intent détecté: ${intent.type}`, 'success');

    // 5. Détection des domaines
    const domains = this.detectDomains(processed, context);

    // 6. Génération d'un fingerprint partiel (sera complété par FingerprintGenerator)
    const partialFingerprint = {
      intent: intent.type,
      domains,
      keywords: this.extractKeywords(processed),
      complexity: this.estimateComplexity(processed, context)
    };

    return {
      original: query,
      cleaned: processed,
      enriched,
      intent,
      detectedTerms: this.extractDomainTerms(query),
      domains,
      partialFingerprint
    };
  }

  /**
   * Détecte les domaines concernés par la requête
   */
  detectDomains(query, context = {}) {
    const queryLower = query.toLowerCase();
    const domains = new Set();

    // Patterns de domaines
    const domainPatterns = {
      math: ['calcul', 'compute', 'area', 'angle', 'distance', 'trigo', 'circumcenter', 'projection'],
      domain: Object.keys(this.domainTerms),
      rendering: ['render', 'draw', 'canvas', 'svg', 'affich', 'visualis', 'color', 'style'],
      ui: ['bouton', 'button', 'click', 'input', 'form', 'dialog', 'modal', 'menu'],
      debug: ['debug', 'log', 'trace', 'inspect', 'breakpoint']
    };

    for (const [domain, patterns] of Object.entries(domainPatterns)) {
      if (patterns.some(p => queryLower.includes(p))) {
        domains.add(domain);
      }
    }

    // Détection via le contexte
    if (context.relevantFiles) {
      for (const file of context.relevantFiles) {
        const fileLower = (file.path || file).toLowerCase();
        if (fileLower.includes('render') || fileLower.includes('draw')) {
          domains.add('rendering');
        }
        if (fileLower.includes('component') || fileLower.includes('view')) {
          domains.add('ui');
        }
      }
    }

    return Array.from(domains.size > 0 ? domains : ['general']);
  }

  /**
   * Extrait les mots-clés significatifs
   */
  extractKeywords(query) {
    const stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'à', 'au', 'aux',
      'ce', 'cette', 'ces', 'et', 'ou', 'mais', 'donc', 'car',
      'pour', 'avec', 'sans', 'dans', 'sur', 'sous', 'par', 'entre',
      'qui', 'que', 'quoi', 'dont', 'où'
    ]);

    const words = query.toLowerCase()
      .replace(/[^\wàâäéèêëïîôùûüç\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return [...new Set(words)].slice(0, 10);
  }

  /**
   * Estime la complexité de la requête
   */
  estimateComplexity(query, context = {}) {
    const queryLower = query.toLowerCase();
    let score = 0;

    // Indicateurs textuels
    if (['simple', 'basique', 'juste'].some(w => queryLower.includes(w))) score -= 1;
    if (['plusieurs', 'quelques'].some(w => queryLower.includes(w))) score += 1;
    if (['refactor', 'système', 'tous les', 'partout'].some(w => queryLower.includes(w))) score += 2;

    // Contexte
    if (context.relevantFiles?.length > 3) score += 1;
    if (context.relevantFiles?.length > 7) score += 1;

    if (score <= 0) return 'simple';
    if (score <= 2) return 'medium';
    return 'complex';
  }

  /**
   * Nettoie la requête des formules de politesse et du superflu
   */
  clean(query) {
    let cleaned = query;

    for (const { pattern, replacement } of this.cleanPatterns) {
      cleaned = cleaned.replace(pattern, replacement);
    }

    return cleaned.trim();
  }

  /**
   * Normalise les termes du domaine (synonymes → termes canoniques)
   */
  normalizeTerms(query) {
    let normalized = query;

    for (const [synonym, canonical] of Object.entries(this.synonyms)) {
      const regex = new RegExp(`\\b${synonym}s?\\b`, 'gi');
      normalized = normalized.replace(regex, canonical);
    }

    return normalized;
  }

  /**
   * Détecte l'intention de la requête
   */
  detectIntent(query) {
    const queryLower = query.toLowerCase();

    // Patterns d'intention
    const intents = [
      {
        type: 'create',
        patterns: ['ajoute', 'crée', 'implémente', 'nouveau', 'nouvelle'],
        description: 'Création de nouveau code'
      },
      {
        type: 'modify',
        patterns: ['modifie', 'change', 'met à jour', 'corrige', 'fixe', 'améliore'],
        description: 'Modification de code existant'
      },
      {
        type: 'explain',
        patterns: ['explique', 'comment', 'pourquoi', 'qu\'est-ce', 'c\'est quoi'],
        description: 'Demande d\'explication'
      },
      {
        type: 'debug',
        patterns: ['bug', 'erreur', 'problème', 'ne fonctionne pas', 'crash'],
        description: 'Débogage'
      },
      {
        type: 'optimize',
        patterns: ['optimise', 'performance', 'rapide', 'lent', 'mémoire'],
        description: 'Optimisation'
      },
      {
        type: 'refactor',
        patterns: ['refactor', 'restructure', 'réorganise', 'simplifie'],
        description: 'Refactoring'
      },
      {
        type: 'test',
        patterns: ['test', 'vérifie', 'valide', 'assertion'],
        description: 'Tests'
      }
    ];

    for (const intent of intents) {
      if (intent.patterns.some(p => queryLower.includes(p))) {
        return intent;
      }
    }

    return { type: 'general', description: 'Requête générale' };
  }

  /**
   * Extrait les termes du domaine présents dans la requête
   */
  extractDomainTerms(query) {
    const queryLower = query.toLowerCase();
    const found = [];

    for (const [term, description] of Object.entries(this.domainTerms)) {
      if (queryLower.includes(term)) {
        found.push({ term, description });
      }
    }

    return found;
  }

  /**
   * Enrichit la requête avec le contexte nécessaire
   */
  enrich(query, context, intent) {
    const parts = [];

    // Contexte projet si activé
    if (this.addProjectContext) {
      parts.push(`[Projet: ${this.config.project.name} - Moteur topologique JS/Vue]`);
    }

    // Termes du domaine détectés
    const domainTerms = this.extractDomainTerms(query);
    if (domainTerms.length > 0) {
      parts.push(`[Termes: ${domainTerms.map(t => t.term).join(', ')}]`);
    }

    // Catégorie de fichiers concernés
    if (context.category) {
      parts.push(`[Catégorie: ${context.category}]`);
    }

    // Fichiers pertinents
    if (context.relevantFiles && context.relevantFiles.length > 0) {
      const fileNames = context.relevantFiles.slice(0, 5).map(f => f.path || f).join(', ');
      parts.push(`[Fichiers: ${fileNames}]`);
    }

    // Type d'intention
    parts.push(`[Intent: ${intent.type}]`);

    // Requête originale
    parts.push(query);

    return parts.join('\n');
  }

  /**
   * Génère un prompt système optimisé pour le LLM
   */
  generateSystemPrompt(context = {}) {
    return `Tu es un assistant spécialisé dans le projet LOLVE, un moteur de topologie/graphes en JavaScript (Vue/Vite).

CONVENTIONS DU PROJET:
- Nomenclature latine: Biblio, Folia, Vertex, Apex, Orb, Rosa, Forma, Unda, Peri, Nucleus
- Structure de données: Listes circulaires doublement chaînées (Nucleus/Peri)
- State management: Vue 3 Composition API avec composables
- Tests: Inline via magic comments /* TEST: ClassName */

TERMES CLÉS:
${Object.entries(this.domainTerms).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

${context.additionalContext || ''}

Réponds de manière concise et technique. Privilégie les solutions qui respectent les patterns existants du projet.`;
  }

  /**
   * Estime le nombre de tokens d'un texte (approximatif)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
}

module.exports = { PreprocessAgent };
