/**
 * Context Benchmark - Compare les approches de chargement de contexte
 *
 * Mesure l'économie de tokens entre:
 * - Approche "lourde": charger tous les fichiers potentiellement pertinents
 * - Approche "légère": SearchSession avec chargement progressif
 *
 * Usage: node agents/context-benchmark.cjs [query]
 */

const path = require('path');
const fs = require('fs');
const { ContextAgent } = require('./context-agent.cjs');

// Estimation grossière: 1 token ≈ 4 caractères pour du code
const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function formatNumber(n) {
  return n.toLocaleString('fr-FR');
}

function formatPercent(ratio) {
  return (ratio * 100).toFixed(1) + '%';
}

// Configuration
const config = {
  project: {
    name: 'LOLVE',
    rootPath: path.resolve(__dirname, '..')
  },
  agents: {
    context: {
      indexRefreshInterval: 300000
    }
  },
  categories: {
    domain: { keywords: ['vertex', 'apex', 'orb', 'rosa', 'forma', 'unda', 'biblio'] },
    math: { keywords: ['angle', 'distance', 'circumcenter', 'trigo', 'delta'] },
    rendering: { keywords: ['svg', 'display', 'render', 'quadro'] }
  },
  conventions: {}
};

class ContextBenchmark {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * Approche lourde: charger tous les fichiers pertinents entièrement
   */
  heavyApproach(query) {
    const relevantFiles = this.agent.findRelevantFiles(query, 15);

    let totalChars = 0;
    const filesLoaded = [];

    for (const { path: filePath, info } of relevantFiles) {
      const fullPath = path.join(this.agent.rootPath, info.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        totalChars += content.length;
        filesLoaded.push({
          path: info.path,
          chars: content.length,
          lines: content.split('\n').length
        });
      }
    }

    return {
      approach: 'heavy',
      description: 'Chargement complet des fichiers pertinents',
      filesCount: filesLoaded.length,
      totalChars,
      estimatedTokens: estimateTokens({ length: totalChars }),
      files: filesLoaded
    };
  }

  /**
   * Approche légère niveau 1: metadata seulement
   */
  lightApproachLevel1(query) {
    const session = this.agent.createSearchSession(query, { maxMethods: 15 });
    const results = session.getAtLevel(1); // Descriptions seulement

    const json = JSON.stringify(results);

    return {
      approach: 'light-L1',
      description: 'Metadata seulement (clés + descriptions)',
      methodsCount: results.length,
      totalChars: json.length,
      estimatedTokens: estimateTokens(json),
      sample: results.slice(0, 3)
    };
  }

  /**
   * Approche légère niveau 2: signatures complètes
   */
  lightApproachLevel2(query) {
    const session = this.agent.createSearchSession(query, { maxMethods: 15 });
    const results = session.getAtLevel(2); // Signatures + effects + consumers

    const json = JSON.stringify(results);

    return {
      approach: 'light-L2',
      description: 'Signatures complètes + annotations',
      methodsCount: results.length,
      totalChars: json.length,
      estimatedTokens: estimateTokens(json),
      sample: results.slice(0, 2)
    };
  }

  /**
   * Approche légère niveau 3: avec code des méthodes ciblées
   */
  lightApproachLevel3(query) {
    const session = this.agent.createSearchSession(query, { maxMethods: 15 });
    const results = session.getAtLevel(3); // Avec code

    let totalCodeChars = 0;
    for (const r of results) {
      if (r.code) totalCodeChars += r.code.length;
    }

    const json = JSON.stringify(results);

    return {
      approach: 'light-L3',
      description: 'Metadata + code des méthodes ciblées',
      methodsCount: results.length,
      totalChars: json.length,
      codeChars: totalCodeChars,
      estimatedTokens: estimateTokens(json),
      averageMethodSize: results.length > 0 ? Math.round(totalCodeChars / results.length) : 0
    };
  }

  /**
   * Approche hybride: niveau 2 + code de 3 méthodes top
   */
  hybridApproach(query) {
    const session = this.agent.createSearchSession(query, { maxMethods: 15 });

    // Niveau 2 pour tous
    const metadata = session.getAtLevel(2);

    // Code pour top 3 seulement
    const topKeys = session.keys.slice(0, 3);
    const loadedCode = session.loadCode(topKeys);

    const metadataJson = JSON.stringify(metadata);
    let codeChars = 0;
    for (const { code } of loadedCode) {
      codeChars += code?.length || 0;
    }

    return {
      approach: 'hybrid',
      description: 'Signatures pour tous + code pour top 3',
      methodsCount: metadata.length,
      codeLoadedCount: loadedCode.length,
      metadataChars: metadataJson.length,
      codeChars,
      totalChars: metadataJson.length + codeChars,
      estimatedTokens: estimateTokens({ length: metadataJson.length + codeChars })
    };
  }

