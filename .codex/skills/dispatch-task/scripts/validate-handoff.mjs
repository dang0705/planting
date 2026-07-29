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
const acceptanceMentionsDispatchHookGate = (data.acceptance ?? []).some(item => {
  const raw = String(item ?? '')
  const text = raw.toLowerCase()
  return (
    text.includes('hook') ||
    text.includes('catalog') ||
    raw.includes('钩子') ||
    raw.includes('目录治理')
  )
})

const tier = data.dispatch_tier
const mode =
  data.implementation_mode ?? (tier === 'simple_patch' ? 'main_direct' : 'codex_subagent')
const externalMode = ['external_implementer', 'zcode_external'].includes(mode)
const externalTier = ['external_implementer', 'zcode_external'].includes(tier)
const mainTakeoverMode = mode === 'main_takeover'
const task = data.task ?? {}
const codeChanges = task.code_changes_required === true
const ui = task.ui_task === true
const qaRequired = task.qa_required === true
const risk = task.risk
const maxContractChars = risk === 'high' ? 24000 : 14000
const runtimeAcceptanceMode =
  data?.validation?.runtime_acceptance_mode ??
  (data?.validation?.miniprogram_automator_required === true ? 'automator_required' : null)
const brvRelevance = data.brv_relevance
const figmaPlan = data.figma
const featureTestPlan = data.feature_test_plan
const e2ePlan = data.e2e_plan
need(
  raw.length <= maxContractChars,
  `handoff exceeds character budget: ${raw.length}/${maxContractChars}`
)

need(nonEmptyString(data.dispatch_run_id), 'dispatch_run_id is required')
need(
  ['main_direct', 'codex_subagent', 'main_takeover', 'external_implementer', 'zcode_external'].includes(mode),
  'implementation_mode must be main_direct|codex_subagent|main_takeover|external_implementer|zcode_external'
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
// Glob intersection check: a handoff must not simultaneously allow and forbid
// the same file. If any allowed_path glob can match a file that any forbidden_path
// glob also matches, the contract is self-contradictory and the implementer cannot
// produce a legal changed_files list. This must be rejected before dispatch so the
// recovery result is never trapped between an impossible allow/forbid pair.
//
// This is an exact intersection check for the supported glob language. Each glob
// is treated as an epsilon-NFA: '*' consumes zero or more non-slash characters and
// '**' consumes zero or more characters including slash. The product automaton of
// the two NFAs is finite; searching it with one representative for each literal
// character, slash, and an otherwise-unseen non-slash character cannot miss an
// intersection. No bounded sample expansion is used.
const handoffNormalizePath = value =>
  String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
const handoffEpsilonClosure = (pattern, states) => {
  const closure = new Set(states)
  const pending = [...closure]
  while (pending.length) {
    const index = pending.pop()
    if (pattern.startsWith('**', index) && !closure.has(index + 2)) {
      closure.add(index + 2)
      pending.push(index + 2)
    } else if (pattern[index] === '*' && pattern[index + 1] !== '*' && !closure.has(index + 1)) {
      closure.add(index + 1)
      pending.push(index + 1)
    }
  }
  return closure
}
const handoffConsume = (pattern, states, character) => {
  const next = new Set()
  for (const index of states) {
    if (index >= pattern.length) continue
    if (pattern.startsWith('**', index)) {
      next.add(index)
    } else if (pattern[index] === '*' && pattern[index + 1] !== '*') {
      if (character !== '/') next.add(index)
    } else if (pattern[index] === character) {
      next.add(index + 1)
    }
  }
  return handoffEpsilonClosure(pattern, next)
}
const handoffStateKey = (left, right) =>
  `${[...left].sort((a, b) => a - b).join(',')}|${[...right].sort((a, b) => a - b).join(',')}`
const handoffGlobsIntersect = (leftGlob, rightGlob) => {
  const left = handoffNormalizePath(leftGlob)
  const right = handoffNormalizePath(rightGlob)
  const alphabet = new Set(['/', '\u0000'])
  for (const character of `${left}${right}`) {
    if (character !== '*') alphabet.add(character)
  }
  const initialLeft = handoffEpsilonClosure(left, new Set([0]))
  const initialRight = handoffEpsilonClosure(right, new Set([0]))
  const queue = [[initialLeft, initialRight]]
  const visited = new Set([handoffStateKey(initialLeft, initialRight)])
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [leftStates, rightStates] = queue[cursor]
    if (leftStates.has(left.length) && rightStates.has(right.length)) return true
    for (const character of alphabet) {
      const nextLeft = handoffConsume(left, leftStates, character)
      const nextRight = handoffConsume(right, rightStates, character)
      if (!nextLeft.size || !nextRight.size) continue
      const key = handoffStateKey(nextLeft, nextRight)
      if (visited.has(key)) continue
      visited.add(key)
      queue.push([nextLeft, nextRight])
    }
  }
  return false
}
if (Array.isArray(data.allowed_paths) && Array.isArray(data.forbidden_paths)) {
  for (const allowed of data.allowed_paths) {
    for (const forbidden of data.forbidden_paths) {
      if (handoffGlobsIntersect(allowed, forbidden)) {
        need(
          false,
          `allowed_paths and forbidden_paths conflict: allowed "${allowed}" and forbidden "${forbidden}" can match the same file`
        )
      }
    }
  }
}
need(isObject(data.decision_lock), 'decision_lock is required')
need(
  ['standard', 'strict'].includes(data?.decision_lock?.level),
  'decision_lock.level must be standard|strict'
)

