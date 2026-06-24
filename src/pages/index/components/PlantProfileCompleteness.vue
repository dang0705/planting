<template>
  <view
    class="flex size-5 flex-[0_0_20px] items-center justify-center rounded-full bg-[conic-gradient(#2d7a4f_var(--profile-completeness-angle),#dbe7df_0)]"
    :style="ringStyle"
    :title="`信息完整度 ${detail.score}%，点击查看说明`"
    @click.stop="emit('click')"
  >
    <view class="size-[14px] rounded-full bg-white" />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { getPlantProfileCompletenessDetail } from '@/utils/plant-profile-completeness.js'

const props = defineProps({
  plant: { type: Object, required: true }
})
const emit = defineEmits(['click'])
const SCORE_MIN = 0
const SCORE_MAX = 100
const FULL_CIRCLE_DEGREES = 360
const SCORE_TO_DEGREES = FULL_CIRCLE_DEGREES / SCORE_MAX

const detail = computed(() => getPlantProfileCompletenessDetail(props.plant))
const ringStyle = computed(() => ({
  '--profile-completeness-angle': `${
    Math.max(SCORE_MIN, Math.min(SCORE_MAX, detail.value.score)) * SCORE_TO_DEGREES
  }deg`
}))
</script>
