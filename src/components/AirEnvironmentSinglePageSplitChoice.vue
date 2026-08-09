<template>
  <view :id="id" class="mt-3 flex items-stretch gap-2">
    <view :class="['min-w-0', sceneColumnClass]">
      <AirEnvironmentSinglePageSceneChoice
        :id="sceneId"
        :label="label"
        :description="description"
        :scene="scene"
        :motion-profile="motionProfile"
        :scene-aspect-ratio="sceneAspectRatio"
        :scene-width-class="sceneWidthClass"
        :device-sources="deviceSources"
        :is-unknown="isUnknown"
        :selected="sceneSelectable && selected"
        :disabled="disabled"
        @select="handleSceneSelect"
      />
    </view>

    <view
      :id="`${id}-controls`"
      :class="['flex min-w-0 flex-col gap-2', controlsColumnClass]"
    >
      <slot />
    </view>
  </view>
</template>

<script setup>
import AirEnvironmentSinglePageSceneChoice from '@/components/AirEnvironmentSinglePageSceneChoice.vue'

const props = defineProps({
  id: { type: String, required: true },
  sceneId: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  scene: { type: String, default: 'closed' },
  motionProfile: { type: String, default: '' },
  sceneAspectRatio: { type: [Number, String], default: 2 },
  sceneWidthClass: { type: String, default: 'w-3/4' },
  sceneColumnClass: { type: String, default: 'flex-1' },
  controlsColumnClass: { type: String, default: 'flex-1' },
  deviceSources: { type: Array, default: null },
  isUnknown: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  sceneSelectable: { type: Boolean, default: false }
})
const emit = defineEmits(['select'])

function handleSceneSelect() {
  if (props.sceneSelectable && !props.disabled) {
    emit('select')
  }
}
</script>
