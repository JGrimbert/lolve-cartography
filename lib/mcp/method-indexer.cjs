/**
 * Method Indexer - Method indexing with Acorn AST
 *
 * Generates a lightweight method index (metadata only, no code)
 * Enables on-demand extraction of specific method code
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const acorn = require('acorn');
const { log } = require('../utils/logger.cjs');
const { listFiles, readFile, readJSON, writeJSON } = require('../utils/file-utils.cjs');
const { loadProjectConfig } = require('../utils/config-loader.cjs');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Load config from project (supports .lolve-cartography.json or package.json)
const PROJECT_PATH = process.env.LC_PROJECT_PATH || process.cwd();
const CACHE_PATH = path.join(PROJECT_PATH, '.cache');
const projectConfig = loadProjectConfig(PROJECT_PATH);

const CONFIG = {
  rootPath: PROJECT_PATH,
  srcPath: projectConfig.project.srcPathAbsolute || path.join(PROJECT_PATH, 'src'),
  indexPath: path.join(CACHE_PATH, 'method-index.json'),
  annotationCachePath: path.join(CACHE_PATH, 'annotation-cache.json'),

  // Extensions to index
  extensions:  ['.js', '.cjs', '.mjs', '.vue', '.ts'],

  // Directories to ignore
  ignoreDirs: ['node_modules', 'dist', '.cache', '.backups'],

  // Acorn options
  acornOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
    allowHashBang: true,
  },

  // Required annotations to consider a method "complete"
  requiredAnnotations: ['role'] // At minimum @role
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Compute MD5 hash of a string
 */
function hashContent(content) {
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
}

/**
 * Get file stats (mtime, size)
 */
function getFileStats(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return {
      mtime: stats.mtimeMs,
      size: stats.size
    };
  } catch {
    return null;
  }
}

/**
 * Extract a code portion between two positions
 */
function extractCode(content, start, end) {
  return content.substring(start, end);
}

/**
 * Find the start of leading comments/JSDoc before a position
 * Returns the start position including any comments
 */
function findLeadingCommentsStart(content, nodeStart) {
  // Find the line where nodeStart is
  const beforeNode = content.substring(0, nodeStart);
  const lines = beforeNode.split('\n');

  // Start from the line before nodeStart
  let firstCommentLine = lines.length; // Default: no comment found

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();

    // Empty line or whitespace only - continue looking
    if (line === '') {
      continue;
    }

    // JSDoc or block comment end
    if (line.endsWith('*/')) {
      // Find the start of this block comment
      let j = i;
      while (j >= 0 && !lines[j].trim().startsWith('/*')) {
        j--;
      }
      if (j >= 0) {
        firstCommentLine = j;
        i = j; // Continue from here to find more comments above
        continue;
      }
      break;
    }

    // Single line comment (// or decorator-like)
    if (line.startsWith('//')) {
      firstCommentLine = i;
      continue;
    }

    // Not a comment - stop looking
    break;
  }

  // If no comment found, return original position
  if (firstCommentLine >= lines.length) {
    return nodeStart;
  }

  // Calculate the character position of the first comment line
  let pos = 0;
  for (let i = 0; i < firstCommentLine; i++) {
    pos += lines[i].length + 1; // +1 for newline
  }

  return pos;
}

// ============================================================================
// AST PARSER
// ============================================================================

class ASTParser {

  /**
   * Parse a file and return the AST
   */
  parseFile(filePath) {
    let content = readFile(filePath);
    if (!content) return null;

    // Extract <script> block from Vue SFC
    if (filePath.endsWith('.vue')) {
      content = this.extractVueScript(content);
      if (!content) return null;
    }

    try {
      const ast = acorn.parse(content, CONFIG.acornOptions);
      return { ast, content };
    } catch (err) {
      log('MethodIndexer', `Parsing error ${filePath}: ${err.message}`, 'warn');
      return null;
    }
  }

