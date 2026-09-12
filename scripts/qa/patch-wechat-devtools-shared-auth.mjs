#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_PACKAGE =
  '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/core.wxvpkg'
const TARGET_MODULE = '/4c528c696f2a800d668db6ee4d7c42a7.js'
const SHARED_AUTH_PATCH_REVISION = 'legacy-login-shared-auth-v24-child-env-fallback'

const SHARED_AUTH_HELPER = String.raw`
const __qaSharedAuthFs=require("fs"),__qaSharedAuthPath=require("path"),__qaSharedAuthHttp=require("http"),__qaSharedAuthRole=process.env.WECHAT_DEVTOOLS_SHARED_AUTH_ROLE||"qa",__qaSharedAuthCapability=process.env.WECHAT_QA_DAILY_CAPABILITY||"",__qaSharedAuthLastConsumptionAck={value:null},__qaSharedAuthRefreshInFlight={value:false},__qaSharedAuthConsumptionDebugFile=__qaSharedAuthPath.join(process.env.WECHAT_DEVTOOLS_SHARED_AUTH_ROOT||__qaSharedAuthPath.join(process.env.HOME||process.env.USERPROFILE||__qaSharedAuthPath.parse(process.cwd()).root,".planting","automator-qa","v3","auth"),"consumption-debug.json");
const __qaSharedAuthRoot=process.env.WECHAT_DEVTOOLS_SHARED_AUTH_ROOT||__qaSharedAuthPath.join(process.env.HOME||process.env.USERPROFILE||__qaSharedAuthPath.parse(process.cwd()).root,".planting","automator-qa","v3","auth"),__qaSharedAuthFile=__qaSharedAuthPath.join(__qaSharedAuthRoot,"default.json"),__qaSharedAuthBrokerSocket=__qaSharedAuthPath.join(__qaSharedAuthRoot,"broker.sock"),__qaSharedAuthProfile=process.env.WECHAT_QA_PROFILE_PATH||"",__qaSharedAuthControlPort=Number(process.env.WECHAT_QA_CONTROL_PORT||0),__qaSharedAuthServicePort=Number(process.env.WECHAT_QA_SERVICE_PORT||0),__qaSharedAuthEffectiveProfile=__qaSharedAuthProfile||__qaSharedAuthPath.join(__qaSharedAuthRoot,"..","..","..","qa-devtools-home","Library","Application Support","微信开发者工具","7a30d6576abfa238418b33c3c50ac14e"),__qaSharedAuthEffectiveControlPort=__qaSharedAuthControlPort||9422,__qaSharedAuthEffectiveServicePort=__qaSharedAuthServicePort||3799;
function __qaSharedAuthRead(){try{const e=JSON.parse(__qaSharedAuthFs.readFileSync(__qaSharedAuthFile,"utf8"));return e&&e.openid&&e.signature&&e.newticket&&Number(e.signatureExpiredTime)>Date.now()+5000&&Number(e.ticketExpiredTime)>Date.now()+5000?e:null}catch(e){return null}}
function __qaSharedAuthFresh(e){return e&&Number(e.ticketExpiredTime)>Date.now()+5000&&Number(e.signatureExpiredTime)>Date.now()+5000}
function __qaSharedAuthBrokerRequest(e,t,r,n){n=n||0;try{const i=__qaSharedAuthHttp.request({socketPath:__qaSharedAuthBrokerSocket,path:e,method:"POST",headers:{"content-type":"application/json"}},s=>{let o="";s.setEncoding("utf8"),s.on("data",e=>o+=e),s.on("end",()=>{try{const i=JSON.parse(o);if(200===s.statusCode&&i&&(i.auth||i.event))return r(null,i.auth||i.event);if(t&&"daily"===t.role&&i&&"qa_auth_broker_daily_publisher_unverified"===i.code&&n<5)return void setTimeout(()=>__qaSharedAuthBrokerRequest(e,t,r,n+1),250);r(new Error(i&&i.code||"shared auth broker rejected request"))}catch(e){r(e)}})});i.on("error",r),i.end(JSON.stringify(t||{}))}catch(e){r(e)}}
function __qaSharedAuthPublish(e){if("daily"!==__qaSharedAuthRole||!e||!e.openid||!e.newticket)return;__qaSharedAuthBrokerRequest("/publish",{auth:e,role:"daily",capability:__qaSharedAuthCapability},()=>{})}
function __qaSharedAuthNextEventId(){return "devtools-"+Date.now().toString(36)+"-"+process.pid+"-"+Math.random().toString(36).slice(2,12)}
function __qaSharedAuthWriteConsumptionDebug(e){try{__qaSharedAuthFs.writeFileSync(__qaSharedAuthConsumptionDebugFile,JSON.stringify({...e,updated_at:new Date().toISOString(),pid:process.pid,ppid:process.ppid,role:__qaSharedAuthRole,profile:__qaSharedAuthEffectiveProfile,generation:Number(e.generation||0)||null},{},2),{mode:384})}catch(e){}}
function __qaSharedAuthRecordConsumption(e,n=0,t=null){if(!e||!e.openid||!e.newticket||!__qaSharedAuthEffectiveProfile)return null;const r=t||__qaSharedAuthNextEventId();__qaSharedAuthBrokerRequest("/consume",{event_id:r,role:__qaSharedAuthRole,pid:process.pid,profile:__qaSharedAuthEffectiveProfile,control_port:__qaSharedAuthEffectiveControlPort,service_port:__qaSharedAuthEffectiveServicePort,source:"shared_auth_merge",auth:e},(t,i)=>{if(!t&&i){__qaSharedAuthLastConsumptionAck.value=i,__qaSharedAuthWriteConsumptionDebug({status:"acknowledged",event_id:r,attempt:n+1,generation:e.authGeneration})}else if(n<7){__qaSharedAuthWriteConsumptionDebug({status:"retrying",event_id:r,attempt:n+1,generation:e.authGeneration,error:String(t&&t.message||"broker_rejected")}),setTimeout(()=>__qaSharedAuthRecordConsumption(e,n+1,r),250)}else __qaSharedAuthWriteConsumptionDebug({status:"failed",event_id:r,attempt:n+1,generation:e.authGeneration,error:String(t&&t.message||"broker_rejected")})});return r}
function __qaSharedAuthMerge(e){const t=__qaSharedAuthRead();if(t&&(!e||!e.openid||e.openid===t.openid)){const r=Object.assign({},e||{},t,{loginStatus:"SUCCESS"});__qaSharedAuthRecordConsumption(r);return r}return "daily"===__qaSharedAuthRole?e:null}
function __qaSharedAuthWrite(e){__qaSharedAuthPublish(e);return e}
function __qaSharedAuthFakeResponse(e,t){const r=Math.max(1,Math.floor((e.ticketExpiredTime-Date.now())/1000));t(null,{headers:{"debugger-newticket":e.newticket}},JSON.stringify({baseresponse:{errcode:0},ticket_expired_time:r}))}
function __qaSharedAuthRefresh(e,a){const t=__qaSharedAuthMerge(e);__qaSharedAuthBrokerRequest("/refresh",{auth:e||t||{},role:__qaSharedAuthRole,capability:__qaSharedAuthCapability,force:true,proactive:true},(e,t)=>{e?a(e):t&&__qaSharedAuthFresh(t)?__qaSharedAuthFakeResponse(t,a):a(new Error("shared auth state unavailable"))})}
function __qaSharedAuthSyncDailyRuntime(){if(__qaSharedAuthRefreshInFlight.value)return;try{const e=__qaSharedAuthRead(),t=e&&o&&o.userInfo&&e.openid===o.userInfo.openid?e:o&&o.userInfo;if(e&&t===e&&e.newticket!==o.userInfo.newticket){g(e),__qaSharedAuthRecordConsumption(e)}if("daily"!==__qaSharedAuthRole)return;if(!t||!t.openid||!t.signature||!t.newticket||Number(t.ticketExpiredTime)>Date.now()+120000)return;__qaSharedAuthRefreshInFlight.value=true,__qaSharedAuthBrokerRequest("/refresh",{auth:t,role:"daily",capability:__qaSharedAuthCapability,force:true,proactive:true},(e,t)=>{__qaSharedAuthRefreshInFlight.value=false;if(!e&&t&&__qaSharedAuthFresh(t)){g(t),__qaSharedAuthRecordConsumption(t)}})}catch(e){__qaSharedAuthRefreshInFlight.value=false}}
`

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) {
      continue
    }
    const [key, inlineValue] = value.slice(2).split('=', 2)
    args[key] = inlineValue ?? argv[index + 1]
  }
  return args
}

