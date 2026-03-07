#!/usr/bin/env node

/**
 * 云函数部署脚本
 * 用法: npm run deploy:function <function-name>
 * 示例: npm run deploy:function saveUserPlant
 */

const { execSync } = require('child_process');

// 获取命令行参数
const functionName = process.argv[2];

if (!functionName) {
  console.error('❌ 错误: 请提供要部署的云函数名称');
  console.log('用法: npm run deploy:function <function-name>');
  console.log('示例: npm run deploy:function saveUserPlant');
  process.exit(1);
}

// 检查云函数目录是否存在
const fs = require('fs');
const functionPath = `./cloudfunctions/${functionName}`;

if (!fs.existsSync(functionPath)) {
  console.error(`❌ 错误: 云函数 "${functionName}" 不存在`);
  console.log(`请检查 cloudfunctions/${functionName} 目录是否存在`);
  process.exit(1);
}

console.log(`🚀 开始部署云函数: ${functionName}`);

try {
  // 使用 CloudBase MCP 工具部署云函数
  const mcpCommand = `npx @cloudbase/cloudbase-mcp@latest updateFunctionCode --name "${functionName}" --functionRootPath "${process.cwd()}\\cloudfunctions"`;
  
  console.log(`📦 执行部署命令...`);
  
  // 执行部署命令
  const result = execSync(mcpCommand, { 
    encoding: 'utf8',
    stdio: 'inherit'
  });
  
  console.log(`✅ 云函数 "${functionName}" 部署成功`);
  
} catch (error) {
  console.error(`❌ 云函数 "${functionName}" 部署失败:`);
  console.error(error.message);
  process.exit(1);
}