  /**
   * Extract script content from Vue SFC
   */
  extractVueScript(content) {
    // Match <script> or <script setup> block
    const scriptMatch = content.match(/<script(?:\s+setup)?[^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) return null;
    return scriptMatch[1].trim();
  }

  /**
   * Extract classes and their methods from AST
   */
  extractClasses(ast, content) {
    const classes = [];

    for (const node of ast.body) {
      // Export default class or export class
      let classNode = null;
      let isExported = false;

      if (node.type === 'ClassDeclaration') {
        classNode = node;
      } else if (node.type === 'ExportDefaultDeclaration' && node.declaration?.type === 'ClassDeclaration') {
        classNode = node.declaration;
        isExported = true;
      } else if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'ClassDeclaration') {
        classNode = node.declaration;
        isExported = true;
      }

      if (classNode) {
        const classInfo = this.extractClassInfo(classNode, content, isExported);
        classes.push(classInfo);
      }
    }

    return classes;
  }

  /**
   * Extract class information
   */
  extractClassInfo(classNode, content, isExported) {
    const className = classNode.id?.name || 'Anonymous';
    const extendsClass = classNode.superClass?.name || null;

    // Extract class JSDoc (comment just before)
    const classJsdoc = this.extractJSDoc(content, classNode.start);

    // Extract methods
    const methods = [];

    for (const item of classNode.body.body) {
      if (item.type === 'MethodDefinition' || item.type === 'PropertyDefinition') {
        const methodInfo = this.extractMethodInfo(item, content, className);
        if (methodInfo) {
          methods.push(methodInfo);
        }
      }
    }

    return {
      name: className,
      extends: extendsClass,
      isExported,
      jsdoc: classJsdoc,
      start: classNode.start,
      end: classNode.end,
      line: classNode.loc.start.line,
      methods
    };
  }

  /**
   * Extract method information
   */
  extractMethodInfo(node, content, className) {
    // Ignore constructor
    if (node.key?.name === 'constructor') return null;

    const methodName = node.key?.name || node.key?.value || null;
    if (!methodName) return null;

    // Determine if it's a method or arrow function property
    let isArrow = false;
    let bodyStart, bodyEnd;

    if (node.type === 'MethodDefinition') {
      bodyStart = node.value.body.start;
      bodyEnd = node.value.body.end;
    } else if (node.type === 'PropertyDefinition' && node.value?.type === 'ArrowFunctionExpression') {
      isArrow = true;
      bodyStart = node.value.body.start;
      bodyEnd = node.value.body.end;
    } else {
      // Simple property, not a method
      return null;
    }

    // Extract body to compute hash
    const body = extractCode(content, bodyStart, bodyEnd);
    const bodyHash = hashContent(body);

    // Extract JSDoc
    const jsdoc = this.extractJSDoc(content, node.start);

    // Build signature
    let params = '';
    const funcNode = node.type === 'MethodDefinition' ? node.value : node.value;
    if (funcNode.params) {
      params = funcNode.params.map(p => this.paramToString(p, content)).join(', ');
    }

    return {
      name: methodName,
      fullName: `${className}.${methodName}`,
      isStatic: node.static || false,
      isPrivate: node.key?.type === 'PrivateIdentifier' || methodName.startsWith('#'),
      isAsync: funcNode.async || false,
      isArrow,
      signature: `${methodName}(${params})`,
      jsdoc,
      bodyHash,
      start: node.start,
      end: node.end,
      line: node.loc.start.line,
      endLine: node.loc.end.line
    };
  }

  /**
   * Convert an AST parameter to string
   */
  paramToString(param, content) {
    // Extract directly from source to preserve syntax
    return extractCode(content, param.start, param.end);
  }

