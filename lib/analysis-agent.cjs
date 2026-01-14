/**
 * AnalysisAgent - Décompose et analyse les demandes
 *
 * Responsabilités:
 * - Décomposer la demande en sous-tâches claires
 * - Identifier les risques/impacts sur le code existant
 * - Estimer la complexité (simple/moyen/complexe)
 * - Lister les fichiers à modifier et pourquoi
 * - Détecter les dépendances entre modifications
 * - Générer un plan d'action structuré
 */

const { log, list } = require('./utils/logger.cjs');

class AnalysisAgent {
  constructor(config) {
    this.config = config;
    this.thresholds = config.agents.analysis.complexityThresholds;
  }

  /**
   * Initialise l'agent
   */
  async init() {
    log('AnalysisAgent', 'Initialisé');
    return this;
  }

  /**
   * Analyse complète d'une demande
   */
  async analyze(request, context) {
    log('AnalysisAgent', '📊 Analyse de la demande...');

    const { query, intent, detectedTerms } = request;
    const { relevantFiles } = context;

    // 1. Décomposition en sous-tâches
    const subtasks = this.decomposeTask(query, intent);

    // 2. Identification des fichiers impactés
    const impactedFiles = this.identifyImpactedFiles(subtasks, relevantFiles, detectedTerms);

    // 3. Analyse des dépendances
    const dependencies = this.analyzeDependencies(impactedFiles);

    // 4. Évaluation de la complexité
    const complexity = this.evaluateComplexity(subtasks, impactedFiles, dependencies);

    // 5. Identification des risques
    const risks = this.identifyRisks(intent, impactedFiles, complexity);

    // 6. Génération du plan d'action
    const actionPlan = this.generateActionPlan(subtasks, impactedFiles, dependencies);

    const analysis = {
      summary: this.generateSummary(query, intent),
      subtasks,
      impactedFiles,
      dependencies,
      complexity,
      risks,
      actionPlan,
      recommendations: this.generateRecommendations(complexity, risks)
    };

    this.displayAnalysis(analysis);

    return analysis;
  }

  /**
   * Décompose la tâche en sous-tâches
   */
  decomposeTask(query, intent) {
    const subtasks = [];
    const queryLower = query.toLowerCase();

    // Tâches de base selon l'intent
    switch (intent.type) {
      case 'create':
        subtasks.push(
          { id: 1, task: 'Identifier l\'emplacement du nouveau code', type: 'research' },
          { id: 2, task: 'Implémenter la nouvelle fonctionnalité', type: 'code' },
          { id: 3, task: 'Intégrer avec le code existant', type: 'integration' }
        );
        break;

      case 'modify':
        subtasks.push(
          { id: 1, task: 'Localiser le code à modifier', type: 'research' },
          { id: 2, task: 'Comprendre le comportement actuel', type: 'analysis' },
          { id: 3, task: 'Appliquer les modifications', type: 'code' },
          { id: 4, task: 'Vérifier la non-régression', type: 'test' }
        );
        break;

      case 'debug':
        subtasks.push(
          { id: 1, task: 'Reproduire le problème', type: 'debug' },
          { id: 2, task: 'Identifier la cause racine', type: 'analysis' },
          { id: 3, task: 'Implémenter le correctif', type: 'code' },
          { id: 4, task: 'Vérifier la résolution', type: 'test' }
        );
        break;

      case 'refactor':
        subtasks.push(
          { id: 1, task: 'Analyser la structure actuelle', type: 'analysis' },
          { id: 2, task: 'Définir la nouvelle structure', type: 'design' },
          { id: 3, task: 'Migrer le code progressivement', type: 'code' },
          { id: 4, task: 'Mettre à jour les dépendances', type: 'integration' },
          { id: 5, task: 'Valider le comportement', type: 'test' }
        );
        break;

      case 'test':
        subtasks.push(
          { id: 1, task: 'Identifier les cas de test', type: 'analysis' },
          { id: 2, task: 'Écrire les tests', type: 'code' },
          { id: 3, task: 'Exécuter et valider', type: 'test' }
        );
        break;

      default:
        subtasks.push(
          { id: 1, task: 'Analyser la demande', type: 'analysis' },
          { id: 2, task: 'Implémenter la solution', type: 'code' }
        );
    }

    // Ajout de sous-tâches spécifiques au domaine détecté
    if (queryLower.includes('trigo') || queryLower.includes('angle') || queryLower.includes('calcul')) {
      subtasks.push({ id: subtasks.length + 1, task: 'Vérifier les calculs mathématiques', type: 'validation' });
    }

    if (queryLower.includes('svg') || queryLower.includes('rendu') || queryLower.includes('display')) {
      subtasks.push({ id: subtasks.length + 1, task: 'Tester le rendu visuel', type: 'visual-test' });
    }

    return subtasks;
  }

