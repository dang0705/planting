<template>
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
        <scroll-view scroll-y class="h-screen pt-4">
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
        <scroll-view scroll-y class="h-screen px-4 pb-6 pt-4">
          <view class="mb-4">
            <text class="block text-[24px] font-bold leading-8 text-[#1f2937]"> 完善植物信息 </text>
            <text class="mt-1 block text-sm leading-5 text-[#6b7280]">
              养护城市必填，光照环境可稍后补充
            </text>
          </view>

          <PlantForm
            v-model="formData"
            :city-error="formErrors.careLocation"
            class="mb-5"
            @upload-photo="uploadPhoto"
            @city-change="formErrors.careLocation = ''"
          />

          <view class="flex gap-3">
            <button
              id="add-plant-back-to-selection-button"
              class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
              :disabled="submitting"
              @click="activeStep = 0"
            >
              上一步
            </button>
            <button
              id="add-plant-submit-button"
              class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
              :class="{ 'opacity-50': submitting }"
              :disabled="submitting"
              @click="submitForm"
            >
              {{ submitting ? '保存中...' : submitButtonText }}
            </button>
          </view>
        </scroll-view>
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
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { onBackPress, onLoad } from '@dcloudio/uni-app'
import { createUserPlant, patchUserPlant } from '@/api/plants-http.js'
import { uploadPlantImage } from '@/api/storage.js'
import AIStreamDialog from '@/components/AIStreamDialog.vue'
import LoginModal from '@/components/LoginModal.vue'
import { ONE_MEGA_BYTE } from '@/constants'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { normalizeOptionalLightEnvironment } from '@/utils/light-environment.js'
import { normalizePlantCareLocation } from '@/utils/plant-care-location.js'
import PlantForm from './components/PlantForm.vue'
import PlantSelectionStep from './components/PlantSelectionStep.vue'
import { useAddPlantIdentify } from './composables/useAddPlantIdentify.js'

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

const activeStep = ref(0)
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
const editPlantId = ref('')
const editMode = ref(false)
const formErrors = reactive({ careLocation: '' })
let searchTimer = null

const formData = ref(createInitialForm())
const submitButtonText = computed(() => (editMode.value ? '保存修改' : '完成添加'))
const canEnterInfoStep = computed(() =>
  Boolean(selectedPlant.value || recognizedName.value || editPlantId.value)
)
const plantGroups = computed(() => {
  const groups = []
  for (let i = 0; i < defaultPlants.value.length; i += 4) {
    const items = defaultPlants.value.slice(i, i + 4)
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

onLoad(options => {
  editPlantId.value = String(options?.id || '').trim()
  editMode.value = String(options?.mode || '').trim() === 'edit' && Boolean(editPlantId.value)
  if (String(options?.step || '').trim() === 'info' && editPlantId.value) {
    activeStep.value = 1
  }
})

onMounted(async () => {
  if (!(await userStore.ensureLogin())) {
    showLogin.value = true
  }
  await Promise.all([loadPlants(), plantStore.getUserPlants()])
  if (editMode.value) {
    prefillEditPlant()
  }
})

onBackPress(() => {
  if (activeStep.value === 1) {
    activeStep.value = 0
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
  searchTimer = setTimeout(() => loadPlants(value), 500)
})

function createInitialForm() {
  return {
    image: '',
    nickname: '',
    location: '阳台',
    careLocation: null,
    lightEnvironment: null,
    plantDate: new Date().toISOString().split('T')[0],
    notes: ''
  }
}

function prefillEditPlant() {
  const plant = plantStore.userPlants.find(item => String(item.id) === editPlantId.value)
  if (!plant) {
    uni.showToast({ title: '未找到要编辑的植物', icon: 'none' })
    return
  }
  formData.value = {
    image: plant.image || '',
    nickname: plant.nickname || plant.displayName || '',
    location: plant.location || '阳台',
    careLocation: plant.careLocation || null,
    lightEnvironment: plant.lightEnvironment || null,
    plantDate: plant.plantDate || new Date().toISOString().split('T')[0],
    notes: plant.notes || ''
  }
  selectedPlant.value = plant
}

function handleSwiperChange(event) {
  const nextStep = Number(event?.detail?.current || 0)
  if (nextStep === 1 && !canEnterInfoStep.value) {
    uni.showToast({ title: '请先选择或识别植物', icon: 'none' })
    activeStep.value = 0
    return
  }
  activeStep.value = nextStep
}

function goInfoStep() {
  if (!canEnterInfoStep.value) {
    uni.showToast({ title: '请先选择或识别植物', icon: 'none' })
    return
  }
  activeStep.value = 1
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
      const path = result.tempFilePaths[0]
      wx.getFileSystemManager().stat({
        path,
        success: stat => {
          if (stat.stats.size > 5 * ONE_MEGA_BYTE) {
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
    const payload = await buildSubmitPayload(careLocation)
    if (editMode.value && !payload.photos) {
      delete payload.photos
    }
    const response = editMode.value
      ? await patchUserPlant({ id: Number(editPlantId.value), ...payload })
      : await createUserPlant(payload)
    if (response?.code !== 200) {
      uni.showToast({ title: response?.message || '保存失败', icon: 'none' })
      return
    }
    await plantStore.getUserPlants()
    uni.showToast({ title: editMode.value ? '保存成功' : '添加成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 1000)
  } catch (error) {
    console.error('保存失败:', error)
    uni.showToast({ title: error?.message || '网络错误，请重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

async function buildSubmitPayload(careLocation) {
  const selectedCatalogPlant = selectedPlant.value || identifyContext.value?.selectedPlant || null
  const plantIdentityId = String(selectedCatalogPlant?.plantIdentityId || '').trim()
  const sessionPlantId = String(selectedCatalogPlant?.sessionPlantId || '').trim()
  const plantId = String(selectedCatalogPlant?.id || sessionPlantId || plantIdentityId || '').trim()
  const localPhotoFileId = await resolvePhotoFileId(selectedCatalogPlant)
  return {
    plantId: plantId || null,
    plantIdentityId: plantIdentityId || null,
    sessionPlantId: sessionPlantId || null,
    recognizedName: identifyContext.value?.recognizedName || recognizedName.value || null,
    nickname:
      formData.value.nickname || selectedCatalogPlant?.canonicalName || recognizedName.value,
    location: formData.value.location,
    careLocation,
    lightEnvironment: normalizeOptionalLightEnvironment(formData.value.lightEnvironment),
    plantDate: formData.value.plantDate || null,
    notes: formData.value.notes || '',
    photos: localPhotoFileId ? [localPhotoFileId] : null,
    sourceType: identifyContext.value ? 'baidu' : plantId ? 'catalog' : 'baidu',
    recognitionType: identifyContext.value?.recognitionType || null,
    recognitionConfidence: Number.isFinite(identifyContext.value?.recognitionConfidence)
      ? identifyContext.value.recognitionConfidence
      : null,
    identityResolutionStatus: plantIdentityId
      ? 'matched'
      : identifyContext.value?.identityResolutionStatus || 'unresolved',
    visualCallBatchId: identifyContext.value?.visualCallBatchId || null
  }
}

async function resolvePhotoFileId(selectedCatalogPlant) {
  const image = String(formData.value.image || '')
  if (!image) {
    return ''
  }
  if (/^https?:\/\//i.test(image)) {
    return selectedCatalogPlant?.imageFileId || ''
  }
  uni.showLoading({ title: '上传图片中...', mask: true })
  try {
    const result = await uploadPlantImage(image, userStore.userId, '')
    return result.fileId
  } finally {
    uni.hideLoading()
  }
}
</script>
