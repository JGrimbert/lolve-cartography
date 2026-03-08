/**
 * ExperienceMemory - Système de mémoire d'expérience pour l'apprentissage opérationnel
 *
 * Composants:
 * - TFIDFEmbedding: Génère des embeddings vectoriels TF-IDF pour la similarité
 * - ExperienceMemory: Stocke les événements (succès/échecs) avec leurs contextes
 * - RiskInferenceEngine: Calcule les risques et génère des warnings/contraintes
 */

const path = require('path');
const crypto = require('crypto');
const { log } = require('./utils/logger.cjs');
const { readJSON, writeJSON } = require('./utils/file-utils.cjs');

/**
 * TFIDFEmbedding - Génère des embeddings TF-IDF légers
 */
class TFIDFEmbedding {
  constructor() {
    this.vocabulary = new Map(); // terme -> index
    this.idf = new Map();        // terme -> IDF score
    this.documentCount = 0;
  }

  /**
   * Met à jour le vocabulaire et IDF avec un nouveau document
   */
  addDocument(terms) {
    this.documentCount++;
    const uniqueTerms = new Set(terms);

    for (const term of uniqueTerms) {
      // Mise à jour document frequency
      if (!this.idf.has(term)) {
        this.vocabulary.set(term, this.vocabulary.size);
        this.idf.set(term, 1);
      } else {
        this.idf.set(term, this.idf.get(term) + 1);
      }
    }
  }

  /**
   * Calcule l'embedding TF-IDF d'un document
   */
  embed(terms) {
    if (this.vocabulary.size === 0) {
      return [];
    }

    // Calculer TF
    const tf = new Map();
    for (const term of terms) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }

    // Construire le vecteur sparse
    const vector = new Array(this.vocabulary.size).fill(0);

    for (const [term, count] of tf) {
      const idx = this.vocabulary.get(term);
      if (idx !== undefined) {
        // TF-IDF = (count / totalTerms) * log(N / df)
        const tfScore = count / terms.length;
        const idfScore = Math.log((this.documentCount + 1) / (this.idf.get(term) + 1)) + 1;
        vector[idx] = tfScore * idfScore;
      }
    }

    // Normaliser
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  /**
   * Calcule la similarité cosinus entre deux vecteurs
   */
  cosineSimilarity(v1, v2) {
    if (v1.length !== v2.length || v1.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
    }

    // Les vecteurs sont déjà normalisés
    return dotProduct;
  }

  /**
   * Sérialise l'état pour sauvegarde
   */
  serialize() {
    return {
      vocabulary: Array.from(this.vocabulary.entries()),
      idf: Array.from(this.idf.entries()),
      documentCount: this.documentCount
    };
  }

  /**
   * Restaure l'état depuis une sauvegarde
   */
  deserialize(data) {
    if (!data) return;
    this.vocabulary = new Map(data.vocabulary || []);
    this.idf = new Map(data.idf || []);
    this.documentCount = data.documentCount || 0;
  }
}

/**
 * ExperienceMemory - Stocke et recherche les expériences passées
 */
class ExperienceMemory {
  constructor(config) {
    this.config = config;
    const rootPath = config?.project?.rootPath || process.cwd();
    this.storagePath = path.join(rootPath, '.cache', 'experience-memory.json');

    this.events = [];
    this.patterns = {};
    this.tfidf = new TFIDFEmbedding();
    this.maxEvents = 500;
    this.currentEventId = null;
  }

  /**
   * Initialise la mémoire
   */
  async init() {
    log('ExperienceMemory', 'Chargement de la mémoire...');

    const data = readJSON(this.storagePath);
    if (data) {
      this.events = data.events || [];
      this.patterns = data.patterns || {};
      this.tfidf.deserialize(data.tfidf);
    }

    log('ExperienceMemory', `${this.events.length} expériences chargées`);
    return this;
  }

