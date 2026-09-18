'use strict'

const { runSlimDiagnosisRequest } = require('./slim-diagnosis-http-runtime')
const { handleQuestionStart } = require('./slim-question-start-http-handler')

module.exports.main = (event, context) =>
  runSlimDiagnosisRequest({
    event,
    context,
    functionName: 'diagnosis-question-start-http',
    pathFragment: '/diagnosis/question/start',
    fallbackMessage: '问诊初始化失败',
    handler: handleQuestionStart
  })
