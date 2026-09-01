<template>
  <Layout title="植物状况检查" left-action="back" background-class="bg-[#F8F6F0]">
    <view id="diagnosis-flow-page" class="min-h-screen bg-[#F8F6F0]">
      <DiagnoseFlow
        v-if="!restrictedPlatform"
        id="diagnosis-flow-page-content"
        :content-padding="true"
        :plant-id="plantId"
        :plant-catalog-id="plantCatalogId"
        :plant-name="plantName"
        :diagnosis-profile="diagnosisProfile"
        :entry-source="entrySource"
        @close="handleClose"
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
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import DiagnoseFlow from './diagnose-flow/DiagnoseFlow.vue'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isRestrictedMiniProgram } from '@/utils/platform-capabilities.js'

const plantId = ref('')
const plantCatalogId = ref('')
const plantName = ref('')
const entrySource = ref('diagnose_tab')
const diagnosisProfile = ref('full')
const restrictedPlatform = isRestrictedMiniProgram()
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
  if (restrictedPlatform) {
    openFeatureUnavailable('diagnosis')
  }
  plantId.value = decodeQueryValue(options?.plantId)
  plantCatalogId.value = decodeQueryValue(options?.plantCatalogId || options?.catalogPlantId)
  plantName.value = decodeQueryValue(options?.plantName)
  entrySource.value = normalizeEntrySource(options?.entrySource)
  diagnosisProfile.value = normalizeDiagnosisProfile(options?.diagnosisProfile)
})

function handleClose() {
  uni.navigateBack({ delta: 1 })
}
</script>
