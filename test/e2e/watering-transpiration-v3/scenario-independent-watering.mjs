'use strict'

/**
 * 独立浇水场景 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * P0-1: 点击 next-button 后等待 pot-profile-editor-sheet 自动打开，不再点击背后的 edit 按钮；
 *   尝试 PotCanvas 真实 touch 输入尺寸，automator 不支持 touch 时返回 BLOCKED_ENV。
 * P1: 结果区 allowlist 限定到第3个 swiper-item，不把前两步元素加入 allowlist。
 */

import { reLaunchTo } from './lib/automator-client.mjs'
import {
  installRequestCapture,
  readCapturedRequests,
  clearCapturedRequests,
  restoreRequest,
  findRequestByUrl,
  collectRequestsByUrl
} from './lib/request-capture.mjs'
import { safeScreenshot } from './lib/screenshot.mjs'
import {
  recordPage,
  recordPageData,
  recordRequests,
  recordAssertion,
  recordScreenshot,
  setClassification
} from './lib/reporter.mjs'
import {
  findViewById,
  findByIdPrefix,
  waitForElement,
  tapById,
  inputById,
  readTextById,
  readPageDataSummary
} from './lib/element-helpers.mjs'

const ADVISOR_PAGE = '/pages/watering-advisor/watering-advisor'
const ADVISOR_API = '/watering-advisor'

const FORBIDDEN_TEXT_PATTERNS = [
  { name: '日期', regex: /\d{4}-\d{2}-\d{2}|下次浇水日期|nextWaterDate/i },
  { name: '间隔', regex: /间隔|interval|天浇一次/i },
  { name: '盆土判断', regex: /盆土|土壤|干湿|moisture/i },
  { name: '光照', regex: /光照|阳光|facing|windowType/i },
  { name: '蒸腾', regex: /蒸腾|transpiration/i },
  { name: '植物名', regex: /龟背竹|绿萝|吊兰|发财树|monstera|pothos|spider/i },
  { name: '策略标签', regex: /策略|strategy|见干浇透|BASELINE|WET|DRY/i },
  { name: '瓶/桶换算', regex: /瓶|桶|bottle|bucket/i },
  { name: '水滴图标', regex: /💧|水滴/ }
]

