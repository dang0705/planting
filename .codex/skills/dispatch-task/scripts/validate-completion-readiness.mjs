#!/usr/bin/env node
import fs from 'node:fs';

const [handoffFile, implementationResultFile, qaResultFile] = process.argv.slice(2);
if (!handoffFile || !implementationResultFile) {
  console.error('usage: validate-completion-readiness.mjs <handoff.json> <implementer-or-external-result.json> [qa-result.json]');
  process.exit(2);
}
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', file, error: error.message }, null, 2));
    process.exit(2);
  }
};
const handoff = readJson(handoffFile);
const impl = readJson(implementationResultFile);
const qa = qaResultFile ? readJson(qaResultFile) : null;
const errors = [];
const need = (condition, message) => { if (!condition) errors.push(message); };

need(impl.status === 'completed', `implementation result must be completed before Completion Gate, got ${impl.status}`);
if (handoff?.task?.qa_required === true) {
  need(qa !== null, 'qa_required=true requires qa-result.json');
  if (qa) need(qa.status === 'passed', `QA must be passed before Completion Gate, got ${qa.status}`);
}
const blockers = impl.deviations_or_blockers ?? impl.blockers ?? [];
need(Array.isArray(blockers), 'implementation blockers/deviations must be an array');
need(blockers.length === 0, 'Completion Gate cannot pass with deviations_or_blockers/blockers');
if (qa) {
  need(Array.isArray(qa.failures), 'qa.failures must be an array');
  need(Array.isArray(qa.not_verified), 'qa.not_verified must be an array');
  need((qa.failures ?? []).length === 0, 'Completion Gate cannot pass with QA failures');
  need((qa.not_verified ?? []).length === 0, 'Completion Gate cannot pass with QA not_verified items');
}
if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'completion_readiness', errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'passed', gate: 'completion_readiness', dispatch_run_id: handoff.dispatch_run_id }, null, 2));
