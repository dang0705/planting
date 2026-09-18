#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  qaBackendTargetEvidence,
  qaBackendTargetMatches,
  resolveQaBackendTarget,
  QA_ONLINE_TARGET
} from '../../../../../scripts/qa/qa-backend-target.mjs'
import {
  resolveQaCatalogBackendTarget,
  resolveQaWxRequestUrl
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-run.mjs'
import { validateCatalog } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/catalog.mjs'
import { formalAutomatorEndpoint } from '../../../automator/_shared/formal-leaf-harness.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const performanceLeaf = fs.readFileSync(
  path.join(repoRoot, 'test/e2e/automator/diagnosis/diagnosis-answer-performance.mjs'),
  'utf8'
)
const diagnosisLeaf = fs.readFileSync(
  path.join(repoRoot, 'test/e2e/automator/diagnosis/diagnose-yellowing-mcp.mjs'),
  'utf8'
)
const fertilizationFixture = fs.readFileSync(
  path.join(repoRoot, 'test/e2e/automator/_shared/fertilization-reminder-fixture.mjs'),
  'utf8'
)
const supervisorSource = fs.readFileSync(
  path.join(repoRoot, 'scripts/qa/automator-supervisor.mjs'),
  'utf8'
)
const runtimeSource = fs.readFileSync(
  path.join(repoRoot, 'scripts/qa/automator-runtime.mjs'),
  'utf8'
)
const catalogReport = validateCatalog()

const onlineEnvironment = {
  QA_BACKEND_MODE: 'online'
}
const onlineWithCanonicalAliases = {
  ...onlineEnvironment,
  QA_ONLINE_API_BASE_URL: QA_ONLINE_TARGET.apiGatewayBaseUrl,
  QA_ONLINE_HTTP_FUNCTION_BASE_URL: QA_ONLINE_TARGET.httpFunctionBaseUrl,
  VITE_PUBLIC_HTTP_FUNCTION_BASE_URL: QA_ONLINE_TARGET.httpFunctionBaseUrl
}

const target = resolveQaBackendTarget(onlineEnvironment)
assert.equal(target.mode, 'online')
assert.equal(target.environmentId, QA_ONLINE_TARGET.environmentId)
assert.equal(target.baseUrl, QA_ONLINE_TARGET.httpFunctionBaseUrl)
assert.equal(target.apiGatewayBaseUrl, QA_ONLINE_TARGET.apiGatewayBaseUrl)
assert.equal(
  target.wxRequestUrl,
  `${QA_ONLINE_TARGET.httpFunctionBaseUrl}/plant-user-http/user-plants?page=1&pageSize=1`
)
const targetEvidence = qaBackendTargetEvidence(target)
assert.equal(targetEvidence.base_url, target.baseUrl)
assert.equal(targetEvidence.wx_request_url, target.wxRequestUrl)
assert.equal(
  qaBackendTargetMatches(targetEvidence, target),
  true,
  'supervisor 必须持久化并复核完整 canonical target'
)
assert.equal(
  qaBackendTargetMatches({ ...targetEvidence, base_url: `${target.baseUrl}/wrong-target` }, target),
  false,
  '旧或被改写的请求地址不得被 fast probe 复用'
)

assert.deepEqual(
  resolveQaBackendTarget(onlineWithCanonicalAliases),
  target,
  '正确的环境变量只能作为 canonical target 一致性校验'
)
assert.throws(
  () =>
    resolveQaBackendTarget({
      ...onlineEnvironment,
      QA_ONLINE_API_BASE_URL: 'https://cloud1-2grufevs395a9d5e.api.tcloudbase.com/v1/functions'
    }),
  error => error?.code === 'qa_online_api_base_url_must_be_gateway'
)
assert.throws(
  () =>
    resolveQaBackendTarget({
      ...onlineEnvironment,
      QA_ONLINE_API_BASE_URL: 'https://other-env.api.tcloudbasegateway.com/v1/functions'
    }),
  error => error?.code === 'qa_online_api_base_url_mismatch'
)
assert.throws(
  () =>
    resolveQaBackendTarget({
      ...onlineEnvironment,
      VITE_PUBLIC_HTTP_FUNCTION_BASE_URL: 'https://other.example.test'
    }),
  error => error?.code === 'qa_online_http_function_base_url_mismatch'
)
assert.throws(
  () =>
    resolveQaCatalogBackendTarget(
      { requirements: { backend_mode: 'online' } },
      { QA_BACKEND_MODE: 'lan', CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP: '192.168.50.80' }
    ),
  error => error?.code === 'qa_catalog_backend_mode_mismatch'
)
assert.equal(
  resolveQaCatalogBackendTarget({ requirements: { backend_mode: 'online' } }, onlineEnvironment)
    .mode,
  'online'
)
assert.equal(
  resolveQaWxRequestUrl('', onlineEnvironment, { formal: true }).url,
  target.wxRequestUrl
)
assert.throws(
  () => formalAutomatorEndpoint({ MINIPROGRAM_AUTOMATOR_WS: 'ws://127.0.0.1:9420' }),
  error => error?.code === 'formal_automator_endpoint_unverified'
)
assert.deepEqual(catalogReport, {
  status: 'passed',
  gate: 'e2e_catalog',
  catalog_path: 'test/e2e/automator/catalog.json',
  entries: catalogReport.entries,
  discovered_executable_leaves: catalogReport.discovered_executable_leaves,
  warnings: catalogReport.warnings,
  errors: []
})

assert.match(performanceLeaf, /resolveQaBackendTarget/u)
assert.doesNotMatch(performanceLeaf, /environment\.QA_ONLINE_API_BASE_URL/u)
assert.doesNotMatch(performanceLeaf, /VITE_PUBLIC_HTTP_FUNCTION_BASE_URL/u)
assert.match(performanceLeaf, /backendTarget\?\.mode === 'online'/u)
assert.match(diagnosisLeaf, /resolveQaBackendTarget/u)
assert.doesNotMatch(diagnosisLeaf, /process\.env\.QA_ONLINE_API_BASE_URL/u)
assert.match(fertilizationFixture, /resolveQaBackendTarget/u)
assert.doesNotMatch(fertilizationFixture, /process\.env\.QA_ONLINE_API_BASE_URL/u)
assert.match(supervisorSource, /backend target 闸门/u)
assert.match(supervisorSource, /profile 认证闸门/u)
assert.match(supervisorSource, /bootstrap_gates/u)
assert.match(supervisorSource, /qa_supervisor_backend_target_mismatch/u)
assert.match(runtimeSource, /启动任何 DevTools\/Automator 进程前/u)
assert.match(runtimeSource, /supervisorTargetMatches/u)

console.log('QA root target/auth/runtime guard contracts passed')
