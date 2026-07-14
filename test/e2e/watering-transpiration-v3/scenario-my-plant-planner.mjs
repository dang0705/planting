'use strict'

/**
 * "我的植物"浇水规划场景 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 关键修复（P0-2/P0-3/P0-4）：
 *   - 删除任何点击 watering-reminder-confirm-button 的 fallback（会触发 addToCalendar 副作用）
 *   - 无副作用触发链：plant-card-reminder-{id}-water → watering-reminder-last-watering-row
 *     → watering-date-picker-sheet → 容器内确认按钮 → confirmDatePicker → fetchPlanner
 *   - 多植物遍历：切换前用 watering-reminder-close-button 关闭 sheet
 *   - 探索失败只记录探索信息，不污染最终断言；全部失败才 BLOCKED_FIXTURE
 *   - active 先加载 shadow snapshot，按 snapshot.plantId 精确选择植物
 *   - 完整请求 canonical SHA-256 签名比较（不只 plantId/date/url）
 *   - 断言没有 /watering-reminders 保存接口请求
 *   - P0: 从真实响应推断后端实际模式，与期望模式不符时归 BLOCKED_ENV（LAN worker 未按 WATERING_TRANSPIRATION_ENABLED 启动）
 *   - P1: confirmButtonAmbiguous 时归 BLOCKED_ENV（日期选择器容器内 button 结构无法稳定定位）
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
import { readPageDataSummary } from './lib/element-helpers.mjs'
import {
  buildResponseSnapshot,
  saveShadowSnapshot,
  loadShadowSnapshot,
  compareShadowVsActive,
  hasVerifiableTranspirationEvidence,
  areSnapshotsCompatible
} from './lib/snapshot-comparator.mjs'
import { assertPlannerResponse } from './lib/planner-assertions.mjs'
import {
  triggerPlannerNoSideEffect,
  collectWateringEntries,
  closeWateringSheet
} from './lib/planner-trigger.mjs'

const INDEX_PAGE = '/pages/index/index'
const PLANNER_API = '/user-plants/watering-planner'

/**
 * 运行"我的植物"浇水规划场景。
 */
