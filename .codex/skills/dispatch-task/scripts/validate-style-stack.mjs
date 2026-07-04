#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [handoffFile] = process.argv.slice(2);
if (!handoffFile) {
  console.error('usage: validate-style-stack.mjs <handoff.json>');
  process.exit(2);
}

const handoff = JSON.parse(fs.readFileSync(handoffFile, 'utf8'));
const styling = String(handoff?.project_constraints?.styling_system ?? '').toLowerCase();
const scssPolicy = String(handoff?.project_constraints?.new_scss_policy ?? '').toLowerCase();
const status = execFileSync('git', ['status', '--short'], { encoding: 'utf8' });
const changed = status
  .split('\n')
  .filter(Boolean)
  .map((line) => line.slice(3).replace(/^.* -> /, '').trim());
const scssFiles = changed.filter((file) => /\.s[ac]ss$/i.test(file));
const vueFiles = changed.filter((file) => /\.vue$/i.test(file));
const vueWithScss = [];

for (const file of vueFiles) {
  if (fs.existsSync(file) && /<style[^>]*lang=["']scss["']/i.test(fs.readFileSync(file, 'utf8'))) {
    vueWithScss.push(file);
  }
}

const errors = [];
if (styling.includes('tailwind') && scssPolicy === 'forbidden' && (scssFiles.length || vueWithScss.length)) {
  errors.push('Tailwind + new_scss_policy=forbidden cannot add/change SCSS files or <style lang="scss"> blocks');
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'style_stack', scss_files: scssFiles, vue_with_scss: vueWithScss, errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'passed', gate: 'style_stack', scss_files: scssFiles, vue_with_scss: vueWithScss }, null, 2));
