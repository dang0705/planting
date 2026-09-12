'use strict'

const { runSlimDiagnosisRequest } = require('./slim-diagnosis-http-runtime')
const { handleAnswer } = require('./slim-answer-http-handler')
const { triggerDiagnosisAnswerPackageCachePreload } = require('./static-cache-preloader')

// 黄叶固定题包的答案路由只依赖这些题目对应的已审核效果及结果资料。
// 预热是后台 best-effort，不阻塞函数加载，也不改变数据库作为事实源。
triggerDiagnosisAnswerPackageCachePreload(
  [
    'q_observed_probe__leaf_yellowing__watering_frequency_context',
    'q_observed_probe__leaf_yellowing__light_change_context',
    'q_observed_probe__leaf_yellowing__fertilization_growth_context',
    'q_observed_probe__leaf_yellowing__air_environment'
  ],
  {
    scope: 'diagnosis-answer-http-startup',
    source: 'module_load',
    additionalOutcomeKeys: ['low_light_growth_weakness', 'sunburn', 'overwatering_root_pressure']
  }
)

module.exports.main = (event, context) =>
  runSlimDiagnosisRequest({
    event,
    context,
    functionName: 'diagnosis-answer-http',
    pathFragment: '/diagnosis/answer',
    fallbackMessage: '问诊提交失败',
    handler: handleAnswer
  })
