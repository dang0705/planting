import { describe, expect, it } from 'vitest'
import { parseWateringAdviceRequest } from '../../src/care/http/watering-advice-request.js'

/**
 * Expected：models/care/mvp-watering-test-matrix.md 第 G 节（watering-advice/v1 冻结合同）。
 * 层次 L1 unit_fake：纯校验与映射，不经过 HTTP、数据库或 Provider。
 */
const now = Date.UTC(2026, 9, 8, 2)
const iso = (ms: number) => new Date(ms).toISOString()
const full = () => ({
  target: { kind: 'temporary_case', caseRef: 'case_abc123' },
  catalogTaxonRef: 'https://tropicals.cn/species/epipremnum-aureum',
  // 2026-10-10 用户纠偏：临时案例改交城市代码（服务端取城市中心坐标），朝向只收 8 方位。
  cityCode: 'shanghai',
  window: { orientation: 'S' },
  lightReading: { lux: 1200, measuredAt: iso(now - 60_000), source: 'camera_estimate' },
  soil: { state: 'moist', scope: 'root_zone', observedAt: iso(now - 120_000) },
  lastWatering: { wateredAt: iso(now - 3 * 86_400_000) },
  pot: { isInnerPot: true, innerTopDiameterCm: 16, innerBottomDiameterCm: 12, innerHeightCm: 14, hasDrainageHole: true },
  substrateMaterials: ['peat', 'perlite'],
  indoorClimate: { temperatureC: 23.5, relativeHumidityPercent: 45, measuredAt: iso(now - 60_000) },
})
const parse = (body: unknown) => parseWateringAdviceRequest(body, now)
const invalid = { status: 'invalid' }

