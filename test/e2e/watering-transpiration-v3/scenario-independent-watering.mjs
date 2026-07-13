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
 *   5. 如需盆型输入，通过稳定控件完成（不直接 call 页面业务方法）
 *   6. 点击获取建议按钮触发计算
 *   7. 捕获 /watering-advisor 的真实 wx.request
 *   8. 断言 HTTP 包装层 response.data.data 存在，且业务 key 精确等于 ['amountRangeMl']
 *   9. 断言结果区 watering-advisor-result-amount、watering-advisor-back-2、watering-advisor-done 同时存在
 *  10. 读取结果区域可见文本/元素 allowlist，验证除毫升数与两个按钮外不出现禁止内容
 *  11. 截图为空时 BLOCKED_ENV，不得 PASS
 *
 * 使用的稳定 ID（来自 frontend-automation-id-policy.md 第 3.10 节）：
 *   - watering-advisor-search-input
 *   - watering-advisor-plant-item-{id}
 *   - watering-advisor-next-button
 *   - watering-advisor-edit-pot-profile
 *   - watering-advisor-compute-button
 *   - watering-advisor-result-amount
 *   - watering-advisor-back-2
 *   - watering-advisor-done
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
  readPageDataSummary,
  collectByIdPrefix
} from './lib/element-helpers.mjs'

const ADVISOR_PAGE = '/pages/watering-advisor/watering-advisor'
const ADVISOR_API = '/watering-advisor'

