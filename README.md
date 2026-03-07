# AI 植伴 - 智能植物养护助手

一个基于 UniApp 的微信小程序,通过 AI 图像识别帮助用户诊断植物问题,提供专业的养护建议。

## 🎯 产品定位

**目标用户**: 阳台种菜人士、办公室绿植爱好者

**核心痛点**: 绿植生病无法马上得到可靠的解决方案

**解决方案**: 拍照 + 混元 Vision AI 诊断,提供专业养护建议

**变现模式**: 订阅制会员

## 🚀 技术栈

- **框架**: UniApp 3.0 + Vue 3
- **状态管理**: Pinia
- **样式框架**: Tailwind CSS
- **构建工具**: Vite
- **云服务**: 腾讯云 CloudBase
- **AI 能力**: 混元 Vision 模型

## 📦 MVP 功能

### 1. 位置与天气服务
- ✅ 微信位置授权,自动获取城市
- ✅ 手动选择地区 + 城市输入
- 🔄 中国气象局免费 API (7天/14天/30天预报)
- 🔄 二十四节气展示

### 2. 个性化种植日历
- ✅ 种植计划记录
- ✅ 节气提醒
- 🔄 根据天气预报提供养护建议

### 3. 核心 AI 诊断功能
- ✅ 支持 2-5 张图片上传
- 🔄 混元 Vision 识别
  - 植物种类识别
  - 病虫害诊断
  - 生长状态评估
- ✅ 解决方案输出
  - 问题诊断结果
  - 具体解决方案
  - 日常养护建议

### 4. 会员/付费闭环
- ✅ 免费额度: 每月 5 次免费诊断
- ✅ 会员权益展示
- 🔄 微信支付接入

## 🛠️ 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
# 微信小程序开发
npm run dev:mp-weixin
```

### 3. 打开微信开发者工具

导入项目：`dist/dev/mp-weixin`

### 4. 配置 CloudBase

1. 在 `src/manifest.json` 中配置小程序 appid
2. 在微信开发者工具中开通云开发
3. 配置环境 ID

## 📂 项目结构

```
ai-plant-companion/
├── src/
│   ├── pages/
│   │   ├── index/              # 首页 - 快速诊断入口
│   │   ├── diagnose/           # AI 诊断页
│   │   ├── calendar/           # 种植日历
│   │   └── profile/            # 会员中心
│   ├── store/                  # Pinia 状态管理
│   │   ├── user.js            # 用户状态
│   │   ├── diagnose.js        # 诊断记录
│   │   └── planting.js        # 种植计划
│   ├── static/                 # 静态资源
│   │   └── tabbar/            # 底部导航图标
│   └── pages.json             # 页面配置
├── cloudfunctions/             # 云函数 (待开发)
│   ├── aiDiagnose/            # AI 诊断
│   ├── getWeather/            # 天气查询
│   └── getUserInfo/           # 用户信息
└── README.md
```

## 🎨 设计规范

### 色彩方案

**主色调 - 自然绿系**:
- 主绿色: `#2D7A4F` (深绿,代表健康植物)
- 辅助绿: `#52B788` (中绿,活力感)
- 浅绿背景: `#D8F3DC` (浅绿,舒适背景)

**辅助色 - 大地色系**:
- 土壤棕: `#8B7355` (温暖,接地气)
- 米白色: `#F8F6F0` (柔和背景)

**功能色**:
- 警告黄: `#F4A261` (病害提示)
- 成功绿: `#52B788` (健康状态)
- 错误红: `#E76F51` (严重问题)

### 设计风格

**Organic/Natural (有机自然风格)**
- 温暖、亲和、专业
- 大圆角 (16px-24px)
- 充足的留白
- 图片主导的视觉设计

## 📖 核心功能

### 1. 首页
- 快速诊断入口
- 天气信息展示
- 今日养护提醒
- 最近诊断历史
- 养护知识卡片

### 2. AI 诊断
- 拍照上传 (支持 2-5 张)
- AI 实时分析
- 诊断结果展示
  - 植物种类
  - 健康状态
  - 问题诊断
  - 解决方案
  - 养护建议

### 3. 种植日历
- 7天天气预报
- 二十四节气
- 今日养护提醒
- 种植计划管理

