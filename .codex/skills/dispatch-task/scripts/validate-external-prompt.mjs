#!/usr/bin/env node
import fs from 'node:fs'

const [handoffFile, promptFile] = process.argv.slice(2)
if (!handoffFile || !promptFile) {
  console.error('usage: validate-external-prompt.mjs <handoff.json> <external-prompt.md>')
  process.exit(2)
}

const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', file, error: error.message }, null, 2))
    process.exit(2)
  }
}

const handoff = readJson(handoffFile)
let prompt
try {
  prompt = fs.readFileSync(promptFile, 'utf8')
} catch (error) {
  console.error(JSON.stringify({ status: 'missing_prompt', file: promptFile, error: error.message }, null, 2))
  process.exit(2)
}

const errors = []
const need = (condition, message) => {
  if (!condition) {
    errors.push(message)
  }
}
const lower = value =>
  String(value ?? '')
    .trim()
    .toLowerCase()
const usesUniUi = value => /uni[-_ ]?ui|uniui/.test(lower(value))

const mode = handoff.implementation_mode ?? 'codex_subagent'
const id = handoff.dispatch_run_id
const external = handoff.external_contract ?? handoff.zcode_contract ?? {}
const provider = external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '')
const maxChars = Number.isFinite(external.prompt_max_chars) ? external.prompt_max_chars : 30000

need(
  ['external_implementer', 'zcode_external'].includes(mode),
  'validate-external-prompt requires implementation_mode=external_implementer|zcode_external'
)
need(['zcode', 'trae', 'chrome_cloud_agent', 'other'].includes(provider), 'external prompt requires a known provider')
need(typeof id === 'string' && id.length > 0, 'dispatch_run_id is required')
need(prompt.length <= maxChars, `prompt exceeds prompt_max_chars: ${prompt.length}/${maxChars}`)

const start = `<<<EXTERNAL_IMPLEMENTER_HANDOFF:${id}:START>>>`
const end = `<<<EXTERNAL_IMPLEMENTER_HANDOFF:${id}:END>>>`
const resultStart = `<<<EXTERNAL_IMPLEMENTER_RESULT:${id}:START>>>`
const resultEnd = `<<<EXTERNAL_IMPLEMENTER_RESULT:${id}:END>>>`
need(prompt.includes(start), `prompt missing sentinel start: ${start}`)
need(prompt.includes(end), `prompt missing sentinel end: ${end}`)
need(prompt.indexOf(start) < prompt.indexOf(end), 'sentinel start must appear before sentinel end')
need(prompt.includes(resultStart), `prompt missing result sentinel start: ${resultStart}`)
need(prompt.includes(resultEnd), `prompt missing result sentinel end: ${resultEnd}`)
need(prompt.indexOf(resultStart) < prompt.indexOf(resultEnd), 'result sentinel start must appear before result sentinel end')

for (const marker of [
  '## Architecture Direction',
  '## Implementation Contract',
  '## Allowed / Forbidden Paths',
  '## Project Constraints',
  '## Handoff Manual Contract',
  '## Validation Commands',
  '## UI Scope Contract',
  '## Style Stack Contract',
  '## Figma Direct Fetch',
  '## Figma Blocker Policy',
  '## uni-ui Mapping Contract',
  '## Result JSON Contract'
]) {
  need(prompt.includes(marker), `prompt missing required section marker: ${marker}`)
}

need(
  !prompt.includes('# Dispatch Task\n\n## 1. 角色所有权'),
  'prompt appears to include the full dispatch skill; keep external prompt minimal'
)

if (handoff?.figma?.link) {
  need(prompt.includes(handoff.figma.link), 'Figma prompt must include original figma.link')
  need(prompt.includes(handoff.figma.node_id), 'Figma prompt must include figma.node_id')
  need(
    /design context|get_design_context|Figma context|设计上下文/i.test(prompt),
    'Figma prompt must require direct design context acquisition'
  )
  need(
    /screenshot|get_screenshot|截图|screenshot_policy_skip|GLM.*截图|AGENTS/i.test(prompt),
    'Figma prompt must define direct screenshot acquisition or explicit AGENTS/GLM screenshot skip evidence'
  )
  need(
    /BLOCKED_(?:EXTERNAL|ZCODE)_FIGMA_UNAVAILABLE/.test(prompt),
    'Figma prompt must define a figma unavailable blocker token'
  )
}

if (usesUniUi(String(handoff?.project_constraints?.component_library ?? '')) && handoff?.figma?.link) {
  need(prompt.includes('uni_ui_mapping_evidence'), 'Figma + uni-ui prompt must require uni_ui_mapping_evidence')
}

if (/tailwind/i.test(String(handoff?.project_constraints?.styling_system ?? ''))) {
  need(/Tailwind/i.test(prompt), 'Tailwind project prompt must mention Tailwind')
  need(/SCSS|scss/.test(prompt), 'Tailwind project prompt must state SCSS policy')
}

if (handoff?.handoff_manual?.required === true || external.handoff_manual_required === true) {
  need(prompt.includes('## Handoff Manual Contract'), 'external prompt must include Handoff Manual Contract')
  need(
    typeof handoff?.handoff_manual?.path === 'string' && handoff.handoff_manual.path.length > 0,
    'handoff.handoff_manual.path is required when handoff manual is enabled'
  )
  if (typeof handoff?.handoff_manual?.path === 'string') {
    need(prompt.includes(handoff.handoff_manual.path), 'external prompt must include handoff_manual.path')
  }
  need(/status=working|status.*working/i.test(prompt), 'Handoff Manual Contract must instruct status=working on start')
  need(/status=completed|status.*completed/i.test(prompt), 'Handoff Manual Contract must instruct status=completed on completion')
  need(/status=blocked|status.*blocked/i.test(prompt), 'Handoff Manual Contract must instruct status=blocked when blocked')
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'external_prompt', provider, errors }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ status: 'passed', gate: 'external_prompt', provider, chars: prompt.length }, null, 2))
