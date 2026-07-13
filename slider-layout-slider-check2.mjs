import automator from 'miniprogram-automator'
import { spawn } from 'node:child_process'
import { execSync } from 'node:child_process'

const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const PROJECT = '/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin'
const PORT = 9420

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let mp
let auto

async function safeAttr(el, key) { try { return await el.attribute(key) } catch { return null } }
async function safeText(el) { try { return await el.text() } catch { return null } }

async function findByIdTag(page, keyword, tag='view') {
  const nodes = await page.$$(tag)
  for (const n of nodes) {
    const id = await safeAttr(n, 'id')
    if (id && id.includes(keyword)) return n
  }
  return null
}

(async function main() {
  try { execSync('lsof -nP -iTCP:9420 -sTCP:LISTEN', { stdio: 'ignore' }) } catch { auto = spawn(CLI, ['auto', '--project', PROJECT, '--auto-port', String(PORT)], { stdio: 'ignore' }) }
  for (let i=0;i<30;i++) { await sleep(1000); try { mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` }); break } catch {} }
  if (!mp) throw new Error('connect fail')

  await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
  await sleep(7000)
  const page = await mp.currentPage()

  let opener = await findByIdTag(page, 'reminder-14-water')
  if (!opener) {
    const imgs = await page.$$('image')
    for (const img of imgs) {
      const src = await safeAttr(img, 'src')
      if (src && /water/i.test(src)) { opener = img; break }
    }
  }
  if (!opener) throw new Error('no opener')
  await opener.tap(); await sleep(2500)

  const last = await findByIdTag(page, 'last-watering')
  if (!last) throw new Error('no last watering')
  await last.tap(); await sleep(1200)

  const date = await findByIdTag(page, 'care-behavior-date-2026-06-24')
  if (!date) throw new Error('no date')
  await date.tap(); await sleep(1200)

  const confirm = await (async() => {
    const texts = await page.$$('text')
    for (const t of texts) {
      const txt = await safeText(t)
      if (txt && txt.trim() === '确认') return t
    }
    return null
  })()
  if (confirm) {
    console.log('click confirm')
    await confirm.tap(); await sleep(1800)
  } else {
    console.log('no confirm, continue')
  }

  const sliders = await page.$$('slider')
  const ids = []
  for (const s of sliders) ids.push(await safeAttr(s, 'id'))
  console.log('slider ids', ids)

  const slider = sliders[0]
  if (!slider) throw new Error('slider not found')
  const sid = await safeAttr(slider, 'id')
  console.log('use slider', sid)

  await slider.slideTo(0)
  await sleep(500)
  await slider.slideTo(3)
  await sleep(500)
  const selected = (await page.$$('text')).map(async t => safeText(t))
  const all = await page.$$eval ? await page.$$eval() : []

  const texts = await page.$$('text')
  const seen = []
  for (const t of texts) {
    const txt = await safeText(t)
    if (!txt) continue
    if (/约|瓶|桶|喷/.test(txt)) seen.push(txt.trim())
  }
  console.log('dose-like texts', [...new Set(seen)])

  await mp.disconnect(); if (auto) auto.kill()
})().catch(async err => {
  console.error(err)
  if (mp) await mp.disconnect()
  if (auto) auto.kill()
})
