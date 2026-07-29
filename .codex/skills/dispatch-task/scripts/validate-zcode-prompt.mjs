#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const [handoffFile, promptFile] = process.argv.slice(2);
if (!handoffFile || !promptFile) {
  console.error('usage: validate-zcode-prompt.mjs <handoff.json> <zcode-prompt.md>');
  process.exit(2);
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', file, error: error.message }, null, 2));
    process.exit(2);
  }
};

const handoff = readJson(handoffFile);
let prompt;
try {
  prompt = fs.readFileSync(promptFile, 'utf8');
}
catch (error) {
  console.error(JSON.stringify({ status: 'missing_prompt', file: promptFile, error: error.message }, null, 2));
  process.exit(2);
}

const errors = [];
const need = (condition, message) => {
  if (!condition) {
    errors.push(message);
  }
};
const mode = handoff.implementation_mode ?? 'codex_subagent';
const id = handoff.dispatch_run_id;
const external = handoff.external_contract ?? handoff.zcode_contract ?? {};
const provider = external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '');
const zcode = handoff.zcode_contract ?? external;
const sha256 = crypto.createHash('sha256').update(prompt).digest('hex');
const maxChars = Number.isFinite(zcode.prompt_max_chars) ? zcode.prompt_max_chars : 30000;

need(['external_implementer', 'zcode_external'].includes(mode),
  'validate-zcode-prompt requires implementation_mode=external_implementer|zcode_external');
need(provider === 'zcode', 'validate-zcode-prompt requires external_contract.provider=zcode');
need(typeof id === 'string' && id.length > 0, 'dispatch_run_id is required');
need(prompt.length <= maxChars, `prompt exceeds zcode_contract.prompt_max_chars: ${prompt.length}/${maxChars}`);

const start = `<<<EXTERNAL_IMPLEMENTER_HANDOFF:${id}:START>>>`;
const end = `<<<EXTERNAL_IMPLEMENTER_HANDOFF:${id}:END>>>`;
const resultStart = `<<<EXTERNAL_IMPLEMENTER_RESULT:${id}:START>>>`;
const resultEnd = `<<<EXTERNAL_IMPLEMENTER_RESULT:${id}:END>>>`;
need(prompt.includes(start), `prompt missing sentinel start: ${start}`);
need(prompt.includes(end), `prompt missing sentinel end: ${end}`);
need(prompt.indexOf(start) < prompt.indexOf(end), 'sentinel start must appear before sentinel end');
need(prompt.includes(resultStart), `prompt missing result sentinel start: ${resultStart}`);
need(prompt.includes(resultEnd), `prompt missing result sentinel end: ${resultEnd}`);
need(prompt.indexOf(resultStart) < prompt.indexOf(resultEnd), 'result sentinel start must appear before result sentinel end');

if (typeof zcode.prompt_sha256 === 'string' && zcode.prompt_sha256.length > 0) {
  need(zcode.prompt_sha256 === sha256, `prompt_sha256 mismatch: expected ${zcode.prompt_sha256}, got ${sha256}`);
}

const requiredSectionMarkers = {
  implementation_contract: '## Implementation Contract',
  allowed_forbidden_paths: '## Allowed / Forbidden Paths',
  project_constraints: '## Project Constraints',
  handoff_manual_contract: '## Handoff Manual Contract',
  validation_commands: '## Validation Commands',
  result_json_contract: '## Result JSON Contract',
  ui_scope_contract: '## UI Scope Contract',
  style_stack_contract: '## Style Stack Contract',
  figma_direct_fetch: '## Figma Direct Fetch',
  figma_blocker_policy: '## Figma Blocker Policy',
  uni_ui_mapping_contract: '## uni-ui Mapping Contract',
  selection_to_consumer_contract: '## Selection to Consumer Contract'
};

for (const section of zcode.required_prompt_sections ?? external.required_prompt_sections ?? []) {
  const marker = requiredSectionMarkers[section];
    if (marker) {
      need(prompt.includes(marker), `prompt missing section marker for ${section}: ${marker}`);
    }
}

need(!prompt.includes('# Dispatch Task\n\n## 1. 角色所有权'),
  'prompt appears to include the full dispatch skill; keep ZCode prompt minimal');

need(prompt.includes('selection_to_consumer'),
  'ZCode prompt must require selection_to_consumer evidence');
need(
  /provider_status|provider 交付与 dispatch 完成状态分离|delivered.*不表示.*完成/i.test(prompt),
  'ZCode prompt must separate provider delivery status from dispatch completion (provider_status=running|delivered|blocked; delivered is not completion)'
);

if (handoff?.figma?.link) {
  need(prompt.includes(handoff.figma.link), 'Figma prompt must include original figma.link');
  need(prompt.includes(handoff.figma.node_id), 'Figma prompt must include figma.node_id');
  need(/design context|get_design_context|Figma context|设计上下文/i.test(prompt),
    'Figma prompt must require direct design context acquisition');
  need(/screenshot|get_screenshot|截图|screenshot_policy_skip|GLM.*截图|AGENTS/i.test(prompt),
    'Figma prompt must define direct screenshot acquisition or explicit AGENTS/GLM screenshot skip evidence');
  need(/BLOCKED_(?:EXTERNAL|ZCODE)_FIGMA_UNAVAILABLE/.test(prompt),
    'Figma prompt must define a figma unavailable blocker token');
}

if (/uni[-_ ]?ui|uniui/i.test(String(handoff?.project_constraints?.component_library ?? ''))) {
  if (handoff?.figma?.link) {
    need(prompt.includes('uni_ui_mapping_evidence'),
      'Figma + uni-ui prompt must require uni_ui_mapping_evidence');
  }
}

if (/tailwind/i.test(String(handoff?.project_constraints?.styling_system ?? ''))) {
  need(/Tailwind/i.test(prompt), 'Tailwind project prompt must mention Tailwind');
  need(/SCSS|scss/.test(prompt), 'Tailwind project prompt must state SCSS policy');
}

if (handoff?.handoff_manual?.required === true || zcode.handoff_manual_required === true) {
  need(prompt.includes('## Handoff Manual Contract'),
    'ZCode prompt must include Handoff Manual Contract');
  need(typeof handoff?.handoff_manual?.path === 'string' && handoff.handoff_manual.path.length > 0,
    'handoff.handoff_manual.path is required when handoff manual is enabled');
  if (typeof handoff?.handoff_manual?.path === 'string') {
    need(prompt.includes(handoff.handoff_manual.path),
      'ZCode prompt must include handoff_manual.path');
  }
  need(/status=working|status.*working/i.test(prompt),
    'Handoff Manual Contract must instruct ZCode to write status=working when starting');
  need(/status=completed|status.*completed/i.test(prompt),
    'Handoff Manual Contract must instruct ZCode to write status=completed when done');
  need(/status=blocked|status.*blocked/i.test(prompt),
    'Handoff Manual Contract must instruct ZCode to write status=blocked when blocked');
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'zcode_prompt', sha256, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', gate: 'zcode_prompt', chars: prompt.length, sha256 }, null, 2));
