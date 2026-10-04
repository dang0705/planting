import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'

/** unit_real_data / L1：来自已批准V1复用内容和快照合同；不证明发布、归属或数据库。 */
const catalog = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'), 'utf8')) as {
  fixed: { yellow_leaf: Record<string, unknown>[] }
}
function input() {
  return { questionPackageReleaseRef: 'question-yellow/v1', mode: 'yellow_leaf', questionCount: 4,
    packageQuestions: structuredClone(catalog.fixed.yellow_leaf) }
}

describe('锁定本次题包完整快照', () => {
  test('保持完整内容与数组顺序，返回递归冻结快照和可重算摘要', () => {
    const value = input()
    const result = lockQuestionPackageSnapshot(value)
    expect(result.snapshot).toEqual({ contractVersion: 'diagnosis-question-package-snapshot/v1', ...value })
    expect(result.snapshotSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(Object.isFrozen(result.snapshot.packageQuestions)).toBe(true)
    expect(Object.isFrozen(result.snapshot.packageQuestions[0])).toBe(true)
    value.packageQuestions[0]!.questionText = '事后篡改'
    expect(result.snapshot.packageQuestions[0]!.questionText).toBe('最近 2 周，你的浇水情况更接近哪一种？')
  })
  test('题目、选项、风险说明与发布引用都参与摘要', () => {
    const original = lockQuestionPackageSnapshot(input()).snapshotSha256
    for (const field of ['questionText', 'helpText', 'riskNotice']) {
      const value = input(); value.packageQuestions[0]![field] = '改动后的说明'
      expect(lockQuestionPackageSnapshot(value).snapshotSha256).not.toBe(original)
    }
    expect(lockQuestionPackageSnapshot({ ...input(), questionPackageReleaseRef: 'other-release' }).snapshotSha256).not.toBe(original)
  })
  test('虫害零题可锁定用于直判，不变成可作答的固定包', () => {
    expect(lockQuestionPackageSnapshot({ questionPackageReleaseRef: 'pest/v1', mode: 'specific_pest_visual', questionCount: 0, packageQuestions: [] }).snapshot.questionCount).toBe(0)
  })
  test.each([
    { ...input(), questionPackageReleaseRef: '' }, { ...input(), questionPackageReleaseRef: 'x'.repeat(65) },
    { ...input(), mode: 'root_rot' }, { ...input(), questionCount: 3 },
    { ...input(), packageQuestions: new Date() }, { ...input(), extra: undefined },
  ])('非法或非JSON输入拒绝，不偷偷改变内容%#', value => {
    expect(() => lockQuestionPackageSnapshot(value)).toThrow()
  })
})
