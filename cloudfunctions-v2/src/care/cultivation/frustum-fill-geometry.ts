/** 圆台内盆在某一装土高度处的几何量；半径按盆高线性插值（合同第 4 节、第 8.4 节）。 */
export interface FrustumFillGeometry {
  /** 装土体积（mL，1 cm³ = 1 mL）。 */
  readonly volumeMl: number
  /** 装土面（土表）面积（cm²），即土表蒸发面。 */
  readonly surfaceAreaCm2: number
}

/**
 * 计算圆台在装土高度 fillHeight 处的装土体积与土表面积。纯数学规则，无经验系数。
 * 调用方负责保证尺寸为有限正数且 0 < fillHeight ≤ height。
 */
export function frustumFillGeometry(topDiameterCm: number, bottomDiameterCm: number, heightCm: number, fillHeightCm: number): FrustumFillGeometry {
  const bottomRadius = bottomDiameterCm / 2
  const surfaceRadius = bottomRadius + (topDiameterCm / 2 - bottomRadius) * fillHeightCm / heightCm
  return {
    volumeMl: Math.PI * fillHeightCm / 3 * (surfaceRadius ** 2 + surfaceRadius * bottomRadius + bottomRadius ** 2),
    surfaceAreaCm2: Math.PI * surfaceRadius ** 2,
  }
}
