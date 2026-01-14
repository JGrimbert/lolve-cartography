/**
 * CodeAgent - Applique les modifications de code
 *
 * Responsabilités:
 * - N'exécuter QU'après validation de la proposition
 * - Appliquer les modifications de manière incrémentale
 * - Créer des backups automatiques avant modification
 * - Commit Git automatique avec message descriptif
 * - Logs détaillés de chaque modification
 * - Respecter les conventions de code du projet
 */

const { execSync } = require('child_process');
const path = require('path');
const { log } = require('./utils/logger.cjs');
const { readFile, writeFile, createBackup } = require('./utils/file-utils.cjs');

class CodeAgent {
  constructor(config) {
    this.config = config;
    this.rootPath = config.project.rootPath;
    this.createBackups = config.agents.code.createBackups;
    this.autoCommit = config.agents.code.autoCommit;
    this.commitPrefix = config.agents.code.commitPrefix;
    this.modifications = [];
  }

  /**
   * Initialise l'agent
   */
  async init() {
    log('CodeAgent', 'Initialisé');
    return this;
  }

  /**
   * Applique les modifications selon la proposition validée
   */
  async applyChanges(proposal, analysis, llmResponse) {
    log('CodeAgent', '⚙️ Application des modifications...');

    this.modifications = [];
    const results = {
      success: [],
      failed: [],
      backups: []
    };

    // Parser les modifications depuis la réponse du LLM
    const changes = this.parseChanges(llmResponse);

    if (changes.length === 0) {
      log('CodeAgent', 'Aucune modification à appliquer', 'warning');
      return results;
    }

    log('CodeAgent', `${changes.length} modification(s) à appliquer`);

    // Appliquer chaque modification
    for (const change of changes) {
      try {
        const result = await this.applyChange(change);
        if (result.success) {
          results.success.push(result);
          if (result.backup) {
            results.backups.push(result.backup);
          }
        } else {
          results.failed.push(result);
        }
      } catch (error) {
        results.failed.push({
          file: change.file,
          error: error.message
        });
        log('CodeAgent', `Erreur sur ${change.file}: ${error.message}`, 'error');
      }
    }

    // Commit si activé et si des modifications ont été appliquées
    if (this.autoCommit && results.success.length > 0) {
      await this.commitChanges(proposal, results.success);
    }

    this.displayResults(results);

    return results;
  }

  /**
   * Parse les modifications depuis une réponse LLM
   */
  parseChanges(llmResponse) {
    const changes = [];

    if (!llmResponse) return changes;

    // Pattern pour détecter les blocs de code avec fichier
    // Format attendu: ```javascript:path/to/file.js ou // FILE: path/to/file.js
    const fileBlockPattern = /```(?:\w+)?:?([\w\/\\.]+)?\n([\s\S]*?)```/g;
    const fileCommentPattern = /\/\/\s*FILE:\s*([\w\/\\.]+)\n([\s\S]*?)(?=\/\/\s*FILE:|$)/g;

    let match;

    // Chercher les blocs avec indication de fichier
    while ((match = fileBlockPattern.exec(llmResponse)) !== null) {
      if (match[1]) {
        changes.push({
          file: match[1],
          content: match[2].trim(),
          type: 'replace'
        });
      }
    }

    // Chercher les commentaires FILE:
    while ((match = fileCommentPattern.exec(llmResponse)) !== null) {
      changes.push({
        file: match[1].trim(),
        content: match[2].trim(),
        type: 'replace'
      });
    }

    // Si aucun fichier explicite, chercher des patterns de modification
    if (changes.length === 0) {
      const diffPattern = /^[-+]\s*(.+)$/gm;
      // Retourner le contenu brut pour traitement manuel
      if (llmResponse.includes('```')) {
        const codeBlocks = llmResponse.match(/```[\s\S]*?```/g);
        if (codeBlocks) {
          changes.push({
            file: 'MANUAL_REVIEW',
            content: codeBlocks.join('\n\n'),
            type: 'manual'
          });
        }
      }
    }

    return changes;
  }

  /**
   * Applique une modification individuelle
   */
  async applyChange(change) {
    const filePath = this.resolvePath(change.file);

    log('CodeAgent', `Modification: ${change.file}`);

    // Créer backup si activé
    let backupPath = null;
    if (this.createBackups && change.type !== 'manual') {
      backupPath = createBackup(filePath);
      if (backupPath) {
        log('CodeAgent', `Backup créé: ${path.basename(backupPath)}`);
      }
    }

    // Traitement selon le type
    if (change.type === 'manual') {
      return {
        success: false,
        file: change.file,
        reason: 'Revue manuelle requise',
        content: change.content
      };
    }

    // Lire le fichier existant
    const existingContent = readFile(filePath);

    if (existingContent === null && change.type === 'replace') {
      // Nouveau fichier
      writeFile(filePath, change.content);
      this.modifications.push({
        type: 'create',
        file: filePath,
        lines: change.content.split('\n').length
      });

      return {
        success: true,
        file: change.file,
        action: 'created',
        backup: backupPath
      };
    }

    // Appliquer la modification
    if (change.type === 'replace') {
      writeFile(filePath, change.content);
      this.modifications.push({
        type: 'modify',
        file: filePath,
        lines: change.content.split('\n').length
      });

      return {
        success: true,
        file: change.file,
        action: 'modified',
        backup: backupPath
      };
    }

    return {
      success: false,
      file: change.file,
      reason: `Type de modification non supporté: ${change.type}`
    };
  }

