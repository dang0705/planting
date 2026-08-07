#!/usr/bin/env node
'use strict'

import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  NATIVE_TABBAR_CHANNEL,
  NativeTabNavigationError,
  navigateNativeTab,
  nativeTabNavigationDetails,
  normalizeNativeTabPath
} from '../../../automator/diagnosis/_shared/native-tab-navigation.mjs'
import { switchTabHomeBeforeFixture } from '../../../automator/diagnosis/_shared/home-entry-readiness.mjs'
import { executionBundleFingerprint } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/execution-bundle.mjs'

assert.equal(normalizeNativeTabPath('/pages/index/index'), 'pages/index/index')
assert.equal(normalizeNativeTabPath('pages/index/index'), 'pages/index/index')
assert.throws(() => normalizeNativeTabPath('//pages/index/index'), /at most one leading slash/)
assert.deepEqual(nativeTabNavigationDetails('/pages/index/index'), {
  expectedRoute: 'pages/index/index',
  navigation_channel: 'native_tabbar',
  native_tab_path: 'pages/index/index',
  operationChannel: 'Native.switchTab'
})

let clock = 0
const calls = []
let directSwitchTabCalls = 0
const wrongPage = { path: 'pages/calendar/calendar' }
const homePage = { path: 'pages/index/index' }
const pages = [wrongPage, homePage]
const returnedHome = await navigateNativeTab({
  mp: {
    switchTab: async () => {
      directSwitchTabCalls += 1
    },
    native: () => ({ switchTab: async payload => calls.push(payload) }),
    currentPage: async () => pages.shift() ?? homePage
  },
  logicalPath: '/pages/index/index',
  timeoutMs: 100,
  pollIntervalMs: 10,
  now: () => clock,
  sleep: async ms => {
    clock += ms
  }
})
assert.equal(returnedHome, homePage)
assert.deepEqual(calls, [{ url: 'pages/index/index' }])
assert.equal(directSwitchTabCalls, 0)

clock = 0
const wrongRouteCalls = []
await assert.rejects(
  navigateNativeTab({
    mp: {
      native: () => ({ switchTab: async payload => wrongRouteCalls.push(payload) }),
      currentPage: async () => wrongPage
    },
    logicalPath: '/pages/index/index',
    timeoutMs: 20,
    pollIntervalMs: 10,
    now: () => clock,
    sleep: async ms => {
      clock += ms
    }
  }),
  error => {
    assert.ok(error instanceof NativeTabNavigationError)
    assert.equal(error.code, 'native_tabbar_route_timeout')
    assert.deepEqual(error.details, {
      expectedRoute: 'pages/index/index',
      navigation_channel: NATIVE_TABBAR_CHANNEL,
      native_tab_path: 'pages/index/index',
      operationChannel: 'Native.switchTab',
      observedRoute: 'pages/calendar/calendar'
    })
    return true
  }
)
assert.deepEqual(wrongRouteCalls, [{ url: 'pages/index/index' }])

const failedHomeReport = { pageDataSummaries: [], assertions: [] }
const failedHome = await switchTabHomeBeforeFixture({
  mp: { currentPage: async () => null },
  report: failedHomeReport,
  switchTab: async () => {
    throw new NativeTabNavigationError('native_tabbar_route_timeout', {
      expectedRoute: 'pages/index/index',
      observedRoute: 'pages/calendar/calendar',
      navigation_channel: NATIVE_TABBAR_CHANNEL
    })
  },
  installFixture: async () => {
    throw new Error('fixture must not install after native tab failure')
  },
  markFixtureAttempted: () => {
    throw new Error('fixture attempt must not start after native tab failure')
  }
})
assert.equal(failedHome.fixturePlant, null)
assert.equal(failedHomeReport.classification, 'BLOCKED_ENV')
assert.equal(
  failedHomeReport.pageDataSummaries[0].summary.automatorBootstrapRoute.navigation_channel,
  NATIVE_TABBAR_CHANNEL
)
assert.doesNotThrow(() => JSON.stringify(failedHomeReport))

const leafPaths = [
  'test/e2e/automator/diagnosis/air-environment-v2-question-packages.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake.mjs'
]
for (const leafPath of leafPaths) {
  const bundle = executionBundleFingerprint(leafPath)
  assert.ok(
    bundle.files.includes('test/e2e/automator/diagnosis/_shared/native-tab-navigation.mjs'),
    `${leafPath} must execute through the native tab adapter`
  )
  for (const file of bundle.files) {
    const source = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /\b(?:mp|miniProgram)\.switchTab\s*\(/)
  }
}
const homeReadinessSource = fs.readFileSync(
  'test/e2e/automator/diagnosis/_shared/home-entry-readiness.mjs',
  'utf8'
)
assert.match(homeReadinessSource, /navigation_channel: 'native_tabbar'/)
assert.match(homeReadinessSource, /native_tab_path: INDEX_HOME_ROUTE/)

console.log('automator native tab navigation contract passed')
