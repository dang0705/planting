/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/store/user.js'), 'utf8')

assert.match(source, /function isActiveMembership\(membership = \{\}\)/u)
assert.match(source, /\['basic', 'premium'\]\.includes\(type\)/u)
assert.match(source, /subscription_status/u)
assert.match(source, /isMember: state => isActiveMembership\(state\.membership\)/u)
assert.match(source, /freeQuota: isPaidPlan \? 999 : 0/u)
assert.match(source, /canDiagnose: state => isActiveMembership\(state\.membership\)/u)
assert.doesNotMatch(source, /state\.membership\.type === 'free' && state\.membership\.freeQuota > 0/u)
assert.match(source, /this\.membership = buildMembership\(user\)/u)
assert.match(source, /status: 'active'/u)

console.log('subscription membership state source contract passed data_mode=unit_fake')
