/**
 * FactExtractor - Extraction de facts AST depuis un codebase
 *
 * Produit des tuples { entity, relation, target } depuis :
 *   method-index.json  → HAS_ROLE, EXTENDS, HAS_FILE
 *   AST walk           → CALLS, WRITES, READS, CREATES
 *   require()/import   → IMPORTS
 */

const path = require('path');
const acorn = require('acorn');
const { tsPlugin } = require('acorn-typescript');
const TSParser = acorn.Parser.extend(tsPlugin());
const { readFile, listFiles } = require('./utils/file-utils.cjs');
const { loadProjectConfig } = require('./utils/config-loader.cjs');
const { log } = require('./utils/logger.cjs');

const EXTENSIONS = ['.js', '.cjs', '.mjs', '.ts', '.vue'];

// ─── AST walker ───────────────────────────────────────────────────────────────

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (node.type) {
    if (visitor(node) === false) return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) walk(child, visitor);
    } else if (val && typeof val === 'object' && val.type) {
      walk(val, visitor);
    }
  }
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseContent(content, filePath) {
  const isTS = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
  const parsers = isTS ? [TSParser] : [acorn.Parser];
  for (const parser of parsers) {
    for (const sourceType of ['module', 'script']) {
      try {
        return parser.parse(content, {
          ecmaVersion: 'latest',
          sourceType,
          locations: false,
          allowHashBang: true
        });
      } catch { /* essai suivant */ }
    }
  }
  return null;
}

// ─── FactExtractor ────────────────────────────────────────────────────────────

class FactExtractor {
  /**
   * @param {string} root        - Racine du projet
   * @param {Object} methodIndex - Contenu de .cache/method-index.json
   */
  constructor(root, methodIndex) {
    this.root = root;
    this.methodIndex = methodIndex || { classes: {}, methods: {}, files: {} };
    const config = loadProjectConfig(root);
    this.srcPath = config.project.srcPathAbsolute || path.join(root, 'src');
  }

  /**
   * Extrait tous les facts du projet
   * @returns {Array<{entity: string, relation: string, target: string}>}
   */
  extract() {
    log('FactExtractor', `Extracting facts from ${this.root}`);
    const facts = [];

    this._extractFromIndex(facts);
    this._extractFromAST(facts);

    // Dédupliquer
    const seen = new Set();
    const unique = facts.filter(f => {
      const key = `${f.entity}|${f.relation}|${f.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    log('FactExtractor', `${unique.length} facts extracted`, 'success');
    return unique;
  }

  // ─── Source: method-index ───────────────────────────────────────────────────

  _extractFromIndex(facts) {
    const { methods = {}, classes = {} } = this.methodIndex;

    for (const [key, method] of Object.entries(methods)) {
      if (method.role) {
        facts.push({ entity: key, relation: 'HAS_ROLE', target: method.role });
      }
      if (method.file) {
        facts.push({ entity: key, relation: 'HAS_FILE', target: method.file });
      }
    }

    for (const [className, classData] of Object.entries(classes)) {
      if (classData.extends) {
        facts.push({ entity: className, relation: 'EXTENDS', target: classData.extends });
      }
      if (classData.file) {
        facts.push({ entity: className, relation: 'HAS_FILE', target: classData.file });
      }
    }
  }

  // ─── Source: AST ────────────────────────────────────────────────────────────

  _extractFromAST(facts) {
    const knownClasses = new Set(Object.keys(this.methodIndex.classes || {}));

    const files = listFiles(this.srcPath, (name) =>
      EXTENSIONS.some(ext => name.endsWith(ext))
    );

    for (const filePath of files) {
      let content = readFile(filePath);
      if (!content) continue;

      // Extraire <script> depuis Vue SFC
      if (filePath.endsWith('.vue')) {
        const m = content.match(/<script(?:\s+setup)?[^>]*>([\s\S]*?)<\/script>/i);
        content = m ? m[1].trim() : null;
        if (!content) continue;
      }

      const ast = parseContent(content, filePath);
      if (!ast) continue;

      const relFile = path.relative(this.root, filePath).replace(/\\/g, '/');

      this._extractImports(ast, relFile, facts);
      this._extractFromClasses(ast, knownClasses, facts);
    }
  }

  _extractImports(ast, relFile, facts) {
    walk(ast, (node) => {
      if (node.type === 'ImportDeclaration' && node.source?.value?.startsWith('.')) {
        facts.push({ entity: relFile, relation: 'IMPORTS', target: node.source.value });
      }
      if (
        node.type === 'CallExpression' &&
        node.callee?.name === 'require' &&
        node.arguments?.[0]?.type === 'Literal' &&
        typeof node.arguments[0].value === 'string' &&
        node.arguments[0].value.startsWith('.')
      ) {
        facts.push({ entity: relFile, relation: 'IMPORTS', target: node.arguments[0].value });
      }
    });
  }

  _extractFromClasses(ast, knownClasses, facts) {
    for (const topNode of ast.body) {
      let classNode = null;
      if (topNode.type === 'ClassDeclaration') {
        classNode = topNode;
      } else if (
        (topNode.type === 'ExportDefaultDeclaration' || topNode.type === 'ExportNamedDeclaration') &&
        topNode.declaration?.type === 'ClassDeclaration'
      ) {
        classNode = topNode.declaration;
      }

      if (!classNode?.id?.name) continue;
      const callerClass = classNode.id.name;

      for (const member of classNode.body.body) {
        if (member.type !== 'MethodDefinition') continue;
        const methodName = member.key?.name ?? member.key?.value;
        if (!methodName) continue;

        const callerKey = `${callerClass}.${methodName}`;
        const body = member.value?.body;
        if (!body) continue;

        walk(body, (node) => {
          if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return false;

          // CALLS : KnownClass.method()
          if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
            const obj = node.callee.object;
            if (obj?.type === 'Identifier' && knownClasses.has(obj.name)) {
              const prop = node.callee.property?.name ?? node.callee.property?.value;
              if (prop) {
                facts.push({ entity: callerKey, relation: 'CALLS', target: `${obj.name}.${prop}` });
              }
            }
          }

          // WRITES : this.prop = ...
          if (
            node.type === 'AssignmentExpression' &&
            node.left?.type === 'MemberExpression' &&
            node.left.object?.type === 'ThisExpression'
          ) {
            const prop = node.left.property?.name ?? node.left.property?.value;
            if (prop) {
              facts.push({ entity: callerKey, relation: 'WRITES', target: `this.${prop}` });
            }
          }

          // READS : this.prop (accès non-assignment)
          if (
            node.type === 'MemberExpression' &&
            node.object?.type === 'ThisExpression' &&
            node.property?.name
          ) {
            facts.push({ entity: callerKey, relation: 'READS', target: `this.${node.property.name}` });
          }

          // CREATES : new ClassName()
          if (node.type === 'NewExpression' && node.callee?.name) {
            facts.push({ entity: callerKey, relation: 'CREATES', target: node.callee.name });
          }
        });
      }
    }
  }
}

module.exports = { FactExtractor };
