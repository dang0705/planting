'use strict'

/**
 * 元素定位与交互辅助 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 优先按稳定 automation ID 定位元素（不以中文文案、坐标、脆弱层级为主）
 *   - 提供 findViewById / findButtonById / waitForElement
 *   - 提供 tap / input / readText 辅助
 *   - 提供 page data / store 摘要读取
 *
 * 不承载业务逻辑。
 */

const DEFAULT_WAIT_TIMEOUT_MS = 8000
const DEFAULT_POLL_INTERVAL_MS = 300

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 按稳定 ID 定位元素。优先 page.$('#id')，回退遍历 view/button。
 *
 * uni-app 自定义组件 scope 内 page.$('#id') 可能失效，
 * 回退用 page.$$('view') / page.$$('button') 遍历匹配 id 属性。
 */
export async function findViewById(page, id) {
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
  return null
}

/**
 * 按 ID 前缀定位元素（如 watering-advisor-plant-item-{id}）。
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
  return null
}

async function safeQueryAll(page, selector) {
  try {
    return (await page.$$(`#${selector}`)) || []
  } catch (e) {
    try {
      return (await page.$$(selector)) || []
    } catch (e2) {
      return []
    }
  }
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
 * 收集页面上所有匹配 ID 前缀的元素文本。
 */
export async function collectTextsByIdPrefix(page, prefix) {
  const results = []
  const views = await safeQueryAll(page, 'view')
  for (const v of views) {
    try {
      const attr = await v.attribute('id')
      if (attr && attr.startsWith(prefix)) {
        const text = await v.text()
        results.push({ id: attr, text })
      }
    } catch (e) {}
  }
  return results
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
    // 收集可能的 store 状态（不深拷贝大对象）
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
