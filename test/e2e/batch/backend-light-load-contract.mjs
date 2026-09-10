import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  ROUTE_MATRIX,
  readConfig,
  runLightLoad,
  validateConfig
} from '../../../scripts/qa/backend-light-load.mjs'

const routeIds = new Set(ROUTE_MATRIX.map(route => route.id))
assert.equal(
  ROUTE_MATRIX.find(route => route.id === 'diagnose.diagnose.method-guard')?.transport,
  'http_service',
  '/diagnose 兼容入口必须通过默认 HTTP 服务域压测'
)
assert.equal(
  ROUTE_MATRIX.find(route => route.id === 'diagnose.stream/diagnose.method-guard')?.transport,
  'http_service',
  '/stream/diagnose 兼容入口必须通过默认 HTTP 服务域压测'
)
for (const required of [
  'auth.health',
  'catalog.health',
  'plant-user.health',
  'storage.health',
  'identify.health',
  'diagnose.health',
  'diagnosis-history.health',
  'weather.health',
  'plant-user.watering-planner.method-guard',
  'diagnose.diagnose.method-guard',
  'diagnose.stream/diagnose.method-guard',
  'diagnose.diagnosis/start.method-guard',
  'weather.24h-alias.method-guard',
  'weather.ingestion.method-guard'
]) {
  assert.ok(routeIds.has(required), `缺少后端路由压力覆盖：${required}`)
}

for (const route of ROUTE_MATRIX) {
  if (['POST', 'PATCH', 'DELETE'].includes(route.method)) {
    assert.equal(route.kind, 'method_guard', `${route.id} 不得在默认压测中触发写方法`)
  }
  assert.ok(route.expected?.length || route.kind === 'health', `${route.id} 缺少可审计状态合同`)
}

const retiredHistoryRoute = ROUTE_MATRIX.find(route => route.id === 'diagnosis-history.deprecated')
assert.deepEqual(
  retiredHistoryRoute?.expected,
  [404],
  '已退役 diagnosis-history-http 的数据路径未公开，网关应返回 404'
)

const source = fs.readFileSync(
  path.join(process.cwd(), 'scripts/qa/backend-light-load.mjs'),
  'utf8'
)
assert.match(source, /mutation_policy: 'read_only'/)
assert.match(source, /x-terminal-e2e/)
assert.match(source, /BACKEND_LIGHT_LOAD_OPENID/)
assert.match(source, /BACKEND_LIGHT_LOAD_ACCESS_TOKEN/)
assert.match(source, /BACKEND_LIGHT_LOAD_HTTP_SERVICE_BASE_URL/)
assert.match(source, /Authorization = `Bearer \$\{config\.accessToken\}`/)
assert.match(source, /webfn', 'true'/)
assert.doesNotMatch(source, /method: 'DELETE'/)
assert.doesNotMatch(source, /dataUrl/)

const blocked = await runLightLoad(
  readConfig({
    TERMINAL_E2E_FUNCTION_BASE_URL: '',
    BACKEND_LIGHT_LOAD_OPENID: '',
    BACKEND_LIGHT_LOAD_ACCESS_TOKEN: '',
    CLOUDBASE_ENV_ID: '',
    BACKEND_LIGHT_LOAD_APP_ENV: 'development'
  })
)
assert.equal(blocked.status, 'BLOCKED')
assert.ok(validateConfig(readConfig({})).length >= 3)

console.log(
  'backend light-load route source contracts passed data_mode=unit_fake test_kind=source_contract'
)
