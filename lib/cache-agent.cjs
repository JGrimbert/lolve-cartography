/**
 * CacheAgent - Stocke et récupère les Q&R fréquentes
 *
 * Responsabilités:
 * - Stocker les paires question/réponse dans un fichier JSON
 * - Détecter les questions similaires via distance de Levenshtein
 * - Suggérer des réponses en cache avant d'appeler le LLM
 */

const path = require('path');
const { log } = require('./utils/logger.cjs');
const { readJSON, writeJSON } = require('./utils/file-utils.cjs');

class CacheAgent {
  constructor(config) {
    this.config = config;
    this.cachePath = path.join(config.project.rootPath, 'agents', '.cache', 'qa-cache.json');
    this.cache = null;
    this.maxEntries = config.agents.cache.maxEntries || 100;
    this.ttlMs = (config.agents.cache.ttlMinutes || 1440) * 60 * 1000;
    this.similarityThreshold = config.agents.cache.similarityThreshold || 0.85;
  }

  /**
   * Initialise le cache
   */
  async init() {
    log('CacheAgent', 'Chargement du cache...');

    this.cache = readJSON(this.cachePath) || {
      entries: [],
      stats: { hits: 0, misses: 0 }
    };

    // Nettoyer les entrées expirées
    this.cleanExpired();

    log('CacheAgent', `Cache chargé: ${this.cache.entries.length} entrées`);
    return this;
  }

  /**
   * Nettoie les entrées expirées
   */
  cleanExpired() {
    const now = Date.now();
    const before = this.cache.entries.length;

    this.cache.entries = this.cache.entries.filter(e => (now - e.timestamp) < this.ttlMs);

    const removed = before - this.cache.entries.length;
    if (removed > 0) {
      log('CacheAgent', `${removed} entrées expirées supprimées`);
      this.save();
    }
  }

  /**
   * Calcule la distance de Levenshtein normalisée (0-1, 1 = identique)
   */
  similarity(s1, s2) {
    const a = s1.toLowerCase().trim();
    const b = s2.toLowerCase().trim();

    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Distance de Levenshtein optimisée
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return 1 - (distance / maxLen);
  }

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

  /**
   * Ajoute une entrée au cache
   */
  add(query, response, metadata = {}) {
    // Éviter les doublons
    const existing = this.cache.entries.findIndex(e => this.similarity(query, e.query) > 0.95);

    if (existing >= 0) {
      // Mettre à jour l'entrée existante
      this.cache.entries[existing] = {
        query,
        response,
        metadata,
        timestamp: Date.now(),
        useCount: (this.cache.entries[existing].useCount || 0) + 1
      };
    } else {
      // Ajouter une nouvelle entrée
      this.cache.entries.push({
        query,
        response,
        metadata,
        timestamp: Date.now(),
        useCount: 1
      });

      // Limiter la taille du cache (supprimer les plus anciennes/moins utilisées)
      if (this.cache.entries.length > this.maxEntries) {
        this.cache.entries.sort((a, b) => {
          // Score basé sur récence et utilisation
          const scoreA = a.useCount + (Date.now() - a.timestamp) / -86400000;
          const scoreB = b.useCount + (Date.now() - b.timestamp) / -86400000;
          return scoreB - scoreA;
        });
        this.cache.entries = this.cache.entries.slice(0, this.maxEntries);
      }
    }

    this.save();
    log('CacheAgent', 'Réponse mise en cache', 'success');
  }

  /**
   * Sauvegarde le cache
   */
  save() {
    writeJSON(this.cachePath, this.cache);
  }

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

  /**
   * Vide le cache
   */
  clear() {
    this.cache = {
      entries: [],
      stats: { hits: 0, misses: 0 }
    };
    this.save();
    log('CacheAgent', 'Cache vidé');
  }

  /**
   * Recherche par mots-clés dans les requêtes cachées
   */
  searchByKeywords(keywords) {
    const keywordsLower = keywords.map(k => k.toLowerCase());

    return this.cache.entries.filter(entry => {
      const queryLower = entry.query.toLowerCase();
      return keywordsLower.some(kw => queryLower.includes(kw));
    });
  }
}

module.exports = { CacheAgent };
