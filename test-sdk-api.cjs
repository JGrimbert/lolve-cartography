// Script pour tester l'API MCP SDK 1.25.2
// À exécuter sur votre machine Windows

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');

console.log('Test des différentes syntaxes pour SDK 1.25.2...\n');

// Créer un serveur de test
const server = new Server(
  { name: 'test', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Test 1: Syntaxe basique
console.log('Test 1: Syntaxe basique string');
try {
  server.setRequestHandler('tools/list', async () => ({ tools: [] }));
  console.log('✓ Syntaxe string fonctionne\n');
} catch (e) {
  console.log('✗ Syntaxe string échoue:', e.message, '\n');
}

// Test 2: Syntaxe avec objet method
console.log('Test 2: Syntaxe { method: ... }');
try {
  server.setRequestHandler({ method: 'tools/list' }, async () => ({ tools: [] }));
  console.log('✓ Syntaxe { method } fonctionne\n');
} catch (e) {
  console.log('✗ Syntaxe { method } échoue:', e.message, '\n');
}

// Test 3: Syntaxe avec schema complet
console.log('Test 3: Syntaxe avec schema');
try {
  server.setRequestHandler(
    {
      method: 'tools/list',
      schema: {
        description: 'List tools',
        params: { type: 'object', properties: {} }
      }
    },
    async () => ({ tools: [] })
  );
  console.log('✓ Syntaxe avec schema fonctionne\n');
} catch (e) {
  console.log('✗ Syntaxe avec schema échoue:', e.message, '\n');
}

// Test 4: Vérifier les méthodes disponibles
console.log('Test 4: Méthodes disponibles sur Server:');
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(server)));
console.log('\n');

// Test 5: Inspecter setRequestHandler
console.log('Test 5: Signature de setRequestHandler:');
console.log('Nombre de paramètres:', server.setRequestHandler.length);
console.log('toString:', server.setRequestHandler.toString().substring(0, 200));
