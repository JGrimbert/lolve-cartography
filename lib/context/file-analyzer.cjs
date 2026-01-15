/**
 * FileAnalyzer - Analyse de fichiers et extraction de métadonnées
 *
 * Responsabilités:
 * - Détecter la catégorie d'un fichier (math, domain, rendering, ui, etc.)
 * - Extraire les exports, dépendances et mots-clés
 * - Parser et extraire la documentation JSDoc
 */

const path = require('path');
const { readFile } = require('../utils/file-utils.cjs');

class FileAnalyzer {
  constructor(rootPath) {
    this.rootPath = rootPath;
  }

  /**
   * Analyse un fichier pour déterminer sa catégorie et ses métadonnées
   * @param {string} filePath - Chemin absolu du fichier
   * @returns {Object} Informations sur le fichier
   */
  analyzeFile(filePath) {
    const content = readFile(filePath) || '';
    const relativePath = path.relative(this.rootPath, filePath);
    const fileName = path.basename(filePath);

    const category = this.detectCategory(relativePath, content);
    const exports = this.extractExports(content);
    const dependencies = this.extractDependencies(content);
    const keywords = this.extractKeywords(content, category);
    const jsdoc = this.extractJSDoc(content);

    return {
      name: fileName,
      path: relativePath,
      category,
      exports,
      dependencies,
      keywords,
      jsdoc,
      lines: content.split('\n').length
    };
  }

  /**
   * Détecte la catégorie d'un fichier
   * @param {string} relativePath - Chemin relatif
   * @param {string} content - Contenu du fichier
   * @returns {string} Catégorie détectée
   */
  detectCategory(relativePath, content) {
    const pathLower = relativePath.toLowerCase().replace(/\\/g, '/');

    // Basé sur le chemin
    if (pathLower.includes('prima/nucleus/trigo') ||
        pathLower.includes('prima/nucleus/delta') ||
        pathLower.includes('sectio')) {
      return 'math';
    }

    if (pathLower.includes('display') || pathLower.includes('defssvg')) {
      return 'rendering';
    }

    if (pathLower.includes('debug')) {
      return 'debug';
    }

    if (pathLower.includes('composables')) {
      return 'composables';
    }

    if (pathLower.includes('prima/')) {
      return 'domain';
    }

    if (pathLower.includes('components/')) {
      return 'ui';
    }

    // Basé sur le contenu
    if (content.includes('Math.') || content.includes('TAU') ||
        content.includes('atan2') || content.includes('circumcenter')) {
      return 'math';
    }

    return 'utilities';
  }

  /**
   * Extrait les exports d'un fichier
   * @param {string} content - Contenu du fichier
   * @returns {string[]} Liste des exports
   */
  extractExports(content) {
    const exports = [];

    // export default class/function
    const defaultMatch = content.match(/export\s+default\s+(?:class\s+|function\s+)?(\w+)/);
    if (defaultMatch) exports.push(defaultMatch[1]);

    // export const/function
    const namedMatches = content.matchAll(/export\s+(?:const|let|function|class)\s+(\w+)/g);
    for (const m of namedMatches) exports.push(m[1]);

    return [...new Set(exports)];
  }

  /**
   * Extrait les dépendances internes (imports depuis src/)
   * @param {string} content - Contenu du fichier
   * @returns {string[]} Liste des dépendances
   */
  extractDependencies(content) {
    const deps = [];
    const matches = content.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g);

    for (const m of matches) {
      if (m[1].startsWith('.') || m[1].startsWith('@/')) {
        deps.push(m[1]);
      }
    }

