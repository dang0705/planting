'use strict'

import { reLaunchTo } from '../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  findViewById,
  waitForElement
} from '../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import {
  FIXTURE_PLANT_ID,
  FIXTURE_USER,
  INDEX_PAGE,
  REMINDER_PAGE,
  USER_PLANTS_QUERY_KEY,
  USER_STORE_KEY
} from './fertilization-test-fixtures.mjs'
import { installFixture, restoreFixture } from './fertilization-monthly-fixture.mjs'

const ENTRY_WAIT_MS = 10000
const SHEET_TRANSITION_MS = 500
const ZERO = 0
const BOTTOM_SCROLL_POSITION = 1
const POPUP_CONTENT_ID = 'plant-card-fertilization-sheet-content'
const CALCULATION_TOOLTIP_DISMISS_WAIT_MS = 350

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function textOf(element) {
  return String((await element?.text?.()) || '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function openFixtureFertilizationSheet({
  mp,
  runtimeSlot,
  plant,
  initialReminder = null,
  behavior = {},
  calendarMode = 'success',
  entry = 'index'
}) {
  const fixtureConfig = {
    user: FIXTURE_USER,
    plant,
    userStoreKey: USER_STORE_KEY,
    queryKey: USER_PLANTS_QUERY_KEY,
    runtimeSlot,
    initialReminder,
    behavior,
    calendarMode
  }
  let fixtureInstalled = false
  try {
    await installFixture(mp, fixtureConfig)
    fixtureInstalled = true
    const targetPage = entry === 'reminder' ? REMINDER_PAGE : INDEX_PAGE
    let page = await reLaunchTo(mp, targetPage)
    const entryId =
      entry === 'reminder'
        ? `reminder-tab-fertilization-${FIXTURE_PLANT_ID}`
        : `plant-card-fertilization-${FIXTURE_PLANT_ID}`
    const action = await waitForElement(page, entryId, ENTRY_WAIT_MS)
    if (!action) {
      throw new Error(`${entry} 入口未渲染施肥提醒按钮`)
    }
    await action.tap()
    await sleep(SHEET_TRANSITION_MS)
    page = await mp.currentPage()
    const sheet = await waitForElement(page, 'plant-card-fertilization-sheet', ENTRY_WAIT_MS)
    if (!sheet) {
      throw new Error(`${entry} 入口点击后未打开施肥弹框`)
    }
    return { page, fixtureConfig }
  } catch (error) {
    if (fixtureInstalled) {
      await restoreFixture(mp, fixtureConfig)
    }
    throw error
  }
}

export async function closeFixtureFertilizationSheet(mp) {
  const page = await mp.currentPage()
  const close = await findViewById(page, 'plant-card-fertilization-close-button')
  if (close) {
    await close.tap()
    await sleep(SHEET_TRANSITION_MS)
  }
}

export async function scrollFertilizationSheetToActions(mp) {
  const page = await mp.currentPage()
  const content = await waitForElement(page, POPUP_CONTENT_ID, ENTRY_WAIT_MS)
  if (!content) {
    throw new Error('施肥弹框缺少可滚动内容容器')
  }
  const viewport = await content.size()
  const scrollHeight = Number(await content.scrollHeight())
  const viewportHeight = Number(viewport?.height || ZERO)
  const isScrollable = scrollHeight > viewportHeight
  if (!isScrollable) {
    return {
      isScrollable,
      scrollHeight,
      scrollTop: ZERO,
      viewportHeight
    }
  }
  await content.scrollTo(ZERO, scrollHeight)
  await sleep(SHEET_TRANSITION_MS)
  const scrollTop = Number(await content.property('scrollTop'))
  if (!(scrollTop >= BOTTOM_SCROLL_POSITION)) {
    throw new Error(`施肥弹框滚动未生效：scrollTop=${scrollTop}`)
  }
  return { isScrollable, viewportHeight, scrollHeight, scrollTop }
}

export async function restoreFertilizationScenario(mp, fixtureConfig) {
  await restoreFixture(mp, fixtureConfig)
}

export async function waitForCurrentPageElement(mp, id) {
  const page = await mp.currentPage()
  return waitForElement(page, id, ENTRY_WAIT_MS)
}

export async function dismissFertilizationCalculationTooltip(mp) {
  const page = await mp.currentPage()
  const dismissLayer = await findViewById(
    page,
    'fertilization-reminder-calculation-tooltip-dismiss-layer'
  )
  if (!dismissLayer) {
    return false
  }
  await dismissLayer.tap()
  await sleep(CALCULATION_TOOLTIP_DISMISS_WAIT_MS)
  return true
}
