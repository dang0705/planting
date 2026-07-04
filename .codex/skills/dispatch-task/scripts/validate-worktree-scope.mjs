#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [handoffFile] = process.argv.slice(2);
if (!handoffFile) {
  console.error('usage: validate-worktree-scope.mjs <handoff.json>');
  process.exit(2);
}

const handoff = JSON.parse(fs.readFileSync(handoffFile, 'utf8'));
const errors = [];
const globToRegExp = (pattern) => {
  let source = String(pattern)
    .replaceAll('\\', '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&');
  source = source
    .replace(/\*\*/g, '§§DOUBLE§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§DOUBLE§§/g, '.*');
  return new RegExp(`^${source}$`);
};
const matchesAny = (file, patterns = []) => patterns.some((pattern) =>
  globToRegExp(pattern).test(String(file).replaceAll('\\', '/')));
const run = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const statusLines = run(['status', '--short']).split('\n').filter(Boolean);
const files = statusLines
  .map((line) => line.slice(3).replace(/^.* -> /, '').trim())
  .filter(Boolean);

for (const file of files) {
  if (!matchesAny(file, handoff.allowed_paths ?? [])) {
    errors.push(`actual changed file outside allowed_paths: ${file}`);
  }
  if (matchesAny(file, handoff.forbidden_paths ?? [])) {
    errors.push(`actual changed file matches forbidden_paths: ${file}`);
  }
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'worktree_scope', changed_files: files, errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'passed', gate: 'worktree_scope', changed_files: files }, null, 2));
