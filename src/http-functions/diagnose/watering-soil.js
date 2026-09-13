import { requestHttpFunction } from '@/api/http.js'

export async function analyzeWateringSoilEvidence(payload = {}) {
  const response = await requestHttpFunction('diagnose-http/watering/soil-evidence', {
    method: 'POST',
    body: payload,
    requirePlatformSession: true,
    timeout: 45000
  })
  if (response?.code !== 200) {
    const error = new Error(response?.message || '盆土照片暂时无法分析，请稍后重试')
    error.statusCode = Number(response?.code || 500)
    throw error
  }
  return response.data || null
}

export async function cleanupTemporaryWateringSoilEvidence(evidenceId = '') {
  if (!String(evidenceId || '').trim()) {
    return
  }
  await requestHttpFunction('diagnose-http/watering/soil-evidence', {
    method: 'DELETE',
    body: { evidenceId: String(evidenceId).trim() },
    requirePlatformSession: true,
    timeout: 10000
  })
}
