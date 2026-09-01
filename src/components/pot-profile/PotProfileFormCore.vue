<template>
  <view class="mt-3 rounded-[18px] border border-[#e1e9dd] bg-[#f7faf5] p-[13px]">
    <text class="block text-[14px] font-bold text-[#1f2933]">盆型尺寸</text>
    <view
      class="pot-canvas-shell relative mt-2 h-[231px] overflow-hidden rounded-[16px] border border-[#e1e9dd] bg-white"
    >
      <PotCanvas
        ref="potCanvasRef"
        :canvas-width="potCanvasSize.width"
        :canvas-height="potCanvasSize.height"
        :id-prefix="idPrefix"
        :preview-only="previewOnly"
        :pot-top-diameter-cm="displayTopDiameterCm"
        :pot-bottom-diameter-cm="displayBottomDiameterCm"
        :pot-height-cm="displayHeightCm"
        :substrate-composition="substrateComposition"
        :texture-map="textureMap"
        @update:pot-top-diameter-cm="value => (form.potTopDiameterCm = String(value))"
        @update:pot-bottom-diameter-cm="value => (form.potBottomDiameterCm = String(value))"
        @update:pot-height-cm="value => (form.potHeightCm = String(value))"
      />
    </view>

    <text v-if="previewOnly" class="mt-2 block text-[11px] text-[#8a9690]">
      示例尺寸，仅用于参考，不会保存。
    </text>
    <text v-else-if="hasCompleteDimensions" class="mt-2 block text-[11px] text-[#718075]">
      拖动绿色圆点调整，也可以直接填写厘米数。
    </text>
    <text v-else class="mt-2 block text-[11px] text-[#718075]">
      填写盆底直径后可以拖动调整，也可以直接填写厘米数。
    </text>

    <view class="mt-3 grid grid-cols-2 gap-2">
      <view class="rounded-[12px] border border-[#e1e9dd] bg-white px-3 py-2">
        <text class="block text-[11px] text-[#718075]">盆口直径（cm）</text>
        <input
          :id="`${idPrefix}-top-diameter-input`"
          class="mt-1 w-full text-[15px] text-[#1f2933]"
          type="number"
          maxlength="3"
          placeholder="例如 20"
          :value="form.potTopDiameterCm"
          @input="updateDimension('potTopDiameterCm', $event.detail.value)"
        />
      </view>
      <view class="rounded-[12px] border border-[#e1e9dd] bg-white px-3 py-2">
        <text class="block text-[11px] text-[#718075]">盆高（cm）</text>
        <input
          :id="`${idPrefix}-height-input`"
          class="mt-1 w-full text-[15px] text-[#1f2933]"
          type="number"
          maxlength="3"
          placeholder="例如 15"
          :value="form.potHeightCm"
          @input="updateDimension('potHeightCm', $event.detail.value)"
        />
      </view>
    </view>
    <text v-if="validationMessage" class="mt-2 block text-[12px] text-[#b45309]">
      {{ validationMessage }}
    </text>
    <text v-else-if="dimensionFeedback" class="mt-2 block text-[12px] text-[#2d7a4f]">
      {{ dimensionFeedback }}
    </text>
  </view>

  <view class="mt-3">
    <text class="mb-2 block text-[14px] font-bold text-[#1f2933]">底部是否有排水孔？</text>
    <view class="flex gap-3">
      <view
        v-for="option in drainageOptions"
        :key="option.value"
        :id="`${idPrefix}-drainage-${option.value}`"
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
    <text class="mt-2 block text-[12px] text-[#718075]">{{ drainageHelpText }}</text>
  </view>

  <view class="mt-3 rounded-[16px] border border-[#e1e9dd] bg-[#f7faf5] p-3">
    <text class="block text-[12px] font-semibold text-[#1f2933]">盆底直径（cm，可选）</text>
    <input
      :id="`${idPrefix}-bottom-diameter-input`"
      class="mt-2 rounded-[12px] border border-[#e1e9dd] bg-white px-3 py-2 text-[15px] text-[#1f2933]"
      type="number"
      maxlength="3"
      placeholder="知道尺寸再填写"
      :value="form.potBottomDiameterCm"
      @input="updateDimension('potBottomDiameterCm', $event.detail.value)"
    />
    <text v-if="hasBasicDimensions && !hasBottomDiameter" class="mt-2 block text-[12px] text-[#718075]">
      补充盆底尺寸后，水量范围会更细。
    </text>
  </view>

  <view class="mt-3 rounded-[16px] border border-[#e1e9dd] bg-[#f7faf5] p-3">
    <text class="block text-[12px] font-semibold text-[#1f2933]">基质信息（可选）</text>
    <text class="mt-1 block text-[12px] text-[#718075]">
      如果知道基质，水量建议会更贴近盆土的干湿速度。
    </text>
    <view class="mt-2 flex flex-wrap gap-2">
      <view
        v-for="option in substrateOptions"
        :key="option.value"
        :id="`${idPrefix}-substrate-${option.value}`"
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
            isSubstrateSelected(option.value) ? 'font-semibold text-[#2f8f57]' : 'text-[#1f2933]'
          "
        >
          {{ option.label }}
        </text>
      </view>
    </view>
    <text v-if="substrateComposition.length" class="mt-2 block text-[11px] text-[#718075]">
      当前按平均比例暂估。
    </text>
    <view v-if="substrateComposition.length" class="mt-2 space-y-2">
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
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue'
import PotCanvas from '@/components/PotCanvas.vue'
import { estimatePotVolumeMl, isOversizedPot } from '@/utils/water-volume-format.js'

