/**
 * lolve-cartography - Main entry point
 *
 * Codebase cartography and JSDoc annotation management tools
 */

const { SourceParser, EffectAnalyzer, ConsumerAnalyzer, SuggestionGenerator, SuggestionApplier, CONFIG: AnnotationConfig } = require('./annotation-manager.cjs');
const { MethodIndexer, AnnotationCache, CONFIG: IndexerConfig } = require('./method-indexer.cjs');
const { ContextAgent } = require('./context-agent.cjs');

module.exports = {
  // Annotation management
  SourceParser,
  EffectAnalyzer,
  ConsumerAnalyzer,
  SuggestionGenerator,
  SuggestionApplier,
  AnnotationConfig,

  // Method indexing
  MethodIndexer,
  AnnotationCache,
  IndexerConfig,

  // Context analysis
  ContextAgent
};
