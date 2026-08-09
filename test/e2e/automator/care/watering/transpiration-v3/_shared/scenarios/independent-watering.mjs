'use strict'

/**
 * 独立浇水场景 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * P0-1: 点击 next-button 后验证独立建议页的 inline 盆型表单已进入当前步骤。
 * P1: 结果区 allowlist 限定到第3个 swiper-item，不把前两步元素加入 allowlist。
 */

import { reLaunchTo } from '../lib/automator-client.mjs'
import {
  installRequestCapture,
  readCapturedRequests,
  clearCapturedRequests,
  restoreRequest,
  findRequestByUrl
} from '../lib/request-capture.mjs'
import { safeScreenshot } from '../lib/screenshot.mjs'
import {
  recordPage,
  recordPageData,
  recordRequests,
  recordAssertion,
  recordScreenshot,
  setClassification
} from '../lib/reporter.mjs'
import {
  findViewById,
  findByIdPrefix,
  waitForElement,
  tapById,
  inputById,
  readTextById,
  readPageDataSummary
} from '../lib/element-helpers.mjs'

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
  { name: '水滴图标', regex: /💧|水滴/ }
]

const REQUIRED_ADVISOR_FIELDS = [
  'action',
  'airEnvironmentAudit',
  'amountRangeMl',
  'confidenceLevel',
  'nextWaterDate',
  'nextWaterReason',
  'nextWaterWindow',
  'reasonCodes',
  'seasonalIntervalFactor',
  'soilCheck',
  'stopCondition',
  'todayWeatherReason',
  'todayWeatherSource',
  'transpirationIntervalFactor',
  'wateringContext'
]

export async function runIndependentWateringScenario(mp, report, artifactDir) {
  try {
    await installRequestCapture(mp)
    await clearCapturedRequests(mp)
    recordPage(report, ADVISOR_PAGE)
    let page = await reLaunchTo(mp, ADVISOR_PAGE)
    await sleep(1500)
    recordPageData(report, ADVISOR_PAGE, await readPageDataSummary(mp))
    recordScreenshot(report, await safeScreenshot(mp, artifactDir, 'independent-01-init'))
    page = await mp.currentPage()

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
    page = await mp.currentPage()

    // 点击 next-button，独立建议页直接切换到 inline 盆型步骤。
    const nextButton = await waitForElement(page, 'watering-advisor-next-button', 5000)
    recordAssertion(report, '下一步按钮存在', !!nextButton)
    if (!nextButton) {
      setClassification(report, 'BLOCKED_ENV', 'watering-advisor-next-button 未找到')
      return 'BLOCKED_ENV'
    }
    await tapById(page, 'watering-advisor-next-button')
    await sleep(1500)

    const potSubstrateOption = await waitForElement(
      page,
      'watering-advisor-pot-profile-substrate-general',
      5000
    )
    const potDrainageOption = await waitForElement(
      page,
      'watering-advisor-pot-profile-drainage-true',
      5000
    )
    recordAssertion(
      report,
      'inline 盆型表单已进入当前步骤',
      !!potSubstrateOption,
      potSubstrateOption ? 'found' : 'not found'
    )
    recordAssertion(
      report,
      'inline 盆型排水孔选项存在',
      !!potDrainageOption,
      potDrainageOption ? 'found' : 'not found'
    )
    recordScreenshot(
      report,
      await safeScreenshot(mp, artifactDir, 'independent-03-pot-editor-opened')
    )
    page = await mp.currentPage()
    if (!potSubstrateOption || !potDrainageOption) {
      setClassification(report, 'BLOCKED_ENV', 'inline 盆型表单未进入当前步骤')
      return 'BLOCKED_ENV'
    }
    recordScreenshot(
      report,
      await safeScreenshot(mp, artifactDir, 'independent-04-pot-profile-completed')
    )
    page = await mp.currentPage()

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

    const missingFields = REQUIRED_ADVISOR_FIELDS.filter(field => !(field in businessData))
    recordAssertion(
      report,
      '响应 data 包含独立建议所需业务字段',
      missingFields.length === 0,
      missingFields.length ? `missing=${JSON.stringify(missingFields)}` : 'required fields present'
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
