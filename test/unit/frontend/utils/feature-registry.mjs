// data_mode=unit_fake; test_kind=source_contract. Invalid feature keys must not create a generic modal.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('src/utils/feature-registry.js', 'utf8')

assert.match(
  source,
  /function openFeatureUnavailable\(featureKey\) \{[\s\S]{0,220}if \(!FEATURE_UNAVAILABLE_MESSAGES\[normalizedFeatureKey\]\) \{[\s\S]{0,80}return/u,
  '未知 feature key 不得打开通用“功能未开放”弹窗'
)

console.log('feature registry invalid-key guard contract passed data_mode=unit_fake')
