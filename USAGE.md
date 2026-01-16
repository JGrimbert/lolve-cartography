# Guide d'utilisation de lolve-cartography

## Installation

### Dans un projet (recommandé)
```bash
npm install github:JGrimbert/lolve-cartography --save-dev
```

### Globalement
```bash
npm install -g github:JGrimbert/lolve-cartography
```

## Commandes CLI

### Index complet (RECOMMANDÉ)
```bash
# Dans le projet courant - génère l'index avec roles, effects et consumers
npx lolve-cartography annotate full

# Forcer la ré-indexation complète
npx lolve-cartography annotate full --force

# Sur un projet spécifique
npx lolve-cartography --project /path/to/project annotate full
```

### Commandes individuelles
```bash
npx lolve-cartography annotate index     # Index avec roles uniquement
npx lolve-cartography annotate enrich    # Analyser effects & consumers (fichier séparé)
npx lolve-cartography annotate scan      # Aperçu des enrichissements possibles
npx lolve-cartography annotate stats     # Voir les statistiques
```

## Utilisation avec Claude Code

### Configuration des skills

Créez `.claude/commands/cartography.md` :
```markdown
# Commande /cartography

## Instructions

Génère l'index :
\`\`\`bash
npx lolve-cartography annotate index
\`\`\`

Pour scanner :
\`\`\`bash
npx lolve-cartography annotate scan
\`\`\`
```

### Où trouver l'index

Après génération, l'index est dans :
```
node_modules/lolve-cartography/lib/.cache/method-index.json
```

### Structure de l'index

```json
{
  "version": 1,
  "generated": "2024-01-15T10:30:00.000Z",
  "files": {
    "src/prima/Peri/Aion/Orb.js": {
      "mtime": 1705315800000,
      "size": 8500,
      "hash": "abc123def456",
      "classCount": 1,
      "methodCount": 12
    }
  },
  "classes": {
    "Orb": {
      "file": "src/prima/Peri/Aion/Orb.js",
      "extends": "Aion",
      "line": 15,
      "methodCount": 12
    }
  },
  "methods": {
    "Orb.nova": {
      "file": "src/prima/Peri/Aion/Orb.js",
      "class": "Orb",
      "signature": "nova(biblio, vertex)",
      "isStatic": true,
      "role": "helper",
      "effects": { "creates": ["Orb"] },
      "consumers": ["Vertex.genesis"],
      "line": 25,
      "endLine": 45
    }
  }
}
```

### Utiliser l'index dans Claude Code

1. **Générer l'index** :
   ```
   /cartography index
   ```

2. **Lire l'index** pour trouver une méthode :
   ```
   Lis node_modules/lolve-cartography/lib/.cache/method-index.json
   et trouve les infos sur Orb.nova
   ```

3. **Accéder au code source** :
   L'index indique le fichier et les lignes, utilisez Read pour voir le code.

## Rôles inférés automatiquement

| Pattern | Rôle inféré |
|---------|-------------|
| `nova()` | `helper` |
| `init*()` | `entry` |
| `genesis()` | `flow` |
| `create*()`, `build*()` | `core` |
| `get*()`, `find*()`, `update*()` | `service` |
| `adapt()`, `transform*()` | `adapter` |
| `#*()`, `_*()` | `internal` |

## API Programmatique

```javascript
const { MethodIndexer, ContextAgent } = require('lolve-cartography');

// Générer l'index
const indexer = new MethodIndexer();
indexer.indexAll({ force: true });

// Chercher des méthodes
const results = indexer.searchMethods({
  role: 'core',
  class: 'Orb'
});

// Extraire le code d'une méthode
const code = indexer.extractMethodCode('Orb.nova');
```

## Workflow recommandé pour Claude Code

1. **Au début d'une session** :
   ```
   /cartography index
   ```

2. **Pour comprendre une partie du code** :
   - Consulter l'index pour les signatures et rôles
   - Suivre les consumers/effects pour les dépendances
   - Lire le code source si nécessaire

3. **Pour modifier du code** :
   - Identifier les méthodes concernées via l'index
   - Vérifier les consumers pour l'impact
   - Lire le code complet avant modification

## Dépannage

### L'index n'est pas à jour
```bash
npx lolve-cartography annotate index --force
```

### Le projet n'a pas de dossier src/
Configurez `LC_PROJECT_PATH` ou utilisez `--project`.

### Erreurs de parsing
Certains fichiers avec syntaxe non standard peuvent échouer.
Vérifiez les warnings dans la sortie.
