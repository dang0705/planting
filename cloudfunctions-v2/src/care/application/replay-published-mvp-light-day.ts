import { selectMvpGlassTransmission, type MvpGlassLayer, type MvpGlassPolicySnapshot } from '../../configuration/mvp-glass-policy.js'
import { replayIndoorPpfdDay, type LocalLightDay, type SpectralConversionCandidate, type IndoorPpfdDayReplay } from './replay-indoor-ppfd-day.js'
import type { IndoorLightTarget, TransmissionEvidence } from './replay-indoor-natural-light.js'
import type { RadiationNormalizationContext } from '../light/normalize-open-meteo-radiation.js'
import type { PublishedMvpGlassPolicyReader } from './ports/published-mvp-glass-policy-reader.js'

/** 发布策略光照回放的内部输入，不是前端提交的策略正文。 */
export interface PublishedMvpLightDayInput {
  /** Provider真实响应或明确的离线制品，交给既有归一化验证。 */
  readonly raw: unknown
  /** 辐射序列时间语义及来源，不能隐式选择当前时间。 */
  readonly context: RadiationNormalizationContext
  /** 实际目标植物窗位事实或明确的回放输入。 */
  readonly target: IndoorLightTarget
  /** 单独的窗帘证据，不与玻璃传播损失混合。 */
  readonly curtain: TransmissionEvidence
  /** 用户确认的单层、双层或尚未确认状态。 */
  readonly layer: MvpGlassLayer
  /** 后端明确提供的光谱换算候选，不使用源码默认。 */
  readonly conversion: SpectralConversionCandidate
  /** 完整当地日的日期、时区和绝对边界。 */
  readonly day: LocalLightDay
  /** 一次请求固定的UTC策略捕获时刻。 */
  readonly capturedAt: string
}

/** 运行回放不等于全天覆盖或生产建议准入。 */
export type PublishedMvpLightDayResult =
  | {
      /** 当前策略可用且离线回放已完成。 */
      status: 'available'
      /** 本轮使用的数据库发布引用，不对外公开。 */
      releaseRef: string
      /** 本轮锁定的玻璃参数版本及来源。 */
      policy: Readonly<MvpGlassPolicySnapshot>
      /** 包含覆盖、缺段和双通道PPFD/DLI候选的结果。 */
      replay: IndoorPpfdDayReplay
    }
  | {
      /** 无活动策略、完整性不可信或尚未生效的稳定分类。 */
      status: 'unavailable' | 'invalid' | 'not_effective'
    }

/** 只读一次活动策略，再按固定版本运行双通道传播与完整当地日积分。 */
export async function replayPublishedMvpLightDay(input: PublishedMvpLightDayInput, reader: PublishedMvpGlassPolicyReader): Promise<PublishedMvpLightDayResult> {
  const resolution = await reader.read(input.capturedAt)
  if (resolution.status !== 'available') { return resolution }
  const glass = selectMvpGlassTransmission(resolution.snapshot, input.layer)
  const replay = replayIndoorPpfdDay(input.raw, input.context, input.target, { glass, curtain: input.curtain }, input.conversion, input.day)
  return { status: 'available', releaseRef: resolution.releaseRef, policy: resolution.snapshot, replay }
}
