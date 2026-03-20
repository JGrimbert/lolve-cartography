# Roadmap
> Project: **lolve-cartography**

*Generated: 2026-03-16T21:16:17.450Z*

## Stats

| Metric | Value |
|--------|-------|
| Nodes  | 221 |
| Edges  | 12 |
| Levels | 2 |
| Steps  | 49 |

## Steps

### Step 1 · Internal: ASTParser

*No prerequisites*
*Parallelizable with: Steps 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `ASTParser` → `lib\mcp\method-indexer.cjs`
- `ASTParser.extractClassInfo` → `lib\mcp\method-indexer.cjs`
- `ASTParser.extractClasses` → `lib\mcp\method-indexer.cjs`
- `ASTParser.extractFunctions` → `lib\mcp\method-indexer.cjs`
- `ASTParser.extractJSDoc` → `lib\mcp\method-indexer.cjs`

### Step 2 · Internal: ASTParser

*No prerequisites*
*Parallelizable with: Steps 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `ASTParser.extractMethodInfo` → `lib\mcp\method-indexer.cjs`
- `ASTParser.extractVueScript` → `lib\mcp\method-indexer.cjs`
- `ASTParser.paramToString` → `lib\mcp\method-indexer.cjs`
- `ASTParser.parseFile` → `lib\mcp\method-indexer.cjs`
- `ASTParser.parseJSDoc` → `lib\mcp\method-indexer.cjs`

### Step 3 · Internal: AnnotationCache

*No prerequisites*
*Parallelizable with: Steps 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `AnnotationCache` → `lib\mcp\method-indexer.cjs`
- `AnnotationCache.isUpToDate` → `lib\mcp\method-indexer.cjs`
- `AnnotationCache.load` → `lib\mcp\method-indexer.cjs`
- `AnnotationCache.mergeWithMethod` → `lib\mcp\method-indexer.cjs`
- `AnnotationCache.remove` → `lib\mcp\method-indexer.cjs`

### Step 4 · Internal: Atlas

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `Atlas` → `lib\atlas.cjs`
- `Atlas.fromCallGraph` → `lib\atlas.cjs`
- `Atlas.fromFileIndex` → `lib\atlas.cjs`
- `Atlas.fromMethodIndex` → `lib\atlas.cjs`
- `Atlas.toJSON` → `lib\atlas.cjs`

### Step 5 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `AtlasGenerator`
- `AtlasGenerator.scoreNodes`
- `AtlasGenerator.writeArtifacts`
- `ConsumerAnalyzer`
- `ContextAgent`

**Files:**
- `lib\atlas-generator.cjs`
- `lib\annotation-manager.cjs`
- `lib\mcp\context-agent.cjs`

### Step 6 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `ContextAgent.isIndexStale`
- `ContextAgent.searchMethods`
- `EffectAnalyzer`
- `EffectAnalyzer.analyzeContext`
- `EffectAnalyzer.analyzeEffects`

**Files:**
- `lib\mcp\context-agent.cjs`
- `lib\annotation-manager.cjs`

### Step 7 · Internal: ExperienceMemory

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `ExperienceMemory` → `lib\experience-memory.cjs`
- `ExperienceMemory.addLesson` → `lib\experience-memory.cjs`
- `ExperienceMemory.categorizeError` → `lib\experience-memory.cjs`
- `ExperienceMemory.fingerprintToTerms` → `lib\experience-memory.cjs`
- `ExperienceMemory.markFailure` → `lib\experience-memory.cjs`

### Step 8 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `ExperienceMemory.markSuccess`
- `ExperienceMemory.recordModifications`
- `ExperienceMemory.save`
- `ExtractForClaude`
- `ExtractForClaude.displayClaudeCodeInstructions`

**Files:**
- `lib\experience-memory.cjs`
- `lib\mcp\extract-for-claude.cjs`

### Step 9 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `ExtractForClaude.displaySummary`
- `ExtractForClaude.generateClaudeCodeCommand`
- `ExtractForClaude.showHelp`
- `ExtractForClaude.wrapText`
- `FileAnalyzer`

**Files:**
- `lib\mcp\extract-for-claude.cjs`
- `lib\context\file-analyzer.cjs`

