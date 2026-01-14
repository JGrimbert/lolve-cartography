/**
 * ProposalAgent - Propose des approches avec pros/cons
 *
 * Responsabilités:
 * - Proposer 2-3 approches différentes avec pros/cons
 * - Pour chaque approche: difficulté, maintenabilité
 * - Présenter des exemples de code concrets (snippets)
 * - Mode interactif: attendre validation avant de continuer
 * - Proposer des alternatives optimisées pour les patterns existants
 */

const readline = require('readline');
const { log, section, COLORS } = require('./utils/logger.cjs');

class ProposalAgent {
  constructor(config) {
    this.config = config;
    this.minProposals = config.agents.proposal.minProposals || 2;
    this.maxProposals = config.agents.proposal.maxProposals || 3;
    this.requireValidation = config.agents.proposal.requireValidation;
  }

  /**
   * Initialise l'agent
   */
  async init() {
    log('ProposalAgent', 'Initialisé');
    return this;
  }

  /**
   * Génère des propositions basées sur l'analyse
   */
  async generateProposals(analysis, context) {
    log('ProposalAgent', '💡 Génération des propositions...');

    const proposals = [];
    const { intent } = analysis.summary;

    // Générer des propositions selon le type de tâche
    switch (intent) {
      case 'create':
        proposals.push(...this.generateCreateProposals(analysis, context));
        break;

      case 'modify':
      case 'debug':
        proposals.push(...this.generateModifyProposals(analysis, context));
        break;

      case 'refactor':
        proposals.push(...this.generateRefactorProposals(analysis, context));
        break;

      case 'optimize':
        proposals.push(...this.generateOptimizeProposals(analysis, context));
        break;

      default:
        proposals.push(...this.generateDefaultProposals(analysis, context));
    }

    // S'assurer d'avoir au moins minProposals
    while (proposals.length < this.minProposals) {
      proposals.push(this.generateFallbackProposal(analysis, proposals.length + 1));
    }

    // Limiter à maxProposals
    const finalProposals = proposals.slice(0, this.maxProposals);

    // Ajouter des métadonnées
    finalProposals.forEach((p, i) => {
      p.id = i + 1;
      p.scores = this.calculateScores(p);
    });

    // Déterminer la recommandation
    const recommended = this.determineRecommendation(finalProposals, analysis);

    return {
      proposals: finalProposals,
      recommended,
      summary: this.generateProposalsSummary(finalProposals, recommended)
    };
  }

  /**
   * Propositions pour création de nouveau code
   */
  generateCreateProposals(analysis, context) {
    const proposals = [];
    const category = context.detectedCategory || 'domain';

    // Approche 1: Intégration directe
    proposals.push({
      title: 'Intégration directe dans le fichier existant',
      description: 'Ajouter la fonctionnalité directement dans le fichier le plus approprié',
      pros: [
        'Simple et rapide à implémenter',
        'Pas de nouveaux fichiers à maintenir',
        'Cohérent avec le code existant'
      ],
      cons: [
        'Peut surcharger le fichier existant',
        'Moins modulaire'
      ],
      difficulty: 'simple',
      maintainability: 'moyenne',
      files: analysis.impactedFiles.slice(0, 2).map(f => f.path),
      snippet: this.generateCreateSnippet(category, 'direct')
    });

    // Approche 2: Nouveau module
    proposals.push({
      title: 'Création d\'un nouveau module dédié',
      description: 'Créer un fichier séparé pour la nouvelle fonctionnalité',
      pros: [
        'Meilleure séparation des responsabilités',
        'Plus facile à tester',
        'Réutilisable'
      ],
      cons: [
        'Plus de fichiers à gérer',
        'Nécessite des imports supplémentaires'
      ],
      difficulty: 'moyen',
      maintainability: 'bonne',
      files: ['Nouveau fichier à créer'],
      snippet: this.generateCreateSnippet(category, 'module')
    });

    // Approche 3: Extension de classe existante (si applicable)
    if (category === 'domain' || category === 'math') {
      proposals.push({
        title: 'Extension d\'une classe existante',
        description: 'Étendre une classe existante pour ajouter la fonctionnalité',
        pros: [
          'Réutilise l\'infrastructure existante',
          'Cohérent avec l\'architecture du projet',
          'Accès aux méthodes parentes'
        ],
        cons: [
          'Couplage plus fort',
          'Peut complexifier la hiérarchie'
        ],
        difficulty: 'moyen',
        maintainability: 'bonne',
        files: analysis.impactedFiles.filter(f => f.category === category).slice(0, 2).map(f => f.path),
        snippet: this.generateCreateSnippet(category, 'extend')
      });
    }

    return proposals;
  }

