import { describe, expect, test } from 'vitest'

import {
  computeVisualCallCostMicros,
  computeVisualChargedPoints,
  sumVisualCostMicros
} from '../../../src/diagnosis/visual/domain/visual-cost.js'
import {
  buildNormalizedImageObjectId,
  buildVisualUploadPath,
  isOwnVisualFileId,
  mimeOfVisualFileId
} from '../../../src/diagnosis/visual/domain/visual-image-path.js'
import {
  renderVisualDynamicText,
  sanitizeContextSummary
} from '../../../src/diagnosis/visual/domain/context-summary.js'

/**
 * Expected 来源：
 * - 成本：care-points-and-ai-quota.md §AI 点数（1 点 = 800 微元、向上取整、整数微元、缓存命中只降低结算）与
 *   2026-10-10 价目快照（命中 10%、创建 125%）；diagnosis-visual-api.md §2.3（chargedPoints 不超过预估点数）。
 * - 路径：diagnosis-visual-api.md §2.1（cloudPath = diagnosis/{usr_…}/visual/{yyyyMM}/{32 位十六进制}，前端追加 .jpg/.png/.webp；目录属于本人）。
 * - 上下文：diagnosis-context-summary.md（最多 12 条、≤40 字、不含坐标；临时案例只允许 5 类事实）与
 *   提示词 v1.3 草案 §11（固定顺序拼装、缺失写「未知」、用户描述只截断和清洗控制字符）。
 * 测试层次：unit_fake（纯函数）。
 */
const flash = {
  inputMicrosPerMillionTokens: 200_000,
  outputMicrosPerMillionTokens: 800_000,
  cacheHitBasisPoints: 1000,
  cacheCreateBasisPoints: 12_500,
  priceSnapshotRef: 'x'
}

describe('视觉诊断成本（整数微元）', () => {
  test('无缓存：10,000 输入 + 2,000 输出 = 2,000 + 1,600 = 3,600 微元', () => {
    expect(
      computeVisualCallCostMicros(
        { promptTokens: 10_000, completionTokens: 2_000, cachedTokens: 0, cacheCreationTokens: 0 },
        flash
      )
    ).toBe(3600)
  })

  test('缓存命中 8,000（10%）与缓存创建 0：1,600×0.2 + 8,000×0.02 + 1,000×0.8 = 320 + 160 + 800 = 1,280', () => {
    expect(
      computeVisualCallCostMicros(
        { promptTokens: 9_600, completionTokens: 1_000, cachedTokens: 8_000, cacheCreationTokens: 0 },
        flash
      )
    ).toBe(1280)
  })

  test('缓存创建按 125% 计价，小数向上取整到微元', () => {
    // 1×0.2 + 7×0.25 = 1.95 → 2
    expect(
      computeVisualCallCostMicros(
        { promptTokens: 8, completionTokens: 0, cachedTokens: 0, cacheCreationTokens: 7 },
        flash
      )
    ).toBe(2)
  })

  test('多次调用按各自模型价目累加；缺价目时失败关闭', () => {
    expect(
      sumVisualCostMicros(
        [
          { modelCode: 'a', usage: { promptTokens: 10_000, completionTokens: 2_000, cachedTokens: 0, cacheCreationTokens: 0 } },
          { modelCode: 'b', usage: { promptTokens: 1_000, completionTokens: 0, cachedTokens: 0, cacheCreationTokens: 0 } }
        ],
        { a: flash, b: { ...flash, inputMicrosPerMillionTokens: 2_000_000 } }
      )
    ).toBe(3600 + 2000)
    expect(() =>
      sumVisualCostMicros(
        [{ modelCode: 'c', usage: { promptTokens: 1, completionTokens: 0, cachedTokens: 0, cacheCreationTokens: 0 } }],
        { a: flash }
      )
    ).toThrow()
  })

  test('结算点数：ceil(costMicros/800)；公开扣点不超过预估点数', () => {
    expect(computeVisualChargedPoints(3600, { microsPerPoint: 800, estimatedPoints: 23 })).toEqual({
      requestedPoints: 5,
      publicChargedPoints: 5
    })
    expect(computeVisualChargedPoints(0, { microsPerPoint: 800, estimatedPoints: 23 })).toEqual({
      requestedPoints: 0,
      publicChargedPoints: 0
    })
    expect(computeVisualChargedPoints(40_000, { microsPerPoint: 800, estimatedPoints: 23 })).toEqual({
      requestedPoints: 50,
      publicChargedPoints: 23
    })
  })
})