export async function runMyPlantPlannerScenario(mp, report, artifactDir, mode) {
  let classification = 'FAIL_PRODUCT'
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

    // 读取 plantStore
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
        plants: plants.map(p => ({ id: p.id, nickname: p.nickname || null }))
      }
    })
    recordPageData(report, INDEX_PAGE, storeInfo)

    recordAssertion(report, 'plantStore 存在', storeInfo.hasStore)
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

    // 收集所有可用植物入口
    const wateringEntries = await collectWateringEntries(page)
    recordAssertion(
      report,
      '运行时找到至少一个 plant-card-reminder-{id}-water 入口',
      wateringEntries.length > 0,
      `found ${wateringEntries.length} entries: ${wateringEntries.map(e => e.plantId).join(',')}`
    )
    if (wateringEntries.length === 0) {
      setClassification(
        report,
        'BLOCKED_FIXTURE',
        '运行时未找到任何 plant-card-reminder-{id}-water 入口'
      )
      return 'BLOCKED_FIXTURE'
    }

    // 根据模式选择目标植物
    let targetPlantId = null
    let shadowSnapshot = null

    if (mode === 'active') {
      // P0-3: active 先加载 shadow snapshot，按 plantId 精确选择植物
      const shadowBaseline = loadShadowSnapshot(artifactDir)
      recordAssertion(
        report,
        '加载到相容的 shadow baseline snapshot',
        !!shadowBaseline,
        shadowBaseline ? `savedAt=${shadowBaseline.savedAt}` : '未找到 shadow-snapshot.json'
      )
      if (!shadowBaseline) {
        setClassification(
          report,
          'BLOCKED_ENV',
          'active 运行需要先有 shadow baseline snapshot。请先运行 --watering-transpiration-mode=shadow'
        )
        return 'BLOCKED_ENV'
      }
      shadowSnapshot = shadowBaseline.snapshot
      targetPlantId = String(shadowSnapshot.plantId)
      recordAssertion(
        report,
        `按 shadow snapshot plantId=${targetPlantId} 精确选择植物`,
        true,
        `shadow.plantId=${targetPlantId}`
      )
      // 验证该植物在运行时存在
      const exists = wateringEntries.some(e => String(e.plantId) === targetPlantId)
      recordAssertion(
        report,
        `shadow baseline 植物在运行时可访问`,
        exists,
        `looking for plantId=${targetPlantId} in ${wateringEntries.map(e => e.plantId).join(',')}`
      )
      if (!exists) {
        setClassification(
          report,
          'BLOCKED_FIXTURE',
          `shadow baseline 植物 plantId=${targetPlantId} 在运行时未找到`
        )
        return 'BLOCKED_FIXTURE'
      }
    }

    // 触发 planner（shadow 遍历植物寻找证据；active 用 shadow plantId）
    let plannerRequest = null
    let triggerChainResult = null
    const explorationLog = []

    if (mode === 'shadow') {
      // P0-3: shadow 遍历植物寻找蒸腾证据
      for (let i = 0; i < wateringEntries.length; i++) {
        const entry = wateringEntries[i]
        const candidatePlantId = entry.plantId

        // P0-3: 切换植物前关闭可能仍打开的 sheet
        if (i > 0) {
          await closeWateringSheet(page)
          await sleep(500)
        }

        await clearCapturedRequests(mp)
        const result = await triggerPlannerNoSideEffect(mp, page, candidatePlantId, {
          waitForRequest: mp2 => waitForPlannerRequest(mp2, 10000),
          readRequests: mp2 => readCapturedRequests(mp2)
        })
        triggerChainResult = result
        explorationLog.push({
          plantId: candidatePlantId,
          triggerChain: result.triggerChain,
          sideEffectDetected: result.sideEffectDetected,
          gotPlannerRequest: !!result.plannerRequest,
          confirmButtonAmbiguous: !!result.confirmButtonAmbiguous
        })

        // P1: confirmButtonAmbiguous 是环境限制（日期选择器容器 button 结构无法稳定定位），不是 fixture 问题
        if (result.confirmButtonAmbiguous) {
          recordPageData(report, 'shadow-exploration-log', explorationLog)
          setClassification(
            report,
            'BLOCKED_ENV',
            `plant ${candidatePlantId} 触发链中日期选择器容器内 button 结构无法稳定定位（confirmButtonAmbiguous）。` +
              '无法在不误触的前提下点击确认按钮。需检查 watering-date-picker-content 内 button 渲染结构。'
          )
          return 'BLOCKED_ENV'
        }

        // 记录所有真实 wx.request
        const allRequests = await readCapturedRequests(mp)
        recordRequests(report, allRequests)

        // 断言无副作用
        recordAssertion(
          report,
          `[shadow plant ${candidatePlantId}] 无 /watering-reminders 保存请求`,
          !result.sideEffectDetected,
          result.sideEffectDetected ? '检测到 saveWateringReminder 副作用' : 'clean'
        )

        if (result.plannerRequest) {
          const snapshot = buildResponseSnapshot(result.plannerRequest)
          if (hasVerifiableTranspirationEvidence(snapshot)) {
            // 找到证据，保存 snapshot
            plannerRequest = result.plannerRequest
            const snapshotPath = saveShadowSnapshot(artifactDir, snapshot)
            recordAssertion(
              report,
              `shadow 在植物 ${candidatePlantId} 上找到蒸腾证据并保存 snapshot`,
              true,
              `computedFactor=${snapshot.transpirationComputedFactor}, candidate=${snapshot.transpirationCandidateNextWaterDate}, path=${snapshotPath}`
            )
            recordPageData(report, 'shadow-snapshot', snapshot)
            break
          } else {
            // P0-3: 探索失败只记录探索信息，不记录失败断言
            explorationLog[explorationLog.length - 1].hasEvidence = false
            explorationLog[explorationLog.length - 1].reason =
              `computedFactor=${snapshot?.transpirationComputedFactor}, candidate=${snapshot?.transpirationCandidateNextWaterDate}`
          }
        }
      }

      if (!plannerRequest) {
        // P0-3: 全部植物遍历失败才 BLOCKED_FIXTURE
        recordPageData(report, 'shadow-exploration-log', explorationLog)
        setClassification(
          report,
          'BLOCKED_FIXTURE',
          `遍历 ${wateringEntries.length} 株植物仍未找到具备结构化光照/蒸腾候选证据的样本。` +
            '需要先为植物配置结构化光照环境（facing/windowType/position/hasDirectSun/distance）。' +
            '探索日志见 report.pageDataSummaries.shadow-exploration-log。'
        )
        return 'BLOCKED_FIXTURE'
      }
    } else {
      // active: 用 shadow plantId 触发
      await clearCapturedRequests(mp)
      const result = await triggerPlannerNoSideEffect(mp, page, targetPlantId, {
        waitForRequest: mp2 => waitForPlannerRequest(mp2, 10000),
        readRequests: mp2 => readCapturedRequests(mp2)
      })
      triggerChainResult = result
      plannerRequest = result.plannerRequest

      // P1: confirmButtonAmbiguous 是环境限制
      if (result.confirmButtonAmbiguous) {
        setClassification(
          report,
          'BLOCKED_ENV',
          `active 触发链中日期选择器容器内 button 结构无法稳定定位（confirmButtonAmbiguous）。` +
            '无法在不误触的前提下点击确认按钮。需检查 watering-date-picker-content 内 button 渲染结构。'
        )
        return 'BLOCKED_ENV'
      }

      const allRequests = await readCapturedRequests(mp)
      recordRequests(report, allRequests)

      recordAssertion(
        report,
        '[active] 无 /watering-reminders 保存请求',
        !result.sideEffectDetected,
        result.sideEffectDetected ? '检测到 saveWateringReminder 副作用' : 'clean'
      )
      recordAssertion(
        report,
        'active 捕获到 /user-plants/watering-planner wx.request',
        !!plannerRequest,
        plannerRequest ? `url=${plannerRequest.url}` : 'no planner request'
      )
      if (!plannerRequest) {
        setClassification(
          report,
          'FAIL_PRODUCT',
          'active 未捕获到 /user-plants/watering-planner wx.request'
        )
        return 'FAIL_PRODUCT'
      }
    }

    // 断言 planner 响应字段（从真实响应推断实际模式）
    const assertResult = await assertPlannerResponse(report, plannerRequest, mode)

    // P0: 实际模式与期望模式不符 → BLOCKED_ENV（LAN worker 未按 WATERING_TRANSPIRATION_ENABLED 启动）
    if (assertResult.modeMismatch) {
      setClassification(
        report,
        'BLOCKED_ENV',
        `期望后端模式=${mode}，但真实响应推断实际模式=${assertResult.actualMode}。` +
          '本地 LAN worker 未按对应 WATERING_TRANSPIRATION_ENABLED 配置启动/重启。' +
          'shadow 需 WATERING_TRANSPIRATION_ENABLED=false 或未设置；' +
          'active 需 WATERING_TRANSPIRATION_ENABLED=true。' +
          '请停止当前 LAN worker，以正确环境变量重启 npm run dev:mp-weixin:local-functions:lan 后重跑。' +
          '这不是产品失败（FAIL_PRODUCT），而是端上验收环境未就绪（BLOCKED_ENV）。'
      )
      return 'BLOCKED_ENV'
    }

    // snapshot 对比（active）
    const activeSnapshot = buildResponseSnapshot(plannerRequest)
    if (mode === 'active' && shadowSnapshot && activeSnapshot) {
      const compatible = areSnapshotsCompatible(shadowSnapshot, activeSnapshot)
      recordAssertion(
        report,
        'active 与 shadow 完整输入签名 hash 相同（完整 canonical SHA-256）',
        compatible,
        `shadow.hash=${shadowSnapshot.inputHash?.slice(0, 16)}..., active.hash=${activeSnapshot.inputHash?.slice(0, 16)}...`
      )
      if (!compatible) {
        setClassification(
          report,
          'BLOCKED_ENV',
          'active 与 shadow 输入签名不一致（天气或浇水事件变化）。请重跑 shadow 基准。'
        )
        return 'BLOCKED_ENV'
      }
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

    // 截图为空时 BLOCKED_ENV
    const screenshotResult = await safeScreenshot(mp, artifactDir, 'myplant-03-result')
    recordScreenshot(report, screenshotResult)
    recordAssertion(
      report,
      '结果页截图成功保存',
      !!screenshotResult,
      screenshotResult || 'safeScreenshot returned null'
    )
    if (!screenshotResult) {
      setClassification(report, 'BLOCKED_ENV', '结果页截图失败，UI 验收证据缺失')
      return 'BLOCKED_ENV'
    }

    // 最终 classification
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
