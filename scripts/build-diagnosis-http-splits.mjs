#!/usr/bin/env node

import fs from 'node:fs/promises'
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
    startSplit: true
  },
  {
    name: 'diagnosis-answer-http',
    entry: path.join(projectRoot, 'cloudfunctions/diagnose-http/app/slim-answer-http-entry.js'),
    answerSplit: true
  }
]

async function buildTarget(target) {
  const outputDir = path.join(projectRoot, 'cloudfunctions', target.name)
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

for (const target of targets) {
  await buildTarget(target)
}
