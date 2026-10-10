import { afterEach, describe, expect, test } from 'vitest'

import {
  chongqingProfileRow,
  fakeState,
  fatsiaTaxon,
  fitRow,
  recommendationSqlMarker,
  start,
  stop,
  tables,
  type FakeRow
} from './support/city-climate-fake.js'

/**
 * Expected：weather-city-climate-fit/v2 推荐项 `coverImage`，规则引用 plant-encyclopedia-read/v2「封面图」
 * （用户 2026-10-09 裁决：封面全部公开、每图须有来源）。
 * 夹具照抄测试库八角金盘（内部 id 3761）真实 cover_image_ref 与 cover_source_json（来源未知形态）。
 * 层次：L3 / unit_fake，只证明推荐接口读取并接线封面映射；映射边界由 L1 tropicals-cover-image.spec.ts 承担。
 */

const fatsiaCover: FakeRow = {
  cover_image_ref: 'img/2026/04/c0b613d0d6f6.webp',
  cover_source_json: {
    apiEndpoint: 'https://tropicals.cn/api/v1/species/fatsia-japonica',
    coverAttribution: null,
    coverCreator: null,
    coverLicense: null,
    coverLicenseUrl: null,
    coverSource: null,
    coverSourceUrl: null,
    displayPolicy: 'USER_ACCEPTED_UNKNOWN_LICENSE_RISK_TEST_REFERENCE',
    imageRef: 'img/2026/04/c0b613d0d6f6.webp',
    licenseStatus: 'UNKNOWN',
    resolvedImageUrl: 'https://cdn.tropicals.cn/img/2026/04/c0b613d0d6f6.webp',
    reviewStatus: 'PENDING',
    schemaVersion: 'tropicals-cover-reference/v1',
    taxonId: fatsiaTaxon
  }
}

afterEach(stop)

async function readFirstRecommendation(row: FakeRow): Promise<{ item: FakeRow; text: string }> {
  const base = await start(tables([chongqingProfileRow], [], [row]))
  const response = await fetch(
    `${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing&top=1`
  )
  expect(response.status).toBe(200)
  const text = await response.text()
  const body = JSON.parse(text) as { data: { recommendations: FakeRow[] } }
  return { item: body.data.recommendations[0] ?? {}, text }
}

describe('weather 推荐封面图', () => {
  test('有封面时输出 CDN 完整地址与来源，不再输出相对路径 coverImageRef', async () => {
    const { item, text } = await readFirstRecommendation(
      fitRow(fatsiaTaxon, '3761', '52.20', fatsiaCover)
    )
    expect(item.coverImage).toEqual({
      url: 'https://cdn.tropicals.cn/img/2026/04/c0b613d0d6f6.webp',
      source: {
        provider: 'Tropicals.cn',
        pageUrl: fatsiaTaxon,
        sourceName: null,
        originalUrl: null,
        creator: null,
        license: null,
        licenseUrl: null,
        attribution: null
      }
    })
    expect(item).not.toHaveProperty('coverImageRef')
    for (const forbidden of ['USER_ACCEPTED', 'PENDING', 'apiEndpoint', 'resolvedImageUrl']) {
      expect(text).not.toContain(forbidden)
    }
  })

  test('无封面时 coverImage 为 null', async () => {
    const { item } = await readFirstRecommendation(fitRow(fatsiaTaxon, '3761', '52.20'))
    expect(item.coverImage).toBeNull()
  })

  test('推荐 SQL 读取封面来源列', async () => {
    await readFirstRecommendation(fitRow(fatsiaTaxon, '3761', '52.20'))
    const sql = fakeState.queries.find(item => item.sql.includes(recommendationSqlMarker))?.sql
    expect(sql).toContain('e.cover_image_ref')
    expect(sql).toContain('e.cover_source_json')
  })
})
