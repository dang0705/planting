'use strict'

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditFunctionPackage } from '../../../../scripts/qa/function-package-audit.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const source = fs.readFileSync(path.join(repoRoot, 'cloudfunctions/auth-user-http/app.js'), 'utf8')
const readSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/auth-user-http/read-http.js'),
  'utf8'
)
const runtimeSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/auth-user-http/read-runtime.js'),
  'utf8'
)
const sqlRuntimeSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/read-sql-runtime.js'),
  'utf8'
)
const serverSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/auth-user-http/native-http-server.js'),
  'utf8'
)
const cloudbaseConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'cloudbaserc.json'), 'utf8'))
const audit = auditFunctionPackage(
  'auth-user-http',
  path.join(repoRoot, 'cloudfunctions/auth-user-http')
)

assert.equal(audit.startup_dependency_violations.length, 0)
assert.match(source, /function loadPlatformPhoneVerifiers\(\)/u)
assert.match(
  source,
  /loadPlatformPhoneVerifiers\(\)/u,
  '跨平台手机号校验器必须只在手机号登录分支按需加载'
)
assert.match(
  readSource,
  /FROM user_sessions s[\s\S]*JOIN users u ON BINARY u\._id = BINARY s\.user_id/u,
  '平台会话必须用一条服务端 JOIN 查询会话与用户，不能信任客户端 openid'
)
assert.match(
  readSource,
  /s\.token_hash = \{\{tokenHash\}\}[\s\S]*s\.revoked_at <=> NULL[\s\S]*s\.expires_at > \{\{now\}\}/u,
  '平台会话 SQL 必须在服务端验证 token hash、撤销与过期状态'
)
assert.doesNotMatch(
  readSource,
  /\bIS\s+(?:NOT\s+)?NULL\b/u,
  'WeDa preparedStatements 模式禁止 IS NULL/IS NOT NULL'
)
assert.match(
  readSource,
  /identity\.uid[\s\S]*readUserByField\('_id'[\s\S]*readUserByRuntimeOpenid\(identity\.openid/u,
  '只有明确标记为统一用户的短票据才能按 uid 读取，旧运行时票据必须按 openid 反查统一用户'
)
assert.match(
  readSource,
  /hasPlatformSessionMaterial\(headers\)[\s\S]*readUserByPlatformSession[\s\S]*const ticketIdentity = resolveHttpIdentityTicket\(headers\)[\s\S]*resolveCloudbaseRuntimeHeaderUser\(headers\)/u,
  '持久会话必须先于统一票据和微信运行时身份，防止旧票据覆盖当前账号'
)
assert.match(
  readSource,
  /ticketIdentity\?\.userId && ticketIdentity\.subject === 'planting-user'/u,
  'auth/user 只能接受由持久会话签发的统一用户票据，旧运行时票据不得作为业务身份'
)
assert.match(readSource, /runCloudbaseSql/u, 'auth/user 必须走单次内部参数化 SQL')
assert.match(
  readSource,
  /qa-performance-probe[\s\S]*auth-user-http\/auth\/user/u,
  '轻量 auth/user 读取必须为 QA 探针写出可关联的非敏感日志标记'
)
assert.match(sqlRuntimeSource, /function runCloudbaseSql/u)
assert.match(sqlRuntimeSource, /function qualifyTables/u)
assert.match(sqlRuntimeSource, /preparedStatements: true/u)
assert.doesNotMatch(sqlRuntimeSource, /@cloudbase\/node-sdk|mysql2|native-mysql|\/opt\/utils/u)
assert.doesNotMatch(readSource, /\/opt\/utils|native-mysql|models\.\$runSQL|@cloudbase\/node-sdk/u)
assert.doesNotMatch(runtimeSource, /native-mysql|mysql2|@cloudbase\/node-sdk/u)
const readerConfig = cloudbaseConfig.functions.find(item => item.name === 'auth-user-http')
assert.ok(readerConfig)
assert.equal(readerConfig.vpc, undefined)
assert.equal(readerConfig.envVariables.CLOUDBASE_DIRECT_MYSQL_READS, undefined)
assert.match(
  serverSource,
  /const readMain = require\('\.\/read-http'\)\.main/u,
  '原生函数启动时只加载轻量读取实现'
)
assert.match(serverSource, /return isOwnUserRead \? readMain : loadFullMain\(\)/u)
assert.doesNotMatch(serverSource, /forwardToWriteFunction|write-proxy/u)
assert.doesNotMatch(
  source,
  /^const\s+\{\s*verifyDouyinPhoneAuthorization[\s\S]*require\([^)]*platform-phone-verifiers/u,
  'auth/user 模块启动时不得加载跨平台手机号校验器'
)
assert.match(source, /case 'getUserByOpenid':/u)
assert.match(source, /case 'getUserByUnionId':/u)
assert.match(source, /resolveHttpUserInfo\(request\.headers/u)
assert.match(
  source,
  /async function readUserSql\(sql, params = \{\}\) \{[\s\S]*return models\.\$runSQL\(sql, params\)/u,
  'auth/user 公共读回退必须继续使用 CloudBase SQL'
)
assert.doesNotMatch(source, /CLOUDBASE_DIRECT_MYSQL_READS|native-mysql/u)

console.log(
  'auth user read dependency source contract passed data_mode=unit_fake test_kind=source_contract'
)
