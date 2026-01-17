#!/usr/bin/env node

/**
 * Project Initializer - Génère agents.config.json adapté au projet
 * 
 * Analyse le projet actuel pour:
 * - Détecter les termes du domaine
 * - Identifier les catégories de fichiers
 * - Configurer les agents selon le contexte
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
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

/**
 * Liste tous les fichiers d'un dossier récursivement
 */
function listFiles(dir, filter = null) {
  const results = [];
  
  if (!fs.existsSync(dir)) return results;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Ignorer certains dossiers
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.cache', '.backups'].includes(entry.name)) {
        continue;
      }
      results.push(...listFiles(fullPath, filter));
    } else if (entry.isFile()) {
      if (!filter || filter(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  
  return results;
}

/**
 * Extrait les mots significatifs d'un fichier
 */
function extractTerms(content) {
  // Retirer les commentaires
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
  
  // Extraire les identifiants (mots en camelCase ou snake_case)
  const words = withoutComments.match(/\b[a-z][a-zA-Z0-9_]*\b/g) || [];
  
  // Compter les occurrences
  const wordCount = {};
  for (const word of words) {
    // Ignorer les mots trop courts ou trop communs
    if (word.length < 3) continue;
    if (['var', 'let', 'const', 'function', 'return', 'this', 'for', 'while', 'if', 'else', 'null', 'undefined', 'true', 'false'].includes(word)) continue;
    
    wordCount[word] = (wordCount[word] || 0) + 1;
  }
  
  return wordCount;
}

/**
 * Extrait les classes du code
 */
function extractClasses(content) {
  const classes = [];
  
  // Regex pour class Name ou export class Name
  const classRegex = /(?:export\s+)?class\s+([A-Z][a-zA-Z0-9]*)/g;
  let match;
  
  while ((match = classRegex.exec(content)) !== null) {
    classes.push(match[1]);
  }
  
  return classes;
}

/**
 * Analyse le projet pour générer la configuration
 */
function analyzeProject(projectRoot) {
  header('Analyse du projet');
  
  const srcPath = path.join(projectRoot, 'src');
  const libPath = path.join(projectRoot, 'lib');
  
  // Déterminer le dossier source
  let sourcePath = srcPath;
  if (!fs.existsSync(srcPath) && fs.existsSync(libPath)) {
    sourcePath = libPath;
    log('Utilisation de lib/ comme dossier source', 'info');
  } else if (fs.existsSync(srcPath)) {
    log('Utilisation de src/ comme dossier source', 'info');
  } else {
    log('Aucun dossier src/ ou lib/ trouvé - utilisation de la racine', 'warning');
    sourcePath = projectRoot;
  }
  
  // Lister les fichiers JavaScript
  const jsFiles = listFiles(sourcePath, name => 
    ['.js', '.cjs', '.mjs'].includes(path.extname(name).toLowerCase())
  );
  
  log(`${jsFiles.length} fichier(s) JavaScript trouvé(s)`, 'success');
  
  // Analyser les fichiers
  const allTerms = {};
  const allClasses = new Set();
  
  for (const file of jsFiles.slice(0, 50)) { // Limiter à 50 fichiers pour la performance
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const terms = extractTerms(content);
      const classes = extractClasses(content);
      
      // Agréger les termes
      for (const [term, count] of Object.entries(terms)) {
        allTerms[term] = (allTerms[term] || 0) + count;
      }
      
      // Agréger les classes
      classes.forEach(cls => allClasses.add(cls));
      
    } catch (error) {
      // Ignorer les erreurs de lecture
    }
  }
  
  // Trier les termes par fréquence
  const sortedTerms = Object.entries(allTerms)
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term);
  
  // Catégoriser les termes
  const domainTerms = {
    classes: Array.from(allClasses).sort(),
    common: sortedTerms.slice(0, 30), // 30 termes les plus fréquents
    operations: sortedTerms.filter(t => 
      /^(create|generate|build|make|add|remove|delete|update|get|set|calculate|compute|process|handle|manage|init|load|save|fetch|parse|render|draw|display)/.test(t)
    ).slice(0, 20),
    data: sortedTerms.filter(t => 
      /^(data|cache|store|index|map|list|array|object|record|entry|item)/.test(t) ||
      t.endsWith('Data') || t.endsWith('Cache') || t.endsWith('Store')
    ).slice(0, 15)
  };
  
  log(`${allClasses.size} classe(s) détectée(s)`, 'success');
  log(`${sortedTerms.length} terme(s) unique(s) extrait(s)`, 'success');
  
  return {
    sourcePath: path.relative(projectRoot, sourcePath),
    domainTerms,
    stats: {
      files: jsFiles.length,
      classes: allClasses.size,
      terms: sortedTerms.length
    }
  };
}

/**
 * Génère la configuration des agents
 */
