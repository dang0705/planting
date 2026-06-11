'use strict'

function pickMinimalPackageQuestions(items = [], options = {}) {
  const limit = Math.max(1, Number(options?.limit || 1))
  return (Array.isArray(items) ? items : [])
    .filter(item => item?.questionId || item?.questionKey)
    .slice(0, limit)
    .map(item => {
      const questionText = String(
        item?.text || item?.questionText || item?.questionTextUserCn || item?.questionTextCn || ''
      ).trim()

      return {
        questionId: String(item?.questionId || item?.questionKey || '').trim(),
        questionKey: String(item?.questionKey || item?.questionId || '').trim(),
        packageTopic: String(item?.packageTopic || '').trim(),
        defaultOptionKey: String(item?.defaultOptionKey || '').trim(),
        defaultOptionId: String(item?.defaultOptionId || '').trim(),
        uiVariant: String(item?.uiVariant || '').trim(),
        text: questionText,
        helpText: String(item?.helpText || '').trim(),
        options: (Array.isArray(item?.options) ? item.options : [])
          .filter(option => option?.optionId || option?.optionKey)
          .map(option => ({
            optionId: String(option?.optionId || option?.optionKey || '').trim(),
            optionKey: String(option?.optionKey || option?.optionId || '').trim(),
            text: String(option?.text || option?.label || '').trim(),
            isDefault: Boolean(option?.isDefault)
          }))
      }
    })
}

function buildQuestionPackageSummaryCard(questions = []) {
  return {
    title: '诊断问题',
    subtitle:
      questions.length > 1
        ? `需要回答 ${questions.length} 道问题`
        : questions.length
          ? '需要回答 1 道问题'
          : '请继续完成问题',
    severity: 'low',
    statusText: ''
  }
}

module.exports = {
  pickMinimalPackageQuestions,
  buildQuestionPackageSummaryCard
}
