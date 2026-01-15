#!/usr/bin/env node

/**
 * MonitoringAgent - Génère des dashboards de visualisation pour l'indexation
 *
 * Utilise l'API Anthropic pour créer des interfaces HTML interactives
 * permettant de visualiser l'état de l'indexation des méthodes.
 */

// Charger les variables d'environnement depuis .env
require('./env-loader.cjs');

const fs = require('fs');
const path = require('path');
const { log, section, COLORS } = require('./utils/logger.cjs');
const { MethodIndexer, AnnotationCache } = require('./method-indexer.cjs');
const { AIClient } = require('./ai-client.cjs');

class MonitoringAgent {
  constructor(options = {}) {
    this.methodIndexer = new MethodIndexer();
    this.annotationCache = new AnnotationCache();
    this.aiClient = new AIClient();
    this.outputDir = options.outputDir || path.join(process.cwd(), 'monitoring');
  }

  /**
   * Initialise l'agent
   */
  async init() {
    section('Monitoring Agent');

    // Charger les index
    this.methodIndexer.loadIndex();
    this.annotationCache.load();

    const methodCount = Object.keys(this.methodIndexer.index.methods || {}).length;
    log('MonitoringAgent', `${methodCount} méthode(s) indexée(s)`, 'info');

    // Vérifier l'API
    if (!this.aiClient.isAvailable()) {
      log('MonitoringAgent', '⚠️  API non disponible - mode données uniquement', 'warning');
    }

    return this;
  }

  /**
   * Collecte les statistiques d'indexation
   */
  collectStats() {
    const methods = Object.entries(this.methodIndexer.index.methods || {});
    const classes = Object.values(this.methodIndexer.index.classes || {});
    const files = Object.keys(this.methodIndexer.index.files || {});

    const stats = {
      overview: {
        totalMethods: methods.length,
        totalClasses: classes.length,
        totalFiles: files.length
      },
      byRole: {},
      byFile: {},
      byClass: {},
      annotations: {
        withDescription: 0,
        withEffects: 0,
        withConsumers: 0,
        complete: 0,
        partial: 0,
        missing: 0
      }
    };

    // Analyser chaque méthode
    for (const [key, method] of methods) {
      // Par rôle
      const role = method.role || 'unknown';
      stats.byRole[role] = (stats.byRole[role] || 0) + 1;

      // Par fichier
      stats.byFile[method.file] = (stats.byFile[method.file] || 0) + 1;

      // Par classe
      if (method.class) {
        stats.byClass[method.class] = (stats.byClass[method.class] || 0) + 1;
      }

      // Annotations
      if (method.description) stats.annotations.withDescription++;
      if (method.effects && Object.keys(method.effects).length > 0) stats.annotations.withEffects++;
      if (method.consumers && method.consumers.length > 0) stats.annotations.withConsumers++;

      // Complétude
      const annotationStatus = this.methodIndexer.getAnnotationStatus(key, this.annotationCache);
      stats.annotations[annotationStatus]++;
    }

    return stats;
  }

  /**
   * Prépare les données pour la visualisation
   */
  prepareVisualizationData() {
    const methods = Object.entries(this.methodIndexer.index.methods || {}).map(([key, data]) => ({
      key,
      file: data.file,
      class: data.class,
      name: data.name,
      signature: data.signature,
      role: data.role || 'unknown',
      description: data.description || '',
      hasEffects: data.effects && Object.keys(data.effects).length > 0,
      hasConsumers: data.consumers && data.consumers.length > 0,
      effectsCount: data.effects ? Object.keys(data.effects).length : 0,
      consumersCount: data.consumers ? data.consumers.length : 0,
      line: data.line,
      isStatic: data.isStatic || false,
      isPrivate: data.isPrivate || false,
      annotationStatus: this.methodIndexer.getAnnotationStatus(key, this.annotationCache)
    }));

    const stats = this.collectStats();

    return {
      methods,
      stats,
      metadata: {
        generated: new Date().toISOString(),
        totalMethods: methods.length,
        indexGenerated: this.methodIndexer.index.generated
      }
    };
  }

  /**
   * Génère un dashboard HTML avec l'API
   */
  async generateDashboard(options = {}) {
    section('Génération du dashboard');

    if (!this.aiClient.isAvailable()) {
      throw new Error('API Anthropic requise pour générer le dashboard');
    }

    // Préparer les données
    const data = this.prepareVisualizationData();
    log('MonitoringAgent', `${data.methods.length} méthodes à visualiser`, 'info');

    // Générer le dashboard via l'API
    log('MonitoringAgent', 'Génération du HTML avec Claude...', 'info');

    const result = await this.aiClient.generateMonitoring(this.methodIndexer.index, {
      maxTokens: 8000
    });

    log('MonitoringAgent', '✓ Dashboard généré', 'success');

    // Sauvegarder
    const outputPath = path.join(this.outputDir, 'dashboard.html');

    // Créer le dossier si nécessaire
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, result.content, 'utf-8');
    log('MonitoringAgent', `Dashboard sauvegardé: ${outputPath}`, 'success');

