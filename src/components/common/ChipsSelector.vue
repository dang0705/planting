<template>
  <view class="flex flex-wrap gap-3">
    <button
      v-for="item in items"
      :key="resolveItemKey(item)"
      class="m-0 flex min-h-[44px] min-w-0 items-center justify-center rounded-2xl border border-solid px-4 py-3 text-center transition-colors"
      :id="`${idPrefix}-${resolveItemId(item)}`"
      :class="isSelected(item) ? 'border-primary bg-secondary' : '!border-[#f3f4f6] !bg-[#f9fafb]'"
      @click="toggle(item)"
    >
      <text
        class="block w-full truncate text-[14px] leading-5"
        :class="isSelected(item) ? 'font-semibold text-primary' : 'font-medium text-[#364153]'"
      >
        {{ resolveItemLabel(item) }}
      </text>
    </button>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  modelValue: { type: [String, Number, Array, Object], default: null },
  multiple: { type: Boolean, default: false },
  valueKey: { type: String, default: 'value' },
  labelKey: { type: String, default: 'label' },
  itemIdKey: { type: String, default: 'id' },
  idPrefix: { type: String, default: 'chips-selector-option' },
  getItemValue: { type: Function, default: null },
  getItemLabel: { type: Function, default: null },
  getItemId: { type: Function, default: null }
})

const emit = defineEmits(['update:modelValue', 'change'])

function resolveItemValue(item) {
  const resolved = props.getItemValue
    ? props.getItemValue(item)
    : (item?.[props.valueKey] ??
      item?.locationKey ??
      item?.[props.labelKey] ??
      item?.value ??
      item?.id)
  return resolved === undefined || resolved === null ? '' : String(resolved)
}

function resolveItemLabel(item) {
  const resolved = props.getItemLabel ? props.getItemLabel(item) : item?.[props.labelKey]
  return resolved === null || resolved === undefined ? '' : String(resolved).trim()
}

function resolveItemId(item) {
  if (props.getItemId) {
    const customId = props.getItemId(item)
    if (customId !== undefined && customId !== null && customId !== '') {
      return String(customId)
    }
  }
  const resolved = item?.[props.itemIdKey] ?? resolveItemValue(item)
  return String(resolved || '')
}

function resolveItemKey(item) {
  return (
    resolveItemValue(item) || resolveItemLabel(item) || resolveItemId(item) || JSON.stringify(item)
  )
}

const normalizedValues = computed(() => {
  const rawValues = Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue]
  return rawValues
    .map(value => (value === undefined || value === null ? '' : String(value)))
    .filter(Boolean)
})

function isSelected(item) {
  const value = resolveItemValue(item)
  if (!value) {
    return false
  }
  return normalizedValues.value.includes(value)
}

function toggle(item) {
  const value = resolveItemValue(item)
  if (!value) {
    return
  }

  if (!props.multiple) {
    emit('update:modelValue', value)
    emit('change', {
      value,
      item,
      selected: true
    })
    return
  }

  const current = new Set(normalizedValues.value)
  const nextSelected = current.has(value)
  if (nextSelected) {
    current.delete(value)
  } else {
    current.add(value)
  }
  const nextValue = [...current]
  emit('update:modelValue', nextValue)
  emit('change', {
    value: nextValue,
    item,
    selected: !nextSelected
  })
}
</script>
