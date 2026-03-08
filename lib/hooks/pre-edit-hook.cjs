#!/usr/bin/env node
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({ input: process.stdin });
  let input = '';

  for await (const line of rl) {
    input += line;
  }

  try {
    const data = JSON.parse(input);
    const filePath = data.tool_input?.file_path || '';
    const normalizedPath = filePath.replace(/\\/g, '/');

    const isSrcJsFile = /(^|\/)src\/.*\.js$/.test(normalizedPath);
    const isTempMethods = normalizedPath.includes('temp/methods.js');
    const isNodeModules = normalizedPath.includes('node_modules');

    if (isSrcJsFile && !isTempMethods && !isNodeModules) {
      console.error(`STOP - You MUST edit temp/methods.js, not source files.

REQUIRED STEPS:
1. Use tool "mcp__lolve-context__extract_methods" with query parameter
2. Read file: temp/methods.js
3. Edit file: temp/methods.js (auto-reinjects to sources)

You tried to edit: ${filePath}
This is BLOCKED. Edit temp/methods.js instead.`);
      process.exit(2);
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
}

main();
