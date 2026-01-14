#!/usr/bin/env node

/**
 * Orchestrator - Prépare le contexte pour Claude Code
 *
 * Génère un prompt optimisé avec analyse et propositions.
 * Pas d'API externe - le résultat est à donner à Claude Code.
 *
 * Options:
 *   --quick       : saute les propositions
 *   --output      : écrit le prompt dans un fichier
 *   --clipboard   : copie dans le presse-papier (si disponible)
 *   --verbose     : logs détaillés
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

class Orchestrator {
  constructor(options = {}) {
    this.options = {
      quick: false,
      output: null,
      clipboard: false,
      verbose: false,
      ...options
    };

    this.configPath = path.join(__dirname, 'agents.config.json');
    this.config = null;
    this.agents = {};
  }

  /**
   * Initialise l'orchestrator et les agents nécessaires
   */
  async init() {
    section('LOLVE Agent System');

    // Charger la configuration
    this.config = readJSON(this.configPath);
    if (!this.config) {
      throw new Error('Configuration non trouvée: agents.config.json');
    }

    log('Orchestrator', 'Initialisation des agents...');

    // Initialiser les agents (pas besoin de CodeAgent/TestAgent ici)
    this.agents = {
      context: await new ContextAgent(this.config).init(),
      cache: await new CacheAgent(this.config).init(),
      preprocess: await new PreprocessAgent(this.config).init(),
      analysis: await new AnalysisAgent(this.config).init(),
      proposal: await new ProposalAgent(this.config).init()
    };

    log('Orchestrator', 'Agents initialisés', 'success');

    return this;
  }

  /**
   * Exécute l'analyse et génère le prompt optimisé
   */
  async run(query) {
    try {
      // 1. Vérifier le cache
      if (this.config.agents.cache.enabled) {
        const cached = this.agents.cache.find(query);
        if (cached.hit) {
          log('Orchestrator', `Question similaire trouvée en cache (${(cached.similarity * 100).toFixed(0)}%)`, 'success');
          console.log(`\n${COLORS.dim}Réponse précédente:${COLORS.reset}`);
          console.log(cached.entry.response.substring(0, 500) + '...\n');
        }
      }

      // 2. Prétraitement de la requête
      const preprocessed = this.agents.preprocess.process(query);

      // 3. Recherche de contexte
      const relevantFiles = this.agents.context.findRelevantFiles(query);
      const context = {
        relevantFiles,
        detectedCategory: this.agents.context.detectQueryCategory(query.toLowerCase())
      };

      // 4. Analyse
      const analysis = await this.agents.analysis.analyze(preprocessed, context);

      // 5. Propositions (sauf mode quick)
      let selectedProposal = null;
      let proposals = null;

      if (!this.options.quick) {
        proposals = await this.agents.proposal.generateProposals(analysis, context);
        await this.agents.proposal.displayProposals(proposals);

        // Demander quelle approche
        const validation = await this.agents.proposal.requestValidation(proposals);

        if (!validation.approved) {
          log('Orchestrator', 'Annulé', 'warning');
          return { cancelled: true };
        }

        selectedProposal = this.agents.proposal.getSelectedProposal(proposals, validation.selected);
      }

      // 6. Générer le prompt optimisé pour Claude Code
      const optimizedPrompt = this.buildOptimizedPrompt(query, preprocessed, analysis, selectedProposal, context);

      // 7. Afficher ou sauvegarder
      this.outputResult(optimizedPrompt, analysis);

      return {
        success: true,
        prompt: optimizedPrompt,
        analysis,
        proposal: selectedProposal
      };

    } catch (error) {
      log('Orchestrator', `Erreur: ${error.message}`, 'error');
      if (this.options.verbose) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  /**
   * Construit le prompt optimisé pour Claude Code
   */
  buildOptimizedPrompt(originalQuery, preprocessed, analysis, proposal, context) {
    const parts = [];

    // En-tête contexte
    parts.push(`# Contexte LOLVE`);
    parts.push(`Catégorie détectée: ${context.detectedCategory || 'général'}`);

    if (preprocessed.detectedTerms.length > 0) {
      parts.push(`Termes domain: ${preprocessed.detectedTerms.map(t => t.term).join(', ')}`);
    }

    // Fichiers pertinents
    if (context.relevantFiles.length > 0) {
      parts.push(`\nFichiers pertinents:`);
      context.relevantFiles.slice(0, 5).forEach(f => {
        parts.push(`- ${f.info.path} (${f.info.category})`);
      });
    }

    // Analyse
    parts.push(`\n# Analyse`);
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
   * Affiche ou sauvegarde le résultat
   */
  outputResult(prompt, analysis) {
    section('Prompt optimisé pour Claude Code');

    // Afficher le prompt
    console.log(COLORS.cyan + '┌' + '─'.repeat(58) + '┐' + COLORS.reset);
    prompt.split('\n').forEach(line => {
      console.log(COLORS.cyan + '│' + COLORS.reset + ' ' + line.padEnd(57) + COLORS.cyan + '│' + COLORS.reset);
    });
    console.log(COLORS.cyan + '└' + '─'.repeat(58) + '┘' + COLORS.reset);

    // Sauvegarder si demandé
    if (this.options.output) {
      const outputPath = path.resolve(this.options.output);
      writeFile(outputPath, prompt);
      log('Orchestrator', `Prompt sauvegardé: ${outputPath}`, 'success');
    }

    // Copier dans le presse-papier si demandé
    if (this.options.clipboard) {
      try {
        const { execSync } = require('child_process');
        // Windows
        execSync(`echo ${JSON.stringify(prompt)} | clip`, { stdio: 'pipe' });
        log('Orchestrator', 'Copié dans le presse-papier', 'success');
      } catch {
        log('Orchestrator', 'Impossible de copier dans le presse-papier', 'warning');
      }
    }

    console.log(`\n${COLORS.bright}Copiez ce prompt et donnez-le à Claude Code.${COLORS.reset}\n`);
  }

  /**
   * Affiche l'aide
   */
  static showHelp() {
    console.log(`
${COLORS.bright}LOLVE Agent System${COLORS.reset}
Prépare un contexte optimisé pour Claude Code.

${COLORS.cyan}Usage:${COLORS.reset}
  node orchestrator.js [options] "votre requête"

${COLORS.cyan}Options:${COLORS.reset}
  --quick       Saute les propositions d'approches
  --output FILE Sauvegarde le prompt dans un fichier
  --clipboard   Copie le prompt dans le presse-papier
  --verbose     Logs détaillés

${COLORS.cyan}Exemples:${COLORS.reset}
  node agents/orchestrator.js "ajoute une fonction pour calculer l'aire"
  node agents/orchestrator.js --quick "corrige le bug dans Trigo.js"
  node agents/orchestrator.js --output prompt.md "refactor Rosa"

${COLORS.cyan}Workflow:${COLORS.reset}
  1. Lancez l'orchestrator avec votre requête
  2. Choisissez une approche (si pas --quick)
  3. Copiez le prompt généré
  4. Donnez-le à Claude Code
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
    clipboard: args.includes('--clipboard'),
    verbose: args.includes('--verbose')
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

    process.exit(0);
  } catch (error) {
    console.error(`${COLORS.red}Erreur:${COLORS.reset}`, error.message);
    process.exit(1);
  }
}

// Export pour utilisation comme module
module.exports = { Orchestrator };

// Exécution CLI
if (require.main === module) {
  main();
}
