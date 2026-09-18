import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const modulePath = require.resolve('../../../../../cloudfunctions/layer/utils/plant-knowledge.js')

function loadPlantKnowledge(runSQL = async () => ({ data: { executeResultList: [] } })) {
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

const plantKnowledge = loadPlantKnowledge()
const validAudit = {
  reviewStatus: 'audited',
  scopeLabel: '温带室内盆栽参考',
  scopeType: 'indoor',
  adjustmentMode: 'growth_signal',
  publicNote: '只在实际长新叶或新芽时继续施肥。',
  sourceRefs: [
    {
      id: 'source-a',
      name: 'RHS',
      url: 'https://example.com/internal-audit',
      evidenceRef: 'feeding section'
    },
    {
      id: 'source-b',
      name: 'UMN Extension',
      url: 'https://example.com/second-audit',
      evidenceRef: 'fertilizer section'
    }
  ],
  notes: '只在生长期施肥。',
  rows: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    liquid: { displayText: '每月1次', sourceRefIds: ['source-a', 'source-b'] },
    slowRelease: { displayText: '约2–3个月', sourceRefIds: ['source-a'] }
  }))
}

const mapped = plantKnowledge.mapFertilizationMonthly(validAudit)
assert.equal(mapped.available, true)
assert.deepEqual(mapped.rows[0].liquid.sourceNames, ['RHS', 'UMN Extension'])
assert.deepEqual(mapped.rows[0].slowRelease.sourceNames, ['RHS'])
assert.equal(mapped.rows[0].slowRelease.displayText, '约2–3个月')
assert.deepEqual(mapped.sourceNames, ['RHS', 'UMN Extension'])
assert.equal(mapped.scopeLabel, '温带室内盆栽参考')
assert.equal(mapped.scopeGuidance, '月份仅作参考；不长新叶或新芽时暂停。')
assert.doesNotMatch(mapped.scopeGuidance, /暂停施肥|暂停追加/)
assert.equal(mapped.choiceGuidance, '液体肥和缓释肥选一种，不要同时使用。')
assert.equal(mapped.publicNote, '只在实际长新叶或新芽时继续施肥。')
assert.doesNotMatch(JSON.stringify(mapped), /只在生长期施肥|notes/)
assert.doesNotMatch(JSON.stringify(mapped), /https?:\/\//)
assert.doesNotMatch(JSON.stringify(mapped), /evidenceRef|sourceRefIds/)

const pauseMapped = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  adjustmentMode: 'phenology',
  rows: validAudit.rows.map((row, index) =>
    index === 0
      ? {
          ...row,
          liquid: { displayText: '暂停施肥', sourceRefIds: ['source-a'] },
          slowRelease: { displayText: '暂停追加', sourceRefIds: ['source-b'] }
        }
      : row
  )
})
assert.match(pauseMapped.scopeGuidance, /表中标为“暂停施肥”或“暂停追加”时/)
assert.match(pauseMapped.scopeGuidance, /该月不安排这类肥料的提醒/)

const missingScope = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  scopeLabel: ''
})
assert.equal(missingScope.available, true)
assert.equal(missingScope.scopeLabel, '')

const missingScopeContract = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  adjustmentMode: ''
})
assert.equal(missingScopeContract.available, false)

const filteredNonInterval = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  rows: validAudit.rows.map(row => ({
    ...row,
    slowRelease: { displayText: '按产品标签', sourceRefIds: ['source-a'] }
  }))
})
assert.equal(filteredNonInterval.available, true)
assert.equal(filteredNonInterval.rows[0].slowRelease, null)
assert.deepEqual(filteredNonInterval.sourceNames, ['RHS', 'UMN Extension'])

const eventRuleMapped = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  rows: validAudit.rows.map(row => ({
    ...row,
    slowRelease: {
      displayText: '定植或生长期初施1次，勿与液肥叠加',
      sourceRefIds: ['source-a'],
      schedule: {
        schemaVersion: 1,
        kind: 'event',
        eventCode: 'planting_or_growth_start',
        interval: null,
        annualCount: null,
        monthHints: null,
        conditionCodes: ['active_growth'],
        modifiers: ['exclusive_with_liquid']
      }
    }
  }))
})
assert.equal(eventRuleMapped.available, true)
assert.equal(eventRuleMapped.rows[0].slowRelease.displayText, '定植或生长期初施1次，勿与液肥叠加')
assert.equal(eventRuleMapped.rows[0].slowRelease.schedule.kind, 'event')

const explicitStatuses = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  rows: validAudit.rows.map(row => ({
    ...row,
    liquid: { displayText: '不向水体加入液体肥', sourceRefIds: ['source-a'] },
    slowRelease: {
      displayText: '不建议额外追加，先检查水体养分和藻类风险',
      sourceRefIds: ['source-b']
    }
  }))
})
assert.equal(explicitStatuses.available, true)
assert.equal(explicitStatuses.rows[0].liquid.displayText, '不向水体加入液体肥')
assert.equal(
  explicitStatuses.rows[0].slowRelease.displayText,
  '不建议额外追加，先检查水体养分和藻类风险'
)

