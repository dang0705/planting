import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// 镜像契约：题包的用户可见返回必须稳定回到首页，供同一植物重新进入诊断。
// 其它页面仍保持既有 navigateBack 语义。
// 对应 src/Layout.vue -> test/unit/frontend/Layout.mjs

const repoRoot = process.cwd()
const layoutSource = fs.readFileSync(path.join(repoRoot, 'src/Layout.vue'), 'utf8')

// 契约 1：活动题包不依赖前一页栈形状，始终先回首页；其它多页栈 navigateBack。
assert.match(
  layoutSource,
  /function goBack\(\) \{[\s\S]*?const pages = typeof getCurrentPages === 'function' \? getCurrentPages\(\) : \[\][\s\S]*?if \(isActiveQuestionPackagePage\(pages\)\) \{\s*goHome\(\)\s*return\s*\}[\s\S]*?if \(pages\.length > 1\) \{[\s\S]*?uni\.navigateBack\(/,
  'goBack must return any active question-package route to home before navigateBack is considered'
)

const goBackFunctionMatch = layoutSource.match(
  /function goBack\(\) \{[\s\S]*?\n\}\nfunction goHome/
)
assert.ok(goBackFunctionMatch, 'Layout must declare goBack before goHome')
const goBackSource = goBackFunctionMatch[0]
const goBackImplementation = goBackSource.replace(/\nfunction goHome$/, '')

// 契约 2：题包返回不等待 navigateBack、complete 或 timeout。
assert.match(
  goBackSource,
  /if \(isActiveQuestionPackagePage\(pages\)\) \{\s*goHome\(\)\s*return\s*\}[\s\S]*?uni\.navigateBack\(/,
  'active question-package route must switch to home before navigateBack is considered'
)
assert.doesNotMatch(
  goBackSource,
  /setTimeout|complete\s*:|questionPackageFallbackCheckPending/,
  'question-package route must not defer through callbacks or timers'
)

// 契约 3：其它返回路径保留 navigateBack 与既有 fail 诊断，不重定向。
assert.match(
  goBackSource,
  /fail: error => \{[\s\S]*?console\.warn\('\[Layout\.goBack\] navigateBack failed/,
  'navigateBack fail handler must log a warning for diagnostics'
)

const routePredicateMatch = layoutSource.match(
  /function isActiveQuestionPackagePage\(pages\) \{[\s\S]*?\n\}/
)
assert.ok(routePredicateMatch, 'Layout must declare the active question-package route predicate')
const isActiveQuestionPackagePage = Function(
  `const QUESTION_PACKAGE_PAGE_ROUTE = 'subpackages/diagnosis/question-package';
${routePredicateMatch[0]}; return isActiveQuestionPackagePage`
)()

const diagnoseQuestionStack = [
  { route: 'pages/diagnose/diagnose' },
  { route: 'subpackages/diagnosis/question-package' }
]
assert.equal(
  isActiveQuestionPackagePage(diagnoseQuestionStack),
  true,
  'diagnose -> question-package stack must return through the homepage'
)
assert.equal(
  isActiveQuestionPackagePage([{ route: 'pages/diagnose/diagnose' }]),
  false,
  'non-question routes must not use the question-package redirect'
)
assert.equal(
  isActiveQuestionPackagePage([
    { route: 'pages/index/index' },
    { route: 'subpackages/diagnosis/question-package' }
  ]),
  true,
  'question-package must return home even when its previous page is not the diagnose tab'
)
assert.equal(
  isActiveQuestionPackagePage([{ route: 'subpackages/diagnosis/question-package' }]),
  true,
  'single-page question-package must also return home rather than rely on navigateBack'
)

function invokeGoBack(pages) {
  const calls = []
  const goBack = Function(
    'getCurrentPages',
    'uni',
    `const QUESTION_PACKAGE_PAGE_ROUTE = 'subpackages/diagnosis/question-package';
${routePredicateMatch[0]}
${goBackImplementation}
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }
return goBack`
  )(() => pages, {
    switchTab: options => calls.push({ type: 'switchTab', options }),
    navigateBack: options => calls.push({ type: 'navigateBack', options })
  })
  goBack()
  return calls
}

function invokeGoBackWithoutRuntimeGlobal() {
  const calls = []
  const uni = {
    switchTab: options => calls.push({ type: 'switchTab', options }),
    navigateBack: options => calls.push({ type: 'navigateBack', options })
  }
  const goBack = vm.runInNewContext(
    `const QUESTION_PACKAGE_PAGE_ROUTE = 'subpackages/diagnosis/question-package';
${routePredicateMatch[0]}
${goBackImplementation}
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }
goBack`,
    { uni }
  )
  goBack()
  return calls
}

assert.deepEqual(
  invokeGoBack(diagnoseQuestionStack),
  [{ type: 'switchTab', options: { url: '/pages/index/index' } }],
  'diagnose stack must switch home without navigateBack'
)
assert.equal(
  invokeGoBack([{ route: 'pages/index/index' }, { route: 'pages/diagnose/diagnose' }])[0]?.type,
  'navigateBack',
  'normal back stack must retain navigateBack and not redirect to diagnose'
)
assert.equal(
  invokeGoBack([
    { route: 'pages/index/index' },
    { route: 'subpackages/diagnosis/question-package' }
  ])[0]?.type,
  'switchTab',
  'question-package with another prior page must return home rather than rely on navigateBack'
)
assert.deepEqual(
  invokeGoBack([{ route: 'subpackages/diagnosis/question-package' }]),
  [{ type: 'switchTab', options: { url: '/pages/index/index' } }],
  'single question-package page must switch home for reliable diagnosis re-entry'
)
assert.equal(
  invokeGoBack([{ route: 'pages/index/index' }, { route: 'pages/plant/detail' }])[0]?.type,
  'navigateBack',
  'ordinary non-question pages must retain navigateBack'
)
assert.doesNotThrow(
  () => invokeGoBackWithoutRuntimeGlobal(),
  'goBack must not read an unbound getCurrentPages identifier'
)
assert.deepEqual(
  invokeGoBackWithoutRuntimeGlobal().map(call => ({ type: call.type, url: call.options?.url })),
  [{ type: 'switchTab', url: '/pages/index/index' }],
  'missing getCurrentPages must use the empty stack and switch home'
)

// 契约 4：pages.length <= 1 时走 goHome，switchTab 到首页。
assert.match(
  layoutSource,
  /function goHome\(\) \{[\s\S]*?uni\.switchTab\(\{ url: '\/pages\/index\/index' \}\)/,
  'goHome must switchTab to the home page as the root fallback'
)

// 契约 5：leftAction === 'back' 时渲染带 id 和 @click="goBack" 的控件。
assert.match(
  layoutSource,
  /v-if="leftAction === 'back'"[\s\S]*?:id="leftActionId"[\s\S]*?@click="goBack"/,
  'back action must render the semantic id and bind goBack'
)

// 契约 6：leftActionId 默认 'layout-left-action'。
assert.match(
  layoutSource,
  /leftActionId: \{ type: String, default: 'layout-left-action' \}/,
  'leftActionId must default to layout-left-action'
)

console.log('Layout goBack navigation contract tests passed')
