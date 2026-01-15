#!/usr/bin/env node

/**
 * LOLVE MCP Server - Context Optimizer
 * 
 * MCP Server qui intercepte les requêtes de Claude Code et :
 * 1. Extrait automatiquement les méthodes pertinentes
 * 2. Fournit SEULEMENT temp/methods.js comme contexte
 * 3. Watch temp/methods.js pour détecter les modifications
 * 4. Réinjecte automatiquement dans les sources
 * 
 * Usage:
 *   node lib/mcp-server.cjs
 * 
 * Configuration Claude Code:
 *   Ajoutez dans ~/.config/claude/mcp.json :
 *   {
 *     "mcpServers": {
 *       "lolve": {
 *         "command": "node",
 *         "args": ["/path/to/lolve-cartography/lib/mcp-server.cjs"]
 *       }
 *     }
 *   }
 */

const fs = require('fs');
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

class LolveMCPServer {
  constructor() {
    this.server = new Server({
      name: 'lolve-context-optimizer',
      version: '1.0.0'
    }, {
      capabilities: {
        resources: {},
        tools: {}
      }
    });

    this.tempDir = 'temp';
    this.tempPath = path.join(this.tempDir, 'methods.js');
    this.snapshotPath = path.join(this.tempDir, 'snapshot.json');
    this.watcher = null;
    this.lastContent = null;

    this.setupHandlers();
  }

  setupHandlers() {
    // Handler pour lister les ressources
    this.server.setRequestHandler('resources/list', async () => {
      return {
        resources: [
          {
            uri: 'lolve://context/optimized',
            name: 'Optimized Context',
            description: 'Extracted methods for optimal token usage',
            mimeType: 'text/javascript'
          }
        ]
      };
    });

    // Handler pour lire les ressources
    this.server.setRequestHandler('resources/read', async (request) => {
      if (request.params.uri === 'lolve://context/optimized') {
        if (fs.existsSync(this.tempPath)) {
          const content = fs.readFileSync(this.tempPath, 'utf-8');
          return {
            contents: [{
              uri: request.params.uri,
              mimeType: 'text/javascript',
              text: content
            }]
          };
        }
      }

      throw new Error('Resource not found');
    });

    // Tool: Extract methods
    this.server.setRequestHandler('tools/list', async () => {
      return {
        tools: [
          {
            name: 'extract_methods',
            description: 'Extract relevant methods based on query',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The query to analyze for method extraction'
                }
              },
              required: ['query']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler('tools/call', async (request) => {
      if (request.params.name === 'extract_methods') {
        return await this.extractMethods(request.params.arguments.query);
      }

      throw new Error('Tool not found');
    });
  }

  async extractMethods(query) {
    try {
      const { ExtractForClaude } = require('./extract-for-claude.cjs');
      
      const extractor = await new ExtractForClaude({
        tempDir: this.tempDir,
        autoReinject: false
      }).init();

      // Extraire
      const preprocessed = extractor.agents.preprocess.process(query);
      const searchSession = extractor.agents.context.createSearchSession(preprocessed.cleaned);
      
      if (searchSession.keys.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No methods found for this query. Using normal context.'
          }]
        };
      }

      const { MethodSnapshot } = require('./method-snapshot.cjs');
      const snapshot = new MethodSnapshot();
      const snapshotData = snapshot.capture(searchSession.keys);
      
      snapshot.save(snapshotData, this.snapshotPath);

      const tempContent = snapshot.generateTempFile(snapshotData, {
        includeContext: true,
        groupByClass: true
      });

      fs.writeFileSync(this.tempPath, tempContent, 'utf-8');
      this.lastContent = tempContent;

      // Démarrer le watcher
      this.startWatching();

      return {
        content: [{
          type: 'text',
          text: `Extracted ${searchSession.keys.length} methods to ${this.tempPath}. Context optimized.`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error extracting methods: ${error.message}`
        }],
        isError: true
      };
    }
  }

  startWatching() {
    if (this.watcher) {
      return; // Déjà en cours
    }

    console.error('[MCP] Watching temp/methods.js for changes...');

    this.watcher = fs.watch(this.tempPath, async (eventType) => {
      if (eventType === 'change') {
        await this.handleFileChange();
      }
    });
  }

  async handleFileChange() {
    try {
      const newContent = fs.readFileSync(this.tempPath, 'utf-8');

      // Ignorer si pas de changement réel
      if (newContent === this.lastContent) {
        return;
      }

      this.lastContent = newContent;

      console.error('[MCP] Detected change in temp/methods.js, reinjecting...');

      // Réinjecter
      const { MethodReinjector } = require('./method-reinjector.cjs');
      const reinjector = new MethodReinjector({ backup: true });

      const result = await reinjector.reinject(this.snapshotPath, this.tempPath);

      if (result.success) {
        console.error(`[MCP] ✓ Reinjected ${result.successCount} methods`);
      } else {
        console.error(`[MCP] ⚠ Partial reinjection: ${result.failedCount} failures`);
      }

    } catch (error) {
      console.error(`[MCP] Error during reinjection: ${error.message}`);
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('[MCP] LOLVE Context Optimizer started');
  }
}

// Start server
if (require.main === module) {
  const server = new LolveMCPServer();
  server.start().catch(error => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}

module.exports = { LolveMCPServer };
