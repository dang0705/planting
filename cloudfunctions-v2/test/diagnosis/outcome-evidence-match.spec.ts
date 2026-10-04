import { expect, test } from 'vitest'
import { matchOutcomeEvidence } from '../../src/diagnosis/domain/match-outcome-evidence.js'
/** L1/unit_fake：Expected来自候选Schema明确字段和独立证据匹配合同；归一观察替身，不证明实际视觉、归属或园艺结论。 */
const condition = (
  evidenceCode: string,
  findingCode: string,
  sourceKind = 'answer',
  affectedPartCodes = ['leaf']
) => ({ evidenceCode, findingCode, sourceKind, affectedPartCodes })
const finding = (
  evidenceRef: string,
  findingCode: string,
  sourceKind = 'answer',
  affectedPartCodes = ['leaf']
) => ({ evidenceRef, findingCode, sourceKind, affectedPartCodes })
test('必需条件全部满足，保留每条条件对应证据，引用稳定去重', () => {
  const rules = {
      required: [
        condition('yellow-observation', 'yellow'),
        condition('soil-wet', 'wet', 'care_fact', ['root_zone'])
      ],
      supporting: [],
      opposing: []
    },
    facts = [
      finding('answer-b', 'yellow'),
      finding('answer-a', 'yellow'),
      finding('answer-a', 'yellow'),
      finding('soil-a', 'wet', 'care_fact', ['root_zone'])
    ]
  const expected = {
    status: 'requirements_met',
    required: [
      { evidenceCode: 'yellow-observation', evidenceRefs: ['answer-a', 'answer-b'] },
      { evidenceCode: 'soil-wet', evidenceRefs: ['soil-a'] }
    ],
    supporting: [],
    opposing: [],
    missingRequiredCodes: []
  }
  expect(matchOutcomeEvidence(rules, facts)).toEqual(expected)
  expect(matchOutcomeEvidence(rules, [...facts].reverse())).toEqual(expected)
})
test('来源和部位不能互换；支持条件不补足缺失必需证据', () => {
  const rules = {
    required: [condition('soil', 'wet', 'care_fact', ['root_zone'])],
    supporting: [condition('yellow', 'yellow')],
    opposing: []
  }
  expect(
    matchOutcomeEvidence(rules, [
      finding('surface-photo', 'wet', 'visual', ['leaf']),
      finding('answer', 'yellow')
    ])
  ).toEqual({
    status: 'insufficient_evidence',
    required: [{ evidenceCode: 'soil', evidenceRefs: [] }],
    supporting: [{ evidenceCode: 'yellow', evidenceRefs: ['answer'] }],
    opposing: [],
    missingRequiredCodes: ['soil']
  })
  expect(matchOutcomeEvidence(rules, [finding('no-part', 'wet', 'care_fact', [])])).toMatchObject({
    status: 'insufficient_evidence',
    missingRequiredCodes: ['soil']
  })
})
test('同观察同部位仍须保持来源类别，不能把视觉声明当养护事实', () => {
  const rules = {
    required: [condition('soil', 'wet', 'care_fact', ['root_zone'])],
    supporting: [],
    opposing: []
  }
  expect(
    matchOutcomeEvidence(rules, [finding('photo', 'wet', 'visual', ['root_zone'])])
  ).toMatchObject({ status: 'insufficient_evidence' })
  expect(
    matchOutcomeEvidence(rules, [finding('fact', 'wet', 'care_fact', ['root_zone'])])
  ).toMatchObject({ status: 'requirements_met' })
})
test('已命中反驳优先返回冲突，不以必需条件满足或支持数抵消', () => {
  const rules = {
    required: [condition('yellow', 'yellow')],
    supporting: [],
    opposing: [condition('green', 'green', 'visual')]
  }
  expect(
    matchOutcomeEvidence(rules, [finding('a', 'yellow'), finding('v', 'green', 'visual')])
  ).toMatchObject({
    status: 'conflicting_evidence',
    opposing: [{ evidenceCode: 'green', evidenceRefs: ['v'] }]
  })
})
test('空部位不限制，范围相交可命中；空规则不自动选择结论', () => {
  expect(
    matchOutcomeEvidence(
      { required: [condition('x', 'yellow', 'answer', [])], supporting: [], opposing: [] },
      [finding('a', 'yellow', 'answer', [])]
    )
  ).toMatchObject({ status: 'requirements_met' })
  expect(
    matchOutcomeEvidence(
      {
        required: [condition('x', 'yellow', 'answer', ['leaf', 'stem'])],
        supporting: [],
        opposing: []
      },
      [finding('a', 'yellow')]
    )
  ).toMatchObject({ status: 'requirements_met' })
  expect(matchOutcomeEvidence({ required: [], supporting: [], opposing: [] }, [])).toEqual({
    status: 'requirements_met',
    required: [],
    supporting: [],
    opposing: [],
    missingRequiredCodes: []
  })
})
test('非法字段、来源、重复条件或空代码拒绝，不由自由文字猜观察代码', () => {
  const good = { required: [condition('x', 'yellow')], supporting: [], opposing: [] }
  for (const facts of [
    [{ ...finding('a', 'yellow'), sourceKind: 'model_guess' }],
    [{ ...finding('a', 'yellow'), findingCode: '' }],
    [{ ...finding('a', 'yellow'), text: '猜测' }]
  ]) {
    expect(() => matchOutcomeEvidence(good, facts)).toThrow(TypeError)
  }
  expect(() =>
    matchOutcomeEvidence(
      { ...good, required: [condition('x', 'yellow'), condition('x', 'green')] },
      []
    )
  ).toThrow(TypeError)
  expect(() => matchOutcomeEvidence({ ...good, extra: true }, [])).toThrow(TypeError)
})
