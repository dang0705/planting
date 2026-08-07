'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const modulePath = require.resolve('../../../../../cloudfunctions/layer/utils/plant-knowledge.js')

function loadPlantKnowledge(runSQL) {
  const originalLoad = Module._load
  delete require.cache[modulePath]
  Module._load = function patchedCloudbaseLoad(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return { models: { $runSQL: runSQL } }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require('../../../../../cloudfunctions/layer/utils/plant-knowledge.js')
  } finally {
    Module._load = originalLoad
    delete require.cache[modulePath]
  }
}

const validRows = [
  { id: 1, canonical_name: '琴叶榕', created_at: '2026-07-27T10:00:00Z' },
  { id: 2, nickname: '阳台绿植', created_at: '2026-07-26T10:00:00Z' }
]

const invalidIdentityRows = [
  {},
  {
    plant_id: ' null ',
    plant_identity_id: 'undefined',
    session_plant_id: '',
    canonical_name: '  ',
    recognized_name: null,
    nickname: undefined
  }
]

for (const row of invalidIdentityRows) {
  const { hasDisplayableUserPlantIdentity } = loadPlantKnowledge(async () => ({
    data: { executeResultList: [] }
  }))
  assert.equal(hasDisplayableUserPlantIdentity(row), false)
}

const queryCalls = []
const plantKnowledge = loadPlantKnowledge(async (sql, params) => {
  queryCalls.push({ sql, params })
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\b/i, 'list read path must not mutate rows')
  if (/COUNT\(\*\) AS total/i.test(sql)) {
    return { data: { executeResultList: [{ total: validRows.length }] } }
  }
  if (/FROM user_plant_instances up/i.test(sql)) {
    const pageRows = validRows.slice(params.offset, params.offset + params.limit)
    return { data: { executeResultList: pageRows } }
  }
  throw new Error(`unexpected SQL: ${sql}`)
})

const firstPage = await plantKnowledge.listUserPlantInstances('dev_terminal_mp_local', {
  page: 1,
  pageSize: 1
})
assert.deepEqual(firstPage.list.map(row => row.id), [1])
assert.equal(firstPage.total, 2)
assert.equal(firstPage.hasMore, true)

const secondPage = await plantKnowledge.listUserPlantInstances('dev_terminal_mp_local', {
  page: 2,
  pageSize: 1
})
assert.deepEqual(secondPage.list.map(row => row.id), [2])
assert.equal(secondPage.total, 2)
assert.equal(secondPage.hasMore, false)

const listAndCountQueries = queryCalls.filter(call => /user_plant_instances/i.test(call.sql))
assert.equal(listAndCountQueries.length, 4)
for (const { sql } of listAndCountQueries) {
  assert.match(sql, /LOWER\(TRIM\(COALESCE\(up\.plant_id, ''\)\)\) NOT IN \('', 'null', 'undefined'\)/)
  assert.match(sql, /LOWER\(TRIM\(COALESCE\(up\.nickname, ''\)\)\) NOT IN \('', 'null', 'undefined'\)/)
}

console.log('user plant display identity tests passed')
