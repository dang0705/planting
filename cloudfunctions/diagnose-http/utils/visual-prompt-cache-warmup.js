'use strict'

const FIRST_INPUT_INDEX = 0
const REMAINING_INPUT_START_INDEX = 1
const MINIMUM_WARMUP_IMAGE_COUNT = 2

/**
 * 显式缓存只有首个请求结束后才可被后续请求命中。
 * 两图诊断先完成首图的静态提示词缓存建立，再并发执行余图；不支持显式缓存的 provider 保持原并发行为。
 */
function settleVisualRequestsWithPromptCacheWarmup(
  inputs = [],
  { warmupFirst = false, execute } = {}
) {
  if (typeof execute !== 'function') {
    throw new TypeError('visual_prompt_cache_warmup_requires_execute')
  }
  const list = Array.isArray(inputs) ? inputs : []
  const run = (input, index) => Promise.resolve().then(() => execute(input, index))

  if (!warmupFirst || list.length < MINIMUM_WARMUP_IMAGE_COUNT) {
    return Promise.allSettled(list.map(run))
  }

  return (async () => {
    const first = await Promise.allSettled([run(list[FIRST_INPUT_INDEX], FIRST_INPUT_INDEX)])
    const remaining = await Promise.allSettled(
      list
        .slice(REMAINING_INPUT_START_INDEX)
        .map((input, index) => run(input, index + REMAINING_INPUT_START_INDEX))
    )
    return [...first, ...remaining]
  })()
}

module.exports = {
  settleVisualRequestsWithPromptCacheWarmup
}
