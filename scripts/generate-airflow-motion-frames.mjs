import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const assetRoot = path.join(repoRoot, 'src/assets/airflow')

const WINDOW_SCENE_WIDTH = 340.123
const WINDOW_SCENE_HEIGHT = 107.691
const FRESH_AIR_SOURCE_WIDTH = 151.029
const FRESH_AIR_SOURCE_HEIGHT = 84.384
const FRESH_AIR_OFFSET_X = (WINDOW_SCENE_WIDTH - FRESH_AIR_SOURCE_WIDTH) / 2
const FRESH_AIR_OFFSET_Y = (WINDOW_SCENE_HEIGHT - FRESH_AIR_SOURCE_HEIGHT) / 2

const readAsset = name => fs.readFileSync(path.join(assetRoot, name), 'utf8')
const writeAsset = (name, source) =>
  fs.writeFileSync(path.join(assetRoot, name), `${source.trim()}\n`)

const formatNumber = value => Number(value.toFixed(4)).toString()

const FRESH_AIR_DEVICE_GROUPS = [
  `<g transform="translate(67.52,0) scale(1.0000,1.0000)">
<path id="Vector" d="M4.35243 0.3553H1.68768C0.951825 0.3553 0.3553 0.951825 0.3553 1.68768V9.68193C0.3553 10.4178 0.951825 11.0143 1.68768 11.0143H4.35243C5.08828 11.0143 5.6848 10.4178 5.6848 9.68193V1.68768C5.6848 0.951825 5.08828 0.3553 4.35243 0.3553Z" fill="#F1F8F4" stroke="#2D7A4F" stroke-opacity="0.15" stroke-width="0.7106"/>
</g>`,
  `<g transform="translate(78.18,0) scale(1.0000,1.0000)">
<path id="Vector" d="M4.35243 0.3553H1.68768C0.951825 0.3553 0.3553 0.951825 0.3553 1.68768V9.68193C0.3553 10.4178 0.951825 11.0143 1.68768 11.0143H4.35243C5.08828 11.0143 5.6848 10.4178 5.6848 9.68193V1.68768C5.6848 0.951825 5.08828 0.3553 4.35243 0.3553Z" fill="#F1F8F4" stroke="#2D7A4F" stroke-opacity="0.15" stroke-width="0.7106"/>
</g>`,
  `<g transform="translate(62.19,13.32) scale(1.0000,1.0000)">
<path id="Vector" d="M24.5157 0.53295H3.1977C1.726 0.53295 0.53295 1.726 0.53295 3.1977V10.3037C0.53295 11.7754 1.726 12.9685 3.1977 12.9685H24.5157C25.9874 12.9685 27.1805 11.7754 27.1805 10.3037V3.1977C27.1805 1.726 25.9874 0.53295 24.5157 0.53295Z" fill="#E8F5E9" stroke="#2D7A4F" stroke-opacity="0.15" stroke-width="1.0659"/>
</g>`
]

const extractFlowElements = (source, pathPattern) =>
  [...source.matchAll(pathPattern)].map(match => {
    const previousGroupEnd = source.lastIndexOf('</g>', match.index)
    const groupStart = source.lastIndexOf('<g', match.index)
    const groupSource = source.slice(groupStart, match.index)
    if (groupStart > previousGroupEnd && groupSource.includes('transform=')) {
      const groupEnd = source.indexOf('</g>', match.index)
      return source.slice(groupStart, groupEnd + 4)
    }
    return match[0]
  })

const createAnimatedWindowFlow = (scene, source, dashPeriod, pathPattern) => {
  const svgOpen = source.match(/<svg[^>]+>/)?.[0]
  const flowElements = extractFlowElements(source, pathPattern)
  if (!svgOpen || flowElements.length === 0) {
    throw new Error(`Unable to extract ${scene} airflow paths`)
  }

  const animatedElements = flowElements.map(flowElement =>
    flowElement
      .replace(/stroke-dashoffset="[^"]+"/, 'stroke-dashoffset="0"')
      .replace(
        /<path([^>]*)\/>/,
        `<path$1><animate attributeName="stroke-dashoffset" from="0" to="-${formatNumber(
          dashPeriod
        )}" dur="1.4s" repeatCount="indefinite" calcMode="linear"/></path>`
      )
  )
  writeAsset(`scene-${scene}-flow.svg`, `${svgOpen}\n${animatedElements.join('\n')}\n</svg>`)
}

const createWindowBaseScene = (scene, source, pathPattern) => {
  const flowElements = extractFlowElements(source, pathPattern)
  const baseSource = flowElements.reduce((currentSource, flowElement) => {
    return currentSource.replace(flowElement, '')
  }, source)
  const name = `scene-${scene}-base.svg`
  writeAsset(name, baseSource)
  return name
}

