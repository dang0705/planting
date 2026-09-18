// data_mode=unit_fake: isolate network; Expected from user request and duplicate-send/expiry requirements.
import { describe, it, expect, vi } from 'vitest'
import { createChatState } from '../../../../src/agent-h5/chat-state.js'
describe('小青聊天状态', () => {
  it('等待回复时重复发送不产生第二个请求', async () => {
    let finish
    const send = vi.fn(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    const chat = createChatState(send)
    const first = chat.send('绿萝怎么养？')
    await chat.send('重复')
    expect(send).toHaveBeenCalledTimes(1)
    finish()
    await first
    expect(chat.state.busy).toBe(false)
  })
  it('空白消息不发送，失败保留问题并给出可理解提示', async () => {
    const send = vi.fn(async () => {
      throw new Error('private-token')
    })
    const chat = createChatState(send)
    await chat.send('  ')
    expect(send).not.toHaveBeenCalled()
    await chat.send('叶子黄了')
    expect(chat.state.messages[0].text).toBe('叶子黄了')
    expect(chat.state.error).toBe('回复暂时中断，请稍后重试。')
    expect(chat.state.error).not.toContain('private-token')
  })
  it('接收到正文就更新回答，取消后忽略迟到内容', async () => {
    let emit
    const chat = createChatState(async (_text, onText, signal) => {
      emit = onText
      onText('先检查盆土')
      await new Promise(resolve => signal.addEventListener('abort', resolve))
    })
    const task = chat.send('需要浇水吗')
    expect(chat.state.messages[1].text).toBe('先检查盆土')
    chat.stop()
    emit('迟到数据')
    await task
    expect(chat.state.messages[1].text).toBe('先检查盆土')
  })

  it('收到结构化提问后保存问题并按单选/多选规则提交答案', async () => {
    let release
    const send = vi.fn(async (_text, onText, _signal, onAskUser) => {
      onAskUser({
        resumeToken: 'resume-1',
        questions: [
          {
            header: '盆土',
            question: '盆土现在是什么状态？',
            multiSelect: false,
            options: [
              { label: '干燥', description: '盆土明显发干' },
              { label: '湿润', description: '盆土仍然湿润' }
            ]
          },
          {
            header: '症状',
            question: '看到了哪些症状？',
            multiSelect: true,
            options: [
              { label: '黄叶', description: '' },
              { label: '下垂', description: '' }
            ]
          }
        ]
      })
    })
    const submit = vi.fn(
      () =>
        new Promise(resolve => {
          release = resolve
        })
    )
    const chat = createChatState(send)
    chat.setToolResultSender(submit)

    await chat.send('我的绿萝叶子怎么了')
    expect(chat.state.pendingQuestion.questions[0].header).toBe('盆土')
    expect(chat.state.pendingQuestion.questions[1].multiSelect).toBe(true)
    expect(chat.canSubmitQuestion()).toBe(false)

    chat.selectQuestionOption(0, 0)
    chat.selectQuestionOption(1, 0)
    chat.selectQuestionOption(1, 1)
    expect(chat.canSubmitQuestion()).toBe(true)
    const pending = chat.submitQuestion()
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(submit.mock.calls[0][0]).toBe('resume-1')
    expect(submit.mock.calls[0][1]).toEqual({
      '盆土现在是什么状态？': '干燥',
      '看到了哪些症状？': ['黄叶', '下垂']
    })
    expect(chat.state.busy).toBe(true)
    expect(chat.canSubmitQuestion()).toBe(false)
    await chat.submitQuestion()
    expect(submit).toHaveBeenCalledTimes(1)
    release()
    await pending
    expect(chat.state.pendingQuestion).toBe(null)
    expect(chat.state.busy).toBe(false)
  })

  it('等待提问回答时不允许发送普通文本', async () => {
    const send = vi.fn(async (_text, _onText, _signal, onAskUser) => {
      onAskUser({
        resumeToken: 'resume-2',
        questions: [
          {
            header: '光照',
            question: '光照如何？',
            multiSelect: false,
            options: [{ label: '明亮', description: '' }]
          }
        ]
      })
    })
    const chat = createChatState(send)
    await chat.send('继续问')
    await chat.send('绕过卡片')
    expect(send).toHaveBeenCalledTimes(1)
    expect(chat.state.messages[2]).toBeUndefined()
  })

  it('提交答案始终使用展示给用户的 label，不使用外部 value', async () => {
    const send = vi.fn(async (_text, _onText, _signal, onAskUser) => {
      onAskUser({
        resumeToken: 'resume-label',
        questions: [
          {
            header: '盆土',
            question: '盆土现在是什么状态？',
            multiSelect: false,
            options: [
              { label: '偏干', value: 'dry', description: '盆土表层已经干燥' },
              { label: '偏湿', value: 'wet', description: '盆土仍然湿润' }
            ]
          }
        ]
      })
    })
    const submit = vi.fn(async () => {})
    const chat = createChatState(send)
    chat.setToolResultSender(submit)
    await chat.send('帮我判断植物状态')
    chat.selectQuestionOption(0, 0)
    await chat.submitQuestion()
    expect(submit).toHaveBeenCalledWith(
      'resume-label',
      { '盆土现在是什么状态？': '偏干' },
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function)
    )
  })

  it('只有问答卡片而没有正文时不显示空的停止提示', async () => {
    const send = vi.fn(async (_text, _onText, _signal, onAskUser) => {
      onAskUser({
        resumeToken: 'resume-card-only',
        questions: [
          {
            header: '盆土',
            question: '盆土现在是什么状态？',
            multiSelect: false,
            options: [
              { label: '偏干', description: '盆土表层已经干燥' },
              { label: '偏湿', description: '盆土仍然湿润' }
            ]
          }
        ]
      })
    })
    const chat = createChatState(send)
    await chat.send('帮我判断植物状态')
    expect(chat.state.messages).toEqual([{ role: 'user', text: '帮我判断植物状态' }])
    expect(chat.state.pendingQuestion.resumeToken).toBe('resume-card-only')
  })

  it('后端额度达到上限后锁住输入，前端不能绕过限制', async () => {
    const send = vi.fn(async (_text, _onText, _signal, _onAskUser, onQuota) => {
      onQuota({
        usedToday: 20,
        dailyLimit: 20,
        remainingToday: 0,
        warning: false,
        blocked: true,
        message: '今天的小青额度已用完，明天再来继续聊天。'
      })
    })
    const chat = createChatState(send)
    await chat.send('第一次消息')
    expect(chat.state.quotaBlocked).toBe(true)
    expect(chat.state.quota.remainingToday).toBe(0)
    await chat.send('尝试绕过')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
