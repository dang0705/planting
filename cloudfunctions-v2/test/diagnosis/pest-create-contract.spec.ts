import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
import { projectPestDiagnosisCreationResponse } from '../../src/diagnosis/http/pest-create-session-contract.js'
/** unit_real_data/L1：V1批准题目制品与pest-create-http-contract.md；不证明真实Provider。 */
const raw = JSON.parse(
  readFileSync(
    join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),
    'utf8'
  )
)
test('真实V1虫害题目保持安全提示并严格脱敏', () => {
  const snapshot = lockQuestionPackageSnapshot({
    mode: 'specific_pest_visual',
    questionCount: 1,
    questionPackageReleaseRef: 'bpr_pest12345',
    packageQuestions: [
      raw.pestQuestions.find((q: { packageTopic: string }) => q.packageTopic === 'whitefly_adults')
    ]
  })
  const r = projectPestDiagnosisCreationResponse({
    status: 'created',
    diagnosisRef: 'dia_example123',
    snapshot
  })
  expect(r.status).toBe(200)
  const data = (r.body as any).data
  expect(data.mode).toBe('specific_pest_visual')
  expect(data.questionPackage.questionCount).toBe(1)
  expect(data.questionPackage.questions[0].requiresExplicitConsent).toBe(true)
  expect(data.questionPackage.questions[0].skipOptionEnabled).toBe(true)
  expect(JSON.stringify(r)).not.toMatch(
    /bpr_pest12345|snapshotSha256|routeKey|mapsToModes|assetRef|supportingEvidenceKeys/
  )
})
test.each(['no_questions', 'unavailable'] as const)('%s不能成为空题包或自动确诊', status => {
  const r = projectPestDiagnosisCreationResponse({ status })
  expect(r.status).toBe(503)
  expect(r.body).toEqual({
    error: { type: 'SERVICE_UNAVAILABLE', message: '题包或诊断结果暂时不可用' }
  })
})
test('不存在的归属对象固定404', () => {
  expect(projectPestDiagnosisCreationResponse({ status: 'not_found' })).toEqual({
    status: 404,
    body: { error: { type: 'NOT_FOUND', message: '用户植物不存在' } }
  })
})
