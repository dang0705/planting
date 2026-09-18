// data_mode=unit_fake: Markdown is rendered locally; no network or model call is needed.
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../../../src/agent-h5/markdown.js'

describe('小青 Markdown 渲染', () => {
  it('转换常用 Markdown 语法为可阅读 HTML', () => {
    const html = renderMarkdown(
      '# 养护建议\n\n**检查** *盆土*\n\n- 光照\n- 浇水\n\n[查看详情](https://example.com)\n\n`npm test`\n\n```js\nconst ok = true\n```'
    )
    expect(html).toContain('<h1>养护建议</h1>')
    expect(html).toContain('<strong>检查</strong>')
    expect(html).toContain('<em>盆土</em>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<a href="https://example.com">查看详情</a>')
    expect(html).toContain('<code>npm test</code>')
    expect(html).toContain('<pre><code class="language-js">')
    expect(html).toContain('const ok = true')
  })

  it('不信任模型原始 HTML 或危险链接', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><img src=x onerror="alert(2)">\n\n[危险](javascript:alert(3))'
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })
})
