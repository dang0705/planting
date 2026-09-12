export function validateValidationEvidence(resultObject, requireSuccess, context) {
  const { need, isObject, nonEmptyString } = context
  need(isObject(resultObject.validation_evidence), 'completed result requires validation_evidence')
  if (!isObject(resultObject.validation_evidence)) {
    return
  }
  for (const name of ['unit_tests', 'lint', 'typecheck', 'build', 'self_check']) {
    validateEvidenceCheck(name, resultObject.validation_evidence[name], requireSuccess, {
      need,
      isObject,
      nonEmptyString
    })
  }
}

export function validateComputerUseToolEvidence(cu, context) {
  const { need, isObject, nonEmptyString } = context
  const tie = cu?.tool_invocation_evidence ?? {}
  need(isObject(tie), 'computer_use.tool_invocation_evidence is required')
  need(
    tie.actual_tool_invocation_required === true,
    'tool_invocation_evidence.actual_tool_invocation_required must be true'
  )
  need(
    ['@ZCode', '@Computer'].includes(tie.tool_target),
    'tool_invocation_evidence.tool_target must be @ZCode|@Computer'
  )
  need(tie.tool_events_seen === true, 'tool_invocation_evidence.tool_events_seen must be true')
  need(
    Number.isInteger(tie.tool_event_count) && tie.tool_event_count >= 5,
    'tool_invocation_evidence.tool_event_count must be >= 5'
  )
  need(
    Array.isArray(tie.transcript_event_refs) &&
      tie.transcript_event_refs.length >= 5 &&
      tie.transcript_event_refs.every(nonEmptyString),
    'tool_invocation_evidence.transcript_event_refs must contain >=5 non-empty refs'
  )
  need(
    Array.isArray(tie.commands_issued) &&
      tie.commands_issued.length >= 5 &&
      tie.commands_issued.every(nonEmptyString),
    'tool_invocation_evidence.commands_issued must contain >=5 commands'
  )
}

function validateEvidenceCheck(name, check, requireSuccess, { need, isObject, nonEmptyString }) {
  need(isObject(check), `validation_evidence.${name} must be an object`)
  if (!isObject(check)) {
    return
  }
  need(
    ['passed', 'not_applicable', 'failed', 'blocked'].includes(check.result),
    `validation_evidence.${name}.result must be passed|not_applicable|failed|blocked`
  )
  need(Array.isArray(check.commands), `validation_evidence.${name}.commands must be an array`)
  need(nonEmptyString(check.evidence_ref), `validation_evidence.${name}.evidence_ref is required`)
  if (check.result === 'not_applicable') {
    need(
      nonEmptyString(check.reason),
      `validation_evidence.${name}.reason is required for not_applicable`
    )
  } else {
    need(
      check.commands.length > 0,
      `validation_evidence.${name}.commands must be non-empty unless not_applicable`
    )
  }
  if (requireSuccess) {
    need(
      ['passed', 'not_applicable'].includes(check.result),
      `validation_evidence.${name} is not successful: ${check.result}`
    )
  }
}
