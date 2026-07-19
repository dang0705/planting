<template>
  <Layout title="添加植物" left-action="back" background-class="bg-[#f8faf9]">
    <view class="min-h-screen bg-[#f8faf9] pb-5">
      <swiper
        id="add-plant-swiper"
        class="min-h-screen"
        :current="activeStep"
        :duration="260"
        :disable-touch="plantListTouching"
        @change="handleSwiperChange"
      >
        <swiper-item>
          <scroll-view scroll-y class="h-screen">
            <PlantSelectionStep
              v-model:search-keyword="searchKeyword"
              :plant-groups="plantGroups"
              :plant-count="defaultPlants.length"
              :initial-plants-loading="initialPlantsLoading"
              :plants-loading-more="plantsLoadingMore"
              :has-more-plants="hasMorePlants"
              :selected-plant="selectedPlant"
              :recognized-name="recognizedName"
              :can-proceed="canEnterInfoStep"
              @search-confirm="handleSearchConfirm"
              @clear-search="clearSearch"
              @scroll-lower="handlePlantScrollToLower"
              @select-plant="handlePlantSelect"
              @ai-identify="useAIIdentify"
              @next="goInfoStep"
              @list-touch-start="plantListTouching = true"
              @list-touch-end="plantListTouching = false"
            />
          </scroll-view>
        </swiper-item>

        <swiper-item>
          <PlantInfoStepPanel
            panel-id="add-plant-info-panel"
            id-prefix="add-plant"
            title="完善植物信息"
            subtitle="养护城市必填，光照环境可稍后补充"
            :model-value="formData"
            :city-error="formErrors.careLocation"
            :active-step="activeStep"
            :submitting="submitting"
            show-back
            back-button-id="add-plant-back-to-selection-button"
            submit-button-id="add-plant-submit-button"
            submit-text="完成添加"
            submitting-text="保存中..."
            @update:model-value="formData = $event"
            @upload-photo="uploadPhoto"
            @city-change="formErrors.careLocation = ''"
            @back="activeStep = 0"
            @submit="submitForm"
          />
        </swiper-item>
      </swiper>

      <AIStreamDialog
        ref="aiDialogRef"
        :visible="showAIDialog"
        title="AI 智能识别"
        icon="🔍"
        loading-text="正在识别植物..."
        confirm-text="使用识别结果"
        @close="showAIDialog = false"
        @confirm="handleAIConfirm"
        @retry="handleAIRetry"
      />

      <LoginModal
        :show="showLogin"
        :message="loginMsg"
        @close="showLogin = false"
        @success="handleLoginSuccess"
      />
    </view>
  </Layout>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { onBackPress } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import { createUserPlant } from '@/api/plants-http.js'
import AIStreamDialog from '@/components/AIStreamDialog.vue'
import LoginModal from '@/components/LoginModal.vue'
import { ONE_MEGA_BYTE } from '@/constants'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { normalizePlantCareLocation } from '@/utils/plant-care-location.js'
import PlantInfoStepPanel from './components/PlantInfoStepPanel.vue'
import { createInitialPlantForm } from './components/plant-form-model.js'
import { buildPlantSubmitPayload } from './components/plant-submit.js'
import PlantSelectionStep from './components/PlantSelectionStep.vue'
import { useAddPlantIdentify } from './composables/useAddPlantIdentify.js'

const SELECTION_STEP = 0
const INFO_STEP = 1
const PLANT_GROUP_SIZE = 4
const SEARCH_DEBOUNCE_MS = 500
const FIRST_IMAGE_INDEX = 0
const IMAGE_SIZE_LIMIT_MB = 5
const HTTP_SUCCESS_CODE = 200
const SUCCESS_NAV_DELAY_MS = 1000

const userStore = useUserStore()
const plantStore = usePlantStore()
const {
  plants: defaultPlants,
  initialLoading: initialPlantsLoading,
  loadingMore: plantsLoadingMore,
  load: loadPlants,
  loadNextPage,
  hasMore: hasMorePlants
} = useDefaultPlants()

const activeStep = ref(SELECTION_STEP)
const selectedPlant = ref(null)
const recognizedName = ref('')
const identifyContext = ref(null)
const submitting = ref(false)
const showLogin = ref(false)
const loginMsg = ref('添加植物需要先登录')
const showAIDialog = ref(false)
const aiDialogRef = ref(null)
const searchKeyword = ref('')
const plantListTouching = ref(false)
const formErrors = reactive({ careLocation: '' })
let searchTimer = null