  /**
   * Crée un nouvel événement pour une tâche
   */
  createEvent(query, fingerprint, context = {}) {
    const id = `evt-${crypto.randomUUID().slice(0, 8)}`;

    // Termes pour l'embedding (depuis le fingerprint)
    const terms = this.fingerprintToTerms(fingerprint);
    this.tfidf.addDocument(terms);
    const embedding = this.tfidf.embed(terms);

    const event = {
      id,
      timestamp: new Date().toISOString(),
      task: {
        query,
        fingerprint
      },
      context: {
        methods: context.methods?.slice(0, 20).map(m => m.key || m) || [],
        files: context.files || [],
        complexity: fingerprint.complexity
      },
      decision: {
        proposalChosen: null,
        approach: null
      },
      action: {
        modificationsApplied: []
      },
      outcome: {
        status: 'pending', // pending, success, failure
        errorType: null,
        errorMessage: null
      },
      cause: {
        category: null,
        blockedApproach: null,
        lesson: null
      },
      embedding
    };

    this.events.push(event);
    this.currentEventId = id;

    // Limiter la taille
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    this.save();
    log('ExperienceMemory', `Événement créé: ${id}`);

    return event;
  }

  /**
   * Convertit un fingerprint en liste de termes
   */
  fingerprintToTerms(fingerprint) {
    const terms = [];

    terms.push(`intent:${fingerprint.intent}`);

    for (const domain of fingerprint.domains || []) {
      terms.push(`domain:${domain}`);
    }

    for (const kw of (fingerprint.keywords || []).slice(0, 5)) {
      terms.push(`kw:${kw}`);
    }

    for (const effect of fingerprint.effects || []) {
      terms.push(`effect:${effect}`);
    }

    for (const role of fingerprint.roles || []) {
      terms.push(`role:${role}`);
    }

    if (fingerprint.errorType) {
      terms.push(`errorType:${fingerprint.errorType}`);
    }

    terms.push(`complexity:${fingerprint.complexity}`);

    return terms;
  }

  /**
   * Met à jour l'événement courant avec une décision
   */
  updateDecision(proposalChosen, approach) {
    const event = this.getCurrentEvent();
    if (!event) return;

    event.decision = {
      proposalChosen,
      approach
    };

    this.save();
  }

  /**
   * Enregistre les modifications appliquées
   */
  recordModifications(modifications) {
    const event = this.getCurrentEvent();
    if (!event) return;

    event.action.modificationsApplied = modifications;
    this.save();
  }

  /**
   * Marque l'événement courant comme succès
   */
  markSuccess(lesson = null) {
    const event = this.getCurrentEvent();
    if (!event) return;

    event.outcome.status = 'success';
    if (lesson) {
      event.cause.lesson = lesson;
    }

    this.updatePatterns(event, 'success');
    this.save();

    log('ExperienceMemory', `Événement ${event.id} marqué comme succès`, 'success');
  }

  /**
   * Marque l'événement courant comme échec
   */
  markFailure(errorType, errorMessage, cause = {}) {
    const event = this.getCurrentEvent();
    if (!event) return;

    event.outcome.status = 'failure';
    event.outcome.errorType = errorType;
    event.outcome.errorMessage = errorMessage;
    event.cause = {
      category: cause.category || this.categorizeError(errorType, errorMessage),
      blockedApproach: cause.blockedApproach || event.decision.approach,
      lesson: cause.lesson || null
    };

    this.updatePatterns(event, 'failure');
    this.save();

    log('ExperienceMemory', `Événement ${event.id} marqué comme échec: ${errorType}`, 'warning');
  }

  /**
   * Ajoute une leçon à l'événement courant ou le plus récent
   */
  addLesson(lesson) {
    const event = this.getCurrentEvent() || this.events[this.events.length - 1];
    if (!event) return;

    event.cause.lesson = lesson;
    this.save();

    log('ExperienceMemory', `Leçon ajoutée à ${event.id}`);
  }

