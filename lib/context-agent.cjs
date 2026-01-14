/**
 * ContextAgent - Analyzes queries and identifies relevant files/methods
 *
 * Responsibilities:
 * - Index all project files with their responsibilities
 * - Classify files by categories (math, rendering, UI, domain)
 * - Select relevant files based on query context
 * - Search at method level for fine granularity
 * - Extract targeted method code on demand
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./utils/logger.cjs');
const { listFiles, readFile, readJSON, writeJSON } = require('./utils/file-utils.cjs');
const { MethodIndexer, AnnotationCache } = require('./method-indexer.cjs');

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
    const srcPath = path.join(this.rootPath, 'src');
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
      const fileInfo = this.analyzeFile(filePath);
      index.files[filePath] = fileInfo;

      if (fileInfo.category && index.categories[fileInfo.category]) {
        index.categories[fileInfo.category].push(filePath);
      }
    }

    return index;
  }

  /**
   * Analyze a file to determine its category and responsibility
   */
  analyzeFile(filePath) {
    const content = readFile(filePath) || '';
    const relativePath = path.relative(this.rootPath, filePath);
    const fileName = path.basename(filePath);

    // Category detection based on path and content
    const category = this.detectCategory(relativePath, content);

    // Export extraction
    const exports = this.extractExports(content);

    // Internal dependency extraction
    const dependencies = this.extractDependencies(content);

    // Relevant keyword extraction
    const keywords = this.extractKeywords(content, category);

    // JSDoc extraction (classes and methods)
    const jsdoc = this.extractJSDoc(content);

    return {
      name: fileName,
      path: relativePath,
      category,
      exports,
      dependencies,
      keywords,
      jsdoc,
      lines: content.split('\n').length
    };
  }

  /**
   * Extract JSDoc from classes and methods with their @role
   */
  extractJSDoc(content) {
    const result = {
      classDoc: null,
      methods: []
    };

    // Pattern for class JSDoc (before "class ClassName")
    const classDocPattern = /\/\*\*\s*([\s\S]*?)\s*\*\/\s*(?:export\s+)?class\s+(\w+)/g;
    const classMatch = classDocPattern.exec(content);

    if (classMatch) {
      result.classDoc = {
        name: classMatch[2],
        description: this.parseJSDocDescription(classMatch[1]),
        ...this.parseJSDocTags(classMatch[1])
      };
    }

    // Pattern for method JSDoc:
    // - classic methods: methodName()
    // - private methods: #methodName()
    // - static methods: static methodName()
    // - arrow functions: methodName = () =>
    // - supports */ and **/ as comment end
    // - [^*] prevents capturing multiple JSDoc blocks
    const methodDocPattern = /\/\*\*([^*]*(?:\*(?!\/)[^*]*)*)\*+\/\s*(?:static\s+)?(?:async\s+)?(#?\w+)\s*(?:\(|=\s*(?:\([^)]*\)|[^=])*=>)/g;
    let methodMatch;

    while ((methodMatch = methodDocPattern.exec(content)) !== null) {
      let methodName = methodMatch[2];
      // Ignore constructors and class names
      if (methodName === 'constructor' || methodName === result.classDoc?.name) continue;

      const tags = this.parseJSDocTags(methodMatch[1]);
      const description = this.parseJSDocDescription(methodMatch[1]);

      // Only keep methods with @role or description
      if (tags.role || description) {
        result.methods.push({
          name: methodName,
          description,
          ...tags
        });
      }
    }

    return result;
  }

  /**
   * Parse the description from a JSDoc block (text before @tags)
   */
  parseJSDocDescription(jsdocContent) {
    // Clean * at line start
    const cleaned = jsdocContent
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim();

    // Take text before first @tag
    const firstTagIndex = cleaned.search(/@\w+/);
    if (firstTagIndex === -1) return cleaned;
    if (firstTagIndex === 0) return null;

    return cleaned.substring(0, firstTagIndex).trim() || null;
  }

  /**
   * Parse JSDoc tags (@role, @consumer, @param, etc.)
   */
  parseJSDocTags(jsdocContent) {
    const tags = {};

    // @role or @Role, with or without colon
    const roleMatch = jsdocContent.match(/@[Rr]ole:?\s*(\w+)/);
    if (roleMatch) {
      tags.role = roleMatch[1].toLowerCase(); // core, internal, service, helper
    }

    // @consumer (for service methods)
    const consumerMatch = jsdocContent.match(/@consumer:?\s+(.+?)(?=@|$|\n\s*\*\s*@|\n\s*\*\/)/si);
    if (consumerMatch) {
      tags.consumers = consumerMatch[1]
        .replace(/\*/g, '')
        .split(/[,\s]+/)
        .map(c => c.trim())
        .filter(c => c.length > 0);
    }

    // @returns / @return
    const returnMatch = jsdocContent.match(/@returns?\s+(?:\{([^}]+)\})?\s*(.+?)(?=@|$|\n\s*\*\s*@)/s);
    if (returnMatch) {
      tags.returns = {
        type: returnMatch[1] || null,
        description: returnMatch[2]?.replace(/\*/g, '').trim() || null
      };
    }

    return tags;
  }

  /**
   * Detect file category
   */
  detectCategory(relativePath, content) {
    // Normalize Windows/Unix separators
    const pathLower = relativePath.toLowerCase().replace(/\\/g, '/');

    // Based on path
    if (pathLower.includes('prima/nucleus/trigo') ||
        pathLower.includes('prima/nucleus/delta') ||
        pathLower.includes('sectio')) {
      return 'math';
    }

    if (pathLower.includes('display') || pathLower.includes('defssvg')) {
      return 'rendering';
    }

    if (pathLower.includes('debug')) {
      return 'debug';
    }

    if (pathLower.includes('composables')) {
      return 'composables';
    }

    if (pathLower.includes('prima/')) {
      return 'domain';
    }

    if (pathLower.includes('components/')) {
      return 'ui';
    }

    // Based on content
    if (content.includes('Math.') || content.includes('TAU') ||
        content.includes('atan2') || content.includes('circumcenter')) {
      return 'math';
    }

    return 'utilities';
  }

  /**
   * Extract exports from a file
   */
  extractExports(content) {
    const exports = [];

    // export default class/function
    const defaultMatch = content.match(/export\s+default\s+(?:class\s+|function\s+)?(\w+)/);
    if (defaultMatch) exports.push(defaultMatch[1]);

    // export const/function
    const namedMatches = content.matchAll(/export\s+(?:const|let|function|class)\s+(\w+)/g);
    for (const m of namedMatches) exports.push(m[1]);

    return [...new Set(exports)];
  }

  /**
   * Extract internal dependencies (imports from src/)
   */
  extractDependencies(content) {
    const deps = [];
    const matches = content.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g);

    for (const m of matches) {
      if (m[1].startsWith('.') || m[1].startsWith('@/')) {
        deps.push(m[1]);
      }
    }

    return [...new Set(deps)];
  }

  /**
   * Extract relevant keywords from file
   */
  extractKeywords(content, category) {
    const keywords = new Set();

    // Defined classes
    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const m of classMatches) keywords.add(m[1].toLowerCase());

    // Important functions
    const funcMatches = content.matchAll(/(?:function|async function|const|let)\s+(\w{4,})\s*(?:=\s*(?:async\s*)?\(|[\(])/g);
    for (const m of funcMatches) keywords.add(m[1].toLowerCase());

    // LOLVE domain-specific terms
    const domainTerms = ['vertex', 'apex', 'orb', 'rosa', 'forma', 'unda', 'biblio',
                         'folia', 'peri', 'nucleus', 'delta', 'trigo', 'sectio',
                         'quadro', 'clavis', 'codex', 'kyklos', 'circumcenter'];

    for (const term of domainTerms) {
      if (content.toLowerCase().includes(term)) {
        keywords.add(term);
      }
    }

    return [...keywords].slice(0, 15);
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
  // METHOD-LEVEL GRANULARITY
  // ==========================================================================

  /**
   * Find relevant methods for a query
   * @param {string} query - User query
   * @param {Object} options - Search options
   * @returns {Array} List of relevant methods with their score
   */
  findRelevantMethods(query, options = {}) {
    const {
      maxMethods = 15,
      minScore = 1,
      roles = null,        // Filter by roles: ['core', 'service', 'entry']
      excludeRoles = ['internal'], // Exclude these roles by default
      includePrivate = false
    } = options;

    log('ContextAgent', `Searching methods for: "${query.substring(0, 50)}..."`);

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const methods = this.methodIndexer.index.methods || {};

    const scored = [];

    for (const [key, method] of Object.entries(methods)) {
      // Filter private methods if requested
      if (!includePrivate && method.isPrivate) continue;

      // Filter by roles
      if (roles && !roles.includes(method.role)) continue;
      if (excludeRoles && excludeRoles.includes(method.role)) continue;

      let score = 0;

      // Score based on method name
      for (const word of queryWords) {
        if (method.name.toLowerCase().includes(word)) {
          score += 5;
        }
        if (method.class && method.class.toLowerCase().includes(word)) {
          score += 4;
        }
      }

      // Score based on description
      if (method.description) {
        for (const word of queryWords) {
          if (method.description.toLowerCase().includes(word)) {
            score += 3;
          }
        }
      }

      // Score based on consumers
      if (method.consumers) {
        for (const consumer of method.consumers) {
          for (const word of queryWords) {
            if (consumer.toLowerCase().includes(word)) {
              score += 2;
            }
          }
        }
      }

      // Score based on effects
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

      // Bonus for important roles
      if (method.role === 'entry') score += 2;
      if (method.role === 'core') score += 1;

      if (score >= minScore) {
        scored.push({ key, method, score });
      }
    }

    // Sort by descending score
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, maxMethods);

    log('ContextAgent', `${results.length} relevant methods found`, 'success');

    return results;
  }

  /**
   * Extract code from selected methods
   * @param {Array} methods - Method list (from findRelevantMethods)
   * @returns {Array} List with each method's code
   */
  getMethodsContent(methods) {
    const contents = [];

    for (const item of methods) {
      const methodKey = typeof item === 'string' ? item : item.key;
      const method = typeof item === 'string'
        ? this.methodIndexer.index.methods[item]
        : item.method;

      if (!method) continue;

      // Extract code on demand
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
   * Search methods by specific criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array} List of matching methods
   */
  searchMethods(criteria = {}) {
    return this.methodIndexer.searchMethods(criteria);
  }

  /**
   * Generate optimized context for LLM (method level)
   * Returns only metadata, not code
   * @param {string} query - User query
   * @param {Object} options - Search options
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
      // Group by file for overview
      filesSummary: this.groupMethodsByFile(relevantMethods)
    };
  }

  /**
   * Group methods by file
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
   * Get method code by their keys
   * @param {Array<string>} methodKeys - List of method keys (e.g., ['Orb.novaFormae'])
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
   * Generate a Markdown cartography file
   */
  generateCartography(outputPath = null) {
    const lines = [];
    const roleIcons = {
      core: '🔷',
      internal: '🔸',
      service: '🔹',
      helper: '⚪'
    };

    lines.push('# LOLVE Cartography');
    lines.push('');
    lines.push('> Automatically generated by ContextAgent');
    lines.push(`> Date: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Role Legend');
    lines.push('');
    lines.push('| Icon | Role | Description |');
    lines.push('|------|------|-------------|');
    lines.push('| 🔷 | **core** | Important structural function, orchestration |');
    lines.push('| 🔸 | **internal** | Internal method, consumed by core |');
    lines.push('| 🔹 | **service** | External API, called from other classes |');
    lines.push('| ⚪ | **helper** | Utility, instantiation |');
    lines.push('');

    // Group by category
    const byCategory = {};
    for (const [filePath, info] of Object.entries(this.index.files)) {
      const cat = info.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ filePath, info });
    }

    // Category order
    const categoryOrder = ['domain', 'math', 'rendering', 'ui', 'composables', 'debug', 'utilities'];

    for (const category of categoryOrder) {
      const files = byCategory[category];
      if (!files || files.length === 0) continue;

      lines.push(`## ${this.getCategoryTitle(category)}`);
      lines.push('');

      for (const { info } of files) {
        const { jsdoc } = info;

        // File header
        if (jsdoc?.classDoc) {
          lines.push(`### ${jsdoc.classDoc.name}`);
          lines.push(`📄 \`${info.path}\``);
          if (jsdoc.classDoc.description) {
            lines.push('');
            lines.push(`> ${jsdoc.classDoc.description}`);
          }
        } else {
          lines.push(`### ${info.name}`);
          lines.push(`📄 \`${info.path}\``);
        }
        lines.push('');

        // Methods grouped by role
        if (jsdoc?.methods?.length > 0) {
          const byRole = { core: [], internal: [], service: [], helper: [], other: [] };

          for (const method of jsdoc.methods) {
            const role = method.role || 'other';
            if (!byRole[role]) byRole[role] = [];
            byRole[role].push(method);
          }

          // Display core first, then service, internal, helper
          for (const role of ['core', 'service', 'internal', 'helper']) {
            const methods = byRole[role];
            if (methods.length === 0) continue;

            lines.push(`**${roleIcons[role]} ${role.toUpperCase()}**`);
            lines.push('');

            for (const method of methods) {
              let methodLine = `- \`${method.name}()\``;
              if (method.description) {
                methodLine += ` — ${method.description}`;
              }
              lines.push(methodLine);

              // Consumers for services
              if (method.consumers?.length > 0) {
                lines.push(`  - 📥 Consumers: ${method.consumers.join(', ')}`);
              }
            }
            lines.push('');
          }
        }

        // Dependencies
        if (info.dependencies?.length > 0) {
          lines.push(`**Dependencies:** ${info.dependencies.slice(0, 5).join(', ')}`);
          lines.push('');
        }

        lines.push('---');
        lines.push('');
      }
    }

    const content = lines.join('\n');

    // Save if path provided
    if (outputPath) {
      writeJSON(outputPath.replace('.json', '.md'), null); // Hack to create the folder
      const fs = require('fs');
      fs.writeFileSync(outputPath, content, 'utf-8');
      log('ContextAgent', `Cartography generated: ${outputPath}`, 'success');
    }

    return content;
  }

  /**
   * Return readable category title
   */
  getCategoryTitle(category) {
    const titles = {
      domain: '🏛️ Domain (Business model)',
      math: '📐 Math (Geometric calculations)',
      rendering: '🎨 Rendering (SVG display)',
      ui: '🖼️ UI (Interface components)',
      composables: '🔌 Composables (State management)',
      debug: '🔧 Debug (Development tools)',
      utilities: '🛠️ Utilities'
    };
    return titles[category] || category;
  }
}

// ==========================================================================
// SearchSession - Iterative search with refinement
// ==========================================================================

/**
 * Search session allowing iterative refinement
 *
 * Features:
 * - Exclude false positives without re-running the full search
 * - Expand scope by following dependencies (calls/callers)
 * - Progressively load more details (metadata → code → full file)
 * - Operation history for debugging
 *
 * @example
 * const session = agent.createSearchSession("vertex création");
 * console.log(session.results); // Initial results (metadata only)
 *
 * session.exclude(['Forma.getSlot']); // Exclude a false positive
 * session.expand('Orb.novaFormae');   // Follow dependencies
 * session.loadCode(['Orb.novaFormae']); // Load code
 * session.loadFile('src/prima/Peri/Aion/Orb.js'); // Fallback to full file
 */
class SearchSession {
  /**
   * @param {ContextAgent} agent - Parent context agent
   * @param {string} query - Initial query
   * @param {Object} options - Search options
   */
  constructor(agent, query, options = {}) {
    this.agent = agent;
    this.query = query;
    this.options = {
      maxMethods: 15,
      minScore: 1,
      roles: null,
      excludeRoles: ['internal'],
      includePrivate: false,
      ...options
    };

    // Session state
    this._results = [];           // Current results (with metadata)
    this._excluded = new Set();   // Excluded keys
    this._loadedCode = new Map(); // Keys → loaded code
    this._loadedFiles = new Map();// Paths → file content
    this._expanded = new Set();   // Already expanded keys
    this._history = [];           // Operation history

    // Perform initial search
    this._search();
  }

  /**
   * Perform search with current criteria
   * @private
   */
  _search() {
    const rawResults = this.agent.findRelevantMethods(this.query, this.options);

    // Filter exclusions
    this._results = rawResults.filter(r => !this._excluded.has(r.key));

    this._addHistory('search', {
      query: this.query,
      found: rawResults.length,
      afterExclusion: this._results.length
    });
  }

  /**
   * Add an entry to history
   * @private
   */
  _addHistory(action, details) {
    this._history.push({
      timestamp: Date.now(),
      action,
      ...details
    });
  }

  // ==========================================================================
  // Getters - Access to results
  // ==========================================================================

  /**
   * Current results (metadata only, no code)
   * @returns {Array} List of methods with metadata
   */
  get results() {
    return this._results.map(({ key, method, score }) => ({
      key,
      file: method.file,
      class: method.class,
      name: method.name,
      signature: method.signature,
      role: method.role,
      description: method.description,
      effects: method.effects,
      consumers: method.consumers,
      score,
      hasCode: this._loadedCode.has(key)
    }));
  }

  /**
   * Current result count
   */
  get count() {
    return this._results.length;
  }

  /**
   * Keys of current results
   */
  get keys() {
    return this._results.map(r => r.key);
  }

  /**
   * Operation history
   */
  get history() {
    return [...this._history];
  }

  /**
   * Session state summary
   */
  get summary() {
    return {
      query: this.query,
      resultCount: this._results.length,
      excludedCount: this._excluded.size,
      loadedCodeCount: this._loadedCode.size,
      loadedFilesCount: this._loadedFiles.size,
      expandedCount: this._expanded.size
    };
  }

  // ==========================================================================
  // Actions - Result refinement
  // ==========================================================================

  /**
   * Exclude methods from results (false positives)
   * @param {string|string[]} methodKeys - Key(s) to exclude
   * @returns {SearchSession} this (chainable)
   */
  exclude(methodKeys) {
    const keys = Array.isArray(methodKeys) ? methodKeys : [methodKeys];

    for (const key of keys) {
      this._excluded.add(key);
    }

    // Remove from current results
    this._results = this._results.filter(r => !this._excluded.has(r.key));

    this._addHistory('exclude', { excluded: keys });

    return this;
  }

  /**
   * Reset exclusions and re-run search
   * @returns {SearchSession} this (chainable)
   */
  resetExclusions() {
    this._excluded.clear();
    this._search();
    this._addHistory('resetExclusions', {});
    return this;
  }

  /**
   * Re-run search with a new query
   * @param {string} newQuery - New query (optional, keeps previous if absent)
   * @param {Object} newOptions - New options (merged with existing)
   * @returns {SearchSession} this (chainable)
   */
  retry(newQuery = null, newOptions = {}) {
    if (newQuery) {
      this.query = newQuery;
    }
    this.options = { ...this.options, ...newOptions };

    this._search();
    this._addHistory('retry', { query: this.query, options: newOptions });

    return this;
  }

  /**
   * Expand scope by following method dependencies
   * Adds called methods (effects) and callers (consumers)
   * @param {string} methodKey - Method key to expand
   * @param {Object} options - { depth: 1, direction: 'both'|'callers'|'calls' }
   * @returns {SearchSession} this (chainable)
   */
  expand(methodKey, options = {}) {
    const { depth = 1, direction = 'both' } = options;

    if (this._expanded.has(methodKey)) {
      return this; // Already expanded
    }

    const method = this.agent.methodIndexer.index.methods[methodKey];
    if (!method) {
      this._addHistory('expand', { key: methodKey, error: 'Method not found' });
      return this;
    }

    const toAdd = new Set();

    // Add consumers (methods that call this one)
    if (direction === 'both' || direction === 'callers') {
      if (method.consumers) {
        for (const consumer of method.consumers) {
          // Find methods of this class
          const consumerMethods = this._findMethodsOfClass(consumer);
          for (const m of consumerMethods) {
            if (!this._excluded.has(m)) {
              toAdd.add(m);
            }
          }
        }
      }
    }

    // Add called methods (via effects.creates)
    if (direction === 'both' || direction === 'calls') {
      if (method.effects?.creates) {
        for (const created of method.effects.creates) {
          // Find nova or constructor methods of this class
          const creatorMethods = this._findCreatorMethods(created);
          for (const m of creatorMethods) {
            if (!this._excluded.has(m)) {
              toAdd.add(m);
            }
          }
        }
      }
    }

    // Add new methods to results
    const methods = this.agent.methodIndexer.index.methods;
    for (const key of toAdd) {
      if (!this._results.some(r => r.key === key) && methods[key]) {
        this._results.push({
          key,
          method: methods[key],
          score: 0 // Score 0 = added by expansion
        });
      }
    }

    this._expanded.add(methodKey);
    this._addHistory('expand', {
      key: methodKey,
      direction,
      added: [...toAdd]
    });

    // Recursive expansion if depth > 1
    if (depth > 1) {
      for (const key of toAdd) {
        this.expand(key, { depth: depth - 1, direction });
      }
    }

    return this;
  }

  /**
   * Find methods of a class
   * @private
   */
  _findMethodsOfClass(className) {
    const methods = this.agent.methodIndexer.index.methods;
    const result = [];

    for (const key of Object.keys(methods)) {
      if (key.startsWith(className + '.')) {
        result.push(key);
      }
    }

    return result;
  }

  /**
   * Find creation methods (nova, constructor) of a class
   * @private
   */
  _findCreatorMethods(className) {
    const methods = this.agent.methodIndexer.index.methods;
    const result = [];

    // Look for nova, new, create, init
    const creatorPatterns = [
      `${className}.nova`,
      `${className}.new`,
      `${className}.create`,
      `${className}.init`
    ];

    for (const pattern of creatorPatterns) {
      if (methods[pattern]) {
        result.push(pattern);
      }
    }

    return result;
  }

  // ==========================================================================
  // Progressive code loading
  // ==========================================================================

  /**
   * Load code for specific methods
   * @param {string|string[]} methodKeys - Method key(s) to load
   * @returns {Array} Loaded method code
   */
  loadCode(methodKeys) {
    const keys = Array.isArray(methodKeys) ? methodKeys : [methodKeys];
    const loaded = [];

    for (const key of keys) {
      if (this._loadedCode.has(key)) {
        // Already loaded
        loaded.push({
          key,
          code: this._loadedCode.get(key),
          cached: true
        });
        continue;
      }

      const code = this.agent.methodIndexer.extractMethodCode(key);
      if (code) {
        this._loadedCode.set(key, code);
        loaded.push({
          key,
          code,
          cached: false
        });
      }
    }

    this._addHistory('loadCode', {
      requested: keys,
      loaded: loaded.map(l => l.key)
    });

    return loaded;
  }

  /**
   * Load a complete file (fallback when method granularity is not enough)
   * @param {string} filePath - File path (relative or absolute)
   * @returns {Object} { path, content, lines }
   */
  loadFile(filePath) {
    // Normalize path
    const normalizedPath = filePath.replace(/\\/g, '/');

    if (this._loadedFiles.has(normalizedPath)) {
      return {
        path: normalizedPath,
        content: this._loadedFiles.get(normalizedPath),
        cached: true
      };
    }

    // Try relative path from rootPath
    let fullPath = path.join(this.agent.rootPath, filePath);
    if (!fs.existsSync(fullPath)) {
      // Try as absolute path
      fullPath = filePath;
    }

    if (!fs.existsSync(fullPath)) {
      this._addHistory('loadFile', { path: filePath, error: 'File not found' });
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    this._loadedFiles.set(normalizedPath, content);

    this._addHistory('loadFile', {
      path: normalizedPath,
      lines: content.split('\n').length
    });

    return {
      path: normalizedPath,
      content,
      lines: content.split('\n').length,
      cached: false
    };
  }

  /**
   * Get all loaded code so far
   * @returns {Map} Key → code
   */
  getAllLoadedCode() {
    return new Map(this._loadedCode);
  }

  /**
   * Get all loaded files so far
   * @returns {Map} Path → content
   */
  getAllLoadedFiles() {
    return new Map(this._loadedFiles);
  }

  // ==========================================================================
  // Progressive detail levels
  // ==========================================================================

  /**
   * Get results with a specific detail level
   * @param {number} level - Detail level (0-4)
   *   0: Keys only
   *   1: + descriptions
   *   2: + full signatures
   *   3: + method code
   *   4: + complete files
   * @param {Object} options - Additional options
   * @param {boolean} options.includeDescriptions - Include JSDoc descriptions (default: true)
   * @returns {Array|Object} Results at requested level
   */
  getAtLevel(level = 1, options = {}) {
    const { includeDescriptions = true } = options;
    switch (level) {
      case 0:
        // Level 0: Keys only
        return this.keys;

      case 1:
        // Level 1: Descriptions (default)
        return this._results.map(({ key, method, score }) => {
          const result = {
            key,
            class: method.class,
            name: method.name,
            role: method.role,
            score
          };
          if (includeDescriptions && method.description) {
            result.description = method.description;
          }
          return result;
        });

      case 2:
        // Level 2: Full signatures
        return this._results.map(({ key, method, score }) => {
          const result = {
            key,
            file: method.file,
            class: method.class,
            signature: method.signature,
            role: method.role,
            effects: method.effects,
            consumers: method.consumers,
            score
          };
          if (includeDescriptions && method.description) {
            result.description = method.description;
          }
          return result;
        });

      case 3:
        // Level 3: With code (auto-loads if needed)
        return this._results.map(({ key, method, score }) => {
          if (!this._loadedCode.has(key)) {
            const code = this.agent.methodIndexer.extractMethodCode(key);
            if (code) {
              this._loadedCode.set(key, code);
            }
          }
          const result = {
            key,
            file: method.file,
            class: method.class,
            signature: method.signature,
            role: method.role,
            code: this._loadedCode.get(key) || null,
            score
          };
          if (includeDescriptions && method.description) {
            result.description = method.description;
          }
          return result;
        });

      case 4:
        // Level 4: Complete files grouped
        const fileGroups = {};
        for (const { key, method } of this._results) {
          const file = method.file;
          if (!fileGroups[file]) {
            const loaded = this.loadFile(file);
            fileGroups[file] = {
              path: file,
              content: loaded?.content || null,
              methods: []
            };
          }
          fileGroups[file].methods.push(key);
        }
        return Object.values(fileGroups);

      default:
        return this.getAtLevel(1);
    }
  }

  // ==========================================================================
  // JIT Annotations (Just-In-Time)
  // ==========================================================================

  /**
   * Check annotation status of methods in results
   * @returns {Object} { complete, outdated, partial, missing }
   */
  checkAnnotations() {
    const result = this.agent.methodIndexer.checkAnnotations(
      this.keys,
      this.agent.annotationCache
    );

    this._addHistory('checkAnnotations', {
      complete: result.complete.length,
      outdated: result.outdated.length,
      partial: result.partial.length,
      missing: result.missing.length
    });

    return result;
  }

  /**
   * Identify methods needing LLM annotation
   * Returns methods to annotate with their code (for sending to LLM)
   *
   * @param {Object} options - Options
   * @param {boolean} options.includeOutdated - Include outdated annotations (default: true)
   * @param {boolean} options.includePartial - Include partial annotations (default: false)
   * @param {number} options.maxMethods - Max methods to return (default: 5)
   * @returns {Object} { needsAnnotation: [...], alreadyComplete: number, tokensEstimate: number }
   */
  getMethodsNeedingAnnotation(options = {}) {
    const {
      includeOutdated = true,
      includePartial = false,
      maxMethods = 5
    } = options;

    const status = this.checkAnnotations();

    // Collect methods to annotate
    const toAnnotate = [
      ...status.missing,
      ...(includeOutdated ? status.outdated : []),
      ...(includePartial ? status.partial : [])
    ].slice(0, maxMethods);

    // Load code for each method to annotate
    const methodsWithCode = toAnnotate.map(key => {
      const method = this.agent.methodIndexer.index.methods[key];
      const code = this.agent.methodIndexer.extractMethodCode(key);

      return {
        key,
        file: method?.file,
        class: method?.class,
        name: method?.name,
        signature: method?.signature,
        currentRole: method?.role,
        currentDescription: method?.description,
        code,
        codeLength: code?.length || 0
      };
    }).filter(m => m.code); // Filter out methods without code

    // Estimate tokens
    const totalChars = methodsWithCode.reduce((sum, m) => sum + m.codeLength, 0);
    const tokensEstimate = Math.ceil(totalChars / 4);

    this._addHistory('getMethodsNeedingAnnotation', {
      requested: toAnnotate.length,
      withCode: methodsWithCode.length,
      tokensEstimate
    });

    return {
      needsAnnotation: methodsWithCode,
      alreadyComplete: status.complete.length,
      tokensEstimate
    };
  }

  /**
   * Apply generated annotations (from LLM or heuristics) to cache
   *
   * @param {Array} annotations - [{ key, role, description, effects, consumers, source }]
   * @returns {number} Number of applied annotations
   */
  applyAnnotations(annotations) {
    let applied = 0;

    for (const ann of annotations) {
      const method = this.agent.methodIndexer.index.methods[ann.key];
      if (!method) continue;

      this.agent.annotationCache.set(ann.key, {
        role: ann.role,
        description: ann.description,
        effects: ann.effects || {},
        consumers: ann.consumers || [],
        context: ann.context || { requires: [], provides: [] },
        source: ann.source || 'llm'
      }, method.bodyHash);

      applied++;
    }

    if (applied > 0) {
      this.agent.annotationCache.save();
    }

    this._addHistory('applyAnnotations', { applied });

    return applied;
  }

  /**
   * Generate a prompt to request annotations from LLM
   * @param {Object} options - Options for getMethodsNeedingAnnotation
   * @returns {Object} { prompt, methods, tokensEstimate }
   */
  generateAnnotationPrompt(options = {}) {
    const { needsAnnotation, tokensEstimate } = this.getMethodsNeedingAnnotation(options);

    if (needsAnnotation.length === 0) {
      return { prompt: null, methods: [], tokensEstimate: 0 };
    }

    const lines = [
      '## Annotation Request',
      '',
      'Analyze the following methods and provide JSDoc annotations.',
      'For each method, return a JSON object with:',
      '- `key`: the method key',
      '- `role`: entry|core|service|flow|helper|internal|adapter',
      '- `description`: short description (1 line)',
      '- `effects`: { creates: [...], mutates: [...], emits: [...] }',
      '- `consumers`: [classes that call this method]',
      '',
      '### Methods to annotate',
      ''
    ];

    for (const method of needsAnnotation) {
      lines.push(`#### ${method.key}`);
      lines.push(`File: ${method.file}`);
      lines.push('```javascript');
      lines.push(method.code);
      lines.push('```');
      lines.push('');
    }

    lines.push('### Expected response format');
    lines.push('```json');
    lines.push('[');
    lines.push('  { "key": "ClassName.methodName", "role": "...", "description": "...", "effects": {}, "consumers": [] }');
    lines.push(']');
    lines.push('```');

    return {
      prompt: lines.join('\n'),
      methods: needsAnnotation.map(m => m.key),
      tokensEstimate
    };
  }

  // ==========================================================================
  // Export for LLM
  // ==========================================================================

  /**
   * Generate optimized context for LLM
   * @param {Object} options - Generation options
   * @param {boolean} options.includeCode - Include loaded code (default: false)
   * @param {boolean} options.includeDescriptions - Include JSDoc descriptions (default: true)
   * @param {number} options.maxMethods - Max number of methods (default: 10)
   * @returns {Object} Formatted context for LLM
   */
  toContext(options = {}) {
    const { includeCode = false, includeDescriptions = true, maxMethods = 10 } = options;

    const results = this._results.slice(0, maxMethods);

    return {
      query: this.query,
      methodCount: results.length,
      totalFound: this._results.length,
      excluded: [...this._excluded],
      methods: results.map(({ key, method, score }) => {
        const base = {
          key,
          file: method.file,
          signature: method.signature,
          role: method.role,
          score
        };

        if (includeDescriptions && method.description) {
          base.description = method.description;
        }

        if (includeCode) {
          base.code = this._loadedCode.get(key) || null;
        }

        return base;
      }),
      loadedFiles: [...this._loadedFiles.keys()]
    };
  }

  /**
   * Generate a descriptive prompt for LLM
   * @returns {string} Text description of results
   */
  toPrompt() {
    const lines = [];
    lines.push(`## Search results for: "${this.query}"`);
    lines.push('');
    lines.push(`Found ${this._results.length} relevant methods:`);
    lines.push('');

    for (const { key, method, score } of this._results.slice(0, 15)) {
      let line = `- **${key}**`;
      if (method.role) line += ` [${method.role}]`;
      if (score > 0) line += ` (score: ${score})`;
      lines.push(line);

      if (method.description) {
        lines.push(`  ${method.description}`);
      }

      if (this._loadedCode.has(key)) {
        lines.push('  ```javascript');
        lines.push('  ' + this._loadedCode.get(key).split('\n').slice(0, 10).join('\n  '));
        if (this._loadedCode.get(key).split('\n').length > 10) {
          lines.push('  // ...');
        }
        lines.push('  ```');
      }
    }

    if (this._excluded.size > 0) {
      lines.push('');
      lines.push(`Exclusions: ${[...this._excluded].join(', ')}`);
    }

    return lines.join('\n');
  }
}

// ==========================================================================
// Factory method on ContextAgent
// ==========================================================================

/**
 * Create a new search session
 * @param {string} query - Initial query
 * @param {Object} options - Search options
 * @returns {SearchSession} New session
 */
ContextAgent.prototype.createSearchSession = function(query, options = {}) {
  return new SearchSession(this, query, options);
};

module.exports = { ContextAgent, SearchSession, AnnotationCache };
