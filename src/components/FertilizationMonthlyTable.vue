<template>
  <view :id="tableId">
    <view class="w-full overflow-hidden rounded-xl border border-[#E7E3D8]">
      <view class="flex w-full border-b border-[#E7E3D8] bg-[#F1F5F2]">
        <view class="min-w-0 flex-1 p-2.5">
          <text class="text-xs font-semibold text-gray-700">月份</text>
        </view>
        <view class="min-w-0 flex-1 border-l border-[#E7E3D8] p-2.5">
          <text class="text-xs font-semibold text-gray-700">液体肥</text>
        </view>
        <view class="min-w-0 flex-1 border-l border-[#E7E3D8] p-2.5">
          <text class="text-xs font-semibold text-gray-700">缓释肥</text>
        </view>
      </view>

      <view class="grid w-full grid-cols-3" style="grid-template-rows: repeat(12, minmax(0, auto))">
        <view
          v-for="(row, rowIndex) in monthlyRows"
          :key="row.month"
          :style="gridCellStyle(1, rowIndex, 1)"
          class="min-w-0 border-b border-[#E7E3D8] bg-[#FAFAF7] p-2.5"
        >
          <text class="text-xs text-gray-700">{{ row.month }}月</text>
        </view>
        <view
          v-for="group in liquidGroups"
          :key="`liquid-${group.startIndex}`"
          :style="gridCellStyle(2, group.startIndex, group.span)"
          class="min-w-0 border-b border-l border-[#E7E3D8] p-2.5"
        >
          <text v-if="group.cell" class="block break-words text-xs leading-5 text-gray-700">
            {{ group.cell.displayText }}
          </text>
          <text v-else class="text-xs leading-5 text-gray-400">{{ emptyText('liquid') }}</text>
        </view>
        <view
          v-for="group in slowReleaseGroups"
          :key="`slow-release-${group.startIndex}`"
          :style="gridCellStyle(3, group.startIndex, group.span)"
          class="min-w-0 border-b border-l border-[#E7E3D8] p-2.5"
        >
          <text v-if="group.cell" class="block break-words text-xs leading-5 text-gray-700">
            {{ group.cell.displayText }}
          </text>
          <text v-else class="text-xs leading-5 text-gray-400">{{ emptyText('slowRelease') }}</text>
        </view>
      </view>
    </view>

    <view
      v-if="monthly.scopeLabel || monthly.scopeGuidance || monthly.choiceGuidance"
      class="mt-3 rounded-xl bg-[#F8F6F0] p-3"
    >
      <text class="block text-xs font-semibold leading-5 text-gray-600">
        适用范围：{{ monthly.scopeLabel }}
      </text>
      <text v-if="monthly.choiceGuidance" class="mt-1 block text-[11px] leading-4 text-gray-500">
        {{ monthly.choiceGuidance }}
      </text>
      <text v-if="monthly.scopeGuidance" class="mt-1 block text-[11px] leading-4 text-gray-500">
        {{ monthly.scopeGuidance }}
      </text>
    </view>
    <view v-if="monthly.publicNote" class="mt-3 rounded-xl bg-[#F8F6F0] p-3">
      <text class="text-xs leading-5 text-gray-600">{{ monthly.publicNote }}</text>
    </view>
    <text v-if="monthly.sourceNames.length" class="mt-2 block text-[11px] leading-4 text-gray-400">
      数据来源：{{ monthly.sourceNames.join('、') }}
    </text>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const EMPTY_TEXT = {
  liquid: '暂无可靠时间间隔',
  slowRelease: '暂无可靠时间间隔'
}

function cellSignature(cell) {
  if (!cell) {
    return '__empty__'
  }
  return JSON.stringify({
    displayText: cell.displayText || '',
    schedule: cell.schedule || null
  })
}

function buildGroups(rows, key) {
  const groups = []
  rows.forEach((row, index) => {
    const cell = row?.[key] || null
    const signature = cellSignature(cell)
    const previous = groups[groups.length - 1]
    if (previous && previous.signature === signature) {
      previous.span += 1
      return
    }
    groups.push({ startIndex: index, span: 1, cell, signature })
  })
  return groups
}

function gridCellStyle(column, startIndex, span) {
  return `grid-column: ${column}; grid-row: ${startIndex + 1} / span ${span};`
}

const props = defineProps({
  monthly: {
    type: Object,
    required: true
  },
  tableId: {
    type: String,
    default: 'fertilization-monthly-table'
  }
})

const monthlyRows = computed(() => (Array.isArray(props.monthly?.rows) ? props.monthly.rows : []))
const liquidGroups = computed(() => buildGroups(monthlyRows.value, 'liquid'))
const slowReleaseGroups = computed(() => buildGroups(monthlyRows.value, 'slowRelease'))

function emptyText(column) {
  return EMPTY_TEXT[column] || '暂无可靠规则'
}
</script>
