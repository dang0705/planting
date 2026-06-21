#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, '..');
const referencesDir = path.join(skillRoot, 'references');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(referencesDir)) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      offenders.push({ file: path.relative(skillRoot, file), line: index + 1 });
    }
  });
}

if (offenders.length) {
  console.error('Inline fenced blocks are forbidden in skills/dispatch-task/references/.');
  console.error('Move templates/snippets to skills/dispatch-task/assets/templates/ and reference template_id instead.');
  for (const item of offenders) {
    console.error(`- ${item.file}:${item.line}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: offenders.length === 0, referencesDir }, null, 2));
