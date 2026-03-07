# Daily Worker 自动化配置指南

使用 **Cursor CLI** 实现 Windows 定时任务 → 自动执行 daily-worker.md 的完整链路。

## 链路说明

```
Windows 定时任务
    ↓
run-daily-worker.bat
    ↓
agent -p --force "Read and execute .cursor/daily-worker.md"
    ↓
Cursor Agent (headless) 读取 daily-worker.md
    ↓
连接 ClickUp MCP → 获取任务 → 执行代码 → 标记完成
```

## 前置条件

### 0. 安装 ripgrep（Agent 依赖）

Cursor Agent 需要 ripgrep 进行代码搜索。若未安装会报错 `rg is not installed`。

- **Chocolatey**: `choco install ripgrep`
- **手动**: 从 [GitHub Releases](https://github.com/BurntSushi/ripgrep/releases) 下载 Windows 版，解压后将 `rg.exe` 加入 PATH

### 1. 安装 Cursor CLI

在 **PowerShell（管理员）** 中运行：

```powershell
irm 'https://cursor.com/install?win32=true' | iex
```

验证安装：

```powershell
agent --version
```

### 2. 认证（二选一）

**方式 A：已登录 Cursor IDE**
- 若本机已安装 Cursor 且已登录，CLI 通常可复用该会话
- 适合：定时任务在用户已登录时运行

**方式 B：API Key（完全无人值守）**
- 适合：定时任务在用户未登录时运行（如夜间）
- 在 Cursor 设置中获取 API Key
- 在 `run-daily-worker.bat` 开头添加：
  ```batch
  set CURSOR_API_KEY=你的API_Key
  ```

### 3. MCP 配置

确保 Cursor 已配置 **ClickUp MCP**，CLI 会继承项目/全局的 MCP 配置。

## Windows 定时任务配置

### 步骤 1：打开任务计划程序

- `Win + R` → 输入 `taskschd.msc` → 回车

### 步骤 2：创建基本任务

1. 右侧「创建基本任务」
2. 名称：`Cursor Daily Worker`
3. 描述：`自动执行 ClickUp Cursor Tasks 列表中的任务`

### 步骤 3：触发器

- 选择「每天」或「按周」
- 设置具体时间（如 09:00）

### 步骤 4：操作

- 操作：**启动程序**
- 程序或脚本：`e:\workspace\take-you-to-play\run-daily-worker.bat`
- 起始于：`e:\workspace\take-you-to-play`

### 步骤 5：条件（可选）

- 若需在用户未登录时运行：勾选「不管用户是否登录都要运行」
- 此时建议使用 `CURSOR_API_KEY` 认证

### 步骤 6：完成

- 勾选「完成时打开属性」
- 在「常规」中可勾选「使用最高权限运行」（如遇权限问题）

## 手动测试

在项目目录下运行：

```batch
cd e:\workspace\take-you-to-play
run-daily-worker.bat
```

或直接：

```batch
e:\workspace\take-you-to-play\run-daily-worker.bat
```

## 故障排查

| 问题 | 处理 |
|------|------|
| `agent` 不是内部或外部命令 | 安装 Cursor CLI 并确认 PATH 中有 `agent` |
| `rg is not installed` | 安装 ripgrep：choco install ripgrep，或从 [GitHub](https://github.com/BurntSushi/ripgrep/releases) 下载 |
| `Authentication required` | 运行 `agent login` 或设置 `CURSOR_API_KEY` 环境变量 |
| ClickUp 连接失败 | 检查 MCP 配置与网络 |
| 定时任务不执行 | 检查任务计划程序中的「历史记录」和「上次运行结果」 |

## 相关文件

- `run-daily-worker.bat` - 入口脚本
- `.cursor/daily-worker.md` - Agent 执行的工作流定义
- `.cursor/rules/autorun.mdc` - Cursor IDE 内规则（CLI 不依赖此文件）
