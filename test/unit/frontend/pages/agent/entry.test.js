// data_mode=unit_fake; Expected: approved H5 entry uses single-use ticket, never platform token.
import { it, expect, vi } from 'vitest'
import {
  buildAgentEntryUrl,
  requestAgentEntryTicket
} from '../../../../../src/pages/agent/entry.js'
it('票据只放 URL fragment，不进入请求查询串', () => {
  const url = buildAgentEntryUrl('https://example.com', 'a'.repeat(43))
  expect(url).toBe(
    `https://example.com/agent-http/agent/index.html#/pages/chat/chat?ticket=${'a'.repeat(43)}`
  )
  expect(new URL(url).search).toBe('')
})
it('非法或长期登录凭证不能当作入场票据', () => {
  expect(() => buildAgentEntryUrl('https://example.com', 'planting-session-v1_token')).toThrow()
})

it('ticket 临时失败时只重试一次并使用第二次成功结果', async () => {
  const ticket = 'a'.repeat(43)
  const requestTicket = vi
    .fn()
    .mockResolvedValueOnce({ statusCode: 503, data: { message: '暂时不可用' } })
    .mockResolvedValueOnce({ statusCode: 200, data: { code: 0, data: { ticket } } })

  await expect(requestAgentEntryTicket(requestTicket, { wait: async () => {} })).resolves.toBe(
    ticket
  )
  expect(requestTicket).toHaveBeenCalledTimes(2)
})

it('ticket 身份失败不重试', async () => {
  const requestTicket = vi.fn().mockResolvedValue({ statusCode: 401, data: {} })

  await expect(
    requestAgentEntryTicket(requestTicket, { wait: async () => {} })
  ).rejects.toThrow('connection')
  expect(requestTicket).toHaveBeenCalledTimes(1)
})
