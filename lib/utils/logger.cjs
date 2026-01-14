/**
 * Simple logger for LOLVE agents
 */

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const ICONS = {
  ContextAgent: '📂',
  CacheAgent: '💾',
  PreprocessAgent: '🔧',
  AnalysisAgent: '📊',
  ProposalAgent: '💡',
  CodeAgent: '⚙️',
  TestAgent: '🧪',
  Orchestrator: '🎯'
};

function log(agent, message, type = 'info') {
  const icon = ICONS[agent] || '•';
  const color = type === 'error' ? COLORS.red :
                type === 'success' ? COLORS.green :
                type === 'warning' ? COLORS.yellow : COLORS.cyan;
  console.log(`${color}[${agent}]${COLORS.reset} ${icon} ${message}`);
}

function section(title) {
  console.log(`\n${COLORS.bright}${'═'.repeat(50)}${COLORS.reset}`);
  console.log(`${COLORS.bright}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.bright}${'═'.repeat(50)}${COLORS.reset}\n`);
}

function list(items) {
  items.forEach(item => {
    if (typeof item === 'object' && item.label) {
      console.log(`  • ${COLORS.bright}${item.label}:${COLORS.reset} ${item.value}`);
    } else {
      console.log(`  • ${item}`);
    }
  });
}

module.exports = { log, section, list, COLORS, ICONS };
