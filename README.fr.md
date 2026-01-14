# lolve-cartography

Outils de cartographie de codebase et de gestion des annotations JSDoc.

Analysez la structure de votre codebase JavaScript, generez des index de methodes et gerez les annotations JSDoc avec une taxonomie basee sur les roles.

[English version](./README.md)

## Installation

```bash
npm install lolve-cartography
```

Ou cloner et lier localement :

```bash
git clone https://github.com/youruser/lolve-cartography.git
cd lolve-cartography
npm install
npm link
```

## Demarrage rapide

```bash
# Naviguer vers votre projet
cd /path/to/your/project

# Generer l'index des methodes
lolve-cartography annotate index

# Auditer les annotations manquantes
lolve-cartography annotate audit

# Generer des suggestions d'annotations
lolve-cartography annotate suggest

# Voir les statistiques
lolve-cartography annotate stats
```

## Vue d'ensemble de l'architecture

lolve-cartography utilise une **architecture multi-agents** pour analyser les codebases et gerer les annotations intelligemment. Chaque agent a une responsabilite specifique et collabore avec les autres via un orchestrateur.

```
                     ┌──────────────────┐
                     │   Orchestrator   │
                     │  (Coordination)  │
                     └────────┬─────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ContextAgent │    │AnalysisAgent │    │ProposalAgent │
│ (Decouverte)│    │(Decomposition│    │ (Approches)  │
└──────────────┘    └──────────────┘    └──────────────┘
       │
       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│PreprocessAgent    │  CacheAgent  │    │ CodeAgent    │
│ (Nettoyage)  │    │   (Q&R)      │    │(Generation)  │
└──────────────┘    └──────────────┘    └──────────────┘
```

### Description des agents

| Agent | Role | Fonctionnalites cles |
|-------|------|----------------------|
| **ContextAgent** | Analyse les requetes, identifie les fichiers et methodes pertinents | Indexation fichiers/methodes, classification par categorie, recherche progressive |
| **AnalysisAgent** | Decompose les demandes en sous-taches | Evaluation de complexite, identification des risques, generation de plan d'action |
| **ProposalAgent** | Propose des approches avec avantages/inconvenients | 2-3 alternatives par demande, extraits de code, evaluation de difficulte |
| **PreprocessAgent** | Nettoie et enrichit les requetes | Suppression des formules de politesse, normalisation des termes domaine, detection d'intention |
| **CacheAgent** | Stocke les paires Q&R frequentes | Detection de similarite Levenshtein, gestion TTL |
| **CodeAgent** | Genere et valide le code | Application de patterns, execution de tests |

## Granularite au niveau methode

lolve-cartography opere au **niveau methode** plutot qu'au niveau fichier. Cette approche granulaire permet :

- **Ciblage precis** : Trouver exactement les methodes pertinentes pour une requete
- **Economie de tokens** : Charger uniquement le necessaire, pas des fichiers entiers
- **Suivi des dependances** : Suivre les appels de methodes et les consommateurs
- **Chargement progressif** : Commencer par les metadonnees, etendre au code a la demande

### Niveaux de recherche

Le systeme supporte 5 niveaux de detail progressifs :

| Niveau | Contenu | Cas d'usage |
|--------|---------|-------------|
| **0** | Cles seulement (`Orb.novaFormae`) | Enumeration rapide |
| **1** | + Descriptions | Decouverte initiale |
| **2** | + Signatures completes, effets, consommateurs | Analyse detaillee |
| **3** | + Code des methodes | Revue d'implementation |
| **4** | + Fichiers complets | Contexte complet en dernier recours |

### Workflow SearchSession

Les agents travaillent par **raffinement iteratif** :

1. **Recherche initiale (L1)** : Trouver les methodes pertinentes depuis l'index annote
2. **Exclusion** : Retirer les faux positifs sans relancer la recherche
3. **Chargement de code (L3)** : Charger le code uniquement pour les meilleurs candidats
4. **Expansion** : Suivre les dependances pour decouvrir des methodes liees
5. **Fichier complet (L4)** : Recourir aux fichiers complets si necessaire

