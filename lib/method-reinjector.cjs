#!/usr/bin/env node

/**
 * MethodReinjector - Réinjecte les méthodes modifiées dans les fichiers sources
 * 
 * Compare le snapshot original avec le code modifié et remplace
 * intelligemment les méthodes dans les fichiers sources.
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { MethodSnapshot } = require('./method-snapshot.cjs');

class MethodReinjector {
  constructor(options = {}) {
    this.options = {
      backup: true,
      dryRun: false,
      verbose: false,
      ...options
    };
    this.snapshot = new MethodSnapshot();
  }

  /**
   * Parse le fichier temporaire modifié pour extraire les méthodes
   */
  parseModifiedFile(tempFilePath) {
    const content = fs.readFileSync(tempFilePath, 'utf-8');
    
    // Extraire les méthodes avec leurs marqueurs de commentaire
    const methods = {};
    // La regex s'arrête sur: // Méthode:, // ===... (séparateur de section), ou fin de fichier
    const methodRegex = /\/\/ Méthode: ([^\n]+)\n\/\/ Fichier: ([^\n]+)\n([\s\S]*?)(?=\n\/\/ (?:Méthode:|={3,})|$)/g;
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const [, methodKey, fileInfo, code] = match;
      methods[methodKey.trim()] = {
        code: code.trim(),
        fileInfo: fileInfo.trim()
      };
    }

    // Fallback : si pas de marqueurs, essayer de parser comme du JS
    if (Object.keys(methods).length === 0) {
      console.warn('⚠ Pas de marqueurs trouvés, tentative de parsing JS...');
      return this.parseAsJavaScript(content);
    }

    return methods;
  }

  /**
   * Parse le contenu comme du JavaScript et extrait les méthodes
   */
  parseAsJavaScript(content) {
    const methods = {};
    
    try {
      const ast = acorn.parse(content, { 
        ecmaVersion: 'latest', 
        sourceType: 'module',
        locations: true 
      });

      // Extraire les méthodes de classes
      for (const node of ast.body) {
        if (node.type === 'ClassDeclaration') {
          const className = node.id?.name;
          
          for (const item of node.body.body) {
            if (item.type === 'MethodDefinition') {
              const methodName = item.key?.name;
              if (methodName && className) {
                const key = `${className}.${methodName}`;
                const code = content.substring(item.start, item.end);
                methods[key] = { code, parsed: true };
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Erreur de parsing:', error.message);
    }

    return methods;
  }

  /**
   * Compare et identifie les changements
   */
  detectChanges(originalSnapshot, modifiedMethods) {
    const changes = {
      modified: [],
      added: [],
      unchanged: []
    };

    // Méthodes modifiées
    for (const [key, modData] of Object.entries(modifiedMethods)) {
      if (originalSnapshot.methods[key]) {
        const origNorm = originalSnapshot.methods[key].normalized;
        const modNorm = this.snapshot.normalizeCode(modData.code);
        
        if (origNorm !== modNorm) {
          changes.modified.push({
            key,
            oldCode: originalSnapshot.methods[key].code,
            newCode: modData.code,
            file: originalSnapshot.methods[key].file
          });
        } else {
          changes.unchanged.push(key);
        }
      } else {
        // Nouvelle méthode
        changes.added.push({
          key,
          code: modData.code
        });
      }
    }

    return changes;
  }

  /**
   * Remplace une méthode dans un fichier
   */
  replaceMethodInFile(filePath, oldCode, newCode) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const normalized = this.snapshot.normalizeCode(oldCode);

    // Tentative 1: Remplacement exact
    if (content.includes(oldCode)) {
      content = content.replace(oldCode, newCode);
      return { success: true, content, method: 'exact' };
    }

    // Tentative 2: Remplacement avec normalisation
    // On cherche une version similaire dans le fichier
    const lines = content.split('\n');
    let bestMatch = null;
    let bestScore = 0;
    let startLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const chunk = lines.slice(i, i + oldCode.split('\n').length).join('\n');
      const chunkNorm = this.snapshot.normalizeCode(chunk);
      
      if (chunkNorm === normalized) {
        // Match parfait normalisé
        const before = lines.slice(0, i).join('\n');
        const after = lines.slice(i + oldCode.split('\n').length).join('\n');
        content = before + '\n' + newCode + '\n' + after;
        return { success: true, content, method: 'normalized' };
      }
      
      // Score de similarité (pour debug)
      const score = this.similarity(chunkNorm, normalized);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = chunk;
        startLine = i;
      }
    }

    // Échec
    return { 
      success: false, 
      content, 
      method: 'failed',
      bestMatch,
      bestScore,
      startLine
    };
  }

  /**
   * Calcule la similarité entre deux chaînes (0-1)
   */
  similarity(s1, s2) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshtein(s1, s2);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Distance de Levenshtein
   */
  levenshtein(s1, s2) {
    const matrix = [];
    
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[s2.length][s1.length];
  }

  /**
   * Trouve le point d'insertion pour une nouvelle méthode
   */
  findInsertionPoint(content, className) {
    // Chercher la fin de la classe
    const classRegex = new RegExp(`class\\s+${className}\\s*{`, 'g');
    const match = classRegex.exec(content);
    
    if (!match) return content.length;
    
    // Trouver l'accolade fermante de la classe
    let depth = 0;
    let pos = match.index + match[0].length;
    
    for (; pos < content.length; pos++) {
      if (content[pos] === '{') depth++;
      if (content[pos] === '}') {
        if (depth === 0) {
          // Trouver la dernière méthode avant cette accolade
          const beforeClose = content.substring(0, pos);
          const lastMethod = beforeClose.lastIndexOf('\n  }');
          return lastMethod > 0 ? lastMethod + 4 : pos;
        }
        depth--;
      }
    }
    
    return content.length;
  }

  /**
   * Réinjecte toutes les modifications
   */
  async reinject(snapshotPath, tempFilePath) {
    console.log('🔄 Réinjection des modifications...\n');

    // 1. Charger le snapshot original
    const originalSnapshot = this.snapshot.load(snapshotPath);
    console.log(`📸 Snapshot chargé: ${Object.keys(originalSnapshot.methods).length} méthode(s)`);

    // 2. Vérifier l'intégrité des fichiers
    const integrity = this.snapshot.checkFileIntegrity(originalSnapshot);
    
    if (integrity.modified.length > 0) {
      console.warn(`⚠️  Fichiers modifiés depuis le snapshot:`);
      integrity.modified.forEach(f => console.warn(`   - ${f}`));
      
      if (!this.options.force) {
        throw new Error('Fichiers modifiés détectés. Utilisez --force pour ignorer.');
      }
    }

    if (integrity.missing.length > 0) {
      console.error(`❌ Fichiers manquants:`);
      integrity.missing.forEach(f => console.error(`   - ${f}`));
      throw new Error('Fichiers manquants détectés.');
    }

    // 3. Parser le fichier modifié
    const modifiedMethods = this.parseModifiedFile(tempFilePath);
    console.log(`✓ Fichier modifié parsé: ${Object.keys(modifiedMethods).length} méthode(s)\n`);

    // 4. Détecter les changements
    const changes = this.detectChanges(originalSnapshot, modifiedMethods);
    
    console.log(`📊 Changements détectés:`);
    console.log(`   Modifiées: ${changes.modified.length}`);
    console.log(`   Ajoutées:  ${changes.added.length}`);
    console.log(`   Inchangées: ${changes.unchanged.length}\n`);

    if (changes.modified.length === 0 && changes.added.length === 0) {
      console.log('✓ Aucune modification à appliquer');
      return { success: true, changes: 0 };
    }

    // 5. Grouper par fichier
    const byFile = {};
    for (const change of changes.modified) {
      if (!byFile[change.file]) byFile[change.file] = [];
      byFile[change.file].push(change);
    }

    // 6. Appliquer les modifications fichier par fichier
    const results = {
      success: [],
      failed: []
    };

    for (const [file, fileChanges] of Object.entries(byFile)) {
      const filePath = path.join(originalSnapshot.files[file].path);
      
      console.log(`\n📝 Traitement: ${file}`);
      
      // Backup
      if (this.options.backup && !this.options.dryRun) {
        const backupPath = filePath + '.backup';
        fs.copyFileSync(filePath, backupPath);
        console.log(`   ✓ Backup créé: ${backupPath}`);
      }

      let content = fs.readFileSync(filePath, 'utf-8');

      // Appliquer chaque changement
      for (const change of fileChanges) {
        const result = this.replaceMethodInFile(filePath, change.oldCode, change.newCode);
        
        if (result.success) {
          content = result.content;
          console.log(`   ✓ ${change.key} remplacée (${result.method})`);
          results.success.push(change.key);
        } else {
          console.error(`   ❌ ${change.key} échec (similarité: ${(result.bestScore * 100).toFixed(0)}%)`);
          if (this.options.verbose && result.bestMatch) {
            console.error(`      Meilleur match trouvé ligne ${result.startLine}:`);
            console.error(`      ${result.bestMatch.substring(0, 100)}...`);
          }
          results.failed.push({ key: change.key, score: result.bestScore });
        }
      }

      // Écrire le fichier
      if (!this.options.dryRun) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`   💾 Fichier sauvegardé`);
      } else {
        console.log(`   [DRY RUN] Modifications non appliquées`);
      }
    }

    // 7. Résumé
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RÉSUMÉ`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✓ Succès: ${results.success.length}`);
    console.log(`❌ Échecs: ${results.failed.length}`);
    
    if (results.failed.length > 0) {
      console.log(`\n❌ Méthodes non réinjectées:`);
      results.failed.forEach(f => {
        console.log(`   - ${f.key} (similarité: ${(f.score * 100).toFixed(0)}%)`);
      });
    }

    return {
      success: results.failed.length === 0,
      successCount: results.success.length,
      failedCount: results.failed.length,
      failed: results.failed
    };
  }
}