const createWindowClosedScene = (source, pathPattern) => {
  const flowElements = extractFlowElements(source, pathPattern)
  const closedLines = `
<g transform="translate(31.32,20.41) scale(1.0000,0.9999)">
<path id="closed-left-vertical" opacity="0.7" d="M0.453436 0V49.8779" stroke="#2D7A4F" stroke-opacity="0.15" stroke-width="0.906872"/>
</g>
<g transform="translate(22.69,44.90) scale(1.0014,1.0000)">
<path id="closed-left-horizontal" opacity="0.7" d="M0 0.453436H18.1374" stroke="#2D7A4F" stroke-opacity="0.15" stroke-width="0.906872"/>
</g>
<g transform="translate(307.90,20.41) scale(1.0000,0.9999)">
<path id="closed-right-vertical" opacity="0.7" d="M0.453436 0V49.8779" stroke="#2D7A4F" stroke-opacity="0.15" stroke-width="0.906872"/>
</g>
<g transform="translate(299.27,44.90) scale(1.0014,1.0000)">
<path id="closed-right-horizontal" opacity="0.7" d="M0 0.453436H18.1374" stroke="#2D7A4F" stroke-opacity="0.15" stroke-width="0.906872"/>
</g>`
  const baseSource = flowElements.reduce(
    (currentSource, flowElement) => currentSource.replace(flowElement, ''),
    source
  )
  const closedSource = baseSource
    .replace(
      /<g transform="translate\(1\.05,6\.10\) rotate\(180 11\.2792 39\.7550\)">[\s\S]*?<\/g>\n/,
      ''
    )
    .replace(
      /<g transform="translate\(21\.12,(?:31\.28|56\.23)\) scale\(0\.9966,1\.0009\)">[\s\S]*?<\/g>\n/g,
      ''
    )
    .replace(/<polygon id="right-sash-fill"[\s\S]*?<polyline id="right-sash-outline"[^>]*\/>\n/, '')
    .replace(
      /<g transform="translate\(315\.84,(?:31\.28|56\.23)\) scale\(0\.9966,1\.0009\)">[\s\S]*?<\/g>\n/g,
      ''
    )
    .replace('</svg>', `${closedLines}\n</svg>`)

  writeAsset('scene-window-closed.svg', closedSource)
}

const createFreshAirScene = windowClosedSource => {
  const deviceGroups = FRESH_AIR_DEVICE_GROUPS.map(group =>
    group.replace(/translate\(([-\d.]+),([-\d.]+)\)/, (_, x, y) => {
      return `translate(${formatNumber(Number(x) + FRESH_AIR_OFFSET_X)},${formatNumber(
        Number(y) + FRESH_AIR_OFFSET_Y
      )})`
    })
  ).join('\n')
  const freshAirSource = windowClosedSource.replace('</svg>', `${deviceGroups}\n</svg>`)
  writeAsset('scene-fresh-air.svg', freshAirSource)
}

const createFreshAirFlowScene = source => {
  if (source.includes('<animate')) {
    return source
  }

  const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="${WINDOW_SCENE_WIDTH}" height="${WINDOW_SCENE_HEIGHT}" viewBox="0 0 ${WINDOW_SCENE_WIDTH} ${WINDOW_SCENE_HEIGHT}">`
  const unifiedSource = source.includes(
    `viewBox="0 0 ${WINDOW_SCENE_WIDTH} ${WINDOW_SCENE_HEIGHT}"`
  )
    ? source
    : source
        .replace(/<svg[^>]*>/, svgOpen)
        .replace(/translate\(([-\d.]+),([-\d.]+)\)/g, (_, x, y) => {
          return `translate(${formatNumber(Number(x) + FRESH_AIR_OFFSET_X)},${formatNumber(
            Number(y) + FRESH_AIR_OFFSET_Y
          )})`
        })
  const enteringPaths = [
    { id: 'left-airflow', duration: 2.4, begin: 0, opacity: 0.65 },
    { id: 'center-airflow', duration: 2.8, begin: 0.4, opacity: 0.55 },
    { id: 'right-airflow', duration: 3.1, begin: 0.9, opacity: 0.6 }
  ]
  let animatedSource = unifiedSource
  for (const pathState of enteringPaths) {
    const pathPattern = new RegExp(`(<path id="${pathState.id}"[^>]*)(/>)`)
    animatedSource = animatedSource.replace(
      pathPattern,
      `$1><animate attributeName="stroke-dashoffset" from="17" to="0" dur="${pathState.duration}s" begin="${pathState.begin}s" repeatCount="indefinite" calcMode="linear"/><animate attributeName="opacity" values="0;${pathState.opacity};0" keyTimes="0;0.5;1" dur="${pathState.duration}s" begin="${pathState.begin}s" repeatCount="indefinite"/></path>`
    )
  }
  animatedSource = animatedSource.replace(
    /(<path id="return-airflow"[^>]*)(\/\>)/,
    '$1><animate attributeName="stroke-dashoffset" from="0" to="-14.21" dur="3.2s" repeatCount="indefinite" calcMode="linear"/></path>'
  )
  writeAsset('scene-fresh-air-flow.svg', animatedSource)
  return animatedSource
}

const singlePathPattern = /<path id="Frame"[^>]*stroke-dasharray="6\.8 6\.8"[^>]*\/>/g
const doublePathPattern = /<path id="(?:Frame|Vector)"[^>]*stroke-dasharray="6\.8 5\.67"[^>]*\/>/g

const singleSource = readAsset('scene-window-single.svg')
const doubleSource = readAsset('scene-window-double.svg')
createWindowBaseScene('window-single', singleSource, singlePathPattern)
createWindowBaseScene('window-double', doubleSource, doublePathPattern)
createWindowClosedScene(doubleSource, doublePathPattern)

createAnimatedWindowFlow('window-single', singleSource, 6.8 + 6.8, singlePathPattern)
createAnimatedWindowFlow('window-double', doubleSource, 6.8 + 5.67, doublePathPattern)
createFreshAirScene(readAsset('scene-window-closed.svg'))
createFreshAirFlowScene(readAsset('scene-fresh-air-flow.svg'))
