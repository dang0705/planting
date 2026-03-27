'use strict'

const { getSymptomDictionary } = require('/opt/utils/plant-diagnosis')
const {
  prompts: { llm: promptTemplate }
} = require('/opt/configs')

function buildSymptomOptionText(symptom, index) {
  return `${index + 1}. ${symptom.symptomKey}`
}

function isImageSelectableSymptom(symptom) {
  return ['visual', 'hybrid'].includes(String(symptom.symptomType || '').toLowerCase())
}

async function buildSymptomLabelerPrompt() {
  const symptomDictionary = await getSymptomDictionary()
  const symptomOptionsText = symptomDictionary
    .filter(isImageSelectableSymptom)
    .map((symptom, index) => buildSymptomOptionText(symptom, index))
    .join('\n')

  if (typeof promptTemplate === 'function') {
    return promptTemplate({ symptomOptionsText })
  }

  return String(promptTemplate || '').replace('[这里插入你筛选过的 symptom_key + 简短说明]', symptomOptionsText)
}

module.exports = {
  buildSymptomLabelerPrompt
}