function generateConfig(projectName, analysis) {
  return {
    project: {
      name: projectName,
      rootPath: ".",
      srcPath: analysis.sourcePath
    },
    agents: {
      context: {
        enabled: true,
        indexRefreshInterval: 300000,
        categories: [
          "core",
          "utilities",
          "data",
          "operations",
          "ui",
          "debug"
        ],
        searchConfig: {
          maxResults: 20,
          minScore: 0.3,
          boostFactors: {
            nameMatch: 2.0,
            descriptionMatch: 1.5,
            roleMatch: 1.2,
            categoryMatch: 1.3
          }
        }
      },
      cache: {
        enabled: true,
        maxEntries: 100,
        similarityThreshold: 0.8,
        ttl: 86400000
      },
      preprocess: {
        enabled: true,
        stopWords: [
          "le", "la", "les", "un", "une", "des", "de", "du", "pour",
          "dans", "avec", "sur", "est", "sont",
          "the", "a", "an", "and", "or", "but", "in", "on", "at",
          "to", "for", "of", "with", "by", "from", "is", "are"
        ],
        domainTerms: analysis.domainTerms
      },
      analysis: {
        enabled: true,
        complexityThresholds: {
          trivial: 1,
          simple: 3,
          medium: 5,
          complex: 8,
          expert: 10
        },
        riskFactors: [
          {
            pattern: "regex|eval|Function\\(",
            severity: "high",
            description: "Code dynamique détecté"
          },
          {
            pattern: "\\$\\.|querySelector|getElementById",
            severity: "medium",
            description: "Manipulation DOM directe"
          },
          {
            pattern: "localStorage|sessionStorage",
            severity: "low",
            description: "Utilisation du stockage navigateur"
          }
        ]
      },
      proposal: {
        enabled: true,
        maxProposals: 3,
        includeSnippets: true,
        snippetMaxLines: 20
      }
    },
    api: {
      model: "claude-sonnet-4-20250514",
      maxTokens: 8000,
      useCache: true,
      systemPrompt: `Tu es un expert en développement JavaScript. Tu travailles sur le projet ${projectName}.`
    },
    monitoring: {
      outputDir: "monitoring",
      generateOnIndex: false
    },
    _metadata: {
      generated: new Date().toISOString(),
      stats: analysis.stats,
      autoGenerated: true
    }
  };
}

/**
 * Point d'entrée
 */
async function main() {
  header('Initialisation du projet');
  
  const projectRoot = process.cwd();
  
  // Lire package.json pour obtenir le nom du projet
  let projectName = 'unknown-project';
  const packageJsonPath = path.join(projectRoot, 'package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      projectName = packageJson.name || projectName;
      log(`Projet détecté: ${projectName}`, 'success');
    } catch (error) {
      log('Impossible de lire package.json', 'warning');
    }
  }
  
  // Demander confirmation
  console.log(`\nCe script va analyser votre projet "${projectName}" et générer:`);
  console.log(`  ${COLORS.cyan}→${COLORS.reset} .lolve-cartography.json`);
  console.log(`  ${COLORS.cyan}→${COLORS.reset} Termes du domaine détectés automatiquement`);
  console.log(`  ${COLORS.cyan}→${COLORS.reset} Configuration adaptée au projet\n`);
  
  const confirm = await question('Continuer ? [O/n] ');
  if (confirm.toLowerCase() === 'n') {
    log('Annulé', 'warning');
    rl.close();
    process.exit(0);
  }
  
  // Analyser le projet
  const analysis = analyzeProject(projectRoot);
  
  // Afficher les termes détectés
  console.log(`\n${COLORS.bright}Termes du domaine détectés:${COLORS.reset}`);
  console.log(`  Classes (${analysis.domainTerms.classes.length}): ${analysis.domainTerms.classes.slice(0, 10).join(', ')}${analysis.domainTerms.classes.length > 10 ? '...' : ''}`);
  console.log(`  Opérations (${analysis.domainTerms.operations.length}): ${analysis.domainTerms.operations.slice(0, 10).join(', ')}${analysis.domainTerms.operations.length > 10 ? '...' : ''}`);
  console.log(`  Data (${analysis.domainTerms.data.length}): ${analysis.domainTerms.data.slice(0, 10).join(', ')}${analysis.domainTerms.data.length > 10 ? '...' : ''}`);
  
  // Générer la configuration
  const config = generateConfig(projectName, analysis);
  
  // Sauvegarder dans .lolve-cartography.json à la racine
  const configPath = path.join(projectRoot, '.cache/lolve-cartography.json');

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  log(`Configuration générée: ${configPath}`, 'success');

  require('./setup-claude-hooks.cjs');

  process.argv = ['node', 'annotation-manager.cjs', 'full', '--force'];
  require('../lib/annotation-manager.cjs');

  //process.argv = ['node', 'bin/setup-claude-hooks.cjs'];

  // Afficher les prochaines étapes
  header('Configuration terminée !');
  
  console.log(`${COLORS.bright}Prochaines étapes:${COLORS.reset}

1. ${COLORS.cyan}Vérifiez la configuration${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} Éditez .lolve-cartography.json si nécessaire

2. ${COLORS.cyan}Configurez votre clé API${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} Créez .env avec ANTHROPIC_API_KEY=...

3. ${COLORS.cyan}Générez l'index des méthodes${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} npx lolve-cartography annotate index

4. ${COLORS.cyan}Testez l'orchestrator${COLORS.reset}
   ${COLORS.yellow}→${COLORS.reset} npx lolve-cartography orchestrate --dry-run "test"

${COLORS.dim}Configuration sauvegardée dans: ${configPath}${COLORS.reset}
`);
  
  rl.close();
}

main().catch(err => {
  console.error(`${COLORS.red}Erreur:${COLORS.reset}`, err.message);
  process.exit(1);
});