    return [...new Set(deps)];
  }

  /**
   * Extrait les mots-clés pertinents d'un fichier
   * @param {string} content - Contenu du fichier
   * @param {string} category - Catégorie du fichier
   * @returns {string[]} Liste des mots-clés
   */
  extractKeywords(content, category) {
    const keywords = new Set();

    // Classes définies
    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const m of classMatches) keywords.add(m[1].toLowerCase());

    // Fonctions importantes
    const funcMatches = content.matchAll(/(?:function|async function|const|let)\s+(\w{4,})\s*(?:=\s*(?:async\s*)?\(|[\(])/g);
    for (const m of funcMatches) keywords.add(m[1].toLowerCase());

    // Termes spécifiques au domaine LOLVE
    const domainTerms = ['vertex', 'apex', 'orb', 'rosa', 'forma', 'unda', 'biblio',
                         'folia', 'peri', 'nucleus', 'delta', 'trigo', 'sectio',
                         'quadro', 'clavis', 'codex', 'kyklos', 'circumcenter'];

    for (const term of domainTerms) {
      if (content.toLowerCase().includes(term)) {
        keywords.add(term);
      }
    }

    return [...keywords].slice(0, 15);
  }

  /**
   * Extrait la documentation JSDoc des classes et méthodes
   * @param {string} content - Contenu du fichier
   * @returns {Object} Documentation JSDoc extraite
   */
  extractJSDoc(content) {
    const result = {
      classDoc: null,
      methods: []
    };

    // Pattern pour JSDoc de classe (avant "class ClassName")
    const classDocPattern = /\/\*\*\s*([\s\S]*?)\s*\*\/\s*(?:export\s+)?class\s+(\w+)/g;
    const classMatch = classDocPattern.exec(content);

    if (classMatch) {
      result.classDoc = {
        name: classMatch[2],
        description: this.parseJSDocDescription(classMatch[1]),
        ...this.parseJSDocTags(classMatch[1])
      };
    }

    // Pattern pour JSDoc de méthode
    const methodDocPattern = /\/\*\*([^*]*(?:\*(?!\/)[^*]*)*)\*+\/\s*(?:static\s+)?(?:async\s+)?(#?\w+)\s*(?:\(|=\s*(?:\([^)]*\)|[^=])*=>)/g;
    let methodMatch;

    while ((methodMatch = methodDocPattern.exec(content)) !== null) {
      let methodName = methodMatch[2];
      if (methodName === 'constructor' || methodName === result.classDoc?.name) continue;

      const tags = this.parseJSDocTags(methodMatch[1]);
      const description = this.parseJSDocDescription(methodMatch[1]);

      if (tags.role || description) {
        result.methods.push({
          name: methodName,
          description,
          ...tags
        });
      }
    }

    return result;
  }

  /**
   * Parse la description d'un bloc JSDoc
   * @param {string} jsdocContent - Contenu JSDoc brut
   * @returns {string|null} Description extraite
   */
  parseJSDocDescription(jsdocContent) {
    const cleaned = jsdocContent
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim();

    const firstTagIndex = cleaned.search(/@\w+/);
    if (firstTagIndex === -1) return cleaned;
    if (firstTagIndex === 0) return null;

    return cleaned.substring(0, firstTagIndex).trim() || null;
  }

  /**
   * Parse les tags JSDoc (@role, @consumer, @returns, etc.)
   * @param {string} jsdocContent - Contenu JSDoc brut
   * @returns {Object} Tags extraits
   */
  parseJSDocTags(jsdocContent) {
    const tags = {};

    // @role ou @Role, avec ou sans deux-points
    const roleMatch = jsdocContent.match(/@[Rr]ole:?\s*(\w+)/);
    if (roleMatch) {
      tags.role = roleMatch[1].toLowerCase();
    }

    // @consumer (pour les méthodes service)
    const consumerMatch = jsdocContent.match(/@consumer:?\s+(.+?)(?=@|$|\n\s*\*\s*@|\n\s*\*\/)/si);
    if (consumerMatch) {
      tags.consumers = consumerMatch[1]
        .replace(/\*/g, '')
        .split(/[,\s]+/)
        .map(c => c.trim())
        .filter(c => c.length > 0);
    }

    // @returns / @return
    const returnMatch = jsdocContent.match(/@returns?\s+(?:\{([^}]+)\})?\s*(.+?)(?=@|$|\n\s*\*\s*@)/s);
    if (returnMatch) {
      tags.returns = {
        type: returnMatch[1] || null,
        description: returnMatch[2]?.replace(/\*/g, '').trim() || null
      };
    }

    return tags;
  }
}

module.exports = { FileAnalyzer };
