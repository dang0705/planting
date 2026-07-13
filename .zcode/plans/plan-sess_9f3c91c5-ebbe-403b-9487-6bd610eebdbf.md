# 浇水建议独立入口（catalog 种类 → 独立链路，无浇水历史，落库回溯）

## 目标
新增"独立浇水建议"入口，swiper 第一步让用户选来源：
- **选已有植物** → 复用现有 /watering-planner 流程（plantId + openid），不新建任何东西
- **在植物表 catalog 中选种类** → 真正的独立链路：catalog 取属级策略 + 临时输入盆型 + 天气自动获取，无浇水历史，落库回溯

## 算法可行性（已验证）
无浇水历史时算法输出合理（DRY gate + 基于盆型体积的水量建议），算法层零改动。

---

## 改动清单（8 个文件）

### 数据库（1 文件）

**1. 新建 `scripts/sql/ensure-watering-advisor-sessions-table-20260709.sql`**
```sql
CREATE TABLE IF NOT EXISTS `watering_advisor_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `_openid` VARCHAR(128) NOT NULL,
  `catalog_plant_id` VARCHAR(128) NOT NULL COMMENT '植物种类 ID',
  `catalog_plant_name` VARCHAR(255) NULL COMMENT '植物名称快照',
  `pot_profile_json` JSON NULL COMMENT '盆型输入快照',
  `weather_summary_json` JSON NULL COMMENT '天气摘要快照',
  `planner_result_json` JSON NULL COMMENT 'planner 完整建议结果',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_openid_created` (`_openid`, `created_at`),
  INDEX `idx_catalog_plant` (`catalog_plant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='独立浇水建议会话记录表';
```
对 prod（cloud1-2grufevs395a9d5e）和 dev（cloud1_dev）两库各执行（参考现有脚本模式）。

### 后端（3 文件）

**2. 新建 `cloudfunctions/plant-user-http/watering-planner-service.js`**
抽取共享函数 `computeAdhocPlanner({ catalogPlantId, potProfile, weatherDays, forecastDays, referenceDate })`：
- `getPlantCatalogById(catalogPlantId)` 取属级 watering/wateringQuantization/温湿度 bounds
- potProfile 用前端传入值
- `buildWeatherSummary` + `normalizeCareBehaviorTimeline({ referenceDate, watering_events_10d: [] })` + `buildWateringPlanner`
- 独立入口 wateringEvents 传空数组
- 不需要 openid（catalog 查询是公开的）

**3. 新建 `cloudfunctions/plant-user-http/watering-advisor-service.js`**
独立浇水建议落库 service：
- `saveAdvisorSession(openid, body)` - INSERT watering_advisor_sessions
- `listAdvisorSessions(openid, { page, pageSize })` - 分页查询历史
- 参考 watering-reminder-service.js 的 mapRow / parseJsonText 模式

**4. 改动 `cloudfunctions/plant-user-http/app.js`**
新增 `path.includes('/watering-advisor')` 路由分支（在 /watering-planner 之前判断）：
- POST compute: 调 watering-planner-service.computeAdhocPlanner，返回建议
- POST save: 调 watering-advisor-service.saveAdvisorSession 落库
- GET list: 调 watering-advisor-service.listAdvisorSessions 查历史
- 现有 /watering-planner 分支保持不变（选已有植物走它）

### 前端（4 文件）

**5. 改动 `src/pages/index/components/PotProfileEditor.vue`**
改造 save()：
- 先单独执行 confirmOversizedPot()（原代码与 plantId 短路，需拆开）
- 无 plantId 时：emit saved 回传 payload，不调 plantStore.savePotProfile
- 有 plantId 时：保持原落库逻辑

**6. 改动 `src/pages/index/components/watering-reminder-options.js`**
新增：
- `fetchAdhocPlannerResult({ catalogPlantId, potProfile, weatherDays, forecastDays })` - 调 /watering-advisor compute
- `saveAdvisorSession(payload)` - 调 /watering-advisor save
- `fetchAdvisorSessions({ page, pageSize })` - 调 /watering-advisor list
- 展示函数（buildPlannerSummaryRows / reasonCodeLabel / buildPotProfileSummary）直接复用

**7. 新建 `src/pages/watering-advisor/watering-advisor.vue`**
独立浇水建议页面，swiper 步骤模式：

- **步骤0 选来源**：
  - "从我的植物选" → 跳转到现有植物列表/详情页触发现有浇水建议流程（复用 WateringReminderSheet），本页面退出
  - "搜索植物种类" → 进入步骤1（真正的独立链路）

- **步骤1 选植物种类**（仅 catalog 链路）：
  - 复用 useDefaultPlants + fetchPlantCatalog 搜索
  - 选中 catalogPlantId，进入步骤2

- **步骤2 输入盆型**：
  - 复用 PotProfileEditor（无 plant 模式，@saved 接收 payload）
  - 收集：口径/底径/高度/排水孔/基质

- **步骤3 展示建议 + 落库**：
  - 自动调 getEnvironmentWeatherWindow 获取天气
  - 调 fetchAdhocPlannerResult 获取建议
  - 展示：下次浇水日期+原因 / 建议水量（formatMlRangeToBottleText）/ 策略 / 停止条件
  - 调 saveAdvisorSession 落库
  - 底部可查看历史记录

**8. 改动 `src/pages.json` + `src/pages/index/index.vue`**
- pages.json 注册 pages/watering-advisor/watering-advisor 路由
- 首页功能区新增"独立浇水建议"入口按钮

---

## 复用清单（零改动）
- buildWateringPlanner / normalizeCareBehaviorTimeline / buildWeatherSummary（layer）
- getPlantCatalogById（layer/plant-knowledge.js，脱 openid 可用）
- getEnvironmentWeatherWindow（天气自动获取）
- useDefaultPlants composable + fetchPlantCatalog（植物搜索）
- watering-reminder-options.js 展示函数 + formatMlRangeToBottleText
- add-plant.vue swiper 步骤模式（参考）
- **选已有植物链路完全复用现有 /watering-planner + WateringReminderSheet**

## 不改动
- 算法层零改动
- 现有 /watering-planner 绑定植物入口保持不变
- WateringReminderSheet.vue 保持不变
- user_watering_reminder_events 表不变

## 风险与缓解
1. 路由 includes 顺序：/watering-advisor 在 /watering-planner 之前判断
2. PotProfileEditor save() 短路逻辑：拆开 confirmOversizedPot 与 plantId 判断
3. 无浇水历史文案：后端 adhoc 分支覆盖 nextWaterReason 为适合无历史场景的文案
4. 天气获取依赖城市定位：若未设城市，引导设置或用默认城市
5. DDL 执行：prod + dev 两库各建一次

## 验收
- 选已有植物：现有流程不受影响
- 选 catalog 种类：搜索种类 → 输入盆型 → 自动获取天气 → 出建议 → 落库 → 可查历史
- npm run dev:mp-weixin:local-functions:lan 跑通独立链路完整流程
- lint + fmt 仅覆盖改动的 src/* 和 cloudfunctions/* 文件