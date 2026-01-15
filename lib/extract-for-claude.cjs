#!/usr/bin/env node

/**
 * Extract for Claude Code - Workflow simplifié
 * 
 * 1. Analyse la requête
 * 2. Sélectionne et extrait les méthodes pertinentes
 * 3. Crée temp/methods.js
 * 4. Affiche la commande Claude Code à lancer
 * 5. Attend validation utilisateur
 * 6. Réinjecte automatiquement
 * 
 * Utilise UNIQUEMENT Claude Code CLI (pas d'API)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { log, section, COLORS } = require('./utils/logger.cjs');
const { readJSON } = require('./utils/file-utils.cjs');

// Import des composants
const { ContextAgent } = require('./context-agent.cjs');
const { PreprocessAgent } = require('./preprocess-agent.cjs');
const { MethodSnapshot } = require('./method-snapshot.cjs');
const { MethodReinjector } = require('./method-reinjector.cjs');

class ExtractForClaude {
  constructor(options = {}) {
    this.options = {
      tempDir: 'temp',
      autoReinject: true,
      verbose: false,
      ...options
    };

    this.configPath = path.join(__dirname, 'agents.config.json');
    this.config = null;
    this.agents = {};
  }

  /**
   * Initialise
   */
  async init() {
    section('Extract for Claude Code');

    // Charger la configuration
    this.config = readJSON(this.configPath);
    if (!this.config) {
      throw new Error('Configuration non trouvée: agents.config.json');
    }

    // Initialiser les agents
    this.agents = {
      context: await new ContextAgent(this.config).init(),
      preprocess: await new PreprocessAgent(this.config).init()
    };

    // Créer le dossier temp
    if (!fs.existsSync(this.options.tempDir)) {
      fs.mkdirSync(this.options.tempDir, { recursive: true });
    }

    return this;
  }

  /**
   * Exécute le workflow
   */
  async run(query) {
    try {
      // 1. Analyse de la requête
      const preprocessed = this.agents.preprocess.process(query);
      
      // 2. Recherche des méthodes pertinentes
      console.log('\n🔍 Recherche des méthodes pertinentes...\n');
      const searchSession = this.agents.context.createSearchSession(preprocessed.cleaned);
      
      const methodCount = searchSession.keys.length;

      if (methodCount === 0) {
        console.log(`${COLORS.yellow}⚠ Aucune méthode trouvée pour "${query}"${COLORS.reset}\n`);
        return { success: false, reason: 'no_methods' };
      }

      // Afficher les méthodes trouvées
      const results = searchSession.getAtLevel(1);
      console.log(`${COLORS.bright}${methodCount} méthode(s) sélectionnée(s):${COLORS.reset}\n`);
      results.slice(0, 10).forEach((r, i) => {
        console.log(`  ${COLORS.cyan}${i + 1}.${COLORS.reset} ${r.key} ${COLORS.dim}(${r.role})${COLORS.reset}`);
      });
      if (results.length > 10) {
        console.log(`  ${COLORS.dim}... et ${results.length - 10} autres${COLORS.reset}`);
      }
      console.log();

      // 3. Créer le snapshot
      const snapshot = new MethodSnapshot();
      const snapshotData = snapshot.capture(searchSession.keys);
      
      const snapshotPath = path.join(this.options.tempDir, 'snapshot.json');
      snapshot.save(snapshotData, snapshotPath);

      // 4. Générer le fichier temporaire
      const tempContent = snapshot.generateTempFile(snapshotData, {
        includeContext: true,
        groupByClass: true
      });

      const tempPath = path.join(this.options.tempDir, 'methods.js');
      fs.writeFileSync(tempPath, tempContent, 'utf-8');

      // 5. Afficher les instructions pour Claude Code
      this.displayClaudeCodeInstructions(tempPath, query);

      // 6. Attendre que l'utilisateur valide
      const shouldReinject = await this.waitForUserValidation();

      if (!shouldReinject) {
        console.log(`\n${COLORS.yellow}Annulé.${COLORS.reset}\n`);
        return { success: false, cancelled: true };
      }

      // 7. Réinjection
      console.log(`\n${COLORS.bright}🔄 Réinjection des modifications...${COLORS.reset}\n`);
      
      const reinjector = new MethodReinjector({
        backup: true,
        dryRun: false,
        verbose: this.options.verbose
      });

      const result = await reinjector.reinject(snapshotPath, tempPath);

      if (result.success) {
        console.log(`\n${COLORS.green}${COLORS.bright}✅ Modifications réinjectées avec succès !${COLORS.reset}\n`);
        this.displaySummary(result, snapshotData);
      } else {
        console.log(`\n${COLORS.yellow}⚠️  Réinjection partielle: ${result.failedCount} échec(s)${COLORS.reset}\n`);
      }

      return result;

    } catch (error) {
      console.error(`\n${COLORS.red}❌ Erreur: ${error.message}${COLORS.reset}\n`);
      if (this.options.verbose) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  /**
   * Affiche les instructions pour Claude Code
   */
  displayClaudeCodeInstructions(tempPath, originalQuery) {
    const boxWidth = 70;
    const line = '─'.repeat(boxWidth - 2);
    
    console.log(`\n${COLORS.cyan}┌${line}┐${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset} ${COLORS.bright}ÉTAPE SUIVANTE : Utilisez Claude Code${COLORS.reset}`.padEnd(boxWidth + 10) + `${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}├${line}┤${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset}                                                                      ${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset} ${COLORS.dim}Fichier créé:${COLORS.reset} ${COLORS.bright}${tempPath}${COLORS.reset}`.padEnd(boxWidth + 20) + `${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset}                                                                      ${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset} ${COLORS.bright}Lancez Claude Code avec cette commande :${COLORS.reset}`.padEnd(boxWidth + 10) + `${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset}                                                                      ${COLORS.cyan}│${COLORS.reset}`);
    
    // Suggérer une commande adaptée à la requête
    const claudeCommand = this.generateClaudeCodeCommand(originalQuery, tempPath);
    const commandLines = this.wrapText(`"${claudeCommand}"`, 60);
    
    commandLines.forEach(line => {
      console.log(`${COLORS.cyan}│${COLORS.reset}   ${COLORS.green}${line}${COLORS.reset}`.padEnd(boxWidth + 15) + `${COLORS.cyan}│${COLORS.reset}`);
    });
    
    console.log(`${COLORS.cyan}│${COLORS.reset}                                                                      ${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset} ${COLORS.dim}Ou ouvrez le fichier directement dans votre éditeur${COLORS.reset}`.padEnd(boxWidth + 10) + `${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset}                                                                      ${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}└${line}┘${COLORS.reset}`);
  }

  /**
   * Génère une commande Claude Code adaptée à la requête
   */
  generateClaudeCodeCommand(originalQuery, tempPath) {
    // Nettoyer et adapter la requête pour Claude Code
    const action = originalQuery
      .replace(/améliore|optimise|refactor/i, 'améliore')
      .replace(/corrige|fix/i, 'corrige')
      .replace(/ajoute|crée|génère/i, 'ajoute');
    
    return `${action} dans ${tempPath}`;
  }

  /**
   * Wrap le texte pour l'affichage
   */
  wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  }

  /**
   * Attend la validation de l'utilisateur
   */
  async waitForUserValidation() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(`\n${COLORS.bright}Après avoir utilisé Claude Code :${COLORS.reset}`);
    console.log(`  ${COLORS.green}→ Appuyez sur ENTRÉE${COLORS.reset} pour réinjecter les modifications`);
    console.log(`  ${COLORS.yellow}→ Tapez "cancel" pour annuler${COLORS.reset}\n`);

    return new Promise((resolve) => {
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() !== 'cancel');
      });
    });
  }

  /**
   * Affiche le résumé final
   */
  displaySummary(result, snapshotData) {
    const files = Object.keys(snapshotData.files);
    
    console.log(`${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}`);
    console.log(`${COLORS.bright}Résumé:${COLORS.reset}`);
    console.log(`  Méthodes modifiées: ${COLORS.green}${result.successCount}${COLORS.reset}`);
    console.log(`  Fichiers concernés: ${COLORS.cyan}${files.length}${COLORS.reset}`);
    
    files.forEach(f => {
      console.log(`    - ${f}`);
    });
    
    console.log(`  Backup créé: ${COLORS.dim}*.backup${COLORS.reset}`);
    console.log(`${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}\n`);
  }

  /**
   * Affiche l'aide
   */
  static showHelp() {
    console.log(`
${COLORS.bright}Extract for Claude Code${COLORS.reset}

Workflow optimisé pour utiliser Claude Code CLI (sans API):
  1. Analyse votre requête
  2. Sélectionne les méthodes pertinentes automatiquement
  3. Les extrait dans temp/methods.js
  4. Vous guide pour utiliser Claude Code
  5. Réinjecte automatiquement après validation

${COLORS.cyan}Usage:${COLORS.reset}
  node lib/extract-for-claude.cjs "votre requête"

${COLORS.cyan}Arguments:${COLORS.reset}
  "votre requête"    Description de ce que vous voulez faire

${COLORS.cyan}Options:${COLORS.reset}
  --temp-dir DIR     Dossier temporaire (défaut: temp/)
  --verbose          Logs détaillés
  --help             Affiche cette aide

${COLORS.cyan}Exemples:${COLORS.reset}
  # Améliorer une méthode
  node lib/extract-for-claude.cjs "améliore Vertex.calculate"
  
  # Refactorer une classe
  node lib/extract-for-claude.cjs "refactor la classe Orb"
  
  # Optimiser des performances
  node lib/extract-for-claude.cjs "optimise les calculs de distance"

${COLORS.cyan}Workflow complet:${COLORS.reset}
  1. Lancez: ${COLORS.green}node lib/extract-for-claude.cjs "votre requête"${COLORS.reset}
  2. Le script sélectionne et extrait les méthodes pertinentes
  3. Utilisez Claude Code comme indiqué
  4. Appuyez sur ENTRÉE
  5. Les modifications sont réinjectées automatiquement

${COLORS.cyan}Avantages:${COLORS.reset}
  ✓ Utilise vos crédits Pro/Max (pas de compte API séparé)
  ✓ Pas de limite hebdomadaire API
  ✓ Claude Code a le contexte complet du projet
  ✓ Workflow simple et rapide
  ✓ Backup automatique avant modification
`);
  }
}

