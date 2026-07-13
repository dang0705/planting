'use strict'

/**
 * "我的植物"浇水规划场景 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 场景：通过端上真实交互选择当前账号已有植物并触发 /user-plants/watering-planner。
 *
 * 关键修复（P0-3/P0-4）：
 *   - 入口 ID 改为 plant-card-reminder-{id}-water（来自 PlantCard.vue 实现 + docs 3.1）
 *   - 点击后断言 watering-reminder-sheet 出现
 *   - shadow 运行保存 comparator snapshot
 *   - active 运行加载 shadow snapshot，跨两次 LAN 运行形成可比较证据
 *   - active 必须验证：同一植物、amountRangeMl 深度相等、
 *     active intervalFactor 等于 shadow computedFactor、BASELINE 日期对齐
 *   - computedFactor=1.0 且无 candidate 时不作为 v3 生效证据 PASS
 *
 * 若当前账号没有可用的"我的植物"，或没有带结构化光照输入的合适植物，
 * 输出 classification=BLOCKED_FIXTURE 并说明缺什么；
 * 禁止静默写数据库、修改用户植物或伪造端上证据。
 */

import { reLaunchTo } from './lib/automator-client.mjs'
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
  findByIdPrefixAndSuffix,
  collectByIdPrefix,
  waitForElement,
  readPageDataSummary
} from './lib/element-helpers.mjs'
import {
  buildResponseSnapshot,
  saveShadowSnapshot,
  loadShadowSnapshot,
  compareShadowVsActive,
  hasVerifiableTranspirationEvidence,
  areSnapshotsCompatible
} from './lib/snapshot-comparator.mjs'
import { assertPlannerResponse } from './lib/planner-assertions.mjs'

