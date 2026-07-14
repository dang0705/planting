export function validateUiCompleted(resultObject, context) {
  const {
    handoff,
    figmaAcquiredBy,
    uniUiPolicyName,
    need,
    isObject,
    nonEmptyString,
    nonEmptyArray,
    lower,
    usesUniUi,
    callsOf
  } = context
  if (handoff?.task?.ui_task === true) {
    validateUiScope(resultObject, context)
  }
  if (
    nonEmptyString(handoff?.figma?.link) &&
    usesUniUi(handoff?.project_constraints?.component_library)
  ) {
    validateUniUiMapping(resultObject, { need, isObject, nonEmptyArray, uniUiPolicyName })
  }
  if (nonEmptyString(handoff?.figma?.link)) {
    validateFigmaFetch(resultObject, {
      handoff,
      figmaAcquiredBy,
      need,
      isObject,
      nonEmptyString,
      nonEmptyArray,
      callsOf
    })
  }
}

function validateUiScope(resultObject, context) {
  const { handoff, need, isObject, nonEmptyString, nonEmptyArray, lower } = context
  need(nonEmptyArray(resultObject.ui_scope_map), 'completed UI task requires non-empty ui_scope_map')
  need(isObject(resultObject.style_stack_compliance), 'completed UI task requires style_stack_compliance')
  need(isObject(resultObject.component_reuse_evidence), 'completed UI task requires component_reuse_evidence')
  need(
    nonEmptyArray(resultObject?.component_reuse_evidence?.searched),
    'component_reuse_evidence.searched is required'
  )
  need(
    Array.isArray(resultObject?.component_reuse_evidence?.newly_created),
    'component_reuse_evidence.newly_created must be an array'
  )
  if (nonEmptyArray(resultObject?.component_reuse_evidence?.newly_created)) {
    need(
      nonEmptyString(resultObject?.component_reuse_evidence?.reason),
      'new components require a non-reuse reason'
    )
  }
  const expectedStack = lower(handoff?.project_constraints?.styling_system)
  const actualStack = lower(resultObject?.style_stack_compliance?.styling_system)
  need(actualStack === expectedStack, `styling_system mismatch: expected ${expectedStack}, got ${actualStack}`)
  need(
    Array.isArray(resultObject?.style_stack_compliance?.new_dependencies),
    'style_stack_compliance.new_dependencies must be an array'
  )
  if (expectedStack.includes('tailwind')) {
    validateTailwindScope(resultObject, { handoff, need, nonEmptyString, lower })
  }
  if (lower(handoff?.project_constraints?.dependency_policy) === 'no_new_dependencies') {
    need(
      (resultObject?.style_stack_compliance?.new_dependencies ?? []).length === 0,
      'dependency_policy=no_new_dependencies but result reports new dependencies'
    )
  }
}

function validateTailwindScope(resultObject, { handoff, need, nonEmptyString, lower }) {
  need(
    resultObject?.style_stack_compliance?.tailwind_used === true,
    'Tailwind task requires tailwind_used=true'
  )
  const exceptionAllowed =
    lower(handoff?.project_constraints?.new_scss_policy) === 'explicit_exception_only' &&
    nonEmptyString(resultObject?.style_stack_compliance?.scss_exception_ref) &&
    (handoff?.project_constraints?.scss_exceptions ?? []).includes(
      resultObject.style_stack_compliance.scss_exception_ref
    )
  need(
    resultObject?.style_stack_compliance?.new_scss_added === false || exceptionAllowed,
    'new SCSS is forbidden without a Contract-listed exception'
  )
  const changedScss = (resultObject.changed_files ?? []).filter(file => /\.s[ac]ss$/i.test(file))
  need(
    changedScss.length === 0 || exceptionAllowed,
    `changed SCSS files without exception: ${changedScss.join(', ')}`
  )
}

