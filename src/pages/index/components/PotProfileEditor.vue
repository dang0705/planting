<template>
  <uni-popup ref="popupRef" type="center" :is-mask-click="true">
    <scroll-view
      scroll-y
      class="mx-5 w-[353px] max-h-[80vh] rounded-[20px] bg-white border border-[#cfe2d4]"
    >
      <!-- 标题区 -->
      <view class="flex items-center justify-between px-[18px] pt-[18px]">
        <text class="text-[20px] font-bold text-[#1f2933]">盆型与基质</text>
        <view
          class="flex size-[28px] items-center justify-center rounded-[14px] bg-[#f2f5f0]"
          @click="close"
        >
          <text class="text-[16px] text-[#53645a]">×</text>
        </view>
      </view>
      <view class="px-[18px] pt-1">
        <text class="block text-[12px] text-[#8a978e]"
          >尺寸用于估算水量，基质用于修正保水与透气。</text
        >
      </view>

      <!-- 盆型区域 -->
      <view class="mx-[18px] mt-3 rounded-[18px] bg-[#f7faf5] border border-[#e1e9dd] p-[13px]">
        <text class="block text-[14px] font-bold text-[#1f2933]">盆型尺寸</text>
        <view
          class="mt-2 rounded-[16px] bg-white border border-[#e1e9dd] flex justify-center items-center py-3"
        >
          <PotCanvas
            ref="potCanvasRef"
            :pot-top-diameter-cm="
              loading ? null : form.potTopDiameterCm ? Number(form.potTopDiameterCm) : 20
            "
            :pot-bottom-diameter-cm="
              loading ? null : form.potBottomDiameterCm ? Number(form.potBottomDiameterCm) : 10
            "
            :pot-height-cm="loading ? null : form.potHeightCm ? Number(form.potHeightCm) : 15"
            :substrate-composition="substrateComposition"
            :texture-map="textureMap"
            @update:pot-top-diameter-cm="v => (form.potTopDiameterCm = String(v))"
            @update:pot-bottom-diameter-cm="v => (form.potBottomDiameterCm = String(v))"
            @update:pot-height-cm="v => (form.potHeightCm = String(v))"
          />
        </view>

        <!-- 基质池 -->
        <view class="mt-3 rounded-[16px] bg-[#f7faf5] border border-[#e1e9dd] p-3">
          <text class="block text-[12px] font-semibold text-[#1f2933] mb-2">选择盆土构成</text>
          <view class="flex flex-wrap gap-2">
            <view
              v-for="opt in substrateOptions"
              :key="opt.value"
              class="flex items-center rounded-[12px] border px-2 py-1.5"
              :class="
                isSubstrateSelected(opt.value)
                  ? 'bg-[#e8f3ea] border-[#2f8f57]'
                  : 'bg-white border-[#e1e9dd]'
              "
              @click="toggleSubstrate(opt.value)"
            >
              <text
                class="text-[10px]"
                :class="
                  isSubstrateSelected(opt.value) ? 'text-[#2f8f57] font-semibold' : 'text-[#1f2933]'
                "
                >{{ opt.label }}</text
              >
            </view>
          </view>
          <!-- 已选基质比例 -->
          <view v-if="substrateComposition.length > 0" class="mt-3 space-y-2">
            <view
              v-for="item in substrateComposition"
              :key="item.material"
              class="flex items-center gap-2"
            >
              <text class="w-12 text-[10px] text-[#53645a]">{{
                substrateLabel(item.material)
              }}</text>
              <view class="flex-1 h-1 rounded-full bg-gray-200">
                <view class="h-1 rounded-full bg-[#2f8f57]" :style="{ width: item.ratio + '%' }" />
              </view>
              <text class="w-8 text-right text-[10px] text-[#53645a]">{{ item.ratio }}%</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 排水孔 -->
      <view class="mx-[18px] mt-3">
        <text class="block text-[14px] font-bold text-[#1f2933] mb-2">底部是否有排水孔？</text>
        <view class="flex gap-3">
          <view
            class="flex items-center justify-center h-[42px] flex-1 rounded-[14px] border"
            :class="
              form.hasDrainageHole === 'true'
                ? 'bg-[#e8f3ea] border-[#2f8f57]'
                : 'bg-[#f7faf5] border-[#e1e9dd]'
            "
            @click="form.hasDrainageHole = 'true'"
          >
            <view
              class="size-[18px] rounded-full border-2 mr-2 flex items-center justify-center"
              :class="form.hasDrainageHole === 'true' ? 'border-[#2f8f57]' : 'border-[#e1e9dd]'"
            >
              <view
                v-if="form.hasDrainageHole === 'true'"
                class="size-[8px] rounded-full bg-[#2f8f57]"
              />
            </view>
            <text
              class="text-[14px]"
              :class="
                form.hasDrainageHole === 'true' ? 'text-[#2f8f57] font-bold' : 'text-[#53645a]'
              "
              >有</text
            >
          </view>
          <view
            class="flex items-center justify-center h-[42px] flex-1 rounded-[14px] border"
            :class="
              form.hasDrainageHole !== 'true'
                ? 'bg-[#e8f3ea] border-[#2f8f57]'
                : 'bg-[#f7faf5] border-[#e1e9dd]'
            "
            @click="form.hasDrainageHole = 'unknown'"
          >
            <view
              class="size-[18px] rounded-full border-2 mr-2"
              :class="form.hasDrainageHole !== 'true' ? 'border-[#2f8f57]' : 'border-[#e1e9dd]'"
            />
            <text
              class="text-[14px]"
              :class="
                form.hasDrainageHole !== 'true' ? 'text-[#2f8f57] font-bold' : 'text-[#53645a]'
              "
              >无 / 不确定</text
            >
          </view>
        </view>
      </view>

      <!-- 确认按钮 -->
      <view class="px-[18px] pt-4 pb-[18px]">
        <button
          class="m-0 w-full rounded-[22px] bg-[#2f8f57] py-3 text-[15px] font-bold text-white after:border-0"
          hover-class="none"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? '保存中...' : '确认并保存' }}
        </button>
      </view>
    </scroll-view>
  </uni-popup>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { usePlantStore } from '@/store/plants.js'
