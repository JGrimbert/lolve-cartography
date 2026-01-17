#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ExtractForClaude } = require("./extract-for-claude.cjs");
const { MethodSnapshot } = require("./method-snapshot.cjs");

/**
 * Fonction qui fait l’extraction
 */
async function extractOnly(extractor, query) {
    const preprocessed = extractor.agents.preprocess.process(query);
    const searchSession = extractor.agents.context.createSearchSession(preprocessed.cleaned);

    if (searchSession.keys.length === 0) {
        throw new Error('Aucune méthode trouvée');
    }

    const snapshot = new MethodSnapshot();
    const snapshotData = snapshot.capture(searchSession.keys);

    // Dossier temp
    const tempDir = extractor.options.tempDir;
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const snapshotPath = path.join(tempDir, 'snapshot.json');
    snapshot.save(snapshotData, snapshotPath);

    const tempContent = snapshot.generateTempFile(snapshotData, {
        includeContext: true,
        groupByClass: true
    });

    const tempPath = path.join(tempDir, 'methods.js');
    fs.writeFileSync(tempPath, tempContent, 'utf-8');

    console.log(`\n✅ ${searchSession.keys.length} méthode(s) extraite(s) dans ${tempPath}`);
    searchSession.keys.slice(0, 5).forEach(k => console.log(`   - ${k}`));
    if (searchSession.keys.length > 5) {
        console.log(`   ... et ${searchSession.keys.length - 5} autres`);
    }
    console.log();
}

/**
 * Wrapper CLI
 */
async function main() {
    const query = process.argv.slice(2).join(" ");
    if (!query) {
        console.error("Usage: npm run extract -- \"ma query\"");
        process.exit(1);
    }

    const extractor = await new ExtractForClaude({
        tempDir: 'temp',
        autoReinject: false
    }).init();

    try {
        await extractOnly(extractor, query);
    } catch (err) {
        console.error("❌ Erreur :", err.message);
        process.exit(1);
    }
}

main();
