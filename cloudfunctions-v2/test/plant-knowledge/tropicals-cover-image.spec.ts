import { describe, expect, test } from 'vitest'

import { toTropicalsCoverImage } from '../../src/plant-knowledge/domain/tropicals-cover-image.js'

/**
 * Expected：plant-encyclopedia-read/v2「封面图」节（用户 2026-10-09 裁决：封面全部公开、每图须有来源）。
 * Happy 数据照抄测试库 qinghuazhi_v2_test 只读抽样：
 * - 鹤望兰（iNaturalist 来源，逐图作者与 CC BY 许可齐全）；
 * - 八角金盘（来源未知，逐图字段均为 null，含审核/内部状态字段）。
 * 层次：L1 / unit_fake（纯函数，无替换边界）。不证明：CDN 可用性（另由 HEAD 实测）、SQL 读取。
 */

const strelitziaSource = {
  apiEndpoint: 'https://tropicals.cn/api/v1/species/strelitzia-reginae',
  coverAttribution: '(c) Luis F. Ramírez, some rights reserved (CC BY)',
  coverAuditStatus: 'unknown',
  coverBlockedReason: null,
  coverCreator: 'Luis F. Ramírez',
  coverLicense: 'cc-by',
  coverLicenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  coverSource: 'inat_obs',
  coverSourceUrl: 'https://www.inaturalist.org/observations/33262343',
  datasetLicense: 'CC-BY 4.0',
  displayPolicy: 'USER_ACCEPTED_UNKNOWN_LICENSE_RISK_TEST_REFERENCE',
  imageRef: 'img/2026/09/cce973838b11.webp',
  licenseStatus: 'UNKNOWN',
  resolvedImageUrl: 'https://cdn.tropicals.cn/img/2026/09/cce973838b11.webp',
  reviewStatus: 'PENDING',
  schemaVersion: 'tropicals-cover-reference/v1',
  taxonId: 'https://tropicals.cn/species/strelitzia-reginae'
}

const fatsiaSource = {
  apiEndpoint: 'https://tropicals.cn/api/v1/species/fatsia-japonica',
  coverAttribution: null,
  coverAuditStatus: 'unknown',
  coverBlockedReason: null,
  coverClear: true,
  coverCommercialOk: null,
  coverCreator: null,
  coverLicense: null,
  coverLicenseUrl: null,
  coverSource: null,
  coverSourceUrl: null,
  datasetLicense: 'CC-BY 4.0',
  displayPolicy: 'USER_ACCEPTED_UNKNOWN_LICENSE_RISK_TEST_REFERENCE',
  imageLicenseNote: 'Images are licensed per-source.',
  imageRef: 'img/2026/04/c0b613d0d6f6.webp',
  licenseStatus: 'UNKNOWN',
  resolvedImageUrl: 'https://cdn.tropicals.cn/img/2026/04/c0b613d0d6f6.webp',
  reviewStatus: 'PENDING',
  schemaVersion: 'tropicals-cover-reference/v1',
  taxonId: 'https://tropicals.cn/species/fatsia-japonica'
}

const strelitzia = {
  taxonId: 'https://tropicals.cn/species/strelitzia-reginae',
  coverImageRef: 'img/2026/09/cce973838b11.webp',
  coverSourceJson: strelitziaSource as unknown
}

const fatsia = {
  taxonId: 'https://tropicals.cn/species/fatsia-japonica',
  coverImageRef: 'img/2026/04/c0b613d0d6f6.webp',
  coverSourceJson: fatsiaSource as unknown
}

/** 来源逐图字段全为 null 时的期望。 */
function unknownSource(pageUrl: string | null) {
  return {
    provider: 'Tropicals.cn',
    pageUrl,
    sourceName: null,
    originalUrl: null,
    creator: null,
    license: null,
    licenseUrl: null,
    attribution: null
  }
}