// 盆型缺失时不写入示例尺寸；示例只用于帮助用户理解图形。
const DEFAULT_FORM = {
  potTopDiameterCm: '',
  potBottomDiameterCm: '',
  potHeightCm: '',
  hasDrainageHole: 'unknown'
}

const props = defineProps({
  initialProfile: { type: Object, default: null },
  idPrefix: { type: String, default: 'pot-profile-editor' },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['summary', 'change'])

const potCanvasRef = ref(null)
const instance = getCurrentInstance()
const potCanvasSize = ref({ width: 200, height: 207 })
const form = ref({ ...DEFAULT_FORM })
const profileData = ref(null)
const selectedSubstrates = ref([])
const validationMessage = ref('')

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
  { label: '无', value: 'false' },
  { label: '不确定', value: 'unknown' }
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

const hasBasicDimensions = computed(
  () => Number(form.value.potTopDiameterCm) > 0 && Number(form.value.potHeightCm) > 0
)
const hasBottomDiameter = computed(() => Number(form.value.potBottomDiameterCm) > 0)
const hasCompleteDimensions = computed(
  () => hasBasicDimensions.value && hasBottomDiameter.value
)
const previewOnly = computed(() => !hasCompleteDimensions.value)
const displayTopDiameterCm = computed(() => (previewOnly.value ? 20 : Number(form.value.potTopDiameterCm)))
const displayBottomDiameterCm = computed(() =>
  previewOnly.value ? 10 : Number(form.value.potBottomDiameterCm)
)
const displayHeightCm = computed(() => (previewOnly.value ? 15 : Number(form.value.potHeightCm)))
const dimensionFeedback = computed(() => {
  if (hasCompleteDimensions.value) {
    return '盆型已完整，水量范围会更贴近实际。'
  }
  if (hasBasicDimensions.value) {
    return '已可提供基础水量范围。'
  }
  return ''
})
const drainageHelpText = computed(() => {
  if (form.value.hasDrainageHole === 'true') {
    return '水分可以从底部排出。'
  }
  if (form.value.hasDrainageHole === 'false') {
    return '建议少量多次，并留意盆底积水。'
  }
  return '不确定也可以继续，建议浇水前多检查盆土。'
})

const summary = computed(() => {
  const profile = profileData.value
  // 摘要只描述真实填写内容，不把示例尺寸当成用户资料。
  const top = form.value.potTopDiameterCm
  const bottom = form.value.potBottomDiameterCm
  const height = form.value.potHeightCm
  const parts = []
  if (top) {
    parts.push(`口径 ${top}cm`)
  }
  if (height) {
    parts.push(`高 ${height}cm`)
  }
  if (bottom) {
    parts.push(`底径 ${bottom}cm`)
  }
  if (form.value.hasDrainageHole === 'true') {
    parts.push('有排水孔')
  } else if (form.value.hasDrainageHole === 'false') {
    parts.push('无排水孔')
  } else {
    parts.push('排水孔不确定')
  }
  if (substrateComposition.value.length) {
    parts.push(substrateComposition.value.map(item => substrateLabel(item.material)).join('+'))
  }
  if (!top && !height && !bottom && !profile && form.value.hasDrainageHole === 'unknown') {
    return '填写盆口和盆高，可估算水量范围'
  }
  return parts.join(' · ')
})

function updateDimension(field, value) {
  form.value[field] = String(value || '').replace(/[^0-9.]/g, '')
  validationMessage.value = ''
}

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

/**
 * 应用盆型档案到表单。入参为 null 时清空真实尺寸，确保示例不会落库。
 */
function applyPotProfile(potProfile) {
  if (!potProfile) {
    form.value = { ...DEFAULT_FORM }
    selectedSubstrates.value = []
    profileData.value = null
    validationMessage.value = ''
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
    hasDrainageHole: ['true', 'false', 'unknown'].includes(String(data.hasDrainageHole))
      ? String(data.hasDrainageHole)
      : 'unknown'
  }
  selectedSubstrates.value = data.substrateComposition?.map(item => item.material) || []
  validationMessage.value = ''
}

function getPayload() {
  return {
    potTopDiameterCm: form.value.potTopDiameterCm || null,
    potBottomDiameterCm: form.value.potBottomDiameterCm || null,
    potHeightCm: form.value.potHeightCm || null,
    hasDrainageHole: form.value.hasDrainageHole,
    substrateType: substrateComposition.value.length
      ? JSON.stringify(substrateComposition.value)
      : null,
    source: 'user',
    confidence: hasCompleteDimensions.value ? 'normal' : 'low'
  }
}

function validate() {
  if (!hasBasicDimensions.value) {
    validationMessage.value = '先填写盆口直径和盆高，就可以保存基础盆型。'
    return false
  }
  validationMessage.value = ''
  return true
}

function getProfileState() {
  if (!form.value.potTopDiameterCm && !form.value.potHeightCm && !form.value.potBottomDiameterCm) {
    return 'empty'
  }
  return hasCompleteDimensions.value ? 'complete' : 'basic'
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

function commitProfileData() {
  const payload = getPayload()
  profileData.value = { ...payload, substrateComposition: substrateComposition.value }
  return profileData.value
}

async function initCanvas() {
  await nextTick()
  await updatePotCanvasSize()
  setTimeout(() => potCanvasRef.value?.initCanvas(), 300)
}

// initialProfile 变化时自动应用（包括 null 重置）
onMounted(() => {
  applyPotProfile(props.initialProfile)
})

watch(
  () => props.initialProfile,
  profile => {
    // profile 为 null 时也需清空真实值，避免切换到无 potProfile 的植物时残留上一个植物的盆型
    applyPotProfile(profile)
  }
)

watch(summary, value => emit('summary', value))
watch([form, substrateComposition], () => emit('change', getPayload()), { deep: true })

defineExpose({
  applyPotProfile,
  getPayload,
  validate,
  getProfileState,
  confirmOversizedPot,
  commitProfileData,
  initCanvas,
  updatePotCanvasSize,
  summary
})
</script>