  /**
   * Extract JSDoc immediately preceding a position
   * Only captures if JSDoc is right before (no code in between)
   */
  extractJSDoc(content, position) {
    // Look for the LAST /** ... */ comment before position
    // Limit search to last 500 characters
    const searchStart = Math.max(0, position - 500);
    const before = content.substring(searchStart, position);

    // Find all JSDoc in this area
    const jsdocPattern = /\/\*\*[\s\S]*?\*\//g;
    const matches = [...before.matchAll(jsdocPattern)];

    if (matches.length === 0) return null;

    // Take last match (closest to position)
    const lastMatch = matches[matches.length - 1];
    const jsdocRaw = lastMatch[0];
    const jsdocEndIndex = lastMatch.index + jsdocRaw.length;

    // Check there's no significant code between JSDoc and position
    const afterJsdoc = before.substring(jsdocEndIndex);

    // If there's something other than whitespace/newlines and keywords (static, async, etc.)
    // then it's not the right JSDoc
    if (afterJsdoc.trim().length > 0 && !/^[\s]*(static\s+)?(async\s+)?$/.test(afterJsdoc)) {
      return null;
    }

    return this.parseJSDoc(jsdocRaw);
  }

  /**
   * Parse a JSDoc block and extract tags
   */
  parseJSDoc(jsdocRaw) {
    const result = {
      description: null,
      role: null,
      consumers: [],
      effects: {},
      context: { requires: [], provides: [] }
    };

    // Clean (normalize Windows line endings)
    const cleaned = jsdocRaw
      .replace(/\r\n/g, '\n')  // Normalize CRLF -> LF
      .replace(/\r/g, '\n')    // Normalize CR -> LF
      .replace(/^\/\*\*/, '')
      .replace(/\*+\/$/, '')
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim();

    // Description
    const firstTagIndex = cleaned.search(/@\w+/);
    if (firstTagIndex === -1) {
      result.description = cleaned || null;
    } else if (firstTagIndex > 0) {
      result.description = cleaned.substring(0, firstTagIndex).trim() || null;
    }

    // @role
    const roleMatch = cleaned.match(/@[Rr]ole:?\s*(\w+)/i);
    if (roleMatch) result.role = roleMatch[1].toLowerCase();

    // @consumer (handles end of string with or without \n)
    const consumerMatch = cleaned.match(/@consumer:?\s+([^\n@]+)/i);
    if (consumerMatch) {
      result.consumers = consumerMatch[1]
        .split(/[,\s]+/)
        .map(c => c.trim())
        .filter(c => c.length > 0 && !c.startsWith('*'));
    }

    // @effect
    const effectMatches = cleaned.matchAll(/@effect\s+(\w+):?\s*([^\n@]+)/gi);
    for (const match of effectMatches) {
      const effectType = match[1].toLowerCase();
      const targets = match[2].split(/[,\s]+/).map(t => t.trim()).filter(t => t);
      if (!result.effects[effectType]) result.effects[effectType] = [];
      result.effects[effectType].push(...targets);
    }

    // @context
    const contextReqMatch = cleaned.match(/@context\s+requires:?\s*([^\n@]+)/i);
    if (contextReqMatch) {
      result.context.requires = contextReqMatch[1].split(/[,\s]+/).map(t => t.trim()).filter(t => t);
    }
    const contextProvMatch = cleaned.match(/@context\s+provides:?\s*([^\n@]+)/i);
    if (contextProvMatch) {
      result.context.provides = contextProvMatch[1].split(/[,\s]+/).map(t => t.trim()).filter(t => t);
    }

    return result;
  }

  /**
   * Extract standalone functions
   */
  extractFunctions(ast, content) {
    const functions = [];

    for (const node of ast.body) {
      let funcNode = null;
      let isExported = false;

      if (node.type === 'FunctionDeclaration') {
        funcNode = node;
      } else if (node.type === 'ExportDefaultDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
        funcNode = node.declaration;
        isExported = true;
      } else if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
        funcNode = node.declaration;
        isExported = true;
      }

      if (funcNode && funcNode.id?.name) {
        const jsdoc = this.extractJSDoc(content, funcNode.start);
        const body = extractCode(content, funcNode.body.start, funcNode.body.end);
        const params = funcNode.params.map(p => this.paramToString(p, content)).join(', ');

        functions.push({
          name: funcNode.id.name,
          fullName: funcNode.id.name,
          isExported,
          isAsync: funcNode.async || false,
          signature: `${funcNode.id.name}(${params})`,
          jsdoc,
          bodyHash: hashContent(body),
          start: funcNode.start,
          end: funcNode.end,
          line: funcNode.loc.start.line,
          endLine: funcNode.loc.end.line
        });
      }
    }

