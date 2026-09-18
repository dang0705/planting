# 小青入口与聊天控件

| 页面                               | 元素                                             | 用途                                                  |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| `src/pages/agent/agent.vue`        | `agent-tab-page`                                 | 小程序加载与恢复页                                    |
| 同上                               | `agent-entry-retry`                              | 登录或重新连接                                        |
| 同上                               | `agent-webview`                                  | 加载聊天 H5；监听加载失败                             |
| `src/agent-h5/pages/chat/chat.vue` | `agent-chat-page`                                | H5 聊天页                                             |
| 同上                               | `agent-chat-input`                               | 输入问题                                              |
| 同上                               | `agent-chat-send`                                | 发送问题                                              |
| 同上                               | `agent-chat-stop`                                | 停止接收当前回答                                      |
| 同上                               | `agent-chat-error`                               | 登录过期或中断提示                                    |
| 同上                               | `agent-message-{index}`                          | 当前页面内按顺序展示的消息                            |
| 同上                               | `agent-ask-user`                                 | AskUserQuestion 问答卡片容器                          |
| 同上                               | `agent-ask-option-{questionIndex}-{optionIndex}` | 问答卡片中的单选/多选项；索引按当前卡片问题与选项顺序 |
| 同上                               | `agent-ask-submit`                               | 提交已完成的问答卡片                                  |

小程序端使用真实登录态，通过 Tab 进入。H5 控件不属于小程序节点树，需独立浏览器证据及真机 WebView 证据。未执行真实登录、接口请求、发送与恢复验证时不得报告端上通过。
