'use strict'

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function compactPlant(plant) {
  return {
    name: text(plant?.canonicalName || plant?.primaryDisplayName, 80),
    aliases: text(plant?.aliasNames, 160),
    description: text(plant?.plantDesc, 600),
    watering: plant?.watering || null,
    wateringQuantization: plant?.wateringQuantization || null,
    fertilization: plant?.fertilization || null,
    fertilizationMonthly: plant?.fertilizationMonthly || null,
    light: plant?.sunning || null,
    ventilation: plant?.ventilation || null,
    temperatureC: [plant?.temperatureMin ?? null, plant?.temperatureMax ?? null],
    humidityPercent: [plant?.humidityMin ?? null, plant?.humidityMax ?? null]
  }
}

function selectPlant(matches) {
  const rows = Array.isArray(matches) ? matches : []
  return rows.find(item => Number(item?.matchScore || 0) >= 3) || rows[0] || null
}

function compactUserPlant(plant) {
  return {
    id: plant?.id ?? null,
    nickname: text(plant?.nickname, 80),
    name: text(plant?.displayName || plant?.recognizedName || plant?.canonicalName, 120),
    recognizedName: text(plant?.recognizedName, 120),
    location: text(plant?.location, 120),
    plantDate: text(plant?.plantDate, 32),
    careLocation: plant?.careLocation
      ? {
          locationKey: text(plant.careLocation.locationKey, 160),
          cityName: text(plant.careLocation.cityName, 80)
        }
      : null
  }
}

function compactAlgorithmPotProfile(value) {
  const raw = object(value)
  const profile = {}
  for (const key of ['potTopDiameterCm', 'potBottomDiameterCm', 'potHeightCm']) {
    const number = Number(raw[key])
    if (Number.isFinite(number) && number > 0) {
      profile[key] = number
    }
  }
  const substrateType = text(raw.substrateType, 200)
  if (substrateType) {
    profile.substrateType = substrateType
  }
  return profile
}

function requireIdentity(context = {}) {
  if (!context?.identity?.openid || !context?.identity?.userId) {
    throw fail('登录已失效，请返回小程序重新进入小青。', 401)
  }
  return context.identity
}

async function callFormalFunction(invokeHttpFunction, request, context) {
  if (typeof invokeHttpFunction !== 'function') {
    throw fail('青花植正式业务接口暂未接通。', 503)
  }
  const identity = requireIdentity(context)
  return invokeHttpFunction({ ...request, identity, signal: context?.signal })
}