    return functions;
  }
}

// ============================================================================
// METHOD INDEXER
// ============================================================================

class MethodIndexer {
  constructor() {
    this.parser = new ASTParser();
    this.index = null;
  }

  /**
   * Load existing index or create a new one
   */
  loadIndex() {
    this.index = readJSON(CONFIG.indexPath) || {
      version: 1,
      generated: null,
      files: {},
      methods: {},
      classes: {}
    };
    return this.index;
  }

  /**
   * Save the index
   */
  saveIndex() {
    this.index.generated = new Date().toISOString();
    writeJSON(CONFIG.indexPath, this.index);
  }

  /**
   * Check if a file has changed since last indexing
   */
  hasFileChanged(filePath) {
    const relativePath = path.relative(CONFIG.rootPath, filePath);
    const currentStats = getFileStats(filePath);
    if (!currentStats) return true;

    const indexed = this.index.files[relativePath];
    if (!indexed) return true;

    return indexed.mtime !== currentStats.mtime || indexed.size !== currentStats.size;
  }

  /**
   * Index all files (incremental)
   */
  indexAll(options = { force: false }) {
    this.loadIndex();

    const files = listFiles(CONFIG.srcPath, (name) => {
      // Exclude backup files
      if (name.endsWith('.backup')) return false;
      const ext = path.extname(name).toLowerCase();
      return CONFIG.extensions.includes(ext);
    });

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Track current files to detect deletions
    const currentFiles = new Set();

    for (const filePath of files) {
      const relativePath = path.relative(CONFIG.rootPath, filePath);
      currentFiles.add(relativePath);

      // Check if file has changed
      if (!options.force && !this.hasFileChanged(filePath)) {
        skipped++;
        continue;
      }

      // Index the file
      const success = this.indexFile(filePath);
      if (success) {
        updated++;
      } else {
        errors++;
      }
    }

    // Remove entries for deleted files
    const deletedFiles = Object.keys(this.index.files).filter(f => !currentFiles.has(f));
    for (const deletedFile of deletedFiles) {
      this.removeFileFromIndex(deletedFile);
    }

    this.saveIndex();

    return { updated, skipped, errors, deleted: deletedFiles.length };
  }

  /**
   * Index a specific file
   */
  indexFile(filePath) {
    const parsed = this.parser.parseFile(filePath);
    if (!parsed) return false;

    const { ast, content } = parsed;
    const relativePath = path.relative(CONFIG.rootPath, filePath);
    const stats = getFileStats(filePath);

    // Remove old entries from this file
    this.removeFileFromIndex(relativePath);

    // Extract classes and methods
    const classes = this.parser.extractClasses(ast, content);
    const functions = this.parser.extractFunctions(ast, content);

    // Index classes
    for (const cls of classes) {
      const classKey = cls.name;

      this.index.classes[classKey] = {
        file: relativePath,
        name: cls.name,
        extends: cls.extends,
        isExported: cls.isExported,
        role: cls.jsdoc?.role || null,
        description: cls.jsdoc?.description || null,
        line: cls.line,
        methodCount: cls.methods.length
      };

      // Index class methods
      for (const method of cls.methods) {
        this.index.methods[method.fullName] = {
          file: relativePath,
          class: cls.name,
          name: method.name,
          signature: method.signature,
          isStatic: method.isStatic,
          isPrivate: method.isPrivate,
          isAsync: method.isAsync,
          role: method.jsdoc?.role || this.inferRole(method),
          description: method.jsdoc?.description || null,
          effects: method.jsdoc?.effects || {},
          consumers: method.jsdoc?.consumers || [],
          context: method.jsdoc?.context || { requires: [], provides: [] },
          bodyHash: method.bodyHash,
          line: method.line,
          endLine: method.endLine
        };
      }
    }

    // Index standalone functions
    for (const func of functions) {
      this.index.methods[func.fullName] = {
        file: relativePath,
        class: null,
        name: func.name,
        signature: func.signature,
        isStatic: false,
        isPrivate: false,
        isAsync: func.isAsync,
        isExported: func.isExported,
        role: func.jsdoc?.role || (func.isExported ? 'helper' : 'internal'),
        description: func.jsdoc?.description || null,
        effects: func.jsdoc?.effects || {},
        consumers: func.jsdoc?.consumers || [],
        context: func.jsdoc?.context || { requires: [], provides: [] },
        bodyHash: func.bodyHash,
        line: func.line,
        endLine: func.endLine
      };
    }

    // Update file metadata
    this.index.files[relativePath] = {
      mtime: stats.mtime,
      size: stats.size,
      hash: hashContent(content),
      classCount: classes.length,
      methodCount: Object.keys(this.index.methods).filter(m =>
        this.index.methods[m].file === relativePath
      ).length
    };

    return true;
  }

