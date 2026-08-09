import assert from 'node:assert/strict'

const {
  AIR_EXCHANGE_SOURCES,
  WINDOW_DIRECTION_COUNT_OPTIONS,
  WINDOW_OPEN_FREQUENCY_OPTIONS,
  createInitialAirExchangeInput,
  isAirExchangeAnswerReady,
  resolveAirExchangeEvidence
} = await import('../../../../src/utils/air-exchange-evidence.js')

// 1. 初始状态是“尚未回答”，不是“不确定”
const initial = createInitialAirExchangeInput()
assert.deepEqual(initial, { source: null, windowDirectionCount: null, windowOpenFrequency: null })
assert.equal(isAirExchangeAnswerReady(initial), false, 'initial state must not be ready')
assert.equal(resolveAirExchangeEvidence(initial), null, 'initial must resolve to null')

// 2. 开窗需两个补充项；缺任一不可完成
assert.equal(isAirExchangeAnswerReady({ source: 'window' }), false)
assert.equal(isAirExchangeAnswerReady({ source: 'window', windowDirectionCount: 'one' }), false)
assert.equal(isAirExchangeAnswerReady({ source: 'window', windowOpenFrequency: 'daily' }), false)
assert.equal(
  isAirExchangeAnswerReady({
    source: 'window',
    windowDirectionCount: 'one',
    windowOpenFrequency: 'daily'
  }),
  true
)

// 3. 历史关闭窗户值、fresh_air、unknown 均可完成；新界面不再产生前两者之外的换气类别
assert.equal(
  isAirExchangeAnswerReady({ source: 'window', windowDirectionCount: 'closed' }),
  true,
  'no-window should be ready alone'
)
for (const source of ['fresh_air', 'unknown']) {
  assert.equal(isAirExchangeAnswerReady({ source }), true, `${source} should be ready alone`)
}

// 4. unknown 返回 level=unknown，不得被当成关闭窗户；
//    非 window 来源保留三个原始字段，两个开窗字段为 null
assert.deepEqual(resolveAirExchangeEvidence({ source: 'unknown' }), {
  source: 'unknown',
  windowDirectionCount: null,
  windowOpenFrequency: null,
  level: 'unknown'
})

// 5. 双方向+每天为 high
assert.deepEqual(
  resolveAirExchangeEvidence({
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'daily'
  }),
  {
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'daily',
    level: 'high'
  }
)

// 6. 单方向+每天为 medium
assert.deepEqual(
  resolveAirExchangeEvidence({
    source: 'window',
    windowDirectionCount: 'one',
    windowOpenFrequency: 'daily'
  }),
  { source: 'window', windowDirectionCount: 'one', windowOpenFrequency: 'daily', level: 'medium' }
)

// 7. 任意方向+隔天为 medium（单方向隔天 / 双方向隔天）
assert.deepEqual(
  resolveAirExchangeEvidence({
    source: 'window',
    windowDirectionCount: 'one',
    windowOpenFrequency: 'every_other_day'
  }),
  {
    source: 'window',
    windowDirectionCount: 'one',
    windowOpenFrequency: 'every_other_day',
    level: 'medium'
  }
)
assert.deepEqual(
  resolveAirExchangeEvidence({
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'every_other_day'
  }),
  {
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'every_other_day',
    level: 'medium'
  }
)

// 8. 每周 1–2 次、几乎不开为 low（单方向 / 双方向均 low）
assert.deepEqual(
  resolveAirExchangeEvidence({
    source: 'window',
    windowDirectionCount: 'one',
    windowOpenFrequency: 'weekly_1_2'
  }),
  { source: 'window', windowDirectionCount: 'one', windowOpenFrequency: 'weekly_1_2', level: 'low' }
)
assert.deepEqual(
  resolveAirExchangeEvidence({
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'weekly_1_2'
  }),
  {
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'weekly_1_2',
    level: 'low'
  }
)
assert.deepEqual(
  resolveAirExchangeEvidence({
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'almost_never'
  }),
  {
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'almost_never',
    level: 'low'
  }
)

// 9. fresh_air 为 medium；不得产生出风口或直吹字段；两个开窗字段为 null
const freshAirResult = resolveAirExchangeEvidence({ source: 'fresh_air' })
assert.deepEqual(freshAirResult, {
  source: 'fresh_air',
  windowDirectionCount: null,
  windowOpenFrequency: null,
  level: 'medium'
})
assert.equal('draftRisk' in freshAirResult, false, 'must not include draftRisk')
assert.equal('directDraft' in freshAirResult, false, 'must not include directDraft')
assert.equal('outlet' in freshAirResult, false, 'must not include outlet field')

// 10. 历史关闭窗户值迁移为“一个方向 + 几乎不开”
assert.deepEqual(
  resolveAirExchangeEvidence({
    source: 'window',
    windowDirectionCount: 'closed',
    windowOpenFrequency: 'daily'
  }),
  {
    source: 'window',
    windowDirectionCount: 'one',
    windowOpenFrequency: 'almost_never',
    level: 'low'
  }
)

// 11. 开窗信息不完整返回 null
assert.equal(resolveAirExchangeEvidence({ source: 'window', windowDirectionCount: 'one' }), null)
assert.equal(resolveAirExchangeEvidence({ source: 'window' }), null)

// 12. 非法 source 视为未答（纯函数只接受组件产生的闭集值）
assert.equal(isAirExchangeAnswerReady({ source: 'closed_or_none' }), false)
assert.equal(isAirExchangeAnswerReady({ source: 'bogus' }), false)
assert.equal(resolveAirExchangeEvidence({ source: 'closed_or_none' }), null)
assert.equal(resolveAirExchangeEvidence({ source: 'bogus' }), null)

// 13. 非 window 来源的残留开窗字段不影响判定：输出固定把两个开窗字段置 null
assert.deepEqual(
  resolveAirExchangeEvidence({
    source: 'fresh_air',
    windowDirectionCount: 'one',
    windowOpenFrequency: 'daily'
  }),
  { source: 'fresh_air', windowDirectionCount: null, windowOpenFrequency: null, level: 'medium' }
)

// 14. 新换气来源选项只有窗户与新风；unknown 仅保留历史数据兼容
const sourceKeys = AIR_EXCHANGE_SOURCES.map(item => item.key)
assert.deepEqual(sourceKeys, ['window', 'fresh_air'])
assert.equal(new Set(sourceKeys).size, 2)

// 15. 开窗方向 / 频率选项 key 固定（对齐 automation id policy 3.13）
assert.deepEqual(
  WINDOW_DIRECTION_COUNT_OPTIONS.map(item => item.key),
  ['one', 'two_or_more']
)
assert.deepEqual(
  WINDOW_OPEN_FREQUENCY_OPTIONS.map(item => item.key),
  ['daily', 'every_other_day', 'weekly_1_2', 'almost_never']
)
assert.equal(
  WINDOW_OPEN_FREQUENCY_OPTIONS.find(item => item.key === 'almost_never')?.label,
  '几乎不开（可选新风系统）'
)

// 16. 输出对象不得出现 version / confidence / score / evidence / draft / outlet / fan / AC
const windowResult = resolveAirExchangeEvidence({
  source: 'window',
  windowDirectionCount: 'two_or_more',
  windowOpenFrequency: 'daily'
})
const forbiddenKeys = ['version', 'confidence', 'score', 'evidence', 'draft', 'outlet', 'fan', 'AC']
for (const key of forbiddenKeys) {
  assert.equal(key in windowResult, false, `output must not include ${key}`)
}

console.log('air exchange evidence tests passed')
