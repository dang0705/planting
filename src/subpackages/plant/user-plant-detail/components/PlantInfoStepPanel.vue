<template>
  <view class="box-border flex h-full min-h-0 flex-col bg-[#f8faf9]">
    <scroll-view
      :id="`${idPrefix}-info-scroll`"
      scroll-y
      class="box-border min-h-0 flex-1 px-4 pb-4 pt-4"
    >
      <view :id="panelId" class="mb-4">
        <text class="block text-[24px] font-bold leading-8 text-[#1f2937]">
          {{ title }}
        </text>
        <text class="mt-1 block text-sm leading-5 text-[#6b7280]">
          {{ subtitle }}
        </text>
      </view>

      <PlantForm
        :model-value="modelValue"
        :city-error="cityError"
        :active-step="activeStep"
        :id-prefix="idPrefix"
        :show-light-environment="showLightEnvironment"
        class="mb-5"
        @update:model-value="emit('update:modelValue', $event)"
        @upload-photo="emit('upload-photo')"
        @city-change="emit('city-change', $event)"
        @open-pot-profile="emit('open-pot-profile')"
      >
        <template #care-settings>
          <slot name="after-form" />
        </template>
      </PlantForm>
    </scroll-view>

    <view
      :id="`${idPrefix}-submit-bar`"
      class="box-border shrink-0 border-t border-[#e1e9e3] bg-[#f8faf9] px-4 pt-3"
      :style="{ paddingBottom: `${bottomPadding}px` }"
    >
      <view :class="showBack ? 'flex gap-3' : 'block'">
        <button
          v-if="showBack"
          :id="backButtonId"
          class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
          :disabled="submitting"
          @click="emit('back')"
        >
          {{ backText }}
        </button>
        <button
          :id="submitButtonId"
          class="m-0 h-[52px] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          :class="[showBack ? 'flex-[2]' : 'w-full', { 'opacity-50': submitting }]"
          :disabled="submitting"
          @click="emit('submit')"
        >
          {{ submitting ? submittingText : submitText }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import PlantForm from './PlantForm.vue'

defineProps({
  panelId: { type: String, required: true },
  idPrefix: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, required: true },
  modelValue: { type: Object, required: true },
  cityError: { type: String, default: '' },
  showBack: { type: Boolean, default: false },
  backText: { type: String, default: '上一步' },
  backButtonId: { type: String, default: '' },
  submitText: { type: String, required: true },
  submittingText: { type: String, default: '保存中...' },
  submitButtonId: { type: String, required: true },
  submitting: { type: Boolean, default: false },
  activeStep: { type: Number, default: 1 },
  bottomPadding: { type: Number, default: 48 },
  showLightEnvironment: { type: Boolean, default: true }
})

const emit = defineEmits([
  'update:modelValue',
  'upload-photo',
  'city-change',
  'open-pot-profile',
  'back',
  'submit'
])
</script>
