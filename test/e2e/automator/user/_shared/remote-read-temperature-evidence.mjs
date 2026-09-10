import fs from 'node:fs'
import path from 'node:path'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readColdStartEvidence(requests) {
  const evidenceFile = String(process.env.QA_COLD_START_EVIDENCE_FILE || '').trim()
  const required = requests.map(request => ({
    endpoint: request.endpoint,
    probe_id: request.probe_id,
    sample: request.sample
  }))
  if (!evidenceFile) {
    return {
      status: 'unverified',
      reason: '首个 wx.request 只能是冷启动候选，必须由 CloudBase Init Report 按 probe_id 关联确认',
      required,
      evidence_file: null
    }
  }
  let evidence
  try {
    evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'))
  } catch (error) {
    return {
      status: 'unverified',
      reason: `无法读取 CloudBase 冷启动关联证据：${error.message}`,
      required,
      evidence_file: evidenceFile
    }
  }
  const correlations = Array.isArray(evidence?.correlations) ? evidence.correlations : []
  const correlationByProbe = new Map(
    correlations.map(item => [`${item?.endpoint}:${item?.probe_id}`, item])
  )
  const valid =
    evidence?.status === 'verified' &&
    evidence?.source === 'cloudbase_mcp_query_logs' &&
    required.every(request => {
      const correlation = correlationByProbe.get(`${request.endpoint}:${request.probe_id}`)
      const expectedFunctionName =
        request.endpoint === 'auth-user' ? 'auth-user-http' : 'plant-user-http'
      return (
        correlation?.function_name === expectedFunctionName &&
        typeof correlation?.cold_start === 'boolean' &&
        (correlation.cold_start === false || correlation?.init_report?.found === true)
      )
    })
  return {
    status: valid ? 'verified' : 'unverified',
    reason: valid
      ? null
      : '证据未按 probe_id 证明每条 wx.request 的真实函数、冷/热状态；冷请求还必须有 CloudBase Init Report',
    required,
    evidence_file: evidenceFile,
    correlations,
    correlation_by_probe: Object.fromEntries(correlationByProbe)
  }
}

function writeColdStartCandidate(requests) {
  const candidateFile = String(process.env.QA_COLD_START_CANDIDATE_FILE || '').trim()
  if (!candidateFile) {
    return null
  }
  const candidate = {
    status: 'awaiting_external_cloudbase_verification',
    source: 'automator_live_real_api',
    generated_at: new Date().toISOString(),
    requests: requests.map(request => ({
      endpoint: request.endpoint,
      probe_id: request.probe_id,
      sample: request.sample,
      url: request.url,
      status_code: request.status_code,
      elapsed_ms: request.elapsed_ms,
      response_code: request.response.code,
      response_bytes: request.response.response_bytes,
      cloudbase_request_id:
        request.cloudbase_request_id ||
        request.response.header?.['x-cloudbase-request-id'] ||
        request.response.header?.['X-CloudBase-Request-Id'] ||
        request.response.header?.['x-request-id'] ||
        request.response.header?.['X-Request-Id'] ||
        null
    }))
  }
  fs.mkdirSync(path.dirname(candidateFile), { recursive: true, mode: 0o700 })
  fs.writeFileSync(candidateFile, `${JSON.stringify(candidate, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  return candidateFile
}

export async function readColdStartEvidenceAfterHandoff(requests) {
  const evidenceFile = String(process.env.QA_COLD_START_EVIDENCE_FILE || '').trim()
  const candidateFile = writeColdStartCandidate(requests)
  if (!evidenceFile || !candidateFile) {
    return readColdStartEvidence(requests)
  }
  const timeoutMs = Math.max(
    1_000,
    Number(process.env.QA_COLD_START_EVIDENCE_TIMEOUT_MS || 30_000)
  )
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(evidenceFile)) {
      const evidence = readColdStartEvidence(requests)
      if (evidence.status === 'verified') {
        return evidence
      }
    }
    await sleep(250)
  }
  return readColdStartEvidence(requests)
}

export function labelTemperatureEvidence(requests, evidence) {
  const correlationByProbe = new Map(
    (evidence.correlations || []).map(item => [`${item?.endpoint}:${item?.probe_id}`, item])
  )
  const counts = {
    'auth-user': { cold: 0, hot: 0 },
    'user-plants': { cold: 0, hot: 0 }
  }
  for (const request of requests) {
    const correlation = correlationByProbe.get(`${request.endpoint}:${request.probe_id}`)
    const isCold = correlation?.cold_start === true
    request.temperature = isCold ? 'cold' : 'hot'
    request.cold_start = isCold
    request.cloudbase_request_id = correlation?.request_id || null
    request.cloudbase_container_id = correlation?.container_id || null
    request.cloudbase_init_report = correlation?.init_report || null
    counts[request.endpoint][request.temperature] += 1
  }
  return counts
}

export function meetsExploratorySampleTarget(counts, coldSamples, hotSamples) {
  return ['auth-user', 'user-plants'].every(
    endpoint => counts[endpoint].cold >= coldSamples && counts[endpoint].hot >= hotSamples
  )
}
