import { describe, expect, it } from 'vitest'

import { assessMvpWatering } from '../../../src/care/application/assess-mvp-watering.js'
import { approvedV3Body, resolvedPolicy } from './v3-policy-fixture.js'

/**
 * 盆型与基质参与干湿循环（`care-watering-mvp/v3`，用户 2026-10-10 审定）。
 * 层次：L3 unit_fake。真实经过 assessMvpWatering → 盆土映射 → 干燥积分 → 结果投影；
 * 替换边界：环境时段为显式输入（参考环境 PPFD 50、VPD 1.4，叶片项与蒸发项均为 1），不经 Provider、数据库、HTTP。
 * Expected 来源：models/care/mvp-watering-policy-contract.md 第 8 节公式（8.4～8.6）＋用户审定参数＋独立手算
 * （Python 按合同公式逐项计算，不调用 SUT）；方向性用例来自文献方向（mvp-literature-parameters.md §11）。
 * 未覆盖：MySQL 读回、HTTP 端到端、真实盆栽精度。
 *
 * 盆壁材质（κ、wallMaterial、织物盆）不在本次范围：相关用例（P4、P6、D3、D4、R1）保留在文件末尾的 describe.skip，
 * 待盆材质验证票 ClickUp z8v0kmvewm 通过后启用。
 */
const hour = 3_600_000
const day = 86_400_000
const now = Date.UTC(2026, 9, 10, 2)
const policy = resolvedPolicy(approvedV3Body(), now)

type AssessInput = Parameters<typeof assessMvpWatering>[0]

/** 参考环境：从 now 起逐小时，覆盖 30 天，足以容纳最慢窗口。 */
const environment = Array.from({ length: 24 * 30 }, (_, i) => ({ start: now + i * hour, end: now + (i + 1) * hour, ppfd: { min: 50, max: 50 }, indoorVpdKpa: { min: 1.4, max: 1.4 } }))

/** 圆台内盆（cm）。 */
const pot = (top: number | null, bottom: number | null, height: number | null, drainageAvailable: boolean | null = true) =>
  ({ actualInnerPotConfirmed: true, drainageAvailable, potTopDiameterCm: top, potBottomDiameterCm: bottom, potHeightCm: height })

/** “表土干再浇”植物（基线 5～8），当前根区微湿观察：剩余量 [0.25×5, 0.6×8] = [1.25, 4.8] 等效单位。 */
const assess = (potInput: Record<string, unknown>, materials: readonly string[], extra: Record<string, unknown> = {}) => assessMvpWatering({
  policy, now, baseline: { tier: 'regular', trigger: 'SURFACE_DRY', baselineDays: { min: 5, max: 8 } },
  soil: { state: 'moist', scope: 'root_zone', observedAt: now, reliable: true }, lastConfirmedWateringAt: null,
  pot: potInput, materials, environment, timezone: 'Asia/Shanghai', ...extra,
} as unknown as AssessInput)

const at = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null)
/** 手算 Expected 保留 6 位小数（天），允许 1 秒误差；积分交点按毫秒向后取整。 */
const expectDays = (iso: string | null | undefined, days: number) => {
  const value = at(iso)
  expect(value).not.toBeNull()
  expect(Math.abs(value! - (now + days * day))).toBeLessThanOrEqual(1000)
}
const window = (result: ReturnType<typeof assessMvpWatering>) => result.details.checkWindow