  /**
   * Propositions pour modification/debug
   */
  generateModifyProposals(analysis, context) {
    const proposals = [];

    proposals.push({
      title: 'Modification minimale ciblée',
      description: 'Modifier uniquement le code strictement nécessaire',
      pros: [
        'Risque minimal de régression',
        'Rapide à implémenter',
        'Facile à reverter si problème'
      ],
      cons: [
        'Peut ne pas résoudre le problème racine',
        'Solution potentiellement temporaire'
      ],
      difficulty: 'simple',
      maintainability: 'moyenne',
      files: analysis.impactedFiles.slice(0, 1).map(f => f.path),
      snippet: '// Modification ciblée ici'
    });

    proposals.push({
      title: 'Refactoring local avec amélioration',
      description: 'Profiter de la modification pour améliorer le code environnant',
      pros: [
        'Améliore la qualité du code',
        'Résout potentiellement d\'autres problèmes',
        'Meilleure maintenabilité'
      ],
      cons: [
        'Plus de temps nécessaire',
        'Risque de régression plus élevé'
      ],
      difficulty: 'moyen',
      maintainability: 'bonne',
      files: analysis.impactedFiles.slice(0, 3).map(f => f.path),
      snippet: '// Refactoring local avec amélioration'
    });

    return proposals;
  }

  /**
   * Propositions pour refactoring
   */
  generateRefactorProposals(analysis, context) {
    return [
      {
        title: 'Refactoring progressif (Feature Branch)',
        description: 'Refactoring par étapes sur une branche dédiée',
        pros: ['Réversible', 'Testable à chaque étape', 'Moins risqué'],
        cons: ['Plus long', 'Nécessite merge final'],
        difficulty: 'moyen',
        maintainability: 'bonne',
        files: analysis.impactedFiles.map(f => f.path),
        snippet: '// Étape 1 du refactoring'
      },
      {
        title: 'Refactoring Big Bang',
        description: 'Tout refactorer en une seule passe',
        pros: ['Rapide', 'Cohérent'],
        cons: ['Risqué', 'Difficile à debugger si problème'],
        difficulty: 'complexe',
        maintainability: 'bonne',
        files: analysis.impactedFiles.map(f => f.path),
        snippet: '// Refactoring complet'
      }
    ];
  }

  /**
   * Propositions pour optimisation
   */
  generateOptimizeProposals(analysis, context) {
    return [
      {
        title: 'Optimisation algorithmique',
        description: 'Améliorer la complexité algorithmique',
        pros: ['Gains de performance significatifs', 'Solution pérenne'],
        cons: ['Peut nécessiter réécriture', 'Complexe à implémenter'],
        difficulty: 'complexe',
        maintainability: 'bonne',
        files: analysis.impactedFiles.filter(f => f.category === 'math').map(f => f.path),
        snippet: '// Optimisation O(n) -> O(log n)'
      },
      {
        title: 'Mise en cache / Mémoïsation',
        description: 'Mettre en cache les résultats de calculs coûteux',
        pros: ['Simple à implémenter', 'Gains immédiats'],
        cons: ['Utilise plus de mémoire', 'Peut introduire des bugs de cache'],
        difficulty: 'simple',
        maintainability: 'moyenne',
        files: analysis.impactedFiles.slice(0, 2).map(f => f.path),
        snippet: 'const cache = new Map();\nfunction memoized(key, compute) {\n  if (!cache.has(key)) cache.set(key, compute());\n  return cache.get(key);\n}'
      }
    ];
  }

  /**
   * Propositions par défaut
   */
  generateDefaultProposals(analysis, context) {
    return [
      {
        title: 'Approche standard',
        description: 'Implémenter selon les conventions du projet',
        pros: ['Cohérent avec le code existant', 'Maintenable'],
        cons: ['Peut ne pas être optimal'],
        difficulty: 'moyen',
        maintainability: 'bonne',
        files: analysis.impactedFiles.slice(0, 3).map(f => f.path),
        snippet: '// Implémentation standard'
      }
    ];
  }

  /**
   * Proposition de fallback
   */
  generateFallbackProposal(analysis, index) {
    return {
      title: `Alternative ${index}`,
      description: 'Approche alternative à considérer',
      pros: ['À définir selon le contexte'],
      cons: ['À évaluer'],
      difficulty: 'moyen',
      maintainability: 'moyenne',
      files: [],
      snippet: '// À définir'
    };
  }

