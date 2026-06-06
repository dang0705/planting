<template>
  <view
    :id="id"
    class="care-behavior-marker flex h-2 w-2 items-center justify-center"
  >
    <view
      v-if="active"
      class="care-behavior-dot h-1.5 w-1.5 rounded-full"
      :class="dotClass"
    />
  </view>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false },
  dotClass: { type: String, default: '' },
  id: { type: String, default: '' }
})
</script>
