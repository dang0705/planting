<template>
  <view :id="id" class="relative min-h-0 flex-1 overflow-hidden">
    <view class="h-full min-h-0 overflow-hidden" :class="viewportClass" :style="viewportStyle">
      <view
        class="flex h-full min-h-0 w-full transition-transform duration-300 ease-in-out will-change-transform"
        :style="trackStyle"
      >
        <view
          v-for="index in stepIndexes"
          :key="index"
          class="min-h-0 w-full shrink-0 grow-0 basis-full overflow-x-hidden"
          :class="[itemClass, index === safeActiveIndex ? activeItemClass : inactiveItemClass]"
        >
          <slot
            name="step"
            :index="index"
            :active="index === safeActiveIndex"
            :item="items[index]"
          />
        </view>
      </view>
    </view>

    <view class="absolute bottom-0 left-0 right-0 z-30">
      <slot name="footer" :index="safeActiveIndex" :item="items[safeActiveIndex]" />
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const ZERO = 0
const LAST_STEP_OFFSET = 1
const STEP_TRANSLATE_PERCENT = 100

const props = defineProps({
  id: { type: String, default: '' },
  activeIndex: { type: Number, default: ZERO },
  stepCount: { type: Number, default: ZERO },
  items: { type: Array, default: () => [] },
  viewportClass: { type: [String, Array, Object], default: '' },
  viewportStyle: { type: [String, Object, Array], default: '' },
  itemClass: { type: [String, Array, Object], default: '' },
  activeItemClass: { type: [String, Array, Object], default: '' },
  inactiveItemClass: {
    type: [String, Array, Object],
    default: 'pointer-events-none h-0 overflow-hidden'
  }
})

const resolvedStepCount = computed(() =>
  props.items.length ? props.items.length : Math.max(Number(props.stepCount) || ZERO, ZERO)
)

const safeActiveIndex = computed(() => {
  const lastIndex = Math.max(resolvedStepCount.value - LAST_STEP_OFFSET, ZERO)
  return Math.min(Math.max(Number(props.activeIndex) || ZERO, ZERO), lastIndex)
})

const stepIndexes = computed(() =>
  Array.from({ length: resolvedStepCount.value }, (_, index) => index)
)

const trackStyle = computed(
  () => `transform: translateX(-${safeActiveIndex.value * STEP_TRANSLATE_PERCENT}%);`
)
</script>
