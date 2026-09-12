// 养护行为时间线逻辑聚合入口
// 仅做模块 re-export，保持对外契约不变；实现拆分到同目录各职责模块：
//   constants.js       常量与字段映射
//   date-utils.js      日期工具
//   normalize.js       事件归一化
//   date-window.js     数据日期窗口
//   fertilizer-bucket.js  施肥 bucket 推导
//   timeline-core.js   主流程
//   sidecar.js         sidecar 合并
export {
  normalizeCareBehaviorTimeline,
  hasMeaningfulCareBehaviorTimeline,
  extractCareBehaviorTimelineFromQuestion
} from './timeline-core.js'
export { getCareBehaviorDateWindow, getCareBehaviorDateSet } from './date-window.js'
export {
  appendCareBehaviorSidecar,
  extractCareBehaviorSidecar,
  buildCareBehaviorTimelineFromDateEvents
} from './sidecar.js'
