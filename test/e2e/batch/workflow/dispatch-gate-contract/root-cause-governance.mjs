#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  qaBackendTargetEvidence,
  resolveQaBackendTarget,
  QA_ONLINE_TARGET
} from '../../../../../scripts/qa/qa-backend-target.mjs'
import {
  auditConfiguredFunctions,
  auditFunctionPackage
} from '../../../../../scripts/qa/function-package-audit.mjs'
import { readConfig, validateConfig } from '../../../../../scripts/qa/backend-light-load.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const onlineEnvironment = { QA_BACKEND_MODE: 'online' }
const target = resolveQaBackendTarget(onlineEnvironment)
assert.deepEqual(qaBackendTargetEvidence(target), {
  mode: 'online',
  environment_id: QA_ONLINE_TARGET.environmentId,
  api_gateway_base_url: QA_ONLINE_TARGET.apiGatewayBaseUrl,
  base_url: QA_ONLINE_TARGET.httpFunctionBaseUrl,
  wx_request_url:
    QA_ONLINE_TARGET.httpFunctionBaseUrl + '/plant-user-http/user-plants?page=1&pageSize=1',
  business_auth_url: QA_ONLINE_TARGET.httpFunctionBaseUrl + '/auth-user-http/auth/user',
  source: 'supervisor_fixed_online_public_http'
})
assert.throws(
  () =>
    resolveQaBackendTarget({
      ...onlineEnvironment,
      QA_ONLINE_API_BASE_URL: 'https://cloud1-2grufevs395a9d5e.api.tcloudbase.com/v1/functions'
    }),
  error => error?.code === 'qa_online_api_base_url_must_be_gateway'
)

const recordSource = read('scripts/qa/record-user-plant-environment.mjs')
assert.match(recordSource, /resolveQaBackendTarget/u)
assert.doesNotMatch(recordSource, /192\.168\.50\.80:3010/u)

const businessCoverageSource = read('test/e2e/automator/_shared/business-coverage-live.mjs')
assert.match(businessCoverageSource, /resolveQaBackendTarget/u)
assert.doesNotMatch(businessCoverageSource, /QA_LAN_PORT = 3010/u)
assert.doesNotMatch(businessCoverageSource, /QA_FUNCTION_PORT_BASE = 9000/u)

const remoteReadPerformanceSource = read('test/e2e/automator/user/remote-read-performance.mjs')
assert.match(
  remoteReadPerformanceSource,
  /const COLD_CANDIDATE_SAMPLE_COUNT = 5/u,
  '远端性能探索必须保留 5 次冷请求候选采样，不得伪装为完整基线'
)
assert.match(
  remoteReadPerformanceSource,
  /const HOT_CANDIDATE_SAMPLE_COUNT = 10/u,
  '远端性能探索必须保留 10 次热请求采样，不得用 5+5 代替审查计划'
)
assert.match(
  remoteReadPerformanceSource,
  /target\.source === 'supervisor_fixed_online_public_http'/u,
  '远端性能叶子必须核对 canonical 目标来源，而不是写入永远不匹配的伪来源'
)
assert.match(
  remoteReadPerformanceSource,
  /not_eligible_for_performance_pass/u,
  '探索样本不足时，性能叶子必须明确记录为不可判定'
)
assert.match(
  remoteReadPerformanceSource,
  /evaluateAbsolutePerformance/u,
  '正式性能结论必须直接以冷/热端上硬指标判定'
)
assert.doesNotMatch(
  remoteReadPerformanceSource,
  /QA_REMOTE_READ_BASELINE_REPORT|compareFormalPerformance/u,
  '历史基线只能作辅助记录，不能阻断本期绝对性能门槛验收'
)
assert.doesNotMatch(
  remoteReadPerformanceSource,
  /QA_REMOTE_READ_CAPTURE_TOKEN|enableRemoteReadCapture|__plantingQaRemoteReadCaptureToken/u,
  '性能叶子不得向产品页面注入运行时令牌门禁'
)

const automatorRunSource = read('scripts/qa/automator-run.mjs')
assert.doesNotMatch(
  automatorRunSource,
  /QA_REMOTE_READ_CAPTURE_TOKEN|VITE_QA_REMOTE_READ_CAPTURE_TOKEN/u,
  '隔离性能运行时不得把采样令牌编译进产品页面'
)

const runtimeResilienceSource = read(
  'test/e2e/automator/business/runtime-interaction-resilience.mjs'
)
assert.match(runtimeResilienceSource, /resolveQaBackendTarget/u)
assert.doesNotMatch(runtimeResilienceSource, /QA_LAN_PORT = 3010/u)
assert.doesNotMatch(runtimeResilienceSource, /QA_FUNCTION_PORT_BASE = 9000/u)

