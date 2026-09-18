<template>
  <Layout
    :title="pageTitle"
    background-class="bg-[#F8FAF9]"
    :header-style="headerStyle"
    custom-left-action
  >
    <template #left-action>
      <view
        id="diagnosis-flow-header-back-button"
        class="flex size-7 items-center justify-center"
        @click="handleClose"
      >
        <image :src="headerBackIcon" class="size-5" mode="aspectFit" />
      </view>
    </template>
    <template #title>
      <text
        class="block max-w-[220px] truncate text-xl font-medium leading-[30px]"
        :class="isResult ? 'text-white' : 'text-[#0A0A0A]'"
      >
        {{ pageTitle }}
      </text>
    </template>
    <template #right>
      <view class="size-7" />
    </template>
    <view id="diagnosis-flow-page" class="diagnosis-flow-page bg-[#F8FAF9]">
      <DiagnoseFlow
        v-if="diagnosisAvailable"
        id="diagnosis-flow-page-content"
        :content-padding="true"
        :plant-id="plantId"
        :plant-catalog-id="plantCatalogId"
        :plant-name="plantName"
        :diagnosis-profile="diagnosisProfile"
        :entry-source="entrySource"
        @close="handleClose"
        @result-state-change="isResult = $event"
      />
      <view
        v-else
        id="diagnosis-flow-unavailable"
        class="flex min-h-[520px] items-center justify-center px-6 text-center"
      >
        <text class="text-sm leading-6 text-[#667085]">当前端暂未开放 AI 植物诊断，敬请期待。</text>
      </view>
    </view>
    <FeatureUnavailableModal v-model="featureUnavailableVisible" :feature-key="openedFeatureKey" />
  </Layout>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import diagnosisBackIcon from '@/assets/diagnosis/diagnosis-upload.svg'
import outcomeBackIcon from '@/assets/diagnosis/outcome-back.svg'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import DiagnoseFlow from './diagnose-flow/DiagnoseFlow.vue'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isDiagnosisFlowAvailable } from '@/utils/platform-capabilities.js'

const plantId = ref('')
const plantCatalogId = ref('')
const plantName = ref('')
const entrySource = ref('diagnose_tab')
const diagnosisProfile = ref('full')
const isResult = ref(false)
const diagnosisAvailable = computed(() => isDiagnosisFlowAvailable())
const pageTitle = computed(() =>
  isResult.value ? '诊断结论' : plantName.value ? `诊断 - ${plantName.value}` : '诊断'
)
const headerStyle = computed(() =>
  isResult.value
    ? { background: '#2d7a4f' }
    : { background: '#f8faf9', borderBottom: '1px solid rgba(45,122,79,0.15)' }
)
const headerBackIcon = computed(() => (isResult.value ? outcomeBackIcon : diagnosisBackIcon))
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()

function decodeQueryValue(value) {
  const text = String(value || '')
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function normalizeEntrySource(value) {
  const source = decodeQueryValue(value)
  return ['plant_card', 'plant_detail', 'diagnose_tab'].includes(source) ? source : 'diagnose_tab'
}

function normalizeDiagnosisProfile(value) {
  return decodeQueryValue(value) === 'pest' ? 'pest' : 'full'
}

onLoad(options => {
  isResult.value = false
  plantId.value = decodeQueryValue(options?.plantId)
  plantCatalogId.value = decodeQueryValue(options?.plantCatalogId || options?.catalogPlantId)
  plantName.value = decodeQueryValue(options?.plantName)
  entrySource.value = normalizeEntrySource(options?.entrySource)
  diagnosisProfile.value = normalizeDiagnosisProfile(options?.diagnosisProfile)
  if (!diagnosisAvailable.value) {
    openFeatureUnavailable('diagnosis')
  }
})

function handleClose() {
  uni.navigateBack({ delta: 1 })
}
</script>

<style scoped>
.diagnosis-flow-page {
  box-sizing: border-box;
  height: calc(100vh - var(--app-header-height));
  min-height: 0;
  overflow: hidden;
}
</style>
