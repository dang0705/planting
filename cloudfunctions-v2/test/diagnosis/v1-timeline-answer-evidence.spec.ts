import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validateV1SubmissionEvidence } from '../../src/diagnosis/domain/validate-v1-submission-evidence.js'

// L1 unit_fake：独立Expected来自timeline-answer-contract.md与用户的V1复用范围。
// 纯证据准入；没有数据库、HTTP、Provider或实际养护事件写入。
const q = { questionKey: 'watering', uiVariant: 'care_behavior_timeline', options: [{ optionKey: 'unknown' }] }
const pack = { mode: 'yellow_leaf', questionCount: 1, packageQuestions: [q] }
const timeline = { reference_date: '2026-10-04', watering_events_10d: [{ date: '2026-10-03', watered: true, amountMl: null }],
  fertilizing_events_10d: [], light_change_events_10d: [], last_fertilized_bucket: 'unknown' }
function request(value: unknown = timeline) {
  return { requestMode: 'answer_submit', answers: [{ questionKey: 'watering', optionKey: 'care_behavior_timeline' }], careBehaviorTimeline: value }
}

describe('时间线与整包证据准入', () => {
  it('保留未知浇水量，不补默认量或零；输出冻结', () => {
    const result = validateV1SubmissionEvidence(pack, request())
    expect(result).toMatchObject({ status: 'valid_submission_evidence', timeline: { referenceDate: '2026-10-04',
      wateringEvents: [{ date: '2026-10-03', watered: true, amountMl: null, amount: null }] } })
    if (result.status !== 'valid_submission_evidence') { throw new Error('预期证据通过') }
    expect(Object.isFrozen(result.timeline!.wateringEvents)).toBe(true)
  })
  it('兼容V1 camelCase列表且移除客户端内部字段', () => {
    const result = validateV1SubmissionEvidence(pack, request({ referenceDate: '2026-10-04',
      wateringEvents10d: [{ date: '2026-10-03', watered: true, amount: 'normal', amountMl: 100, id: 'secret', planId: 'internal' }] }))
    expect(result).toMatchObject({ status: 'valid_submission_evidence', timeline: { wateringEvents: [{ amountMl: 100, amount: 'normal' }] } })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('internal')
  })
  it.each([null, {}, { reference_date: '2026-10-04' }, { ...timeline, reference_date: null },
    { ...timeline, reference_date: '2026-02-30' }, { ...timeline, watering_events_10d: [{}] },
    { ...timeline, watering_events_10d: [{ date: '2026-10-05' }] },
    { ...timeline, watering_events_10d: [{ date: '2026-10-03', watered: false, amountMl: 100 }] },
    { ...timeline, watering_events_10d: [{ date: '2026-10-03', amountMl: '100' }] },
    { ...timeline, watering_events_10d: [{ date: '2026-10-03', amountMl: -1 }] }])('缺失、空或非法时间线拒绝：%j', value => {
    expect(validateV1SubmissionEvidence(pack, request(value)).status).toBe('invalid_timeline_evidence')
  })
  it('同日相同事件去重，冲突事件和别名冲突拒绝', () => {
    expect(validateV1SubmissionEvidence(pack, request({ ...timeline, watering_events_10d: [...timeline.watering_events_10d, ...timeline.watering_events_10d] })).status).toBe('valid_submission_evidence')
    expect(validateV1SubmissionEvidence(pack, request({ ...timeline, watering_events_10d: [...timeline.watering_events_10d,
      { date: '2026-10-03', watered: true, amountMl: 100 }] })).status).toBe('invalid_timeline_evidence')
    expect(validateV1SubmissionEvidence(pack, request({ ...timeline, referenceDate: '2026-10-03' })).status).toBe('invalid_timeline_evidence')
  })
  it('每日明确未浇水保留为false；缺行为的每日天气不充当时间线', () => {
    expect(validateV1SubmissionEvidence(pack, request({ referenceDate: '2026-10-04', dailyRecords: [{ date: '2026-10-03', watered: false }] }))).toMatchObject({
      status: 'valid_submission_evidence', timeline: { dailyRecords: [{ date: '2026-10-03', watered: false, fertilized: null }] }
    })
    expect(validateV1SubmissionEvidence(pack, request({ referenceDate: '2026-10-04', dailyRecords: [{ date: '2026-10-03', humidity: 50 }] })).status).toBe('invalid_timeline_evidence')
  })
  it('同日事件与每日未发生声明互相冲突时拒绝', () => {
    expect(validateV1SubmissionEvidence(pack, request({ ...timeline, dailyRecords: [{ date: '2026-10-03', watered: false }] })).status).toBe('invalid_timeline_evidence')
  })
  it('已知施肥时间段或明确光照事件可以作为历史证据', () => {
    expect(validateV1SubmissionEvidence(pack, request({ referenceDate: '2026-10-04', lastFertilizedBucket: 'almost_never' })).status).toBe('valid_submission_evidence')
    expect(validateV1SubmissionEvidence(pack, request({ referenceDate: '2026-10-04', lightChangeEvents10d: [{ date: '2026-10-02', event: 'moved_to_weaker_light' }] })).status).toBe('valid_submission_evidence')
  })
  it('未知答案不消费附加时间线；客户端题包不能授权', () => {
    expect(validateV1SubmissionEvidence(pack, { requestMode: 'answer_submit', answers: [{ questionKey: 'watering', optionKey: 'unknown' }] })).toMatchObject({ status: 'valid_submission_evidence', timeline: null })
    expect(validateV1SubmissionEvidence(pack, { ...request(), answers: [{ questionKey: 'watering', optionKey: 'unknown' }] }).status).toBe('invalid_timeline_evidence')
    expect(validateV1SubmissionEvidence({ ...pack, packageQuestions: [{ ...q, uiVariant: '' }] }, { ...request(), questionPackage: pack }).status).toBe('invalid_answers')
  })
  it('两种顶层别名必须一致；空事件列表不能证明没有浇水', () => {
    expect(validateV1SubmissionEvidence(pack, { ...request(), care_behavior_timeline: timeline }).status).toBe('valid_submission_evidence')
    expect(validateV1SubmissionEvidence(pack, { ...request(), care_behavior_timeline: { ...timeline, reference_date: '2026-10-03' } }).status).toBe('invalid_timeline_evidence')
    expect(validateV1SubmissionEvidence(pack, request({ ...timeline, watering_events_10d: [] })).status).toBe('invalid_timeline_evidence')
  })
})

// L3 unit_real_data：真实V1完整题目制品→成员授权→空气与时间线复合校验，无运行数据库。
describe('复用完整固定题包的提交证据', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'), 'utf8'))
  it.each(['yellow_leaf', 'wilting_droop'])('%s不允许先校验空气就跳过浇水时间线', mode => {
    const questions = catalog.fixed[mode] as { questionKey: string; uiVariant: string; options: { optionKey: string }[] }[]
    const fullPack = { mode, questionCount: questions.length, packageQuestions: questions }
    const submitted = { ...request(), answers: questions.map(question => ({ questionKey: question.questionKey,
      optionKey: question.uiVariant === 'care_behavior_timeline' ? 'care_behavior_timeline'
        : question.uiVariant === 'air_environment' ? 'air_environment_unknown' : question.options[0]!.optionKey })) }
    expect(validateV1SubmissionEvidence(fullPack, submitted).status).toBe('valid_submission_evidence')
    expect(validateV1SubmissionEvidence(fullPack, { ...submitted, careBehaviorTimeline: null }).status).toBe('invalid_timeline_evidence')
  })
})
