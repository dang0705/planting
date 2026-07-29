<template>
  <Layout title="编辑植物" left-action="back" background-class="bg-[#f8faf9]">
    <view class="min-h-screen bg-[#f8faf9] pb-5">
      <view v-if="loading" class="flex min-h-screen items-center justify-center px-6">
        <text class="text-sm text-gray-500">正在加载植物信息...</text>
      </view>

      <PlantInfoStepPanel
        v-else-if="currentPlant"
        panel-id="edit-plant-info-panel"
        id-prefix="edit-plant"
        title="编辑植物信息"
        subtitle="修改昵称、养护城市、光照和备注等信息"
        :model-value="formData"
        :city-error="formErrors.careLocation"
        :active-step="INFO_STEP"
        :submitting="submitting"
        submit-button-id="edit-plant-submit-button"
        submit-text="保存修改"
        submitting-text="保存中..."
        @update:model-value="formData = $event"
        @upload-photo="uploadPhoto"
        @city-change="formErrors.careLocation = ''"
        @submit="submitForm"
      />

      <view v-else class="flex min-h-screen items-center justify-center px-6">
        <text class="text-sm text-gray-500">请先登录并选择一株植物后再编辑</text>
      </view>

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
import { onMounted, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import { patchUserPlant } from '@/api/plants-http.js'
import LoginModal from '@/components/LoginModal.vue'
import { ONE_MEGA_BYTE } from '@/constants'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { normalizePlantCareLocation } from '@/utils/plant-care-location.js'
import { invalidateUserPlantsQuery } from '@/vue-query/plants/queries/user-plants.js'
import PlantInfoStepPanel from '../add-plant/components/PlantInfoStepPanel.vue'
import {
  buildPlantFormFromUserPlant,
  createInitialPlantForm
} from '../add-plant/components/plant-form-model.js'
import { buildPlantSubmitPayload } from '../add-plant/components/plant-submit.js'

const MISSING_PLANT_NAV_DELAY_MS = 500
const NOT_FOUND_NAV_DELAY_MS = 800
const INFO_STEP = 1
const FIRST_IMAGE_INDEX = 0
const IMAGE_SIZE_LIMIT_MB = 5
const HTTP_SUCCESS_CODE = 200
const SUCCESS_NAV_DELAY_MS = 1000

const plantStore = usePlantStore()
const userStore = useUserStore()

const editPlantId = ref('')
const currentPlant = ref(null)
const loading = ref(true)
const submitting = ref(false)
const showLogin = ref(false)
const loginMsg = ref('编辑植物需要先登录')
const formErrors = reactive({ careLocation: '' })
const formData = ref(createInitialPlantForm())

onLoad(options => {
  editPlantId.value = String(options?.id || '').trim()
})

onMounted(() => {
  initializePage()
})

async function initializePage() {
  if (!editPlantId.value) {
    uni.showToast({ title: '缺少植物信息', icon: 'none' })
    setTimeout(() => uni.navigateBack(), MISSING_PLANT_NAV_DELAY_MS)
    return
  }
  loading.value = true
  currentPlant.value = null
  if (!(await userStore.ensureLogin())) {
    loginMsg.value = '编辑植物需要先登录'
    showLogin.value = true
    loading.value = false
    return
  }
  await invalidateUserPlantsQuery()
  await plantStore.getUserPlants()
  const plant = plantStore.userPlants.find(item => String(item.id) === editPlantId.value)
  if (!plant) {
    loading.value = false
    uni.showToast({ title: '未找到要编辑的植物', icon: 'none' })
    setTimeout(() => uni.navigateBack(), NOT_FOUND_NAV_DELAY_MS)
    return
  }
  currentPlant.value = plant
  formData.value = buildPlantFormFromUserPlant(plant)
  loading.value = false
}

function handleLoginSuccess() {
  showLogin.value = false
  initializePage()
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
  if (submitting.value || !currentPlant.value) {
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
      userId: userStore.userId
    })
    if (!payload.photos) {
      delete payload.photos
    }
    const response = await patchUserPlant({ id: Number(editPlantId.value), ...payload })
    if (response?.code !== HTTP_SUCCESS_CODE) {
      uni.showToast({ title: response?.message || '保存失败', icon: 'none' })
      return
    }
    await plantStore.getUserPlants()
    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), SUCCESS_NAV_DELAY_MS)
  } catch (error) {
    uni.showToast({ title: error?.message || '网络错误，请重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>
