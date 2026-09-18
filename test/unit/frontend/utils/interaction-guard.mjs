import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(path.join(repoRoot, 'src/utils/interaction-guard.js'), 'utf8')
const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)

const guard = module.createAsyncActionGuard()
let actionCalls = 0
let resolveAction
const first = guard.run(
  () =>
    new Promise(resolve => {
      actionCalls += 1
      resolveAction = resolve
    })
)
const duplicate = guard.run(() => {
  actionCalls += 1
})
assert.strictEqual(first, duplicate, '并发调用应复用同一个 Promise')
await Promise.resolve()
assert.equal(actionCalls, 1)
assert.equal(guard.isPending, true)
resolveAction('ok')
assert.equal(await first, 'ok')
await Promise.resolve()
assert.equal(guard.isPending, false)

await assert.rejects(
  guard.run(async () => {
    throw new Error('expected')
  }),
  /expected/
)
await Promise.resolve()
assert.equal(guard.isPending, false, '失败后 guard 也必须自动解锁')

const throttledCalls = []
const throttled = module.createLeadingThrottle(value => throttledCalls.push(value), 20)
throttled('first')
throttled('duplicate')
assert.deepEqual(throttledCalls, ['first'])
await new Promise(resolve => setTimeout(resolve, 25))
throttled('second')
assert.deepEqual(throttledCalls, ['first', 'second'])
throttled.cancel()
throttled('after-cancel')
assert.deepEqual(throttledCalls, ['first', 'second', 'after-cancel'])

const debouncedCalls = []
const debounced = module.createDebounced(value => debouncedCalls.push(value), 20)
debounced('old')
debounced('latest')
await new Promise(resolve => setTimeout(resolve, 25))
assert.deepEqual(debouncedCalls, ['latest'])
debounced('cancelled')
debounced.cancel()
await new Promise(resolve => setTimeout(resolve, 25))
assert.deepEqual(debouncedCalls, ['latest'])

console.log('interaction guard tests passed data_mode=unit_fake')
