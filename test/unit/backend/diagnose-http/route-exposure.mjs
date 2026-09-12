import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
const readJson = relativePath => JSON.parse(read(relativePath))

// data_mode=unit_fake; test_kind=source_contract
const diagnoseConfig = readJson('cloudfunctions/diagnose-http/cloudbase-functions.json')
const retiredConfig = readJson('cloudfunctions/diagnosis-history-http/cloudbase-functions.json')
const diagnoseRouter = read('cloudfunctions/diagnose-http/app/http-router.js')
const historyReader = read('cloudfunctions/diagnose-http/services/session-read-service.js')
const retiredHandler = read('cloudfunctions/diagnosis-history-http/app.js')
const packageJson = readJson('package.json')
const layerPackage = readJson('cloudfunctions/layer/package.json')
const layerLock = readJson('cloudfunctions/layer/package-lock.json')
const schemaEnsureScript = read('scripts/dev/ensure-cloudbase-watering-advisor-schema.mjs')

const exposedPaths = new Set(
  (diagnoseConfig.routes || []).map(route => String(route?.path || '').trim()).filter(Boolean)
)

test('diagnose-http 暴露当前主链、补拍、review、兼容入口', () => {
  const requiredPaths = [
    '/health',
    '/diagnosis/start',
    '/diagnosis/question/start',
    '/diagnosis/answer',
    '/diagnosis/retake/authorize',
    '/diagnosis/retake/skip',
    '/diagnosis/result',
    '/diagnosis/history',
    '/diagnosis/feedback',
    '/diagnosis/review/list',
    '/diagnosis/review/images',
    '/diagnosis/review/detail',
    '/diagnosis/review/import',
    '/visual/out-of-pool/list',
    '/visual/out-of-pool/image',
    '/visual/out-of-pool/review',
    '/visual/out-of-pool/proxy-mappings/list',
    '/visual/out-of-pool/proxy-mappings/upsert',
    '/visual/out-of-pool/proxy-mappings/disable',
    '/stream/diagnose',
    '/diagnose'
  ]

  for (const route of requiredPaths) {
    assert.ok(exposedPaths.has(route), `缺少 diagnose-http 对外路由: ${route}`)
  }
  assert.equal(exposedPaths.size, (diagnoseConfig.routes || []).length, '路由配置不应重复')
})

test('兼容入口复用 diagnosis/start，且 stream 入口强制 SSE', () => {
  assert.match(
    diagnoseRouter,
    /path === '\/stream\/diagnose' \|\| path\.endsWith\('\/stream\/diagnose'\)/
  )
  assert.match(diagnoseRouter, /streamVisualDecision: true/)
  assert.match(diagnoseRouter, /path === '\/diagnose' \|\| path\.endsWith\('\/diagnose'\)/)
  assert.match(
    diagnoseRouter,
    /const \{ handleDiagnosisStart \} = getDiagnosisHandlers\(\)[\s\S]*?return (?:await )?handleDiagnosisStart\(request, context/
  )
})

test('历史接口按 openid 隔离，并支持用户植物过滤', () => {
  assert.match(historyReader, /listDiagnosisSessionHistoryRows\(openid, \{/)
  assert.match(historyReader, /countDiagnosisSessionHistoryRows\(openid, \{/)
  assert.match(historyReader, /userPlantId: resolvedUserPlantId/)
  assert.match(historyReader, /userPlantId: row\.user_plant_id \|\| null/)
  assert.match(historyReader, /plantId: row\.user_plant_id \|\| normalizedPlantCatalogId \|\| null/)
})

test('退役 diagnosis-history-http 不重新占用现行诊断历史路径', () => {
  assert.deepEqual(
    (retiredConfig.routes || []).map(route => route.path),
    ['/diagnosis/history/health']
  )
  assert.match(retiredHandler, /已下线，请改用 diagnose-http 统一诊断链路/)
  assert.match(retiredHandler, /jsonResponse\(410,/)
})

test('本地层 mysql2 声明、锁文件和显式 schema 初始化命令一致', () => {
  assert.equal(layerPackage.dependencies?.mysql2, '^3.15.3')
  assert.equal(layerLock.packages?.['']?.dependencies?.mysql2, '^3.15.3')
  assert.ok(layerLock.packages?.['node_modules/mysql2'], 'layer lockfile 缺少 mysql2 包节点')
  assert.equal(
    packageJson.scripts?.['ensure:cloudbase-watering-advisor-schema'],
    'node scripts/dev/run-with-cloudbase-env.mjs --function=plant-user-http -- node scripts/dev/ensure-cloudbase-watering-advisor-schema.mjs'
  )
  assert.equal(
    packageJson.scripts?.['ensure:cloudbase-watering-advisor-schema:verify'],
    'node scripts/dev/run-with-cloudbase-env.mjs --function=plant-user-http -- node scripts/dev/ensure-cloudbase-watering-advisor-schema.mjs --verify-only'
  )
  assert.match(schemaEnsureScript, /tcb db execute/)
  assert.match(schemaEnsureScript, /CREATE TABLE IF NOT EXISTS/)
  assert.match(schemaEnsureScript, /--read-only/)
  assert.match(schemaEnsureScript, /cloud1_dev/)
  assert.doesNotMatch(schemaEnsureScript, /\$runSQLRaw/)
})
