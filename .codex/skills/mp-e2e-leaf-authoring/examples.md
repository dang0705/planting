# Leaf templates

## 1. 默认：defineLeaf

`{e2eRoot}/leaves/home-navigation.mjs`（先 `目录初始化`，再读 `.mp-e2e.json`）

```js
import path from 'node:path'
import { defineLeaf } from '../../../packages/miniprogram-e2e/src/contracts/index.mjs'
import { screenshotPage } from '../../../packages/miniprogram-e2e/src/platforms/wechat/index.mjs'

export default defineLeaf(
  { id: 'home.navigation.tabs', dataMode: 'live_real', title: 'Home tab opens' },
  async ({ session, evidenceDir }) => {
    const miniProgram = session.miniProgram
    await miniProgram.reLaunch('/pages/ec/index')
    let page = await miniProgram.currentPage()
    await page.waitFor(async () => Boolean(await page.$('#ec-home-root')))

    const entry = await page.$('#ec-home-root')
    const target = await entry.$('#ec-open-category')
    if (!target) {
      const error = new Error('category entry missing inside host')
      error.code = 'mp_e2e_product_leaf_failed'
      throw error
    }
    const { top } = await target.offset()
    await miniProgram.pageScrollTo(top)
    await target.tap()

    page = await miniProgram.currentPage()
    const png = await screenshotPage(miniProgram, path.join(evidenceDir, 'after-tap.png'))
    return {
      status: 'passed',
      assertions: [
        { name: 'landed_expected_path', passed: true, evidence: { path: page.path, png } }
      ]
    }
  }
)
```

`suite.manifest.json`：

```json
{
  "id": "home.navigation.tabs",
  "module": "leaves/home-navigation.mjs",
  "fixtures": []
}
```

跑单条：`cd {packageRoot} && yarn e2e:run -- --leaf home.navigation.tabs`

## 2. 组件内查询

```js
const host = await page.$('product-card')
if (!host) throw Object.assign(new Error('host missing'), { code: 'mp_e2e_product_leaf_failed' })
const add = (await host.$('#pdp-add-to-cart')) || (await host.$('[id*="pdp-add-to-cart"]'))
await add.tap()
```

错误：`await page.$('product-card #pdp-add-to-cart')` 或 `await page.$('.nut-button')` 当唯一定位。

## 3. 运行时 wx.request（ES5 注入）

优先 `session.runtimeHttpClient.request({ url, header })`。必须手写 `evaluate` 时：

```js
await miniProgram.evaluate(
  function (slot, url) {
    globalThis[slot] = { state: 'pending' }
    wx.request({
      url: url,
      method: 'GET',
      success: function (res) {
        globalThis[slot] = { state: 'done', ok: res.statusCode === 200, statusCode: res.statusCode }
      },
      fail: function (err) {
        globalThis[slot] = { state: 'done', ok: false, error: err.errMsg || String(err) }
      }
    })
  },
  slot,
  url
)
```

禁止在注入函数里使用箭头、`const`、解构、`?.`。

## 4. 已有 Node 脚本（迁入期）

```json
{
  "id": "cart.guest.add_line",
  "module": "leaves/native-script-leaf.mjs",
  "fixtures": [],
  "config": {
    "script": "<相对 packageRoot 的脚本路径，通常在 e2eRoot 下>",
    "sourceDataMode": "automator_live_real_api"
  }
}
```

脚本从环境读 `MINIPROGRAM_AUTOMATOR_WS`、`MP_PROJECT_PATH`、`E2E_ARTIFACT_DIR`，**自己再 connect**，不要 launch。stdout 最后一行尽量打结构化 JSON `{ status, assertions }`。
