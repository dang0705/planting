<template>
  <view class="relative" style="width: 200px; height: 207px">
    <!-- 骨架屏 -->
    <view v-if="!isNormalMode" class="absolute inset-0 flex flex-col items-center justify-center">
      <view
        class="border-2 border-dashed border-gray-300 rounded-lg"
        style="width: 110px; height: 130px; margin-top: 10px"
      />
      <view class="mt-2 h-2 w-16 rounded-full bg-gray-200 animate-pulse" />
      <view class="mt-1 h-2 w-12 rounded-full bg-gray-200 animate-pulse" />
      <text class="mt-3 text-[10px] text-gray-400">等待数据</text>
    </view>

    <!-- Canvas 绘制层 -->
    <canvas
      v-if="isNormalMode"
      canvas-id="potCanvas"
      id="potCanvas"
      class="absolute inset-0"
      style="width: 200px; height: 207px"
    />

    <!-- 盆口右把手（水平控直径 + 垂直控高度，二合一） -->
    <view
      v-if="isNormalMode"
      class="absolute flex items-center justify-center"
      :style="{
        left: topHandleX - 10 + 'px',
        top: topHandleY - 10 + 'px',
        width: '20px',
        height: '20px'
      }"
      @touchstart.stop="onTopHandleTouchStart"
      @touchmove.stop="onTopHandleTouchMove"
      @touchend.stop="onHandleTouchEnd"
    >
      <view class="size-[12px] rounded-full bg-[#2f8f57] shadow-sm" />
    </view>

    <!-- 盆底右把手（仅水平） -->
    <view
      v-if="isNormalMode"
      class="absolute flex items-center justify-center"
      :style="{
        left: bottomHandleX - 10 + 'px',
        top: bottomHandleY - 10 + 'px',
        width: '20px',
        height: '20px'
      }"
      @touchstart.stop="onBottomHandleTouchStart"
      @touchmove.stop="onBottomHandleTouchMove"
      @touchend.stop="onHandleTouchEnd"
    >
      <view class="size-[12px] rounded-full bg-[#2f8f57] shadow-sm" />
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, getCurrentInstance } from 'vue'

const props = defineProps({
  potTopDiameterCm: { type: Number, default: null },
  potBottomDiameterCm: { type: Number, default: null },
  potHeightCm: { type: Number, default: null },
  substrateComposition: { type: Array, default: null },
  textureMap: { type: Object, default: () => ({}) }
})

const emit = defineEmits([
  'update:potTopDiameterCm',
  'update:potBottomDiameterCm',
  'update:potHeightCm'
])

const instance = getCurrentInstance()

// Canvas 尺寸
const CANVAS_W = 200
const CANVAS_H = 207
const CENTER_X = 100 // 水平居中

// 盆底固定 Y，高度往上增长
const BOTTOM_Y = 175

// 比例折算常量
const MIN_DIAMETER_CM = 10
const MAX_DIAMETER_CM = 100
const STEP_CM = 5
const MIN_RADIUS_PX = 17
const MAX_RADIUS_PX = 69
const MIN_HEIGHT_CM = 10
const MAX_HEIGHT_CM = 50
const MIN_HEIGHT_PX = 57
const MAX_HEIGHT_PX = 161

const SUBSTRATE_COLORS = {
  general: '#8B7355',
  peat: '#5C4033',
  coco: '#A0826D',
  bark: '#6B4423',
  sphagnum: '#A8C686',
  gritty: '#C2B280',
  ceramsite: '#D4A76A',
  perlite: '#F5F5DC',
  coarse_sand: '#D2B48C',
  unknown: '#CCCCCC'
}

const SKELETON_TOP = 20
const SKELETON_BOTTOM = 10
const SKELETON_HEIGHT = 15

const isNormalMode = computed(() => {
  return (
    props.potTopDiameterCm !== null &&
    props.potTopDiameterCm > 0 &&
    props.potBottomDiameterCm !== null &&
    props.potBottomDiameterCm > 0 &&
    props.potHeightCm !== null &&
    props.potHeightCm > 0
  )
})

const effTopCm = computed(() => (isNormalMode.value ? props.potTopDiameterCm : SKELETON_TOP))
const effBottomCm = computed(() =>
  isNormalMode.value ? props.potBottomDiameterCm : SKELETON_BOTTOM
)
const effHeightCm = computed(() => (isNormalMode.value ? props.potHeightCm : SKELETON_HEIGHT))

function diameterToRadiusPx(cm) {
  const ratio =
    (Math.max(MIN_DIAMETER_CM, Math.min(MAX_DIAMETER_CM, cm)) - MIN_DIAMETER_CM) /
    (MAX_DIAMETER_CM - MIN_DIAMETER_CM)
  return MIN_RADIUS_PX + ratio * (MAX_RADIUS_PX - MIN_RADIUS_PX)
}

function heightToPx(cm) {
  const ratio =
    (Math.max(MIN_HEIGHT_CM, Math.min(MAX_HEIGHT_CM, cm)) - MIN_HEIGHT_CM) /
    (MAX_HEIGHT_CM - MIN_HEIGHT_CM)
  return MIN_HEIGHT_PX + ratio * (MAX_HEIGHT_PX - MIN_HEIGHT_PX)
}

