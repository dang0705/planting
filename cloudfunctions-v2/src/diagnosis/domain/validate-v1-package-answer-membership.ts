/** 服务端已锁定题包的一条题目和选项；只读取成员授权所需字段。 */
interface AuthorizedQuestion {
  /** 原V1稳定题目代码，不从客户端题包推导。 */
  readonly questionKey: string
  /** 当前快照允许的选项，包含服务端声明的时间线选项。 */
  readonly optionKeys: ReadonlySet<string>
  /** 时间线授权要求由后续用例验证实际复合证据。 */
  readonly allowsCareTimeline: boolean
  /** 空气环境授权要求由后续用例验证实际复合证据。 */
  readonly isAirEnvironment: boolean
}

/** 一条已按服务端成员授权的稳定答案引用，不包含复合证据正文。 */
export interface AuthorizedPackageAnswer {
  /** 服务端锁定的题目代码。 */
  readonly questionKey: string
  /** 属于该题目允许集合的选项代码。 */
  readonly optionKey: string
}

/** 成员通过不代表复合证据、会话归属、发布或诊断结论已通过。 */
export type PackageAnswerMembership =
  | {
      /** 快照或答案非法；零题直判包不可作答。 */
      readonly status: 'invalid_snapshot' | 'invalid_answers' | 'not_answerable'
    }
  | {
      /** 仅题目与选项成员授权通过，不等于完整提交验收。 */
      readonly status: 'valid_membership'
      /** 按服务端题目顺序保存的新对象，不携带客户端题包或内部字段。 */
      readonly answers: readonly AuthorizedPackageAnswer[]
      /** 调用方必须逐项验证，不能用“选了已填写”冒充实际数据。 */
      readonly requiredEvidenceKinds: readonly ('care_behavior_timeline' | 'air_environment')[]
    }

/** 仅接受纯对象，拒绝数组、日期和自定义类的隐式转换。 */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

/** 稳定代码原样比较，不以trim、大小写转换或optionId替代服务端授权。 */
function code(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

/**
 * 复用V1题包的题目/选项成员规则。第一个参数必须来自服务端锁定快照，不能传请求正文。
 * 题数以该版本快照为准；黄叶、萎蔫和动态虫害不共享全局题数。
 * 零题虫害返回不可作答，由既有直判用例继续；本函数不会生成任何诊断结果。
 * 本函数只核验成员；会话归属、版本准入、时间线及空气复合证据由应用层单独验证。
 */
export function validateV1PackageAnswerMembership(
  serverSnapshot: unknown,
  submitted: unknown,
): PackageAnswerMembership {
  if (!record(serverSnapshot) || !['yellow_leaf', 'wilting_droop', 'specific_pest_visual'].includes(serverSnapshot.mode as string)
    || !Number.isSafeInteger(serverSnapshot.questionCount) || (serverSnapshot.questionCount as number) < 0
    || !Array.isArray(serverSnapshot.packageQuestions)
    || serverSnapshot.questionCount !== serverSnapshot.packageQuestions.length) { return { status: 'invalid_snapshot' } }
  if (serverSnapshot.questionCount === 0) {
    return { status: serverSnapshot.mode === 'specific_pest_visual' ? 'not_answerable' : 'invalid_snapshot' }
  }
  const questions: AuthorizedQuestion[] = []
  const seen = new Set<string>()
  for (const question of serverSnapshot.packageQuestions) {
    if (!record(question) || !code(question.questionKey) || seen.has(question.questionKey)
      || !Array.isArray(question.options) || question.options.length === 0) { return { status: 'invalid_snapshot' } }
    const optionKeys = new Set<string>()
    for (const option of question.options) {
      if (!record(option) || !code(option.optionKey) || optionKeys.has(option.optionKey)) { return { status: 'invalid_snapshot' } }
      optionKeys.add(option.optionKey)
    }
    const allowsCareTimeline = question.uiVariant === 'care_behavior_timeline'
    if (allowsCareTimeline) { optionKeys.add('care_behavior_timeline') }
    questions.push({ questionKey: question.questionKey, optionKeys, allowsCareTimeline,
      isAirEnvironment: question.questionType === 'air_environment' || question.uiVariant === 'air_environment' })
    seen.add(question.questionKey)
  }
  if (!record(submitted) || submitted.requestMode !== 'answer_submit' || !Array.isArray(submitted.answers)
    || submitted.answers.length !== questions.length) { return { status: 'invalid_answers' } }
  const provided = new Map<string, string>()
  for (const answer of submitted.answers) {
    if (!record(answer) || !code(answer.questionKey) || !code(answer.optionKey)
      || !seen.has(answer.questionKey) || provided.has(answer.questionKey)) { return { status: 'invalid_answers' } }
    provided.set(answer.questionKey, answer.optionKey)
  }
  const answers: AuthorizedPackageAnswer[] = []
  const required = new Set<'care_behavior_timeline' | 'air_environment'>()
  for (const question of questions) {
    const optionKey = provided.get(question.questionKey)
    if (optionKey === undefined || !question.optionKeys.has(optionKey)) { return { status: 'invalid_answers' } }
    if (question.allowsCareTimeline && optionKey === 'care_behavior_timeline') { required.add('care_behavior_timeline') }
    if (question.isAirEnvironment && optionKey === 'air_environment_recorded') { required.add('air_environment') }
    answers.push(Object.freeze({ questionKey: question.questionKey, optionKey }))
  }
  return { status: 'valid_membership', answers: Object.freeze(answers), requiredEvidenceKinds: Object.freeze([...required]) }
}
