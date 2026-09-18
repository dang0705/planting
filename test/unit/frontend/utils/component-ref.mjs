// data_mode=unit_fake; test_kind=logic_contract. Covers Vue v-for refs, not real mini-program rendering.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/utils/component-ref.js'), 'utf8')
const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)

let calls = 0
const component = {
  continueWithEvidence() {
    calls += 1
    return 'called'
  }
}

const result = module.callComponentMethod({ value: [component] }, 'continueWithEvidence')
assert.equal(result, 'called', 'v-for 产生的组件引用数组必须转发到第一个可用实例')
assert.equal(calls, 1)

console.log('component ref array forwarding contract passed data_mode=unit_fake')