### Step 10 · Internal: FileAnalyzer

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `FileAnalyzer.analyzeFile` → `lib\context\file-analyzer.cjs`
- `FileAnalyzer.detectCategory` → `lib\context\file-analyzer.cjs`
- `FileAnalyzer.extractJSDoc` → `lib\context\file-analyzer.cjs`
- `FileAnalyzer.parseJSDocDescription` → `lib\context\file-analyzer.cjs`
- `FileAnalyzer.parseJSDocTags` → `lib\context\file-analyzer.cjs`

### Step 11 · Internal: FingerprintGenerator

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `FingerprintGenerator` → `lib\fingerprint-generator.cjs`
- `FingerprintGenerator.detectEffects` → `lib\fingerprint-generator.cjs`
- `FingerprintGenerator.detectErrorType` → `lib\fingerprint-generator.cjs`
- `FingerprintGenerator.detectIntent` → `lib\fingerprint-generator.cjs`
- `FingerprintGenerator.estimateComplexity` → `lib\fingerprint-generator.cjs`

### Step 12 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `FingerprintGenerator.generate`
- `FingerprintGenerator.toCanonicalString`
- `LolveMCPServer`
- `LolveMCPServer.clearModuleCache`
- `LolveMCPServer.startWatching`

**Files:**
- `lib\fingerprint-generator.cjs`
- `lib\mcp\lolvemcp.js`

### Step 13 · Internal: MethodIndexer

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `MethodIndexer` → `lib\mcp\method-indexer.cjs`
- `MethodIndexer.extractMethodCode` → `lib\mcp\method-indexer.cjs`
- `MethodIndexer.hasFileChanged` → `lib\mcp\method-indexer.cjs`
- `MethodIndexer.inferRole` → `lib\mcp\method-indexer.cjs`
- `MethodIndexer.loadIndex` → `lib\mcp\method-indexer.cjs`

### Step 14 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `MethodIndexer.removeFileFromIndex`
- `MethodIndexer.searchMethods`
- `MethodReinjector`
- `MethodReinjector.deleteMethodFromFile`
- `MethodReinjector.detectChanges`

**Files:**
- `lib\mcp\method-indexer.cjs`
- `lib\mcp\method-reinjector.cjs`

### Step 15 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `MethodReinjector.levenshtein`
- `MethodReinjector.parseAsJavaScript`
- `MethodReinjector.parseModifiedFile`
- `MethodReinjector.similarity`
- `MethodSearch`

**Files:**
- `lib\mcp\method-reinjector.cjs`
- `lib\context\method-search.cjs`

### Step 16 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `MethodSearch.searchMethods`
- `MethodSnapshot`
- `MethodSnapshot.checkFileIntegrity`
- `MethodSnapshot.generateTempFile`
- `MethodSnapshot.hashFile`

**Files:**
- `lib\context\method-search.cjs`
- `lib\mcp\method-snapshot.cjs`

### Step 17 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `MethodSnapshot.load`
- `MethodSnapshot.normalizeCode`
- `MethodSnapshot.save`
- `PreprocessAgent`
- `PreprocessAgent.clean`

**Files:**
- `lib\mcp\method-snapshot.cjs`
- `lib\mcp\preprocess-agent.cjs`

### Step 18 · Internal: PreprocessAgent

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `PreprocessAgent.detectIntent` → `lib\mcp\preprocess-agent.cjs`
- `PreprocessAgent.enrich` → `lib\mcp\preprocess-agent.cjs`
- `PreprocessAgent.estimateComplexity` → `lib\mcp\preprocess-agent.cjs`
- `PreprocessAgent.estimateTokens` → `lib\mcp\preprocess-agent.cjs`
- `PreprocessAgent.extractDomainTerms` → `lib\mcp\preprocess-agent.cjs`

### Step 19 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `PreprocessAgent.generateSystemPrompt`
- `PreprocessAgent.process`
- `RiskInferenceEngine`
- `RiskInferenceEngine.analyzePatternRisk`
- `RiskInferenceEngine.analyzeRisks`

**Files:**
- `lib\mcp\preprocess-agent.cjs`
- `lib\experience-memory.cjs`

