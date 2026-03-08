/**
 * Configuration Loader
 * Charge la configuration depuis le projet parent
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  project: {
    name: 'unknown',
    rootPath: '.',
    srcPath: 'src'  // Par défaut src/, fallback sur lib/
  },
  agents: {
    context: { enabled: true },
    cache: { enabled: true },
    preprocess: { enabled: true },
    analysis: { enabled: true },
    proposal: { enabled: true }
  }
};

/**
 * Fusionne deux objets récursivement
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Détecte automatiquement le dossier source
 */
function detectSourcePath(projectRoot) {
  const srcPath = path.join(projectRoot, 'src');
  const libPath = path.join(projectRoot, 'lib');

  if (fs.existsSync(srcPath)) {
    return 'src';
  } else if (fs.existsSync(libPath)) {
    return 'lib';
  }
  return 'src';  // Défaut
}

/**
 * Charge la configuration du projet
 *
 * Ordre de recherche :
 * 1. .lolve-cartography.json à la racine du projet
 * 2. Clé "lolve-cartography" dans package.json
 * 3. agents.config.json (legacy)
 * 4. Valeurs par défaut avec auto-détection
 */
function loadProjectConfig(projectRoot = process.cwd()) {
  let userConfig = {};

  // 1. Chercher .lolve-cartography.json
  const configFilePath = path.join(projectRoot, '.cache/lolve-cartography.json');
  if (fs.existsSync(configFilePath)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
      userConfig._source = '.cache/lolve-cartography.json';
    } catch (e) {
      console.warn(`Warning: Invalid .lolve-cartography.json: ${e.message}`);
    }
  }

  // Auto-détection du srcPath si non spécifié
  if (!userConfig.project?.srcPath) {
    userConfig.project = userConfig.project || {};
    userConfig.project.srcPath = detectSourcePath(projectRoot);
  }

  // Résoudre rootPath en absolu
  userConfig.project = userConfig.project || {};
  userConfig.project.rootPath = projectRoot;

  // Fusionner avec les défauts
  const config = deepMerge(DEFAULT_CONFIG, userConfig);

  // Calculer srcPath absolu
  config.project.srcPathAbsolute = path.join(projectRoot, config.project.srcPath);

  return config;
}

/**
 * Charge la configuration du module (interne)
 */
function loadModuleConfig() {
  const moduleRoot = path.resolve(__dirname, '../..');
  const configPath = path.join(moduleRoot, 'lib', 'agents.config.json');

  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

module.exports = {
  loadProjectConfig,
  loadModuleConfig,
  detectSourcePath,
  deepMerge,
  DEFAULT_CONFIG
};
