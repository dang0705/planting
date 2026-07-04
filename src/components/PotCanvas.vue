<template>
  <view
    class="pot-canvas-root relative"
    :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
  >
    <!-- 骨架屏 -->
    <view v-if="!isNormalMode" class="absolute inset-0 flex flex-col items-center justify-center">
      <view
        class="border-2 border-dashed border-gray-300 rounded-lg"
        :style="{
          width: `${110 * scaleBase}px`,
          height: `${130 * scaleBase}px`,
          marginTop: `${10 * scaleBase}px`
        }"
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
      :width="canvasWidth"
      :height="canvasHeight"
      :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
    />

    <!-- 盆口右把手（水平控直径 + 垂直控高度，二合一） -->
    <view
      v-if="isNormalMode"
      class="absolute flex items-center justify-center"
      :style="{
        left: topHandleX - handleOuterSize / 2 + 'px',
        top: topHandleY - handleOuterSize / 2 + 'px',
        width: handleOuterSize + 'px',
        height: handleOuterSize + 'px'
      }"
      @touchstart.stop="onTopHandleTouchStart"
      @touchmove.stop="onTopHandleTouchMove"
      @touchend.stop="onHandleTouchEnd"
    >
      <view
        class="rounded-full bg-[#2f8f57] shadow-sm"
        :style="{ width: handleInnerSize + 'px', height: handleInnerSize + 'px' }"
      />
    </view>

    <!-- 盆底右把手（仅水平） -->
    <view
      v-if="isNormalMode"
      class="absolute flex items-center justify-center"
      :style="{
        left: bottomHandleX - handleOuterSize / 2 + 'px',
        top: bottomHandleY - handleOuterSize / 2 + 'px',
        width: handleOuterSize + 'px',
        height: handleOuterSize + 'px'
      }"
      @touchstart.stop="onBottomHandleTouchStart"
      @touchmove.stop="onBottomHandleTouchMove"
      @touchend.stop="onHandleTouchEnd"
    >
      <view
        class="rounded-full bg-[#2f8f57] shadow-sm"
        :style="{ width: handleInnerSize + 'px', height: handleInnerSize + 'px' }"
      />
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
  canvasWidth: { type: Number, default: 200 },
  canvasHeight: { type: Number, default: 207 },
  textureMap: { type: Object, default: () => ({}) }
})

const emit = defineEmits([
  'update:potTopDiameterCm',
  'update:potBottomDiameterCm',
  'update:potHeightCm'
])

const instance = getCurrentInstance()

// Canvas 尺寸
const CANVAS_BASE_W = 200
const CANVAS_BASE_H = 207
const HEIGHT_LABEL_RIGHT_GAP_PX = 10
const POT_CANVAS_LEFT_SHIFT_PX = 10

// 盆底固定 Y，高度往上增长
const BASE_CENTER_X = 100
const BASE_BOTTOM_Y = 175

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

const canvasWidth = ref(Math.max(1, Number(props.canvasWidth) || CANVAS_BASE_W))
const canvasHeight = ref(Math.max(1, Number(props.canvasHeight) || CANVAS_BASE_H))

function updateCanvasSizeFromProps() {
  canvasWidth.value = Math.max(1, Number(props.canvasWidth) || CANVAS_BASE_W)
  canvasHeight.value = Math.max(1, Number(props.canvasHeight) || CANVAS_BASE_H)
}

const scaleX = computed(() => canvasWidth.value / CANVAS_BASE_W)
const scaleY = computed(() => canvasHeight.value / CANVAS_BASE_H)
const scaleBase = computed(() => Math.min(scaleX.value, scaleY.value))
const CENTER_X = computed(() => (BASE_CENTER_X - POT_CANVAS_LEFT_SHIFT_PX) * scaleX.value)
const BOTTOM_Y = computed(() => BASE_BOTTOM_Y * scaleY.value)
const minRadiusPx = computed(() => MIN_RADIUS_PX * scaleX.value)
const maxRadiusPx = computed(() => MAX_RADIUS_PX * scaleX.value)
const minHeightPx = computed(() => MIN_HEIGHT_PX * scaleY.value)
const maxHeightPx = computed(() => MAX_HEIGHT_PX * scaleY.value)
const handleOuterSize = computed(() => Math.max(12, Math.round(20 * scaleBase.value)))
const handleInnerSize = computed(() => Math.max(6, Math.round(12 * scaleBase.value)))
const labelFontSize = computed(() => Math.max(9, Math.round(11 * scaleBase.value)))

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
  return minRadiusPx.value + ratio * (maxRadiusPx.value - minRadiusPx.value)
}

function heightToPx(cm) {
  const ratio =
    (Math.max(MIN_HEIGHT_CM, Math.min(MAX_HEIGHT_CM, cm)) - MIN_HEIGHT_CM) /
    (MAX_HEIGHT_CM - MIN_HEIGHT_CM)
  return minHeightPx.value + ratio * (maxHeightPx.value - minHeightPx.value)
}

function radiusPxToCm(px) {
  const ratio = (px - minRadiusPx.value) / (maxRadiusPx.value - minRadiusPx.value)
  const rawCm = MIN_DIAMETER_CM + ratio * (MAX_DIAMETER_CM - MIN_DIAMETER_CM)
  const stepped = Math.round((rawCm - MIN_DIAMETER_CM) / STEP_CM) * STEP_CM + MIN_DIAMETER_CM
  return Math.max(MIN_DIAMETER_CM, Math.min(MAX_DIAMETER_CM, stepped))
}

