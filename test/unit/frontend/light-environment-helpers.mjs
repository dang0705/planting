import assert from 'node:assert/strict'

const { compassDirectionToFacing, createDefaultLightEnvironment, getLightFacingLabel } =
  await import('../../../src/utils/light-environment.js')

const cases = [
  [-1, 'north'],
  [0, 'north'],
  [22.49, 'north'],
  [22.5, 'north_east'],
  [67.49, 'north_east'],
  [67.5, 'east'],
  [112.5, 'south_east'],
  [157.5, 'south'],
  [202.5, 'south_west'],
  [247.5, 'west'],
  [292.5, 'north_west'],
  [337.49, 'north_west'],
  [337.5, 'north'],
  [720, 'north']
]

for (const [degree, facing] of cases) {
  assert.equal(compassDirectionToFacing(degree), facing, `degree ${degree}`)
}

assert.equal(compassDirectionToFacing('not-a-number'), 'unknown')
assert.equal(getLightFacingLabel('north_east'), '东北')
assert.equal(getLightFacingLabel('south_east'), '东南')
assert.equal(getLightFacingLabel('south_west'), '西南')
assert.equal(getLightFacingLabel('north_west'), '西北')
assert.equal(getLightFacingLabel('missing'), '不确定')
assert.equal(createDefaultLightEnvironment().facing, 'south')

console.log('light environment helper tests passed')