describe('v3：盆型与基质参与干湿循环｜L3 unit_fake', () => {
  // 8.5：参考盆恒等——v=1、P=1、Ae=1，S=[0.25/0.3, 0.35/0.3]；窗口 = [1.25×0.833333, 4.8×1.166667]。
  it('P1 参考盆 15/11/13 塑料＋泥炭 → 检查窗口 +1.041667～+5.6 天（不再叠加 0.8～1.25）', () => {
    const result = assess(pot(15, 11, 13), ['peat'])
    expect(result.details.action).toBe('check_later')
    expectDays(window(result)?.earliestAt, 1.041667)
    expectDays(window(result)?.latestAt, 5.6)
  })
  it('P2 12/9/11 塑料＋泥炭（小盆存量少）→ +0.581337～+4.370344 天', () => {
    const result = assess(pot(12, 9, 11), ['peat'])
    expectDays(window(result)?.earliestAt, 0.581337)
    expectDays(window(result)?.latestAt, 4.370344)
  })
  it('P3 20/15/18 塑料＋泥炭（大盆存量多）→ +1.553893～+13.437210 天', () => {
    const result = assess(pot(20, 15, 18), ['peat'])
    expectDays(window(result)?.earliestAt, 1.553893)
    expectDays(window(result)?.latestAt, 13.43721)
  })
  it('P5 12/9/11 塑料＋颗粒土（AW 0.09～0.31）→ +0.209281～+3.870876 天', () => {
    const result = assess(pot(12, 9, 11), ['gritty'])
    expectDays(window(result)?.earliestAt, 0.209281)
    expectDays(window(result)?.latestAt, 3.870876)
  })
  it('D1 方向：同植物同环境，20cm 盆的最晚检查晚于 12cm 盆（存量随体积增加）', () => {
    const small = at(window(assess(pot(12, 9, 11), ['peat']))?.latestAt)!
    const large = at(window(assess(pot(20, 15, 18), ['peat']))?.latestAt)!
    expect(large).toBeGreaterThan(small)
  })
  it('D2 方向：同一 16/12/14 盆，颗粒土的最早检查早于泥炭（可用水（AW，Bilderback 2005 口径）更少）', () => {
    const peat = at(window(assess(pot(16, 12, 14), ['peat']))?.earliestAt)!
    const gritty = at(window(assess(pot(16, 12, 14), ['gritty']))?.earliestAt)!
    expect(gritty).toBeLessThan(peat)
  })
  it('M1 缺盆高（几何不全）→ 维持既有安全顺序：缺证据，不公开窗口（合同 8.6 第 1 行）', () => {
    const result = assess(pot(15, 11, null), ['peat'])
    expect(result.status).toBe('insufficient_evidence')
    expect(result.details.checkWindow).toBeNull()
  })
  it('M2 未选基质 → 兜底存量比 0.8～1.25、P=Ae=1：+1～+6 天（不默认 1、不跨材料猜 AW）', () => {
    const result = assess(pot(20, 15, 18), [])
    expectDays(window(result)?.earliestAt, 1)
    expectDays(window(result)?.latestAt, 6)
  })
  it('S1 排水孔明确没有 → 维持既有安全顺序：review_drainage，不公开窗口、不给水量', () => {
    const result = assess(pot(20, 15, 18, false), ['peat'])
    expect(result.details.action).toBe('review_drainage')
    expect(result.details.checkWindow).toBeNull()
    expect(result.details.amountMl).toBeNull()
  })
})