export async function runIndependentWateringScenario(mp, report, artifactDir) {
  try {
    await installRequestCapture(mp)
    await clearCapturedRequests(mp)
    recordPage(report, ADVISOR_PAGE)
    const page = await reLaunchTo(mp, ADVISOR_PAGE)
    await sleep(1500)
    recordPageData(report, ADVISOR_PAGE, await readPageDataSummary(mp))
    recordScreenshot(report, await safeScreenshot(mp, artifactDir, 'independent-01-init'))

    const searchInput = await waitForElement(page, 'watering-advisor-search-input', 5000)
    recordAssertion(report, '搜索输入框存在', !!searchInput)
    if (!searchInput) {
      setClassification(report, 'BLOCKED_ENV', 'watering-advisor-search-input 未找到')
      return 'BLOCKED_ENV'
    }
    try {
      await inputById(page, 'watering-advisor-search-input', '')
    } catch (e) {}
    await sleep(1000)

    const plantItem = await findByIdPrefix(page, 'watering-advisor-plant-item-')
    recordAssertion(report, '植物列表至少有一个条目', !!plantItem)
    if (!plantItem) {
      setClassification(report, 'BLOCKED_FIXTURE', '未找到 watering-advisor-plant-item-{id}')
      return 'BLOCKED_FIXTURE'
    }
    await plantItem.element.tap()
    await sleep(800)
    recordScreenshot(report, await safeScreenshot(mp, artifactDir, 'independent-02-plant-selected'))

    // 点击 next-button（goToPotProfile 自动打开 PotProfileEditor）
    const nextButton = await waitForElement(page, 'watering-advisor-next-button', 5000)
    recordAssertion(report, '下一步按钮存在', !!nextButton)
    if (!nextButton) {
      setClassification(report, 'BLOCKED_ENV', 'watering-advisor-next-button 未找到')
      return 'BLOCKED_ENV'
    }
    await tapById(page, 'watering-advisor-next-button')
    await sleep(1500)

    // P0-1: 等待 pot-profile-editor-sheet 自动打开，不点击背后的 edit 按钮
    const potEditorSheet = await waitForElement(page, 'pot-profile-editor-sheet', 5000)
    recordAssertion(
      report,
      '盆型编辑器 pot-profile-editor-sheet 自动打开',
      !!potEditorSheet,
      potEditorSheet ? 'found' : 'not found'
    )
    recordScreenshot(
      report,
      await safeScreenshot(mp, artifactDir, 'independent-03-pot-editor-opened')
    )
    if (!potEditorSheet) {
      setClassification(report, 'BLOCKED_ENV', 'PotProfileEditor 未自动打开')
      return 'BLOCKED_ENV'
    }

    // P0-1: 尝试 PotCanvas 真实 touch/drag 输入盆型尺寸
    // PotCanvas 把手使用 @touchstart/@touchmove/@touchend on <view>
    // miniprogram-automator 0.12.1 仅支持 tap/input/text/attribute/evaluate/page.data/page.callMethod
    const touchCap = await assessTouchCapability(mp, page)
    recordAssertion(
      report,
      'automator 支持真实 touch/drag 事件以驱动 PotCanvas 把手',
      touchCap.available,
      touchCap.detail
    )
    if (!touchCap.available) {
      setClassification(
        report,
        'BLOCKED_ENV',
        'miniprogram-automator 不支持 touchstart/touchmove/touchend，' +
          '无法通过真实 UI 操作驱动 PotCanvas 把手输入盆型尺寸（potTopDiameterCm/potHeightCm）。' +
          'goToResult() 要求尺寸非空，但唯一输入途径是 PotCanvas touch 把手。' +
          `实际检测结果: ${touchCap.detail}。` +
          '所需自动化表面：element.touch(start/move/end) 或 mp.swipe/drag API。' +
          '不得 page.callMethod、不得直接改 Vue/page data、不得造后端 payload、不得擅自修改 src/**。'
      )
      return 'BLOCKED_ENV'
    }

    // touch 可用时：通过 PotCanvas 把手输入尺寸后保存（当前 automator 不可达此路径）
    const filled = await fillPotProfileViaTouch(mp, page, touchCap)
    recordAssertion(report, '通过 PotCanvas 真实 touch 输入有效盆型尺寸', filled)
    if (!filled) {
      setClassification(report, 'BLOCKED_ENV', 'PotCanvas touch 未能设置有效尺寸')
      return 'BLOCKED_ENV'
    }
    await tapById(page, 'pot-profile-editor-confirm-button')
    await sleep(1000)
    const editorStillOpen = await findViewById(page, 'pot-profile-editor-sheet')
    recordAssertion(report, '盆型编辑器已关闭', !editorStillOpen)

    const potSummary = await mp
      .evaluate(() => {
        const pages = getCurrentPages()
        const vm = pages[pages.length - 1]?.$vm
        return vm?.potProfileSummary || vm?.editorSummary || null
      })
      .catch(() => null)
    recordAssertion(
      report,
      '页面盆型摘要不再是未填写状态',
      !!potSummary && !/未填写|暂无|empty/i.test(potSummary)
    )
    recordScreenshot(
      report,
      await safeScreenshot(mp, artifactDir, 'independent-04-pot-profile-completed')
    )

    // 点击获取建议按钮
    const computeButton = await waitForElement(page, 'watering-advisor-compute-button', 5000)
    recordAssertion(report, '获取建议按钮存在', !!computeButton)
    if (!computeButton) {
      setClassification(report, 'BLOCKED_ENV', 'watering-advisor-compute-button 未找到')
      return 'BLOCKED_ENV'
    }
    await clearCapturedRequests(mp)
    await tapById(page, 'watering-advisor-compute-button')
    await sleep(4000)

    const requests = await readCapturedRequests(mp)
    recordRequests(report, requests)
    const computeRequest = findRequestByUrl(requests, ADVISOR_API, 'POST')
    recordAssertion(
      report,
      '捕获到 /watering-advisor POST wx.request',
      !!computeRequest,
      computeRequest ? `url=${computeRequest.url}` : 'not found'
    )
    if (!computeRequest) {
      setClassification(report, 'FAIL_PRODUCT', '未捕获到 /watering-advisor POST')
      return 'FAIL_PRODUCT'
    }

    const httpResponse = computeRequest.response
    const httpWrapperOk =
      httpResponse?.statusCode === 200 &&
      httpResponse.data &&
      typeof httpResponse.data === 'object' &&
      httpResponse.data.data !== undefined
    recordAssertion(report, 'HTTP 包装层 response.data.data 存在', httpWrapperOk)
    if (!httpWrapperOk) {
      setClassification(report, 'FAIL_PRODUCT', 'HTTP 包装层不完整')
      return 'FAIL_PRODUCT'
    }

    const businessData = httpResponse.data.data
    if (businessData === null) {
      setClassification(report, 'FAIL_PRODUCT', '/watering-advisor 响应 data 为 null')
      return 'FAIL_PRODUCT'
    }

    const dataKeys = Object.keys(businessData).sort()
    const keysMatch = JSON.stringify(dataKeys) === JSON.stringify(['amountRangeMl'])
    recordAssertion(
      report,
      '响应 data 业务 key 精确等于 ["amountRangeMl"]',
      keysMatch,
      `actual=${JSON.stringify(dataKeys)}`
    )

    // 结果区三个稳定 ID
    const resultEl = await waitForElement(page, 'watering-advisor-result-amount', 5000)
    recordAssertion(report, '结果区 result-amount 存在', !!resultEl)
    const back2El = await findViewById(page, 'watering-advisor-back-2')
    recordAssertion(report, '结果区 back-2 存在', !!back2El)
    const doneEl = await findViewById(page, 'watering-advisor-done')
    recordAssertion(report, '结果区 done 存在', !!doneEl)

    if (resultEl) {
      const resultText = await readTextById(page, 'watering-advisor-result-amount')
      recordAssertion(report, '结果区文本存在', !!resultText && resultText.length > 0)
      if (resultText) {
        recordAssertion(
          report,
          '结果文本表达建议毫升数',
          /ml|毫升/i.test(resultText),
          `text=${JSON.stringify(resultText)}`
        )
        for (const { name, regex } of FORBIDDEN_TEXT_PATTERNS) {
          const matched = regex.test(resultText)
          recordAssertion(report, `结果文本不展示${name}`, !matched)
        }
      }
    }

    // P1: 结果区 allowlist 限定到第3个 swiper-item，不把前两步元素加入 allowlist
    const resultArea = await collectResultAreaInfo(page)
    const allowedIds = new Set([
      'watering-advisor-result-amount',
      'watering-advisor-back-2',
      'watering-advisor-done',
      'watering-advisor-empty-retry'
    ])

    if (resultArea.ids.length > 0) {
      const unexpected = resultArea.ids.filter(id => !allowedIds.has(id))
      recordAssertion(
        report,
        '结果区（第3个 swiper-item）不包含非 allowlist 元素',
        unexpected.length === 0,
        unexpected.length ? `unexpected=${JSON.stringify(unexpected)}` : 'clean'
      )
      if (resultArea.texts.length > 0) {
        const allowedTexts = [
          /^[\d\s\-~]+ml$/i,
          /^[\d\s\-~]+毫升$/,
          /^重新输入$/,
          /^完成$/,
          /^暂无建议结果$/,
          /^返回重新输入$/,
          /^正在计算浇水建议\.\.\.$/
        ]
        const unexpectedTexts = resultArea.texts.filter(t => !allowedTexts.some(p => p.test(t)))
        recordAssertion(
          report,
          '结果区可见文本只包含允许的毫升数和按钮文案',
          unexpectedTexts.length === 0,
          unexpectedTexts.length ? `unexpected=${JSON.stringify(unexpectedTexts)}` : 'clean'
        )
      }
    } else {
      // automator 无法取得可见结果区域文本，只验证三个稳定 ID
      recordAssertion(
        report,
        '结果区三个稳定 ID 同时存在（fallback：仅验证 ID，由截图交给 QA 对比）',
        !!resultEl && !!back2El && !!doneEl
      )
    }

    const screenshotResult = await safeScreenshot(mp, artifactDir, 'independent-05-result')
    recordScreenshot(report, screenshotResult)
    recordAssertion(report, '结果页截图成功保存', !!screenshotResult)
    if (!screenshotResult) {
      setClassification(report, 'BLOCKED_ENV', '结果页截图失败，UI 验收证据缺失')
      return 'BLOCKED_ENV'
    }

    const failed = report.assertions.filter(a => !a.passed)
    if (failed.length === 0) {
      setClassification(report, 'PASS')
      return 'PASS'
    }
    setClassification(
      report,
      'FAIL_PRODUCT',
      `${failed.length} assertions failed: ${failed.map(a => a.name).join(', ')}`
    )
    return 'FAIL_PRODUCT'
  } catch (error) {
    setClassification(report, 'FAIL_PRODUCT', `unexpected error: ${error?.message || error}`)
    return 'FAIL_PRODUCT'
  } finally {
    await restoreRequest(mp)
  }
}

