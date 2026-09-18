// data_mode=unit_fake; isolates the Agent client-tool allowlist and public result shape.
// Expected: deployed qinghuazhi Agent schemas plus the repository display-safety boundary.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createToolRunner } = require('../../../../cloudfunctions/agent-http/tool-runner.js')

const plant = {
  id: 'internal-catalog-id',
  canonicalName: '绿萝',
  aliasNames: '黄金葛',
  plantDesc: '常见观叶植物',
  watering: { frequency: '盆土表层干后浇透' },
  wateringQuantization: { amount: '按盆径调整' },
  fertilization: { guidance: '生长期薄肥' },
  fertilizationMonthly: { available: false },
  sunning: { guidance: '明亮散射光' },
  ventilation: { guidance: '保持通风' },
  temperatureMin: 15,
  temperatureMax: 30,
  humidityMin: 40,
  humidityMax: 70
}

test('植物查询只返回可用于回答的目录字段', async () => {
  const run = createToolRunner({
    findCanonicalPlantMatch: async () => [plant],
    getPlantCatalogById: async () => plant,
    buildWateringPlanner: () => ({})
  })
  const result = await run({
    toolName: 'qinghuazhi_plant_lookup',
    input: { keyword: '绿萝' }
  })

  assert.equal(result.ok, true)
  assert.equal(result.matches[0].name, '绿萝')
  assert.equal(JSON.stringify(result).includes('internal-catalog-id'), false)
})

test('无浇水历史时不虚构下一次日期，并保留可执行盆土动作', async () => {
  const run = createToolRunner({
    findCanonicalPlantMatch: async () => [plant],
    getPlantCatalogById: async () => plant,
    buildWateringPlanner: () => ({
      amountRangeMl: [180, 240],
      nextWaterDate: '2099-01-01',
      nextWaterWindow: ['2099-01-01', '2099-01-03'],
      nextWaterReason: '内部计算原因',
      wateringContext: 'baseline',
      action: 'follow_baseline_or_check_soil',
      stopCondition: '盆底开始出水时停止',
      confidenceLevel: 'medium',
      soilCheck: { message: '表层干了再浇透。' }
    })
  })
  const result = await run({
    toolName: 'qinghuazhi_watering_plan',
    input: { plantKeyword: '绿萝' }
  })

  assert.equal(result.ok, true)
  assert.equal(result.plan.nextWaterDate, null)
  assert.equal(result.plan.nextWaterWindow, null)
  assert.equal(result.plan.soilCheck.message, '表层干了再浇透。')
  assert.equal(result.plan.wateringContext, '无法判断当前干湿')
  assert.equal(result.plan.action, '浇水前先检查盆土')
  assert.equal(result.plan.confidenceLevel, '信息不足')
  assert.equal(JSON.stringify(result.plan).includes('reasonCode'), false)
})

test('通用浇水只把青花植算法定义的盆型尺寸和基质传入规划器', async () => {
  let plannerInput = null
  const run = createToolRunner({
    findCanonicalPlantMatch: async () => [plant],
    getPlantCatalogById: async () => plant,
    buildWateringPlanner: input => {
      plannerInput = input
      return {}
    }
  })

  await run({
    toolName: 'qinghuazhi_watering_plan',
    input: {
      plantKeyword: '绿萝',
      potProfile: {
        potTopDiameterCm: 18,
        potBottomDiameterCm: 14,
        potHeightCm: 16,
        substrateType: '[{"material":"bark","ratio":70}]',
        potMaterial: 'terracotta',
        hasDrainageHole: 'false'
      }
    }
  })

  assert.deepEqual(plannerInput.potProfile, {
    potTopDiameterCm: 18,
    potBottomDiameterCm: 14,
    potHeightCm: 16,
    substrateType: '[{"material":"bark","ratio":70}]'
  })
})

test('未登记工具不会被执行', async () => {
  const run = createToolRunner({
    findCanonicalPlantMatch: async () => [],
    getPlantCatalogById: async () => null,
    buildWateringPlanner: () => ({})
  })
  await assert.rejects(run({ toolName: 'read_arbitrary_database', input: {} }), /不支持的查询能力/)
})

test('正式问诊工具只转发青花植题包，不再执行本地症状判断', async () => {
  const calls = []
  const run = createToolRunner({
    findCanonicalPlantMatch: async () => [],
    getPlantCatalogById: async () => null,
    buildWateringPlanner: () => ({}),
    invokeHttpFunction: async request => {
      calls.push(request)
      return {
        diagnosisSessionId: 'diag_1',
        roundId: 'round_1',
        questionPackageContinuationToken: 'signed-package-token',
        questionPackage: { mode: 'yellow_leaf', answerSubmitMode: 'package' },
        questions: [{ questionKey: 'q_1', text: '最近是否经常浇水？', options: [] }]
      }
    }
  })
  const result = await run(
    {
      toolName: 'qinghuazhi_diagnosis',
      input: { action: 'start', symptomClassKey: 'yellowing_mode' }
    },
    { identity: { userId: 'user-1', openid: 'openid-1', platform: 'wechat_mp' } }
  )

  assert.equal(result.source, 'qinghuazhi_formal_diagnosis')
  assert.equal(result.questionPackageContinuationToken, 'signed-package-token')
  assert.equal(calls[0].functionName, 'diagnose-http')
  assert.equal(calls[0].path, '/diagnosis/question/start')
  assert.equal(calls[0].body.symptomClassKey, 'yellowing_mode')
  await assert.rejects(
    run({ toolName: 'qinghuazhi_symptom_triage', input: { symptom: 'yellowing' } }),
    /不支持的查询能力/
  )
})

test('我的植物浇水工具调用正式用户植物规划接口', async () => {
  const calls = []
  const run = createToolRunner({
    findCanonicalPlantMatch: async () => [],
    getPlantCatalogById: async () => null,
    buildWateringPlanner: () => ({}),
    invokeHttpFunction: async request => {
      calls.push(request)
      return { requiresWateringHistory: true }
    }
  })
  const result = await run(
    {
      toolName: 'qinghuazhi_user_plant_watering_plan',
      input: { userPlantId: '42' }
    },
    { identity: { userId: 'user-1', openid: 'openid-1', platform: 'wechat_mp' } }
  )

  assert.equal(result.source, 'qinghuazhi_user_plant_watering_planner')
  assert.equal(calls[0].functionName, 'plant-user-http')
  assert.equal(calls[0].path, '/user-plants/watering-planner')
  assert.equal(calls[0].body.plantId, '42')
  assert.equal(Object.hasOwn(calls[0].body, 'potProfile'), false)
})
