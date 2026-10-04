import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import {
  validateDiagnosisModelBinding,
  bindConfirmedDiagnosisPrompt
} from '../../src/diagnosis/domain/diagnosis-model-binding.js'
/** unit_real_data/L1：Expected来自已确认配置项及diagnosis-visual.v1.release.json。
 * 仅核验指定Prompt的摘要，既不输出正文也不发起模型调用。
 */
const binding = {
  modelCode: 'qwen3.5-flash-2026-02-23',
  promptVersion: 'diagnosis-visual/v1',
  promptSha256: '11c58cebe3b3c41097d6f6d6b3c5b5d7eb16248e4f07bacd497868a647ccc964',
  resultSchemaVersion: 'diagnosis-model-output/v1'
}
test('精确已确认版本绑定有效且不返回提示词正文', () => {
  const prompt = readFileSync(
    join(findProjectRoot(), 'docs/backend-v2/contracts/prompts/diagnosis-visual.v1.txt'),
    'utf8'
  )
  expect(validateDiagnosisModelBinding(binding)).toBe(true)
  expect(bindConfirmedDiagnosisPrompt(prompt)).toEqual({ status: 'valid', binding })
  const result = bindConfirmedDiagnosisPrompt(prompt)
  expect(Object.isFrozen(result)).toBe(true)
  if (result.status === 'valid') {
    expect(Object.isFrozen(result.binding)).toBe(true)
  }
  expect(bindConfirmedDiagnosisPrompt(prompt.replaceAll('\n', '\r\n') + '\r\n')).toEqual({
    status: 'valid',
    binding
  })
})
test.each([
  { modelCode: 'qwen3.5-flash' },
  { promptVersion: 'diagnosis-visual/v2' },
  { promptSha256: 'a'.repeat(64) },
  { resultSchemaVersion: 'diagnosis-model-output/v2' },
  { rawPrompt: '不得输出' },
  { modelCode: undefined }
])('模型/提示词/Schema错配或额外字段%j拒绝', patch => {
  expect(validateDiagnosisModelBinding({ ...binding, ...patch })).toBe(false)
})
test.each([undefined, null, {}, ''])('缺绑定%j拒绝', value => {
  expect(validateDiagnosisModelBinding(value)).toBe(false)
})
test('Prompt内容被替换或增加文字拒绝，不能仅信任版本名', () => {
  const prompt = readFileSync(
    join(findProjectRoot(), 'docs/backend-v2/contracts/prompts/diagnosis-visual.v1.txt'),
    'utf8'
  )
  expect(bindConfirmedDiagnosisPrompt(prompt + '新增指令')).toEqual({ status: 'invalid' })
  expect(bindConfirmedDiagnosisPrompt('')).toEqual({ status: 'invalid' })
})
