/**
 * TestAgent - Génère et exécute des tests
 *
 * Responsabilités:
 * - Générer des tests unitaires pour les nouvelles fonctions mathématiques
 * - Créer des tests visuels pour les rendus
 * - Vérifier la non-régression sur les fonctions existantes
 * - Tests spécifiques géométrie: vertices, angles, coordonnées
 * - Rapport de couverture des modifications
 * - Suggérer des edge cases
 */

const { execSync } = require('child_process');
const path = require('path');
const { log, section } = require('./utils/logger.cjs');
const { readFile, writeFile } = require('./utils/file-utils.cjs');

class TestAgent {
  constructor(config) {
    this.config = config;
    this.rootPath = config.project.rootPath;
    this.generateSnapshots = config.agents.test.generateSnapshots;
    this.coverageThreshold = config.agents.test.coverageThreshold;
  }

  /**
   * Initialise l'agent
   */
  async init() {
    log('TestAgent', 'Initialisé');
    return this;
  }

  /**
   * Génère et exécute les tests pour les modifications
   */
  async runTests(modifications, analysis) {
    log('TestAgent', '🧪 Exécution des tests...');

    const results = {
      generated: [],
      executed: [],
      passed: 0,
      failed: 0,
      edgeCases: []
    };

    // 1. Générer des tests pour les nouvelles fonctions
    for (const mod of modifications.success || []) {
      const tests = await this.generateTests(mod, analysis);
      results.generated.push(...tests);
    }

    // 2. Identifier les edge cases
    results.edgeCases = this.identifyEdgeCases(analysis);

    // 3. Exécuter les tests existants si disponibles
    const testResults = await this.executeExistingTests();
    results.executed = testResults;
    results.passed = testResults.filter(t => t.passed).length;
    results.failed = testResults.filter(t => !t.passed).length;

    this.displayResults(results);

    return results;
  }

  /**
   * Génère des tests pour une modification
   */
  async generateTests(modification, analysis) {
    const tests = [];
    const { file } = modification;

    // Détecter le type de fichier
    const category = this.detectCategory(file);

    // Générer les tests appropriés
    switch (category) {
      case 'math':
        tests.push(...this.generateMathTests(file, analysis));
        break;

      case 'domain':
        tests.push(...this.generateDomainTests(file, analysis));
        break;

      case 'rendering':
        tests.push(...this.generateRenderingTests(file, analysis));
        break;

      default:
        tests.push(...this.generateGenericTests(file, analysis));
    }

    return tests;
  }

  /**
   * Détecte la catégorie d'un fichier
   */
  detectCategory(file) {
    const fileLower = file.toLowerCase();

    if (fileLower.includes('trigo') || fileLower.includes('delta') || fileLower.includes('sectio')) {
      return 'math';
    }
    if (fileLower.includes('display') || fileLower.includes('svg')) {
      return 'rendering';
    }
    if (fileLower.includes('prima')) {
      return 'domain';
    }
    return 'generic';
  }

  /**
   * Génère des tests mathématiques
   */
  generateMathTests(file, analysis) {
    const tests = [];
    const baseName = path.basename(file, path.extname(file));

    // Tests de base pour les calculs trigonométriques
    tests.push({
      name: `${baseName} - valeurs de base`,
      code: `
/* TEST: ${baseName} */
describe('${baseName}', () => {
  test('calcule correctement pour angle 0', () => {
    const result = ${baseName}.compute(0);
    expect(result).toBeCloseTo(expectedValue, 5);
  });

  test('calcule correctement pour angle PI/2', () => {
    const result = ${baseName}.compute(Math.PI / 2);
    expect(result).toBeCloseTo(expectedValue, 5);
  });

  test('calcule correctement pour angle PI', () => {
    const result = ${baseName}.compute(Math.PI);
    expect(result).toBeCloseTo(expectedValue, 5);
  });
});
`,
      type: 'unit',
      category: 'math'
    });

    // Tests de précision
    tests.push({
      name: `${baseName} - précision numérique`,
      code: `
test('maintient la précision pour petites valeurs', () => {
  const smallValue = 1e-10;
  const result = ${baseName}.compute(smallValue);
  expect(Math.abs(result)).toBeLessThan(1e-5);
});

test('gère les grandes valeurs', () => {
  const largeValue = 1e10;
  const result = ${baseName}.compute(largeValue);
  expect(isFinite(result)).toBe(true);
});
`,
      type: 'precision',
      category: 'math'
    });

    return tests;
  }

