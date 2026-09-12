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
 *   - ID 收集使用 `[id]`，覆盖 view/button/input 以及带 automation id 的
 *     自定义组件根节点（例如 plant-select-card）。
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
const NATIVE_INTERACTIVE_TAGS = new Set([
  'view',
  'button',
  'input',
  'textarea',
  'scroll-view',
  'swiper'
])
const PAGE_COMPONENT_SCOPE_CACHE = new WeakMap()

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
 * 按 selector 查询所有匹配元素。
 */
async function safeQueryAll(page, selector) {
  try {
    const list = await page.$$(selector)
    if (Array.isArray(list) && list.length > 0) return list
  } catch (e) {}
  return []
}

function attributeSelector(operator, value) {
  const slash = '\\'
  const quote = '"'
  const escaped = String(value)
    .replaceAll(slash, `${slash}${slash}`)
    .replaceAll(quote, `${slash}${quote}`)
  return `[id${operator}"${escaped}"]`
}

async function collectScopedMatches(page, selectors, { limit = Number.POSITIVE_INFINITY } = {}) {
  const results = []
  const seen = new Set()
  const scopes = [page, ...(await safeQueryAll(page, 'component'))]
  for (const scope of scopes) {
    for (const selector of selectors) {
      for (const element of await safeQueryAll(scope, selector)) {
        try {
          const id = await element.attribute('id')
          if (!id || seen.has(`${id}:${String(element.tagName || '')}`)) continue
          seen.add(`${id}:${String(element.tagName || '')}`)
          results.push({ element, id, tag: String(element.tagName || '').toLowerCase() })
          if (results.length >= limit) return results
        } catch {
          // A component may finish re-rendering between selector resolution and attribute access.
        }
      }
    }
  }
  return results
}

async function findScopedMatch(page, selectors, matches) {
  const scopes = [page, ...(await safeQueryAll(page, 'component'))]
  for (const scope of scopes) {
    for (const selector of selectors) {
      for (const element of await safeQueryAll(scope, selector)) {
        try {
          const id = await element.attribute('id')
          if (id && matches(id)) {
            return { element, id, tag: String(element.tagName || '').toLowerCase() }
          }
        } catch {
          // A component may finish re-rendering between selector resolution and attribute access.
        }
      }
    }
  }
  return null
}

