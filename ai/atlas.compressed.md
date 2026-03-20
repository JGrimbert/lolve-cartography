SYSTEM
lolve-cartography — codebase cartography and method indexing tools

MODULES
annotation-manager.cjs  SourceParser, EffectAnalyzer, ConsumerAnalyzer, SuggestionGenerator
atlas-generator.cjs  AtlasGenerator
atlas.cjs  Atlas
file-analyzer.cjs  FileAnalyzer
method-search.cjs  MethodSearch
search-session.cjs  SearchSession
experience-memory.cjs  TFIDFEmbedding, ExperienceMemory, RiskInferenceEngine
fingerprint-generator.cjs  FingerprintGenerator
... +7 more

API

class SourceParser
  parseFile(filePath)
  extractClasses(content)
  extractMethods(classBody, className)
  extractStandaloneFunctions(content)
  ... +5 more

class EffectAnalyzer
  analyzeEffects(methodBody, className)
  analyzeContext(method)

class ConsumerAnalyzer
  buildCallGraph(parsedFiles)
  getConsumers(className, methodName)

class SuggestionGenerator
  generateAll()
  generateForFile(parsedFile)
  suggestClassRole(cls)
  suggestMethodRole(method)
  ... +1 more

class FileAnalyzer
  analyzeFile(filePath)
  detectCategory(relativePath, content)
  extractExports(content)
  extractDependencies(content)
  ... +4 more

FLOW

