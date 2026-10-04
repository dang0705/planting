import { serializeCanonicalJson, type CanonicalJsonObject, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { validateV1PackageAnswerMembership } from './validate-v1-package-answer-membership.js'

/** 空气题的已校验内容；申报来源不构成服务端保存证明。 */
export interface AirAnswerEvidence {
  /** 纯JSON的规范化V1表单，不包含客户端算法结果或元数据。 */
  readonly input: CanonicalJsonObject
  /** 客户端申报的采集方式，上层须核验真实档案引用。 */
  readonly declaredSource: string
  /** 明确阻止将客户端来源当作服务端核验结果。 */
  readonly sourceVerification: 'unverified_client_declaration'
}

/** 只代表空气证据通过，不代表时间线、归属、发布或整个提交通过。 */
export type AirAnswerEvidenceValidation = {
  /** 无效成员与无效空气证据分别失败关闭。 */
  readonly status: 'invalid_snapshot' | 'invalid_answers' | 'not_answerable' | 'invalid_air_evidence'
} | {
  /** 空气复合证据结构及两份输入一致性通过。 */
  readonly status: 'valid_air_evidence'
  /** 只含服务端题包授权题目，按题目代码索引。 */
  readonly byQuestionId: Readonly<Record<string, AirAnswerEvidence>>
}

/** 拒绝数组和自定义类，不进行字符串或对象隐式转换。 */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

/** V1枚举必须为明确字符串；不接收对象的toString结果。 */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 获取V1集合字段；未知设备不能作为可靠来源。 */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : []
}

/** 规范化V1详细表单，不沿用旧环境倍率。 */
function advanced(value: unknown): CanonicalJsonObject | null {
  if (!record(value) || !record(value.airExchange) || !record(value.deviceAirflow)) {return null}
  const source = text(value.airExchange.source)
  if (!['window', 'fresh_air', 'unknown'].includes(source)) {return null}
  let direction: string | null = null
  let frequency: string | null = null
  if (source === 'window') {
    direction = text(value.airExchange.windowDirectionCount)
    if (!['one', 'two_or_more', 'closed'].includes(direction)) {return null}
    frequency = text(value.airExchange.windowOpenFrequency)
    if (direction === 'closed') { direction = 'one'; frequency = 'almost_never' }
    else if (!['daily', 'every_other_day', 'weekly_1_2', 'almost_never'].includes(frequency)) {return null}
  }
  const openness = text(value.canopyOpenness)
  if (!['open', 'partial', 'enclosed', 'unknown'].includes(openness)) {return null}
  const mode = text(value.deviceAirflow.mode)
  if (!['none', 'circulating', 'direct', 'unknown'].includes(mode)) {return null}
  const allowed = (name: string): boolean => ['fan', 'air_conditioner', 'fresh_air'].includes(name)
    && (name !== 'fresh_air' || source === 'fresh_air')
  let sources = strings(value.deviceAirflow.sources).filter(allowed)
  if (source === 'fresh_air' && ['circulating', 'direct'].includes(mode)) {sources = [...new Set(['fresh_air', ...sources])]}
  if (['none', 'unknown'].includes(mode)) {sources = []}
  const directSources = strings(value.deviceAirflow.directSources).filter(name => sources.includes(name))
  let sourceModes: Record<string, string>
  if (['none', 'unknown'].includes(mode)) {sourceModes = {}}
  else if (record(value.deviceAirflow.sourceModes)) {
    sourceModes = Object.fromEntries(Object.entries(value.deviceAirflow.sourceModes)
      .map(([name, item]) => [text(name), text(item)])
      .filter(([name, item]) => allowed(name!) && ['circulating', 'direct'].includes(item!)))
    if (source === 'fresh_air') {sourceModes = { fresh_air: 'circulating', ...sourceModes }}
  } else {
    if (mode === 'direct' && directSources.length === 0) {return null}
    sourceModes = Object.fromEntries(sources.map(name => [name, directSources.includes(name) ? 'direct' : 'circulating']))
  }
  const effectiveSources = Object.keys(sourceModes)
  const effectiveDirectSources = effectiveSources.filter(name => sourceModes[name] === 'direct')
  const effectiveMode = effectiveDirectSources.length ? 'direct' : effectiveSources.length ? 'circulating' : mode
  if (['direct', 'circulating'].includes(effectiveMode) && !effectiveSources.length) {return null}
  if (effectiveMode === 'direct' && !effectiveDirectSources.length) {return null}
  return { airExchange: { source, windowDirectionCount: direction, windowOpenFrequency: frequency },
    canopyOpenness: openness, deviceAirflow: { mode: effectiveMode, sources: effectiveSources,
      directSources: effectiveDirectSources, sourceModes } }
}

