#!/usr/bin/env node

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

        // ❗ Capabilities passées directement au constructeur
        this.server = new Server(
            { name: 'lolve-context-optimizer', version: '1.0.0' },
            {
                capabilities: {
                    resources: { read: true, list: true, subscribe: true, listChanged: true },
                    tools: { list: true, call: true },
                    prompts: { list: true, get: true }
                }
            }
        );

        // Handlers définis juste après
        this.setupHandlers();
    }

    log(level, message) {
        const timestamp = new Date().toISOString().slice(11, 23);
        const icons = { info: 'i', success: '+', warn: '!', error: 'x', call: '>' };
        console.error(`[MCP ${timestamp}] ${icons[level] || ''} ${message}`);
    }

    clearModuleCache() {
        const libPath = path.dirname(__filename);
        Object.keys(require.cache).forEach((key) => {
            if (key.startsWith(libPath)) delete require.cache[key];
        });
    }

    async extractMethods(query) {
        const startTime = Date.now();
        this.callCount++;
        const callId = this.callCount;

        this.log('call', `#${callId} extract_methods("${query}")`);

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
                content: [
                    {
                        type: 'text',
                        text: `Extracted ${searchSession.keys.length} methods (${fileSizeKb}KB, ${duration}ms)\n\nMethods:\n${methodsList}\n\n-> Now Read temp/methods.js`
                    }
                ]
            };
        } catch (error) {
            this.log('error', `#${callId} ${error.message}`);
            return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
        }
    }

    async startWatching() {
        if (this.watcher) return;

        try {
            const { default: chokidar } = await import('chokidar');
            this.log('info', 'Watching temp/methods.js (chokidar)...');

            this.watcher = chokidar.watch(this.tempPath, {
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }
            });

            this.watcher.on('change', async () => await this.handleFileChange());
        } catch (error) {
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
        // ❗ Connecte le transport APRÈS capabilities et handlers
        const transport = new StdioServerTransport();
        await this.server.connect(transport);

        this.log('success', 'MCP Server started');

        if (fs.existsSync(this.tempPath) && fs.existsSync(this.snapshotPath)) {
            this.lastContent = fs.readFileSync(this.tempPath, 'utf-8');
            await this.startWatching();
            this.log('info', 'Auto-started watcher (existing temp/methods.js)');
        }
    }

    setupHandlers() {
        // Resources
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: [
                {
                    uri: 'lolve://context/optimized',
                    name: 'Optimized Context',
                    description: 'Extracted methods for optimal token usage',
                    mimeType: 'text/javascript'
                }
            ]
        }));

        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            if (request.params.uri === 'lolve://context/optimized' && fs.existsSync(this.tempPath)) {
                return {
                    contents: [
                        {
                            uri: request.params.uri,
                            mimeType: 'text/javascript',
                            text: fs.readFileSync(this.tempPath, 'utf-8')
                        }
                    ]
                };
            }
            throw new Error('Resource not found');
        });

        // Tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'extract_methods',
                    description: 'Extract relevant methods before reading/editing source files.',
                    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
                }
            ]
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name === 'extract_methods') {
                return await this.extractMethods(request.params.arguments.query);
            }
            throw new Error('Tool not found');
        });

        // Prompts
        this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
            prompts: [{ name: 'code-workflow', description: 'Mandatory workflow for this codebase' }]
        }));

        this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            if (request.params.name === 'code-workflow') {
                return {
                    messages: [
                        {
                            role: 'system',
                            content: {
                                type: 'text',
                                text: `
You MUST follow this workflow for every user request:

1. ALWAYS call the tool "extract_methods" with the user's request as query.
2. AFTER the tool finishes, ALWAYS read the resource "lolve://context/optimized".
3. ONLY use the content of that resource to answer.
4. NEVER assume missing code.
5. NEVER read other files.
6. If the context is insufficient, ask the user to refine the request.

Failure to follow this workflow is an error.
`
                            }
                        }
                    ]
                };
            }

            throw new Error('Prompt not found');
        });


        this.log('success', 'All handlers registered');
    }
}

// Lancement
if (require.main === module) {
    const server = new LolveMCPServer();
    server.log('info', 'Starting...');
    server.start().catch(err => {
        server.log('error', err.message);
        process.exit(1);
    });
}

module.exports = { LolveMCPServer };
