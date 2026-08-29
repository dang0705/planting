<template>
  <Layout :title="pageTitle" left-action="back" background-class="bg-[#f8faf9]">
    <view class="min-h-screen bg-[#f8faf9] pb-5">
      <view
        v-if="isEditMode && (loading || !currentPlant)"
        class="flex min-h-screen items-center justify-center px-6"
      >
        <text class="text-sm text-gray-500">正在加载植物信息...</text>
      </view>

      <swiper
        v-else
        id="add-plant-swiper"
        class="min-h-screen"
        :current="swiperStep"
        :duration="260"
        :disable-touch="isEditMode || plantListTouching"
        @change="handleSwiperChange"
      >
        <swiper-item v-if="!isEditMode">
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
            :panel-id="formPanelId"
            :id-prefix="pageIdPrefix"
            :title="formTitle"
            :subtitle="formSubtitle"
            :model-value="formData"
            :city-error="formErrors.careLocation"
            :active-step="formActiveStep"
            :submitting="submitting"
            :show-back="!isEditMode"
            :back-button-id="isEditMode ? '' : 'add-plant-back-to-selection-button'"
            :show-light-environment="!isEditMode"
            :submit-button-id="submitButtonId"
            :submit-text="submitText"
            submitting-text="保存中..."
            @update:model-value="formData = $event"
            @upload-photo="uploadPhoto"
            @city-change="formErrors.careLocation = ''"
            @open-pot-profile="openPotProfileEditor"
            @back="handleFormBack"
            @submit="submitForm"
          >
            <template #after-form>
              <PlantEnvironmentSettingsGroup
                v-if="isEditMode"
                :plant="currentPlant"
                id-prefix="edit-plant-environment"
                @open="openEnvironment"
              />
            </template>
          </PlantInfoStepPanel>
        </swiper-item>
      </swiper>

      <UserPlantPotProfileEditor
        ref="potProfileEditorRef"
        :initial-profile="formData.potProfile"
        :id-prefix="`${pageIdPrefix}-pot-profile`"
        :saving="potProfileSaving"
        :confirm-text="isEditMode ? '确认并保存' : '确认'"
        @save="savePotProfile"
      />

      <AIStreamDialog
        ref="aiDialogRef"
        :visible="showAIDialog"
        title="识别植物"
        icon="🔍"
        loading-text="正在识别植物..."
        confirm-text="使用识别结果"
        @close="handleAIClose"
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Layout from '@/Layout.vue'
import { createUserPlant, fetchUserPlant, patchUserPlant } from '@/api/plants-http.js'
import AIStreamDialog from '@/components/AIStreamDialog.vue'
import LoginModal from '@/components/LoginModal.vue'
import PlantEnvironmentSettingsGroup from '@/components/PlantEnvironmentSettingsGroup.vue'
import { ONE_MEGA_BYTE } from '@/constants'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import { createAsyncActionGuard, createDebounced } from '@/utils/interaction-guard.js'
import { normalizePlantCareLocation } from '@/utils/plant-care-location.js'
import PlantInfoStepPanel from './PlantInfoStepPanel.vue'
import { buildPlantFormFromUserPlant, createInitialPlantForm } from './plant-form-model.js'
import { buildPlantSubmitPayload } from './plant-submit.js'
import PlantSelectionStep from './PlantSelectionStep.vue'
import UserPlantPotProfileEditor from './UserPlantPotProfileEditor.vue'
import { useUserPlantIdentify } from '../composables/useUserPlantIdentify.js'

const SELECTION_STEP = 0
const INFO_STEP = 1
const PLANT_GROUP_SIZE = 4
const SEARCH_DEBOUNCE_MS = 500
const FIRST_IMAGE_INDEX = 0
const IMAGE_SIZE_LIMIT_MB = 5
const HTTP_SUCCESS_CODE = 200
const SUCCESS_NAV_DELAY_MS = 1000

const props = defineProps({
  mode: { type: String, default: 'create' },
  plantId: { type: [String, Number], default: '' }
})

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

const currentPlant = ref(null)
const loading = ref(true)
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
const potProfileEditorRef = ref(null)
const potProfileSaving = ref(false)
const submitAction = createAsyncActionGuard()
const potProfileAction = createAsyncActionGuard()
const debouncedLoadPlants = createDebounced(keyword => loadPlants(keyword), SEARCH_DEBOUNCE_MS)

