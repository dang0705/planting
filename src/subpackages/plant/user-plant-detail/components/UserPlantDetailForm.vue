<template>
  <Layout :title="pageTitle" left-action="back" background-class="bg-[#f8faf9]">
    <view class="box-border h-[calc(100vh-var(--app-header-height))] min-h-0 bg-[#f8faf9]">
      <view
        v-if="isEditMode && (loading || !currentPlant)"
        class="flex min-h-full items-center justify-center px-6"
      >
        <text class="text-sm text-gray-500">正在加载植物信息...</text>
      </view>

      <view v-else class="box-border h-full min-h-0">
        <PlantInfoStepPanel
          :panel-id="formPanelId"
          :id-prefix="pageIdPrefix"
          :title="formTitle"
          :subtitle="formSubtitle"
          :model-value="formData"
          :city-error="formErrors.careLocation"
          :active-step="INFO_STEP"
          :submitting="submitting"
          :show-back="false"
          :show-light-environment="!isEditMode && !restrictedPlatform"
          :show-photo="!restrictedPlatform"
          :show-pot-profile="!restrictedPlatform"
          :submit-button-id="submitButtonId"
          :submit-text="submitText"
          submitting-text="保存中..."
          @update:model-value="handleFormModelUpdate"
          @upload-photo="uploadPhoto"
          @city-change="formErrors.careLocation = ''"
          @open-pot-profile="openPotProfileEditor"
          @submit="submitForm"
        >
          <template #before-form>
            <view
              v-if="!isEditMode"
              id="add-plant-identity-section"
              class="mb-4 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-[#f0f8f2] p-4"
            >
              <view class="flex items-center justify-between gap-3">
                <view class="min-w-0 flex-1">
                  <text class="block text-sm font-semibold text-[#1f2937]">植物</text>
                  <text class="mt-1 block truncate text-sm text-[#5a7a68]">
                    {{ identifiedPlantName || '还没有识别植物' }}
                  </text>
                </view>
                <button
                  id="add-plant-ai-identify-button"
                  class="m-0 h-10 shrink-0 rounded-full bg-[#00a63e] px-4 text-sm font-semibold leading-10 text-white"
                  @click="useAIIdentify"
                >
                  {{ identifiedPlantName ? '重新识别' : 'AI 拍照识别' }}
                </button>
              </view>
              <text v-if="!identifiedPlantName" class="mt-2 block text-xs leading-5 text-[#6b7f73]">
                拍一张照片，识别结果会自动带入植物信息
              </text>
            </view>
          </template>
          <template #after-form>
            <PlantEnvironmentSettingsGroup
              v-if="isEditMode && !restrictedPlatform"
              :plant="currentPlant"
              id-prefix="edit-plant-environment"
              @open="openEnvironment"
            />
          </template>
        </PlantInfoStepPanel>
      </view>

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

      <FeatureUnavailableModal
        v-model="featureUnavailableVisible"
        :feature-key="openedFeatureKey"
      />
    </view>
  </Layout>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Layout from '@/Layout.vue'
import {
  createUserPlant,
  fetchPlantCatalogDetail,
  fetchUserPlant,
  patchUserPlant
} from '@/api/plants-http.js'
import AIStreamDialog from '@/components/AIStreamDialog.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import PlantEnvironmentSettingsGroup from '@/components/PlantEnvironmentSettingsGroup.vue'
import { ONE_MEGA_BYTE } from '@/constants'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import { createAsyncActionGuard } from '@/utils/interaction-guard.js'
import { normalizePlantCareLocation } from '@/utils/plant-care-location.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isFeatureAvailable, isRestrictedMiniProgram } from '@/utils/platform-capabilities.js'
import PlantInfoStepPanel from './PlantInfoStepPanel.vue'
import { buildPlantFormFromUserPlant, createInitialPlantForm } from './plant-form-model.js'
import { buildPlantSubmitPayload, buildRestrictedManualPlantPayload } from './plant-submit.js'
import UserPlantPotProfileEditor from './UserPlantPotProfileEditor.vue'
import { useUserPlantIdentify } from '@/composables/useUserPlantIdentify.js'

