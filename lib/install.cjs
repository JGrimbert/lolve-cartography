#!/usr/bin/env node

/**
 * Script d'installation de l'intégration API
 * 
 * Copie les fichiers nécessaires et aide à la configuration
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function log(message, type = 'info') {
  const prefix = {
    info: `${COLORS.cyan}ℹ${COLORS.reset}`,
    success: `${COLORS.green}✓${COLORS.reset}`,
    warning: `${COLORS.yellow}⚠${COLORS.reset}`,
    error: `${COLORS.red}✗${COLORS.reset}`
  };
  console.log(`${prefix[type] || ''} ${message}`);
}

function header(text) {
  console.log(`\n${COLORS.bright}${COLORS.cyan}${'═'.repeat(60)}${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan} ${text}${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}${'═'.repeat(60)}${COLORS.reset}\n`);
}

async function main() {
  header('Installation API Anthropic pour lolve-cartography');

  const projectRoot = process.cwd();
  const libDir = path.join(projectRoot, 'lib');

  log(`Dossier du projet: ${projectRoot}`, 'info');

  // Vérifier que nous sommes dans le bon projet
  if (!fs.existsSync(libDir)) {
    log('Erreur: dossier lib/ non trouvé. Êtes-vous dans le dossier lolve-cartography ?', 'error');
    process.exit(1);
  }

  log('Vérification des fichiers...', 'info');

  // Fichiers à copier
  const filesToCopy = [
    {
      name: 'ai-client.cjs',
      source: __dirname,
      dest: libDir,
      description: 'Client API Anthropic'
    },
    {
      name: 'monitoring-agent.cjs',
      source: __dirname,
      dest: libDir,
      description: 'Agent de monitoring'
    },
    {
      name: 'init-project.cjs',
      source: __dirname,
      dest: libDir,
      description: 'Script d\'initialisation du projet'
    },
    {
      name: 'env-loader.cjs',
      source: __dirname,
      dest: libDir,
      description: 'Loader de variables d\'environnement'
    },
    {
      name: 'orchestrator.cjs',
      source: __dirname,
      dest: libDir,
      description: 'Orchestrator avec intégration API',
      backup: true
    },
    {
      name: '.env.example',
      source: __dirname,
      dest: projectRoot,
      description: 'Template de configuration'
    },
    {
      name: 'API-INTEGRATION-GUIDE.md',
      source: __dirname,
      dest: projectRoot,
      description: 'Guide d\'utilisation'
    }
  ];

  let copied = 0;
  let backed = 0;
  let skipped = 0;

  for (const file of filesToCopy) {
    const sourcePath = path.join(file.source, file.name);
    const destPath = path.join(file.dest, file.name);

    // Vérifier que le source existe
    if (!fs.existsSync(sourcePath)) {
      log(`Source non trouvée: ${file.name}`, 'warning');
      skipped++;
      continue;
    }

    // Backup si le fichier existe et backup demandé
    if (file.backup && fs.existsSync(destPath)) {
      const backupPath = destPath + '.backup';
      fs.copyFileSync(destPath, backupPath);
      log(`Backup créé: ${file.name}.backup`, 'warning');
      backed++;
    }

    // Copier le fichier
    fs.copyFileSync(sourcePath, destPath);
    log(`${file.description}: ${file.name}`, 'success');
    copied++;
  }

  console.log(`\n${COLORS.bright}Résumé:${COLORS.reset}`);
  console.log(`  Copiés: ${copied}`);
  if (backed > 0) console.log(`  Backups: ${backed}`);
  if (skipped > 0) console.log(`  Ignorés: ${skipped}`);

  // Configuration .env
  const envPath = path.join(projectRoot, '.env');
  const envExamplePath = path.join(projectRoot, '.env.example');

  if (fs.existsSync(envPath)) {
    log('.env existe déjà', 'info');
  } else {
    console.log(`\n${COLORS.bright}Configuration de l'API:${COLORS.reset}`);
    const setup = await question('Voulez-vous configurer votre clé API maintenant ? [o/N] ');
    
    if (setup.toLowerCase() === 'o') {
      const apiKey = await question('Entrez votre clé API Anthropic: ');
      
      if (apiKey && apiKey.startsWith('sk-ant-')) {
        fs.writeFileSync(envPath, `# Configuration API Anthropic
ANTHROPIC_API_KEY=${apiKey}
`, 'utf-8');
        log('Fichier .env créé avec succès', 'success');
      } else {
        log('Clé API invalide. Créez le fichier .env manuellement.', 'warning');
        fs.copyFileSync(envExamplePath, envPath);
      }
    } else {
      log('Copiez .env.example vers .env et configurez votre clé API', 'info');
      fs.copyFileSync(envExamplePath, envPath);
    }
  }

  // Vérifier .gitignore
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.env')) {
      log('Ajout de .env au .gitignore', 'info');
      fs.appendFileSync(gitignorePath, '\n# API Keys\n.env\n');
    }
  }

  // Dépendances npm
  console.log(`\n${COLORS.bright}Dépendances:${COLORS.reset}`);
  
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    const requiredDeps = {
      'acorn': '^8.0.0',
      'dotenv': '^16.0.0' // Pour charger .env
    };

    const missingDeps = [];
    for (const [dep, version] of Object.entries(requiredDeps)) {
      if (!packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]) {
        missingDeps.push(`${dep}@${version}`);
      }
    }

    if (missingDeps.length > 0) {
      log(`Dépendances manquantes: ${missingDeps.join(', ')}`, 'warning');
      log('Installez-les avec: npm install ' + missingDeps.join(' '), 'info');
    } else {
      log('Toutes les dépendances sont installées', 'success');
    }
  }

  // Scripts npm suggérés
  console.log(`\n${COLORS.bright}Scripts npm suggérés:${COLORS.reset}`);
  console.log(`
Ajoutez ces scripts à votre package.json:

"scripts": {
  "orchestrate": "node lib/orchestrator.cjs",
  "monitor": "node lib/monitoring-agent.cjs",
  "monitor:dashboard": "node lib/monitoring-agent.cjs dashboard",
  "monitor:stats": "node lib/monitoring-agent.cjs stats"
}

Utilisation:
  npm run orchestrate "votre requête"
  npm run monitor:dashboard
  npm run monitor:stats
`);

  // Initialiser le projet
  console.log(`\n${COLORS.bright}Initialisation du projet:${COLORS.reset}`);
  const initNow = await question('Voulez-vous analyser le projet et générer agents.config.json maintenant ? [O/n] ');
  
  if (initNow.toLowerCase() !== 'n') {
    log('Lancement de l\'initialisation du projet...', 'info');
    
    // Exécuter init-project.cjs
    const { spawnSync } = require('child_process');
    const initPath = path.join(libDir, 'init-project.cjs');
    
    const result = spawnSync('node', [initPath], {
      stdio: 'inherit',
      cwd: projectRoot
    });
    
    if (result.status !== 0) {
      log('Erreur lors de l\'initialisation', 'error');
    }
  } else {
    log('Lancez manuellement: node lib/init-project.cjs', 'info');
  }

  // Prochaines étapes
  header('Installation terminée !');

  console.log(`${COLORS.bright}Prochaines étapes:${COLORS.reset}

${initNow.toLowerCase() === 'n' ? `1. ${COLORS.cyan}Initialisez le projet${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} node lib/init-project.cjs

` : ''}2. ${COLORS.cyan}Configurez votre clé API${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} Éditez .env et ajoutez votre clé API Anthropic
   ${COLORS.dim}Obtenez-la sur: https://console.anthropic.com/settings/keys${COLORS.reset}

3. ${COLORS.cyan}Générez l'index des méthodes${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} node bin/cli.cjs annotate index

4. ${COLORS.cyan}Testez l'intégration${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} node lib/orchestrator.cjs --dry-run "test"

5. ${COLORS.cyan}Utilisez l'orchestrator${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} node lib/orchestrator.cjs "votre requête"

6. ${COLORS.cyan}Générez un dashboard${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} node lib/monitoring-agent.cjs dashboard

${COLORS.bright}Documentation:${COLORS.reset}
  Consultez API-INTEGRATION-GUIDE.md pour plus de détails

${COLORS.bright}Support:${COLORS.reset}
  - Documentation API: https://docs.anthropic.com
  - Console: https://console.anthropic.com
`);

  rl.close();
}

main().catch(err => {
  console.error(`${COLORS.red}Erreur:${COLORS.reset}`, err.message);
  process.exit(1);
});
