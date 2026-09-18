<template>
  <view
    :id="id"
    :class="[
      orientation === 'vertical'
        ? 'flex flex-col overflow-hidden rounded-2xl border p-0'
        : 'flex min-h-[86px] items-center gap-3 rounded-2xl border p-[13px]',
      selected ? 'border-brand bg-[#e8f5e9]' : 'border-[rgba(45,122,79,0.15)] bg-white',
      disabled ? 'pointer-events-none opacity-50' : ''
    ]"
    @click="handleSelect"
  >
    <view
      :class="[
        orientation === 'vertical'
          ? compact
            ? 'flex aspect-[2/1] w-full items-center justify-center'
            : 'flex aspect-[2/1] w-full items-center justify-center'
          : 'h-[61px] w-[88px] shrink-0 overflow-hidden rounded-xl'
      ]"
    >
      <view
        v-if="orientation === 'vertical'"
        class="aspect-[2/1] w-3/4 shrink-0 overflow-hidden rounded-xl"
      >
        <view v-if="isUnknown" class="flex h-full w-full items-center justify-center">
          <text class="text-3xl font-semibold leading-none text-[#74907e]">?</text>
        </view>
        <AirflowScene
          v-else
          :scene="scene"
          :motion-profile="motionProfile"
          :thumbnail-aspect-ratio="orientation === 'vertical' ? 2 : 88 / 61"
          thumbnail
          class="h-full w-full"
        />
      </view>
      <view v-else-if="isUnknown" class="flex h-full w-full items-center justify-center">
        <text class="text-3xl font-semibold leading-none text-[#74907e]">?</text>
      </view>
      <AirflowScene
        v-else
        :scene="scene"
        :motion-profile="motionProfile"
        :thumbnail-aspect-ratio="88 / 61"
        thumbnail
        class="h-full w-full"
      />
    </view>
    <view
      :class="[
        orientation === 'vertical'
          ? compact
            ? 'box-border min-h-[71px] w-full overflow-hidden p-2'
            : descriptionLines > 1
              ? 'box-border min-h-[71px] w-full overflow-hidden p-2'
              : 'box-border min-h-[54px] w-full overflow-hidden p-2'
          : 'min-w-0 flex-1',
        isUnknown ? 'text-center' : ''
      ]"
    >
      <text class="block line-clamp-1 text-sm font-medium leading-5 text-[#0a0a0a]">{{
        label
      }}</text>
      <text
        v-if="!isUnknown && description"
        class="mt-[2px] block text-xs leading-[16.5px] text-[#5a7a68]"
        :class="compact || descriptionLines > 1 ? 'line-clamp-2' : 'line-clamp-1'"
      >
        {{ description }}
      </text>
    </view>
    <view
      v-if="showSelectionIndicator"
      class="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
      :class="
        selected
          ? 'border-brand bg-brand text-xs font-bold text-white'
          : 'border-[rgba(45,122,79,0.2)] bg-white'
      "
      aria-hidden="true"
    >
      <text v-if="selected" class="leading-5">✓</text>
    </view>
  </view>
</template>

<script setup>
import AirflowScene from '@/components/AirflowScene.vue'

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, required: true },
  scene: { type: String, default: 'closed' },
  motionProfile: { type: String, default: '' },
  isUnknown: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  showSelectionIndicator: { type: Boolean, default: true },
  orientation: {
    type: String,
    default: 'horizontal',
    validator: value => ['horizontal', 'vertical'].includes(value)
  },
  compact: { type: Boolean, default: false },
  descriptionLines: { type: Number, default: 1 },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['select'])

function handleSelect() {
  if (!props.disabled) {
    emit('select')
  }
}
</script>