/**
 * Point d'entrée CLI
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    ExtractForClaude.showHelp();
    process.exit(0);
  }

  // Parser les options
  const options = {
    verbose: args.includes('--verbose')
  };

  // Parser --temp-dir
  const tempDirIdx = args.indexOf('--temp-dir');
  if (tempDirIdx !== -1 && args[tempDirIdx + 1]) {
    options.tempDir = args[tempDirIdx + 1];
  }

  // Extraire la requête
  const query = args.filter((a, i) => {
    if (a.startsWith('--')) return false;
    if (i > 0 && args[i - 1].startsWith('--')) return false;
    return true;
  }).join(' ');

  if (!query) {
    console.error(`\n${COLORS.red}❌ Aucune requête spécifiée${COLORS.reset}`);
    console.log(`\n${COLORS.dim}Usage: node lib/extract-for-claude.cjs "votre requête"${COLORS.reset}`);
    console.log(`${COLORS.dim}Aide:  node lib/extract-for-claude.cjs --help${COLORS.reset}\n`);
    process.exit(1);
  }

  try {
    const extractor = await new ExtractForClaude(options).init();
    const result = await extractor.run(query);

    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error(`${COLORS.red}Erreur:${COLORS.reset}`, error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Export
module.exports = { ExtractForClaude };

// CLI
if (require.main === module) {
  main();
}