### 4. 会员中心
- 用户信息
- 会员权益
- 诊断历史
- 功能设置

## 🗄️ 数据库设计

### users 集合
```javascript
{
  _openid: "xxx",
  nickname: "用户昵称",
  avatar: "头像URL",
  location: {
    province: "浙江省",
    city: "杭州市",
    latitude: 30.274,
    longitude: 120.155
  },
  membership: {
    type: "free|premium",
    expireTime: Date,
    freeQuota: 5,
    usedCount: 0
  },
  createTime: Date,
  updateTime: Date
}
```

### diagnose_records 集合
```javascript
{
  _openid: "xxx",
  images: ["cloudID1", "cloudID2"],
  diagnosis: {
    plantName: "绿萝",
    problem: "叶片发黄",
    cause: "浇水过多",
    solution: "减少浇水频率...",
    careAdvice: "每周浇水1-2次..."
  },
  createTime: Date
}
```

### planting_plans 集合
```javascript
{
  _openid: "xxx",
  plantName: "多肉植物",
  plantDate: Date,
  location: "阳台",
  reminders: [
    { type: "water", frequency: "weekly", nextTime: Date },
    { type: "fertilize", frequency: "monthly", nextTime: Date }
  ],
  notes: "用户备注",
  createTime: Date
}
```

## 🔧 开发指南

### 添加新页面

1. 在 `src/pages/` 创建页面目录
2. 在 `src/pages.json` 添加路由配置
3. 使用 Tailwind CSS 编写样式

### 创建云函数

1. 在 `cloudfunctions/` 创建函数目录
2. 编写 `index.js` 和 `package.json`
3. 在微信开发者工具中上传部署

### 状态管理

使用 Pinia 进行状态管理:

```javascript
import { useUserStore } from '@/store/user.js'

const userStore = useUserStore()
console.log(userStore.displayName)
userStore.setLocation({ city: '杭州市' })
```

## 📝 开发计划

### Phase 1: 基础框架 ✅
- [x] 项目配置
- [x] 页面结构
- [x] 状态管理
- [x] UI 设计

### Phase 2: 核心功能 🔄
- [ ] 混元 Vision API 集成
- [ ] 图片上传到云存储
- [ ] 诊断结果保存
- [ ] 历史记录查询

### Phase 3: 位置与天气 🔄
- [ ] 位置授权
- [ ] 中国气象局 API
- [ ] 二十四节气数据
- [ ] 天气展示组件

### Phase 4: 种植日历 🔄
- [ ] 种植计划 CRUD
- [ ] 日历视图
- [ ] 提醒功能

### Phase 5: 会员系统 🔄
- [ ] 会员状态管理
- [ ] 免费额度控制
- [ ] 微信支付接入
- [ ] 会员权益展示

## 💰 成本估算

- **混元 AI**: 小程序有大量免费 token 额度
- **CloudBase**: 个人版免费额度足够 MVP 使用
- **天气 API**: 中国气象局免费
- **总成本**: 几乎为 0 (MVP 阶段)

## ⚠️ 注意事项

1. **API Key 安全**
   - 不要将 API Key 提交到 Git
   - 使用云函数调用 API

2. **数据缓存**
   - 天气数据建议缓存
   - 诊断结果保存到数据库

3. **微信审核**
   - 明确隐私政策
   - 准备相关资质

## 🚀 部署

### 开发环境

```bash
npm run dev:mp-weixin
```

### 生产环境

```bash
npm run build:mp-weixin
```

然后在微信开发者工具中提交审核

## 📞 相关链接

- [UniApp 文档](https://uniapp.dcloud.net.cn/)
- [微信小程序文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [CloudBase 文档](https://cloud.tencent.com/document/product/876)
- [混元 AI 文档](https://cloud.tencent.com/document/product/1729)
- [Tailwind CSS](https://tailwindcss.com/)

---

**最后更新**: 2026-02-18

**当前版本**: MVP v1.0

**下一步**: 集成混元 Vision API

## 🌟 CloudBase 环境

- **环境 ID**: `cloud1-2grufevs395a9d5e`
- **环境别名**: `cloud1`
- **区域**: 上海 (ap-shanghai)
- **套餐**: 个人版