function validateUniUiMapping(resultObject, { need, isObject, nonEmptyArray, uniUiPolicyName }) {
  const mapping = resultObject.uni_ui_mapping_evidence
  need(isObject(mapping), 'Figma + uni-ui task requires uni_ui_mapping_evidence')
  if (!isObject(mapping)) {return}
  need(mapping.status === 'completed', 'uni_ui_mapping_evidence.status must be completed')
  const skillOk = mapping.skill === '$uni-ui-figma-component-mapper'
  const policyOk = mapping.policy === uniUiPolicyName
  need(
    skillOk || policyOk,
    `uni_ui_mapping_evidence must cite skill=$uni-ui-figma-component-mapper or policy=${uniUiPolicyName}`
  )
  need(
    mapping.generated_before_first_ui_edit === true,
    'uni_ui_mapping_evidence must be generated before the first UI edit'
  )
  need(nonEmptyArray(mapping.regions), 'uni_ui_mapping_evidence.regions is required')
  need(Array.isArray(mapping.used_components), 'uni_ui_mapping_evidence.used_components must be an array')
  need(Array.isArray(mapping.custom_regions), 'uni_ui_mapping_evidence.custom_regions must be an array')
  need(
    mapping.install_dependency_checked === true,
    'uni_ui_mapping_evidence.install_dependency_checked must be true'
  )
  need(
    ['easycom', 'manual_existing_pattern', 'not_applicable'].includes(mapping.easycom_policy),
    'uni_ui_mapping_evidence.easycom_policy must be easycom|manual_existing_pattern|not_applicable'
  )
}

function validateFigmaFetch(resultObject, context) {
  const { handoff, figmaAcquiredBy, need, isObject, nonEmptyString, nonEmptyArray, callsOf } = context
  const evidence = resultObject.figma_fetch_evidence
  need(isObject(evidence), 'Figma task requires figma_fetch_evidence')
  if (!isObject(evidence)) {return}
  need(evidence.status === 'success', 'figma_fetch_evidence.status must be success')
  const allowedAcquirers = Array.isArray(figmaAcquiredBy) ? figmaAcquiredBy : [figmaAcquiredBy]
  need(
    allowedAcquirers.includes(evidence.acquired_by),
    `figma_fetch_evidence.acquired_by must be ${allowedAcquirers.join('|')}`
  )
  need(evidence.acquired_before_first_ui_edit === true, 'Figma must be acquired before the first UI edit')
  need(evidence.source_link === handoff.figma.link, 'figma_fetch_evidence.source_link must match handoff')
  need(evidence.node_id === handoff.figma.node_id, 'figma_fetch_evidence.node_id must match handoff')
  const calls = callsOf(evidence)
  const screenshotPolicySkip =
    allowedAcquirers.includes('zcode_external_implementer') &&
    evidence?.screenshot_policy_skip?.allowed === true &&
    nonEmptyString(evidence?.screenshot_policy_skip?.policy_ref) &&
    /AGENTS\.md/i.test(evidence.screenshot_policy_skip.policy_ref) &&
    /GLM|screenshot|截图|skip|跳过/i.test(evidence.screenshot_policy_skip.policy_ref)
  for (const tool of ['get_metadata', 'get_design_context']) {
    need(calls.includes(tool), `implementer must directly call ${tool}`)
  }
  if (!screenshotPolicySkip) {
    need(calls.includes('get_screenshot'), 'implementer must directly call get_screenshot')
  }
  need(nonEmptyArray(evidence.nodes_read), 'figma_fetch_evidence.nodes_read is required')
  if (!screenshotPolicySkip) {
    need(nonEmptyString(evidence.screenshot_ref), 'figma_fetch_evidence.screenshot_ref is required')
  }
  need(Array.isArray(evidence.variables_or_assets_used), 'variables_or_assets_used must be an array')
  need(Array.isArray(evidence.unresolved), 'figma_fetch_evidence.unresolved must be an array')
  need(evidence.unresolved.length === 0, 'completed Figma implementation cannot contain unresolved design items')
}
