import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const componentSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/AirExchangeAssessment.vue'),
  'utf8'
)
const selectableCardSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/SelectableCard.vue'),
  'utf8'
)

// 1. props 采用现有 LightEnvironmentPicker 模式：modelValue / idPrefix='airflow' / disabled
assert.match(componentSource, /modelValue:\s*\{\s*type:\s*Object/)
assert.match(componentSource, /idPrefix:\s*\{\s*type:\s*String,\s*default:\s*'airflow'/)
assert.match(componentSource, /disabled:\s*\{\s*type:\s*Boolean,\s*default:\s*false/)

// 2. emit update:modelValue 和 change，二者只输出原始输入
assert.match(componentSource, /defineEmits\(\['update:modelValue',\s*'change'\]\)/)
assert.match(componentSource, /emit\('update:modelValue',\s*nextValue\)/)
assert.match(componentSource, /emit\('change',\s*nextValue\)/)

// 3. 采集原始选择，页面调用纯函数；组件不导入 resolveAirExchangeEvidence
assert.doesNotMatch(componentSource, /resolveAirExchangeEvidence/)
assert.match(componentSource, /from '@\/utils\/air-exchange-evidence\.js'/)

// 4. 评估容器 id 模板
assert.match(componentSource, /:id="`\$\{idPrefix\}-assessment`"/)

// 5. 三个 source id 显式绑定；无窗合并到 window 方向选项
assert.match(componentSource, /:id="`\$\{idPrefix\}-source-window`"/)
assert.match(componentSource, /:id="`\$\{idPrefix\}-source-fresh_air`"/)
assert.match(componentSource, /:id="`\$\{idPrefix\}-source-unknown`"/)
assert.doesNotMatch(componentSource, /source-closed_or_none/)
assert.match(componentSource, /import SelectableCard from '@\/components\/SelectableCard\.vue'/)
assert.strictEqual((componentSource.match(/<SelectableCard/g) || []).length, 3)
// 选项卡保持原设计的纵向答卷布局，每张卡占满可用宽度
assert.match(componentSource, /class="flex flex-col gap-3"/)
assert.doesNotMatch(componentSource, /grid grid-cols-2|col-span-2/)
// 两个场景使用统一画布高度，避免横向压缩或纵向裁切
assert.doesNotMatch(componentSource, /h-\[108px\]/)
assert.doesNotMatch(selectableCardSource, /h-\[108px\]/)
// 两张卡使用同样宽度的统一画布；对象比例由 SVG 资产本身统一，不在卡片内二次缩放
assert.doesNotMatch(componentSource, /w-\[48%\]/)
// 选项卡保持白色底，选中态使用设计稿的浅绿色高亮与品牌边框；图例画布另有独立浅色底
assert.match(selectableCardSource, /bg-white/)
assert.match(selectableCardSource, /border-brand bg-\[#e8f5e9\]/)

// 6. 六个开窗子选项 id 模板：方向包含 one / two-or-more / closed，频率包含 daily / every-other-day / weekly-1-2
assert.match(
  componentSource,
  /:id="`\$\{idPrefix\}-window-direction-\$\{direction\.key\.replace\(\/_\/g, '-'\)\}`"/
)
assert.match(
  componentSource,
  /:id="`\$\{idPrefix\}-window-frequency-\$\{frequency\.key\.replace\(\/_\/g, '-'\)\}`"/
)
// 确认方向与频率常量已导入
assert.match(componentSource, /WINDOW_DIRECTION_COUNT_OPTIONS/)
assert.match(componentSource, /WINDOW_OPEN_FREQUENCY_OPTIONS/)

// 7. 切换到非 window 时两个开窗字段清为 null
assert.match(
  componentSource,
  /commit\(\{\s*source:\s*key,\s*windowDirectionCount:\s*null,\s*windowOpenFrequency:\s*null\s*\}\)/
)

// 8. 仅当 source === 'window' 展示开窗补充项
assert.match(componentSource, /v-if="input\.source === 'window'"/)

// 9. 新风不含出风口 / 直吹字段
assert.doesNotMatch(componentSource, /draftRisk|directDraft|outlet|直吹|出风口/)

// 10. 禁用态守卫
assert.match(componentSource, /if \(props\.disabled\) \{/)

// 11. 文案不暴露内部算法
assert.doesNotMatch(componentSource, /airExchangeEvidence/)

// 12. 不得导入 sanitizeAirExchangeInput 或 normalizeInitial（禁止 sanitize / 归一化 / 校验）
assert.doesNotMatch(componentSource, /sanitizeAirExchangeInput|normalizeInitial/)

// 13. 场景由可复用选项卡组件承载（非 PNG 位图、非远程 URL）
assert.match(componentSource, /import AirflowScene from '@\/components\/AirflowScene\.vue'/)
assert.doesNotMatch(componentSource, /\.png'|localhost:3845|http:\/\/.*\/assets\//)
assert.doesNotMatch(
  componentSource,
  /window-single\.png|window-double\.png|window-one-direction\.png|window-two-or-more-directions\.png/
)

// 14. 窗户卡按选择切换单/双/关窗场景
assert.match(
  componentSource,
  /input\.windowDirectionCount === 'two_or_more'[\s\S]*'window-two'[\s\S]*input\.windowDirectionCount === 'closed'[\s\S]*'window-closed'[\s\S]*'window-one'/
)
assert.match(componentSource, /key === 'closed'/)
// fresh-air 场景固定；关窗使用与单双窗相同尺寸的 window-closed 场景
assert.match(componentSource, /scene="fresh-air"/)
assert.doesNotMatch(componentSource, /<AirflowScene scene="closed" \/>/)
assert.match(componentSource, /'window-closed'/)

// 15. 方向选项 key 与 automation id policy 3.13 一致
const utilSource = fs.readFileSync(
  path.join(repoRoot, 'src/utils/air-exchange-evidence.js'),
  'utf8'
)
assert.match(utilSource, /key:\s*'one'/)
assert.match(utilSource, /key:\s*'two_or_more'/)
assert.match(utilSource, /key:\s*'closed'/)

console.log('AirExchangeAssessment component contract tests passed')
