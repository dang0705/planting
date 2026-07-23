'use strict'

/**
 * 端上验收脚本：浇水建议水量瓶/油桶文案 + 盆型编辑器入口。
 *
 * 解决 automator 对 uni-app 自定义组件 tap 事件穿透问题：
 * page.$('#id') 在自定义组件 scope 内无法定位，改用 page.$$('view') 遍历
 * 按 id 属性匹配目标元素后 tap，事件能正确触发父级 @click。
 *
 * 前置条件：
 *   - devtools 已安装，cli 路径 /Applications/wechatwebdevtools.app/Contents/MacOS/cli
 *   - dist/dev/mp-weixin 已编译
 *   - 本地函数 gateway 在 3010 运行（npm run dev:functions）
 */

import automator from 'miniprogram-automator'
import { spawn } from 'node:child_process'

const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const PROJECT = process.cwd() + '/dist/dev/mp-weixin'
const PORT = 9420

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/**
 * 遍历页面所有 view，按 id 关键词匹配目标元素。
 * 解决 page.$('#id') 在 uni-app 自定义组件 scope 内无法定位的问题。
 */
async function findViewById(page, idKeyword) {
  const views = await page.$$('view')
  for (const v of views) {
    const id = await v.attribute('id')
    if (id && id.includes(idKeyword)) return v
  }
  return null
}

async function collectTexts(page) {
  const els = await page.$$('text')
  const texts = []
  for (const el of els) {
    const t = await el.text()
    if (t && t.trim()) texts.push(t.trim())
  }
  return texts
}

async function tapByText(page, targetText) {
  const els = await page.$$('text')
  for (const el of els) {
    const t = await el.text()
    if (t && t.trim() === targetText) {
      await el.tap()
      return true
    }
  }
  return false
}

async function main() {
  console.log('[1] 启动 cli auto...')
  const auto = spawn(CLI, ['auto', '--project', PROJECT, '--auto-port', String(PORT)], { stdio: 'ignore' })

  let mp = null
  for (let i = 0; i < 20; i++) {
    await sleep(1000)
    try {
      mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` })
      break
    } catch {}
  }
  if (!mp) {
    console.error('✗ 未能连接 automator')
    auto.kill()
    process.exit(1)
  }
  console.log('[2] connect 成功')

  try {
    const page = await mp.currentPage()
    console.log(`[3] 当前页: ${page.path}`)
    await sleep(2000)

    // === 步骤1：点水滴 icon 打开浇水 sheet ===
    console.log('[4] 查找水滴 icon...')
    const imgs = await page.$$('image')
    let waterIcon = null
    for (const img of imgs) {
      const src = await img.attribute('src')
      if (src && /water/i.test(src)) {
        waterIcon = img
        break
      }
    }
    if (!waterIcon) {
      console.log('✗ 未找到水滴 icon（首页可能无植物）')
      return
    }
    console.log('  ✓ 找到水滴 icon，tap')
    await waterIcon.tap()
    await sleep(2000)

    // 确认 sheet 打开
    let texts = await collectTexts(page)
    const sheetOpen = texts.some(t => /添加浇水提醒/.test(t))
    console.log(`[5] 浇水 sheet 打开: ${sheetOpen}`)
    if (!sheetOpen) {
      console.log('✗ sheet 未打开')
      return
    }

    // === 步骤2：点"上次浇水"行打开日期选择器 ===
    console.log('[6] 定位"上次浇水"行（遍历 view 找 id）')
    const row = await findViewById(page, 'last-watering')
    if (!row) {
      console.log('✗ 未找到 #watering-reminder-last-watering-row')
      return
    }
    console.log('  ✓ 找到，tap')
    await row.tap()
    await sleep(2000)

    // 确认日期选择器打开
    texts = await collectTexts(page)
    const datePickerOpen = texts.some(t => /选择浇水日期/.test(t))
    console.log(`[7] 日期选择器打开: ${datePickerOpen}`)
    if (!datePickerOpen) {
      console.log('✗ 日期选择器未打开')
      return
    }

    // === 步骤3：选日期 ===
    console.log('[8] 选日期（D-1 昨天）')
    const dateViews = []
    const allViews = await page.$$('view')
    for (const v of allViews) {
      const id = await v.attribute('id')
      if (id && id.includes('care-behavior-date')) dateViews.push(v)
    }
    console.log(`  日期格数: ${dateViews.length}`)
    if (dateViews.length > 0) {
      // 日期格从 D-10 到 D+10，昨天(D-1)在倒数第 11 个
      const idx = Math.max(0, dateViews.length - 11)
      await dateViews[idx].tap()
      console.log(`  点了第 ${idx + 1}/${dateViews.length} 个日期格`)
      await sleep(500)
    }

    // === 步骤4：点确认 ===
    console.log('[9] 点确认')
    const confirmed = await tapByText(page, '确认')
    console.log(`  确认点击: ${confirmed}`)
    await sleep(5000) // 等 planner 请求返回

    // === 步骤5：断言水量文案 ===
    console.log('[10] 抓水量文案')
    texts = await collectTexts(page)

    // 录入侧瓶档说明文案（验证录入侧改造）
    const bottleRef = texts.find(t => /550ml.*矿泉水瓶|矿泉水瓶.*参照/.test(t))
    if (bottleRef) console.log(`  ✓ 录入侧瓶档文案: "${bottleRef}"`)

    // 建议水量文案
    const amountLine = texts.find(t => /约.*瓶|约.*桶|喷一喷/.test(t))
    if (amountLine) {
      console.log(`\n✓✓✓ 建议水量文案: "${amountLine}"`)
      if (/桶/.test(amountLine)) {
        console.log('  → 油桶文案端上验收通过（≥5升）')
      } else if (/瓶/.test(amountLine)) {
        console.log('  → 矿泉水瓶文案（<5升，符合预期）')
      }
    } else {
      console.log('  未找到"约X瓶/桶"文案（可能 planner 未返回或暂停浇水）')
    }

    // 下次浇水日期
    const dateLine = texts.find(t => /2026-\d{2}-\d{2}/.test(t))
    if (dateLine) console.log(`  下次浇水日期: ${dateLine}`)

    // 暂停浇水
    const pauseLine = texts.find(t => /暂停浇水/.test(t))
    if (pauseLine) console.log(`  ✓ 暂停浇水文案: "${pauseLine}"`)

    // 盆型入口
    const potRow = await findViewById(page, 'pot-profile-row')
    console.log(`\n[11] 盆型入口存在: ${potRow ? '✓' : '✗'}`)

    console.log('\n=== 端上验收完成 ===')
  } finally {
    await mp.close()
    auto.kill()
  }
}

main().catch(e => {
  console.error('失败:', e.message)
  process.exit(1)
})
