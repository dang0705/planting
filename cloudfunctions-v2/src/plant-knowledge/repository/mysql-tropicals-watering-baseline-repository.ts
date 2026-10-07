import Ajv from 'ajv'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import type { PublishedPlantSqlExecutor } from './mysql-published-plant-repository.js'
import { compileWaterState, type ClassifiedWaterState, type WaterFrequencyTier, type WaterTriggerState } from '../watering/compile-water-state.js'

/** 指定目录来源与策略版本；没有隐式最新版本。 */
export interface TropicalsWateringBaselineQuery {
  /** Tropicals目录引用，不当作plantIdentityRef或学名slug。 */
  readonly catalogTaxonRef: string
  /** 本次请求明确锁定的策略版本。 */
  readonly policyVersion: string
}
/** 通过Schema的完整JSON来源，未知审校状态仍作为来源注记保存。 */
export interface WateringTraitSource extends CanonicalJsonObject {
  /** 来源数据集引用，不在本用例重新下载。 */
  readonly source_url: string
  /** 来源数据集摘要，不冒充单条记录摘要。 */
  readonly source_sha256: string
  /** 如实保留AI抽取审校状态，不当正式知识准入。 */
  readonly independent_review_status: string
  /** 来源原始记录，保持文本和元数据。 */
  readonly record: CanonicalJsonObject & {
    /** 与数据库目录引用一致的来源身份。 */
    readonly taxonID: string
    /** 必须是浇水频率性状，拒绝其他字段污染。 */
    readonly measurementTypeID: string
    /** 与独立tier列保持一致的性状值。 */
    readonly measurementValue: string
    /** 原始说明，条件与冲突供确定性编译。 */
    readonly measurementRemarks: string
  }
}
/** 单次读取所选的名义策略，不含生产发布资格。 */
export interface NominalWateringPolicySnapshot {
  /** 查询中指定并读回的版本。 */
  readonly policyVersion: string
  /** 与来源相同的已支持分类。 */
  readonly tier: WaterFrequencyTier
  /** 具体或默认语义，不按环境修改。 */
  readonly trigger: WaterTriggerState
  /** 名义日范围下端，不转换成干燥单位。 */
  readonly minDays: number
  /** 不低于下端的名义日范围上端。 */
  readonly maxDays: number
}
/** 一条SQL语句读取后锁定的回放输入，算法迭代不修改原文。 */
export interface NominalWateringSnapshot {
  /** 目录引用始终保留原命名空间。 */
  readonly catalogTaxonRef: string
  /** 完整来源事实JSON的独立副本。 */
  readonly source: WateringTraitSource
  /** 原文的编译结果与条件句依据。 */
  readonly compiled: ClassifiedWaterState
  /** 精确选中的名义策略副本。 */
  readonly policy: NominalWateringPolicySnapshot
}
/** 可用只表示内部候选知识可读，不代表正式养护建议。 */
export type TropicalsWateringBaselineResult = {
  /** 来源、编译及策略可组合为候选。 */
  readonly status: 'available_candidate'
  /** 当前缺参考条件与正式规则发布，不具备正式准入。 */
  readonly productionAdmission: false
  /** 原始性状tier不会被trigger覆盖。 */
  readonly tier: WaterFrequencyTier
  /** 编译出的具体或默认语义。 */
  readonly trigger: WaterTriggerState
  /** 仅名义日范围，不输出精确水量或日期。 */
  readonly baselineDays: {
    /** 真实策略读回的名义下端。 */
    readonly min: number
    /** 真实策略读回的名义上端。 */
    readonly max: number
  }
  /** 明确量纲，拒绝把旧天数直接改名。 */
  readonly basis: 'nominal_calendar_days'
  /** 参考条件仍缺失，不能默认为标准环境。 */
  readonly referenceConditions: 'unconfirmed'
  /** 锁定来源与策略的完整输入副本。 */
  readonly snapshot: NominalWateringSnapshot
  /** 来源、编译和策略共同的规范JSON摘要。 */
  readonly snapshotHash: string
} | {
  /** 来源、普通栽培或具体策略不满足的明确类别。 */
  readonly status: 'not_found' | 'invalid_source' | 'unsupported_source' | 'policy_missing'
  /** 任何缺口都不授予生产资格。 */
  readonly productionAdmission: false
}

