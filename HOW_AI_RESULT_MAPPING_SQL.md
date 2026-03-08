# AI 识别结果映射到 SQL 数据库方案

## 数据表结构

### plants 表（植物品种库）
- `_id`: 主键，植物品种 ID（如 "lvluo", "duorou"）
- `name`: 植物名称（如 "绿萝", "多肉植物"）
- 其他字段：养护信息（浇水频率、光照需求等）

### user_plants 表（用户植物实例）
- `id`: 主键，自增 ID
- `_openid`: 用户 openid
- `plant_id`: 外键，关联 plants._id（用户选择的植物品种）
- `plant_name`: **新增字段**，植物名称（从 plants 表或 AI 识别获取）
- `ai_recognized_name`: AI 识别的植物名称（仅 AI 识别时有值）
- `nick_name`: 用户自定义昵称
- `photos`: 植物照片
- `location`: 位置
- 其他字段：浇水记录等

## 数据流程

### 场景 1：用户从植物库选择
```
用户选择 "绿萝" (plantId = "lvluo")
    ↓
查询 plants 表获取 name = "绿萝"
    ↓
INSERT INTO user_plants:
  - plant_id = "lvluo"
  - plant_name = "绿萝" (从 plants 表获取)
  - ai_recognized_name = NULL
```

### 场景 2：AI 识别添加
```
AI 识别返回 "吊兰"
    ↓
尝试在 plants 表中查找匹配（可选）
    ↓
INSERT INTO user_plants:
  - plant_id = NULL (或匹配到的 ID)
  - plant_name = "吊兰" (AI 识别结果)
  - ai_recognized_name = "吊兰"
```

## 代码实现

### saveUserPlant 云函数逻辑

```javascript
let plantName = null;

if (plantId) {
  // 场景 1：用户选择植物
  const checkSQL = 'SELECT _id, name FROM plants WHERE _id = {{plantId}} LIMIT 1';
  const checkResult = await models.$runSQL(checkSQL, { plantId });
  const rows = checkResult?.data?.executeResultList || [];

  if (rows.length > 0) {
    plantName = rows[0].name; // 从 plants 表获取
  } else {
    // plantId 无效，降级为 AI 识别
    plantName = aiRecognizedName || '未知植物';
    plantId = null;
  }
} else if (aiRecognizedName) {
  // 场景 2：AI 识别
  plantName = aiRecognizedName;
}

// 插入数据
const insertSQL = `INSERT INTO user_plants (
  _openid, plant_id, plant_name, ai_recognized_name, nick_name, location, photos
) VALUES (
  {{openid}}, ${plantId ? '{{plantId}}' : 'NULL'}, {{plantName}},
  ${plantId ? 'NULL' : '{{aiRecognizedName}}'}, {{nickName}}, {{location}}, {{photos}}
)`;
```

### getUserPlants 云函数返回

```javascript
const sql = `
  SELECT
    up.id,
    up.plant_id,
    up.plant_name,        -- 直接使用存储的植物名称
    up.ai_recognized_name,
    up.nick_name,
    up.photos,
    p.image_file_id,      -- 从 plants 表获取图片
    p.sunning,            -- 从 plants 表获取养护信息
    p.watering_freq
  FROM user_plants up
  LEFT JOIN plants p ON up.plant_id = p._id
  WHERE up._openid = {{openid}}
`;

// 返回格式
const plants = rows.map(r => ({
  id: r.id,
  plantId: r.plant_id,
  plantName: r.plant_name,           // 植物品种名称（用于 AI 诊断）
  name: r.nick_name || r.plant_name, // 显示名称（优先昵称）
  aiRecognizedName: r.ai_recognized_name,
  // ...
}));
```

## 诊断功能使用

在诊断时，传递 `plantName` 给 AI：

```javascript
// 前端调用
streamDiagnosePlant({
  plantId: plant.id,
  plantName: plant.plantName,  // 使用 plant_name 字段
  image: imageUrl,
  description: '...'
});

// 云函数构建提示词
const prompt = `请诊断这株${plantName}的健康状况...`;
```

## 优势

1. **数据一致性**：`plant_name` 字段存储确定的植物名称，避免每次查询时 JOIN
2. **性能优化**：减少 JOIN 操作，直接读取 `plant_name`
3. **AI 准确性**：诊断时提供准确的植物品种名称，提高 AI 识别率
4. **灵活性**：支持用户选择和 AI 识别两种场景

## 数据迁移

已执行的 SQL：

```sql
-- 1. 添加 plant_name 字段
ALTER TABLE user_plants
ADD COLUMN plant_name varchar(100)
COMMENT '植物名称（从plants表或AI识别）'
AFTER plant_id;

-- 2. 更新现有数据
UPDATE user_plants up
LEFT JOIN plants p ON up.plant_id = p._id
SET up.plant_name = COALESCE(p.name, up.ai_recognized_name, '未知植物');
```

---

**创建时间**: 2026-03-08
**状态**: ✅ 已实施
