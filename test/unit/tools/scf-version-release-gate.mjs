/* oxlint-disable no-console, no-magic-numbers */
import assert from 'node:assert/strict'
import {
  assertSafeDefaultAlias,
  parseJsonFromOutput,
  releaseImmutableDefaultVersion
} from '../../../scripts/cloudbase/tcb-function-release.mjs'

// data_mode=unit_fake; test_kind=deployment_contract。
// 这里只验证发布事务、摘要一致性和失败回退；真实云端版本证据由部署后的 API 回读与 CLS 日志提供。
const codeHash = 'a'.repeat(64)

function createFakeClient({
  gray = false,
  publishedHash = codeHash,
  defaultHash = codeHash,
  runtimeError = null,
  latestAddressFailures = 0
} = {}) {
  const calls = []
  let aliasVersion = '32'
  let remainingLatestAddressFailures = latestAddressFailures
  const alias = () => ({
    Name: '$DEFAULT',
    Description: 'existing alias',
    FunctionVersion: aliasVersion,
    RoutingConfig: {
      AdditionalVersionWeights: gray ? [{ Version: '$LATEST', Weight: 0.1 }] : [],
      AddtionVersionMatchs: []
    }
  })
  return {
    calls,
    get aliasVersion() {
      return aliasVersion
    },
    wait: async () => {},
    async callScf(action, params) {
      calls.push({ action, params })
      if (action === 'GetAlias') {
        return alias()
      }
      if (action === 'PublishVersion') {
        return { FunctionVersion: '33', CodeSize: 100 }
      }
      if (action === 'GetFunction') {
        return { FunctionVersion: '33', Status: 'Active', AvailableStatus: 'Available' }
      }
      if (action === 'UpdateAlias') {
        aliasVersion = String(params.FunctionVersion)
        return { RequestId: 'request' }
      }
      if (action === 'GetFunctionAddress') {
        if (params.Qualifier === '$LATEST') {
          if (remainingLatestAddressFailures > 0) {
            remainingLatestAddressFailures -= 1
            throw new Error('function code is updating')
          }
          return { CodeSha256: codeHash }
        }
        if (params.Qualifier === '$DEFAULT') {
          return { CodeSha256: defaultHash }
        }
        return { CodeSha256: publishedHash }
      }
      throw new Error('unexpected action ' + action)
    },
    async verifyGatewayQualifier({ version }) {
      calls.push({ action: 'verifyGatewayQualifier', version })
      if (runtimeError) {
        throw runtimeError
      }
      return {
        qualifier: version,
        alias: '$DEFAULT',
        requestSource: 'TCB_GW',
        statusCode: 200,
        requestId: 'runtime-request'
      }
    }
  }
}

assert.deepEqual(parseJsonFromOutput('banner\n{"ok":true}\n'), { ok: true })
assert.throws(
  () =>
    assertSafeDefaultAlias(
      {
        Name: '$DEFAULT',
        FunctionVersion: '32',
        RoutingConfig: { AdditionalVersionWeights: [{ Version: '31', Weight: 0.1 }] }
      },
      'diagnose-http'
    ),
  /灰度流量/u
)
assert.throws(
  () =>
    assertSafeDefaultAlias(
      { Name: '$DEFAULT', FunctionVersion: '$LATEST', RoutingConfig: {} },
      'diagnose-http'
    ),
  /不可变数字版本/u
)

const successClient = createFakeClient()
const success = await releaseImmutableDefaultVersion({
  client: successClient,
  functionName: 'diagnose-http',
  namespace: 'cloud1-test',
  deploymentId: 'deploy-1',
  sourceFingerprint: 'b'.repeat(64),
  runtimeBaseUrl: 'https://example.test'
})
assert.equal(success.previousVersion, '32')
assert.equal(success.publishedVersion, '33')
assert.equal(success.aliasVerified, true)
assert.equal(success.runtimeVerified, true)
assert.equal(success.defaultCodeSha256, codeHash)
assert.equal(successClient.aliasVersion, '33')
assert.ok(successClient.calls.some(item => item.action === 'PublishVersion'))
assert.ok(successClient.calls.some(item => item.action === 'verifyGatewayQualifier'))

const eventualConsistencyClient = createFakeClient({ latestAddressFailures: 1 })
const eventualConsistencyRelease = await releaseImmutableDefaultVersion({
  client: eventualConsistencyClient,
  functionName: 'diagnose-http',
  namespace: 'cloud1-test',
  deploymentId: 'deploy-eventual-consistency',
  sourceFingerprint: 'c'.repeat(64),
  runtimeBaseUrl: 'https://example.test'
})
assert.equal(eventualConsistencyRelease.publishedVersion, '33')
assert.equal(
  eventualConsistencyClient.calls.filter(
    item => item.action === 'GetFunctionAddress' && item.params.Qualifier === '$LATEST'
  ).length,
  2
)

const mismatchClient = createFakeClient({ publishedHash: 'c'.repeat(64) })
await assert.rejects(
  releaseImmutableDefaultVersion({
    client: mismatchClient,
    functionName: 'diagnose-http',
    namespace: 'cloud1-test',
    deploymentId: 'deploy-2',
    sourceFingerprint: 'd'.repeat(64),
    runtimeBaseUrl: 'https://example.test'
  }),
  /代码摘要/u
)
assert.equal(mismatchClient.aliasVersion, '32')
assert.equal(
  mismatchClient.calls.some(item => item.action === 'UpdateAlias'),
  false
)

const rollbackClient = createFakeClient({ runtimeError: new Error('runtime evidence missing') })
await assert.rejects(
  releaseImmutableDefaultVersion({
    client: rollbackClient,
    functionName: 'diagnose-http',
    namespace: 'cloud1-test',
    deploymentId: 'deploy-3',
    sourceFingerprint: 'e'.repeat(64),
    runtimeBaseUrl: 'https://example.test'
  }),
  /runtime evidence missing/u
)
assert.equal(rollbackClient.aliasVersion, '32')
assert.deepEqual(
  rollbackClient.calls
    .filter(item => item.action === 'UpdateAlias')
    .map(item => item.params.FunctionVersion),
  ['33', '32']
)

const grayClient = createFakeClient({ gray: true })
await assert.rejects(
  releaseImmutableDefaultVersion({
    client: grayClient,
    functionName: 'diagnose-http',
    namespace: 'cloud1-test',
    deploymentId: 'deploy-4',
    sourceFingerprint: 'f'.repeat(64),
    runtimeBaseUrl: 'https://example.test'
  }),
  /灰度流量/u
)
assert.equal(
  grayClient.calls.some(item => item.action === 'PublishVersion'),
  false
)

console.log(
  'SCF immutable default release gate passed data_mode=unit_fake test_kind=deployment_contract'
)
