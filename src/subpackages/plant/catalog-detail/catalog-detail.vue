<template>
  <PlantCatalogDetailView v-if="ready" :plant-id="plantId" />
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import PlantCatalogDetailView from './components/PlantCatalogDetailView.vue'

const plantId = ref('')
const ready = ref(false)

onLoad(options => {
  plantId.value = String(options?.plantId || '').trim()
  ready.value = true
})
</script>
