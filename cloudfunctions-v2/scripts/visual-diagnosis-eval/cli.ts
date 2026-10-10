import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { createBailianProvider } from './bailian-provider.js'
import {
  extractPrefixFromDraft,
  resolveLocalImageRef,
  runEvaluation,
  type EvalCase,
  type EvalProvider,
  type PriceSnapshot
} from './eval-core.js'

/**
 * 视觉诊断离线评测命令行入口。默认 dry-run，只估算 token 与费用；加 --apply 才调用百炼。
 *
 * 运行方式（Node 内置 + 已有开发依赖 esbuild 打包，不新增依赖）：
 *   npx esbuild scripts/visual-diagnosis-eval/cli.ts --bundle --platform=node --format=esm \
 *     --outfile=<临时目录>/visual-diagnosis-eval.mjs
 *   node <临时目录>/visual-diagnosis-eval.mjs --cases cases.json \
 *     --prefix-draft models/diagnosis/visual-diagnosis-prompt.v1.draft.md \
 *     --price-snapshot ../docs/backend-v2/diagnosis-eval/qwen3.5-flash-price-snapshot-2026-10-10.json \
 *     --budget-cny 50 --hard-stop-cny 40 --batch-size 10 \
 *     --est-prefix-tokens 9000 --est-dynamic-tokens 700 --tokens-per-image 1026 --est-output-tokens 3000 \
 *     --model qwen3.5-flash --thinking off --json-mode on --max-tokens 4000 --max-pixels 1048576 \
 *     --out <仓库外路径>/report.json [--apply]
 *
 * 所有预算与估算参数都没有默认值，必须显式给出（预算上限对应配置目录 pending 项
 * diagnosis.evaluation.ai_budget_cny）。凭证只按变量名 LLM_ALIYUN_BAILIAN_API_KEY 读取，不打印。
 * 报告只含结构化评分与 usage，不含模型原文。
 */

const { values } = parseArgs({
  options: {
    cases: { type: 'string' },
    'prefix-draft': { type: 'string' },
    'price-snapshot': { type: 'string' },
    'budget-cny': { type: 'string' },
    'hard-stop-cny': { type: 'string' },
    'batch-size': { type: 'string' },
    'est-prefix-tokens': { type: 'string' },
    'est-dynamic-tokens': { type: 'string' },
    'tokens-per-image': { type: 'string' },
    'est-output-tokens': { type: 'string' },
    model: { type: 'string' },
    thinking: { type: 'string' },
    'json-mode': { type: 'string' },
    'max-tokens': { type: 'string' },
    'max-pixels': { type: 'string' },
    out: { type: 'string' },
    'image-dir': { type: 'string' },
    'allow-inline-images': { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false }
  },
  strict: true
})

/** 读取必填字符串参数。 */
function required(name: keyof typeof values): string {
  const value = values[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`缺少必填参数 --${name}`)
  }
  return value
}

/** 读取必填正数参数。 */
function positive(name: keyof typeof values): number {
  const value = Number(required(name))
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new Error(`参数 --${name} 必须是正数`)
  }
  return value
}

const rawCases = JSON.parse(readFileSync(resolve(required('cases')), 'utf8')) as EvalCase[]
const allowInlineImages = values['allow-inline-images'] === true
/** 仅评测：`local:<文件名>` 在显式开启内联时解析为 data URL；图片只作为数据读取。 */
const cases: EvalCase[] = rawCases.map(evalCase => {
  const hasLocal = evalCase.imageUrls.some(url => url.startsWith('local:'))
  if (!hasLocal) {
    return evalCase
  }
  if (!allowInlineImages) {
    throw new Error('案例含本地图片引用，必须显式给出 --allow-inline-images 与 --image-dir')
  }
  const imageDir = resolve(required('image-dir'))
  return {
    ...evalCase,
    imageUrls: evalCase.imageUrls.map(url =>
      resolveLocalImageRef(url, imageDir, path => readFileSync(path))
    )
  }
})
const prefixText = extractPrefixFromDraft(readFileSync(resolve(required('prefix-draft')), 'utf8'))
const price = JSON.parse(readFileSync(resolve(required('price-snapshot')), 'utf8')) as PriceSnapshot
const apply = values.apply === true
const jsonMode = required('json-mode')
if (jsonMode !== 'on' && jsonMode !== 'off') {
  throw new Error('参数 --json-mode 只能是 on 或 off')
}
const thinking = required('thinking')
if (thinking !== 'on' && thinking !== 'off') {
  throw new Error('参数 --thinking 只能是 on 或 off')
}

/** dry-run 不需要凭证，用一个永不调用的占位 Provider。 */
const dryRunProvider: EvalProvider = {
  complete: () => Promise.reject(new Error('dry_run_must_not_call_provider'))
}
const provider = apply
  ? createBailianProvider({
      env: process.env,
      fetchImpl: fetch,
      model: required('model'),
      enableThinking: thinking === 'on',
      jsonMode: jsonMode === 'on',
      allowInlineImages,
      maxTokens: positive('max-tokens'),
      maxPixels: positive('max-pixels')
    })
  : dryRunProvider

const report = await runEvaluation(cases, provider, {
  apply,
  budgetCapCny: positive('budget-cny'),
  hardStopCny: positive('hard-stop-cny'),
  batchSize: positive('batch-size'),
  price,
  estimate: {
    prefixTokens: positive('est-prefix-tokens'),
    dynamicTextTokens: positive('est-dynamic-tokens'),
    tokensPerImage: positive('tokens-per-image'),
    outputTokens: positive('est-output-tokens')
  },
  prefixText,
  log: line => process.stdout.write(line + '\n')
})

writeFileSync(resolve(required('out')), JSON.stringify(report, null, 2) + '\n')
process.stdout.write(
  JSON.stringify(
    {
      mode: report.mode,
      stoppedReason: report.stoppedReason,
      summary: report.summary,
      cumulativeCostCny: report.cumulativeCostCny
    },
    null,
    2
  ) + '\n'
)
