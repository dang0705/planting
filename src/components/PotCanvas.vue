<template>
  <view
    class="pot-canvas-root relative"
    :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
  >
    <!-- 骨架屏 -->
    <view
      v-if="!shouldRenderCanvas"
      class="absolute inset-0 flex flex-col items-center justify-center"
    >
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

    <!-- Canvas 绘制层（Canvas 2D 同层渲染，避免在 scroll-view 中滚动时定住） -->
    <canvas
      v-if="shouldRenderCanvas"
      type="2d"
      :id="canvasId"
      class="absolute inset-0"
      :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
    />

    <!-- 盆口右把手（水平控直径 + 垂直控高度，二合一） -->
    <view
      v-if="shouldRenderCanvas"
      :id="`${idPrefix}-top-handle`"
      class="pot-canvas-drag-handle absolute flex items-center justify-center"
      :class="{ 'pot-canvas-drag-handle-active': activeHandle === 'top' }"
      :style="{
        left: topHandleX - handleOuterSize / 2 + 'px',
        top: topHandleY - handleOuterSize / 2 + 'px',
        width: handleOuterSize + 'px',
        height: handleOuterSize + 'px'
      }"
      @touchstart.stop.prevent="onTopHandleTouchStart"
      @touchmove.stop.prevent="onTopHandleTouchMove"
      @touchend.stop="onHandleTouchEnd"
      @touchcancel.stop="onHandleTouchEnd"
    >
      <view
        class="pot-canvas-drag-handle-dot rounded-full bg-[#2f8f57] shadow-sm"
        :style="{ width: handleInnerSize + 'px', height: handleInnerSize + 'px' }"
      />
    </view>

    <!-- 盆底右把手（仅水平） -->
    <view
      v-if="shouldRenderCanvas"
      :id="`${idPrefix}-bottom-handle`"
      class="pot-canvas-drag-handle absolute flex items-center justify-center"
      :class="{ 'pot-canvas-drag-handle-active': activeHandle === 'bottom' }"
      :style="{
        left: bottomHandleX - handleOuterSize / 2 + 'px',
        top: bottomHandleY - handleOuterSize / 2 + 'px',
        width: handleOuterSize + 'px',
        height: handleOuterSize + 'px'
      }"
      @touchstart.stop.prevent="onBottomHandleTouchStart"
      @touchmove.stop.prevent="onBottomHandleTouchMove"
      @touchend.stop="onHandleTouchEnd"
      @touchcancel.stop="onHandleTouchEnd"
    >
      <view
        class="pot-canvas-drag-handle-dot rounded-full bg-[#2f8f57] shadow-sm"
        :style="{ width: handleInnerSize + 'px', height: handleInnerSize + 'px' }"
      />
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, getCurrentInstance } from 'vue'

const props = defineProps({
  potTopDiameterCm: { type: Number, default: null },
  potBottomDiameterCm: { type: Number, default: null },
  potHeightCm: { type: Number, default: null },
  previewOnly: { type: Boolean, default: false },
  exampleDimensions: { type: Object, default: () => ({}) },
  idPrefix: { type: String, default: 'pot-canvas' },
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
// 顶部需留足空间容纳盆口文字标签（字号 + 间距约 19px），183 保证 height=50cm 时文字不被外层 overflow-hidden 裁剪
const BASE_CENTER_X = 100
const BASE_BOTTOM_Y = 183

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
const canvasId = computed(() => `${props.idPrefix || 'pot-canvas'}-canvas`)

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

// 盆型缺失时仍绘制浅色示例，避免用户把“没有真实数据”误解成“没有可看的内容”。
const hasAnyDimensions = computed(() =>
  [props.potTopDiameterCm, props.potBottomDiameterCm, props.potHeightCm].some(
    value => Number(value) > 0
  )
)
const shouldRenderCanvas = computed(
  () => isNormalMode.value || props.previewOnly || hasAnyDimensions.value
)
const isExampleOnly = computed(
  () =>
    props.previewOnly &&
    !Object.values(props.exampleDimensions || {}).some(isExample => isExample === false)
)

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

function getTouchPoint(event) {
  return event?.touches?.[0] || event?.changedTouches?.[0] || null
}

let canvasNode = null
let ctx = null
let dpr = 1
const MAX_INIT_RETRIES = 8
const textureImageCache = new Map()
let setupRequestId = 0
let initPromise = null

function applyCanvasBufferSize() {
  if (!canvasNode || !ctx) {
    return
  }
  canvasNode.width = Math.max(1, Math.round(canvasWidth.value * dpr))
  canvasNode.height = Math.max(1, Math.round(canvasHeight.value * dpr))
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
  ctx.scale(dpr, dpr)
}

function setupCanvas() {
  const requestId = ++setupRequestId
  return new Promise(resolve => {
    const compInstance = instance?.proxy || instance?.ctx
    if (!compInstance) {
      resolve(false)
      return
    }
    uni
      .createSelectorQuery()
      .in(compInstance)
      .select(`#${canvasId.value}`)
      .fields({ node: true, size: true })
      .exec(res => {
        if (requestId !== setupRequestId) {
          resolve(false)
          return
        }
        const node = res?.[0]?.node
        if (!node) {
          resolve(false)
          return
        }
        canvasNode = node
        try {
          ctx = canvasNode.getContext('2d')
        } catch (error) {
          console.warn('[PotCanvas] 获取绘图上下文失败', canvasId.value, error)
          canvasNode = null
          ctx = null
          resolve(false)
          return
        }
        if (!ctx) {
          canvasNode = null
          resolve(false)
          return
        }
        try {
          dpr = uni.getSystemInfoSync().pixelRatio || 1
        } catch {
          dpr = 1
        }
        try {
          applyCanvasBufferSize()
          preloadTextures()
          draw()
          resolve(true)
        } catch (error) {
          console.warn('[PotCanvas] 初始化绘制失败', canvasId.value, error)
          canvasNode = null
          ctx = null
          resolve(false)
        }
      })
  })
}

async function initCanvas() {
  if (initPromise) {
    return initPromise
  }
  initPromise = (async () => {
    for (let attempt = 0; attempt <= MAX_INIT_RETRIES; attempt += 1) {
      if (await setupCanvas()) {
        return true
      }
      if (attempt < MAX_INIT_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 250))
      }
    }
    return false
  })()
  try {
    return await initPromise
  } finally {
    initPromise = null
  }
}

