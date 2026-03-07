# 云函数层管理指令 (/layer)

**指令描述**: 云函数管理绑定 - 快速执行云函数层配置更新、版本管理和部署操作

## 📚 工具概述

`/layer` 指令专门用于 CloudBase 云函数的层管理绑定操作，提供快速、批量的层配置更新功能。通过标准化的MCP工具调用，实现云函数依赖层的统一管理。

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
- 检查单个函数的层配置
- 验证层配置是否生效

### 2. createFunction - 创建/重新创建云函数（含层配置）

**功能**: 创建云函数，支持设置层配置

**参数结构**:
```json
{
  "func": {
    "name": "函数名称",
    "runtime": "Nodejs18.15",
    "layers": [
      {
        "name": "layer",
        "version": 5  // 注意：应使用最新版本，建议先执行版本检查
      }
    ]
  },
  "functionRootPath": "E:/workspace/planting/cloudfunctions",
  "force": true
}
```

**关键参数说明**:
- `layers`: 层配置数组，每个对象包含 `name` 和 `version`
  - **版本检查**: 执行前应查询现有函数的层配置，获取最高版本号作为最新版本
  - **避免硬编码**: 不要使用固定版本号，应动态检测最新版本
- `functionRootPath`: 云函数目录的父目录绝对路径
- `force: true`: 强制重新创建（覆盖现有函数）

**重要限制**:
- **层配置只能在创建函数时设置**，无法通过 updateFunctionConfig 修改
- 如需更新层配置，必须重新创建函数

### 3. updateFunctionCode - 更新云函数代码（不修改配置）

**功能**: 仅更新云函数代码，不修改函数配置

**参数结构**:
```json
{
  "name": "函数名称",
  "functionRootPath": "E:/workspace/planting/cloudfunctions"
}
```

**注意**: 此工具**不**支持修改层配置，只用于代码更新

## 🎯 层管理操作流程

### 场景1: 检查当前层配置状态

```bash
# 1. 查询所有函数列表
mcp call getFunctionList {"action": "list"}

# 2. 检查单个函数层配置
mcp call getFunctionList {"action": "detail", "name": "saveUserPlant"}
```

### 场景2: 更新所有函数到最新层版本（推荐：自动版本检测）

```bash
# 步骤1：检查现有函数的层配置，获取最新版本号
# 查询所有函数列表，获取每个函数的层版本，找出最大值
# 建议先执行 /layer status 查看当前状态

# 步骤2：批量更新到最新版本（示例：检测到版本5）
FUNCTIONS=("saveUserPlant" "auth-user" "getDefaultPlants" "aiProxy" "updateUserPlant" "deleteUserPlant" "getUserPlants" "storage" "getWeather")
LATEST_VERSION=5  # 应通过脚本自动检测，此处为示例

for func in "${FUNCTIONS[@]}"; do
  echo "更新函数: $func 到层版本 $LATEST_VERSION"
  mcp call createFunction {
    "func": {
      "name": "$func",
      "runtime": "Nodejs18.15",
      "layers": [{"name": "layer", "version": $LATEST_VERSION}]
    },
    "functionRootPath": "E:/workspace/planting/cloudfunctions",
    "force": true
  }
done

# 步骤3：验证更新结果
for func in "${FUNCTIONS[@]}"; do
  echo "验证函数: $func"
  mcp call getFunctionList {"action": "detail", "name": "$func"} | grep -A5 "Layers"
done
```

**重要提醒**：不要硬编码版本号！应通过脚本自动检测现有函数的最新层版本。

### 场景3: 仅更新代码（保持现有层配置）

```bash
mcp call updateFunctionCode {
  "name": "saveUserPlant",
  "functionRootPath": "E:/workspace/planting/cloudfunctions"
}
```

## ⚠️ 常见问题与解决方案

### 问题1: 参数格式错误
**错误提示**: searchKnowledgeBase 连续失败
**原因**: 使用了嵌套参数格式
**解决方案**: 使用直接参数格式

```json
// ❌ 错误格式
{
  "query": {"pattern": "搜索内容"},
  "knowledgeBaseName": "cloud-functions"
}

// ✅ 正确格式  
{
  "mode": "doc",
  "docName": "cloud-functions",
  "queryString": "搜索内容"
}
```

### 问题2: 路径错误
**错误提示**: 路径不存在
**原因**: functionRootPath 指向错误目录
**解决方案**: 指向云函数目录的父目录

```bash
# ❌ 错误路径
E:/workspace/planting

# ✅ 正确路径
E:/workspace/planting/cloudfunctions
```

### 问题3: 层配置无法更新
**错误提示**: updateFunctionConfig 不包含 layers 参数
**原因**: 层配置只能在创建时设置
**解决方案**: 使用 createFunction + force: true 重新创建

## 📋 快速执行脚本

### 批量更新所有函数层配置（⚠️ 注意版本检查）

