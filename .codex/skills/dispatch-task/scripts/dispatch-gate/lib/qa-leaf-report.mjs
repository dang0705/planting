const TERMINAL_KINDS = new Set(['failed_environment', 'failed_product', 'failed_script', 'aborted'])
export const LEAF_CLASSIFICATION_VERSION = 'qa_leaf_classification_v2'
const TRANSPORT_MARKERS =
  /timeout|timed out|transport|websocket|\brpc\b|connection|screenshot(?:\s+channel)?|app\.callfunction|capturescreenshot/i

function objectEnd(text, start) {
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        quoted = false
      }
      continue
    }
    if (character === '"') {
      quoted = true
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
    }
  }
  return -1
}

function structuredCandidates(text) {
  const candidates = []
  const matcher = /\{\s*"status"\s*:/g
  let match
  while ((match = matcher.exec(text))) {
    const end = objectEnd(text, match.index)
    candidates.push({
      raw_report: end === -1 ? text.slice(match.index) : text.slice(match.index, end)
    })
  }
  return candidates
}

function parseFromSource(source, text) {
  const candidates = structuredCandidates(text)
  let fallback
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index]
    try {
      const report = JSON.parse(candidate.raw_report)
      if (!report || typeof report !== 'object' || typeof report.status !== 'string') {
        continue
      }
      if (report.gate?.startsWith('qa_')) {
        continue
      }
      const parsed = {
        parse_status: 'parsed',
        source,
        raw_report: candidate.raw_report,
        report
      }
      if (
        report.status === 'failed' ||
        Array.isArray(report.assertions) ||
        Array.isArray(report.failed_assertions) ||
        Array.isArray(report.failures) ||
        typeof report.failure_kind === 'string'
      ) {
        return parsed
      }
      fallback ??= parsed
    } catch (error) {
      return {
        parse_status: 'malformed',
        source,
        raw_report: candidate.raw_report,
        parse_error: error.message
      }
    }
  }
  return fallback
}

export function extractLeafReport({ stdout = '', stderr = '' } = {}) {
  return (
    parseFromSource('stdout', stdout) ??
    parseFromSource('stderr', stderr) ?? {
      parse_status: 'absent',
      source: 'unavailable',
      raw_report: ''
    }
  )
}

function failedStepOrFailureEntries(report) {
  const failedSteps = Array.isArray(report.steps)
    ? report.steps.filter(step => step?.status === 'failed')
    : []
  return [...failedSteps, ...(Array.isArray(report.failures) ? report.failures : [])]
}

function hasTransportFailure(report) {
  return failedStepOrFailureEntries(report).some(entry =>
    TRANSPORT_MARKERS.test(JSON.stringify(entry))
  )
}

function hasFailedAssertion(report) {
  return (
    (Array.isArray(report.assertions) && report.assertions.some(item => item?.passed === false)) ||
    (Array.isArray(report.failed_assertions) && report.failed_assertions.length > 0)
  )
}

export function classifyLeafReport(leafReport) {
  if (leafReport?.parse_status === 'malformed') {
    return 'failed_script'
  }
  if (leafReport?.parse_status !== 'parsed') {
    return null
  }
  const report = leafReport.report
  if (TERMINAL_KINDS.has(report.failure_kind)) {
    return report.failure_kind
  }
  if (TERMINAL_KINDS.has(report.status)) {
    return report.status
  }
  if (report.status !== 'failed') {
    return null
  }
  if (hasTransportFailure(report)) {
    return 'failed_environment'
  }
  if (hasFailedAssertion(report)) {
    return 'failed_product'
  }
  return 'failed_script'
}

export function leafReportEvidence(leafReport, evidencePath) {
  return {
    parse_status: leafReport.parse_status,
    source: leafReport.source,
    report_status: leafReport.report?.status ?? 'unavailable',
    failure_kind: classifyLeafReport(leafReport) ?? 'unavailable',
    classification_version: LEAF_CLASSIFICATION_VERSION,
    raw_report_ref: evidencePath,
    parse_error: leafReport.parse_error ?? null
  }
}
