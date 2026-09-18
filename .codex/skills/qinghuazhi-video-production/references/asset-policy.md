# 素材与真实性规则

## Plan 阶段

Plan 不读取 Asset Catalog，也不要求素材已经存在。先写正确剧本，素材可以后补。

不要在 Plan 中写：

```text
具体文件路径
assetId
“用现有第一张图”
为了命中当前素材而改变人物性别、植物、症状或功能
```

## 固定素材分类

```text
assets/person/<roleId>/
assets/plant/
assets/symptom/
assets/app-capture/
```

对应 Plan：

```text
person      → 人物标准图
plant       → 无需特定症状的植物标准图
symptom     → 植物 + 真实症状
app_capture → 真实小程序录屏
```

## 人物

- AI 人物可作为剧情角色，不得包装成真实专家或真实用户证言。
- 同一人物跨 Shot 保持身份、服装、发型与背景时，应复用同一人物素材。
- 需要连续出现的水壶、手机等道具必须存在于源素材；不要让不同 I2V Shot 各自发明。
- 手机可作为普通道具，但不得让生成式视频在手机上创造虚假青花植界面。

## 植物与症状

- 只展示素材中真实存在的植物品种、叶色、病斑、虫害和盆土状态。
- Wan 只负责动态化；不得新增、加重、减轻或消除诊断证据。
- 不用远景或多盆同类植物替代要求中的近距离主体素材。

## 小程序

产品界面只使用真实 `app_capture`。功能入口、建议页和结果页必须实际存在；不存在的能力不得用文字或生成 UI 冒充。

## Prepare

Prepare 才构建 Asset Catalog 并绑定素材。Blocked 时报告缺失项，不擅自用语义不符的替代物，也不回写 Approved Plan。

## 人物角色资产

人物素材目录名就是 `roleId`。同一角色跨 Shot 使用同一个 roleId，
Prepare 会优先精确匹配该目录。

角色定义见工作区 `config/roles.json` 和 `roles.md`。

## 素材传递

实际素材库的携带、同步和 Workspace 边界见 `assets.md`。
