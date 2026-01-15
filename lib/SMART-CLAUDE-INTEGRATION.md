# Intégration Smart Claude avec Claude Code

Ce guide explique comment configurer Claude Code pour utiliser automatiquement le workflow d'extraction intelligente.

## 🎯 Objectif

Quand vous posez une question à Claude Code, il doit automatiquement :
1. Extraire les méthodes pertinentes
2. Recevoir UNIQUEMENT le fichier temp en contexte
3. Modifier le fichier
4. Réinjecter automatiquement

---

## 📦 Installation

### Option 1 : Alias shell (Recommandé - Plus simple)

Ajoutez ceci à votre `.bashrc`, `.zshrc`, ou `.bash_profile` :

```bash
# Smart Claude - Wrapper intelligent
alias smart-claude='node /chemin/vers/lolve-cartography/lib/smart-claude.cjs'
alias sc='node /chemin/vers/lolve-cartography/lib/smart-claude.cjs'
```

Puis rechargez :
```bash
source ~/.bashrc  # ou ~/.zshrc
```

### Option 2 : Script global

Créez `/usr/local/bin/smart-claude` :

```bash
#!/bin/bash
node /chemin/vers/lolve-cartography/lib/smart-claude.cjs "$@"
```

Rendez-le exécutable :
```bash
chmod +x /usr/local/bin/smart-claude
```

### Option 3 : npm script

Dans `package.json` :

```json
{
  "scripts": {
    "smart": "node lib/smart-claude.cjs",
    "sc": "node lib/smart-claude.cjs"
  }
}
```

Usage : `npm run smart "votre question"`

---

## 🚀 Utilisation

### Commande simple
```bash
smart-claude "améliore Vertex.calculate"

# Ou avec l'alias court
sc "refactor Orb.render"
```

### Ce qui se passe automatiquement
```
1. 📦 Extraction des méthodes pertinentes
   → Analyse votre question
   → Trouve les méthodes liées
   → Crée temp/methods.js

2. 🤖 Claude Code s'exécute
   → Reçoit SEULEMENT temp/methods.js
   → Modifie selon votre demande
   → Termine

3. 🔄 Réinjection automatique
   → Replace dans les fichiers sources
   → Backup créé (.backup)
   → ✅ Terminé !
```

---

## 🎮 Exemples d'utilisation

### Exemple 1 : Améliorer une méthode
```bash
$ smart-claude "améliore les performances de Vertex.calculate"

🧠 Smart Claude - Préparation du contexte optimal...
📦 Extraction des méthodes pertinentes...

   3 méthode(s) extraite(s):
   - Vertex.calculate
   - Vertex.validate
   - Orb.computeDistance

✓ Méthodes extraites dans: temp/methods.js

🤖 Lancement de Claude Code...
📝 Contexte: temp/methods.js uniquement
💬 Question: "améliore les performances de Vertex.calculate..."

[Claude Code s'exécute et modifie temp/methods.js]

🔄 Réinjection des modifications...

📝 Traitement: src/Vertex.js
   ✓ Backup créé: src/Vertex.js.backup
   ✓ Vertex.calculate remplacée (exact)
   💾 Fichier sauvegardé

✅ Modifications réinjectées avec succès !
```

### Exemple 2 : Refactorer une classe
```bash
smart-claude "refactor la classe Orb pour utiliser des getters/setters"
```

### Exemple 3 : Ajouter des fonctionnalités
```bash
smart-claude "ajoute une méthode de validation dans Vertex"
```

---

## ⚙️ Configuration avancée

### Changer le dossier temporaire
```bash
smart-claude --temp-dir /tmp/claude "votre question"
```

### Spécifier le chemin de Claude Code
```bash
smart-claude --claude-path /usr/local/bin/claude "votre question"
```

### Mode verbose
```bash
smart-claude --verbose "votre question"
```

---

## 🔧 Intégration avec Claude Code directement

Si vous voulez que Claude Code utilise AUTOMATIQUEMENT ce système sans avoir à taper `smart-claude`, vous pouvez créer un **Custom Tool** :

