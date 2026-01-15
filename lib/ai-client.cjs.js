// lib/ai-client.cjs (NOUVEAU FICHIER)
const fs = require('fs');
const path = require('path');
const { log } = require('./utils/logger.cjs');

class AIClient {
    constructor(options = {}) {
        this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
        this.baseUrl = 'https://api.anthropic.com/v1/messages';
        this.model = options.model || 'claude-sonnet-4-20250514';
        this.enabled = !!this.apiKey;
    }

    /**
     * Vérifie si l'API est disponible
     */
    isAvailable() {
        if (!this.enabled) {
            log('AIClient', 'Clé API non configurée - mode prompt uniquement', 'warning');
            return false;
        }
        return true;
    }

    /**
     * Appelle l'API Anthropic directement
     */
    async sendMessage(prompt, options = {}) {
        if (!this.isAvailable()) {
            throw new Error('API non disponible. Définissez ANTHROPIC_API_KEY');
        }

        const requestBody = {
            model: options.model || this.model,
            max_tokens: options.maxTokens || 4000,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        };

        // Ajouter system prompt si fourni
        if (options.systemPrompt) {
            requestBody.system = options.systemPrompt;
        }

        // Prompt caching pour économiser les tokens
        if (options.useCache && options.systemPrompt) {
            requestBody.system = [
                {
                    type: 'text',
                    text: options.systemPrompt,
                    cache_control: { type: 'ephemeral' }
                }
            ];
        }

        log('AIClient', `Appel API - Model: ${requestBody.model}`, 'info');

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json();

                // Détecter les limites hebdomadaires
                if (error.error?.type === 'rate_limit_error' &&
                    error.error?.message?.includes('weekly')) {
                    throw new Error('WEEKLY_LIMIT_REACHED');
                }

                throw new Error(`API Error: ${error.error?.message || response.statusText}`);
            }

            const data = await response.json();

            log('AIClient', `Tokens utilisés: ${data.usage?.input_tokens || 0} in, ${data.usage?.output_tokens || 0} out`, 'success');

            return {
                content: data.content[0]?.text || '',
                usage: data.usage,
                model: data.model
            };

        } catch (error) {
            if (error.message === 'WEEKLY_LIMIT_REACHED') {
                log('AIClient', '⚠️  Limite hebdomadaire atteinte !', 'error');
                throw error;
            }

            log('AIClient', `Erreur API: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Wrapper pour analyser du code
     */
    async analyzeCode(code, instructions, options = {}) {
        const prompt = `${instructions}\n\n\`\`\`javascript\n${code}\n\`\`\``;
        return this.sendMessage(prompt, options);
    }

    /**
     * Wrapper pour générer du monitoring
     */
    async generateMonitoring(indexData, options = {}) {
        const prompt = `Crée un dashboard HTML interactif pour visualiser ces données d'indexation de méthodes.

Données:
${JSON.stringify(indexData, null, 2)}

Exigences:
- Interface moderne avec graphiques (utilise Chart.js depuis CDN)
- Statistiques clés en haut
- Filtres par catégorie, rôle, effets
- Tableau détaillé avec tri
- Design responsive
- Tout dans un seul fichier HTML

Retourne uniquement le code HTML complet, sans explications.`;

        return this.sendMessage(prompt, {
            ...options,
            maxTokens: 8000
        });
    }
}

module.exports = { AIClient };