### Step 20 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `RiskInferenceEngine.calculateOverallRisk`
- `RiskInferenceEngine.detectSpecificRisks`
- `RiskInferenceEngine.formatRiskReport`
- `SearchSession`
- `SearchSession._addHistory`

**Files:**
- `lib\experience-memory.cjs`
- `lib\context\search-session.cjs`

### Step 21 · Internal: SearchSession

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `SearchSession._findCreatorMethods` → `lib\context\search-session.cjs`
- `SearchSession._findMethodsOfClass` → `lib\context\search-session.cjs`
- `SearchSession._search` → `lib\context\search-session.cjs`
- `SearchSession.applyAnnotations` → `lib\context\search-session.cjs`
- `SearchSession.checkAnnotations` → `lib\context\search-session.cjs`

### Step 22 · Internal: SearchSession

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `SearchSession.count` → `lib\context\search-session.cjs`
- `SearchSession.exclude` → `lib\context\search-session.cjs`
- `SearchSession.history` → `lib\context\search-session.cjs`
- `SearchSession.keys` → `lib\context\search-session.cjs`
- `SearchSession.loadCode` → `lib\context\search-session.cjs`

### Step 23 · Internal: SearchSession

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `SearchSession.loadFile` → `lib\context\search-session.cjs`
- `SearchSession.resetExclusions` → `lib\context\search-session.cjs`
- `SearchSession.results` → `lib\context\search-session.cjs`
- `SearchSession.retry` → `lib\context\search-session.cjs`
- `SearchSession.summary` → `lib\context\search-session.cjs`

### Step 24 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `SearchSession.toContext`
- `SearchSession.toPrompt`
- `SourceParser`
- `SourceParser.extractArrowBody`
- `SourceParser.extractBracedBlock`

**Files:**
- `lib\context\search-session.cjs`
- `lib\annotation-manager.cjs`

### Step 25 · Internal: SourceParser

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `SourceParser.extractClasses` → `lib\annotation-manager.cjs`
- `SourceParser.extractImports` → `lib\annotation-manager.cjs`
- `SourceParser.extractMethods` → `lib\annotation-manager.cjs`
- `SourceParser.extractStandaloneFunctions` → `lib\annotation-manager.cjs`
- `SourceParser.parseFile` → `lib\annotation-manager.cjs`

### Step 26 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `SourceParser.parseJSDoc` → `lib\annotation-manager.cjs`
- `SuggestionGenerator` → `lib\annotation-manager.cjs`
- `SuggestionGenerator.calculateConfidence` → `lib\annotation-manager.cjs`
- `SuggestionGenerator.generateAll` → `lib\annotation-manager.cjs`
- `SuggestionGenerator.generateForFile` → `lib\annotation-manager.cjs`

### Step 27 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `SuggestionGenerator.suggestClassRole`
- `SuggestionGenerator.suggestMethodRole`
- `TFIDFEmbedding`
- `TFIDFEmbedding.cosineSimilarity`
- `TFIDFEmbedding.serialize`

**Files:**
- `lib\annotation-manager.cjs`
- `lib\experience-memory.cjs`

### Step 28 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `buildCallGraph`
- `compressedFormatter`
- `deepMerge`
- `dependencyFormatter`
- `detectSourcePath`

**Files:**
- `lib\call-graph.cjs`
- `lib\atlas-formatter.cjs`
- `lib\utils\config-loader.cjs`

### Step 29 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `extractCode`
- `extractEdges`
- `extractOnly`
- `findLeadingCommentsStart`
- `generateDiagram`

**Files:**
- `lib\mcp\method-indexer.cjs`
- `lib\call-graph.cjs`
- `lib\mcp\extract-cli.js`
- `lib\project-diagram.cjs`

### Step 30 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `getFileStats`
- `hashContent`
- `list`
- `loadAnnotCache`
- `loadModuleConfig`

**Files:**
- `lib\mcp\method-indexer.cjs`
- `lib\utils\logger.cjs`
- `lib\project-diagram.cjs`
- `lib\utils\config-loader.cjs`

### Step 31 · Internal: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `loadProjectConfig`
- `log`
- `main`
- `parseContent`
- `repoMapFormatter`

**Files:**
- `lib\utils\config-loader.cjs`
- `lib\setup-claude-hooks.cjs`
- `lib\atlas-generator.cjs`
- `lib\atlas-formatter.cjs`