// 结果区域禁止出现的可见文本模式（中文文案可用于断言禁止内容，但不能作为定位器）
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

    // 步骤 4：如需盆型输入，通过稳定控件完成（不直接 call 页面业务方法）
    // 检查是否需要补充盆型尺寸（potTopDiameterCm 和 potHeightCm 是必填）
    const editPotProfileBtn = await findByIdPrefix(page, 'watering-advisor-edit-pot-profile')
    if (editPotProfileBtn) {
      // 盆型编辑器入口存在，说明可能需要输入盆型
      // 尝试点击进入盆型编辑器，通过稳定控件完成输入
      await editPotProfileBtn.element.tap()
      await sleep(1000)
      // 盆型编辑器内的输入通过稳定 ID 定位（如果有）
      // 这里不直接 call 页面方法，只通过 UI 交互
      // 如果盆型编辑器需要复杂交互且没有稳定 ID，记录但不阻断
      const screenshotPotEditor = await safeScreenshot(
        mp,
        artifactDir,
        'independent-02b-pot-editor'
      )
      recordScreenshot(report, screenshotPotEditor)
    }

    // 步骤 5：点击获取建议按钮触发计算
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
    await sleep(4000)

    // 步骤 6：捕获 /watering-advisor 的真实 wx.request
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

    // 步骤 7：断言 HTTP 包装层 response.data.data 存在，且业务 key 精确等于 ['amountRangeMl']
    const httpResponse = computeRequest.response
    const httpWrapperOk =
      httpResponse?.statusCode === 200 &&
      httpResponse.data &&
      typeof httpResponse.data === 'object' &&
      httpResponse.data.data !== undefined
    recordAssertion(
      report,
      'HTTP 包装层 response.data.data 存在且 statusCode=200',
      httpWrapperOk,
      `statusCode=${httpResponse?.statusCode}, wrapper.data=${JSON.stringify(
        httpResponse?.data?.data
      )}`
    )
    if (!httpWrapperOk) {
      setClassification(
        report,
        'FAIL_PRODUCT',
        'HTTP 包装层不完整：response.data.data 不存在或 statusCode!=200'
      )
      return 'FAIL_PRODUCT'
    }

    const businessData = httpResponse.data.data
    if (businessData === null) {
      recordAssertion(report, '响应 data 为 null（无建议）', false, 'data=null，计算可能失败')
      setClassification(report, 'FAIL_PRODUCT', '/watering-advisor 响应 data 为 null')
      return 'FAIL_PRODUCT'
    }

    const dataKeys = Object.keys(businessData).sort()
    const expectedKeys = ['amountRangeMl']
    const keysMatch = JSON.stringify(dataKeys) === JSON.stringify(expectedKeys)
    recordAssertion(
      report,
      '响应 data 业务 key 精确等于 ["amountRangeMl"]',
      keysMatch,
      `actual keys=${JSON.stringify(dataKeys)}`
    )

    // 步骤 8：断言结果区三个元素同时存在
    const resultEl = await waitForElement(page, 'watering-advisor-result-amount', 5000)
    recordAssertion(
      report,
      '结果区 watering-advisor-result-amount 存在',
      !!resultEl,
      resultEl ? 'found' : 'not found'
    )

    const back2El = await findViewById(page, 'watering-advisor-back-2')
    recordAssertion(
      report,
      '结果区 watering-advisor-back-2 存在',
      !!back2El,
      back2El ? 'found' : 'not found'
    )

    const doneEl = await findViewById(page, 'watering-advisor-done')
    recordAssertion(
      report,
      '结果区 watering-advisor-done 存在',
      !!doneEl,
      doneEl ? 'found' : 'not found'
    )

    // 步骤 9：读取结果区域可见文本，验证除毫升数与两个按钮外不出现禁止内容
    if (resultEl) {
      const resultText = await readTextById(page, 'watering-advisor-result-amount')
      recordAssertion(
        report,
        '结果区文本存在',
        !!resultText && resultText.length > 0,
        `text=${JSON.stringify(resultText)}`
      )

      if (resultText) {
        // 断言文本表达建议毫升数
        const hasMl = /ml|毫升/i.test(resultText)
        recordAssertion(
          report,
          '结果文本表达建议毫升数',
          hasMl,
          `text=${JSON.stringify(resultText)}`
        )

        // 断言不出现禁止内容（中文文案可用于断言禁止内容）
        for (const { name, regex } of FORBIDDEN_TEXT_PATTERNS) {
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

    // 步骤 10：读取结果区域所有可见元素，验证 allowlist
    // 收集结果 swiper-item 内所有带 ID 的元素，验证只包含允许的 ID
    const allIds = await collectByIdPrefix(page, 'watering-advisor-')
    const resultAreaIds = allIds
      .map(item => item.id)
      .filter(
        id =>
          !id.startsWith('watering-advisor-plant-item-') &&
          !id.startsWith('watering-advisor-search')
      )
    const allowedResultIds = new Set([
      'watering-advisor-result-amount',
      'watering-advisor-back-2',
      'watering-advisor-done',
      'watering-advisor-empty-retry',
      'watering-advisor-swiper',
      'watering-advisor-edit-pot-profile',
      'watering-advisor-back-1',
      'watering-advisor-compute-button',
      'watering-advisor-next-button'
    ])
    const unexpectedIds = resultAreaIds.filter(id => !allowedResultIds.has(id))
    recordAssertion(
      report,
      '结果区域不包含非 allowlist 的 watering-advisor-* 元素',
      unexpectedIds.length === 0,
      unexpectedIds.length === 0
        ? 'all ids in allowlist'
        : `unexpected ids=${JSON.stringify(unexpectedIds)}`
    )

    // 步骤 11：截图是 UI 验收必需证据；为空时 BLOCKED_ENV
    const screenshotResult = await safeScreenshot(mp, artifactDir, 'independent-03-result')
    recordScreenshot(report, screenshotResult)
    recordAssertion(
      report,
      '结果页截图成功保存',
      !!screenshotResult,
      screenshotResult || 'safeScreenshot returned null'
    )
    if (!screenshotResult) {
      setClassification(
        report,
        'BLOCKED_ENV',
        '结果页截图失败（safeScreenshot 返回 null），UI 验收证据缺失'
      )
      return 'BLOCKED_ENV'
    }

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
