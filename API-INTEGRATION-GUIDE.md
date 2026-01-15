# Intégration API Anthropic - Guide d'utilisation

## 🚀 Vue d'ensemble

Cette intégration permet d'utiliser l'API Anthropic directement depuis votre orchestrator, avec **optimisation par méthode** pour économiser jusqu'à **95% de tokens**.

## 📋 Prérequis

1. **Clé API Anthropic**
   - Créez un compte sur https://console.anthropic.com
   - Générez une clé API
   - Ajoutez des crédits à votre compte

2. **Node.js**
   - Version 18+ recommandée

## ⚙️ Configuration

### 1. Créer le fichier .env

```bash
# À la racine de votre projet
cp .env.example .env
```

### 2. Ajouter votre clé API

Éditez `.env` et remplacez par votre vraie clé :

```env
ANTHROPIC_API_KEY=sk-ant-api03-votre-vraie-clé-ici
```

### 3. Vérifier .gitignore

Assurez-vous que `.env` est dans votre `.gitignore` :

```gitignore
.env
.cache/
node_modules/
```

## 📊 Utilisation

### Orchestrator (mode API)

```bash
# Exécution normale avec API
node lib/orchestrator.cjs "ajoute une fonction pour calculer l'aire"

# Mode quick (sans propositions)
node lib/orchestrator.cjs --quick "corrige le bug dans Vertex"

# Mode dry-run (affiche le prompt sans appeler l'API)
node lib/orchestrator.cjs --dry-run "refactor Rosa"

# Sauvegarder la réponse
node lib/orchestrator.cjs --output response.md "optimise le rendu"

# Mode verbose (logs détaillés)
node lib/orchestrator.cjs --verbose "ajoute des tests"
```

### Agent de Monitoring

```bash
# Afficher les statistiques
node lib/monitoring-agent.cjs stats

# Générer un rapport JSON
node lib/monitoring-agent.cjs report

# Générer un dashboard HTML interactif (requiert API)
node lib/monitoring-agent.cjs dashboard

# Spécifier le dossier de sortie
node lib/monitoring-agent.cjs dashboard --output-dir ./reports
```

## 💡 Comment ça marche

### 1. Analyse locale

Les agents analysent votre code **localement** :
- ✅ ContextAgent trouve les méthodes pertinentes
- ✅ PreprocessAgent nettoie la requête
- ✅ AnalysisAgent évalue la complexité
- ✅ ProposalAgent suggère des approches

**Aucune donnée n'est envoyée à ce stade !**

### 2. Extraction ciblée

L'orchestrator extrait **uniquement** le code des méthodes pertinentes :

```
Avant (fichiers entiers) : 50,000 tokens 💸
Après (méthodes seules)  :  2,500 tokens ✅
Économie                 : 95% !
```

### 3. Envoi optimisé

Le prompt envoyé à l'API contient :
- ✅ Les méthodes pertinentes avec leur code
- ✅ Le contexte minimal nécessaire
- ✅ Votre requête

### 4. Caching intelligent

Le system prompt est mis en cache pour :
- ✅ Réutilisation sur plusieurs requêtes
- ✅ Économie supplémentaire de tokens
- ✅ Réponses plus rapides

## 💰 Coût estimé

Avec l'optimisation par méthode :

```
Sonnet 4 Pricing:
- Input:  $3 / 1M tokens
- Output: $15 / 1M tokens

Exemple (10 méthodes extraites):
- Input:  ~2,500 tokens = $0.0075
- Output: ~1,000 tokens = $0.0150
- Total:  $0.0225 par requête

100 requêtes = ~$2.25 vs ~$90 sans optimisation !
```

## 🔍 Fonctionnalités

### Niveaux de détail progressifs

Le système supporte 5 niveaux de détail :

```javascript
// Niveau 0: Clés seulement
['Vertex.nova', 'Orb.calculate', ...]

// Niveau 1: + Descriptions
[{ key: 'Vertex.nova', description: 'Creates vertex', role: 'core' }]

// Niveau 2: + Signatures complètes
[{ key: 'Vertex.nova', signature: 'nova(x, y, options)', effects: {...} }]

// Niveau 3: + Code des méthodes
[{ key: 'Vertex.nova', code: 'nova(x, y) { ... }' }]

// Niveau 4: + Fichiers complets
[{ path: 'Vertex.js', content: '...', methods: [...] }]
```