const INFO_STEP = 1
const FIRST_IMAGE_INDEX = 0
const IMAGE_SIZE_LIMIT_MB = 5
const HTTP_SUCCESS_CODE = 200
const SUCCESS_NAV_DELAY_MS = 1000

const props = defineProps({
  mode: { type: String, default: 'create' },
  plantId: { type: [String, Number], default: '' },
  initialCatalogPlantId: { type: [String, Number], default: '' },
  initialPotProfile: { type: Object, default: null },
  initialIdentifyImagePath: { type: String, default: '' },
  initialIdentifyResult: { type: Object, default: null }
})

const userStore = useUserStore()
const plantStore = usePlantStore()
const defaultPlants = ref([])

const currentPlant = ref(null)
const loading = ref(true)
const editFormDirty = ref(false)
const activeStep = ref(INFO_STEP)
const selectedPlant = ref(null)
const recognizedName = ref('')
const identifyContext = ref(null)
const initialIdentifyResultApplied = ref(false)
const submitting = ref(false)
const showAIDialog = ref(false)
const aiDialogRef = ref(null)
const formErrors = reactive({ careLocation: '' })
const potProfileEditorRef = ref(null)
const potProfileSaving = ref(false)
const submitAction = createAsyncActionGuard()
const potProfileAction = createAsyncActionGuard()
const restrictedPlatform = isRestrictedMiniProgram()
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()
const formData = ref(createInitialPlantForm())
const plantId = computed(() => String(props.plantId || '').trim())
const isEditMode = computed(() => props.mode === 'edit' && Boolean(plantId.value))
const catalogPlantId = computed(() => String(props.initialCatalogPlantId || '').trim())
const pageTitle = computed(() => (isEditMode.value ? '编辑植物' : '添加植物'))
const pageIdPrefix = computed(() => (isEditMode.value ? 'edit-plant' : 'add-plant'))
const formPanelId = computed(() => `${pageIdPrefix.value}-info-panel`)
const formTitle = computed(() => (isEditMode.value ? '编辑植物信息' : '完善植物信息'))
const formSubtitle = computed(() => {
  if (isEditMode.value) {
    return '修改昵称、养护城市和备注等信息'
  }
  return restrictedPlatform
    ? '养护城市必填，其他信息可随时补充'
    : '养护城市必填，光照环境可稍后补充'
})
const submitButtonId = computed(() => `${pageIdPrefix.value}-submit-button`)
const submitText = computed(() => (isEditMode.value ? '保存修改' : '完成添加'))
const canEnterInfoStep = computed(() => Boolean(selectedPlant.value || recognizedName.value))
const identifiedPlantName = computed(() =>
  String(
    selectedPlant.value?.canonicalName ||
      selectedPlant.value?.displayName ||
      recognizedName.value ||
      ''
  ).trim()
)
const {
  useAIIdentify,
  identifyImage,
  handleAIConfirm,
  handleAIRetry,
  handleAIClose,
  clearPendingImage
} = useUserPlantIdentify({
  userStore,
  defaultPlants,
  formData,
  selectedPlant,
  recognizedName,
  identifyContext,
  showAIDialog,
  aiDialogRef,
  activeStep,
  openFeatureUnavailable
})

onBeforeUnmount(() => {
  clearPendingImage().catch(() => {})
})

async function initializeCreatePage() {
  if (catalogPlantId.value) {
    await initializeCatalogPlant()
    applyInitialPotProfile()
    return
  }
  if (props.initialIdentifyResult) {
    applyInitialIdentifyResult(props.initialIdentifyResult)
    return
  }
  if (props.initialIdentifyImagePath) {
    await identifyImage(props.initialIdentifyImagePath)
  }
}