function preloadTextures() {
  if (!canvasNode) {
    return
  }
  const map = props.textureMap || {}
  Object.values(map).forEach(path => {
    if (path && !textureImageCache.has(path)) {
      const img = canvasNode.createImage()
      img.onload = () => {
        textureImageCache.set(path, img)
        draw()
      }
      img.onerror = () => {
        textureImageCache.set(path, null)
      }
      img.src = path
    }
  })
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

  if (shouldRenderCanvas.value) {
    try {
      drawSubstrateLayers(topR, botR, h, ty, by)
    } catch (error) {
      console.warn('[PotCanvas] 基质绘制失败，已使用盆体底色', canvasId.value, error)
      fillPotBody(topR, botR, ty, by, 'rgba(47, 143, 87, 0.08)')
    }

    ctx.beginPath()
    ctx.moveTo(CENTER_X.value - topR, ty)
    ctx.lineTo(CENTER_X.value + topR, ty)
    ctx.lineTo(CENTER_X.value + botR, by)
    ctx.lineTo(CENTER_X.value - botR, by)
    ctx.closePath()
    const strokeColor = isExampleOnly.value ? '#9ab3a0' : '#2f8f57'
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 1.5
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash(isExampleOnly.value ? [5 * scaleBase.value, 4 * scaleBase.value] : [])
    }
    ctx.stroke()
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([])
    }

    ctx.fillStyle = strokeColor
    ctx.font = `${labelFontSize.value}px sans-serif`
    ctx.textAlign = 'center'
    const topLabelPrefix = props.exampleDimensions?.top ? '示例 ' : ''
    const bottomLabelPrefix = props.exampleDimensions?.bottom ? '示例 ' : ''
    ctx.fillText(
      topLabelPrefix + '盆口 ' + effTopCm.value + 'cm',
      CENTER_X.value,
      ty - 8 * scaleY.value
    )
    ctx.fillText(
      bottomLabelPrefix + '盆底 ' + effBottomCm.value + 'cm',
      CENTER_X.value,
      by + 18 * scaleY.value
    )

    const heightText = `${props.exampleDimensions?.height ? '示例 ' : ''}高${effHeightCm.value}cm`
    const labelX =
      CENTER_X.value + Math.max(topR, botR) + HEIGHT_LABEL_RIGHT_GAP_PX * scaleBase.value
    const labelCenterY = (ty + by) / 2
    ctx.fillStyle = strokeColor
    ctx.font = `${labelFontSize.value}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(heightText, labelX, labelCenterY)
  }
}

function fillPotBody(topR, botR, ty, by, fillStyle) {
  ctx.beginPath()
  ctx.moveTo(CENTER_X.value - topR, ty)
  ctx.lineTo(CENTER_X.value + topR, ty)
  ctx.lineTo(CENTER_X.value + botR, by)
  ctx.lineTo(CENTER_X.value - botR, by)
  ctx.closePath()
  ctx.fillStyle = fillStyle
  ctx.fill()
}

function drawSubstrateLayers(topR, botR, h, ty, by) {
  if (isExampleOnly.value) {
    fillPotBody(topR, botR, ty, by, 'rgba(154, 179, 160, 0.10)')
    return
  }
  const composition = (Array.isArray(props.substrateComposition) ? props.substrateComposition : [])
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const ratio = Number(item.ratio)
      return Number.isFinite(ratio) && ratio > 0 ? { material: item.material, ratio } : null
    })
    .filter(Boolean)
  if (!composition || !composition.length) {
    fillPotBody(topR, botR, ty, by, 'rgba(47, 143, 87, 0.08)')
    return
  }

  const totalRatio = composition.reduce((sum, item) => sum + (item.ratio || 0), 0)
  if (!Number.isFinite(totalRatio) || totalRatio <= 0) {
    fillPotBody(topR, botR, ty, by, 'rgba(47, 143, 87, 0.08)')
    return
  }

  let currentY = ty
  for (let i = 0; i < composition.length; i += 1) {
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
    const img = texturePath ? textureImageCache.get(texturePath) : null
    if (img) {
      ctx.save()
      ctx.clip()
      ctx.drawImage(img, CENTER_X.value - layerTopR, layerTopY, layerTopR * 2, layerHeight)
      ctx.restore()
    } else {
      ctx.fillStyle = SUBSTRATE_COLORS[item.material] || SUBSTRATE_COLORS.unknown
      ctx.fill()
    }

    if (i < composition.length - 1) {
      ctx.beginPath()
      ctx.moveTo(CENTER_X.value - layerBotR, layerBotY)
      ctx.lineTo(CENTER_X.value + layerBotR, layerBotY)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    currentY = layerBotY
  }
}

// 盆口右把手：水平控直径 + 垂直控高度
function onTopHandleTouchStart(e) {
  const point = getTouchPoint(e)
  if (!point) {
    return
  }
  activeHandle.value = 'top'
  touchStartX.value = point.clientX ?? point.pageX ?? 0
  touchStartY.value = point.clientY ?? point.pageY ?? 0
  touchStartTopCm.value = props.potTopDiameterCm || SKELETON_TOP
  touchStartHeightCm.value = props.potHeightCm || SKELETON_HEIGHT
}

function onTopHandleTouchMove(e) {
  if (activeHandle.value !== 'top') {
    return
  }
  const point = getTouchPoint(e)
  if (!point) {
    return
  }
  const currentX = point.clientX ?? point.pageX ?? touchStartX.value
  const currentY = point.clientY ?? point.pageY ?? touchStartY.value
  const deltaX = currentX - touchStartX.value
  const deltaY = currentY - touchStartY.value

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
  const point = getTouchPoint(e)
  if (!point) {
    return
  }
  activeHandle.value = 'bottom'
  touchStartX.value = point.clientX ?? point.pageX ?? 0
  touchStartBottomCm.value = props.potBottomDiameterCm || SKELETON_BOTTOM
}

function onBottomHandleTouchMove(e) {
  if (activeHandle.value !== 'bottom') {
    return
  }
  const point = getTouchPoint(e)
  if (!point) {
    return
  }
  const currentX = point.clientX ?? point.pageX ?? touchStartX.value
  const deltaX = currentX - touchStartX.value
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
    () => props.previewOnly,
    () => props.exampleDimensions,
    () => props.substrateComposition,
    () => props.canvasWidth,
    () => props.canvasHeight,
    () => props.idPrefix
  ],
  () => {
    updateCanvasSizeFromProps()
    if (shouldRenderCanvas.value) {
      nextTick(() => {
        if (!ctx) {
          initCanvas()
        } else {
          applyCanvasBufferSize()
          draw()
        }
      })
    }
  },
  { deep: true }
)

watch(
  shouldRenderCanvas,
  visible => {
    if (!visible) {
      setupRequestId += 1
      canvasNode = null
      ctx = null
      return
    }
    nextTick(() => initCanvas())
  },
  { flush: 'post' }
)

onMounted(() => {
  updateCanvasSizeFromProps()
  if (shouldRenderCanvas.value) {
    nextTick(() => initCanvas())
  }
})

onBeforeUnmount(() => {
  setupRequestId += 1
  canvasNode = null
  ctx = null
  initPromise = null
})
</script>

<style scoped>
.pot-canvas-drag-handle {
  border-radius: 9999px;
  box-shadow: 0 0 0 2px rgba(47, 143, 87, 0.2);
  animation: pot-canvas-handle-breathe 1.8s ease-in-out infinite;
}

.pot-canvas-drag-handle-dot {
  box-sizing: border-box;
  border: 2px solid #ffffff;
}

.pot-canvas-drag-handle-active {
  animation-duration: 1s;
}

@keyframes pot-canvas-handle-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 2px rgba(47, 143, 87, 0.2);
  }

  50% {
    box-shadow: 0 0 0 6px rgba(47, 143, 87, 0.34);
  }
}
</style>