/** 保留两种V1表单；结构版本使用明确数值，不强制转换。 */
function assessment(value: unknown): CanonicalJsonObject | null {
  if (!record(value)) {return null}
  if (value.schemaVersion === undefined) {return advanced(value)}
  if (value.schemaVersion !== 3) {return null}
  if (value.mode === 'quick') {
    if (!record(value.quickAnswer) || text(value.quickAnswer.questionKey) !== 'air_exchange_frequency'
      || !['frequent', 'regular', 'rare'].includes(text(value.quickAnswer.optionKey))) {return null}
    return { schemaVersion: 3, mode: 'quick', quickAnswer: {
      questionKey: 'air_exchange_frequency', optionKey: text(value.quickAnswer.optionKey) }, advancedInput: null }
  }
  if (value.mode !== 'advanced') {return null}
  const input = advanced(value.advancedInput)
  return input ? { schemaVersion: 3, mode: 'advanced', quickAnswer: null, advancedInput: input } : null
}

/** 递归冻结复制后的输出；不能让请求方后续修改验收证据。 */
function freeze(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {freeze(child)}
    Object.freeze(value)
  }
}

/**
 * 服务端已锁定题包的空气证据校验。成员授权先于表单解析，拒绝额外题目的复合证据。
 * 不消费客户端题包、位置归属、算法倍率或持久化成功声明；不产生养护事实。
 */
export function validateV1AirAnswerEvidence(serverSnapshot: unknown, submitted: unknown): AirAnswerEvidenceValidation {
  const membership = validateV1PackageAnswerMembership(serverSnapshot, submitted)
  if (membership.status !== 'valid_membership') {return { status: membership.status }}
  if (!record(serverSnapshot) || !record(submitted)) {return { status: 'invalid_air_evidence' }}
  const questions = (serverSnapshot.packageQuestions as unknown[]).filter(question => record(question)
    && (question.questionType === 'air_environment' || question.uiVariant === 'air_environment')) as Record<string, unknown>[]
  const keys = new Set(questions.map(question => question.questionKey as string))
  const inputs = submitted.airEnvironmentByQuestionId === undefined ? {} : submitted.airEnvironmentByQuestionId
  const snapshots = submitted.airEnvironmentSnapshotsByQuestionId === undefined ? {} : submitted.airEnvironmentSnapshotsByQuestionId
  if (!record(inputs) || !record(snapshots) || [...Object.keys(inputs), ...Object.keys(snapshots)].some(key => !keys.has(key))) {
    return { status: 'invalid_air_evidence' }
  }
  const output: Record<string, AirAnswerEvidence> = Object.create(null) as Record<string, AirAnswerEvidence>
  for (const question of questions) {
    const key = question.questionKey as string
    const answer = membership.answers.find(item => item.questionKey === key)
    if (answer?.optionKey === 'air_environment_unknown') {
      if (Object.hasOwn(inputs, key) || Object.hasOwn(snapshots, key)) {return { status: 'invalid_air_evidence' }}
      continue
    }
    if (answer?.optionKey !== 'air_environment_recorded' || !record(snapshots[key])) {return { status: 'invalid_air_evidence' }}
    const snapshot = snapshots[key]
    const input = assessment(inputs[key])
    const snapshotInput = assessment(snapshot.input)
    const source = text(snapshot.source)
    if (!input || !snapshotInput || !['saved_profile', 'temporary', 'temporary_save_succeeded', 'temporary_save_failed'].includes(source)
      || serializeCanonicalJson(input) !== serializeCanonicalJson(snapshotInput)) {return { status: 'invalid_air_evidence' }}
    freeze(input)
    output[key] = Object.freeze({ input, declaredSource: source, sourceVerification: 'unverified_client_declaration' })
  }
  return Object.freeze({ status: 'valid_air_evidence', byQuestionId: Object.freeze(output) })
}
