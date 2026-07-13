'use strict'

/**
 * 元素定位与交互辅助 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 优先按稳定 automation ID 定位元素（不以中文文案、坐标、脆弱层级为主）
 *   - 提供 findViewById / findByIdPrefix / waitForElement
 *   - 提供 tap / input / readText 辅助
 *   - 提供 page data / store 摘要读取
 *
 * 关键修复：
 *   - safeQueryAll 直接使用正确标签 selector（view/button/input），
 *     不先查 #view/#button（那样永远返回空数组并短路）。
 *   - 空数组继续合法 fallback。
 *
 * 不承载业务逻辑。
 */

const DEFAULT_WAIT_TIMEOUT_MS = 8000
const DEFAULT_POLL_INTERVAL_MS = 300

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 按标签 selector 查询所有匹配元素。
 * 直接使用标签名（view/button/input），不查 #view/#button。
 */
async function safeQueryAll(page, selector) {
  try {
    const list = await page.$$(selector)
    if (Array.isArray(list) && list.length > 0) return list
  } catch (e) {}
  return []
}

/**
 * 按稳定 ID 定位元素。优先 page.$('#id')，回退遍历 view/button/input。
 *
 * uni-app 自定义组件 scope 内 page.$('#id') 可能失效，
 * 回退用 page.$$('view') / page.$$('button') / page.$$('input') 遍历匹配 id 属性。
 */
export async function findViewById(page, id) {
  // 优先 page.$('#id')
  try {
    const el = await page.$(`#${id}`)
    if (el) return el
  } catch (e) {}

  // 回退：遍历 view
  const views = await safeQueryAll(page, 'view')
  for (const v of views) {
    try {
      const attr = await v.attribute('id')
      if (attr === id) return v
    } catch (e) {}
  }
  // 回退：遍历 button
  const buttons = await safeQueryAll(page, 'button')
  for (const b of buttons) {
    try {
      const attr = await b.attribute('id')
      if (attr === id) return b
    } catch (e) {}
  }
  // 回退：遍历 input
  const inputs = await safeQueryAll(page, 'input')
  for (const inp of inputs) {
    try {
      const attr = await inp.attribute('id')
      if (attr === id) return inp
    } catch (e) {}
  }
  return null
}

/**
 * 按 ID 前缀定位元素（如 plant-card-reminder-{id}-water）。
 * 返回 { element, id } 或 null。
 */
export async function findByIdPrefix(page, prefix) {
  const views = await safeQueryAll(page, 'view')
  for (const v of views) {
    try {
      const attr = await v.attribute('id')
      if (attr && attr.startsWith(prefix)) return { element: v, id: attr }
    } catch (e) {}
  }
  const buttons = await safeQueryAll(page, 'button')
  for (const b of buttons) {
    try {
      const attr = await b.attribute('id')
      if (attr && attr.startsWith(prefix)) return { element: b, id: attr }
    } catch (e) {}
  }
  const inputs = await safeQueryAll(page, 'input')
  for (const inp of inputs) {
    try {
      const attr = await inp.attribute('id')
      if (attr && attr.startsWith(prefix)) return { element: inp, id: attr }
    } catch (e) {}
  }
  return null
}

/**
 * 按 ID 前缀和后缀定位元素（如 plant-card-reminder-{id}-water）。
 * 返回 { element, id, plantId } 或 null。
 */
export async function findByIdPrefixAndSuffix(page, prefix, suffix) {
  const all = [
    ...(await safeQueryAll(page, 'view')),
    ...(await safeQueryAll(page, 'button')),
    ...(await safeQueryAll(page, 'input'))
  ]
  for (const el of all) {
    try {
      const attr = await el.attribute('id')
      if (!attr || !attr.startsWith(prefix) || !attr.endsWith(suffix)) continue
      const middle = attr.slice(prefix.length, attr.length - suffix.length)
      return { element: el, id: attr, extractedId: middle }
    } catch (e) {}
  }
  return null
}

/**
 * 收集所有匹配 ID 前缀的元素。
 */
export async function collectByIdPrefix(page, prefix) {
  const results = []
  const all = [
    ...(await safeQueryAll(page, 'view')),
    ...(await safeQueryAll(page, 'button')),
    ...(await safeQueryAll(page, 'input'))
  ]
  for (const el of all) {
    try {
      const attr = await el.attribute('id')
      if (attr && attr.startsWith(prefix)) {
        results.push({ element: el, id: attr })
      }
    } catch (e) {}
  }
  return results
}

/**
 * 等待元素出现，超时返回 null。
 */
export async function waitForElement(page, id, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const el = await findViewById(page, id)
    if (el) return el
    await sleep(DEFAULT_POLL_INTERVAL_MS)
  }
  return null
}

/**
 * 点击元素（按 ID）。
 */
export async function tapById(page, id) {
  const el = await findViewById(page, id)
  if (!el) {
    throw new Error(`element not found: #${id}`)
  }
  await el.tap()
  return el
}

/**
 * 在输入框输入文本（按 ID）。
 */
export async function inputById(page, id, text) {
  const el = await findViewById(page, id)
  if (!el) {
    throw new Error(`input not found: #${id}`)
  }
  await el.input(text)
  return el
}

/**
 * 读取元素文本（按 ID）。
 */
export async function readTextById(page, id) {
  const el = await findViewById(page, id)
  if (!el) return null
  try {
    const text = await el.text()
    return text
  } catch (e) {
    return null
  }
}

/**
 * 读取当前页面 data 摘要（通过 evaluate）。
 */
export async function readPageDataSummary(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const cp = pages[pages.length - 1]
    const vm = cp && cp.$vm
    if (!vm) return { hasVm: false }
    const summary = {
      hasVm: true,
      route: cp.route || cp.__route__ || null,
      dataKeys: Object.keys(cp.data || {})
    }
    try {
      const store = vm.plantStore || vm.pinia?.state?.value?.plant
      if (store) {
        summary.storeKeys = Object.keys(store)
        summary.hasPlants = !!store.hasPlants
        summary.plantsCount = store.userPlants ? store.userPlants.length : 0
      }
    } catch (e) {}
    return summary
  })
}
