# lolve-cartography

Codebase cartography and method indexing tools.

Analyze your JavaScript codebase structure, generate method indexes with automatically inferred metadata (roles, effects, consumers).

[Version francaise](./README.fr.md)

## Installation

```bash
npm install lolve-cartography
node lib/init-project.cjs
node install.cjs
```

Or clone and link locally:

```bash
git clone https://github.com/youruser/lolve-cartography.git
cd lolve-cartography
npm install
npm link
```

## Quick Start

```bash
# Navigate to your project
cd /path/to/your/project

# Full index (RECOMMENDED): index + enrich + merge all in one
lolve-cartography annotate full

# Or step by step:
lolve-cartography annotate index     # Generate method index with roles
lolve-cartography annotate enrich    # Analyze effects & consumers
lolve-cartography annotate scan      # Preview what would be enriched
lolve-cartography annotate stats     # View statistics

# Force full re-indexing
lolve-cartography annotate full --force
```

## Architecture Overview

lolve-cartography uses a **multi-agent architecture** to analyze codebases and manage annotations intelligently. Each agent has a specific responsibility and collaborates with others through an orchestrator.

```
                     ┌──────────────────┐
                     │   Orchestrator   │
                     │  (Coordination)  │
                     └────────┬─────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ContextAgent │    │AnalysisAgent │    │ProposalAgent │
│ (Discovery) │    │(Decomposition│    │ (Approaches) │
└──────────────┘    └──────────────┘    └──────────────┘
       │
       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│PreprocessAgent    │  CacheAgent  │    │ CodeAgent    │
│  (Cleaning)  │    │   (Q&A)      │    │(Generation)  │
└──────────────┘    └──────────────┘    └──────────────┘
```

### Agents Description

| Agent | Role | Key Features |
|-------|------|--------------|
| **ContextAgent** | Analyzes queries, identifies relevant files and methods | File/method indexing, category classification, progressive search |
| **AnalysisAgent** | Decomposes requests into subtasks | Complexity evaluation, risk identification, action plan generation |
| **ProposalAgent** | Proposes approaches with pros/cons | 2-3 alternatives per request, code snippets, difficulty assessment |
| **PreprocessAgent** | Cleans and enriches queries | Removes filler words, normalizes domain terms, detects intent |
| **CacheAgent** | Stores frequent Q&A pairs | Levenshtein similarity detection, TTL management |
| **CodeAgent** | Generates and validates code | Pattern application, test execution |

## Method Granularity

lolve-cartography operates at **method level** rather than file level. This granular approach enables:

- **Precise targeting**: Find exactly the methods relevant to a query
- **Token economy**: Load only what's needed, not entire files
- **Dependency tracking**: Follow method calls and consumers
- **Progressive loading**: Start with metadata, expand to code on demand

### Search Levels

The system supports 5 progressive detail levels:

| Level | Content | Use Case |
|-------|---------|----------|
| **0** | Keys only (`Orb.novaFormae`) | Quick enumeration |
| **1** | + Descriptions | Initial discovery |
| **2** | + Full signatures, effects, consumers | Detailed analysis |
| **3** | + Method code | Implementation review |
| **4** | + Complete files | Full context fallback |

### SearchSession Workflow

Agents work through **iterative refinement**:

1. **Initial Search (L1)**: Find relevant methods from the annotated index
2. **Exclusion**: Remove false positives without re-running the search
3. **Code Loading (L3)**: Load code for top candidates only
4. **Expansion**: Follow dependencies to discover related methods
5. **Full File (L4)**: Fall back to complete files when needed

```javascript
// Example: Progressive context building
const session = agent.createSearchSession("vertex creation orb");

// Level 1: Get metadata (lightweight)
console.log(session.results); // 15 methods, ~500 tokens

// Exclude false positives
session.exclude(['Forma.getSlot', 'Rosa.reindex']);

// Load code for top 3 only
session.loadCode(session.keys.slice(0, 3)); // ~2000 tokens

// Expand to find related methods
session.expand('Orb.novaFormae', { direction: 'both' });

// Total: ~3000 tokens vs ~50000 if loading all files
```

## JIT Annotation (Just-In-Time)

lolve-cartography uses a **JIT annotation system** that generates annotations on-demand when needed, rather than requiring all annotations upfront.

### How JIT Annotation Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Annotation Pipeline                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Method Discovered    2. Check Cache     3. Generate     │
│  ┌──────────────┐       ┌─────────────┐    ┌────────────┐  │
│  │ findMethods()│──────▶│BodyHash OK?│───▶│  Use Cache │  │
│  └──────────────┘       └──────┬──────┘    └────────────┘  │
│                                │ NO                         │
│                                ▼                            │
│                         ┌─────────────┐    ┌────────────┐  │
│                         │Generate New │───▶│ Save Cache │  │
│                         │(LLM or AST) │    └────────────┘  │
│                         └─────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Annotation Status Types

| Status | Description | Action |
|--------|-------------|--------|
| **complete** | Annotation exists and body hash matches | Use as-is |
| **outdated** | Annotation exists but code changed | Re-generate |
| **partial** | Some fields missing (e.g., no effects) | Enrich |
| **missing** | No annotation found | Generate from scratch |

### Generating Annotations

