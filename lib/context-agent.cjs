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
const { log } = require('./utils/logger.cjs');
const { listFiles, readFile, readJSON, writeJSON } = require('./utils/file-utils.cjs');
const { MethodIndexer, AnnotationCache } = require('./method-indexer.cjs');

// Sub-modules
const { FileAnalyzer } = require('./context/file-analyzer.cjs');
const { MethodSearch } = require('./context/method-search.cjs');
const { CartographyGenerator } = require('./context/cartography-generator.cjs');
const { SearchSession } = require('./context/search-session.cjs');

// Cache path for standalone usage
const CACHE_PATH = path.resolve(__dirname, '.cache');

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

  /**
   * Find relevant files for a query
   */
  findRelevantFiles(query, maxFiles = 10) {
    log('ContextAgent', `Searching files for: "${query.substring(0, 50)}..."`);

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    const scored = [];

    for (const [filePath, info] of Object.entries(this.index.files)) {
      let score = 0;

      // Score based on keywords
      for (const word of queryWords) {
        if (info.keywords.some(k => k.includes(word) || word.includes(k))) {
          score += 3;
        }
        if (info.name.toLowerCase().includes(word)) {
          score += 2;
        }
        if (info.exports.some(e => e.toLowerCase().includes(word))) {
          score += 2;
        }
      }

      // Score based on category detected in query
      const detectedCategory = this.detectQueryCategory(queryLower);
      if (detectedCategory && info.category === detectedCategory) {
        score += 5;
      }

      if (score > 0) {
        scored.push({ path: filePath, info, score });
      }
    }

    // Sort by score and limit
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, maxFiles);

    log('ContextAgent', `${results.length} relevant files found`, 'success');

    return results;
  }

  /**
   * Detect the category likely concerned by the query
   */
  detectQueryCategory(query) {
    const categoryKeywords = this.config.categories;

    for (const [category, catConfig] of Object.entries(categoryKeywords)) {
      if (catConfig.keywords.some(kw => query.includes(kw))) {
        return category;
      }
    }

    return null;
  }

  /**
   * Get content of selected files
   */
  getFilesContent(files) {
    const contents = [];

    for (const file of files) {
      const filePath = typeof file === 'string' ? file : file.path;
      const content = readFile(filePath);

      if (content) {
        contents.push({
          path: filePath,
          content: content.length > 5000 ? content.substring(0, 5000) + '\n// ... truncated' : content
        });
      }
    }

    return contents;
  }

  /**
   * Generate a context summary for the LLM
   */
  generateContextSummary(query) {
    const relevantFiles = this.findRelevantFiles(query);
    const detectedCategory = this.detectQueryCategory(query.toLowerCase());

    return {
      query,
      detectedCategory,
      relevantFiles: relevantFiles.map(f => ({
        path: f.info.path,
        category: f.info.category,
        exports: f.info.exports,
        keywords: f.info.keywords,
        score: f.score
      })),
      projectInfo: {
        name: this.config.project.name,
        conventions: this.config.conventions
      }
    };
  }

  /**
   * Get files from a specific category
   */
  getFilesByCategory(category) {
    return this.index.categories[category] || [];
  }

  /**
   * Search for a specific export
   */
  findExport(exportName) {
    for (const [filePath, info] of Object.entries(this.index.files)) {
      if (info.exports.includes(exportName)) {
        return { path: filePath, info };
      }
    }
    return null;
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
   * Extract code from selected methods
   * @param {Array} methods - Method list (from findRelevantMethods)
   * @returns {Array} List with each method's code
   */
  getMethodsContent(methods) {
    return this.methodSearch.getMethodsContent(methods);
  }

  /**
   * Search methods by specific criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array} List of matching methods
   */
  searchMethods(criteria = {}) {
    return this.methodSearch.searchMethods(criteria);
  }

  /**
   * Generate optimized context for LLM (method level)
   * Returns only metadata, not code
   * @param {string} query - User query
   * @param {Object} options - Search options
   */
  generateMethodContext(query, options = {}) {
    return this.methodSearch.generateMethodContext(query, options);
  }

  /**
   * Group methods by file
   */
  groupMethodsByFile(methods) {
    return this.methodSearch.groupMethodsByFile(methods);
  }

  /**
   * Get method code by their keys
   * @param {Array<string>} methodKeys - List of method keys (e.g., ['Orb.novaFormae'])
   */
  extractMethodsByKeys(methodKeys) {
    return this.methodSearch.extractMethodsByKeys(methodKeys);
  }

  // ==========================================================================
  // CARTOGRAPHY (delegated to CartographyGenerator)
  // ==========================================================================

  /**
   * Generate a Markdown cartography file
   */
  generateCartography(outputPath = null) {
    const generator = new CartographyGenerator(this.index);
    return generator.generate(outputPath);
  }

  /**
   * Return readable category title
   */
  getCategoryTitle(category) {
    return CartographyGenerator.CATEGORY_TITLES[category] || category;
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
