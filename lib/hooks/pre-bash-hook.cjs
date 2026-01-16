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
    const command = data.tool_input?.command || '';

    // Détecter les commandes cat/type/head/tail sur les fichiers src/*.js
    const catPattern = /\b(cat|type|head|tail|less|more)\s+["']?([^"'\s|>]+\.js)/gi;
    const matches = [...command.matchAll(catPattern)];

    for (const match of matches) {
      const filePath = match[2].replace(/\\/g, '/');

      const isSrcJsFile = /(^|\/)src\/.*\.js$/.test(filePath);
      const isTempMethods = filePath.includes('temp/methods.js');
      const isNodeModules = filePath.includes('node_modules');

      if (isSrcJsFile && !isTempMethods && !isNodeModules) {
        console.error(`STOP - You MUST use the MCP tool, not Bash commands.

REQUIRED STEPS:
1. Use tool "mcp__lolve-context__extract_methods" with query parameter
   Example: {"query": "TODO Peri searchClavis"}
2. Then Read file: temp/methods.js
3. Then Edit file: temp/methods.js (auto-reinjects to sources)

You tried to run: ${command.substring(0, 100)}...
This is BLOCKED. Use the MCP tool workflow above.`);
        process.exit(2);
      }
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
}

main();
