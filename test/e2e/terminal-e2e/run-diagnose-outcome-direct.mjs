#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const require = createRequire(import.meta.url)
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveLocalLayerPath(request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('/opt/utils/')) {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'cloudfunctions/layer/utils', `${request.slice('/opt/utils/'.length)}.js`),
      parent,
      isMain,
      options
    )
  }
  if (request === '/opt/configs') {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'cloudfunctions/layer/configs/index.js'),
      parent,
      isMain,
      options
    )
  }
  if (typeof request === 'string' && request.startsWith('/opt/configs/')) {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'cloudfunctions/layer/configs', `${request.slice('/opt/configs/'.length)}.js`),
      parent,
      isMain,
      options
    )
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const app = require('../../cloudfunctions/diagnose-http/app')
const { listDiagnosisHistory, getResultById } = require('../../cloudfunctions/diagnose-http/services/session-service')
const {
  buildPublicRoundResponse,
  buildCompactAnswerRoundResponse
} = require('../../cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter')

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function safeJsonParse(value, fallback) {
  if (!value) {return fallback}
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`无法解析 JSON: ${error.message}`)
  }
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))))
}

async function loadCaseGroups(args = {}) {
  const inlineGroups = String(args['case-groups-json'] || '').trim()
  const fileGroupsPath = String(args['case-groups-file'] || '').trim()
  const rawGroups = fileGroupsPath
    ? await fs.readFile(path.resolve(fileGroupsPath), 'utf8')
    : inlineGroups
  const parsed = safeJsonParse(rawGroups, [])
  assertCondition(Array.isArray(parsed), 'case groups 必须是 JSON 数组')
  return parsed
}

function buildOpenId(caseItem, prefix = 'diagnose_outcome_direct') {
  const label = String(caseItem?.label || caseItem?.caseKey || 'unknown').trim()
  const normalized = label.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 32) || 'unknown'
  const hash = crypto.createHash('sha1').update(JSON.stringify(caseItem || {})).digest('hex').slice(0, 10)
  return `dev_terminal_${prefix}_${normalized}_${hash}`.slice(0, 64)
}

function parseAnswerPattern(value = '') {
  return String(value || '')
    .split(',')
    .map(item => normalizeText(item))
    .filter(Boolean)
}

