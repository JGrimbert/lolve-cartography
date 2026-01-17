#!/usr/bin/env node
/**
 * Hook pre_tool_use: Vérifie que extract_methods a été appelé
 * avant de lire/modifier les fichiers sources du projet.
 *
 * Exit codes:
 * - 0: Autorisé
 * - 2: Bloqué (message stderr affiché à Claude)
 */

const fs = require('fs');
const path = require('path');

// Lire les paramètres de l'outil via stdin
let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolInput = data.tool_input || {};
    const filePath = toolInput.file_path || '';

    // Normaliser le chemin
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

    // Vérifier si c'est un fichier source du projet (lib/*.cjs)
    const isSourceFile = normalizedPath.includes('/lib/') && normalizedPath.endsWith('.cjs');

    if (!isSourceFile) {
      // Pas un fichier source, autoriser
      process.exit(0);
    }

    // Vérifier si temp/methods.js existe (signe que MCP extract_methods a été utilisé)
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const methodsFile = path.join(projectDir, 'temp', 'methods.js');

    if (fs.existsSync(methodsFile)) {
      // MCP a été utilisé, autoriser
      process.exit(0);
    }

    // Bloquer - MCP non utilisé
    console.error(`BLOQUÉ: Vous devez d'abord utiliser mcp__lolve-context__extract_methods avant de lire/modifier ${path.basename(filePath)}.

Workflow obligatoire:
1. mcp__lolve-context__extract_methods avec query pertinente
2. Read temp/methods.js
3. Edit temp/methods.js (auto-réinjection dans les sources)`);

    process.exit(2);

  } catch (err) {
    // En cas d'erreur de parsing, autoriser pour ne pas bloquer
    console.error('Hook error:', err.message);
    process.exit(0);
  }
});
