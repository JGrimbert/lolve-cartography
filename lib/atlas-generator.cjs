/**
 * AtlasGenerator - Orchestrateur pour la génération des artefacts Atlas
 *
 * Pipeline :
 *   buildRepo()    → arborescence  → Atlas.repo
 *   buildSyms()    → MethodIndexer → Atlas.syms
 *   buildCalls()   → CallGraph     → Atlas.calls
 *   buildMods()    → require() AST → Atlas.mods
 *   scoreNodes()   → importance    → scores triés
 *   writeArtifacts() → /ai/*.md + optionnels JSON
 */

const fs   = require('fs');
const path = require('path');
const acorn = require('acorn');
const { tsPlugin } = require('acorn-typescript');
const TSParser = acorn.Parser.extend(tsPlugin());

const { Atlas } = require('./atlas.cjs');
const { buildCallGraph } = require('./call-graph.cjs');
const { MethodIndexer } = require('./mcp/method-indexer.cjs');
const { listFiles, writeJSON, writeFile } = require('./utils/file-utils.cjs');
const { loadProjectConfig } = require('./utils/config-loader.cjs');
const { log } = require('./utils/logger.cjs');
const { repoMapFormatter, compressedFormatter, dependencyFormatter } = require('./atlas-formatter.cjs');

const SOURCE_EXTS = ['.js', '.cjs', '.mjs', '.ts', '.vue'];

// ─── AST walker minimal ───────────────────────────────────────────────────────

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

// ─── AtlasGenerator ──────────────────────────────────────────────────────────

class AtlasGenerator {
  /**
   * @param {string} root   - Racine du projet à analyser
   * @param {Object} options
   * @param {boolean} [options.json=true]  - Écrire atlas.symbols.json / atlas.graph.json
   */
  constructor(root, options = {}) {
    this.root    = root;
    this.options = { json: true, ...options };
    const config = loadProjectConfig(root);
    this.srcPath = config.project.srcPathAbsolute || path.join(root, 'src');
  }

  /**
   * Pipeline complet → génère les artefacts dans /ai/
   */
  generate() {
    log('AtlasGenerator', `Generating atlas for ${this.root}`);

    const atlas = new Atlas();
    atlas.meta.root      = this.root;
    atlas.meta.generated = new Date().toISOString();

    this.buildRepo(atlas);
    this.buildSyms(atlas);
    this.buildCalls(atlas);
    this.buildMods(atlas);
    this.scoreNodes(atlas);
    this.writeArtifacts(atlas);

    log('AtlasGenerator', 'Done.', 'success');
    return atlas;
  }

  // ─── buildRepo ─────────────────────────────────────────────────────────────

