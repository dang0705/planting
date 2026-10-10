import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'

/**
 * 三轴视觉筛选的纯规则（plant-visual-axis-filter/v1，用户 2026-10-10 审定）。
 * 只做参数解析、游标编解码与取值整理，不访问数据库、不读策略。
 * 前端类比：像电商筛选面板的 URL 解析器——把 `?leafShape=HEART,ELLIPTIC` 变成「叶型 ∈ {心形, 椭圆}」。
 */

/** 已准入的三个维度：轴代码、对外查询参数名与响应字段名。增删轴是合同变更（代码常量 + 合同版本）。 */
export const VISUAL_FILTER_AXES = Object.freeze([
  Object.freeze({ axisCode: 'LEAF_SHAPE', queryParameter: 'leafShape' }),
  Object.freeze({ axisCode: 'GROWTH_FORM', queryParameter: 'growthForm' }),
  Object.freeze({ axisCode: 'LEAF_SURFACE', queryParameter: 'leafSurface' })
] as const)

/** 已准入轴代码。 */
export type VisualAxisCode = (typeof VISUAL_FILTER_AXES)[number]['axisCode']
/** 对外查询参数名，同时是响应 visualAxes 的字段名。 */
export type VisualAxisParameter = (typeof VISUAL_FILTER_AXES)[number]['queryParameter']

/** 值代码格式：大写字母开头，仅大写字母、数字与下划线，长度 ≤ 64（= value_code VARCHAR(64)）。 */
const valueCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/u

/** 游标所编码的 taxon_id 最大码点数 = taxon_id VARCHAR(512)（与百科引用绝对上限同源）。 */
const cursorMaxCodePoints =
  RUNTIME_PARAMETERS.policyBounds.plantKnowledgePublicSearch.value
    .encyclopediaReferenceMaxCodePoints

/** 某一轴的筛选条件：同轴值之间为 OR。 */
export type VisualAxisSelection = {
  /** 本条件作用的准入轴代码（叶型/株型/叶面质感之一）。 */
  readonly axisCode: VisualAxisCode
  /** 去重后的值代码，保留首次出现顺序。 */
  readonly values: readonly string[]
}

/** 解析结果：成功时给出各轴条件、原始 limit 与游标；失败统一为参数非法（400）。 */
export type ParsedVisualFilterQuery =
  | {
      /** 解析成功标志，此时各字段可用。 */
      readonly ok: true
      /** 至少一个轴；按 VISUAL_FILTER_AXES 固定顺序排列，跨轴为 AND。 */
      readonly selections: readonly VisualAxisSelection[]
      /** 省略为 null，由策略默认值补齐；否则为已校验的正整数（上限由调用方按策略判断）。 */
      readonly limit: number | null
      /** 游标解码出的上一页最后一个 taxon_id；首页为 null。 */
      readonly afterTaxonRef: string | null
    }
  | {
      /** 解析失败标志：调用方统一返回 400 参数非法。 */
      readonly ok: false
    }

/** 读取某个查询参数：未出现为 undefined；出现多次视为非法（返回 null）。 */
function single(parameters: URLSearchParams, name: string): string | undefined | null {
  const values = parameters.getAll(name)
  if (values.length === 0) {
    return undefined
  }
  return values.length === 1 ? values[0]! : null
}

/** 把逗号分隔的值代码解析为去重列表；空串、空段或格式不符返回 null。 */
function parseValueCodes(raw: string): string[] | null {
  const segments = raw.split(',')
  if (segments.some(segment => !valueCodePattern.test(segment))) {
    return null
  }
  return [...new Set(segments)]
}

/** 编码游标：taxon_id 的 UTF-8 字节做 base64url（无填充），客户端视为不透明字符串。 */
export function encodeVisualFilterCursor(taxonRef: string): string {
  return Buffer.from(taxonRef, 'utf8').toString('base64url')
}

