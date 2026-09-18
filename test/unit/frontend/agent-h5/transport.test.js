// data_mode=unit_fake: isolate browser transport; Expected from ACP SSE contract.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendMessage, sendToolResult } from '../../../../src/agent-h5/transport.js'

function sse(value) {
  return `data: ${JSON.stringify(value)}\n\n`
}

describe('小青 H5 流式传输', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('读取 ACP 嵌套正文事件并在 done 前逐段通知页面', async () => {
    const encoder = new TextEncoder()
    let releaseSecondChunk
    const secondChunk = new Promise(resolve => {
      releaseSecondChunk = resolve
    })
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            sse({
              method: 'session/update',
              params: {
                update: {
                  sessionUpdate: 'agent_message_chunk',
                  content: { type: 'text', text: '你好' }
                }
              }
            })
          )
        )
        await secondChunk
        controller.enqueue(encoder.encode(sse({ done: true })))
        controller.close()
      }
    })
    vi.stubGlobal('window', {
      location: { href: 'https://agent.example/agent/index.html#/pages/chat/chat' }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      )
    )
    const chunks = []
    let resolved = false
    const request = sendMessage(
      '绿萝怎么养',
      value => chunks.push(value),
      new AbortController().signal
    )
    await vi.waitFor(() => expect(chunks).toEqual(['你好']))
    expect(resolved).toBe(false)
    releaseSecondChunk()
    await request.then(() => {
      resolved = true
    })
    expect(resolved).toBe(true)
  })

  it('读取 ask_user SSE 事件并返回结构化问题', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            sse({
              type: 'ask_user',
              resumeToken: 'resume-ask-1',
              questions: [
                {
                  question: '盆土干吗？',
                  header: '盆土',
                  multiSelect: false,
                  options: [
                    { label: '干燥', description: '需要检查' },
                    { label: '湿润', description: '' }
                  ]
                }
              ]
            })
          )
        )
        controller.enqueue(encoder.encode(sse({ done: true })))
        controller.close()
      }
    })
    vi.stubGlobal('window', {
      location: { href: 'https://agent.example/agent/index.html#/pages/chat/chat' }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      )
    )
    const questions = []
    await sendMessage(
      '需要浇水吗',
      () => {},
      new AbortController().signal,
      value => questions.push(value)
    )
    expect(questions).toEqual([
      {
        resumeToken: 'resume-ask-1',
        questions: [
          {
            question: '盆土干吗？',
            header: '盆土',
            multiSelect: false,
            options: [
              { label: '干燥', description: '需要检查' },
              { label: '湿润', description: '' }
            ],
            selected: [],
            submitting: false
          }
        ]
      }
    ])
  })

  it('提交答案时发送后端约定的 resumeToken 和结构化 answers', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse({ done: true })))
        controller.close()
      }
    })
    vi.stubGlobal('window', {
      location: { href: 'https://agent.example/agent/index.html#/pages/chat/chat' }
    })
    const fetchMock = vi.fn(
      async () =>
        new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    )
    vi.stubGlobal('fetch', fetchMock)
    await sendToolResult(
      'resume-ask-1',
      { '盆土现在是什么状态？': '干燥', '看到了哪些症状？': ['黄叶', '下垂'] },
      () => {},
      new AbortController().signal
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      resumeToken: 'resume-ask-1',
      answers: { '盆土现在是什么状态？': '干燥', '看到了哪些症状？': ['黄叶', '下垂'] }
    })
    expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin')
  })

  it('普通工具的 pendingToolUse 输入即使含 questions 也不展示问诊卡', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            sse({
              result: {
                stopReason: 'tool_use',
                pendingToolUse: {
                  toolName: 'qinghuazhi_plant_lookup',
                  input: {
                    questions: [
                      {
                        question: '普通工具字段',
                        header: '内部字段',
                        multiSelect: false,
                        options: [
                          { label: 'A', description: 'a' },
                          { label: 'B', description: 'b' }
                        ]
                      }
                    ]
                  }
                }
              }
            })
          )
        )
        controller.close()
      }
    })
    vi.stubGlobal('window', {
      location: { href: 'https://agent.example/agent/index.html#/pages/chat/chat' }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      )
    )
    const questions = []
    await sendMessage(
      '查询植物',
      () => {},
      new AbortController().signal,
      value => questions.push(value)
    )
    expect(questions).toEqual([])
  })

  it('ask_user 缺少 resumeToken 时拒绝进入问诊卡状态', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            sse({
              type: 'ask_user',
              questions: [
                {
                  question: '盆土干吗？',
                  header: '盆土',
                  multiSelect: false,
                  options: [
                    { label: '干燥', description: '需要检查' },
                    { label: '湿润', description: '仍然湿润' }
                  ]
                }
              ]
            })
          )
        )
        controller.enqueue(encoder.encode(sse({ done: true })))
        controller.close()
      }
    })
    vi.stubGlobal('window', {
      location: { href: 'https://agent.example/agent/index.html#/pages/chat/chat' }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      )
    )
    await expect(
      sendMessage(
        '需要浇水吗',
        () => {},
        new AbortController().signal,
        () => {}
      )
    ).rejects.toThrow('回复中断')
  })

  it('解析后端额度事件，并保留额度拒绝的结构化错误', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            sse({
              type: 'quota',
              data: { usedToday: 17, dailyLimit: 20, remainingToday: 3, warning: true }
            })
          )
        )
        controller.enqueue(encoder.encode(sse({ done: true })))
        controller.close()
      }
    })
    vi.stubGlobal('window', {
      location: { href: 'https://agent.example/agent/index.html#/pages/chat/chat' }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      )
    )
    const quotas = []
    await sendMessage(
      '继续聊',
      () => {},
      new AbortController().signal,
      undefined,
      quota => quotas.push(quota)
    )
    expect(quotas).toEqual([
      { usedToday: 17, dailyLimit: 20, remainingToday: 3, warning: true }
    ])

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 'AGENT_DAILY_LIMIT_EXCEEDED',
            message: '今天的小青额度已用完，明天再来继续聊天。',
            data: { usedToday: 20, dailyLimit: 20, remainingToday: 0, blocked: true }
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )
    await expect(
      sendMessage('再聊一次', () => {}, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'AGENT_DAILY_LIMIT_EXCEEDED',
      status: 429,
      data: { remainingToday: 0 }
    })
  })
})
