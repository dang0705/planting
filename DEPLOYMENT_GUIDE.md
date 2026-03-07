# 付费AI诗歌生成器 - 部署指南

## 🎯 系统概述
已成功创建完整的付费AI功能登录系统，包括：
- 用户认证系统（注册/登录）
- 订阅管理系统（免费/基础/高级套餐）
- AI权限控制（基于订阅限制调用次数）
- 优雅的Editorial风格界面

## 📁 项目结构
```
├── cloudfunctions/
│   ├── auth-user/           # 用户认证云函数
│   ├── subscription-manager/ # 订阅管理云函数  
│   ├── ai-poetry/          # AI诗歌生成云函数
│   └── diagnose/           # 原有诊断云函数
├── src/
│   ├── views/
│   │   ├── Auth/Login.vue     # 登录注册界面
│   │   └── AiPoetry/Generator.vue # AI诗歌生成界面
│   ├── api/auth.js            # API接口封装
│   └── router/index.js        # 路由配置
└── DEPLOYMENT_GUIDE.md        # 本部署指南
```

## 🚀 云函数手动部署步骤

### 1. 安装依赖
在每个云函数目录下运行：
```bash
cd cloudfunctions/auth-user
npm install

cd ../subscription-manager  
npm install

cd ../ai-poetry
npm install
```

### 2. 配置环境变量
在腾讯云CloudBase控制台配置环境变量：

**auth-user云函数：**
- `CLOUDBASE_ENV_ID`: `cloud1-2grufevs395a9d5e`
- `SMTP_USER`: 你的企业邮箱
- `SMTP_PASS`: 邮箱授权码
- `JWT_SECRET`: 随机字符串（用于生成token）

**subscription-manager云函数：**
- `CLOUDBASE_ENV_ID`: `cloud1-2grufevs395a9d5e`

**ai-poetry云函数：**
- `CLOUDBASE_ENV_ID`: `cloud1-2grufevs395a9d5e`
- `JWT_SECRET`: 与auth-user相同的密钥

### 3. 部署云函数
通过CloudBase控制台或CLI部署：
```bash
# 安装CloudBase CLI
npm install -g @cloudbase/cli

# 登录
cloudbase login

# 部署所有云函数
cloudbase functions:deploy
```

## ⚙️ 数据库配置

需要在CloudBase数据库中创建以下集合：

### 1. users (用户表)
```javascript
{
  _id: "自动生成",
  email: "用户邮箱",
  username: "用户名", 
  password: "加密后的密码",
  subscription: {
    plan: "free|basic|premium",
    status: "active|expired|cancelled",
    startDate: "日期",
    endDate: "日期",
    price: 0,
    paymentId: "",
    features: []
  },
  usage: {
    aiCallsToday: 0,
    aiCallsTotal: 0, 
    lastResetDate: "日期"
  },
  profile: {
    avatar: "",
    bio: "",
    createdAt: "日期",
    lastLoginAt: "日期",
    upgradedAt: "日期"
  },
  isActive: true
}
```

### 2. ai_usage_logs (AI使用日志)
```javascript
{
  userId: "用户ID",
  input: "输入内容摘要",
  responseLength: 长度,
  timestamp: "时间戳",
  type: "poetry_generation",
  cost: 费用
}
```

### 3. transactions (交易记录)
```javascript
{
  userId: "用户ID",
  type: "subscription_upgrade",
  planType: "basic|premium", 
  amount: 金额,
  paymentId: "支付ID",
  status: "completed|pending|failed",
  createdAt: "时间"
}
```

## 🎨 前端配置

### 1. 安装依赖
```bash
npm install axios
npm install @fortawesome/fontawesome-free
```

### 2. 路由配置
已在 `src/router/index.js` 中配置：
- `/login` - 登录页面
- `/ai-poetry` - AI诗歌生成页面

### 3. 样式配置
项目已配置Tailwind CSS，使用自定义颜色：
- 主色：`#2C1810` (深暖灰)
- 辅色：`#D4A574` (琥珀金)  
- 强调色：`#1B4332` (深翡翠绿)
- 背景：`#F8F5F0` (米白羊皮纸)

## 💳 付费系统集成

### 套餐配置
- **免费版**: 每日5次AI调用
- **基础版**: ¥29/月，每日50次调用
- **高级版**: ¥99/月，无限调用

### 支付集成准备
当前为演示版本，实际部署时需要：
1. 集成微信支付或支付宝
2. 配置支付回调接口
3. 实现订单状态管理

## 🔧 环境变量配置

在 `.env` 文件中配置：
```
VITE_CLOUDBASE_ENV_ID=cloud1-2grufevs395a9d5e
VITE_API_BASE_URL=/api
```

## 🏃 启动项目

```bash
# 开发模式
npm run dev

# 构建项目  
npm run build
```

## 📊 功能特性

✅ **已完成功能：**
- 用户注册/登录（邮箱验证）
- JWT token认证
- 订阅套餐管理
- AI调用权限控制
- 使用量统计
- 优雅的Editorial风格界面
- 响应式设计
- 免费/付费用户差异化体验

🔄 **待完善功能：**
- 真实支付系统集成
- 邮件服务配置
- 密码加密存储
- 更完善的错误处理
- 管理员后台

## 🆘 故障排除

### 云函数部署失败
1. 检查Node.js版本（需要18+）
2. 确认依赖安装完整
3. 验证环境变量配置
4. 查看CloudBase控制台日志

### 前端路由问题
1. 确认路由守卫逻辑
2. 检查localStorage状态管理
3. 验证API接口地址

### AI调用失败
1. 检查云函数权限配置
2. 验证AI模型配置
3. 确认用户订阅状态

## 📞 技术支持

如遇问题请检查：
1. CloudBase环境状态
2. 云函数日志
3. 数据库连接状态
4. 前端控制台错误信息

---

**恭喜！** 你的付费AI诗歌生成器系统已搭建完成。按照本指南完成部署后，即可开始运营你的AI变现项目。