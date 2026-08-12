#!/usr/bin/env node
'use strict'

/* oxlint-disable no-console -- CLI leaf writes its artifact location and terminal failure. */

import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead
} from '../../care/watering/transpiration-v3/_shared/lib/env.mjs'
import {
  connectAutomator,
  AutomatorConnectError,
  safeDisconnect
} from '../../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  findViewById,
  tapStableElement
} from '../../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import { safeScreenshot } from '../../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import {
  createReport,
  emitLeafReport,
  recordAssertion,
  recordRequests,
  recordScreenshot,
  saveReport,
  setClassification
} from '../../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../../care/watering/transpiration-v3/_shared/lib/project-check.mjs'
import {
  closeFixtureFertilizationSheet,
  openFixtureFertilizationSheet,
  restoreFertilizationScenario,
  scrollFertilizationSheetToActions,
  textOf,
  waitForCurrentPageElement
} from '../../_shared/fertilization-reminder-e2e-helpers.mjs'
import { readFixtureFertilizationState } from '../../_shared/fertilization-reminder-fixture-state.mjs'
import {
  CONDITIONAL_SCHEDULE,
  EVENT_SCHEDULE,
  LIQUID_INTERVAL_SCHEDULE,
  PAUSE_SCHEDULE,
  createActiveReminder,
  createFertilizationMonthly,
  createFixturePlant,
  createMonthlyCell,
  createMonthlyRows
} from '../../_shared/fertilization-test-fixtures.mjs'

const FIXTURE_SLOT = '__e2eFertilizationReminderActionsFixtureV1'
const UI_WAIT_MS = 350
const CLI_ARGUMENT_START_INDEX = 2
const FAILURE_EXIT_CODE = 2
const ZERO = 0
const ONE = 1

class ProductAssertionError extends Error {}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assertCondition(report, name, condition, detail = null) {
  recordAssertion(report, name, Boolean(condition), detail)
  if (!condition) {
    throw new ProductAssertionError(`${name}${detail ? `: ${detail}` : ''}`)
  }
}

async function tapCurrent(mp, id) {
  const element = await waitForCurrentPageElement(mp, id)
  if (!element) {
    throw new ProductAssertionError(`未找到交互元素：${id}`)
  }
  await tapStableElement(element)
  await sleep(UI_WAIT_MS)
  return element
}

async function isDisabled(element) {
  try {
    return Boolean(await element.property('disabled'))
  } catch {
    return String((await element.attribute('disabled')) || '') === 'true'
  }
}

async function executeScenario(mp, report, name, options, verify) {
  let opened = null
  try {
    opened = await openFixtureFertilizationSheet({
      mp,
      runtimeSlot: `${FIXTURE_SLOT}_${name}`,
      ...options
    })
    const scroll = await scrollFertilizationSheetToActions(mp)
    assertCondition(
      report,
      `${name} 操作区在可见范围或已真实滚动到操作区`,
      !scroll.isScrollable || scroll.scrollTop > ZERO,
      `scrollTop=${scroll.scrollTop}, scrollHeight=${scroll.scrollHeight}, isScrollable=${scroll.isScrollable}`
    )
    await verify(opened)
    const fixtureState = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
    recordRequests(report, fixtureState?.requests || [])
    recordAssertion(report, name, true)
  } catch (error) {
    recordAssertion(report, name, false, String(error?.message || error))
    throw error
  } finally {
    if (opened) {
      await closeFixtureFertilizationSheet(mp)
      await restoreFertilizationScenario(mp, opened.fixtureConfig)
    }
  }
}

function monthlyWithCurrentRule(displayText, schedule) {
  return createFertilizationMonthly({
    rows: createMonthlyRows({
      currentCells: {
        liquid: createMonthlyCell(displayText, schedule),
        slowRelease: createMonthlyCell('暂停追加', PAUSE_SCHEDULE)
      }
    })
  })
}

async function verifyExtraConfirmation({ mp, report, opened, expectedText, expectedReason }) {
  const panel = await waitForCurrentPageElement(mp, 'fertilization-reminder-extra-confirmation')
  const complete = await waitForCurrentPageElement(mp, 'fertilization-reminder-complete-button')
  assertCondition(
    report,
    `${expectedReason} 会显示对应的额外确认说明`,
    Boolean(panel) && (await textOf(panel)).includes(expectedText)
  )
  assertCondition(report, `${expectedReason} 未确认前不能完成施肥`, await isDisabled(complete))
  await tapCurrent(mp, 'fertilization-reminder-extra-confirmation-checkbox')
  const enabledComplete = await waitForCurrentPageElement(
    mp,
    'fertilization-reminder-complete-button'
  )
  assertCondition(
    report,
    `${expectedReason} 勾选确认后允许记录施肥`,
    !(await isDisabled(enabledComplete))
  )
  await tapCurrent(mp, 'fertilization-reminder-complete-button')
  const state = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
  assertCondition(
    report,
    `${expectedReason} 完成操作写入真实施肥记录请求`,
    state?.completedPlans?.length === ONE && state.completedPlans[ZERO].extraConfirmation === true
  )
}

