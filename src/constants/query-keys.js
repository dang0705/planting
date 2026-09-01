/**
 * 业务 Vue Query 的共享键。
 *
 * 该文件必须位于主包可访问的目录，避免主包 store 反向依赖子包模块，
 * 从而在微信运行时加载首页时出现“module is not defined”。
 */
export const DIAGNOSIS_HISTORY_QUERY_KEY = ['http-function', 'diagnose-http', 'history']
