#!/usr/bin/env node

/**
 * Orchestrator - Orchestration avec intégration API directe
 *
 * Génère un contexte optimisé avec extraction de méthodes pertinentes
 * et envoie directement à l'API Anthropic pour économiser les tokens.
 *
 * Optimisation: Envoie seulement les méthodes pertinentes (~95% d'économie de tokens)
 * au lieu des fichiers entiers.
 *
 * Options:
 *   --quick       : saute les propositions
 *   --output FILE : écrit le prompt dans un fichier
 *   --verbose     : logs détaillés
 *   --dry-run     : génère le prompt sans appeler l'API
 */

const fs = require('fs');
const path = require('path');
const { log, section, COLORS } = require('./utils/logger.cjs');
const { readJSON, writeFile } = require('./utils/file-utils.cjs');

// Import des agents
const { ContextAgent } = require('./context-agent.cjs');
const { CacheAgent } = require('./cache-agent.cjs');
const { PreprocessAgent } = require('./preprocess-agent.cjs');
const { AnalysisAgent } = require('./analysis-agent.cjs');
const { ProposalAgent } = require('./proposal-agent.cjs');
const { AIClient } = require('./ai-client.cjs');

class Orchestrator {
  constructor(options = {}) {
    this.options = {
      quick: false,
      output: null,
      verbose: false,
      dryRun: false,
      ...options
    };

    this.configPath = path.join(__dirname, 'agents.config.json');
    this.config = null;
    this.agents = {};
    this.aiClient = null;
  }

  /**
   * Initialise l'orchestrator et les agents nécessaires
   */
  async init() {
    section('LOLVE Agent System - API Mode');

    // Charger la configuration
    this.config = readJSON(this.configPath);
    if (!this.config) {
      throw new Error('Configuration non trouvée: agents.config.json');
    }

    log('Orchestrator', 'Initialisation des agents...');

    // Initialiser les agents
    this.agents = {
      context: await new ContextAgent(this.config).init(),
      cache: await new CacheAgent(this.config).init(),
      preprocess: await new PreprocessAgent(this.config).init(),
      analysis: await new AnalysisAgent(this.config).init(),
      proposal: await new ProposalAgent(this.config).init()
    };

    // Initialiser le client API
    this.aiClient = new AIClient();

    log('Orchestrator', 'Agents initialisés', 'success');

    // Vérifier l'API (sauf en dry-run)
//     if (!this.options.dryRun) {
//       if (!this.aiClient.isAvailable()) {
//         throw new Error(`
// ❌ API Anthropic requise !
//
// Votre système d'optimisation par méthode nécessite l'API directe.
//
// Solution: Définissez ANTHROPIC_API_KEY dans un fichier .env à la racine du projet:
//   ANTHROPIC_API_KEY=sk-ant-votre-clé-ici
//
// Pour obtenir une clé API: https://console.anthropic.com
//
// Note: L'optimisation par méthode réduit la consommation de tokens de ~95%,
//       rendant l'utilisation de l'API très économique.
//         `);
//       }
//       log('Orchestrator', '✓ API Anthropic disponible', 'success');
//     }

    return this;
  }

