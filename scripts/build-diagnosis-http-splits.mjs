#!/usr/bin/env node

import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')

const targets = [
  {
    name: 'diagnosis-question-start-http',
    entry: path.join(
      projectRoot,
      'cloudfunctions/diagnose-http/app/slim-question-start-http-entry.js'
    ),
    startSplit: true,
    generatedFiles: ['app.js', 'deferred-persistence.js', 'deferred-persistence-worker.js']
  },
  {
    name: 'diagnosis-answer-http',
    entry: path.join(projectRoot, 'cloudfunctions/diagnose-http/app/slim-answer-http-entry.js'),
    answerSplit: true,
    generatedFiles: [
      'app.js',
      'package-app.js',
      'deferred-persistence.js',
      'care-runtime.js',
      'deferred-persistence-worker.js'
    ]
  }
]

function parseArgs(argv = []) {
  const args = { check: false }
  for (const arg of argv) {
    if (arg === '--check') {
      args.check = true
      continue
    }
    throw new Error(`不支持的参数：${arg}`)
  }
  return args
}

function fingerprint(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12)
}

async function buildTarget(
  target,
  outputDir = path.join(projectRoot, 'cloudfunctions', target.name)
) {
  await fs.mkdir(outputDir, { recursive: true })
  // This legacy fallback bundle is deliberately no longer reachable from the
  // dedicated endpoints. Remove any stale copy before every build so it is
  // never silently uploaded as dead cold-start baggage.
  await fs.rm(path.join(outputDir, 'full-app.js'), { force: true })
  await fs.copyFile(
    path.join(projectRoot, 'cloudfunctions/diagnose-http/app/deferred-persistence-worker.js'),
    path.join(outputDir, 'deferred-persistence-worker.js')
  )
  if (target.startSplit) {
    await buildBundle(
      path.join(projectRoot, 'cloudfunctions/diagnose-http/app/round-persistence-runtime.js'),
      path.join(outputDir, 'deferred-persistence.js')
    )
    // The fast path imports local runtime modules directly. Bundle the
    // wrapper so the deployed function root is self-contained.
    const wrapperResult = await buildBundle(
      target.entry,
      path.join(outputDir, 'app.js'),
      `${target.name} fast wrapper`
    )
    const wrapperStat = await fs.stat(path.join(outputDir, 'app.js'))
    console.log(`${target.name}: ${wrapperStat.size} bytes wrapper, split bundles ready`)
    return wrapperResult
  }
  if (target.answerSplit) {
    await buildBundle(
      path.join(
        projectRoot,
        'cloudfunctions/diagnose-http/app/slim-question-package-http-entry.js'
      ),
      path.join(outputDir, 'package-app.js')
    )
    // These modules are only needed after the compact answer response has
    // been assembled. Keep them as separately loadable bundles so a cold
    // package-answer request does not parse persistence/planner code first.
    await buildBundle(
      path.join(projectRoot, 'cloudfunctions/diagnose-http/app/round-persistence-runtime.js'),
      path.join(outputDir, 'deferred-persistence.js')
    )
    await buildBundle(
      path.join(projectRoot, 'cloudfunctions/diagnose-http/app/care-behavior-payload.js'),
      path.join(outputDir, 'care-runtime.js')
    )
    const wrapperResult = await build({
      entryPoints: [target.entry],
      bundle: false,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      outfile: path.join(outputDir, 'app.js'),
      legalComments: 'none'
    })
    const wrapperStat = await fs.stat(path.join(outputDir, 'app.js'))
    console.log(`${target.name}: ${wrapperStat.size} bytes wrapper, split bundles ready`)
    return wrapperResult
  }
  return buildBundle(target.entry, path.join(outputDir, 'app.js'), target.name)
}

async function buildBundle(entry, outfile, label = '') {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile,
    metafile: true,
    legalComments: 'none',
    external: ['/opt/*', '@cloudbase/functions-framework', '@cloudbase/node-sdk']
  })
  const stat = await fs.stat(outfile)
  console.log(
    `${label || path.basename(outfile)}: ${stat.size} bytes, inputs=${Object.keys(result.metafile.inputs).length}`
  )
  return result
}

async function assertArtifactMatches(target, temporaryRoot) {
  const temporaryOutputDir = path.join(temporaryRoot, target.name)
  const expectedOutputDir = path.join(projectRoot, 'cloudfunctions', target.name)
  await buildTarget(target, temporaryOutputDir)

  for (const fileName of target.generatedFiles) {
    const expectedPath = path.join(expectedOutputDir, fileName)
    const actualPath = path.join(temporaryOutputDir, fileName)
    const [expected, actual] = await Promise.all([
      fs.readFile(expectedPath),
      fs.readFile(actualPath)
    ])
    if (!expected.equals(actual)) {
      throw new Error(
        `诊断分拆产物过期：${path.relative(projectRoot, expectedPath)} ` +
          `(当前 ${fingerprint(expected)}，应为 ${fingerprint(actual)})。请先执行 npm run build:diagnosis-http-splits。`
      )
    }
  }

  const obsoleteBundle = path.join(expectedOutputDir, 'full-app.js')
  try {
    await fs.access(obsoleteBundle)
    throw new Error(
      `诊断分拆产物包含已废弃文件：${path.relative(projectRoot, obsoleteBundle)}。请先重新构建。`
    )
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
  console.log(`${target.name}: artifact check passed`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.check) {
    for (const target of targets) {
      await buildTarget(target)
    }
    return
  }

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'planting-diagnosis-http-splits-'))
  try {
    for (const target of targets) {
      await assertArtifactMatches(target, temporaryRoot)
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }
}

await main()
