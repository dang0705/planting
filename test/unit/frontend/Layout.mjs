import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

/* oxlint-disable no-console, no-magic-numbers -- source contract reports and simulates navigation edges. */

// 镜像契约：普通题包沿用既有入口策略；历史详情显式只回退当前页面栈。
// 其它页面仍保持既有 navigateBack 语义。
// 对应 src/Layout.vue -> test/unit/frontend/Layout.mjs

const repoRoot = process.cwd()
const layoutSource = fs.readFileSync(path.join(repoRoot, 'src/Layout.vue'), 'utf8')
const headerSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/common/Header.vue'),
  'utf8'
)

// 契约 1：活动题包的默认模式只在前页是诊断 Tab 时 navigateBack；其它栈回首页。
assert.match(
  layoutSource,
  /function goBack\(\) \{[\s\S]*?if \(props\.backMode === 'stack'\) \{[\s\S]*?navigateBackOrHome\(\{ fallbackToHome: false \}\)[\s\S]*?if \(isActiveQuestionPackagePage\(pages\)\) \{[\s\S]*?previousRoute === DIAGNOSIS_TAB_PAGE_ROUTE[\s\S]*?navigateBackOrHome\(\)[\s\S]*?goHome\(\)/,
  'goBack must support stack-only history detail navigation and retain the default question-package routing'
)

const goBackFunctionMatch = layoutSource.match(
  /function goBack\(\) \{[\s\S]*?\n\}\nfunction goHome/
)
assert.ok(goBackFunctionMatch, 'Layout must declare goBack before goHome')
const goBackSource = goBackFunctionMatch[0]
const goBackImplementation = goBackSource.replace(/\nfunction goHome$/, '')
const navigateBackFunctionMatch = layoutSource.match(
  /function navigateBackOrHome\(\{ fallbackToHome = true \} = \{\}\) \{[\s\S]*?\n\}/
)
assert.ok(navigateBackFunctionMatch, 'Layout must declare navigateBackOrHome')
const navigateBackImplementation = navigateBackFunctionMatch[0]

// 契约 2：题包返回不等待 complete 或 timeout。
assert.match(
  goBackSource,
  /if \(isActiveQuestionPackagePage\(pages\)\) \{[\s\S]*?previousRoute === DIAGNOSIS_TAB_PAGE_ROUTE[\s\S]*?navigateBackOrHome\(\)[\s\S]*?goHome\(\)\s*return/,
  'active question-package route must return to the diagnosis tab only for that direct route'
)
assert.doesNotMatch(
  goBackSource,
  /setTimeout|complete\s*:|questionPackageFallbackCheckPending/,
  'question-package route must not defer through callbacks or timers'
)

// 契约 3：其它返回路径保留 navigateBack 与既有 fail 诊断，不重定向。
assert.match(
  navigateBackFunctionMatch[0],
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

function invokeGoBack(pages, props = { backMode: 'auto' }, { failNavigateBack = false } = {}) {
  const calls = []
  const goBack = Function(
    'getCurrentPages',
    'uni',
    'props',
    `const QUESTION_PACKAGE_PAGE_ROUTE = 'subpackages/diagnosis/question-package';
const DIAGNOSIS_TAB_PAGE_ROUTE = 'pages/diagnose/diagnose';
const PREVIOUS_PAGE_OFFSET = 2;
${routePredicateMatch[0]}
${navigateBackImplementation}
${goBackImplementation}
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }
return goBack`
  )(
    () => pages,
    {
      switchTab: options => calls.push({ type: 'switchTab', options }),
      navigateBack: options => {
        calls.push({ type: 'navigateBack', options })
        if (failNavigateBack) {
          options.fail?.({ errMsg: 'navigateBack:fail simulated' })
        }
      }
    },
    props
  )
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
${navigateBackImplementation}
${goBackImplementation}
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }
goBack`,
    { uni, props: { backMode: 'auto' } }
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
assert.equal(
  invokeGoBack(
    [{ route: 'pages/garden/garden' }, { route: 'subpackages/diagnosis/question-package' }],
    { backMode: 'stack' }
  )[0]?.type,
  'navigateBack',
  'history detail stack mode must return to the garden page instead of switching home'
)
assert.deepEqual(
  invokeGoBack(
    [{ route: 'pages/garden/garden' }, { route: 'subpackages/diagnosis/question-package' }],
    { backMode: 'stack' },
    { failNavigateBack: true }
  ).map(call => call.type),
  ['navigateBack'],
  'history detail stack mode must not fallback to home when back fails'
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
  /function goHome\(\) \{[\s\S]*?uni\.switchTab\(\{[\s\S]*?url: '\/pages\/index\/index'/,
  'goHome must switchTab to the home page as the root fallback'
)

// 契约 5：leftAction === 'back' 时渲染带 id 和 @click="goBack" 的控件。
assert.match(
  headerSource,
  /v-else-if="leftAction === 'back'"[\s\S]*?:id="leftActionId"[\s\S]*?@click="emit\('back'\)"/,
  'back action must render the semantic id and bind goBack'
)

// 契约 6：leftActionId 默认 'layout-left-action'。
assert.match(
  headerSource,
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
assert.match(layoutSource, /:scroll-transition="headerScrollTransition"/u)
assert.match(layoutSource, /:scroll-transition-target="headerTransitionTarget"/u)
assert.match(headerSource, /uni\.createSelectorQuery/u)
assert.match(headerSource, /boundingClientRect/u)
assert.match(headerSource, /onPageScroll/u)
assert.match(headerSource, /bottom <= Number\(props\.scrollTransitionOffset/u)
assert.match(layoutSource, /platformNavigationChrome/u)
assert.match(layoutSource, /var\(--app-header-height\)/u)
assert.match(
  layoutSource,
  /paddingTop: props\.contentPaddingTop && renderAppHeader\.value \? 'var\(--app-header-height\)' : '0px'/u
)
assert.match(layoutStoreSource, /getCustomButtonBoundingClientRect/u)
assert.match(layoutStoreSource, /MP-TOUTIAO/u)

console.log('shared Layout platform-navigation contract passed')