  /**
   * Remove a file from the index
   */
  removeFileFromIndex(relativePath) {
    // Remove methods from this file
    const methodsToRemove = Object.keys(this.index.methods).filter(m =>
      this.index.methods[m].file === relativePath
    );
    for (const method of methodsToRemove) {
      delete this.index.methods[method];
    }

    // Remove classes from this file
    const classesToRemove = Object.keys(this.index.classes).filter(c =>
      this.index.classes[c].file === relativePath
    );
    for (const cls of classesToRemove) {
      delete this.index.classes[cls];
    }

    // Remove the file
    delete this.index.files[relativePath];
  }

  /**
   * Infer a role for a method without annotation
   */
  inferRole(method) {
    const name = method.name;

    if (method.isPrivate || name.startsWith('_')) return 'internal';
    if (method.isStatic && name === 'nova') return 'helper';
    if (name === 'nova') return 'helper';
    if (name.startsWith('init')) return 'entry';
    if (name === 'genesis') return 'flow';
    if (name.startsWith('create') || name.startsWith('build')) return 'core';
    if (name.startsWith('get') || name.startsWith('find')) return 'service';
    if (name.startsWith('update') || name.startsWith('replace')) return 'service';
    if (name === 'adapt' || name.startsWith('transform')) return 'adapter';

    return 'internal';
  }

  /**
   * Extract method code on demand
   */
  extractMethodCode(methodKey) {
    const method = this.index.methods[methodKey];
    if (!method) return null;

    const filePath = path.join(CONFIG.rootPath, method.file);
    const content = readFile(filePath);
    if (!content) return null;

    // Re-parse to get exact positions
    const parsed = this.parser.parseFile(filePath);
    if (!parsed) return null;

    const { ast } = parsed;

    // Find method in AST
    if (method.class) {
      // Class method
      for (const node of ast.body) {
        let classNode = null;
        if (node.type === 'ClassDeclaration' && node.id?.name === method.class) {
          classNode = node;
        } else if ((node.type === 'ExportDefaultDeclaration' || node.type === 'ExportNamedDeclaration')
                   && node.declaration?.type === 'ClassDeclaration'
                   && node.declaration.id?.name === method.class) {
          classNode = node.declaration;
        }

        if (classNode) {
          for (const item of classNode.body.body) {
            const itemName = item.key?.name || item.key?.value;
            if (itemName === method.name) {
              // Include leading comments (JSDoc, etc.)
              const startWithComments = findLeadingCommentsStart(content, item.start);
              return extractCode(content, startWithComments, item.end);
            }
          }
        }
      }
    } else {
      // Standalone function
      for (const node of ast.body) {
        let funcNode = null;
        if (node.type === 'FunctionDeclaration' && node.id?.name === method.name) {
          funcNode = node;
        } else if ((node.type === 'ExportDefaultDeclaration' || node.type === 'ExportNamedDeclaration')
                   && node.declaration?.type === 'FunctionDeclaration'
                   && node.declaration.id?.name === method.name) {
          funcNode = node.declaration;
        }

        if (funcNode) {
          // Include leading comments (JSDoc, etc.)
          const startWithComments = findLeadingCommentsStart(content, funcNode.start);
          return extractCode(content, startWithComments, funcNode.end);
        }
      }
    }

    return null;
  }

