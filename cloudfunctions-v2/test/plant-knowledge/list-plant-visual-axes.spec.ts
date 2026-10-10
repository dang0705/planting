import { afterEach, describe, expect, test } from 'vitest'

import { plantKnowledgePublicSearchV2ReleaseVersion } from '../support/business-policy-fixtures.js'
import { axesPath, catalogRows, start, stop } from './support/visual-axis-fake.js'

/**
 * Expected：plant-visual-axis-filter/v1 §2、§6（visual-axes 三轴枚举）。
 * 层次：L3 / unit_fake，只替换 MySQL 与策略快照端口；真实 SQL 读回见 test/e2e/plant-visual-axis-filter.mysql.spec.ts。
 */
afterEach(stop)

describe('visual-axes 枚举', () => {
  test('三轴固定顺序、值按 sort_order，含参数名与中文；不含内部列；顶层带策略版本', async () => {
    const base = await start({ catalog: [...catalogRows].reverse() })
    const response = await fetch(`${base}${axesPath}`)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      data: {
        policyReleaseVersion: plantKnowledgePublicSearchV2ReleaseVersion,
        axes: [
          {
            axisCode: 'LEAF_SHAPE',
            queryParameter: 'leafShape',
            nameZh: '叶型',
            values: [
              {
                valueCode: 'HEART',
                nameZh: '心形',
                definitionZh: '叶片整体呈心形、卵心形或宽心形。'
              },
              { valueCode: 'ELLIPTIC', nameZh: '椭圆/卵圆形', definitionZh: '椭圆轮廓' },
              { valueCode: 'LOBED', nameZh: '裂叶/羽裂形', definitionZh: '裂叶轮廓' }
            ]
          },
          {
            axisCode: 'GROWTH_FORM',
            queryParameter: 'growthForm',
            nameZh: '株型',
            values: [
              { valueCode: 'UPRIGHT', nameZh: '直立高挑', definitionZh: '主干向上' },
              { valueCode: 'VINING', nameZh: '攀援藤本', definitionZh: '藤本骨架' }
            ]
          },
          {
            axisCode: 'LEAF_SURFACE',
            queryParameter: 'leafSurface',
            nameZh: '叶面质感',
            values: [
              { valueCode: 'GLOSSY', nameZh: '有光泽', definitionZh: '光泽' },
              { valueCode: 'LEATHERY', nameZh: '革质', definitionZh: '革质' }
            ]
          }
        ]
      }
    })
    expect(text).not.toContain('sort_order')
    expect(text).not.toContain('catalog_version')
  })

  test('生效枚举缺某一准入轴 → 500', async () => {
    const base = await start({
      catalog: catalogRows.filter(row => row.axis_code !== 'LEAF_SURFACE')
    })
    expect((await fetch(`${base}${axesPath}`)).status).toBe(500)
  })
})
