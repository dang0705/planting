import automator from 'miniprogram-automator'
import { spawn } from 'node:child_process'
import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const PROJECT = '/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin'
const PORT = 9420
const SHOT_DIR = '/tmp/qa-shots'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let mp, auto
const log = (...a) => console.log('[qa]', ...a)

async function attr(n, k) { try { return await n.attribute(k) } catch { return null } }
async function txt(n) { try { return await n.text() } catch { return null } }

async function findById(page, id) {
  const views = await page.$$('view')
  for (const v of views) { if ((await attr(v, 'id')) === id) return v }
  const btns = await page.$$('button')
  for (const b of btns) { if ((await attr(b, 'id')) === id) return b }
  return null
}
async function findByIdLike(page, key) {
  const all = await page.$$('view,button')
  for (const n of all) { const id = await attr(n, 'id'); if (id && id.includes(key)) return n }
  return null
}
async function rootStyle(page) {
  // Layout root view has class min-h-screen and inline --app-header-height
  try {
    const views = await page.$$('view')
    for (const v of views) {
      const s = await attr(v, 'style')
      if (s && s.includes('--app-header-height')) return s
    }
  } catch {}
  return null
}

async function ensureAuto() {
  try { execSync(`lsof -nP -iTCP:${PORT} -sTCP:LISTEN`, { stdio: 'ignore' }); log('port', PORT, 'already listening') }
  catch {
    auto = spawn(CLI, ['auto', '--project', PROJECT, '--auto-port', String(PORT)], { stdio: 'ignore' })
    log('launched cli auto, pid', auto.pid)
  }
  for (let i = 0; i < 40; i++) {
    await sleep(1000)
    try { mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` }); log('connected at', i, 's'); return } catch {}
  }
  throw new Error('connect to automator failed')
}

const PAGES = [
  ['/pages/index/index', 'index'],
  ['/pages/plant-detail/plant-detail', 'plant-detail'],
  ['/pages/add-plant/add-plant', 'add-plant'],
  ['/pages/diagnose/diagnose', 'diagnose'],
  ['/pages/diagnose/question-package', 'question-package'],
  ['/pages/calendar/calendar', 'calendar'],
  ['/pages/profile/profile', 'profile'],
  ['/pages/profile/watering-review', 'watering-review'],
  ['/pages/profile/out-of-pool-review', 'out-of-pool-review'],
  ['/pages/profile/diagnosis-review', 'diagnosis-review']
]

async function capturePages() {
  const results = {}
  for (const [url, name] of PAGES) {
    try {
      await mp.callWxMethod("reLaunch", { url })
      await sleep(3500)
      const page = await mp.currentPage()
      let path = null; try { path = page.path } catch(e){} try { if(!path && typeof page.path === "function") path = await page.path() } catch(e){}
      const style = await rootStyle(page)
      const file = path ? `${SHOT_DIR}/page-${name}.png` : `${SHOT_DIR}/page-${name}.png`
      await mp.screenshot({ path: file })
      results[name] = { url, runtimePath: path, rootStyle: style, shot: file, ok: true }
      log('PAGE', name, 'path=', path, 'style=', style)
    } catch (e) {
      results[name] = { url, error: String(e?.message || e), ok: false }
      log('PAGE-ERR', name, e?.message || e)
    }
  }
  return results
}

async function existsVisible(page, id) {
  const n = await findById(page, id)
  if (!n) return { found: false }
  try { const vis = await n.visible?.(); return { found: true, node: n, visible: vis } }
  catch { return { found: true, node: n } }
}

async function flowIndex() {
  const out = {}
  await mp.callWxMethod("reLaunch", { url: "/pages/index/index" })
  await sleep(4000)
  const page = await mp.currentPage()
  // find any diagnose-entry-button
  const diagBtn = await findByIdLike(page, 'diagnose-entry-button-')
  out.diagnoseEntryButtonFound = !!diagBtn
  if (diagBtn) {
    try {
      await diagBtn.tap()
      await sleep(2000)
      const panel = await existsVisible(page, 'diagnose-popup-panel')
      const scroll = await existsVisible(page, 'diagnose-popup-scroll')
      const submit = await existsVisible(page, 'diagnose-submit-button')
      const close = await existsVisible(page, 'diagnose-popup-close-button')
      out.diagnosePopup = { panel: panel.found, scroll: scroll.found, submit: submit.found, closeBtn: close.found }
      await mp.screenshot({ path: `${SHOT_DIR}/popup-diagnose-open.png` })
      // close via close button
      if (close.node) { await close.node.tap(); await sleep(1500) }
      else if (panel.node) { try { await page.$('.uni-popup') } catch {} }
      await mp.screenshot({ path: `${SHOT_DIR}/popup-diagnose-closed.png` })
      out.diagnoseClosed = !(await existsVisible(page, 'diagnose-popup-panel')).found
    } catch (e) { out.diagnoseErr = String(e?.message || e) }
  }
  // WateringReminderSheet via plant-card-reminder-{id}-water
  const waterBtn = await findByIdLike(page, 'plant-card-reminder-')
  out.waterReminderButtonFound = !!waterBtn
  if (waterBtn) {
    const wid = await attr(waterBtn, 'id')
    // ensure it's the water type
    try {
      await waterBtn.tap()
      await sleep(2000)
      const sheet = await existsVisible(page, 'watering-reminder-sheet')
      const confirm = await existsVisible(page, 'watering-reminder-confirm-button')
      out.wateringSheet = { sheet: sheet.found, confirmBtn: confirm.found, btnId: wid }
      await mp.screenshot({ path: `${SHOT_DIR}/popup-watering-open.png` })
      // open nested PotProfileEditor
      const potRow = await existsVisible(page, 'watering-reminder-pot-profile-row')
      if (potRow.node) {
        await potRow.node.tap()
        await sleep(2000)
        const potSheet = await existsVisible(page, 'pot-profile-editor-sheet')
        const potConfirm = await existsVisible(page, 'pot-profile-editor-confirm-button')
        const potClose = await existsVisible(page, 'pot-profile-editor-close-button')
        out.potProfile = { sheet: potSheet.found, confirmBtn: potConfirm.found, closeBtn: potClose.found }
        await mp.screenshot({ path: `${SHOT_DIR}/popup-pot-profile-open.png` })
        if (potClose.node) { await potClose.node.tap(); await sleep(1200) }
      }
      // open date picker
      const dateRow = await findByIdLike(page, 'watering-date-') // date trigger row
      const closeW = await existsVisible(page, 'watering-reminder-close-button')
      if (closeW.node) { await closeW.node.tap(); await sleep(1200) }
      await mp.screenshot({ path: `${SHOT_DIR}/popup-watering-closed.png` })
      out.wateringClosed = !(await existsVisible(page, 'watering-reminder-sheet')).found
    } catch (e) { out.waterErr = String(e?.message || e) }
  }
  return out
}

async function flowPlantDetail() {
  const out = {}
  await mp.callWxMethod("reLaunch", { url: "/pages/plant-detail/plant-detail" })
  await sleep(3500)
  const page = await mp.currentPage()
  const root = await rootStyle(page)
  out.rootStyle = root
  const diagBtn = await existsVisible(page, 'plant-detail-diagnose-button')
  out.diagnoseButtonFound = diagBtn.found
  // action sheet via edit button (third button in quick actions, no id -> tap by text 编辑信息)
  const editBtn = await (async () => {
    const btns = await page.$$('button')
    for (const b of btns) { const t = await txt(b); if (t && t.includes('编辑信息')) return b }
    return null
  })()
  out.editButtonFound = !!editBtn
  if (editBtn) {
    try {
      await editBtn.tap()
      await sleep(1800)
      const panel = await existsVisible(page, 'layout-action-sheet')
      const opt0 = await existsVisible(page, 'layout-action-sheet-option-0')
      const close = await existsVisible(page, 'layout-action-sheet-close-button')
      out.actionSheet = { panel: panel.found, option0: opt0.found, closeBtn: close.found }
      await mp.screenshot({ path: `${SHOT_DIR}/popup-plant-detail-action-sheet.png` })
      if (close.node) { await close.node.tap(); await sleep(1200) }
      out.actionSheetClosed = !(await existsVisible(page, 'layout-action-sheet')).found
    } catch (e) { out.actionSheetErr = String(e?.message || e) }
  }
  // open diagnose popup
  if (diagBtn.node) {
    try {
      await diagBtn.node.tap()
      await sleep(2000)
      const panel = await existsVisible(page, 'diagnose-popup-panel')
      out.plantDetailDiagnosePopup = { panel: panel.found }
      await mp.screenshot({ path: `${SHOT_DIR}/popup-plant-detail-diagnose-open.png` })
      const close = await existsVisible(page, 'diagnose-popup-close-button')
      if (close.node) { await close.node.tap(); await sleep(1200) }
    } catch (e) { out.pdDiagnoseErr = String(e?.message || e) }
  }
  return out
}

;(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  await ensureAuto()
  const report = {}
  report.pages = await capturePages()
  report.indexFlows = await flowIndex()
  report.plantDetailFlows = await flowPlantDetail()
  fs.writeFileSync('/tmp/qa-report.json', JSON.stringify(report, null, 2))
  log('REPORT written /tmp/qa-report.json')
  await mp.disconnect()
  if (auto) auto.kill()
})().catch(async e => {
  console.error('FATAL', e)
  try { if (mp) await mp.disconnect() } catch {}
  if (auto) auto.kill()
  process.exit(1)
})
