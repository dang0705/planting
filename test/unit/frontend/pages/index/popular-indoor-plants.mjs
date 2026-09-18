import assert from 'node:assert/strict'
import {
  getPlantAliasText,
  selectPopularIndoorPlants
} from '../../../../../src/pages/index/components/popular-indoor-plants.js'

const plants = [
  { id: '52', canonicalName: '发财树' },
  { id: '42', canonicalName: '龟背竹' },
  { id: '11', canonicalName: '虎皮兰' },
  { id: '21', canonicalName: '吊兰' },
  { id: '1', canonicalName: '绿萝' },
  { id: '10', canonicalName: '小香葱' }
]

assert.deepEqual(
  selectPopularIndoorPlants(plants).map(plant => plant.canonicalName),
  ['绿萝', '吊兰', '虎皮兰', '龟背竹', '发财树']
)
assert.deepEqual(
  selectPopularIndoorPlants(plants, '树').map(plant => plant.canonicalName),
  ['发财树', '龟背竹', '虎皮兰', '吊兰', '绿萝']
)
assert.equal(getPlantAliasText({ canonicalName: '绿萝' }), '魔鬼藤、黄金葛、石柑子')
assert.equal(getPlantAliasText({ canonicalName: '橡皮树', aliasNames: '黑金刚' }), '黑金刚')

console.log('popular indoor plant selection contracts passed data_mode=unit_fake test_kind=logic')