  /**
   * Identifie les fichiers qui seront impactés
   */
  identifyImpactedFiles(subtasks, relevantFiles, detectedTerms) {
    const impacted = [];

    for (const file of relevantFiles) {
      const fileInfo = file.info || file;
      const impact = {
        path: fileInfo.path || file.path,
        category: fileInfo.category,
        reason: [],
        impactLevel: 'low'
      };

      // Raisons basées sur les termes détectés
      for (const term of detectedTerms) {
        if (fileInfo.keywords?.includes(term.term) || fileInfo.exports?.some(e => e.toLowerCase().includes(term.term))) {
          impact.reason.push(`Contient ${term.term}`);
          impact.impactLevel = 'medium';
        }
      }

      // Raisons basées sur la catégorie
      if (fileInfo.category === 'math' && subtasks.some(s => s.type === 'validation')) {
        impact.reason.push('Fichier math potentiellement concerné');
      }

      if (impact.reason.length > 0) {
        impacted.push(impact);
      }
    }

    // Trier par niveau d'impact
    const levelOrder = { high: 0, medium: 1, low: 2 };
    impacted.sort((a, b) => levelOrder[a.impactLevel] - levelOrder[b.impactLevel]);

    return impacted;
  }

  /**
   * Analyse les dépendances entre fichiers
   */
  analyzeDependencies(impactedFiles) {
    const dependencies = {
      direct: [],
      indirect: [],
      circular: []
    };

    // Analyse simplifiée basée sur les catégories
    const categories = [...new Set(impactedFiles.map(f => f.category))];

    if (categories.includes('domain') && categories.includes('rendering')) {
      dependencies.direct.push({
        from: 'domain',
        to: 'rendering',
        reason: 'Les composants Display dépendent des entités domain'
      });
    }

    if (categories.includes('math') && categories.includes('domain')) {
      dependencies.direct.push({
        from: 'math',
        to: 'domain',
        reason: 'Les calculs Trigo/Delta sont utilisés par Vertex/Apex'
      });
    }

    return dependencies;
  }

  /**
   * Évalue la complexité de la tâche
   */
  evaluateComplexity(subtasks, impactedFiles, dependencies) {
    let score = 0;

    // Facteurs de complexité
    score += subtasks.length * 1.5;
    score += impactedFiles.length * 2;
    score += dependencies.direct.length * 3;
    score += dependencies.circular.length * 5;

    // Types de sous-tâches complexes
    const complexTypes = ['refactor', 'integration', 'migration'];
    score += subtasks.filter(s => complexTypes.includes(s.type)).length * 2;

    // Détermination du niveau
    let level, label;
    if (score <= this.thresholds.simple) {
      level = 'simple';
      label = '🟢 Simple';
    } else if (score <= this.thresholds.medium) {
      level = 'medium';
      label = '🟡 Moyen';
    } else {
      level = 'complex';
      label = '🔴 Complexe';
    }

    return {
      score,
      level,
      label,
      factors: {
        subtasks: subtasks.length,
        files: impactedFiles.length,
        dependencies: dependencies.direct.length
      }
    };
  }

