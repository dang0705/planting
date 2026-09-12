import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const pickerSource = read('src/components/LightEnvironmentPicker.vue')
const diagnosisPageSource = read('src/subpackages/diagnosis/question-package.vue')
const standalonePageSource = read('src/subpackages/care/plant-environment/light-environment.vue')

const rootViewMatch = pickerSource.match(
  /<view\s+:id="`\$\{idPrefix\}-environment-\$\{questionId\}`"([\s\S]*?)>/
)
assert.ok(rootViewMatch, 'LightEnvironmentPicker root view should remain addressable')
assert.doesNotMatch(rootViewMatch[1], /rounded-|border(?:-|\s)|bg-white|p-[0-9]/)
assert.match(rootViewMatch[1], /:class="\{ 'pointer-events-none opacity-60': disabled \}"/)
assert.match(pickerSource, /class="light-environment-picker-illustration h-\[116px\] w-full"/)
assert.match(
  pickerSource,
  /#ifdef MP-TOUTIAO[\s\S]*\.light-environment-picker-illustration[\s\S]*height: 100%/
)

assert.match(
  diagnosisPageSource,
  /class="question-package-card-enter rounded-\[20px\] border border-emerald-100 bg-white px-4 py-4 shadow-sm"/
)
assert.match(
  standalonePageSource,
  /<view class="rounded-\[20px\] border border-emerald-100 bg-white px-4 py-4 shadow-sm">\s*<LightEnvironmentPicker/
)

console.log('light environment picker container contract tests passed')
