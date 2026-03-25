'use strict'

function extractLineValue(text, labels) {
  const labelPattern = labels.join('|')
  const regex = new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})[：:]\\s*(.+)`, 'i')
  const match = String(text || '').match(regex)
  return match ? match[1].trim() : ''
}

function extractJsonBlock(text) {
  const source = String(text || '').trim()
  if (!source) return null

  const fencedMatch = source.match(/```json\s*([\s\S]*?)```/i) || source.match(/```\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return source.slice(start, end + 1)
  }

  return null
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function parseStructuredSymptoms(text) {
  const jsonBlock = extractJsonBlock(text)
  if (!jsonBlock) {
    return null
  }

  try {
    const payload = JSON.parse(jsonBlock)
    const symptoms = Array.isArray(payload?.symptoms)
      ? payload.symptoms
          .map(item => {
            const symptomKey = String(item?.symptom_key || item?.symptomKey || '').trim()
            if (!symptomKey) return null

            return {
              symptomKey,
              confidence: clamp(Number(item?.confidence || 0) || 0.7, 0, 1),
              evidenceSource: String(item?.evidence_type || item?.evidenceSource || 'visual').trim() || 'visual',
              reason: String(item?.reason || '').trim()
            }
          })
          .filter(Boolean)
          .slice(0, 5)
      : []

    const uncertainSymptoms = Array.isArray(payload?.uncertain_symptoms)
      ? payload.uncertain_symptoms
          .map(item => String(item?.symptom_key || item?.symptomKey || item || '').trim())
          .filter(Boolean)
      : []

    return {
      observedSymptoms: symptoms,
      uncertainSymptoms,
      imageQuality: ['good', 'medium', 'poor'].includes(String(payload?.image_quality || '').trim())
        ? String(payload.image_quality).trim()
        : 'medium'
    }
  } catch (error) {
    return null
  }
}

function normalizeSentence(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildParsedDiagnosis(text) {
  const cleanText = normalizeSentence(text)
  const structured = parseStructuredSymptoms(cleanText)
  const symptomsLine = extractLineValue(cleanText, ['观察症状', '症状'])
  const observationNote = extractLineValue(cleanText, ['观察说明', '补充说明']) || ''
  const structuredSymptomText = (structured?.observedSymptoms || [])
    .map(item => item.symptomKey)
    .join('、')
  const summary = [symptomsLine, observationNote]
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join('；')
    .substring(0, 180)

  return {
    healthScore: null,
    healthStatus: null,
    mainIssue: null,
    observedSymptoms: structured?.observedSymptoms || [],
    uncertainSymptoms: structured?.uncertainSymptoms || [],
    imageQuality: structured?.imageQuality || 'medium',
    symptoms: structuredSymptomText || symptomsLine || cleanText.substring(0, 200),
    treatment: '',
    prevention: '',
    summary: summary || structuredSymptomText || cleanText.substring(0, 180)
  }
}

function parseLLMDiagnosis(text) {
  return buildParsedDiagnosis(text)
}

function removeDuplicateContent(text) {
  if (/(观察症状|观察说明|symptoms|image_quality)[：:"]/.test(String(text || ''))) {
    return normalizeSentence(text)
  }

  const paragraphs = String(text || '')
    .split('\n')
    .filter(p => p.trim().length > 20)
  if (paragraphs.length > 0) {
    let longestPara = paragraphs[0]
    for (const paragraph of paragraphs) {
      if (paragraph.length > longestPara.length) {
        longestPara = paragraph
      }
    }
    return longestPara
  }

  const sentences = String(text || '').split(/[。！？]+/).filter(s => s.trim())
  const seen = new Set()
  const unique = []
  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      unique.push(trimmed)
    }
  }
  return unique.join('。')
}

function parseAgentDiagnosis(text) {
  return buildParsedDiagnosis(removeDuplicateContent(text))
}

module.exports = {
  parseLLMDiagnosis,
  parseAgentDiagnosis
}


