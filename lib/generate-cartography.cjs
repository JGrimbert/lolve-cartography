#!/usr/bin/env node

/**
 * Génère un fichier de cartographie Markdown du projet LOLVE
 */

const path = require('path');
const { ContextAgent } = require('./context-agent.cjs');
const { readJSON } = require('./utils/file-utils.cjs');

async function main() {
  const configPath = path.join(__dirname, 'agents.config.json');
  const config = readJSON(configPath);

  if (!config) {
    console.error('Configuration non trouvée');
    process.exit(1);
  }

  // Forcer la reconstruction de l'index
  config.agents.context.indexRefreshInterval = 0;

  const agent = new ContextAgent(config);
  await agent.init();

  const outputPath = path.join(config.project.rootPath, 'CARTOGRAPHY.md');
  const content = agent.generateCartography(outputPath);

  console.log('\n' + content);
}

main().catch(console.error);
