'use strict'

/**
 * 独立浇水场景 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 场景：通过真实页面交互完成独立浇水建议计算。
 *
 * 步骤：
 *   1. reLaunch 到 /pages/watering-advisor/watering-advisor
 *   2. 在搜索输入框输入植物名（或直接读取可见植物列表）
 *   3. 从运行时可见的植物列表动态选择一个条目（不硬编码 plantId）
 *   4. 点击下一步按钮
 *   5. 点击获取建议按钮触发计算
 *   6. 捕获 /watering-advisor 的真实 wx.request
 *   7. 断言响应 data 的业务字段只有 amountRangeMl
 *   8. 断言结果区 watering-advisor-result-amount 存在且文本只表达建议毫升数
 *   9. 结果区不得展示日期、间隔、盆土判断、光照、蒸腾、植物名、策略标签、瓶/桶换算或水滴图标
 *  10. 保存结果页截图
 *
 * 使用的稳定 ID（来自 frontend-automation-id-policy.md 第 3.10 节）：
 *   - watering-advisor-search-input
 *   - watering-advisor-plant-item-{id}
 *   - watering-advisor-next-button
 *   - watering-advisor-compute-button
 *   - watering-advisor-result-amount
 *   - watering-advisor-back-2
 *   - watering-advisor-done
 */

import path from 'node:path'
import { reLaunchTo, safeDisconnect } from './lib/automator-client.mjs'
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

/**
 * 运行独立浇水场景。
 *
 * @param {object} mp - miniProgram 实例
 * @param {object} report - 报告对象
 * @param {string} artifactDir - 截图保存目录
 * @returns {Promise<string>} classification
 */