function applyInitialIdentifyResult(result) {
  if (!result || initialIdentifyResultApplied.value) {
    return
  }
  formData.value = {
    ...formData.value,
    image: String(result.formData?.image || '').trim(),
    imageFileId: String(result.formData?.imageFileId || '').trim()
  }
  selectedPlant.value = result.selectedPlant || null
  recognizedName.value = String(result.recognizedName || '').trim()
  identifyContext.value = result.identifyContext
    ? {
        ...result.identifyContext,
        selectedPlant: result.identifyContext.selectedPlant || result.selectedPlant || null
      }
    : null
  activeStep.value = INFO_STEP
  initialIdentifyResultApplied.value = true
}

function applyInitialPotProfile() {
  const initialPotProfile = props.initialPotProfile
  if (
    !initialPotProfile ||
    typeof initialPotProfile !== 'object' ||
    Array.isArray(initialPotProfile)
  ) {
    return
  }
  // 仅独立浇水跳转到“新增植物”时带入已经填写的盆型；不覆盖用户后续编辑。
  formData.value = {
    ...formData.value,
    potProfile: { ...initialPotProfile }
  }
}

async function initializeCatalogPlant() {
  try {
    const response = await fetchPlantCatalogDetail(catalogPlantId.value)
    if (response?.code !== HTTP_SUCCESS_CODE || !response.data) {
      uni.showToast({ title: '植物信息暂时无法加载，请稍后重试', icon: 'none' })
      return
    }
    selectedPlant.value = response.data
    activeStep.value = INFO_STEP
  } catch {
    uni.showToast({ title: '植物信息暂时无法加载，请稍后重试', icon: 'none' })
  }
}

onMounted(() => {
  if (isEditMode.value) {
    initializeEditPage()
    return
  }
  initializeCreatePage()
})

function handleBackPress() {
  return false
}

defineExpose({ handleBackPress })

async function initializeEditPage() {
  const cachedPlant = getCachedEditPlant()
  editFormDirty.value = false

  // 首页编辑入口已经持有同一登录用户的植物列表。先使用这份已归属的
  // 内存数据渲染表单，避免把身份校验和详情请求的耗时直接暴露为整页白屏。
  if (cachedPlant) {
    applyEditPlant(cachedPlant, { hydrateForm: true })
    loading.value = false
  } else {
    loading.value = true
    currentPlant.value = null
  }

  try {
    if (!(await userStore.ensureLogin({ prompt: true }))) {
      currentPlant.value = null
      formData.value = createInitialPlantForm()
      return
    }

    const response = await fetchUserPlant(Number(plantId.value))
    const plant = response?.code === HTTP_SUCCESS_CODE ? response.data : null
    if (!plant) {
      currentPlant.value = null
      formData.value = createInitialPlantForm()
      uni.showToast({ title: '未找到要编辑的植物', icon: 'none' })
      setTimeout(() => uni.navigateBack(), SUCCESS_NAV_DELAY_MS)
      return
    }

    applyEditPlant(plant, { hydrateForm: !editFormDirty.value })
  } catch {
    if (!cachedPlant) {
      uni.showToast({ title: '暂时无法加载植物信息，请检查网络后重试', icon: 'none' })
      setTimeout(() => uni.navigateBack(), SUCCESS_NAV_DELAY_MS)
    } else {
      uni.showToast({ title: '最新信息暂未同步，可继续编辑现有信息', icon: 'none' })
    }
  } finally {
    loading.value = false
  }
}

function getCachedEditPlant() {
  const scope = String(userStore.openid || userStore.userId || '').trim()
  if (!scope || plantStore.userPlantsScope !== scope) {
    return null
  }
  return plantStore.userPlants.find(item => String(item?.id || '') === plantId.value) || null
}

function applyEditPlant(plant, { hydrateForm = true } = {}) {
  const serverPlant = { ...plant, image: '' }
  plantStore.updateUserPlantLocal?.(serverPlant.id, serverPlant)
  currentPlant.value = currentPlant.value ? { ...currentPlant.value, ...serverPlant } : serverPlant
  if (hydrateForm) {
    formData.value = buildPlantFormFromUserPlant(serverPlant)
  }
}

