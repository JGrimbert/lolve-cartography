/**
 * ContextAgent - Analyzes queries and identifies relevant files/methods
 *
 * Responsibilities:
 * - Index all project files with their responsibilities
 * - Classify files by categories (math, rendering, UI, domain)
 * - Select relevant files based on query context
 * - Search at method level for fine granularity
 * - Extract targeted method code on demand
 *
 * This module coordinates the following sub-modules:
 * - FileAnalyzer: File analysis and metadata extraction
 * - MethodSearch: Method-level search and context
 * - CartographyGenerator: Markdown cartography generation
 * - SearchSession: Iterative search with refinement
 */

const path = require('path');
const { log } = require('../utils/logger.cjs');
const { listFiles, readFile, readJSON, writeJSON } = require('../utils/file-utils.cjs');
const { MethodIndexer, AnnotationCache } = require('./method-indexer.cjs');

// Sub-modules
const { FileAnalyzer } = require('../context/file-analyzer.cjs');
const { MethodSearch } = require('../context/method-search.cjs');
const { SearchSession } = require('../context/search-session.cjs');

// Cache path - uses project directory, not module directory
const PROJECT_PATH = process.env.LC_PROJECT_PATH || process.cwd();
const CACHE_PATH = path.join(PROJECT_PATH, '.cache');

class ContextAgent {
  constructor(config) {
    this.config = config;
    this.rootPath = config.project.rootPath;
    this.indexPath = path.join(CACHE_PATH, 'file-index.json');
    this.index = null;
    this.methodIndexer = new MethodIndexer();
    this.annotationCache = new AnnotationCache();

    // Initialize sub-modules
    this.fileAnalyzer = new FileAnalyzer(this.rootPath);
    this.methodSearch = null; // Initialized after methodIndexer is loaded
  }

  /**
   * Initialize or load the file and method index
   */
  async init() {
    log('ContextAgent', 'Initializing...');

    // Load existing file index or create it
    this.index = readJSON(this.indexPath);

    if (!this.index || this.isIndexStale()) {
      log('ContextAgent', 'Creating file index...');
      this.index = await this.buildIndex();
      writeJSON(this.indexPath, this.index);
      log('ContextAgent', `Index created: ${Object.keys(this.index.files).length} files`, 'success');
    } else {
      log('ContextAgent', `Index loaded: ${Object.keys(this.index.files).length} files`);
    }

    // Load method index (fine granularity)
    this.methodIndexer.loadIndex();
    const methodCount = Object.keys(this.methodIndexer.index.methods || {}).length;
    if (methodCount > 0) {
      log('ContextAgent', `Method index loaded: ${methodCount} methods`);
    } else {
      log('ContextAgent', 'Method index empty - run "npm run annotate:index"', 'warn');
    }

    // Initialize method search after indexer is loaded
    this.methodSearch = new MethodSearch(this.methodIndexer, this.annotationCache);

    // Load JIT annotation cache
    this.annotationCache.load();
    const cacheStats = this.annotationCache.getStats();
    if (cacheStats.total > 0) {
      log('ContextAgent', `JIT annotation cache: ${cacheStats.total} entries`);
    }

    return this;
  }

  /**
   * Check if index is stale (> 5 minutes)
   */
  isIndexStale() {
    if (!this.index || !this.index.timestamp) return true;
    const age = Date.now() - this.index.timestamp;
    return age > (this.config.agents.context.indexRefreshInterval || 300000);
  }

  /**
   * Build the complete file index
   */
  async buildIndex() {
    const srcPath = path.join(this.rootPath, this.config.project.srcPath || 'src');
    const files = listFiles(srcPath, (name) => {
      const ext = path.extname(name).toLowerCase();
      return ['.js', '.vue', '.ts'].includes(ext);
    });

    const index = {
      timestamp: Date.now(),
      categories: {
        math: [],
        domain: [],
        rendering: [],
        ui: [],
        debug: [],
        composables: [],
        utilities: []
      },
      files: {}
    };

    for (const filePath of files) {
      const fileInfo = this.fileAnalyzer.analyzeFile(filePath);
      index.files[filePath] = fileInfo;

      if (fileInfo.category && index.categories[fileInfo.category]) {
        index.categories[fileInfo.category].push(filePath);
      }
    }

    return index;
  }

  // ==========================================================================
  // METHOD-LEVEL GRANULARITY (delegated to MethodSearch)
  // ==========================================================================

  /**
   * Find relevant methods for a query
   * @param {string} query - User query
   * @param {Object} options - Search options
   * @returns {Array} List of relevant methods with their score
   */
  findRelevantMethods(query, options = {}) {
    return this.methodSearch.findRelevantMethods(query, options);
  }

  /**
   * Search methods by specific criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array} List of matching methods
   */
  searchMethods(criteria = {}) {
    return this.methodSearch.searchMethods(criteria);
  }

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
}

module.exports = { ContextAgent, SearchSession, AnnotationCache };