function decodePublicId(publicId = '', prefix = '') {
  const marker = `${prefix}_`
  const full = String(publicId || '')
  if (!full.startsWith(marker)) {return ''}
  const encoded = full.slice(marker.length).replace(/-/g, '+').replace(/_/g, '/')
  const pad = encoded.length % 4 === 0 ? '' : '='.repeat(4 - (encoded.length % 4))
  try {
    return Buffer.from(`${encoded}${pad}`, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function decodeProblemKey(problemId = '') {
  return decodePublicId(problemId, 'p')
}

function pickOptionIdByPattern(question = {}, answerToken = 'yes') {
  const options = Array.isArray(question?.options) ? question.options : []
  const normalizedToken = normalizeText(answerToken || 'yes')

  for (const option of options) {
    const optionId = String(option?.optionId || '')
    const decoded = normalizeText(decodePublicId(optionId, 'opt'))
    if (decoded === normalizedToken) {
      return optionId
    }
  }

  for (const option of options) {
    const text = normalizeText(option?.text || '')
    if (normalizedToken === 'yes' && (text.includes('是') || text.includes('有') || text.includes('会') || text.includes('明显'))) {
      return String(option?.optionId || '')
    }
    if (normalizedToken === 'no' && (text.includes('否') || text.includes('没有') || text.includes('不是') || text.includes('不会'))) {
      return String(option?.optionId || '')
    }
    if (normalizedToken === 'unknown' && (text.includes('不确定') || text.includes('不清楚') || text.includes('未知') || text.includes('看不出'))) {
      return String(option?.optionId || '')
    }
  }

  return ''
}

function buildFrontendStartResponse(roundResult = {}) {
  return app.buildFrontendDiagnosisResponse(buildPublicRoundResponse(roundResult))
}

function buildFrontendAnswerResponse(roundResult = {}) {
  return app.buildFrontendDiagnosisResponse(buildCompactAnswerRoundResponse(roundResult))
}

async function pollResult(openid, resultId, { attempts = 8, delayMs = 500 } = {}) {
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await getResultById(openid, { resultId, sessionId: '' })
    if (last) {
      return { data: last, attempt }
    }
    await sleep(delayMs)
  }
  return { data: last, attempt: attempts }
}

async function pollHistory(openid, sessionId, { pageSize = 10, attempts = 8, delayMs = 500 } = {}) {
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await listDiagnosisHistory(openid, { page: 1, pageSize })
    const items = Array.isArray(last?.items) ? last.items : []
    const matched = items.find(item => item?.historyId === sessionId) || null
    if (matched) {
      return { data: last, matched, attempt }
    }
    await sleep(delayMs)
  }
  return { data: last, matched: null, attempt: attempts }
}

async function runCase(caseItem, args = {}) {
  const openid = buildOpenId(caseItem, args['openid-prefix'] || 'diagnose_outcome_direct')
  const plantCatalogId = String(caseItem?.plantCatalogId || '1').trim() || '1'
  const observedEvidenceSet = Array.isArray(caseItem?.observedEvidenceSet) ? caseItem.observedEvidenceSet : []
  const expected = caseItem?.expected && typeof caseItem.expected === 'object' ? caseItem.expected : {}
  const answerPattern = parseAnswerPattern(caseItem?.answerPattern || '')

  const started = await app.runStartDiagnosis({
    payload: {
      plantCatalogId,
      observedEvidenceSet,
      skipAuth: true,
      openid
    },
    openid,
    skipPersistence: false
  })
  const startData = buildFrontendStartResponse(started.response)

  let current = startData
  let finalData = startData
  const answerRounds = []

  for (let loopIndex = 0; loopIndex < Math.max(1, normalizeInteger(args['max-followup-loops'], 3)); loopIndex += 1) {
    if (current?.stage === 'final') {
      finalData = current
      break
    }

    const questions = Array.isArray(current?.questions) ? current.questions : []
    assertCondition(questions.length > 0, `${caseItem?.label || caseItem?.caseKey || 'case'} 未返回 follow-up questions`)
    const answers = questions.map((question, index) => {
      const token = answerPattern[loopIndex + index] || answerPattern[answerPattern.length - 1] || 'yes'
      const optionId = pickOptionIdByPattern(question, token)
      assertCondition(optionId, `问题 ${question?.questionId || question?.questionKey || ''} 未找到 ${token} 选项`)
      return {
        questionId: question.questionId,
        optionId,
        answerToken: token
      }
    })

    const answered = await app.runAnswerDiagnosis({
      payload: {
        diagnosisSessionId: started.sessionId,
        roundId: current.roundId,
        answers: answers.map(item => ({
          questionId: item.questionId,
          optionId: item.optionId
        })),
        skipAuth: true,
        openid
      },
      openid,
      skipPersistence: false
    })
    current = buildFrontendAnswerResponse(answered.response)
    answerRounds.push({
      roundId: current.roundId || '',
      stage: current.stage || '',
      status: current.status || '',
      outcomeType: current.outcomeType || '',
      routePrimaryAction: current.routePrimaryAction || '',
      stopReason: current.stopReason || '',
      answerPattern: answers.map(item => item.answerToken),
      questionCount: questions.length
    })
    finalData = current
  }

  assertCondition(finalData?.stage === 'final', `${caseItem?.label || caseItem?.caseKey || 'case'} 未在预期轮次内到达 final`)
  const resultId = String(finalData?.finalResult?.resultId || '').trim()
  assertCondition(resultId, `${caseItem?.label || caseItem?.caseKey || 'case'} finalResult.resultId 缺失`)

  const resultPoll = await pollResult(openid, resultId)
  assertCondition(resultPoll.data, `${caseItem?.label || caseItem?.caseKey || 'case'} result 未落库`)
  const historyPoll = await pollHistory(openid, started.sessionId, {
    pageSize: normalizeInteger(args['history-page-size'], 10)
  })
  assertCondition(historyPoll.matched, `${caseItem?.label || caseItem?.caseKey || 'case'} history 未找到刚创建会话`)

  const expectedOutcome = normalizeText(expected.outcome || '')
  const expectedNonProblematicType = normalizeText(expected.nonProblematicType || '')
  const expectedProblemKey = normalizeText(expected.problemKey || '')
  const expectedRoutePrimaryAction = normalizeText(expected.routePrimaryAction || '')
  const expectedIdentityResolutionStatus = normalizeText(expected.identityResolutionStatus || '')
  const expectedStartStage = normalizeText(expected.startStage || '')
  const expectedMinStartQuestionCount = normalizeInteger(expected.minStartQuestionCount || 0, 0)

  if (expectedOutcome) {
    assertCondition(normalizeText(finalData?.outcomeType || '') === expectedOutcome, `outcomeType 异常: ${finalData?.outcomeType || ''}`)
  }
  if (expectedNonProblematicType) {
    assertCondition(normalizeText(finalData?.nonProblematicType || '') === expectedNonProblematicType, `answer nonProblematicType 异常: ${finalData?.nonProblematicType || ''}`)
    assertCondition(normalizeText(resultPoll.data?.nonProblematicType || '') === expectedNonProblematicType, `result nonProblematicType 异常: ${resultPoll.data?.nonProblematicType || ''}`)
    assertCondition(normalizeText(historyPoll.matched?.nonProblematicType || '') === expectedNonProblematicType, `history nonProblematicType 异常: ${historyPoll.matched?.nonProblematicType || ''}`)
  }
  if (expectedProblemKey) {
    assertCondition(decodeProblemKey(finalData?.finalResult?.problemId || '') === expectedProblemKey, `answer problemKey 异常`)
    assertCondition(decodeProblemKey(resultPoll.data?.finalResult?.problemId || '') === expectedProblemKey, `result problemKey 异常`)
  }
  if (expectedRoutePrimaryAction) {
    assertCondition(normalizeText(finalData?.routePrimaryAction || '') === expectedRoutePrimaryAction, `routePrimaryAction 异常: ${finalData?.routePrimaryAction || ''}`)
    assertCondition(normalizeText(resultPoll.data?.routePrimaryAction || '') === expectedRoutePrimaryAction, `result routePrimaryAction 异常: ${resultPoll.data?.routePrimaryAction || ''}`)
  }
  if (expectedIdentityResolutionStatus) {
    assertCondition(normalizeText(finalData?.identityResolutionStatus || '') === expectedIdentityResolutionStatus, `identityResolutionStatus 异常: ${finalData?.identityResolutionStatus || ''}`)
  }
  if (expectedStartStage) {
    assertCondition(normalizeText(startData?.stage || '') === expectedStartStage, `start stage 异常: ${startData?.stage || ''}`)
  }
  if (expectedMinStartQuestionCount > 0) {
    assertCondition((Array.isArray(startData?.questions) ? startData.questions.length : 0) >= expectedMinStartQuestionCount, `start questionCount 不足`)
  }

  return {
    ok: true,
    label: String(caseItem?.label || '').trim() || String(caseItem?.caseKey || '').trim() || 'unknown',
    caseKey: String(caseItem?.caseKey || '').trim(),
    expected: {
      outcomeType: expected.outcome || '',
      nonProblematicType: expected.nonProblematicType || '',
      problemKey: expected.problemKey || '',
      routePrimaryAction: expected.routePrimaryAction || '',
      identityResolutionStatus: expected.identityResolutionStatus || '',
      startStage: expected.startStage || '',
      minStartQuestionCount: expected.minStartQuestionCount || 0,
      taxonomyMatchStatus: expected.taxonomyMatchStatus || ''
    },
    plantCatalogId,
    openid,
    observedEvidenceKeys: observedEvidenceSet.map(item => String(item?.evidenceKey || item?.symptomKey || '').trim()).filter(Boolean),
    observedSymptomKeys: observedEvidenceSet.map(item => String(item?.symptomKey || '').trim()).filter(Boolean),
    diagnosisSessionId: started.sessionId || '',
    historyId: historyPoll.matched?.historyId || '',
    outcomeType: finalData?.outcomeType || '',
    nonProblematicType: finalData?.nonProblematicType || '',
    problemId: finalData?.finalResult?.problemId || '',
    problemKey: decodeProblemKey(finalData?.finalResult?.problemId || ''),
    routePrimaryAction: finalData?.routePrimaryAction || '',
    identityResolutionStatus: finalData?.identityResolutionStatus || '',
    taxonomyMatchStatus: finalData?.taxonomyMatchStatus || '',
    displayName: finalData?.finalResult?.displayName || '',
    severity: finalData?.finalResult?.severity || '',
    startStage: startData?.stage || '',
    startQuestionCount: Array.isArray(startData?.questions) ? startData.questions.length : 0,
    answerRounds,
    resultAttempt: resultPoll.attempt,
    historyAttempt: historyPoll.attempt,
    error: ''
  }
}

function buildSummary(results = []) {
  return results.reduce((acc, item) => {
    acc.total += 1
    const label = String(item?.label || 'unknown').trim() || 'unknown'
    if (!acc.byLabel[label]) {
      acc.byLabel[label] = { total: 0, success: 0, failed: 0, skipped: 0 }
    }
    acc.byLabel[label].total += 1
    if (item.ok) {
      acc.success += 1
      acc.byLabel[label].success += 1
    } else {
      acc.failed += 1
      acc.byLabel[label].failed += 1
    }
    return acc
  }, {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    byLabel: {}
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const caseGroups = await loadCaseGroups(args)
  const results = []

  for (const caseItem of caseGroups) {
    try {
      results.push(await runCase(caseItem, args))
    } catch (error) {
      results.push({
        ok: false,
        label: String(caseItem?.label || '').trim() || String(caseItem?.caseKey || '').trim() || 'unknown',
        caseKey: String(caseItem?.caseKey || '').trim(),
        expected: caseItem?.expected || {},
        plantCatalogId: String(caseItem?.plantCatalogId || '').trim() || '1',
        openid: '',
        observedEvidenceKeys: Array.isArray(caseItem?.observedEvidenceSet)
          ? caseItem.observedEvidenceSet.map(item => String(item?.evidenceKey || item?.symptomKey || '').trim()).filter(Boolean)
          : [],
        observedSymptomKeys: Array.isArray(caseItem?.observedEvidenceSet)
          ? caseItem.observedEvidenceSet.map(item => String(item?.symptomKey || '').trim()).filter(Boolean)
          : [],
        diagnosisSessionId: '',
        historyId: '',
        outcomeType: '',
        nonProblematicType: '',
        problemId: '',
        problemKey: '',
        routePrimaryAction: '',
        identityResolutionStatus: '',
        taxonomyMatchStatus: '',
        displayName: '',
        severity: '',
        startStage: '',
        startQuestionCount: 0,
        error: String(error?.stack || error?.message || error || '')
      })
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    mode: 'direct-runtime',
    caseGroupsCount: caseGroups.length,
    summary: buildSummary(results),
    results
  }

  const reportFile = String(args['report-file'] || '').trim()
  if (reportFile) {
    const resolved = path.resolve(reportFile)
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  }

  console.log(JSON.stringify(output, null, 2))
  if (output.summary.failed > 0) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