  /**
   * Identifie les risques potentiels
   */
  identifyRisks(intent, impactedFiles, complexity) {
    const risks = [];

    // Risques liés à l'intent
    if (intent.type === 'refactor') {
      risks.push({
        level: 'medium',
        description: 'Refactoring peut introduire des régressions',
        mitigation: 'Tester chaque étape indépendamment'
      });
    }

    if (intent.type === 'modify' || intent.type === 'debug') {
      risks.push({
        level: 'low',
        description: 'Modification de code existant',
        mitigation: 'Créer un backup avant modification'
      });
    }

    // Risques liés aux fichiers impactés
    const coreFiles = impactedFiles.filter(f =>
      f.category === 'domain' && ['Biblio', 'Vertex', 'Peri', 'Codex'].some(c => f.path?.includes(c))
    );

    if (coreFiles.length > 0) {
      risks.push({
        level: 'high',
        description: 'Modification de fichiers core du domaine',
        mitigation: 'Tests exhaustifs requis'
      });
    }

    // Risques liés à la complexité
    if (complexity.level === 'complex') {
      risks.push({
        level: 'medium',
        description: 'Tâche complexe avec plusieurs fichiers',
        mitigation: 'Décomposer en étapes incrémentales'
      });
    }

    return risks;
  }

  /**
   * Génère le plan d'action structuré
   */
  generateActionPlan(subtasks, impactedFiles, dependencies) {
    const steps = [];

    // Ordonnancer les sous-tâches selon les dépendances
    const orderedSubtasks = [...subtasks].sort((a, b) => {
      const typeOrder = { research: 0, analysis: 1, design: 2, code: 3, integration: 4, test: 5, validation: 6 };
      return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
    });

    for (const subtask of orderedSubtasks) {
      const relatedFiles = impactedFiles
        .filter(f => this.isFileRelatedToSubtask(f, subtask))
        .map(f => f.path);

      steps.push({
        step: steps.length + 1,
        task: subtask.task,
        type: subtask.type,
        files: relatedFiles.slice(0, 3),
        estimatedChanges: subtask.type === 'code' ? 'modifications' : 'lecture seule'
      });
    }

    return steps;
  }

  /**
   * Vérifie si un fichier est lié à une sous-tâche
   */
  isFileRelatedToSubtask(file, subtask) {
    if (subtask.type === 'code' || subtask.type === 'integration') {
      return true;
    }
    if (subtask.type === 'test' && file.category === 'debug') {
      return true;
    }
    return false;
  }

  /**
   * Génère un résumé de l'analyse
   */
  generateSummary(query, intent) {
    return {
      task: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      type: intent.description,
      intent: intent.type
    };
  }

  /**
   * Génère des recommandations
   */
  generateRecommendations(complexity, risks) {
    const recommendations = [];

    if (complexity.level === 'complex') {
      recommendations.push('Considérer une approche incrémentale');
    }

    if (risks.some(r => r.level === 'high')) {
      recommendations.push('Créer des backups avant modification');
      recommendations.push('Préparer des tests de régression');
    }

    if (complexity.factors.files > 5) {
      recommendations.push('Regrouper les modifications par catégorie');
    }

    return recommendations;
  }

  /**
   * Affiche l'analyse de manière formatée
   */
  displayAnalysis(analysis) {
    console.log('\n');
    log('AnalysisAgent', `📊 Analyse de la demande...`);

    console.log(`  - Tâche: ${analysis.summary.task}`);
    console.log(`  - Type: ${analysis.summary.type}`);
    console.log(`  - Fichiers impactés: ${analysis.impactedFiles.length}`);
    console.log(`  - Complexité: ${analysis.complexity.label}`);

    if (analysis.risks.length > 0) {
      console.log(`  - Risques: ${analysis.risks.length} identifiés`);
    }

    console.log('');
  }
}

module.exports = { AnalysisAgent };