function readPackageEntries(packagePath) {
  const source = fs.readFileSync(packagePath)
  const count = source.readUInt32BE(14)
  let cursor = 18
  const entries = []
  for (let index = 0; index < count; index += 1) {
    const nameLength = source.readUInt32BE(cursor)
    cursor += 4
    const name = source.subarray(cursor, cursor + nameLength).toString()
    cursor += nameLength
    const offset = source.readUInt32BE(cursor)
    cursor += 4
    const length = source.readUInt32BE(cursor)
    cursor += 4
    entries.push({ name, offset, length, content: source.subarray(offset, offset + length) })
  }
  return { source, entries }
}

function renderHelper() {
  return SHARED_AUTH_HELPER
}

function patchLegacyLoginManager(source) {
  const marker = '"use strict";'
  if (!source.includes(marker)) {
    throw new Error('legacy login module has no strict marker')
  }
  const withHelper = source.includes('__qaSharedAuthRefresh')
    ? source
    : source.replace(marker, `${marker}${renderHelper()}`)

  const refreshStart = 'v=function(e,r){'
  const refreshEnd = '},S=function(t){'
  const startIndex = withHelper.indexOf(refreshStart)
  const endIndex = withHelper.indexOf(refreshEnd, startIndex)
  if (startIndex < 0 || endIndex < 0) {
    throw new Error('legacy refresh function boundary not found')
  }
  let patched =
    withHelper.slice(0, startIndex) +
    'v=function(e,r){return __qaSharedAuthRefresh(e,r)}' +
    withHelper.slice(endIndex + 1)

  const infoNeedle =
    'function I(){let e={};return a.loginType===d.TestUser?p.newticket?e=p:(a.isTemp=!1,e=T(),a.isTemp=!0):e=T(),e}'
  if (!patched.includes(infoNeedle)) {
    throw new Error('legacy user-info boundary not found')
  }
  patched = patched.replace(
    infoNeedle,
    'function I(){let e={};return a.loginType===d.TestUser?p.newticket?e=p:(a.isTemp=!1,e=T(),a.isTemp=!0):e=T(),__qaSharedAuthMerge(e)}'
  )

  const importNeedle =
    "const e=require('./dd1713d6017c6ebabab7a4ce2329f7a3.js'),t=require('./711b38c25d26bfab5cdc3cfafe0a624b.js'),r=require('./cd05aced5dc062793cd42e4547966595.js'),i=require('./a7080f64d7117b915d87ccd304f9f968.js'),n=require('./f320f63f032b2aa8dad7399f08975eb8.js'),o=require('./e90b7cb007787228bc8fe5535731b603.js'),s=require('./9aeb91e766dd8ce3d089d37ff2555227.js'),u=require('./d5412d2773b861711912958f9f5b10f7.js'),c=require('./37906d351f554f2bc9ae51c0dc7cafd5.js');"
  if (!patched.includes(importNeedle)) {
    throw new Error('legacy import boundary not found')
  }
  patched = patched.replace(
    importNeedle,
    'const e=require("./dd1713d6017c6ebabab7a4ce2329f7a3.js"),t=require("./711b38c25d26bfab5cdc3cfafe0a624b.js"),r=require("./cd05aced5dc062793cd42e4547966595.js"),i=require("./a7080f64d7117b915d87ccd304f9f968.js"),n=require("./f320f63f032b2aa8dad7399f08975eb8.js"),o=require("./e90b7cb007787228bc8fe5535731b603.js"),s=require("./9aeb91e766dd8ce3d089d37ff2555227.js"),u=require("./d5412d2773b861711912958f9f5b10f7.js"),c=require("./37906d351f554f2bc9ae51c0dc7cafd5.js");try{const __qaInitialAuth=__qaSharedAuthRead();__qaInitialAuth&&(!o.userInfo||!o.userInfo.openid)&&(o.userInfo=__qaInitialAuth,setTimeout(()=>__qaSharedAuthRecordConsumption(__qaInitialAuth),3000))}catch(e){};setTimeout(()=>{setTimeout(__qaSharedAuthSyncDailyRuntime,1000);setInterval(__qaSharedAuthSyncDailyRuntime,5000)},15000);'
  )

  const getInfoNeedle =
    'const T=()=>{const e=a.isTemp?f:o.userInfo;if(e.eduInfo&&"string"==typeof e.eduInfo)try{e.eduInfo=JSON.parse(e.eduInfo)}catch(t){n.warn("[getUserInfo]",""+t),e.eduInfo={}}return e}'
  if (!patched.includes(getInfoNeedle)) {
    throw new Error('legacy get-user-info boundary not found')
  }
  patched = patched.replace(
    getInfoNeedle,
    'const T=()=>{const e=a.isTemp?f:o.userInfo;if(e.eduInfo&&"string"==typeof e.eduInfo)try{e.eduInfo=JSON.parse(e.eduInfo)}catch(t){n.warn("[getUserInfo]",""+t),e.eduInfo={}}const t=__qaSharedAuthMerge(e);return __qaSharedAuthWrite(t),t}'
  )

  const updateNeedle = 'function g(e){var t;'
  if (!patched.includes(updateNeedle)) {
    throw new Error('legacy update boundary not found')
  }
  patched = patched.replace(
    updateNeedle,
    'function g(e){e=__qaSharedAuthMerge(e),__qaSharedAuthWrite(e);var t;'
  )

  return patched
}

