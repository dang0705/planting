'use strict'

const { prefixes } = require('../constants/public-id')

function toBase64Url(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${pad}`, 'base64').toString('utf8')
}

function buildPublicId(prefix, internalKey) {
  return `${prefix}_${toBase64Url(internalKey)}`
}

function parsePublicId(prefix, publicId) {
  const full = String(publicId || '')
  const marker = `${prefix}_`
  if (!full.startsWith(marker)) {return ''}
  const encoded = full.slice(marker.length)
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {return ''}

  const decoded = fromBase64Url(encoded)
  if (!decoded) {return ''}

  // 防止把非 base64url 的外部 id（如 opt_unknown）误解析成乱码。
  if (toBase64Url(decoded) !== encoded) {return ''}
  return decoded
}

function toProblemId(problemKey) {
  return buildPublicId(prefixes.problem, problemKey)
}

function toQuestionId(questionKey) {
  return buildPublicId(prefixes.question, questionKey)
}

function toOptionId(optionKey) {
  return buildPublicId(prefixes.option, optionKey)
}

function toResultId(sessionId, round = 1) {
  return buildPublicId(prefixes.result, `${sessionId}:${round}`)
}

function fromProblemId(problemId) {
  return parsePublicId(prefixes.problem, problemId)
}

function fromQuestionId(questionId) {
  return parsePublicId(prefixes.question, questionId)
}

function fromOptionId(optionId) {
  return parsePublicId(prefixes.option, optionId)
}

function fromResultId(resultId) {
  const value = parsePublicId(prefixes.result, resultId)
  if (!value) {return { sessionId: '', round: null }}
  const [sessionId, roundText] = value.split(':')
  return {
    sessionId: sessionId || '',
    round: roundText ? Number(roundText) : null
  }
}

module.exports = {
  toProblemId,
  toQuestionId,
  toOptionId,
  toResultId,
  fromProblemId,
  fromQuestionId,
  fromOptionId,
  fromResultId
}
