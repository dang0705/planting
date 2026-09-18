import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

const home = read('src/pages/index/index.vue')
const popularPlantList = read('src/pages/index/components/PopularPlantList.vue')
const plantsHttp = read('src/api/plants-http.js')
const catalogDetailPage = read('src/subpackages/plant/catalog-detail/catalog-detail.vue')
const catalogDetailView = read(
  'src/subpackages/plant/catalog-detail/components/PlantCatalogDetailView.vue'
)
const pagesConfig = read('src/pages.json')
const userPlants = read('src/components/UserPlantsSection.vue')
assert.match(home, /import \{ requireMvpAccess \} from '@\/utils\/subscription-access\.js'/)
assert.match(
  home,
  /openWateringTool\(\)[\s\S]*?requireMvpAccess\(userStore, \{ source: 'home_watering_tool' \}\)/
)
assert.match(
  home,
  /id="index-tool-diagnosis"[\s\S]*?id="index-tool-watering"[\s\S]*?id="index-tool-identify"/
)
assert.doesNotMatch(home, /index-add-plant-button|handleAddPlant/)
assert.match(home, /@ai-identify="handleHomeAiIdentify"/)
assert.match(home, /<PopularPlantList/)
assert.match(home, /@focus="handleHomeSearchFocus"/)
assert.match(home, /@update:search-keyword="handleHomeSearchInput"/)
assert.match(
  home,
  /:visible="homeSearchFocused"[\s\S]*?:plants="homeSearchResults"[\s\S]*?@select="handleHomePlantSelect"/
)
assert.match(
  home,
  /async function handleHomePlantSelect\(plant\)[\s\S]*?const plantId = String\(plant\?\.id \|\| plant\?\.plantId \|\| plant\?\.sessionPlantId \|\| ''\)\.trim\(\)[\s\S]*?uni\.navigateTo\(\{[\s\S]*?\/subpackages\/plant\/catalog-detail\/catalog-detail\?plantId=/
)
assert.match(popularPlantList, /@click="emit\('select', plant\)"/)
assert.match(
  plantsHttp,
  /export function fetchPlantCatalogDetail\(plantId\)[\s\S]*?plantId: String\(plantId \|\| ''\)\.trim\(\)/
)
assert.match(
  catalogDetailPage,
  /onLoad\(options =>[\s\S]*?plantId\.value = String\(options\?\.plantId \|\| ''\)\.trim\(\)/
)
assert.match(catalogDetailView, /fetchPlantCatalogDetail\(requestedPlantId\)/)
assert.match(pagesConfig, /"path": "catalog-detail\/catalog-detail"/)
assert.match(home, /const SEARCH_DEBOUNCE_MS = 300/)
assert.match(home, /createDebounced\(/)
assert.match(popularPlantList, /id="index-popular-plants-list"/)
assert.match(home, /<AIStreamDialog[\s\S]*?@confirm="handleHomeAiConfirm"/)
assert.match(
  home,
  /uni\.navigateTo\(\{ url: '\/subpackages\/plant\/user-plant-detail\/user-plant-detail\?mode=create' \}\)/u
)
assert.doesNotMatch(home, /user-plant-detail\/user-plant-detail\?mode=create[^']*search=/u)
assert.match(home, /createLeadingThrottle\(openDiagnosisTool, TOOL_ACTION_THROTTLE_MS\)/)
assert.match(
  home,
  /createLeadingThrottle\(\s*openAddPlantFromHomeSearch,\s*TOOL_ACTION_THROTTLE_MS\s*\)/
)
assert.doesNotMatch(home, /PlantCard|loadUserPlants|phoneLoginAction/)
assert.match(userPlants, /requestPhoneLogin\(\{ message: '登录后可管理你的植物' \}\)/)
assert.match(userPlants, /@click="handlePhoneLoginRequest"/)
assert.match(userPlants, /const phoneLoggingIn = ref\(false\)/)
assert.match(userPlants, /:loading="phoneLoggingIn"/)
assert.match(userPlants, /:disabled="phoneLoggingIn"/)
assert.match(userPlants, /getUserPlants\(USER_PLANTS_PAGE, USER_PLANTS_PAGE_SIZE\)/)
assert.match(userPlants, /id="garden-my-plants-loading-skeleton"/)
assert.match(userPlants, /id="garden-my-plants-retry-button"/)
assert.match(userPlants, /id="garden-my-plants-list"/)
assert.match(userPlants, /@click="handleAddPlant"/)
assert.match(userPlants, /@click="handleGoWateringAdvisor"/)
assert.match(
  userPlants,
  /openDiagnose\(plant\)[\s\S]*?requireMvpAccess\(userStore, \{ source: 'profile_my_plants_diagnose' \}\)/
)
assert.match(
  userPlants,
  /openReminder\(\{ plant, type \}\)[\s\S]*?requireMvpAccess\(userStore, \{ source: `profile_my_plants_\$\{type\}_reminder` \}\)/
)
assert.match(
  userPlants,
  /openFertilization\(plant\)[\s\S]*?requireMvpAccess\(userStore, \{ source: 'profile_my_plants_fertilization_reminder' \}\)/
)

const wateringReminder = read('src/pages/index/components/WateringReminderSheet.vue')
const wateringReminderCalendar = read('src/pages/index/components/useWateringReminderCalendar.js')
assert.match(wateringReminder, /useWateringReminderCalendar/)
assert.match(wateringReminderCalendar, /createAsyncActionGuard/)
assert.match(wateringReminder, /title="添加浇水提醒"\s+height-mode="fullHeight"/)
assert.match(wateringReminderCalendar, /return addToCalendarAction\.run\(/)
assert.match(wateringReminder, /:confirm-loading="loading \|\| inputFlowLoading"/)

const plantForm = read('src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue')
assert.match(plantForm, /createAsyncActionGuard/)
assert.match(plantForm, /return submitAction\.run\(/)
assert.match(plantForm, /return potProfileAction\.run\(/)
assert.match(plantForm, /id="add-plant-identity-section"/)
assert.match(plantForm, /id="add-plant-ai-identify-button"/)
assert.match(plantForm, /@click="useAIIdentify"/)
assert.doesNotMatch(
  plantForm,
  /PlantSelectionStep|PlantSearchToolbar|swiper|debouncedLoadPlants|searchKeyword/
)
assert.match(plantForm, /const refreshResult = await plantStore\.getUserPlants\(1, 50\)/)
assert.match(plantForm, /植物已保存，但列表暂时无法更新，请稍后重试/)
assert.match(plantForm, /信息已保存，但列表暂时无法更新，请稍后重试/)

const wateringAdvisor = read('src/subpackages/care/watering-advisor/watering-advisor.vue')
assert.match(wateringAdvisor, /createAsyncActionGuard/)
assert.match(wateringAdvisor, /return confirmWateredAction\.run\(/)
assert.match(wateringAdvisor, /@click="handleFinishAdvisor"/)

const intake = read('src/pages/diagnose/diagnosis-tab-intake.js')
assert.match(intake, /createAsyncActionGuard/)
assert.match(intake, /return startDiagnosisAction\.run\(/)
assert.match(intake, /requireMvpAccess\(userStore, \{[\s\S]*source: 'diagnose_tab'/)

const questionFlow = read('src/subpackages/diagnosis/question-package/question-flow.js')
assert.match(questionFlow, /createAsyncActionGuard/)
assert.match(questionFlow, /return submitQuestionAnswersAction\.run\(/)

assert.doesNotMatch(plantForm, /createLeadingThrottle\(handleSwiperChange/)
assert.doesNotMatch(wateringAdvisor, /createLeadingThrottle\(handleScrollLower/)

console.log('runtime guard source contracts passed data_mode=unit_fake test_kind=source_contract')
