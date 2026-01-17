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
const { listFiles, readFile } = require('./utils/file-utils.cjs');
const { loadProjectConfig } = require('./utils/config-loader.cjs');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Project path: from env, --project arg, or current working directory
const PROJECT_PATH = process.env.LC_PROJECT_PATH || process.cwd();
const CACHE_PATH = path.join(PROJECT_PATH, '.cache');
const projectConfig = loadProjectConfig(PROJECT_PATH);

const CONFIG = {
  rootPath: PROJECT_PATH,
  srcPath: projectConfig.project.srcPathAbsolute || path.join(PROJECT_PATH, 'src'),
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
      // Match same extensions as MethodIndexer
      if (name.endsWith('.backup')) return false;
      const ext = path.extname(name).toLowerCase();
      return ['.js', '.cjs', '.mjs', '.ts', '.vue'].includes(ext);
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

        // @consumer - detect for ALL methods (not just services)
        const consumers = this.consumerAnalyzer.getConsumers(cls.name, method.name);
        const currentConsumers = method.jsdoc?.consumer || [];
        const newConsumers = consumers.filter(c => !currentConsumers.includes(c));

        if (newConsumers.length > 0) {
          missing.push('consumer');
          suggested.consumer = newConsumers;
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

async function runFull(options = { force: false }) {
  const { MethodIndexer } = require('./mcp/method-indexer.cjs');

  log('AnnotationManager', '=== FULL INDEX (index + enrich + merge) ===', 'info');

  // Step 1: Generate method index
  console.log('\n📦 Step 1/3: Generating method index...');
  const indexer = new MethodIndexer();
  const indexResult = indexer.indexAll({ force: options.force });

  console.log(`   ✅ Files: ${indexResult.updated} updated, ${indexResult.skipped} unchanged`);

  // Step 2: Generate enrichments (effects, consumers)
  console.log('\n🔍 Step 2/3: Analyzing effects & consumers...');
  const generator = new SuggestionGenerator();
  const suggestions = generator.generateAll();

  let enrichedCount = 0;
  let effectsAdded = 0;
  let consumersAdded = 0;

  // Step 3: Merge enrichments into index
  console.log('\n🔄 Step 3/3: Merging into index...');

  for (const file of suggestions) {
    for (const s of file.suggestions) {
      if (s.type !== 'method') continue;

      const methodKey = `${s.class}.${s.target}`;
      const method = indexer.index.methods[methodKey];

      if (!method) continue;

      let modified = false;

      // Merge effects
      if (s.suggested.effect) {
        for (const [type, targets] of Object.entries(s.suggested.effect)) {
          if (!method.effects[type]) {
            method.effects[type] = [];
          }
          for (const target of targets) {
            if (!method.effects[type].includes(target)) {
              method.effects[type].push(target);
              modified = true;
              effectsAdded++;
            }
          }
        }
      }

      // Merge consumers
      if (s.suggested.consumer && s.suggested.consumer.length > 0) {
        if (!method.consumers) method.consumers = [];
        for (const consumer of s.suggested.consumer) {
          if (!method.consumers.includes(consumer)) {
            method.consumers.push(consumer);
            modified = true;
            consumersAdded++;
          }
        }
      }

      // Merge context
      if (s.suggested.context) {
        if (!method.context) method.context = { requires: [], provides: [] };

        if (s.suggested.context.requires) {
          for (const req of s.suggested.context.requires) {
            if (!method.context.requires.includes(req)) {
              method.context.requires.push(req);
              modified = true;
            }
          }
        }
        if (s.suggested.context.provides) {
          for (const prov of s.suggested.context.provides) {
            if (!method.context.provides.includes(prov)) {
              method.context.provides.push(prov);
              modified = true;
            }
          }
        }
      }

      if (modified) enrichedCount++;
    }
  }

  // Save the enriched index
  indexer.saveIndex();

  // Display results
  const stats = indexer.getStats();

  console.log('\n📈 Final index:');
  console.log(`   Files: ${stats.files}`);
  console.log(`   Classes: ${stats.classes}`);
  console.log(`   Methods: ${stats.methods}`);

  console.log('\n📊 Role distribution:');
  for (const [role, count] of Object.entries(stats.roleDistribution).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(count / 3));
    console.log(`   ${role.padEnd(10)} ${bar} ${count}`);
  }

  console.log('\n✨ Enrichment results:');
  console.log(`   Methods enriched: ${enrichedCount}`);
  console.log(`   Effects added: ${effectsAdded}`);
  console.log(`   Consumers added: ${consumersAdded}`);

  console.log('\n📝 Final annotations:');
  console.log(`   With @role: ${stats.annotated.withRole}/${stats.methods}`);
  console.log(`   With @effect: ${stats.annotated.withEffects}/${stats.methods}`);
  console.log(`   With @consumer: ${stats.annotated.withConsumers}/${stats.methods}`);
  console.log(`   With description: ${stats.annotated.withDescription}/${stats.methods}`);

  console.log(`\n💾 Enriched index saved: .cache/method-index.json`);
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

  await runFull(options);

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
  CONFIG
};
