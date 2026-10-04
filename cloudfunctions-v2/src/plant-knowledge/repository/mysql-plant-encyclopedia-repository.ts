import type {
  PlantEncyclopediaQuery,
  PlantEncyclopediaResponse
} from '../application/get-plant-encyclopedia.js'
import { PublicRequestError } from '../../foundation/http/request-chain.js'
import type { PublishedPlantSqlExecutor } from './mysql-published-plant-repository.js'

/** 精确引用定位来源百科；不关联身份发布，不读性状原文或图片来源 JSON。 */
const readSql = `SELECT encyclopedia.taxon_id, encyclopedia.name, encyclopedia.scientific_name,
 encyclopedia.additional_names_json, encyclopedia.taxon_rank, encyclopedia.order_name,
 encyclopedia.family, encyclopedia.genus, encyclopedia.description,
 encyclopedia.bio_morphology, encyclopedia.bio_distribution, encyclopedia.bio_varieties,
 encyclopedia.bio_habitat, encyclopedia.bio_propagation, encyclopedia.bio_commercial, encyclopedia.bio_pests,
 encyclopedia.care_difficulty, encyclopedia.temperature_range, encyclopedia.humidity_range, encyclopedia.light_requirement
FROM plant_search_documents AS document
JOIN tropicals_species_encyclopedia_ref AS encyclopedia ON encyclopedia.taxon_id = document.taxon_id
WHERE document.taxon_id = ? AND document.is_searchable = 1
LIMIT 2`

/** 学名 slug 按来源架构生成；只移除标点符号，不把它当成内部身份解析结果。 */
function toScientificNameSlug(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .trim()
    .replace(/\s+/gu, '-')
    .toLowerCase()
}
/** 按来源列空值语义读取文字；不强转对象、数字或未知值。 */
function readText(row: Record<string, unknown>, field: string, required = false): string | null {
  const value = row[field]
  if (!required && value === null) {
    return null
  }
  if (typeof value !== 'string' || (required && !value.trim())) {
    throw new Error('百科展示字段损坏')
  }
  return value
}
/** 创建参数化 SQL 读取用例；返回展示白名单，不产生内部知识或用户事实。 */
export function createMysqlPlantEncyclopediaRepository(executor: PublishedPlantSqlExecutor): {
  /** 读取指定目录引用对应的百科，匹配 slug 后才返回。 */
  readonly getPlantEncyclopedia: (
    query: PlantEncyclopediaQuery
  ) => Promise<PlantEncyclopediaResponse | null>
} {
  return {
    async getPlantEncyclopedia(query) {
      const rows = await executor.query(readSql, [query.catalogTaxonRef])
      if (rows.length === 0) {
        return null
      }
      if (rows.length !== 1) {
        throw new Error('百科引用不唯一')
      }
      const row = rows[0]!
      const scientificName = readText(row, 'scientific_name', true)!
      const slug = toScientificNameSlug(scientificName)
      if (slug !== query.scientificNameSlug) {
        throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
      }
      const names: unknown =
        typeof row.additional_names_json === 'string'
          ? JSON.parse(row.additional_names_json)
          : row.additional_names_json
      if (!Array.isArray(names) || names.some(name => typeof name !== 'string')) {
        throw new Error('百科别名字段损坏')
      }
      return {
        catalogTaxonRef: readText(row, 'taxon_id', true)!,
        scientificNameSlug: slug,
        displayName: readText(row, 'name', true)!,
        scientificName,
        additionalNames: names as string[],
        taxonomy: {
          rank: readText(row, 'taxon_rank'),
          order: readText(row, 'order_name'),
          family: readText(row, 'family'),
          genus: readText(row, 'genus')
        },
        description: readText(row, 'description'),
        sections: {
          morphology: readText(row, 'bio_morphology'),
          distribution: readText(row, 'bio_distribution'),
          varieties: readText(row, 'bio_varieties'),
          habitat: readText(row, 'bio_habitat'),
          propagation: readText(row, 'bio_propagation'),
          commercial: readText(row, 'bio_commercial'),
          pests: readText(row, 'bio_pests')
        },
        careDisplay: {
          difficulty: readText(row, 'care_difficulty'),
          temperatureRange: readText(row, 'temperature_range'),
          humidityRange: readText(row, 'humidity_range'),
          lightRequirement: readText(row, 'light_requirement')
        },
        coverImage: null,
        attribution: {
          name: 'Tropicals.cn',
          sourceUrl: 'https://tropicals.cn/datasets',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
        }
      }
    }
  }
}
