import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const tailwindConfigPath = new URL('../../../../tailwind.config.js', import.meta.url)
const wxssPath = new URL('../../../../dist/build/mp-weixin/app.wxss', import.meta.url)

const [tailwindConfig, wxss] = await Promise.all([
  readFile(tailwindConfigPath, 'utf8'),
  readFile(wxssPath, 'utf8')
])

assert.equal(
  /primary:\s*['"]#2d7a4f['"]/.test(tailwindConfig),
  true,
  'Tailwind primary must remain the #2d7a4f brand color without a CSS delimiter'
)
assert.equal(
  tailwindConfig.includes("primary: '#2d7a4f;'"),
  false,
  'Tailwind primary must not include a trailing semicolon'
)
assert.equal(
  wxss.includes('#2d7a4f;;'),
  false,
  'built WXSS must not emit an invalid double semicolon for primary'
)
assert.equal(
  wxss.includes('--primary-color: #2d7a4f;'),
  true,
  'built WXSS must retain the primary brand color'
)
