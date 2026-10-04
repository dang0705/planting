import Ajv2020 from 'ajv/dist/2020.js'
import schema from '../../../models/user-plant/profile-patch.v1.schema.json'
import potSchema from '../../../models/user-plant/measured-pot-profile.v1.schema.json'
import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { lockMeasuredPotProfile, type MeasuredPotProfile } from './measured-pot-profile.js'

/** 已冻结的客户端档案修改事实；不包含归属、策略引用或服务端计算。 */
export interface UserPlantProfilePatch {
  /** 当前读到的旧聚合版本，不能使用档案子表版本替代。 */ readonly version: number
  /** 省略保留；空字符串明确清除；禁止null和隐式转换。 */ readonly nickname?: string
  /** 省略保留；提供时必须为完整测量子结构，不把部分尺寸补为未知。 */ readonly measuredPot?: MeasuredPotProfile
}
/** 唯一本地Schema及显式已冻结子结构，不访问远程引用或私设默认。 */
const validate = new Ajv2020({ strict: true, allErrors: true }).addSchema(potSchema).compile<UserPlantProfilePatch>(schema)

/** 冻结纯JSON副本并保留省略语义；本层不判断归属、写库或宣称完整档案。 */
export function lockUserPlantProfilePatch(input: unknown): Readonly<UserPlantProfilePatch> {
  const value: unknown = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue))
  if (!validate(value)) { throw new TypeError('档案更新必须提供合法旧版本及至少一项已冻结事实') }
  return Object.freeze({ ...value, ...('measuredPot' in value ? { measuredPot: lockMeasuredPotProfile(value.measuredPot) } : {}) })
}
