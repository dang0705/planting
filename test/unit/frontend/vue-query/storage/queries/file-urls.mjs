import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const querySource = fs.readFileSync(
  path.join(repoRoot, 'src/vue-query/storage/queries/file-urls.js'),
  'utf8'
)
const cloudFileSource = fs.readFileSync(
  path.join(repoRoot, 'src/composables/useCloudFile.js'),
  'utf8'
)
const plantsSource = fs.readFileSync(path.join(repoRoot, 'src/store/plants.js'), 'utf8')
const userPlantsQuerySource = fs.readFileSync(
  path.join(repoRoot, 'src/vue-query/plants/queries/user-plants.js'),
  'utf8'
)

assert.match(querySource, /CLOUD_FILE_URL_QUERY_KEY/)
assert.match(querySource, /TEMP_FILE_URL_STALE_TIME_MS = 50 \* 60 \* 1000/)
assert.match(querySource, /CLOUD_STORAGE_BATCH_LIMIT = 50/)
assert.match(querySource, /isRestrictedMiniProgram\(\)/)
assert.match(querySource, /plant-catalog-http\/catalog\/image-urls/)
assert.match(querySource, /body: \{ fileIds \}/)
assert.match(querySource, /auth: false/)
assert.match(querySource, /requestWechatFileUrls/)
assert.match(querySource, /wx\.cloud\.getTempFileURL\(\{ fileList: fileIds \}\)/)
assert.match(querySource, /queryClient\.fetchQuery\(/)
assert.match(querySource, /queryClient\.invalidateQueries\(/)
assert.match(querySource, /expiresAt: Date\.now\(\) \+ TEMP_FILE_URL_DEFAULT_TTL_MS/)
assert.doesNotMatch(querySource, /public|永久|公开读/)

assert.match(cloudFileSource, /fetchCloudFileUrlQuery/)
assert.match(cloudFileSource, /invalidateCloudFileUrlQuery/)
assert.match(
  cloudFileSource,
  /setTimeout\(\(\) => \{[\s\S]*resolve\(fileId\.value, \{ force: true \}\)/
)
assert.match(cloudFileSource, /function refresh\(\)|async function refresh\(\)/)

assert.doesNotMatch(plantsSource, /getFileUrl/)
assert.doesNotMatch(plantsSource, /getUserPlants\(page = 1, pageSize = 50, force/)
assert.match(plantsSource, /userPlantsScope/)
assert.match(plantsSource, /removeQueries\(\{ queryKey: USER_PLANTS_QUERY_KEY \}\)/)
assert.doesNotMatch(userPlantsQuerySource, /fetchUserPlantsFresh/)

console.log('CloudBase temp URL Vue Query cache contract tests passed')
