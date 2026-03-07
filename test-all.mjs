// 综合测试脚本 - 测试 Pinia 和 Tailwind CSS
import { spawn } from 'child_process'

console.log('='.repeat(60))
console.log('开始运行综合测试')
console.log('='.repeat(60))

function runTest(command, testName) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`正在测试: ${testName}`)
    console.log('='.repeat(60))
    
    const child = spawn('node', [command], {
      stdio: 'inherit',
      shell: true
    })
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✓ ${testName} 测试通过\n`)
        resolve()
      } else {
        console.log(`\n✗ ${testName} 测试失败\n`)
        reject(new Error(`${testName} 测试失败`))
      }
    })
    
    child.on('error', (err) => {
      console.error(`\n✗ ${testName} 测试出错:`, err.message)
      reject(err)
    })
  })
}

async function runAllTests() {
  const tests = [
    { command: 'test-pinia.mjs', name: 'Pinia 状态管理' },
    { command: 'test-tailwind.mjs', name: 'Tailwind CSS' }
  ]
  
  let passedTests = 0
  let failedTests = 0
  
  for (const test of tests) {
    try {
      await runTest(test.command, test.name)
      passedTests++
    } catch (error) {
      failedTests++
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('测试总结')
  console.log('='.repeat(60))
  console.log(`✓ 通过: ${passedTests}/${tests.length}`)
  console.log(`✗ 失败: ${failedTests}/${tests.length}`)
  
  if (failedTests === 0) {
    console.log('\n🎉 所有测试通过！项目配置完整！')
    console.log('\n已集成的功能：')
    console.log('  ✓ Pinia 2.1.7 - Vue3 状态管理')
    console.log('  ✓ Tailwind CSS 4.1.18 - 工具类优先的 CSS 框架')
    console.log('\n可用的测试命令：')
    console.log('  npm run test:pinia     - 测试 Pinia')
    console.log('  npm run test:tailwind  - 测试 Tailwind CSS')
    console.log('  npm run test:all       - 运行所有测试')
    console.log('='.repeat(60))
    process.exit(0)
  } else {
    console.log('\n⚠️  部分测试失败，请检查上述错误信息')
    console.log('='.repeat(60))
    process.exit(1)
  }
}

runAllTests().catch(err => {
  console.error('测试运行出错:', err)
  process.exit(1)
})
