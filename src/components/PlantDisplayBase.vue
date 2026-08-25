<template>
  <view class="overflow-hidden bg-[#f1f8f4]" :class="containerClass">
    <image
      v-if="imageSource"
      :id="`plant-display-image-${plant.id || 'unknown'}`"
      :src="imageSource"
      class="h-full w-full"
      mode="aspectFill"
      @error="handleImageError"
    />
    <view v-else class="relative h-full w-full bg-[#f1f8f4]">
      <view
        class="absolute left-1/2 top-1/2 h-[58px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2d7a4f]"
      />
      <view
        class="absolute left-1/2 top-1/2 h-[18px] w-[28px] -translate-x-[80%] -translate-y-1/2 rotate-[-22deg] rounded-[999px_0_999px_0] bg-[#2d7a4f]"
      />
      <view
        class="absolute left-1/2 top-1/2 h-[18px] w-[28px] translate-x-[20%] -translate-y-1/2 rotate-[22deg] scale-x-[-1] rounded-[999px_0_999px_0] bg-[#2d7a4f]"
      />
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useFileUrl } from '@/composables/useCloudFile.js'

const props = defineProps({
  plant: { type: Object, required: true },
  containerClass: { type: String, default: 'h-[56px] w-[56px] rounded-lg' }
})

const fileId = computed(() => props.plant?.imageFileId || props.plant?.photos?.[0] || '')
const { url, resolve, refresh } = useFileUrl()
const imageRetryCount = ref(0)
const imageSource = computed(() => url.value || (fileId.value ? '' : props.plant?.image || ''))

watch(
  fileId,
  nextFileId => {
    imageRetryCount.value = 0
    resolve(nextFileId)
  },
  { immediate: true }
)

async function handleImageError() {
  if (!fileId.value || imageRetryCount.value >= 1) {
    url.value = ''
    return
  }
  imageRetryCount.value += 1
  await refresh()
}
</script>
