'use strict'

const { jsonResponse, resolveHttpUserInfo } = require('/opt/utils/http')
const { callLLMDiagnose, buildIdentifySymptomsPrompt } = require('../../utils/llm')
const { symptomCategories } = require('./data/questions')

const symptomList = symptomCategories.flatMap(category =>
  category.symptoms.map(symptom => symptom.id)
)

const symptomAliasMap = {
  yellow_edges: 'brown_tips',
  yellow_between_veins: 'pale_leaves',
  brown_leaf_tips: 'brown_tips',
  leaf_twist: 'distorted_growth',
  leaf_distortion: 'distorted_growth',
  leaf_holes: 'visible_insects',
  dry_leaves: 'dry_crispy_leaves',
  crispy_leaves: 'dry_crispy_leaves',
  sticky_leaves: 'sticky_residue',
  powder_on_leaf: 'white_powder',
  mold_on_leaf: 'sooty_mold',
  dropping_leaves: 'leaf_drop',
  stunted_growth: 'slow_growth',
  tiny_red_dots: 'stippled_leaves',
  aphids_visible: 'visible_insects',
  white_flies: 'visible_insects',
  scale_insects: 'brown_bumps',
  soil_smell: 'root_smell',
  soil_compaction: 'small_flies'
}

function buildSymptomMeta(symptomId) {
  for (const category of symptomCategories) {
    const symptom = category.symptoms.find(item => item.id === symptomId)
    if (symptom) {
      return {
        id: symptom.id,
        label: symptom.label,
        categoryId: category.id,
        categoryLabel: category.label,
        source: 'ai'
      }
    }
  }
  return null
}

function normalizeText(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。；：、,.!！?？()（）\-_/]/g, '')
}

function tokenize(input) {
  const normalized = normalizeText(input)
  const chunks = new Set()
  for (let i = 0; i < normalized.length; i += 1) {
    chunks.add(normalized[i])
    if (i < normalized.length - 1) {
      chunks.add(normalized.slice(i, i + 2))
    }
  }
  return [...chunks].filter(Boolean)
}

function scoreTextMatch(target, query) {
  const normalizedTarget = normalizeText(target)
  const normalizedQuery = normalizeText(query)
  if (!normalizedTarget || !normalizedQuery) return 0
  if (normalizedTarget === normalizedQuery) return 1
  if (normalizedTarget.includes(normalizedQuery) || normalizedQuery.includes(normalizedTarget))
    return 0.92

  const targetTokens = tokenize(normalizedTarget)
  const queryTokens = tokenize(normalizedQuery)
  if (!targetTokens.length || !queryTokens.length) return 0

  const overlap = queryTokens.filter(token => targetTokens.includes(token)).length
  const coverage = overlap / queryTokens.length
  const precision = overlap / targetTokens.length
  return coverage * 0.7 + precision * 0.3
}

function buildSymptomPhraseCandidates(symptomId) {
  const meta = buildSymptomMeta(symptomId)
  if (!meta) return [symptomId]
  const phrases = new Set([symptomId, meta.label])
  const alias = Object.entries(symptomAliasMap)
    .filter(([, mappedId]) => mappedId === symptomId)
    .map(([legacyId]) => legacyId)
  for (const item of alias) {
    phrases.add(item)
    phrases.add(item.replace(/_/g, ' '))
  }
  return [...phrases]
}

