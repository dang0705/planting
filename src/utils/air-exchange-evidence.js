// 空气环境评估：纯函数模块
// 仅判断室内外空气交换，不接入黄叶题包、诊断请求、CloudBase、数据库或 Pinia。
// 原始输入固定为 { source, windowDirectionCount, windowOpenFrequency }，初始均为 null。
// 公开输入只接受组件自己产生的闭集值；纯函数对未答或不完整开窗返回 null。

// 换气来源选项（source）；unknown 仅保留给历史资料，不再作为用户选项。
export const AIR_EXCHANGE_SOURCES = Object.freeze([
  { key: 'window', label: '窗户情况' },
  { key: 'fresh_air', label: '新风系统' }
])

// 开窗方向数量选项（仅 source === 'window' 时展示）；关闭窗户已并入频率。
export const WINDOW_DIRECTION_COUNT_OPTIONS = Object.freeze([
  { key: 'one', label: '一个' },
  { key: 'two_or_more', label: '两个及以上' }
])

// 开窗频率选项（仅 source === 'window' 时展示）
export const WINDOW_OPEN_FREQUENCY_OPTIONS = Object.freeze([
  { key: 'daily', label: '每天' },
  { key: 'every_other_day', label: '隔天' },
  { key: 'weekly_1_2', label: '每周 1–2 次' },
  { key: 'almost_never', label: '几乎不开（可选新风系统）' }
])

// 合法闭集值：组件只产生这些 key，纯函数据此判定
const VALID_SOURCE_KEYS = new Set(['window', 'fresh_air', 'unknown'])
const VALID_DIRECTION_COUNT_KEYS = new Set(['one', 'two_or_more', 'closed'])
const VALID_FREQUENCY_KEYS = new Set(['daily', 'every_other_day', 'weekly_1_2', 'almost_never'])

// 初始“尚未回答”状态：所有字段均为 null（不是 unknown）
export function createInitialAirExchangeInput() {
  return {
    source: null,
    windowDirectionCount: null,
    windowOpenFrequency: null
  }
}

// 判断是否已具备可完成的完整回答
// - 初始未答为 false
// - source === 'window' 选择一个 / 两个及以上方向时还需频率
// - fresh_air、unknown 可单独完成
export function isAirExchangeAnswerReady(value = {}) {
  const source = value?.source
  if (!VALID_SOURCE_KEYS.has(source)) {
    return false
  }
  if (source === 'window') {
    if (value?.windowDirectionCount === 'closed') {
      return true
    }
    return (
      VALID_DIRECTION_COUNT_KEYS.has(value?.windowDirectionCount) &&
      VALID_FREQUENCY_KEYS.has(value?.windowOpenFrequency)
    )
  }
  return true
}

// 生成分类结果：返回 { source, windowDirectionCount, windowOpenFrequency, level }
// - 未答或开窗信息不完整返回 null
// - 非 window 来源的 windowDirectionCount / windowOpenFrequency 固定为 null
// - unknown 返回 level=unknown
// - 双方向+每天为 high
// - 单方向+每天 或 任意方向+隔天 为 medium
// - 每周 1–2 次、几乎不开为 low
// - fresh_air 为 medium
function levelForWindow(windowDirectionCount, windowOpenFrequency) {
  if (['weekly_1_2', 'almost_never'].includes(windowOpenFrequency)) {
    return 'low'
  }
  if (windowDirectionCount === 'two_or_more' && windowOpenFrequency === 'daily') {
    return 'high'
  }
  // 单方向+每天 或 任意方向+隔天
  return 'medium'
}

function levelForSource(source) {
  return source === 'fresh_air' ? 'medium' : 'unknown'
}

export function resolveAirExchangeEvidence(value = {}) {
  if (!isAirExchangeAnswerReady(value)) {
    return null
  }
  const source = value.source
  if (source !== 'window') {
    return {
      source,
      windowDirectionCount: null,
      windowOpenFrequency: null,
      level: levelForSource(source)
    }
  }
  if (value.windowDirectionCount === 'closed') {
    return {
      source: 'window',
      windowDirectionCount: 'one',
      windowOpenFrequency: 'almost_never',
      level: 'low'
    }
  }
  return {
    source: 'window',
    windowDirectionCount: value.windowDirectionCount,
    windowOpenFrequency: value.windowOpenFrequency ?? null,
    level: levelForWindow(value.windowDirectionCount, value.windowOpenFrequency)
  }
}
