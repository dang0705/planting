<template>
  <BottomSheet
    ref="popupRef"
    panel-id="pot-profile-editor-sheet"
    content-id="pot-profile-editor-content"
    close-id="pot-profile-editor-close-button"
    confirm-id="pot-profile-editor-confirm-button"
    title="盆型与基质"
    subtitle="尺寸用于估算水量，基质用于修正保水与透气。"
    confirm-text="确认并保存"
    loading-text="保存中..."
    show-confirm
    :confirm-loading="saving"
    :on-confirm="save"
  >
    <view class="mt-3 rounded-[18px] border border-[#e1e9dd] bg-[#f7faf5] p-[13px]">
      <text class="block text-[14px] font-bold text-[#1f2933]">盆型尺寸</text>
      <view
        class="pot-canvas-shell relative mt-2 h-[231px] overflow-hidden rounded-[16px] border border-[#e1e9dd] bg-white"
      >
        <PotCanvas
          ref="potCanvasRef"
          :canvas-width="potCanvasSize.width"
          :canvas-height="potCanvasSize.height"
          :pot-top-diameter-cm="
            loading ? null : form.potTopDiameterCm ? Number(form.potTopDiameterCm) : 20
          "
          :pot-bottom-diameter-cm="
            loading ? null : form.potBottomDiameterCm ? Number(form.potBottomDiameterCm) : 10
          "
          :pot-height-cm="loading ? null : form.potHeightCm ? Number(form.potHeightCm) : 15"
          :substrate-composition="substrateComposition"
          :texture-map="textureMap"
          @update:pot-top-diameter-cm="value => (form.potTopDiameterCm = String(value))"
          @update:pot-bottom-diameter-cm="value => (form.potBottomDiameterCm = String(value))"
          @update:pot-height-cm="value => (form.potHeightCm = String(value))"
        />
      </view>

      <view class="mt-3 rounded-[16px] border border-[#e1e9dd] bg-[#f7faf5] p-3">
        <text class="mb-2 block text-[12px] font-semibold text-[#1f2933]">选择盆土构成</text>
        <view class="flex flex-wrap gap-2">
          <view
            v-for="option in substrateOptions"
            :key="option.value"
            class="flex items-center rounded-[12px] border px-2 py-1.5"
            :class="
              isSubstrateSelected(option.value)
                ? 'border-[#2f8f57] bg-[#e8f3ea]'
                : 'border-[#e1e9dd] bg-white'
            "
            @click="toggleSubstrate(option.value)"
          >
            <text
              class="text-[10px]"
              :class="
                isSubstrateSelected(option.value)
                  ? 'font-semibold text-[#2f8f57]'
                  : 'text-[#1f2933]'
              "
            >
              {{ option.label }}
            </text>
          </view>
        </view>
        <view v-if="substrateComposition.length" class="mt-3 space-y-2">
          <view
            v-for="item in substrateComposition"
            :key="item.material"
            class="flex items-center gap-2"
          >
            <text class="w-12 text-[10px] text-[#53645a]">{{ substrateLabel(item.material) }}</text>
            <view class="h-1 flex-1 rounded-full bg-gray-200">
              <view class="h-1 rounded-full bg-[#2f8f57]" :style="{ width: item.ratio + '%' }" />
            </view>
            <text class="w-8 text-right text-[10px] text-[#53645a]">{{ item.ratio }}%</text>
          </view>
        </view>
      </view>
    </view>

    <view class="mt-3">
      <text class="mb-2 block text-[14px] font-bold text-[#1f2933]">底部是否有排水孔？</text>
      <view class="flex gap-3">
        <view
          v-for="option in drainageOptions"
          :key="option.value"
          class="flex h-[42px] flex-1 items-center justify-center rounded-[14px] border"
          :class="
            form.hasDrainageHole === option.value
              ? 'border-[#2f8f57] bg-[#e8f3ea]'
              : 'border-[#e1e9dd] bg-[#f7faf5]'
          "
          @click="form.hasDrainageHole = option.value"
        >
          <text
            class="text-[14px]"
            :class="
              form.hasDrainageHole === option.value ? 'font-bold text-[#2f8f57]' : 'text-[#53645a]'
            "
          >
            {{ option.label }}
          </text>
        </view>
      </view>
    </view>
  </BottomSheet>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import PotCanvas from '@/components/PotCanvas.vue'
import { usePlantStore } from '@/store/plants.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import { estimatePotVolumeMl, isOversizedPot } from '@/utils/water-volume-format.js'