  /**
   * Scan de l'arborescence → Atlas.repo
   */
  buildRepo(atlas) {
    log('AtlasGenerator', `Scanning repo: ${this.srcPath}`);

    const dirs  = new Set();
    const files = [];

    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        const rel  = path.relative(this.root, full).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          dirs.add(rel);
          walk(full);
        } else if (SOURCE_EXTS.some(e => entry.name.endsWith(e))) {
          files.push(rel);
        }
      }
    };

    walk(this.srcPath);
    atlas.repo.dirs  = [...dirs].sort();
    atlas.repo.files = files.sort();
  }

  // ─── buildSyms ─────────────────────────────────────────────────────────────

  /**
   * MethodIndexer.indexAll() → Atlas.syms
   */
  buildSyms(atlas) {
    log('AtlasGenerator', 'Indexing symbols...');
    try {
      const indexer = new MethodIndexer();
      indexer.indexAll({ force: false });

      const idx = indexer.index;
      if (!idx) return;

      // Construire un mapping className → [methodNames] depuis idx.methods
      const classMethods = {};
      for (const [key, m] of Object.entries(idx.methods || {})) {
        if (m.class) {
          classMethods[m.class] = classMethods[m.class] || [];
          classMethods[m.class].push(m.name);
        }

        // Méthodes et fonctions dans Atlas.syms.methods
        atlas.syms.methods[key] = {
          signature: m.signature || key,
          role:      m.role      || null,
          file:      m.file      || null
        };

        // Fonctions standalone dans Atlas.syms.fns
        if (!m.class) {
          atlas.syms.fns[key] = {
            signature: m.signature || key,
            role:      m.role      || null,
            file:      m.file      || null
          };
        }
      }

      // Classes (avec methods list reconstruite)
      for (const [className, classData] of Object.entries(idx.classes || {})) {
        atlas.syms.classes[className] = {
          file:    classData.file,
          methods: classMethods[className] || []
        };
      }

      // Classes détectées via méthodes mais absentes de idx.classes
      for (const [className, methods] of Object.entries(classMethods)) {
        if (!atlas.syms.classes[className]) {
          const sample = idx.methods[`${className}.${methods[0]}`] || {};
          atlas.syms.classes[className] = {
            file:    sample.file || null,
            methods
          };
        }
      }
    } catch (err) {
      log('AtlasGenerator', `buildSyms error: ${err.message}`, 'warn');
    }
  }

  // ─── buildCalls ────────────────────────────────────────────────────────────

  /**
   * buildCallGraph() → Atlas.calls
   */
  buildCalls(atlas) {
    log('AtlasGenerator', 'Building call graph...');
    try {
      const knownClasses = new Set(Object.keys(atlas.syms.classes));
      if (knownClasses.size === 0) {
        log('AtlasGenerator', 'No known classes — skipping call graph', 'warn');
        return;
      }
      atlas.calls = buildCallGraph(this.srcPath, knownClasses);
    } catch (err) {
      log('AtlasGenerator', `buildCalls error: ${err.message}`, 'warn');
    }
  }

  // ─── buildMods ─────────────────────────────────────────────────────────────

  /**
   * Scan require() / import → Atlas.mods
   * Format : { 'relative/file.cjs': ['./dep1.cjs', '../dep2.cjs'] }
   */
  buildMods(atlas) {
    log('AtlasGenerator', 'Building module deps...');

    const files = listFiles(this.srcPath, (name) =>
      SOURCE_EXTS.some(e => name.endsWith(e))
    );

    for (const filePath of files) {
      let content;
      try { content = fs.readFileSync(filePath, 'utf-8'); }
      catch { continue; }

      const ast = parseContent(content, filePath);
      if (!ast) continue;

      const deps = [];
      walk(ast, (node) => {
        // ESM : import ... from './path'
        if (node.type === 'ImportDeclaration' && node.source?.value) {
          if (node.source.value.startsWith('.')) deps.push(node.source.value);
        }
        // CJS : require('./path')
        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments?.[0]?.type === 'Literal' &&
          typeof node.arguments[0].value === 'string' &&
          node.arguments[0].value.startsWith('.')
        ) {
          deps.push(node.arguments[0].value);
        }
      });

      if (deps.length > 0) {
        const rel = path.relative(this.root, filePath).replace(/\\/g, '/');
        atlas.mods[rel] = [...new Set(deps)].sort();
      }
    }
  }

  // ─── scoreNodes ────────────────────────────────────────────────────────────

  /**
   * Calcule importance = in-degree + out-degree pour chaque nœud du call graph
   * Stocke les scores dans atlas._scores (non sérialisé dans toJSON)
   */
  scoreNodes(atlas) {
    const scores = {};

    for (const [caller, callees] of Object.entries(atlas.calls)) {
      scores[caller]  = (scores[caller]  || 0) + callees.length; // out-degree
      for (const callee of callees) {
        scores[callee] = (scores[callee] || 0) + 1;              // in-degree
      }
    }

    atlas._scores = scores;
  }

  // ─── writeArtifacts ────────────────────────────────────────────────────────

  /**
   * Écrit les artefacts dans <root>/ai/
   */
  writeArtifacts(atlas) {
    const aiDir = path.join(this.root, 'ai');
    fs.mkdirSync(aiDir, { recursive: true });
    log('AtlasGenerator', `Writing artifacts to ${aiDir}`);

    writeFile(path.join(aiDir, 'repo-map.md'),
      repoMapFormatter(atlas));

    writeFile(path.join(aiDir, 'atlas.compressed.md'),
      compressedFormatter(atlas));

    writeFile(path.join(aiDir, 'atlas.dependencies.md'),
      dependencyFormatter(atlas));

    if (this.options.json) {
      writeJSON(path.join(aiDir, 'atlas.symbols.json'), atlas.syms);
      writeJSON(path.join(aiDir, 'atlas.graph.json'), {
        calls: atlas.calls,
        mods:  atlas.mods
      });
    }

    log('AtlasGenerator', [
      'repo-map.md',
      'atlas.compressed.md',
      'atlas.dependencies.md',
      ...(this.options.json ? ['atlas.symbols.json', 'atlas.graph.json'] : [])
    ].join(', '), 'success');
  }
}

module.exports = { AtlasGenerator };