function parseSymptomsFromNaturalLanguage(text, validSymptoms) {
  const raw = String(text || '').trim()
  if (!raw) return []

  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => line.length <= 40)

  const candidates = lines.length ? lines : [raw.slice(0, 120)]
  const bestMatches = []
  const seen = new Set()

  for (const candidateText of candidates) {
    let best = null
    for (const symptomId of validSymptoms) {
      const phraseCandidates = buildSymptomPhraseCandidates(symptomId)
      const score = Math.max(
        ...phraseCandidates.map(phrase => scoreTextMatch(phrase, candidateText))
      )
      if (!best || score > best.score) {
        best = { symptomId, score }
      }
    }

    if (best && best.score >= 0.42 && !seen.has(best.symptomId)) {
      bestMatches.push({
        index: validSymptoms.indexOf(best.symptomId) + 1,
        score: Math.max(1, Math.min(10, Math.round(best.score * 10))),
        matchScore: normalizeMatchScore(best.score),
        symptomId: best.symptomId
      })
      seen.add(best.symptomId)
    }
  }

  return bestMatches.slice(0, 5)
}

function normalizeMatchScore(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1

  // Prefer 1-10 scoring from LLM for stability, but keep 0-1 compatibility.
  if (number > 1) {
    return Math.max(0.1, Math.min(1, number / 10))
  }
  return Math.max(0.05, Math.min(1, number))
}

function mapIndexEntriesToSymptoms(indexEntries, validSymptoms) {
  const seen = new Set()
  const mapped = []

  for (const entry of indexEntries || []) {
    const normalizedEntry =
      typeof entry === 'object' && entry !== null ? entry : { index: entry, score: 10 }

    const index = Number(normalizedEntry.index)
    if (!Number.isInteger(index) || index < 1 || index > validSymptoms.length) continue

    const symptomId = validSymptoms[index - 1]
    if (!symptomId || seen.has(symptomId)) continue

    seen.add(symptomId)
    mapped.push({
      index,
      score: Number.isFinite(Number(normalizedEntry.score))
        ? Number(normalizedEntry.score)
        : Number.isFinite(Number(normalizedEntry.confidence))
          ? Math.round(Number(normalizedEntry.confidence) * 10)
          : 10,
      matchScore: normalizeMatchScore(
        Number.isFinite(Number(normalizedEntry.score))
          ? Number(normalizedEntry.score)
          : normalizedEntry.confidence
      ),
      symptomId
    })
  }

  return mapped
}

/**
 * POST /rule-diagnose/identify-symptoms
 * AI 识别图片中的症状，返回症状 ID 列表
 *
 * Body:
 *   image: string  图片 URL
 */
async function handleIdentifySymptoms(event, context, requestData) {
  const userInfo = await resolveHttpUserInfo(requestData.headers, {
    ...requestData.query,
    ...requestData.body
  })

  if (!userInfo || !userInfo.openid) {
    return jsonResponse(401, { code: 401, message: '需要登录才能使用症状识别功能' })
  }

  const body = requestData.body || {}
  const image = body.image

  if (!image) {
    return jsonResponse(400, { code: 400, message: '缺少图片URL' })
  }

  try {
    const prompt = buildIdentifySymptomsPrompt(symptomList)

    // 调用 LLM 识别
    const diagnosisText = await callLLMDiagnose({ image, prompt, streamOptions: {} })

    console.log('[IdentifySymptoms] AI 返回:', diagnosisText)

    // 解析返回的症状列表
    const identifiedSymptoms = parseSymptomMatches(diagnosisText, symptomList)

    console.log('[IdentifySymptoms] 识别到的症状:', identifiedSymptoms)

    return jsonResponse(200, {
      code: 200,
      data: {
        symptoms: identifiedSymptoms.map(item => item.symptomId),
        symptomTags: identifiedSymptoms
          .map(item => {
            const meta = buildSymptomMeta(item.symptomId)
            if (!meta) return null
            return {
              ...meta,
              score: item.score,
              matchScore: item.matchScore,
              index: item.index
            }
          })
          .filter(Boolean),
        rawText: diagnosisText
      }
    })
  } catch (error) {
    console.error('[IdentifySymptoms] 识别失败:', error)
    return jsonResponse(500, {
      code: 500,
      message: `症状识别失败: ${error.message}`
    })
  }
}

/**
 * 从 AI 返回文本中解析症状 ID
 */