  /**
   * Search methods by criteria
   */
  searchMethods(criteria = {}) {
    const results = [];

    for (const [key, method] of Object.entries(this.index.methods)) {
      let match = true;

      if (criteria.role && method.role !== criteria.role) match = false;
      if (criteria.class && method.class !== criteria.class) match = false;
      if (criteria.file && !method.file.includes(criteria.file)) match = false;
      if (criteria.name && !method.name.toLowerCase().includes(criteria.name.toLowerCase())) match = false;
      if (criteria.hasEffect && (!method.effects || Object.keys(method.effects).length === 0)) match = false;
      if (criteria.isPublic && method.isPrivate) match = false;

      if (match) {
        results.push({ key, ...method });
      }
    }

    return results;
  }

  /**
   * Get index statistics
   */
  getStats() {
    const methods = Object.values(this.index.methods);
    const classes = Object.values(this.index.classes);

    const roleDistribution = {};
    for (const method of methods) {
      const role = method.role || 'unknown';
      roleDistribution[role] = (roleDistribution[role] || 0) + 1;
    }

    const withEffects = methods.filter(m => m.effects && Object.keys(m.effects).length > 0).length;
    const withConsumers = methods.filter(m => m.consumers && m.consumers.length > 0).length;
    const withDescription = methods.filter(m => m.description).length;

    return {
      files: Object.keys(this.index.files).length,
      classes: classes.length,
      methods: methods.length,
      roleDistribution,
      annotated: {
        withRole: methods.filter(m => m.role).length,
        withEffects,
        withConsumers,
        withDescription
      },
      generated: this.index.generated
    };
  }
}

// ============================================================================
// ANNOTATION CACHE - JIT annotation storage
// ============================================================================

/**
 * JIT Annotation Cache
 *
 * Stores dynamically generated annotations (by LLM or heuristics)
 * separately from source code, enabling progressive annotation.
 */
class AnnotationCache {
  constructor() {
    this.cache = null;
  }

  /**
   * Load cache from disk
   */
  load() {
    this.cache = readJSON(CONFIG.annotationCachePath) || {
      version: 1,
      generated: null,
      annotations: {}
    };
    return this.cache;
  }

  /**
   * Save cache to disk
   */
  save() {
    if (!this.cache) return;
    this.cache.generated = new Date().toISOString();
    writeJSON(CONFIG.annotationCachePath, this.cache);
  }

  /**
   * Get cached annotation for a method
   * @param {string} methodKey - Method key (e.g., 'Orb.nova')
   * @returns {Object|null} Cached annotation or null
   */
  get(methodKey) {
    if (!this.cache) this.load();
    return this.cache.annotations[methodKey] || null;
  }

  /**
   * Set annotation for a method
   * @param {string} methodKey - Method key
   * @param {Object} annotation - { role, description, effects, consumers, context }
   * @param {string} bodyHash - Hash of method body at annotation time
   */
  set(methodKey, annotation, bodyHash) {
    if (!this.cache) this.load();

    this.cache.annotations[methodKey] = {
      ...annotation,
      annotatedAt: new Date().toISOString(),
      annotatedBodyHash: bodyHash,
      source: annotation.source || 'jit' // 'jit', 'llm', 'heuristic', 'manual'
    };
  }

  /**
   * Check if annotation is up to date with current bodyHash
   * @param {string} methodKey - Method key
   * @param {string} currentBodyHash - Current body hash
   */
  isUpToDate(methodKey, currentBodyHash) {
    const cached = this.get(methodKey);
    if (!cached) return false;
    return cached.annotatedBodyHash === currentBodyHash;
  }

  /**
   * Remove an annotation from cache
   */
  remove(methodKey) {
    if (!this.cache) this.load();
    delete this.cache.annotations[methodKey];
  }

