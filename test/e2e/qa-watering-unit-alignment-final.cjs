const { createRequire } = require('module')
const automator = require('miniprogram-automator')

const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  console.log('=== 龟背竹浇水单位对齐验证 ===\n')
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })

  try {
    // Open reminder sheet
    await mp.reLaunch('/pages/index/index')
    await sleep(3)
    const page = await mp.currentPage()

    // Tap 龟背竹 water button (plant id=14)
    const buttons = await page.$$('button')
    for (const btn of buttons) {
      const id = await btn.attribute('id')
      if (id && id.includes('plant-card-reminder-14-water')) {
        await btn.tap()
        break
      }
    }
    await sleep(3)

    // Open date picker via "上次浇水" text
    const texts = await page.$$('text')
    for (const t of texts) {
      const txt = await t.text()
      if (txt && txt.includes('上次浇水')) {
        await t.tap()
        break
      }
    }
    await sleep(5) // wait for weather + timeline

    // Select a date to trigger dose slider
    const pickerTexts = await page.$$('text')
    for (const t of pickerTexts) {
      const txt = await t.text()
      if (txt && txt.trim() === '28') {
        await t.tap()
        break
      }
    }
    await sleep(2)

    // Read dose slider unit
    let sliderUnit = null
    let doseRefText = null
    const sliderTexts = await page.$$('text')
    for (const t of sliderTexts) {
      const txt = await t.text()
      if (!txt || !txt.trim()) continue
      if (txt.includes('参照')) {
        doseRefText = txt.trim()
        sliderUnit = txt.includes('油桶') ? '桶' : '瓶'
      }
    }

    // Confirm to trigger planner
    const btns = await page.$$('button')
    for (const btn of btns) {
      const text = await btn.text()
      if (text && text.includes('确认')) {
        await btn.tap()
        break
      }
    }
    await sleep(6)

    // Read result texts
    const resultTexts = await page.$$('text')
    let amountText = null
    let amountUnit = null
    let doseEchoText = null
    let doseEchoUnit = null
    let allTexts = []
    let nextIsAmount = false
    let nextIsDoseEcho = false
    for (const t of resultTexts) {
      const txt = await t.text()
      if (!txt || !txt.trim()) continue
      const trimmed = txt.trim()
      allTexts.push(trimmed)
      if (trimmed === '建议水量') { nextIsAmount = true; continue }
      if (trimmed === '你通常浇') { nextIsDoseEcho = true; continue }
      if (nextIsAmount && trimmed.match(/^约/)) {
        amountText = trimmed
        amountUnit = trimmed.includes('桶') ? '桶' : '瓶'
        nextIsAmount = false
      }
      if (nextIsDoseEcho && trimmed.match(/^约/)) {
        doseEchoText = trimmed
        doseEchoUnit = trimmed.includes('桶') ? '桶' : '瓶'
        nextIsDoseEcho = false
      }
    }

    console.log('dose slider 参照:', doseRefText)
    console.log('dose slider 单位:', sliderUnit)
    console.log('建议水量:', amountText, '->', amountUnit)
    console.log('你通常浇:', doseEchoText, '->', doseEchoUnit)

    // Assert all three aligned
    const units = [sliderUnit, amountUnit, doseEchoUnit].filter(Boolean)
    const allAligned = units.length > 0 && units.every(u => u === units[0])

    console.log('\n=== 页面文本 ===')
    for (const t of allTexts) console.log('  ', t)

    console.log('\n=== 结果 ===')
    console.log('单位对齐:', allAligned ? '✅ PASS' : '❌ FAIL')

    await mp.screenshot({ path: '/tmp/qa-screenshots/final-reverted.png' })
    await mp.disconnect()
    process.exit(allAligned ? 0 : 1)
  } finally {
    await mp.disconnect()
  }
})().catch(e => { console.error(e); process.exit(1) })
