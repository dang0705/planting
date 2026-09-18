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

(async function main() {
  try { execSync('lsof -nP -iTCP:9420 -sTCP:LISTEN', { stdio: 'ignore' }) } catch { auto = spawn(CLI, ['auto', '--project', PROJECT, '--auto-port', String(PORT)], { stdio: 'ignore' }) }
  for (let i=0;i<25;i++) { await sleep(1000); try { mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` }); break } catch {} }
  if(!mp) throw new Error('connect fail')
  await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
  await sleep(5000)
  const page = await mp.currentPage()

  let opener = null
  const byView = await page.$$('view')
  for (const v of byView) {
    const id = await safeAttr(v,'id')
    if (id && id.includes('reminder-14-water')) { opener = v; break }
  }
  if (!opener) {
    const imgs = await page.$$('image')
    for (const img of imgs) {
      const src = await safeAttr(img, 'src')
      if (src && /water/i.test(src)) { opener = img; break }
    }
  }
  if (!opener) throw new Error('no opener')
  await opener.tap(); await sleep(2200)

  const findById = async (keyword, tag='view') => {
    const nodes = await page.$$(tag)
    for (const n of nodes) {
      const id = await safeAttr(n, 'id')
      if (id && id.includes(keyword)) return n
    }
    return null
  }

  const last = await findById('last-watering')
  if (!last) throw new Error('no last watering')
  await last.tap(); await sleep(1200)

  const date = await findById('care-behavior-date-2026-06-24')
  if (!date) throw new Error('no date')
  await date.tap(); await sleep(1200)

  const texts = await page.$$('text')
  let confirm
  for (const t of texts) { const txt = await safeText(t); if (txt && txt.trim() === '确认') { confirm=t; break } }
  if (confirm) { await confirm.tap(); await sleep(2500) }

  const inspect = await mp.evaluate(() => {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery()
      query.selectAll('slider,view,text').boundingClientRect((nodes) => {
        resolve((nodes || []).map(n => ({
          id: n.id || '',
          left: n.left,
          top: n.top,
          width: n.width,
          height: n.height,
          dataset: n.dataset || null,
          tag: n.tagName || n.nodeName || ''
        })))
      }).exec()
    })
  })

  const sliderNodes = inspect.filter(i => i.id && i.id.includes('watering-dose-slider-'))
  const all = inspect.filter(i => i.id)
  const candidatesText = inspect.filter(i => i.tag === 'TEXT' || i.tag === 'text')
  const doseGuess = candidatesText.filter(i => (i.width || 0) < 120 && (i.height || 0) > 6 && (i.height || 0) < 24 && (i.id === '' || i.id.includes('null')))

  console.log('all ids count', all.length)
  console.log('sliderNodes', sliderNodes)
  console.log('first 20 text nodes', candidatesText.slice(0, 20))
  console.log('dose-like', doseGuess.slice(0, 30))

  await mp.disconnect(); if (auto) auto.kill()
})().catch(async err => {
  console.error(err)
  if (mp) await mp.disconnect()
  if (auto) auto.kill()
})