function heightPxToCm(px) {
  const ratio = (px - minHeightPx.value) / (maxHeightPx.value - minHeightPx.value)
  const rawCm = MIN_HEIGHT_CM + ratio * (MAX_HEIGHT_CM - MIN_HEIGHT_CM)
  const stepped = Math.round((rawCm - MIN_HEIGHT_CM) / STEP_CM) * STEP_CM + MIN_HEIGHT_CM
  return Math.max(MIN_HEIGHT_CM, Math.min(MAX_HEIGHT_CM, stepped))
}

// 盆底固定，高度往上增长
const topRadiusPx = computed(() => diameterToRadiusPx(effTopCm.value))
const bottomRadiusPx = computed(() => diameterToRadiusPx(effBottomCm.value))
const heightPx = computed(() => heightToPx(effHeightCm.value))

const topY = computed(() => BOTTOM_Y.value - heightPx.value)
const bottomY = computed(() => BOTTOM_Y.value)

const topHandleX = computed(() => CENTER_X.value + topRadiusPx.value)
const topHandleY = computed(() => topY.value)
const bottomHandleX = computed(() => CENTER_X.value + bottomRadiusPx.value)
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

  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value)

  const topR = topRadiusPx.value
  const botR = bottomRadiusPx.value
  const h = heightPx.value
  const ty = topY.value
  const by = bottomY.value

  if (isNormalMode.value) {
    drawSubstrateLayers(topR, botR, h, ty, by)

    ctx.beginPath()
    ctx.moveTo(CENTER_X.value - topR, ty)
    ctx.lineTo(CENTER_X.value + topR, ty)
    ctx.lineTo(CENTER_X.value + botR, by)
    ctx.lineTo(CENTER_X.value - botR, by)
    ctx.closePath()
    ctx.setStrokeStyle('#2f8f57')
    ctx.setLineWidth(1.5)
    ctx.stroke()

    ctx.setFillStyle('#2f8f57')
    ctx.setFontSize(labelFontSize.value)
    ctx.setTextAlign('center')
    ctx.fillText('盆口 ' + effTopCm.value + 'cm', CENTER_X.value, ty - 8 * scaleY.value)
    ctx.fillText('盆底 ' + effBottomCm.value + 'cm', CENTER_X.value, by + 18 * scaleY.value)

    const heightText = '高' + effHeightCm.value + 'cm'
    const labelX =
      CENTER_X.value + Math.max(topR, botR) + HEIGHT_LABEL_RIGHT_GAP_PX * scaleBase.value
    const labelCenterY = (ty + by) / 2
    ctx.setFillStyle('#2f8f57')
    ctx.setFontSize(labelFontSize.value)
    ctx.setTextAlign('left')
    if (typeof ctx.setTextBaseline === 'function') {
      ctx.setTextBaseline('middle')
    }
    ctx.fillText(heightText, labelX, labelCenterY)
  }

  ctx.draw()
}

function drawSubstrateLayers(topR, botR, h, ty, by) {
  const composition = props.substrateComposition
  if (!composition || !composition.length) {
    ctx.beginPath()
    ctx.moveTo(CENTER_X.value - topR, ty)
    ctx.lineTo(CENTER_X.value + topR, ty)
    ctx.lineTo(CENTER_X.value + botR, by)
    ctx.lineTo(CENTER_X.value - botR, by)
    ctx.closePath()
    ctx.setFillStyle('rgba(47, 143, 87, 0.08)')
    ctx.fill()
    return
  }

  const totalRatio = composition.reduce((sum, item) => sum + (item.ratio || 0), 0)
  if (totalRatio <= 0) {
    ctx.beginPath()
    ctx.moveTo(CENTER_X.value - topR, ty)
    ctx.lineTo(CENTER_X.value + topR, ty)
    ctx.lineTo(CENTER_X.value + botR, by)
    ctx.lineTo(CENTER_X.value - botR, by)
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
    ctx.moveTo(CENTER_X.value - layerTopR, layerTopY)
    ctx.lineTo(CENTER_X.value + layerTopR, layerTopY)
    ctx.lineTo(CENTER_X.value + layerBotR, layerBotY)
    ctx.lineTo(CENTER_X.value - layerBotR, layerBotY)
    ctx.closePath()

    const texturePath = props.textureMap?.[item.material]
    if (texturePath) {
      ctx.save()
      ctx.clip()
      ctx.drawImage(texturePath, CENTER_X.value - layerTopR, layerTopY, layerTopR * 2, layerHeight)
      ctx.restore()
    } else {
      ctx.setFillStyle(SUBSTRATE_COLORS[item.material] || SUBSTRATE_COLORS.unknown)
      ctx.fill()
    }

    if (i < composition.length - 1) {
      ctx.beginPath()
      ctx.moveTo(CENTER_X.value - layerBotR, layerBotY)
      ctx.lineTo(CENTER_X.value + layerBotR, layerBotY)
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
  const newRadiusPx = Math.max(
    minRadiusPx.value,
    Math.min(maxRadiusPx.value, startRadiusPx + deltaX)
  )
  emit('update:potTopDiameterCm', radiusPxToCm(newRadiusPx))

  // 垂直 → 盆高（向上拖 = 增高）
  const startHeightPx = heightToPx(touchStartHeightCm.value)
  const newHeightPx = Math.max(
    minHeightPx.value,
    Math.min(maxHeightPx.value, startHeightPx - deltaY)
  )
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
  const newRadiusPx = Math.max(
    minRadiusPx.value,
    Math.min(maxRadiusPx.value, startRadiusPx + deltaX)
  )
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
    () => props.substrateComposition,
    () => props.canvasWidth,
    () => props.canvasHeight
  ],
  () => {
    updateCanvasSizeFromProps()
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
  updateCanvasSizeFromProps()
  if (isNormalMode.value) {
    nextTick(() => setTimeout(() => initCanvas(), 300))
  }
})
</script>
