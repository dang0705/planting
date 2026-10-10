import { describe, expect, test } from 'vitest'

import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'
import type {
  VisualAxisCatalogAxis,
  VisualAxisCode
} from '../../src/plant-knowledge/domain/visual-axis-filter.js'
import {
  assignVisualValueBits,
  computeVisualAxisMask,
  selectionMask,
  visualFilterSourceKey
} from '../../src/plant-knowledge/domain/visual-filter-index.js'

/**
 * Expected：plant-visual-axis-filter/v1 修订 1 §1、§4、§8（预计算筛选索引与结果表规则逐条等价；索引过期 503）
 * 与 031 迁移注释（source_key = visualAxisSources 规范 JSON SHA-256；位序号 0–63）。
 * 层次：L1 / unit_fake（纯函数，无替换边界）。
 */
const sources = {
  valueCatalogVersion: 'v1',
  LEAF_SHAPE: 'visual-axis-all-v1',
  GROWTH_FORM: 'visual-axis-all-v1',
  LEAF_SURFACE: 'visual-axis-all-v1'
}

function axis(axisCode: VisualAxisCode, codes: string[]): VisualAxisCatalogAxis {
  return {
    axisCode,
    nameZh: axisCode,
    values: codes.map((valueCode, index) => ({
      valueCode,
      nameZh: valueCode,
      definitionZh: valueCode,
      sortOrder: (index + 1) * 10
    }))
  }
}
const catalog = new Map<VisualAxisCode, VisualAxisCatalogAxis>([
  ['LEAF_SHAPE', axis('LEAF_SHAPE', ['HEART', 'ELLIPTIC', 'LOBED'])],
  ['GROWTH_FORM', axis('GROWTH_FORM', ['UPRIGHT', 'VINING'])],
  ['LEAF_SURFACE', axis('LEAF_SURFACE', ['GLOSSY', 'LEATHERY'])]
])

describe('三轴筛选索引纯规则', () => {
  test('source_key = visualAxisSources 规范 JSON 的 SHA-256，与字段顺序无关，版本变化即变化', () => {
    expect(visualFilterSourceKey(sources)).toBe(calculateCanonicalJsonSha256(sources))
    expect(
      visualFilterSourceKey({
        LEAF_SURFACE: 'visual-axis-all-v1',
        GROWTH_FORM: 'visual-axis-all-v1',
        LEAF_SHAPE: 'visual-axis-all-v1',
        valueCatalogVersion: 'v1'
      })
    ).toBe(visualFilterSourceKey(sources))
    expect(visualFilterSourceKey({ ...sources, LEAF_SHAPE: 'visual-axis-all-v2' })).not.toBe(
      visualFilterSourceKey(sources)
    )
    expect(visualFilterSourceKey(sources)).toMatch(/^[0-9a-f]{64}$/u)
  })

  test('位序号按生效枚举顺序（sort_order、值代码）从 0 起逐轴分配', () => {
    const bits = assignVisualValueBits(catalog)
    expect([...bits.get('LEAF_SHAPE')!.entries()]).toEqual([
      ['HEART', 0],
      ['ELLIPTIC', 1],
      ['LOBED', 2]
    ])
    expect([...bits.get('GROWTH_FORM')!.entries()]).toEqual([
      ['UPRIGHT', 0],
      ['VINING', 1]
    ])
  })

  test('某轴超过 64 个值时拒绝构建（位掩码为 BIGINT UNSIGNED）', () => {
    const big = new Map(catalog)
    big.set(
      'LEAF_SHAPE',
      axis(
        'LEAF_SHAPE',
        Array.from({ length: 65 }, (_unused, index) => `V${index}`)
      )
    )
    expect(() => assignVisualValueBits(big)).toThrow()
  })

  test('取值掩码：只收录数组中的目录内字符串代码；非数组、空数组、全是目录外代码为 0', () => {
    const bits = assignVisualValueBits(catalog).get('LEAF_SHAPE')!
    expect(computeVisualAxisMask(['LOBED', 'HEART'], bits)).toBe(0b101n)
    expect(computeVisualAxisMask(['HEART', 'NOT_IN_CATALOG', 7, null], bits)).toBe(0b1n)
    expect(computeVisualAxisMask('HEART', bits)).toBe(0n)
    expect(computeVisualAxisMask(null, bits)).toBe(0n)
    expect(computeVisualAxisMask({ 0: 'HEART' }, bits)).toBe(0n)
    expect(computeVisualAxisMask([], bits)).toBe(0n)
    expect(computeVisualAxisMask(['heart'], bits)).toBe(0n)
  })

  test('请求掩码：同轴多值按位或；任一值不在位表（索引过期）返回 null', () => {
    const bits = assignVisualValueBits(catalog).get('LEAF_SHAPE')!
    expect(selectionMask(['HEART', 'LOBED'], bits)).toBe(0b101n)
    expect(selectionMask(['HEART', 'SQUARE'], bits)).toBeNull()
    expect(selectionMask(['HEART'], undefined)).toBeNull()
  })
})