  /**
   * Catégorise automatiquement une erreur
   */
  categorizeError(errorType, errorMessage) {
    const msg = (errorMessage || '').toLowerCase();

    if (msg.includes('recursion') || msg.includes('stack') || msg.includes('infinite')) {
      return 'logic';
    }
    if (msg.includes('undefined') || msg.includes('null') || msg.includes('cannot read')) {
      return 'state';
    }
    if (msg.includes('timeout') || msg.includes('promise') || msg.includes('async')) {
      return 'async';
    }
    if (msg.includes('import') || msg.includes('module') || msg.includes('export')) {
      return 'integration';
    }
    if (msg.includes('file') || msg.includes('not found') || msg.includes('enoent')) {
      return 'context';
    }
    if (msg.includes('syntax') || msg.includes('unexpected')) {
      return 'syntax';
    }

    return errorType || 'unknown';
  }

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

  /**
   * Génère la signature de pattern depuis un fingerprint
   */
  getPatternSignature(fingerprint) {
    const parts = [
      `intent:${fingerprint.intent}`,
      ...fingerprint.domains.map(d => `domain:${d}`)
    ];

    if (fingerprint.errorType) {
      parts.push(`errorType:${fingerprint.errorType}`);
    }

    return parts.sort().join('+');
  }

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

  /**
   * Obtient l'événement courant
   */
  getCurrentEvent() {
    if (!this.currentEventId) return null;
    return this.events.find(e => e.id === this.currentEventId);
  }

  /**
   * Obtient un événement par ID
   */
  getEvent(id) {
    return this.events.find(e => e.id === id);
  }

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

  /**
   * Sauvegarde la mémoire
   */
  save() {
    writeJSON(this.storagePath, {
      events: this.events,
      patterns: this.patterns,
      tfidf: this.tfidf.serialize()
    });
  }
}

/**
 * RiskInferenceEngine - Calcule les risques et génère des recommandations
 */
class RiskInferenceEngine {
  constructor(experienceMemory) {
    this.memory = experienceMemory;
    this.riskThreshold = 0.4; // >= 40% d'échecs = risque
  }

  /**
   * Analyse les risques pour une nouvelle tâche
   */
  analyzeRisks(fingerprint, similarExperiences = []) {
    const warnings = [];
    const blockedApproaches = [];
    const recommendations = [];

    // 1. Analyse des expériences similaires
    for (const { event, similarity } of similarExperiences) {
      if (event.outcome.status === 'failure') {
        const warning = this.createWarningFromFailure(event, similarity);
        if (warning) {
          warnings.push(warning);
        }

        if (event.cause.blockedApproach) {
          blockedApproaches.push({
            approach: event.cause.blockedApproach,
            reason: event.cause.lesson || event.outcome.errorMessage,
            fromEvent: event.id
          });
        }
      }

      if (event.outcome.status === 'success' && event.cause.lesson) {
        recommendations.push({
          type: 'learned_success',
          message: event.cause.lesson,
          similarity,
          fromEvent: event.id
        });
      }
    }

    // 2. Analyse des patterns globaux
    const patternRisk = this.analyzePatternRisk(fingerprint);
    if (patternRisk) {
      warnings.push(patternRisk);
    }

    // 3. Risques spécifiques au fingerprint
    const specificRisks = this.detectSpecificRisks(fingerprint);
    warnings.push(...specificRisks);

    return {
      warnings,
      blockedApproaches,
      recommendations,
      overallRiskLevel: this.calculateOverallRisk(warnings, blockedApproaches)
    };
  }

  /**
   * Crée un warning depuis un échec passé
   */
  createWarningFromFailure(event, similarity) {
    const confidenceLabel = similarity >= 0.7 ? 'haute' : similarity >= 0.5 ? 'moyenne' : 'faible';

    return {
      type: 'similar_failure',
      severity: similarity >= 0.7 ? 'high' : 'medium',
      message: `Tâche similaire (${(similarity * 100).toFixed(0)}%) a échoué: ${event.outcome.errorType}`,
      details: event.outcome.errorMessage,
      lesson: event.cause.lesson,
      confidence: confidenceLabel,
      fromEvent: event.id
    };
  }

