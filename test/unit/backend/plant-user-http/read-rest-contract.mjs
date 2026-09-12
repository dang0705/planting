import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// data_mode=unit_fake; test_kind=source_contract。防止列表读路径重新引入 Layer、VPC 或 native MySQL。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const readSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/plant-user-http/read-http.js'),
  'utf8'
)
const listSqlSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/plant-user-http/read-list-sql.js'),
  'utf8'
)
const runtimeSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/plant-user-http/read-runtime.js'),
  'utf8'
)
const sqlRuntimeSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/read-sql-runtime.js'),
  'utf8'
)
const serverSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/plant-user-http/native-http-server.js'),
  'utf8'
)
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'cloudbaserc.json'), 'utf8'))
const readerConfig = config.functions.find(item => item.name === 'plant-user-http')
const require = createRequire(import.meta.url)
const { _test: readTest } = require('../../../../cloudfunctions/plant-user-http/read-http.js')

assert.ok(readerConfig)
assert.equal(readerConfig.vpc, undefined)
assert.equal(readerConfig.envVariables.CLOUDBASE_DIRECT_MYSQL_READS, undefined)
assert.match(readSource, /runCloudbaseSql/u)
assert.doesNotMatch(
  readSource,
  /`WITH\s/u,
  'RunMysqlCommand 会把 WITH 开头的读查询返回为 affectedRows，列表读取必须使用普通 SELECT'
)
assert.match(listSqlSource, /LEFT JOIN LATERAL/u)
assert.match(listSqlSource, /FROM user_plant_instances up/u)
assert.match(
  listSqlSource,
  /\{\{userId\}\} <> ''[\s\S]*up\.owner_user_id = \{\{userId\}\}/u,
  '手机号统一账号必须优先按稳定 owner_user_id 读取植物'
)
assert.match(
  listSqlSource,
  /up\.owner_user_id <=> NULL[\s\S]*BINARY up\._openid = BINARY \{\{openid\}\}/u,
  '只有未迁移 owner_user_id 的旧植物才允许按存储 openid 补齐'
)
assert.match(
  readSource,
  /function resolvePlantOwnerIdentity[\s\S]*FROM users u[\s\S]*u\.wechat_openid = \{\{openid\}\}[\s\S]*u\.principal_openid = \{\{openid\}\}/u,
  '缺少统一 userId 的旧运行时身份必须先反查 users._id，不能把平台 openid 当作植物 owner_user_id'
)
assert.match(
  readSource,
  /if \(userId\)[\s\S]*return \{ \.\.\.identity, userId \}/u,
  '服务端签名票据中的统一 userId 必须直接用于主键归属查询，避免重复联表'
)
assert.doesNotMatch(readSource, /SELECT up\.\*/u, '列表读取不得把未使用的整行字段搬进响应')
assert.match(listSqlSource, /'photos'/u, '列表读取必须保留既有植物照片字段')
assert.match(readSource, /photos: parseJson\(row\.photos, \[\]\)/u, '列表映射必须保留植物照片数组')
assert.match(readSource, /'photos'/u, '列表响应白名单必须保留 photos 字段')
assert.match(listSqlSource, /plant_identity_entities/u)
assert.match(listSqlSource, /plant_care_locations/u)
assert.match(listSqlSource, /user_watering_reminder_events/u)
assert.match(listSqlSource, /user_fertilization_reminder_events/u)
assert.match(listSqlSource, /diagnosis_sessions/u)
assert.doesNotMatch(readSource, /queryCloudbaseRestTable|proxyToPlantUserWrite/u)
assert.match(runtimeSource, /runCloudbaseSql/u)
assert.doesNotMatch(
  runtimeSource,
  /\bIS\s+(?:NOT\s+)?NULL\b/u,
  'WeDa preparedStatements 模式禁止 IS NULL/IS NOT NULL'
)
assert.match(sqlRuntimeSource, /function runCloudbaseSql/u)
assert.doesNotMatch(sqlRuntimeSource, /\/opt\/utils|native-mysql|mysql2|@cloudbase\/node-sdk/u)
assert.doesNotMatch(
  readSource,
  /\/opt\/utils|native-mysql|mysql2|@cloudbase\/node-sdk|require\('\.\/app'\)/u
)
assert.match(serverSource, /const readMain = require\('\.\/read-http'\)\.main/u)
assert.match(
  serverSource,
  /isUserPlantRead[\s\S]*return isUserPlantRead \? readMain : loadFullMain\(\)/u
)
assert.doesNotMatch(serverSource, /zlib\.gzipSync|forwardToWriteFunction|write-proxy/u)

const mappedPlant = readTest.mapPlant(
  {
    id: 7,
    record_version: 3,
    plant_identity_id: 'plant_identity_demo',
    canonical_name: '',
    recognized_name: '龟背竹',
    nickname: '客厅那盆',
    source_type: 'catalog',
    recognition_confidence: '0.91',
    location: '客厅',
    plant_date: '2026-01-01',
    photos: '["cloud://user/photo.jpg"]',
    light_environment_json: '{"level":"bright"}',
    air_environment_json: '{"input":{"source":"window"}}',
    pot_top_diameter_cm: '18',
    has_drainage_hole: 'yes'
  },
  {
    plant_identity_id: 'plant_identity_demo',
    primary_display_name: '龟背竹',
    family_name_cn: '天南星科',
    genus_name: '龟背竹属',
    scientific_name: 'Monstera deliciosa',
    cover_image_ref: 'cloud://catalog/monstera.jpg'
  },
  {
    care: {
      id: 11,
      plant_id: 7,
      _openid: 'user_unit_1',
      location_key: 'shanghai',
      city_name: '上海',
      latitude: '31.23',
      longitude: '121.47'
    },
    watering: {
      id: 12,
      user_plant_id: 7,
      reminder_type: 'water',
      status: 'active',
      next_time: '2026-09-08 09:00:00'
    },
    diagnosis: { health_status: 'good', health_score: '88' }
  }
)
assert.equal(mappedPlant.id, 7)
assert.equal(mappedPlant.displayName, '客厅那盆')
assert.equal(mappedPlant.imageFileId, 'cloud://catalog/monstera.jpg')
assert.deepEqual(mappedPlant.photos, ['cloud://user/photo.jpg'])
assert.equal(mappedPlant.healthScore, 88)
assert.equal(mappedPlant.careLocation.cityName, '上海')
assert.equal(mappedPlant.wateringReminder.nextTime, '2026-09-08T09:00:00')

console.log('plant user REST read contract passed data_mode=unit_fake test_kind=source_contract')