  /**
   * Get cache statistics
   */
  getStats() {
    if (!this.cache) this.load();

    const annotations = Object.values(this.cache.annotations);
    const bySource = {};

    for (const ann of annotations) {
      const source = ann.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }

    return {
      total: annotations.length,
      bySource,
      generated: this.cache.generated
    };
  }

  /**
   * Merge cached annotations with index data
   * @param {Object} methodData - Method data from index
   * @param {string} methodKey - Method key
   * @returns {Object} Enriched data with JIT annotations
   */
  mergeWithMethod(methodData, methodKey) {
    const cached = this.get(methodKey);
    if (!cached) return methodData;

    // If cached annotation is outdated, ignore it
    if (cached.annotatedBodyHash !== methodData.bodyHash) {
      return methodData;
    }

    // Merge: source annotations have priority, cache completes
    return {
      ...methodData,
      role: methodData.role || cached.role,
      description: methodData.description || cached.description,
      effects: Object.keys(methodData.effects || {}).length > 0
        ? methodData.effects
        : (cached.effects || {}),
      consumers: (methodData.consumers || []).length > 0
        ? methodData.consumers
        : (cached.consumers || []),
      context: methodData.context?.requires?.length > 0
        ? methodData.context
        : (cached.context || { requires: [], provides: [] }),
      _fromCache: true,
      _cacheSource: cached.source
    };
  }
}

// ============================================================================
// METHODINDEXER EXTENSIONS - JIT annotation management
// ============================================================================

/**
 * Check annotation status of a method
 * @param {string} methodKey - Method key
 * @param {AnnotationCache} annotationCache - Annotation cache (optional)
 * @returns {'complete'|'outdated'|'partial'|'missing'} Status
 */
MethodIndexer.prototype.getAnnotationStatus = function(methodKey, annotationCache = null) {
  const method = this.index.methods[methodKey];
  if (!method) return 'missing';

  // Check source annotations
  const hasSourceRole = !!method.role && method.role !== 'internal';
  const hasSourceDescription = !!method.description;
  const hasSourceEffects = method.effects && Object.keys(method.effects).length > 0;
  const hasSourceConsumers = method.consumers && method.consumers.length > 0;

  // Check JIT cache
  let hasCachedAnnotation = false;
  let cacheUpToDate = false;

  if (annotationCache) {
    const cached = annotationCache.get(methodKey);
    if (cached) {
      hasCachedAnnotation = true;
      cacheUpToDate = cached.annotatedBodyHash === method.bodyHash;
    }
  }

  // Status logic
  if (hasSourceRole && hasSourceDescription) {
    return 'complete';
  }

  if (hasCachedAnnotation && !cacheUpToDate) {
    return 'outdated';
  }

  if (hasCachedAnnotation && cacheUpToDate) {
    return 'complete';
  }

  if (hasSourceRole || hasSourceDescription || hasSourceEffects || hasSourceConsumers) {
    return 'partial';
  }

  return 'missing';
};

/**
 * Identify methods needing annotation
 * @param {string[]} methodKeys - List of keys to check
 * @param {AnnotationCache} annotationCache - Annotation cache
 * @returns {Object} { complete: [], outdated: [], partial: [], missing: [] }
 */
MethodIndexer.prototype.checkAnnotations = function(methodKeys, annotationCache = null) {
  const result = {
    complete: [],
    outdated: [],
    partial: [],
    missing: []
  };

  for (const key of methodKeys) {
    const status = this.getAnnotationStatus(key, annotationCache);
    result[status].push(key);
  }

  return result;
};

/**
 * Get method data enriched with JIT cache
 * @param {string} methodKey - Method key
 * @param {AnnotationCache} annotationCache - Annotation cache
 */
MethodIndexer.prototype.getMethodWithCache = function(methodKey, annotationCache) {
  const method = this.index.methods[methodKey];
  if (!method) return null;

  if (annotationCache) {
    return annotationCache.mergeWithMethod(method, methodKey);
  }

  return method;
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  MethodIndexer,
  ASTParser,
  AnnotationCache,
  CONFIG,
  hashContent,
  extractCode
};