  /**
   * Génère un snippet de code exemple
   */
  generateCreateSnippet(category, approach) {
    const snippets = {
      math: {
        direct: `// Dans Trigo.js
static nouveauCalcul(params) {
  const { delta, radius } = params;
  return Math.cos(delta) * radius;
}`,
        module: `// Nouveau fichier: src/prima/Nucleus/NouveauCalcul.js
export class NouveauCalcul {
  constructor(options) {
    this.options = options;
  }

  compute() {
    // Implémentation
  }
}`,
        extend: `// Extension de Trigo
class TrigoExtended extends Trigo {
  nouveauCalcul() {
    return super.projectio() * this.factor;
  }
}`
      },
      domain: {
        direct: `// Ajout dans le fichier existant
novaMethode() {
  // Utilise les conventions LOLVE
  return this.codex.nova(/* ... */);
}`,
        module: `// Nouveau fichier domain
export class NouvelleEntite {
  static nova(params) {
    return new NouvelleEntite(params);
  }
}`,
        extend: `// Extension d'une entité existante
class ExtendedEntity extends BaseEntity {
  evolutio() {
    super.evolutio();
    // Logique additionnelle
  }
}`
      }
    };

    return snippets[category]?.[approach] || '// Code à implémenter';
  }

  /**
   * Calcule les scores d'une proposition
   */
  calculateScores(proposal) {
    const difficultyScore = { simple: 3, moyen: 2, complexe: 1 }[proposal.difficulty] || 2;
    const maintainabilityScore = { bonne: 3, moyenne: 2, faible: 1 }[proposal.maintainability] || 2;

    return {
      difficulty: difficultyScore,
      maintainability: maintainabilityScore,
      total: difficultyScore + maintainabilityScore
    };
  }

  /**
   * Détermine la proposition recommandée
   */
  determineRecommendation(proposals, analysis) {
    // Privilégier la maintenabilité pour les projets complexes
    const sorted = [...proposals].sort((a, b) => {
      if (analysis.complexity.level === 'complex') {
        return b.scores.maintainability - a.scores.maintainability;
      }
      return b.scores.total - a.scores.total;
    });

    return sorted[0].id;
  }

  /**
   * Génère un résumé des propositions
   */
  generateProposalsSummary(proposals, recommended) {
    return proposals.map(p => ({
      id: p.id,
      title: p.title,
      difficulty: p.difficulty,
      recommended: p.id === recommended
    }));
  }

  /**
   * Affiche les propositions de manière interactive
   */
  async displayProposals(proposalResult) {
    const { proposals, recommended } = proposalResult;

    section('Propositions');

    for (const proposal of proposals) {
      const isRecommended = proposal.id === recommended;
      const prefix = isRecommended ? `${COLORS.green}★` : ' ';

      console.log(`\n${prefix} ${COLORS.bright}${proposal.id}. ${proposal.title}${COLORS.reset}`);
      console.log(`   ${proposal.description}`);

      console.log(`\n   ${COLORS.green}✓ Avantages:${COLORS.reset}`);
      proposal.pros.forEach(pro => console.log(`     • ${pro}`));

      console.log(`\n   ${COLORS.red}✗ Inconvénients:${COLORS.reset}`);
      proposal.cons.forEach(con => console.log(`     • ${con}`));

      console.log(`\n   Difficulté: ${proposal.difficulty} | Maintenabilité: ${proposal.maintainability}`);

      if (proposal.files.length > 0) {
        console.log(`   Fichiers: ${proposal.files.join(', ')}`);
      }

      if (proposal.snippet) {
        console.log(`\n   ${COLORS.dim}Exemple:${COLORS.reset}`);
        console.log(`   ${COLORS.dim}${proposal.snippet.split('\n').join('\n   ')}${COLORS.reset}`);
      }
    }

    console.log(`\n${COLORS.yellow}Recommandation: Approche ${recommended}${COLORS.reset}`);
  }

  /**
   * Demande validation à l'utilisateur
   */
  async requestValidation(proposalResult) {
    if (!this.requireValidation) {
      return { approved: true, selected: proposalResult.recommended };
    }

    await this.displayProposals(proposalResult);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      const options = proposalResult.proposals.map(p => p.id).join('/');
      rl.question(`\nContinuer ? [y/N/${options}] `, (answer) => {
        rl.close();

        const answerLower = answer.toLowerCase().trim();

        if (answerLower === 'y' || answerLower === 'yes' || answerLower === 'o' || answerLower === 'oui') {
          resolve({ approved: true, selected: proposalResult.recommended });
        } else if (/^\d+$/.test(answerLower)) {
          const selected = parseInt(answerLower);
          if (proposalResult.proposals.some(p => p.id === selected)) {
            resolve({ approved: true, selected });
          } else {
            resolve({ approved: false, reason: 'Option invalide' });
          }
        } else {
          resolve({ approved: false, reason: 'Annulé par l\'utilisateur' });
        }
      });
    });
  }

  /**
   * Obtient la proposition sélectionnée
   */
  getSelectedProposal(proposalResult, selectedId) {
    return proposalResult.proposals.find(p => p.id === selectedId);
  }
}

module.exports = { ProposalAgent };
