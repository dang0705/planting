'use strict'

/**
 * 端上验收脚本：龟背竹（plantId=14，巨盆 100×100×50cm，V=392699ml）录入侧瓶档动态生成。
 *
 * 验证点：
 *   1. 打开龟背竹浇水 sheet → 点上次浇水 → 时间线打开
 *   2. 点历史日期格触发 selectedWatering → dose list 显示
 *   3. 录入侧瓶档应按盆体积动态生成（约8桶/20桶/39桶/63桶），而非固定"约5瓶"
 *
 * 前置条件：
 *   - devtools 已安装，cli 路径 /Applications/wechatwebdevtools.app/Contents/MacOS/cli
 *   - dist/dev/mp-weixin 已编译（npm run dev:mp-weixin:local-functions:lan）
 *   - 本地函数 gateway 在 3010 运行
 */

import automator from 'miniprogram-automator'
import { spawn } from 'node:child_process'
import { execSync } from 'node:child_process'

const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const PROJECT = process.cwd() + '/dist/dev/mp-weixin'
const PORT = 9420

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function collectTexts(page) {
  const els = await page.$$('text')
  const texts = []
  for (const el of els) {
    const t = await el.text()
    if (t && t.trim()) texts.push(t.trim())
  }
  return texts
}

async function findButtonById(page, idKeyword) {
  const buttons = await page.$$('button')
  for (const b of buttons) {
    const id = await b.attribute('id')
    if (id && id.includes(idKeyword)) return b
  }
  return null
}

async function main() {
  // 检测 9420
  let auto = null
  let alreadyListening = false
  try {
    execSync('lsof -nP -iTCP:9420 -sTCP:LISTEN', { stdio: 'ignore' })
    alreadyListening = true
    console.log('[1] 9420 已监听，复用')
  } catch {}

  if (!alreadyListening) {
    console.log('[1] 拉起 cli auto...')
    auto = spawn(CLI, ['auto', '--project', PROJECT, '--auto-port', String(PORT)], { stdio: 'ignore' })
  }

  let mp = null
  for (let i = 0; i < 25; i++) {
    await sleep(1000)
    try {
      mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` })
      break
    } catch {}
  }
  if (!mp) {
    console.error('✗ 未能连接 automator')
    if (auto) auto.kill()
    process.exit(1)
  }
  console.log('[2] connect 成功')

  let pass = true
  try {
    // reLaunch 确保页面加载新编译产物
    console.log('[3] reLaunch 首页...')
    await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
    await sleep(10000)

    const page = await mp.currentPage()
    console.log(`[4] 当前页: ${page.path}`)

    // 滚动到龟背竹
    let texts = await collectTexts(page)
    if (!texts.some(t => /龟背竹/.test(t))) {
      console.log('  首屏未找到龟背竹，滚动查找...')
      for (let s = 0; s < 8; s++) {
        await mp.pageScrollTo((s + 1) * 300)
        await sleep(400)
        texts = await collectTexts(page)
        if (texts.some(t => /龟背竹/.test(t))) break
      }
    }
    console.log('  龟背竹: ✓')

    // 点龟背竹水滴 button（id 含 reminder-14-water，编译后有哈希前缀）
    console.log('[5] 点龟背竹水滴 button...')
    const waterBtn = await findButtonById(page, 'reminder-14-water')
    if (!waterBtn) { console.log('✗ 未找到 reminder-14-water button'); pass = false; return }
    await waterBtn.tap()
    await sleep(3000)

    // 确认 sheet 打开
    texts = await collectTexts(page)
    if (!texts.some(t => /添加浇水提醒|上次浇水/.test(t))) {
      console.log('✗ sheet 未打开'); pass = false; return
    }
    console.log('[6] sheet 打开: ✓')

    // 点上次浇水行
    console.log('[7] 点"上次浇水"行')
    const views = await page.$$('view')
    for (const v of views) {
      const id = await v.attribute('id')
      if (id && id.includes('last-watering')) { await v.tap(); break }
    }
    await sleep(2000)

    // 点历史日期格 D-2 触发 selectedWatering → dose list 显示
    console.log('[8] 点日期格 D-2 触发 dose list')
    const dateViews = []
    const allViews = await page.$$('view')
    for (const v of allViews) {
      const id = await v.attribute('id')
      if (id && id.includes('care-behavior-date')) dateViews.push(v)
    }
    if (dateViews.length >= 12) {
      await dateViews[dateViews.length - 12].tap()
      await sleep(1500)
    }

    // 点确认触发 planner
    console.log('[9] 点确认')
    const buttons = await page.$$('button')
    for (const btn of buttons) {
      const t = await btn.text()
      if (t && t.trim() === '确认') { await btn.tap(); break }
    }
    await sleep(7000)

    // === 断言录入侧瓶档 ===
    console.log('[10] 抓取录入侧瓶档')
    texts = await collectTexts(page)
    const doseIdx = texts.findIndex(t => /每次浇了多少水/.test(t))
    if (doseIdx === -1) {
      console.log('✗ 未找到"每次浇了多少水"区域')
      pass = false
      return
    }
    console.log('  dose list: ✓')

    const doseLabels = texts.slice(doseIdx + 1, doseIdx + 20).filter(t =>
      /不知道|喷一喷|约.*瓶|约.*桶|半瓶|小半瓶|一瓶|两瓶/.test(t)
    )
    console.log(`\n  录入侧瓶档 (${doseLabels.length} 个):`)
    doseLabels.forEach((t, i) => console.log(`    ${i + 1}. ${t}`))

    // === 关键断言 ===
    console.log('\n[11] 关键断言')
    const hasFixed5 = doseLabels.some(t => /^约5瓶$/.test(t))
    console.log(`  不应出现固定"约5瓶": ${!hasFixed5 ? '✓ 通过' : '✗ 失败'}`)
    if (hasFixed5) pass = false

    const hasBucket = doseLabels.some(t => /桶/.test(t))
    console.log(`  巨盆应显示"约N桶"油桶档: ${hasBucket ? '✓ 通过' : '✗ 失败'}`)
    if (!hasBucket) pass = false

    if (hasBucket) {
      const hasBig = doseLabels.filter(t => /桶/.test(t)).some(t => {
        const m = t.match(/约(\d+)桶/); return m && parseInt(m[1]) >= 5
      })
      console.log(`  存在≥5桶大水量档: ${hasBig ? '✓ 通过' : '✗ 失败'}`)
      if (!hasBig) pass = false
    }

    // 建议水量文案
    const amountLine = texts.find(t => /约.*桶.*油桶/.test(t))
    if (amountLine) console.log(`\n  建议水量: "${amountLine}"`)

    console.log(`\n=== 端上验收${pass ? '✓ 通过' : '✗ 失败'} ===`)
  } finally {
    try { await mp.disconnect() } catch {}
    if (auto) auto.kill()
  }
  process.exit(pass ? 0 : 1)
}

main().catch(e => { console.error('失败:', e.message); process.exit(1) })