### Cache de questions/réponses

Les questions similaires sont détectées :

```bash
$ node lib/orchestrator.cjs "comment créer un vertex"
⚠️  Question similaire trouvée en cache (87%)
Réponse précédente: "Pour créer un vertex..."

Voulez-vous continuer avec une nouvelle analyse ? [o/N]
```

### Statistiques d'utilisation

À la fin de chaque exécution :

```
📊 Statistiques API
──────────────────────────────────────────────────
Appels totaux:      5
Erreurs:            0
Tokens input:       12,450
Tokens output:      4,230
Total tokens:       16,680

Coût estimé:
  Input:  $0.0374
  Output: $0.0635
  Total:  $0.1009
──────────────────────────────────────────────────
```

## 🛡️ Gestion des erreurs

### Limite hebdomadaire atteinte

```
❌ Limite hebdomadaire atteinte !
Réessayez après la réinitialisation hebdomadaire
```

**Solution :** Attendez la réinitialisation ou passez à un plan Max

### Clé API manquante

```
❌ API Anthropic requise !
Solution: Définissez ANTHROPIC_API_KEY dans .env
```

**Solution :** Configurez votre .env

### Réseau indisponible

```
❌ Erreur réseau: fetch failed
```

**Solution :** Vérifiez votre connexion internet

## 📈 Monitoring

### Dashboard HTML

Génère une interface interactive pour visualiser :
- Distribution des méthodes par rôle
- État des annotations
- Fichiers les plus denses
- Graphiques Chart.js
- Filtres et recherche

```bash
node lib/monitoring-agent.cjs dashboard
# Ouvre monitoring/dashboard.html dans votre navigateur
```

### Rapport JSON

Exporte toutes les données au format JSON :

```bash
node lib/monitoring-agent.cjs report
# Crée monitoring/report.json
```

## 🔧 Résolution de problèmes

### "API_NOT_AVAILABLE"

- Vérifiez que `.env` existe
- Vérifiez que `ANTHROPIC_API_KEY` est définie
- Vérifiez qu'il n'y a pas d'espaces dans la clé

### "Method index empty"

```bash
# Générer l'index des méthodes
node bin/cli.cjs annotate index

# Ou avec le projet LOLVE
node bin/cli.cjs --project C:/lolve annotate index
```

### Prompts trop longs

Si vous avez trop de méthodes pertinentes :

```javascript
// Dans orchestrator.cjs, ligne ~190
const methodsWithCode = this.extractMethodsCode(searchSession, { 
  maxMethods: 5  // Réduire ce nombre
});
```

## 🎯 Bonnes pratiques

### 1. Utilisez --dry-run pour tester

```bash
# Vérifiez le prompt sans consommer de tokens
node lib/orchestrator.cjs --dry-run "votre requête"
```

### 2. Utilisez le cache

Les questions similaires sont détectées automatiquement.

### 3. Mode quick pour rapidité

```bash
# Sauter les propositions pour aller plus vite
node lib/orchestrator.cjs --quick "requête simple"
```

### 4. Sauvegardez les réponses importantes

```bash
node lib/orchestrator.cjs --output important-response.md "requête"
```

### 5. Surveillez votre consommation

Les statistiques s'affichent automatiquement après chaque requête.

## 🔐 Sécurité

- ✅ Ne committez JAMAIS votre `.env`
- ✅ Ne partagez JAMAIS votre clé API
- ✅ Ajoutez `.env` à `.gitignore`
- ✅ Utilisez des variables d'environnement en production

## 📚 Documentation complète

- API Anthropic : https://docs.anthropic.com
- Console : https://console.anthropic.com
- Pricing : https://www.anthropic.com/pricing

## 🆘 Support

En cas de problème :

1. Vérifiez ce guide
2. Consultez les logs avec `--verbose`
3. Testez avec `--dry-run`
4. Vérifiez votre solde API sur console.anthropic.com
