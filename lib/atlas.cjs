/**
 * Atlas - Modèle de données pour la cartographie AI-friendly
 *
 * Attributs courts (style biblio-attribute) :
 *   repo   { dirs, files }              arborescence du projet
 *   syms   { classes, methods, fns }    symboles indexés
 *   calls  { 'Class.method': [...] }    call graph
 *   mods   { 'file.cjs': [...] }        dépendances inter-modules
 *   meta   { generated, version, root } métadonnées
 */

class Atlas {
  constructor() {
    this.repo  = { dirs: [], files: [] };
    this.syms  = { classes: {}, methods: {}, fns: {} };
    this.calls = {};
    this.mods  = {};
    this.meta  = { generated: null, version: '1', root: null };
  }

  /**
   * Charge syms depuis le format method-index.json
   * @param {Object} methodIndex - { classes: {}, methods: {}, files: {} }
   */
  fromMethodIndex(methodIndex) {
    if (!methodIndex) return this;

    // classes: { ClassName: { file, methods: [...] } }
    for (const [className, classData] of Object.entries(methodIndex.classes || {})) {
      this.syms.classes[className] = {
        file: classData.file,
        methods: classData.methods || []
      };
    }

    // methods: { 'Class.method': { signature, role, ... } }
    for (const [key, methodData] of Object.entries(methodIndex.methods || {})) {
      this.syms.methods[key] = {
        signature: methodData.signature || key,
        role: methodData.role || null,
        file: methodData.file || null
      };
    }

    return this;
  }

  /**
   * Charge calls depuis buildCallGraph()
   * @param {Object} callGraph - { 'Class.method': string[] }
   */
  fromCallGraph(callGraph) {
    if (!callGraph) return this;
    this.calls = { ...callGraph };
    return this;
  }

  /**
   * Charge repo depuis la liste de fichiers scannés
   * @param {Object} fileIndex - { dirs: [], files: [] }
   */
  fromFileIndex(fileIndex) {
    if (!fileIndex) return this;
    this.repo = {
      dirs:  fileIndex.dirs  || [],
      files: fileIndex.files || []
    };
    return this;
  }

  /**
   * Sérialisation complète
   */
  toJSON() {
    return {
      meta:  this.meta,
      repo:  this.repo,
      syms:  this.syms,
      calls: this.calls,
      mods:  this.mods
    };
  }
}

module.exports = { Atlas };
