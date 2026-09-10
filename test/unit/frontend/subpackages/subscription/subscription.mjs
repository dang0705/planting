/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, 'src/subpackages/subscription/subscription.vue')
const source = fs.readFileSync(sourcePath, 'utf8')
const pages = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/pages.json'), 'utf8'))

const subscriptionPackage = pages.subPackages?.find(
  item => item.root === 'subpackages/subscription'
)
assert.ok(subscriptionPackage, 'subscription page must be registered as a subpackage')
assert.deepEqual(
  subscriptionPackage.pages?.map(page => page.path),
  ['subscription']
)
assert.match(source, /id="subscription-page"/u)
assert.match(source, /fetchSubscriptionPlans/u)
assert.match(source, /createSubscriptionOrder/u)
assert.match(source, /fetchSubscriptionOrder/u)
assert.match(source, /uni\.requestPayment/u)
assert.match(source, /provider: 'wxpay'/u)
assert.match(source, /waitForPaidOrder/u)
assert.match(source, /confirmedOrder\?\.status === 'paid'/u)
assert.match(source, /refreshUserInfo/u)
assert.match(source, /subscription-plans-error/u)
assert.match(source, /subscription-plans-retry-button/u)
assert.match(source, /subscription-payment-status-text/u)
assert.match(source, /subscription-refresh-order-button/u)
assert.match(source, /@click\.stop="startPayment\(plan\)"/u)
assert.match(source, /不自动续费/u)
assert.match(source, /isPlanPayable\(plan\)/u)
assert.match(source, /免费/u)
assert.match(source, /requestIds\.delete\(order\?\.planId\)/u)
assert.doesNotMatch(source, /amountFen\s*:/u)

console.log('subscription page source contract passed data_mode=unit_fake')