/**
 * CLI
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node lib/method-reinjector.cjs <temp-file> [options]

Arguments:
  temp-file      Fichier temporaire contenant les méthodes modifiées

Options:
  --snapshot FILE  Fichier snapshot (défaut: temp/snapshot.json)
  --dry-run        Simule sans modifier les fichiers
  --force          Ignore les avertissements de fichiers modifiés
  --verbose        Affiche plus de détails
  --no-backup      Ne crée pas de backup
  --help           Affiche cette aide

Exemples:
  node lib/method-reinjector.cjs temp/methods.js
  node lib/method-reinjector.cjs temp/methods.js --dry-run
  node lib/method-reinjector.cjs temp/methods.js --force --verbose
`);
    process.exit(0);
  }

  const tempFile = args[0];
  let snapshotFile = 'temp/snapshot.json';

  const options = {
    backup: !args.includes('--no-backup'),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    verbose: args.includes('--verbose')
  };

  // Parser --snapshot
  const snapshotIdx = args.indexOf('--snapshot');
  if (snapshotIdx !== -1 && args[snapshotIdx + 1]) {
    snapshotFile = args[snapshotIdx + 1];
  }

  // Vérifier que les fichiers existent
  if (!fs.existsSync(tempFile)) {
    console.error(`❌ Fichier temporaire non trouvé: ${tempFile}`);
    process.exit(1);
  }

  if (!fs.existsSync(snapshotFile)) {
    console.error(`❌ Snapshot non trouvé: ${snapshotFile}`);
    console.error(`💡 Avez-vous lancé method-snapshot.cjs d'abord ?`);
    process.exit(1);
  }

  try {
    const reinjector = new MethodReinjector(options);
    const result = await reinjector.reinject(snapshotFile, tempFile);

    if (result.success) {
      console.log(`\n✅ Réinjection réussie !`);
      process.exit(0);
    } else {
      console.log(`\n⚠️  Réinjection partielle (${result.failedCount} échec(s))`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Erreur: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Export
module.exports = { MethodReinjector };

// CLI
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  });
}
