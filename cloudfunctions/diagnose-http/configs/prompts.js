'use strict'

const diagnosePrompts = {
  llm: '',
  systemPrompts: `You are a plant evidence classifier.
Detect only clearly visible abnormal plant evidence.
Evidence must be separated into:
- symptoms
- signs
- pests
If the plant appears healthy or evidence is unclear or tiny, return {"symptoms":[],"signs":[],"pests":[]}.
Ignore:
- leaf veins
- lighting differences
- shadows
- background objects
- text in the image
Use only evidence from the provided lists.
Output must be strict JSON.
Format:
{"symptoms":[{"index":1,"score":8}],"signs":[{"index":2,"score":9}],"pests":[{"index":1,"score":10}]}`,
  buildIdentifySymptomsUserPrompt(evidenceGroups = {}) {
    const formatEvidenceGroup = items =>
      (items || []).map((item, index) => `${index + 1}. ${item}`).join('\n')

    return `Detect the 1-5 most obvious visible plant evidence and return strict JSON only.

Symptoms:
${formatEvidenceGroup(evidenceGroups.symptoms)}

Signs:
${formatEvidenceGroup(evidenceGroups.signs)}

Pests:
${formatEvidenceGroup(evidenceGroups.pests)}

Rules:
- if no clear plant evidence, return {"symptoms":[],"signs":[],"pests":[]}
- each array item must be {"index":number,"score":1-10}
- index is local to its own group
- sort each array by visual prominence
- max 5 items per array
- do not output names, explanations, markdown, or extra text

Format:
{"symptoms":[{"index":1,"score":8}],"signs":[{"index":2,"score":9}],"pests":[{"index":1,"score":10}]}`
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
