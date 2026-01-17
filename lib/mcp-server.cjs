#!/usr/bin/env node

/**
 * LOLVE MCP Server - Version SDK 1.25.2
 */

const fs = require('fs');
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');

class LolveMCPServer {
  constructor() {
    this.tempDir = 'temp';
    this.tempPath = path.join(this.tempDir, 'methods.js');
    this.snapshotPath = path.join(this.tempDir, 'snapshot.json');
    this.watcher = null;
    this.lastContent = null;
    this.callCount = 0;

    this.server = new Server(
        { name: 'lolve-context-optimizer', version: '1.0.0' },
        {
          capabilities: {
            // Ressources
            resources: {
              read: true,
              list: true // si tu veux exposer listResources
            },
            // Outils
            tools: {
              list: true,
              call: true
            },
            // Prompts
            prompts: {
              list: true,
              get: true
            }
          }
        }
    );

    this.setupHandlers();
  }

  log(level, message) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const icons = { info: 'i', success: '+', warn: '!', error: 'x', call: '>' };
    console.error(`[MCP ${timestamp}] ${icons[level] || ''} ${message}`);
  }

  setupHandlers() {
    const self = this;

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [{
        uri: 'lolve://context/optimized',
        name: 'Optimized Context',
        description: 'Extracted methods for optimal token usage',
        mimeType: 'text/javascript'
      }]
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === 'lolve://context/optimized' && fs.existsSync(self.tempPath)) {
        return { contents: [{ uri: request.params.uri, mimeType: 'text/javascript', text: fs.readFileSync(self.tempPath, 'utf-8') }] };
      }
      throw new Error('Resource not found');
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{
        name: 'extract_methods',
        description: 'MANDATORY: Extract relevant methods before reading/editing source files. Call this first, then Read temp/methods.js, then Edit temp/methods.js (auto-reinjects to sources).',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Keywords to find relevant methods' } },
          required: ['query']
        }
      }]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'extract_methods') {
        return await self.extractMethods(request.params.arguments.query);
      }
      throw new Error('Tool not found');
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [{ name: 'code-workflow', description: 'Mandatory workflow for this codebase' }]
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (request.params.name === 'code-workflow') {
        return { messages: [{ role: 'user', content: { type: 'text', text: 'Workflow: 1) extract_methods 2) Read temp/methods.js 3) Edit temp/methods.js' } }] };
      }
      throw new Error('Prompt not found');
    });

    this.log('success', 'All handlers registered');
  }

  /**
   * Invalidate Node.js require cache for hot-reload during development
   */
  clearModuleCache() {
    const libPath = path.dirname(__filename);
    Object.keys(require.cache).forEach(key => {
      if (key.startsWith(libPath)) {
        delete require.cache[key];
      }
    });
  }

  async extractMethods(query) {
    const startTime = Date.now();
    this.callCount++;
    const callId = this.callCount;

    this.log('call', `#${callId} extract_methods("${query}")`);

    // Clear cache to always use latest code
    this.clearModuleCache();

    try {
      const { ExtractForClaude } = require('./extract-for-claude.cjs');
      const extractor = await new ExtractForClaude({ tempDir: this.tempDir, autoReinject: false }).init();

      const preprocessed = extractor.agents.preprocess.process(query);
      const searchSession = extractor.agents.context.createSearchSession(preprocessed.cleaned);

      if (searchSession.keys.length === 0) {
        this.log('warn', `#${callId} No methods found`);
        return { content: [{ type: 'text', text: 'No methods found. Try different keywords.' }] };
      }

      const { MethodSnapshot } = require('./method-snapshot.cjs');
      const snapshot = new MethodSnapshot();
      const snapshotData = snapshot.capture(searchSession.keys, { scores: searchSession.results });
      snapshot.save(snapshotData, this.snapshotPath);

      const tempContent = snapshot.generateTempFile(snapshotData, { includeContext: true, groupByClass: true });
      fs.writeFileSync(this.tempPath, tempContent, 'utf-8');
      this.lastContent = tempContent;

      const fileSizeKb = (Buffer.byteLength(tempContent, 'utf-8') / 1024).toFixed(1);
      const duration = Date.now() - startTime;

      this.log('success', `#${callId} Extracted ${searchSession.keys.length} methods (${fileSizeKb}KB, ${duration}ms)`);
      await this.startWatching();

      const methodsList = (searchSession.results || searchSession.keys.map(k => ({ key: k, score: 0 })))
        .slice(0, 8)
        .map(r => `  - ${r.key} (score: ${r.score})`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `Extracted ${searchSession.keys.length} methods (${fileSizeKb}KB, ${duration}ms)\n\nMethods:\n${methodsList}\n\n-> Now Read temp/methods.js`
        }]
      };

    } catch (error) {
      this.log('error', `#${callId} ${error.message}`);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }

  async startWatching() {
    if (this.watcher) return;

    try {
      // Import dynamique de chokidar (module ESM)
      const { default: chokidar } = await import('chokidar');

      this.log('info', 'Watching temp/methods.js (chokidar)...');
      this.watcher = chokidar.watch(this.tempPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      });
      this.watcher.on('change', async () => {
        await this.handleFileChange();
      });
    } catch (error) {
      // Fallback vers fs.watch si chokidar échoue
      this.log('warn', `Chokidar failed (${error.message}), using fs.watch fallback`);
      this.watcher = fs.watch(this.tempPath, async (eventType) => {
        if (eventType === 'change') await this.handleFileChange();
      });
    }
  }

  async handleFileChange() {
    try {
      const newContent = fs.readFileSync(this.tempPath, 'utf-8');
      if (newContent === this.lastContent) return;
      this.lastContent = newContent;

      this.log('info', 'Reinjecting changes...');
      this.clearModuleCache();
      const { MethodReinjector } = require('./method-reinjector.cjs');
      const reinjector = new MethodReinjector({ backup: true });
      const result = await reinjector.reinject(this.snapshotPath, this.tempPath);

      if (result.success) {
        this.log('success', `Reinjected ${result.successCount} methods`);
      } else {
        this.log('warn', `Partial: ${result.failedCount} failures`);
      }
    } catch (error) {
      this.log('error', `Reinjection failed: ${error.message}`);
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.log('success', 'MCP Server started');

    // Démarrer le watcher automatiquement si temp/methods.js existe
    if (fs.existsSync(this.tempPath) && fs.existsSync(this.snapshotPath)) {
      this.lastContent = fs.readFileSync(this.tempPath, 'utf-8');
      await this.startWatching();
      this.log('info', 'Auto-started watcher (existing temp/methods.js)');
    }
  }
}

if (require.main === module) {
  const server = new LolveMCPServer();
  server.log('info', 'Starting...');
  server.start().catch(err => {
    server.log('error', err.message);
    process.exit(1);
  });
}

module.exports = { LolveMCPServer };
