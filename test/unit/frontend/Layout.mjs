import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// 镜像契约：从诊断 Tab 进入题包时返回诊断 Tab；其它题包栈稳定回首页。
// 其它页面仍保持既有 navigateBack 语义。
// 对应 src/Layout.vue -> test/unit/frontend/Layout.mjs

const repoRoot = process.cwd()
const layoutSource = fs.readFileSync(path.join(repoRoot, 'src/Layout.vue'), 'utf8')

// 契约 1：活动题包只在前页是诊断 Tab 时 navigateBack；其它栈回首页。
assert.match(
  layoutSource,
  /function goBack\(\) \{[\s\S]*?const pages = typeof getCurrentPages === 'function' \? getCurrentPages\(\) : \[\][\s\S]*?if \(isActiveQuestionPackagePage\(pages\)\) \{[\s\S]*?previousRoute === DIAGNOSIS_TAB_PAGE_ROUTE[\s\S]*?uni\.navigateBack\([\s\S]*?goHome\(\)/,
  'goBack must distinguish the diagnosis-tab return path from other question-package stacks'
)

const goBackFunctionMatch = layoutSource.match(
  /function goBack\(\) \{[\s\S]*?\n\}\nfunction goHome/
)
assert.ok(goBackFunctionMatch, 'Layout must declare goBack before goHome')
const goBackSource = goBackFunctionMatch[0]
const goBackImplementation = goBackSource.replace(/\nfunction goHome$/, '')

// 契约 2：题包返回不等待 complete 或 timeout。
assert.match(
  goBackSource,
  /if \(isActiveQuestionPackagePage\(pages\)\) \{[\s\S]*?previousRoute === DIAGNOSIS_TAB_PAGE_ROUTE[\s\S]*?uni\.navigateBack\([\s\S]*?goHome\(\)\s*return/,
  'active question-package route must return to the diagnosis tab only for that direct route'
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
const DIAGNOSIS_TAB_PAGE_ROUTE = 'pages/diagnose/diagnose';
const PREVIOUS_PAGE_OFFSET = 2;
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
const DIAGNOSIS_TAB_PAGE_ROUTE = 'pages/diagnose/diagnose';
const PREVIOUS_PAGE_OFFSET = 2;
${routePredicateMatch[0]}
${goBackImplementation}
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }
goBack`,
    { uni }
  )
  goBack()
  return calls
}

assert.equal(
  invokeGoBack(diagnoseQuestionStack)[0]?.type,
  'navigateBack',
  'diagnose stack must return to the diagnosis tab through navigateBack'
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

const platformCapabilitiesSource = fs.readFileSync(
  path.join(repoRoot, 'src/utils/platform-capabilities.js'),
  'utf8'
)
const layoutStoreSource = fs.readFileSync(path.join(repoRoot, 'src/store/layout.js'), 'utf8')

// data_mode=unit_fake; test_kind=source_contract。抖音真机顶部导航重叠仍需端上截图验收。
assert.match(platformCapabilitiesSource, /usesPlatformNavigationChrome/u)
assert.match(layoutSource, /v-if="renderAppHeader"/u)
assert.match(layoutSource, /platformNavigationChrome/u)
assert.match(layoutSource, /var\(--app-header-height\)/u)
assert.match(
  layoutSource,
  /paddingTop: props\.contentPaddingTop && renderAppHeader\.value \? 'var\(--app-header-height\)' : '0px'/u
)
assert.match(layoutStoreSource, /getCustomButtonBoundingClientRect/u)
assert.match(layoutStoreSource, /MP-TOUTIAO/u)

console.log('shared Layout platform-navigation contract passed')
