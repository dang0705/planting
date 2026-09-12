/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const source = fs.readFileSync(path.join(repoRoot, 'src/pages/profile/profile.vue'), 'utf8')

assert.match(source, /profile-menu-\$\{item\.action\}/)
assert.match(source, /id="profile-subscription-entry"/)
assert.match(source, /openSubscriptionPage/)
assert.match(source, /return '免费账户'/)
assert.match(source, /return '升级后可用'/)
assert.match(source, /title: '我的植物'/)
assert.match(source, /url: '\/pages\/index\/index'/)
assert.doesNotMatch(source, /pages\/calendar\/calendar/)
assert.doesNotMatch(source, /pages\/reminder\/reminder/)
assert.doesNotMatch(source, /subpackages\/review\//)
assert.doesNotMatch(source, /功能开发中|支付功能开发中|立即开通会员/)
assert.doesNotMatch(source, /profile-diagnose-history-view-all|viewAllHistory/)
assert.match(source, /id="profile-diagnose-history-retry"/)
assert.match(source, /@click="loadDiagnoseHistory"/)
assert.match(source, /import \{ onShow \} from '@dcloudio\/uni-app'/)
assert.match(source, /onShow\(\(\) => \{[\s\S]*loadDiagnoseHistory\(\)/)
assert.match(source, /diagnoseHistory\.value = \[\]/)
assert.match(source, /loadingHistory\.value\)/)
assert.match(source, /historyError\.value = '暂时无法加载诊断记录，请检查网络后重试。'/)
assert.match(source, /import \{ parsePlantDateTime \} from '@\/utils\/plant-datetime\.js'/)
assert.match(source, /const date = parsePlantDateTime\(time\)/)
assert.match(source, /return '时间未知'/)
assert.ok(
  source.indexOf('v-if="historyError"') < source.indexOf('还没有诊断记录'),
  '历史请求失败时必须优先展示可重试错误态，不能误展示为空态'
)

console.log('profile MVP boundary source contract passed data_mode=unit_fake')