describe('Tropicals 封面图公开映射', () => {
  test('逐图来源齐全时输出 CDN 完整地址与白名单来源', () => {
    expect(toTropicalsCoverImage(strelitzia)).toEqual({
      url: 'https://cdn.tropicals.cn/img/2026/09/cce973838b11.webp',
      source: {
        provider: 'Tropicals.cn',
        pageUrl: 'https://tropicals.cn/species/strelitzia-reginae',
        sourceName: 'inat_obs',
        originalUrl: 'https://www.inaturalist.org/observations/33262343',
        creator: 'Luis F. Ramírez',
        license: 'cc-by',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        attribution: '(c) Luis F. Ramírez, some rights reserved (CC BY)'
      }
    })
  })

  test('来源未知的图仍公开，source 至少含提供方与物种页', () => {
    expect(toTropicalsCoverImage(fatsia)).toEqual({
      url: 'https://cdn.tropicals.cn/img/2026/04/c0b613d0d6f6.webp',
      source: unknownSource('https://tropicals.cn/species/fatsia-japonica')
    })
  })

  test('不输出审核状态、内部策略或原始 JSON 字段', () => {
    const text = JSON.stringify(toTropicalsCoverImage(strelitzia))
    for (const forbidden of [
      'displayPolicy',
      'USER_ACCEPTED',
      'reviewStatus',
      'PENDING',
      'licenseStatus',
      'UNKNOWN',
      'apiEndpoint',
      'resolvedImageUrl',
      'schemaVersion',
      'coverAuditStatus',
      'datasetLicense'
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  test.each([
    ['null', null],
    ['空串', ''],
    ['绝对 http 地址', 'https://unreviewed.example/image.jpg'],
    ['云存储协议', 'cloud://env/img/a.webp'],
    ['含 .. 段', 'img/../secret.webp'],
    ['非 img/ 前缀', 'static/a.webp'],
    ['含空格', 'img/2026/04/a b.webp'],
    ['以斜杠结尾', 'img/2026/04/']
  ])('cover_image_ref 为%s时 coverImage 为 null', (_label, coverImageRef) => {
    expect(toTropicalsCoverImage({ ...strelitzia, coverImageRef })).toBeNull()
  })

  test('cover_image_ref 为非字符串视为行损坏', () => {
    expect(() => toTropicalsCoverImage({ ...strelitzia, coverImageRef: 42 })).toThrow()
  })

  test('来源 JSON 以字符串返回时同样解析', () => {
    const image = toTropicalsCoverImage({
      ...strelitzia,
      coverSourceJson: JSON.stringify(strelitziaSource)
    })
    expect(image?.source.creator).toBe('Luis F. Ramírez')
  })

  test.each([
    ['缺失', null],
    ['非法 JSON 字符串', '{broken'],
    ['数组', ['inat_obs']],
    ['schemaVersion 不符', { ...strelitziaSource, schemaVersion: 'tropicals-cover-reference/v2' }],
    ['imageRef 指向另一张图', { ...strelitziaSource, imageRef: 'img/2026/09/other.webp' }]
  ])('来源 JSON %s 时图仍返回，逐图来源字段全为 null', (_label, coverSourceJson) => {
    expect(toTropicalsCoverImage({ ...strelitzia, coverSourceJson })).toEqual({
      url: 'https://cdn.tropicals.cn/img/2026/09/cce973838b11.webp',
      source: unknownSource('https://tropicals.cn/species/strelitzia-reginae')
    })
  })

  test('逐图字段非字符串、空白或链接协议非 http(s) 时该字段为 null', () => {
    const image = toTropicalsCoverImage({
      ...strelitzia,
      coverSourceJson: {
        ...strelitziaSource,
        coverCreator: 7,
        coverAttribution: '   ',
        coverSourceUrl: 'javascript:alert(1)',
        coverLicenseUrl: 'ftp://licenses.example/by'
      }
    })
    expect(image?.source).toEqual({
      provider: 'Tropicals.cn',
      pageUrl: 'https://tropicals.cn/species/strelitzia-reginae',
      sourceName: 'inat_obs',
      originalUrl: null,
      creator: null,
      license: 'cc-by',
      licenseUrl: null,
      attribution: null
    })
  })

  test('taxon_id 不是 Tropicals 物种页时 pageUrl 为 null', () => {
    const image = toTropicalsCoverImage({ ...fatsia, taxonId: 'catalog:01' })
    expect(image?.source).toEqual(unknownSource(null))
  })
})
