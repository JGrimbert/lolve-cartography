#!/usr/bin/env node

/**
 * MCP Simulator
 * Test your MCP server locally without Claude or STDIO
 */

const { LolveMCPServer } = require('/lolvemcp.js');

(async () => {
    console.log('🚀 Starting MCP simulator...');

    const serverInstance = new LolveMCPServer();

    // On récupère le serveur MCP
    const server = serverInstance.server;

    // 1️⃣ Test ListResources
    const listResources = await server.handlers.get('ListResources')();
    console.log('\n📦 ListResources:\n', JSON.stringify(listResources, null, 2));

    // 2️⃣ Test ReadResource
    try {
        const readResource = await server.handlers.get('ReadResource')({
            params: { uri: 'lolve://context/optimized' }
        });
        console.log('\n📖 ReadResource:\n', readResource);
    } catch (err) {
        console.error('\n❌ ReadResource failed:', err.message);
    }

    // 3️⃣ Test ListTools
    const listTools = await server.handlers.get('ListTools')();
    console.log('\n🛠️ ListTools:\n', JSON.stringify(listTools, null, 2));

    // 4️⃣ Test CallTool (extract_methods)
    try {
        const callTool = await server.handlers.get('CallTool')({
            params: { name: 'extract_methods', arguments: { query: 'test' } }
        });
        console.log('\n⚙️ CallTool extract_methods:\n', callTool);
    } catch (err) {
        console.error('\n❌ CallTool failed:', err.message);
    }

    // 5️⃣ Test ListPrompts
    const listPrompts = await server.handlers.get('ListPrompts')();
    console.log('\n💬 ListPrompts:\n', JSON.stringify(listPrompts, null, 2));

    // 6️⃣ Test GetPrompt
    try {
        const getPrompt = await server.handlers.get('GetPrompt')({
            params: { name: 'code-workflow' }
        });
        console.log('\n📝 GetPrompt code-workflow:\n', getPrompt);
    } catch (err) {
        console.error('\n❌ GetPrompt failed:', err.message);
    }

    console.log('\n✅ MCP simulator finished!');
})();
