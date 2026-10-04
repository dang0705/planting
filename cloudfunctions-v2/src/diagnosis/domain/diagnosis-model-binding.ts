import { createHash } from 'node:crypto'

/** 已确认的视觉版本组合；由受控适配器记录，不接受模型自行声明的来源。 */
export interface DiagnosisModelBinding {
  /** 精确模型版本，不能只使用模型家族名称。 */ readonly modelCode: string
  /** 提示词版本名称。 */ readonly promptVersion: string
  /** 规范化提示词的 SHA-256 摘要，不保存提示词正文。 */ readonly promptSha256: string
  /** 视觉输出结构合同版本。 */ readonly resultSchemaVersion: string
}

/** 来自已确认配置及 diagnosis-visual.v1.release.json；不代表 Provider 已获准调用。 */
const confirmedBinding: Readonly<DiagnosisModelBinding> = Object.freeze({
  modelCode: 'qwen3.5-flash-2026-02-23',
  promptVersion: 'diagnosis-visual/v1',
  promptSha256: '11c58cebe3b3c41097d6f6d6b3c5b5d7eb16248e4f07bacd497868a647ccc964',
  resultSchemaVersion: 'diagnosis-model-output/v1'
})

/** 严格核验唯一已确认组合；拒绝额外字段，避免夹带提示词或未经批准的版本。 */
export function validateDiagnosisModelBinding(value: unknown): value is DiagnosisModelBinding {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(confirmedBinding) as (keyof DiagnosisModelBinding)[]
  return (
    Object.keys(record).length === keys.length &&
    keys.every(key => Object.hasOwn(record, key) && record[key] === confirmedBinding[key])
  )
}

/** 按发布合同统一换行并保留唯一末尾换行，只返回摘要绑定；不授予成本或语义准入。 */
export function bindConfirmedDiagnosisPrompt(
  prompt: string
):
  | Readonly<{ status: 'valid'; binding: Readonly<DiagnosisModelBinding> }>
  | Readonly<{ status: 'invalid' }> {
  const normalized = prompt.replace(/\r\n?/g, '\n').replace(/\n*$/, '') + '\n'
  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex')
  return hash === confirmedBinding.promptSha256
    ? Object.freeze({ status: 'valid', binding: confirmedBinding })
    : Object.freeze({ status: 'invalid' })
}
