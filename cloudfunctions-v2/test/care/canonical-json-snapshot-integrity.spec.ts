import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { calculateCanonicalJsonSha256, serializeCanonicalJson } from '../../src/foundation/json/canonical-json-sha256.js'

/** unit_fake：Expected 来自 CanonicalJsonValue 的纯 JSON 值边界与快照输入完整性合同；无替身。 */
describe('unit_fake 快照清单拒绝非 JSON 对象', () => {
  it.each([
    ['Date', new Date('2026-10-04T00:00:00Z')],
    ['Map', new Map([['temperature', 25]])],
    ['Set', new Set([1, 2])],
    ['boxed Number', new Number(25)],
  ])('%s 不能被当成空对象进入摘要', (_name, value) => {
    expect(() => serializeCanonicalJson({ observed: value } as never)).toThrow(TypeError)
    expect(() => calculateCanonicalJsonSha256([value] as never)).toThrow(TypeError)
  })

  it('自定义类实例不作为可回放 JSON 清单', () => {
    class Observation {
      value = 25
    }
    expect(() => serializeCanonicalJson(new Observation() as never)).toThrow(TypeError)
  })

  it('合法嵌套 JSON 使用明确序列与独立 UTF-8 摘要', () => {
    const value = { z: [null, 0, false], a: { temperature: 25 } }
    const expected = '{"a":{"temperature":25},"z":[null,0,false]}'
    expect(serializeCanonicalJson(value)).toBe(expected)
    expect(calculateCanonicalJsonSha256(value)).toBe(createHash('sha256').update(expected, 'utf8').digest('hex'))
  })

  it('无原型纯记录仍可按 JSON 键值回放', () => {
    const value = Object.assign(Object.create(null), { temperature: 25 })
    expect(serializeCanonicalJson(value)).toBe('{"temperature":25}')
  })
})
