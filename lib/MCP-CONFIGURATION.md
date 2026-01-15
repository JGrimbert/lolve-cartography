# Configuration MCP Server pour Claude Code

Ce guide explique comment configurer le MCP Server pour que Claude Code utilise automatiquement le contexte optimisé.

---

## 🎯 Objectif

Quand vous êtes dans Claude Code et que vous posez une question :
1. Le MCP Server extrait automatiquement les méthodes pertinentes
2. Claude Code reçoit **SEULEMENT** `temp/methods.js` en contexte
3. Après chaque modification, le code est **automatiquement** réinjecté dans les sources

---

## 📦 Prérequis

```bash
# Installer le SDK MCP
npm install -g @modelcontextprotocol/sdk

# Ou dans votre projet
cd lolve-cartography
npm install @modelcontextprotocol/sdk
```

---

## ⚙️ Configuration

### Étape 1 : Créer le fichier de configuration MCP

Créez `~/.config/claude/mcp.json` :

```json
{
  "mcpServers": {
    "lolve": {
      "command": "node",
      "args": ["/chemin/absolu/vers/lolve-cartography/lib/mcp-server.cjs"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**⚠️ IMPORTANT :** Utilisez le **chemin absolu** complet !

### Étape 2 : Vérifier que le serveur démarre

```bash
# Test manuel
node lib/mcp-server.cjs

# Devrait afficher :
# [MCP] LOLVE Context Optimizer started
```

### Étape 3 : Redémarrer Claude Code

```bash
# Fermez Claude Code complètement
# Puis relancez
claude
```

---

## 🚀 Utilisation

### Dans Claude Code (session interactive)

```bash
# 1. Lancez Claude Code
claude

# 2. Dans la session, demandez l'extraction
> "Extract methods for: améliore Vertex.calculate"

# Le MCP Server va :
# - Extraire Vertex.calculate et méthodes liées
# - Créer temp/methods.js
# - Le fournir comme contexte

# 3. Continuez normalement
> "Améliore les performances en utilisant un cache"

# Claude Code modifie temp/methods.js

# 4. Réinjection automatique !
# Dès que temp/methods.js change, c'est réinjecté automatiquement

# 5. Vérifiez
> "Show me what changed in Vertex.js"
```

---

## 🎮 Workflow complet

### Scénario : Améliorer une méthode

```bash
$ claude

Claude Code is ready!

> Extract methods for: améliore Vertex.calculate

✓ Extracted 3 methods to temp/methods.js
  - Vertex.calculate
  - Vertex.validate  
  - Orb.computeDistance

> Maintenant améliore les performances de calculate en ajoutant un cache

[Claude Code modifie temp/methods.js]

> [MCP détecte le changement]
> [Réinjection automatique dans src/Vertex.js]

✓ Reinjected 3 methods

> Parfait ! Maintenant ajoute des tests unitaires

[Continuer la conversation...]
```

---

## 🔧 Commandes MCP disponibles

### Extraction manuelle

```javascript
// Dans Claude Code
"Use the extract_methods tool with query: améliore Vertex.calculate"
```

### Lecture du contexte optimisé

```javascript
// Dans Claude Code  
"Read resource lolve://context/optimized"
```

---

## 🎯 Configuration avancée

### Auto-extraction basée sur patterns

Modifiez `mcp-server.cjs` pour détecter automatiquement :

```javascript
// Ajouter dans setupHandlers()
this.server.setRequestHandler('prompts/get', async (request) => {
  const query = request.params.prompt;
  
  // Détection automatique
  if (/améliore|refactor|optimise/i.test(query)) {
    await this.extractMethods(query);
  }
  
  return { prompt: query };
});
```

### Réinjection différée

Pour éviter les réinjections pendant que Claude Code écrit :

```javascript
handleFileChange() {
  // Debounce de 2 secondes
  clearTimeout(this.reinjectTimer);
  this.reinjectTimer = setTimeout(() => {
    this.doReinject();
  }, 2000);
}
```

---

## 🐛 Dépannage

### Le MCP Server ne démarre pas

```bash
# Vérifiez les logs
tail -f ~/.config/claude/logs/mcp-lolve.log

# Vérifiez le chemin
which node
# Utilisez le chemin complet dans mcp.json
```

### Claude Code ne voit pas le serveur

```bash
# Vérifiez la configuration
cat ~/.config/claude/mcp.json

# Format correct ?
# Chemin absolu ?
# Virgules bien placées ?
```

### Réinjection ne fonctionne pas

```bash
# Vérifiez que temp/methods.js existe
ls -la temp/methods.js

# Vérifiez le snapshot
ls -la temp/snapshot.json

# Test manuel de réinjection
node lib/method-reinjector.cjs temp/methods.js
```

---

## 📊 Comparaison des approches

| Approche | Commande | Interactivité | Automatisation |
|----------|----------|---------------|----------------|
| **claude-agent** | Wrapper CLI | ❌ Une question → une réponse | ✅ 100% |
| **MCP Server** 🌟 | Session Claude | ✅ Dialogue continu | ✅ 100% |

---

## 💡 Astuces

### 1. Préfixe pour extraction

Créez un alias de commande :

```bash
# Dans votre session Claude Code
> /extract améliore Vertex.calculate

# Au lieu de
> Extract methods for: améliore Vertex.calculate
```

### 2. Context-aware responses

Le MCP peut enrichir le contexte :

```javascript
// Ajouter des instructions automatiques
const enhancedContext = `
${tempContent}

IMPORTANT INSTRUCTIONS:
- You are working on extracted methods
- Preserve comment structure
- Changes will be auto-reinjected
`;
```

### 3. Git commits automatiques

```javascript
// Avant réinjection
exec('git add . && git commit -m "Before MCP reinjection"');

// Après réinjection  
exec('git add . && git commit -m "After MCP reinjection"');
```

---

## 🚀 Pour aller plus loin

### Intégration avec d'autres outils MCP

```json
{
  "mcpServers": {
    "lolve": {
      "command": "node",
      "args": ["/path/to/mcp-server.cjs"]
    },
    "git": {
      "command": "mcp-server-git"
    },
    "filesystem": {
      "command": "mcp-server-filesystem"  
    }
  }
}
```

### Notifications Desktop

```javascript
// Après réinjection réussie
const notifier = require('node-notifier');
notifier.notify({
  title: 'LOLVE MCP',
  message: `✓ ${result.successCount} methods reinjected`
});
```

---

## 📚 Ressources

- [MCP Documentation](https://modelcontextprotocol.io)
- [Claude Code MCP Guide](https://docs.anthropic.com/claude-code/mcp)
- [LOLVE Cartography README](../README.md)

---

## ⚠️ Limitations actuelles

1. **MCP Support** : Vérifiez que votre version de Claude Code supporte MCP
2. **Auto-detection** : Nécessite d'appeler explicitement `extract_methods`
3. **Context size** : Limité par la taille de `temp/methods.js`

---

## 🎓 Recommandation

**Si Claude Code supporte MCP** → Utilisez cette approche !
**Sinon** → Utilisez `claude-agent.cjs` (le wrapper)

Les deux approches donnent le même résultat, mais MCP est plus élégant car vous restez dans une session interactive.

---

**Configuration terminée ! Testez avec Claude Code ! 🎉**
