import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 离线制品生成；只访问列明的V1来源与固定输出，不读取架构目录、用户数据或凭证。 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)
const sourceRoot = 'cloudfunctions/diagnose-http/'
const fixed = require(join(root, sourceRoot, 'app/start-question-package-runtime-data.js'))
const pests = require(join(root, sourceRoot, 'app/pest-question-package.js'))
const definitions = {
  fixed: { yellow_leaf: fixed.getStartQuestionPackage('yellow_leaf'), wilting_droop: fixed.getStartQuestionPackage('wilting_droop') },
  pestQuestions: pests.QUESTION_BLUEPRINTS.map(blueprint => pests._test.buildQuestion(blueprint, blueprint.modes)),
  pestLabels: pests.PEST_MODE_LABELS,
}
const output = join(root, 'cloudfunctions-v2/models/diagnosis/v1-reuse')
const json = value => JSON.stringify(value, null, 2) + '\n'
const sha = value => createHash('sha256').update(value).digest('hex')
const artifact = json(definitions)
const sources = ['app/start-question-package-runtime-data.js', 'app/pest-question-package.js',
  'app/package-answer-ownership-runtime.js', 'app/question-package-response.js', 'app/wilting-droop-question-package.js']
const manifest = json({
  status: 'source_content_snapshot_not_published', scope: ['yellow_leaf', 'wilting_droop', 'specific_pest_visual'],
  sources: sources.map(path => ({ path: sourceRoot + path, sha256: sha(readFileSync(join(root, sourceRoot, path))) })),
  artifactSha256: sha(artifact),
  questionCounts: { yellow_leaf: definitions.fixed.yellow_leaf.length, wilting_droop: definitions.fixed.wilting_droop.length },
  pestTierQuestionLimits: Object.fromEntries(['low', 'medium', 'high', 'very_likely', 'direct'].map(confidenceTier => [
    confidenceTier, pests.buildSpecificPestQuestionPackage({ candidateModes: ['aphid'], confidenceTier }).maxQuestions,
  ])),
  boundary: '本制品保留当前V1题目内容；不证明CMS审核、发布、评分规则或V2 HTTP已实现',
})
for (const [name, body] of [['questions.json', artifact], ['manifest.json', manifest]]) {
  if (process.argv.includes('--check')) {
    if (readFileSync(join(output, name), 'utf8') !== body) { throw new Error(`V1复用制品与明确来源不一致：${name}`) }
  } else { writeFileSync(join(output, name), body) }
}
console.log(process.argv.includes('--check') ? 'V1复用制品重建核验通过' : 'V1复用制品已生成，仍需审核后发布')