  /**
   * Génère des tests pour le domaine LOLVE
   */
  generateDomainTests(file, analysis) {
    const tests = [];
    const baseName = path.basename(file, path.extname(file));

    tests.push({
      name: `${baseName} - création via nova()`,
      code: `
/* TEST: ${baseName} */
describe('${baseName}', () => {
  test('crée une instance via nova()', () => {
    const instance = ${baseName}.nova({ /* params */ });
    expect(instance).toBeDefined();
    expect(instance.id).toBeDefined();
  });

  test('s\\'enregistre dans le Codex', () => {
    const instance = ${baseName}.nova({ /* params */ });
    expect(codex.has(instance.id)).toBe(true);
  });
});
`,
      type: 'unit',
      category: 'domain'
    });

    // Tests de structure circulaire
    if (['peri', 'orb', 'rosa', 'forma'].some(t => file.toLowerCase().includes(t))) {
      tests.push({
        name: `${baseName} - structure circulaire`,
        code: `
test('maintient la circularité', () => {
  const instance = ${baseName}.nova({ /* params */ });
  let current = instance.head;
  let count = 0;
  do {
    count++;
    current = current.next;
  } while (current !== instance.head && count < 1000);
  expect(current).toBe(instance.head);
});
`,
        type: 'structure',
        category: 'domain'
      });
    }

    return tests;
  }

  /**
   * Génère des tests de rendu
   */
  generateRenderingTests(file, analysis) {
    const tests = [];
    const baseName = path.basename(file, path.extname(file));

    tests.push({
      name: `${baseName} - rendu SVG`,
      code: `
/* TEST: ${baseName} */
describe('${baseName} rendering', () => {
  test('génère du SVG valide', () => {
    const wrapper = mount(${baseName}, {
      props: { /* props */ }
    });
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  test('répond aux props', () => {
    const wrapper = mount(${baseName}, {
      props: { visible: false }
    });
    expect(wrapper.find('.hidden').exists()).toBe(true);
  });
});
`,
      type: 'component',
      category: 'rendering'
    });

    return tests;
  }

  /**
   * Génère des tests génériques
   */
  generateGenericTests(file, analysis) {
    const baseName = path.basename(file, path.extname(file));

    return [{
      name: `${baseName} - test de base`,
      code: `
/* TEST: ${baseName} */
describe('${baseName}', () => {
  test('existe et est importable', () => {
    expect(${baseName}).toBeDefined();
  });
});
`,
      type: 'smoke',
      category: 'generic'
    }];
  }

  /**
   * Identifie les edge cases potentiels
   */
  identifyEdgeCases(analysis) {
    const edgeCases = [];
    const { impactedFiles } = analysis;

    // Edge cases mathématiques
    if (impactedFiles.some(f => f.category === 'math')) {
      edgeCases.push(
        { case: 'Division par zéro', suggestion: 'Tester avec radius = 0' },
        { case: 'Angles limites', suggestion: 'Tester avec 0, π/2, π, 3π/2, 2π' },
        { case: 'Valeurs négatives', suggestion: 'Tester avec angles négatifs' },
        { case: 'NaN/Infinity', suggestion: 'Vérifier que le résultat est fini' }
      );
    }

    // Edge cases domain
    if (impactedFiles.some(f => f.category === 'domain')) {
      edgeCases.push(
        { case: 'Liste vide', suggestion: 'Tester Peri avec 0 éléments' },
        { case: 'Élément unique', suggestion: 'Tester avec un seul Nucleus' },
        { case: 'Références circulaires', suggestion: 'Vérifier pas de fuite mémoire' },
        { case: 'IDs en collision', suggestion: 'Tester création massive' }
      );
    }

    // Edge cases géométriques
    if (analysis.detectedTerms?.some(t => ['vertex', 'apex', 'forma'].includes(t.term))) {
      edgeCases.push(
        { case: 'Polygone dégénéré', suggestion: 'Tester triangle avec aire 0' },
        { case: 'Points colinéaires', suggestion: 'Tester vertices alignés' },
        { case: 'Coordonnées identiques', suggestion: 'Tester deux apex même position' }
      );
    }

    return edgeCases;
  }

