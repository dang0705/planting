import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// data_mode=unit_real_data
// 这不是 fixture 测试：图片、诊断、数据库读回和提醒阻断均走真实 cloud1_dev API。

const require = createRequire(import.meta.url)
const { normalizePersistedImageUrl } = require(
  '../../../../../cloudfunctions/diagnose-http/services/session-service-helpers.js'
)
const { isFertilizationGuardActive } = require(
  '../../../../../cloudfunctions/layer/utils/fertilization-reminder-planner.js'
)

const PROJECT_ROOT = process.cwd()
const DEFAULT_IMAGE_PATH = path.join(
  PROJECT_ROOT,
  'plant-sample/symptoms/yellowing/monstera_yellowing_1.jpeg'
)
const DEFAULT_BASE_URL = 'http://127.0.0.1:3010'
const DEFAULT_ENV_ID = 'cloud1-2grufevs395a9d5e'
const DEFAULT_OPENID = 'dev_terminal_mp_local'
const DEFAULT_PLANT_ID = '27'
const DEFAULT_CATALOG_ID = '42'
const REPORT_PATH = path.join(
  PROJECT_ROOT,
  '.tmp/unit-real-data/diagnosis-fertilization-guard-real-data.json'
)

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((result, line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return result
      }
      const separator = trimmed.indexOf('=')
      if (separator <= 0) {
        return result
      }
      result[trimmed.slice(0, separator).trim()] = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      return result
    }, {})
}

const env = {
  ...readEnvFile(path.join(PROJECT_ROOT, '.env.local')),
  ...process.env
}
const baseUrl = String(
  env.UNIT_REAL_DATA_BASE_URL || env.TERMINAL_E2E_FUNCTION_BASE_URL || DEFAULT_BASE_URL
).replace(/\/+$/, '')
const envId = String(env.UNIT_REAL_DATA_ENV_ID || env.CLOUDBASE_ENV_ID || DEFAULT_ENV_ID).trim()
const openid = String(env.UNIT_REAL_DATA_OPENID || DEFAULT_OPENID).trim()
const plantId = String(env.UNIT_REAL_DATA_PLANT_ID || DEFAULT_PLANT_ID).trim()
const configuredCatalogId = String(
  env.UNIT_REAL_DATA_PLANT_CATALOG_ID || DEFAULT_CATALOG_ID
).trim()
const imagePath = path.resolve(
  String(env.UNIT_REAL_DATA_IMAGE_PATH || DEFAULT_IMAGE_PATH).trim()
)

function assertRealDataConfiguration() {
  assert.ok(baseUrl, '缺少真实开发库 API 地址')
  assert.equal(envId, DEFAULT_ENV_ID, `本测试只允许 cloud1_dev，当前环境为 ${envId}`)
  assert.ok(openid, '缺少真实开发用户 openid')
  assert.ok(fs.existsSync(imagePath), `真实诊断图片不存在：${imagePath}`)
}

function buildUrl(functionPath, query = {}) {
  const url = new URL(functionPath.replace(/^\/+/, ''), `${baseUrl}/`)
  Object.entries({ ...query, webfn: 'true' }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  return url
}

async function request(functionPath, { method = 'GET', query = {}, body } = {}) {
  const requestedMethod = String(method).toUpperCase()
  const transportMethod = requestedMethod === 'GET' || requestedMethod === 'POST' ? requestedMethod : 'POST'
  const requestQuery = { ...query, skipAuth: 'true' }
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-openid': openid,
    'x-wx-openid': openid,
    'x-app-env': 'development',
    'x-env': 'development',
    'x-terminal-e2e': 'true'
  }

  if (requestedMethod !== transportMethod) {
    requestQuery._method = requestedMethod
    headers['x-http-method-override'] = requestedMethod
  }

  const requestBody = body && typeof body === 'object' ? { ...body, skipAuth: true, openid } : body
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(env.UNIT_REAL_DATA_TIMEOUT_MS || 60000))
  try {
    const response = await fetch(buildUrl(functionPath, requestQuery), {
      method: transportMethod,
      headers,
      signal: controller.signal,
      ...(transportMethod === 'GET' ? {} : { body: JSON.stringify(requestBody || {}) })
    })
    const rawText = await response.text()
    let payload
    try {
      payload = JSON.parse(rawText)
    } catch {
      payload = { raw: rawText }
    }
    return { response, payload }
  } finally {
    clearTimeout(timeout)
  }
}

