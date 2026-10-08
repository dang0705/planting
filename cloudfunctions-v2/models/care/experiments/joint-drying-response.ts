/**
 * 光照饱和与对数VPD响应的离线假设，禁止运行入口导入。
 * 公式、独立预期和生物适用缺口见 ../joint-drying-response-contract.md。
 */

/** 非负有限范围；数学包络，不是统计置信区间。 */
export interface ResponseRange { readonly min: number; readonly max: number }

/** 全部参数必须由实验提供；没有默认值或生产准入。 */
export interface JointResponseParameters {
  /** 公式标识，不等于已发布算法版本。 */
  readonly version: 'light-log-vpd-hypothesis/v1'
  /** 参数制品依据。 */
  readonly sourceRef: string
  /** 叶片项与土壤项共用的参考条件。 */
  readonly referenceRef: string
  /** 参考光合光子通量，μmol/(m²·s)，必须大于零。 */
  readonly referencePpfd: number
  /** 参考水汽压差，kPa，不称为最适值。 */
  readonly referenceVpdKpa: number
  /** 光响应半饱和通量，单位与PPFD相同。 */
  readonly lightHalfSaturationPpfd: number
  /** 无量纲对数敏感度；不是导度单位的m。 */
  readonly vpdSensitivity: number
  /** 参考整盆失水中蒸腾的份额，[0,1]，不是叶面积比例。 */
  readonly referenceTranspirationShare: number
  /** 本实验明确允许的光照范围，不证明生物适用性。 */
  readonly validPpfd: ResponseRange
  /** 本实验明确允许的VPD范围，超出不钳制。 */
  readonly validVpdKpa: ResponseRange
}

/** 蒸发独立证据必须与响应参数共享参考条件；不从气孔推断。 */
export interface SoilEvaporationCandidate {
  readonly referenceRef: string
  /** 无量纲相对蒸发需求，不能直接传毫升。 */
  readonly range: ResponseRange
}

/** 同刻、同位置的范围由调用用例校验；空值保持缺证据。 */
export interface JointResponseInput {
  readonly parameters: JointResponseParameters | null
  readonly ppfd: ResponseRange | null
  readonly vpdKpa: ResponseRange | null
  readonly soilEvaporation: SoilEvaporationCandidate | null
}

/** 只有有限、非负、非反序范围可参与计算；拒绝null转换为0。 */
function validateRange(range: ResponseRange): void {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min < 0 || range.max < range.min) {
    throw new RangeError('联合响应范围非法')
  }
}

/** 范围须完整包含；不能只检查中心或把超界输入夹回范围。 */
function contains(outer: ResponseRange, inner: ResponseRange): boolean {
  return outer.min <= inner.min && outer.max >= inner.max
}

/** 避免q+k溢出；零光照是有效值，参考通量另行要求正值。 */
function lightResponse(q: number, k: number): number {
  const value = q <= k ? (q / k) / (1 + q / k) : 1 / (1 + k / q)
  if (q > 0 && value === 0) { throw new RangeError('正光响应下溢，不能当作零光照') }
  return value
}

/**
 * 相对叶片通量D·gs的数学候选；零VPD只定义通量极限，不计算无穷导度。
 * 先判断零截断，再在对数域相乘，避免0乘Infinity及比值溢出。
 */
function vaporFlux(d: number, p: JointResponseParameters): number {
  if (d === 0) { return 0 }
  const logRatio = Math.log(d) - Math.log(p.referenceVpdKpa)
  const conductance = 1 - p.vpdSensitivity * logRatio
  if (conductance <= 0) { return 0 }
  const value = Math.exp(logRatio + Math.log(conductance))
  if (!Number.isFinite(value) || value === 0) { throw new RangeError('联合响应超出数值表示范围') }
  return value
}

/** 非单调VPD响应的上下界，内部驻点不能遗漏。 */
function vaporEnvelope(range: ResponseRange, p: JointResponseParameters): ResponseRange {
  const a = vaporFlux(range.min, p); const b = vaporFlux(range.max, p)
  let maximum = Math.max(a, b)
  const peakLog = Math.log(p.referenceVpdKpa) + 1 / p.vpdSensitivity - 1
  if (peakLog >= Math.log(range.min) && peakLog <= Math.log(range.max)) {
    maximum = Math.max(maximum, Math.exp(1 / p.vpdSensitivity - 1 + Math.log(p.vpdSensitivity)))
  }
  const result = { min: Math.min(a, b), max: maximum }
  validateRange(result)
  return result
}

/** 显式研究参数先校验，缺值不默补；不访问配置、网络或数据库。 */
export function deriveJointDryingResponse(input: JointResponseInput) {
  const boundary = { productionAdmission: false as const }
  const p = input.parameters
  if (p === null || input.ppfd === null || input.vpdKpa === null || input.soilEvaporation === null) {
    return { ...boundary, status: 'insufficient_evidence' as const }
  }
  if (!p || p.version !== 'light-log-vpd-hypothesis/v1' || !p.sourceRef?.trim() || !p.referenceRef?.trim()
    || input.soilEvaporation.referenceRef !== p.referenceRef) { throw new TypeError('联合响应版本或参考来源不一致') }
  for (const value of [p.referencePpfd, p.referenceVpdKpa, p.lightHalfSaturationPpfd, p.vpdSensitivity]) {
    if (!Number.isFinite(value) || value <= 0) { throw new RangeError('联合响应参数必须为正有限数') }
  }
  if (!Number.isFinite(p.referenceTranspirationShare) || p.referenceTranspirationShare < 0 || p.referenceTranspirationShare > 1) {
    throw new RangeError('参考蒸腾份额非法')
  }
  for (const range of [p.validPpfd, p.validVpdKpa, input.ppfd, input.vpdKpa, input.soilEvaporation.range]) { validateRange(range) }
  if (!contains(p.validPpfd, { min: p.referencePpfd, max: p.referencePpfd })
    || !contains(p.validVpdKpa, { min: p.referenceVpdKpa, max: p.referenceVpdKpa })) { throw new RangeError('参考点超出实验域') }
  if (!contains(p.validPpfd, input.ppfd) || !contains(p.validVpdKpa, input.vpdKpa)) {
    return { ...boundary, status: 'outside_model_scope' as const }
  }
  const referenceLight = lightResponse(p.referencePpfd, p.lightHalfSaturationPpfd)
  if (referenceLight === 0) { throw new RangeError('参考光响应下溢') }
  const vapor = vaporEnvelope(input.vpdKpa, p)
  const leaf = {
    min: lightResponse(input.ppfd.min, p.lightHalfSaturationPpfd) / referenceLight * vapor.min,
    max: lightResponse(input.ppfd.max, p.lightHalfSaturationPpfd) / referenceLight * vapor.max,
  }
  validateRange(leaf)
  const w = p.referenceTranspirationShare
  const environmentDemand = {
    min: w * leaf.min + (1 - w) * input.soilEvaporation.range.min,
    max: w * leaf.max + (1 - w) * input.soilEvaporation.range.max,
  }
  validateRange(environmentDemand)
  return { ...boundary, status: 'candidate' as const, relativeLeafTranspiration: leaf, environmentDemand }
}
