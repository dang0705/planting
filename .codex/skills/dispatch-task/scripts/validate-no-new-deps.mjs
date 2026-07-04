#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [handoffFile] = process.argv.slice(2);
if (!handoffFile) {
  console.error('usage: validate-no-new-deps.mjs <handoff.json>');
  process.exit(2);
}

const handoff = JSON.parse(fs.readFileSync(handoffFile, 'utf8'));
const policy = String(handoff?.project_constraints?.dependency_policy ?? '').toLowerCase();
const status = execFileSync('git', ['status', '--short'], { encoding: 'utf8' });
const changed = status
  .split('\n')
  .filter(Boolean)
  .map((line) => line.slice(3).replace(/^.* -> /, '').trim());
const depFiles = changed.filter((file) => /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(file));

if (policy === 'no_new_dependencies' && depFiles.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'no_new_deps', changed_dependency_files: depFiles }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'passed', gate: 'no_new_deps', changed_dependency_files: depFiles }, null, 2));
