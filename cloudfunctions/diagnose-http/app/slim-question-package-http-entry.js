'use strict'

const { main: startQuestionPackage } = require('./slim-question-start-http-entry')
const { main: answerQuestionPackage } = require('./slim-package-answer-http-entry')

function requestPath(event = {}, context = {}) {
  const httpContext = context?.httpContext || {}
  return String(
    httpContext.path ||
      httpContext.url ||
      httpContext.rawPath ||
      httpContext.reqUrl ||
      event?.path ||
      ''
  )
}

function isQuestionStartRequest(event = {}, context = {}) {
  return requestPath(event, context).includes('/diagnosis/question/start')
}

function main(event, context) {
  return isQuestionStartRequest(event, context)
    ? startQuestionPackage(event, context)
    : answerQuestionPackage(event, context)
}

module.exports = { main, _test: { requestPath, isQuestionStartRequest } }