import { isOversizedPot, estimatePotVolumeMl } from '@/utils/water-volume-format.js'
import PotCanvas from '@/components/PotCanvas.vue'

const props = defineProps({
  plant: { type: Object, default: null }
})

const emit = defineEmits(['saved', 'summary'])

const plantStore = usePlantStore()

const popupRef = ref(null)
const potCanvasRef = ref(null)
const loading = ref(false)
const saving = ref(false)

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

const substrateComposition = computed(() => {
  if (!selectedSubstrates.value.length) {
    return []
  }
  const evenRatio = Math.floor(100 / selectedSubstrates.value.length)
  const remainder = 100 - evenRatio * selectedSubstrates.value.length
  return selectedSubstrates.value.map((material, idx) => ({
    material,
    ratio: evenRatio + (idx === 0 ? remainder : 0)
  }))
})

function isSubstrateSelected(value) {
  return selectedSubstrates.value.includes(value)
}

function toggleSubstrate(value) {
  const idx = selectedSubstrates.value.indexOf(value)
  if (idx >= 0) {
    selectedSubstrates.value.splice(idx, 1)
  } else {
    selectedSubstrates.value.push(value)
  }
}

function substrateLabel(value) {
  const opt = substrateOptions.find(o => o.value === value)
  return opt ? opt.label : value
}

const summary = computed(() => {
  if (!profileData.value) {
    return '点击补充盆型信息'
  }
  const p = profileData.value
  const parts = []
  if (p.potTopDiameterCm) {
    parts.push('口径 ' + p.potTopDiameterCm + 'cm')
  }
  if (p.hasDrainageHole === 'true') {
    parts.push('有排水孔')
  } else {
    parts.push('无/不确定排水孔')
  }
  if (p.substrateComposition && p.substrateComposition.length) {
    parts.push(p.substrateComposition.map(s => substrateLabel(s.material)).join('+'))
  }
  if (!parts.length) {
    return '点击补充盆型信息'
  }
  return parts.join(' · ')
})

/**
 * 从 props.plant.potProfile 读取盆型档案，回填表单。
 * substrateType 可能是 JSON 数组字符串（多选+比例），需反序列化成 substrateComposition。
 */
function applyPotProfile(potProfile) {
  if (!potProfile) {
    return
  }
  const d = { ...potProfile }
  if (typeof d.substrateType === 'string' && d.substrateType.startsWith('[')) {
    try {
      d.substrateComposition = JSON.parse(d.substrateType)
    } catch {
      d.substrateComposition = []
    }
  }
  profileData.value = d
  form.value = {
    potTopDiameterCm:
      d.potTopDiameterCm !== null && d.potTopDiameterCm > 0 ? String(d.potTopDiameterCm) : '',
    potBottomDiameterCm:
      d.potBottomDiameterCm !== null && d.potBottomDiameterCm > 0
        ? String(d.potBottomDiameterCm)
        : '',
    potHeightCm: d.potHeightCm !== null && d.potHeightCm > 0 ? String(d.potHeightCm) : '',
    hasDrainageHole: d.hasDrainageHole || 'true'
  }
  if (d.substrateComposition) {
    selectedSubstrates.value = d.substrateComposition.map(s => s.material)
  }
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
  popupRef.value?.open()

  applyPotProfile(props.plant?.potProfile)

  loading.value = false
  await nextTick()
  setTimeout(() => potCanvasRef.value?.initCanvas(), 300)
}

function close() {
  popupRef.value?.close()
}

async function save() {
  const plantId = props.plant?.id
  if (!plantId) {
    return
  }

  // 超大盆型二次确认：避免误填（如把 mm 当 cm）导致体积异常、浇水量荒谬
  const dims = {
    potTopDiameterCm: form.value.potTopDiameterCm,
    potBottomDiameterCm: form.value.potBottomDiameterCm,
    potHeightCm: form.value.potHeightCm
  }
  if (isOversizedPot(dims)) {
    const liters = Math.round(estimatePotVolumeMl(dims) / 1000)
    const confirmed = await new Promise(resolve => {
      uni.showModal({
        title: '盆型尺寸确认',
        content: `按当前尺寸估算容积约 ${liters} 升，明显大于常见家庭盆栽。请确认尺寸单位是厘米(cm)且填写无误。`,
        confirmText: '确认无误',
        cancelText: '返回修改',
        success: res => resolve(Boolean(res.confirm)),
        fail: () => resolve(false)
      })
    })
    if (!confirmed) {
      return
    }
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
    if (result?.success) {
      const savedData = { ...payload }
      savedData.substrateComposition = substrateComposition.value
      profileData.value = savedData
      emit('saved', savedData)
      uni.showToast({ title: '盆型信息已保存', icon: 'success' })
      close()
    } else {
      uni.showToast({ title: result?.message || '保存失败', icon: 'none' })
    }
  } catch (error) {
    console.error('保存盆型档案失败:', error)
    uni.showToast({ title: error.message || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

watch(summary, v => emit('summary', v))

defineExpose({ open, close, summary })
</script>
