import Ajv from 'ajv'
import type { MeasuredPotInput } from '../cultivation/derive-measured-pot.js'
import { mvpSubstrateMaterials } from '../watering/estimate-mvp-water-amount.js'
import type { MvpSoilObservation } from '../watering/map-mvp-soil-observation.js'

/** 8 方位对应的中心方位角（正北顺时针，度）。 */
const orientationAzimuth = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 } as const
/** 每个方位扇区半宽（度）。 */
const sectorHalfWidthDeg = 22.5

/** 结果归属：游客/登录用户临时案例或本人长期植物。 */
export type WateringAdviceTarget =
  | {
      /** 临时案例归属，用于游客或登录用户的临时识别结果。 */
      readonly kind: 'temporary_case'
      /** 临时案例引用，归属由上游再次校验。 */
      readonly caseRef: string
    }
  | {
      /** 长期用户植物归属。 */
      readonly kind: 'user_plant'
      /** 用户植物引用，归属由上游再次校验。 */
      readonly userPlantRef: string
    }

/** 校验通过后的内部命令；所有时间为 UTC 毫秒，坐标已降精度。 */
export interface WateringAdviceCommand {
  /** 本次浇水结果归属的临时案例或长期植物。 */
  readonly target: WateringAdviceTarget
  /** Tropicals 目录引用；长期植物可由档案提供而为 null。 */
  readonly catalogTaxonRef: string | null
  /** 降到两位小数的地理坐标（度）。 */
  readonly location: {
    /** 纬度，两位小数。 */
    readonly latitude: number
    /** 经度，两位小数。 */
    readonly longitude: number
  }
  /** 极简光照的窗户信息。 */
  readonly window: {
    /** 窗面方位角（正北顺时针，度）。 */
    readonly azimuthDeg: number
    /** 玻璃层数；none 为户外/开放阳台，null 为未知。 */
    readonly glassLayers: 'single' | 'double' | 'none' | null
  }
  /** 植物位置 Lux 读数；未测为 null。 */
  readonly lightReading: {
    /** 照度（lux），非负。 */
    readonly lux: number
    /** 测量 UTC 毫秒。 */
    readonly measuredAtMs: number
    /** 测光仪或摄像头估算。 */
    readonly source: 'meter' | 'camera_estimate'
  } | null
  /** 当前盆土观察；未观察为 null。可靠性由上游判定。 */
  readonly soil: Omit<MvpSoilObservation, 'reliable'> | null
  /** 最近确认浇水 UTC 毫秒；不知道为 null。 */
  readonly lastWateringAtMs: number | null
  /** 实际种植内盆证据；缺失各项为 null。 */
  readonly pot: MeasuredPotInput
  /** 用户勾选的材料代码集合。 */
  readonly materials: readonly string[]
  /** 用户标注的主要材料（占一半及以上，合同 mvp-watering-policy §8.10）；未标为 null，按各组分并集。 */
  readonly primaryMaterial: string | null
  /** 室内实测温湿度；未测为 null。 */
  readonly indoorClimate: {
    /** 室内温度（°C）。 */
    readonly temperatureC: number
    /** 室内相对湿度（%，0～100）。 */
    readonly relativeHumidityPercent: number
    /** 测量 UTC 毫秒。 */
    readonly measuredAtMs: number
  } | null
}

/** 解析结果；失败不回显任何输入。 */
export type WateringAdviceParseResult =
  | {
      /** 校验通过，已得到可执行的内部命令。 */
      readonly status: 'ok'
      /** 映射后的内部命令。 */
      readonly command: WateringAdviceCommand
    }
  | {
      /** 请求不合法，映射为 VALIDATION_FAILED。 */
      readonly status: 'invalid'
    }

