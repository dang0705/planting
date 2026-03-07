# 云函数部署指令 (/deploy function)

**指令描述**: 云函数快速部署 - 一键部署指定的云函数到 CloudBase 环境

## 📚 工具概述

`/deploy function` 指令专门用于 CloudBase 云函数的快速部署操作，支持单个函数部署、批量部署和状态验证。通过标准化的MCP工具调用，实现云函数的快速更新和部署管理。

## 🔧 相关MCP工具

### 1. getFunctionList - 查询云函数列表和详情

**功能**: 查询云函数列表或单个函数详情

**参数结构**:
```json
{
  "action": "list"  // 查询函数列表
}
```

```json
{
  "action": "detail",  // 查询函数详情
  "name": "函数名称"
}
```

**使用场景**:
- 查看所有云函数状态
- 检查单个函数的部署状态
- 验证部署结果

### 2. updateFunctionCode - 更新云函数代码

**功能**: 更新已存在云函数的代码

**参数结构**:
```json
{
  "name": "函数名称",
  "functionRootPath": "e:/workspace/planting/cloudfunctions"
}
```

**重要限制**:
- 只能更新已存在的函数代码，不能修改函数配置（如runtime）
- 如需修改runtime，需要删除函数后重新创建

## 🎯 部署操作流程

### 场景1: 部署单个云函数

```bash
# 1. 查询函数当前状态
mcp call getFunctionList {"action": "detail", "name": "saveUserPlant"}

# 2. 部署函数代码
mcp call updateFunctionCode {
  "name": "saveUserPlant",
  "functionRootPath": "e:/workspace/planting/cloudfunctions"
}

# 3. 验证部署结果
mcp call getFunctionList {"action": "detail", "name": "saveUserPlant"}
```

### 场景2: 批量部署植物相关函数

```bash
# 植物相关函数列表
PLANT_FUNCTIONS=("saveUserPlant" "deleteUserPlant" "addUserPlant")

# 批量部署
for func in "${PLANT_FUNCTIONS[@]}"; do
  echo "部署函数: $func"
  mcp call updateFunctionCode {
    "name": "$func",
    "functionRootPath": "e:/workspace/planting/cloudfunctions"
  }
done
```

### 场景3: 部署所有云函数

```bash
# 获取所有函数列表
ALL_FUNCTIONS=("saveUserPlant" "deleteUserPlant" "addUserPlant" "getUserPlants" "getDefaultPlants" "aiProxy" "updateUserPlant" "storage" "auth-user")

# 批量部署所有函数
for func in "${ALL_FUNCTIONS[@]}"; do
  echo "部署函数: $func"
  mcp call updateFunctionCode {
    "name": "$func",
    "functionRootPath": "e:/workspace/planting/cloudfunctions"
  }
done
```

## ⚠️ 常见问题与解决方案

### 问题1: 函数不存在错误
**错误提示**: 函数不存在
**原因**: 尝试部署尚未创建的云函数
**解决方案**: 先使用 createFunction 创建函数

```bash
# 创建新函数
mcp call createFunction {
  "func": {
    "name": "新函数名",
    "runtime": "Nodejs18.15"
  },
  "functionRootPath": "e:/workspace/planting/cloudfunctions"
}
```

### 问题2: 路径错误
**错误提示**: 路径不存在
**原因**: functionRootPath 指向错误目录
**解决方案**: 指向云函数目录的父目录

```bash
# ❌ 错误路径
e:/workspace/planting

# ✅ 正确路径
e:/workspace/planting/cloudfunctions
```

### 问题3: 运行时(runtime)无法修改
**错误提示**: updateFunctionConfig 无法修改runtime
**原因**: runtime只能在创建时设置
**解决方案**: 删除函数后重新创建

```bash
# 1. 删除旧函数（如果需要）
# 2. 重新创建函数
mcp call createFunction {
  "func": {
    "name": "函数名",
    "runtime": "Nodejs18.15"  // 设置正确的runtime
  },
  "functionRootPath": "e:/workspace/planting/cloudfunctions",
  "force": true
}
```

## 📋 快速执行脚本

### 部署植物管理相关函数

```bash
# 定义植物相关函数列表
PLANT_FUNCTIONS=("saveUserPlant" "deleteUserPlant" "addUserPlant")

# 批量部署
for func in "${PLANT_FUNCTIONS[@]}"; do
  echo "正在部署: $func"
  mcp call updateFunctionCode {
    "name": "$func",
    "functionRootPath": "e:/workspace/planting/cloudfunctions"
  }
  echo "$func 部署完成"
done

echo "所有植物相关函数部署完成！"
```

### 验证部署状态

```bash
# 验证所有函数部署状态
for func in "${PLANT_FUNCTIONS[@]}"; do
  echo "检查函数: $func"
  mcp call getFunctionList {"action": "detail", "name": "$func"} | grep -A3 "LastModified"
done
```

## 🔍 部署状态检查要点

验证部署状态时，检查以下关键字段：

```json
{
  "FunctionName": "saveUserPlant",
  "Status": "Active",  // 确认状态为Active
  "LastModified": "2026-03-01 09:10:55",  // 确认修改时间更新
  "CodeInfo": "..."  // 确认代码内容正确
}
```

## 📝 最佳实践

1. **先检查后部署**: 部署前先查询函数当前状态
2. **批量部署**: 使用脚本批量处理相关函数
3. **验证结果**: 部署后验证修改时间和状态
4. **记录日志**: 记录部署时间和版本信息
5. **版本控制**: 重要变更前做好代码版本控制

## 🚀 /deploy function 指令快速使用

### 基础用法
```bash
# 部署单个云函数
/deploy function saveUserPlant

# 部署删除植物函数  
/deploy function deleteUserPlant

# 部署新增植物函数
/deploy function addUserPlant
```

### 批量部署
```bash
# 部署所有植物相关函数
/deploy function plant

# 部署所有云函数
/deploy function all
```

### 高级用法
```bash
# 查看部署状态
/deploy function status

# 验证部署结果
/deploy function verify
```

## 💡 使用场景

### 开发环境
- 代码修改后的快速部署
- 功能测试前的环境准备
- 团队协作中的环境同步

### 生产环境  
- 热修复快速部署
- 功能更新发布
- 安全补丁部署

### 持续集成
- 自动化部署流程
- 版本发布管理
- 环境一致性验证

---

**最后更新**: 2026-03-01
**适用环境**: CloudBase 云函数快速部署
**相关项目**: 青植 - 智能植物养护助手
**指令标识**: `/deploy function` - 云函数快速部署