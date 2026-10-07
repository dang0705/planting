import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { compileWaterState } from '../../src/plant-knowledge/watering/compile-water-state.js'
import { createMysqlTropicalsWateringBaselineRepository } from '../../src/plant-knowledge/repository/mysql-tropicals-watering-baseline-repository.js'
const fixture = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/plant-knowledge/fixtures/tropicals-watering-baseline-join.json'), 'utf8'))
const ref = (slug: string) => `https://tropicals.cn/species/${slug}`

/** L1 unit_fake：已确认词义/条件句边界，期望不从SUT计算。 */
describe('unit_fake 浇水trigger保留tier而不是直接定天数', () => {
  it('同样见干见湿仍保留不同tier', () => {
    expect(compileWaterState({ tier: 'regular', remarks: '见干见湿' })).toMatchObject({ status: 'classified', tier: 'regular', trigger: 'DRY_WET' })
    expect(compileWaterState({ tier: 'occasional', remarks: '见干见湿' })).toMatchObject({ status: 'classified', tier: 'occasional', trigger: 'DRY_WET' })
  })
  it('条件微湿不覆盖无条件主句；全部条件或冲突只用tier默认', () => {
    expect(compileWaterState({ tier: 'regular', remarks: '见干见湿，生长期保持微湿' })).toMatchObject({ trigger: 'DRY_WET' })
    expect(compileWaterState({ tier: 'regular', remarks: '生长季保持微湿，休眠期控水' })).toMatchObject({ trigger: 'TIER_DEFAULT' })
    expect(compileWaterState({ tier: 'regular', remarks: '保持微湿，干透浇透' })).toMatchObject({ trigger: 'TIER_DEFAULT' })
  })
  it('否定触发词不能编译为正向要求', () => {
    expect(compileWaterState({ tier: 'regular', remarks: '不要保持盆土微湿' })).toMatchObject({ trigger: 'TIER_DEFAULT' })
    expect(compileWaterState({ tier: 'regular', remarks: '保持盆土微湿，不要长期干燥' })).toMatchObject({ trigger: 'KEEP_MOIST' })
  })
  it('季节条件跨逗号保留，只在句号或分号后恢复独立主句', () => {
    expect(compileWaterState({ tier: 'regular', remarks: '冬季，保持盆土微湿' })).toMatchObject({ trigger: 'TIER_DEFAULT', generalClauses: [], conditionalClauses: ['冬季', '保持盆土微湿'] })
    expect(compileWaterState({ tier: 'regular', remarks: '冬季，保持盆土微湿。全年见干见湿' })).toMatchObject({ trigger: 'DRY_WET' })
    expect(compileWaterState({ tier: 'regular', remarks: '见干见湿，冬季，保持盆土微湿' })).toMatchObject({ trigger: 'DRY_WET' })
  })
  it('特殊供水、污染及未知tier不进入普通基线', () => {
    expect(compileWaterState({ tier: 'regular', remarks: '水培保持水位' })).toMatchObject({ status: 'special_cultivation' })
    expect(compileWaterState({ tier: 'regular', remarks: '叶形为羽状复叶，叶序互生' })).toMatchObject({ status: 'contamination' })
    expect(compileWaterState({ tier: 'unknown', remarks: '见干见湿' })).toMatchObject({ status: 'unsupported_tier' })
  })
})