  /**
   * Exécute les tests existants du projet
   */
  async executeExistingTests() {
    try {
      // Vérifier si npm test existe
      const result = execSync('npm test --if-present 2>&1', {
        cwd: this.rootPath,
        timeout: 60000,
        encoding: 'utf-8'
      });

      // Parser les résultats (format dépend du test runner)
      return this.parseTestResults(result);
    } catch (error) {
      // Tests en échec ou pas de tests
      if (error.stdout) {
        return this.parseTestResults(error.stdout);
      }

      log('TestAgent', 'Pas de tests automatisés configurés', 'warning');
      return [];
    }
  }

  /**
   * Parse les résultats de tests
   */
  parseTestResults(output) {
    const results = [];

    // Pattern générique pour détecter les tests passés/échoués
    const passedMatch = output.match(/(\d+)\s*(?:passed|passing|✓)/i);
    const failedMatch = output.match(/(\d+)\s*(?:failed|failing|✗)/i);

    if (passedMatch) {
      const count = parseInt(passedMatch[1]);
      for (let i = 0; i < count; i++) {
        results.push({ name: `Test ${i + 1}`, passed: true });
      }
    }

    if (failedMatch) {
      const count = parseInt(failedMatch[1]);
      for (let i = 0; i < count; i++) {
        results.push({ name: `Test échoué ${i + 1}`, passed: false });
      }
    }

    return results;
  }

  /**
   * Génère un fichier de test inline (convention LOLVE)
   */
  generateInlineTest(className, tests) {
    const testCode = tests.map(t => t.code).join('\n\n');
    const testFilePath = path.join(this.rootPath, 'tests', `${className}.test.js`);

    const content = `/**
 * Tests pour ${className}
 * Généré par TestAgent
 */

${testCode}
`;

    writeFile(testFilePath, content);
    log('TestAgent', `Test généré: ${className}.test.js`, 'success');

    return testFilePath;
  }

  /**
   * Affiche les résultats des tests
   */
  displayResults(results) {
    section('Résultats des tests');

    if (results.generated.length > 0) {
      console.log(`  Tests générés: ${results.generated.length}`);
      results.generated.forEach(t => {
        console.log(`    • ${t.name} (${t.type})`);
      });
    }

    if (results.executed.length > 0) {
      console.log(`\n  Tests exécutés: ${results.executed.length}`);
      console.log(`    ✓ Passés: ${results.passed}`);
      console.log(`    ✗ Échoués: ${results.failed}`);
    }

    if (results.edgeCases.length > 0) {
      console.log(`\n  Edge cases suggérés:`);
      results.edgeCases.forEach(ec => {
        console.log(`    ⚠ ${ec.case}: ${ec.suggestion}`);
      });
    }

    console.log('');
  }

  /**
   * Vérifie la couverture de code
   */
  async checkCoverage() {
    try {
      const result = execSync('npm run test:coverage --if-present 2>&1', {
        cwd: this.rootPath,
        timeout: 120000,
        encoding: 'utf-8'
      });

      // Extraire le pourcentage de couverture
      const coverageMatch = result.match(/(\d+(?:\.\d+)?)\s*%/);
      if (coverageMatch) {
        const coverage = parseFloat(coverageMatch[1]);
        const meetsThreshold = coverage >= this.coverageThreshold;

        return {
          coverage,
          threshold: this.coverageThreshold,
          meetsThreshold
        };
      }
    } catch (error) {
      log('TestAgent', 'Couverture non disponible', 'warning');
    }

    return null;
  }
}

module.exports = { TestAgent };
