'use strict'

import assert from 'node:assert/strict'
import fs from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。
// 只约束一期的 /user-plants 列表轻量读入口，不能把旧 app.js 的详情、写入或
// 未验收优化误当成该入口的性能收益。
const readSource = fs.readFileSync('cloudfunctions/plant-user-http/read-http.js', 'utf8')
const listSqlSource = fs.readFileSync('cloudfunctions/plant-user-http/read-list-sql.js', 'utf8')
const runtimeSource = fs.readFileSync('cloudfunctions/plant-user-http/read-runtime.js', 'utf8')
const ticketSource = fs.readFileSync('cloudfunctions/layer/utils/http-identity-ticket.js', 'utf8')
const nativeServerSource = fs.readFileSync(
  'cloudfunctions/plant-user-http/native-http-server.js',
  'utf8'
)

assert.match(
  readSource,
  /async function listUserPlants\([\s\S]*identity,[\s\S]*page,[\s\S]*pageSize,[\s\S]*timing = null,[\s\S]*plantId = null,[\s\S]*dependencies = \{\}/u,
  '列表与详情读取共用同一轻量查询，既有三参数列表调用仍保持兼容'
)
assert.match(readSource, /const querySql = dependencies\.runSql \|\| runCloudbaseSql/u)
assert.match(readSource, /const sql = buildUserPlantListSql\(\{ plantId \}\)/u)
assert.match(listSqlSource, /COUNT\(\*\) OVER\(\) AS total_count/u)
assert.match(
  listSqlSource,
  /function buildUserPlantListSql\(\{ plantId = null \} = \{\}\)[\s\S]*up\.id = \{\{plantId\}\}/u,
  '详情读取必须沿用同一归属条件并按参数化植物 ID 限定'
)
assert.match(listSqlSource, /LEFT JOIN LATERAL/u)
assert.doesNotMatch(
  listSqlSource,
  /\bIS\s+(?:NOT\s+)?NULL\b/iu,
  'CloudBase 参数化 SQL 不支持 IS NULL；空值比较必须使用 <=> NULL'
)
assert.match(
  listSqlSource,
  /plant_identity_id COLLATE utf8mb4_unicode_ci = \$\{CATALOG_LOOKUP_SQL\}[\s\S]*OR session_plant_id COLLATE utf8mb4_unicode_ci = \$\{CATALOG_LOOKUP_SQL\}/u,
  '已证伪的目录索引候选必须回退到稳定的历史匹配语义'
)
assert.doesNotMatch(
  listSqlSource,
  /CATALOG_LOOKUP_ASCII_SQL|CATALOG_LOOKUP_INDEXED_SQL|CATALOG_LOOKUP_LEGACY_SQL|utf8mb4_0900_ai_ci|UNION ALL/u,
  '不得保留未带来端上收益的目录索引候选'
)
assert.match(
  listSqlSource,
  /\{\{userId\}\} <> ''[\s\S]*up\.owner_user_id = \{\{userId\}\}/u,
  '统一用户必须优先按稳定 owner_user_id 查询植物归属'
)
assert.doesNotMatch(
  readSource,
  /native-mysql|mysql2|CLOUDBASE_DIRECT_MYSQL_READS|queryCloudbaseRestTable|userPlant.*Cache/iu,
  '轻量列表入口不得启用 MySQL 竞速、REST 旁路或内存缓存'
)
assert.match(
  readSource,
  /plantId !== null \|\| !isTransientCloudbaseSqlConnectionError\(error\)/u,
  '仅列表路径可为明确的 CloudBase 瞬态连接错误重试；详情不得扩大重试面'
)
assert.doesNotMatch(
  runtimeSource,
  /node:https|api\.tcloudbasegateway\.com\/v1\/rdb\/rest|CLOUDBASE_APIKEY|queryCloudbaseRestTable/u,
  '身份运行时只能解析会话与票据，不能加载额外 REST 数据库客户端'
)
assert.match(
  runtimeSource,
  /sessionToken[\s\S]*FROM user_sessions s[\s\S]*JOIN users u[\s\S]*s\.revoked_at <=> NULL/u,
  '持久会话必须先在服务端校验撤销与过期状态'
)
assert.match(
  runtimeSource,
  /ticket\?\.userId && ticket\.subject === TICKET_SUBJECT[\s\S]*PLATFORM_SET\.has\(ticket\.platform\)/u,
  '只有完整的统一用户票据才能用于列表归属'
)
assert.doesNotMatch(
  ticketSource,
  /read-sql|mysql|cloudbase|https\.request/iu,
  '共享票据模块必须保持无数据库依赖'
)
assert.match(ticketSource, /HTTP_IDENTITY_TICKET_MAX_AGE_SECONDS = 5 \* 60/u)
assert.match(
  nativeServerSource,
  /!url\.searchParams\.has\('id'\)/u,
  '原生轻量入口只能处理无 id 的植物列表；详情必须延迟加载既有 app.main'
)
assert.match(
  readSource,
  /rawPlantId && identity\.source === 'signed-http-ticket'/u,
  '短票据不得被扩展为植物详情授权'
)

console.log(
  'user plants lightweight read contract passed data_mode=unit_fake test_kind=source_contract'
)