describe('上传路径与文件归属', () => {
  const userRef = 'usr_owner_000001'
  const hex = 'a'.repeat(32)

  test('上传路径按合同格式生成', () => {
    expect(buildVisualUploadPath(userRef, Date.UTC(2026, 9, 11), hex)).toBe(
      `diagnosis/${userRef}/visual/202610/${hex}`
    )
  })

  test('只接受本人目录、合法扩展名的云文件 ID', () => {
    const own = `cloud://env-1.bucket-1/diagnosis/${userRef}/visual/202610/${hex}.jpg`
    expect(isOwnVisualFileId(own, userRef)).toBe(true)
    expect(mimeOfVisualFileId(own)).toBe('image/jpeg')
    expect(mimeOfVisualFileId(own.replace('.jpg', '.webp'))).toBe('image/webp')
    for (const bad of [
      own.replace(userRef, 'usr_stranger_00001'),
      own.replace('.jpg', '.gif'),
      own.replace('.jpg', '.heic'),
      own.replace('/visual/', '/visual/../'),
      own.replace('/visual/202610/', '/visual/202610/sub/'),
      own.replace('diagnosis/', 'user-plant/')
    ]) {
      expect(isOwnVisualFileId(bad, userRef)).toBe(false)
    }
  })

  test('压缩后图片写到本人诊断目录下的独立子目录，文件名带诊断编号与序号', () => {
    expect(
      buildNormalizedImageObjectId(userRef, Date.UTC(2026, 9, 11), 'vds_abcdefgh12345678', 2)
    ).toBe(`diagnosis/${userRef}/visual-normalized/202610/vds_abcdefgh12345678-2.jpg`)
  })
})

describe('诊断上下文摘要接入', () => {
  const fact = (key: string, valueZh = '值') => ({
    key,
    valueZh,
    observedAt: null,
    ageDays: null,
    reliability: 'system_derived',
    freshness: 'unknown'
  })
  const summary = (caseKind: string, facts: unknown[]) => ({
    contractVersion: 'diagnosis-context-summary/v1',
    caseKind,
    generatedAt: '2026-10-11T00:00:00Z',
    facts
  })

  test('长期植物摘要通过合同校验后原样保留顺序', () => {
    const value = summary('long_term_plant', [fact('plant_identity', '龟背竹，天南星科'), fact('substrate')])
    expect(sanitizeContextSummary(value, 'long_term_plant')?.facts.map(item => item.key)).toEqual([
      'plant_identity',
      'substrate'
    ])
  })

  test('临时案例只保留 5 类事实；含坐标的事实或结构不合法时整份拒绝', () => {
    expect(sanitizeContextSummary(summary('temporary_case', [fact('substrate')]), 'temporary_case')).toBeNull()
    expect(
      sanitizeContextSummary(summary('long_term_plant', [fact('placement', '31.230416 附近')]), 'long_term_plant')
    ).toBeNull()
    expect(sanitizeContextSummary(summary('long_term_plant', [fact('plant_identity')]), 'temporary_case')).toBeNull()
    expect(sanitizeContextSummary({ contractVersion: 'x' }, 'long_term_plant')).toBeNull()
  })

  test('可变段按固定顺序拼装：缺失事实写「未知」，用户描述清洗控制字符并截断到 200 字', () => {
    const text = renderVisualDynamicText({
      imageCount: 2,
      caseKind: 'temporary_case',
      summary: sanitizeContextSummary(
        summary('temporary_case', [fact('plant_identity', '龟背竹')]),
        'temporary_case'
      ),
      userQuestionZh: `叶子发黄\u0007${'啊'.repeat(300)}`
    })
    expect(text.indexOf('【11 本次任务】')).toBe(0)
    expect(text).toContain('图片数量：2')
    expect(text).toContain('是否可食用：未知')
    expect(text).toContain('病例类型：临时案例')
    expect(text).toContain('plant_identity｜龟背竹｜未知｜系统派生｜未知')
    expect(text).toContain('substrate｜未知（临时案例）')
    expect(text).toContain('watering_history｜未知（临时案例）')
    expect(text).not.toContain('\u0007')
    const lastLine = text.split('\n').at(-1) ?? ''
    const quoted = lastLine.slice(1, -1)
    expect([...quoted].length).toBe(200)
  })

  test('没有摘要与用户描述时也给出全部字段（写「未知」），长期植物不带临时案例标注', () => {
    const text = renderVisualDynamicText({
      imageCount: 1,
      caseKind: 'long_term_plant',
      summary: null,
      userQuestionZh: null
    })
    expect(text).toContain('病例类型：长期植物')
    expect(text).toContain('substrate｜未知')
    expect(text).not.toContain('未知（临时案例）')
    expect(text).toContain('「未知」')
  })
})
