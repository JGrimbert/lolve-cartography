#!/usr/bin/env node
/**
 * lolve-cartography CLI
 *
 * Usage:
 *   lolve-cartography <command> [options]
 *
 * Commands:
 *   annotate   Annotation management (audit, suggest, apply, stats)
 *   index      Generate method index
 *   context    Context analysis
 *
 * Options:
 *   --project <path>   Path to the project to analyze (default: cwd)
 *   --help             Show this help
 */

const path = require('path');

const args = process.argv.slice(2);

// Handle --project option FIRST (before reading command)
const projectIdx = args.indexOf('--project');
if (projectIdx !== -1 && args[projectIdx + 1]) {
  process.env.LC_PROJECT_PATH = path.resolve(args[projectIdx + 1]);
  args.splice(projectIdx, 2);
}

const command = args[0];

// Show help
if (!command || command === '--help' || command === '-h') {
  console.log(`
lolve-cartography - Codebase cartography and method indexing tools

Usage:
  lolve-cartography <command> [options]
  lc-annotate <subcommand>     # Shortcut for cartography commands
  lc-index                     # Shortcut for index generation

Commands:
  annotate <subcmd>   Cartography management
    scan              Scan codebase, list methods with inferred metadata
    enrich            Enrich cartography with roles, effects, consumers
    apply             Generate enrichment report
    stats             Show cartography statistics
    index             Generate method index

  atlas               Generate AI-friendly Atlas artifacts in /ai/

  roadmap             Generate a deterministic development roadmap
    --issue <text>    Scope roadmap to an issue (keyword filtering)
    --output <mode>   Output format: md | json | both (default: both)

  context             Run context analysis

Global Options:
  --project <path>    Path to the project to analyze (default: current directory)
  --help              Show this help

Environment Variables:
  LC_PROJECT_PATH     Alternative to --project option

Examples:
  lolve-cartography annotate scan
  lolve-cartography annotate enrich --file Vertex.js
  lolve-cartography --project /path/to/myproject annotate stats
  lolve-cartography atlas
  lolve-cartography atlas --no-json
  lolve-cartography --project /path/to/myproject atlas
`);
  process.exit(0);
}

// Route to appropriate module
switch (command) {
  case 'init-project':
    process.argv = ['node', 'bin/init-project.cjs'];
    require('../bin/init-project.cjs');
    break;

  case 'annotate': {
    const subcmd = args[1];
    if (subcmd === 'diagram') {
      const fs = require('fs');
      const { generateDiagram } = require('../lib/project-diagram.cjs');
      const projectRoot = process.env.LC_PROJECT_PATH || process.cwd();
      const diagramPath = path.join(projectRoot, '.cache', 'project-diagram.md');
      const md = generateDiagram(projectRoot);
      fs.writeFileSync(diagramPath, md, 'utf-8');
      console.log(`Diagram written: ${diagramPath}`);
      break;
    }
    // Pass remaining args to annotation-manager
    process.argv = ['node', 'annotation-manager.cjs', ...args.slice(1)];
    require('../lib/annotation-manager.cjs');
    break;
  }

  case 'index':
    process.argv = ['node', 'annotation-manager.cjs', 'index', ...args.slice(1)];
    require('../lib/annotation-manager.cjs');
    break;

  case 'atlas': {
    const noJson = args.includes('--no-json');
    const { AtlasGenerator } = require('../lib/atlas-generator.cjs');
    const projectRoot = process.env.LC_PROJECT_PATH || process.cwd();
    const gen = new AtlasGenerator(projectRoot, { json: !noJson });
    gen.generate();
    break;
  }

  case 'roadmap': {
    const issue   = (() => { const i = args.indexOf('--issue');   return i !== -1 ? args[i + 1] : null; })();
    const output  = (() => { const i = args.indexOf('--output');  return i !== -1 ? args[i + 1] : 'both'; })();
    const { RoadmapGenerator } = require('../lib/roadmap-generator.cjs');
    const projectRoot = process.env.LC_PROJECT_PATH || process.cwd();
    const gen = new RoadmapGenerator(projectRoot, { issue, output });
    gen.generate().catch(err => {
      console.error('Roadmap generation failed:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'context':
    console.log('Context analysis requires configuration. Use programmatic API.');
    console.log('See: const { ContextAgent } = require("lolve-cartography")');
    break;

  default:
    console.error(`Unknown command: ${command}`);
    console.log('Run "lolve-cartography --help" for usage.');
    process.exit(1);
}
