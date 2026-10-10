import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY } from '../../src/configuration/business-policies/index.js'
import { loadPolicyReleaseDocument } from '../../src/configuration/policy-release/release-document.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1 / unit_real_data（读取真实 v1、v2 发布文档）。
 * Expected 来源：plant-visual-axis-filter/v1 §7（用户 2026-10-10 审定：每页默认 20、上限 50、绝对上限 50；
 * 三轴均用 visual-axis-all-v1，版本写进策略；核心 90 的 v2 不得冒充全量）与配置目录
 * `plant-knowledge.visual_filter.page_size`、`plant-knowledge.visual_filter.axis_sources`。
 * 「v1 行为不变」：v1 正文仍可解析，且 v2 中 v1 原有四字段取值与 v1 相同。
 * 未覆盖：数据库读取（见 mysql 用例）。
 */
const root = findProjectRoot()
const read = (file: string) =>
  readFileSync(join(root, 'cloudfunctions-v2/models/policy-releases', file), 'utf8')
const loadBody = (file: string) => {
  const loaded = loadPolicyReleaseDocument(JSON.parse(read(file)), path =>
    readFileSync(join(root, path), 'utf8')
  )
  if (!loaded.ok) {
    throw new Error(loaded.reason)
  }
  return loaded
}
const v2 = () => loadBody('plant-knowledge.public_search.v2.release.json')
const resolveV2 = (policy: unknown) =>
  PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY.resolve(policy, 'plant-knowledge-public-search/v2')

describe('plant-knowledge/public_search v2（三轴筛选）', () => {
  it('v2 发布文档：分页 20/50，三轴均为 visual-axis-all-v1，枚举 v1；v1 原四字段取值不变', () => {
    const loaded = v2()
    expect([
      loaded.document.domainCode,
      loaded.document.policyCode,
      loaded.document.schemaVersion
    ]).toEqual(['plant-knowledge', 'public_search', 'plant-knowledge-public-search/v2'])
    const rules = resolveV2(loaded.policy)
    expect(rules).toEqual({
      contractVersion: 'plant-knowledge-public-search/v2',
      searchQueryMaxCodePoints: 64,
      searchResultMaxItems: 20,
      catalogDefaultLimit: 10,
      encyclopediaReferenceMaxCodePoints: 512,
      visualFilterPageSize: { default: 20, max: 50 },
      visualAxisSources: {
        valueCatalogVersion: 'v1',
        LEAF_SHAPE: 'visual-axis-all-v1',
        GROWTH_FORM: 'visual-axis-all-v1',
        LEAF_SURFACE: 'visual-axis-all-v1'
      }
    })
  })

  it('v1 正文仍可解析且不含三轴字段（v1 行为不变）', () => {
    const v1 = loadBody('plant-knowledge.public_search.v1.release.json')
    const rules = PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY.resolve(
      v1.policy,
      'plant-knowledge-public-search/v1'
    )
    expect(rules).not.toBeNull()
    expect(rules).not.toHaveProperty('visualFilterPageSize')
    expect(rules).not.toHaveProperty('visualAxisSources')
  })

  it('读取方同时接受 v2 与 v1', () => {
    expect(PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY.schemaVersions).toEqual(
      expect.arrayContaining([
        'plant-knowledge-public-search/v2',
        'plant-knowledge-public-search/v1'
      ])
    )
  })

  it.each([
    [
      '每页上限超过绝对上限 50',
      (p: Record<string, any>) => {
        p.visualFilterPageSize = { default: 20, max: 51 }
      }
    ],
    [
      '默认大于上限',
      (p: Record<string, any>) => {
        p.visualFilterPageSize = { default: 30, max: 20 }
      }
    ],
    [
      '默认为 0',
      (p: Record<string, any>) => {
        p.visualFilterPageSize = { default: 0, max: 50 }
      }
    ],
    [
      '叶型改用核心 90 的 visual-axis-v2',
      (p: Record<string, any>) => {
        p.visualAxisSources.LEAF_SHAPE = 'visual-axis-v2'
      }
    ],
    [
      '株型改用旧 visual-axis-v1',
      (p: Record<string, any>) => {
        p.visualAxisSources.GROWTH_FORM = 'visual-axis-v1'
      }
    ],
    [
      '缺叶面质感来源',
      (p: Record<string, any>) => {
        delete p.visualAxisSources.LEAF_SURFACE
      }
    ],
    [
      '混入未准入的叶缘轴',
      (p: Record<string, any>) => {
        p.visualAxisSources.LEAF_MARGIN = 'visual-axis-all-v1'
      }
    ],
    [
      '枚举版本为空',
      (p: Record<string, any>) => {
        p.visualAxisSources.valueCatalogVersion = ''
      }
    ],
    [
      '缺分页字段',
      (p: Record<string, any>) => {
        delete p.visualFilterPageSize
      }
    ],
    [
      'v1 字段越界（目录默认大于结果上限）',
      (p: Record<string, any>) => {
        p.catalogDefaultLimit = 21
      }
    ],
    [
      '合同版本仍写 v1',
      (p: Record<string, any>) => {
        p.contractVersion = 'plant-knowledge-public-search/v1'
      }
    ]
  ])('%s → 解析失败（读取方按 503 处理）', (_label, mutate) => {
    const policy = structuredClone(v2().policy) as Record<string, any>
    mutate(policy)
    expect(resolveV2(policy)).toBeNull()
  })

  it('v2 正文按 v1 Schema 解析失败（不混用版本）', () => {
    expect(
      PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY.resolve(v2().policy, 'plant-knowledge-public-search/v1')
    ).toBeNull()
  })
})