/** L3 unit_real_data：真实CloudBase读回制品；只替SQL执行边界，真实编译/选择/快照运行。 */
describe('unit_real_data 来源与小策略表到名义基线', () => {
  function setup(slug: string) {
    const rows = structuredClone(fixture.rows.filter((r: Record<string, unknown>) => r.taxon_id === ref(slug)))
    const query = vi.fn(async (_sql: string, _parameters: readonly unknown[]) => rows)
    return { rows, query, repository: createMysqlTropicalsWateringBaselineRepository({ query }) }
  }
  it.each([['epipremnum-aureum', 'SURFACE_DRY', 5, 8], ['astrophytum-asterias', 'FULL_DRY', 14, 21], ['monstera-deliciosa', 'DRY_WET', 7, 14]])('真实来源%s对应明确规则而非硬编码天数', async (slug, trigger, min, max) => {
    const { repository, query } = setup(slug as string)
    const result = await repository.read({ catalogTaxonRef: ref(slug as string), policyVersion: 'v1' })
    expect(result).toMatchObject({ status: 'available_candidate', productionAdmission: false, tier: slug === 'astrophytum-asterias' ? 'drought_tolerant' : 'regular', trigger, baselineDays: { min, max }, basis: 'nominal_calendar_days', referenceConditions: 'unconfirmed' })
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]![1]).toEqual(['v1', ref(slug as string)])
    expect(query.mock.calls[0]![0]).toContain('CAST(p.water_frequency_tier AS BINARY)')
    if (result.status !== 'available_candidate') { throw new Error('真实制品应可回放') }
    expect(result.snapshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.snapshot.source.independent_review_status).toBe('unreviewed_source_ai_extraction')
    expect(result).not.toHaveProperty('minDryUnits')
  })
  it('无来源与JSON损坏分别返回明确失败', async () => {
    expect(await createMysqlTropicalsWateringBaselineRepository({ query: async () => [] }).read({ catalogTaxonRef: ref('missing'), policyVersion: 'v1' })).toMatchObject({ status: 'not_found' })
    const { repository, rows } = setup('epipremnum-aureum'); for (const r of rows) { r.water_frequency_source_json = '{broken' }
    expect(await repository.read({ catalogTaxonRef: ref('epipremnum-aureum'), policyVersion: 'v1' })).toMatchObject({ status: 'invalid_source' })
  })
  it('缺具体规则不偷换默认；重复匹配拒绝', async () => {
    const first = setup('epipremnum-aureum'); first.rows.splice(0, first.rows.length, ...first.rows.filter((r: Record<string, unknown>) => r.trigger_state !== 'SURFACE_DRY'))
    expect(await first.repository.read({ catalogTaxonRef: ref('epipremnum-aureum'), policyVersion: 'v1' })).toMatchObject({ status: 'policy_missing' })
    const second = setup('epipremnum-aureum'); second.rows.push(structuredClone(second.rows.find((r: Record<string, unknown>) => r.trigger_state === 'SURFACE_DRY')))
    await expect(second.repository.read({ catalogTaxonRef: ref('epipremnum-aureum'), policyVersion: 'v1' })).rejects.toThrow()
  })
  it('JSON可为驱动对象或字符串；调用后原文变更不改历史快照', async () => {
    const { repository, rows } = setup('epipremnum-aureum'); for (const r of rows) { r.water_frequency_source_json = JSON.stringify(r.water_frequency_source_json) }
    const result = await repository.read({ catalogTaxonRef: ref('epipremnum-aureum'), policyVersion: 'v1' })
    if (result.status !== 'available_candidate') { throw new Error('制品应可用') }
    rows[0].water_frequency_source_json = '{}'
    expect(result.snapshot.source.record.measurementRemarks).toBe('表土干燥后及时补水')
  })
  it('等待SQL期间调用方改写请求，不改变已锁定的引用及版本', async () => {
    const { rows } = setup('epipremnum-aureum')
    let release!: (value: typeof rows) => void
    const pending = new Promise<typeof rows>(resolve => { release = resolve })
    const repository = createMysqlTropicalsWateringBaselineRepository({ query: async () => pending })
    const request = { catalogTaxonRef: ref('epipremnum-aureum'), policyVersion: 'v1' }
    const result = repository.read(request)
    request.catalogTaxonRef = ref('monstera-deliciosa')
    request.policyVersion = 'v2'
    release(rows)
    expect(await result).toMatchObject({ status: 'available_candidate', snapshot: { catalogTaxonRef: ref('epipremnum-aureum'), policy: { policyVersion: 'v1' } } })
  })
  it('SQL错误原样上抛；非法请求不访问数据库', async () => {
    const failure = new Error('synthetic-db-failure'); const query = vi.fn(async () => { throw failure })
    const repo = createMysqlTropicalsWateringBaselineRepository({ query })
    await expect(repo.read({ catalogTaxonRef: ref('epipremnum-aureum'), policyVersion: '' })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
    await expect(repo.read({ catalogTaxonRef: ref('epipremnum-aureum'), policyVersion: 'v1' })).rejects.toBe(failure)
  })
  it('源tier不一致、非法天数和错误版本不提供基线', async () => {
    const bad = setup('epipremnum-aureum'); for (const r of bad.rows) { r.water_frequency_source_json.record.measurementValue = 'occasional' }
    expect(await bad.repository.read({ catalogTaxonRef: ref('epipremnum-aureum'), policyVersion: 'v1' })).toMatchObject({ status: 'invalid_source' })
    for (const mutate of [(r: Record<string, unknown>) => { r.min_days = 99 }, (r: Record<string, unknown>) => { r.policy_version = 'v2' }, (r: Record<string, unknown>) => { r.is_active = 0 }]) {
      const value = setup('epipremnum-aureum'); mutate(value.rows.find((r: Record<string, unknown>) => r.trigger_state === 'SURFACE_DRY'))
      await expect(value.repository.read({ catalogTaxonRef: ref('epipremnum-aureum'), policyVersion: 'v1' })).rejects.toThrow()
    }
  })
})
