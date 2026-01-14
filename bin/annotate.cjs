#!/usr/bin/env node
/**
 * lc-annotate - Shortcut for annotation commands
 *
 * Usage:
 *   lc-annotate audit
 *   lc-annotate suggest --file X
 *   lc-annotate apply
 *   lc-annotate stats
 */

const path = require('path');

const args = process.argv.slice(2);

// Handle --project option
const projectIdx = args.indexOf('--project');
if (projectIdx !== -1 && args[projectIdx + 1]) {
  process.env.LC_PROJECT_PATH = path.resolve(args[projectIdx + 1]);
  args.splice(projectIdx, 2);
}

// Pass to annotation-manager
process.argv = ['node', 'annotation-manager.cjs', ...args];
require('../lib/annotation-manager.cjs');
