#!/usr/bin/env node
import fs from 'node:fs'
import { validateImplementationOwnerHandoff } from './validate-handoff-owner.mjs'

const file = process.argv[2]
if (!file) {
  console.error('usage: validate-handoff.mjs <handoff.json>')
  process.exit(2)
}

let raw
let data
try {
  raw = fs.readFileSync(file, 'utf8')
  data = JSON.parse(raw)
} catch (error) {
  console.error(JSON.stringify({ status: 'invalid_json', error: error.message }, null, 2))
  process.exit(2)
}

const errors = []
const need = (condition, message) => {
  if (!condition) {
    errors.push(message)
  }
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0
const stringArray = (value, { min = 0, max = Infinity } = {}) =>
  Array.isArray(value) && value.length >= min && value.length <= max && value.every(nonEmptyString)
const lower = value =>
  String(value ?? '')
    .trim()
    .toLowerCase()
const usesUniUi = value => /uni[-_ ]?ui|uniui/.test(lower(value))
const includesAll = (array, items) => items.every(item => array?.includes(item))
const unknownKeys = (object, allowed) =>
  isObject(object) ? Object.keys(object).filter(key => !allowed.includes(key)) : []
const acceptanceMentionsMiniProgramRuntime = (data.acceptance ?? []).some(item => {
  const raw = String(item ?? '')
  const text = raw.toLowerCase()
  return (
    text.includes('miniprogram-automator') ||
    text.includes('miniprogram automator') ||
    text.includes('9420') ||
    text.includes('wx.request') ||
    raw.includes('小程序') ||
    raw.includes('端上') ||
    raw.includes('微信开发者工具')
  )
})

const mode = data.implementation_mode ?? 'codex_subagent'
const tier = data.dispatch_tier
const externalMode = ['external_implementer', 'zcode_external'].includes(mode)
const externalTier = ['external_implementer', 'zcode_external'].includes(tier)
const task = data.task ?? {}
const codeChanges = task.code_changes_required === true
const ui = task.ui_task === true
const qaRequired = task.qa_required === true
const risk = task.risk
const maxContractChars = risk === 'high' ? 24000 : 14000
const runtimeAcceptanceMode =
  data?.validation?.runtime_acceptance_mode ??
  (data?.validation?.miniprogram_automator_required === true ? 'automator_required' : null)
need(
  raw.length <= maxContractChars,
  `handoff exceeds character budget: ${raw.length}/${maxContractChars}`
)

need(nonEmptyString(data.dispatch_run_id), 'dispatch_run_id is required')
need(
  ['codex_subagent', 'external_implementer', 'zcode_external'].includes(mode),
  'implementation_mode must be codex_subagent|external_implementer|zcode_external'
)
need(
  [
    'simple_patch',
    'standard_task',
    'deep_contract',
    'external_implementer',
    'zcode_external'
  ].includes(tier),
  'dispatch_tier must be simple_patch|standard_task|deep_contract|external_implementer|zcode_external'
)
need(isObject(task), 'task object is required')
need(nonEmptyString(task.objective), 'task.objective is required')
need(typeof task.code_changes_required === 'boolean', 'task.code_changes_required must be boolean')
need(typeof task.ui_task === 'boolean', 'task.ui_task must be boolean')
need(typeof task.qa_required === 'boolean', 'task.qa_required must be boolean')
need(['local', 'standard', 'high'].includes(risk), 'task.risk must be local|standard|high')
need(
  stringArray(data.acceptance, { min: 1, max: 12 }),
  'acceptance must contain 1-12 non-empty strings'
)
need(
  stringArray(data.allowed_paths, { min: 1, max: 30 }),
  'allowed_paths must contain 1-30 non-empty strings'
)
need(
  stringArray(data.forbidden_paths, { min: 0, max: 50 }),
  'forbidden_paths must be an array of non-empty strings'
)
need(isObject(data.decision_lock), 'decision_lock is required')
need(
  ['standard', 'strict'].includes(data?.decision_lock?.level),
  'decision_lock.level must be standard|strict'
)

if (codeChanges) {
  need(
    nonEmptyString(data?.validation?.worktree_baseline_path),
    'code changes require validation.worktree_baseline_path'
  )
}
need(isObject(data.validation), 'validation is required')
need(
  typeof data?.validation?.miniprogram_automator_required === 'boolean',
  'validation.miniprogram_automator_required must be boolean'
)
need(
  runtimeAcceptanceMode === null ||
    ['automator_required', 'batch_substitute_allowed', 'batch_only'].includes(
      runtimeAcceptanceMode
    ),
  'validation.runtime_acceptance_mode must be automator_required|batch_substitute_allowed|batch_only'
)
if (acceptanceMentionsMiniProgramRuntime) {
  need(
    runtimeAcceptanceMode !== null && runtimeAcceptanceMode !== 'batch_only',
    'mini-program runtime acceptance requires validation.runtime_acceptance_mode=automator_required|batch_substitute_allowed'
  )
}
if (runtimeAcceptanceMode === 'automator_required') {
  need(
    data?.validation?.miniprogram_automator_required === true,
    'automator_required requires validation.miniprogram_automator_required=true'
  )
}
if (runtimeAcceptanceMode === 'batch_substitute_allowed') {
  need(
    nonEmptyString(data?.validation?.batch_substitute_user_approval_ref),
    'batch_substitute_allowed requires validation.batch_substitute_user_approval_ref'
  )
}
if (runtimeAcceptanceMode === 'batch_only') {
  need(
    data?.validation?.miniprogram_automator_required === false,
    'batch_only requires validation.miniprogram_automator_required=false'
  )
}

const pc = data.project_constraints ?? {}
const external = data.external_contract ?? data.zcode_contract ?? {}
const zcode = data.zcode_contract ?? (external.provider === 'zcode' ? external : {})
need(isObject(pc), 'project_constraints is required')
need(
  stringArray(pc.rule_refs, { min: 1, max: 12 }),
  'project_constraints.rule_refs must contain 1-12 refs'
)
need(nonEmptyString(pc.dependency_policy), 'project_constraints.dependency_policy is required')
need(Array.isArray(pc.test_commands), 'project_constraints.test_commands must be an array')

if (ui) {
  need(tier !== 'simple_patch', 'UI/Figma tasks must not use simple_patch')
  need(nonEmptyString(pc.framework), 'UI task requires project_constraints.framework')
  need(nonEmptyString(pc.styling_system), 'UI task requires project_constraints.styling_system')
  need(nonEmptyString(pc.new_scss_policy), 'UI task requires project_constraints.new_scss_policy')
  need(
    Array.isArray(pc.scss_exceptions),
    'UI task requires project_constraints.scss_exceptions array'
  )
  need(
    nonEmptyString(pc.component_library),
    'UI task requires project_constraints.component_library'
  )
  if (lower(pc.styling_system).includes('tailwind')) {
    need(
      ['forbidden', 'explicit_exception_only'].includes(lower(pc.new_scss_policy)),
      'Tailwind UI task requires new_scss_policy=forbidden|explicit_exception_only'
    )
  }
  need(qaRequired === true, 'UI tasks require task.qa_required=true')
}
if (risk === 'high') {
  need(qaRequired === true, 'high-risk tasks require task.qa_required=true')
}

if (tier === 'simple_patch') {
  need(mode === 'codex_subagent', 'simple_patch must use codex_subagent')
  need(!ui, 'simple_patch cannot be a UI task')
  need(risk === 'local', 'simple_patch requires task.risk=local')
}
if (tier === 'deep_contract') {
  need(data?.decision_lock?.level === 'strict', 'deep_contract requires decision_lock.level=strict')
}
if (externalTier) {
  need(externalMode, 'external dispatch_tier requires implementation_mode=external_implementer')
}
validateImplementationOwnerHandoff({
  data,
  tier,
  externalMode,
  externalTier,
  codeChanges,
  external,
  zcode,
  need,
  isObject,
  nonEmptyString,
  includesAll,
  unknownKeys
})

if (qaRequired) {
  need(
    data?.spawn_contract?.qa_agent_type === null,
    'qa_required=true is main-owned; spawn_contract.qa_agent_type must be omitted or null'
  )
}

const figma = data.figma ?? {}
if (nonEmptyString(figma.link)) {
  need(qaRequired === true, 'Figma tasks require task.qa_required=true')
  need(nonEmptyString(figma.node_id), 'figma.node_id is required when figma.link exists')
  need(figma.main_access === 'lite_only', 'figma.main_access must be lite_only')
  need(figma.implementer_fetch_required === true, 'figma.implementer_fetch_required must be true')
  need(figma.qa_baseline_fetch_required === true, 'figma.qa_baseline_fetch_required must be true')
  need(Array.isArray(figma.main_tools_used), 'figma.main_tools_used must be an array')
  const forbiddenMainTools = [
    'get_design_context',
    'get_screenshot',
    'get_variable_defs',
    'get_code',
    'get_assets'
  ]
  const usedForbidden = figma.main_tools_used.filter(tool => forbiddenMainTools.includes(tool))
  need(usedForbidden.length === 0, `main used forbidden Figma tools: ${usedForbidden.join(', ')}`)

  if (mode === 'codex_subagent') {
    need(
      data?.required_skills?.implementer?.includes('$implementer-ui-execution-policy'),
      'Figma codex_subagent requires $implementer-ui-execution-policy'
    )
  }
  need(
    data?.required_skills?.main?.includes('$qa-ui-visual-baseline-policy'),
    'Figma task requires required_skills.main to include $qa-ui-visual-baseline-policy'
  )
  if (usesUniUi(pc.component_library)) {
    if (mode === 'codex_subagent') {
      need(
        data?.required_skills?.implementer?.includes('$uni-ui-figma-component-mapper'),
        'Figma + uni-ui codex_subagent requires $uni-ui-figma-component-mapper'
      )
    } else {
      need(
        external?.required_prompt_sections?.includes('uni_ui_mapping_contract'),
        'Figma + uni-ui external_implementer requires uni_ui_mapping_contract prompt section'
      )
    }
  }
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'handoff_contract', errors }, null, 2))
  process.exit(1)
}
console.log(
  JSON.stringify(
    { status: 'passed', gate: 'handoff_contract', dispatch_run_id: data.dispatch_run_id },
    null,
    2
  )
)
