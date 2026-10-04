import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const trackerDirectory = path.dirname(fileURLToPath(import.meta.url))

test('H5 展示较全量快照更新的单票确认，且不冒充全量同步', async () => {
  const html = fs.readFileSync(path.join(trackerDirectory, 'index.html'), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/u)?.[1]
  assert.ok(script, '看板脚本应存在')

  const elements = new Map(['#notice', '#overall', '#modules'].map(id => [id, {}]))
  const data = {
    clickUpLastSyncedAt: '2026-09-27T15:39:29+08:00',
    clickUpTaskStatuses: { z8v0kmrp1w: 'review needed' },
    clickUpSingleTaskChecks: {
      z8v0kmrp1w: {
        status: 'done',
        confirmedAt: '2026-09-27T16:06:27+08:00',
        source: '用户确认并有此前单票回读'
      }
    },
    modules: [{
      id: 'plant-knowledge', name: '植物知识', progress: 100,
      tickets: [{ id: 'z8v0kmrp1w', title: '已发布植物身份公开搜索', progress: 100, status: 'done' }]
    }],
    overallProgress: { progress: 100, reported: 1, total: 1 }
  }
  const context = {
    document: { querySelector: id => elements.get(id) },
    fetch: async () => ({ json: async () => data }),
    window: { setInterval: () => 0 },
    Date,
    console
  }

  vm.runInNewContext(script, context)
  await new Promise(resolve => setImmediate(resolve))

  assert.match(elements.get('#modules').innerHTML, /ClickUp（单票已确认）：done/u)
  assert.match(elements.get('#notice').textContent, /2026-09-27T15:39:29\+08:00/u)
})
