import type { MvpWateringPolicySnapshot } from '../../configuration/mvp-watering-policy.js'
import type { CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import type { WateringAdviceCommand } from '../http/watering-advice-request.js'
import type { NormalizedOutdoorRadiation } from '../light/normalize-open-meteo-radiation.js'
import { deriveMvpPlantLightIntervals, type MvpPlantLightResult } from '../watering/derive-mvp-plant-light.js'
import { WATERING_BASELINE_POLICY_VERSION } from '../watering/watering-advice-hard-rules.js'
import { assessMvpWatering, type MvpPlantBaseline } from './assess-mvp-watering.js'
import type { WateringCapabilityResult } from './project-watering-replay-result.js'

/** 输入清单合同版本标识，随请求合同版本演进。 */
const inputManifestVersion = 'watering-advice/v1'

/** 已读取的活动浇水策略及其发布引用。 */
export interface PublishedWateringPolicy {
  /** 不可变发布公开引用，只进入内部算法清单。 */
  readonly releaseRef: string
  /** 请求级只读策略快照。 */
  readonly snapshot: Readonly<MvpWateringPolicySnapshot>
}

/** 组装输入：全部在事务外由服务端取得。 */
export interface BuildWateringAdviceInput {
  /** 已校验的请求命令（坐标已降到 0.01°）。 */
  readonly command: WateringAdviceCommand
  /** 活动浇水策略；null 表示没有可用发布。 */
  readonly policy: PublishedWateringPolicy | null
  /** 植物名义基线；null 表示知识缺失或不受支持。 */
  readonly baseline: MvpPlantBaseline | null
  /** 标准化后的 Open-Meteo 辐射序列；null 表示 Provider 不可用。 */
  readonly radiation: NormalizedOutdoorRadiation | null
  /** 服务端可信当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** 组装结果：公开结果与三份内部留存正文。 */
export interface BuiltWateringAdvice {
  /** 公开浇水结果（care-capability-result/v1）。 */
  readonly result: WateringCapabilityResult
  /** 锁定的输入证据清单；坐标为 0.01° 精度，不含归属引用。 */
  readonly inputManifest: CanonicalJsonObject
  /** 实际使用的算法发布、基线版本与 Provider 状态；无发布时明确记录。 */
  readonly algorithmReleaseManifest: CanonicalJsonObject
  /** 受控派生摘要：光照可用性、环境时段数、时区。 */
  readonly derivations: CanonicalJsonObject
}

/** 光照派生的内部留存摘要。 */
function lightSummary(light: MvpPlantLightResult | null): CanonicalJsonObject {
  if (light === null) { return { status: 'not_computed' } }
  return light.status === 'available'
    ? { status: 'available', intervalCount: light.intervals.length }
    : { status: 'insufficient_evidence', reason: light.reason }
}

/**
 * 命令 + 策略 + 基线 + 辐射 → 公开结果与留存正文（纯计算，不访问网络或数据库）。
 * 单通道 Lux 法已包含玻璃效应，故不读取玻璃策略；glassLayers 只进入输入清单。
 * 用户自报的盆土观察以 reliable=true 进入映射（HTTP 请求无来源字段，见测试矩阵解释性约定）。
 */
export function buildWateringAdvice(input: BuildWateringAdviceInput): BuiltWateringAdvice {
  const { command, policy, baseline, radiation, nowMs } = input
  const light = policy !== null && radiation !== null
    ? deriveMvpPlantLightIntervals({ policy: policy.snapshot, radiation, lightReading: command.lightReading, indoorClimate: command.indoorClimate, now: nowMs })
    : null
  const environment = light?.status === 'available' ? light.intervals : []
  const timezone = radiation?.timezone ?? null
  const result = assessMvpWatering({
    policy: policy?.snapshot ?? null,
    now: nowMs,
    baseline,
    soil: command.soil === null ? null : { ...command.soil, reliable: true },
    lastConfirmedWateringAt: command.lastWateringAtMs,
    pot: command.pot,
    materials: command.materials,
    environment,
    timezone
  })
  const inputManifest: CanonicalJsonObject = {
    contractVersion: inputManifestVersion,
    catalogTaxonRef: command.catalogTaxonRef,
    location: { latitude: command.location.latitude, longitude: command.location.longitude },
    window: { azimuthDeg: command.window.azimuthDeg, glassLayers: command.window.glassLayers },
    lightReading: command.lightReading === null ? null : { ...command.lightReading },
    soil: command.soil === null ? null : { ...command.soil },
    lastWateringAtMs: command.lastWateringAtMs,
    pot: { ...command.pot },
    materials: [...command.materials],
    indoorClimate: command.indoorClimate === null ? null : { ...command.indoorClimate }
  }
  const algorithmReleaseManifest: CanonicalJsonObject = {
    wateringPolicy: policy === null
      ? { status: 'none_published' }
      : { status: 'published', releaseRef: policy.releaseRef, releaseVersion: policy.snapshot.releaseVersion, contentSha256: policy.snapshot.contentSha256 },
    baselinePolicyVersion: WATERING_BASELINE_POLICY_VERSION,
    radiation: radiation === null
      ? { provider: 'open_meteo', status: 'unavailable' }
      : { provider: 'open_meteo', status: 'available', sourceRef: radiation.sourceRef, fetchedAtMs: radiation.fetchedAtMs }
  }
  const derivations: CanonicalJsonObject = { plantLight: lightSummary(light), environmentIntervalCount: environment.length, timezone }
  return { result, inputManifest, algorithmReleaseManifest, derivations }
}