const explicitIntervals = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  rows: validAudit.rows.map(row => ({
    ...row,
    liquid: { displayText: '每3–4个月1次', sourceRefIds: ['source-a'] },
    slowRelease: { displayText: '每年1–2次', sourceRefIds: ['source-b'] }
  }))
})
assert.equal(explicitIntervals.available, true)
assert.equal(explicitIntervals.rows[0].liquid.displayText, '每3–4个月1次')
assert.equal(explicitIntervals.rows[0].slowRelease.displayText, '每年1–2次')

const singleApproximateInterval = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  rows: validAudit.rows.map(row => ({
    ...row,
    slowRelease: { displayText: '约3个月1次', sourceRefIds: ['source-a'] }
  }))
})
assert.equal(singleApproximateInterval.available, true)
assert.equal(singleApproximateInterval.rows[0].slowRelease.displayText, '约3个月1次')

const fullyFiltered = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  rows: validAudit.rows.map(row => ({
    ...row,
    liquid: { displayText: '按产品标签', sourceRefIds: ['source-a'] },
    slowRelease: { displayText: '按产品标签', sourceRefIds: ['source-a'] }
  }))
})
assert.equal(fullyFiltered.available, false)

for (const reviewStatus of ['unsupported', 'conflict', 'pending']) {
  const hidden = plantKnowledge.mapFertilizationMonthly({
    ...validAudit,
    reviewStatus
  })
  assert.equal(hidden.available, false)
  assert.deepEqual(hidden.rows, [])
  assert.equal(hidden.scopeLabel, '')
  assert.equal(hidden.scopeGuidance, '')
  assert.equal(hidden.publicNote, '')
}

const missingSource = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  rows: validAudit.rows.map((row, index) =>
    index === 4 ? { ...row, liquid: { displayText: '每月1次', sourceRefIds: [] } } : row
  )
})
assert.equal(missingSource.available, false)

const missingAuditEvidence = plantKnowledge.mapFertilizationMonthly({
  ...validAudit,
  sourceRefs: [{ ...validAudit.sourceRefs[0], evidenceRef: '' }, validAudit.sourceRefs[1]]
})
assert.equal(missingAuditEvidence.available, false)

const catalogSql = []
const catalogKnowledge = loadPlantKnowledge(async sql => {
  catalogSql.push(sql)
  return {
    data: {
      executeResultList: [
        {
          plant_identity_id: 'plant-1',
          session_plant_id: 'green-radish-session',
          primary_display_name: '绿萝',
          scientific_name: 'Epipremnum aureum',
          genus_name: 'Epipremnum',
          fertilizing_monthly_strategy_json: validAudit
        }
      ]
    }
  }
})
const catalogPlant = await catalogKnowledge.getPlantCatalogById('plant-1')
assert.equal(catalogPlant.fertilizationMonthly.available, true)
assert.equal(catalogPlant.canonicalName, '绿萝')
assert.equal(catalogPlant.genus, 'Epipremnum')
assert.ok(catalogSql[0].includes('gcp.fertilizing_monthly_strategy_json'))

const userPlantKnowledge = loadPlantKnowledge(async sql => {
  if (sql.includes('FROM user_plant_instances up')) {
    return {
      data: {
        executeResultList: [
          {
            id: 101,
            plant_id: 'plant-1',
            canonical_name: '龟背竹',
            plant_identity_id: 'plant-1',
            session_plant_id: 'plant-1'
          }
        ]
      }
    }
  }
  if (sql.includes('FROM user_watering_events')) {
    return { data: { executeResultList: [] } }
  }
  return {
    data: {
      executeResultList: [
        {
          plant_identity_id: 'plant-1',
          session_plant_id: 'plant-1',
          primary_display_name: '龟背竹',
          scientific_name: 'Monstera deliciosa',
          genus_name: 'Monstera',
          fertilizing_monthly_strategy_json: validAudit
        }
      ]
    }
  }
})
const userPlant = await userPlantKnowledge.getUserPlantInstanceById('openid-1', 101)
assert.equal(userPlant.fertilizationMonthly.available, true)

const listPlantKnowledge = loadPlantKnowledge(async sql => {
  if (sql.includes('COUNT(*) AS total')) {
    return { data: { executeResultList: [{ total: 1 }] } }
  }
  if (sql.includes('FROM user_plant_instances up')) {
    return {
      data: {
        executeResultList: [
          {
            id: 6,
            plant_id: 'green-radish-session',
            canonical_name: '绿萝',
            plant_identity_id: 'green-radish-identity',
            session_plant_id: 'green-radish-session'
          }
        ]
      }
    }
  }
  return {
    data: {
      executeResultList: [
        {
          plant_identity_id: 'green-radish-identity',
          session_plant_id: 'green-radish-session',
          primary_display_name: '绿萝',
          scientific_name: 'Epipremnum aureum',
          genus_name: 'Epipremnum',
          fertilizing_monthly_strategy_json: validAudit
        }
      ]
    }
  }
})
const listedPlants = await listPlantKnowledge.listUserPlantInstances('openid-1')
assert.equal(listedPlants.list[0].displayName, '绿萝')
assert.equal(listedPlants.list[0].genus, 'Epipremnum')
assert.equal(listedPlants.list[0].fertilizationMonthly.available, true)

console.log('plant knowledge fertilization monthly mapping tests passed')
