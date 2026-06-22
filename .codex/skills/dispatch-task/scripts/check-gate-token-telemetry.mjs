#!/usr/bin/env node
import fs from 'node:fs';

const required = [
  'gate_name',
  'counter_status',
  'counter_source',
  'pre_gate_tokens',
  'post_gate_tokens',
  'gate_delta_tokens',
  'main_cumulative_tokens',
  'delta_basis',
  'heaviest_sources',
  'budget_status',
  'compression_action',
  'next_gate'
];

const files = process.argv.slice(2);
let failed = false;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const blocks = [...text.matchAll(/Gate Token Telemetry:[\s\S]*?(?=\n```|\n\n##|\n\n#|$)/g)];
  for (const block of blocks) {
    for (const key of required) {
      if (!block[0].includes(`${key}:`)) {
        console.error(`${file}: Gate Token Telemetry missing ${key}`);
        failed = true;
      }
    }
    if (/phase\d.*completed|in_progress/.test(block[0]) && !block[0].includes('gate_delta_tokens:')) {
      console.error(`${file}: status-only Gate Token Telemetry is invalid`);
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
