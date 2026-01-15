#!/usr/bin/env node

/**
 * Orchestrator-Temp - Workflow complet avec fichiers temporaires
 * 
 * 1. Analyse la requête
 * 2. Sélectionne les méthodes pertinentes
 * 3. Crée un snapshot + fichier temporaire
 * 4. [Pause] - Utilisateur ou Claude modifie le fichier
 * 5. Réinjecte les modifications
 */

// Charger les variables d'environnement
require('./env-loader.cjs');

const fs = require('fs');
const path = require('path');
const { log, section, COLORS } = require('./utils/logger.cjs');
const { readJSON, writeFile } = require('./utils/file-utils.cjs');

// Import des composants
const { ContextAgent } = require('./context-agent.cjs');
const { PreprocessAgent } = require('./preprocess-agent.cjs');
const { MethodSnapshot } = require('./method-snapshot.cjs');
const { MethodReinjector } = require('./method-reinjector.cjs');
const { AIClient } = require('./ai-client.cjs');

class OrchestratorTemp {
  constructor(options = {}) {
    this.options = {
      tempDir: 'temp',
      autoReinject: false,
      useAPI: true,
      verbose: false,
      ...options
    };

    this.configPath = path.join(__dirname, 'agents.config.json');
    this.config = null;
    this.agents = {};
    this.aiClient = null;
  }

  /**
   * Initialise l'orchestrator
   */
  async init() {
    section('LOLVE Orchestrator - Mode Temp Files');

    // Charger la configuration
    this.config = readJSON(this.configPath);
    if (!this.config) {
      throw new Error('Configuration non trouvée: agents.config.json');
    }

    log('OrchestratorTemp', 'Initialisation des agents...');

    // Initialiser les agents
    this.agents = {
      context: await new ContextAgent(this.config).init(),
      preprocess: await new PreprocessAgent(this.config).init()
    };

    // Initialiser le client API si demandé
    if (this.options.useAPI) {
      this.aiClient = new AIClient();
      if (this.aiClient.isAvailable()) {
        log('OrchestratorTemp', '✓ API Anthropic disponible', 'success');
      } else {
        log('OrchestratorTemp', '⚠ API non disponible - mode manuel uniquement', 'warning');
        this.options.useAPI = false;
      }
    }

    // Créer le dossier temp
    if (!fs.existsSync(this.options.tempDir)) {
      fs.mkdirSync(this.options.tempDir, { recursive: true });
    }

    log('OrchestratorTemp', 'Agents initialisés', 'success');

    return this;
  }

  /**
   * Exécute le workflow complet
   */
  async run(query) {
    try {
      // 1. Prétraitement de la requête
      section('1. Analyse de la requête');
      const preprocessed = this.agents.preprocess.process(query);
      log('OrchestratorTemp', `Requête traitée: "${preprocessed.cleaned}"`, 'info');

      // 2. Recherche des méthodes pertinentes
      section('2. Recherche des méthodes pertinentes');
      const searchSession = this.agents.context.createSearchSession(preprocessed.cleaned);
      
      const methodCount = searchSession.keys.length;
      log('OrchestratorTemp', `${methodCount} méthode(s) pertinente(s) trouvée(s)`, 'success');

      if (methodCount === 0) {
        log('OrchestratorTemp', 'Aucune méthode trouvée', 'warning');
        return { success: false, reason: 'no_methods' };
      }

      // Afficher les méthodes trouvées
      const results = searchSession.getAtLevel(1);
      console.log('\nMéthodes sélectionnées:');
      results.slice(0, 10).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.key} (${r.role}) - score: ${r.score.toFixed(2)}`);
      });
      if (results.length > 10) {
        console.log(`  ... et ${results.length - 10} autres`);
      }

      // 3. Créer le snapshot
      section('3. Création du snapshot');
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
      log('OrchestratorTemp', `Fichier temporaire créé: ${tempPath}`, 'success');

      // 5. Utiliser l'API pour modifier (si disponible)
      if (this.options.useAPI && this.aiClient) {
        section('4. Modification via API Anthropic');
        
        const modifiedContent = await this.modifyViaAPI(query, tempContent, snapshotData);
        
        if (modifiedContent) {
          // Sauvegarder le fichier modifié
          const modifiedPath = path.join(this.options.tempDir, 'methods_modified.js');
          fs.writeFileSync(modifiedPath, modifiedContent, 'utf-8');
          log('OrchestratorTemp', `Fichier modifié sauvegardé: ${modifiedPath}`, 'success');

          // Réinjection automatique si demandé
          if (this.options.autoReinject) {
            return await this.reinject(snapshotPath, modifiedPath);
          } else {
            // Attendre validation utilisateur
            return await this.waitForValidation(snapshotPath, modifiedPath);
          }
        }
      }

      // Mode manuel : attendre que l'utilisateur modifie
      section('4. Modification manuelle');
      console.log(`\n${COLORS.bright}Prochaines étapes:${COLORS.reset}`);
      console.log(`\n1. Éditez le fichier: ${COLORS.cyan}${tempPath}${COLORS.reset}`);
      console.log(`   Modifiez les méthodes selon vos besoins`);
      console.log(`\n2. Réinjectez les modifications:`);
      console.log(`   ${COLORS.cyan}node lib/method-reinjector.cjs ${tempPath}${COLORS.reset}`);
      console.log(`\n3. Ou lancez avec --auto-reinject pour réinjection automatique après édition\n`);

      return {
        success: true,
        mode: 'manual',
        snapshotPath,
        tempPath
      };

    } catch (error) {
      log('OrchestratorTemp', `Erreur: ${error.message}`, 'error');
      if (this.options.verbose) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  /**
   * Modifie le code via l'API Anthropic
   */
  async modifyViaAPI(query, tempContent, snapshotData) {
    const methodList = Object.keys(snapshotData.methods).join(', ');
    
    const prompt = `Voici des méthodes JavaScript extraites d'un projet.

REQUÊTE UTILISATEUR:
${query}

MÉTHODES À MODIFIER:
${methodList}

CODE ACTUEL:
${tempContent}

INSTRUCTIONS:
1. Modifie les méthodes selon la requête
2. Conserve EXACTEMENT le format avec les commentaires "// Méthode: X" et "// Fichier: Y"
3. Ne change PAS les noms de méthodes
4. Retourne le code complet modifié avec TOUS les commentaires de structure

IMPORTANT: Le code doit pouvoir être parsé automatiquement, garde TOUS les marqueurs.`;

    try {
      const result = await this.aiClient.sendMessage(prompt, {
        maxTokens: 8000,
        systemPrompt: 'Tu es un expert en refactoring JavaScript. Tu modifies du code de façon précise et professionnelle.'
      });

      // Extraire le code (enlever les backticks markdown si présents)
      let code = result.content;
      if (code.includes('```')) {
        const match = code.match(/```(?:javascript|js)?\n([\s\S]*?)\n```/);
        if (match) {
          code = match[1];
        }
      }

