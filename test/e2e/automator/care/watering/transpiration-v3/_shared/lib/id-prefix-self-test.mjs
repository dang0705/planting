'use strict'

/**
 * E2E 元素定位自检 —— 构建后 ID 前缀兼容。
 *
 * 覆盖真实构建 ID 示例：
 *   - 55d0b8b0--watering-advisor-search-input
 *   - 55d0b8b0--watering-advisor-next-button
 *   - 55d0b8b0--watering-advisor-plant-item-plant_identity_7813b7834285a361
 *   - 21583637--pot-profile-editor-sheet
 *
 * 用 mock page 对象模拟 miniprogram-automator 的 page.$ / page.$$ / element.attribute，
 * 验证运行时定位逻辑（非源码字符串检查）能正确识别带构建前缀的稳定 ID。
 *
 * 运行: node test/e2e/automator/care/watering/transpiration-v3/_shared/lib/id-prefix-self-test.mjs
 */

import assert from 'node:assert'
import {
  matchesStableId,
  matchesStableIdPrefix,
  extractStableId,
  findViewById,
  findByIdPrefix,
  findByIdPrefixAndSuffix,
  collectByIdPrefix
} from './element-helpers.mjs'

let passCount = 0
let failCount = 0

function check(name, actual, expected) {
  try {
    assert.strictEqual(actual, expected, `${name}: expected ${expected}, got ${actual}`)
    passCount++
  } catch (e) {
    failCount++
    console.error(`FAIL: ${name}`)
    console.error(`  ${e.message}`)
  }
}

/**
 * 创建 mock page，模拟 automator 的 page.$ / page.$$ / element.attribute。
 * @param {Array<{tag: string, id: string}>} elements 元素列表
 */
function createMockPage(elements) {
  const elMap = new Map()
  for (const e of elements) {
    const key = `${e.tag}::${e.id}`
    const elObj = {
      _id: e.id,
      async attribute(name) {
        if (name === 'id') return this._id
        return null
      },
      async tap() {},
      async input() {},
      async text() {
        return `text-${this._id}`
      },
      async $$(selector) {
        return []
      }
    }
    elMap.set(key, elObj)
  }

  return {
    async $(selector) {
      // #id 形式：精确 ID 选择器
      if (selector.startsWith('#')) {
        const id = selector.slice(1)
        for (const [, el] of elMap) {
          if (el._id === id) return el
        }
        return null
      }
      return null
    },
    async $$(selector) {
      const results = []
      for (const e of elements) {
        if (e.tag === selector) {
          const key = `${e.tag}::${e.id}`
          results.push(elMap.get(key))
        }
      }
      return results
    }
  }
}

function testMatchesStableId() {
  // 精确匹配
  check(
    'matchesStableId exact',
    matchesStableId('watering-advisor-search-input', 'watering-advisor-search-input'),
    true
  )
  // 构建前缀匹配
  check(
    'matchesStableId prefix 55d0b8b0',
    matchesStableId('55d0b8b0--watering-advisor-search-input', 'watering-advisor-search-input'),
    true
  )
  check(
    'matchesStableId prefix 21583637',
    matchesStableId('21583637--pot-profile-editor-sheet', 'pot-profile-editor-sheet'),
    true
  )
  // 不匹配：前缀含非法字符（中划线之外的）
  check(
    'matchesStableId bad prefix with dash',
    matchesStableId('ab-cd--watering-advisor-search-input', 'watering-advisor-search-input'),
    false
  )
  // 不匹配：稳定 ID 不完全相等
  check(
    'matchesStableId partial',
    matchesStableId('55d0b8b0--watering-advisor-search', 'watering-advisor-search-input'),
    false
  )
  // 不匹配：null/undefined
  check('matchesStableId null', matchesStableId(null, 'x'), false)
  check('matchesStableId undefined', matchesStableId(undefined, 'x'), false)
}

function testMatchesStableIdPrefix() {
  check(
    'matchesStableIdPrefix exact start',
    matchesStableIdPrefix('plant-card-reminder-abc-water', 'plant-card-reminder-'),
    true
  )
  check(
    'matchesStableIdPrefix built start',
    matchesStableIdPrefix('55d0b8b0--plant-card-reminder-abc-water', 'plant-card-reminder-'),
    true
  )
  check(
    'matchesStableIdPrefix built no suffix',
    matchesStableIdPrefix('55d0b8b0--plant-card-reminder-', 'plant-card-reminder-'),
    true
  )
  check(
    'matchesStableIdPrefix wrong',
    matchesStableIdPrefix('watering-advisor-search', 'plant-card-reminder-'),
    false
  )
}