```javascript
// Exemple : Construction progressive du contexte
const session = agent.createSearchSession("vertex creation orb");

// Niveau 1 : Obtenir les metadonnees (leger)
console.log(session.results); // 15 methodes, ~500 tokens

// Exclure les faux positifs
session.exclude(['Forma.getSlot', 'Rosa.reindex']);

// Charger le code pour le top 3 seulement
session.loadCode(session.keys.slice(0, 3)); // ~2000 tokens

// Etendre pour trouver les methodes liees
session.expand('Orb.novaFormae', { direction: 'both' });

// Total : ~3000 tokens vs ~50000 si chargement de tous les fichiers
```

## Annotation JIT (Just-In-Time)

lolve-cartography utilise un **systeme d'annotation JIT** qui genere les annotations a la demande quand elles sont necessaires, plutot que d'exiger toutes les annotations au prealable.

### Fonctionnement de l'annotation JIT

```
┌─────────────────────────────────────────────────────────────┐
│                    Pipeline d'Annotation                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Methode Decouverte   2. Verifier Cache   3. Generer     │
│  ┌──────────────┐       ┌─────────────┐    ┌────────────┐  │
│  │ findMethods()│──────▶│BodyHash OK?│───▶│Utiliser    │  │
│  └──────────────┘       └──────┬──────┘    │   Cache    │  │
│                                │ NON       └────────────┘  │
│                                ▼                            │
│                         ┌─────────────┐    ┌────────────┐  │
│                         │Generer      │───▶│Sauvegarder │  │
│                         │(LLM ou AST) │    │   Cache    │  │
│                         └─────────────┘    └────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Types de statut d'annotation

| Statut | Description | Action |
|--------|-------------|--------|
| **complete** | Annotation existe et hash du body correspond | Utiliser tel quel |
| **outdated** | Annotation existe mais le code a change | Re-generer |
| **partial** | Certains champs manquent (ex: pas d'effets) | Enrichir |
| **missing** | Aucune annotation trouvee | Generer de zero |

### Generation d'annotations

```javascript
// Verifier le statut des annotations
const status = session.checkAnnotations();
// { complete: ['Orb.nova'], outdated: ['Vertex.link'], missing: ['Apex.promote'] }

// Obtenir les methodes necessitant annotation avec leur code
const { needsAnnotation, tokensEstimate } = session.getMethodsNeedingAnnotation({
  includeOutdated: true,
  maxMethods: 5
});

// Generer un prompt pour annotation LLM
const { prompt } = session.generateAnnotationPrompt();

// Appliquer les annotations recues au cache
session.applyAnnotations([
  { key: 'Apex.promote', role: 'flow', description: 'Promeut Apex en Vertex' }
]);
```

## Taxonomie des roles

L'outil utilise une taxonomie coherente pour la classification des methodes :

| Role | Description | Exemple |
|------|-------------|---------|
| `entry` | Point d'entree unique, bootstrap du systeme | `Biblio.genesis()` |
| `core` | Orchestration, logique metier centrale | `Orb.novaFormae()` |
| `service` | API consommee par d'autres classes | `Codex.nova()` |
| `flow` | Propagation recursive, controle du cycle de vie | `Unda.kyklos()` |
| `bridge` | Connecte deux domaines distincts | `Display.sync()` |
| `helper` | Factory, utilitaires purs | `Clavis.generate()` |
| `internal` | Implementation privee | `#computeAngle()` |
| `adapter` | Transformation de format/donnees | `Delta.toCartesian()` |

## Annotations supportees

```javascript
/**
 * @role service
 * @effect creates: Vertex, Forma
 * @effect mutates: this.orb
 * @effect emits: events
 * @consumer Unda.kyklos, Biblio.genesis
 * @context requires: this.$
 * @context provides: Vertex
 */
```

## Commandes CLI

### CLI principal

```bash
lolve-cartography <commande> [options]
```

### Raccourcis

```bash
lc-annotate <sous-commande>  # Gestion des annotations
lc-index                      # Generation de l'index
```

### Commandes

| Commande | Description |
|----------|-------------|
| `annotate audit` | Liste les annotations manquantes |
| `annotate suggest` | Genere des suggestions d'annotations |
| `annotate apply` | Genere un rapport Markdown avec les annotations a copier |
| `annotate stats` | Affiche les statistiques d'annotations |
| `annotate index` | Genere/met a jour l'index des methodes |
| `index` | Raccourci pour `annotate index` |