    return {
      path: outputPath,
      size: result.content.length,
      usage: result.usage
    };
  }

  /**
   * Génère un rapport JSON simple (sans API)
   */
  async generateReport(options = {}) {
    section('Génération du rapport JSON');

    const data = this.prepareVisualizationData();
    const outputPath = path.join(this.outputDir, 'report.json');

    // Créer le dossier si nécessaire
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
    log('MonitoringAgent', `Rapport sauvegardé: ${outputPath}`, 'success');

    // Afficher les statistiques
    this.displayStats(data.stats);

    return {
      path: outputPath,
      data
    };
  }

  /**
   * Affiche les statistiques dans la console
   */
  displayStats(stats) {
    console.log('\n📊 Statistiques du projet');
    console.log('─'.repeat(60));

    console.log('\n' + COLORS.bright + 'Vue d\'ensemble:' + COLORS.reset);
    console.log(`  Méthodes:  ${stats.overview.totalMethods}`);
    console.log(`  Classes:   ${stats.overview.totalClasses}`);
    console.log(`  Fichiers:  ${stats.overview.totalFiles}`);

    console.log('\n' + COLORS.bright + 'Distribution par rôle:' + COLORS.reset);
    const sortedRoles = Object.entries(stats.byRole)
        .sort((a, b) => b[1] - a[1]);
    for (const [role, count] of sortedRoles) {
      const bar = '█'.repeat(Math.ceil(count / stats.overview.totalMethods * 30));
      console.log(`  ${role.padEnd(12)} ${count.toString().padStart(4)} ${COLORS.dim}${bar}${COLORS.reset}`);
    }

    console.log('\n' + COLORS.bright + 'État des annotations:' + COLORS.reset);
    const annotPercentage = ((stats.annotations.complete / stats.overview.totalMethods) * 100).toFixed(1);
    console.log(`  Complètes:      ${stats.annotations.complete} (${annotPercentage}%)`);
    console.log(`  Partielles:     ${stats.annotations.partial}`);
    console.log(`  Manquantes:     ${stats.annotations.missing}`);
    console.log(`  Obsolètes:      ${stats.annotations.outdated}`);

    console.log('\n' + COLORS.bright + 'Métadonnées:' + COLORS.reset);
    console.log(`  Descriptions:   ${stats.annotations.withDescription}`);
    console.log(`  Effets:         ${stats.annotations.withEffects}`);
    console.log(`  Consommateurs:  ${stats.annotations.withConsumers}`);

    console.log('\n' + COLORS.bright + 'Top 10 fichiers:' + COLORS.reset);
    const sortedFiles = Object.entries(stats.byFile)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    for (const [file, count] of sortedFiles) {
      const basename = path.basename(file);
      console.log(`  ${basename.padEnd(25)} ${count.toString().padStart(3)} méthode(s)`);
    }

    console.log('\n─'.repeat(60) + '\n');
  }

  /**
   * Affiche l'aide
   */
  static showHelp() {
    console.log(`
${COLORS.bright}Monitoring Agent${COLORS.reset}
Génère des dashboards et rapports pour visualiser l'indexation.

${COLORS.cyan}Usage:${COLORS.reset}
  node lib/monitoring-agent.cjs [command] [options]

${COLORS.cyan}Commandes:${COLORS.reset}
  dashboard     Génère un dashboard HTML interactif (requiert API)
  report        Génère un rapport JSON (sans API)
  stats         Affiche les statistiques dans la console

${COLORS.cyan}Options:${COLORS.reset}
  --output-dir DIR   Dossier de sortie (défaut: ./monitoring)
  --help             Affiche cette aide

${COLORS.cyan}Configuration:${COLORS.reset}
  Pour générer le dashboard HTML, définissez:
    ANTHROPIC_API_KEY=sk-ant-votre-clé-ici

${COLORS.cyan}Exemples:${COLORS.reset}
  node lib/monitoring-agent.cjs stats
  node lib/monitoring-agent.cjs report
  node lib/monitoring-agent.cjs dashboard
  node lib/monitoring-agent.cjs dashboard --output-dir ./reports
`);
  }
}

/**
 * Point d'entrée CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    MonitoringAgent.showHelp();
    process.exit(0);
  }

  // Parser les options
  const options = {};
  const outputDirIdx = args.indexOf('--output-dir');
  if (outputDirIdx !== -1 && args[outputDirIdx + 1]) {
    options.outputDir = args[outputDirIdx + 1];
  }

  try {
    const agent = await new MonitoringAgent(options).init();

    switch (command) {
      case 'stats':
        const data = agent.prepareVisualizationData();
        agent.displayStats(data.stats);
        break;

      case 'report':
        await agent.generateReport();
        break;

      case 'dashboard':
        const result = await agent.generateDashboard();
        console.log(`\n✓ Dashboard disponible: ${result.path}`);
        console.log(`  Taille: ${(result.size / 1024).toFixed(1)} KB`);
        console.log(`  Ouvrez ce fichier dans votre navigateur pour visualiser les données\n`);
        agent.aiClient.displayStats();
        break;

      default:
        console.error(`${COLORS.red}Commande inconnue: ${command}${COLORS.reset}`);
        MonitoringAgent.showHelp();
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error(`${COLORS.red}Erreur:${COLORS.reset}`, error.message);
    process.exit(1);
  }
}

// Export pour utilisation comme module
module.exports = { MonitoringAgent };

// Exécution CLI
if (require.main === module) {
  main();
}
