<template>
  <view
    :id="id"
    :class="[
      'rounded-2xl border p-[13px]',
      selected ? 'border-brand bg-[#e8f5e9]' : 'border-[rgba(45,122,79,0.15)] bg-white',
      disabled ? 'pointer-events-none opacity-60' : ''
    ]"
    @click="handleSelect"
  >
    <slot />
  </view>
</template>

<script setup>
const props = defineProps({
  id: { type: String, required: true },
  selected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['select'])

function handleSelect() {
  if (props.disabled) {
    return
  }
  emit('select')
}
</script>