const props = defineProps({ plant: { type: Object, default: null } })
const emit = defineEmits(['saved', 'summary'])
const plantStore = usePlantStore()
const popupRef = ref(null)
const potCanvasRef = ref(null)
const instance = getCurrentInstance()
const loading = ref(false)
const saving = ref(false)
const potCanvasSize = ref({ width: 200, height: 207 })
const form = ref({
  potTopDiameterCm: '',
  potBottomDiameterCm: '',
  potHeightCm: '',
  hasDrainageHole: 'true'
})
const profileData = ref(null)
const selectedSubstrates = ref([])
const textureMap = {
  general: '',
  peat: '',
  coco: '',
  bark: '',
  sphagnum: '',
  gritty: '',
  ceramsite: '',
  perlite: '',
  coarse_sand: '',
  unknown: ''
}
const substrateOptions = [
  { label: '田园土', value: 'general' },
  { label: '椰糠', value: 'coco' },
  { label: '陶粒', value: 'ceramsite' },
  { label: '泥炭土', value: 'peat' },
  { label: '珍珠岩', value: 'perlite' },
  { label: '树皮', value: 'bark' },
  { label: '水苔', value: 'sphagnum' },
  { label: '颗粒土', value: 'gritty' },
  { label: '粗砂', value: 'coarse_sand' }
]
const drainageOptions = [
  { label: '有', value: 'true' },
  { label: '无 / 不确定', value: 'unknown' }
]
const substrateComposition = computed(() => {
  if (!selectedSubstrates.value.length) {
    return []
  }
  const evenRatio = Math.floor(100 / selectedSubstrates.value.length)
  const remainder = 100 - evenRatio * selectedSubstrates.value.length
  return selectedSubstrates.value.map((material, index) => ({
    material,
    ratio: evenRatio + (index === 0 ? remainder : 0)
  }))
})
const summary = computed(() => {
  const profile = profileData.value
  if (!profile) {
    return '点击补充盆型信息'
  }
  const parts = []
  if (profile.potTopDiameterCm) {
    parts.push(`口径 ${profile.potTopDiameterCm}cm`)
  }
  parts.push(profile.hasDrainageHole === 'true' ? '有排水孔' : '无/不确定排水孔')
  if (profile.substrateComposition?.length) {
    parts.push(profile.substrateComposition.map(item => substrateLabel(item.material)).join('+'))
  }
  return parts.join(' · ')
})

function isSubstrateSelected(value) {
  return selectedSubstrates.value.includes(value)
}
function toggleSubstrate(value) {
  const index = selectedSubstrates.value.indexOf(value)
  if (index >= 0) {
    selectedSubstrates.value.splice(index, 1)
  } else {
    selectedSubstrates.value.push(value)
  }
}
function substrateLabel(value) {
  return substrateOptions.find(option => option.value === value)?.label || value
}
function measurePotCanvasShell() {
  return new Promise(resolve => {
    const proxy = instance?.proxy
    if (!proxy) {
      resolve(null)
      return
    }
    uni
      .createSelectorQuery()
      .in(proxy)
      .select('.pot-canvas-shell')
      .boundingClientRect(rect => resolve(rect || null))
      .exec()
  })
}
async function updatePotCanvasSize() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const rect = await measurePotCanvasShell()
    if (rect?.width > 0 && rect?.height > 0) {
      potCanvasSize.value = { width: Math.round(rect.width), height: Math.round(rect.height) }
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  return false
}
function applyPotProfile(potProfile) {
  if (!potProfile) {
    return
  }
  const data = { ...potProfile }
  if (typeof data.substrateType === 'string' && data.substrateType.startsWith('[')) {
    try {
      data.substrateComposition = JSON.parse(data.substrateType)
    } catch {
      data.substrateComposition = []
    }
  }
  profileData.value = data
  form.value = {
    potTopDiameterCm: data.potTopDiameterCm > 0 ? String(data.potTopDiameterCm) : '',
    potBottomDiameterCm: data.potBottomDiameterCm > 0 ? String(data.potBottomDiameterCm) : '',
    potHeightCm: data.potHeightCm > 0 ? String(data.potHeightCm) : '',
    hasDrainageHole: data.hasDrainageHole || 'true'
  }
  selectedSubstrates.value = data.substrateComposition?.map(item => item.material) || []
}
async function open() {
  form.value = {
    potTopDiameterCm: '',
    potBottomDiameterCm: '',
    potHeightCm: '',
    hasDrainageHole: 'true'
  }
  selectedSubstrates.value = []
  loading.value = true
  callComponentMethod(popupRef, 'open')
  applyPotProfile(props.plant?.potProfile)
  loading.value = false
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 360))
  await updatePotCanvasSize()
  setTimeout(() => potCanvasRef.value?.initCanvas(), 300)
}
function close() {
  callComponentMethod(popupRef, 'close')
}
async function confirmOversizedPot() {
  const dims = form.value
  if (!isOversizedPot(dims)) {
    return true
  }
  const liters = Math.round(estimatePotVolumeMl(dims) / 1000)
  return new Promise(resolve => {
    uni.showModal({
      title: '盆型尺寸确认',
      content: `按当前尺寸估算容积约 ${liters} 升，请确认单位是厘米(cm)。`,
      confirmText: '确认无误',
      cancelText: '返回修改',
      success: result => resolve(Boolean(result.confirm)),
      fail: () => resolve(false)
    })
  })
}
async function save() {
  const plantId = props.plant?.id
  if (!plantId || !(await confirmOversizedPot())) {
    return
  }
  saving.value = true
  try {
    const payload = {
      potTopDiameterCm: form.value.potTopDiameterCm || null,
      potBottomDiameterCm: form.value.potBottomDiameterCm || null,
      potHeightCm: form.value.potHeightCm || null,
      hasDrainageHole: form.value.hasDrainageHole,
      substrateType: substrateComposition.value.length
        ? JSON.stringify(substrateComposition.value)
        : 'unknown'
    }
    const result = await plantStore.savePotProfile(plantId, payload)
    if (!result?.success) {
      throw new Error(result?.message || '保存失败')
    }
    const savedData = { ...payload, substrateComposition: substrateComposition.value }
    profileData.value = savedData
    emit('saved', savedData)
    uni.showToast({ title: '盆型信息已保存', icon: 'success' })
    close()
  } catch (error) {
    uni.showToast({ title: error.message || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

watch(summary, value => emit('summary', value))
defineExpose({ open, close, summary })
</script>