```javascript
// Check annotation status
const status = session.checkAnnotations();
// { complete: ['Orb.nova'], outdated: ['Vertex.link'], missing: ['Apex.promote'] }

// Get methods needing annotation with their code
const { needsAnnotation, tokensEstimate } = session.getMethodsNeedingAnnotation({
  includeOutdated: true,
  maxMethods: 5
});

// Generate prompt for LLM annotation
const { prompt } = session.generateAnnotationPrompt();

// Apply received annotations to cache
session.applyAnnotations([
  { key: 'Apex.promote', role: 'flow', description: 'Promotes Apex to Vertex' }
]);
```

## Role Taxonomy

The tool uses a consistent role taxonomy for method classification:

| Role | Description | Example |
|------|-------------|---------|
| `entry` | Unique entry point, system bootstrap | `Biblio.genesis()` |
| `core` | Orchestration, central business logic | `Orb.novaFormae()` |
| `service` | API consumed by other classes | `Codex.nova()` |
| `flow` | Recursive propagation, lifecycle control | `Unda.kyklos()` |
| `bridge` | Connects two distinct domains | `Display.sync()` |
| `helper` | Factory, pure utilities | `Clavis.generate()` |
| `internal` | Private implementation | `#computeAngle()` |
| `adapter` | Format/data transformation | `Delta.toCartesian()` |

## Supported Annotations

```javascript
/**
 * @role service
 * @effect creates: Vertex, Forma
 * @effect mutates: this.orb
 * @effect emits: events
 * @consumer Unda.kyklos, Biblio.genesis
 * @context requires: this.$
 * @context provides: Vertex
 */
```

## CLI Commands

### Main CLI

```bash
lolve-cartography <command> [options]
```

### Shortcuts

```bash
lc-annotate <subcommand>    # Cartography management
lc-index                     # Method index generation
```

### Commands

| Command | Description |
|---------|-------------|
| `annotate full` | **RECOMMENDED** - Full pipeline: index + enrich + merge |
| `annotate index` | Generate/update method index (roles only) |
| `annotate enrich` | Analyze effects, consumers (separate file) |
| `annotate scan` | Preview methods and what can be inferred |
| `annotate apply` | Generate Markdown report with enrichments |
| `annotate stats` | Display cartography statistics |

### Options

| Option | Description |
|--------|-------------|
| `--project <path>` | Path to the project to analyze (default: current directory) |
| `--file <name>` | Target a specific file (partial name accepted) |
| `--force, -f` | Force full re-indexing |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `LC_PROJECT_PATH` | Alternative to `--project` option |

## Programmatic API

```javascript
const {
  MethodIndexer,
  AnnotationCache,
  SourceParser,
  SuggestionGenerator,
  ContextAgent
} = require('lolve-cartography');

// Generate method index
const indexer = new MethodIndexer();
indexer.indexAll({ force: true });

// Parse source code
const parser = new SourceParser();
const parsed = parser.parseFile('/path/to/file.js');

// Generate suggestions
const generator = new SuggestionGenerator();
const suggestions = generator.generateAll();

// Use ContextAgent for intelligent search
const agent = new ContextAgent(config);
await agent.init();

const session = agent.createSearchSession("find vertex creation");
const context = session.toContext({ includeCode: true });
```

## Benchmark Results

The system was benchmarked comparing different context loading approaches. Results demonstrate significant token savings with the progressive approach:

### Token Usage Comparison

| Approach | Tokens (est.) | % of Baseline | Savings |
|----------|---------------|---------------|---------|
| **Heavy** (full files) | ~50,000 | 100% | - |
| **Light L1** (metadata) | ~500 | 1% | **99%** |
| **Light L2** (signatures) | ~1,500 | 3% | **97%** |
| **Light L3** (+ code) | ~8,000 | 16% | **84%** |
| **Hybrid** (sig + top 3 code) | ~3,000 | 6% | **94%** |

### Key Findings

1. **99% token reduction** possible with metadata-only approach (L1)
2. **Hybrid approach recommended**: Full signatures for all methods + code for top 3 candidates
3. **Progressive loading** allows adapting detail level based on actual needs
4. **SearchSession operations** (exclude, expand) have minimal overhead

### Workflow Simulation Results

A simulated agent workflow showed:
- **Initial search**: 10 methods, ~300 tokens
- **After exclusions**: 8 methods
- **Code loading (top 3)**: +1,500 tokens
- **Expansion**: +2 related methods
- **Total**: ~2,000 tokens vs ~50,000 if loading all relevant files

**Recommendation**: Use the hybrid approach (L2 + selective L3) for optimal balance between context richness and token economy.

## Project Structure

```
lolve-cartography/
├── package.json
├── README.md
├── README.fr.md
├── bin/
│   ├── cli.cjs           # Main CLI
│   ├── annotate.cjs      # lc-annotate shortcut
│   └── index.cjs         # lc-index shortcut
├── lib/
│   ├── index.cjs         # Main entry point
│   ├── orchestrator.cjs  # Agent coordination
│   ├── context-agent.cjs # File/method discovery
│   ├── analysis-agent.cjs # Task decomposition
│   ├── proposal-agent.cjs # Approach suggestions
│   ├── preprocess-agent.cjs # Query cleaning
│   ├── cache-agent.cjs   # Q&A caching
│   ├── annotation-manager.cjs
│   ├── method-indexer.cjs
│   ├── context-benchmark.cjs # Performance testing
│   └── utils/
│       ├── logger.cjs
│       └── file-utils.cjs
└── .cache/               # Generated cache (gitignored)
```

## Requirements

- Node.js >= 18.0.0
- Your project must have a `src/` directory (configurable)

## License

MIT