if (codeChanges && mode !== 'main_direct') {
  need(
    nonEmptyString(data?.validation?.worktree_baseline_path),
    'code changes require validation.worktree_baseline_path'
  )
  need(isObject(brvRelevance), 'code changes require structured brv_relevance')
  need(isObject(figmaPlan), 'code changes require structured figma')
  need(isObject(featureTestPlan), 'code changes require structured feature_test_plan')
  need(isObject(e2ePlan), 'code changes require structured e2e_plan')
}
need(isObject(data.validation), 'validation is required')
if (brvRelevance !== undefined) {
  need(isObject(brvRelevance), 'brv_relevance must be an object')
  need(typeof brvRelevance?.required === 'boolean', 'brv_relevance.required must be boolean')
  if (brvRelevance?.required === true) {
    need(
      nonEmptyString(brvRelevance?.official_query_command),
      'brv_relevance.required=true requires official_query_command'
    )
    need(
      !/workflow|dispatch|hook|validator|test directory/i.test(brvRelevance?.topic_hint ?? ''),
      'brv_relevance.topic_hint must not target workflow/test governance facts'
    )
  }
}
if (figmaPlan !== undefined) {
  need(isObject(figmaPlan), 'figma must be an object')
  need(typeof figmaPlan?.required === 'boolean', 'figma.required must be boolean')
  need(
    ['internal_mcp', 'external_prompt_recovery'].includes(figmaPlan?.mode),
    'figma.mode must be internal_mcp|external_prompt_recovery'
  )
  if (figmaPlan?.required === true) {
    need(nonEmptyString(figmaPlan?.link), 'figma.required=true requires figma.link')
  }
}
if (featureTestPlan !== undefined) {
  need(isObject(featureTestPlan), 'feature_test_plan must be an object')
  need(typeof featureTestPlan?.required === 'boolean', 'feature_test_plan.required must be boolean')
  if (featureTestPlan?.required === true) {
    need(
      stringArray(featureTestPlan?.targets, { min: 1, max: 20 }),
      'feature_test_plan.required=true requires targets/source scopes'
    )
    need(
      stringArray(featureTestPlan?.commands, { min: 1, max: 20 }),
      'feature_test_plan.required=true requires commands'
    )
    need(
      !(featureTestPlan.commands ?? []).every(command => /test\/unit\/run-all\.mjs$/.test(command)),
      'feature_test_plan.commands must include at least one feature-specific command, not generic unit run-all alone'
    )
  }
}
if (e2ePlan !== undefined) {
  need(isObject(e2ePlan), 'e2e_plan must be an object')
  need(typeof e2ePlan?.required === 'boolean', 'e2e_plan.required must be boolean')
  if (e2ePlan?.automator_required === true) {
    need(
      e2ePlan?.catalog_required === true,
      'e2e_plan.automator_required=true requires catalog_required=true'
    )
  }
}
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

