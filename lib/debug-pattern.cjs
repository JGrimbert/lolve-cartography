const fs = require('fs');
const content = fs.readFileSync('C:/lolve/src/prima/Peri/Aion/Orb.js', 'utf-8');

// Test du pattern
const pattern = /\/\*\*\s*([\s\S]*?)\s*\*+\/\s*(?:static\s+)?(?:async\s+)?(#?\w+)\s*(?:\(|=)/g;
let match;
console.log('Recherche de méthodes JSDoc dans Orb.js...\n');
while ((match = pattern.exec(content)) !== null) {
  const methodName = match[2];
  const jsdoc = match[1];
  const roleMatch = jsdoc.match(/@[Rr]ole:?\s*(\w+)/);
  console.log('Method:', methodName);
  console.log('Role:', roleMatch ? roleMatch[1] : 'none');
  console.log('JSDoc:', jsdoc.substring(0, 80).replace(/\n/g, ' '));
  console.log('---');
}
