'use strict'

const crypto = require('node:crypto')
const { sanitizeAgentText } = require('./acp-stream')

const PENDING_ASK_PREFIX = 'pending-ask:'
const ASK_TOKEN_VERSION = 1
const ASK_TOKEN_TTL_MS = 60 * 60 * 1000
const MAX_TOKEN_LENGTH = 12000

function resolveNow(now) {
  return typeof now === 'function' ? now() : Number(now)
}

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function displayText(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }
  return sanitizeAgentText(value)
    .replace(/[\u0000-\u001f\u007f]/gu, '')
    .trim()
    .slice(0, maxLength)
}

function sanitizeAskUserQuestions(input) {
  const source = record(input)?.questions
  if (!Array.isArray(source) || source.length < 1 || source.length > 4) {
    return null
  }
  const seenQuestions = new Set()
  const questions = []
  for (const item of source) {
    const sourceQuestion = record(item)
    const question = displayText(sourceQuestion?.question, 500)
    const header = displayText(sourceQuestion?.header, 40)
    const multiSelect = sourceQuestion?.multiSelect
    const options = sourceQuestion?.options
    if (
      !question ||
      !header ||
      typeof multiSelect !== 'boolean' ||
      !Array.isArray(options) ||
      options.length < 2 ||
      options.length > 4 ||
      seenQuestions.has(question)
    ) {
      return null
    }
    const safeOptions = []
    const seenLabels = new Set()
    for (const option of options) {
      const sourceOption = record(option)
      const label = displayText(sourceOption?.label, 120)
      const description = displayText(sourceOption?.description, 400)
      if (!label || !description || seenLabels.has(label)) {
        return null
      }
      seenLabels.add(label)
      safeOptions.push({ label, description })
    }
    seenQuestions.add(question)
    questions.push({ question, header, multiSelect, options: safeOptions })
  }
  return questions
}

function isAskUserQuestionTool(pending) {
  return String(pending?.toolName || '') === 'AskUserQuestion'
}

function deriveTokenKey(sessionToken) {
  if (typeof sessionToken !== 'string' || !sessionToken) {
    return null
  }
  return crypto
    .createHash('sha256')
    .update('qinghuazhi-agent-http-ask-user-v1\u0000')
    .update(sessionToken)
    .digest()
}

function getAskResumeTokenHash(token) {
  if (typeof token !== 'string' || !token) {
    return ''
  }
  return crypto
    .createHash('sha256')
    .update('qinghuazhi-agent-http-ask-resume-v1\u0000')
    .update(token)
    .digest('hex')
    .slice(0, 32)
}

function createAskResumeToken({ sessionToken, sessionId, toolUseId, questions, now = Date.now }) {
  const key = deriveTokenKey(sessionToken)
  if (!key || !sessionId || !toolUseId || !Array.isArray(questions)) {
    throw invalid('提问已失效，请重新发送问题。')
  }
  const payload = Buffer.from(
    JSON.stringify({
      v: ASK_TOKEN_VERSION,
      sessionId: String(sessionId),
      toolUseId: String(toolUseId),
      questions,
      expiresAt: resolveNow(now) + ASK_TOKEN_TTL_MS
    }),
    'utf8'
  )
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
  return Buffer.concat([
    Buffer.from([ASK_TOKEN_VERSION]),
    iv,
    cipher.getAuthTag(),
    ciphertext
  ]).toString('base64url')
}

function readAskResumeToken(token, sessionToken, now = Date.now) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    return null
  }
  const key = deriveTokenKey(sessionToken)
  if (!key) {
    return null
  }
  try {
    const encoded = Buffer.from(token, 'base64url')
    if (encoded.length < 1 + 12 + 16 + 1 || encoded[0] !== ASK_TOKEN_VERSION) {
      return null
    }
    const iv = encoded.subarray(1, 13)
    const authTag = encoded.subarray(13, 29)
    const ciphertext = encoded.subarray(29)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const payload = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    )
    const questions = sanitizeAskUserQuestions(payload)
    if (
      payload?.v !== ASK_TOKEN_VERSION ||
      !payload?.sessionId ||
      !payload?.toolUseId ||
      !questions ||
      payload.expiresAt <= resolveNow(now) ||
      JSON.stringify(questions) !== JSON.stringify(payload.questions)
    ) {
      return null
    }
    return {
      sessionId: String(payload.sessionId),
      toolUseId: String(payload.toolUseId),
      questions,
      expiresAt: Number(payload.expiresAt)
    }
  } catch {
    return null
  }
}

function normalizeAskUserAnswers(questions, input) {
  const source = record(input)
  const answers = record(source?.answers)
  if (!answers || Object.keys(answers).length !== questions.length) {
    throw invalid('回答不完整，请完整回答当前问题。')
  }
  const normalized = {}
  for (const question of questions) {
    if (!Object.hasOwn(answers, question.question)) {
      throw invalid('回答不完整，请完整回答当前问题。')
    }
    const allowed = new Set(question.options.map(option => option.label))
    const value = answers[question.question]
    if (question.multiSelect) {
      if (
        !Array.isArray(value) ||
        value.length < 1 ||
        value.length > question.options.length ||
        new Set(value).size !== value.length ||
        value.some(item => typeof item !== 'string' || !allowed.has(item))
      ) {
        throw invalid('回答中包含选项无效。')
      }
      normalized[question.question] = value.join(', ')
    } else if (typeof value !== 'string' || !allowed.has(value)) {
      throw invalid('回答中包含选项无效。')
    } else {
      normalized[question.question] = value
    }
  }
  return { answers: normalized }
}

function markPendingAskSession(sessionId, resumeToken = '') {
  const tokenHash = getAskResumeTokenHash(resumeToken)
  return `${PENDING_ASK_PREFIX}${sessionId}${tokenHash ? `:${tokenHash}` : ''}`
}

function isPendingAskSession(value) {
  return typeof value === 'string' && value.startsWith(PENDING_ASK_PREFIX)
}

function getAgentSessionId(value) {
  if (!isPendingAskSession(value)) {
    return String(value || '')
  }
  const raw = value.slice(PENDING_ASK_PREFIX.length)
  return /^[a-f0-9]{32}$/u.test(raw.slice(-32)) && raw.at(-33) === ':' ? raw.slice(0, -33) : raw
}

function getPendingAskTokenHash(value) {
  if (!isPendingAskSession(value)) {
    return ''
  }
  const raw = value.slice(PENDING_ASK_PREFIX.length)
  return /^[a-f0-9]{32}$/u.test(raw.slice(-32)) && raw.at(-33) === ':' ? raw.slice(-32) : ''
}

module.exports = {
  createAskResumeToken,
  getAskResumeTokenHash,
  getAgentSessionId,
  getPendingAskTokenHash,
  isAskUserQuestionTool,
  isPendingAskSession,
  markPendingAskSession,
  normalizeAskUserAnswers,
  readAskResumeToken,
  sanitizeAskUserQuestions
}
