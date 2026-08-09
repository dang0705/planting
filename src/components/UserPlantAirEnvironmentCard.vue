<template>
  <view class="mb-3 bg-white p-4">
    <view class="mb-4">
      <text class="block text-base font-semibold text-gray-800">空气环境</text>
      <text class="mt-1 block text-xs leading-5 text-[#5a7a68]">
        记录换气、植物周围空间和设备风，便于后续养护时参考
      </text>
    </view>

    <view v-if="loading" class="py-4 text-center">
      <text class="text-sm text-[#6b7280]">正在读取空气环境…</text>
    </view>
    <template v-else>
      <AirEnvironmentAssessment
        :id-prefix="idPrefix"
        layout-mode="single-page"
        height-mode="content"
        :model-value="draft"
        panel-height="650"
        :disabled="saving"
        :completion-label="saving ? '保存中…' : '保存空气环境'"
        :completion-id="`${idPrefix}-save`"
        @change="handleChange"
        @complete="save"
      />
      <text
        v-if="loadError"
        :id="`${idPrefix}-load-error`"
        class="mt-3 block text-xs text-[#b45309]"
      >
        {{ loadError }}，可调整后重新保存
      </text>
      <text
        v-if="saveError"
        :id="`${idPrefix}-save-error`"
        class="mt-3 block text-xs text-[#b91c1c]"
      >
        {{ saveError }}，当前填写内容仍保留在页面中
      </text>
    </template>
  </view>
</template>

<script setup>
import { watch, ref } from 'vue'
import AirEnvironmentAssessment from '@/components/AirEnvironmentAssessment.vue'
import { usePlantStore } from '@/store/plants.js'
import { useUserPlantAirEnvironment } from '@/composables/useUserPlantAirEnvironment.js'
import { isAirEnvironmentAnswerReady } from '@/utils/air-environment.js'

const HTTP_OK = 200

const props = defineProps({
  plant: { type: Object, default: null },
  idPrefix: { type: String, default: 'user-plant-detail-air-environment' }
})
const emit = defineEmits(['saved'])
const plantStore = usePlantStore()
const airEnvironment = useUserPlantAirEnvironment({ plantStore })
const { draft, loading, loadError } = airEnvironment
const saving = ref(false)
const saveError = ref('')

function loadForPlant(plant) {
  saveError.value = ''
  airEnvironment.reset(plant?.id)
  if (plant?.id) {
    airEnvironment.load(plant.id, { preserveDraft: true }).catch(() => undefined)
  }
}

function handleChange(value) {
  airEnvironment.setDraft(value)
  saveError.value = ''
}

async function save() {
  const plantId = props.plant?.id
  if (!plantId) {
    return
  }
  if (!isAirEnvironmentAnswerReady(draft.value)) {
    saveError.value = '请完成三个空气环境问题后再保存'
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const response = await airEnvironment.save(plantId, {
      careLocationId: props.plant?.careLocationId || '',
      locationKey: props.plant?.locationKey || ''
    })
    if (response?.code !== HTTP_OK) {
      saveError.value = response?.message || '保存失败，请重试'
      return
    }
    uni.showToast({ title: '已保存', icon: 'success' })
    emit('saved', response.data)
  } catch (error) {
    saveError.value = error?.message || '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

watch(
  () => props.plant?.id,
  () => loadForPlant(props.plant),
  { immediate: true }
)
</script>
