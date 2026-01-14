/**
 * Simple file utilities
 */

const fs = require('fs');
const path = require('path');

const readJSON = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
};

const writeJSON = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
};

const readFile = (p) => {
  try { return fs.readFileSync(p, 'utf-8'); }
  catch { return null; }
};

const writeFile = (p, content) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

const createBackup = (p) => {
  if (!fs.existsSync(p)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(path.dirname(p), '.backups', `${path.basename(p, path.extname(p))}_${ts}${path.extname(p)}`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(p, backupPath);
  return backupPath;
};

const listFiles = (dir, filter = () => true) => {
  const results = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (filter(entry.name)) results.push(full);
    }
  };
  walk(dir);
  return results;
};

module.exports = { readJSON, writeJSON, readFile, writeFile, createBackup, listFiles };
