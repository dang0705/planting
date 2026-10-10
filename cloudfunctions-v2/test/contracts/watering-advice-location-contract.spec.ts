import fs from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：models/care/watering-advice-http-contract.md「长期植物的坐标」与 long-term-care-contract.md §2（2026-10-10 用户裁决）：
 * location 只对临时案例必填，长期植物不得提交；缺失码新增 plant_location。
 * 测试层次：L3 / unit_real_data（读取生成后的 OpenAPI 与合同正文）。
 */
const root = findProjectRoot()
const openapi = JSON.parse(fs.readFileSync(path.join(root, 'docs/backend-v2/api/openapi.p1.json'), 'utf8')) as { components: { schemas: Record<string, { required?: string[]; properties?: Record<string, { description?: string }> }> } }

test('OpenAPI WateringAdviceRequest 顶层只要求 target 与 window；location 说明区分临时案例与长期植物', () => {
  const schema = openapi.components.schemas.WateringAdviceRequest!
  expect(schema.required).toEqual(['target', 'window'])
  expect(schema.properties!.location!.description).toMatch(/临时案例必填/u)
  expect(schema.properties!.location!.description).toMatch(/长期植物不得提交/u)
})

test('合同登记 plant_location 缺失码', () => {
  const contract = fs.readFileSync(path.join(root, 'cloudfunctions-v2/models/care/watering-advice-http-contract.md'), 'utf8')
  expect(contract).toContain('`plant_location`')
})
