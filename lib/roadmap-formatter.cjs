/**
 * RoadmapFormatter - Génère les artefacts de sortie
 *   markdownFormatter(roadmap) → string  (Markdown)
 *   jsonFormatter(roadmap)     → string  (JSON brut)
 */

/**
 * @param {Object} roadmap
 * @returns {string}
 */
function markdownFormatter(roadmap) {
  const { steps = [], stats = {}, generated, project, issueScope } = roadmap;
  const lines = [];

  lines.push('# Roadmap');
  if (project) lines.push(`> Project: **${project}**`);
  if (issueScope) lines.push(`> Issue scope: *${issueScope}*`);
  lines.push('');
  lines.push(`*Generated: ${generated}*`);
  lines.push('');

  // Stats
  lines.push('## Stats');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Nodes  | ${stats.nodes ?? '—'} |`);
  lines.push(`| Edges  | ${stats.edges ?? '—'} |`);
  lines.push(`| Levels | ${stats.levels ?? '—'} |`);
  lines.push(`| Steps  | ${stats.steps ?? '—'} |`);
  if (stats.cycles > 0) {
    lines.push(`| Cycles | ${stats.cycles} ⚠️ |`);
  }
  lines.push('');

  // Steps
  lines.push('## Steps');
  lines.push('');

  for (const step of steps) {
    lines.push(`### Step ${step.id} · ${step.label}`);
    lines.push('');

    if (step.dependsOnSteps.length > 0) {
      lines.push(`*Requires: Steps ${step.dependsOnSteps.join(', ')}*`);
    } else {
      lines.push('*No prerequisites*');
    }

    if (step.canParallelWith.length > 0) {
      lines.push(`*Parallelizable with: Steps ${step.canParallelWith.join(', ')}*`);
    }

    lines.push('');
    lines.push(`> ${step.rationale}`);
    lines.push('');

    for (const node of step.nodes) {
      const file = step.files.length === 1 ? ` → \`${step.files[0]}\`` : '';
      lines.push(`- \`${node}\`${file}`);
    }

    if (step.files.length > 1) {
      lines.push('');
      lines.push('**Files:**');
      for (const f of step.files) lines.push(`- \`${f}\``);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * @param {Object} roadmap
 * @returns {string}
 */
function jsonFormatter(roadmap) {
  return JSON.stringify(roadmap, null, 2);
}

module.exports = { markdownFormatter, jsonFormatter };