describe('v3：混合基质「主要材料」规则（合同 8.10）｜L3 unit_fake', () => {
  // 主材料泥炭 [0.25,0.35]，其余组分珍珠岩 [0.08,0.15]：AW = [min(0.25, ½×0.25+½×0.08), max(0.35, ½×0.35+½×0.15)] = [0.165, 0.35]。
  it('PM1 16/12/14 泥炭＋珍珠岩、主材料泥炭 → AW [0.165,0.35]：+0.756895～+7.010979 天', () => {
    const result = assess(pot(16, 12, 14), ['peat', 'perlite'], { primaryMaterial: 'peat' })
    expectDays(window(result)?.earliestAt, 0.756895)
    expectDays(window(result)?.latestAt, 7.010979)
  })
  it('PM2 同上未标主材料 → 退回各组分并集 AW [0.08,0.35]：+0.366979～+7.010979 天', () => {
    const result = assess(pot(16, 12, 14), ['peat', 'perlite'], { primaryMaterial: null })
    expectDays(window(result)?.earliestAt, 0.366979)
    expectDays(window(result)?.latestAt, 7.010979)
  })
  it('PM3 主材料珍珠岩 → AW [0.08,0.25]：最晚 +5.007842 天（上端被收窄）', () => {
    const result = assess(pot(16, 12, 14), ['peat', 'perlite'], { primaryMaterial: 'perlite' })
    expectDays(window(result)?.earliestAt, 0.366979)
    expectDays(window(result)?.latestAt, 5.007842)
  })
  it('PM4 只选一种材料且标为主材料 → 与未标相同', () => {
    expect(window(assess(pot(16, 12, 14), ['peat'], { primaryMaterial: 'peat' }))).toEqual(window(assess(pot(16, 12, 14), ['peat'])))
  })
  it('PM5 主材料不在所选材料中 → 拒绝（上游 DTO 已拦截，此处防御）', () => {
    expect(() => assess(pot(16, 12, 14), ['peat'], { primaryMaterial: 'perlite' })).toThrow(TypeError)
  })
  it('PM6 根区干、主材料泥炭 → 浇水量下端随 AW 收窄提高：70～300 mL（未标为 40～300）', () => {
    const dry = { soil: { state: 'dry', scope: 'root_zone', observedAt: now, reliable: true } }
    expect(assess(pot(16, 12, 14), ['peat', 'perlite'], { ...dry, primaryMaterial: 'peat' }).details.amountMl).toEqual({ min: 70, max: 300 })
    expect(assess(pot(16, 12, 14), ['peat', 'perlite'], dry).details.amountMl).toEqual({ min: 40, max: 300 })
  })
})

/** 盆壁材质草案常量（未启用，待盆材质验证票 z8v0kmvewm）。 */
const draftWallFields = { porousWallEvaporationRatio: { min: 0.4, max: 0.8 } }
const wallPot = (top: number, bottom: number, height: number, wallMaterial: unknown) => ({ ...pot(top, bottom, height), wallMaterial })
const assessWall = (potInput: Record<string, unknown>, materials: readonly string[]) => assess(potInput, materials, { policy: { ...policy, ...draftWallFields } })

describe.skip('盆壁材质（待盆材质验证票 ClickUp z8v0kmvewm，验证通过前不得进入模型）', () => {
  it('P4 20/15/18 素烧陶＋泥炭（盆壁蒸发 κ∈[0.4,0.8]）→ +1.033387～+9.815403 天', () => {
    const result = assessWall(wallPot(20, 15, 18, 'unglazed_terracotta'), ['peat'])
    expectDays(window(result)?.earliestAt, 1.033387)
    expectDays(window(result)?.latestAt, 9.815403)
  })
  it('P6 20/15/18 盆壁材质未知＋泥炭 → κ 取 [0, 0.8] 并集：+1.033387～+13.437210 天', () => {
    const result = assessWall(wallPot(20, 15, 18, null), ['peat'])
    expectDays(window(result)?.earliestAt, 1.033387)
    expectDays(window(result)?.latestAt, 13.43721)
  })
  it('D3 方向：同一 20/15/18 盆配泥炭，素烧陶盆的最早检查早于塑料盆（盆壁蒸发）', () => {
    const plastic = at(window(assessWall(wallPot(20, 15, 18, 'plastic'), ['peat']))?.earliestAt)!
    const terracotta = at(window(assessWall(wallPot(20, 15, 18, 'unglazed_terracotta'), ['peat']))?.earliestAt)!
    expect(terracotta).toBeLessThan(plastic)
  })
  it('D4 釉面陶瓷与塑料同属不透气盆壁 → 窗口完全相同', () => {
    expect(window(assessWall(wallPot(20, 15, 18, 'glazed_ceramic'), ['peat']))).toEqual(window(assessWall(wallPot(20, 15, 18, 'plastic'), ['peat'])))
  })
  it('R1 盆壁材质非法字符串 → 拒绝，不做字符串猜测', () => {
    expect(() => assessWall(wallPot(15, 11, 13, 'clay'), ['peat'])).toThrow(TypeError)
  })
})
