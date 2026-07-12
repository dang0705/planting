const { createRequire } = require('module')
const automator = require('miniprogram-automator')
const fs = require('fs')

const WS_ENDPOINT = 'ws://127.0.0.1:9420'
const SCREENSHOT_DIR = '/tmp/qa-screenshots'

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function findWaterButton(page, plantId) {
  const buttons = await page.$$('button')
  for (const btn of buttons) {
    const id = await btn.attribute('id')
    if (id && id.includes(`plant-card-reminder-${plantId}-water`)) {
      return btn
    }
  }
  return null
}

;(async () => {
  console.log('=== 浇水提醒单位对齐端上验证（龟背竹） ===\n')

  const mp = await automator.connect({ wsEndpoint: WS_ENDPOINT })
  console.log('[1] ✓ automator 已连接')

  try {
    await mp.reLaunch('/pages/index/index')
    await sleep(3000)
    const page = await mp.currentPage()
    console.log('[2] ✓ 首页:', page.path)

    // Step 3: Tap 龟背竹 water button (plant id=14)
    console.log('[3] 点击龟背竹浇水按钮...')
    const waterBtn = await findWaterButton(page, 14)
    if (!waterBtn) throw new Error('未找到浇水按钮')
    await waterBtn.tap()
    await sleep(3000)
    console.log('    ✓ 浇水提醒弹框已打开')

    // Step 4: Tap "上次浇水" to open date picker
    console.log('[4] 打开日期选择器...')
    const texts1 = await page.$$('text')
    for (const t of texts1) {
      const txt = await t.text()
      if (txt && txt.includes('上次浇水')) {
        await t.tap()
        break
      }
    }
    await sleep(4000)

    // Verify date picker is open
    const dpTexts = await page.$$('text')
    let dpOpen = false
    for (const t of dpTexts) {
      const txt = await t.text()
      if (txt && txt.includes('选择浇水日期')) {
        dpOpen = true
        break
      }
    }
    console.log('    ' + (dpOpen ? '✓ 日期选择器已打开' : '⚠ 日期选择器可能未打开'))
    await mp.screenshot({ path: `${SCREENSHOT_DIR}/01-date-picker.png` })

    // Step 5: Tap a date cell to toggle watering (this enables the dose slider)
    console.log('[5] 选择浇水日期（触发 dose slider 出现）...')
    // Date cells are views; find one with care-behavior-date in id
    // Or find the day number text and tap it
    // The timeline shows dates 22-12; let's tap date "28" (yesterday-ish)
    const allTexts = await page.$$('text')
    let dateTapped = false
    for (const t of allTexts) {
      const txt = await t.text()
      // Tap a past date number (22-28 range from the timeline)
      if (txt && txt.trim() === '28') {
        try {
          await t.tap()
          dateTapped = true
          console.log('    ✓ 已点击日期 28')
          break
        } catch(e) {}
      }
    }
    if (!dateTapped) {
      // Try "25"
      for (const t of allTexts) {
        const txt = await t.text()
        if (txt && txt.trim() === '25') {
          await t.tap()
          dateTapped = true
          console.log('    ✓ 已点击日期 25')
          break
        }
      }
    }
    if (!dateTapped) {
      console.log('    ⚠ 未找到可点击的日期')
    }

    await sleep(1500)
    await mp.screenshot({ path: `${SCREENSHOT_DIR}/02-after-date-select.png` })

    // Step 6: Now read the dose slider unit (should appear after selecting a date)
    console.log('[6] 读取 dose slider 单位...')
    let sliderUnit = null
    let doseRefText = null
    let sliderOptions = []
    const pickerTexts2 = await page.$$('text')
    for (const t of pickerTexts2) {
      const txt = await t.text()
      if (!txt || !txt.trim()) continue
      const trimmed = txt.trim()
      if (trimmed.includes('参照')) {
        doseRefText = trimmed
        sliderUnit = trimmed.includes('油桶') ? '桶' : '瓶'
      }
      if (trimmed.match(/^约\d/)) {
        sliderOptions.push(trimmed)
        if (!sliderUnit) {
          sliderUnit = trimmed.includes('桶') ? '桶' : '瓶'
        }
      }
    }
    console.log('    参照文案:', doseRefText)
    console.log('    档位选项:', JSON.stringify(sliderOptions))
    console.log('    >>> dose slider 单位:', sliderUnit)

    // If still no slider, the dose list might not have rendered. Let's check all texts
    if (!sliderUnit) {
      console.log('    全部文本:')
      for (const t of pickerTexts2) {
        const txt = await t.text()
        if (txt && txt.trim()) console.log('      ', txt.trim())
      }
    }

    // Step 7: Click confirm to trigger planner
    console.log('[7] 点击确认按钮...')
    const buttons = await page.$$('button')
    for (const btn of buttons) {
      const text = await btn.text()
      if (text && text.includes('确认')) {
        await btn.tap()
        console.log('    ✓ 已点击确认')
        break
      }
    }

    console.log('    等待 planner 计算...')
    await sleep(6000)
    await mp.screenshot({ path: `${SCREENSHOT_DIR}/03-planner-result.png` })

    // Step 8: Read suggested amount
    console.log('[8] 读取建议水量文案...')
    let amountText = null
    let amountUnit = null
    let allResultTexts = []
    const resultTexts = await page.$$('text')
    for (const t of resultTexts) {
      const txt = await t.text()
      if (!txt || !txt.trim()) continue
      const trimmed = txt.trim()
      allResultTexts.push(trimmed)
      if (trimmed.match(/^约/) && (trimmed.includes('瓶') || trimmed.includes('桶'))) {
        amountText = trimmed
        amountUnit = trimmed.includes('桶') ? '桶' : '瓶'
      }
    }

    console.log('    建议水量文案:', amountText)
    console.log('    >>> 建议水量单位:', amountUnit)
    console.log('    >>> dose slider 单位:', sliderUnit)

    // Assertion
    let aligned = false
    if (!amountUnit || !sliderUnit) {
      console.log('\n⚠ 无法确定单位')
      // Print all texts for debugging
      console.log('=== 页面全部文本 ===')
      for (const t of allResultTexts) {
        console.log('  ', t)
      }
    } else if (amountUnit === sliderUnit) {
      console.log(`\n✅ 单位对齐！建议水量与 dose slider 均使用「${amountUnit}」`)
      aligned = true
    } else {
      console.log(`\n❌ 单位不匹配！建议水量=${amountUnit}, slider=${sliderUnit}`)
    }

    console.log('\n=== 最终结果 ===')
    console.log('单位对齐:', aligned ? '✅ PASS' : '❌ FAIL')

    await mp.screenshot({ path: `${SCREENSHOT_DIR}/04-final.png` })
    await mp.disconnect()
    process.exit(aligned ? 0 : 1)

  } finally {
    await mp.disconnect()
  }
})().catch(err => {
  console.error('\n=== 异常 ===')
  console.error(err)
  process.exit(1)
})