function patchPackage(packagePath, outputPath) {
  const { source, entries } = readPackageEntries(packagePath)
  const target = entries.find(entry => entry.name === TARGET_MODULE)
  if (!target) {
    throw new Error(`module not found: ${TARGET_MODULE}`)
  }
  const originalText = target.content.toString()
  target.content = Buffer.from(patchLegacyLoginManager(originalText))

  const tableBytes = entries.reduce(
    (total, entry) => total + 4 + Buffer.byteLength(entry.name) + 4 + 4,
    0
  )
  let nextOffset = 18 + tableBytes
  const table = []
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const record = Buffer.alloc(4 + name.length + 8)
    record.writeUInt32BE(name.length, 0)
    name.copy(record, 4)
    record.writeUInt32BE(nextOffset, 4 + name.length)
    record.writeUInt32BE(entry.content.length, 8 + name.length)
    table.push(record)
    nextOffset += entry.content.length
  }
  const output = Buffer.concat([
    source.subarray(0, 18),
    ...table,
    ...entries.map(entry => entry.content)
  ])
  fs.writeFileSync(outputPath, output, { mode: 0o644 })
  return {
    originalBytes: source.length,
    patchedBytes: output.length,
    module: TARGET_MODULE,
    patchRevision: SHARED_AUTH_PATCH_REVISION,
    sha256: crypto.createHash('sha256').update(output).digest('hex')
  }
}

