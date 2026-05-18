#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'

const DEFAULT_REVIEW_RULES_FILE = 'scripts/video-knowledge/review-dimension-rules.json'

function nowIso() {
  return new Date().toISOString()
}

function hashText(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)
}

function parseArgs(argv = []) {
  const args = {
    input: '',
    output: '',
    reviewRulesFile: DEFAULT_REVIEW_RULES_FILE
  }

  for (const rawArg of argv) {
    const arg = String(rawArg || '')
    if (arg.startsWith('--input=')) {args.input = arg.slice('--input='.length).trim()}
    if (arg.startsWith('--output=')) {args.output = arg.slice('--output='.length).trim()}
    if (arg.startsWith('--review-rules-file=')) {
      args.reviewRulesFile = arg.slice('--review-rules-file='.length).trim() || DEFAULT_REVIEW_RULES_FILE
    }
  }

  if (!args.input) {throw new Error('必须提供 --input=/path/to/candidate.json')}
  if (!args.output) {args.output = buildDefaultOutputPath(args.input)}
  return args
}

function buildDefaultOutputPath(inputPath = '') {
  const ext = path.extname(inputPath)
  const base = inputPath.slice(0, inputPath.length - ext.length)
  return `${base}.review-enriched${ext || '.json'}`
}

async function loadReviewRules(filePath = DEFAULT_REVIEW_RULES_FILE) {
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw)
  return {
    file_path: filePath,
    file_digest: hashText(raw),
    dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : [],
    fallback: parsed.fallback && typeof parsed.fallback === 'object'
      ? parsed.fallback
      : {
          key: 'general_care_principle',
          candidate_questions: ['这个经验适用于哪些植物、环境和生长阶段？'],
          review_focus: ['核对该要点是否足够具体，是否需要人工补充适用植物、季节或环境前提。']
        }
  }
}

function classifyKnowledgeDimensions(point = '', rules) {
  const text = String(point || '')
  const dimensions = rules.dimensions
    .filter(rule => Array.isArray(rule.patterns) && rule.patterns.some(pattern => text.includes(String(pattern))))
    .map(rule => rule.key)
    .filter(Boolean)
  if (!dimensions.length) {dimensions.push(rules.fallback.key || 'general_care_principle')}
  return Array.from(new Set(dimensions))
}

function buildReviewFocus(point = '', rules) {
  const dimensions = classifyKnowledgeDimensions(point, rules)
  const focus = rules.dimensions
    .filter(rule => dimensions.includes(rule.key))
    .flatMap(rule => Array.isArray(rule.review_focus) ? rule.review_focus : [])
  if (!focus.length) {focus.push(...(rules.fallback.review_focus || []))}
  return Array.from(new Set(focus))
}

function buildCandidateQuestions(point = '', rules) {
  const dimensions = classifyKnowledgeDimensions(point, rules)
  const questions = rules.dimensions
    .filter(rule => dimensions.includes(rule.key))
    .flatMap(rule => Array.isArray(rule.candidate_questions) ? rule.candidate_questions : [])
  if (!questions.length) {questions.push(...(rules.fallback.candidate_questions || []))}
  return Array.from(new Set(questions))
}

function buildDetailCards(candidate, rules) {
  const layer = candidate?.source_knowledge_layer || {}
  const points = Array.isArray(layer.key_points_for_review) ? layer.key_points_for_review : []
  const channels = Array.isArray(layer.source_channels) ? layer.source_channels : []

  return points.map((point, index) => ({
    card_id: `detail_${String(index + 1).padStart(2, '0')}`,
    abstract_point: point,
    source_channels: channels,
    dimensions: classifyKnowledgeDimensions(point, rules),
    candidate_questions_for_review: buildCandidateQuestions(point, rules),
    review_focus: buildReviewFocus(point, rules),
    risk_notes: [
      '这是候选知识，需要人工审核后才能入库。',
      '不得直接复述为原文，也不得替代具体诊断结论。'
    ]
  }))
}

function enrichCandidate(candidate, rules) {
  const existingLayer = candidate?.source_knowledge_layer || {}
  return {
    ...candidate,
    source_knowledge_layer: {
      ...existingLayer,
      detail_cards_for_review: buildDetailCards(candidate, rules),
      review_enrichment: {
        enriched_at: nowIso(),
        rules_file: rules.file_path,
        rules_digest: rules.file_digest
      }
    },
    updated_at: nowIso()
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [rawInput, rules] = await Promise.all([
    fs.readFile(args.input, 'utf8'),
    loadReviewRules(args.reviewRulesFile)
  ])
  const parsed = JSON.parse(rawInput)
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : []
  const enriched = {
    ...parsed,
    candidates: candidates.map(candidate => enrichCandidate(candidate, rules)),
    review_enrichment_summary: {
      enriched_at: nowIso(),
      rules_file: rules.file_path,
      rules_digest: rules.file_digest,
      candidate_count: candidates.length,
      purpose: 'append_review_dimension_cards_only'
    }
  }

  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, JSON.stringify(enriched, null, 2), 'utf8')
  console.log(`已写入审核增强 JSON：${args.output}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
