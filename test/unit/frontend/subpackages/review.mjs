import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const pagesConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/pages.json'), 'utf8'))
const manifestSource = fs.readFileSync(path.join(repoRoot, 'src/manifest.json'), 'utf8')
const profileSource = fs.readFileSync(path.join(repoRoot, 'src/pages/profile/profile.vue'), 'utf8')
const reviewRoot = path.join(repoRoot, 'src/subpackages/review')
const reviewPackage = pagesConfig.subPackages?.find(item => item.root === 'subpackages/review')

assert.ok(reviewPackage, 'review pages must be registered under a dedicated subpackage root')
assert.deepEqual(
  reviewPackage.pages.map(page => page.path),
  ['out-of-pool-review', 'diagnosis-review', 'watering-review']
)
assert.ok(
  pagesConfig.pages.every(
    page =>
      ![
        'pages/profile/out-of-pool-review',
        'pages/profile/diagnosis-review',
        'pages/profile/watering-review'
      ].includes(page.path)
  ),
  'review pages must not remain in the main pages list'
)
assert.equal(
  pagesConfig.tabBar.list.some(item => item.pagePath === 'pages/profile/profile'),
  true,
  'profile tab must remain a main-package tabBar page'
)
assert.match(manifestSource, /"optimization"\s*:\s*\{[\s\S]*?"subPackages"\s*:\s*true/)
for (const page of reviewPackage.pages) {
  assert.ok(
    fs.existsSync(path.join(reviewRoot, `${page.path}.vue`)),
    `subpackage source page is missing: ${page.path}`
  )
}
assert.doesNotMatch(profileSource, /\/subpackages\/review\//)
assert.match(profileSource, /url:\s*'\/pages\/index\/index'/)
assert.doesNotMatch(
  profileSource,
  /\/pages\/profile\/(?:out-of-pool-review|diagnosis-review|watering-review)/
)
assert.doesNotMatch(
  fs.readFileSync(path.join(repoRoot, 'src/styles/global.css'), 'utf8'),
  /diagnosis-review\/style\.css/
)

console.log('review subpackage route contract tests passed')
