'use strict'

// 中央化维护旧 key -> 新 key 映射，禁止在业务代码散落 if/else。
module.exports = {
  symptom: {
    // 示例映射，可按历史数据继续扩展
    yellow_leaf: 'leaf_yellowing',
    yellow_leaves: 'leaf_yellowing',
    dropped_leaf: 'leaf_drop',
    black_root: 'root_black_soft'
  },
  problem: {
    root_decay: 'root_rot',
    red_spider: 'spider_mites'
  },
  question: {
    // 旧问诊 key 与新 question_library key 对齐
  },
  option: {
    unsure: 'unknown',
    maybe: 'unknown'
  }
}