function idNamespace(id) {
  const parts = String(id || '').split('-').filter(Boolean)
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}-` : ''
}

function usesNestedComponentScope(namespace) {
  return namespace === 'watering-reminder-'
}

function pageScopeCache(page) {
  let cache = PAGE_COMPONENT_SCOPE_CACHE.get(page)
  if (!cache) {
    cache = new Map()
    PAGE_COMPONENT_SCOPE_CACHE.set(page, cache)
  }
  return cache
}

async function findIdInScope(scope, id) {
  const selectors = [attributeSelector('=', id), attributeSelector('$=', `--${id}`)]
  for (const selector of selectors) {
    for (const element of await safeQueryAll(scope, selector)) {
      try {
        const actualId = await element.attribute('id')
        if (matchesStableId(actualId, id)) return element
      } catch {
        // The scope may have re-rendered while DevTools resolved the selector.
      }
    }
  }
  return null
}

async function scopeHasNamespace(scope, namespace) {
  if (!namespace) return false
  for (const selector of [attributeSelector('^=', namespace), attributeSelector('*=', `--${namespace}`)]) {
    if ((await safeQueryAll(scope, selector)).length > 0) return true
  }
  return false
}

async function findIdInNestedComponents(scope, id, depth = 5) {
  if (depth <= 0) return null
  for (const child of await safeQueryAll(scope, 'component')) {
    const direct = await findIdInScope(child, id)
    if (direct) return direct
    const nested = await findIdInNestedComponents(child, id, depth - 1)
    if (nested) return nested
  }
  return null
}

async function findNamespaceOwnerScope(page, namespace) {
  if (!usesNestedComponentScope(namespace)) return null
  const cache = pageScopeCache(page)
  const cachedScope = cache.get(namespace)
  if (cachedScope && (await scopeHasNamespace(cachedScope, namespace))) {
    return cachedScope
  }
  cache.delete(namespace)
  for (const scope of await safeQueryAll(page, 'component')) {
    if (await scopeHasNamespace(scope, namespace)) {
      cache.set(namespace, scope)
      return scope
    }
  }
  return null
}

async function findPrefixInNestedComponents(scope, prefix, depth = 5) {
  const selectors = [attributeSelector('^=', prefix), attributeSelector('*=', `--${prefix}`)]
  for (const selector of selectors) {
    for (const element of await safeQueryAll(scope, selector)) {
      try {
        const id = await element.attribute('id')
        if (matchesStableIdPrefix(id, prefix)) {
          return { element, id, tag: String(element.tagName || '').toLowerCase() }
        }
      } catch {
        // The scope may have re-rendered while DevTools resolved the selector.
      }
    }
  }
  if (depth <= 0) return null
  for (const child of await safeQueryAll(scope, 'component')) {
    const nested = await findPrefixInNestedComponents(child, prefix, depth - 1)
    if (nested) return nested
  }
  return null
}

async function collectPrefixInNestedComponents(scope, prefix, { limit, depth = 5 } = {}) {
  const results = []
  const seen = new Set()
  const selectors = [attributeSelector('^=', prefix), attributeSelector('*=', `--${prefix}`)]
  const visit = async (current, remainingDepth) => {
    for (const selector of selectors) {
      for (const element of await safeQueryAll(current, selector)) {
        try {
          const id = await element.attribute('id')
          if (!id || !matchesStableIdPrefix(id, prefix) || seen.has(id)) continue
          seen.add(id)
          results.push({ element, id, stableId: extractStableId(id) })
          if (results.length >= limit) return true
        } catch {
          // The scope may have re-rendered while DevTools resolved the selector.
        }
      }
    }
    if (remainingDepth <= 0) return false
    for (const child of await safeQueryAll(current, 'component')) {
      if (await visit(child, remainingDepth - 1)) return true
    }
    return false
  }
  await visit(scope, depth)
  return results
}

async function findIdInComponentTree(page, id) {
  const namespace = idNamespace(id)
  const cache = pageScopeCache(page)
  const cachedScope = cache.get(namespace)
  if (cachedScope) {
    const cached = (await findIdInScope(cachedScope, id)) ||
      (await findIdInNestedComponents(cachedScope, id))
    if (cached) return cached
    cache.delete(namespace)
  }

  const namespaceOwner = await findNamespaceOwnerScope(page, namespace)
  if (namespaceOwner) {
    const nested = (await findIdInScope(namespaceOwner, id)) ||
      (await findIdInNestedComponents(namespaceOwner, id))
    if (nested) return nested
  }

  for (const scope of await safeQueryAll(page, 'component')) {
    const direct = await findIdInScope(scope, id)
    if (direct) return direct
    if (namespace && (await scopeHasNamespace(scope, namespace))) {
      cache.set(namespace, scope)
      const nested = await findIdInNestedComponents(scope, id)
      if (nested) return nested
    }
  }
  return null
}

/**
 * 收集页面所有带 id 的元素。
 * @returns {Promise<Array<{element: object, id: string}>>}
 */
async function collectAllElementsWithId(page) {
  return collectScopedMatches(page, ['[id]'])
}

function isNativeInteractiveElement(element) {
  return NATIVE_INTERACTIVE_TAGS.has(String(element?.tagName || '').toLowerCase())
}

/**
 * 点击稳定 ID 命中的节点。自定义组件根节点通常不接收 Automator tap，
 * 但其内部第一个原生 view 才承载 click；优先下钻到该节点，原生节点则
 * 直接点击。
 */
export async function tapStableElement(element) {
  if (!element) return false
  if (isNativeInteractiveElement(element)) {
    await element.tap()
    return true
  }
  for (const selector of ['view', 'button']) {
    const descendants = await element.$$(selector).catch(() => [])
    if (descendants?.[0]) {
      await descendants[0].tap()
      return true
    }
  }
  await element.tap()
  return true
}

/**
 * 按稳定 ID 定位元素。优先精确 ID；同一 ID 同时出现在自定义组件根节点
 * 与内部原生节点时，优先返回可触发事件的原生节点。
 * 精确匹配优先；精确找不到时兼容构建前缀 `<scopeId>--<stableId>`。
 */
export async function findViewById(page, id) {
  // 优先 page.$('#id')（精确 ID 选择器）
  let exact = null
  try {
    exact = await page.$(`#${id}`)
    if (exact && isNativeInteractiveElement(exact)) return exact
  } catch (e) {}

  const componentTreeMatch = await findIdInComponentTree(page, id)
  if (componentTreeMatch) return componentTreeMatch

  const scopedExact = await findScopedMatch(page, [attributeSelector('=', id)], value => value === id)
  if (scopedExact) return scopedExact.element

  const scopedPrefixed = await findScopedMatch(
    page,
    [attributeSelector('$=', `--${id}`)],
    value => matchesStableId(value, id)
  )
  if (scopedPrefixed) return scopedPrefixed.element

  // 回退：遍历所有元素，精确匹配或构建前缀匹配
  const all = await collectAllElementsWithId(page)
  let fallback = exact
  for (const { element, id: attr } of all) {
    if (!matchesStableId(attr, id)) continue
    if (!fallback) fallback = element
    if (isNativeInteractiveElement(element)) return element
  }
  return fallback
}

