export function normalizeRetakeSafetyInstructions(retakeRequest = {}) {
  return (Array.isArray(retakeRequest?.safetyInstructions) ? retakeRequest.safetyInstructions : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

export function buildRetakeConfirmationContent(retakeRequest = {}) {
  const riskNotice = String(retakeRequest?.riskNotice || '').trim()
  const safetyInstructions = normalizeRetakeSafetyInstructions(retakeRequest)
  const lines = []

  if (riskNotice) {
    lines.push(riskNotice)
  }
  if (safetyInstructions.length) {
    lines.push(`操作前请注意：${safetyInstructions.join('；')}`)
  }
  lines.push('确认开始后，请在 3 分钟内完成拍摄并提交。超过时间，本次诊断将结束。')

  return lines.join('\n')
}