  /**
   * Analyse le risque basé sur les patterns globaux
   */
  analyzePatternRisk(fingerprint) {
    const signature = this.memory.getPatternSignature(fingerprint);
    const pattern = this.memory.patterns[signature];

    if (!pattern) return null;

    const total = pattern.successes + pattern.failures;
    if (total < 2) return null; // Pas assez de données

    const failureRate = pattern.failures / total;

    if (failureRate >= this.riskThreshold) {
      return {
        type: 'pattern_risk',
        severity: failureRate >= 0.6 ? 'high' : 'medium',
        message: `Pattern ${signature} a ${(failureRate * 100).toFixed(0)}% d'échecs`,
        details: `${pattern.failures} échecs sur ${total} tentatives`,
        confidence: total >= 5 ? 'haute' : 'moyenne'
      };
    }

    return null;
  }

  /**
   * Détecte des risques spécifiques au fingerprint
   */
  detectSpecificRisks(fingerprint) {
    const risks = [];

    // Risque de complexité élevée
    if (fingerprint.complexity === 'complex') {
      risks.push({
        type: 'complexity',
        severity: 'medium',
        message: 'Tâche de complexité élevée détectée',
        details: 'Considérer de découper en sous-tâches'
      });
    }

    // Risque sur les domaines sensibles
    if (fingerprint.domains.includes('state')) {
      risks.push({
        type: 'domain_risk',
        severity: 'medium',
        message: 'Modification d\'état réactif',
        details: 'Vérifier la propagation des changements'
      });
    }

    // Risque async
    if (fingerprint.domains.includes('async') && fingerprint.intent === 'modify') {
      risks.push({
        type: 'async_risk',
        severity: 'medium',
        message: 'Modification de code asynchrone',
        details: 'Attention aux race conditions et aux ordres d\'exécution'
      });
    }

    // Risque de propagation
    if (fingerprint.effects.includes('propagation')) {
      risks.push({
        type: 'propagation_risk',
        severity: 'low',
        message: 'Effet de propagation détecté',
        details: 'Vérifier les conditions de terminaison'
      });
    }

    return risks;
  }

  /**
   * Calcule le niveau de risque global
   */
  calculateOverallRisk(warnings, blockedApproaches) {
    let score = 0;

    for (const warning of warnings) {
      if (warning.severity === 'high') score += 3;
      else if (warning.severity === 'medium') score += 2;
      else score += 1;
    }

    score += blockedApproaches.length * 2;

    if (score === 0) return 'low';
    if (score <= 3) return 'medium';
    return 'high';
  }

  /**
   * Génère un rapport de risque formaté
   */
  formatRiskReport(analysis) {
    const lines = [];

    if (analysis.warnings.length > 0) {
      lines.push('⚠️  AVERTISSEMENTS:');
      for (const warning of analysis.warnings) {
        const icon = warning.severity === 'high' ? '🔴' : warning.severity === 'medium' ? '🟡' : '🟢';
        lines.push(`  ${icon} ${warning.message}`);
        if (warning.details) {
          lines.push(`     ${warning.details}`);
        }
        if (warning.lesson) {
          lines.push(`     💡 Leçon: ${warning.lesson}`);
        }
      }
    }

    if (analysis.blockedApproaches.length > 0) {
      lines.push('');
      lines.push('🚫 APPROCHES À ÉVITER:');
      for (const blocked of analysis.blockedApproaches) {
        lines.push(`  - ${blocked.approach}`);
        if (blocked.reason) {
          lines.push(`    Raison: ${blocked.reason}`);
        }
      }
    }

    if (analysis.recommendations.length > 0) {
      lines.push('');
      lines.push('💡 RECOMMANDATIONS:');
      for (const rec of analysis.recommendations) {
        lines.push(`  - ${rec.message}`);
      }
    }

    lines.push('');
    lines.push(`📊 Niveau de risque global: ${analysis.overallRiskLevel.toUpperCase()}`);

    return lines.join('\n');
  }
}

module.exports = { ExperienceMemory, TFIDFEmbedding, RiskInferenceEngine };
