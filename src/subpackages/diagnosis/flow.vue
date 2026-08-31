<template>
  <Layout title="植物状况检查" left-action="back" background-class="bg-[#F8F6F0]">
    <view id="diagnosis-flow-page" class="min-h-screen bg-[#F8F6F0]">
      <DiagnoseFlow
        id="diagnosis-flow-page-content"
        :content-padding="true"
        :plant-id="plantId"
        :plant-catalog-id="plantCatalogId"
        :plant-name="plantName"
        :diagnosis-profile="diagnosisProfile"
        :entry-source="entrySource"
        @close="handleClose"
      />
    </view>
  </Layout>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import DiagnoseFlow from './diagnose-flow/DiagnoseFlow.vue'

const plantId = ref('')
const plantCatalogId = ref('')
const plantName = ref('')
const entrySource = ref('diagnose_tab')
const diagnosisProfile = ref('full')

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
