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
assert.deepEqual(
  firstPage.list.map(row => row.id),
  [1]
)
assert.equal(firstPage.total, 2)
assert.equal(firstPage.hasMore, true)

const secondPage = await plantKnowledge.listUserPlantInstances('dev_terminal_mp_local', {
  page: 2,
  pageSize: 1
})
assert.deepEqual(
  secondPage.list.map(row => row.id),
  [2]
)
assert.equal(secondPage.total, 2)
assert.equal(secondPage.hasMore, false)

const listAndCountQueries = queryCalls.filter(call => /user_plant_instances/i.test(call.sql))
assert.equal(listAndCountQueries.length, 4)
for (const { sql } of listAndCountQueries) {
  assert.match(
    sql,
    /LOWER\(TRIM\(COALESCE\(up\.plant_id, ''\)\)\) NOT IN \('', 'null', 'undefined'\)/
  )
  assert.match(
    sql,
    /LOWER\(TRIM\(COALESCE\(up\.nickname, ''\)\)\) NOT IN \('', 'null', 'undefined'\)/
  )
}

const batchCalls = []
const batchKnowledge = loadPlantKnowledge(async (sql, params) => {
  batchCalls.push({ sql, params })
  return {
    data: {
      executeResultList: [
        {
          plant_identity_id: 'identity-a',
          session_plant_id: 'session-a',
          primary_display_name: '甲'
        },
        {
          plant_identity_id: 'identity-b',
          session_plant_id: 'shared-id',
          primary_display_name: '乙（session 优先）'
        },
        {
          plant_identity_id: 'shared-id',
          session_plant_id: 'session-c',
          primary_display_name: '丙（identity 兜底）'
        }
      ]
    }
  }
})
const batchMap = await batchKnowledge.getPlantCatalogByIds(['identity-a', 'shared-id'])
assert.equal(batchCalls.length, 1, '目录列表应只发起一次批量 SQL')
assert.match(batchCalls[0].sql, /plant_identity_id IN \(\{\{plantId0\}\},\s*\{\{plantId1\}\}\)/)
assert.match(batchCalls[0].sql, /session_plant_id IN \(\{\{plantId0\}\},\s*\{\{plantId1\}\}\)/)
assert.equal(batchMap.get('identity-a')?.canonicalName, '甲')
assert.equal(batchMap.get('shared-id')?.canonicalName, '乙（session 优先）')

const enrichmentCalls = []
const enrichedKnowledge = loadPlantKnowledge(async (sql, params) => {
  enrichmentCalls.push({ sql, params })
  if (/WITH paged_user_plants AS/i.test(sql)) {
    return {
      data: {
        executeResultList: [
          {
            id: 11,
            record_version: 1,
            plant_identity_id: 'identity-a',
            session_plant_id: 'session-a',
            canonical_name: '甲',
            nickname: '阳台甲',
            source_type: 'catalog',
            total_count: 2,
            health_status: 'attention',
            health_score: 0.6,
            catalog_plant_identity_id: 'identity-a',
            catalog_session_plant_id: 'session-a',
            catalog_primary_display_name: '甲',
            catalog_genus_name: '榕属',
            care_location_id: 301,
            care_openid: 'dev_terminal_mp_local',
            care_plant_id: 11,
            care_user_id: 'dev_terminal_mp_local',
            care_location_key: 'city:shanghai',
            care_city_name: '上海',
            care_latitude: 31.23,
            care_longitude: 121.47,
            care_weather_location: 'city:shanghai',
            care_source: 'manual_selected',
            watering_reminder_id: 401,
            watering_reminder_user_plant_id: 11,
            watering_reminder_plan_id: 'water-plan-1',
            watering_reminder_type: 'water',
            watering_reminder_status: 'active',
            watering_reminder_next_water_date: '2026-09-01',
            watering_reminder_next_time: '2026-09-01 09:00:00',
            fertilization_reminder_id: 501,
            fertilization_reminder_user_plant_id: 11,
            fertilization_reminder_plan_id: 'fert-plan-1',
            fertilization_reminder_status: 'active',
            fertilization_reminder_kind: 'normal',
            fertilization_reminder_next_check_date: '2026-09-01',
            fertilization_reminder_next_time: '2026-09-01 09:00:00'
          },
          {
            id: 12,
            record_version: 1,
            plant_identity_id: 'identity-b',
            session_plant_id: 'session-b',
            canonical_name: '乙',
            source_type: 'catalog',
            total_count: 2,
            health_status: 'healthy',
            health_score: 0.95,
            catalog_plant_identity_id: 'identity-b',
            catalog_session_plant_id: 'session-b',
            catalog_primary_display_name: '乙',
            catalog_genus_name: '榕属'
          }
        ]
      }
    }
  }
  if (/COUNT\(\*\) AS total/i.test(sql)) {
    return { data: { executeResultList: [{ total: 2 }] } }
  }
  throw new Error(`unexpected enrichment SQL: ${sql}`)
})

const enrichedPage = await enrichedKnowledge.listUserPlantInstances('dev_terminal_mp_local', {
  page: 1,
  pageSize: 2,
  includeEnrichments: true
})
assert.equal(enrichedPage.total, 2)
assert.equal(enrichedPage.list.length, 2)
assert.equal(enrichedPage.list[0].healthStatus, 'attention')
assert.equal(enrichedPage.list[0].healthScore, 0.6)
assert.equal(enrichedPage.list[0].__listEnrichment.careLocationRow.location_key, 'city:shanghai')
assert.equal(enrichedPage.list[0].__listEnrichment.wateringReminderRow.plan_id, 'water-plan-1')
assert.equal(enrichedPage.list[0].__listEnrichment.fertilizationReminderRow.plan_id, 'fert-plan-1')
assert.equal(enrichedPage.list[0].healthStatus, 'attention', '应保留 SQL 排序后的最新诊断记录')
assert.equal(
  enrichedPage.list[0].__listEnrichment.careLocationRow.location_key,
  'city:shanghai',
  '应保留 SQL 排序后的最新养护位置'
)
assert.equal(enrichedPage.list[1].__listEnrichment.careLocationRow, null)
assert.equal(
  enrichmentCalls.filter(call => /FROM user_plant_instances up/i.test(call.sql)).length,
  1,
  '非空列表基础查询应只发起一次带窗口总数的分页查询'
)
assert.equal(
  enrichmentCalls.filter(call => /FROM plant_identity_entities pie/i.test(call.sql)).length,
  1,
  '目录信息应在同一条富化查询中读取一次'
)
assert.match(enrichmentCalls[0].sql, /LEFT JOIN LATERAL/i)
for (const call of enrichmentCalls) {
  assert.doesNotMatch(call.sql, /watering_events_json|planner_result_json|calendar_payload_json/)
}

console.log('user plant display identity tests passed')
