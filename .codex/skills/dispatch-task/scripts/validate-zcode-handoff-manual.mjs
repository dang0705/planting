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
// Future provider contracts use provider_status to separate provider delivery from
// dispatch completion. provider_delivered only records delivery + recovery_required;
// it never finishes the episode. The dispatch completion state is the episode
// lifecycleStage=completion_ready, governed by validate-completion-readiness.
const allowedProviderStatuses = ['running', 'delivered', 'blocked'];

const externalContract = handoff.external_contract ?? handoff.zcode_contract ?? {};
const zcodeProvider =
  externalContract.provider === 'zcode' ||
  externalContract.external_implementer === 'zcode_glm';
need(
  handoff.implementation_mode === 'zcode_external' ||
    (handoff.implementation_mode === 'external_implementer' && zcodeProvider),
  'handoff manual is only valid for a ZCode external implementation contract'
);
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
// dispatch_run_id is the only accepted unique identifier; no dispatch_id alias.
need(
  manual.dispatch_id === undefined && manual.dispatchId === undefined,
  'manual must use dispatch_run_id as the only identifier; dispatch_id alias is forbidden'
);
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

// A manual must declare exactly one of the legacy in-flight status or the future
// provider_status. Mixing delivered/completed semantics is forbidden: a future
// provider_status=delivered never means the dispatch is complete.
const hasLegacyStatus = typeof manual.status === 'string' && manual.status.length > 0;
const hasProviderStatus = typeof manual.provider_status === 'string' && manual.provider_status.length > 0;
need(
  hasLegacyStatus !== hasProviderStatus,
  'manual must declare exactly one of status (legacy in-flight) or provider_status (future contract)'
);
if (hasLegacyStatus) {
  need(allowedStatuses.includes(manual.status),
    'manual.status must be working|completed|blocked');
}
if (hasProviderStatus) {
  need(allowedProviderStatuses.includes(manual.provider_status),
    'manual.provider_status must be running|delivered|blocked');
}

if (hasLegacyStatus && manual.status === 'completed') {
  need(['validation', 'final'].includes(manual.phase),
    'completed manual.phase must be validation or final');
  need(blockers.length === 0, 'completed handoff manual cannot contain blockers');
  if (handoff?.task?.code_changes_required === true) {
    need(changedFilesClaimed.length > 0,
      'completed code task requires changed_files_claimed');
  }
}

if (hasLegacyStatus && manual.status === 'blocked') {
  need(manual.phase === 'blocked', 'blocked manual.phase must be blocked');
  need(blockers.length > 0, 'blocked handoff manual requires blockers');
}

if (hasLegacyStatus && manual.status === 'working') {
  need(manual.phase !== 'final' && manual.phase !== 'blocked',
    'working manual.phase cannot be final or blocked');
}

if (hasProviderStatus && manual.provider_status === 'delivered') {
  // provider_delivered only records provider delivery + recovery_required.
  // It must NOT be treated as dispatch completion. The episode must transition
  // to recovery_in_progress and proceed through review/QA/completion_ready before
  // finishEpisode(completed) is legal.
  need(blockers.length === 0, 'delivered provider manual cannot contain blockers');
}
if (hasProviderStatus && manual.provider_status === 'blocked') {
  need(blockers.length > 0, 'blocked provider manual requires blockers');
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'zcode_handoff_manual', errors }, null, 2));
  process.exit(1);
}

const terminalLegacy = hasLegacyStatus && ['completed', 'blocked'].includes(manual.status);
const terminalProvider = hasProviderStatus && ['delivered', 'blocked'].includes(manual.provider_status);
console.log(JSON.stringify({
  status: hasLegacyStatus ? manual.status : manual.provider_status,
  status_kind: hasLegacyStatus ? 'legacy_in_flight' : 'provider_delivery',
  gate: 'zcode_handoff_manual',
  terminal: terminalLegacy || terminalProvider,
  provider_delivery_not_dispatch_completion: hasProviderStatus,
  path: handoff.handoff_manual.path,
  updated_at: manual.updated_at
}, null, 2));