```bash
# 定义函数列表（包含所有需要更新的函数）
FUNCTIONS=("saveUserPlant" "auth-user" "getDefaultPlants" "aiProxy" "updateUserPlant" "deleteUserPlant" "getUserPlants" "storage" "getWeather")

# ⚠️ 重要：在执行前先检查最新层版本
# 建议先运行 /layer status 查看当前所有函数的层版本
# 确定最新版本号后，替换下面的 LATEST_VERSION 变量

LATEST_VERSION=5  # ⚠️ 不要硬编码！应通过检查现有函数自动获取最高版本号

# 批量重新创建
for func in "${FUNCTIONS[@]}"; do
  echo "更新函数: $func 到层版本 $LATEST_VERSION"
  mcp call createFunction {
    "func": {
      "name": "$func",
      "runtime": "Nodejs18.15",
      "layers": [{"name": "layer", "version": $LATEST_VERSION}]
    },
    "functionRootPath": "E:/workspace/planting/cloudfunctions",
    "force": true
  }
  # 建议添加延迟，避免 API 限制
  sleep 1
done
```

### 自动版本检测脚本（推荐）

```bash
#!/bin/bash
# 自动检测现有函数的最新层版本并更新所有函数

# 定义函数列表
FUNCTIONS=("saveUserPlant" "auth-user" "getDefaultPlants" "aiProxy" "updateUserPlant" "deleteUserPlant" "getUserPlants" "storage" "getWeather")

# 步骤1：检测最新层版本
echo "正在检测最新层版本..."
LATEST_VERSION=0

for func in "${FUNCTIONS[@]}"; do
  # 查询函数详情，提取层版本号
  LAYER_INFO=$(mcp call getFunctionList {"action": "detail", "name": "$func"} | grep -o '"LayerVersion": [0-9]*' | head -1)
  if [ ! -z "$LAYER_INFO" ]; then
    VERSION=$(echo $LAYER_INFO | cut -d' ' -f2)
    if [ $VERSION -gt $LATEST_VERSION ]; then
      LATEST_VERSION=$VERSION
    fi
  fi
done

# 如果没有检测到版本，使用默认版本
if [ $LATEST_VERSION -eq 0 ]; then
  LATEST_VERSION=5
  echo "⚠️ 未检测到现有层版本，使用默认版本: $LATEST_VERSION"
else
  echo "✅ 检测到最新层版本: $LATEST_VERSION"
fi

# 步骤2：批量更新到最新版本
echo "开始批量更新函数到版本 $LATEST_VERSION..."
for func in "${FUNCTIONS[@]}"; do
  echo "更新函数: $func"
  mcp call createFunction {
    "func": {
      "name": "$func",
      "runtime": "Nodejs18.15",
      "layers": [{"name": "layer", "version": $LATEST_VERSION}]
    },
    "functionRootPath": "E:/workspace/planting/cloudfunctions",
    "force": true
  }
  sleep 1  # 避免 API 限制
done

echo "✅ 批量更新完成！"
```

### 验证层配置状态

```bash
# 验证所有函数层配置
for func in "${FUNCTIONS[@]}"; do
  echo "检查函数: $func"
  mcp call getFunctionList {"action": "detail", "name": "$func"} | grep -A5 "Layers"
done
```

## 🔍 层配置状态检查要点

验证层配置时，检查以下关键字段：

```json
"Layers": [
  {
    "LayerName": "layer",
    "LayerVersion": 5,  // 确认版本号正确（应检查是否为最新版本）
    "Status": "Active"  // 确认状态为Active
  }
]
```

**版本检查提醒**：确认 `LayerVersion` 是否为当前环境中的最新版本。可通过 `/layer status` 查看所有函数的层版本，取最高值作为最新版本。

## 📝 最佳实践

1. **先检查后操作**: 执行层管理前先查询当前状态
2. **批量操作**: 使用脚本批量处理多个函数
3. **验证结果**: 操作后验证层配置是否生效
4. **记录日志**: 记录操作时间和结果
5. **备份配置**: 重要操作前备份现有配置

## 🚀 /layer 指令快速使用

### 基础用法
```bash
# 快速检查所有云函数层状态
/layer status

# 批量更新所有函数到最新层版本  
/layer update-all

# 更新指定函数层配置
/layer update [函数名]
```

### 高级用法
```bash
# 强制重新创建所有函数（包含最新层）
/layer recreate-all

# 验证层配置一致性
/layer verify

# 生成部署报告
/layer report
```

## 💡 使用场景

### 开发环境
- 新依赖添加后统一更新层配置
- 确保所有函数使用相同的依赖版本
- 测试环境与生产环境配置同步

### 生产环境  
- 定期层版本更新维护
- 安全补丁快速部署
- 依赖兼容性验证

### 团队协作
- 统一开发环境配置
- 标准化部署流程
- 减少配置差异导致的bug

---

**最后更新**: 2026-02-28
**适用环境**: CloudBase 云函数层管理绑定
**相关项目**: 青植 - 智能植物养护助手
**指令标识**: `/layer` - 云函数管理绑定
