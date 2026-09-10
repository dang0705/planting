import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const querySource = fs.readFileSync(
  path.join(root, 'src/vue-query/plants/queries/user-plants.js'),
  'utf8'
)
const wateringMutation = fs.readFileSync(
  path.join(root, 'src/vue-query/plants/mutations/watering-reminders.js'),
  'utf8'
)
const airMutation = fs.readFileSync(
  path.join(root, 'src/vue-query/plants/mutations/air-environment.js'),
  'utf8'
)
const plantsHttp = fs.readFileSync(path.join(root, 'src/api/plants-http.js'), 'utf8')
const plantStore = fs.readFileSync(path.join(root, 'src/store/plants.js'), 'utf8')
const userStore = fs.readFileSync(path.join(root, 'src/store/user.js'), 'utf8')

assert.match(querySource, /staleTime|USER_PLANTS_QUERY_KEY/u)
assert.match(querySource, /invalidateUserPlantsQuery/u)
assert.match(wateringMutation, /executeSaveWateringReminderMutation/u)
assert.match(wateringMutation, /executeCompleteWateringReminderMutation/u)
assert.match(wateringMutation, /invalidateUserPlantsQuery\(\)/gu)
assert.match(airMutation, /executePatchUserPlantAirEnvironmentMutation/u)
assert.match(airMutation, /invalidateUserPlantsQuery\(\)/u)
assert.match(
  plantsHttp,
  /completeWateringReminder\(payload\)[\s\S]*executeCompleteWateringReminderMutation/u
)
assert.match(plantStore, /latestScope !== currentScope/u)
assert.match(plantStore, /this\.userPlants = \[\]/u)
assert.match(userStore, /plantStore\?\.\$reset\?\.\(\)/u)
assert.match(
  userStore,
  /queryClient\.removeQueries\(\{ queryKey: DIAGNOSIS_HISTORY_QUERY_KEY \}\)/u
)
assert.doesNotMatch(
  userStore,
  /from ['"]@\/subpackages\//u,
  '主包 user store 不得反向依赖子包模块'
)

console.log(
  'plant Vue Query cache coherence contracts passed data_mode=unit_fake test_kind=source_contract'
)
