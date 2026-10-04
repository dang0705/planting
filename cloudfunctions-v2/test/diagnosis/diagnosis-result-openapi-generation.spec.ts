import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
/** L1/unit_real_data：Expected来自result-http合同与唯一公开结果Schema。仅验证生成制品的目标操作；不证明HTTP或MySQL。 */
const root = findProjectRoot(),
  document = JSON.parse(readFileSync(resolve(root, 'docs/backend-v2/api/openapi.p1.json'), 'utf8'))
test('结果GET的响应明确引用严格结果包，而非通用空骨架', () => {
  const operation = document.paths['/api/v2/diagnosis/sessions/{diagnosisSessionRef}/result'].get
  expect(operation.responses['200'].content['application/json'].schema).toEqual({
    $ref: '#/components/schemas/DiagnosisResultResponse'
  })
  expect(operation['x-errors']).toContain('SERVICE_UNAVAILABLE')
  expect(operation['x-idempotency']).toBe('not_applicable')
})
test('公开结果组件保留唯一Schema的全部字段与内部引用边界', () => {
  const expected = JSON.parse(
    readFileSync(
      resolve(root, 'docs/backend-v2/contracts/schemas/diagnosis-result.v1.schema.json'),
      'utf8'
    )
  )
  expect(document.components.schemas.DiagnosisResult).toEqual(expected)
  expect(document.components.schemas.DiagnosisResultResponse).toEqual({
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: { data: { $ref: '#/components/schemas/DiagnosisResult' } }
  })
})