/** 解码游标：必须是规范 base64url、合法 UTF-8、1–512 码点，否则返回 null。 */
export function decodeVisualFilterCursor(raw: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(raw)) {
    return null
  }
  const bytes = Buffer.from(raw, 'base64url')
  if (bytes.toString('base64url') !== raw) {
    return null
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  const length = [...text].length
  return length >= 1 && length <= cursorMaxCodePoints ? text : null
}

/** 解析 visual-filter 查询参数；未知参数忽略，三轴全空为非法。 */
export function parseVisualFilterQuery(parameters: URLSearchParams): ParsedVisualFilterQuery {
  const selections: VisualAxisSelection[] = []
  for (const axis of VISUAL_FILTER_AXES) {
    const raw = single(parameters, axis.queryParameter)
    if (raw === null) {
      return { ok: false }
    }
    if (raw === undefined) {
      continue
    }
    const values = parseValueCodes(raw)
    if (values === null) {
      return { ok: false }
    }
    selections.push({ axisCode: axis.axisCode, values })
  }
  if (selections.length === 0) {
    return { ok: false }
  }
  const limitRaw = single(parameters, 'limit')
  if (limitRaw === null || (limitRaw !== undefined && !/^[1-9][0-9]{0,2}$/u.test(limitRaw))) {
    return { ok: false }
  }
  const cursorRaw = single(parameters, 'cursor')
  if (cursorRaw === null) {
    return { ok: false }
  }
  const afterTaxonRef = cursorRaw === undefined ? null : decodeVisualFilterCursor(cursorRaw)
  if (cursorRaw !== undefined && afterTaxonRef === null) {
    return { ok: false }
  }
  return {
    ok: true,
    selections,
    limit: limitRaw === undefined ? null : Number(limitRaw),
    afterTaxonRef
  }
}

/** 生效枚举中的一个可选值（sortOrder 只用于排序，不对外）。 */
export type VisualAxisCatalogValue = {
  /** 可选值代码（value_code），请求与响应中使用。 */
  readonly valueCode: string
  /** 可选值中文名（value_name_zh），供筛选面板展示。 */
  readonly nameZh: string
  /** 可选值中文定义（value_definition_zh），供说明浮层展示。 */
  readonly definitionZh: string
  /** 排序号（sort_order）。 */
  readonly sortOrder: number
}

/** 生效枚举中的一个准入轴。 */
export type VisualAxisCatalogAxis = {
  /** 生效枚举所属的准入轴代码。 */
  readonly axisCode: VisualAxisCode
  /** 轴中文名（axis_name_zh），如「叶型」。 */
  readonly nameZh: string
  /** 按 sortOrder、valueCode 升序的可选值。 */
  readonly values: readonly VisualAxisCatalogValue[]
}

/** 请求中的值是否全部属于对应轴的生效枚举。 */
export function selectionsWithinCatalog(
  selections: readonly VisualAxisSelection[],
  catalog: ReadonlyMap<VisualAxisCode, VisualAxisCatalogAxis>
): boolean {
  return selections.every(selection => {
    const codes = new Set(
      catalog.get(selection.axisCode)?.values.map(value => value.valueCode) ?? []
    )
    return selection.values.every(value => codes.has(value))
  })
}

/**
 * 整理某株在某轴的公开取值：只保留生效枚举内的字符串代码，去重并按枚举顺序排列；
 * 非数组、无合法值时为 null（缺值不补齐）。
 */
export function toPublicAxisValues(
  raw: unknown,
  axis: VisualAxisCatalogAxis | undefined
): string[] | null {
  if (!Array.isArray(raw) || axis === undefined) {
    return null
  }
  const present = new Set(raw.filter((value): value is string => typeof value === 'string'))
  const ordered = axis.values
    .filter(value => present.has(value.valueCode))
    .map(value => value.valueCode)
  return ordered.length > 0 ? ordered : null
}