function parseSymptomMatches(text, validSymptoms) {
  const parsedFromIndexes = parseSymptomsFromIndexes(text, validSymptoms)
  if (
    parsedFromIndexes.length > 0 ||
    String(text || '').includes('"indexex"') ||
    String(text || '').includes('"index"')
  ) {
    return parsedFromIndexes.slice(0, 5)
  }

  const parsedFromJson = parseSymptomsFromJson(text, validSymptoms)
  if (parsedFromJson.length > 0 || String(text || '').includes('"symptoms"')) {
    return parsedFromJson.slice(0, 5)
  }

  const parsedFromNaturalLanguage = parseSymptomsFromNaturalLanguage(text, validSymptoms)
  if (parsedFromNaturalLanguage.length > 0) {
    return parsedFromNaturalLanguage.slice(0, 5)
  }

  const lines = String(text || '').split('\n')
  const symptoms = []
  const seen = new Set()

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase()
    // 跳过空行和非症状行
    if (!trimmed || trimmed.length > 50) continue

    // 移除可能的序号、标点
    const cleaned = trimmed.replace(/^\d+[.)]\s*/, '').replace(/[，。、,.]/g, '')
    if (/^\d+$/.test(cleaned)) {
      const mapped = mapIndexEntriesToSymptoms([{ index: cleaned, score: 10 }], validSymptoms)
      if (mapped[0] && !seen.has(mapped[0].symptomId)) {
        symptoms.push(mapped[0])
        seen.add(mapped[0].symptomId)
      }
      continue
    }
    const normalized = symptomAliasMap[cleaned] || cleaned

    // 检查是否是有效症状
    if (validSymptoms.includes(normalized) && !seen.has(normalized)) {
      symptoms.push({
        index: validSymptoms.indexOf(normalized) + 1,
        score: 10,
        matchScore: 1,
        symptomId: normalized
      })
      seen.add(normalized)
    }
  }

  // 最多返回5个
  return symptoms.slice(0, 5)
}

function parseSymptomsFromIndexes(text, validSymptoms) {
  const raw = String(text || '').trim()
  if (!raw) return []

  const jsonCandidates = []
  if (raw.startsWith('{') || raw.startsWith('[')) {
    jsonCandidates.push(raw)
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    jsonCandidates.push(objectMatch[0])
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    jsonCandidates.push(arrayMatch[0])
  }

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate)
      const entries = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.indexex)
          ? parsed.indexex
          : parsed?.indexex && typeof parsed.indexex === 'object'
            ? [parsed.indexex]
            : Array.isArray(parsed?.indexes)
              ? parsed.indexes.map(index => ({ index, score: 10 }))
              : []
      return mapIndexEntriesToSymptoms(entries, validSymptoms)
    } catch (error) {
      continue
    }
  }

  return []
}

function parseSymptomsFromJson(text, validSymptoms) {
  const raw = String(text || '').trim()
  if (!raw) return []

  const jsonCandidates = []

  if (raw.startsWith('{') || raw.startsWith('[')) {
    jsonCandidates.push(raw)
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    jsonCandidates.push(objectMatch[0])
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    jsonCandidates.push(arrayMatch[0])
  }

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate)
      const symptoms = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.symptoms)
          ? parsed.symptoms
          : []

      const normalized = []
      const seen = new Set()
      for (const item of symptoms) {
        const cleaned = String(item || '')
          .trim()
          .toLowerCase()
        const mapped = symptomAliasMap[cleaned] || cleaned
        if (validSymptoms.includes(mapped) && !seen.has(mapped)) {
          normalized.push({
            index: validSymptoms.indexOf(mapped) + 1,
            score: 10,
            matchScore: 1,
            symptomId: mapped
          })
          seen.add(mapped)
        }
      }
      return normalized
    } catch (error) {
      continue
    }
  }

  return []
}

module.exports = { handleIdentifySymptoms }