async function run() {
  const env = resolveEnv(process.argv.slice(CLI_ARGUMENT_START_INDEX))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'fertilization-reminder-actions',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null

  try {
    const projectCheck = preflightProject(env.projectPath)
    if (!projectCheck.ok) {
      setClassification(report, 'BLOCKED_ENV', projectCheck.reason)
      return
    }
    try {
      mp = await connectAutomator(env.wsEndpoint)
    } catch (error) {
      const reason =
        error instanceof AutomatorConnectError ? error.reason : String(error?.message || error)
      setClassification(report, 'BLOCKED_ENV', `automator connect failed: ${reason}`)
      return
    }

    await executeScenario(
      mp,
      report,
      '到期正常提醒记录施肥并生成下一次待确认预览',
      {
        plant: createFixturePlant(),
        initialReminder: createActiveReminder({ isDue: true }),
        behavior: {
          nextPreviewAfterComplete: {
            planId: 'fixture-next-preview-95001',
            reminderKind: 'normal',
            nextCheckDate: '2026-09-22',
            nextTime: '2026-09-22T09:00:00',
            dueNow: false,
            ruleSnapshot: { displayText: '每月1次', schedule: LIQUID_INTERVAL_SCHEDULE }
          }
        }
      },
      async opened => {
        const stateText = await textOf(
          await waitForCurrentPageElement(mp, 'fertilization-reminder-saved-state')
        )
        assertCondition(
          report,
          '到期正常提醒显示当前月规则和完成操作',
          stateText.includes('本月规则：每月1次') &&
            Boolean(await waitForCurrentPageElement(mp, 'fertilization-reminder-complete-button'))
        )
        const screenshot = await safeScreenshot(
          mp,
          env.artifactDir,
          'fertilization-reminder-due-complete'
        )
        recordScreenshot(report, screenshot)
        assertCondition(report, '到期施肥操作截图有效', Boolean(screenshot))
        await tapCurrent(mp, 'fertilization-reminder-complete-button')
        const preview = await waitForCurrentPageElement(mp, 'fertilization-reminder-preview')
        const state = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
        assertCondition(
          report,
          '今天已施肥会记录完成日期并显示下一次待确认预览',
          state?.completedPlans?.length === ONE &&
            state.completedPlans[ZERO].fertilizerType === 'liquid' &&
            (await textOf(preview)).includes('下次施肥提醒')
        )
      }
    )

    await executeScenario(
      mp,
      report,
      '到期正常提醒允许本次跳过且不记录施肥',
      { plant: createFixturePlant(), initialReminder: createActiveReminder({ isDue: true }) },
      async opened => {
        await tapCurrent(mp, 'fertilization-reminder-dismiss-button')
        const state = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
        assertCondition(
          report,
          '本次跳过仅结束提醒不产生施肥记录',
          state?.completedPlans?.length === ZERO &&
            state?.dismissedPlans?.length === ONE &&
            state.dismissedPlans[ZERO].status === 'dismissed'
        )
      }
    )

    const extraConfirmationCases = [
      {
        reason: 'first_confirmation',
        text: '目前没有可靠的上次施肥日期',
        monthly: createFertilizationMonthly(),
        reminder: createActiveReminder({
          reminderKind: 'first_confirmation',
          isDue: true,
          requiresExtraConfirmation: true,
          confirmationReasons: ['first_confirmation']
        })
      },
      {
        reason: 'conditional_rule',
        text: '本月规则带有条件',
        monthly: monthlyWithCurrentRule('请在长出新叶后少量补充', CONDITIONAL_SCHEDULE),
        reminder: createActiveReminder({
          isDue: true,
          requiresExtraConfirmation: true,
          confirmationReasons: ['conditional_rule']
        })
      },
      {
        reason: 'event_rule',
        text: '本月规则对应特定生长事件',
        monthly: monthlyWithCurrentRule('换盆稳定后施1次', EVENT_SCHEDULE),
        reminder: createActiveReminder({
          isDue: true,
          requiresExtraConfirmation: true,
          confirmationReasons: ['event_rule']
        })
      },
      {
        reason: 'plant_health',
        text: '植物近期状态异常',
        monthly: createFertilizationMonthly(),
        reminder: createActiveReminder({
          isDue: true,
          requiresExtraConfirmation: true,
          confirmationReasons: ['plant_health']
        })
      },
      {
        reason: 'fertilizer_type_changed',
        text: '肥料类型与上次不同',
        monthly: createFertilizationMonthly(),
        reminder: createActiveReminder({
          isDue: true,
          requiresExtraConfirmation: true,
          confirmationReasons: ['fertilizer_type_changed']
        })
      }
    ]
    for (const scenario of extraConfirmationCases) {
      await executeScenario(
        mp,
        report,
        `到期 ${scenario.reason} 需要额外确认`,
        {
          plant: createFixturePlant({ fertilizationMonthly: scenario.monthly }),
          initialReminder: scenario.reminder
        },
        opened =>
          verifyExtraConfirmation({
            mp,
            report,
            opened,
            expectedText: scenario.text,
            expectedReason: scenario.reason
          })
      )
    }

    await executeScenario(
      mp,
      report,
      '暂停施肥月份不展示完成按钮但允许跳过',
      {
        plant: createFixturePlant({
          fertilizationMonthly: monthlyWithCurrentRule('暂停施肥', PAUSE_SCHEDULE)
        }),
        initialReminder: createActiveReminder({ isDue: true })
      },
      async opened => {
        const page = await mp.currentPage()
        const complete = await findViewById(page, 'fertilization-reminder-complete-button')
        const currentRule = await textOf(
          await waitForCurrentPageElement(mp, 'fertilization-reminder-current-month-rule')
        )
        assertCondition(
          report,
          '暂停月份不会诱导用户直接施肥',
          !complete && currentRule.includes('暂停施肥')
        )
        await tapCurrent(mp, 'fertilization-reminder-dismiss-button')
        const state = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
        assertCondition(
          report,
          '暂停月份跳过不会写入施肥记录',
          state?.completedPlans?.length === ZERO && state?.dismissedPlans?.length === ONE
        )
      }
    )

    await executeScenario(
      mp,
      report,
      '重新设置必须先确认已删除旧日历事件',
      { plant: createFixturePlant(), initialReminder: createActiveReminder() },
      async opened => {
        await tapCurrent(mp, 'fertilization-reminder-reconfigure-button')
        const acknowledgement = await waitForCurrentPageElement(
          mp,
          'fertilization-reminder-reconfigure'
        )
        const confirm = await waitForCurrentPageElement(
          mp,
          'fertilization-reminder-reconfigure-confirm'
        )
        assertCondition(
          report,
          '重新设置先解释旧日历需要用户自行删除且确认按钮禁用',
          (await textOf(acknowledgement)).includes('无法替你删除手机日历中的旧事件') &&
            (await isDisabled(confirm))
        )
        await tapCurrent(mp, 'fertilization-reminder-reconfigure-cancel')
        const closedAck = await findViewById(
          await mp.currentPage(),
          'fertilization-reminder-reconfigure'
        )
        assertCondition(report, '重新设置可以暂不处理而回到已保存状态', !closedAck)
        await tapCurrent(mp, 'fertilization-reminder-reconfigure-button')
        await tapCurrent(mp, 'fertilization-reminder-reconfigure-ack')
        await tapCurrent(mp, 'fertilization-reminder-reconfigure-confirm')
        const setup = await waitForCurrentPageElement(mp, 'fertilization-reminder-section')
        const state = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
        assertCondition(
          report,
          '确认删除旧日历后结束旧计划并重新开放设置',
          Boolean(setup) &&
            state?.dismissedPlans?.length === ONE &&
            state.dismissedPlans[ZERO].reason === 'reconfigure'
        )
      }
    )

    setClassification(report, 'PASS')
    report.business_assertions_reached = true
  } catch (error) {
    setClassification(
      report,
      error instanceof ProductAssertionError ? 'FAIL_PRODUCT' : 'BLOCKED_ENV',
      String(error?.message || error)
    )
  } finally {
    await safeDisconnect(mp)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `fertilization-reminder-actions-${Date.now()}`
    )
    emitLeafReport(report)
    console.error(`[e2e] report: ${reportPath}`)
    if (report.classification !== 'PASS') {
      process.exitCode = FAILURE_EXIT_CODE
    }
  }
}

run().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