/**
 * 评估 automator 是否支持真实 touch/drag 事件以驱动 PotCanvas 把手。
 * PotCanvas 把手使用 @touchstart/@touchmove/@touchend on <view>。
 * miniprogram-automator 0.12.1 仅支持 tap/input/text/attribute/evaluate/page.data/page.callMethod。
 *
 * 真实异步检查 #potCanvas 元素及可用的 element 级方法，不硬编码 false。
 */
async function assessTouchCapability(mp, page) {
  const checks = [
    { name: 'mp.touch', exists: typeof mp.touch === 'function' },
    { name: 'mp.swipe', exists: typeof mp.swipe === 'function' },
    { name: 'mp.drag', exists: typeof mp.drag === 'function' }
  ]

  // 真实异步检查 #potCanvas 元素及可用方法
  let canvasFound = false
  const canvasMethodDetails = []
  try {
    const canvas = await page.$('#potCanvas')
    if (canvas) {
      canvasFound = true
      const methodNames = ['touch', 'swipe', 'drag', 'tap', 'trigger', 'callMethod']
      for (const m of methodNames) {
        const hasMethod = typeof canvas[m] === 'function'
        canvasMethodDetails.push(`${m}=${hasMethod}`)
        if (hasMethod && (m === 'touch' || m === 'swipe' || m === 'drag')) {
          checks.push({ name: `element.${m}`, exists: true })
        }
      }
    } else {
      canvasMethodDetails.push('potCanvas element not found')
    }
  } catch (e) {
    canvasMethodDetails.push(`error=${e?.message || e}`)
  }

  // 如果 element 级没有 touch/swipe/drag，记录实际检测结果
  const hasElementTouch = checks.some(c => c.name.startsWith('element.') && c.exists)
  if (!hasElementTouch) {
    checks.push({ name: 'element.touch/swipe/drag', exists: false })
  }

  const anyAvailable = checks.some(c => c.exists)
  const detail = [
    ...checks.map(c => `${c.name}=${c.exists}`),
    `potCanvasFound=${canvasFound}`,
    `canvasMethods=[${canvasMethodDetails.join(', ')}]`
  ].join(', ')

  return { available: anyAvailable, detail, checks, canvasFound, canvasMethodDetails }
}