function radiusPxToCm(px) {
  const ratio = (px - MIN_RADIUS_PX) / (MAX_RADIUS_PX - MIN_RADIUS_PX)
  const rawCm = MIN_DIAMETER_CM + ratio * (MAX_DIAMETER_CM - MIN_DIAMETER_CM)
  const stepped = Math.round((rawCm - MIN_DIAMETER_CM) / STEP_CM) * STEP_CM + MIN_DIAMETER_CM
  return Math.max(MIN_DIAMETER_CM, Math.min(MAX_DIAMETER_CM, stepped))
}

function heightPxToCm(px) {
  const ratio = (px - MIN_HEIGHT_PX) / (MAX_HEIGHT_PX - MIN_HEIGHT_PX)
  const rawCm = MIN_HEIGHT_CM + ratio * (MAX_HEIGHT_CM - MIN_HEIGHT_CM)
  const stepped = Math.round((rawCm - MIN_HEIGHT_CM) / STEP_CM) * STEP_CM + MIN_HEIGHT_CM
  return Math.max(MIN_HEIGHT_CM, Math.min(MAX_HEIGHT_CM, stepped))
}

// 盆底固定，高度往上增长
const topRadiusPx = computed(() => diameterToRadiusPx(effTopCm.value))
const bottomRadiusPx = computed(() => diameterToRadiusPx(effBottomCm.value))
const heightPx = computed(() => heightToPx(effHeightCm.value))

const topY = computed(() => BOTTOM_Y - heightPx.value)
const bottomY = computed(() => BOTTOM_Y)

const topHandleX = computed(() => CENTER_X + topRadiusPx.value)
const topHandleY = computed(() => topY.value)
const bottomHandleX = computed(() => CENTER_X + bottomRadiusPx.value)
const bottomHandleY = computed(() => bottomY.value)

// 触摸状态
const touchStartX = ref(0)
const touchStartY = ref(0)
const touchStartTopCm = ref(0)
const touchStartBottomCm = ref(0)
const touchStartHeightCm = ref(0)
const activeHandle = ref(null)

let ctx = null
let initRetries = 0
const MAX_INIT_RETRIES = 8

function initCanvas() {
  try {
    const compInstance = instance?.proxy || instance?.ctx
    ctx = uni.createCanvasContext('potCanvas', compInstance)
    if (ctx && typeof ctx.draw === 'function') {
      initRetries = 0
      draw()
      return true
    }
    ctx = null
  } catch (e) {
    ctx = null
  }
  if (initRetries < MAX_INIT_RETRIES) {
    initRetries++
    setTimeout(() => initCanvas(), 250)
  }
  return false
}

defineExpose({ initCanvas, draw })

function draw() {
  if (!ctx) {
    return
  }
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  const topR = topRadiusPx.value
  const botR = bottomRadiusPx.value
  const h = heightPx.value
  const ty = topY.value
  const by = bottomY.value

  if (isNormalMode.value) {
    drawSubstrateLayers(topR, botR, h, ty, by)

    ctx.beginPath()
    ctx.moveTo(CENTER_X - topR, ty)
    ctx.lineTo(CENTER_X + topR, ty)
    ctx.lineTo(CENTER_X + botR, by)
    ctx.lineTo(CENTER_X - botR, by)
    ctx.closePath()
    ctx.setStrokeStyle('#2f8f57')
    ctx.setLineWidth(1.5)
    ctx.stroke()

    ctx.setFillStyle('#2f8f57')
    ctx.setFontSize(11)
    ctx.setTextAlign('center')
    ctx.fillText('盆口 ' + effTopCm.value + 'cm', CENTER_X, ty - 8)
    ctx.fillText('盆底 ' + effBottomCm.value + 'cm', CENTER_X, by + 18)

    // 高度文案：竖排，和盆口盆底同色同字号，放在盆模型右侧居中
    const heightText = '高' + effHeightCm.value + 'cm'
    const labelX = CENTER_X + Math.max(topR, botR) + 10
    const labelCenterY = (ty + by) / 2
    const charSpacing = 13
    const startY = labelCenterY - (heightText.length * charSpacing) / 2
    ctx.setFillStyle('#2f8f57')
    ctx.setFontSize(11)
    ctx.setTextAlign('center')
    for (let i = 0; i < heightText.length; i++) {
      ctx.fillText(heightText[i], labelX, startY + i * charSpacing)
    }
  }

  ctx.draw()
}

