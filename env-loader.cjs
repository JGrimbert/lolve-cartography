/**
 * Env Loader - Charge les variables d'environnement depuis .env
 * 
 * Utilisation:
 *   require('./env-loader.cjs');
 * 
 * Place ce require au début de vos scripts pour charger automatiquement .env
 */

const fs = require('fs');
const path = require('path');

/**
 * Charge le fichier .env
 */
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    // Pas de .env, ce n'est pas une erreur (peut être défini autrement)
    return;
  }

  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      // Ignorer les commentaires et lignes vides
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Parser KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (!match) continue;

      const key = match[1].trim();
      const value = match[2].trim()
        .replace(/^["']/, '')  // Retirer guillemets début
        .replace(/["']$/, ''); // Retirer guillemets fin

      // Ne pas écraser si déjà défini
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn('Avertissement: Impossible de charger .env:', error.message);
  }
}

// Charger automatiquement à l'import
loadEnv();

module.exports = { loadEnv };
