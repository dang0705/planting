import assert from 'node:assert/strict'
import fs from 'node:fs'

const migrationPath = 'scripts/sql/watering-reminder-v21-schema-20260630.sql'
const FIRST_LINE_INDEX = 0
const CREATE_TABLE_START_INDEX = 0
const WATERING_WAY_QUANTIZATION_KEYS = [
  'wayClass',
  'depletionTrigger',
  'targetMoistureMid',
  'wetTolerance',
  'dryTolerance',
  'amountPolicy',
  'nextActionClass',
  'seasonalGate'
]
const migration = fs.readFileSync(migrationPath, 'utf8')
const tableConfig = fs.readFileSync('src/data-system/config/tables.js', 'utf8')
const genusCareHeader = fs.readFileSync('docs/genus_care_profiles.md', 'utf8').split('\n')[
  FIRST_LINE_INDEX
]

function assertIncludes(pattern, message) {
  assert.match(migration, pattern, `${message}，请检查 ${migrationPath}`)
}

function assertNotIncludes(pattern, message) {
  assert.doesNotMatch(migration, pattern, `${message}，请检查 ${migrationPath}`)
}

assertNotIncludes(/\bDROP\b|\bTRUNCATE\b|\bDELETE\b/i, 'schema migration 不允许破坏性 SQL')