const formData = ref(createInitialPlantForm())
const plantId = computed(() => String(props.plantId || '').trim())
const isEditMode = computed(() => props.mode === 'edit' && Boolean(plantId.value))
const pageTitle = computed(() => (isEditMode.value ? '编辑植物' : '添加植物'))
const pageIdPrefix = computed(() => (isEditMode.value ? 'edit-plant' : 'add-plant'))
const formPanelId = computed(() => `${pageIdPrefix.value}-info-panel`)
const formTitle = computed(() => (isEditMode.value ? '编辑植物信息' : '完善植物信息'))
const formSubtitle = computed(() =>
  isEditMode.value ? '修改昵称、养护城市和备注等信息' : '养护城市必填，光照环境可稍后补充'
)
const formActiveStep = computed(() => (isEditMode.value ? INFO_STEP : activeStep.value))
const swiperStep = computed(() => (isEditMode.value ? SELECTION_STEP : activeStep.value))
const submitButtonId = computed(() => `${pageIdPrefix.value}-submit-button`)
const submitText = computed(() => (isEditMode.value ? '保存修改' : '完成添加'))
const canEnterInfoStep = computed(() => Boolean(selectedPlant.value || recognizedName.value))
const plantGroups = computed(() => {
  const groups = []
  for (let i = 0; i < defaultPlants.value.length; i += PLANT_GROUP_SIZE) {
    const items = defaultPlants.value.slice(i, i + PLANT_GROUP_SIZE)
    groups.push({ key: items.map(item => item.id).join('-'), length: items.length, items })
  }
  return groups
})
const { useAIIdentify, handleAIConfirm, handleAIRetry, handleAIClose, clearPendingImage } =
  useUserPlantIdentify({
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

onBeforeUnmount(() => {
  debouncedLoadPlants.cancel()
  clearPendingImage().catch(() => {})
})

onMounted(async () => {
  if (isEditMode.value) {
    await initializeEditPage()
    return
  }
  await loadPlants()
})

function handleBackPress() {
  if (isEditMode.value) {
    return false
  }
  if (activeStep.value === INFO_STEP) {
    activeStep.value = SELECTION_STEP
    return true
  }
  return false
}

defineExpose({ handleBackPress })

async function initializeEditPage() {
  loading.value = true
  currentPlant.value = null
  if (!(await userStore.ensureLogin())) {
    loginMsg.value = '编辑植物需要先登录'
    showLogin.value = true
    loading.value = false
    return
  }
  const response = await fetchUserPlant(Number(plantId.value))
  const plant = response?.code === HTTP_SUCCESS_CODE ? response.data : null
  if (!plant) {
    loading.value = false
    uni.showToast({ title: '未找到要编辑的植物', icon: 'none' })
    setTimeout(() => uni.navigateBack(), SUCCESS_NAV_DELAY_MS)
    return
  }
  const serverPlant = { ...plant, image: '' }
  plantStore.updateUserPlantLocal?.(serverPlant.id, serverPlant)
  currentPlant.value = serverPlant
  formData.value = buildPlantFormFromUserPlant(serverPlant)
  loading.value = false
}

watch(selectedPlant, plant => {
  if (!plant) {
    return
  }
  if (!formData.value.nickname.trim()) {
    formData.value.nickname = plant.canonicalName || ''
  }
  if (!formData.value.image && plant.imageUrl) {
    formData.value = {
      ...formData.value,
      image: plant.imageUrl,
      imageFileId: plant.imageFileId || ''
    }
  }
})

watch(recognizedName, name => {
  if (name && !selectedPlant.value && !formData.value.nickname.trim()) {
    formData.value.nickname = name
  }
})

watch(searchKeyword, value => {
  debouncedLoadPlants(value)
})

function handleSwiperChange(event) {
  if (isEditMode.value) {
    return
  }
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

function handleFormBack() {
  if (!isEditMode.value) {
    activeStep.value = SELECTION_STEP
  }
}

function handleSearchConfirm() {
  debouncedLoadPlants.cancel()
  loadPlants(searchKeyword.value)
}

function clearSearch() {
  debouncedLoadPlants.cancel()
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
  if (isEditMode.value) {
    initializeEditPage()
    return
  }
  if (loginMsg.value.includes('AI')) {
    useAIIdentify()
  }
}

const environmentPagePaths = Object.freeze({
  light: '/subpackages/care/plant-environment/light-environment',
  air: '/subpackages/care/airflow/index'
})

function openEnvironment(kind) {
  const pagePath = environmentPagePaths[kind]
  if (!isEditMode.value || !pagePath || !plantId.value) {
    return
  }
  uni.navigateTo({
    url: `${pagePath}?plantId=${plantId.value}&returnTo=user-plant-detail`,
    success: navigation => {
      navigation.eventChannel?.on('plant-environment-saved', handleEnvironmentSaved)
    }
  })
}

function openPotProfileEditor() {
  if (!isEditMode.value && !canEnterInfoStep.value) {
    uni.showToast({ title: '请先选择或识别植物', icon: 'none' })
    return
  }
  potProfileEditorRef.value?.open()
}

function savePotProfile(profile) {
  return potProfileAction.run(async () => {
    if (!profile || potProfileSaving.value) {
      return
    }
    if (!(await userStore.ensureLogin())) {
      loginMsg.value = isEditMode.value ? '编辑植物需要先登录' : '添加植物需要先登录'
      showLogin.value = true
      return
    }

    if (!isEditMode.value) {
      formData.value = { ...formData.value, potProfile: profile }
      potProfileEditorRef.value?.close()
      return
    }

    potProfileSaving.value = true
    try {
      const response = await patchUserPlant({ id: Number(plantId.value), ...profile })
      if (response?.code !== HTTP_SUCCESS_CODE) {
        uni.showToast({ title: '盆型信息暂未保存，请检查网络后重试', icon: 'none' })
        return
      }
      const serverPlant = await refreshCurrentPlantFromServer()
      formData.value = {
        ...formData.value,
        potProfile: serverPlant?.potProfile || profile
      }
      potProfileEditorRef.value?.close()
      uni.showToast({ title: '盆型信息已保存', icon: 'success' })
    } catch {
      uni.showToast({ title: '暂时无法保存盆型信息，请稍后重试', icon: 'none' })
    } finally {
      potProfileSaving.value = false
    }
  })
}

function handleEnvironmentSaved(payload = {}) {
  if (String(payload.plantId || '') !== plantId.value) {
    return
  }
  refreshCurrentPlantFromServer()
}

async function refreshCurrentPlantFromServer() {
  const response = await fetchUserPlant(Number(plantId.value))
  if (response?.code !== HTTP_SUCCESS_CODE || !response.data) {
    return
  }
  const serverPlant = { ...response.data, image: '' }
  plantStore.updateUserPlantLocal?.(serverPlant.id, serverPlant)
  currentPlant.value = { ...currentPlant.value, ...serverPlant }
  return serverPlant
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
          formData.value = { ...formData.value, image: path, imageFileId: '' }
        },
        fail: () => (formData.value = { ...formData.value, image: path, imageFileId: '' })
      })
    }
  })
}