const supervisorSource = read('scripts/qa/automator-supervisor.mjs')
assert.match(supervisorSource, /forceFullLanRebuild: true/u)
assert.match(supervisorSource, /formal QA generation must compile the current source/u)
assert.doesNotMatch(supervisorSource, /resolveLocalApiBaseUrl/u)

const lightLoadSource = read('scripts/qa/backend-light-load.mjs')
assert.match(lightLoadSource, /resolveQaBackendTarget/u)
assert.match(lightLoadSource, /evidence_class: 'diagnostic_only'/u)
assert.match(lightLoadSource, /performance_eligible: false/u)
assert.match(lightLoadSource, /transport: 'node\.fetch'/u)

const canonicalLightLoad = readConfig({
  ...onlineEnvironment,
  TERMINAL_E2E_FUNCTION_BASE_URL: target.baseUrl,
  BACKEND_LIGHT_LOAD_HTTP_SERVICE_BASE_URL: QA_ONLINE_TARGET.apiGatewayBaseUrl,
  BACKEND_LIGHT_LOAD_OPENID: 'redacted-test-openid',
  BACKEND_LIGHT_LOAD_ACCESS_TOKEN: 'redacted-test-token',
  CLOUDBASE_ENV_ID: QA_ONLINE_TARGET.environmentId,
  BACKEND_LIGHT_LOAD_APP_ENV: 'development'
})
assert.deepEqual(validateConfig(canonicalLightLoad), [])
const mismatchedLightLoad = readConfig({
  ...onlineEnvironment,
  TERMINAL_E2E_FUNCTION_BASE_URL: 'https://other.example.test',
  BACKEND_LIGHT_LOAD_HTTP_SERVICE_BASE_URL: QA_ONLINE_TARGET.apiGatewayBaseUrl,
  BACKEND_LIGHT_LOAD_OPENID: 'redacted-test-openid',
  BACKEND_LIGHT_LOAD_ACCESS_TOKEN: 'redacted-test-token',
  CLOUDBASE_ENV_ID: QA_ONLINE_TARGET.environmentId,
  BACKEND_LIGHT_LOAD_APP_ENV: 'development'
})
assert.ok(
  validateConfig(mismatchedLightLoad).some(item => item.includes('TERMINAL_E2E_FUNCTION_BASE_URL'))
)

const deploySource = read('scripts/deploy-cloudbase-functions.mjs')
assert.match(deploySource, /assertDeploymentEnvironment/u)
assert.match(deploySource, /auditFunctionPackage/u)
assert.match(deploySource, /stageFunctionPackage/u)
assert.match(deploySource, /stagedDir/u)
assert.match(deploySource, /DEPLOYMENT_IGNORED_DIRECTORY_NAMES/u)
assert.match(deploySource, /writeDeploymentManifest/u)
assert.match(deploySource, /remote_readback/u)
assert.match(deploySource, /codeSha256/u)

const packageAudit = auditConfiguredFunctions()
assert.equal(packageAudit.status, 'PASS')
assert.equal(packageAudit.violations.length, 0)
for (const item of packageAudit.functions) {
  assert.match(item.source_fingerprint, /^[a-f0-9]{64}$/u)
  assert.ok(item.file_count > 0)
  assert.doesNotMatch(
    item.files.map(file => file.path).join('\n'),
    /(?:^|\/)logs\//u,
    `${item.function_name} 的本地运行日志不得进入函数包审计`
  )
}

const plantAudit = packageAudit.functions.find(item => item.function_name === 'plant-user-http')
assert.ok(plantAudit)
assert.doesNotMatch(
  plantAudit.top_level_imports.join('\n'),
  /(?:watering-reminder-service|fertilization-reminder-service|watering-planner-service|watering-advisor-service|air-environment-service|transpiration|light-exposure|plant-deletion)/u,
  'user-plants 列表启动依赖不得包含非列表业务模块'
)
const plantSource = read('cloudfunctions/plant-user-http/app.js')
assert.match(plantSource, /function loadWateringReminderService\(\)/u)
assert.match(plantSource, /function loadFertilizationReminderService\(\)/u)
assert.match(plantSource, /function loadLightExposureNormalize\(\)/u)
const plantKnowledgeSource = read('cloudfunctions/layer/utils/plant-knowledge.js')
assert.match(plantKnowledgeSource, /function loadPlantImages\(\)/u)
assert.match(plantKnowledgeSource, /function loadFertilizationHistory\(\)/u)

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'planting-package-audit-'))
try {
  fs.writeFileSync(
    path.join(tempRoot, 'app.js'),
    "const { deleteUserPlantCompletely } = require('./plant-deletion-service')\n"
  )
  const unsafe = auditFunctionPackage('plant-user-http', tempRoot)
  assert.equal(
    unsafe.startup_dependency_violations[0]?.code,
    'plant_read_path_private_write_dependency'
  )
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('root-cause governance contracts passed data_mode=unit_fake test_kind=source_contract')
