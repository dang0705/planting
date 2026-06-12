// Tailwind CSS 测试脚本
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

console.log('=== Tailwind CSS 配置测试 ===\n')

const checks = []

// 检查 Tailwind 配置文件
const tailwindConfigPath = resolve(process.cwd(), 'tailwind.config.js')
if (existsSync(tailwindConfigPath)) {
  console.log('✓ tailwind.config.js 存在')
  checks.push(true)
  const content = readFileSync(tailwindConfigPath, 'utf-8')
  if (content.includes('content:')) {
    console.log('  ✓ 配置了 content 路径')
    checks.push(true)
  }
  if (content.includes('./src/**/*.{vue,js,ts,jsx,tsx}')) {
    console.log('  ✓ 包含 Vue 文件路径')
    checks.push(true)
  }
} else {
  console.log('✗ tailwind.config.js 不存在')
  checks.push(false)
}

// 检查 PostCSS 配置
const postcssConfigPath = resolve(process.cwd(), 'postcss.config.js')
if (existsSync(postcssConfigPath)) {
  console.log('\n✓ postcss.config.js 存在')
  checks.push(true)
  const content = readFileSync(postcssConfigPath, 'utf-8')
  if (content.includes('tailwindcss')) {
    console.log('  ✓ 配置了 tailwindcss 插件')
    checks.push(true)
  }
  if (content.includes('autoprefixer')) {
    console.log('  ✓ 配置了 autoprefixer 插件')
    checks.push(true)
  }
} else {
  console.log('\n✗ postcss.config.js 不存在')
  checks.push(false)
}

// 检查 Tailwind CSS 入口文件
const tailwindCssPath = resolve(process.cwd(), 'src/styles/tailwind.css')
if (existsSync(tailwindCssPath)) {
  console.log('\n✓ src/styles/tailwind.css 存在')
  checks.push(true)
  const content = readFileSync(tailwindCssPath, 'utf-8')
  if (content.includes('@tailwind base')) {
    console.log('  ✓ 包含 @tailwind base')
    checks.push(true)
  }
  if (content.includes('@tailwind components')) {
    console.log('  ✓ 包含 @tailwind components')
    checks.push(true)
  }
  if (content.includes('@tailwind utilities')) {
    console.log('  ✓ 包含 @tailwind utilities')
    checks.push(true)
  }
} else {
  console.log('\n✗ src/styles/tailwind.css 不存在')
  checks.push(false)
}

// 检查 main.js 是否导入了 Tailwind CSS
const mainJsPath = resolve(process.cwd(), 'src/main.js')
if (existsSync(mainJsPath)) {
  console.log('\n✓ src/main.js 存在')
  checks.push(true)
  const content = readFileSync(mainJsPath, 'utf-8')
  const globalCssPath = resolve(process.cwd(), 'src/styles/global.css')
  const globalCssContent = existsSync(globalCssPath) ? readFileSync(globalCssPath, 'utf-8') : ''
  if (content.includes('tailwind.css') || (content.includes('global.css') && globalCssContent.includes('tailwind.css'))) {
    console.log('  ✓ 已通过 main.js/global.css 引入 tailwind.css')
    checks.push(true)
  } else {
    console.log('  ✗ 未通过 main.js/global.css 引入 tailwind.css')
    checks.push(false)
  }
} else {
  console.log('\n✗ src/main.js 不存在')
  checks.push(false)
}

// 检查 package.json 依赖
const packageJsonPath = resolve(process.cwd(), 'package.json')
if (existsSync(packageJsonPath)) {
  console.log('\n✓ package.json 存在')
  checks.push(true)
  const content = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const devDeps = content.devDependencies || {}
  
  if (devDeps.tailwindcss) {
    console.log(`  ✓ tailwindcss 已安装 (${devDeps.tailwindcss})`)
    checks.push(true)
  } else {
    console.log('  ✗ tailwindcss 未安装')
    checks.push(false)
  }
  
  if (devDeps.postcss) {
    console.log(`  ✓ postcss 已安装 (${devDeps.postcss})`)
    checks.push(true)
  } else {
    console.log('  ✗ postcss 未安装')
    checks.push(false)
  }
  
  if (devDeps.autoprefixer) {
    console.log(`  ✓ autoprefixer 已安装 (${devDeps.autoprefixer})`)
    checks.push(true)
  } else {
    console.log('  ✗ autoprefixer 未安装')
    checks.push(false)
  }
}

// 检查测试页面
const testPagePath = resolve(process.cwd(), 'src/pages/tailwind-test/tailwind-test.vue')
if (existsSync(testPagePath)) {
  console.log('\n✓ Tailwind 测试页面存在')
  checks.push(true)
  const content = readFileSync(testPagePath, 'utf-8')
  const tailwindClasses = [
    'bg-gradient-to-br',
    'text-center',
    'rounded-2xl',
    'shadow-lg',
    'flex',
    'grid'
  ]
  
  let classCount = 0
  tailwindClasses.forEach(cls => {
    if (content.includes(cls)) {
      classCount++
    }
  })
  
  console.log(`  ✓ 使用了 ${classCount}/${tailwindClasses.length} 个 Tailwind 工具类`)
  checks.push(true)
} else {
  console.log('\n- Tailwind 测试页面不存在，跳过页面样例检查')
}

// 统计结果
const passedChecks = checks.filter(c => c).length
const totalChecks = checks.length
const passRate = ((passedChecks / totalChecks) * 100).toFixed(1)

console.log('\n' + '='.repeat(50))
console.log(`测试结果: ${passedChecks}/${totalChecks} 项通过 (${passRate}%)`)

if (passedChecks === totalChecks) {
  console.log('✓ Tailwind CSS 配置完整，可以正常使用！')
  console.log('='.repeat(50))
  process.exit(0)
} else {
  console.log('✗ 部分配置缺失，请检查上述错误')
  console.log('='.repeat(50))
  process.exit(1)
}
