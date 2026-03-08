/**
 * CallGraph - Détection des appels inter-classes via Acorn AST
 *
 * Responsabilités:
 * - Parser chaque fichier source avec Acorn
 * - Détecter les appels de la forme KnownClass.method() dans les corps de méthodes
 * - Construire un graphe d'appels : { 'CallerClass.method': ['TargetClass.method', ...] }
 *
 * Ne duplique pas MethodIndexer (qui indexe les signatures/annotations).
 * Se concentre uniquement sur les relations d'appel entre classes connues.
 */

const acorn = require('acorn');
const { readFile, listFiles } = require('./utils/file-utils.cjs');
const { log } = require('./utils/logger.cjs');

const EXTENSIONS = ['.js', '.cjs', '.mjs', '.ts'];

// ─── AST walker minimal ───────────────────────────────────────────────────────

/**
 * Parcourt récursivement un nœud AST et appelle visitor sur chaque nœud.
 * S'arrête si visitor retourne false (permet de couper une branche).
 * @param {Object} node
 * @param {Function} visitor - (node) => boolean|void
 */
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

/**
 * Parse un contenu JS/TS avec Acorn (essaie module puis script).
 * @param {string} content
 * @param {string} filePath - Pour le log d'erreur uniquement
 * @returns {Object|null} AST ou null
 */
function parseContent(content, filePath) {
  for (const sourceType of ['module', 'script']) {
    try {
      return acorn.parse(content, {
        ecmaVersion: 'latest',
        sourceType,
        locations: false,
        allowHashBang: true
      });
    } catch { /* essai suivant */ }
  }
  log('CallGraph', `Parse error: ${filePath}`, 'warn');
  return null;
}

// ─── Extraction des appels ────────────────────────────────────────────────────

/**
 * Extrait les arêtes du call graph depuis un AST.
 * Seuls les appels vers des classes connues (knownClasses) sont retenus.
 *
 * @param {Object} ast
 * @param {Set<string>} knownClasses
 * @returns {Array<{ caller: string, callee: string }>}
 */
function extractEdges(ast, knownClasses) {
  const edges = [];

  for (const topNode of ast.body) {
    // Récupère le nœud ClassDeclaration (exporté ou non)
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

      const callerMethod = member.key?.name ?? member.key?.value;
      if (!callerMethod || callerMethod === 'constructor') continue;

      const callerKey = `${callerClass}.${callerMethod}`;
      const body = member.value?.body;
      if (!body) continue;

      walk(body, (node) => {
        // Ne pas descendre dans les classes imbriquées
        if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return false;

        if (node.type !== 'CallExpression') return;
        const callee = node.callee;
        if (callee?.type !== 'MemberExpression') return;

        // Pattern direct : KnownClass.method()
        if (
          callee.object?.type === 'Identifier' &&
          knownClasses.has(callee.object.name)
        ) {
          const calleeKey = `${callee.object.name}.${callee.property?.name ?? callee.property?.value}`;
          edges.push({ caller: callerKey, callee: calleeKey });
        }

        // Pattern chaîné : something.KnownClass.method() — on ignore (trop ambigu)
      });
    }
  }

  return edges;
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Construit le call graph complet d'un répertoire source.
 *
 * @param {string} srcPath - Répertoire source à scanner
 * @param {Set<string>} knownClasses - Ensemble des noms de classes connus
 * @returns {Object} { 'CallerClass.method': string[] }
 */
function buildCallGraph(srcPath, knownClasses) {
  log('CallGraph', `Building call graph from ${srcPath} (${knownClasses.size} known classes)`);

  const graph = {};

  const files = listFiles(srcPath, (name) => EXTENSIONS.some(ext => name.endsWith(ext)));

  for (const filePath of files) {
    const content = readFile(filePath);
    if (!content) continue;

    const ast = parseContent(content, filePath);
    if (!ast) continue;

    for (const { caller, callee } of extractEdges(ast, knownClasses)) {
      if (!graph[caller]) graph[caller] = new Set();
      graph[caller].add(callee);
    }
  }

  // Convertir les Sets en Arrays triés
  const result = {};
  for (const [caller, callees] of Object.entries(graph)) {
    result[caller] = [...callees].sort();
  }

  const edgeCount = Object.values(result).reduce((s, v) => s + v.length, 0);
  log('CallGraph', `${Object.keys(result).length} callers, ${edgeCount} edges`, 'success');

  return result;
}

module.exports = { buildCallGraph };