if (acceptanceMentionsDispatchHookGate) {
  need(
    includesAll(data.allowed_paths, ['.codex/hooks.json', '.codex/hooks/**']),
    'dispatch hook gate handoff must allow .codex/hooks.json and .codex/hooks/**'
  )
  need(
    (data.allowed_paths ?? []).includes('.codex/skills/dispatch-task/**'),
    'dispatch hook gate handoff must allow dispatch-task skill updates'
  )
  const testCommands = (pc.test_commands ?? []).join('\n')
  need(
    /dispatch-gate\/cli\.mjs validate-e2e-catalog/.test(testCommands),
    'dispatch hook gate handoff must require validate-e2e-catalog'
  )
  need(
    /dispatch-gate\/cli\.mjs hook-self-test/.test(testCommands),
    'dispatch hook gate handoff must require hook-self-test'
  )
  need(
    data?.brv_relevance?.child_brv_allowed === false,
    'dispatch hook gate handoff must set brv_relevance.child_brv_allowed=false'
  )
  need(
    nonEmptyString(data?.brv_relevance?.recall_packet_path),
    'dispatch hook gate handoff must provide the main-owned brv_relevance.recall_packet_path'
  )
  need(
    Array.isArray(data.output_evidence_required) &&
      includesAll(data.output_evidence_required, [
        'episode_state_contract',
        'status_card_contract',
        'automator_preflight_contract',
        'known_limitations'
      ]),
    'dispatch hook gate handoff must require episode/status/preflight/limitations evidence'
  )
}

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
  need(mode === 'main_direct', 'simple_patch must use main_direct')
  need(!ui, 'simple_patch cannot be a UI task')
  need(risk === 'local', 'simple_patch requires task.risk=local')
}
if (mode === 'main_direct') {
  need(tier === 'simple_patch', 'main_direct is only valid for simple_patch')
  need(data.target_role === undefined, 'main_direct must not declare target_role')
  need(data.spawn_contract === undefined, 'main_direct must not declare spawn_contract')
}
if (mainTakeoverMode) {
  need(tier === 'deep_contract', 'main_takeover requires dispatch_tier=deep_contract')
  need(data.target_role === 'main_takeover', 'main_takeover requires target_role=main_takeover')
  need(data.main_takeover_authorization === true, 'main_takeover requires explicit main_takeover_authorization=true')
  need(nonEmptyString(data.main_takeover_reason), 'main_takeover_reason is required')
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
  mainTakeoverMode,
  codeChanges,
  external,
  mode,
  zcode,
  need,
  isObject,
  nonEmptyString,
  includesAll,
  unknownKeys
})

// Selection-to-consumer contract: every code task must explicitly declare
// selection_to_consumer.required=true (selection task) or false with a reason
// (non-selection task). Omitting the contract on a code task is rejected so the
// implementer always produces the corresponding evidence. Non-code tasks are
// exempted.
const selectionContract = data.selection_to_consumer
if (codeChanges) {
  need(isObject(selectionContract), 'code task requires selection_to_consumer contract (required=true|false)')
  need(typeof selectionContract?.required === 'boolean', 'selection_to_consumer.required must be boolean')
  if (selectionContract?.required === false) {
    need(
      nonEmptyString(selectionContract?.not_applicable_reason),
      'selection_to_consumer.required=false requires not_applicable_reason'
    )
  }
} else if (selectionContract !== undefined) {
  need(isObject(selectionContract), 'selection_to_consumer must be an object')
  need(typeof selectionContract?.required === 'boolean', 'selection_to_consumer.required must be boolean')
  if (selectionContract?.required === false) {
    need(
      nonEmptyString(selectionContract?.not_applicable_reason),
      'selection_to_consumer.required=false requires not_applicable_reason'
    )
  }
}

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
