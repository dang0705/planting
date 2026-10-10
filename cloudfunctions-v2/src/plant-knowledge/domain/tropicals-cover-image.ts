/**
 * Tropicals 封面图公开映射（plant-encyclopedia-read/v2「封面图」节；weather 推荐复用）。
 *
 * 用户 2026-10-09 裁决：所有封面图对外公开，暂不考虑法律风险，但每张图必须带来源。
 * 本模块只把外部表 `tropicals_species_encyclopedia_ref` 的两列翻译成公开 DTO，
 * 不做许可判断、不读写数据库、不请求网络。
 */

/**
 * 封面图托管 CDN 根地址。
 * 依据：测试库 cover_source_json.resolvedImageUrl 均为该前缀 + imageRef（HEAD_VERIFIED_IMAGE），
 * 2026-10-09 实测 HEAD 200。属外部表语义依赖（变更须按外部表合同通知），不是运行时配置。
 */
const tropicalsCoverCdnBase = 'https://cdn.tropicals.cn/'

/** 图片固定提供方署名：图由 Tropicals.cn 的 CDN 托管。 */
const tropicalsProvider = 'Tropicals.cn'

/** Tropicals 物种页前缀；taxon_id 以此开头时即为该种的公开页面。 */
const tropicalsSpeciesPagePrefix = 'https://tropicals.cn/species/'

/** 可公开的来源 JSON 结构版本；其他版本字段语义未知，不采信。 */
const supportedCoverSourceSchema = 'tropicals-cover-reference/v1'

/** 允许公开的相对引用：`img/` 开头，路径段仅含字母数字与 `._-`。 */
const coverImageRefPattern = /^img(?:\/[A-Za-z0-9._-]+)+$/u

/** 封面图来源；逐图字段未知时为 null，但提供方恒有值，保证「每张图都有来源」。 */
export type TropicalsCoverImageSource = {
  /** 图片提供方署名，固定为 Tropicals.cn。 */
  readonly provider: string
  /** 该种在 Tropicals 的物种页（taxon_id）；不是 Tropicals 物种页形态时为 null。 */
  readonly pageUrl: string | null
  /** 上游来源类型（如 inat_obs）；未知时为 null。 */
  readonly sourceName: string | null
  /** 原图/观察记录链接，仅 http(s)；未知时为 null。 */
  readonly originalUrl: string | null
  /** 原图作者；未知时为 null。 */
  readonly creator: string | null
  /** 许可代码（如 cc-by、cc0）；未知时为 null。 */
  readonly license: string | null
  /** 许可文本链接，仅 http(s)；未知时为 null。 */
  readonly licenseUrl: string | null
  /** 上游原文署名；未知时为 null。 */
  readonly attribution: string | null
}

/** 公开封面图 DTO。 */
export type TropicalsCoverImage = {
  /** 前端可直接加载的完整 https 地址。 */
  readonly url: string
  /** 该图的来源说明，封面存在时恒为对象。 */
  readonly source: TropicalsCoverImageSource
}

/** 映射输入：来自同一百科行的三列原值。 */
export type TropicalsCoverImageInput = {
  /** 百科分类引用 taxon_id。 */
  readonly taxonId: unknown
  /** cover_image_ref 原值。 */
  readonly coverImageRef: unknown
  /** cover_source_json 原值（mysql2 可能返回对象或字符串）。 */
  readonly coverSourceJson: unknown
}

/** 非空白字符串原样返回，其余（非字符串、空白）为 null。 */
function readSourceText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** 仅接受 http(s) 绝对链接，防止 javascript: 等协议进入前端。 */
function readSourceLink(value: unknown): string | null {
  const text = readSourceText(value)
  if (!text) {
    return null
  }
  try {
    const protocol = new URL(text).protocol
    return protocol === 'https:' || protocol === 'http:' ? text : null
  } catch {
    return null
  }
}

/** 解析来源 JSON；非法、非对象、版本不符或描述的是另一张图时返回 null（不采信）。 */
function readCoverSource(value: unknown, coverImageRef: string): Record<string, unknown> | null {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      return null
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const source = parsed as Record<string, unknown>
  if (source.schemaVersion !== supportedCoverSourceSchema || source.imageRef !== coverImageRef) {
    return null
  }
  return source
}

/**
 * 把百科行的封面列翻译为公开 DTO。
 * - 无封面或引用不可公开 → null；引用为非字符串 → 抛错（行损坏，由调用方泛化为 500）。
 * - 来源 JSON 不可采信时图仍返回，逐图来源字段全为 null，不把别图信息署到本图。
 */
export function toTropicalsCoverImage(input: TropicalsCoverImageInput): TropicalsCoverImage | null {
  const { coverImageRef } = input
  if (coverImageRef === null || coverImageRef === undefined || coverImageRef === '') {
    return null
  }
  if (typeof coverImageRef !== 'string') {
    throw new Error('封面引用字段损坏')
  }
  if (
    !coverImageRefPattern.test(coverImageRef) ||
    coverImageRef.split('/').some(segment => segment === '.' || segment === '..')
  ) {
    return null
  }
  const source = readCoverSource(input.coverSourceJson, coverImageRef)
  const pageUrl =
    typeof input.taxonId === 'string' && input.taxonId.startsWith(tropicalsSpeciesPagePrefix)
      ? input.taxonId
      : null
  return {
    url: `${tropicalsCoverCdnBase}${coverImageRef}`,
    source: {
      provider: tropicalsProvider,
      pageUrl,
      sourceName: readSourceText(source?.coverSource),
      originalUrl: readSourceLink(source?.coverSourceUrl),
      creator: readSourceText(source?.coverCreator),
      license: readSourceText(source?.coverLicense),
      licenseUrl: readSourceLink(source?.coverLicenseUrl),
      attribution: readSourceText(source?.coverAttribution)
    }
  }
}