  /**
   * Lance tous les benchmarks pour une requête
   */
  runAll(query) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`BENCHMARK: "${query}"`);
    console.log('='.repeat(60));

    const results = {
      query,
      timestamp: new Date().toISOString(),
      approaches: {}
    };

    // Heavy approach
    console.log('\n📦 Approche LOURDE (fichiers complets)...');
    const heavy = this.heavyApproach(query);
    results.approaches.heavy = heavy;
    console.log(`   ${heavy.filesCount} fichiers, ${formatNumber(heavy.totalChars)} chars, ~${formatNumber(heavy.estimatedTokens)} tokens`);

    // Light L1
    console.log('\n🪶 Approche LÉGÈRE niveau 1 (metadata)...');
    const lightL1 = this.lightApproachLevel1(query);
    results.approaches.lightL1 = lightL1;
    console.log(`   ${lightL1.methodsCount} méthodes, ${formatNumber(lightL1.totalChars)} chars, ~${formatNumber(lightL1.estimatedTokens)} tokens`);

    // Light L2
    console.log('\n🪶 Approche LÉGÈRE niveau 2 (signatures)...');
    const lightL2 = this.lightApproachLevel2(query);
    results.approaches.lightL2 = lightL2;
    console.log(`   ${lightL2.methodsCount} méthodes, ${formatNumber(lightL2.totalChars)} chars, ~${formatNumber(lightL2.estimatedTokens)} tokens`);

    // Light L3
    console.log('\n🪶 Approche LÉGÈRE niveau 3 (avec code)...');
    const lightL3 = this.lightApproachLevel3(query);
    results.approaches.lightL3 = lightL3;
    console.log(`   ${lightL3.methodsCount} méthodes, ${formatNumber(lightL3.totalChars)} chars, ~${formatNumber(lightL3.estimatedTokens)} tokens`);

    // Hybrid
    console.log('\n🔀 Approche HYBRIDE (signatures + top 3 code)...');
    const hybrid = this.hybridApproach(query);
    results.approaches.hybrid = hybrid;
    console.log(`   ${hybrid.methodsCount} méthodes (${hybrid.codeLoadedCount} avec code), ${formatNumber(hybrid.totalChars)} chars, ~${formatNumber(hybrid.estimatedTokens)} tokens`);

    // Comparaison
    console.log('\n' + '-'.repeat(60));
    console.log('📊 COMPARAISON');
    console.log('-'.repeat(60));

    const baseline = heavy.estimatedTokens;

    const comparison = [
      { name: 'Heavy (baseline)', tokens: heavy.estimatedTokens, ratio: 1 },
      { name: 'Light L1 (metadata)', tokens: lightL1.estimatedTokens, ratio: lightL1.estimatedTokens / baseline },
      { name: 'Light L2 (signatures)', tokens: lightL2.estimatedTokens, ratio: lightL2.estimatedTokens / baseline },
      { name: 'Light L3 (+ code)', tokens: lightL3.estimatedTokens, ratio: lightL3.estimatedTokens / baseline },
      { name: 'Hybrid (sig + top3)', tokens: hybrid.estimatedTokens, ratio: hybrid.estimatedTokens / baseline }
    ];

    console.log('\n| Approche              | Tokens estimés | % du baseline | Économie |');
    console.log('|----------------------|----------------|---------------|----------|');

    for (const c of comparison) {
      const saving = c.ratio < 1 ? formatPercent(1 - c.ratio) : '-';
      console.log(`| ${c.name.padEnd(20)} | ${formatNumber(c.tokens).padStart(14)} | ${formatPercent(c.ratio).padStart(13)} | ${saving.padStart(8)} |`);
    }

    results.comparison = comparison;
    results.summary = {
      baselineTokens: baseline,
      bestApproach: comparison.reduce((a, b) => a.tokens < b.tokens ? a : b).name,
      maxSaving: formatPercent(1 - comparison.reduce((a, b) => a.ratio < b.ratio ? a : b).ratio)
    };

    console.log('\n' + '-'.repeat(60));
    console.log(`💡 Meilleure approche: ${results.summary.bestApproach}`);
    console.log(`💰 Économie maximale: ${results.summary.maxSaving}`);
    console.log('-'.repeat(60));

    return results;
  }

  /**
   * Simule un workflow complet d'agent avec expansion
   */
  simulateAgentWorkflow(query) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`SIMULATION WORKFLOW: "${query}"`);
    console.log('='.repeat(60));

    // Étape 1: Recherche initiale (L1)
    console.log('\n📍 Étape 1: Recherche initiale (metadata)');
    const session = this.agent.createSearchSession(query, { maxMethods: 10 });
    const step1Chars = JSON.stringify(session.getAtLevel(1)).length;
    console.log(`   ${session.count} méthodes trouvées, ~${formatNumber(estimateTokens({ length: step1Chars }))} tokens`);

    // Étape 2: L'agent décide que 2 méthodes sont des faux positifs
    console.log('\n📍 Étape 2: Exclusion de faux positifs');
    const toExclude = session.keys.slice(-2); // Simule exclusion des 2 derniers
    session.exclude(toExclude);
    console.log(`   Exclus: ${toExclude.join(', ')}`);
    console.log(`   Reste: ${session.count} méthodes`);

    // Étape 3: L'agent veut plus de détails sur le top 3
    console.log('\n📍 Étape 3: Chargement du code (top 3)');
    const topKeys = session.keys.slice(0, 3);
    const loaded = session.loadCode(topKeys);
    let codeChars = 0;
    for (const l of loaded) codeChars += l.code?.length || 0;
    console.log(`   Code chargé: ${loaded.length} méthodes, ~${formatNumber(estimateTokens({ length: codeChars }))} tokens`);

    // Étape 4: L'agent veut suivre une dépendance
    console.log('\n📍 Étape 4: Expansion (suivre dépendances)');
    if (session.keys.length > 0) {
      const beforeExpand = session.count;
      session.expand(session.keys[0], { direction: 'both' });
      console.log(`   Expand sur ${session.keys[0]}`);
      console.log(`   Méthodes: ${beforeExpand} → ${session.count}`);
    }

    // Bilan
    console.log('\n' + '-'.repeat(60));
    console.log('📊 BILAN DU WORKFLOW');
    console.log('-'.repeat(60));

    const totalLoaded = JSON.stringify(session.toContext({ includeCode: true })).length;
    const heavy = this.heavyApproach(query);

    console.log(`\n   Tokens consommés (progressif): ~${formatNumber(estimateTokens({ length: totalLoaded }))}`);
    console.log(`   Tokens si heavy d'emblée:      ~${formatNumber(heavy.estimatedTokens)}`);
    console.log(`   Économie réalisée:             ${formatPercent(1 - totalLoaded / (heavy.totalChars || 1))}`);

    console.log('\n   Historique des opérations:');
    for (const h of session.history) {
      console.log(`   - ${h.action}${h.excluded ? ` (${h.excluded.length})` : ''}${h.loaded ? ` (${h.loaded.length})` : ''}`);
    }

    return {
      workflow: session.history,
      tokensUsed: estimateTokens({ length: totalLoaded }),
      tokensIfHeavy: heavy.estimatedTokens,
      saving: formatPercent(1 - totalLoaded / (heavy.totalChars || 1))
    };
  }
}

// Main
async function main() {
  const query = process.argv[2] || 'vertex création orb';

  const agent = new ContextAgent(config);
  await agent.init();

  const methodCount = Object.keys(agent.methodIndexer.index.methods || {}).length;
  if (methodCount === 0) {
    console.error('❌ Index des méthodes vide! Exécutez "npm run annotate:index" d\'abord.');
    process.exit(1);
  }

  const benchmark = new ContextBenchmark(agent);

  // Benchmark comparatif
  const results = benchmark.runAll(query);

  // Simulation workflow
  benchmark.simulateAgentWorkflow(query);

  // Tester avec d'autres requêtes
  console.log('\n\n' + '='.repeat(60));
  console.log('BENCHMARKS ADDITIONNELS');
  console.log('='.repeat(60));

  const additionalQueries = [
    'rosa simplex catena',
    'forma polygon circumcenter',
    'unda kyklos wave'
  ];

  for (const q of additionalQueries) {
    benchmark.runAll(q);
  }
}

main().catch(console.error);
