'use strict'

const { jsonResponse } = require('/opt/utils/http')
const { assertAuthenticatedUser, runWithQuotaGuard } = require('../services/request-guard')
const {
  runQuestionStartDiagnosis,
  resolveManualSymptomMode
} = require('./diagnosis-question-start-runner')
const { withQuestionTextConservative } = require('./request-normalizers')
const {
  buildPublicRoundResponse: presentDiagnosisRoundResponse
} = require('../presenters/diagnosis-round-presenter')
const { buildFrontendDiagnosisResponse } = require('./frontend-response')

const FIXED_QUESTION_PACKAGE_MODE_KEYS = new Set(['yellow_leaf', 'wilting_droop'])

function shouldCheckQuestionStartQuota(payload = {}) {
  try {
    // 固定题包只做服务端规则匹配，不调用 AI。answer 本身也不扣 AI 配额，
    // 因此无图固定题包不应为一次纯规则问答额外发起用户配额 SQL。
    return !FIXED_QUESTION_PACKAGE_MODE_KEYS.has(resolveManualSymptomMode(payload).modeKey)
  } catch {
    // 让 runner 继续负责返回原有的参数/模式错误，不能因性能判断改变错误语义。
    return true
  }
}

async function handleQuestionStart({ payload, identity, timing } = {}) {
  const openid = identity?.openid || ''
  assertAuthenticatedUser({ userInfo: identity, message: '请先登录' })

  const executed = await runWithQuotaGuard({
    openid,
    enabled: shouldCheckQuestionStartQuota(payload),
    quotaUserSnapshot: identity?.userInfo?.quotaUserSnapshot || null,
    quotaUserSnapshotFresh: identity?.userInfo?.quotaUserSnapshotFresh === true,
    timing,
    deferQuotaConsumption: true,
    task: async () =>
      runQuestionStartDiagnosis({
        payload,
        openid,
        timing
      })
  })
  timing.mark('quota-and-runner-ready')

  const hydratedPublicResponse = await withQuestionTextConservative({
    ...executed.response,
    userPlantId: executed.userPlantId || executed.response.userPlantId || null,
    plantId: executed.plantId || executed.response.plantId || '',
    plantCatalogId: executed.plantCatalogId || executed.response.plantCatalogId || null,
    plantIdentityId: executed.plantIdentityId || executed.response.plantIdentityId || '',
    latestVisualCallBatchId:
      executed.latestVisualCallBatchId ?? executed.response.latestVisualCallBatchId ?? null
  })
  timing.mark('response-ready')
  timing.finish({ statusCode: 200 })

  const data = buildFrontendDiagnosisResponse(
    presentDiagnosisRoundResponse(hydratedPublicResponse)
  )
  if (executed.questionPackageContinuationToken) {
    data.questionPackageContinuationToken = executed.questionPackageContinuationToken
  }

  return jsonResponse(200, {
    code: 200,
    message: '问诊初始化成功',
    data
  })
}

module.exports = { handleQuestionStart, _test: { shouldCheckQuestionStartQuota } }
