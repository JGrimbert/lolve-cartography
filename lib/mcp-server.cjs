#!/usr/bin/env node

/**
 * LOLVE MCP Server - Version SDK 1.25.2 (avec Zod schemas)
 */

const fs = require('fs');
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

// IMPORTANT: Importer les schemas depuis le SDK
const {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');

class LolveMCPServer {
  constructor() {
    this.tempDir = 'temp';
    this.tempPath = path.join(this.tempDir, 'methods.js');
    this.snapshotPath = path.join(this.tempDir, 'snapshot.json');
    this.watcher = null;
    this.lastContent = null;

    this.server = new Server(
      {
        name: 'lolve-context-optimizer',
        version: '1.0.0'
      },
      {
        capabilities: {
          resources: {},
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    const self = this;

    // Utiliser les schemas Zod fournis par le SDK
    
    // Resources/list
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
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

    // Resources/read
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === 'lolve://context/optimized') {
        if (fs.existsSync(self.tempPath)) {
          const content = fs.readFileSync(self.tempPath, 'utf-8');
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

    // Tools/list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
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

    // Tools/call
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'extract_methods') {
        return await self.extractMethods(request.params.arguments.query);
      }
      throw new Error('Tool not found');
    });

    console.error('[MCP] ✓ All handlers registered successfully');
  }

  async extractMethods(query) {
    try {
      const { ExtractForClaude } = require('./extract-for-claude.cjs');
      
      const extractor = await new ExtractForClaude({
        tempDir: this.tempDir,
        autoReinject: false
      }).init();

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

      this.startWatching();

      return {
        content: [{
          type: 'text',
          text: `Extracted ${searchSession.keys.length} methods to ${this.tempPath}. Context optimized.`
        }]
      };

    } catch (error) {
      console.error('[MCP] Error in extractMethods:', error);
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
      return;
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

      if (newContent === this.lastContent) {
        return;
      }

      this.lastContent = newContent;

      console.error('[MCP] Detected change in temp/methods.js, reinjecting...');

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
    console.error('[MCP] SDK version: 1.25.2');
    console.error('[MCP] Ready to accept requests');
  }
}

// Start server
if (require.main === module) {
  console.error('[MCP] Initializing server...');
  const server = new LolveMCPServer();
  server.start().catch(error => {
    console.error('[MCP] Failed to start server:', error.message);
    console.error('[MCP] Stack:', error.stack);
    process.exit(1);
  });
}

module.exports = { LolveMCPServer };
