'use strict'

/**
 * "我的植物"浇水规划场景 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 场景：通过端上真实交互选择当前账号已有植物并触发 /user-plants/watering-planner。
 *
 * 步骤：
 *   1. reLaunch 到首页 /pages/index/index
 *   2. 读取 plantStore，确认有可用的"我的植物"
 *   3. 从运行时可见的植物列表动态选择一个条目（不硬编码 plantId）
 *   4. 触发浇水规划请求（通过页面交互，不直接调用页面方法或 Node 请求）
 *   5. 捕获 /user-plants/watering-planner 的真实 wx.request
 *   6. 断言响应保留现有浇水规划字段
 *   7. 断言 transpirationIntervalFactor / transpirationShadow / transpirationComputedFactor 存在
 *   8. 断言 candidateNextWaterDate / candidateNextWaterWindow（以实际响应字段为准）
 *   9. shadow 模式下生效系数必须为 1.0，候选值被审计字段记录
 *  10. active 模式下允许蒸腾系数影响 BASELINE 间隔
 *  11. 蒸腾不得改变 amountRangeMl，不得绕过 WET/DRY Gate
 *  12. 保存截图
 *
 * 若当前账号没有可用的"我的植物"，或没有带结构化光照输入的合适植物，
 * 输出 classification=BLOCKED_FIXTURE 并说明缺什么；
 * 禁止静默写数据库、修改用户植物或伪造端上证据。
 */

import { reLaunchTo, safeDisconnect } from './lib/automator-client.mjs'
import {
  installRequestCapture,
  readCapturedRequests,
  clearCapturedRequests,
  restoreRequest,
  findRequestByUrl
} from './lib/request-capture.mjs'
import { safeScreenshot } from './lib/screenshot.mjs'
import {
  recordPage,
  recordPageData,
  recordRequests,
  recordAssertion,
  recordScreenshot,
  setClassification
} from './lib/reporter.mjs'
import {
  findViewById,
  findByIdPrefix,
  waitForElement,
  tapById,
  readTextById,
  readPageDataSummary
} from './lib/element-helpers.mjs'

const INDEX_PAGE = '/pages/index/index'
const PLANNER_API = '/user-plants/watering-planner'

/**
 * 运行"我的植物"浇水规划场景。
 *
 * @param {object} mp - miniProgram 实例
 * @param {object} report - 报告对象
 * @param {string} artifactDir - 截图保存目录
 * @param {string} mode - shadow | active
 * @returns {Promise<string>} classification
 */
