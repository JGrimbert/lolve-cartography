#!/usr/bin/env node

/**
 * MethodSnapshot - Capture l'état des méthodes avant modification
 * 
 * Sauvegarde le code exact des méthodes sélectionnées pour pouvoir
 * les retrouver et les remplacer après modification.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MethodIndexer } = require('./method-indexer.cjs');

class MethodSnapshot {
  constructor() {
    this.methodIndexer = new MethodIndexer();
    this.methodIndexer.loadIndex();
  }

  /**
   * Capture l'état actuel des méthodes
   * @param {string[]} methodKeys - Liste des clés de méthodes (ex: ['Vertex.calculate'])
   * @param {Object} options - Options (scores: array with score info)
   * @returns {Object} Snapshot avec les méthodes et métadonnées
   */
  capture(methodKeys, options = {}) {
    const { scores = [] } = options;

    // Build a score map from the scores array
    const scoreMap = {};
    for (const item of scores) {
      if (item.key && item.score !== undefined) {
        scoreMap[item.key] = item.score;
      }
    }

    const snapshot = {
      timestamp: new Date().toISOString(),
      methods: {},
      files: {},
      hashes: {}
    };

    for (const key of methodKeys) {
      const method = this.methodIndexer.index.methods[key];
      if (!method) {
        console.warn(`⚠ Méthode non trouvée dans l'index: ${key}`);
        continue;
      }

      // Extraire le code de la méthode
      const code = this.methodIndexer.extractMethodCode(key);
      if (!code) {
        console.warn(`⚠ Impossible d'extraire le code: ${key}`);
        continue;
      }

      // Stocker le code exact avec le score
      snapshot.methods[key] = {
        code,
        normalized: this.normalizeCode(code),
        file: method.file,
        class: method.class,
        name: method.name,
        line: method.line,
        endLine: method.endLine,
        score: scoreMap[key] || 0
      };

      // Associer fichier
      const filePath = path.join(this.methodIndexer.index.rootPath || process.cwd(), method.file);
      if (!snapshot.files[method.file]) {
        snapshot.files[method.file] = {
          path: filePath,
          methods: [],
          originalHash: this.hashFile(filePath)
        };
      }
      snapshot.files[method.file].methods.push(key);
    }

    return snapshot;
  }

  /**
   * Normalise le code pour faciliter la recherche
   * (supprime espaces multiples, normalise les retours à la ligne)
   */
  normalizeCode(code) {
    return code
      .replace(/\r\n/g, '\n')           // Normaliser les retours à la ligne
      .replace(/\s+/g, ' ')             // Espaces multiples → 1 espace
      .replace(/\s*{\s*/g, ' { ')       // Espaces autour de {
      .replace(/\s*}\s*/g, ' } ')       // Espaces autour de }
      .replace(/\s*\(\s*/g, '(')        // Pas d'espace avant (
      .replace(/\s*\)\s*/g, ')')        // Pas d'espace après )
      .replace(/\s*;\s*/g, ';')         // Pas d'espace autour de ;
      .replace(/\s*,\s*/g, ', ')        // Un espace après ,
      .trim();
  }

  /**
   * Hash un fichier pour détecter les modifications
   */
  hashFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  /**
   * Vérifie si les fichiers ont été modifiés depuis le snapshot
   */
  checkFileIntegrity(snapshot) {
    const results = {
      unchanged: [],
      modified: [],
      missing: []
    };

    for (const [file, data] of Object.entries(snapshot.files)) {
      if (!fs.existsSync(data.path)) {
        results.missing.push(file);
        continue;
      }

      const currentHash = this.hashFile(data.path);
      if (currentHash === data.originalHash) {
        results.unchanged.push(file);
      } else {
        results.modified.push(file);
      }
    }

    return results;
  }

  /**
   * Sauvegarde le snapshot dans un fichier
   */
  save(snapshot, outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    console.log(`✓ Snapshot sauvegardé: ${outputPath}`);
  }

  /**
   * Charge un snapshot depuis un fichier
   */
  load(snapshotPath) {
    const content = fs.readFileSync(snapshotPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Génère un fichier temporaire contenant les méthodes
   * (pour édition par Claude Code ou manuellement)
   */
  generateTempFile(snapshot, options = {}) {
    const { 
      includeContext = true,
      groupByClass = true 
    } = options;

    let content = '';

    if (includeContext) {
      content += `/**
 * FICHIER TEMPORAIRE - Méthodes extraites pour modification
 *
 * Généré le: ${snapshot.timestamp}
 * Méthodes: ${Object.keys(snapshot.methods).join(', ')}
 *
 * INSTRUCTIONS:
 * - Modifiez les méthodes ci-dessous
 * - Ne changez PAS les noms de méthodes
 * - La réinjection est AUTOMATIQUE (watcher MCP)
 */

`;
    }

    if (groupByClass) {
      // Grouper par classe
      const byClass = {};
      for (const [key, data] of Object.entries(snapshot.methods)) {
        const className = data.class || '_functions';
        if (!byClass[className]) {
          byClass[className] = [];
        }
        byClass[className].push({ key, ...data });
      }

      for (const [className, methods] of Object.entries(byClass)) {
        if (className !== '_functions') {
          content += `// ============================================\n`;
          content += `// Classe: ${className}\n`;
          content += `// ============================================\n\n`;
        }

        for (const method of methods) {
          content += `// Méthode: ${method.key}\n`;
          content += `// Fichier: ${method.file}:${method.line}\n`;
          content += `// Score: ${method.score || 0}\n`;
          content += method.code;
          content += '\n\n';
        }
      }
    } else {
      // Liste simple
      for (const [key, data] of Object.entries(snapshot.methods)) {
        content += `// ${key} (${data.file}:${data.line})\n`;
        content += data.code;
        content += '\n\n';
      }
    }

    return content;
  }
}

/**
 * CLI
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node lib/method-snapshot.cjs <method-keys...> [options]

Arguments:
  method-keys    Liste des méthodes à capturer (ex: Vertex.calculate Orb.render)

Options:
  --output FILE  Fichier de sortie pour le snapshot (défaut: temp/snapshot.json)
  --temp FILE    Génère aussi un fichier temporaire éditable (défaut: temp/methods.js)
  --help         Affiche cette aide

Exemples:
  node lib/method-snapshot.cjs Vertex.calculate Vertex.render
  node lib/method-snapshot.cjs Vertex.calculate --output snapshot.json --temp edit.js
`);
    process.exit(0);
  }

  // Parser les arguments
  const methodKeys = [];
  let outputPath = 'temp/snapshot.json';
  let tempPath = 'temp/methods.js';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === '--temp' && args[i + 1]) {
      tempPath = args[++i];
    } else if (!args[i].startsWith('--')) {
      methodKeys.push(args[i]);
    }
  }

  if (methodKeys.length === 0) {
    console.error('❌ Aucune méthode spécifiée');
    process.exit(1);
  }

  // Créer le dossier temp si nécessaire
  const tempDir = path.dirname(outputPath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Capturer le snapshot
  console.log(`📸 Capture de ${methodKeys.length} méthode(s)...`);
  const snapshot = new MethodSnapshot();
  const data = snapshot.capture(methodKeys);

  // Sauvegarder
  snapshot.save(data, outputPath);

  // Générer le fichier temporaire
  const tempContent = snapshot.generateTempFile(data, {
    includeContext: true,
    groupByClass: true
  });

  fs.writeFileSync(tempPath, tempContent, 'utf-8');
  console.log(`✓ Fichier temporaire généré: ${tempPath}`);

  // Résumé
  console.log(`\n📊 Résumé:`);
  console.log(`  Méthodes capturées: ${Object.keys(data.methods).length}`);
  console.log(`  Fichiers concernés: ${Object.keys(data.files).length}`);
  console.log(`\n💡 Prochaines étapes:`);
  console.log(`  1. Éditez: ${tempPath}`);
  console.log(`  2. Réinjectez: node lib/method-reinjector.cjs ${tempPath}`);
}

// Export
module.exports = { MethodSnapshot };

// CLI
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  });
}