/** UTC 时间字符串格式。 */
const utc = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$' } as const
/** 引用字符串：非空、无空白、长度受限。 */
const reference = { type: 'string', pattern: '^\\S{1,512}$' } as const
/** 严格请求 Schema（watering-advice/v1；2026-10-10 增加可选 primarySubstrateMaterial）。 */
const schema = {
  type: 'object', additionalProperties: false, required: ['target', 'location', 'window'],
  properties: {
    target: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['kind', 'caseRef'], properties: { kind: { const: 'temporary_case' }, caseRef: reference } },
      { type: 'object', additionalProperties: false, required: ['kind', 'userPlantRef'], properties: { kind: { const: 'user_plant' }, userPlantRef: reference } },
    ] },
    catalogTaxonRef: reference,
    location: { type: 'object', additionalProperties: false, required: ['latitude', 'longitude'],
      properties: { latitude: { type: 'number', minimum: -90, maximum: 90 }, longitude: { type: 'number', minimum: -180, maximum: 180 } } },
    window: { type: 'object', additionalProperties: false, required: ['orientation', 'glassLayers'], properties: {
      orientation: { enum: Object.keys(orientationAzimuth) },
      azimuthDeg: { type: 'number', minimum: 0, exclusiveMaximum: 360 },
      glassLayers: { enum: ['single', 'double', 'none', null] },
    } },
    lightReading: { type: ['object', 'null'], additionalProperties: false, required: ['lux', 'measuredAt', 'source'],
      properties: { lux: { type: 'number', minimum: 0 }, measuredAt: utc, source: { enum: ['meter', 'camera_estimate'] } } },
    soil: { type: ['object', 'null'], additionalProperties: false, required: ['state', 'scope', 'observedAt'],
      properties: { state: { enum: ['wet', 'moist', 'dry', 'uncertain'] }, scope: { enum: ['surface', 'root_zone'] }, observedAt: utc } },
    lastWatering: { type: ['object', 'null'], additionalProperties: false, required: ['wateredAt'], properties: { wateredAt: utc } },
    pot: { type: ['object', 'null'], additionalProperties: false,
      required: ['isInnerPot', 'innerTopDiameterCm', 'innerBottomDiameterCm', 'innerHeightCm', 'hasDrainageHole'],
      properties: {
        isInnerPot: { type: ['boolean', 'null'] },
        innerTopDiameterCm: { type: ['number', 'null'], exclusiveMinimum: 0 },
        innerBottomDiameterCm: { type: ['number', 'null'], exclusiveMinimum: 0 },
        innerHeightCm: { type: ['number', 'null'], exclusiveMinimum: 0 },
        hasDrainageHole: { type: ['boolean', 'null'] },
      } },
    substrateMaterials: { type: 'array', maxItems: mvpSubstrateMaterials.length, items: { enum: [...mvpSubstrateMaterials] } },
    primarySubstrateMaterial: { enum: [...mvpSubstrateMaterials, null] },
    indoorClimate: { type: ['object', 'null'], additionalProperties: false, required: ['temperatureC', 'relativeHumidityPercent', 'measuredAt'],
      properties: { temperatureC: { type: 'number', minimum: -20, maximum: 60 }, relativeHumidityPercent: { type: 'number', minimum: 0, maximum: 100 }, measuredAt: utc } },
  },
}
/** 编译一次的校验器。 */
const validate = new Ajv({ strict: false, allErrors: false, strictNumbers: true }).compile(schema)

/** UTC 往返校验后的毫秒；非法返回 null。 */
function parseUtc(value: string): number | null {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) { return null }
  const canonical = new Date(time).toISOString()
  return (value.includes('.') ? canonical : canonical.replace('.000Z', 'Z')) === value ? time : null
}

/** 角度是否落在方位扇区内（含环绕正北）。 */
function withinSector(azimuth: number, center: number): boolean {
  const difference = Math.abs(((azimuth - center + 540) % 360) - 180)
  return difference <= sectorHalfWidthDeg
}

/** 两位小数（约 1km），不保存精确坐标。 */
const roundCoordinate = (value: number) => Math.round(value * 100) / 100

/** 按 watering-advice/v1 校验并映射；`now` 为服务端可信 UTC 毫秒。 */
export function parseWateringAdviceRequest(body: unknown, now: number): WateringAdviceParseResult {
  const invalid = { status: 'invalid' } as const
  if (!body || typeof body !== 'object' || Array.isArray(body) || !validate(body)) { return invalid }
  const request = body as Record<string, any>
  if (request.target.kind === 'temporary_case' && typeof request.catalogTaxonRef !== 'string') { return invalid }
  const center = orientationAzimuth[request.window.orientation as keyof typeof orientationAzimuth]
  const azimuthDeg = request.window.azimuthDeg ?? center
  if (!withinSector(azimuthDeg, center)) { return invalid }
  const times: Record<string, number | null> = {}
  for (const [key, value] of [['light', request.lightReading?.measuredAt], ['soil', request.soil?.observedAt],
    ['watering', request.lastWatering?.wateredAt], ['climate', request.indoorClimate?.measuredAt]] as const) {
    if (value === undefined) { times[key] = null; continue }
    const parsed = parseUtc(value)
    if (parsed === null || parsed > now) { return invalid }
    times[key] = parsed
  }
  const materials = [...new Set<string>(request.substrateMaterials ?? [])]
  // 主要材料必须属于所选材料（2026-10-10 合同修订）；不从其他字段猜测。
  const primaryMaterial: string | null = request.primarySubstrateMaterial ?? null
  if (primaryMaterial !== null && !materials.includes(primaryMaterial)) { return invalid }
  const pot = request.pot ?? null
  return { status: 'ok', command: {
    target: request.target.kind === 'temporary_case'
      ? { kind: 'temporary_case', caseRef: request.target.caseRef }
      : { kind: 'user_plant', userPlantRef: request.target.userPlantRef },
    catalogTaxonRef: request.catalogTaxonRef ?? null,
    location: { latitude: roundCoordinate(request.location.latitude), longitude: roundCoordinate(request.location.longitude) },
    window: { azimuthDeg, glassLayers: request.window.glassLayers },
    lightReading: request.lightReading ? { lux: request.lightReading.lux, measuredAtMs: times.light!, source: request.lightReading.source } : null,
    soil: request.soil ? { state: request.soil.state, scope: request.soil.scope, observedAt: times.soil! } : null,
    lastWateringAtMs: times.watering ?? null,
    pot: {
      actualInnerPotConfirmed: pot?.isInnerPot ?? null, drainageAvailable: pot?.hasDrainageHole ?? null,
      potTopDiameterCm: pot?.innerTopDiameterCm ?? null, potBottomDiameterCm: pot?.innerBottomDiameterCm ?? null, potHeightCm: pot?.innerHeightCm ?? null,
    },
    materials, primaryMaterial,
    indoorClimate: request.indoorClimate ? { temperatureC: request.indoorClimate.temperatureC,
      relativeHumidityPercent: request.indoorClimate.relativeHumidityPercent, measuredAtMs: times.climate! } : null,
  } }
}
