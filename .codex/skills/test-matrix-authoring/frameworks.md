# 框架与工具 API 对照（按需读）

在需要对齐「同一概念在某工具里的方法名」时读取。行为规则只认 `SKILL.md`。

只读**当前目标已识别**的 runner。本表不是必读清单。

官方页读取与 `SKILL.md` 一致：**本仓源码、配置、既有测试已够用则不拉网**；有 API/配置/版本疑问时再打开下表对应 URL（尽量对仓库锁定的主版本）。

先按 `SKILL.md` 读 `frameworks/<runner>.md`（无文件则跳过）。下表只在需要官方 URL 时用。

| 识别到 | 仍不清时再拉官网 |
| :--- | :--- |
| Vitest | https://vitest.dev/guide/learn/writing-tests-with-ai |
| Jest | https://jestjs.io/docs/getting-started |
| pytest | https://docs.pytest.org/en/stable/how-to/index.html |
| JUnit 5 | https://junit.org/junit5/docs/current/user-guide/ |
| Go testing | https://go.dev/doc/tutorial/add-a-test |
| Testing Library（L2 查询原则有疑问） | https://testing-library.com/docs/guiding-principles |

离线或未拉官网：用已有测试 + 本文件 API 对照，并声明未读到官方当前页。

选用**仓库已有** runner；未列出的按同层语义类推。

## 运行器 / 结构 / 断言

| 生态 | Runner | 结构 | 断言 | 生命周期 |
| :--- | :--- | :--- | :--- | :--- |
| JS/TS | Vitest | `describe` / `it`\|`test` / `describe.skip` / `it.each` | `expect` | `beforeAll/Each` `afterAll/Each` |
| JS/TS | Jest | 同上；`test.each` | `expect` | 同上 |
| JS/TS | Mocha | `describe` / `it` / `context` | 常配 Chai | `before`/`after`/`beforeEach`/`afterEach` |
| JS/TS | Jasmine | `describe` / `it` / `pending` | 内置 `expect` | `beforeAll/Each`… |
| JS/TS | AVA | `test` / `test.serial` | `t.is` `t.deepEqual` `t.throws` | `test.before` |
| JS/TS | node:test | `describe` / `it` / `test` | `node:assert` | `before`/`after`… |
| Python | pytest | 函数即用例；`parametrize` | `assert`；`pytest.raises` | fixture |
| JVM | JUnit 5 | `@Test` `@Nested` `@ParameterizedTest` | Assertions / AssertJ | `@BeforeEach`… |
| JVM | TestNG | `@Test` groups | AssertJ / TestNG | `@BeforeMethod`… |
| Go | testing | `TestXxx` / `t.Run` | `t.Fatal` / testify | `TestMain` |
| Apple | XCTest | `testXxx` | `XCTAssert*` | `setUp`/`tearDown` |
| Ruby | RSpec | `describe`/`context`/`it` | `expect(...).to` | `before`/`after` |
| PHP | PHPUnit | `test*` | `$this->assert*` | `setUp`/`tearDown` |

## Test Double 方法名

| 概念 | 常见 API |
| :--- | :--- |
| Stub | `mockReturnValue`；Sinon `stub`；pytest `MonkeyPatch` |
| Mock | `vi.fn` / `jest.fn`；Sinon `mock`；Mockito |
| Spy | `vi.spyOn` / `jest.spyOn`；Sinon `spy` |
| 模块替身 | `vi.mock` / `jest.mock`；`proxyquire` / `quibble` |

## 时间

| 需求 | 常见 API |
| :--- | :--- |
| 假时钟 | `vi.useFakeTimers` / `jest.useFakeTimers` / Sinon / `freezegun` |
| 推进 | `advanceTimersByTime` / `runAllTimers` |
| 恢复 | `useRealTimers`（必须配对） |

## L2 挂载

| 工具 | 要点 |
| :--- | :--- |
| Testing Library | `render`；`getByRole/Text/LabelText`；`userEvent`；`waitFor` / `findBy*` |
| renderHook | hook 状态 |
| Vue Test Utils | `mount` / `shallowMount` |
| Playwright / Cypress Component | 真浏览器上的**隔离 mount**，仍是 L2 |
| jsdom / happy-dom / Chromium | 环境选择，不改变层 |

Enzyme 仅维护旧码。

## L3 / HTTP

| 工具 | 用途 |
| :--- | :--- |
| MSW | 进程内拦截；常与真实 UI+状态一起做 L3 |
| nock / fetch-mock | Node HTTP 拦截 |
| SuperTest | 进程内 HTTP 服务 |
| Playwright APIRequest | 对外 API |
| Pact | 消费者须走**真实消费者代码**；另需 provider 验证才算契约闭环 |
| OpenAPI / Dredd / Schemathesis | 对照规范；不等于提供方已验证 |
| WireMock | 独立 mock 服务；易变成假 L3，须声明未经过的产品客户端 |

## 快照 / 视觉

结构快照仅用于稳定纯结构。视觉回归默认不是 L1–L3 主路径；有专门视觉 skill 则移交。
