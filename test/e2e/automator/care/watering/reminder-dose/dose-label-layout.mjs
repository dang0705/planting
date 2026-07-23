'use strict'

/**
 * 端上截图测试：浇水档位文字重叠检查。
 *
 * 验证点：
 *   1. 打开浇水 sheet -> 点上次浇水 -> 时间线打开
 *   2. 点历史日期格触发 dose list 显示
 *   3. 截图 dose list 区域，检查换行文案是否重叠
 *
 * 前置条件：
 *   - devtools 已安装，cli 路径 /Applications/wechatwebdevtools.app/Contents/MacOS/cli
 *   - dist/dev/mp-weixin 已编译
 *   - 9420 端口在监听
 */

import automator from 'miniprogram-automator'
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const PORT = 9420
const SCREENSHOT_DIR = 'screenshots'

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
  mkdirSync(SCREENSHOT_DIR, { recursive: true })

  // 检测 9420
  let alreadyListening = false
  try {
    execSync('lsof -nP -iTCP:9420 -sTCP:LISTEN', { stdio: 'ignore' })
    alreadyListening = true
    console.log('[1] 9420 已监听，复用')
  } catch {}

  if (!alreadyListening) {
    console.error('✗ 9420 未监听，请先打开微信开发者工具')
    process.exit(1)
  }

  let mp = null
  for (let i = 0; i < 15; i++) {
    await sleep(1000)
    try {
      mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` })
      break
    } catch {}
  }
  if (!mp) {
    console.error('✗ 未能连接 automator')
    process.exit(1)
  }
  console.log('[2] connect 成功')

  try {
    // reLaunch 首页
    console.log('[3] reLaunch 首页...')
    await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
    await sleep(10000)

    // 截图首页
    await mp.screenshot({ path: `${SCREENSHOT_DIR}/dose-test-0-homepage.png` })
    console.log('  截图: dose-test-0-homepage.png')

    const page = await mp.currentPage()
    console.log(`[4] 当前页: ${page.path}`)

    // 找第一株植物的水滴按钮（任意 plantId）
    console.log('[5] 查找浇水入口...')
    let waterBtn = null
    let plantId = null
    const buttons = await page.$$('button')
    for (const b of buttons) {
      const id = await b.attribute('id')
      if (id && id.includes('reminder-') && id.includes('-water')) {
        waterBtn = b
        const m = id.match(/reminder-(\d+)-water/)
        if (m) plantId = m[1]
        break
      }
    }
    if (!waterBtn) {
      // 滚动找
      for (let s = 0; s < 8; s++) {
        await mp.pageScrollTo((s + 1) * 300)
        await sleep(500)
        const btns = await page.$$('button')
        for (const b of btns) {
          const id = await b.attribute('id')
          if (id && id.includes('reminder-') && id.includes('-water')) {
            waterBtn = b
            const m = id.match(/reminder-(\d+)-water/)
            if (m) plantId = m[1]
            break
          }
        }
        if (waterBtn) break
      }
    }
    if (!waterBtn) {
      console.log('✗ 未找到浇水入口')
      process.exit(1)
    }
    console.log(`  找到浇水入口 plantId=${plantId}: ✓`)

    // 点水滴按钮
    console.log('[6] 点浇水入口...')
    await waterBtn.tap()
    await sleep(3000)

    // 截图 sheet
    await mp.screenshot({ path: `${SCREENSHOT_DIR}/dose-test-1-sheet-open.png` })
    console.log('  截图: dose-test-1-sheet-open.png')

    // 点上次浇水行
    console.log('[7] 点"上次浇水"行')
    const views = await page.$$('view')
    for (const v of views) {
      const id = await v.attribute('id')
      if (id && id.includes('last-watering')) { await v.tap(); break }
    }
    await sleep(2000)

    // 点历史日期格触发 dose list
    console.log('[8] 点日期格触发 dose list')
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

    // 截图 dose list
    await mp.screenshot({ path: `${SCREENSHOT_DIR}/dose-test-2-dose-list.png` })
    console.log('  截图: dose-test-2-dose-list.png')

    // 抓取 dose list 文案
    console.log('[9] 抓取 dose list 文案')
    const texts = await collectTexts(page)
    const doseIdx = texts.findIndex(t => /每次浇了多少水/.test(t))
    if (doseIdx !== -1) {
      console.log('  dose list 区域文案:')
      texts.slice(doseIdx, doseIdx + 25).forEach((t, i) => {
        console.log(`    ${i}. "${t}"`)
      })
    } else {
      console.log('  ✗ 未找到"每次浇了多少水"区域')
    }

    // 点确认触发 planner（可选，主要看 dose list 布局）
    console.log('[10] 点确认触发 planner')
    const btns2 = await page.$$('button')
    for (const btn of btns2) {
      const t = await btn.text()
      if (t && t.trim() === '确认') { await btn.tap(); break }
    }
    await sleep(5000)

    // 截图 planner 结果
    await mp.screenshot({ path: `${SCREENSHOT_DIR}/dose-test-3-planner-result.png` })
    console.log('  截图: dose-test-3-planner-result.png')

    // 抓取建议水量文案
    const texts2 = await collectTexts(page)
    const amountLine = texts2.find(t => /约.*瓶|约.*桶/.test(t))
    if (amountLine) console.log(`\n  建议水量: "${amountLine}"`)

    console.log('\n=== 截图测试完成 ===')
    console.log(`截图保存在 ${SCREENSHOT_DIR}/ 目录`)
  } finally {
    try { await mp.disconnect() } catch {}
  }
  process.exit(0)
}

main().catch(e => { console.error('失败:', e.message); process.exit(1) })