### Options

| Option | Description |
|--------|-------------|
| `--project <path>` | Chemin du projet a analyser (defaut: repertoire courant) |
| `--file <nom>` | Cibler un fichier specifique (nom partiel accepte) |
| `--force, -f` | Force la re-indexation complete |

### Variables d'environnement

| Variable | Description |
|----------|-------------|
| `LC_PROJECT_PATH` | Alternative a l'option `--project` |

## API programmatique

```javascript
const {
  MethodIndexer,
  AnnotationCache,
  SourceParser,
  SuggestionGenerator,
  ContextAgent
} = require('lolve-cartography');

// Generer l'index des methodes
const indexer = new MethodIndexer();
indexer.indexAll({ force: true });

// Parser le code source
const parser = new SourceParser();
const parsed = parser.parseFile('/path/to/file.js');

// Generer des suggestions
const generator = new SuggestionGenerator();
const suggestions = generator.generateAll();

// Utiliser ContextAgent pour une recherche intelligente
const agent = new ContextAgent(config);
await agent.init();

const session = agent.createSearchSession("find vertex creation");
const context = session.toContext({ includeCode: true });
```

## Resultats du benchmark

Le systeme a ete benchmarke en comparant differentes approches de chargement de contexte. Les resultats demontrent des economies de tokens significatives avec l'approche progressive :

### Comparaison de l'utilisation des tokens

| Approche | Tokens (est.) | % de la baseline | Economie |
|----------|---------------|------------------|----------|
| **Lourde** (fichiers complets) | ~50 000 | 100% | - |
| **Legere L1** (metadonnees) | ~500 | 1% | **99%** |
| **Legere L2** (signatures) | ~1 500 | 3% | **97%** |
| **Legere L3** (+ code) | ~8 000 | 16% | **84%** |
| **Hybride** (sig + top 3 code) | ~3 000 | 6% | **94%** |

### Conclusions cles

1. **Reduction de 99% des tokens** possible avec l'approche metadonnees seules (L1)
2. **Approche hybride recommandee** : Signatures completes pour toutes les methodes + code pour les 3 meilleurs candidats
3. **Chargement progressif** permet d'adapter le niveau de detail selon les besoins reels
4. **Operations SearchSession** (exclude, expand) ont un overhead minimal

### Resultats de la simulation de workflow

Une simulation de workflow d'agent a montre :
- **Recherche initiale** : 10 methodes, ~300 tokens
- **Apres exclusions** : 8 methodes
- **Chargement code (top 3)** : +1 500 tokens
- **Expansion** : +2 methodes liees
- **Total** : ~2 000 tokens vs ~50 000 si chargement de tous les fichiers pertinents

**Recommandation** : Utiliser l'approche hybride (L2 + L3 selectif) pour un equilibre optimal entre richesse du contexte et economie de tokens.

## Structure du projet

```
lolve-cartography/
├── package.json
├── README.md
├── README.fr.md
├── bin/
│   ├── cli.cjs           # CLI principal
│   ├── annotate.cjs      # Raccourci lc-annotate
│   └── index.cjs         # Raccourci lc-index
├── lib/
│   ├── index.cjs         # Point d'entree principal
│   ├── orchestrator.cjs  # Coordination des agents
│   ├── context-agent.cjs # Decouverte fichiers/methodes
│   ├── analysis-agent.cjs # Decomposition des taches
│   ├── proposal-agent.cjs # Suggestions d'approches
│   ├── preprocess-agent.cjs # Nettoyage des requetes
│   ├── cache-agent.cjs   # Cache Q&R
│   ├── annotation-manager.cjs
│   ├── method-indexer.cjs
│   ├── context-benchmark.cjs # Tests de performance
│   └── utils/
│       ├── logger.cjs
│       └── file-utils.cjs
└── .cache/               # Cache genere (gitignore)
```

## Pre-requis

- Node.js >= 18.0.0
- Votre projet doit avoir un repertoire `src/` (configurable)

## Licence

MIT