### Step 32 · Internal: Level 1 (3 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `runFull`
- `section`
- `walk`

**Files:**
- `lib\annotation-manager.cjs`
- `lib\utils\logger.cjs`
- `lib\atlas-generator.cjs`

### Step 33 · Service: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38*

> Foundational — no dependencies

- `AnnotationCache.get`
- `AnnotationCache.getStats`
- `ConsumerAnalyzer.getConsumers`
- `ContextAgent.findRelevantMethods`
- `ExperienceMemory.findSimilar`

**Files:**
- `lib\mcp\method-indexer.cjs`
- `lib\annotation-manager.cjs`
- `lib\mcp\context-agent.cjs`
- `lib\experience-memory.cjs`

### Step 34 · Service: ExperienceMemory

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35, 36, 37, 38*

> Foundational — no dependencies

- `ExperienceMemory.getCurrentEvent` → `lib\experience-memory.cjs`
- `ExperienceMemory.getEvent` → `lib\experience-memory.cjs`
- `ExperienceMemory.getPatternSignature` → `lib\experience-memory.cjs`
- `ExperienceMemory.getStats` → `lib\experience-memory.cjs`
- `ExperienceMemory.updateDecision` → `lib\experience-memory.cjs`

### Step 35 · Service: Level 1 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38*

> Foundational — no dependencies

- `ExperienceMemory.updatePatterns`
- `FingerprintGenerator.getPatternSignature`
- `MethodIndexer.getStats`
- `MethodReinjector.replaceMethodInFile`
- `MethodSearch.findRelevantMethods`

**Files:**
- `lib\experience-memory.cjs`
- `lib\fingerprint-generator.cjs`
- `lib\mcp\method-indexer.cjs`
- `lib\mcp\method-reinjector.cjs`
- `lib\context\method-search.cjs`

### Step 36 · Service: SearchSession.getAtLevel

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 38*

> Foundational — no dependencies

- `SearchSession.getAtLevel` → `lib\context\search-session.cjs`

### Step 37 · Core: Level 1 (2 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38*

> Foundational — no dependencies

- `ContextAgent.buildIndex`
- `RiskInferenceEngine.createWarningFromFailure`

**Files:**
- `lib\mcp\context-agent.cjs`
- `lib\experience-memory.cjs`

### Step 38 · Entry: Level 1 (2 nodes)

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37*

> Foundational — no dependencies

- `ExperienceMemory.init`
- `PreprocessAgent.init`

**Files:**
- `lib\experience-memory.cjs`
- `lib\mcp\preprocess-agent.cjs`

### Step 39 · Internal: Level 2 (5 nodes)

*Requires: Steps 4, 14, 16*
*Parallelizable with: Steps 40, 41, 42, 43, 44, 45, 46, 47, 48, 49*

> Depends on 3 prior steps

- `AnnotationCache.save`
- `AnnotationCache.set`
- `AtlasGenerator.generate`
- `ContextAgent.formatProjectContext`
- `ExtractForClaude.run`

**Files:**
- `lib\mcp\method-indexer.cjs`
- `lib\atlas-generator.cjs`
- `lib\mcp\context-agent.cjs`
- `lib\mcp\extract-for-claude.cjs`

### Step 40 · Internal: Level 2 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 39, 41, 42, 43, 44, 45, 46, 47, 48, 49*

> Level 2 — independent from prior steps

- `ExtractForClaude.waitForUserValidation`
- `FileAnalyzer.extractDependencies`
- `FileAnalyzer.extractExports`
- `FileAnalyzer.extractKeywords`
- `FingerprintGenerator.detectDomains`

**Files:**
- `lib\mcp\extract-for-claude.cjs`
- `lib\context\file-analyzer.cjs`
- `lib\fingerprint-generator.cjs`

### Step 41 · Internal: Level 2 (5 nodes)

*Requires: Steps 8, 14, 16*
*Parallelizable with: Steps 39, 40, 42, 43, 44, 45, 46, 47, 48, 49*

> Depends on 3 prior steps

