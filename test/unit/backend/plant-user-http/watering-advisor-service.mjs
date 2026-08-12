'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const sqlCalls = []

Module._load = function loadWithCloudbaseStub(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async (sql, params) => {
          sqlCalls.push({ sql, params })
          if (sql.includes('SELECT')) {
            return {
              data: {
                executeResultList: [
                  {
                    id: 42,
                    catalog_plant_id: 'plant-1',
                    planner_result_json_text: JSON.stringify({ nextWaterDate: null })
                  }
                ]
              }
            }
          }
          return { data: { executeResultList: [] } }
        }
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  confirmAdvisorSessionWatered
} = require('../../../../cloudfunctions/plant-user-http/watering-advisor-service.js')
Module._load = originalLoad

const result = await confirmAdvisorSessionWatered('openid-1', {
  catalogPlantId: 'plant-1',
  wateredDate: '2026-08-09'
})

assert.equal(result.statusCode, 200)
assert.equal(result.data.confirmedWateredDate, '2026-08-09')
assert.equal(sqlCalls.length, 2)
assert.deepEqual(JSON.parse(sqlCalls[1].params.plannerResultJson), {
  nextWaterDate: null,
  confirmedWateredDate: '2026-08-09'
})

console.log('watering advisor confirmation service tests passed')
