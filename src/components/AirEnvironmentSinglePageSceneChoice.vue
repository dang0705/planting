<template>
  <view
    :id="id"
    class="flex flex-col overflow-hidden rounded-2xl border p-0"
    :class="[
      selected ? 'border-brand bg-[#e8f5e9]' : 'border-[rgba(45,122,79,0.15)] bg-white',
      disabled ? 'pointer-events-none opacity-50' : ''
    ]"
    :aria-label="label"
    @click="handleSelect"
  >
    <view class="flex w-full shrink-0 items-center justify-center py-2">
      <view
        class="aspect-[2/1] shrink-0 overflow-hidden rounded-xl"
        :class="sceneWidthClass"
        :style="{ aspectRatio: sceneAspectRatio }"
      >
        <view v-if="isUnknown" class="flex h-full w-full items-center justify-center">
          <text class="text-3xl font-semibold leading-none text-[#74907e]">?</text>
        </view>
        <DeviceAirflowScene
          v-else-if="Array.isArray(deviceSources)"
          :sources="deviceSources"
          class="h-full w-full"
        />
        <AirflowScene
          v-else
          :scene="scene"
          :motion-profile="motionProfile"
          thumbnail
          :thumbnail-aspect-ratio="2"
          class="h-full w-full"
        />
      </view>
    </view>
    <view
      class="box-border min-h-[72px] w-full min-w-0 p-2"
      :class="isUnknown ? 'text-center' : ''"
    >
      <text class="block line-clamp-1 text-sm font-medium leading-5 text-[#0a0a0a]">
        {{ label }}
      </text>
      <text
        v-if="!isUnknown && description"
        class="mt-[2px] block line-clamp-2 text-xs leading-[16.5px] text-[#5a7a68]"
      >
        {{ description }}
      </text>
    </view>
  </view>
</template>

<script setup>
import AirflowScene from '@/components/AirflowScene.vue'
import DeviceAirflowScene from '@/components/DeviceAirflowScene.vue'

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, required: true },
  scene: { type: String, default: 'closed' },
  motionProfile: { type: String, default: '' },
  sceneAspectRatio: { type: [Number, String], default: 2 },
  sceneWidthClass: { type: String, default: 'w-3/4' },
  deviceSources: { type: Array, default: null },
  isUnknown: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['select'])

function handleSelect() {
  if (!props.disabled) {
    emit('select')
  }
}
</script>