/**
 * 通过 PotCanvas 真实 touch 输入盆型尺寸。
 * 当前 automator 不支持 touch，此函数仅在 touch 可用时才会被调用。
 */
async function fillPotProfileViaTouch(mp, page, touchCap) {
  try {
    const canvas = await page.$('#potCanvas')
    if (!canvas) return false
    // 检查 element 级 touch API
    if (typeof canvas.touch === 'function' || typeof canvas.swipe === 'function') {
      // 未来实现：通过 canvas touch/swipe 驱动把手设置直径和高度
      // 直径范围 10-100cm，高度范围 10-50cm
      return false
    }
    // 检查 mp 级 touch API
    if (typeof mp.touch === 'function' || typeof mp.swipe === 'function') {
      // 未来实现：通过 mp.touch/swipe 驱动把手
      return false
    }
  } catch (e) {}
  return false
}

/**
 * 收集第3个 swiper-item（结果区）内的元素 ID 和可见文本。
 * 如果 automator 无法查询 swiper-item 内部元素，返回空数组。
 */
async function collectResultAreaInfo(page) {
  const ids = []
  const texts = []
  try {
    const swiperItems = await page.$$('swiper-item')
    if (!swiperItems || swiperItems.length < 3) return { ids, texts }
    const resultItem = swiperItems[2]
    if (!resultItem || typeof resultItem.$$ !== 'function') return { ids, texts }
    const elements = [...(await resultItem.$$('view')), ...(await resultItem.$$('button'))]
    for (const el of elements) {
      try {
        const id = await el.attribute('id')
        if (id && id.startsWith('watering-advisor-')) ids.push(id)
      } catch (e) {}
      try {
        const text = await el.text()
        if (text && text.trim().length > 0) texts.push(text.trim())
      } catch (e) {}
    }
  } catch (e) {}
  return { ids, texts }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
