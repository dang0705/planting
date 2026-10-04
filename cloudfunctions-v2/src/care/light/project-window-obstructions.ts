import type { PlantWindowPosition, WindowAperture } from './trace-direct-through-window.js'

/** 与竖窗平行的有限不透光矩形，坐标沿用窗口原点，不猜建筑或照片尺寸。 */
export interface WindowParallelObstacle extends WindowAperture {
  /** 相对窗面向室外为正的距离；室内可为负，但必须位于目标点前方。 */
  readonly distanceBeyondWindowM: number
  /** 支持该实际几何的来源引用；不是模型自动确认。 */
  readonly sourceRef: string
}

/** 由明确遮挡空间位置投影到窗面的矩形。 */
export interface ProjectedWindowObstacle extends WindowAperture {
  /** 原几何来源，供调用方追溯。 */
  readonly sourceRef: string
}

/** 共用几何可见性，供直射求交与散射立体角积分消费，不是光强倍率。 */
export interface WindowObstructionProjection {
  /** 保留明确输入，不代表未列出的遮挡不存在。 */
  readonly sourceObstacles: readonly WindowParallelObstacle[]
  /** 以目标点为投影中心的窗面遮挡矩形，保留来源。 */
  readonly projectedObstacles: readonly ProjectedWindowObstacle[]
  /** 实际开口并集减遮挡并集；完全挡住时允许空集，不伪造开口。 */
  readonly visibleApertures: readonly WindowAperture[]
}

/** 只检查矩形几何合法性，不计算或猜测透光参数。 */
function validateRectangles(rectangles: readonly WindowAperture[], allowEmpty: boolean): void {
  if (!Array.isArray(rectangles) || (!allowEmpty && rectangles.length === 0)) { throw new RangeError('矩形几何列表缺失') }
  const references = new Set<string>()
  for (const rectangle of rectangles) {
    if (!rectangle || typeof rectangle.reference !== 'string' || !rectangle.reference.trim() || references.has(rectangle.reference) ||
      ![rectangle.leftM, rectangle.rightM, rectangle.bottomM, rectangle.topM].every(Number.isFinite) || rectangle.rightM <= rectangle.leftM || rectangle.topM <= rectangle.bottomM) {
      throw new RangeError('矩形几何非法或引用重复')
    }
    references.add(rectangle.reference)
  }
}

/** 矩形包含整个分区；边界无面积，不用采样中点近似面积覆盖。 */
function contains(outer: WindowAperture, inner: WindowAperture): boolean {
  return outer.leftM <= inner.leftM && outer.rightM >= inner.rightM && outer.bottomM <= inner.bottomM && outer.topM >= inner.topM
}

/**
 * 相似三角形：窗面投影坐标=目标坐标+(遮挡坐标−目标坐标)×d/(d+z)。
 * 外部与室内平行遮挡共用射线几何；不处理斜面、曲面、半透明或未知位置。
 * 用矩形边界构造确定性分区，只保留在实际开口内且未被遮挡的单元。
 */
export function projectWindowObstructions(
  plant: PlantWindowPosition, apertures: readonly WindowAperture[], obstacles: readonly WindowParallelObstacle[],
): WindowObstructionProjection {
  if (!plant || ![plant.xM, plant.yM, plant.perpendicularDistanceM].every(Number.isFinite) || plant.perpendicularDistanceM <= 0) { throw new RangeError('目标位置非法') }
  validateRectangles(apertures, false)
  validateRectangles(obstacles, true)
  const projectedObstacles = obstacles.map(obstacle => {
    const rayDistance = plant.perpendicularDistanceM + obstacle.distanceBeyondWindowM
    if (!Number.isFinite(obstacle.distanceBeyondWindowM) || !Number.isFinite(rayDistance) || rayDistance <= 0 || typeof obstacle.sourceRef !== 'string' || !obstacle.sourceRef.trim()) {
      throw new RangeError('遮挡物不在目标前方或缺少有效几何来源')
    }
    const ratio = plant.perpendicularDistanceM / rayDistance
    const projection = { reference: obstacle.reference, sourceRef: obstacle.sourceRef,
      leftM: plant.xM + (obstacle.leftM - plant.xM) * ratio, rightM: plant.xM + (obstacle.rightM - plant.xM) * ratio,
      bottomM: plant.yM + (obstacle.bottomM - plant.yM) * ratio, topM: plant.yM + (obstacle.topM - plant.yM) * ratio }
    validateRectangles([projection], false)
    return projection
  })
  const all = [...apertures, ...projectedObstacles]
  const xEdges = [...new Set(all.flatMap(rectangle => [rectangle.leftM, rectangle.rightM]))].sort((a, b) => a - b)
  const yEdges = [...new Set(all.flatMap(rectangle => [rectangle.bottomM, rectangle.topM]))].sort((a, b) => a - b)
  const visibleApertures: WindowAperture[] = []
  for (let x = 1; x < xEdges.length; x++) {
    for (let y = 1; y < yEdges.length; y++) {
      const cell = { reference: `visible:${x}:${y}`, leftM: xEdges[x - 1]!, rightM: xEdges[x]!, bottomM: yEdges[y - 1]!, topM: yEdges[y]! }
      if (apertures.some(aperture => contains(aperture, cell)) && !projectedObstacles.some(obstacle => contains(obstacle, cell))) { visibleApertures.push(cell) }
    }
  }
  return { sourceObstacles: structuredClone(obstacles), projectedObstacles, visibleApertures }
}
