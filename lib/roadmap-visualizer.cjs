/**
 * RoadmapVisualizer - Rendu HTML/SVG dans le langage visuel de lolve
 *
 * Chaque step de la roadmap = un Vertex (cercle + xyz)
 * Chaque dépendance        = une orb-line (flèche violette)
 * Couleurs et style        = lolve/src/style.css + DirectRenderer.vue
 *
 * Sortie : ai/roadmap.html (standalone, aucune dépendance externe)
 */

// ─── Palette lolve ────────────────────────────────────────────────────────────

const PALETTE = {
  bg:         '#12121a',
  text:       'rgba(255,255,255,0.80)',
  textDim:    'rgba(255,255,255,0.35)',
  purple:     '#c5b5f0',
  purpleDark: '#4d3fa0',
  purpleLight:'#9181f9',
  purpleMid:  '#7c6af7',
  blue:       '#a8b4f0',
  bright:     '#e8c87a',
  brighter:   '#c97844',
  shine:      '#d4a860',
  magenta:    '#c47890',
  grey:       '#d0cfd0',
};

// Couleur par skill (reprend les variables CSS de lolve)
const SKILL_COLOR = {
  domain:      PALETTE.purple,
  entrypoint:  PALETTE.brighter,
  api:         PALETTE.blue,
  integration: PALETTE.magenta,
  flow:        PALETTE.shine,
  utility:     PALETTE.purpleMid,
  internal:    'rgba(255,255,255,0.25)',
};

const SKILL_LABEL = {
  domain:      'Core',
  entrypoint:  'Entry',
  api:         'Service',
  integration: 'Integration',
  flow:        'Flow',
  utility:     'Utility',
  internal:    'Internal',
};

// ─── Layout DagOrb (port CJS de lolve/src/dag/DagOrb.js) ─────────────────────

const NODE_R      = 22;
const BRANCH_STEP = 120;
const SIBLING_GAP = 80;
const COMP_GAP    = 100;
const H_PAD       = 80;
const V_PAD       = 80;

function _dagLevels(steps) {
  // po[child] = tableau de ses parents (dependsOnSteps = [parents])
  const po = new Map(steps.map(s => [s.id, []]));
  for (const s of steps)
    for (const dep of s.dependsOnSteps)
      if (po.has(s.id)) po.get(s.id).push(dep);

  const level = new Map();
  const visiting = new Set();
  function lvl(id) {
    if (level.has(id)) return level.get(id);
    if (visiting.has(id)) { level.set(id, 0); return 0; }
    visiting.add(id);
    const parents = po.get(id) ?? [];
    const l = parents.length === 0 ? 0 : Math.max(...parents.map(lvl)) + 1;
    visiting.delete(id);
    level.set(id, l);
    return l;
  }
  for (const s of steps) lvl(s.id);
  return level;
}

