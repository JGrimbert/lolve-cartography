#!/usr/bin/env node
/**
 * lc-index - Shortcut for method index generation
 *
 * Usage:
 *   lc-index
 *   lc-index --force
 *   lc-index --project /path/to/project
 */

const path = require('path');

const args = process.argv.slice(2);

// Handle --project option
const projectIdx = args.indexOf('--project');
if (projectIdx !== -1 && args[projectIdx + 1]) {
  process.env.LC_PROJECT_PATH = path.resolve(args[projectIdx + 1]);
  args.splice(projectIdx, 2);
}

// Pass to annotation-manager with index command
process.argv = ['node', 'annotation-manager.cjs', 'index', ...args];
require('../lib/annotation-manager.cjs');
