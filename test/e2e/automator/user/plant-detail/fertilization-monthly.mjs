#!/usr/bin/env node
'use strict'

/**
 * 施肥月度表页面展示验收。
 *
 * 该叶子使用运行时内存夹具，不写入 CloudBase 的真实用户植物数据：
 * - 首页通过真实 plant store 加载一株带 Monstera 属信息的夹具植物，并点击首页卡片施肥入口打开底部表格；
 * - 详情页通过真实 fetchUserPlant 请求链路读取公开侧 fertilizationMonthly；
 * - 只对 mode=view 页面做展示契约断言，不把首页当前的 edit 入口误判为 view 入口。
 *
 * 首页卡片继续进入 mode=edit；月度表既验证首页弹层，也验证 mode=view 详情展示。
 */

import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead
} from '../../care/watering/transpiration-v3/_shared/lib/env.mjs'
import {
  connectAutomator,
  AutomatorConnectError,
  reLaunchTo,
  safeDisconnect
} from '../../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  findViewById,
  waitForElement
} from '../../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import { safeScreenshot } from '../../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import {
  createReport,
  emitLeafReport,
  recordAssertion,
  recordPage,
  recordPageData,
  recordRequests,
  recordScreenshot,
  saveReport,
  setClassification
} from '../../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../../care/watering/transpiration-v3/_shared/lib/project-check.mjs'
import { installFixture, restoreFixture } from '../../_shared/fertilization-monthly-fixture.mjs'
import { verifyFertilizationCalendarScenarios } from '../../_shared/fertilization-reminder-calendar-scenarios.mjs'
import {
  hideNativeModal,
  scrollFertilizationSheetToActions
} from '../../_shared/fertilization-reminder-e2e-helpers.mjs'
import {
  readFixtureFertilizationState,
  readFixtureRequests,
  resetFixtureFertilizationReminder
} from '../../_shared/fertilization-reminder-fixture-state.mjs'
import {
  DETAIL_PAGE,
  DETAIL_ROUTE,
  FIXTURE_PLANT_ID,
  FIXTURE_USER,
  INDEX_PAGE,
  USER_PLANTS_QUERY_KEY,
  USER_STORE_KEY,
  createFixturePlant
} from '../../_shared/fertilization-test-fixtures.mjs'

