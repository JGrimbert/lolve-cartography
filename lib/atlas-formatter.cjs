/**
 * Atlas Formatters — 3 sorties markdown AI-friendly
 *
 *   repoMapFormatter(atlas)      → /ai/repo-map.md
 *   compressedFormatter(atlas)   → /ai/atlas.compressed.md
 *   dependencyFormatter(atlas)   → /ai/atlas.dependencies.md
 */

const path = require('path');

// ─── repoMapFormatter ─────────────────────────────────────────────────────────

/**
 * Arborescence indentée des fichiers sources (sans prose).
 *
 * @param {import('./atlas.cjs').Atlas} atlas
 * @returns {string}
 */
function repoMapFormatter(atlas) {
  const files = atlas.repo.files;
  if (!files || files.length === 0) return 'REPO MAP\n\n(empty)\n';

  // Construire un arbre à partir des chemins
  const tree = {};
  for (const f of files) {
    const parts = f.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = null; // feuille
  }

  const lines = ['REPO MAP', ''];

  function renderNode(node, indent) {
    const keys = Object.keys(node).sort((a, b) => {
      // dossiers avant fichiers
      const aIsDir = node[a] !== null;
      const bIsDir = node[b] !== null;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });
    for (const key of keys) {
      if (node[key] !== null) {
        lines.push(indent + key + '/');
        renderNode(node[key], indent + '  ');
      } else {
        lines.push(indent + key);
      }
    }
  }

  renderNode(tree, '');
  return lines.join('\n') + '\n';
}

// ─── compressedFormatter ──────────────────────────────────────────────────────

/**
 * Atlas compressé ≤ 50 lignes : SYSTEM / MODULES / API / FLOW
 *
 * @param {import('./atlas.cjs').Atlas} atlas
 * @returns {string}
 */
function compressedFormatter(atlas) {
  const lines = [];

  // ── SYSTEM ────────────────────────────────────────────────────────────────
  lines.push('SYSTEM');
  const root = atlas.meta.root || '';
  const projectName = root ? path.basename(root) : 'unknown';
  lines.push(projectName + ' — codebase cartography and method indexing tools');
  lines.push('');

  // ── MODULES ───────────────────────────────────────────────────────────────
  lines.push('MODULES');
  const classEntries = Object.entries(atlas.syms.classes);
  if (classEntries.length === 0) {
    lines.push('(no classes indexed)');
  } else {
    // Trier par fichier pour regrouper par module
    const byFile = {};
    for (const [name, data] of classEntries) {
      const f = (data.file || 'unknown').replace(/\\/g, '/');
      byFile[f] = byFile[f] || [];
      byFile[f].push(name);
    }
    const filesSorted = Object.keys(byFile).sort();
    // N'afficher que les N premiers pour rester sous 50 lignes
    const maxModules = Math.min(filesSorted.length, 8);
    for (let i = 0; i < maxModules; i++) {
      const f = filesSorted[i].replace(/\\/g, '/');
      const shortF = f.replace(/^.*\/([^/]+)$/, '$1');
      lines.push(`${shortF}  ${byFile[f].join(', ')}`);
    }
    if (filesSorted.length > maxModules) {
      lines.push(`... +${filesSorted.length - maxModules} more`);
    }
  }
  lines.push('');

  // ── API ───────────────────────────────────────────────────────────────────
  lines.push('API');
  lines.push('');

  // Sélectionner les classes les plus importantes (scores les plus élevés)
  const scores  = atlas._scores || {};
  const classes = Object.keys(atlas.syms.classes);

  // Score par classe = somme des scores de ses méthodes
  const classScore = {};
  for (const cls of classes) {
    let s = 0;
    for (const m of (atlas.syms.classes[cls].methods || [])) {
      s += scores[`${cls}.${m}`] || 0;
    }
    classScore[cls] = s;
  }

  const topClasses = classes
    .sort((a, b) => classScore[b] - classScore[a])
    .slice(0, 6);

  const linesAvail = 50 - lines.length - 6; // réserver pour FLOW
  let linesUsed = 0;
  for (const cls of topClasses) {
    if (linesUsed >= linesAvail) break;
    lines.push('class ' + cls);
    linesUsed++;
    const methods = atlas.syms.classes[cls].methods || [];
    for (const m of methods.slice(0, 4)) {
      if (linesUsed >= linesAvail) break;
      const sig = atlas.syms.methods[`${cls}.${m}`]?.signature || m + '()';
      lines.push('  ' + sig);
      linesUsed++;
    }
    if (methods.length > 4) {
      lines.push(`  ... +${methods.length - 4} more`);
      linesUsed++;
    }
    lines.push('');
    linesUsed++;
  }

  // ── FLOW ──────────────────────────────────────────────────────────────────
  lines.push('FLOW');
  lines.push('');

  // Nœuds avec rôle entry ou core ayant des appels sortants
  const flowEntries = Object.entries(atlas.calls)
    .filter(([caller]) => {
      const role = atlas.syms.methods[caller]?.role;
      return role === 'entry' || role === 'core';
    })
    .sort(([a], [b]) => (scores[b] || 0) - (scores[a] || 0))
    .slice(0, 4);

  if (flowEntries.length === 0) {
    // Fallback : prendre les nœuds avec le plus d'appels sortants
    const top = Object.entries(atlas.calls)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 3);
    for (const [caller, callees] of top) {
      lines.push(caller + ' ->');
      for (const c of callees.slice(0, 3)) lines.push('  ' + c);
      lines.push('');
    }
  } else {
    for (const [caller, callees] of flowEntries) {
      lines.push(caller + ' ->');
      for (const c of callees.slice(0, 3)) lines.push('  ' + c);
      lines.push('');
    }
  }

  // Tronquer à 50 lignes si nécessaire
  const result = lines.slice(0, 50);
  return result.join('\n') + '\n';
}

// ─── dependencyFormatter ──────────────────────────────────────────────────────

/**
 * Graphe de dépendances avec scores et MODULE DEPS
 *
 * @param {import('./atlas.cjs').Atlas} atlas
 * @returns {string}
 */
function dependencyFormatter(atlas) {
  const scores = atlas._scores || {};
  const lines  = ['DEPENDENCY ATLAS', ''];

  // ── Noeuds triés par score décroissant ────────────────────────────────────
  const nodes = Object.entries(atlas.calls)
    .sort(([a], [b]) => (scores[b] || 0) - (scores[a] || 0));

  if (nodes.length === 0) {
    lines.push('(no call graph data)');
  } else {
    for (const [caller, callees] of nodes) {
      const score = scores[caller] || 0;
      lines.push(`${caller} (score: ${score})`);
      for (const c of callees) {
        lines.push(`  -> ${c}`);
      }
      lines.push('');
    }
  }

  // ── MODULE DEPS ───────────────────────────────────────────────────────────
  lines.push('MODULE DEPS');
  lines.push('');

  const modEntries = Object.entries(atlas.mods).sort(([a], [b]) => a.localeCompare(b));
  if (modEntries.length === 0) {
    lines.push('(no module dependency data)');
  } else {
    for (const [modFile, deps] of modEntries) {
      lines.push(modFile);
      for (const dep of deps) {
        lines.push(`  -> ${dep}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n') + '\n';
}

module.exports = { repoMapFormatter, compressedFormatter, dependencyFormatter };