function _dagComponents(steps) {
  const parent = new Map(steps.map(s => [s.id, s.id]));
  function find(x) {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  }
  function union(a, b) { parent.set(find(a), find(b)); }
  for (const s of steps)
    for (const dep of s.dependsOnSteps)
      if (parent.has(dep)) union(s.id, dep);
  const groups = new Map();
  for (const s of steps) {
    const root = find(s.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(s);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

function _spread(xs, minGap) {
  if (xs.length <= 1) return [...xs];
  const result = [...xs];
  const center = xs.reduce((s, x) => s + x, 0) / xs.length;
  for (let i = 1; i < result.length; i++)
    if (result[i] < result[i - 1] + minGap) result[i] = result[i - 1] + minGap;
  for (let i = result.length - 2; i >= 0; i--)
    if (result[i] > result[i + 1] - minGap) result[i] = result[i + 1] - minGap;
  const newCenter = result.reduce((s, x) => s + x, 0) / result.length;
  return result.map(x => x + center - newCenter);
}

function _layoutComp(compSteps, levelMap) {
  const ids = new Set(compSteps.map(s => s.id));
  const po  = new Map(compSteps.map(s => [s.id, s.dependsOnSteps.filter(d => ids.has(d))]));
  const byLevel = new Map();
  for (const s of compSteps) {
    const l = levelMap.get(s.id) ?? 0;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l).push(s.id);
  }
  for (const arr of byLevel.values()) arr.sort((a, b) => a - b);
  const pos = new Map();
  for (const lv of [...byLevel.keys()].sort((a, b) => a - b)) {
    const group = byLevel.get(lv);
    const y     = lv * BRANCH_STEP;
    if (lv === 0) {
      const totalWidth = (group.length - 1) * SIBLING_GAP;
      group.forEach((id, i) => pos.set(id, { x: -totalWidth / 2 + i * SIBLING_GAP, y }));
    } else {
      const withIdeal = group.map(id => {
        const parents = po.get(id) ?? [];
        const ix = parents.length === 0
          ? 0
          : parents.reduce((s, pid) => s + (pos.get(pid)?.x ?? 0), 0) / parents.length;
        return { id, ix };
      }).sort((a, b) => a.ix - b.ix);
      const finalX = _spread(withIdeal.map(n => n.ix), SIBLING_GAP * 0.8);
      withIdeal.forEach(({ id }, i) => pos.set(id, { x: finalX[i], y }));
    }
  }
  return pos;
}

/**
 * Calcule les positions (x, y) de chaque step via l'algorithme DagOrb.
 * @param {Object[]} steps
 * @returns {{ pos: Object, totalW: number, totalH: number }}
 */
function computeLayout(steps) {
  if (!steps.length) return { pos: {}, totalW: 0, totalH: 0 };

  const levelMap   = _dagLevels(steps);
  const components = _dagComponents(steps);

  const pos    = {};
  let offsetX  = H_PAD;

  for (const comp of components) {
    const compPos = _layoutComp(comp, levelMap);
    const xs      = [...compPos.values()].map(p => p.x);
    const minX    = Math.min(...xs);
    const maxX    = Math.max(...xs);
    for (const [id, p] of compPos) {
      pos[id] = {
        x:     p.x - minX + offsetX,
        y:     p.y + V_PAD,
        level: levelMap.get(id) ?? 0,
      };
    }
    offsetX += (maxX - minX) + COMP_GAP;
  }

  const allX  = Object.values(pos).map(p => p.x);
  const allY  = Object.values(pos).map(p => p.y);
  const totalW = Math.max(...allX) + H_PAD;
  const totalH = Math.max(...allY) + V_PAD;
  return { pos, totalW, totalH };
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function cubicBezier(x1, y1, x2, y2) {
  const dy = Math.abs(y2 - y1) * 0.5;
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── HTML generator ──────────────────────────────────────────────────────────

/**
 * Génère le HTML complet de la roadmap
 * @param {Object} roadmap
 * @returns {string}
 */
function generateHTML(roadmap) {
  const { steps: allSteps = [], stats = {}, generated, project, issueScope } = roadmap;
  if (allSteps.length === 0) return '<html><body>No steps</body></html>';

  // Ne conserver que les steps liés à des issues GitHub (si coal data disponible)
  const issueStepIds = new Set(allSteps.filter(s => (s.issues || []).length > 0).map(s => s.id));
  const steps = issueStepIds.size === 0
    ? allSteps  // pas de coal data → afficher tous les steps
    : allSteps
        .filter(s => issueStepIds.has(s.id))
        .map(s => ({ ...s, dependsOnSteps: s.dependsOnSteps.filter(d => issueStepIds.has(d)) }));

  const { pos, totalW, totalH } = computeLayout(steps);

  // ─ Defs SVG (arrow marker comme dans DefsSVG.vue de lolve) ─────────────────
  const defs = `
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10"
            refX="9" refY="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 Z" fill="${PALETTE.purpleLight}" opacity="0.7"/>
    </marker>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="vertexGrad" cx="35%" cy="35%">
      <stop offset="0%"   stop-color="rgba(255,255,255,0.15)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.0)"/>
    </radialGradient>
  </defs>`;

  // ─ Orb-lines (arêtes de dépendance) ────────────────────────────────────────
  const edgeLines = steps.flatMap(step => {
    const to = pos[step.id];
    if (!to) return [];
    return step.dependsOnSteps.map(depId => {
      const from = pos[depId];
      if (!from) return '';
      const d = cubicBezier(from.x, from.y + NODE_R, to.x, to.y - NODE_R);
      return `<path class="orb-line"
        data-from="${depId}" data-to="${step.id}"
        d="${d}" marker-end="url(#arrow)"/>`;
    });
  }).join('\n');

  // ─ Vertex circles ───────────────────────────────────────────────────────────
  const vertexCircles = steps.map(step => {
    const p = pos[step.id];
    if (!p) return '';
    const color = SKILL_COLOR[step.skill] || PALETTE.purpleMid;
    const nodesText = escHtml(step.nodes.slice(0, 3).join('\n') + (step.nodes.length > 3 ? `\n+${step.nodes.length - 3} more` : ''));
    const filesText = step.files.length > 0 ? escHtml(step.files.join('\n')) : '';

    return `
  <g class="vertex${step.isSpine ? ' spine-node' : ''}" data-id="${step.id}" data-skill="${step.skill}"
     transform="translate(${p.x},${p.y})">
    ${step.isSpine ? `<circle r="${NODE_R + 12}" fill="none" stroke="#f5c542" stroke-width="1.2" class="spine-ring"/>` : ''}
    <!-- Halo -->
    <circle r="${NODE_R + 8}" fill="${color}" opacity="0.06" class="halo"/>
    <!-- Orb circle (lolve style) -->
    <circle r="${NODE_R}" fill="${PALETTE.bg}" stroke="${color}"
            stroke-width="1.2" class="vertex-circle"/>
    <!-- Gradient overlay -->
    <circle r="${NODE_R}" fill="url(#vertexGrad)"/>
    <!-- Step number -->
    <text y="1" text-anchor="middle" dominant-baseline="middle"
          font-size="11" fill="${color}" font-weight="600" class="step-num">
      ${step.id}
    </text>
    <!-- Skill dot -->
    <circle cx="${NODE_R - 6}" cy="${-(NODE_R - 6)}" r="3"
            fill="${color}" opacity="0.9"/>
    <!-- Tooltip data (hidden) -->
    <title>${escHtml(step.label)}\n\nNodes:\n${nodesText}${filesText ? '\n\nFiles:\n' + filesText : ''}</title>
  </g>`;
  }).join('\n');

  // ─ Labels sous chaque vertex ────────────────────────────────────────────────
  const labels = steps.map(step => {
    const p = pos[step.id];
    if (!p) return '';
    const color = SKILL_COLOR[step.skill] || PALETTE.purpleMid;
    // Label court : skill + classe principale
    const parts = step.label.split(': ');
    const skillPart = parts[0] || '';
    const namePart  = parts[1] || '';
    return `
  <g transform="translate(${p.x},${p.y + NODE_R + 16})">
    <text text-anchor="middle" font-size="9" fill="${color}" opacity="0.7"
          font-family="monospace">${escHtml(skillPart)}</text>
    <text y="12" text-anchor="middle" font-size="8" fill="${PALETTE.text}" opacity="0.5"
          font-family="monospace">${escHtml(namePart.substring(0, 20))}</text>
  </g>`;
  }).join('\n');

  // ─ Level indicators ─────────────────────────────────────────────────────────
  const levelSet = new Set(Object.values(pos).map(p => p.level));
  const levelLines = [...levelSet].map(l => {
    const y = V_PAD + l * LEVEL_H;
    return `<line x1="0" y1="${y}" x2="${totalW}" y2="${y}"
      stroke="${PALETTE.purpleDark}" stroke-width="0.3" opacity="0.2" stroke-dasharray="4,8"/>
    <text x="8" y="${y - 6}" font-size="9" fill="${PALETTE.purpleMid}" opacity="0.5"
          font-family="monospace">L${l}</text>`;
  }).join('\n');

  // ─ Pré-calcul : issues partagées entre steps ────────────────────────────────
  const issueToSteps = new Map();
  for (const s of steps) {
    for (const n of (s.issues || [])) {
      if (!issueToSteps.has(n)) issueToSteps.set(n, new Set());
      issueToSteps.get(n).add(s.id);
    }
  }

  // ─ Detail panel (sidebar) ───────────────────────────────────────────────────
  const sidebarItems = steps.map(step => {
    const color = SKILL_COLOR[step.skill] || PALETTE.purpleMid;
    const nodesHTML = step.nodes.map(n =>
      `<div class="node-item">• ${escHtml(n)}</div>`
    ).join('');
    const filesHTML = step.files.map(f =>
      `<div class="file-item">↳ ${escHtml(f)}</div>`
    ).join('');
    const depsHTML = step.dependsOnSteps.length > 0
      ? `<div class="dep-list">← ${step.dependsOnSteps.map(d => `#${d}`).join(', ')}</div>`
      : `<div class="dep-list no-dep">no dependencies</div>`;

    const patternBadge = step.pattern
      ? `<span class="pattern-badge ${escHtml(step.pattern)}">${step.pattern === 'factory' ? '⬟' : step.pattern === 'repository' ? '⟳' : '↔'} ${escHtml(step.pattern)}</span>`
      : '';

    const issueChips = (step.issues || []).length > 0
      ? `<div class="step-issue-chips">${(step.issues || []).map(n => {
          const sharedCount = issueToSteps.get(n)?.size ?? 1;
          const shared = sharedCount > 1;
          return `<span class="issue-chip${shared ? ' issue-chip--shared' : ''}" title="#${n}${shared ? ` · partagé sur ${sharedCount} steps` : ''}">#${n}</span>`;
        }).join('')}</div>`
      : '';

    return `
  <div class="step-card" data-id="${step.id}" style="--step-color: ${color}">
    <div class="step-header">
      <span class="step-num-badge">${step.id}</span>
      <span class="step-label">${escHtml(step.label)}</span>
      ${patternBadge}
    </div>
    <div class="step-rationale">${escHtml(step.rationale)}</div>
    ${depsHTML}
    ${issueChips}
    <div class="step-nodes">${nodesHTML}</div>
    ${filesHTML ? `<div class="step-files">${filesHTML}</div>` : ''}
  </div>`;
  }).join('\n');

  // ─ Assemblage final ──────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roadmap · ${escHtml(project || 'project')}</title>
  <style>
    /* ── Variables lolve ───────────────────────────────── */
    :root {
      --stroke-purple-light:        ${PALETTE.purpleLight};
      --stroke-purple-light-middle: ${PALETTE.purpleMid};
      --stroke-purple-light-trigger:${PALETTE.purpleDark};
      --stroke-purple-darker:       ${PALETTE.purpleDark};
      --lolve-purple:               ${PALETTE.purple};
      --lolve-purple-dark:          ${PALETTE.purpleDark};
      --lolve-blue:                 ${PALETTE.blue};
      --lolve-bright:               ${PALETTE.bright};
      --lolve-brighter:             ${PALETTE.brighter};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: ${PALETTE.bg};
      color: ${PALETTE.text};
      font-family: monospace;
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    /* ── Graph panel ───────────────────────────────────── */
    #graph-panel {
      flex: 1;
      overflow: hidden;
      position: relative;
    }
    #graph-svg {
      width: 100%;
      height: 100%;
      cursor: grab;
    }
    #graph-svg:active { cursor: grabbing; }

    /* ── orb-lines (DirectRenderer.vue style) ─────────── */
    .orb-line {
      stroke: var(--stroke-purple-light);
      stroke-width: 0.8;
      fill: none;
      opacity: 0.35;
      transition: opacity 0.2s, stroke-width 0.2s;
    }
    .orb-line.highlight {
      opacity: 0.9;
      stroke-width: 1.5;
    }
    .orb-line.dim { opacity: 0.05; }

    /* ── Vertex circles ────────────────────────────────── */
    .vertex { cursor: pointer; }
    .vertex .vertex-circle {
      transition: stroke-width 0.15s, filter 0.15s;
    }
    .vertex:hover .vertex-circle,
    .vertex.active .vertex-circle {
      stroke-width: 2.2;
      filter: url(#glow);
    }
    .vertex .halo { transition: opacity 0.15s; }
    .vertex:hover .halo,
    .vertex.active .halo { opacity: 0.2; }

    /* ── Header ────────────────────────────────────────── */
    #header {
      position: absolute;
      top: 16px; left: 16px;
      pointer-events: none;
    }
    #header .meta {
      font-size: 9px;
      color: var(--stroke-purple-light-middle);
      opacity: 0.5;
      padding-left: 24px;
    }

    /* ── Stats pill ────────────────────────────────────── */
    #stats-bar {
      position: absolute;
      bottom: 16px; left: 16px;
      display: flex; gap: 12px;
      pointer-events: none;
    }
    .stat-pill {
      font-size: 9px;
      color: rgba(255,255,255,0.25);
      font-family: monospace;
    }

    /* ── Spine nodes (anneau doré) ─────────────────── */
    .spine-node .spine-ring {
      animation: spine-pulse 2.4s ease-in-out infinite;
    }
    @keyframes spine-pulse {
      0%, 100% { opacity: 0.5; }
      50%       { opacity: 0.9; }
    }

  </style>
</head>
<body>

<div id="graph-panel">
  <svg id="graph-svg" xmlns="http://www.w3.org/2000/svg">
    <g id="zoom-group">
      ${defs}

      <!-- Grille de niveaux -->
      <g class="level-lines">${levelLines}</g>

      <!-- Orb-lines (dépendances) -->
      <g class="orb-lines">${edgeLines}</g>

      <!-- Vertex circles -->
      <g class="vertices">${vertexCircles}</g>

      <!-- Labels -->
      <g class="labels">${labels}</g>
    </g>
  </svg>

  <!-- Header -->
  <div id="header">
    <div class="meta">
      ${escHtml(generated?.slice(0, 16).replace('T', ' ') || '')}
      ${issueScope ? ` · ${escHtml(issueScope)}` : ''}
    </div>
  </div>

  <!-- Stats -->
  <div id="stats-bar">
    <div class="stat-pill">${stats.nodes} nodes</div>
    <div class="stat-pill">${stats.edges} edges</div>
    <div class="stat-pill">${stats.levels} levels</div>
    <div class="stat-pill">${steps.length} steps</div>
  </div>

</div>

<script>
  window.__roadmapData = ${JSON.stringify({
    coalNodes: (roadmap.coalNodes || []),
    steps: steps.map(s => ({
      id: s.id, skill: s.skill, label: s.label,
      nodes: s.nodes, files: s.files, rationale: s.rationale,
      dependsOnSteps: s.dependsOnSteps,
      isSpine:    s.isSpine    || false,
      concept:    s.concept    || null,
      pattern:    s.pattern    || null,
      issues:     s.issues     || [],
      coalNodeId: s.coalNodeId || null,
    }))
  })};
</script>
<script src="/api/roadmap-js"></script>
</body>
</html>`;
}

// ─── JS d'interaction (servi dynamiquement par /api/roadmap-js) ───────────────

function getInteractionJS() {
  return `(function() {
  const roadmap = window.__roadmapData;
  if (!roadmap) return;

  // ── Pan / Zoom ─────────────────────────────────────────
  const svg   = document.getElementById('graph-svg');
  const group = document.getElementById('zoom-group');
  if (!svg || !group) return;
  let scale = 0.85, tx = 40, ty = 20;
  let dragging = false, lastX = 0, lastY = 0;

  function applyTransform() {
    group.setAttribute('transform', \`translate(\${tx},\${ty}) scale(\${scale})\`);
  }
  applyTransform();

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = -e.deltaY / 600;
    const rect  = svg.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const newScale = Math.max(0.2, Math.min(3, scale + delta));
    tx = mx - (mx - tx) * (newScale / scale);
    ty = my - (my - ty) * (newScale / scale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  svg.addEventListener('mousedown', e => {
    if (e.target.closest('.vertex')) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    tx += e.clientX - lastX; ty += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  // ── Interaction ─────────────────────────────────────────
  let activeId = null;

  function deactivate() {
    activeId = null;
    document.querySelectorAll('.vertex.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.orb-line').forEach(el => el.classList.remove('highlight', 'dim'));
  }

  function activate(id) {
    if (activeId === id) { deactivate(); return; }
    deactivate();
    activeId = id;
    const step = roadmap.steps.find(s => s.id === id);
    if (!step) return;
    const related = new Set([id, ...step.dependsOnSteps]);
    roadmap.steps.filter(s => s.dependsOnSteps.includes(id)).forEach(s => related.add(s.id));
    document.querySelectorAll('.orb-line').forEach(el => {
      const from = Number(el.dataset.from), to = Number(el.dataset.to);
      el.classList.add(related.has(from) && related.has(to) ? 'highlight' : 'dim');
    });
    related.forEach(rid => {
      document.querySelectorAll(\`.vertex[data-id="\${rid}"]\`).forEach(el => el.classList.add('active'));
    });
  }

  function activateMany(ids) {
    deactivate();
    if (!ids.length) return;
    activeId = ids[0];
    const allRelated = new Set(ids);
    ids.forEach(id => {
      const step = roadmap.steps.find(s => s.id === id);
      if (!step) return;
      step.dependsOnSteps.forEach(d => allRelated.add(d));
      roadmap.steps.filter(s => s.dependsOnSteps.includes(id)).forEach(s => allRelated.add(s.id));
    });
    document.querySelectorAll('.orb-line').forEach(el => {
      const from = Number(el.dataset.from), to = Number(el.dataset.to);
      el.classList.add(allRelated.has(from) && allRelated.has(to) ? 'highlight' : 'dim');
    });
    allRelated.forEach(rid => {
      document.querySelectorAll(\`.vertex[data-id="\${rid}"]\`).forEach(el => el.classList.add('active'));
    });
  }

  // Clics sur vertices
  document.querySelectorAll('.vertex').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); activate(Number(el.dataset.id)); });
  });
  svg.addEventListener('click', e => { if (!e.target.closest('.vertex')) deactivate(); });

  // Commandes depuis le parent (localStorage storage event — cross-frame même origine)
  window.addEventListener('storage', e => {
    if (e.key !== 'roadmap-cmd') return;
    try {
      const msg = JSON.parse(e.newValue || '{}');
      if (msg.type === 'activate') activateMany(msg.ids ?? []);
      else if (msg.type === 'deactivate') deactivate();
    } catch { /* ignore */ }
  });

  // Fit to viewport
  const bbox = group.getBBox();
  if (bbox.width && bbox.height) {
    const vw = svg.clientWidth, vh = svg.clientHeight, margin = 40;
    const s = Math.min((vw - margin * 2) / bbox.width, (vh - margin * 2) / bbox.height, 1);
    scale = s * 0.9;
    tx = (vw - bbox.width * scale) / 2 - bbox.x * scale;
    ty = (vh - bbox.height * scale) / 2 - bbox.y * scale;
    applyTransform();
  }
})();`;
}

// ─── API publique ─────────────────────────────────────────────────────────────

module.exports = { generateHTML, getInteractionJS };