describe('watering-advice 请求校验｜L1 unit_fake', () => {
  it('Happy：完整请求映射为命令；城市代码待服务端换坐标（location 先为 null），朝向原样保留，时间转毫秒', () => {
    expect(parse(full())).toEqual({ status: 'ok', command: {
      target: { kind: 'temporary_case', caseRef: 'case_abc123' },
      catalogTaxonRef: 'https://tropicals.cn/species/epipremnum-aureum',
      cityRef: 'shanghai', location: null,
      window: { orientation: 'S' },
      lightReading: { lux: 1200, measuredAtMs: now - 60_000, source: 'camera_estimate' },
      soil: { state: 'moist', scope: 'root_zone', observedAt: now - 120_000 },
      lastWateringAtMs: now - 3 * 86_400_000,
      pot: { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 16, potBottomDiameterCm: 12, potHeightCm: 14 },
      materials: ['peat', 'perlite'], primaryMaterial: null,
      indoorClimate: { temperatureC: 23.5, relativeHumidityPercent: 45, measuredAtMs: now - 60_000 },
    } })
  })
  it('朝向 8 方位都接受；已删除的 azimuthDeg、glassLayers、latitude/longitude 一律拒绝（2026-10-10 用户纠偏）', () => {
    for (const orientation of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) { expect(parse({ ...full(), window: { orientation } }).status).toBe('ok') }
    expect(parse({ ...full(), window: { orientation: 'N', azimuthDeg: 359.9 } })).toEqual(invalid)
    expect(parse({ ...full(), window: { orientation: 'S', glassLayers: 'double' } })).toEqual(invalid)
    expect(parse({ ...full(), location: { latitude: 31.23, longitude: 121.47 } })).toEqual(invalid)
  })
  it('U1：只填必填项时可选项为 null，不补默认', () => {
    // 2026-10-10 用户裁决：长期植物不再接收前端坐标（由服务端用档案城市中心坐标），命令中 location 为 null 待服务端填充。
    const result = parse({ target: { kind: 'user_plant', userPlantRef: 'upl_xyz789' }, window: { orientation: 'E' } })
    expect(result).toEqual({ status: 'ok', command: {
      target: { kind: 'user_plant', userPlantRef: 'upl_xyz789' }, catalogTaxonRef: null,
      cityRef: null, location: null, window: { orientation: 'E' },
      lightReading: null, soil: null, lastWateringAtMs: null,
      pot: { actualInnerPotConfirmed: null, drainageAvailable: null, potTopDiameterCm: null, potBottomDiameterCm: null, potHeightCm: null },
      materials: [], primaryMaterial: null, indoorClimate: null,
    } })
  })
  it.each([
    ['缺 target', (b: Record<string, any>) => { delete b.target }],
    ['临时案例缺城市代码', (b: Record<string, any>) => { delete b.cityCode }],
    ['城市代码含大写', (b: Record<string, any>) => { b.cityCode = 'ShangHai' }],
    ['缺朝向', (b: Record<string, any>) => { b.window = {} }],
    ['临时案例缺品种', (b: Record<string, any>) => { delete b.catalogTaxonRef }],
  ])('U1：%s → 校验失败', (_name, change) => {
    const body = full() as Record<string, any>; change(body)
    expect(parse(body)).toEqual(invalid)
  })
  it('长期植物提交 cityCode → 校验失败（坐标由服务端按档案城市取，2026-10-10 用户裁决）', () => {
    expect(parse({ target: { kind: 'user_plant', userPlantRef: 'upl_xyz789' }, cityCode: 'beijing',
      window: { orientation: 'E' } })).toEqual(invalid)
  })
  it('U1 元素洞：材料列表含 null 在边界拒绝', () => {
    expect(parse({ ...full(), substrateMaterials: [null, 'peat'] })).toEqual(invalid)
  })
  it.each([
    ['未知字段', (b: Record<string, any>) => { b.defaultAmountMl = 200 }],
    ['未知材料', (b: Record<string, any>) => { b.substrateMaterials = ['moon_dust'] }],
    ['Lux 为负', (b: Record<string, any>) => { b.lightReading.lux = -1 }],
    ['非 UTC 时间', (b: Record<string, any>) => { b.soil.observedAt = '2026-10-08 10:00' }],
    ['观察晚于 now', (b: Record<string, any>) => { b.soil.observedAt = iso(now + 1000) }],
    ['未知朝向', (b: Record<string, any>) => { b.window = { orientation: 'up' } }],
    ['非对象请求体', () => { /* 由下方单独断言 */ }],
  ])('U3：%s → 校验失败', (name, change) => {
    if (name === '非对象请求体') { expect(parse('not-json')).toEqual(invalid); expect(parse(null)).toEqual(invalid); return }
    const body = full() as Record<string, any>; change(body)
    expect(parse(body)).toEqual(invalid)
  })
  it('Reverse：校验失败结果不回显输入值', () => {
    const body = { ...full(), defaultAmountMl: 200 }
    const serialized = JSON.stringify(parse(body))
    expect(serialized).not.toContain('31.23456')
    expect(serialized).not.toContain('case_abc123')
  })
})

describe('watering-advice 主要材料字段 primarySubstrateMaterial（合同修订 2026-10-10）｜L1 unit_fake', () => {
  // Expected：用户 2026-10-10 审定「让用户标主要材料」；watering-advice-http-contract.md 字段表。
  it('PS1 主要材料在所选材料中 → 映射为 primaryMaterial', () => {
    const result = parse({ ...full(), primarySubstrateMaterial: 'peat' })
    expect(result.status === 'ok' && result.command.primaryMaterial).toBe('peat')
  })
  it('PS2 显式 null 或缺省 → primaryMaterial 为 null（退回并集）', () => {
    const explicit = parse({ ...full(), primarySubstrateMaterial: null })
    expect(explicit.status === 'ok' && explicit.command.primaryMaterial).toBeNull()
  })
  it('PS3 主要材料不在所选材料中、未选材料却标主要材料、未知代码 → VALIDATION_FAILED', () => {
    expect(parse({ ...full(), primarySubstrateMaterial: 'bark' })).toEqual(invalid)
    expect(parse({ ...full(), substrateMaterials: [], primarySubstrateMaterial: 'peat' })).toEqual(invalid)
    expect(parse({ ...full(), primarySubstrateMaterial: 'moon_dust' })).toEqual(invalid)
  })
})

