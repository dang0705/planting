<template>
  <UserPlantDetailView v-if="ready && mode === 'view'" :plant-id="Number(plantId)" />
  <UserPlantDetailForm v-else-if="ready" ref="formRef" :mode="mode" :plant-id="plantId" />
</template>

<script setup>
import { ref } from 'vue'
import { onBackPress, onLoad } from '@dcloudio/uni-app'
import UserPlantDetailForm from './components/UserPlantDetailForm.vue'
import UserPlantDetailView from './components/UserPlantDetailView.vue'

const VALID_MODES = ['create', 'edit', 'view']
const mode = ref('create')
const plantId = ref('')
const ready = ref(false)
const formRef = ref(null)

onLoad(options => {
  plantId.value = String(options?.id || '').trim()
  mode.value = normalizeMode(options?.mode, plantId.value)
  ready.value = true
})

onBackPress(() => formRef.value?.handleBackPress?.() || false)

function normalizeMode(requestedMode, id) {
  const normalizedMode = String(requestedMode || '').trim()
  if (VALID_MODES.includes(normalizedMode) && (normalizedMode === 'create' || id)) {
    return normalizedMode
  }
  return id ? 'view' : 'create'
}
</script>