const INDEX_PAGE = '/pages/index/index'
const PLANNER_API = '/user-plants/watering-planner'
const WATERING_ENTRY_PREFIX = 'plant-card-reminder-'
const WATERING_ENTRY_SUFFIX = '-water'
const WATERING_SHEET_ID = 'watering-reminder-sheet'

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
  let classification = 'FAIL_PRODUCT'
  let plannerRequest = null
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

    // 步骤 2：从运行时 DOM 动态定位前缀 plant-card-reminder- 且后缀 -water 的元素
    const wateringEntry = await findByIdPrefixAndSuffix(
      page,
      WATERING_ENTRY_PREFIX,
      WATERING_ENTRY_SUFFIX
    )
    recordAssertion(
      report,
      `找到浇水入口 ${WATERING_ENTRY_PREFIX}{id}${WATERING_ENTRY_SUFFIX}`,
      !!wateringEntry,
      wateringEntry
        ? `id=${wateringEntry.id}, plantId=${wateringEntry.extractedId}`
        : 'no watering entry found'
    )
    if (!wateringEntry) {
      setClassification(
        report,
        'BLOCKED_FIXTURE',
        `运行时未找到 ${WATERING_ENTRY_PREFIX}{id}${WATERING_ENTRY_SUFFIX} 入口，无法触发浇水规划流程`
      )
      return 'BLOCKED_FIXTURE'
    }

    // 步骤 3：点击真实入口，断言 watering-reminder-sheet 出现
    await clearCapturedRequests(mp)
    await wateringEntry.element.tap()
    await sleep(1500)

    const screenshotSheet = await safeScreenshot(mp, artifactDir, 'myplant-02-sheet')
    recordScreenshot(report, screenshotSheet)

    const sheetEl = await waitForElement(page, WATERING_SHEET_ID, 5000)
    recordAssertion(
      report,
      `浇水提醒 sheet ${WATERING_SHEET_ID} 出现`,
      !!sheetEl,
      sheetEl ? 'found' : 'not found'
    )
    if (!sheetEl) {
      setClassification(report, 'FAIL_PRODUCT', `点击浇水入口后 ${WATERING_SHEET_ID} 未出现`)
      return 'FAIL_PRODUCT'
    }

    // 步骤 4：等待 /user-plants/watering-planner 请求被触发
    plannerRequest = await waitForPlannerRequest(mp, 10000)
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
      // 尝试在 sheet 内寻找刷新/确认按钮触发 planner
      const refreshCandidates = await collectByIdPrefix(page, 'watering-reminder-')
      let triggered = false
      for (const candidate of refreshCandidates) {
        if (candidate.id.includes('confirm') || candidate.id.includes('refresh')) {
          await clearCapturedRequests(mp)
          await candidate.element.tap()
          await sleep(2000)
          const retryRequest = await waitForPlannerRequest(mp, 5000)
          if (retryRequest) {
            plannerRequest = retryRequest
            const retryRequests = await readCapturedRequests(mp)
            recordRequests(report, retryRequests)
            triggered = true
            recordAssertion(
              report,
              `通过 ${candidate.id} 触发 planner 请求`,
              true,
              `url=${retryRequest.url}`
            )
            break
          }
        }
      }
      if (!triggered) {
        setClassification(
          report,
          'FAIL_PRODUCT',
          '未捕获到 /user-plants/watering-planner wx.request，规划请求未发出'
        )
        return 'FAIL_PRODUCT'
      }
    }

    // 步骤 5：断言 planner 响应字段
    const responseOk = await assertPlannerResponse(report, plannerRequest, mode)

    // 步骤 6：shadow/active snapshot 对比
    const activeSnapshot = buildResponseSnapshot(plannerRequest)
    if (mode === 'shadow') {
      // shadow 运行：保存 comparator snapshot
      if (activeSnapshot) {
        const snapshotPath = saveShadowSnapshot(artifactDir, activeSnapshot)
        recordAssertion(report, 'shadow snapshot 已保存', true, `path=${snapshotPath}`)
        recordPageData(report, 'shadow-snapshot', activeSnapshot)

        // 验证是否有可验证的蒸腾候选证据
        const hasEvidence = hasVerifiableTranspirationEvidence(activeSnapshot)
        recordAssertion(
          report,
          'shadow 运行具备可验证的蒸腾候选证据（computedFactor!=1.0 且有 candidate）',
          hasEvidence,
          hasEvidence
            ? `computedFactor=${activeSnapshot.transpirationComputedFactor}, candidate=${activeSnapshot.transpirationCandidateNextWaterDate}`
            : `computedFactor=${activeSnapshot.transpirationComputedFactor}, candidate=${activeSnapshot.transpirationCandidateNextWaterDate}；遍历现有植物仍找不到合适样本时将 BLOCKED_FIXTURE`
        )
        if (!hasEvidence && responseOk) {
          // 尝试遍历其他植物寻找具备蒸腾证据的样本
          const foundEvidence = await tryOtherPlantsForEvidence(mp, report, artifactDir, page)
          if (!foundEvidence) {
            setClassification(
              report,
              'BLOCKED_FIXTURE',
              '遍历现有植物仍未找到具备结构化光照/蒸腾候选证据的样本（computedFactor=1.0 或无 candidate）。需要先为植物配置结构化光照环境。'
            )
            return 'BLOCKED_FIXTURE'
          }
        }
      } else {
        recordAssertion(
          report,
          'shadow snapshot 构建成功',
          false,
          'buildResponseSnapshot 返回 null'
        )
      }
    } else if (mode === 'active') {
      // active 运行：加载 shadow snapshot，跨两次 LAN 运行形成可比较证据
      const shadowBaseline = loadShadowSnapshot(artifactDir)
      recordAssertion(
        report,
        '加载到相容的 shadow baseline snapshot',
        !!shadowBaseline,
        shadowBaseline
          ? `savedAt=${shadowBaseline.savedAt}`
          : `未找到 shadow-snapshot.json，请先以 --watering-transpiration-mode=shadow 运行`
      )
      if (!shadowBaseline) {
        setClassification(
          report,
          'BLOCKED_ENV',
          'active 运行需要先有 shadow baseline snapshot。请先运行 npm run e2e:watering-transpiration-v3 -- --watering-transpiration-mode=shadow'
        )
        return 'BLOCKED_ENV'
      }

      const shadowSnapshot = shadowBaseline.snapshot
      const compatible = areSnapshotsCompatible(shadowSnapshot, activeSnapshot)
      recordAssertion(
        report,
        'active 与 shadow baseline 使用同一植物和相同可比输入',
        compatible,
        `shadow.plantId=${shadowSnapshot?.plantId}, active.plantId=${activeSnapshot?.plantId}`
      )
      if (!compatible) {
        setClassification(
          report,
          'BLOCKED_ENV',
          'active 与 shadow baseline 不相容（植物或输入签名不一致）。请重新运行 shadow 基准。'
        )
        return 'BLOCKED_ENV'
      }

      // 跨运行对比断言
      const comparisonAssertions = compareShadowVsActive(shadowSnapshot, activeSnapshot)
      for (const a of comparisonAssertions) {
        recordAssertion(report, a.name, a.passed, a.detail)
      }
      recordPageData(report, 'active-vs-shadow-comparison', {
        shadowSnapshot,
        activeSnapshot,
        assertions: comparisonAssertions
      })
    }

    // 步骤 7：截图是 UI 验收必需证据；为空时 BLOCKED_ENV
    const screenshotResult = await safeScreenshot(mp, artifactDir, 'myplant-03-result')
    recordScreenshot(report, screenshotResult)
    recordAssertion(
      report,
      '结果页截图成功保存',
      !!screenshotResult,
      screenshotResult || 'safeScreenshot returned null'
    )
    if (!screenshotResult) {
      setClassification(
        report,
        'BLOCKED_ENV',
        '结果页截图失败（safeScreenshot 返回 null），UI 验收证据缺失'
      )
      return 'BLOCKED_ENV'
    }

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
 * 尝试遍历其他植物寻找具备蒸腾证据的样本。
 * 不写数据库或改用户数据。
 */
async function tryOtherPlantsForEvidence(mp, report, artifactDir, page) {
  const allEntries = await collectByIdPrefix(page, WATERING_ENTRY_PREFIX)
  const waterEntries = allEntries.filter(e => e.id.endsWith(WATERING_ENTRY_SUFFIX))
  for (let i = 0; i < waterEntries.length; i++) {
    const entry = waterEntries[i]
    if (i === 0) continue // 第一个已试过
    try {
      await clearCapturedRequests(mp)
      await entry.element.tap()
      await sleep(1500)
      const sheetEl = await waitForElement(page, WATERING_SHEET_ID, 3000)
      if (!sheetEl) continue
      const plannerReq = await waitForPlannerRequest(mp, 6000)
      if (!plannerReq) continue
      const snapshot = buildResponseSnapshot(plannerReq)
      if (hasVerifiableTranspirationEvidence(snapshot)) {
        const snapshotPath = saveShadowSnapshot(artifactDir, snapshot)
        recordAssertion(
          report,
          `在植物 ${entry.id} 上找到蒸腾证据`,
          true,
          `computedFactor=${snapshot.transpirationComputedFactor}, candidate=${snapshot.transpirationCandidateNextWaterDate}, snapshot=${snapshotPath}`
        )
        recordPageData(report, 'shadow-snapshot', snapshot)
        return true
      }
    } catch (e) {
      // continue to next plant
    }
  }
  return false
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