function testExtractStableId() {
  check(
    'extractStableId plain',
    extractStableId('watering-advisor-search-input'),
    'watering-advisor-search-input'
  )
  check(
    'extractStableId prefixed',
    extractStableId('55d0b8b0--watering-advisor-search-input'),
    'watering-advisor-search-input'
  )
  check(
    'extractStableId prefixed2',
    extractStableId('21583637--pot-profile-editor-sheet'),
    'pot-profile-editor-sheet'
  )
  check('extractStableId null', extractStableId(null), null)
}

async function testFindViewById() {
  // 构建前缀场景：page.$('#id') 返回 null（因为实际 ID 带前缀），但遍历能匹配
  const page = createMockPage([
    { tag: 'view', id: '55d0b8b0--watering-advisor-search-input' },
    { tag: 'button', id: '55d0b8b0--watering-advisor-next-button' },
    { tag: 'view', id: '21583637--pot-profile-editor-sheet' }
  ])

  const searchEl = await findViewById(page, 'watering-advisor-search-input')
  check('findViewById built-prefix search', !!searchEl, true)

  const nextEl = await findViewById(page, 'watering-advisor-next-button')
  check('findViewById built-prefix next', !!nextEl, true)

  const sheetEl = await findViewById(page, 'pot-profile-editor-sheet')
  check('findViewById built-prefix sheet', !!sheetEl, true)

  const missingEl = await findViewById(page, 'nonexistent-id')
  check('findViewById missing', missingEl, null)
}

async function testFindByIdPrefix() {
  // plant-item-plant_identity_7813b7834285a361 带构建前缀
  const page = createMockPage([
    { tag: 'view', id: '55d0b8b0--watering-advisor-plant-item-plant_identity_7813b7834285a361' }
  ])

  const entry = await findByIdPrefix(page, 'watering-advisor-plant-item-')
  check('findByIdPrefix built-prefix found', !!entry, true)
  check(
    'findByIdPrefix stableId',
    entry?.stableId,
    'watering-advisor-plant-item-plant_identity_7813b7834285a361'
  )
  check(
    'findByIdPrefix id (raw)',
    entry?.id,
    '55d0b8b0--watering-advisor-plant-item-plant_identity_7813b7834285a361'
  )

  const missing = await findByIdPrefix(page, 'nonexistent-')
  check('findByIdPrefix missing', missing, null)
}

async function testFindByIdPrefixAndSuffix() {
  // plant-card-reminder-{id}-water 带构建前缀
  const page = createMockPage([
    { tag: 'view', id: 'abc123--plant-card-reminder-plant_42-water' },
    { tag: 'view', id: 'plant-card-reminder-plant_99-water' }
  ])

  const entry1 = await findByIdPrefixAndSuffix(page, 'plant-card-reminder-', '-water')
  check('findByIdPrefixAndSuffix built-prefix found', !!entry1, true)
  check('findByIdPrefixAndSuffix extractedId (built)', entry1?.extractedId, 'plant_42')
  check(
    'findByIdPrefixAndSuffix stableId (built)',
    entry1?.stableId,
    'plant-card-reminder-plant_42-water'
  )
}

async function testCollectByIdPrefix() {
  const page = createMockPage([
    { tag: 'view', id: '55d0b8b0--watering-advisor-plant-item-aaa' },
    { tag: 'view', id: '55d0b8b0--watering-advisor-plant-item-bbb' },
    { tag: 'view', id: 'watering-advisor-plant-item-ccc' },
    { tag: 'view', id: 'other-id' }
  ])

  const results = await collectByIdPrefix(page, 'watering-advisor-plant-item-')
  check('collectByIdPrefix count', results.length, 3)
  check(
    'collectByIdPrefix all have stableId',
    results.every(r => r.stableId.startsWith('watering-advisor-plant-item-')),
    true
  )
}

async function main() {
  testMatchesStableId()
  testMatchesStableIdPrefix()
  testExtractStableId()
  await testFindViewById()
  await testFindByIdPrefix()
  await testFindByIdPrefixAndSuffix()
  await testCollectByIdPrefix()

  console.log(`\n[id-prefix-self-test] pass=${passCount} fail=${failCount}`)
  if (failCount > 0) {
    process.exit(1)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