const FIXTURE_SLOT = '__e2eFertilizationMonthlyFixtureV1'
const FIXTURE_PLANT = createFixturePlant()
const DETAIL_SCREENSHOT_SETTLE_MS = 1200

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function textOf(element) {
  return String((await element.text()) || '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function run() {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'fertilization-monthly',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  let fixtureInstalled = false

  try {
    const projectCheck = preflightProject(env.projectPath)
    if (!projectCheck.ok) {
      setClassification(report, 'BLOCKED_ENV', projectCheck.reason)
      const reportPath = saveReport(report, env.artifactDir, 'fertilization-monthly-blocked')
      emitLeafReport(report)
      console.error(`[e2e] report: ${reportPath}`)
      process.exitCode = 2
      return
    }

    try {
      mp = await connectAutomator(env.wsEndpoint)
    } catch (error) {
      const reason =
        error instanceof AutomatorConnectError ? error.reason : String(error?.message || error)
      setClassification(report, 'BLOCKED_ENV', `automator connect failed: ${reason}`)
      const reportPath = saveReport(report, env.artifactDir, 'fertilization-monthly-blocked')
      emitLeafReport(report)
      console.error(`[e2e] report: ${reportPath}`)
      process.exitCode = 2
      return
    }

    const fixtureConfig = {
      user: FIXTURE_USER,
      plant: FIXTURE_PLANT,
      userStoreKey: USER_STORE_KEY,
      queryKey: USER_PLANTS_QUERY_KEY,
      runtimeSlot: FIXTURE_SLOT,
      calendarMode: 'success'
    }
    await installFixture(mp, fixtureConfig)
    fixtureInstalled = true

    let page = await reLaunchTo(mp, INDEX_PAGE)
    recordPage(report, INDEX_PAGE)
    const indexList = await waitForElement(page, 'index-plant-list', 10000)
    const homeCard = await findViewById(page, `index-plant-card-edit-${FIXTURE_PLANT_ID}`)
    recordAssertion(
      report,
      '首页通过真实 plant store 展示 Monstera 夹具植物',
      Boolean(indexList && homeCard)
    )
    if (!indexList || !homeCard) {
      setClassification(report, 'BLOCKED_FIXTURE', '首页未加载施肥月度表验收夹具')
      return
    }

    const homeScreenshot = await safeScreenshot(mp, env.artifactDir, 'fertilization-monthly-home')
    recordScreenshot(report, homeScreenshot)
    recordAssertion(report, '首页夹具截图有效', Boolean(homeScreenshot))

    // 截图 handoff 会替换底层 Automator session；截图前取得的 element 句柄不能复用。
    page = await mp.currentPage()
    const homeCardAfterScreenshot = await findViewById(
      page,
      `index-plant-card-edit-${FIXTURE_PLANT_ID}`
    )
    recordAssertion(report, '截图 handoff 后首页植物卡片仍可定位', Boolean(homeCardAfterScreenshot))
    if (!homeCardAfterScreenshot) {
      setClassification(report, 'BLOCKED_ENV', '截图 handoff 后无法重新定位首页植物卡片')
      return
    }

    const fertilizationEntry = await findViewById(
      page,
      `plant-card-fertilization-${FIXTURE_PLANT_ID}`
    )
    recordAssertion(report, '首页植物卡片显示施肥入口', Boolean(fertilizationEntry))
    if (!fertilizationEntry) {
      setClassification(report, 'FAIL_PRODUCT', '首页植物卡片未渲染施肥入口')
      return
    }
    await fertilizationEntry.tap()
    await sleep(500)
    page = await mp.currentPage()
    const fertilizationSheet = await waitForElement(page, 'plant-card-fertilization-sheet', 10000)
    const homeMonthlyTable = await findViewById(page, 'plant-card-fertilization-monthly-table')
    recordAssertion(report, '首页底部施肥弹框打开', Boolean(fertilizationSheet))
    recordAssertion(report, '首页弹框显示月度施肥表', Boolean(homeMonthlyTable))
    if (!fertilizationSheet || !homeMonthlyTable) {
      setClassification(report, 'FAIL_PRODUCT', '首页施肥弹框或月度表未渲染')
      return
    }
    const homeMonthlyText = await textOf(homeMonthlyTable)
    const homeMonthCount = Array.from({ length: 12 }, (_, index) => `${index + 1}月`).filter(
      month => homeMonthlyText.includes(month)
    ).length
    recordPageData(report, INDEX_PAGE, {
      fertilizationPopup: true,
      monthlyRowCount: homeMonthCount,
      tableText: homeMonthlyText
    })
    recordAssertion(
      report,
      '首页弹框包含 1—12 月',
      homeMonthCount === 12,
      `found ${homeMonthCount}/12 months`
    )
    recordAssertion(
      report,
      '首页弹框显示来源名称',
      homeMonthlyText.includes('数据来源：RHS、UMN Extension')
    )
    recordAssertion(
      report,
      '首页弹框不展示冗余适用范围和调整提示',
      !homeMonthlyText.includes('适用范围：') &&
        !homeMonthlyText.includes('该月不安排这类肥料的提醒')
    )
    recordAssertion(
      report,
      '首页弹框不展示内部证据字段',
      !/https?:\/\/|evidenceRef|sourceRefIds/.test(homeMonthlyText)
    )
    const popupScroll = await scrollFertilizationSheetToActions(mp)
    recordAssertion(
      report,
      '首页施肥弹框真实滚动到提醒操作区',
      popupScroll.scrollTop > 0,
      `scrollTop=${popupScroll.scrollTop}, scrollHeight=${popupScroll.scrollHeight}`
    )
    page = await mp.currentPage()
    const reminderSetup = await findViewById(page, 'fertilization-reminder-section')
    const reminderSetupText = reminderSetup ? await textOf(reminderSetup) : ''
    recordAssertion(
      report,
      '首页弹框底部固定展示施肥提醒入口',
      !reminderSetupText.includes('设置施肥提醒') && !reminderSetupText.includes('设置下次施肥提醒')
    )

    const reminderEntry = await findViewById(page, 'fertilization-reminder-entry-button')
    const reminderEntryText = await textOf(reminderEntry)
    recordAssertion(
      report,
      '首页弹框底部固定展示设置下次施肥提醒入口',
      Boolean(reminderEntry) && reminderEntryText.includes('设置下次施肥提醒')
    )
    if (reminderEntry) {
      await reminderEntry.tap()
      await sleep(300)
    }
    page = await mp.currentPage()
    const reminderSetupSheet = await waitForElement(
      page,
      'fertilization-reminder-setup-sheet',
      10000
    )
    const reminderOption = await findViewById(page, 'fertilization-reminder-option-liquid')
    const reminderPreviewButton = await findViewById(page, 'fertilization-reminder-preview-button')
    recordAssertion(report, '点击入口后打开选择肥料底部弹框', Boolean(reminderSetupSheet))
    recordAssertion(report, '选择肥料弹框只展示当前月的固定周期选项', Boolean(reminderOption))
    recordAssertion(report, '选择肥料弹框可继续请求提醒日期预览', Boolean(reminderPreviewButton))
    if (reminderPreviewButton) {
      await reminderPreviewButton.tap()
      await sleep(300)
      page = await mp.currentPage()
      const reminderPreview = await findViewById(page, 'fertilization-reminder-preview')
      const previewText = reminderPreview ? await textOf(reminderPreview) : ''
      recordAssertion(report, '施肥提醒显示提醒日期预览', Boolean(reminderPreview))
      recordAssertion(
        report,
        '施肥提醒预览使用当前提醒文案且不展示算法术语',
        /(首次确认提醒|下次施肥提醒)/u.test(previewText) &&
          !previewText.includes('算法') &&
          !previewText.includes('下次施肥日期')
      )
      await hideNativeModal(mp)
      await verifyFertilizationCalendarScenarios({
        mp,
        report,
        recordAssertion,
        readFixtureState: readFixtureFertilizationState,
        resetFixtureReminder: resetFixtureFertilizationReminder,
        fixtureSlot: FIXTURE_SLOT,
        plantId: FIXTURE_PLANT_ID
      })
    }
    const popupScreenshot = await safeScreenshot(mp, env.artifactDir, 'fertilization-monthly-popup')
    recordScreenshot(report, popupScreenshot)
    recordAssertion(report, '首页施肥弹框截图有效', Boolean(popupScreenshot))

    page = await mp.currentPage()
    const fertilizationClose = await findViewById(page, 'plant-card-fertilization-close-button')
    recordAssertion(report, '首页施肥弹框可关闭', Boolean(fertilizationClose))
    if (fertilizationClose) {
      await fertilizationClose.tap()
      await sleep(300)
    }
    page = await mp.currentPage()
    const homeCardForDetail = await findViewById(page, `index-plant-card-edit-${FIXTURE_PLANT_ID}`)
    recordAssertion(report, '关闭施肥弹框后首页植物卡片仍可定位', Boolean(homeCardForDetail))
    if (!homeCardForDetail) {
      setClassification(report, 'FAIL_PRODUCT', '关闭施肥弹框后无法重新定位首页植物卡片')
      return
    }
    await homeCardForDetail.tap()
    await sleep(800)
    page = await mp.currentPage()
    recordAssertion(
      report,
      '首页真实植物卡片入口可进入 user-plant-detail 路由',
      String(page?.path || '').includes(DETAIL_ROUTE)
    )
    recordPage(report, String(page?.path || ''))

    // 当前入口是 mode=edit；回到首页后再进入 mode=view，专门验证只读详情展示契约。
    page = await reLaunchTo(mp, INDEX_PAGE)
    recordPage(report, INDEX_PAGE)
    page = await reLaunchTo(mp, DETAIL_PAGE)
    recordPage(report, DETAIL_PAGE)
    await sleep(1000)

    const pageRoot = await waitForElement(page, 'user-plant-detail-page', 10000)
    const card = await findViewById(page, 'user-plant-detail-fertilization-card')
    const table = await findViewById(page, 'user-plant-detail-fertilization-monthly-table')
    recordAssertion(report, '植物详情页和施肥建议卡渲染', Boolean(pageRoot && card))
    recordAssertion(report, '已审核月度施肥表渲染', Boolean(table))
    if (!pageRoot || !card || !table) {
      setClassification(report, 'FAIL_PRODUCT', '施肥月度表详情页节点未渲染')
      return
    }

    const cardText = await textOf(card)
    const tableText = await textOf(table)
    const monthCount = Array.from({ length: 12 }, (_, index) => `${index + 1}月`).filter(month =>
      tableText.includes(month)
    ).length
    recordPageData(report, DETAIL_PAGE, {
      route: page?.path || '',
      monthlyRowCount: monthCount,
      cardText,
      tableText
    })
    recordAssertion(
      report,
      '月度表包含 1—12 月',
      monthCount === 12,
      `found ${monthCount}/12 months`
    )
    recordAssertion(report, '基础属级施肥间隔仍保留', cardText.includes('30-45天'))
    recordAssertion(report, '液体肥生长期规则正确显示', tableText.includes('每月1次'))
    recordAssertion(
      report,
      '停肥期规则正确显示',
      tableText.includes('暂停施肥') && tableText.includes('暂停追加')
    )
    recordAssertion(
      report,
      '缓释肥规则正确显示',
      tableText.includes('约3个月1次（长新叶或新芽时）')
    )
    recordAssertion(
      report,
      '表格底部总结显示全部来源且去重',
      tableText.includes('数据来源：RHS、UMN Extension')
    )
    recordAssertion(
      report,
      '详情页月度表显示适用范围和调整提示',
      tableText.includes('适用范围：温带室内盆栽参考（龟背竹属）') &&
        tableText.includes('该月不安排这类肥料的提醒')
    )
    recordAssertion(
      report,
      '用户侧不展示 URL、证据定位或内部字段',
      !/https?:\/\/|evidenceRef|sourceRefIds|Ongoing Care/.test(cardText)
    )

    let monthlyTableOffset = null
    try {
      monthlyTableOffset = await table.offset()
    } catch {
      monthlyTableOffset = null
    }
    const tableTop = Number(monthlyTableOffset?.top)
    const screenshotScrollTop =
      Number.isFinite(tableTop) && tableTop > 0 ? Math.max(0, Math.floor(tableTop - 120)) : 2200
    recordAssertion(
      report,
      '详情页滚动到施肥月度表位置',
      screenshotScrollTop > 0,
      `tableTop=${tableTop || 'unknown'}, scrollTop=${screenshotScrollTop}`
    )
    await mp.pageScrollTo(screenshotScrollTop)
    await sleep(DETAIL_SCREENSHOT_SETTLE_MS)
    page = await mp.currentPage()
    const settledDetailTable = await findViewById(
      page,
      'user-plant-detail-fertilization-monthly-table'
    )
    recordAssertion(report, '详情页滚动后月度表节点仍稳定', Boolean(settledDetailTable))
    const detailScreenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'fertilization-monthly-detail'
    )
    recordScreenshot(report, detailScreenshot)
    recordAssertion(report, '详情页月度表截图有效', Boolean(detailScreenshot))

    page = await reLaunchTo(mp, DETAIL_PAGE)
    recordPage(report, DETAIL_PAGE)
    const reenteredTable = await waitForElement(
      page,
      'user-plant-detail-fertilization-monthly-table',
      10000
    )
    recordAssertion(report, '再次进入详情页仍能显示月度施肥表', Boolean(reenteredTable))

    const requests = await readFixtureRequests(mp, FIXTURE_SLOT)
    recordRequests(report, requests)
    recordAssertion(
      report,
      '真实 wx.request 命中用户植物列表和详情接口夹具',
      requests.some(request => /plant-user-http\/user-plants(?:\?|$)/.test(request.url)) &&
        requests.some(request => /plant-user-http\/user-plants\?id=95001/.test(request.url)),
      requests.map(request => request.url).join(', ')
    )

    setClassification(report, 'PASS')
    report.business_assertions_reached = true
  } catch (error) {
    setClassification(report, 'BLOCKED_ENV', String(error?.message || error))
  } finally {
    if (fixtureInstalled) {
      try {
        await restoreFixture(mp, {
          userStoreKey: USER_STORE_KEY,
          queryKey: USER_PLANTS_QUERY_KEY,
          runtimeSlot: FIXTURE_SLOT
        })
      } catch (error) {
        setClassification(report, 'BLOCKED_ENV', String(error?.message || error))
      }
    }
    await safeDisconnect(mp)
    const reportPath = saveReport(report, env.artifactDir, `fertilization-monthly-${Date.now()}`)
    emitLeafReport(report)
    console.error(`[e2e] report: ${reportPath}`)
    if (report.classification !== 'PASS') {
      process.exitCode = 2
    }
  }
}

run().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
