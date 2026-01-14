/**
 * Annotation Manager - JSDoc annotation management for cartography
 *
 * Usage:
 *   node agents/annotation-manager.cjs audit              # List missing annotations
 *   node agents/annotation-manager.cjs suggest            # Generate suggestions
 *   node agents/annotation-manager.cjs suggest --file X   # Suggestions for a file
 *   node agents/annotation-manager.cjs apply              # Apply suggestions (with backup)
 *   node agents/annotation-manager.cjs apply --file X     # Apply for a file
 *   node agents/annotation-manager.cjs stats              # Annotation statistics
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./utils/logger.cjs');
const { listFiles, readFile, writeFile, createBackup, readJSON, writeJSON } = require('./utils/file-utils.cjs');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Project path: from env, --project arg, or current working directory
const PROJECT_PATH = process.env.LC_PROJECT_PATH || process.cwd();
const CACHE_PATH = path.resolve(__dirname, '.cache');

const CONFIG = {
  rootPath: PROJECT_PATH,
  srcPath: path.join(PROJECT_PATH, 'src'),
  suggestionsPath: path.join(CACHE_PATH, 'annotation-suggestions.json'),

  // Role taxonomy
  roles: {
    entry: 'Unique entry point, system bootstrap',
    core: 'Orchestration, central business logic',
    service: 'API consumed by other classes',
    flow: 'Recursive propagation, lifecycle control',
    bridge: 'Connects two distinct domains',
    helper: 'Factory, pure utilities',
    internal: 'Private implementation, internal use',
    adapter: 'Format/data transformation'
  },

  // Effect taxonomy
  effects: {
    creates: 'Newly instantiated objects',
    mutates: 'Objects modified in place',
    emits: 'Events/notifications emitted',
    stores: 'Persistence (localStorage, cache)',
    resets: 'State resets'
  },

  // Heuristics for automatic role detection
  roleHeuristics: {
    // Name patterns -> suggested role
    namePatterns: [
      { pattern: /^nova$/, role: 'helper', confidence: 0.9 },
      { pattern: /^init/, role: 'entry', confidence: 0.7 },
      { pattern: /^genesis$/, role: 'flow', confidence: 0.8 },
      { pattern: /^create/, role: 'core', confidence: 0.6 },
      { pattern: /^build/, role: 'core', confidence: 0.6 },
      { pattern: /^get[A-Z]/, role: 'service', confidence: 0.5 },
      { pattern: /^set[A-Z]/, role: 'service', confidence: 0.5 },
      { pattern: /^find/, role: 'service', confidence: 0.5 },
      { pattern: /^update/, role: 'service', confidence: 0.5 },
      { pattern: /^replace/, role: 'service', confidence: 0.5 },
      { pattern: /^prepare/, role: 'service', confidence: 0.5 },
      { pattern: /^upgrade/, role: 'core', confidence: 0.7 },
      { pattern: /^adapt$/, role: 'adapter', confidence: 0.8 },
      { pattern: /^transform/, role: 'adapter', confidence: 0.7 },
      { pattern: /^convert/, role: 'adapter', confidence: 0.7 },
      { pattern: /^notify/, role: 'service', confidence: 0.6 },
      { pattern: /^observe/, role: 'service', confidence: 0.6 },
      { pattern: /^handle/, role: 'internal', confidence: 0.5 },
      { pattern: /^_/, role: 'internal', confidence: 0.8 },
      { pattern: /^#/, role: 'internal', confidence: 0.9 },
    ],
    // Structural context
    structural: {
      isStatic: { role: 'helper', confidence: 0.6 },
      isPrivate: { role: 'internal', confidence: 0.8 },
      isArrowAssignment: { role: 'service', confidence: 0.4 },
    }
  }
};

// ============================================================================
// SOURCE CODE PARSER
// ============================================================================

class SourceParser {

  /**
   * Parse a file and extract all methods with their context
   */
  parseFile(filePath) {
    const content = readFile(filePath);
    if (!content) return null;

    const relativePath = path.relative(CONFIG.rootPath, filePath);

    return {
      path: relativePath,
      absolutePath: filePath,
      content,
      classes: this.extractClasses(content),
      functions: this.extractStandaloneFunctions(content),
      imports: this.extractImports(content),
      exports: this.extractExports(content)
    };
  }

  /**
   * Extract classes with their methods
   */
  extractClasses(content) {
    const classes = [];

    // Pattern to capture class with optional JSDoc
    const classPattern = /(\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
    let classMatch;

    while ((classMatch = classPattern.exec(content)) !== null) {
      const jsdoc = classMatch[1] ? this.parseJSDoc(classMatch[1]) : null;
      const className = classMatch[3];
      const extendsClass = classMatch[4] || null;
      const classStart = classMatch.index;

      // Find end of class (matching braces)
      const classBody = this.extractBracedBlock(content, classStart + classMatch[0].length - 1);

      const classInfo = {
        name: className,
        extends: extendsClass,
        jsdoc,
        startIndex: classStart,
        methods: this.extractMethods(classBody, className)
      };

      classes.push(classInfo);
    }

    return classes;
  }

  /**
   * Extract methods from a class
   */
  extractMethods(classBody, className) {
    const methods = [];

    // Pattern for methods with optional JSDoc
    // Supports: method(), #method(), static method(), async method(), method = () =>
    // Note: excludes simple properties (x = value) by requiring either () { or = () =>
    const methodPattern = /(\/\*\*[\s\S]*?\*+\/\s*)?(static\s+)?(async\s+)?(#?\w+)\s*(?:(\([^)]*\))\s*\{|=\s*\([^)]*\)\s*=>|=\s*(?:async\s+)?\([^)]*\)\s*=>)/g;
    let methodMatch;

    while ((methodMatch = methodPattern.exec(classBody)) !== null) {
      const jsdocRaw = methodMatch[1];
      const isStatic = !!methodMatch[2];
      const isAsync = !!methodMatch[3];
      const methodName = methodMatch[4];
      const params = methodMatch[5] || '';

      // Ignore constructor, class name, and JavaScript keywords
      const jsKeywords = ['constructor', 'if', 'else', 'for', 'while', 'do', 'switch',
                          'case', 'break', 'continue', 'return', 'throw', 'try', 'catch',
                          'finally', 'new', 'delete', 'typeof', 'void', 'in', 'instanceof',
                          'this', 'super', 'class', 'extends', 'export', 'import', 'from',
                          'default', 'function', 'var', 'let', 'const', 'true', 'false', 'null'];
      if (methodName === className || jsKeywords.includes(methodName)) continue;

      const jsdoc = jsdocRaw ? this.parseJSDoc(jsdocRaw) : null;
      const isPrivate = methodName.startsWith('#');
      const isArrowAssignment = methodMatch[0].includes('=>');

      // Extract method body for effect analysis
      const methodBodyStart = methodMatch.index + methodMatch[0].length;
      const methodBody = isArrowAssignment
        ? this.extractArrowBody(classBody, methodBodyStart - 2)
        : this.extractBracedBlock(classBody, methodMatch.index + methodMatch[0].length - 1);

      methods.push({
        name: methodName,
        isStatic,
        isAsync,
        isPrivate,
        isArrowAssignment,
        params,
        jsdoc,
        body: methodBody,
        rawJsdoc: jsdocRaw || null,
        startIndex: methodMatch.index,
        fullMatch: methodMatch[0]
      });
    }

    return methods;
  }

  /**
   * Extract standalone functions (outside classes)
   */
  extractStandaloneFunctions(content) {
    const functions = [];

    // Pattern for functions outside classes
    const funcPattern = /(\/\*\*[\s\S]*?\*+\/\s*)?(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
    let funcMatch;

    while ((funcMatch = funcPattern.exec(content)) !== null) {
      const jsdocRaw = funcMatch[1];
      const isExported = !!funcMatch[2];
      const isAsync = !!funcMatch[3];
      const funcName = funcMatch[4];
      const params = funcMatch[5];

      functions.push({
        name: funcName,
        isExported,
        isAsync,
        params,
        jsdoc: jsdocRaw ? this.parseJSDoc(jsdocRaw) : null,
        rawJsdoc: jsdocRaw || null,
        startIndex: funcMatch.index
      });
    }

    return functions;
  }

  /**
   * Parse a JSDoc block and extract tags
   */
  parseJSDoc(jsdocRaw) {
    if (!jsdocRaw) return null;

    const result = {
      description: null,
      role: null,
      consumer: [],
      effect: {},
      context: { requires: [], provides: [] },
      phase: null,
      responsibility: null,
      danger: null,
      pure: false,
      scope: null,
      sideeffect: null
    };

    // Clean the JSDoc
    const cleaned = jsdocRaw
      .replace(/^\/\*\*/, '')
      .replace(/\*+\/$/, '')
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim();

    // Description (before first @)
    const firstTagIndex = cleaned.search(/@\w+/);
    if (firstTagIndex === -1) {
      result.description = cleaned || null;
    } else if (firstTagIndex > 0) {
      result.description = cleaned.substring(0, firstTagIndex).trim() || null;
    }

    // @role
    const roleMatch = cleaned.match(/@[Rr]ole:?\s*(\w+)/i);
    if (roleMatch) result.role = roleMatch[1].toLowerCase();

    // @consumer
    const consumerMatch = cleaned.match(/@consumer:?\s+(.+?)(?=@|\n\s*$)/si);
    if (consumerMatch) {
      result.consumer = consumerMatch[1]
        .split(/[,\s]+/)
        .map(c => c.trim())
        .filter(c => c.length > 0 && !c.startsWith('*'));
    }

    // @effect (format: @effect creates: X, Y ou @effect mutates: Z)
    const effectMatches = cleaned.matchAll(/@effect\s+(\w+):?\s*([^\n@]+)/gi);
    for (const match of effectMatches) {
      const effectType = match[1].toLowerCase();
      const effectTargets = match[2].split(/[,\s]+/).map(t => t.trim()).filter(t => t);
      if (!result.effect[effectType]) result.effect[effectType] = [];
      result.effect[effectType].push(...effectTargets);
    }

    // @context requires/provides
    const contextReqMatch = cleaned.match(/@context\s+requires:?\s*([^\n@]+)/i);
    if (contextReqMatch) {
      result.context.requires = contextReqMatch[1].split(/[,\s]+/).map(t => t.trim()).filter(t => t);
    }
    const contextProvMatch = cleaned.match(/@context\s+provides:?\s*([^\n@]+)/i);
    if (contextProvMatch) {
      result.context.provides = contextProvMatch[1].split(/[,\s]+/).map(t => t.trim()).filter(t => t);
    }

    // Other tags
    const phaseMatch = cleaned.match(/@phase:?\s*(\w+)/i);
    if (phaseMatch) result.phase = phaseMatch[1];

    const respMatch = cleaned.match(/@responsibility:?\s*(.+?)(?=@|\n\s*$)/si);
    if (respMatch) result.responsibility = respMatch[1].trim();

    const dangerMatch = cleaned.match(/@danger:?\s*(.+?)(?=@|\n\s*$)/si);
    if (dangerMatch) result.danger = dangerMatch[1].trim();

    if (/@pure\b/i.test(cleaned)) result.pure = true;

    const scopeMatch = cleaned.match(/@scope:?\s*(\w+)/i);
    if (scopeMatch) result.scope = scopeMatch[1];

    const sideeffectMatch = cleaned.match(/@sideeffect:?\s*(.+?)(?=@|\n\s*$)/si);
    if (sideeffectMatch) result.sideeffect = sideeffectMatch[1].trim();

    return result;
  }

  /**
   * Extract a block between braces
   */
  extractBracedBlock(content, startIndex) {
    let depth = 0;
    let start = startIndex;
    let end = startIndex;

    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        if (depth === 0) start = i + 1;
        depth++;
      } else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    return content.substring(start, end);
  }

  /**
   * Extract arrow function body
   */
  extractArrowBody(content, startIndex) {
    // Look for => then extract until logical end
    const arrowIndex = content.indexOf('=>', startIndex);
    if (arrowIndex === -1) return '';

    const afterArrow = content.substring(arrowIndex + 2).trim();

    // If starts with {, it's a block
    if (afterArrow.startsWith('{')) {
      return this.extractBracedBlock(content, arrowIndex + 2 + content.substring(arrowIndex + 2).indexOf('{'));
    }

    // Otherwise it's an expression (until next ; or significant newline)
    const match = afterArrow.match(/^[^;\n]+/);
    return match ? match[0].trim() : '';
  }

  /**
   * Extract imports
   */
  extractImports(content) {
    const imports = [];
    const importPattern = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importPattern.exec(content)) !== null) {
      imports.push({
        named: match[1] ? match[1].split(',').map(n => n.trim()) : [],
        default: match[2] || null,
        source: match[3]
      });
    }

    return imports;
  }

  /**
   * Extract exports
   */
  extractExports(content) {
    const exports = [];

    // export { X, Y }
    const namedMatch = content.matchAll(/export\s*\{\s*([^}]+)\s*\}/g);
    for (const m of namedMatch) {
      exports.push(...m[1].split(',').map(n => n.trim()));
    }

    // export class/function/const
    const directMatch = content.matchAll(/export\s+(?:default\s+)?(?:class|function|const|let)\s+(\w+)/g);
    for (const m of directMatch) {
      exports.push(m[1]);
    }

    return [...new Set(exports)];
  }
}