function install(packagePath, backupPath) {
  // The installed DevTools bundle is user/system-owned state.  QA must use a
  // copied bundle under ~/.planting/automator-qa; keeping an exported install
  // function is useful for old callers, but it must never be able to write the
  // package in /Applications (or any other caller-supplied path).
  const error = new Error(
    `system DevTools package installation is forbidden; use a QA-owned copy instead: ${packagePath}`
  )
  error.code = 'qa_system_devtools_write_forbidden'
  error.packagePath = packagePath
  error.backupPath = backupPath
  throw error
}

export { install, patchPackage, readPackageEntries, SHARED_AUTH_PATCH_REVISION }

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  const packagePath = path.resolve(args.package || DEFAULT_PACKAGE)
  const outputPath = args.output ? path.resolve(args.output) : null
  if (!args.install && !args.check) {
    console.error('use --check --confirm=shared-auth --output=/tmp/core.wxvpkg.qa')
    process.exitCode = 2
  } else if (args.confirm !== 'shared-auth') {
    console.error('refusing without --confirm=shared-auth')
    process.exitCode = 2
  } else if (args.install) {
    console.error('qa_system_devtools_write_forbidden')
    process.exitCode = 1
  } else {
    try {
      const result = { ...patchPackage(packagePath, outputPath), packagePath, outputPath }
      console.log(JSON.stringify(result, null, 2))
    } catch (error) {
      console.error(error instanceof Error ? error.stack : String(error))
      process.exitCode = 1
    }
  }
}
