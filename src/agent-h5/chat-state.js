import { reactive } from 'vue'

export function createChatState(sendMessage) {
  const state = reactive({
    messages: [],
    busy: false,
    error: '',
    expired: false,
    pendingQuestion: null,
    quota: null,
    quotaBlocked: false
  })
  let controller
  let sendToolResult = sendMessage

  function setPendingQuestion(question) {
    const last = state.messages[state.messages.length - 1]
    if (last?.role === 'assistant' && !last.text) {
      state.messages.pop()
    }
    state.pendingQuestion = question
  }

  function answerLabel(option) {
    return String(option?.label ?? '').trim()
  }

  function selectedValues(question) {
    return Array.isArray(question?.selected) ? question.selected : []
  }

  function canSubmitQuestion() {
    return Boolean(
      state.pendingQuestion &&
      !state.busy &&
      state.pendingQuestion.resumeToken &&
      state.pendingQuestion.questions.every(question => selectedValues(question).length > 0)
    )
  }

  function answerSummary(questions) {
    return questions
      .map(question => {
        const values = selectedValues(question).map(value => String(value))
        return `${question.header}：${values.join('、')}`
      })
      .join('\n')
  }

  function setQuota(quota) {
    if (!quota || typeof quota !== 'object') {
      return
    }
    state.quota = quota
    state.quotaBlocked = quota.blocked === true
  }

  function setRequestError(error) {
    if (error?.code === 'AGENT_DAILY_LIMIT_EXCEEDED' || error?.status === 429) {
      setQuota({ ...(error.data || {}), blocked: true })
      state.error = error.message || '今天的小青额度已用完，明天再来继续聊天。'
      return
    }
    state.expired = error?.status === 401
    state.error = state.expired
      ? '登录已失效，请返回小程序重新进入小青。'
      : '回复暂时中断，请稍后重试。'
  }

  return {
    state,
    setToolResultSender(sender) {
      sendToolResult = sender || sendMessage
    },
    selectQuestionOption(questionIndex, optionIndex) {
      const question = state.pendingQuestion?.questions?.[questionIndex]
      const option = question?.options?.[optionIndex]
      if (!question || !option || state.busy) {
        return false
      }
      const value = answerLabel(option)
      const selected = selectedValues(question)
      if (question.multiSelect) {
        question.selected = selected.includes(value)
          ? selected.filter(selectedValue => selectedValue !== value)
          : [...selected, value]
      } else {
        question.selected = [value]
      }
      return true
    },
    canSubmitQuestion,
    async submitQuestion() {
      if (!canSubmitQuestion()) {
        return false
      }
      const question = state.pendingQuestion
      const answers = Object.fromEntries(
        question.questions.map(item => [
          item.question,
          item.multiSelect ? [...selectedValues(item)] : selectedValues(item)[0]
        ])
      )
      question.questions.forEach(item => {
        item.submitting = true
      })
      state.error = ''
      state.busy = true
      const current = new AbortController()
      controller = current
      state.messages.push(
        { role: 'user', text: answerSummary(question.questions) },
        { role: 'assistant', text: '' }
      )
      const answer = state.messages[state.messages.length - 1]
      try {
        await sendToolResult(
          question.resumeToken,
          answers,
          chunk => {
            if (!current.signal.aborted && typeof chunk === 'string') {
              answer.text += chunk
            }
          },
          current.signal,
          setPendingQuestion,
          setQuota
        )
        if (state.pendingQuestion === question) {
          state.pendingQuestion = null
        }
        return true
      } catch (error) {
        if (!current.signal.aborted) {
          setRequestError(error)
        }
        return false
      } finally {
        question.questions.forEach(item => {
          item.submitting = false
        })
        if (controller === current) {
          state.busy = false
        }
      }
    },
    async send(value) {
      const text = String(value || '').trim()
      if (
        !text ||
        text.length > 2000 ||
        state.busy ||
        state.expired ||
        state.quotaBlocked ||
        state.pendingQuestion
      ) {
        return
      }
      state.error = ''
      state.busy = true
      const current = new AbortController()
      controller = current
      state.messages.push({ role: 'user', text }, { role: 'assistant', text: '' })
      const answer = state.messages[state.messages.length - 1]
      try {
        await sendMessage(
          text,
          chunk => {
            if (!current.signal.aborted && typeof chunk === 'string') {
              answer.text += chunk
            }
          },
          current.signal,
          setPendingQuestion,
          setQuota
        )
      } catch (error) {
        if (!current.signal.aborted) {
          setRequestError(error)
        }
      } finally {
        if (controller === current) {
          state.busy = false
        }
      }
    },
    stop() {
      controller?.abort()
    }
  }
}
