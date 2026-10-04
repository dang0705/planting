import assert from 'node:assert/strict'
import test from 'node:test'

import { summarizeModulesProgress, summarizeTicketProgress } from './progress.mjs'

// 看板合同：所有任务进入分母，单票完成应能在总览看出变化。
test('总体进度保留一位小数并把未上报任务按零计入', () => {
  const modules = [{ tickets: [{ progress: 90 }, { progress: 100 }, { progress: null }] }]

  assert.deepEqual(summarizeModulesProgress(modules), {
    progress: 63.3,
    reported: 2,
    total: 3,
  })
})

test('完成一张任务后，总览的一位小数随之变化', () => {
  const before = [{ progress: 90 }, { progress: 0 }, { progress: 0 }]
  const after = [{ progress: 100 }, { progress: 0 }, { progress: 0 }]

  assert.equal(summarizeTicketProgress(before).progress, 30)
  assert.equal(summarizeTicketProgress(after).progress, 33.3)
})