      log('OrchestratorTemp', 'Modifications générées par Claude', 'success');
      return code;

    } catch (error) {
      log('OrchestratorTemp', `Erreur API: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * Attend la validation de l'utilisateur avant réinjection
   */
  async waitForValidation(snapshotPath, modifiedPath) {
    section('5. Validation des modifications');
    
    console.log(`\n${COLORS.bright}Modifications prêtes !${COLORS.reset}`);
    console.log(`\nFichier modifié: ${COLORS.cyan}${modifiedPath}${COLORS.reset}`);
    console.log(`\nVoulez-vous:`);
    console.log(`  1. Réinjecter maintenant`);
    console.log(`  2. Réviser le fichier d'abord`);
    console.log(`  3. Annuler`);

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\nVotre choix [1/2/3]: ', async (answer) => {
        rl.close();

        if (answer === '1') {
          const result = await this.reinject(snapshotPath, modifiedPath);
          resolve(result);
        } else if (answer === '2') {
          console.log(`\nRévisez: ${modifiedPath}`);
          console.log(`Puis lancez: node lib/method-reinjector.cjs ${modifiedPath}\n`);
          resolve({ success: true, mode: 'review' });
        } else {
          console.log('\nAnnulé.\n');
          resolve({ success: false, cancelled: true });
        }
      });
    });
  }

  /**
   * Réinjecte les modifications
   */
  async reinject(snapshotPath, modifiedPath) {
    section('6. Réinjection des modifications');

    const reinjector = new MethodReinjector({
      backup: true,
      dryRun: false,
      verbose: this.options.verbose
    });

    const result = await reinjector.reinject(snapshotPath, modifiedPath);

    if (result.success) {
      log('OrchestratorTemp', '✅ Réinjection réussie !', 'success');
    } else {
      log('OrchestratorTemp', `⚠ Réinjection partielle: ${result.failedCount} échec(s)`, 'warning');
    }

    return result;
  }

  /**
   * Affiche l'aide
   */
  static showHelp() {
    console.log(`
${COLORS.bright}LOLVE Orchestrator - Mode Fichiers Temporaires${COLORS.reset}

Workflow:
  1. Analyse la requête et sélectionne les méthodes pertinentes
  2. Crée un snapshot + fichier temporaire pour édition
  3. Modifie via API Anthropic (optionnel) ou manuellement
  4. Réinjecte les modifications dans les fichiers sources

${COLORS.cyan}Usage:${COLORS.reset}
  node lib/orchestrator-temp.cjs [options] "votre requête"

${COLORS.cyan}Options:${COLORS.reset}
  --manual           Mode manuel uniquement (pas d'API)
  --auto-reinject    Réinjecte automatiquement après modification API
  --temp-dir DIR     Dossier temporaire (défaut: temp/)
  --verbose          Logs détaillés

${COLORS.cyan}Exemples:${COLORS.reset}
  # Avec API (génération automatique)
  node lib/orchestrator-temp.cjs "améliore Vertex.calculate"
  
  # Avec réinjection automatique
  node lib/orchestrator-temp.cjs --auto-reinject "refactor Orb.render"
  
  # Mode manuel
  node lib/orchestrator-temp.cjs --manual "optimise les calculs"

${COLORS.cyan}Workflow manuel:${COLORS.reset}
  1. node lib/orchestrator-temp.cjs "votre requête"
  2. Éditez temp/methods.js
  3. node lib/method-reinjector.cjs temp/methods.js
`);
  }
}

/**
 * Point d'entrée CLI
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    OrchestratorTemp.showHelp();
    process.exit(0);
  }

  // Parser les options
  const options = {
    useAPI: !args.includes('--manual'),
    autoReinject: args.includes('--auto-reinject'),
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
    console.error(`${COLORS.red}❌ Aucune requête spécifiée${COLORS.reset}`);
    console.log(`\nUsage: node lib/orchestrator-temp.cjs "votre requête"\n`);
    process.exit(1);
  }

  try {
    const orchestrator = await new OrchestratorTemp(options).init();
    const result = await orchestrator.run(query);

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
module.exports = { OrchestratorTemp };

// CLI
if (require.main === module) {
  main();
}