function submitForm() {
  return submitAction.run(async () => {
    if (submitting.value) {
      return
    }
    if (isEditMode.value) {
      await submitEditForm()
      return
    }
    await submitNewPlantForm()
  })
}

async function submitNewPlantForm() {
  reportAnalyticsEvent(ANALYTICS_EVENTS.SAVE_USER_NEW_PLANT)
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
      uni.showToast({ title: '暂时无法添加植物，请检查网络后重试', icon: 'none' })
      return
    }
    reportAnalyticsEvent(ANALYTICS_EVENTS.USER_NEW_PLANT_CREATED)
    await plantStore.getUserPlants(1, 50)
    uni.showToast({ title: '添加成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), SUCCESS_NAV_DELAY_MS)
  } catch {
    uni.showToast({ title: '暂时无法添加植物，请检查网络后重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

async function submitEditForm() {
  if (!currentPlant.value) {
    return
  }
  if (!(await userStore.ensureLogin())) {
    loginMsg.value = '编辑植物需要先登录'
    showLogin.value = true
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
      selectedPlant: currentPlant.value,
      recognizedName: currentPlant.value.recognizedName || '',
      userId: userStore.userId,
      includeLightEnvironment: false,
      includeAirEnvironment: false,
      includePotProfile: false
    })
    if (!payload.photos) {
      delete payload.photos
    }
    const response = await patchUserPlant({ id: Number(plantId.value), ...payload })
    if (response?.code !== HTTP_SUCCESS_CODE) {
      uni.showToast({ title: '暂时无法保存植物信息，请检查网络后重试', icon: 'none' })
      return
    }
    await plantStore.getUserPlants(1, 50)
    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), SUCCESS_NAV_DELAY_MS)
  } catch {
    uni.showToast({ title: '暂时无法保存植物信息，请检查网络后重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>