function createToolRunner({
  findCanonicalPlantMatch,
  getPlantCatalogById,
  buildWateringPlanner,
  invokeHttpFunction
}) {
  async function resolvePlant(input) {
    const plantId = text(input.catalogPlantId || input.plantId, 128)
    if (plantId) {
      const plant = await getPlantCatalogById(plantId)
      if (plant) {
        return plant
      }
    }
    const keyword = text(input.plantKeyword || input.keyword, 80)
    if (!keyword) {
      throw fail('请先说明植物名称。')
    }
    const plant = selectPlant(await findCanonicalPlantMatch(keyword, 5))
    if (!plant) {
      throw fail('青花植植物目录中暂未找到这种植物。', 404)
    }
    return plant
  }

  return async (pending, context = {}) => {
    const toolName = text(pending?.toolName, 100)
    const input = object(pending?.input)

    if (toolName === 'qinghuazhi_plant_lookup') {
      const plantId = text(input.plantId, 128)
      const keyword = text(input.keyword, 80)
      const matches = plantId
        ? [await getPlantCatalogById(plantId)].filter(Boolean)
        : await findCanonicalPlantMatch(keyword, 5)
      return {
        ok: true,
        keyword,
        matches: matches.slice(0, 5).map(compactPlant),
        note: '仅使用青花植当前植物目录结果。'
      }
    }

    if (toolName === 'qinghuazhi_watering_plan') {
      const plant = await resolvePlant(input)
      const wateringEvents = Array.isArray(input.wateringEvents)
        ? input.wateringEvents.slice(0, 30)
        : []
      const plan = buildWateringPlanner({
        wateringStrategy: plant.watering || {},
        historical: {},
        forecast: {},
        behaviorTimeline: { watering_events_10d: wateringEvents },
        potProfile: compactAlgorithmPotProfile(input.potProfile),
        wateringQuantization: plant.wateringQuantization || null,
        referenceDate: text(input.referenceDate, 40)
      })
      const hasHistory = wateringEvents.length > 0
      const soilCheckMessage = text(plan.soilCheck?.message, 240)
      return {
        ok: true,
        plant: { name: text(plant.canonicalName || plant.primaryDisplayName, 80) },
        plan: {
          amountRangeMl: plan.amountRangeMl || null,
          nextWaterDate: hasHistory ? plan.nextWaterDate || null : null,
          nextWaterWindow: hasHistory ? plan.nextWaterWindow || null : null,
          nextWaterReason: hasHistory
            ? plan.nextWaterReason || ''
            : '尚无上次浇水记录，不能推导下次浇水日期；请先检查盆土。',
          wateringContext: hasHistory ? text(plan.wateringContext, 80) : '无法判断当前干湿',
          action: hasHistory ? text(plan.action, 80) : '浇水前先检查盆土',
          stopCondition: plan.stopCondition || '',
          confidenceLevel: hasHistory ? text(plan.confidenceLevel, 40) : '信息不足',
          soilCheck: soilCheckMessage ? { message: soilCheckMessage } : null
        },
        rules: [
          '浇水建议不是实时盆土含水量测量。',
          '下次浇水前先检查盆土；没有浇水历史时不推导日期。'
        ]
      }
    }

    if (toolName === 'qinghuazhi_user_plant_lookup') {
      const data = await callFormalFunction(
        invokeHttpFunction,
        {
          functionName: 'plant-user-http',
          path: '/user-plants',
          method: 'GET',
          query: { page: '1', pageSize: '20' }
        },
        context
      )
      const plants = Array.isArray(data?.list)
        ? data.list
        : Array.isArray(data?.items)
          ? data.items
          : []
      return {
        ok: true,
        source: 'qinghuazhi_user_plants',
        plants: plants.map(compactUserPlant),
        total: Number(data?.total || plants.length)
      }
    }

    if (toolName === 'qinghuazhi_user_plant_watering_plan') {
      const userPlantId = text(input.userPlantId || input.plantId, 64)
      if (!userPlantId) {
        throw fail('请先确定要规划的用户植物。')
      }
      const data = await callFormalFunction(
        invokeHttpFunction,
        {
          functionName: 'plant-user-http',
          path: '/user-plants/watering-planner',
          method: 'POST',
          body: {
            plantId: userPlantId,
            wateringEvents: Array.isArray(input.wateringEvents)
              ? input.wateringEvents.slice(0, 30)
              : [],
            weatherDays: Array.isArray(input.weatherDays) ? input.weatherDays.slice(0, 10) : [],
            forecastDays: Array.isArray(input.forecastDays)
              ? input.forecastDays.slice(0, 15)
              : [],
            referenceDate: text(input.referenceDate, 40),
            locationKey: text(input.locationKey, 160),
            timezone: text(input.timezone, 80) || 'Asia/Shanghai',
            airEnvironmentOverride: object(input.airEnvironmentOverride),
            soilMoistureOverride: text(input.soilMoistureOverride, 32)
          }
        },
        context
      )
      return {
        ok: true,
        source: 'qinghuazhi_user_plant_watering_planner',
        userPlantId,
        plan: data || null,
        rules: [
          '这是青花植正式“我的植物”规划接口的结果，服务端按用户归属读取植物状态。',
          '如果服务端要求补填历史浇水日期，应先完成该信息，不用模型自行推算。'
        ]
      }
    }

    if (toolName === 'qinghuazhi_diagnosis') {
      const action = text(input.action, 16)
      if (action === 'start') {
        const symptomClassKey = text(input.symptomClassKey, 64)
        if (!['yellowing_mode', 'wilting_droop_mode'].includes(symptomClassKey)) {
          throw fail('当前正式问诊入口支持黄叶或枯萎/发蔫模式。')
        }
        const data = await callFormalFunction(
          invokeHttpFunction,
          {
            functionName: 'diagnose-http',
            path: '/diagnosis/question/start',
            method: 'POST',
            body: {
              symptomClassKey,
              ...(text(input.symptomKey, 80) ? { symptomKey: text(input.symptomKey, 80) } : {}),
              ...(text(input.plantCatalogId || input.plantId, 128)
                ? { plantCatalogId: text(input.plantCatalogId || input.plantId, 128) }
                : {}),
              ...(text(input.userPlantId, 64)
                ? { userPlantId: text(input.userPlantId, 64) }
                : {}),
              ...(text(input.description, 500)
                ? { description: text(input.description, 500) }
                : {}),
              clientContext: {
                source: 'QinghuazhiAgent',
                reviewSourceType: 'agent_formal_diagnosis',
                visualInputVersion: 'agent_formal_diagnosis_v1',
                entrySource: text(input.userPlantId) ? 'user_plant' : 'diagnose_tab'
              }
            }
          },
          context
        )
        return {
          ok: true,
          source: 'qinghuazhi_formal_diagnosis',
          action: 'start',
          diagnosisSessionId: text(data?.diagnosisSessionId, 128),
          roundId: text(data?.roundId, 64),
          questionPackageContinuationToken: text(data?.questionPackageContinuationToken, 12000),
          questionPackage: data?.questionPackage || null,
          questions: Array.isArray(data?.questions) ? data.questions : [],
          instruction:
            '这些是青花植正式问诊题包。只能把题目转换为 AskUserQuestion 卡片，不能自行判断症状或改写选项含义。'
        }
      }

      if (action === 'answer') {
        const diagnosisSessionId = text(input.diagnosisSessionId, 128)
        const continuationToken = text(input.questionPackageContinuationToken, 12000)
        const answers = Array.isArray(input.answers) ? input.answers.slice(0, 16) : []
        if (!diagnosisSessionId || !continuationToken || !answers.length) {
          throw fail('正式问诊提交缺少会话、续接票据或答案。')
        }
        const data = await callFormalFunction(
          invokeHttpFunction,
          {
            functionName: 'diagnose-http',
            path: '/diagnosis/answer',
            method: 'POST',
            body: {
              requestMode: 'answer_submit',
              diagnosisSessionId,
              questionPackageContinuationToken: continuationToken,
              answers,
              ...(input.questionPackage && typeof input.questionPackage === 'object'
                ? { questionPackage: input.questionPackage }
                : {})
            }
          },
          context
        )
        return {
          ok: true,
          source: 'qinghuazhi_formal_diagnosis',
          action: 'answer',
          data: data || null,
          instruction: '仅根据青花植正式问诊返回的结果解释，不要补写独立病因判断。'
        }
      }

      throw fail('正式问诊 action 只能是 start 或 answer。')
    }

    if (toolName === 'qinghuazhi_fertilization_advice') {
      const plant = await resolvePlant(input)
      return {
        ok: true,
        plant: { name: text(plant.canonicalName || plant.primaryDisplayName, 80) },
        baseStrategy: plant.fertilization || null,
        monthlyStrategy: plant.fertilizationMonthly || null,
        note: '月度规则缺失时不能用基础间隔自行推算。'
      }
    }

    throw fail('小青请求了当前不支持的查询能力。', 400)
  }
}

module.exports = { createToolRunner }