### Créer `.claude/tools/smart-extract.json`

```json
{
  "name": "smart-extract",
  "description": "Extrait automatiquement les méthodes pertinentes avant de répondre",
  "command": "node lib/smart-claude.cjs",
  "when": "before_response",
  "pattern": "améliore|refactor|optimise|corrige"
}
```

**Note:** Cela nécessite que Claude Code supporte les custom tools. Si ce n'est pas le cas, utilisez simplement l'alias `smart-claude` à la place.

---

## 🎯 Workflow recommandé

### Pour des questions simples
```bash
# Utilisez Claude Code normalement
claude "explique comment fonctionne X"
```

### Pour des modifications de code
```bash
# Utilisez smart-claude
smart-claude "améliore la fonction X"
```

### Règle générale
- **claude** → Questions, explications, génération de nouveau code
- **smart-claude** → Modifications de code existant

---

## 📊 Comparaison des workflows

| Méthode | Commande | Contexte | Réinjection | Cas d'usage |
|---------|----------|----------|-------------|-------------|
| **Claude Code standard** | `claude "question"` | Projet entier | Manuel | Questions générales |
| **extract-for-claude** | `node lib/extract-for-claude.cjs` | Méthodes extraites | Semi-auto | Modifications avec validation |
| **smart-claude** | `smart-claude "question"` | Méthodes extraites | Automatique | Modifications rapides |

---

## 🐛 Dépannage

### Claude Code ne se lance pas
```bash
# Vérifiez que Claude Code est installé
which claude

# Spécifiez le chemin complet
smart-claude --claude-path /chemin/vers/claude "question"
```

### Aucune méthode trouvée
```bash
# Votre question est peut-être trop vague
# Soyez plus spécifique :
❌ "améliore le code"
✅ "améliore Vertex.calculate"
```

### Réinjection échoue
```bash
# Le fichier source a peut-être changé
# Vérifiez les backups dans *.backup
ls -la *.backup

# Restaurez si nécessaire
cp src/Vertex.js.backup src/Vertex.js
```

---

## 💡 Astuces

### 1. Créez des alias courts
```bash
alias sc='smart-claude'
alias scd='smart-claude --verbose'  # version debug
```

### 2. Combinez avec git
```bash
# Commit avant modification
git add . && git commit -m "Avant smart-claude"
smart-claude "refactor X"
git diff  # Voir les changements
```

### 3. Utilisez en script
```bash
#!/bin/bash
# improve-all.sh
smart-claude "optimise Vertex"
smart-claude "optimise Orb"
smart-claude "optimise Forma"
```

---

## 🎓 Bonnes pratiques

1. **Soyez spécifique** : "améliore Vertex.calculate" > "améliore le code"
2. **Faites des commits** : Avant chaque smart-claude
3. **Vérifiez les backups** : En cas de problème
4. **Testez après** : Lancez vos tests après réinjection
5. **Une question = une préoccupation** : Ne mélangez pas plusieurs sujets

---

## 📚 Ressources

- Documentation lolve-cartography: README.md
- Guide extract-for-claude: `node lib/extract-for-claude.cjs --help`
- Guide smart-claude: `smart-claude --help`

---

## 🚀 Pour aller plus loin

### Intégration CI/CD
Utilisez smart-claude dans vos pipelines :

```yaml
# .github/workflows/auto-improve.yml
- name: Auto-improve code
  run: |
    npm install
    smart-claude "optimise les performances"
    npm test
```

### Pre-commit hook
```bash
# .git/hooks/pre-commit
#!/bin/bash
smart-claude "vérifie et corrige les erreurs courantes"
```

### Extension VSCode
Créez une task VSCode pour lancer smart-claude :

```json
{
  "label": "Smart Claude",
  "type": "shell",
  "command": "smart-claude '${input:question}'"
}
```

---

**Vous êtes prêt ! 🎉**

Utilisez `smart-claude` pour toutes vos modifications de code !
