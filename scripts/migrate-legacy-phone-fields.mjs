#!/usr/bin/env node

/**
 * 将历史 users.phoneNumber 明文迁移到 phone_hash / phone_ciphertext / phone_masked。
 * 默认只读预览；只有显式传入 --apply 才会写库并清空旧明文字段。
 *
 * 用法：
 *   npm run run:with-cloudbase-env -- --function=auth-user-http -- node scripts/migrate-legacy-phone-fields.mjs
 *   npm run run:with-cloudbase-env -- --function=auth-user-http -- node scripts/migrate-legacy-phone-fields.mjs --apply
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cloudbase = require('@cloudbase/node-sdk')
const {
  encryptPhone,
  hashPhone,
  maskPhone
} = require('../cloudfunctions/layer/utils/platform-session.js')

const DEFAULT_SCHEMA = 'cloud1_dev'

function parseArgs(argv = []) {
  return {
    apply: argv.includes('--apply'),
    schema: String(argv.find(arg => arg.startsWith('--schema=')) || '')
      .slice('--schema='.length)
      .trim()
  }
}

function resolveEnvId() {
  return String(
    process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || process.env.CLOUDBASE_ENV_ID_DEV || ''
  ).trim()
}

function resolveSchema(args) {
  return args.schema || String(process.env.CLOUDBASE_SQL_DATABASE || DEFAULT_SCHEMA).trim()
}

function resolveCredentials() {
  return {
    secretId: String(
      process.env.CLOUDBASE_SECRET_ID || process.env.TENCENT_SECRET_ID || ''
    ).trim(),
    secretKey: String(
      process.env.CLOUDBASE_SECRET_KEY || process.env.TENCENT_SECRET_KEY || ''
    ).trim()
  }
}

function rows(result) {
  return result?.data?.executeResultList || []
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const envId = resolveEnvId()
  const schema = resolveSchema(args)
  const credentials = resolveCredentials()
  if (!envId || !credentials.secretId || !credentials.secretKey) {
    throw new Error('缺少 CloudBase 环境或凭据，请通过 run-with-cloudbase-env 注入')
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(schema)) {
    throw new Error('schema 名称无效')
  }

  const app = cloudbase.init({
    env: envId,
    secretId: credentials.secretId,
    secretKey: credentials.secretKey
  })
  const models = app.models
  if (!models || typeof models.$runSQL !== 'function') {
    throw new Error('当前 SDK 未暴露 models.$runSQL')
  }

  const result = await models.$runSQL(
    `SELECT _id, phoneNumber, phone_country_code
       FROM \`${schema}\`.users
      WHERE phoneNumber <> ''`
  )
  const legacyRows = rows(result).filter(row => String(row.phoneNumber || '').trim())
  process.stdout.write(
    JSON.stringify(
      {
        envId,
        schema,
        mode: args.apply ? 'apply' : 'dry-run',
        legacyCount: legacyRows.length
      },
      null,
      2
    ) + '\n'
  )

  if (!args.apply) {
    return
  }

  let migrated = 0
  for (const row of legacyRows) {
    const phone = String(row.phoneNumber || '').trim()
    const countryCode = String(row.phone_country_code || '+86').trim() || '+86'
    const phoneHash = hashPhone(phone, countryCode)
    const phoneCiphertext = encryptPhone(phone, countryCode)
    const phoneMasked = maskPhone(phone, countryCode)
    await models.$runSQL(
      `UPDATE \`${schema}\`.users
          SET phone_hash = {{phoneHash}},
              phone_ciphertext = {{phoneCiphertext}},
              phone_masked = {{phoneMasked}},
              phone_verified_at = COALESCE(phone_verified_at, {{now}}),
              phoneNumber = NULL,
              updatedAt = {{now}}
        WHERE _id = {{userId}} AND phoneNumber = {{phoneNumber}}`,
      {
        phoneHash,
        phoneCiphertext,
        phoneMasked,
        now: Date.now(),
        userId: row._id,
        phoneNumber: phone
      }
    )
    migrated += 1
  }
  process.stdout.write(JSON.stringify({ migrated }, null, 2) + '\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    process.stderr.write(`${String(error?.stack || error)}\n`)
    process.exitCode = 1
  })
}

export { parseArgs, resolveSchema }
