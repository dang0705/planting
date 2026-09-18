// data_mode=unit_fake. Tests the public AskUserQuestion DTO and opaque resume token boundary.
// Expected: only allowlisted question fields cross the H5 boundary; answers are validated
// against the displayed options before the backend constructs ACP tool_result content.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  sanitizeAskUserQuestions,
  createAskResumeToken,
  getAskResumeTokenHash,
  readAskResumeToken,
  normalizeAskUserAnswers,
  markPendingAskSession,
  getAgentSessionId,
  getPendingAskTokenHash,
  isPendingAskSession
} = require('../../../../cloudfunctions/agent-http/ask-user.js')

const input = {
  questions: [
    {
      question: '你的植物现在是什么状态？',
      header: '植物状态',
      multiSelect: false,
      options: [
        { label: '偏干', description: '盆土表层已经干燥。', preview: 'private-preview' },
        { label: '偏湿', description: '盆土仍然湿润。', internal: 'private-field' }
      ],
      sessionId: 'private-session',
      toolUseId: 'private-tool-id'
    }
  ],
  secret: 'must-not-cross-boundary'
}

test('AskUserQuestion 只输出安全问题卡片字段并保留 multiSelect', () => {
  const questions = sanitizeAskUserQuestions(input)
  assert.deepEqual(questions, [
    {
      question: '你的植物现在是什么状态？',
      header: '植物状态',
      multiSelect: false,
      options: [
        { label: '偏干', description: '盆土表层已经干燥。' },
        { label: '偏湿', description: '盆土仍然湿润。' }
      ]
    }
  ])
  assert.equal(JSON.stringify(questions).includes('private-'), false)
})

test('AskUserQuestion 结构不完整或选项越界时拒绝', () => {
  assert.equal(sanitizeAskUserQuestions({ questions: [] }), null)
  assert.equal(
    sanitizeAskUserQuestions({
      questions: [
        { question: '选一个', header: '选择', multiSelect: false, options: [{ label: 'A' }] }
      ]
    }),
    null
  )
  assert.equal(
    sanitizeAskUserQuestions({
      questions: [
        {
          question: '选一个',
          header: '选择',
          multiSelect: 'false',
          options: [
            { label: 'A', description: 'a' },
            { label: 'B', description: 'b' }
          ]
        }
      ]
    }),
    null
  )
})

test('多个问题可以使用相同 header 分组', () => {
  assert.deepEqual(
    sanitizeAskUserQuestions({
      questions: [
        {
          question: '问题一',
          header: '植物状态',
          multiSelect: false,
          options: [
            { label: 'A', description: 'a' },
            { label: 'B', description: 'b' }
          ]
        },
        {
          question: '问题二',
          header: '植物状态',
          multiSelect: true,
          options: [
            { label: 'C', description: 'c' },
            { label: 'D', description: 'd' }
          ]
        }
      ]
    }),
    [
      {
        question: '问题一',
        header: '植物状态',
        multiSelect: false,
        options: [
          { label: 'A', description: 'a' },
          { label: 'B', description: 'b' }
        ]
      },
      {
        question: '问题二',
        header: '植物状态',
        multiSelect: true,
        options: [
          { label: 'C', description: 'c' },
          { label: 'D', description: 'd' }
        ]
      }
    ]
  )
})

test('续接令牌是绑定登录 Cookie 的不透明密文，伪造或跨会话不能读取', () => {
  const questions = sanitizeAskUserQuestions(input)
  const token = createAskResumeToken({
    sessionToken: 'session-cookie-a',
    sessionId: 'private-session',
    toolUseId: 'private-tool-id',
    questions,
    now: 1000
  })
  assert.equal(token.includes('private-session'), false)
  assert.equal(token.includes('private-tool-id'), false)
  assert.deepEqual(readAskResumeToken(token, 'session-cookie-a', 1000), {
    sessionId: 'private-session',
    toolUseId: 'private-tool-id',
    questions,
    expiresAt: 3601000
  })
  assert.equal(readAskResumeToken(token, 'session-cookie-b', 1000), null)
  assert.equal(readAskResumeToken(`${token}tampered`, 'session-cookie-a', 1000), null)
  assert.equal(readAskResumeToken(token, 'session-cookie-a', 3601001), null)
})

test('回答只能选择已展示选项，规范化后才可作为 tool_result', () => {
  const questions = sanitizeAskUserQuestions(input)
  assert.deepEqual(
    normalizeAskUserAnswers(questions, { answers: { '你的植物现在是什么状态？': '偏干' } }),
    { answers: { '你的植物现在是什么状态？': '偏干' } }
  )
  assert.deepEqual(
    normalizeAskUserAnswers(
      [
        {
          question: '哪些现象同时存在？',
          header: '现象',
          multiSelect: true,
          options: [
            { label: '叶片发黄', description: 'a' },
            { label: '盆土湿润', description: 'b' }
          ]
        }
      ],
      { answers: { '哪些现象同时存在？': ['叶片发黄', '盆土湿润'] } }
    ),
    { answers: { '哪些现象同时存在？': '叶片发黄, 盆土湿润' } }
  )
  assert.throws(
    () =>
      normalizeAskUserAnswers(questions, { answers: { '你的植物现在是什么状态？': '伪造选项' } }),
    /选项无效/
  )
  assert.throws(
    () => normalizeAskUserAnswers(questions, { answers: { 其他问题: '偏干' } }),
    /回答不完整/
  )
})

test('等待选择状态使用现有 agent_session_id 字段，不引入新表字段', () => {
  const marked = markPendingAskSession('private-session')
  assert.equal(isPendingAskSession(marked), true)
  assert.equal(getAgentSessionId(marked), 'private-session')
  assert.equal(isPendingAskSession('private-session'), false)

  const bound = markPendingAskSession('private-session', 'resume-a')
  assert.equal(getAgentSessionId(bound), 'private-session')
  assert.equal(getPendingAskTokenHash(bound), getAskResumeTokenHash('resume-a'))
  assert.notEqual(getPendingAskTokenHash(bound), getAskResumeTokenHash('resume-b'))
})
