import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(
  'src/pages/user-plant-detail/components/UserPlantDetailView.vue',
  'utf8'
)
const tableSource = fs.readFileSync('src/components/FertilizationMonthlyTable.vue', 'utf8')

assert.match(source, /id="user-plant-detail-fertilization-monthly-table"/)
assert.match(source, /施肥时间表/)
assert.match(tableSource, /液体肥/)
assert.match(tableSource, /缓释肥/)
assert.match(source, /FertilizationMonthlyTable/)
assert.match(source, /table-id="user-plant-detail-fertilization-monthly-table-content"/)
assert.doesNotMatch(source, /v-for="row in fertilizationMonthly\.rows"/)
assert.match(tableSource, /适用范围：\{\{ monthly\.scopeLabel \}\}/)
assert.match(tableSource, /所在地的温度、光照和实际生长状态/)
assert.match(tableSource, /数据来源：\{\{ monthly\.sourceNames\.join\('、'\) \}\}/)
assert.match(source, /该植物属暂无已审核的月度施肥表/)
assert.match(source, /fertilizationText/)
assert.doesNotMatch(source, /getMonthlyCellSourceText|来源：\{\{ row\.(liquid|slowRelease)\./)
assert.doesNotMatch(source, /scroll-view|scroll-x|min-w-\[560px\]/)
assert.doesNotMatch(source, /sourceRefs|evidenceRef|https?:\/\//)

console.log('user plant detail fertilization monthly view contract tests passed')
