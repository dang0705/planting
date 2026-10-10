import { inspect } from 'node:util'

import { EnvironmentConfigError, type EnvironmentSource } from './environment.js'

/**
 * 百炼视觉诊断 Provider 的环境变量读取（Provider 档案 `bailian_qwen_diagnosis`，配置目录待冻结项）。
 *
 * 通俗说明：和前端的 `env.ts` 一样，只在这里把环境变量变成类型化配置；入口文件把进程环境变量原样传进来。
 * 超时与每个模型的尝试次数目前**没有冻结的默认值**（配置目录 pending），因此任何一项缺失都返回 null，
 * 由调用方失败关闭（503），而不是在代码里偷偷补一个默认值。
 * 取值越界或格式不对时启动失败，错误信息只含变量名与允许范围，不含取值；凭证容器序列化一律脱敏。
 */

/** 百炼 API Key 的凭证变量名（Provider 档案 credentialRef = env:LLM_ALIYUN_BAILIAN_API_KEY）。 */
export const BAILIAN_DIAGNOSIS_CREDENTIAL_NAME = 'LLM_ALIYUN_BAILIAN_API_KEY'
/** 可选的接口地址变量名；未设置时使用官方北京端点。 */
const baseUrlName = 'LLM_ALIYUN_BAILIAN_BASE_URL'
/** 单个模型单次调用总时限（毫秒）变量名。 */
const totalDeadlineName = 'V2_BAILIAN_DIAGNOSIS_TOTAL_DEADLINE_MS'
/** 单个模型内对「不可用、限流」的最多尝试次数变量名。 */
const maxAttemptsName = 'V2_BAILIAN_DIAGNOSIS_MAX_ATTEMPTS'
/** 官方 OpenAI 兼容接口地址（华北2 北京）；属于 Provider 文档事实，不是业务参数。 */
const officialBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/** 总时限的格式边界（毫秒）：供应商侧与云函数超时共同约束的安全范围，不是默认值。 */
const deadlineBounds = { minimum: 5000, maximum: 120_000 } as const
/** 尝试次数的格式边界：不超过 3 次，避免同一产品动作内过度消耗额度。 */
const attemptsBounds = { minimum: 1, maximum: 3 } as const

/** 百炼视觉诊断 Provider 配置；序列化时整体脱敏。 */
export interface BailianDiagnosisConfig {
  /** API Key（只交给适配器放进请求头）。 */
  readonly apiKey: string
  /** OpenAI 兼容接口地址。 */
  readonly baseUrl: string
  /** 单个模型单次调用总时限（毫秒）。 */
  readonly totalDeadlineMs: number
  /** 单个模型内对「不可用、限流」的最多尝试次数。 */
  readonly maxAttemptsPerModel: number
}

/** 十进制非负整数。 */
const decimalIntegerPattern = /^(?:0|[1-9][0-9]*)$/u

/** 读取并去除首尾空白；空串视为未设置。 */
function readOptional(environment: EnvironmentSource, name: string): string | undefined {
  const raw = environment[name]?.trim()
  return raw === undefined || raw === '' ? undefined : raw
}

/** 读取一个必须在范围内的整数；格式或越界错误时启动失败（错误不含取值）。 */
function readBoundedInteger(
  raw: string,
  name: string,
  bounds: { minimum: number; maximum: number }
): number {
  const value = Number(raw)
  if (
    !decimalIntegerPattern.test(raw) ||
    !Number.isSafeInteger(value) ||
    value < bounds.minimum ||
    value > bounds.maximum
  ) {
    throw new EnvironmentConfigError(
      `环境变量不合法：${name}（允许 ${bounds.minimum}–${bounds.maximum} 的整数）`
    )
  }
  return value
}

/** 读取百炼视觉诊断配置；凭证、总时限、尝试次数任一缺失返回 null（不使用代码默认值）。 */
export function readBailianDiagnosisEnvironment(
  environment: EnvironmentSource
): BailianDiagnosisConfig | null {
  const apiKey = readOptional(environment, BAILIAN_DIAGNOSIS_CREDENTIAL_NAME)
  const deadlineRaw = readOptional(environment, totalDeadlineName)
  const attemptsRaw = readOptional(environment, maxAttemptsName)
  if (apiKey === undefined || deadlineRaw === undefined || attemptsRaw === undefined) {
    return null
  }
  const baseUrl = readOptional(environment, baseUrlName) ?? officialBaseUrl
  if (!/^https:\/\//u.test(baseUrl)) {
    throw new EnvironmentConfigError(`环境变量不合法：${baseUrlName}（必须是 https 地址）`)
  }
  const config = {
    apiKey,
    baseUrl,
    totalDeadlineMs: readBoundedInteger(deadlineRaw, totalDeadlineName, deadlineBounds),
    maxAttemptsPerModel: readBoundedInteger(attemptsRaw, maxAttemptsName, attemptsBounds)
  }
  const redacted = () => '[已脱敏]'
  Object.defineProperty(config, 'toJSON', { value: redacted, enumerable: false })
  Object.defineProperty(config, 'toString', { value: redacted, enumerable: false })
  Object.defineProperty(config, inspect.custom, { value: redacted, enumerable: false })
  return Object.freeze(config)
}