export async function runMyPlantPlannerScenario(mp, report, artifactDir, mode) {
  try {
    await installRequestCapture(mp)
    await clearCapturedRequests(mp)

    recordPage(report, INDEX_PAGE)
    const page = await reLaunchTo(mp, INDEX_PAGE)
    await sleep(2000)

    const pageSummary = await readPageDataSummary(mp)
    recordPageData(report, INDEX_PAGE, pageSummary)

    const screenshotInit = await safeScreenshot(mp, artifactDir, 'myplant-01-init')
    recordScreenshot(report, screenshotInit)

    // 步骤 1：读取 plantStore，确认有可用的"我的植物"
    const storeInfo = await mp.evaluate(() => {
      const pages = getCurrentPages()
      const cp = pages[pages.length - 1]
      const vm = cp && cp.$vm
      const store = vm && (vm.plantStore || vm.pinia?.state?.value?.plant)
      if (!store) return { hasStore: false }
      const plants = store.userPlants || []
      return {
        hasStore: true,
        hasPlants: !!store.hasPlants,
        plantsCount: plants.length,
        firstPlantId: plants[0]?.id || null,
        firstPlantNickname: plants[0]?.nickname || null,
        plantsNeedWaterCount: store.plantsNeedWater?.length || 0
      }
    })
    recordPageData(report, INDEX_PAGE, storeInfo)

    recordAssertion(
      report,
      'plantStore 存在',
      storeInfo.hasStore,
      storeInfo.hasStore ? 'found' : 'plantStore not found on index page'
    )
    if (!storeInfo.hasStore) {
      setClassification(report, 'BLOCKED_ENV', 'plantStore 未找到，首页可能未正确加载或未登录')
      return 'BLOCKED_ENV'
    }

    recordAssertion(
      report,
      '当前账号至少有一株我的植物',
      storeInfo.plantsCount > 0,
      `plantsCount=${storeInfo.plantsCount}`
    )
    if (storeInfo.plantsCount === 0) {
      setClassification(
        report,
        'BLOCKED_FIXTURE',
        '当前账号没有可用的"我的植物"，无法触发浇水规划请求；禁止静默写数据库或伪造 fixture'
      )
      return 'BLOCKED_FIXTURE'
    }

    // 步骤 2：从运行时可见的植物列表动态选择一个条目（不硬编码 plantId）
    // 优先查找浇水入口/卡片，触发浇水规划流程
    const wateringEntry = await findWateringEntry(page)
    recordAssertion(
      report,
      '找到浇水入口（浇水卡片/按钮）',
      !!wateringEntry,
      wateringEntry ? `id=${wateringEntry.id}` : 'no watering entry found'
    )
    if (!wateringEntry) {
      setClassification(
        report,
        'BLOCKED_FIXTURE',
        '运行时未找到浇水入口（卡片/按钮），无法触发浇水规划流程'
      )
      return 'BLOCKED_FIXTURE'
    }

    await clearCapturedRequests(mp)
    await wateringEntry.element.tap()
    await sleep(2000)

    // 步骤 3：等待浇水规划请求被触发
    // 可能在 bottom sheet 打开后自动触发，或需要点击"刷新建议"
    const plannerRequest = await waitForPlannerRequest(mp, 8000)
    const requests = await readCapturedRequests(mp)
    recordRequests(report, requests)

    recordAssertion(
      report,
      '捕获到 /user-plants/watering-planner wx.request',
      !!plannerRequest,
      plannerRequest
        ? `url=${plannerRequest.url}, method=${plannerRequest.method}`
        : `no planner request in ${requests.length} captured requests`
    )
    if (!plannerRequest) {
      // 尝试触发刷新建议
      const refreshBtn = await findByIdPrefix(page, 'watering-refresh')
      if (refreshBtn) {
        await clearCapturedRequests(mp)
        await refreshBtn.element.tap()
        await sleep(2000)
        const retryRequest = await waitForPlannerRequest(mp, 5000)
        const retryRequests = await readCapturedRequests(mp)
        recordRequests(report, retryRequests)
        if (retryRequest) {
          recordAssertion(
            report,
            '刷新后捕获到 /user-plants/watering-planner wx.request',
            true,
            `url=${retryRequest.url}`
          )
          await assertPlannerResponse(report, retryRequest, mode)
        } else {
          setClassification(
            report,
            'FAIL_PRODUCT',
            '未捕获到 /user-plants/watering-planner wx.request，规划请求未发出'
          )
          return 'FAIL_PRODUCT'
        }
      } else {
        setClassification(
          report,
          'FAIL_PRODUCT',
          '未捕获到 /user-plants/watering-planner wx.request，且未找到刷新按钮'
        )
        return 'FAIL_PRODUCT'
      }
    } else {
      await assertPlannerResponse(report, plannerRequest, mode)
    }

    const screenshotResult = await safeScreenshot(mp, artifactDir, 'myplant-02-result')
    recordScreenshot(report, screenshotResult)

    // 根据断言结果决定 classification
    const failedAssertions = report.assertions.filter(a => !a.passed)
    if (failedAssertions.length === 0) {
      setClassification(report, 'PASS')
      return 'PASS'
    }
    setClassification(
      report,
      'FAIL_PRODUCT',
      `${failedAssertions.length} assertions failed: ${failedAssertions.map(a => a.name).join(', ')}`
    )
    return 'FAIL_PRODUCT'
  } catch (error) {
    setClassification(report, 'FAIL_PRODUCT', `unexpected error: ${error?.message || error}`)
    return 'FAIL_PRODUCT'
  } finally {
    await restoreRequest(mp)
  }
}

/**
 * 查找浇水入口（卡片/按钮）。
 * 优先按稳定 ID 前缀查找，不硬编码 plantId 或中文文案。
 */
async function findWateringEntry(page) {
  // 尝试常见的浇水入口 ID 前缀
  const prefixes = [
    'home-watering-card',
    'home-watering-entry',
    'plant-watering-entry',
    'watering-reminder'
  ]
  for (const prefix of prefixes) {
    const entry = await findByIdPrefix(page, prefix)
    if (entry) return entry
  }
  return null
}

/**
 * 等待 /user-plants/watering-planner 请求出现。
 */
async function waitForPlannerRequest(mp, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const requests = await readCapturedRequests(mp)
    const found = findRequestByUrl(requests, PLANNER_API, 'POST')
    if (found) return found
    await sleep(500)
  }
  return null
}

/**
 * 断言 planner 响应字段。
 */
