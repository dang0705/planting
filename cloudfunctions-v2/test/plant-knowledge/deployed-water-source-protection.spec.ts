import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1/unit_real_data：Expected来自用户/统一计划“保留非空浇水来源，仅更新measurementValue”。
 * 执行从当前部署包提取并已人工查看的17行纯函数制品，不重新实现该算法。
 * 不执行主入口/SDK/API/SQL；真实SQL三条样本另有只读证据，不证明全数据或本测试执行了线上函数。
 * 本轮没有改产品；这是独立合同验证，不声称产品开发TDD。
 */
const fixture = JSON.parse(
  readFileSync(
    join(findProjectRoot(), '.codex/backend-v2/evidence/E02-water-source-deployed.fixture.json'),
    'utf8'
  )
) as {
  codeSnippet: string
}
function run(sourceValue: unknown, measurementValue: unknown): unknown {
  // 仅已审两个纯函数，在没有require/process/SDK的上下文执行，不评估整个远端代码包。
  return runInNewContext(
    `${fixture.codeSnippet}\nwithApiWaterFrequencyValue(sourceValue,measurementValue)`,
    { sourceValue, measurementValue },
    { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } }
  ) as unknown
}
const original = {
  source_url: 'https://source.example/traits',
  source_sha256: 'a'.repeat(64),
  independent_review_status: 'pending',
  record: {
    measurementID: 'water-1',
    measurementType: 'water_frequency',
    measurementValue: 'occasional',
    measurementRemarks: '保持原始干湿触发描述',
    measurementMethod: 'source_method',
    taxonID: 'taxon-1'
  }
}
test('替换API值但保留来源、原始语义和record其他字段', () => {
  expect(run(original, 'regular')).toEqual({
    source_url: 'https://source.example/traits',
    source_sha256: 'a'.repeat(64),
    independent_review_status: 'pending',
    record: {
      measurementID: 'water-1',
      measurementType: 'water_frequency',
      measurementValue: 'regular',
      measurementRemarks: '保持原始干湿触发描述',
      measurementMethod: 'source_method',
      taxonID: 'taxon-1'
    }
  })
  expect(original.record.measurementValue).toBe('occasional')
})
test('SQL返回JSON文本仍保留全部原字段，不以API枚举重建来源', () => {
  expect(run(JSON.stringify(original), 'drought_tolerant')).toEqual({
    source_url: 'https://source.example/traits',
    source_sha256: 'a'.repeat(64),
    independent_review_status: 'pending',
    record: {
      measurementID: 'water-1',
      measurementType: 'water_frequency',
      measurementValue: 'drought_tolerant',
      measurementRemarks: '保持原始干湿触发描述',
      measurementMethod: 'source_method',
      taxonID: 'taxon-1'
    }
  })
})
test('不存在合法来源/record时不生成来源，避免丢失已有语义', () => {
  for (const source of [null, [], '', 'invalid JSON', {}, { record: null }, { record: [] }]) {
    expect(run(source, 'regular')).toBeNull()
  }
})
test('上游明确的API空值只改变measurementValue，不清空来源和说明', () => {
  expect(run(original, null)).toEqual({
    source_url: 'https://source.example/traits',
    source_sha256: 'a'.repeat(64),
    independent_review_status: 'pending',
    record: {
      measurementID: 'water-1',
      measurementType: 'water_frequency',
      measurementValue: null,
      measurementRemarks: '保持原始干湿触发描述',
      measurementMethod: 'source_method',
      taxonID: 'taxon-1'
    }
  })
})
