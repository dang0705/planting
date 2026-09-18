import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  settleVisualRequestsWithPromptCacheWarmup
} = require('../../../../../cloudfunctions/diagnose-http/utils/visual-prompt-cache-warmup.js')

const warmupEvents = []
const warmedResults = await settleVisualRequestsWithPromptCacheWarmup(['leaf', 'soil'], {
  warmupFirst: true,
  execute: async (slot, index) => {
    warmupEvents.push(`start:${slot}`)
    await Promise.resolve()
    warmupEvents.push(`end:${slot}`)
    return { slot, index }
  }
})
assert.deepEqual(
  warmedResults.map(item => item.status),
  ['fulfilled', 'fulfilled']
)
assert.ok(warmupEvents.indexOf('end:leaf') < warmupEvents.indexOf('start:soil'))

const parallelEvents = []
await settleVisualRequestsWithPromptCacheWarmup(['leaf', 'soil'], {
  warmupFirst: false,
  execute: async slot => {
    parallelEvents.push(`start:${slot}`)
    await Promise.resolve()
    parallelEvents.push(`end:${slot}`)
  }
})
assert.ok(parallelEvents.indexOf('start:soil') < parallelEvents.indexOf('end:leaf'))

const recoveryEvents = []
const recoveredResults = await settleVisualRequestsWithPromptCacheWarmup(['leaf', 'soil'], {
  warmupFirst: true,
  execute: async slot => {
    recoveryEvents.push(`start:${slot}`)
    if (slot === 'leaf') {
      throw new Error('first_image_failed')
    }
    recoveryEvents.push(`end:${slot}`)
    return slot
  }
})
assert.deepEqual(
  recoveredResults.map(item => item.status),
  ['rejected', 'fulfilled']
)
assert.ok(recoveryEvents.indexOf('start:soil') > recoveryEvents.indexOf('start:leaf'))

console.log('visual prompt cache warmup tests passed')
