import { RUNTIME_PARAMETERS } from '../runtime-parameters.js'
import { compilePolicySchema, freezePolicy, integerWithin, type TypedPolicyDefinition } from './typed-policy.js'

/**
 * weather 公开读取策略（weather / public_read，正文 `weather-public-read/v1`）。
 * 用户 2026-10-10 裁定：城市气候推荐的 top 默认与上限迁入策略发布，取值不变（10、50）；绝对上限 50 = 公开合同上限。
 */
export interface WeatherPublicReadRules {
  /** 正文合同版本，固定 `weather-public-read/v1`。 */
  readonly contractVersion: 'weather-public-read/v1'
  /** 推荐接口省略 top 时返回的条数，不超过 recommendTopMax。 */
  readonly recommendTopDefault: number
  /** 推荐接口允许的最大 top；超过返回 400。 */
  readonly recommendTopMax: number
}

const bounds = RUNTIME_PARAMETERS.policyBounds.weatherPublicRead.value
const validate = compilePolicySchema<WeatherPublicReadRules>({
  type: 'object', additionalProperties: false, required: ['contractVersion', 'recommendTopDefault', 'recommendTopMax'],
  properties: {
    contractVersion: { const: 'weather-public-read/v1' },
    recommendTopDefault: integerWithin(1, bounds.recommendTopMax),
    recommendTopMax: integerWithin(1, bounds.recommendTopMax),
  },
})

/** 策略定义：默认条数不得大于上限。 */
export const WEATHER_PUBLIC_READ_POLICY: TypedPolicyDefinition<WeatherPublicReadRules> = Object.freeze({
  domainCode: 'weather',
  policyCode: 'public_read',
  schemaVersions: Object.freeze(['weather-public-read/v1']),
  resolve: (document: unknown, schemaVersion: string) => {
    if (schemaVersion !== 'weather-public-read/v1' || !validate(document)) { return null }
    if (document.recommendTopDefault > document.recommendTopMax) { return null }
    return freezePolicy(structuredClone(document))
  },
})
