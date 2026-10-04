import { expect, test, vi } from 'vitest'
import { validateDiagnosisModelOutput } from '../../src/diagnosis/domain/validate-diagnosis-model-output.js'
import { createMysqlOwnedVisualEvidenceReader } from '../../src/diagnosis/repository/mysql-owned-visual-evidence-reader.js'
/** unit_fake / L1与L3：Expected来自已确认Schema、004/003归属约束和本增量合同；SQL连接是替身，不证明真实数据库或模型。 */
export function output() {
  return {
    contractVersion: 'diagnosis-model-output/v1',
    evidence: [
      {
        evidenceKey: 'obs1',
        source: 'visual',
        observation: '叶背存在白色小虫',
        confidence: 'medium'
      }
    ],
    conclusionCandidates: [
      {
        candidateKey: 'whitefly',
        summary: '白粉虱候选',
        confidence: 'medium',
        supportingEvidenceKeys: ['obs1']
      }
    ],
    uncertainty: {
      level: 'medium',
      reasons: ['照片只覆盖局部叶片'],
      missingEvidence: ['其他叶片']
    },
    recommendedActions: [
      {
        actionKey: 'inspect',
        instruction: '观察其他叶背',
        purpose: '补充证据',
        requiresUserConfirmation: true,
        producesCareFact: false,
        producesCarePlan: false
      }
    ]
  }
}
const input = {
  userRef: 'usr_owner123',
  userPlantRef: 'upl_owner123',
  diagnosisRef: 'dia_owner123',
  evidenceRef: 'dve_owner123',
  modelContractVersion: 'diagnosis-model-output/v1',
  capturedAtMs: 1500
}
function row() {
  return {
    evidence_ref: input.evidenceRef,
    model_contract_version: input.modelContractVersion,
    evidence_json: output(),
    evidence_kind: 'leaf',
    created_at_ms: '1000',
    expires_at_ms: '2000',
    cleanup_after_ms: null,
    evidence_openid: '',
    asset_openid: '',
    session_openid: '',
    user_openid: '',
    plant_openid: ''
  }
}
function harness(rows: readonly Record<string, unknown>[] = [row()]) {
  const query = vi.fn(async (_sql: string, _parameters: readonly unknown[]) => rows)
  const tx = { transactionContext: true as const, connection: { query } } as any
  return { query, tx, read: createMysqlOwnedVisualEvidenceReader().read }
}
test('按已有Schema接受候选与建议，复制冻结且不变成可信档位', () => {
  const original = output(),
    result = validateDiagnosisModelOutput(original)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') {
    throw new Error('未通过')
  }
  expect(result.output).toEqual(original)
  expect(Object.isFrozen(result.output.evidence)).toBe(true)
  original.evidence[0]!.observation = '被改写'
  expect(result.output.evidence).not.toEqual(original.evidence)
  expect(result.output).not.toHaveProperty('tier')
})
test.each([
  'duplicate_evidence',
  'duplicate_candidate',
  'dangling',
  'text_only',
  'raw',
  'action',
  'unknown_version'
])('拒绝歧义、越权及错误合同：%s', variant => {
  const value: any = output()
  if (variant === 'duplicate_evidence') {
    value.evidence.push(value.evidence[0])
  }
  if (variant === 'duplicate_candidate') {
    value.conclusionCandidates.push(value.conclusionCandidates[0])
  }
  if (variant === 'dangling') {
    value.conclusionCandidates[0].supportingEvidenceKeys = ['missing']
  }
  if (variant === 'text_only') {
    value.evidence[0].source = 'text'
  }
  if (variant === 'raw') {
    value.rawModelOutput = '供应商原文'
  }
  if (variant === 'action') {
    value.recommendedActions[0].producesCareFact = true
  }
  if (variant === 'unknown_version') {
    value.contractVersion = 'v999'
  }
  expect(validateDiagnosisModelOutput(value)).toEqual({ status: 'invalid' })
})
test('同事务读取归属证据，输出没有资产、数据库键或URL', async () => {
  const f = harness(),
    r = await f.read(f.tx, input)
  expect(r).toEqual({
    status: 'found',
    evidenceRef: input.evidenceRef,
    evidenceKind: 'leaf',
    modelContractVersion: input.modelContractVersion,
    output: output()
  })
  expect(f.query.mock.calls[0]![1]).toEqual([
    input.userRef,
    input.userPlantRef,
    input.diagnosisRef,
    input.evidenceRef
  ])
  expect(f.query.mock.calls[0]![0]).toContain('FOR SHARE')
  expect(JSON.stringify(r)).not.toMatch(/storage_file_id|internal_id|openid|https:/)
})
test('无归属与重复数据不伪装成功', async () => {
  const a = harness([]),
    b = harness([row(), row()])
  expect(await a.read(a.tx, input)).toEqual({ status: 'not_found' })
  expect(await b.read(b.tx, input)).toEqual({ status: 'invalid' })
})
test.each([
  { expires_at_ms: '1500' },
  { created_at_ms: '1501' },
  { expires_at_ms: '1000' },
  { created_at_ms: '01' },
  { cleanup_after_ms: '1500' },
  { cleanup_after_ms: '9007199254740993' },
  { model_contract_version: 'v2' },
  { evidence_kind: 'unknown' },
  { evidence_openid: 'platform' },
  { asset_openid: 'platform' },
  { session_openid: 'platform' },
  { user_openid: 'platform' },
  { plant_openid: 'platform' },
  { evidence_json: { raw: 'model' } }
])('不接受过期、未来、损坏或不兼容证据 %j', async extra => {
  const f = harness([{ ...row(), ...extra }])
  expect((await f.read(f.tx, input)).status).not.toBe('found')
})
test.each([NaN, -1, 1.5, 8640000000000001])('非法服务端时间不执行SQL：%s', async capturedAtMs => {
  const f = harness()
  await expect(f.read(f.tx, { ...input, capturedAtMs })).rejects.toThrow()
  expect(f.query).not.toHaveBeenCalled()
})
test('错误引用与未知版本不执行SQL；必须使用原事务', async () => {
  const f = harness()
  for (const extra of [
    { userRef: ' usr_owner123' },
    { evidenceRef: '' },
    { modelContractVersion: 'v2' }
  ]) {
    await expect(f.read(f.tx, { ...input, ...extra })).rejects.toThrow()
  }
  await expect(f.read({ transactionContext: false } as any, input)).rejects.toThrow()
  expect(f.query).not.toHaveBeenCalled()
})
