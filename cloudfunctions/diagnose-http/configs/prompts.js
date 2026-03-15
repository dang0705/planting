'use strict'

const diagnosePrompts = {
  llm: '',
  systemPrompts: `You are a plant symptom classifier.
Only classify clearly visible symptoms.
If the plant appears healthy or just tiny issue return [].
Use only symptoms from the provided list.
Output must be strict JSON:
[{"index":1,"score":8}]`,
  buildIdentifySymptomsUserPrompt(symptomList) {
    const numberedSymptoms = (symptomList || [])
      .map((symptom, index) => `${index + 1}. ${symptom}`)
      .join('\n')
    return `Pick the 1-5 most obvious visible symptoms from this list and return strict JSON only.

Symptoms:
${numberedSymptoms}

Rules:
- if no clear plant symptom, return []
- return indexes only, sorted by visual prominence
- max 5 items
- use score 1-10

Format:
[{"index":1,"score":8},{"index":5,"score":6}]`
  },
  buildMatchSymptomPrompt(category, text) {
    return `任务：把用户描述映射到最可能的植物症状ID。

类别：${category?.label || ''}
用户描述：${text || ''}

可选症状：
${(category?.symptoms || []).map(item => `- ${item.id}: ${item.label}`).join('\n')}

要求：
1. 只能从可选症状中选择一个最可能的 symptomId
2. 如果完全无法判断，返回 {"symptomId":""}
3. 只输出严格 JSON，不要解释

示例：
{"symptomId":"yellow_leaves"}`
  }
}

module.exports = {
  diagnosePrompts
}