/**
 * 按 ID 前缀定位元素（如 plant-card-reminder-{id}-water）。
 * 返回 { element, id, stableId } 或 null。
 * 兼容构建前缀：`<scopeId>--<prefix>...`
 */
export async function findByIdPrefix(page, prefix) {
  const namespace = idNamespace(prefix)
  const namespaceOwner = await findNamespaceOwnerScope(page, namespace)
  if (namespaceOwner) {
    const nested = await findPrefixInNestedComponents(namespaceOwner, prefix)
    if (nested) {
      return { element: nested.element, id: nested.id, stableId: extractStableId(nested.id) }
    }
  }
  const scoped = await findScopedMatch(page, [
    attributeSelector('^=', prefix),
    attributeSelector('*=', `--${prefix}`)
  ], value => matchesStableIdPrefix(value, prefix))
  if (scoped) {
    return { element: scoped.element, id: scoped.id, stableId: extractStableId(scoped.id) }
  }
  const all = await collectAllElementsWithId(page)
  let fallback = null
  for (const { element, id: attr } of all) {
    if (matchesStableIdPrefix(attr, prefix)) {
      const match = { element, id: attr, stableId: extractStableId(attr) }
      if (!fallback) fallback = match
      if (isNativeInteractiveElement(element)) return match
    }
  }
  return fallback
}

/**
 * 按 ID 前缀和后缀定位元素（如 plant-card-reminder-{id}-water）。
 * 返回 { element, id, stableId, extractedId } 或 null。
 * 兼容构建前缀：先提取稳定 ID，再按 prefix/suffix 切割中间动态部分。
 */
export async function findByIdPrefixAndSuffix(page, prefix, suffix) {
  const namespace = idNamespace(prefix)
  const namespaceOwner = await findNamespaceOwnerScope(page, namespace)
  if (namespaceOwner) {
    const nested = await findPrefixInNestedComponents(namespaceOwner, prefix)
    if (nested) {
      const stableId = extractStableId(nested.id)
      if (stableId.endsWith(suffix)) {
        return {
          element: nested.element,
          id: nested.id,
          stableId,
          extractedId: stableId.slice(prefix.length, stableId.length - suffix.length)
        }
      }
    }
  }
  const scoped = await findScopedMatch(page, [
    attributeSelector('^=', prefix),
    attributeSelector('*=', `--${prefix}`)
  ], value => {
    const stable = extractStableId(value)
    return stable.startsWith(prefix) && stable.endsWith(suffix)
  })
  if (scoped) {
    const stableId = extractStableId(scoped.id)
    return {
      element: scoped.element,
      id: scoped.id,
      stableId,
      extractedId: stableId.slice(prefix.length, stableId.length - suffix.length)
    }
  }
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
export async function collectByIdPrefix(page, prefix, { limit = Number.POSITIVE_INFINITY } = {}) {
  const results = []
  const namespace = idNamespace(prefix)
  const namespaceOwner = await findNamespaceOwnerScope(page, namespace)
  if (namespaceOwner) {
    return collectPrefixInNestedComponents(namespaceOwner, prefix, { limit })
  }
  let all = await collectScopedMatches(
    page,
    [attributeSelector('^=', prefix), attributeSelector('*=', `--${prefix}`)],
    { limit }
  )
  if (!all.length) {
    all = await collectAllElementsWithId(page)
  }
  for (const { element, id: attr } of all) {
    if (matchesStableIdPrefix(attr, prefix)) {
      results.push({ element, id: attr, stableId: extractStableId(attr) })
      if (results.length >= limit) break
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
  await tapStableElement(el)
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
 * 读取公开页面栈摘要；不得依赖 Vue setup/state 私有数据。
 */
export async function readPageDataSummary(mp) {
  const page = await mp.currentPage()
  return { route: page?.path || null, source: 'public_page_path' }
}
