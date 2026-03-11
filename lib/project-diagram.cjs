'use strict';
const fs = require('fs');
const path = require('path');

function loadAnnotCache(annotCachePath) {
  try {
    return JSON.parse(fs.readFileSync(annotCachePath, 'utf-8')).annotations ?? {};
  } catch {
    return {};
  }
}

function generateDiagram(projectRoot) {
  const indexPath = path.join(projectRoot, '.cache', 'method-index.json');
  const annotCachePath = path.join(projectRoot, '.cache', 'annotation-cache.json');

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch (e) {
    throw new Error(`Cannot read method-index.json: ${e.message}`);
  }

  const methods = raw.methods ?? {};
  const annots = loadAnnotCache(annotCachePath);

  // Merge annots into methods
  for (const [key, method] of Object.entries(methods)) {
    if (annots[key]) {
      method.role ??= annots[key].role;
      method.description ??= annots[key].description;
    }
  }

  // Stats
  const totalMethods = Object.keys(methods).length;
  const described = Object.values(methods).filter(m => m.description).length;
  const files = new Set(Object.values(methods).map(m => m.file).filter(Boolean)).size;

  // Group by role
  const byRole = {};
  for (const [key, method] of Object.entries(methods)) {
    if (method.role) {
      if (!byRole[method.role]) byRole[method.role] = [];
      byRole[method.role].push(key.split('.').pop() ?? key);
    }
  }

  // Group by module directory
  const byModule = {};
  for (const [key, method] of Object.entries(methods)) {
    const file = method.file ?? 'unknown';
    const dir = path.dirname(file);
    if (!byModule[dir]) byModule[dir] = {};
    const cls = key.includes('.') ? key.split('.')[0] : key;
    if (!byModule[dir][cls]) byModule[dir][cls] = [];
    const sig = method.signature ?? (key.includes('.') ? key.split('.').pop() : key);
    if (!byModule[dir][cls].includes(sig)) {
      byModule[dir][cls].push(sig);
    }
  }

  const projectName = path.basename(projectRoot);
  const date = new Date().toISOString().slice(0, 10);

  const lines = [];
  lines.push(`# Project Diagram — ${projectName}`);
  lines.push(`Generated: ${date}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Methods: ${totalMethods} | Described: ${described} | Files: ${files}`);
  lines.push('');

  if (Object.keys(byRole).length > 0) {
    lines.push('## Roles');
    for (const [role, names] of Object.entries(byRole).sort()) {
      lines.push(`- ${role} (${names.length}): ${names.join(', ')}`);
    }
    lines.push('');
  }

  if (Object.keys(byModule).length > 0) {
    lines.push('## Modules');
    for (const [dir, classes] of Object.entries(byModule).sort()) {
      const count = Object.values(classes).flat().length;
      lines.push(`### ${dir}/ (${count} methods)`);
      for (const [cls, sigs] of Object.entries(classes).sort()) {
        lines.push(`  ${cls}: ${sigs.join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

module.exports = { generateDiagram };