assertIncludes(
  /CREATE TABLE IF NOT EXISTS [`"]?cloud1_dev[`"]?\.[`"]?user_plant_care_extensions[`"]?/i,
  '必须新增用户植物养护扩展表'
)
assertIncludes(/`id`\s+BIGINT UNSIGNED NOT NULL AUTO_INCREMENT/i, 'id 类型必须锁定')
assertIncludes(/`_openid`\s+VARCHAR\(64\) NOT NULL DEFAULT ''/i, '_openid 默认值必须锁定')
assertIncludes(/`user_plant_id`\s+BIGINT UNSIGNED NOT NULL/i, 'user_plant_id 必须存在')
assertIncludes(/`pot_top_diameter_cm`\s+DECIMAL\(6,2\) NULL/i, '盆口直径字段必须存在')
assertIncludes(/`pot_bottom_diameter_cm`\s+DECIMAL\(6,2\) NULL/i, '盆底直径字段必须存在')
assertIncludes(/`pot_height_cm`\s+DECIMAL\(6,2\) NULL/i, '盆高字段必须存在')
assertIncludes(
  /`has_drainage_hole`\s+VARCHAR\(16\) NOT NULL DEFAULT 'true'/i,
  '排水孔字段必须用合同默认值'
)
assertIncludes(/`pot_material`\s+VARCHAR\(32\) NOT NULL DEFAULT 'unknown'/i, '盆器材质字段必须存在')
assertIncludes(
  /`substrate_type`\s+VARCHAR\(2048\) NOT NULL DEFAULT 'unknown'/i,
  '基质类型字段必须能容纳 JSON 数组字符串'
)
assertIncludes(
  /`substrate_type`[\s\S]+COMMENT '基质类型：允许 JSON 数组字符串（多选\+比例）或单值'/i,
  '基质类型注释必须说明允许 JSON 数组字符串或单值'
)
assertIncludes(/`profile_version`\s+INT UNSIGNED NOT NULL DEFAULT 1/i, '画像版本字段必须存在')
assertIncludes(/`source`\s+VARCHAR\(32\) NOT NULL DEFAULT 'user'/i, '画像来源字段必须存在')
assertIncludes(/`confidence`\s+VARCHAR\(16\) NOT NULL DEFAULT 'normal'/i, '置信度字段必须存在')
assertIncludes(/`created_at`\s+DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP/i, 'created_at 必须存在')
assertIncludes(
  /`updated_at`\s+DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/i,
  'updated_at 必须自动更新时间'
)

assertIncludes(
  /UNIQUE KEY [`"]?uk_user_plant_care_extensions_openid_plant[`"]?\s*\([`"]?_openid[`"]?,\s*[`"]?user_plant_id[`"]?\)/i,
  '必须按用户和植物实例建立唯一键'
)
assertIncludes(
  /KEY [`"]?idx_user_plant_care_extensions_user_plant_id[`"]?\s*\([`"]?user_plant_id[`"]?\)/i,
  '必须覆盖 user_plant_id 查询索引'
)
assertIncludes(
  /KEY [`"]?idx_user_plant_care_extensions_profile_version[`"]?\s*\([`"]?profile_version[`"]?\)/i,
  '必须覆盖 profile_version 查询索引'
)

assertIncludes(
  /CHECK\s*\(\s*`has_drainage_hole`\s+IN\s*\('true',\s*'false',\s*'unknown'\)/i,
  '排水孔枚举必须约束'
)
assertIncludes(
  /CHECK\s*\(\s*`pot_material`\s+IN\s*\('plastic',\s*'ceramic',\s*'terracotta',\s*'glazed',\s*'unknown'\)/i,
  '盆器材质枚举必须约束'
)
assertNotIncludes(
  /chk_user_plant_care_extensions_substrate_type|`substrate_type`\s+IN\s*\(/i,
  '基质类型不得再使用枚举 CHECK 阻断 JSON 数组字符串'
)
assertIncludes(
  /CHECK\s*\(\s*`source`\s+IN\s*\('user',\s*'default',\s*'inferred'\)/i,
  '画像来源枚举必须约束'
)
assertIncludes(
  /CHECK\s*\(\s*`confidence`\s+IN\s*\('low',\s*'normal',\s*'high'\)/i,
  '置信度枚举必须约束'
)
assertIncludes(
  /`pot_top_diameter_cm`\s+IS NULL OR `pot_top_diameter_cm`\s+>\s+0/i,
  '盆口直径必须约束为正数或空'
)
assertIncludes(
  /`pot_bottom_diameter_cm`\s+IS NULL OR `pot_bottom_diameter_cm`\s+>\s+0/i,
  '盆底直径必须约束为正数或空'
)
assertIncludes(/`pot_height_cm`\s+IS NULL OR `pot_height_cm`\s+>\s+0/i, '盆高必须约束为正数或空')

assertIncludes(
  /ALTER TABLE [`"]?cloud1_dev[`"]?\.[`"]?genus_care_profiles[`"]?/i,
  '属级养护表必须有 schema 扩展'
)
assertIncludes(
  /ADD COLUMN IF NOT EXISTS [`"]?watering_way_quantization_json[`"]? JSON NULL/i,
  '属级 watering way 量化 JSON 字段必须存在'
)
assertIncludes(
  /watering_strategy_json\.way\/freq/i,
  '属级量化字段必须声明来自 watering_strategy_json.way/freq'
)
for (const key of WATERING_WAY_QUANTIZATION_KEYS) {
  assert.ok(migration.includes(key), `属级 watering way 量化 JSON contract 必须锁定 ${key}`)
}
assertIncludes(
  /UPDATE [`"]?cloud1_dev[`"]?\.[`"]?genus_care_profiles[`"]?/i,
  '必须提供属级浇水量化 backfill'
)
assertIncludes(
  /WHERE [`"]?watering_way_quantization_json[`"]? IS NULL/i,
  'backfill 只能填充缺失的 watering_way_quantization_json，不得覆盖已有非空量化数据'
)
assertIncludes(/JSON_OBJECT\(/i, 'backfill 必须生成 JSON_OBJECT')
assertIncludes(
  /JSON_EXTRACT\([`"]?watering_strategy_json[`"]?, '\$\.way'\)/i,
  'backfill 必须从 watering_strategy_json.way 推导'
)
assertIncludes(
  /JSON_EXTRACT\([`"]?watering_strategy_json[`"]?, '\$\.freq'\)/i,
  'backfill 必须引用 watering_strategy_json.freq'
)
assertIncludes(/完全干透\|干透\|宁干勿湿\|偏干/i, 'backfill 必须覆盖完全干透/干透方向')
assertIncludes(
  /表层\.\?\[0-9一二三2–-\]\+\.\?cm\|表层土微干\|表土微干\|微干后浇透\|见干浇透/i,
  'backfill 必须覆盖表层微干方向'
)
assertIncludes(/保持\.\*\(湿润\|微湿\)\|均匀湿润\|表土微干即浇/i, 'backfill 必须覆盖均匀湿润方向')
assertIncludes(/忌积水\|避免积水/i, 'backfill 必须把忌积水影响写入 wetTolerance 或 amountPolicy')
assertIncludes(/'machine_quantized'/i, '明确规则命中的 backfill 状态必须是 machine_quantized')
assertIncludes(/'needs_review'/i, '无法明确规则命中的 backfill 状态必须是 needs_review')
assertIncludes(
  /ADD COLUMN IF NOT EXISTS [`"]?watering_strategy_version[`"]? INT UNSIGNED NOT NULL DEFAULT 1/i,
  '属级浇水策略版本字段必须存在'
)
assertIncludes(
  /ADD COLUMN IF NOT EXISTS [`"]?watering_strategy_review_status[`"]? VARCHAR\(32\) NOT NULL DEFAULT 'pending'/i,
  '属级浇水策略审核状态字段必须存在'
)

assert.ok(
  tableConfig.includes("'watering_strategy_json'"),
  'src/data-system/config/tables.js 必须继续保留 watering_strategy_json 字段'
)
assert.ok(
  genusCareHeader.includes('watering\\_strategy\\_json'),
  'docs/genus_care_profiles.md 表头必须继续显示 watering_strategy_json'
)

const createTableEnd = migration.indexOf('ALTER TABLE')
const userPlantCareDdl = migration.slice(CREATE_TABLE_START_INDEX, createTableEnd)
assert.ok(
  !/WateringEvent|watering_events|watering_event|watered_at|dose_class|amount_ml|runoff_observed|saucer_water_cleared/i.test(
    userPlantCareDdl
  ),
  '用户植物养护扩展表不能混入单次浇水事件字段'
)
assertNotIncludes(
  /ALTER TABLE [`"]?cloud1_dev[`"]?\.[`"]?watering_events[`"]?/i,
  '本 schema 任务不得修改 watering_events 表'
)
assertNotIncludes(
  /CREATE TABLE IF NOT EXISTS [`"]?cloud1_dev[`"]?\.[`"]?watering_events[`"]?/i,
  '本 schema 任务不得新建 watering_events 表'
)

process.stdout.write('watering reminder v2.1 schema contract tests passed\n')
