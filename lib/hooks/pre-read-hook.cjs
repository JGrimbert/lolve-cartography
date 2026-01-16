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

    const isSrcJsFile = /(^|\/)src\/.*\.js(\.backup)?$/.test(normalizedPath);
    const isTempMethods = normalizedPath.includes('temp/methods.js');
    const isNodeModules = normalizedPath.includes('node_modules');
    const isBackup = normalizedPath.includes('.backup');

    if ((isSrcJsFile || isBackup) && !isTempMethods && !isNodeModules) {
      console.error(`STOP - You MUST use the MCP tool first.

REQUIRED STEPS:
1. Use tool "mcp__lolve-context__extract_methods" with query parameter
   Example: {"query": "TODO Peri searchClavis"}
2. Then Read file: temp/methods.js
3. Then Edit file: temp/methods.js (auto-reinjects to sources)

You tried to read: ${filePath}
This is BLOCKED. Use the MCP tool workflow above.`);
      process.exit(2);
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
}

main();