/** 同一SQL快照取得来源和该tier规则；二进制比较消除真实列排序规则冲突。 */
const readSql = `SELECT e.taxon_id,e.water_frequency_tier,e.water_frequency_source_json,
 p.policy_version,p.trigger_state,p.min_days,p.max_days,p.is_active
FROM tropicals_species_encyclopedia_ref AS e
LEFT JOIN watering_baseline_policy AS p
 ON CAST(p.water_frequency_tier AS BINARY)=CAST(e.water_frequency_tier AS BINARY)
 AND p.policy_version=? AND p.is_active=1
WHERE e.taxon_id=?`
/** Schema验证字段语义，未知来源元数据仍是JSON，不伪造人工审核。 */
const validateSource = new Ajv({ strict: true, allErrors: true }).compile<WateringTraitSource>({
  type: 'object', required: ['source_url', 'source_sha256', 'independent_review_status', 'record'], additionalProperties: true,
  properties: {
    source_url: { type: 'string', minLength: 1 }, source_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    independent_review_status: { type: 'string', minLength: 1 },
    record: { type: 'object', required: ['taxonID', 'measurementTypeID', 'measurementValue', 'measurementRemarks'], additionalProperties: true,
      properties: { taxonID: { type: 'string', minLength: 1 }, measurementTypeID: { const: 'https://tropicals.cn/ns/trait/water_frequency_tier' }, measurementValue: { type: 'string' }, measurementRemarks: { type: 'string' } } },
  },
})

/** 库内JSON驱动可返回字符串或对象；语义无效不补字段或默认值。 */
function sourceFromRow(row: Record<string, unknown>): WateringTraitSource | null {
  let value: unknown = row.water_frequency_source_json
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { return null } }
  return validateSource(value) ? value : null
}

/** 内部查询入口先校验引用；执行器错误交给上游统一脱敏。 */
export function createMysqlTropicalsWateringBaselineRepository(executor: PublishedPlantSqlExecutor): {
  /** 一次参数化读取，编译并返回名义基线候选。 */
  readonly read: (query: TropicalsWateringBaselineQuery) => Promise<TropicalsWateringBaselineResult>
} {
  return { async read(query) {
    const { catalogTaxonRef, policyVersion } = query
    if (typeof catalogTaxonRef !== 'string' || !catalogTaxonRef.trim() || typeof policyVersion !== 'string' || !policyVersion.trim()) {
      throw new TypeError('浇水知识查询缺少明确引用或版本')
    }
    const rows = await executor.query(readSql, [policyVersion, catalogTaxonRef])
    if (rows.length === 0) { return { status: 'not_found', productionAdmission: false } }
    const first = rows[0]!
    const source = sourceFromRow(first)
    if (!source || first.taxon_id !== catalogTaxonRef || source.record.taxonID !== first.taxon_id || source.record.measurementValue !== first.water_frequency_tier) {
      return { status: 'invalid_source', productionAdmission: false }
    }
    const sourceHash = calculateCanonicalJsonSha256(source)
    for (const row of rows) {
      const repeatedSource = sourceFromRow(row)
      if (row.taxon_id !== first.taxon_id || row.water_frequency_tier !== first.water_frequency_tier || !repeatedSource || calculateCanonicalJsonSha256(repeatedSource) !== sourceHash) {
        throw new Error('浇水基线来源连接不一致')
      }
    }
    const compiled = compileWaterState({ tier: first.water_frequency_tier, remarks: source.record.measurementRemarks })
    if (compiled.status !== 'classified') { return { status: 'unsupported_source', productionAdmission: false } }
    const matching = rows.filter(row => row.trigger_state === compiled.trigger)
    if (matching.length === 0) { return { status: 'policy_missing', productionAdmission: false } }
    if (matching.length !== 1) { throw new Error('浇水策略重复匹配') }
    const row = matching[0]!
    if (row.policy_version !== policyVersion || row.is_active !== 1 || typeof row.min_days !== 'number' || !Number.isSafeInteger(row.min_days) || row.min_days <= 0
      || typeof row.max_days !== 'number' || !Number.isSafeInteger(row.max_days) || row.max_days < row.min_days) { throw new Error('浇水名义策略字段损坏') }
    const policy: NominalWateringPolicySnapshot = { policyVersion: policyVersion, tier: compiled.tier, trigger: compiled.trigger, minDays: row.min_days, maxDays: row.max_days }
    const snapshot: NominalWateringSnapshot = structuredClone({ catalogTaxonRef: catalogTaxonRef, source, compiled, policy })
    return { status: 'available_candidate', productionAdmission: false, tier: compiled.tier, trigger: compiled.trigger,
      baselineDays: { min: row.min_days, max: row.max_days }, basis: 'nominal_calendar_days', referenceConditions: 'unconfirmed', snapshot,
      snapshotHash: calculateCanonicalJsonSha256(snapshot as unknown as CanonicalJsonValue) }
  } }
}