// ============================================================================
// EFFECT ANALYZER
// ============================================================================

class EffectAnalyzer {

  /**
   * Analyze method body to detect effects
   */
  analyzeEffects(methodBody, className) {
    const effects = {
      creates: [],
      mutates: [],
      emits: [],
      stores: [],
      resets: []
    };

    if (!methodBody) return effects;

    // Detect creations (new X)
    const newMatches = methodBody.matchAll(/new\s+(?:this\.\$\.)?(\w+)/g);
    for (const m of newMatches) {
      if (!effects.creates.includes(m[1])) {
        effects.creates.push(m[1]);
      }
    }

    // Detect factory calls (X.nova())
    const novaMatches = methodBody.matchAll(/(?:this\.\$\.)?(\w+)\.nova\(/g);
    for (const m of novaMatches) {
      if (!effects.creates.includes(m[1])) {
        effects.creates.push(m[1]);
      }
    }

    // Detect mutations (this.X = )
    const mutateMatches = methodBody.matchAll(/this\.(\w+)\s*=/g);
    for (const m of mutateMatches) {
      const prop = m[1];
      if (!['$', 'constructor'].includes(prop) && !effects.mutates.includes(`this.${prop}`)) {
        effects.mutates.push(`this.${prop}`);
      }
    }

    // Detect emissions (notify, emit, dispatch)
    if (/(?:notify|emit|dispatch|trigger)\w*\s*\(/i.test(methodBody)) {
      effects.emits.push('events');
    }
    if (/addObserver|observer/i.test(methodBody)) {
      effects.emits.push('observo');
    }

    // Detect storage
    if (/localStorage|sessionStorage/i.test(methodBody)) {
      effects.stores.push('localStorage');
    }
    if (/writeJSON|writeFile/i.test(methodBody)) {
      effects.stores.push('file');
    }

    // Detect resets
    if (/resetId|reset\w*\(/i.test(methodBody)) {
      effects.resets.push('ids');
    }

    // Clean empty effects
    for (const key of Object.keys(effects)) {
      if (effects[key].length === 0) delete effects[key];
    }

    return effects;
  }

  /**
   * Analyze contextual dependencies (requires/provides)
   */
  analyzeContext(method) {
    const context = {
      requires: [],
      provides: []
    };

    // Requires: basé sur les paramètres
    if (method.params) {
      const params = method.params.replace(/[()]/g, '').split(',')
        .map(p => p.trim().split(/[=:]/)[0].trim())
        .filter(p => p && p !== '');
      context.requires.push(...params);
    }

    // Requires: accès à this.$ (dépendance au contexte Biblio)
    if (method.body && /this\.\$\./g.test(method.body)) {
      if (!context.requires.includes('this.$')) {
        context.requires.push('this.$');
      }
    }

    // Provides: basé sur les returns
    if (method.body) {
      const returnMatches = method.body.matchAll(/return\s+(?:new\s+)?(?:this\.\$\.)?(\w+)/g);
      for (const m of returnMatches) {
        if (!['this', 'null', 'undefined', 'true', 'false'].includes(m[1])) {
          if (!context.provides.includes(m[1])) {
            context.provides.push(m[1]);
          }
        }
      }
    }

    return context;
  }
}

// ============================================================================
// CONSUMER ANALYZER
// ============================================================================

class ConsumerAnalyzer {
  constructor() {
    this.callGraph = new Map(); // methodKey -> Set<callerKey>
  }

  /**
   * Build the call graph for the entire project
   */
  buildCallGraph(parsedFiles) {
    this.callGraph.clear();

    // Collect all existing methods
    const allMethods = new Map(); // methodName -> [{ class, file }]

    for (const file of parsedFiles) {
      for (const cls of file.classes) {
        for (const method of cls.methods) {
          const key = method.name;
          if (!allMethods.has(key)) allMethods.set(key, []);
          allMethods.get(key).push({ class: cls.name, file: file.path });
        }
      }
    }

    // Analyze calls
    for (const file of parsedFiles) {
      for (const cls of file.classes) {
        for (const method of cls.methods) {
          if (!method.body) continue;

          const callerKey = `${cls.name}.${method.name}`;

          // Look for method calls
          // Pattern: this.method(), instance.method(), Class.method()
          const callPatterns = [
            /this\.(\w+)\s*\(/g,                    // this.method()
            /(?:this\.\$\.)?(\w+)\.(\w+)\s*\(/g,   // X.method() or this.$.X.method()
          ];

          for (const pattern of callPatterns) {
            const matches = method.body.matchAll(pattern);
            for (const m of matches) {
              const calledMethod = m[2] || m[1];

              // Find classes that have this method
              if (allMethods.has(calledMethod)) {
                for (const target of allMethods.get(calledMethod)) {
                  const targetKey = `${target.class}.${calledMethod}`;

                  if (!this.callGraph.has(targetKey)) {
                    this.callGraph.set(targetKey, new Set());
                  }
                  this.callGraph.get(targetKey).add(callerKey);
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Get consumers of a method
   */
  getConsumers(className, methodName) {
    const key = `${className}.${methodName}`;
    const consumers = this.callGraph.get(key);
    return consumers ? [...consumers] : [];
  }
}

// ============================================================================
// SUGGESTION GENERATOR
// ============================================================================

class SuggestionGenerator {
  constructor() {
    this.parser = new SourceParser();
    this.effectAnalyzer = new EffectAnalyzer();
    this.consumerAnalyzer = new ConsumerAnalyzer();
  }

  /**
   * Generate suggestions for all files
   */
  generateAll() {
    const files = listFiles(CONFIG.srcPath, (name) => {
      const ext = path.extname(name).toLowerCase();
      return ['.js'].includes(ext);
    });

    const parsedFiles = files
      .map(f => this.parser.parseFile(f))
      .filter(f => f !== null);

    // Build the call graph
    this.consumerAnalyzer.buildCallGraph(parsedFiles);

    const suggestions = [];

    for (const file of parsedFiles) {
      const fileSuggestions = this.generateForFile(file);
      if (fileSuggestions.length > 0) {
        suggestions.push({
          path: file.path,
          absolutePath: file.absolutePath,
          suggestions: fileSuggestions
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate suggestions for a single file
   */
  generateForFile(parsedFile) {
    const suggestions = [];

    for (const cls of parsedFile.classes) {
      // Suggestions for the class itself
      if (!cls.jsdoc || !cls.jsdoc.role) {
        suggestions.push({
          type: 'class',
          target: cls.name,
          missing: ['role'],
          suggested: {
            role: this.suggestClassRole(cls)
          }
        });
      }

      // Suggestions for methods
      for (const method of cls.methods) {
        const missing = [];
        const suggested = {};

        // Missing @role
        if (!method.jsdoc || !method.jsdoc.role) {
          missing.push('role');
          suggested.role = this.suggestMethodRole(method);
        }

        // Missing or incomplete @effect
        const detectedEffects = this.effectAnalyzer.analyzeEffects(method.body, cls.name);
        if (Object.keys(detectedEffects).length > 0) {
          const currentEffects = method.jsdoc?.effect || {};
          const missingEffects = {};

          for (const [type, targets] of Object.entries(detectedEffects)) {
            const current = currentEffects[type] || [];
            const newTargets = targets.filter(t => !current.includes(t));
            if (newTargets.length > 0) {
              missingEffects[type] = newTargets;
            }
          }

          if (Object.keys(missingEffects).length > 0) {
            missing.push('effect');
            suggested.effect = missingEffects;
          }
        }

        // @consumer for services
        const suggestedRole = suggested.role || method.jsdoc?.role;
        if (suggestedRole === 'service') {
          const consumers = this.consumerAnalyzer.getConsumers(cls.name, method.name);
          const currentConsumers = method.jsdoc?.consumer || [];
          const newConsumers = consumers.filter(c => !currentConsumers.includes(c));

          if (newConsumers.length > 0) {
            missing.push('consumer');
            suggested.consumer = newConsumers;
          }
        }

        // Missing @context
        const detectedContext = this.effectAnalyzer.analyzeContext(method);
        if (detectedContext.requires.length > 0 || detectedContext.provides.length > 0) {
          const currentContext = method.jsdoc?.context || { requires: [], provides: [] };
          const missingContext = { requires: [], provides: [] };

          for (const req of detectedContext.requires) {
            if (!currentContext.requires.includes(req)) {
              missingContext.requires.push(req);
            }
          }
          for (const prov of detectedContext.provides) {
            if (!currentContext.provides.includes(prov)) {
              missingContext.provides.push(prov);
            }
          }

          if (missingContext.requires.length > 0 || missingContext.provides.length > 0) {
            missing.push('context');
            suggested.context = missingContext;
          }
        }

        if (missing.length > 0) {
          suggestions.push({
            type: 'method',
            class: cls.name,
            target: method.name,
            isPrivate: method.isPrivate,
            isStatic: method.isStatic,
            hasJsdoc: !!method.jsdoc,
            missing,
            suggested,
            confidence: this.calculateConfidence(suggested)
          });
        }
      }
    }

    // Suggestions for standalone functions
    for (const func of parsedFile.functions) {
      const missing = [];
      const suggested = {};

      if (!func.jsdoc || !func.jsdoc.role) {
        missing.push('role');
        suggested.role = func.isExported ? 'helper' : 'internal';
      }

      if (missing.length > 0) {
        suggestions.push({
          type: 'function',
          target: func.name,
          isExported: func.isExported,
          hasJsdoc: !!func.jsdoc,
          missing,
          suggested,
          confidence: 0.5
        });
      }
    }

    return suggestions;
  }

  /**
   * Suggest a role for a class
   */
  suggestClassRole(cls) {
    const name = cls.name.toLowerCase();

    // Name-based heuristics
    if (name === 'biblio') return { role: 'entry', confidence: 0.9 };
    if (name.includes('agent')) return { role: 'service', confidence: 0.8 };
    if (name.includes('manager')) return { role: 'core', confidence: 0.7 };
    if (name.includes('factory')) return { role: 'helper', confidence: 0.8 };
    if (name.includes('adapter')) return { role: 'adapter', confidence: 0.9 };
    if (name.includes('bridge')) return { role: 'bridge', confidence: 0.9 };

    // Default based on inheritance
    if (cls.extends) {
      if (['Aion', 'Peri', 'Nucleus'].includes(cls.extends)) {
        return { role: 'core', confidence: 0.6 };
      }
    }

    return { role: 'core', confidence: 0.4 };
  }

  /**
   * Suggest a role for a method
   */
  suggestMethodRole(method) {
    let bestMatch = { role: 'internal', confidence: 0.3 };

    // Apply name heuristics
    for (const heuristic of CONFIG.roleHeuristics.namePatterns) {
      if (heuristic.pattern.test(method.name)) {
        if (heuristic.confidence > bestMatch.confidence) {
          bestMatch = { role: heuristic.role, confidence: heuristic.confidence };
        }
      }
    }

    // Apply structural heuristics
    if (method.isStatic && CONFIG.roleHeuristics.structural.isStatic.confidence > bestMatch.confidence) {
      bestMatch = CONFIG.roleHeuristics.structural.isStatic;
    }
    if (method.isPrivate && CONFIG.roleHeuristics.structural.isPrivate.confidence > bestMatch.confidence) {
      bestMatch = CONFIG.roleHeuristics.structural.isPrivate;
    }

    return bestMatch;
  }

  /**
   * Calculate overall confidence of a suggestion
   */
  calculateConfidence(suggested) {
    let total = 0;
    let count = 0;

    if (suggested.role) {
      total += suggested.role.confidence || 0.5;
      count++;
    }
    if (suggested.effect) {
      total += 0.8; // Detected effects are fairly reliable
      count++;
    }
    if (suggested.consumer) {
      total += 0.9; // Consumers are detected via static analysis
      count++;
    }

    return count > 0 ? total / count : 0.5;
  }
}

// ============================================================================
// SUGGESTION APPLIER
// ============================================================================

class SuggestionApplier {

  /**
   * Apply suggestions to a file using exact positions
   */
  applyToFile(filePath, suggestions, options = { backup: true }) {
    let content = readFile(filePath);
    if (!content) {
      log('AnnotationManager', `File not found: ${filePath}`, 'error');
      return false;
    }

    // Backup
    if (options.backup) {
      const backupPath = createBackup(filePath);
      log('AnnotationManager', `Backup created: ${backupPath}`);
    }

    // Re-parse the file to get exact positions
    const parser = new SourceParser();
    const parsed = parser.parseFile(filePath);
    if (!parsed) return false;

    // Collect all modifications with their positions
    const edits = [];

    for (const suggestion of suggestions) {
      if (suggestion.type === 'class') {
        const cls = parsed.classes.find(c => c.name === suggestion.target);
        if (cls) {
          edits.push(this.buildClassEdit(content, cls, suggestion));
        }
      } else if (suggestion.type === 'method') {
        const cls = parsed.classes.find(c => c.name === suggestion.class);
        if (cls) {
          const method = cls.methods.find(m => m.name === suggestion.target);
          if (method) {
            // Calculer la position absolue dans le fichier
            const classStartInFile = cls.startIndex;
            const classJsdocLength = cls.jsdoc ? content.substring(0, classStartInFile).lastIndexOf('/**') : classStartInFile;
            const classBodyStart = content.indexOf('{', classStartInFile) + 1;

            edits.push(this.buildMethodEdit(content, method, suggestion, classBodyStart));
          }
        }
      } else if (suggestion.type === 'function') {
        const func = parsed.functions.find(f => f.name === suggestion.target);
        if (func) {
          edits.push(this.buildFunctionEdit(content, func, suggestion));
        }
      }
    }

    // Apply edits from farthest to closest (to avoid offset issues)
    edits.sort((a, b) => b.position - a.position);

    for (const edit of edits) {
      if (edit && edit.position >= 0) {
        content = content.substring(0, edit.position) + edit.replacement + content.substring(edit.endPosition);
      }
    }

    writeFile(filePath, content);
    return true;
  }

  /**
   * Build an edit for a class
   */
  buildClassEdit(content, cls, suggestion) {
    const { suggested } = suggestion;

    // Find the exact start of the class (including its JSDoc if any)
    let position = cls.startIndex;
    let endPosition = position;

    // Check if a JSDoc immediately precedes the class
    const beforeClass = content.substring(0, position);
    const jsdocMatch = beforeClass.match(/\/\*\*[\s\S]*?\*\/\s*$/);

    if (jsdocMatch) {
      // There is a JSDoc, we need to enrich it
      position = position - jsdocMatch[0].length;
      const existingJsdoc = jsdocMatch[0];
      const enriched = this.enrichExistingJsdoc(existingJsdoc, suggested);
      return {
        position,
        endPosition: cls.startIndex,
        replacement: enriched
      };
    } else {
      // No JSDoc, create one
      const newJsdoc = this.createJsdoc(suggested);
      const indent = this.detectIndent(content, position);
      return {
        position,
        endPosition: position,
        replacement: newJsdoc + '\n' + indent
      };
    }
  }

  /**
   * Build an edit for a method
   */
  buildMethodEdit(content, method, suggestion, classBodyStart) {
    const { suggested, hasJsdoc } = suggestion;

    // Find the absolute position of the method in the file
    // We look for the exact method pattern after the class body start
    const methodNameEscaped = method.name.replace('#', '\\#');
    const methodPattern = new RegExp(
      `((?:\\/\\*\\*[\\s\\S]*?\\*+\\/\\s*)?)((?:static\\s+)?(?:async\\s+)?${methodNameEscaped}\\s*(?:=\\s*\\([^)]*\\)\\s*=>|\\([^)]*\\)\\s*\\{))`,
      'g'
    );

    // Search in the class body only
    const searchArea = content.substring(classBodyStart);
    const match = methodPattern.exec(searchArea);

    if (!match) return null;

    const absolutePosition = classBodyStart + match.index;
    const existingJsdoc = match[1];
    const methodDecl = match[2];

    if (hasJsdoc && existingJsdoc.trim()) {
      // Enrich the existing JSDoc
      const enriched = this.enrichExistingJsdoc(existingJsdoc, suggested);
      return {
        position: absolutePosition,
        endPosition: absolutePosition + existingJsdoc.length,
        replacement: enriched
      };
    } else {
      // Create a new JSDoc
      const newJsdoc = this.createJsdoc(suggested);
      const indent = this.detectIndent(content, absolutePosition);
      return {
        position: absolutePosition + (existingJsdoc ? existingJsdoc.length : 0),
        endPosition: absolutePosition + (existingJsdoc ? existingJsdoc.length : 0),
        replacement: newJsdoc + '\n' + indent
      };
    }
  }

  /**
   * Build an edit for a standalone function
   */
  buildFunctionEdit(content, func, suggestion) {
    const { suggested, hasJsdoc } = suggestion;

    const funcPattern = new RegExp(
      `((?:\\/\\*\\*[\\s\\S]*?\\*+\\/\\s*)?)((?:export\\s+)?(?:async\\s+)?function\\s+${func.name})`,
      'g'
    );

    const match = funcPattern.exec(content);
    if (!match) return null;

    const position = match.index;
    const existingJsdoc = match[1];

    if (hasJsdoc && existingJsdoc.trim()) {
      const enriched = this.enrichExistingJsdoc(existingJsdoc, suggested);
      return {
        position,
        endPosition: position + existingJsdoc.length,
        replacement: enriched
      };
    } else {
      const newJsdoc = this.createJsdoc(suggested);
      const indent = this.detectIndent(content, position);
      return {
        position: position + (existingJsdoc ? existingJsdoc.length : 0),
        endPosition: position + (existingJsdoc ? existingJsdoc.length : 0),
        replacement: newJsdoc + '\n' + indent
      };
    }
  }

  /**
   * Detect indentation at a given position
   */
  detectIndent(content, position) {
    const lineStart = content.lastIndexOf('\n', position - 1) + 1;
    const lineContent = content.substring(lineStart, position);
    const indentMatch = lineContent.match(/^(\s*)/);
    return indentMatch ? indentMatch[1] : '    ';
  }

  /**
   * Enrich an existing JSDoc with new tags
   */
  enrichExistingJsdoc(existingJsdoc, suggested) {
    let enriched = existingJsdoc.trimEnd();

    // Remove trailing */ to add lines
    if (enriched.endsWith('*/')) {
      enriched = enriched.slice(0, -2).trimEnd();
    } else if (enriched.endsWith('**/')) {
      enriched = enriched.slice(0, -3).trimEnd();
    }

    const linesToAdd = [];

    // @role
    if (suggested.role && !/@role/i.test(existingJsdoc)) {
      linesToAdd.push(`@role ${suggested.role.role || suggested.role}`);
    }

    // @effect
    if (suggested.effect) {
      for (const [type, targets] of Object.entries(suggested.effect)) {
        if (targets.length > 0) {
          linesToAdd.push(`@effect ${type}: ${targets.join(', ')}`);
        }
      }
    }

    // @consumer
    if (suggested.consumer && suggested.consumer.length > 0) {
      linesToAdd.push(`@consumer ${suggested.consumer.join(', ')}`);
    }

    // @context
    if (suggested.context) {
      if (suggested.context.requires?.length > 0) {
        linesToAdd.push(`@context requires: ${suggested.context.requires.join(', ')}`);
      }
      if (suggested.context.provides?.length > 0) {
        linesToAdd.push(`@context provides: ${suggested.context.provides.join(', ')}`);
      }
    }

    if (linesToAdd.length > 0) {
      enriched += '\n' + linesToAdd.map(l => ' * ' + l).join('\n') + '\n */';
    } else {
      enriched += ' */';
    }

    return enriched;
  }

  /**
   * Create a new JSDoc block
   */
  createJsdoc(suggested) {
    const lines = ['/**'];

    // @role
    if (suggested.role) {
      const role = suggested.role.role || suggested.role;
      lines.push(` * @role ${role}`);
    }

    // @effect
    if (suggested.effect) {
      for (const [type, targets] of Object.entries(suggested.effect)) {
        if (targets.length > 0) {
          lines.push(` * @effect ${type}: ${targets.join(', ')}`);
        }
      }
    }

    // @consumer
    if (suggested.consumer && suggested.consumer.length > 0) {
      lines.push(` * @consumer ${suggested.consumer.join(', ')}`);
    }

    // @context
    if (suggested.context) {
      if (suggested.context.requires?.length > 0) {
        lines.push(` * @context requires: ${suggested.context.requires.join(', ')}`);
      }
      if (suggested.context.provides?.length > 0) {
        lines.push(` * @context provides: ${suggested.context.provides.join(', ')}`);
      }
    }

    lines.push(' */');
    return lines.join('\n');
  }
}

// ============================================================================
// CLI COMMANDS
// ============================================================================

async function runScan(targetFile = null) {
  log('AnnotationManager', '=== CODEBASE SCAN ===', 'info');

  const generator = new SuggestionGenerator();
  const suggestions = generator.generateAll();

  // Filter if specific file
  const filtered = targetFile
    ? suggestions.filter(s => s.path.includes(targetFile))
    : suggestions;

  let totalMethods = 0;

  for (const file of filtered) {
    console.log(`\n📄 ${file.path}`);

    for (const s of file.suggestions) {
      totalMethods++;
      const icon = s.type === 'class' ? '🏛️' : s.type === 'method' ? '⚙️' : '📦';
      const target = s.class ? `${s.class}.${s.target}` : s.target;
      const inferredTags = s.missing.map(m => `@${m}`).join(', ');

      console.log(`  ${icon} ${target}`);
      console.log(`     Can infer: ${inferredTags}`);
    }
  }

  console.log(`\n📊 Total: ${totalMethods} methods to enrich in ${filtered.length} files`);
}

async function runEnrich(targetFile = null, options = {}) {
  log('AnnotationManager', '=== ENRICHING CARTOGRAPHY ===', 'info');

  const generator = new SuggestionGenerator();
  const suggestions = generator.generateAll();

  // Filter if specific file
  const filtered = targetFile
    ? suggestions.filter(s => s.path.includes(targetFile))
    : suggestions;

  // Save enriched data
  writeJSON(CONFIG.suggestionsPath, {
    generated: new Date().toISOString(),
    files: filtered
  });

  for (const file of filtered) {
    console.log(`\n📄 ${file.path}`);

    for (const s of file.suggestions) {
      const icon = s.type === 'class' ? '🏛️' : s.type === 'method' ? '⚙️' : '📦';
      const target = s.class ? `${s.class}.${s.target}` : s.target;
      const confidence = s.confidence ? ` (${Math.round(s.confidence * 100)}%)` : '';

      console.log(`  ${icon} ${target}${confidence}`);

      if (s.suggested.role) {
        const role = s.suggested.role.role || s.suggested.role;
        console.log(`     → role: ${role}`);
      }
      if (s.suggested.effect) {
        for (const [type, targets] of Object.entries(s.suggested.effect)) {
          console.log(`     → effect ${type}: ${targets.join(', ')}`);
        }
      }
      if (s.suggested.consumer) {
        console.log(`     → consumers: ${s.suggested.consumer.join(', ')}`);
      }
      if (s.suggested.context) {
        if (s.suggested.context.requires?.length > 0) {
          console.log(`     → requires: ${s.suggested.context.requires.join(', ')}`);
        }
        if (s.suggested.context.provides?.length > 0) {
          console.log(`     → provides: ${s.suggested.context.provides.join(', ')}`);
        }
      }
    }
  }

  console.log(`\n💾 Enriched cartography saved: ${CONFIG.suggestionsPath}`);
}

async function runApply(targetFile = null, options = { backup: true, interactive: false }) {
  log('AnnotationManager', '=== GENERATING APPLICATION REPORT ===', 'info');

  // Load existing suggestions or generate them
  let suggestionsData = readJSON(CONFIG.suggestionsPath);

  if (!suggestionsData) {
    log('AnnotationManager', 'Generating suggestions...', 'info');
    const generator = new SuggestionGenerator();
    const suggestions = generator.generateAll();
    suggestionsData = { files: suggestions };
  }

  // Filter if specific file
  const filtered = targetFile
    ? suggestionsData.files.filter(s => s.path.includes(targetFile))
    : suggestionsData.files;

  // Generate a detailed report with complete JSDoc blocks to copy
  const reportPath = path.join(CONFIG.rootPath, 'agents', '.cache', 'annotation-report.md');
  const reportLines = [
    '# Annotations to Apply',
    '',
    `> Generated on ${new Date().toLocaleString('en-US')}`,
    '',
    '## Instructions',
    '',
    'For each file below, copy the suggested JSDoc blocks and paste them',
    'above the corresponding method/class.',
    '',
    '---',
    ''
  ];

  const applier = new SuggestionApplier();

  for (const file of filtered) {
    if (file.suggestions.length === 0) continue;

    reportLines.push(`## 📄 ${file.path}`);
    reportLines.push('');

    for (const suggestion of file.suggestions) {
      const target = suggestion.class
        ? `${suggestion.class}.${suggestion.target}`
        : suggestion.target;

      reportLines.push(`### ${suggestion.type === 'class' ? '🏛️' : suggestion.type === 'method' ? '⚙️' : '📦'} ${target}`);
      reportLines.push('');

      if (suggestion.hasJsdoc) {
        reportLines.push('**Add these lines to existing JSDoc:**');
      } else {
        reportLines.push('**New JSDoc to create:**');
      }
      reportLines.push('');
      reportLines.push('```javascript');

      // Generate complete JSDoc
      const jsdocLines = [];
      if (!suggestion.hasJsdoc) {
        jsdocLines.push('/**');
      }

      if (suggestion.suggested.role) {
        const role = suggestion.suggested.role.role || suggestion.suggested.role;
        jsdocLines.push(` * @role ${role}`);
      }

      if (suggestion.suggested.effect) {
        for (const [type, targets] of Object.entries(suggestion.suggested.effect)) {
          jsdocLines.push(` * @effect ${type}: ${targets.join(', ')}`);
        }
      }

      if (suggestion.suggested.consumer && suggestion.suggested.consumer.length > 0) {
        jsdocLines.push(` * @consumer ${suggestion.suggested.consumer.join(', ')}`);
      }

      if (suggestion.suggested.context) {
        if (suggestion.suggested.context.requires?.length > 0) {
          jsdocLines.push(` * @context requires: ${suggestion.suggested.context.requires.join(', ')}`);
        }
        if (suggestion.suggested.context.provides?.length > 0) {
          jsdocLines.push(` * @context provides: ${suggestion.suggested.context.provides.join(', ')}`);
        }
      }

      if (!suggestion.hasJsdoc) {
        jsdocLines.push(' */');
      }

      reportLines.push(jsdocLines.join('\n'));
      reportLines.push('```');
      reportLines.push('');
    }

    reportLines.push('---');
    reportLines.push('');
  }

  // Write the report
  const reportContent = reportLines.join('\n');
  writeFile(reportPath, reportContent);

  console.log(`\n📋 Report generated: ${reportPath}`);
  console.log(`\n💡 Open this file and copy the suggested annotations into your source files.`);
  console.log(`   An automatic version is under development.`);
}

async function runIndex(options = { force: false }) {
  const { MethodIndexer } = require('./method-indexer.cjs');

  log('AnnotationManager', '=== GENERATING METHOD INDEX ===', 'info');

  if (options.force) {
    log('AnnotationManager', 'Force mode: full re-indexing', 'info');
  }

  const indexer = new MethodIndexer();
  const result = indexer.indexAll({ force: options.force });

  console.log('\n📊 Indexing result:');
  console.log(`   ✅ Files updated: ${result.updated}`);
  console.log(`   ⏭️  Files unchanged: ${result.skipped}`);
  if (result.deleted > 0) {
    console.log(`   🗑️  Files deleted: ${result.deleted}`);
  }
  if (result.errors > 0) {
    console.log(`   ❌ Errors: ${result.errors}`);
  }

  // Display stats
  const stats = indexer.getStats();
  console.log('\n📈 Index generated:');
  console.log(`   Files: ${stats.files}`);
  console.log(`   Classes: ${stats.classes}`);
  console.log(`   Methods: ${stats.methods}`);

  console.log('\n📊 Role distribution:');
  for (const [role, count] of Object.entries(stats.roleDistribution).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(count / 3));
    console.log(`   ${role.padEnd(10)} ${bar} ${count}`);
  }

  console.log('\n📝 Annotations:');
  console.log(`   With @role: ${stats.annotated.withRole}/${stats.methods}`);
  console.log(`   With @effect: ${stats.annotated.withEffects}/${stats.methods}`);
  console.log(`   With @consumer: ${stats.annotated.withConsumers}/${stats.methods}`);
  console.log(`   With description: ${stats.annotated.withDescription}/${stats.methods}`);

  console.log(`\n💾 Index saved: agents/.cache/method-index.json`);
}

async function runStats() {
  log('AnnotationManager', '=== ANNOTATION STATISTICS ===', 'info');

  const parser = new SourceParser();
  const files = listFiles(CONFIG.srcPath, (name) => path.extname(name).toLowerCase() === '.js');

  const stats = {
    totalFiles: 0,
    totalClasses: 0,
    totalMethods: 0,
    annotatedClasses: 0,
    annotatedMethods: 0,
    roleDistribution: {},
    effectTypes: {},
    consumersCount: 0
  };

  for (const filePath of files) {
    const parsed = parser.parseFile(filePath);
    if (!parsed) continue;

    stats.totalFiles++;

    for (const cls of parsed.classes) {
      stats.totalClasses++;
      if (cls.jsdoc?.role) {
        stats.annotatedClasses++;
      }

      for (const method of cls.methods) {
        stats.totalMethods++;

        if (method.jsdoc?.role) {
          stats.annotatedMethods++;
          const role = method.jsdoc.role;
          stats.roleDistribution[role] = (stats.roleDistribution[role] || 0) + 1;
        }

        if (method.jsdoc?.effect) {
          for (const type of Object.keys(method.jsdoc.effect)) {
            stats.effectTypes[type] = (stats.effectTypes[type] || 0) + 1;
          }
        }

        if (method.jsdoc?.consumer?.length > 0) {
          stats.consumersCount++;
        }
      }
    }
  }

  console.log('\n📊 Global statistics:');
  console.log(`   Files analyzed: ${stats.totalFiles}`);
  console.log(`   Classes: ${stats.annotatedClasses}/${stats.totalClasses} annotated (${Math.round(stats.annotatedClasses/stats.totalClasses*100)}%)`);
  console.log(`   Methods: ${stats.annotatedMethods}/${stats.totalMethods} annotated (${Math.round(stats.annotatedMethods/stats.totalMethods*100)}%)`);

  console.log('\n📈 Role distribution:');
  for (const [role, count] of Object.entries(stats.roleDistribution).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    console.log(`   ${role.padEnd(10)} ${bar} ${count}`);
  }

  if (Object.keys(stats.effectTypes).length > 0) {
    console.log('\n⚡ Documented effect types:');
    for (const [type, count] of Object.entries(stats.effectTypes)) {
      console.log(`   @effect ${type}: ${count}`);
    }
  }

  console.log(`\n🔗 Methods with @consumer: ${stats.consumersCount}`);
}

// ============================================================================
// ENTRY POINT
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  // Parse options
  const options = {
    file: null,
    backup: true,
    interactive: false,
    force: false
  };

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      options.file = args[++i];
    } else if (args[i] === '--no-backup') {
      options.backup = false;
    } else if (args[i] === '-i' || args[i] === '--interactive') {
      options.interactive = true;
    } else if (args[i] === '--force' || args[i] === '-f') {
      options.force = true;
    }
  }

  switch (command) {
    case 'scan':
    case 'audit': // backward compat
      await runScan(options.file);
      break;

    case 'enrich':
    case 'suggest': // backward compat
      await runEnrich(options.file, options);
      break;

    case 'apply':
      await runApply(options.file, options);
      break;

    case 'stats':
      await runStats();
      break;

    case 'index':
      await runIndex(options);
      break;

    case 'help':
    default:
      console.log(`
Cartography Manager - Codebase analysis and method indexing for LOLVE

Usage:
  lolve-cartography annotate <command> [options]

Commands:
  index              Generate/update method index (incremental)
  scan               Scan codebase and list methods with inferred metadata
  enrich             Enrich cartography with roles, effects, consumers
  apply              Generate a Markdown report with enrichments
  stats              Display cartography statistics

Options:
  --file <path>      Target a specific file (partial name accepted)
  --force, -f        Force full re-indexing (for 'index')

Examples:
  lolve-cartography annotate scan
  lolve-cartography annotate enrich --file Orb.js
  lolve-cartography annotate stats

Role taxonomy (inferred automatically):
  entry     Unique entry point, system bootstrap
  core      Orchestration, central business logic
  service   API consumed by other classes
  flow      Recursive propagation, lifecycle control
  bridge    Connects two distinct domains
  helper    Factory, pure utilities
  internal  Private implementation
  adapter   Format/data transformation

Inferred metadata:
  role          Method role based on name patterns and structure
  effects       Objects created, mutated, or emitted
  consumers     Classes that call this method (static analysis)
  context       Dependencies and provisions

Generated files:
  .cache/method-index.json              Main method index
  .cache/annotation-suggestions.json    Enriched cartography data
`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

module.exports = {
  SourceParser,
  EffectAnalyzer,
  ConsumerAnalyzer,
  SuggestionGenerator,
  SuggestionApplier,
  CONFIG
};