- `FingerprintGenerator.extractKeywords`
- `FingerprintGenerator.extractRoles`
- `LolveMCPServer.extractMethods`
- `LolveMCPServer.handleFileChange`
- `LolveMCPServer.log`

**Files:**
- `lib\fingerprint-generator.cjs`
- `lib\mcp\lolvemcp.js`

### Step 42 · Internal: Level 2 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 39, 40, 41, 43, 44, 45, 46, 47, 48, 49*

> Level 2 — independent from prior steps

- `LolveMCPServer.setupHandlers`
- `LolveMCPServer.start`
- `MethodIndexer.indexAll`
- `MethodIndexer.indexFile`
- `MethodIndexer.saveIndex`

**Files:**
- `lib\mcp\lolvemcp.js`
- `lib\mcp\method-indexer.cjs`

### Step 43 · Internal: Level 2 (5 nodes)

*Requires: Steps 13*
*Parallelizable with: Steps 39, 40, 41, 42, 44, 45, 46, 47, 48, 49*

> Depends on 1 prior step

- `MethodReinjector.reinject`
- `MethodSearch._doSearch`
- `MethodSnapshot.capture`
- `PreprocessAgent.detectDomains`
- `PreprocessAgent.extractKeywords`

**Files:**
- `lib\mcp\method-reinjector.cjs`
- `lib\context\method-search.cjs`
- `lib\mcp\method-snapshot.cjs`
- `lib\mcp\preprocess-agent.cjs`

### Step 44 · Internal: Level 2 (5 nodes)

*No prerequisites*
*Parallelizable with: Steps 39, 40, 41, 42, 43, 45, 46, 47, 48, 49*

> Level 2 — independent from prior steps

- `PreprocessAgent.normalizeTerms`
- `SearchSession.expand`
- `SourceParser.extractExports`
- `TFIDFEmbedding.addDocument`
- `TFIDFEmbedding.deserialize`

**Files:**
- `lib\mcp\preprocess-agent.cjs`
- `lib\context\search-session.cjs`
- `lib\annotation-manager.cjs`
- `lib\experience-memory.cjs`

### Step 45 · Internal: TFIDFEmbedding.embed

*No prerequisites*
*Parallelizable with: Steps 39, 40, 41, 42, 43, 44, 46, 47, 48, 49*

> Level 2 — independent from prior steps

- `TFIDFEmbedding.embed` → `lib\experience-memory.cjs`

### Step 46 · Core: Level 2 (5 nodes)

*Requires: Steps 13*
*Parallelizable with: Steps 39, 40, 41, 42, 43, 44, 45, 47, 48, 49*

> Depends on 1 prior step

- `AtlasGenerator.buildCalls`
- `AtlasGenerator.buildMods`
- `AtlasGenerator.buildRepo`
- `AtlasGenerator.buildSyms`
- `ConsumerAnalyzer.buildCallGraph`

**Files:**
- `lib\atlas-generator.cjs`
- `lib\annotation-manager.cjs`

### Step 47 · Core: Level 2 (2 nodes)

*Requires: Steps 20*
*Parallelizable with: Steps 39, 40, 41, 42, 43, 44, 45, 46, 48, 49*

> Depends on 1 prior step

- `ContextAgent.createSearchSession`
- `ExperienceMemory.createEvent`

**Files:**
- `lib\mcp\context-agent.cjs`
- `lib\experience-memory.cjs`

### Step 48 · Entry: Level 2 (2 nodes)

*Requires: Steps 5, 15, 17*
*Parallelizable with: Steps 39, 40, 41, 42, 43, 44, 45, 46, 47, 49*

> Depends on 3 prior steps

- `ContextAgent.init`
- `ExtractForClaude.init`

**Files:**
- `lib\mcp\context-agent.cjs`
- `lib\mcp\extract-for-claude.cjs`

### Step 49 · Service: Level 2 (3 nodes)

*No prerequisites*
*Parallelizable with: Steps 39, 40, 41, 42, 43, 44, 45, 46, 47, 48*

> Level 2 — independent from prior steps

- `MethodReinjector.findInsertionPoint`
- `SearchSession.getAllLoadedCode`
- `SearchSession.getAllLoadedFiles`

**Files:**
- `lib\mcp\method-reinjector.cjs`
- `lib\context\search-session.cjs`
