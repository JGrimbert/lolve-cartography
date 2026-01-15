/**
 * AIClient - Client pour l'API Anthropic
 * 
 * Gère les appels directs à l'API Claude avec:
 * - Gestion des erreurs et limites
 * - Prompt caching pour économiser les tokens
 * - Suivi de l'utilisation
 */

const { log } = require('./utils/logger.cjs');

class AIClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = 'https://api.anthropic.com/v1/messages';
    this.model = options.model || 'claude-sonnet-4-20250514';
    this.enabled = !!this.apiKey;
    
    // Statistiques d'utilisation
    this.stats = {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      errors: 0
    };
  }

  /**
   * Vérifie si l'API est disponible
   */
  isAvailable() {
    if (!this.enabled) {
      log('AIClient', '⚠️  Clé API non configurée', 'warning');
      log('AIClient', 'Définissez ANTHROPIC_API_KEY dans .env', 'info');
      return false;
    }
    return true;
  }

  /**
   * Appelle l'API Anthropic
   * @param {string|Array} messages - Message(s) à envoyer
   * @param {Object} options - Options de la requête
   * @returns {Promise<Object>} Réponse de l'API
   */
  async sendMessage(messages, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('API_NOT_AVAILABLE: Définissez ANTHROPIC_API_KEY');
    }

    // Normaliser les messages
    const normalizedMessages = Array.isArray(messages) 
      ? messages 
      : [{ role: 'user', content: messages }];

    const requestBody = {
      model: options.model || this.model,
      max_tokens: options.maxTokens || 8000,
      messages: normalizedMessages
    };

    // Ajouter system prompt avec cache si demandé
    if (options.systemPrompt) {
      if (options.useCache) {
        requestBody.system = [
          {
            type: 'text',
            text: options.systemPrompt,
            cache_control: { type: 'ephemeral' }
          }
        ];
      } else {
        requestBody.system = options.systemPrompt;
      }
    }

    this.stats.totalCalls++;
    
    try {
      const startTime = Date.now();
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.json();
        
        // Détecter les limites hebdomadaires
        if (error.error?.type === 'rate_limit_error') {
          if (error.error?.message?.includes('weekly')) {
            throw new Error('WEEKLY_LIMIT_REACHED');
          }
          throw new Error(`RATE_LIMIT: ${error.error.message}`);
        }
        
        throw new Error(`API_ERROR: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      // Mettre à jour les statistiques
      this.stats.totalInputTokens += data.usage?.input_tokens || 0;
      this.stats.totalOutputTokens += data.usage?.output_tokens || 0;
      
      // Log de l'utilisation
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
      const cachedTokens = data.usage?.cache_read_input_tokens || 0;
      
      log('AIClient', 
        `✓ ${duration}ms | Tokens: ${inputTokens} in, ${outputTokens} out` +
        (cachedTokens > 0 ? ` (${cachedTokens} cached)` : ''),
        'success'
      );

      return {
        content: data.content[0]?.text || '',
        usage: data.usage,
        model: data.model,
        stopReason: data.stop_reason
      };

    } catch (error) {
      this.stats.errors++;
      
      if (error.message === 'WEEKLY_LIMIT_REACHED') {
        log('AIClient', '❌ Limite hebdomadaire atteinte !', 'error');
        log('AIClient', 'Réinitialisation: prochaine semaine', 'warning');
      } else if (error.message.startsWith('RATE_LIMIT')) {
        log('AIClient', `❌ ${error.message}`, 'error');
      } else if (error.message.startsWith('API_ERROR')) {
        log('AIClient', `❌ ${error.message}`, 'error');
      } else {
        log('AIClient', `❌ Erreur réseau: ${error.message}`, 'error');
      }
      
      throw error;
    }
  }

  /**
   * Analyse du code avec instructions
   * @param {string} code - Code à analyser
   * @param {string} instructions - Instructions d'analyse
   * @param {Object} options - Options supplémentaires
   * @returns {Promise<Object>} Résultat de l'analyse
   */
  async analyzeCode(code, instructions, options = {}) {
    const prompt = `${instructions}\n\n\`\`\`javascript\n${code}\n\`\`\``;
    return this.sendMessage(prompt, {
      ...options,
      systemPrompt: options.systemPrompt || 'Tu es un expert en développement JavaScript et en architecture de code.'
    });
  }

  /**
   * Génère un dashboard de monitoring HTML
   * @param {Object} indexData - Données d'indexation
   * @param {Object} options - Options de génération
   * @returns {Promise<Object>} Dashboard HTML généré
   */
  async generateMonitoring(indexData, options = {}) {
    const methods = Object.entries(indexData.methods || {}).map(([key, data]) => ({
      key,
      ...data
    }));

    const stats = {
      totalMethods: methods.length,
      byRole: {},
      byFile: {},
      withAnnotations: methods.filter(m => m.description).length
    };

    // Calculer les statistiques
    methods.forEach(m => {
      stats.byRole[m.role || 'unknown'] = (stats.byRole[m.role || 'unknown'] || 0) + 1;
      stats.byFile[m.file] = (stats.byFile[m.file] || 0) + 1;
    });

    const prompt = `Crée un dashboard HTML interactif pour visualiser l'indexation de méthodes d'un projet JavaScript.

**Statistiques:**
- Total méthodes: ${stats.totalMethods}
- Avec annotations: ${stats.withAnnotations}
- Distribution par rôle: ${JSON.stringify(stats.byRole)}

**Exemple de méthode:**
\`\`\`json
${JSON.stringify(methods[0], null, 2)}
\`\`\`

**Exigences:**
1. Interface moderne et professionnelle
2. Graphiques avec Chart.js (depuis CDN)
3. Cartes de statistiques en haut (total, par rôle, etc.)
4. Tableau filtrable et triable des méthodes
5. Filtres: par fichier, par rôle, par présence d'annotations
6. Recherche en temps réel
7. Design responsive (fonctionne sur mobile)
8. Palette de couleurs cohérente
9. Tout dans un SEUL fichier HTML autonome

**Données à utiliser** (intégrées dans le HTML):
\`\`\`javascript
const methodsData = ${JSON.stringify(methods.slice(0, 100), null, 2)};
\`\`\`

Retourne UNIQUEMENT le code HTML complet, sans explications ni markdown.`;

    return this.sendMessage(prompt, {
      ...options,
      maxTokens: 8000,
      systemPrompt: 'Tu es un expert en développement web et en visualisation de données. Tu crées des interfaces modernes et fonctionnelles.'
    });
  }

  /**
   * Obtient les statistiques d'utilisation
   * @returns {Object} Statistiques
   */
  getStats() {
    const totalTokens = this.stats.totalInputTokens + this.stats.totalOutputTokens;
    
    // Coût estimé (Sonnet 4: $3/1M input, $15/1M output)
    const inputCost = (this.stats.totalInputTokens / 1000000) * 3;
    const outputCost = (this.stats.totalOutputTokens / 1000000) * 15;
    const totalCost = inputCost + outputCost;

    return {
      ...this.stats,
      totalTokens,
      estimatedCost: {
        input: inputCost.toFixed(4),
        output: outputCost.toFixed(4),
        total: totalCost.toFixed(4),
        currency: 'USD'
      }
    };
  }

  /**
   * Affiche les statistiques
   */
  displayStats() {
    const stats = this.getStats();
    
    console.log('\n📊 Statistiques API');
    console.log('─'.repeat(50));
    console.log(`Appels totaux:      ${stats.totalCalls}`);
    console.log(`Erreurs:            ${stats.errors}`);
    console.log(`Tokens input:       ${stats.totalInputTokens.toLocaleString()}`);
    console.log(`Tokens output:      ${stats.totalOutputTokens.toLocaleString()}`);
    console.log(`Total tokens:       ${stats.totalTokens.toLocaleString()}`);
    console.log(`\nCoût estimé:`);
    console.log(`  Input:  $${stats.estimatedCost.input}`);
    console.log(`  Output: $${stats.estimatedCost.output}`);
    console.log(`  Total:  $${stats.estimatedCost.total}`);
    console.log('─'.repeat(50) + '\n');
  }
}

module.exports = { AIClient };