function dataOf(payload) {
  return payload?.data ?? null
}

function assertSuccess(result, label) {
  assert.ok(
    result.response.ok,
    `${label} HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`
  )
  assert.equal(
    Number(result.payload?.code),
    200,
    `${label} code 不是 200: ${JSON.stringify(result.payload)}`
  )
}

function assertStatus(result, status, label) {
  assert.equal(
    result.response.status,
    status,
    `${label} HTTP 状态不符: ${JSON.stringify(result.payload)}`
  )
  assert.equal(
    Number(result.payload?.code),
    status,
    `${label} code 不符: ${JSON.stringify(result.payload)}`
  )
}

function publicQuestionKey(question) {
  return String(question?.questionKey || question?.key || question?.questionId || '').trim()
}

function questionItems(startData, questionPackage) {
  const candidates = [
    startData?.questions,
    startData?.questionPackage?.questionItems,
    questionPackage?.questionItems,
    questionPackage?.questions,
    questionPackage?.items
  ]
  return candidates.find(items => Array.isArray(items) && items.length > 0) || []
}

function findQuestionPackage(startData) {
  return (
    startData?.questionPackage ||
    startData?.questionPackageSnapshot ||
    startData?.package ||
    null
  )
}

function outcomeKeys(finalData) {
  const sources = [
    finalData?.visibleOutcomes,
    finalData?.finalResult?.visibleOutcomes,
    finalData?.outcomes
  ]
  return sources
    .filter(Array.isArray)
    .flat()
    .map(item => String(item?.outcomeKey || item?.problemKey || item?.problemId || '').trim())
    .filter(Boolean)
}

function buildConditionAnswers(option) {
  const codes = Array.isArray(option?.schedule?.conditionCodes)
    ? option.schedule.conditionCodes
    : []
  return codes.reduce((result, code) => {
    if (code && code !== 'none') {
      result[code] = true
    }
    return result
  }, {})
}