  /**
   * Exécute l'analyse et génère le prompt optimisé
   */
  async run(query) {
    try {
      // 1. Vérifier le cache
      // if (this.config.agents.cache.enabled) {
      //   const cached = this.agents.cache.find(query);
      //   if (cached.hit) {
      //     log('Orchestrator', `Question similaire trouvée en cache (${(cached.similarity * 100).toFixed(0)}%)`, 'success');
      //     console.log(`\n${COLORS.dim}Réponse précédente:${COLORS.reset}`);
      //     console.log(cached.entry.response.substring(0, 500) + '...\n');
      //
      //     // Demander si on continue quand même
      //     console.log('Voulez-vous continuer avec une nouvelle analyse ? [o/N]');
      //     // Pour l'instant on continue automatiquement
      //   }
      // }

      // 2. Prétraitement de la requête
      const preprocessed = this.agents.preprocess.process(query);
      log('Orchestrator', `Requête traitée: "${preprocessed.cleaned}"`, 'info');

      // 3. Recherche de méthodes pertinentes (pas fichiers entiers !)
      section('Recherche de méthodes pertinentes');
      const searchSession = this.agents.context.createSearchSession(preprocessed.cleaned);
      
      const methodCount = searchSession.keys.length;
      log('Orchestrator', `${methodCount} méthode(s) pertinente(s) trouvée(s)`, 'success');

      // Afficher les méthodes trouvées
      if (this.options.verbose) {
        const results = searchSession.getAtLevel(1);
        results.slice(0, 10).forEach(r => {
          console.log(`  - ${r.key} (${r.role}) - score: ${r.score.toFixed(2)}`);
        });
        if (results.length > 10) {
          console.log(`  ... et ${results.length - 10} autres`);
        }
      }

      // 4. Analyse
      const context = {
        methodCount,
        methods: searchSession.getAtLevel(2), // Avec signatures
        detectedCategory: this.agents.context.detectQueryCategory(query.toLowerCase())
      };
      
      const analysis = await this.agents.analysis.analyze(preprocessed, context);

      // 5. Propositions (sauf mode quick)
      let selectedProposal = null;
      let proposals = null;

      if (!this.options.quick) {
        proposals = await this.agents.proposal.generateProposals(analysis, context);
        await this.agents.proposal.displayProposals(proposals);

        const validation = await this.agents.proposal.requestValidation(proposals);

        if (!validation.approved) {
          log('Orchestrator', 'Annulé', 'warning');
          return { cancelled: true };
        }

        selectedProposal = this.agents.proposal.getSelectedProposal(proposals, validation.selected);
      }

      // 6. Extraire le code des méthodes pertinentes (granularité maximale !)
      section('Extraction du code des méthodes');
      const methodsWithCode = this.extractMethodsCode(searchSession, { 
        maxMethods: 10 // Limiter pour éviter de surcharger
      });
      
      log('Orchestrator', `${methodsWithCode.length} méthode(s) extraite(s)`, 'success');

      // 7. Générer le prompt optimisé
      const optimizedPrompt = this.buildOptimizedPrompt(
        query, 
        preprocessed, 
        analysis, 
        selectedProposal, 
        methodsWithCode,
        context
      );

      // 8. Estimer les tokens
      const tokenEstimate = Math.ceil(optimizedPrompt.length / 4); // Approximation
      log('Orchestrator', `Tokens estimés: ~${tokenEstimate}`, 'info');

      // 9. Mode dry-run : afficher le prompt sans appeler l'API
      if (this.options.dryRun) {
        this.outputPrompt(optimizedPrompt, analysis, tokenEstimate);
        return {
          success: true,
          prompt: optimizedPrompt,
          analysis,
          proposal: selectedProposal,
          dryRun: true
        };
      }

      // 10. Appeler l'API
      const result = await this.executeViaAPI(optimizedPrompt, analysis);

      // 11. Sauvegarder dans le cache si succès
      if (this.config.agents.cache.enabled && result.success) {
        this.agents.cache.store(query, result.response);
        this.agents.cache.save();
      }

      // 12. Sauvegarder si demandé
      if (this.options.output) {
        const outputPath = path.resolve(this.options.output);
        const output = `# Requête\n${query}\n\n# Réponse\n${result.response}`;
        writeFile(outputPath, output);
        log('Orchestrator', `Sauvegardé: ${outputPath}`, 'success');
      }

      return result;

    } catch (error) {
      log('Orchestrator', `Erreur: ${error.message}`, 'error');
      if (this.options.verbose) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  /**
   * Extrait le code des méthodes pertinentes
   */
  extractMethodsCode(searchSession, options = {}) {
    const { maxMethods = 10 } = options;
    
    // Prendre les méthodes avec les meilleurs scores
    const topMethods = searchSession.keys.slice(0, maxMethods);
    const methodsWithCode = [];

    for (const key of topMethods) {
      const code = this.agents.context.methodIndexer.extractMethodCode(key);
      const methodData = this.agents.context.methodIndexer.index.methods[key];
      
      if (code && methodData) {
        methodsWithCode.push({
          key,
          file: methodData.file,
          class: methodData.class,
          signature: methodData.signature,
          role: methodData.role,
          description: methodData.description,
          effects: methodData.effects,
          consumers: methodData.consumers,
          code
        });
      }
    }

    return methodsWithCode;
  }

  /**
   * Construit le prompt optimisé avec méthodes extraites
   */
  buildOptimizedPrompt(originalQuery, preprocessed, analysis, proposal, methodsWithCode, context) {
    const parts = [];

    // En-tête contexte
    parts.push(`# Contexte LOLVE`);
    parts.push(`Catégorie détectée: ${context.detectedCategory || 'général'}`);

    if (preprocessed.detectedTerms.length > 0) {
      parts.push(`Termes domain: ${preprocessed.detectedTerms.map(t => t.term).join(', ')}`);
    }

    // Méthodes pertinentes avec leur code
    if (methodsWithCode.length > 0) {
      parts.push(`\n# Méthodes pertinentes\n`);
      parts.push(`${methodsWithCode.length} méthode(s) sélectionnée(s) par analyse sémantique:\n`);
      
      for (const method of methodsWithCode) {
        parts.push(`## ${method.key}`);
        parts.push(`Fichier: ${method.file}`);
        parts.push(`Rôle: ${method.role || 'non spécifié'}`);
        
        if (method.description) {
          parts.push(`Description: ${method.description}`);
        }
        
        if (method.effects && Object.keys(method.effects).length > 0) {
          parts.push(`Effets: ${Object.entries(method.effects).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}`);
        }
        
        if (method.consumers && method.consumers.length > 0) {
          parts.push(`Appelée par: ${method.consumers.join(', ')}`);
        }
        
        parts.push(`\n\`\`\`javascript`);
        parts.push(`// ${method.signature}`);
        parts.push(method.code);
        parts.push(`\`\`\`\n`);
      }
    }

    // Analyse
    parts.push(`# Analyse`);
    parts.push(`- Type: ${analysis.summary.type}`);
    parts.push(`- Complexité: ${analysis.complexity.label}`);

    if (analysis.risks.length > 0) {
      parts.push(`- Risques: ${analysis.risks.map(r => r.description).join(', ')}`);
    }

    // Approche choisie
    if (proposal) {
      parts.push(`\n# Approche choisie`);
      parts.push(`**${proposal.title}**`);
      parts.push(proposal.description);
      if (proposal.snippet) {
        parts.push(`\nExemple:\n\`\`\`javascript\n${proposal.snippet}\n\`\`\``);
      }
    }

    // Requête
    parts.push(`\n# Requête`);
    parts.push(originalQuery);

    return parts.join('\n');
  }

  /**
   * Exécute via l'API Anthropic
   */
  async executeViaAPI(prompt, analysis) {
    section('Exécution via API Anthropic');

    try {
      const result = await this.aiClient.sendMessage(prompt, {
        maxTokens: 8000,
        useCache: true,
        systemPrompt: `Tu es un expert en développement JavaScript et en architecture de code.
Tu travailles sur le projet LOLVE, une bibliothèque de géométrie et de tessellation.

Ton rôle:
- Analyser le code fourni avec précision
- Proposer des solutions élégantes et maintenables
- Respecter les patterns existants du projet
- Fournir du code fonctionnel et testé

Important:
- Le code fourni a été sélectionné automatiquement par analyse sémantique
- Concentre-toi sur les méthodes fournies, elles sont les plus pertinentes
- Si tu as besoin de plus de contexte, demande explicitement`
      });

      console.log('\n' + COLORS.bright + '═'.repeat(60) + COLORS.reset);
      console.log(COLORS.bright + ' RÉPONSE CLAUDE' + COLORS.reset);
      console.log(COLORS.bright + '═'.repeat(60) + COLORS.reset + '\n');
      console.log(result.content);
      console.log('\n' + COLORS.dim + '─'.repeat(60) + COLORS.reset);
      console.log(COLORS.dim + `Tokens: ${result.usage.input_tokens} in, ${result.usage.output_tokens} out`);
      
      if (result.usage.cache_read_input_tokens) {
        console.log(COLORS.dim + `Cache: ${result.usage.cache_read_input_tokens} tokens réutilisés`);
      }
      
      console.log(COLORS.dim + `Modèle: ${result.model}` + COLORS.reset);
      console.log(COLORS.dim + '─'.repeat(60) + COLORS.reset + '\n');

      return {
        success: true,
        response: result.content,
        usage: result.usage,
        analysis
      };

    } catch (error) {
      if (error.message === 'WEEKLY_LIMIT_REACHED') {
        log('Orchestrator', '⚠️  Limite hebdomadaire atteinte', 'error');
        log('Orchestrator', 'Réessayez après la réinitialisation hebdomadaire', 'warning');
      }
      throw error;
    }
  }

  /**
   * Affiche le prompt (mode dry-run)
   */
  outputPrompt(prompt, analysis, tokenEstimate) {
    section('Prompt optimisé (mode dry-run)');

    console.log(COLORS.cyan + '┌' + '─'.repeat(78) + '┐' + COLORS.reset);
    const lines = prompt.split('\n');
    for (const line of lines) {
      const truncated = line.substring(0, 77);
      console.log(COLORS.cyan + '│' + COLORS.reset + ' ' + truncated.padEnd(77) + COLORS.cyan + '│' + COLORS.reset);
    }
    console.log(COLORS.cyan + '└' + '─'.repeat(78) + '┘' + COLORS.reset);
    
    console.log(`\n${COLORS.dim}Tokens estimés: ~${tokenEstimate}${COLORS.reset}`);
    console.log(`${COLORS.dim}Pour exécuter: relancez sans --dry-run${COLORS.reset}\n`);

    if (this.options.output) {
      const outputPath = path.resolve(this.options.output);
      writeFile(outputPath, prompt);
      log('Orchestrator', `Prompt sauvegardé: ${outputPath}`, 'success');
    }
  }

  /**
   * Affiche l'aide
   */
  static showHelp() {
    console.log(`
${COLORS.bright}LOLVE Agent System - API Mode${COLORS.reset}
Génère un contexte optimisé et l'envoie directement à l'API Anthropic.

${COLORS.cyan}Optimisation:${COLORS.reset}
  - Extraction automatique des méthodes pertinentes uniquement
  - Économie de ~95% de tokens vs fichiers entiers
  - Prompt caching pour réutiliser le contexte système

${COLORS.cyan}Usage:${COLORS.reset}
  node orchestrator.cjs [options] "votre requête"

${COLORS.cyan}Options:${COLORS.reset}
  --quick       Saute les propositions d'approches
  --output FILE Sauvegarde le prompt et la réponse dans un fichier
  --verbose     Logs détaillés
  --dry-run     Génère et affiche le prompt sans appeler l'API

${COLORS.cyan}Configuration:${COLORS.reset}
  Créez un fichier .env à la racine du projet:
    ANTHROPIC_API_KEY=sk-ant-votre-clé-ici

  Obtenez une clé API: https://console.anthropic.com

${COLORS.cyan}Exemples:${COLORS.reset}
  node lib/orchestrator.cjs "ajoute une fonction pour calculer l'aire"
  node lib/orchestrator.cjs --quick "corrige le bug dans Vertex"
  node lib/orchestrator.cjs --dry-run "refactor la classe Rosa"
  node lib/orchestrator.cjs --output response.md "optimise le rendu"

${COLORS.cyan}Workflow:${COLORS.reset}
  1. L'orchestrator analyse votre requête
  2. Les agents sélectionnent les méthodes pertinentes
  3. Le code des méthodes est extrait (granularité maximale)
  4. Le tout est envoyé à l'API Anthropic
  5. La réponse est affichée et optionnellement sauvegardée
`);
  }
}

/**
 * Point d'entrée CLI
 */
async function main() {
  const args = process.argv.slice(2);

  // Parser les options
  const options = {
    quick: args.includes('--quick'),
    verbose: args.includes('--verbose'),
    dryRun: args.includes('--dry-run')
  };

  // Parser --output FILE
  const outputIndex = args.indexOf('--output');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    options.output = args[outputIndex + 1];
  }

  // Filtrer les arguments pour obtenir la requête
  const query = args.filter((a, i) => {
    if (a.startsWith('--')) return false;
    if (i > 0 && args[i - 1] === '--output') return false;
    return true;
  }).join(' ');

  if (!query || args.includes('--help') || args.includes('-h')) {
    Orchestrator.showHelp();
    process.exit(0);
  }

  try {
    const orchestrator = await new Orchestrator(options).init();
    const result = await orchestrator.run(query);

    if (result.cancelled) {
      process.exit(1);
    }

    // Afficher les statistiques d'utilisation
    if (!options.dryRun) {
      orchestrator.aiClient.displayStats();
    }

    process.exit(0);
  } catch (error) {
    console.error(`${COLORS.red}Erreur:${COLORS.reset}`, error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Export pour utilisation comme module
module.exports = { Orchestrator };

// Exécution CLI
if (require.main === module) {
  main();
}