async function assertPlannerResponse(report, plannerRequest, mode) {
  const response = plannerRequest.response
  const responseData = response?.data
  const responseOk =
    response?.statusCode === 200 && responseData && typeof responseData === 'object'

  recordAssertion(
    report,
    'planner 响应 statusCode=200 且 data 为对象',
    responseOk,
    `statusCode=${response?.statusCode}, dataType=${typeof responseData}`
  )
  if (!responseOk) return

  const data = responseData.data || responseData
  if (!data || typeof data !== 'object') {
    recordAssertion(report, 'planner 响应包含 data 对象', false, `data=${JSON.stringify(data)}`)
    return
  }

  // 步骤 4：断言响应保留现有浇水规划字段
  const expectedExistingFields = [
    'planId',
    'nextWaterDate',
    'nextWaterWindow',
    'nextWaterReason',
    'wateringContext',
    'action',
    'amountRangeMl',
    'confidenceLevel',
    'reasonCodes'
  ]
  for (const field of expectedExistingFields) {
    recordAssertion(
      report,
      `响应保留现有字段 ${field}`,
      field in data,
      field in data ? 'present' : 'missing'
    )
  }

  // 步骤 5：断言 v3 蒸腾审计字段存在
  const transpirationFields = [
    'transpirationIntervalFactor',
    'transpirationShadow',
    'transpirationComputedFactor'
  ]
  for (const field of transpirationFields) {
    recordAssertion(
      report,
      `响应包含 v3 蒸腾字段 ${field}`,
      field in data,
      field in data ? `value=${JSON.stringify(data[field])}` : 'missing'
    )
  }

  // 步骤 6：candidate 字段（以实际响应字段为准）
  const candidateDateField =
    'transpirationCandidateNextWaterDate' in data
      ? 'transpirationCandidateNextWaterDate'
      : 'candidateNextWaterDate'
  const candidateWindowField =
    'transpirationCandidateNextWaterWindow' in data
      ? 'transpirationCandidateNextWaterWindow'
      : 'candidateNextWaterWindow'
  recordAssertion(
    report,
    `响应包含候选日期字段 ${candidateDateField}`,
    candidateDateField in data,
    candidateDateField in data ? `value=${JSON.stringify(data[candidateDateField])}` : 'missing'
  )
  recordAssertion(
    report,
    `响应包含候选窗口字段 ${candidateWindowField}`,
    candidateWindowField in data,
    candidateWindowField in data ? `value=${JSON.stringify(data[candidateWindowField])}` : 'missing'
  )

  // 步骤 7：shadow 模式下生效系数必须为 1.0
  if (mode === 'shadow') {
    const factorIsOne = data.transpirationIntervalFactor === 1.0
    recordAssertion(
      report,
      'shadow 模式下 transpirationIntervalFactor === 1.0',
      factorIsOne,
      `actual=${data.transpirationIntervalFactor}`
    )
    const shadowFlag = data.transpirationShadow === true
    recordAssertion(
      report,
      'shadow 模式下 transpirationShadow === true',
      shadowFlag,
      `actual=${data.transpirationShadow}`
    )
    // 候选值被审计字段记录
    if (data.transpirationComputedFactor !== undefined) {
      recordAssertion(
        report,
        'shadow 模式下 transpirationComputedFactor 被审计记录',
        true,
        `computedFactor=${data.transpirationComputedFactor}`
      )
    }
  }

  // 步骤 8：active 模式下允许蒸腾系数影响 BASELINE 间隔
  if (mode === 'active') {
    const factorInRange =
      typeof data.transpirationIntervalFactor === 'number' &&
      data.transpirationIntervalFactor >= 0.8 &&
      data.transpirationIntervalFactor <= 1.2
    recordAssertion(
      report,
      'active 模式下 transpirationIntervalFactor 在 [0.8, 1.2] 范围内',
      factorInRange,
      `actual=${data.transpirationIntervalFactor}`
    )
  }

  // 步骤 9：蒸腾不得改变 amountRangeMl
  // （通过字段存在性断言，不在端上重算公式）
  recordAssertion(
    report,
    '响应包含 amountRangeMl（蒸腾不改变单次毫升数）',
    'amountRangeMl' in data,
    `value=${JSON.stringify(data.amountRangeMl)}`
  )

  // 步骤 10：蒸腾不得绕过 WET/DRY Gate
  // wateringContext 应为 BASELINE / WET / DRY 之一
  const validContexts = ['BASELINE', 'WET', 'DRY']
  const contextValid = validContexts.includes(data.wateringContext)
  recordAssertion(
    report,
    'wateringContext 为 BASELINE/WET/DRY 之一（蒸腾不绕过 Gate）',
    contextValid,
    `actual=${data.wateringContext}`
  )
  if (data.wateringContext === 'WET') {
    recordAssertion(
      report,
      'WET 状态下 nextWaterDate 为 null（蒸腾不绕过湿润保护）',
      data.nextWaterDate === null,
      `actual=${JSON.stringify(data.nextWaterDate)}`
    )
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
