import { expect, test, vi } from 'vitest'
import { createMysqlDiagnosisVisualEvidenceRepository } from '../../src/diagnosis/repository/mysql-diagnosis-visual-evidence-repository.js'
/** unit_fake/L3：端口替身；Expected来自003资产归属、004视觉表及原子创建合同，不证明真实SQL或Provider。 */
const query = {
  userRef: 'usr_owner123',
  userPlantRef: 'upl_owner123',
  assetRef: 'upa_owner123',
  startedAtMs: 1500
}
const model = {
  contractVersion: 'diagnosis-model-output/v1',
  evidence: [
    { evidenceKey: 'obs1', source: 'visual', observation: '叶背可见小虫', confidence: 'medium' }
  ],
  conclusionCandidates: [
    {
      candidateKey: 'whitefly',
      summary: '白粉虱候选',
      confidence: 'medium',
      supportingEvidenceKeys: ['obs1']
    }
  ],
  uncertainty: { level: 'medium', reasons: [], missingEvidence: [] },
  recommendedActions: [
    {
      actionKey: 'inspect',
      instruction: '检查其他叶背',
      purpose: '补充观察',
      requiresUserConfirmation: true,
      producesCareFact: false,
      producesCarePlan: false
    }
  ]
}
const value = {
  ...query,
  diagnosisRef: 'dia_owner123',
  evidenceRef: 'dve_owner123',
  assetContentSha256: 'a'.repeat(64),
  evidenceKind: 'leaf' as const,
  output: model,
  createdAtMs: 1500,
  expiresAtMs: 2000
}
function harness(
  rows: any[] = [
    {
      asset_ref: query.assetRef,
      content_hash: 'a'.repeat(64),
      cleanup_after_ms: null,
      asset_openid: '',
      user_openid: '',
      plant_openid: ''
    }
  ]
) {
  const queryFn = vi.fn(async (_sql: string, _params: readonly unknown[]) => rows),
    execute = vi.fn(async (_sql: string, _params: readonly unknown[]) => ({
      affectedRows: 1,
      insertId: 1
    }))
  const tx = { transactionContext: true as const, connection: { query: queryFn, execute } } as any
  return { tx, query: queryFn, execute, repo: createMysqlDiagnosisVisualEvidenceRepository() }
}
test('原事务只读取确切资产内容摘要，不返回私有文件ID', async () => {
  const f = harness(),
    r = await f.repo.readOwnedAsset(f.tx, query)
  expect(r).toEqual({ status: 'found', assetRef: query.assetRef, contentSha256: 'a'.repeat(64) })
  expect(f.query.mock.calls[0]![1]).toEqual([query.userRef, query.userPlantRef, query.assetRef])
  expect(f.query.mock.calls[0]![0]).toContain('FOR SHARE')
})
test.each([
  [[]],
  [
    [
      {
        asset_ref: query.assetRef,
        content_hash: 'bad',
        cleanup_after_ms: null,
        asset_openid: '',
        user_openid: '',
        plant_openid: ''
      }
    ]
  ]
])('不存在或损坏资产不准入', async rows => {
  const f = harness(rows)
  expect((await f.repo.readOwnedAsset(f.tx, query)).status).not.toBe('found')
})
test('精确视觉保存与已有会话/资产归属关联，参数包含SHA，JSON不含私有链接', async () => {
  const f = harness()
  expect(await f.repo.append(f.tx, value)).toBe('created')
  const [sql, params] = f.execute.mock.calls[0]!
  expect(sql).toContain('INSERT INTO diagnosis_visual_evidence')
  expect(sql).toContain('a.content_hash')
  expect(params).toContain(value.assetContentSha256)
  expect(JSON.stringify(params)).not.toContain('storage_file_id')
})
test('归属竞争失去目标不伪装创建成功', async () => {
  const f = harness()
  f.execute.mockResolvedValueOnce({ affectedRows: 0, insertId: 0 })
  expect(await f.repo.append(f.tx, value)).toBe('not_found')
})
test.each([
  { expiresAtMs: 1500 },
  { createdAtMs: NaN },
  { assetContentSha256: 'bad' },
  { evidenceKind: 'unknown' },
  { output: { raw: 'provider' } }
])('非法写入不触碰SQL %j', async extra => {
  const f = harness()
  await expect(f.repo.append(f.tx, { ...value, ...extra } as any)).rejects.toThrow()
  expect(f.execute).not.toHaveBeenCalled()
})
