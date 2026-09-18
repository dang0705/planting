import { requestHttpFunction } from '@/api/http.js'

// `uni build` 的 Vite DEV 为 false；青花植开发云环境仍由 VITE_APP_ENV
// 标识。二者任一为开发态才请求并打印审计，体验版与生产包不会携带审计。
const FRONTEND_SOIL_DEBUG =
  import.meta.env.DEV === true || import.meta.env.VITE_APP_ENV === 'development'

function logSoilVisualDebug(result = {}) {
  const audit = result?.debugAudit
  if (!FRONTEND_SOIL_DEBUG || !audit) {
    return
  }
  console.log('[浇水盆土视觉][模型]', {
    providerId: String(audit.providerId || ''),
    modelId: String(audit.modelId || '')
  })
  console.log('[浇水盆土视觉][模型调用prompt]', String(audit.promptText || ''))
  // 不能从主包反向 require 诊断分包；直接打印服务端审计到的完整用量，
  // 字段仍包含 input/output/total 以及供应商返回的缓存统计。
  console.log('[浇水盆土视觉][token 用量]', audit.tokenUsage || null)
  console.log('[浇水盆土视觉][图片传输]', String(audit.imageInputTransport || ''))
  console.log('[浇水盆土视觉][模型原始返回]', String(audit.modelReturnText || ''))
  console.log('[浇水盆土视觉][解析结果]', audit.parsedReview || null)
  console.log('[浇水盆土视觉][最终结果]', {
    review: audit.finalReview || result.review || null,
    response: result
  })
}

export async function analyzeWateringSoilEvidence(payload = {}) {
  const response = await requestHttpFunction('diagnose-http/watering/soil-evidence', {
    method: 'POST',
    body: payload,
    headers: FRONTEND_SOIL_DEBUG ? { 'x-planting-debug-audit': 'soil_visual_v1' } : undefined,
    requirePlatformSession: true,
    timeout: 45000
  })
  if (response?.code !== 200) {
    const error = new Error(response?.message || '盆土照片暂时无法分析，请稍后重试')
    error.statusCode = Number(response?.code || 500)
    throw error
  }
  const result = response.data || null
  logSoilVisualDebug(result)
  return result
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
