'use strict'

import { waitForElement } from '../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'

const INDEX_PAGE = '/pages/index/index'
const ENTRY_WAIT_MS = 10000
const SHEET_TRANSITION_MS = 500
const ZERO = 0
const BOTTOM_SCROLL_POSITION = 1
const POPUP_CONTENT_ID = 'plant-card-fertilization-sheet-content'
const NATIVE_MODAL_WAIT_MS = 350
const NATIVE_MODAL_WAIT_TIMEOUT_MS = 5000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function textOf(element) {
  return String((await element?.text?.()) || '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function waitForPageText(
  page,
  expectedText,
  timeoutMs = NATIVE_MODAL_WAIT_TIMEOUT_MS
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const textNodes = await page.$$('text').catch(() => [])
    for (const node of textNodes) {
      if ((await textOf(node)).includes(expectedText)) {
        return true
      }
    }
    await sleep(100)
  }
  return false
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

export async function hideNativeModal(mp) {
  try {
    await mp.callWxMethod('hideModal')
  } catch {
    // WeChat DevTools does not expose a wx.hideModal API; a native Alert may
    // already be absent in the Automator page tree. Continue with the page flow.
  }
  await sleep(NATIVE_MODAL_WAIT_MS)
  return true
}

export { INDEX_PAGE }
