'use strict'

const { jsonResponse, resolveHttpUserInfo } = require('/opt/utils/http')
const { diagnosePrompts } = require('../../configs/prompts')
const { callLLMDiagnose } = require('../../utils/llm')

const { buildMatchSymptomPrompt } = diagnosePrompts
const { symptomCategories } = require('./data/questions')

const DEFAULT_MATCH_SYSTEM_PROMPTS = `你是植物症状映射助手。
你只能从给定候选症状中选择一个最可能的 symptomId。
如果无法判断，返回 {"symptomId":""}。
只输出严格 JSON，不要解释。`

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

function scoreSymptomMatch(label, query) {
  const normalizedLabel = normalizeText(label)
  const normalizedQuery = normalizeText(query)
  if (!normalizedLabel || !normalizedQuery) return 0
  if (normalizedLabel === normalizedQuery) return 1
  if (normalizedLabel.includes(normalizedQuery) || normalizedQuery.includes(normalizedLabel))
    return 0.92

  const labelTokens = tokenize(normalizedLabel)
  const queryTokens = tokenize(normalizedQuery)
  if (!labelTokens.length || !queryTokens.length) return 0

  const overlap = queryTokens.filter(token => labelTokens.includes(token)).length
  const coverage = overlap / queryTokens.length
  const precision = overlap / labelTokens.length
  return coverage * 0.7 + precision * 0.3
}

function matchSymptomByCode(categoryId, text) {
  const category = symptomCategories.find(item => item.id === categoryId)
  if (!category) return null

  const ranked = category.symptoms
    .map(symptom => ({
      id: symptom.id,
      label: symptom.label,
      categoryId: category.id,
      categoryLabel: category.label,
      score: scoreSymptomMatch(symptom.label, text)
    }))
    .sort((a, b) => b.score - a.score)

  return ranked.filter(item => item.score >= 0.24).slice(0, 3)
}

function parseAIResult(text, categoryId) {
  const raw = String(text || '').trim()
  if (!raw) return null

  const candidates = []
  if (raw.startsWith('{')) candidates.push(raw)
  const objectMatch = raw.match(/\{[\s\S]*\}/)
  if (objectMatch) candidates.push(objectMatch[0])

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const symptomId = String(parsed?.symptomId || '').trim()
      if (!symptomId) return null
      const category = symptomCategories.find(item => item.id === categoryId)
      const symptom = category?.symptoms?.find(item => item.id === symptomId)
      if (!symptom) return null
      return {
        id: symptom.id,
        label: symptom.label,
        categoryId,
        categoryLabel: category.label,
        score: 0.5
      }
    } catch (error) {
      continue
    }
  }

  return null
}

function callLLMForSymptomMatch(category, text) {
  const promptPayload = buildMatchSymptomPrompt(category, text)
  const systemPrompts =
    promptPayload && typeof promptPayload === 'object' && !Array.isArray(promptPayload)
      ? String(promptPayload.systemPrompts || DEFAULT_MATCH_SYSTEM_PROMPTS)
      : DEFAULT_MATCH_SYSTEM_PROMPTS
  const userPrompts =
    promptPayload && typeof promptPayload === 'object' && !Array.isArray(promptPayload)
      ? String(promptPayload.userPrompts || '')
      : String(promptPayload || '')

  return callLLMDiagnose({
    image: '',
    systemPrompts,
    userPrompts,
    streamOptions: {}
  })
}

async function handleMatchSymptom(event, context, requestData) {
  const userInfo = await resolveHttpUserInfo(requestData.headers, {
    ...requestData.query,
    ...requestData.body
  })

  if (!userInfo?.openid) {
    return jsonResponse(401, { code: 401, message: '需要登录才能使用症状匹配功能' })
  }

  const body = requestData.body || {}
  const categoryId = String(body.categoryId || '').trim()
  const text = String(body.text || '').trim()
  const allowAI = Boolean(body.allowAI)

  if (!categoryId || !text) {
    return jsonResponse(400, { code: 400, message: '缺少 categoryId 或 text' })
  }

  const category = symptomCategories.find(item => item.id === categoryId)
  if (!category) {
    return jsonResponse(400, { code: 400, message: '症状类别无效' })
  }

  const codeCandidates = matchSymptomByCode(categoryId, text)
  if (codeCandidates?.length) {
    return jsonResponse(200, {
      code: 200,
      data: { matched: codeCandidates[0], candidates: codeCandidates, source: 'code' }
    })
  }

  if (!allowAI) {
    return jsonResponse(200, {
      code: 200,
      data: { matched: null, source: 'none' }
    })
  }

  const aiText = await callLLMForSymptomMatch(category, text)
  const aiMatched = parseAIResult(aiText, categoryId)
  const aiCandidates = aiMatched ? [aiMatched] : []

  return jsonResponse(200, {
    code: 200,
    data: {
      matched: aiMatched,
      candidates: aiCandidates,
      source: aiMatched ? 'ai' : 'none',
      rawText: aiText
    }
  })
}

module.exports = {
  handleMatchSymptom,
  matchSymptomByCode
}
