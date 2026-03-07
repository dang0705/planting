# 天气服务缓存开关使用说明

## 🎯 一键控制缓存

### 全局配置文件
`src/config/weather.js`

```javascript
export const WEATHER_CONFIG = {
  USE_CACHE: false,  // 🔴 修改这里即可一键控制前后端缓存
}
```

### 缓存策略

#### ✅ 启用缓存 (`USE_CACHE: true`)
- **缓存位置**: MySQL `weather_cache` 表
- **缓存时长**: 次日0点过期
- **适用场景**: 生产环境，节省API调用次数
- **优点**:
  - 减少API调用（和风天气免费版1000次/天）
  - 提升响应速度
  - 降低成本

#### ❌ 禁用缓存 (`USE_CACHE: false`)
- **数据来源**: 每次直接调用和风天气API
- **适用场景**: 开发测试，需要实时数据
- **优点**:
  - 数据实时准确
  - 便于调试
  - 无缓存干扰

## 📝 使用方法

### 方法1：全局配置（推荐）

修改 `src/config/weather.js`:
```javascript
export const WEATHER_CONFIG = {
  USE_CACHE: true,  // 改为 true 启用缓存
}
```

所有天气API调用都会自动使用此配置。

### 方法2：单次调用覆盖

```javascript
import { getWeatherInfo } from '@/api/weather'

// 使用全局配置
const weather = await getWeatherInfo({ lat, lng })

// 强制禁用缓存（覆盖全局配置）
const freshWeather = await getWeatherInfo({ lat, lng, useCache: false })

// 强制启用缓存（覆盖全局配置）
const cachedWeather = await getWeatherInfo({ lat, lng, useCache: true })
```

## 🔧 部署步骤

### 1. 修改配置
编辑 `src/config/weather.js`，设置 `USE_CACHE`

### 2. 部署云函数
```bash
node scripts/deploy-function.js getWeather
```

### 3. 重新编译前端
```bash
npm run dev:mp-weixin
```

### 4. 清除旧缓存（如果需要）
```javascript
// 小程序控制台执行
uni.clearStorageSync()
```

```sql
-- CloudBase控制台执行
DELETE FROM weather_cache;
```

## 📊 验证缓存状态

查看控制台日志：
```
🔴 [天气API] 缓存开关: ✅ 启用 (全局配置: true)
📊 [天气数据] 是否来自缓存: true
📊 [天气数据] 缓存开关状态: true
```

- `是否来自缓存: true` - 本次数据来自缓存
- `是否来自缓存: false` - 本次数据来自API
- `缓存开关状态` - 当前缓存策略

## ⚠️ 注意事项

1. **生产环境建议启用缓存**，避免超出API免费额度
2. **开发测试建议禁用缓存**，确保数据实时准确
3. 修改配置后需要重新部署云函数和编译前端
4. 清除缓存后，下次请求会重新调用API并缓存

## 🐛 故障排查

### 问题：修改配置后没有生效
- 检查云函数是否重新部署
- 检查前端是否重新编译
- 清除旧缓存数据

### 问题：数据不准确
- 禁用缓存测试：`USE_CACHE: false`
- 清除MySQL缓存：`DELETE FROM weather_cache;`
- 查看云函数日志确认API返回数据

### 问题：湿度显示79%而不是81%
- 说明还在使用旧缓存
- 执行：`DELETE FROM weather_cache;`
- 清除前端缓存：`uni.clearStorageSync()`
- 重启小程序