const formData = ref(createInitialPlantForm())
const canEnterInfoStep = computed(() => Boolean(selectedPlant.value || recognizedName.value))
const plantGroups = computed(() => {
  const groups = []
  for (let i = 0; i < defaultPlants.value.length; i += PLANT_GROUP_SIZE) {
    const items = defaultPlants.value.slice(i, i + PLANT_GROUP_SIZE)
    groups.push({ key: items.map(item => item.id).join('-'), length: items.length, items })
  }
  return groups
})
const { useAIIdentify, handleAIConfirm, handleAIRetry } = useAddPlantIdentify({
  userStore,
  defaultPlants,
  formData,
  selectedPlant,
  recognizedName,
  identifyContext,
  showLogin,
  loginMsg,
  showAIDialog,
  aiDialogRef,
  activeStep
})

onMounted(async () => {
  await loadPlants()
})

onBackPress(() => {
  if (activeStep.value === INFO_STEP) {
    activeStep.value = SELECTION_STEP
    return true
  }
  return false
})

watch(selectedPlant, plant => {
  if (!plant) {
    return
  }
  if (!formData.value.nickname.trim()) {
    formData.value.nickname = plant.canonicalName || ''
  }
  if (!formData.value.image && plant.imageUrl) {
    formData.value.image = plant.imageUrl
  }
})

watch(recognizedName, name => {
  if (name && !selectedPlant.value && !formData.value.nickname.trim()) {
    formData.value.nickname = name
  }
})

watch(searchKeyword, value => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => loadPlants(value), SEARCH_DEBOUNCE_MS)
})

function handleSwiperChange(event) {
  const nextStep = Number(event?.detail?.current || SELECTION_STEP)
  if (nextStep === INFO_STEP && !canEnterInfoStep.value) {
    uni.showToast({ title: '请先选择或识别植物', icon: 'none' })
    activeStep.value = SELECTION_STEP
    return
  }
  activeStep.value = nextStep
}

function goInfoStep() {
  if (!canEnterInfoStep.value) {
    uni.showToast({ title: '请先选择或识别植物', icon: 'none' })
    return
  }
  activeStep.value = INFO_STEP
}

function handleSearchConfirm() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  loadPlants(searchKeyword.value)
}

function clearSearch() {
  searchKeyword.value = ''
  loadPlants()
}

function handlePlantScrollToLower() {
  if (hasMorePlants.value && !plantsLoadingMore.value) {
    loadNextPage()
  }
}

function handlePlantSelect(plant) {
  identifyContext.value = null
  selectedPlant.value = plant
  recognizedName.value = ''
}

function handleLoginSuccess() {
  showLogin.value = false
  if (loginMsg.value.includes('AI')) {
    useAIIdentify()
  }
}

function uploadPhoto() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: result => {
      const path = result.tempFilePaths[FIRST_IMAGE_INDEX]
      wx.getFileSystemManager().stat({
        path,
        success: stat => {
          if (stat.stats.size > IMAGE_SIZE_LIMIT_MB * ONE_MEGA_BYTE) {
            uni.showToast({ title: '图片过大，请选择 5MB 以下', icon: 'none' })
            return
          }
          formData.value.image = path
        },
        fail: () => (formData.value.image = path)
      })
    }
  })
}

async function submitForm() {
  if (submitting.value) {
    return
  }
  if (!(await userStore.ensureLogin())) {
    loginMsg.value = '添加植物需要先登录'
    showLogin.value = true
    return
  }
  if (!canEnterInfoStep.value) {
    uni.showToast({ title: '请选择或识别植物', icon: 'none' })
    return
  }
  const careLocation = normalizePlantCareLocation(formData.value.careLocation)
  if (!careLocation) {
    formErrors.careLocation = '请选择养护城市'
    uni.showToast({ title: '请选择养护城市', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    const payload = await buildPlantSubmitPayload({
      formData: { ...formData.value, careLocation },
      selectedPlant: selectedPlant.value,
      identifyContext: identifyContext.value,
      recognizedName: recognizedName.value,
      userId: userStore.userId
    })
    const response = await createUserPlant(payload)
    if (response?.code !== HTTP_SUCCESS_CODE) {
      uni.showToast({ title: response?.message || '保存失败', icon: 'none' })
      return
    }
    await plantStore.getUserPlants()
    uni.showToast({ title: '添加成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), SUCCESS_NAV_DELAY_MS)
  } catch (error) {
    uni.showToast({ title: error?.message || '网络错误，请重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>