export async function runIndependentWateringScenario(mp, report, artifactDir) {
  let classification = 'FAIL_PRODUCT'
  try {
    await installRequestCapture(mp)
    await clearCapturedRequests(mp)

    recordPage(report, ADVISOR_PAGE)
    const page = await reLaunchTo(mp, ADVISOR_PAGE)
    await sleep(1500)

    const pageSummary = await readPageDataSummary(mp)
    recordPageData(report, ADVISOR_PAGE, pageSummary)

    const screenshotInit = await safeScreenshot(mp, artifactDir, 'independent-01-init')
    recordScreenshot(report, screenshotInit)

    // 步骤 1：搜索植物（使用稳定 ID，不硬编码 plantId）
    const searchInput = await waitForElement(page, 'watering-advisor-search-input', 5000)
    recordAssertion(
      report,
      '搜索输入框 watering-advisor-search-input 存在',
      !!searchInput,
      searchInput ? 'found' : 'not found'
    )
    if (!searchInput) {
      setClassification(
        report,
        'BLOCKED_ENV',
        'watering-advisor-search-input 未找到，页面可能未正确加载'
      )
      return 'BLOCKED_ENV'
    }

    // 输入通用关键词触发搜索（空字符串可能返回全部）
    try {
      await inputById(page, 'watering-advisor-search-input', '')
    } catch (e) {}
    await sleep(1000)

    // 步骤 2：从运行时可见的植物列表动态选择一个条目
    const plantItem = await findByIdPrefix(page, 'watering-advisor-plant-item-')
    recordAssertion(
      report,
      '植物列表至少有一个 watering-advisor-plant-item-{id}',
      !!plantItem,
      plantItem ? `selected ${plantItem.id}` : 'no plant item found'
    )
    if (!plantItem) {
      setClassification(
        report,
        'BLOCKED_FIXTURE',
        '运行时未找到任何 watering-advisor-plant-item-{id}，无法选择植物种类'
      )
      return 'BLOCKED_FIXTURE'
    }

    await plantItem.element.tap()
    await sleep(800)

    const screenshotSelected = await safeScreenshot(
      mp,
      artifactDir,
      'independent-02-plant-selected'
    )
    recordScreenshot(report, screenshotSelected)

    // 步骤 3：点击下一步按钮
    const nextButton = await waitForElement(page, 'watering-advisor-next-button', 5000)
    recordAssertion(
      report,
      '下一步按钮 watering-advisor-next-button 存在',
      !!nextButton,
      nextButton ? 'found' : 'not found'
    )
    if (!nextButton) {
      setClassification(
        report,
        'BLOCKED_ENV',
        'watering-advisor-next-button 未找到，无法进入盆型输入步骤'
      )
      return 'BLOCKED_ENV'
    }
    await tapById(page, 'watering-advisor-next-button')
    await sleep(1000)

    // 步骤 4：点击获取建议按钮触发计算
    const computeButton = await waitForElement(page, 'watering-advisor-compute-button', 5000)
    recordAssertion(
      report,
      '获取建议按钮 watering-advisor-compute-button 存在',
      !!computeButton,
      computeButton ? 'found' : 'not found'
    )
    if (!computeButton) {
      setClassification(
        report,
        'BLOCKED_ENV',
        'watering-advisor-compute-button 未找到，无法触发计算'
      )
      return 'BLOCKED_ENV'
    }

    await clearCapturedRequests(mp)
    await tapById(page, 'watering-advisor-compute-button')

    // 等待计算完成 + 请求发出
    await sleep(3000)

    // 步骤 5：捕获 /watering-advisor 的真实 wx.request
    const requests = await readCapturedRequests(mp)
    recordRequests(report, requests)
    const advisorRequests = collectRequestsByUrl(requests, ADVISOR_API)
    const computeRequest = findRequestByUrl(requests, ADVISOR_API, 'POST')

    recordAssertion(
      report,
      '捕获到 /watering-advisor POST wx.request',
      !!computeRequest,
      computeRequest
        ? `url=${computeRequest.url}, method=${computeRequest.method}`
        : `no /watering-advisor POST in ${advisorRequests.length} advisor requests`
    )
    if (!computeRequest) {
      setClassification(
        report,
        'FAIL_PRODUCT',
        '未捕获到 /watering-advisor POST wx.request，计算请求未发出或拦截失败'
      )
      return 'FAIL_PRODUCT'
    }

    // 步骤 6：断言响应 data 的业务字段只有 amountRangeMl
    const responseData = computeRequest.response?.data
    const responseOk =
      computeRequest.response?.statusCode === 200 &&
      responseData &&
      typeof responseData === 'object'
    recordAssertion(
      report,
      '/watering-advisor 响应 statusCode=200 且 data 为对象',
      responseOk,
      `statusCode=${computeRequest.response?.statusCode}, dataType=${typeof responseData}`
    )

    if (responseOk && responseData.data) {
      const dataKeys = Object.keys(responseData.data).sort()
      const expectedKeys = ['amountRangeMl']
      const keysMatch = JSON.stringify(dataKeys) === JSON.stringify(expectedKeys)
      recordAssertion(
        report,
        '响应 data 字段精确为 ["amountRangeMl"]',
        keysMatch,
        `actual keys=${JSON.stringify(dataKeys)}`
      )
    } else if (responseOk && responseData.data === null) {
      recordAssertion(report, '响应 data 为 null（无建议）', false, 'data=null，计算可能失败')
    }

    // 步骤 7：断言结果区 watering-advisor-result-amount 存在
    const resultEl = await waitForElement(page, 'watering-advisor-result-amount', 5000)
    recordAssertion(
      report,
      '结果区 watering-advisor-result-amount 存在',
      !!resultEl,
      resultEl ? 'found' : 'not found'
    )

    if (resultEl) {
      const resultText = await readTextById(page, 'watering-advisor-result-amount')
      recordAssertion(report, '结果区文本存在', !!resultText, `text=${JSON.stringify(resultText)}`)

      if (resultText) {
        // 步骤 8：断言文本只表达建议毫升数
        const hasMl = /ml|毫升/i.test(resultText)
        recordAssertion(
          report,
          '结果文本表达建议毫升数',
          hasMl,
          `text=${JSON.stringify(resultText)}`
        )

        // 步骤 9：结果区不得展示日期、间隔、盆土判断、光照、蒸腾、植物名、策略标签、瓶/桶换算或水滴图标
        const forbiddenPatterns = [
          { name: '日期', regex: /\d{4}-\d{2}-\d{2}|下次浇水日期|nextWaterDate/i },
          { name: '间隔', regex: /间隔|interval|天浇一次/i },
          { name: '盆土判断', regex: /盆土|土壤|干湿|moisture/i },
          { name: '光照', regex: /光照|阳光|facing|windowType/i },
          { name: '蒸腾', regex: /蒸腾|transpiration/i },
          {
            name: '植物名',
            regex: /龟背竹|绿萝|吊兰|发财树|monstera|pothos|spider/i
          },
          { name: '策略标签', regex: /策略|strategy|见干浇透|BASELINE|WET|DRY/i },
          { name: '瓶/桶换算', regex: /瓶|桶|bottle|bucket/i },
          { name: '水滴图标', regex: /💧|水滴/ }
        ]
        for (const { name, regex } of forbiddenPatterns) {
          const matched = regex.test(resultText)
          recordAssertion(
            report,
            `结果文本不展示${name}`,
            !matched,
            matched ? `matched ${regex} in ${JSON.stringify(resultText)}` : 'clean'
          )
        }
      }
    }

    const screenshotResult = await safeScreenshot(mp, artifactDir, 'independent-03-result')
    recordScreenshot(report, screenshotResult)

    // 根据断言结果决定 classification
    const failedAssertions = report.assertions.filter(a => !a.passed)
    if (failedAssertions.length === 0) {
      setClassification(report, 'PASS')
      classification = 'PASS'
    } else {
      setClassification(
        report,
        'FAIL_PRODUCT',
        `${failedAssertions.length} assertions failed: ${failedAssertions.map(a => a.name).join(', ')}`
      )
      classification = 'FAIL_PRODUCT'
    }
    return classification
  } catch (error) {
    setClassification(report, 'FAIL_PRODUCT', `unexpected error: ${error?.message || error}`)
    return 'FAIL_PRODUCT'
  } finally {
    await restoreRequest(mp)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
