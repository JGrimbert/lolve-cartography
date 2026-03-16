/**
 * RoadmapGenerator - Orchestrateur du pipeline de génération de roadmap
 *
 * Pipeline déterministe (sans LLM) :
 *   method-index.json
 *     → FactExtractor  (facts AST)
 *     → RuleEngine     (inférence DEPENDS_ON, HAS_SKILL)
 *     → DAGBuilder     (tri topologique Kahn)
 *     → StepPlanner    (regroupement en étapes)
 *     → RoadmapFormatter → /ai/roadmap.{md,json}
 *
 * Prérequis : process.env.LC_PROJECT_PATH doit être positionné sur le projet
 * cible AVANT le premier require() de ce module (comme pour tous les modules
 * lolve-cartography).
 */

const fs   = require('fs');
const path = require('path');

const { FactExtractor }    = require('./fact-extractor.cjs');
const { RuleEngine }       = require('./rule-engine.cjs');
const { DAGBuilder }       = require('./dag-builder.cjs');
const { StepPlanner }      = require('./step-planner.cjs');
const { markdownFormatter, jsonFormatter } = require('./roadmap-formatter.cjs');
const { readJSON, writeJSON, writeFile }   = require('./utils/file-utils.cjs');
const { log }              = require('./utils/logger.cjs');

class RoadmapGenerator {
  /**
   * @param {string} root       - Racine du projet à analyser
   * @param {Object} [options]
   * @param {string}  [options.scope='full']       - 'full' | 'issue'
   * @param {string}  [options.issue=null]         - Texte de l'issue (active le scope)
   * @param {string}  [options.output='both']      - 'md' | 'json' | 'both'
   * @param {number}  [options.maxNodesPerStep=5]
   */
  constructor(root, options = {}) {
    this.root    = root;
    this.options = { scope: 'full', issue: null, output: 'both', maxNodesPerStep: 5, ...options };
  }

  /**
   * Lance le pipeline complet
   * @returns {Promise<Object>} Roadmap
   */
  async generate() {
    log('RoadmapGenerator', `Generating roadmap for ${this.root}`);

    // 1. Charger le method-index
    const methodIndex = this._loadMethodIndex();

    // 2. Extraire les facts AST
    const extractor = new FactExtractor(this.root, methodIndex);
    let facts = extractor.extract();

    // 3. Inférence de règles
    const engine = new RuleEngine();
    facts = engine.run(facts);

    // 4. Construire le DAG
    const dagBuilder = new DAGBuilder();
    let dag = dagBuilder.build(facts);

    // 5a. Restreindre le DAG aux nœuds du method-index (méthodes + classes)
    dag = this._filterToSymbols(dag, methodIndex);

    // 5b. Filtrage issue-scoped
    if (this.options.issue) {
      dag = this._filterByIssue(dag, facts, this.options.issue);
    }

    // 6. Planifier les étapes
    const planner = new StepPlanner({ maxNodesPerStep: this.options.maxNodesPerStep });
    const roadmap  = planner.plan(dag, facts);

    // Enrichir avec le contexte
    roadmap.project = path.basename(this.root);
    roadmap.root    = this.root;
    if (this.options.issue) roadmap.issueScope = this.options.issue;

    // 7. Écrire les artefacts
    this._writeArtifacts(roadmap);

    log('RoadmapGenerator', 'Done.', 'success');
    return roadmap;
  }

  // ─── Chargement de l'index ─────────────────────────────────────────────────

  _loadMethodIndex() {
    const indexPath = path.join(this.root, '.cache', 'method-index.json');
    const index = readJSON(indexPath);

    if (index) {
      const nm = Object.keys(index.methods  || {}).length;
      const nc = Object.keys(index.classes  || {}).length;
      log('RoadmapGenerator', `Loaded index: ${nm} methods, ${nc} classes`);
      return index;
    }

    log('RoadmapGenerator', 'No method-index.json — run "annotate full" first', 'warn');
    return { classes: {}, methods: {}, files: {} };
  }

  // ─── Restriction aux symboles connus ───────────────────────────────────────

  _filterToSymbols(dag, methodIndex) {
    const known = new Set([
      ...Object.keys(methodIndex.methods  || {}),
      ...Object.keys(methodIndex.classes  || {}),
    ]);
    if (known.size === 0) return dag;

    const nodes  = dag.nodes.filter(n => known.has(n));
    const nodeSet = new Set(nodes);
    const edges  = dag.edges.filter(([f, t]) => nodeSet.has(f) && nodeSet.has(t));
    const order  = dag.order.filter(n => nodeSet.has(n));
    const levels = dag.levels
      .map(l => l.filter(n => nodeSet.has(n)))
      .filter(l => l.length > 0);

    log('RoadmapGenerator', `Filtered to ${nodes.length} symbol nodes (was ${dag.nodes.length})`);
    return { ...dag, nodes, edges, order, levels };
  }

  // ─── Filtrage issue-scoped ─────────────────────────────────────────────────

  _filterByIssue(dag, facts, issueText) {
    const keywords = issueText.toLowerCase()
      .split(/[\s,;:.()\[\]]+/)
      .filter(w => w.length > 3);

    // Nœuds dont le nom contient un mot-clé
    const relevant = new Set();
    for (const node of dag.nodes) {
      const lower = node.toLowerCase();
      if (keywords.some(kw => lower.includes(kw))) relevant.add(node);
    }

    if (relevant.size === 0) {
      log('RoadmapGenerator', 'No nodes match issue keywords — using full DAG', 'warn');
      return dag;
    }

    // Inclure les dépendances directes des nœuds pertinents
    const directDeps = facts.filter(f => f.relation === 'DEPENDS_ON' && !f.inferred);
    for (const f of directDeps) {
      if (relevant.has(f.entity)) relevant.add(f.target);
    }

    const filteredNodes  = dag.nodes.filter(n => relevant.has(n));
    const filteredEdges  = dag.edges.filter(([f, t]) => relevant.has(f) && relevant.has(t));
    const filteredOrder  = dag.order.filter(n => relevant.has(n));
    const filteredLevels = dag.levels
      .map(level => level.filter(n => relevant.has(n)))
      .filter(l => l.length > 0);

    log('RoadmapGenerator', `Issue scope: ${filteredNodes.length}/${dag.nodes.length} nodes`);

    return { ...dag, nodes: filteredNodes, edges: filteredEdges, order: filteredOrder, levels: filteredLevels };
  }

  // ─── Écriture des artefacts ────────────────────────────────────────────────

  _writeArtifacts(roadmap) {
    const aiDir = path.join(this.root, 'ai');
    fs.mkdirSync(aiDir, { recursive: true });

    const { output } = this.options;

    if (output === 'md' || output === 'both') {
      const p = path.join(aiDir, 'roadmap.md');
      writeFile(p, markdownFormatter(roadmap));
      log('RoadmapGenerator', `Written: ai/roadmap.md`);
    }

    if (output === 'json' || output === 'both') {
      const p = path.join(aiDir, 'roadmap.json');
      writeJSON(p, roadmap);
      log('RoadmapGenerator', `Written: ai/roadmap.json`);
    }
  }
}

module.exports = { RoadmapGenerator };
