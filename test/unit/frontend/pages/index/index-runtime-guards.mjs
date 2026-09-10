import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

const home = read('src/pages/index/index.vue')
assert.match(home, /import \{ requireMvpAccess \} from '@\/utils\/subscription-access\.js'/)
assert.match(
  home,
  /goWateringAdvisor\(\)[\s\S]*?requireMvpAccess\(userStore, \{ source: 'index_watering_advisor' \}\)/
)
assert.match(
  home,
  /openDiagnose\(plant\)[\s\S]*?requireMvpAccess\(userStore, \{ source: 'index_plant_diagnose' \}\)/
)
assert.match(
  home,
  /openReminder\(\{ plant, type \}\)[\s\S]*?requireMvpAccess\(userStore, \{ source: `index_\$\{type\}_reminder` \}\)/
)
assert.match(
  home,
  /openFertilization\(plant\)[\s\S]*?requireMvpAccess\(userStore, \{ source: 'index_fertilization_reminder' \}\)/
)
assert.match(home, /createAsyncActionGuard/)
assert.match(home, /phoneLoginAction\.run\(/)
assert.match(home, /const phoneLoggingIn = ref\(false\)/)
assert.match(home, /:loading="phoneLoggingIn"/)
assert.match(home, /:disabled="phoneLoggingIn"/)
assert.match(home, /phoneLoggingIn \? '登录中…' : '微信手机号登录'/)
assert.match(home, /phoneLoggingIn\.value = true/)
assert.match(home, /phoneLoggingIn\.value = false/)
assert.match(home, /@click="handleAddPlant"/)
assert.match(home, /@click="handleGoWateringAdvisor"/)
assert.match(home, /onMounted\(async \(\) => \{/)
assert.match(home, /await loadUserPlants\(\)/)
assert.match(home, /const loadingPlants = ref\(true\)/)
assert.match(home, /const plantLoadStarted = ref\(false\)/)
assert.match(home, /id="index-plants-loading-skeleton"/)
assert.match(
  home,
  /if \(await userStore\.ensureLogin\(\)\) \{[\s\S]*?await loadUserPlants\(\)[\s\S]*?\} else \{[\s\S]*?loadingPlants\.value = false/
)
assert.match(home, /onShow\(\(\) => \{[\s\S]*delete plantDiagnoseHistory\[key\]/)
assert.doesNotMatch(home, /invalidateUserPlantsQuery\(\)/)
assert.match(home, /const plantsError = ref\(''\)/)
assert.match(home, /id="index-plants-retry-button"/)
assert.match(home, /if \(!result\?\.success && !result\?\.stale\)/)

const wateringReminder = read('src/pages/index/components/WateringReminderSheet.vue')
assert.match(wateringReminder, /createAsyncActionGuard/)
assert.match(wateringReminder, /title="添加浇水提醒"\s+height-mode="fullHeight"/)
assert.match(wateringReminder, /return addToCalendarAction\.run\(/)
assert.match(wateringReminder, /:confirm-loading="loading"/)

const plantForm = read('src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue')
assert.match(plantForm, /createAsyncActionGuard/)
assert.match(plantForm, /return submitAction\.run\(/)
assert.match(plantForm, /return potProfileAction\.run\(/)
assert.match(plantForm, /createDebounced/)
assert.match(plantForm, /debouncedLoadPlants\.cancel\(\)/)
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
