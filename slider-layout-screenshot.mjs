import automator from 'miniprogram-automator'
import { spawn } from 'node:child_process'
import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const PROJECT = '/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin'
const PORT = 9420

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let mp
let auto

async function attr(node, key) {
  try { return await node.attribute(key) } catch { return null }
}

async function text(node) {
  try { return await node.text() } catch { return null }
}

async function findView(page, keyword, tag='view') {
  const nodes = await page.$$(tag)
  for (const node of nodes) {
    const id = await attr(node, 'id')
    if (id && id.includes(keyword)) return node
  }
  return null
}

async function findAnyByText(page, keyword, tag='text') {
  const nodes = await page.$$(tag)
  for (const node of nodes) {
    const val = await text(node)
    if (val && val.trim() === keyword) return node
  }
  return null
}

(async function main() {
  try {
    execSync('lsof -nP -iTCP:9420 -sTCP:LISTEN', { stdio: 'ignore' })
  } catch {
    auto = spawn(CLI, ['auto', '--project', PROJECT, '--auto-port', String(PORT)], { stdio: 'ignore' })
  }

  for (let i = 0; i < 25; i++) {
    await sleep(1000)
    try {
      mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` })
      break
    } catch {}
  }
  if (!mp) throw new Error('connect fail')

  await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
  await sleep(7000)
  const page = await mp.currentPage()

  let opener = await findView(page, 'reminder-14-water', 'view')
  if (!opener) {
    const images = await page.$$('image')
    opener = images[0]
  }
  await opener.tap()
  await sleep(2000)

  const last = await findView(page, 'last-watering')
  await last?.tap()
  await sleep(1500)

  const targetDate = await findView(page, 'care-behavior-date-2026-06-24')
  await targetDate?.tap()
  await sleep(1500)

  const confirm = await findAnyByText(page, '确认')
  await confirm?.tap()
  await sleep(3000)

  const file = path.join('/tmp', `watering-dose-layout-${Date.now()}.png`)
  await fs.promises.mkdir('/tmp', { recursive: true })
  await mp.screenshot({ path: file })
  console.log(file)
  await mp.disconnect()
  if (auto) auto.kill()
})().catch(async (err) => {
  console.error(err)
  if (mp) await mp.disconnect()
  if (auto) auto.kill()
  process.exit(1)
})
