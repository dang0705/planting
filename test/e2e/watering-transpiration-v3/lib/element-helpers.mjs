'use strict'

/**
 * 元素定位与交互辅助 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 优先按稳定 automation ID 定位元素（不以中文文案、坐标、脆弱层级为主）
 *   - 提供 findViewById / findByIdPrefix / findByIdPrefixAndSuffix / collectByIdPrefix
 *   - 提供 tap / input / readText 辅助
 *   - 提供 page data / store 摘要读取
 *
 * 关键修复：
 *   - 构建后 ID 前缀兼容：uni-app 构建产物会为稳定 ID 加 scope 前缀，
 *     形如 `55d0b8b0--watering-advisor-search-input`。
 *     精确匹配优先；精确找不到时允许匹配 `^[A-Za-z0-9]+--<稳定ID>$`。
 *     只接受完整稳定 ID，不用中文文案、坐标或宽泛 contains。
 *   - safeQueryAll 直接使用正确标签 selector（view/button/input），
 *     不先查 #view/#button（那样永远返回空数组并短路）。
 *   - 空数组继续合法 fallback。
 *
 * 不承载业务逻辑。
 */

const DEFAULT_WAIT_TIMEOUT_MS = 8000
const DEFAULT_POLL_INTERVAL_MS = 300

/**
 * uni-app 构建前缀正则：^[A-Za-z0-9]+--<稳定ID>$
 * 前缀为 scopeId（hex 或字母数字），后跟 `--`，再跟完整稳定 ID。
 */
const UNI_SCOPE_PREFIX_RE = /^([A-Za-z0-9]+)--(.+)$/

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 判断 actualId 是否匹配稳定 ID（精确优先，兼容构建前缀）。
 * - 精确匹配: actualId === stableId
 * - 构建前缀: actualId === `<scopeId>--<stableId>`，且 scopeId 仅含字母数字
 *
 * @param {string|null|undefined} actualId 运行时元素 id 属性
 * @param {string} stableId 稳定 ID（不含构建前缀）
 * @returns {boolean}
 */
export function matchesStableId(actualId, stableId) {
  if (!actualId || typeof actualId !== 'string') return false
  if (actualId === stableId) return true
  const m = actualId.match(UNI_SCOPE_PREFIX_RE)
  if (m && m[2] === stableId) return true
  return false
}

/**
 * 判断 actualId 是否以稳定前缀开头（精确优先，兼容构建前缀）。
 * - 精确前缀: actualId.startsWith(prefix)
 * - 构建前缀: actualId === `<scopeId>--<prefix>...` 或 `<scopeId>--<prefix>`
 *
 * 用于 plant-card-reminder-{id}-water 这类动态前后缀 ID。
 *
 * @param {string|null|undefined} actualId
 * @param {string} prefix 稳定前缀（不含构建前缀）
 * @returns {boolean}
 */
export function matchesStableIdPrefix(actualId, prefix) {
  if (!actualId || typeof actualId !== 'string') return false
  if (actualId.startsWith(prefix)) return true
  const m = actualId.match(UNI_SCOPE_PREFIX_RE)
  if (m && m[2].startsWith(prefix)) return true
  return false
}

/**
 * 从实际 ID 提取稳定 ID（去除构建前缀）。
 * 若无构建前缀，原样返回。
 *
 * @param {string} actualId
 * @returns {string}
 */
export function extractStableId(actualId) {
  if (!actualId || typeof actualId !== 'string') return actualId
  const m = actualId.match(UNI_SCOPE_PREFIX_RE)
  if (m) return m[2]
  return actualId
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
 * 收集页面所有可交互元素（view/button/input）的 id 属性。
 * @returns {Promise<Array<{element: object, id: string}>>}
 */
async function collectAllElementsWithId(page) {
  const all = [
    ...(await safeQueryAll(page, 'view')),
    ...(await safeQueryAll(page, 'button')),
    ...(await safeQueryAll(page, 'input'))
  ]
  const results = []
  for (const el of all) {
    try {
      const attr = await el.attribute('id')
      if (attr) results.push({ element: el, id: attr })
    } catch (e) {}
  }
  return results
}

/**
 * 按稳定 ID 定位元素。优先 page.$('#id')，回退遍历 view/button/input。
 * 精确匹配优先；精确找不到时兼容构建前缀 `<scopeId>--<stableId>`。
 */
export async function findViewById(page, id) {
  // 优先 page.$('#id')（精确 ID 选择器）
  try {
    const el = await page.$(`#${id}`)
    if (el) return el
  } catch (e) {}

  // 回退：遍历所有元素，精确匹配或构建前缀匹配
  const all = await collectAllElementsWithId(page)
  for (const { element, id: attr } of all) {
    if (matchesStableId(attr, id)) return element
  }
  return null
}

/**
 * 按 ID 前缀定位元素（如 plant-card-reminder-{id}-water）。
 * 返回 { element, id, stableId } 或 null。
 * 兼容构建前缀：`<scopeId>--<prefix>...`
 */
export async function findByIdPrefix(page, prefix) {
  const all = await collectAllElementsWithId(page)
  for (const { element, id: attr } of all) {
    if (matchesStableIdPrefix(attr, prefix)) {
      return { element, id: attr, stableId: extractStableId(attr) }
    }
  }
  return null
}

/**
 * 按 ID 前缀和后缀定位元素（如 plant-card-reminder-{id}-water）。
 * 返回 { element, id, stableId, extractedId } 或 null。
 * 兼容构建前缀：先提取稳定 ID，再按 prefix/suffix 切割中间动态部分。
 */
export async function findByIdPrefixAndSuffix(page, prefix, suffix) {
  const all = await collectAllElementsWithId(page)
  for (const { element, id: attr } of all) {
    const stable = extractStableId(attr)
    if (!stable.startsWith(prefix) || !stable.endsWith(suffix)) continue
    const middle = stable.slice(prefix.length, stable.length - suffix.length)
    return { element, id: attr, stableId: stable, extractedId: middle }
  }
  return null
}

/**
 * 收集所有匹配 ID 前缀的元素。
 * 返回数组，每项含 { element, id, stableId }。
 * 兼容构建前缀。
 */
export async function collectByIdPrefix(page, prefix) {
  const results = []
  const all = await collectAllElementsWithId(page)
  for (const { element, id: attr } of all) {
    if (matchesStableIdPrefix(attr, prefix)) {
      results.push({ element, id: attr, stableId: extractStableId(attr) })
    }
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
