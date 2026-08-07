'use strict'

import { recordAssertion } from '../../care/airflow/_shared/lib/reporter.mjs'
import { runBoundedAutomatorOperation } from './automator-session-boundary.mjs'

const ACTIVE_MARKER_PREFIX = 'diagnose-question-package-page-active-question-'
const QUESTION_OPTION_PREFIX = 'diagnose-question-package-page-option-'
const QUESTION_NEXT_ID = 'diagnose-question-package-page-next-button'

export const activeQuestionMarkerId = questionKey =>
  `${ACTIVE_MARKER_PREFIX}${String(questionKey || '').trim()}`

export const ordinaryQuestionUnknownOptionId = questionKey =>
  `${QUESTION_OPTION_PREFIX}${String(questionKey || '').trim()}-unknown`

function resolveOrdinaryQuestionFallbackOptionKey(questionKey, questionDefinitions = []) {
  const question = (Array.isArray(questionDefinitions) ? questionDefinitions : []).find(
    item => String(item?.questionKey || '').trim() === String(questionKey || '').trim()
  )
  const option = (Array.isArray(question?.options) ? question.options : []).find(item => {
    const optionKey = String(item?.optionKey || item?.optionId || '').trim().toLowerCase()
    const optionText = String(item?.text || '').trim()
    return (
      optionKey === 'unknown' ||
      optionKey.includes('unknown') ||
      /不确定|说不清|没留意|都没有/.test(optionText)
    )
  })
  return String(option?.optionId || option?.optionKey || 'unknown').trim() || 'unknown'
}

function resolveOrdinaryQuestionFallbackControlId(questionKey, questionDefinitions = []) {
  const question = (Array.isArray(questionDefinitions) ? questionDefinitions : []).find(
    item => String(item?.questionKey || '').trim() === String(questionKey || '').trim()
  )
  if (
    String(question?.packageTopic || '').trim() === 'light_change_context' ||
    String(question?.questionKey || '').includes('light_change_context')
  ) {
    return 'diagnose-light-window-no_window'
  }
  return ordinaryQuestionFallbackOptionId(questionKey, questionDefinitions)
}

export function ordinaryQuestionFallbackOptionId(questionKey, questionDefinitions = []) {
  return `${QUESTION_OPTION_PREFIX}${String(questionKey || '').trim()}-${resolveOrdinaryQuestionFallbackOptionKey(questionKey, questionDefinitions)}`
}

export function questionKeysFromLanQuestionStart(request) {
  const questions = questionDefinitionsFromLanQuestionStart(request)
  if (!Array.isArray(questions)) {
    return []
  }
  return questions.map(question => String(question?.questionKey || '').trim()).filter(Boolean)
}

export function questionDefinitionsFromLanQuestionStart(request) {
  const questions = request?.response?.data?.data?.questions
  return Array.isArray(questions) ? questions : []
}

export async function waitForVisibleActiveQuestion({
  page,
  questionKey,
  report,
  findElementById,
  assertion
}) {
  const markerId = activeQuestionMarkerId(questionKey)
  const marker = questionKey ? await findElementById(page, markerId) : null
  recordAssertion(
    report,
    assertion || `visible active marker is available for ${questionKey}`,
    Boolean(marker),
    markerId
  )
  return Boolean(marker)
}

export async function tapActiveQuestionControl({
  page,
  questionKey,
  controlId,
  report,
  findElementById,
  assertion
}) {
  if (
    !(await waitForVisibleActiveQuestion({
      page,
      questionKey,
      report,
      findElementById,
      assertion: `${assertion}: current question marker`
    }))
  ) {
    return false
  }
  const control = await findElementById(page, controlId)
  recordAssertion(report, assertion, Boolean(control), controlId)
  if (!control) {
    return false
  }
  await runBoundedAutomatorOperation({
    operation: `question_package.${String(questionKey)}.${String(controlId)}.tap`,
    action: () => control.tap()
  })
  return true
}

export async function answerVisibleOrdinaryQuestion({
  page,
  questionKey,
  report,
  findElementById,
  ordinal,
  questionDefinitions = []
}) {
  const questionLabel = `ordinary question ${ordinal}`
  if (
    !(await tapActiveQuestionControl({
      page,
      questionKey,
      controlId: resolveOrdinaryQuestionFallbackControlId(questionKey, questionDefinitions),
      report,
      findElementById,
      assertion: `${questionLabel} unknown option is available`
    }))
  ) {
    return false
  }
  return tapActiveQuestionControl({
    page,
    questionKey,
    controlId: QUESTION_NEXT_ID,
    report,
    findElementById,
    assertion: `advance ${questionLabel}`
  })
}

export async function completeVisibleAirEnvironmentQuestionFlow({
  page,
  questionKeys,
  airQuestionKey,
  controls,
  report,
  findElementById,
  questionDefinitions = []
}) {
  const airQuestionPosition = questionKeys.indexOf(airQuestionKey)
  const airStepPositionIsExpected = airQuestionPosition === 3
  recordAssertion(
    report,
    'wilting LAN question sequence places air-environment after three ordinary questions',
    airStepPositionIsExpected,
    JSON.stringify(questionKeys)
  )
  if (!airStepPositionIsExpected) {
    return false
  }
  for (const [index, questionKey] of questionKeys.slice(0, airQuestionPosition).entries()) {
    if (
      !(await answerVisibleOrdinaryQuestion({
        page,
        questionKey,
        report,
        findElementById,
        ordinal: index + 1,
        questionDefinitions
      }))
    ) {
      return false
    }
  }
  if (
    !(await waitForVisibleActiveQuestion({
      page,
      questionKey: airQuestionKey,
      report,
      findElementById,
      assertion:
        'wilting air-environment question becomes interactive after three ordinary questions'
    }))
  ) {
    return false
  }
  for (const [controlId, assertion] of controls) {
    if (
      !(await tapActiveQuestionControl({
        page,
        questionKey: airQuestionKey,
        controlId,
        report,
        findElementById,
        assertion
      }))
    ) {
      return false
    }
  }
  for (const [index, questionKey] of questionKeys.slice(airQuestionPosition + 1).entries()) {
    if (
      !(await answerVisibleOrdinaryQuestion({
        page,
        questionKey,
        report,
        findElementById,
        ordinal: airQuestionPosition + index + 2,
        questionDefinitions
      }))
    ) {
      return false
    }
  }
  return true
}
