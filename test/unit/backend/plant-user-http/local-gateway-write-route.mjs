import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gatewaySource = readFileSync('scripts/dev/local-functions-gateway.mjs', 'utf8')
const configSource = readFileSync('scripts/dev/local-api-env-config.mjs', 'utf8')

assert.doesNotMatch(gatewaySource, /plant-user-write-http/u)
assert.doesNotMatch(configSource, /plant-user-write-http/u)
assert.match(
  gatewaySource,
  /NATIVE_HTTP_FUNCTIONS = new Set\(\['auth-user-http', 'plant-user-http'\]\)/u
)
assert.match(gatewaySource, /function resolveTargetFunctionName\(functionName\)/u)
assert.match(gatewaySource, /return functionName/u)
assert.match(
  gatewaySource,
  /NATIVE_HTTP_FUNCTIONS\.has\(definition\.name\)[\s\S]*native-http-server\.js/u
)
assert.match(
  gatewaySource,
  /definition\.directory \|\| definition\.name/u,
  '写函数必须复用 plant-user-http 目录中的完整 HTTP app'
)

console.log(
  'local gateway plant-user write route contract passed data_mode=unit_fake test_kind=source_contract'
)
