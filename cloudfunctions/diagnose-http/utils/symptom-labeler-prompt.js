'use strict'

const { getSymptomDictionary } = require('../repositories/symptom-repository')
const {
  prompts: { llm: promptTemplate }
} = require('../configs')

function buildSymptomOptionText(symptom, index) {
  const hint = symptom.displayTextCn ? `（${symptom.displayTextCn}）` : ''
  return `${index + 1}. ${symptom.symptomKey}${hint}`
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
