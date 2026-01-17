#!/usr/bin/env node

/**
 * Configure les hooks Claude Code pour enforcer le workflow MCP
 *
 * Usage: node node_modules/lolve-cartography/lib/setup-claude-hooks.cjs
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function log(message, type = 'info') {
  const prefix = {
    info: `${COLORS.cyan}ℹ${COLORS.reset}`,
    success: `${COLORS.green}✓${COLORS.reset}`,
    warning: `${COLORS.yellow}⚠${COLORS.reset}`,
    error: `${COLORS.red}✗${COLORS.reset}`
  };
  console.log(`${prefix[type] || ''} ${message}`);
}

function main() {
  const projectRoot = process.cwd();
  const claudeDir = path.join(projectRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');

  console.log(`\n${COLORS.bright}${COLORS.cyan}Configuration des hooks Claude Code${COLORS.reset}\n`);

  // Créer le dossier .claude si nécessaire
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    log('Dossier .claude créé', 'success');
  }

  // Lire les settings existants
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      log('Settings existants chargés', 'info');
    } catch (e) {
      log('Erreur de lecture des settings, création de nouveaux settings', 'warning');
    }
  }

  // Hook configuration
  const newHooks = {
    PreToolUse: [
      {
        matcher: 'Read',
        hooks: [
          {
            type: 'command',
            command: 'node node_modules/lolve-cartography/lib/hooks/pre-read-hook.cjs'
          }
        ]
      },
      {
        matcher: 'Edit|Write',
        hooks: [
          {
            type: 'command',
            command: 'node node_modules/lolve-cartography/lib/hooks/pre-edit-hook.cjs'
          }
        ]
      }
    ]
  };

  // Vérifier si les hooks sont déjà configurés
  const existingHooks = settings.hooks?.PreToolUse || [];
  const alreadyConfigured = existingHooks.some(h =>
    h.matcher === 'Read' &&
    h.hooks?.some(hook => hook.command?.includes('pre-read-hook.cjs'))
  );

  if (alreadyConfigured) {
    log('Les hooks sont déjà configurés', 'success');
    return;
  }

  // Merger les hooks existants avec les nouveaux
  if (settings.hooks?.PreToolUse) {
    settings.hooks.PreToolUse = [...settings.hooks.PreToolUse, ...newHooks.PreToolUse];
  } else {
    settings.hooks = { ...settings.hooks, ...newHooks };
  }

  console.warn("HAAAA", settingsPath)

  // Écrire les settings
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  log('Hooks configurés dans .claude/settings.local.json', 'success');

  // Vérifier que le hook script existe
  const hookPath = path.join(projectRoot, 'node_modules/lolve-cartography/lib/hooks/pre-read-hook.cjs');
  if (fs.existsSync(hookPath)) {
    log('Script de hook trouvé', 'success');
  } else {
    log(`Script de hook non trouvé: ${hookPath}`, 'warning');
    log('Vérifiez que lolve-cartography est bien installé', 'warning');
  }

  console.log(`
${COLORS.bright}Configuration terminée !${COLORS.reset}

Le hook va maintenant bloquer les lectures directes sur src/**/*.js
et rappeler d'utiliser extract_methods à la place.

${COLORS.yellow}Redémarrez Claude Code pour activer les hooks.${COLORS.reset}
`);
}

main();
