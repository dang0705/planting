// data_mode=unit_fake; test_kind=source_contract: 验证 GPT 风格流式状态的页面结构，不替代真实端上交互验收。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/agent-h5/pages/chat/chat.vue'), 'utf8')
const layoutStyles = readFileSync(
  resolve(process.cwd(), 'src/agent-h5/pages/chat/chat-layout.css'),
  'utf8'
)
const composerStyles = readFileSync(
  resolve(process.cwd(), 'src/agent-h5/pages/chat/chat-composer.css'),
  'utf8'
)

describe('小青 GPT 风格聊天布局契约', () => {
  it('在思考和持续输出期间保留稳定的助手状态结构', () => {
    expect(source).toContain('agent-message-assistant')
    expect(source).toContain('agent-thinking')
    expect(source).toContain('agent-streaming-caret')
    expect(source).toContain('agent-composer-message--active')
    expect(source).toContain('isStreamingMessage')
  })

  it('保留三个思考点的错峰动画和输出光标闪烁', () => {
    expect(source.match(/class="agent-thinking-dot"/g)).toHaveLength(3)
    expect(layoutStyles).toContain('animation: agent-thinking-pulse 1.1s ease-in-out infinite')
    expect(layoutStyles).toContain('animation-delay: 0.14s')
    expect(layoutStyles).toContain('animation-delay: 0.28s')
    expect(layoutStyles).toContain('animation: agent-caret-blink 0.9s step-end infinite')
    expect(composerStyles).toContain('@keyframes agent-thinking-pulse')
    expect(composerStyles).toContain('@keyframes agent-caret-blink')
    expect(composerStyles).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
