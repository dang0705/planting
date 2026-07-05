#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [handoffFile, manualFile] = process.argv.slice(2);
if (!handoffFile || !manualFile) {
  console.error('usage: validate-zcode-handoff-manual.mjs <handoff.json> <handoff-manual.json>');
  process.exit(2);
}

const readJson = (file, label) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', label, file, error: error.message }, null, 2));
    process.exit(2);
  }
};

const handoff = readJson(handoffFile, 'handoff');
const manual = readJson(manualFile, 'handoff_manual');
const errors = [];
const need = (condition, message) => {
  if (!condition) {
    errors.push(message);
  }
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const allowedStatuses = ['working', 'completed', 'blocked'];
const allowedPhases = ['audit', 'editing', 'validation', 'final', 'blocked'];

need(handoff.implementation_mode === 'zcode_external',
  'handoff manual is only valid for implementation_mode=zcode_external');
need(nonEmptyString(handoff.dispatch_run_id), 'handoff.dispatch_run_id is required');
need(isObject(handoff.handoff_manual), 'handoff.handoff_manual is required');
need(handoff?.handoff_manual?.required === true, 'handoff.handoff_manual.required must be true');
need(nonEmptyString(handoff?.handoff_manual?.path), 'handoff.handoff_manual.path is required');

if (nonEmptyString(handoff?.handoff_manual?.path)) {
  const expected = path.resolve(handoff.handoff_manual.path);
  const actual = path.resolve(manualFile);
  need(actual === expected, `manual file path mismatch: expected ${handoff.handoff_manual.path}, got ${manualFile}`);
}

need(manual.dispatch_run_id === handoff.dispatch_run_id,
  'manual.dispatch_run_id must match handoff.dispatch_run_id');
need(allowedStatuses.includes(manual.status),
  'manual.status must be working|completed|blocked');
need(nonEmptyString(manual.updated_at), 'manual.updated_at is required');
if (nonEmptyString(manual.updated_at)) {
  need(!Number.isNaN(Date.parse(manual.updated_at)), 'manual.updated_at must be parseable as an ISO-8601 timestamp');
}
need(allowedPhases.includes(manual.phase),
  'manual.phase must be audit|editing|validation|final|blocked');
need(Array.isArray(manual.changed_files_claimed),
  'manual.changed_files_claimed must be an array');
need(isObject(manual.validation_claims),
  'manual.validation_claims must be an object');
need(Array.isArray(manual.blockers), 'manual.blockers must be an array');

const blockers = Array.isArray(manual.blockers) ? manual.blockers : [];
const changedFilesClaimed = Array.isArray(manual.changed_files_claimed) ? manual.changed_files_claimed : [];

if (manual.status === 'completed') {
  need(['validation', 'final'].includes(manual.phase),
    'completed manual.phase must be validation or final');
  need(blockers.length === 0, 'completed handoff manual cannot contain blockers');
  if (handoff?.task?.code_changes_required === true) {
    need(changedFilesClaimed.length > 0,
      'completed code task requires changed_files_claimed');
  }
}

if (manual.status === 'blocked') {
  need(manual.phase === 'blocked', 'blocked manual.phase must be blocked');
  need(blockers.length > 0, 'blocked handoff manual requires blockers');
}

if (manual.status === 'working') {
  need(manual.phase !== 'final' && manual.phase !== 'blocked',
    'working manual.phase cannot be final or blocked');
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'zcode_handoff_manual', errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: manual.status,
  gate: 'zcode_handoff_manual',
  terminal: ['completed', 'blocked'].includes(manual.status),
  path: handoff.handoff_manual.path,
  updated_at: manual.updated_at
}, null, 2));
