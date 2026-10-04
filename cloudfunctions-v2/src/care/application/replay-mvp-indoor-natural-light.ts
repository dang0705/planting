import { resolveMvpGlassPolicy, selectMvpGlassTransmission, type MvpGlassLayer, type MvpGlassPolicySnapshot } from '../../configuration/mvp-glass-policy.js'
import { replayIndoorNaturalLight, type IndoorLightTarget, type IndoorNaturalLightReplay, type TransmissionEvidence } from './replay-indoor-natural-light.js'
import type { RadiationNormalizationContext } from '../light/normalize-open-meteo-radiation.js'

/** 分类策略到既有传播的结果；回放通过不等于正式HTTP或生产发布。 */
export type MvpIndoorNaturalLightReplay =
  | {
      /** 策略可用且当前自然光候选回放已完成。 */
      status: 'available'
      /** 本次计算固定的玻璃参数及策略版本引用。 */
      policy: Readonly<MvpGlassPolicySnapshot>
      /** 既有双通道传播结果，仍保留离线候选边界。 */
      replay: IndoorNaturalLightReplay
    }
  | {
      /** 无可用策略时不消费天气、不生成光照结果的原因。 */
      status: 'unavailable' | 'invalid' | 'not_effective'
    }

/**
 * 用户只需确认层数，复杂参数由后端显式策略供给；窗帘与玻璃各计一次。
 * 调用方仍负责策略权威来源，本函数不伪造活动指针或写入事实。
 */
export function replayMvpIndoorNaturalLight(
  raw: unknown,
  context: RadiationNormalizationContext,
  target: IndoorLightTarget,
  curtain: TransmissionEvidence,
  layer: MvpGlassLayer,
  release: unknown,
  capturedAt: string,
): MvpIndoorNaturalLightReplay {
  const resolution = resolveMvpGlassPolicy(release, capturedAt)
  if (resolution.status !== 'available') {return resolution}
  const glass = selectMvpGlassTransmission(resolution.snapshot, layer)
  return { status: 'available', policy: resolution.snapshot, replay: replayIndoorNaturalLight(raw, context, target, { glass, curtain }) }
}
