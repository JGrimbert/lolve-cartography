# CLAUDE.md - lolve-cartography

## Project Overview

lolve-cartography est un outil d'analyse et d'indexation de codebase JavaScript. Il génère des index de méthodes avec métadonnées inférées automatiquement (rôles, effets, consommateurs).

## Commands

```bash
# Générer/mettre à jour l'index des méthodes
node bin/cli.cjs annotate index

# Scanner la codebase
node bin/cli.cjs annotate scan

# Enrichir avec métadonnées inférées
node bin/cli.cjs annotate enrich

# Statistiques
node bin/cli.cjs annotate stats

# Tester sur un projet externe
node bin/cli.cjs --project /path/to/project annotate index
```

## Architecture

```
lib/
├── annotation-manager.cjs   # Commandes scan, enrich, stats
├── method-indexer.cjs       # Indexation AST avec Acorn
├── context-agent.cjs        # Agent de découverte de contexte
├── orchestrator.cjs         # Coordination des agents
├── analysis-agent.cjs       # Décomposition des tâches
├── proposal-agent.cjs       # Suggestions d'approches
├── preprocess-agent.cjs     # Nettoyage des requêtes
├── cache-agent.cjs          # Cache Q&A
└── utils/
    ├── logger.cjs           # Logging coloré
    └── file-utils.cjs       # Utilitaires fichiers
```

## Key Concepts

### Method Indexer
- Parse les fichiers avec Acorn (AST)
- Extrait classes, méthodes, fonctions
- Infère les rôles automatiquement par heuristiques
- Génère un index JSON incrémental

### Role Taxonomy
| Role | Description |
|------|-------------|
| `entry` | Point d'entrée unique |
| `core` | Logique métier centrale |
| `service` | API consommée par d'autres |
| `flow` | Propagation récursive |
| `bridge` | Connecte deux domaines |
| `helper` | Factory, utilitaires purs |
| `internal` | Implémentation privée |
| `adapter` | Transformation de données |

### Generated Files
- `.cache/method-index.json` : Index principal des méthodes
- `.cache/annotation-suggestions.json` : Cartographie enrichie

## Testing Changes

Pour tester les modifications :
```bash
# Tester sur ce projet même
node bin/cli.cjs --project . annotate scan

# Tester sur lolve
node bin/cli.cjs --project C:/lolve annotate index
```

## Code Style

- CommonJS (`.cjs`)
- Classes ES6
- JSDoc pour la documentation
- Logging via `utils/logger.cjs`
