#!/usr/bin/env node

/**
 * Smart Claude - Wrapper intelligent pour Claude Code
 * 
 * Intercepte la question, prépare le contexte optimisé,
 * puis passe à Claude Code avec SEULEMENT le fichier temp.
 * 
 * Usage: smart-claude "améliore Vertex.calculate"
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ExtractForClaude } = require('./extract-for-claude.cjs');

class SmartClaude {
  constructor(options = {}) {
    this.options = {
      tempDir: 'temp',
      claudeCodePath: 'claude',  // ou chemin complet si nécessaire
      verbose: false,
      ...options
    };
  }

  /**
   * Exécute le workflow complet
   */
  async run(userQuery) {
    console.log('\n🧠 Smart Claude - Préparation du contexte optimal...\n');

    try {
      // 1. Extraire les méthodes pertinentes
      console.log('📦 Extraction des méthodes pertinentes...');
      
      const extractor = await new ExtractForClaude({
        tempDir: this.options.tempDir,
        autoReinject: false  // On réinjectera après Claude Code
      }).init();

      // Extraire sans attendre validation
      const tempPath = path.join(this.options.tempDir, 'methods.js');
      const snapshotPath = path.join(this.options.tempDir, 'snapshot.json');

      await this.extractOnly(extractor, userQuery);

      if (!fs.existsSync(tempPath)) {
        console.error('❌ Échec de l\'extraction');
        process.exit(1);
      }

      console.log(`✓ Méthodes extraites dans: ${tempPath}\n`);

      // 2. Préparer la commande pour Claude Code
      const claudeQuery = this.prepareClaudeQuery(userQuery, tempPath);

      // 3. Lancer Claude Code avec SEULEMENT le fichier temp
      console.log('🤖 Lancement de Claude Code...\n');
      console.log(`📝 Contexte: ${tempPath} uniquement`);
      console.log(`💬 Question: "${claudeQuery}"\n`);

      await this.runClaudeCode(claudeQuery, tempPath);

      // 4. Réinjecter automatiquement
      console.log('\n🔄 Réinjection des modifications...\n');
      
      const { MethodReinjector } = require('./method-reinjector.cjs');
      const reinjector = new MethodReinjector({
        backup: true,
        verbose: this.options.verbose
      });

      const result = await reinjector.reinject(snapshotPath, tempPath);

      if (result.success) {
        console.log('\n✅ Modifications réinjectées avec succès !\n');
      } else {
        console.log(`\n⚠️  Réinjection partielle: ${result.failedCount} échec(s)\n`);
      }

      return result;

    } catch (error) {
      console.error(`\n❌ Erreur: ${error.message}\n`);
      if (this.options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Extrait sans attendre validation
   */
  async extractOnly(extractor, query) {
    const preprocessed = extractor.agents.preprocess.process(query);
    const searchSession = extractor.agents.context.createSearchSession(preprocessed.cleaned);
    
    if (searchSession.keys.length === 0) {
      throw new Error('Aucune méthode trouvée');
    }

    const { MethodSnapshot } = require('./method-snapshot.cjs');
    const snapshot = new MethodSnapshot();
    const snapshotData = snapshot.capture(searchSession.keys);
    
    const snapshotPath = path.join(extractor.options.tempDir, 'snapshot.json');
    snapshot.save(snapshotData, snapshotPath);

    const tempContent = snapshot.generateTempFile(snapshotData, {
      includeContext: true,
      groupByClass: true
    });

    const tempPath = path.join(extractor.options.tempDir, 'methods.js');
    fs.writeFileSync(tempPath, tempContent, 'utf-8');

    // Afficher les méthodes extraites
    console.log(`\n   ${searchSession.keys.length} méthode(s) extraite(s):`);
    searchSession.keys.slice(0, 5).forEach(key => {
      console.log(`   - ${key}`);
    });
    if (searchSession.keys.length > 5) {
      console.log(`   ... et ${searchSession.keys.length - 5} autres`);
    }
    console.log();
  }

  /**
   * Prépare la question pour Claude Code
   */
  prepareClaudeQuery(originalQuery, tempPath) {
    // Adapter la question pour qu'elle soit claire pour Claude Code
    return `${originalQuery}

Contexte: Tu travailles sur le fichier ${tempPath} qui contient des méthodes extraites d'un projet plus large.

Instructions importantes:
1. Modifie UNIQUEMENT les méthodes dans ce fichier
2. Conserve EXACTEMENT les commentaires de structure (// Méthode:, // Fichier:)
3. Ne change PAS les noms de méthodes
4. Les modifications seront automatiquement réinjectées dans les fichiers sources

Le fichier contient toute l'information nécessaire. Ne demande pas de contexte supplémentaire.`;
  }

  /**
   * Lance Claude Code avec le fichier en contexte
   */
  async runClaudeCode(query, tempPath) {
    return new Promise((resolve, reject) => {
      // Lancer Claude Code avec le fichier en contexte
      const args = [
        query,
        '--file', tempPath  // Passer explicitement le fichier
      ];

      const claudeProcess = spawn(this.options.claudeCodePath, args, {
        stdio: 'inherit',
        shell: true
      });

      claudeProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Claude Code a quitté avec le code ${code}`));
        }
      });

      claudeProcess.on('error', (error) => {
        reject(new Error(`Erreur lors du lancement de Claude Code: ${error.message}`));
      });
    });
  }

  /**
   * Affiche l'aide
   */
  static showHelp() {
    console.log(`
Smart Claude - Wrapper intelligent pour Claude Code

Automatise le workflow complet:
  1. Extrait automatiquement les méthodes pertinentes
  2. Lance Claude Code avec SEULEMENT le fichier temp
  3. Réinjecte automatiquement après modification

Usage:
  smart-claude "votre question"

Options:
  --temp-dir DIR     Dossier temporaire (défaut: temp/)
  --claude-path PATH Chemin vers Claude Code (défaut: claude)
  --verbose          Logs détaillés
  --help             Affiche cette aide

Exemples:
  smart-claude "améliore Vertex.calculate"
  smart-claude "refactor les méthodes de Orb"
  smart-claude "optimise les performances"

Différence avec extract-for-claude:
  extract-for-claude : Workflow manuel avec pause
  smart-claude       : Workflow automatique complet
`);
  }
}

/**
 * Point d'entrée CLI
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    SmartClaude.showHelp();
    process.exit(0);
  }

  // Parser les options
  const options = {
    verbose: args.includes('--verbose')
  };

  const tempDirIdx = args.indexOf('--temp-dir');
  if (tempDirIdx !== -1 && args[tempDirIdx + 1]) {
    options.tempDir = args[tempDirIdx + 1];
  }

  const claudePathIdx = args.indexOf('--claude-path');
  if (claudePathIdx !== -1 && args[claudePathIdx + 1]) {
    options.claudeCodePath = args[claudePathIdx + 1];
  }

  // Extraire la requête
  const query = args.filter((a, i) => {
    if (a.startsWith('--')) return false;
    if (i > 0 && args[i - 1].startsWith('--')) return false;
    return true;
  }).join(' ');

  if (!query) {
    console.error('\n❌ Aucune question spécifiée\n');
    console.log('Usage: smart-claude "votre question"\n');
    process.exit(1);
  }

  const smart = new SmartClaude(options);
  await smart.run(query);
}

// Export
module.exports = { SmartClaude };

// CLI
if (require.main === module) {
  main();
}