  /**
   * Résout le chemin du fichier
   */
  resolvePath(file) {
    if (path.isAbsolute(file)) {
      return file;
    }
    return path.join(this.rootPath, file);
  }

  /**
   * Commit les modifications
   */
  async commitChanges(proposal, successfulChanges) {
    if (successfulChanges.length === 0) return;

    try {
      const files = successfulChanges.map(c => this.resolvePath(c.file));
      const message = `${this.commitPrefix} ${proposal.title}\n\n${proposal.description}`;

      // Git add
      for (const file of files) {
        execSync(`git add "${file}"`, { cwd: this.rootPath, stdio: 'pipe' });
      }

      // Git commit
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: this.rootPath,
        stdio: 'pipe'
      });

      log('CodeAgent', 'Commit Git créé', 'success');
    } catch (error) {
      log('CodeAgent', `Erreur Git: ${error.message}`, 'warning');
    }
  }

  /**
   * Affiche les résultats des modifications
   */
  displayResults(results) {
    console.log('\n');

    if (results.success.length > 0) {
      log('CodeAgent', `${results.success.length} fichier(s) modifié(s)`, 'success');
      results.success.forEach(r => {
        console.log(`   ✓ ${r.file} (${r.action})`);
      });
    }

    if (results.failed.length > 0) {
      log('CodeAgent', `${results.failed.length} échec(s)`, 'error');
      results.failed.forEach(r => {
        console.log(`   ✗ ${r.file}: ${r.reason || r.error}`);
      });
    }

    if (results.backups.length > 0) {
      console.log(`\n   Backups: ${results.backups.length} fichier(s)`);
    }
  }

  /**
   * Applique une modification de type "diff"
   */
  applyDiff(originalContent, diffContent) {
    const lines = originalContent.split('\n');
    const diffLines = diffContent.split('\n');
    const result = [];

    let originalIndex = 0;

    for (const diffLine of diffLines) {
      if (diffLine.startsWith('+') && !diffLine.startsWith('+++')) {
        // Ligne ajoutée
        result.push(diffLine.substring(1));
      } else if (diffLine.startsWith('-') && !diffLine.startsWith('---')) {
        // Ligne supprimée - skip
        originalIndex++;
      } else if (diffLine.startsWith(' ')) {
        // Ligne contextuelle
        result.push(lines[originalIndex] || diffLine.substring(1));
        originalIndex++;
      } else {
        // Ligne non-diff, copier telle quelle
        result.push(lines[originalIndex] || '');
        originalIndex++;
      }
    }

    // Ajouter les lignes restantes
    while (originalIndex < lines.length) {
      result.push(lines[originalIndex]);
      originalIndex++;
    }

    return result.join('\n');
  }

  /**
   * Analyse le style du code existant pour le respecter
   */
  analyzeCodeStyle(content) {
    const style = {
      indent: '  ',
      semicolons: true,
      quotes: 'single',
      trailingComma: false
    };

    // Détecter l'indentation
    const indentMatch = content.match(/^( +|\t)/m);
    if (indentMatch) {
      style.indent = indentMatch[1];
    }

    // Détecter les points-virgules
    const lines = content.split('\n').filter(l => l.trim());
    const withSemicolons = lines.filter(l => l.trim().endsWith(';')).length;
    style.semicolons = withSemicolons > lines.length / 2;

    // Détecter les quotes
    const singleQuotes = (content.match(/'/g) || []).length;
    const doubleQuotes = (content.match(/"/g) || []).length;
    style.quotes = singleQuotes > doubleQuotes ? 'single' : 'double';

    return style;
  }

  /**
   * Obtient le résumé des modifications
   */
  getSummary() {
    return {
      total: this.modifications.length,
      created: this.modifications.filter(m => m.type === 'create').length,
      modified: this.modifications.filter(m => m.type === 'modify').length,
      files: this.modifications.map(m => m.file)
    };
  }

  /**
   * Annule les dernières modifications (restaure les backups)
   */
  async rollback(backups) {
    log('CodeAgent', 'Rollback des modifications...');

    for (const backup of backups) {
      try {
        const originalPath = backup.replace(/\.backups[\\/]/, '').replace(/_[\d-T]+(\.\w+)$/, '$1');
        const backupContent = readFile(backup);
        if (backupContent) {
          writeFile(originalPath, backupContent);
          log('CodeAgent', `Restauré: ${path.basename(originalPath)}`, 'success');
        }
      } catch (error) {
        log('CodeAgent', `Erreur rollback: ${error.message}`, 'error');
      }
    }
  }
}

module.exports = { CodeAgent };
