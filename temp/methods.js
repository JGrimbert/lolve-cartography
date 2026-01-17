/**
 * FICHIER TEMPORAIRE - Méthodes extraites pour modification
 *
 * Généré le: 2026-01-16T07:00:05.214Z
 * Méthodes: ContextAgent.createSearchSession
 *
 * INSTRUCTIONS:
 * - Modifiez les méthodes ci-dessous
 * - Ne changez PAS les noms de méthodes
 * - La réinjection est AUTOMATIQUE (watcher MCP)
 */

// ============================================
// Classe: ContextAgent
// ============================================

// Méthode: ContextAgent.createSearchSession
// Fichier: lib\context-agent.cjs:348
// Score: 5
  // ==========================================================================
  // SEARCH SESSION
  // ==========================================================================

  /**
   * Create a new search session
   * @param {string} query - Initial query
   * @param {Object} options - Search options
   * @returns {SearchSession} New session
   */
  createSearchSession(query, options = {}) {
    return new SearchSession(this, query, options);
  }