function handleFormModelUpdate(nextFormData) {
  if (isEditMode.value) {
    editFormDirty.value = true
  }
  formData.value = nextFormData
}

watch(selectedPlant, plant => {
  if (!plant) {
    return
  }
  if (!formData.value.nickname.trim()) {
    formData.value.nickname = plant.canonicalName || ''
  }
  if (!formData.value.image && (plant.imageUrl || plant.imageFileId)) {
    formData.value = {
      ...formData.value,
      image: plant.imageUrl || '',
      imageFileId: plant.imageFileId || ''
    }
  }
})

watch(recognizedName, name => {
  if (name && !selectedPlant.value && !formData.value.nickname.trim()) {
    formData.value.nickname = name
  }
})

watch(
  () => props.initialIdentifyResult,
  value => {
    applyInitialIdentifyResult(value)
  }
)

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
  if (!isFeatureAvailable('watering')) {
    openFeatureUnavailable('watering')
    return
  }
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
    if (!(await userStore.ensureLogin({ prompt: true }))) {
      return
    }

    if (!isEditMode.value) {
      formData.value = { ...formData.value, potProfile: profile }
      potProfileEditorRef.value?.close()
      return
    }

    editFormDirty.value = true
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
  if (!isFeatureAvailable('storage')) {
    openFeatureUnavailable('image')
    return
  }
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
          editFormDirty.value = isEditMode.value || editFormDirty.value
          formData.value = { ...formData.value, image: path, imageFileId: '' }
        },
        fail: () => {
          editFormDirty.value = isEditMode.value || editFormDirty.value
          formData.value = { ...formData.value, image: path, imageFileId: '' }
        }
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
  if (!(await userStore.ensureLogin({ prompt: true }))) {
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
      userId: userStore.userId,
      includePhotos: !restrictedPlatform,
      includeLightEnvironment: !restrictedPlatform,
      includeAirEnvironment: !restrictedPlatform,
      includePotProfile: !restrictedPlatform
    })
    const requestPayload = restrictedPlatform
      ? buildRestrictedManualPlantPayload({
          formData: { ...formData.value, careLocation },
          recognizedName: recognizedName.value
        })
      : payload
    const response = await createUserPlant(requestPayload)
    if (response?.code !== HTTP_SUCCESS_CODE) {
      uni.showToast({ title: '暂时无法添加植物，请检查网络后重试', icon: 'none' })
      return
    }
    reportAnalyticsEvent(ANALYTICS_EVENTS.USER_NEW_PLANT_CREATED)
    const refreshResult = await plantStore.getUserPlants(1, 50)
    if (!refreshResult?.success) {
      uni.showToast({ title: '植物已保存，但列表暂时无法更新，请稍后重试', icon: 'none' })
      return
    }
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
  if (!(await userStore.ensureLogin({ prompt: true }))) {
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
      includePotProfile: false,
      includePhotos: false
    })
    if (!payload.photos) {
      delete payload.photos
    }
    const requestPayload = restrictedPlatform
      ? buildRestrictedManualPlantPayload({
          formData: { ...formData.value, careLocation },
          recognizedName: currentPlant.value.recognizedName || '',
          recordVersion: currentPlant.value.recordVersion
        })
      : payload
    const response = await patchUserPlant({ id: Number(plantId.value), ...requestPayload })
    if (response?.code !== HTTP_SUCCESS_CODE) {
      uni.showToast({ title: '暂时无法保存植物信息，请检查网络后重试', icon: 'none' })
      return
    }
    const refreshResult = await plantStore.getUserPlants(1, 50)
    if (!refreshResult?.success) {
      uni.showToast({ title: '信息已保存，但列表暂时无法更新，请稍后重试', icon: 'none' })
      return
    }
    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), SUCCESS_NAV_DELAY_MS)
  } catch {
    uni.showToast({ title: '暂时无法保存植物信息，请检查网络后重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>