async function main() {
  assertRealDataConfiguration()

  let plant
  let uploadedFileId = ''
  let sessionId = ''
  let cleanupResult = { attempted: false, deleted: false }
  const report = {
    dataMode: 'unit_real_data',
    environment: 'cloud1_dev',
    environmentId: envId,
    baseUrl,
    openidFingerprint: `${openid.slice(0, 4)}...${openid.slice(-4)}`,
    imagePath,
    plantId,
    sessionId: '',
    outcomeKeys: [],
    fertilizationGuard: null,
    reminderConclusion: null,
    previewBlock: null,
    cleanup: cleanupResult
  }

  let primaryError = null
  try {
    const plantResult = await request('plant-user-http/user-plants', {
      query: { id: plantId }
    })
    assertSuccess(plantResult, '读取真实目标植物')
    plant = dataOf(plantResult.payload)
    assert.ok(plant && String(plant.id) === plantId, '真实开发库未返回指定植物')

    const catalogId = String(
      env.UNIT_REAL_DATA_PLANT_CATALOG_ID || plant.plantId || configuredCatalogId
    )
    assert.equal(catalogId, configuredCatalogId, '目标植物属级目录与测试配置不一致')

    const originalImage = fs.readFileSync(imagePath)
    const dataUrl = `data:image/jpeg;base64,${originalImage.toString('base64')}`
    const uploadResult = await request('storage-http/storage/diagnose-images', {
      method: 'POST',
      body: {
        dataUrl,
        suffix: 'jpg',
        plantId: Number(catalogId),
        maxAge: 7200
      }
    })
    assertSuccess(uploadResult, '上传真实诊断图片')
    const uploaded = dataOf(uploadResult.payload)
    uploadedFileId = String(uploaded?.fileId || '').trim()
    const imageRef = String(uploaded?.tempUrl || uploaded?.url || '').trim()
    assert.ok(uploadedFileId, '真实图片上传未返回 fileId')
    assert.ok(imageRef, '真实图片上传未返回 tempUrl/url')
    assert.notEqual(normalizePersistedImageUrl(imageRef), '[inline_data_url]')

    const startResult = await request('diagnose-http/diagnosis/start', {
      method: 'POST',
      body: {
        plantCatalogId: Number(catalogId),
        userPlantId: Number(plantId),
        plantId: Number(plantId),
        image: imageRef,
        images: [
          {
            imageRef,
            inputSlotType: 'leaf',
            orderIndex: 0,
            inputSlotOrder: 0,
            inputSlotLabel: '图片1 叶片',
            userDeclaredOrganType: 'leaf',
            userDeclaredOrganConfidence: 0.95,
            fileId: uploadedFileId
          }
        ],
        observedSymptoms: []
      }
    })
    assertSuccess(startResult, '真实 AI 诊断启动')
    const startData = dataOf(startResult.payload)
    sessionId = String(startData?.sessionId || startData?.diagnosisSessionId || '').trim()
    assert.ok(sessionId, '真实诊断未返回 sessionId')
    assert.equal(startData?.stage, 'question', '本测试要求真实图片进入问诊链路')
    const roundId = String(startData?.roundId || 'round_1').trim()

    let questionPackage = findQuestionPackage(startData)
    if (!questionPackage) {
      const resultLookup = await request('diagnose-http/diagnosis/result', {
        query: { sessionId }
      })
      assertSuccess(resultLookup, '读取真实问诊题包')
      const resultData = dataOf(resultLookup.payload)
      questionPackage = findQuestionPackage(resultData)
    }
    assert.ok(questionPackage && typeof questionPackage === 'object', '真实诊断未返回问诊题包')

    const expectedQuestionKeys = [
      'q_observed_probe__leaf_yellowing__watering_frequency_context',
      'q_observed_probe__leaf_yellowing__light_change_context',
      'q_observed_probe__leaf_yellowing__fertilization_growth_context',
      'q_yellow_leaf__air_environment'
    ]
    const availableQuestions = questionItems(startData, questionPackage)
    const availableKeys = availableQuestions.map(publicQuestionKey)
    for (const key of expectedQuestionKeys) {
      assert.ok(availableKeys.includes(key), `真实问诊题包缺少题目：${key}`)
    }

    const answerResult = await request('diagnose-http/diagnosis/answer', {
      method: 'POST',
      body: {
        diagnosisSessionId: sessionId,
        roundId,
        requestMode: 'answer_submit',
        questionPackage,
        answers: [
          {
            questionKey: expectedQuestionKeys[0],
            optionKey: 'often_wet'
          },
          {
            questionKey: expectedQuestionKeys[1],
            optionKey: 'unknown'
          },
          {
            questionKey: expectedQuestionKeys[2],
            optionKey: 'unknown'
          },
          {
            questionKey: expectedQuestionKeys[3],
            optionKey: 'air_environment_unknown'
          }
        ]
      }
    })
    assertSuccess(answerResult, '真实问诊提交')
    const finalData = dataOf(answerResult.payload)
    assert.equal(finalData?.stage, 'final', '真实问诊未完成')
    assert.equal(finalData?.status, 'closed', '真实诊断会话未关闭')
    assert.equal(finalData?.outcomeType, 'problematic', '真实图片和问诊未产生问题结果')

    const keys = outcomeKeys(finalData)
    assert.ok(keys.includes('overwatering_root_pressure'), `真实诊断未产生过浇阳性结果：${JSON.stringify(keys)}`)
    report.sessionId = sessionId
    report.outcomeKeys = keys

    const rereadPlantResult = await request('plant-user-http/user-plants', {
      query: { id: plantId }
    })
    assertSuccess(rereadPlantResult, '读回真实诊断后的植物')
    const rereadPlant = dataOf(rereadPlantResult.payload)
    const guard = rereadPlant?.fertilizationGuard
    assert.ok(guard && typeof guard === 'object', '真实诊断未写入 fertilizationGuard')
    assert.equal(guard.source, 'diagnosis')
    assert.equal(guard.status, 'deferred')
    assert.equal(guard.reasonCode, 'root_stress')
    assert.equal(guard.sourceDiagnosisId, sessionId)
    assert.equal(isFertilizationGuardActive(guard, new Date().toISOString().slice(0, 10)), true)
    report.fertilizationGuard = guard

    const reminderResult = await request('plant-user-http/user-plants/fertilization-reminders', {
      query: { plantId }
    })
    assertSuccess(reminderResult, '读取真实施肥提醒')
    const reminder = dataOf(reminderResult.payload)
    assert.equal(reminder?.active, false, '暂缓施肥时不应存在 active 施肥提醒')
    assert.equal(reminder?.currentMonthConclusion?.status, 'monthly_deferred')
    assert.deepEqual(reminder?.fertilizationGuard, guard)
    report.reminderConclusion = reminder.currentMonthConclusion

    const options = Array.isArray(reminder?.currentMonthOptions)
      ? reminder.currentMonthOptions
      : []
    assert.ok(options.length, '真实植物当前月份没有施肥选项，无法验证提醒阻断')
    const latestHistoryType = String(rereadPlant?.fertilizationHistory?.[0]?.fertilizerType || '')
    const selectedOption =
      options.find(option => option.type === latestHistoryType) || options[0]
    const previewResult = await request(
      'plant-user-http/user-plants/fertilization-reminders/preview',
      {
        method: 'POST',
        body: {
          plantId: Number(plantId),
          fertilizerType: selectedOption.type,
          conditionAnswers: buildConditionAnswers(selectedOption),
          acknowledgeFertilizerTypeChange: true
        }
      }
    )
    assertStatus(previewResult, 422, '暂缓施肥后的提醒预览')
    assert.equal(previewResult.payload?.data?.blockingReason, 'fertilization_guard')
    assert.match(String(previewResult.payload?.message || ''), /暂缓施肥/)
    report.previewBlock = {
      status: previewResult.response.status,
      message: previewResult.payload?.message || '',
      blockingReason: previewResult.payload?.data?.blockingReason || ''
    }
  } catch (error) {
    primaryError = error
  } finally {
    if (uploadedFileId) {
      cleanupResult = { attempted: true, deleted: false, fileId: uploadedFileId }
      try {
        const cleanup = await request('storage-http/storage/diagnose-images', {
          method: 'DELETE',
          body: { fileId: uploadedFileId }
        })
        cleanupResult.status = cleanup.response.status
        cleanupResult.deleted = cleanup.response.ok && Number(cleanup.payload?.code) === 200
        if (!cleanupResult.deleted) {
          cleanupResult.error = cleanup.payload?.message || JSON.stringify(cleanup.payload)
        }
      } catch (error) {
        cleanupResult.error = error.message
      }
    }
    report.cleanup = cleanupResult
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
  }

  assert.equal(cleanupResult.deleted, true, `真实诊断图片清理失败：${JSON.stringify(cleanupResult)}`)
  if (primaryError) {
    throw primaryError
  }

  console.log(JSON.stringify({ ...report, reportPath: REPORT_PATH }, null, 2))
}

main().catch(error => {
  console.error(`[unit_real_data] failed: ${error.stack || error.message}`)
  process.exitCode = 1
})
