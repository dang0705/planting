import Ajv2020 from 'ajv/dist/2020.js'
import schema from '../../../models/user-plant/measured-pot-profile.v1.schema.json'
import {
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'

/** 用户植物持有的实际内盆测量事实；养护领域消费事实后独立计算几何和风险。
 * 只覆盖测量子结构，不代表盆器/基质档案完整或用户实际测量已得到证明。 */
export interface MeasuredPotProfile {
  /** 确认实际种植内盆；false表示不满足，null表示尚未确认。 */
  readonly actualInnerPotConfirmed: boolean | null
  /** 确认有效排水通道；未知必须明确为null。 */
  readonly drainageAvailable: boolean | null
  /** 盆口内直径，厘米，有限正数；未知为null，不推测。 */
  readonly potTopDiameterCm: number | null
  /** 盆底内直径，厘米，有限正数；不能用盆口尺寸补齐。 */
  readonly potBottomDiameterCm: number | null
  /** 内盆内深，厘米，有限正数；不是外盆或植物高度。 */
  readonly potHeightCm: number | null
}

/** 受控Schema唯一来自本地版本制品；不接受客户端提供Schema、默认值或转换规则。 */
const validate = new Ajv2020({ strict: true, allErrors: true }).compile<MeasuredPotProfile>(schema)

/**
 * 校验并锁定独立的纯JSON事实副本，拒绝缺字段、未知键、非JSON和隐式类型转换。
 * 本函数不判断权限、不保存数据库、不产生完整度或奖励；它只是档案写入前的子结构门。
 * 容积可表示性及圆台模型适用性仍由养护计算负责，不在此重复实现物理公式。
 */
export function lockMeasuredPotProfile(input: unknown): Readonly<MeasuredPotProfile> {
  const value: unknown = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue))
  if (!validate(value)) {
    throw new TypeError('实际内盆测量事实不满足严格字段、三值确认或厘米尺寸合同')
  }
  return Object.freeze(value)
}
