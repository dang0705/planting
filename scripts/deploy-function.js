#!/usr/bin/env node

/**
 * 云函数部署脚本
 * 用法: node scripts/deploy-function.js <function-name>
 * 示例: node scripts/deploy-function.js saveUserPlant
 *
 * 注意:
 * - 这是一个代码更新脚本，不会更新 runtime、timeout、envVariables
 * - 不要使用 npx @cloudbase/cloudbase-mcp@latest updateFunctionCode 作为 CLI 发布命令
 * - diagnose-http 等关键函数发布后，必须用 tcb fn detail 确认 Modification time / Code size 变化，并跑真链路 smoke
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const cloudbasercPath = path.join(process.cwd(), 'cloudbaserc.json');
const cloudbaserc = fs.existsSync(cloudbasercPath)
  ? JSON.parse(fs.readFileSync(cloudbasercPath, 'utf8'))
  : {};

// 获取命令行参数
const functionName = process.argv[2];

if (!functionName) {
  console.error('❌ 错误: 请提供要部署的云函数名称');
  console.log('用法: npm run deploy:function <function-name>');
  console.log('示例: npm run deploy:function saveUserPlant');
  process.exit(1);
}

// 检查云函数目录是否存在
const functionPath = `./cloudfunctions/${functionName}`;

if (!fs.existsSync(functionPath)) {
  console.error(`❌ 错误: 云函数 "${functionName}" 不存在`);
  console.log(`请检查 cloudfunctions/${functionName} 目录是否存在`);
  process.exit(1);
}

console.log(`🚀 开始部署云函数: ${functionName}`);
console.warn('⚠️ 该脚本仅用于便捷触发部署，不作为闭环验收依据');

try {
  const envId = String(cloudbaserc.envId || process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || '').trim();
  if (!envId) {
    throw new Error('缺少 CloudBase envId，请在 cloudbaserc.json 或环境变量 CLOUDBASE_ENV_ID/TCB_ENV 中配置');
  }

  // 只更新函数代码，避免 fn deploy 读取 cloudbaserc.json 后覆盖线上 timeout/envVariables。
  const functionDir = path.join(process.cwd(), 'cloudfunctions', functionName);
  const cliCommand = [
    'npx --package @cloudbase/cli@3.2.2 tcb fn code update',
    `"${functionName}"`,
    `--dir "${functionDir}"`,
    `-e "${envId}"`,
    '--json'
  ].join(' ');
  
  console.log(`📦 执行部署命令...`);
  
  // 执行部署命令
  execSync(cliCommand, { 
    encoding: 'utf8',
    stdio: 'inherit'
  });
  
  console.log(`✅ 云函数 "${functionName}" 部署成功`);
  
} catch (error) {
  console.error(`❌ 云函数 "${functionName}" 部署失败:`);
  console.error(error.message);
  process.exit(1);
}