function drawSubstrateLayers(topR, botR, h, ty, by) {
  const composition = props.substrateComposition
  if (!composition || !composition.length) {
    ctx.beginPath()
    ctx.moveTo(CENTER_X - topR, ty)
    ctx.lineTo(CENTER_X + topR, ty)
    ctx.lineTo(CENTER_X + botR, by)
    ctx.lineTo(CENTER_X - botR, by)
    ctx.closePath()
    ctx.setFillStyle('rgba(47, 143, 87, 0.08)')
    ctx.fill()
    return
  }

  const totalRatio = composition.reduce((sum, item) => sum + (item.ratio || 0), 0)
  if (totalRatio <= 0) {
    ctx.beginPath()
    ctx.moveTo(CENTER_X - topR, ty)
    ctx.lineTo(CENTER_X + topR, ty)
    ctx.lineTo(CENTER_X + botR, by)
    ctx.lineTo(CENTER_X - botR, by)
    ctx.closePath()
    ctx.setFillStyle('rgba(47, 143, 87, 0.08)')
    ctx.fill()
    return
  }

  let currentY = ty
  for (let i = 0; i < composition.length; i++) {
    const item = composition[i]
    const ratio = (item.ratio || 0) / totalRatio
    const layerHeight = h * ratio
    const layerTopY = currentY
    const layerBotY = currentY + layerHeight

    const topInterp = h > 0 ? (layerTopY - ty) / h : 0
    const botInterp = h > 0 ? (layerBotY - ty) / h : 1
    const layerTopR = topR + (botR - topR) * topInterp
    const layerBotR = topR + (botR - topR) * botInterp

    ctx.beginPath()
    ctx.moveTo(CENTER_X - layerTopR, layerTopY)
    ctx.lineTo(CENTER_X + layerTopR, layerTopY)
    ctx.lineTo(CENTER_X + layerBotR, layerBotY)
    ctx.lineTo(CENTER_X - layerBotR, layerBotY)
    ctx.closePath()

    const texturePath = props.textureMap?.[item.material]
    if (texturePath) {
      ctx.save()
      ctx.clip()
      ctx.drawImage(texturePath, CENTER_X - layerTopR, layerTopY, layerTopR * 2, layerHeight)
      ctx.restore()
    } else {
      ctx.setFillStyle(SUBSTRATE_COLORS[item.material] || SUBSTRATE_COLORS.unknown)
      ctx.fill()
    }

    if (i < composition.length - 1) {
      ctx.beginPath()
      ctx.moveTo(CENTER_X - layerBotR, layerBotY)
      ctx.lineTo(CENTER_X + layerBotR, layerBotY)
      ctx.setStrokeStyle('rgba(255, 255, 255, 0.6)')
      ctx.setLineWidth(1)
      ctx.stroke()
    }

    currentY = layerBotY
  }
}

// 盆口右把手：水平控直径 + 垂直控高度
function onTopHandleTouchStart(e) {
  activeHandle.value = 'top'
  touchStartX.value = e.touches[0].clientX
  touchStartY.value = e.touches[0].clientY
  touchStartTopCm.value = props.potTopDiameterCm || SKELETON_TOP
  touchStartHeightCm.value = props.potHeightCm || SKELETON_HEIGHT
}

function onTopHandleTouchMove(e) {
  if (activeHandle.value !== 'top') {
    return
  }
  const deltaX = e.touches[0].clientX - touchStartX.value
  const deltaY = e.touches[0].clientY - touchStartY.value

  // 水平 → 盆口直径
  const startRadiusPx = diameterToRadiusPx(touchStartTopCm.value)
  const newRadiusPx = Math.max(MIN_RADIUS_PX, Math.min(MAX_RADIUS_PX, startRadiusPx + deltaX))
  emit('update:potTopDiameterCm', radiusPxToCm(newRadiusPx))

  // 垂直 → 盆高（向上拖 = 增高）
  const startHeightPx = heightToPx(touchStartHeightCm.value)
  const newHeightPx = Math.max(MIN_HEIGHT_PX, Math.min(MAX_HEIGHT_PX, startHeightPx - deltaY))
  emit('update:potHeightCm', heightPxToCm(newHeightPx))
}

// 盆底右把手：仅水平
function onBottomHandleTouchStart(e) {
  activeHandle.value = 'bottom'
  touchStartX.value = e.touches[0].clientX
  touchStartBottomCm.value = props.potBottomDiameterCm || SKELETON_BOTTOM
}

function onBottomHandleTouchMove(e) {
  if (activeHandle.value !== 'bottom') {
    return
  }
  const deltaX = e.touches[0].clientX - touchStartX.value
  const startRadiusPx = diameterToRadiusPx(touchStartBottomCm.value)
  const newRadiusPx = Math.max(MIN_RADIUS_PX, Math.min(MAX_RADIUS_PX, startRadiusPx + deltaX))
  emit('update:potBottomDiameterCm', radiusPxToCm(newRadiusPx))
}

function onHandleTouchEnd() {
  activeHandle.value = null
}

watch(
  [
    () => props.potTopDiameterCm,
    () => props.potBottomDiameterCm,
    () => props.potHeightCm,
    () => props.substrateComposition
  ],
  () => {
    if (isNormalMode.value) {
      nextTick(() => {
        if (!ctx) {
          initCanvas()
        } else {
          draw()
        }
      })
    }
  },
  { deep: true }
)

onMounted(() => {
  if (isNormalMode.value) {
    nextTick(() => setTimeout(() => initCanvas(), 300))
  }
})
</script>
